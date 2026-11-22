import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync, unlinkSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { planChanges, parseGitPaths, backendDependencies, backendEndpoints, assertSourceBoundary, hash, assertProductionAssets, fileManifest } from './release-plan.mjs';
import { normalize, verifyFunction, assertSameFunction, candidateArgs, gatewaySpec, assertGateway, gatewayTags, pinGateway, writeGateway, equal, sameDeployedGateway, comparableGateway, assertEndpoints, assertReadOnlyProbe } from './release-safety.mjs';
import { contentType, savePending, recoverRelease } from './release-recovery.mjs';

const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
export function makeAdapter(env, directory) {
  const command = (tool, args, options = {}) => execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, ...options });
  const cloud = args => {
    const output = command('yc', [...args, '--retry', '0', '--no-cli-auto-prompt']).trim();
    return output ? JSON.parse(output) : {};
  };
  const storageUrl = key => 'https://storage.yandexcloud.net/' + encodeURIComponent(env.YC_BUCKET) + '/' + key.split('/').map(encodeURIComponent).join('/');
  const download = (address, file) => command('curl', ['--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '60', '--output', file, address]);
  const gateway = id => {
    const resource = cloud(['serverless', 'api-gateway', 'get', id, '--format', 'json']);
    const openapi_spec = command('yc', ['serverless', 'api-gateway', 'get-spec', '--id', id]);
    return { ...resource, openapi_spec };
  };
  const url = key => `${env.APP_BASE_URL.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const readPublic = (key, file) => command('curl', ['--fail', '--silent', '--show-error', '--location', '--max-redirs', '0', '--output', file, url(key)]);
  return {
    cloud,
    gateway,
    backup: dest => {
      let token;
      do {
        const args = ['storage', 's3api', 'list-objects-v2', '--bucket', env.YC_BUCKET, '--format', 'json'];
        if (token) args.push('--continuation-token', token);
        const page = cloud(args);
        for (const { key, size } of page.contents || []) {
          if (key.split('/').some(part => !part || part === '.' || part === '..')) throw Error('Unsupported storage key in backup');
          const path = join(dest, key);
          mkdirSync(dirname(path), { recursive: true });
          download(storageUrl(key), path);
          if (readFileSync(path).length !== Number(size)) throw Error('Incomplete backup: ' + key);
        }
        token = page.next_continuation_token;
        if (page.is_truncated && !token) throw Error('Incomplete bucket listing');
      } while (token);
    },
    metadata: key => {
      const head = cloud(['storage', 's3api', 'head-object', '--bucket', env.YC_BUCKET, '--key', key, '--format', 'json']);
      const field = name => head[name] ?? head[name[0].toLowerCase() + name.slice(1)] ?? head[name.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase())];
      const type = field('ContentType');
      if (!type) throw Error(`Missing live Content-Type for backup object: ${key}`);
      if (Object.keys(field('Metadata') || {}).length || field('Expires')) throw Error(`Custom metadata/expiry requires explicit restoration support: ${key}; release blocked before writes`);
      return { type, cache: field('CacheControl') || 'no-cache,max-age=0', encoding: field('ContentEncoding'), language: field('ContentLanguage'), disposition: field('ContentDisposition') };
    },
    upload: (file, key, metadata) => {
      if (!metadata?.type || !metadata?.cache) throw Error('Upload metadata missing');
      const args = ['storage', 's3', 'cp', file, `s3://${env.YC_BUCKET}/${key}`, '--content-type', metadata.type, '--cache-control', metadata.cache, '--only-show-errors'];
      for (const [field, flag] of [['encoding', '--content-encoding'], ['language', '--content-language'], ['disposition', '--content-disposition']]) if (metadata[field]) args.push(flag, metadata[field]);
      command('yc', args);
    },
    verifyStatic: async hashes => {
      for (const [key, checksum] of Object.entries(hashes)) {
        const file = join(directory, 'remote-check');
        // Nested prerendered pages are stored in the bucket. The Gateway exposes the SPA at /.
        if (key.includes('/') && !/^(assets|fonts)\/[^/]+$/.test(key)) download(storageUrl(key), file);
        else readPublic(key, file);
        if (hash(readFileSync(file)) !== checksum) throw Error(`Published static hash mismatch: ${key}; stop and recover`);
      }
    },
    verifyPublic: async () => {
      const file = join(directory, 'health-check.json');
      readPublic('api/health', file);
      if (JSON.parse(readFileSync(file, 'utf8')).ok !== true) throw Error('Public health check failed');
      readPublic('api/auth/me', file);
      if (JSON.parse(readFileSync(file, 'utf8')).user !== null) throw Error('Public signed-out auth check failed');
    },
    probe: (tag, path) => {
      const result = cloud(['serverless', 'function', 'invoke', env.YC_FUNCTION_ID, '--tag', tag, '--data', JSON.stringify({ httpMethod: 'GET', path, headers: { origin: env.APP_BASE_URL }, requestContext: { httpMethod: 'GET' } }), '--format', 'json']);
      assertReadOnlyProbe(result, path);
    },
  };
}

export async function runRelease(env = process.env, testing = {}) {
  // Injectable local adapters allow full failure/recovery rehearsal without any cloud access.
  const execute = testing.execute || execFileSync;
  const readGit = testing.git || git;
  const adapterFactory = testing.makeAdapter || makeAdapter;
  const checkpoint = commit => {
    if (readGit(['rev-parse', 'HEAD']) !== commit || readGit(['status', '--porcelain'])) throw Error('Source tree/commit changed during preflight; release blocked');
  };
  for (const key of ['YC_BUCKET', 'YC_FUNCTION_ID', 'YC_GATEWAY_ID', 'YC_RUNTIME_SA_ID', 'YC_GATEWAY_SA_ID', 'YC_AUTH_SECRET_ID', 'YC_PAY_SECRET_ID', 'YDB_CONNECTION_STRING', 'APP_BASE_URL']) if (!env[key]) throw Error(`Missing ${key}`);
  if (env.APP_BASE_URL !== 'https://pravdarula.ru') throw Error('Unexpected production target; review before release');
  const target = hash(`${env.APP_BASE_URL}/${env.YC_BUCKET}`).slice(0, 16);
  const state = join(env.XDG_CACHE_HOME || join(env.HOME, '.cache'), 'pravdarula-releases', target);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = join(state, 'lock');
  try { mkdirSync(lock); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    throw Error(`Release lock exists: ${lock}. Verify no release process is running on this Mac, inspect pending.json and snapshots, then remove ONLY the empty lock directory after operator review. Never delete pending.json. Run the same command again and choose RECOVER. No automatic lock expiry.`);
  }
  let cleanExit = false;
  let ydbTokenFile = null;
  let activeAdapter = null;
  try {
    if (existsSync(join(state, 'pending.json'))) {
      console.warn(`Unfinished release detected; automatically restoring the previous verified version from ${state}/pending.json.`);
      const p = JSON.parse(readFileSync(join(state, 'pending.json'), 'utf8'));
      await recoverRelease(state, adapterFactory(p.env, p.directory));
      cleanExit = true;
      console.log('Previous release recovered and verified. No new release performed.');
      return;
    }
    const commit = readGit(['rev-parse', 'HEAD']);
    checkpoint(commit);
    const previous = existsSync(join(state, 'current.json')) ? JSON.parse(readFileSync(join(state, 'current.json'), 'utf8')) : null;
    if (previous && (previous.origin !== env.APP_BASE_URL || previous.bucket !== env.YC_BUCKET || !/^[a-f0-9]{40}$/.test(previous.commit))) throw Error('Invalid or foreign release baseline');
    const paths = parseGitPaths(readGit(previous ? ['diff', '--name-only', '-z', previous.commit, commit] : ['ls-files', '-z']));
    assertSourceBoundary(paths);
    const dependencies = testing.dependencies ? testing.dependencies() : backendDependencies();
    const plan = planChanges(paths, Boolean(previous), [...dependencies, ...(previous?.backendSources || [])]);
    if (plan.unknown.length) {
      if (plan.unknown.some(path => /^src\/routes\/api\//.test(path) || /\.functions\./.test(path))) throw Error(`New TanStack server route/function is not wired to Yandex API Gateway: ${plan.unknown.join(', ')}. Add its Yandex handler and Gateway route first.`);
      // New project files are included in the ordinary full release. Do not ask for a per-file allowlist.
      plan.frontend = true; plan.backend = true; plan.gateway = true;
      console.log(`Additional changed project files detected; publishing the complete application: ${plan.unknown.join(', ')}`);
    }
    const directory = mkdtempSync(join(state, 'release-'));
    const adapter = adapterFactory(env, directory);
    activeAdapter = adapter;
    const save = (name, value) => { const file = join(directory, name); writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value, null, 2)); return file; };
    const functionResource = adapter.cloud(['serverless', 'function', 'get', env.YC_FUNCTION_ID, '--format', 'json']);
    if (functionResource.id !== env.YC_FUNCTION_ID) throw Error('Function resource identity mismatch');
    save('function-before.json', functionResource);
    const gatewayRaw = adapter.gateway ? adapter.gateway(env.YC_GATEWAY_ID) : adapter.cloud(['serverless', 'api-gateway', 'get', env.YC_GATEWAY_ID, '--format', 'json']);
    if (gatewayRaw.id !== env.YC_GATEWAY_ID || normalize(gatewayRaw).folder_id !== normalize(functionResource).folder_id) throw Error('Gateway identity/folder mismatch');
    save('gateway-before.json', gatewayRaw);
    save('current-before.json', previous);
    const oldGateway = gatewaySpec(gatewayRaw);
    assertGateway(oldGateway, env);
    const tags = gatewayTags(oldGateway);
    if (tags.length !== 1) throw Error('Multiple active Function tags require operator review');
    const before = adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', env.YC_FUNCTION_ID, '--tag', tags[0], '--format', 'json']);
    const cfg = verifyFunction(before, env);
    save('version-before.json', before);
    if (previous?.functionVersion && previous.functionVersion !== before.id) throw Error('Live Function version drift from last verified release');
    if (previous?.functionConfigHash && previous.functionConfigHash !== hash(JSON.stringify(cfg))) throw Error('Live Function settings drift');
    if (previous?.gatewayHash && previous.gatewayHash !== hash(JSON.stringify(comparableGateway(oldGateway)))) throw Error('Live Gateway drift');
    const desired = gatewaySpec(readFileSync('yandex-api/api-gateway.yaml', 'utf8'));
    assertGateway(desired, env);
    assertEndpoints(desired, backendEndpoints());
    save('gateway-desired.json', desired);
    if (!equal(comparableGateway(oldGateway), comparableGateway(desired))) plan.gateway = true;
    // Create a fresh short-lived IAM token in a private file; never put credentials in CLI args or logs.
    const ydbToken = testing.ydbToken ?? execute('yc', ['iam', 'create-token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (typeof ydbToken !== 'string' || !ydbToken.trim()) throw Error('Could not obtain a fresh YDB IAM token');
    ydbTokenFile = join(directory, 'ydb-iam-token');
    writeFileSync(ydbTokenFile, ydbToken.trim() + '\n', { mode: 0o600 });
    await adapter.verifyPublic();
    // Read-only schema check even if there are no migrations; no cloud writes here.
    execute('node', ['yandex-api/migrate.mjs', 'check', join(directory, 'migrations-check.json')], { stdio: 'inherit', env: { ...env, YDB_TOKEN_FILE: ydbTokenFile, RELEASE_STATE: state, RELEASE_DIRECTORY: directory } });
    const migrationCheck = JSON.parse(readFileSync(join(directory, 'migrations-check.json'), 'utf8'));
    if (migrationCheck.needsSchemaApproval) {
      const accepted = join(state, 'schema-accepted.json');
      if (existsSync(accepted)) throw Error(`Live YDB schema changed since the last verified release. Inspect ${directory}/schema-observed.json; automatic deployment stopped before writes.`);
      writeFileSync(accepted, JSON.stringify({ tables: JSON.parse(readFileSync(join(directory, 'schema-observed.json'), 'utf8')), approvedAt: new Date().toISOString() }, null, 2));
    }
    save('plan.json', { ...plan, commit, previousVersion: before.id });
    console.log(JSON.stringify({ ...plan, commit, previousVersion: before.id, auditDirectory: directory, pendingMigrations: migrationCheck.pending }, null, 2));
    if (plan.frontend) {
      execute('npm', ['run', 'build:yandex'], { stdio: 'inherit' });
      if (!existsSync('.output/public/_shell.html')) throw Error('SPA shell missing');
      writeFileSync('.output/public/index.html', readFileSync('.output/public/_shell.html'));
    }
    const assets = plan.frontend ? assertProductionAssets('.output/public') : previous?.assets;
    if (!assets) throw Error('No frontend hash baseline');
    const metadata = Object.fromEntries(Object.keys(assets).map(key => [key, { type: contentType(key), cache: key === 'index.html' || key === '_shell.html' ? 'no-cache,max-age=0' : /^assets\//.test(key) ? 'public,max-age=31536000,immutable' : 'public,max-age=300' }]));
    if (plan.backend) execute('bash', ['yandex-api/build.sh'], { stdio: 'inherit' });
    const backendHash = plan.backend ? hash(readFileSync('yandex-api/pravdarula-api.zip')) : previous?.backendHash;
    if (plan.backend || plan.gateway || migrationCheck.pending.length) {
      console.log('Backend/Gateway/database changes detected. Candidate API will be checked before activation; production health/auth and published assets will be checked after activation.');
    }
    if (migrationCheck.pending.length) console.log(`Applying validated backward-compatible YDB migrations: ${migrationCheck.pending.join(', ')}`);
    checkpoint(commit);
    const archiveHash = plan.backend ? hash(readFileSync('yandex-api/pravdarula-api.zip')) : null;
    const latestGateway = gatewaySpec(adapter.gateway ? adapter.gateway(env.YC_GATEWAY_ID) : adapter.cloud(['serverless', 'api-gateway', 'get', env.YC_GATEWAY_ID, '--format', 'json']));
    if (!equal(latestGateway, oldGateway)) throw Error('Gateway changed during preflight');
    assertSameFunction(before, adapter.cloud(['serverless', 'function', 'version', 'get', before.id, '--format', 'json']));
    const activeBefore = adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', env.YC_FUNCTION_ID, '--tag', tags[0], '--format', 'json']);
    if (activeBefore.id !== before.id) throw Error('Active tag changed during preflight');
    const backup = join(directory, 'backup'); mkdirSync(backup);
    adapter.backup(backup);
    const backupHashes = fileManifest(backup);
    if (!backupHashes['index.html']) throw Error('Backup has no production index.html; stopped before cloud writes');
    const staticMetadata = Object.fromEntries(Object.keys(backupHashes).map(key => [key, adapter.metadata(key)]));
    await adapter.verifyStatic(backupHashes);
    const previousTag = `release-${before.id}`;
    const pending = { directory, commit, previousVersion: before.id, previousTag, functionId: env.YC_FUNCTION_ID, gatewayId: env.YC_GATEWAY_ID, env: { YC_BUCKET: env.YC_BUCKET, YC_FUNCTION_ID: env.YC_FUNCTION_ID, YC_GATEWAY_ID: env.YC_GATEWAY_ID, YC_RUNTIME_SA_ID: env.YC_RUNTIME_SA_ID, YC_GATEWAY_SA_ID: env.YC_GATEWAY_SA_ID, APP_BASE_URL: env.APP_BASE_URL }, phase: 'prepared', migrationStarted: false, backupHashes, staticMetadata, snapshotHashes: Object.fromEntries(['function-before.json', 'version-before.json', 'gateway-before.json', 'gateway-desired.json', 'current-before.json'].map(name => [join(directory, name), hash(readFileSync(join(directory, name)))])) };
    const phase = name => { pending.phase = name; savePending(state, pending); };
    const mustPin = plan.backend || (plan.gateway && tags[0] === '$latest');
    if (mustPin) {
    phase('pin-old-version');
    // First pin the CURRENT code, then remove Gateway's dependency on $latest.
    adapter.cloud(['serverless', 'function', 'version', 'set-tag', '--id', before.id, '--tag', previousTag, '--format', 'json']);
    if (adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', env.YC_FUNCTION_ID, '--tag', previousTag, '--format', 'json']).id !== before.id) throw Error('Baseline tag mismatch');
    const pinnedOld = pinGateway(oldGateway, previousTag);
    const pinnedFile = join(directory, 'gateway-pinned-old.yaml'); writeGateway(pinnedFile, pinnedOld);
    phase('pin-gateway-before-candidate');
    adapter.cloud(['serverless', 'api-gateway', 'update', env.YC_GATEWAY_ID, '--spec', pinnedFile, '--format', 'json']);
    if (!sameDeployedGateway(gatewaySpec(adapter.gateway ? adapter.gateway(env.YC_GATEWAY_ID) : adapter.cloud(['serverless', 'api-gateway', 'get', env.YC_GATEWAY_ID, '--format', 'json'])), pinnedOld)) throw Error('Gateway pin read-back failed');
    await adapter.verifyPublic();
    }
    let active = before;
    let newTag = mustPin ? previousTag : tags[0];
    if (plan.backend) {
      if (hash(readFileSync('yandex-api/pravdarula-api.zip')) !== archiveHash) throw Error('API archive changed');
      phase('candidate-create');
      const created = adapter.cloud(candidateArgs(before, 'yandex-api/pravdarula-api.zip', `Pravdarula ${commit}`));
      if (!created.id) throw Error('Candidate version ID missing; inspect cloud operations before recovery');
      pending.candidateVersion = created.id; phase('candidate-readback');
      active = adapter.cloud(['serverless', 'function', 'version', 'get', created.id, '--format', 'json']);
      assertSameFunction(before, active);
      newTag = `release-${created.id}`;
      adapter.cloud(['serverless', 'function', 'version', 'set-tag', '--id', created.id, '--tag', newTag, '--format', 'json']);
      if (adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', env.YC_FUNCTION_ID, '--tag', newTag, '--format', 'json']).id !== created.id) throw Error('Candidate tag mismatch');
      adapter.probe(newTag, '/api/health'); adapter.probe(newTag, '/api/auth/me');
    }
    if (migrationCheck.pending.length) {
      pending.migrationStarted = true; phase('migrations');
      execute('node', ['yandex-api/migrate.mjs', 'apply', join(directory, 'migrations-applied.json')], { stdio: 'inherit', env: { ...env, YDB_TOKEN_FILE: ydbTokenFile, RELEASE_STATE: state, RELEASE_DIRECTORY: directory, APPROVED_MIGRATION_HASH: migrationCheck.planHash, APPROVE_YDB_BASELINE: 'yes' } });
    }
    phase('frontend-upload');
    if (plan.frontend) {
      if (!equal(assertProductionAssets('.output/public'), assets)) throw Error('Frontend changed after preflight');
      for (const key of [...Object.keys(assets).filter(key => key !== 'index.html'), 'index.html']) adapter.upload(join('.output/public', key), key, metadata[key]);
    }
    const activated = pinGateway(plan.gateway ? desired : oldGateway, newTag);
    const activationFile = join(directory, 'gateway-activate.yaml'); writeGateway(activationFile, activated);
    if (plan.backend || plan.gateway) {
      phase('gateway-activation');
      adapter.cloud(['serverless', 'api-gateway', 'update', env.YC_GATEWAY_ID, '--spec', activationFile, '--format', 'json']);
    }
    if (!sameDeployedGateway(gatewaySpec(adapter.gateway ? adapter.gateway(env.YC_GATEWAY_ID) : adapter.cloud(['serverless', 'api-gateway', 'get', env.YC_GATEWAY_ID, '--format', 'json'])), activated)) throw Error('Activated Gateway mismatch');
    if (adapter.cloud(['serverless', 'function', 'version', 'get-by-tag', '--function-id', env.YC_FUNCTION_ID, '--tag', newTag, '--format', 'json']).id !== active.id) throw Error('Active version mismatch');
    await adapter.verifyStatic(assets); await adapter.verifyPublic();
    phase('verified');
    // Keep the exact verified pre-release snapshot so a visually bad release can be rolled back manually later.
    writeFileSync(join(directory, 'completed-pending.json'), JSON.stringify(pending, null, 2));
    const manifest = { commit, origin: env.APP_BASE_URL, bucket: env.YC_BUCKET, assets, backendHash, backendSources: dependencies, functionVersion: active.id, functionTag: newTag, functionConfigHash: hash(JSON.stringify(cfg)), gatewayHash: hash(JSON.stringify(comparableGateway(activated))), completedAt: new Date().toISOString(), directory };
    save('completed.json', manifest);
    writeFileSync(join(state, 'next.json'), JSON.stringify(manifest, null, 2)); renameSync(join(state, 'next.json'), join(state, 'current.json'));
    unlinkSync(join(state, 'pending.json'));
    cleanExit = true;
    console.log(`Release verified: ${commit}. Recovery snapshots: ${directory}`);
  } catch (error) {
    const pendingFile = join(state, 'pending.json');
    if (existsSync(pendingFile) && activeAdapter) {
      const pending = JSON.parse(readFileSync(pendingFile, 'utf8'));
      if (!pending.migrationStarted) {
        try {
          console.error('Deployment check failed. Automatically restoring the previous verified frontend/API.');
          await recoverRelease(state, activeAdapter);
          console.error('Previous version restored and verified.');
        } catch (recoveryError) {
          console.error(`Automatic recovery could not be verified. Release remains locked for safety: ${recoveryError.message}`);
        }
      } else {
        console.error('A database migration started. The previous API is not switched back automatically because the database may have changed; inspect the saved migration journal.');
      }
    }
    throw error;
  } finally {
    // Short-lived YDB token is not part of the durable audit record.
    if (ydbTokenFile) try { unlinkSync(ydbTokenFile); } catch { /* best-effort secret cleanup */ }
    // Normal failures keep pending.json but release the process lock. A killed process keeps both.
    try { execFileSync('rmdir', [lock]); } catch { /* fail closed */ }
    if (!cleanExit) console.error(`Release NOT completed. Inspect ${state}; next deployment is blocked if pending.json exists. YDB is never automatically rolled back.`);
  }
}

export async function runRollback(env = process.env, testing = {}) {
  for (const key of ['YC_BUCKET', 'YC_FUNCTION_ID', 'YC_GATEWAY_ID', 'YC_RUNTIME_SA_ID', 'YC_GATEWAY_SA_ID', 'APP_BASE_URL']) if (!env[key]) throw Error(`Missing ${key}`);
  if (env.APP_BASE_URL !== 'https://pravdarula.ru') throw Error('Unexpected production target; rollback blocked');
  const target = hash(`${env.APP_BASE_URL}/${env.YC_BUCKET}`).slice(0, 16);
  const state = join(env.XDG_CACHE_HOME || join(env.HOME, '.cache'), 'pravdarula-releases', target);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = join(state, 'lock');
  try { mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw Error(`Release lock exists: ${lock}; do not start another operation until it is resolved`); throw error; }
  try {
    const pendingFile = join(state, 'pending.json');
    if (existsSync(pendingFile)) throw Error('An unfinished release already exists. Run the normal deploy command to recover it before requesting another rollback.');
    const currentFile = join(state, 'current.json');
    if (!existsSync(currentFile)) throw Error('No successful release manifest exists yet; there is no previous deployed version to restore.');
    const current = JSON.parse(readFileSync(currentFile, 'utf8'));
    const releaseDirectory = current.directory;
    const rollbackFile = join(releaseDirectory, 'completed-pending.json');
    if (!existsSync(rollbackFile)) throw Error('Rollback snapshot for the current release is missing; refusing to guess a previous version.');
    const pending = JSON.parse(readFileSync(rollbackFile, 'utf8'));
    if (pending.commit !== current.commit || pending.candidateVersion !== current.functionVersion) throw Error('Rollback snapshot does not match the active release manifest.');
    writeFileSync(pendingFile, JSON.stringify({ ...pending, phase: 'manual-rollback' }, null, 2));
    const adapterFactory = testing.makeAdapter || makeAdapter;
    const adapter = adapterFactory(pending.env, pending.directory);
    await recoverRelease(state, adapter);
    console.log(`Rollback complete: restored the release preceding ${current.commit}. Previous UI, API and Gateway were verified.`);
  } finally {
    try { execFileSync('rmdir', [lock]); } catch { /* preserve lock if unexpected contents remain */ }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const task = process.argv[2] === '--rollback' ? runRollback() : runRelease();
  task.catch(error => { console.error(error.message); process.exitCode = 1; });
}
