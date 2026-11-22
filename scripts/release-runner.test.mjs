import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { runRelease } from './release-runner.mjs';
import { hash, fileManifest } from './release-plan.mjs';
import { comparableGateway, functionConfig } from './release-safety.mjs';

function setup({ fail, baseline = false } = {}) {
  const cwd = process.cwd(), root = mkdtempSync(tmpdir() + '/release-e2e-'); process.chdir(root);
  for (const dir of ['yandex-api', '.output/public/assets', 'infra', 'src']) mkdirSync(dir, { recursive: true });
  const commit = 'a'.repeat(40);
  const env = { HOME: root, APP_BASE_URL: 'https://pravdarula.ru', YC_BUCKET: 'bucket', YC_FUNCTION_ID: 'fn', YC_GATEWAY_ID: 'gw', YC_RUNTIME_SA_ID: 'sa', YC_GATEWAY_SA_ID: 'gateway-sa', YC_AUTH_SECRET_ID: 'auth', YC_PAY_SECRET_ID: 'pay', YDB_CONNECTION_STRING: 'test-db' };
  const version = { id: 'v1', function_id: 'fn', runtime: 'nodejs22', entrypoint: 'index.handler', resources: { memory: '268435456' }, execution_timeout: '30s', service_account_id: 'sa', environment: { APP_BASE_URL: env.APP_BASE_URL, YDB_CONNECTION_STRING: 'test-db', YANDEX_PAY_ENV: 'sandbox' }, secrets: [{ id: 'auth', version_id: 'auth-v1', key: 'AUTH_SECRET', environment_variable: 'AUTH_SECRET' }, { id: 'pay', version_id: 'pay-v1', key: 'YANDEX_PAY_SANDBOX_API_KEY', environment_variable: 'YANDEX_PAY_SANDBOX_API_KEY' }] };
  const spec = { paths: { '/': { get: { 'x-yc-apigateway-integration': { type: 'object_storage', bucket: 'bucket' } } }, '/api/health': { get: { 'x-yc-apigateway-integration': { type: 'cloud_functions', function_id: 'fn', service_account_id: 'gateway-sa', tag: baseline ? 'release-v1' : '$latest' } } } } };
  writeFileSync('yandex-api/api-gateway.yaml', JSON.stringify(spec));
  writeFileSync('yandex-api/index.ts', 'if (method === "GET" && path === "/api/health") {}');
  const state = root + '/.cache/pravdarula-releases/' + hash(env.APP_BASE_URL + '/' + env.YC_BUCKET).slice(0, 16);
  mkdirSync(state, { recursive: true });
  const storage = { 'index.html': Buffer.from('old entry'), 'assets/old.js': Buffer.from('old script') };
  let live = structuredClone(spec), active = structuredClone(version), alreadyFailed = false, activeChanged = false;
  const tags = { '$latest': version, 'release-v1': version }; const commands = []; let tokenFileSeen = null;
  const event = name => { commands.push(name); if (name === fail && !alreadyFailed) { alreadyFailed = true; throw Error('Simulated failure: ' + name); } };
  if (baseline) writeFileSync(state + '/current.json', JSON.stringify({ commit: 'b'.repeat(40), origin: env.APP_BASE_URL, bucket: 'bucket', functionVersion: 'v1', functionTag: 'release-v1', functionConfigHash: hash(JSON.stringify(functionConfig(version))), gatewayHash: hash(JSON.stringify(comparableGateway(spec))), backendHash: 'old-api', assets: Object.fromEntries(Object.entries(storage).map(([k, v]) => [k, hash(v)])) }));
  const adapter = {
    cloud: args => {
      if (args[1] === 'api-gateway') {
        if (args.includes('update')) {
          const candidate = parse(readFileSync(args[args.indexOf('--spec') + 1], 'utf8'));
          const tag = candidate.paths['/api/health'].get['x-yc-apigateway-integration'].tag;
          event(tag === 'release-v2' ? 'activate' : 'pin-gateway'); live = candidate; activeChanged = tag === 'release-v2'; return {};
        }
        return { id: 'gw', folder_id: 'folder', openapi_spec: JSON.stringify(live) };
      }
      if (args.includes('set-tag')) {
        event('set-tag'); const tag = args[args.indexOf('--tag') + 1], id = args[args.indexOf('--id') + 1]; tags[tag] = id === 'v1' ? version : active; return {};
      }
      if (args.includes('get-by-tag')) return tags[args[args.indexOf('--tag') + 1]];
      if (args.includes('create')) {
        // This proves Gateway no longer follows $latest before candidate creation.
        assert.equal(live.paths['/api/health'].get['x-yc-apigateway-integration'].tag, 'release-v1');
        event('candidate-create'); active = { ...structuredClone(version), id: 'v2' }; tags['$latest'] = active; return active;
      }
      if (args.includes('version')) {
        const id = args[args.indexOf('get') + 1];
        if (id === 'v2' && fail === 'candidate-config') return { ...active, execution_timeout: '1s' };
        return id === 'v1' ? version : active;
      }
      return { id: 'fn', folder_id: 'folder' };
    },
    metadata: () => ({ type: 'application/octet-stream', cache: 'no-cache' }),
    backup: dest => { for (const [key, data] of Object.entries(storage)) { const path = dest + '/' + key; mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true }); writeFileSync(path, data); } },
    upload: (file, key) => { event('upload:' + key); storage[key] = readFileSync(file); },
    verifyStatic: async expected => { for (const [key, checksum] of Object.entries(expected)) assert.equal(hash(storage[key]), checksum, key); },
    verifyPublic: async () => { if (activeChanged) event('activated-health'); },
    probe: (tag, path) => { assert.equal(tags[tag].id, 'v2'); event('probe:' + path); },
  };
  const options = {
    ydbToken: 'fixture-iam-token',
    git: args => args[0] === 'status' ? '' : args[0] === 'rev-parse' ? commit : 'src/styles.css\0',
    dependencies: () => ['yandex-api/index.ts'],
    makeAdapter: () => adapter,
    execute: (tool, args, options = {}) => {
      if (tool === 'node') { tokenFileSeen = options.env?.YDB_TOKEN_FILE; assert.ok(tokenFileSeen); assert.equal(statSync(tokenFileSeen).mode & 0o077, 0); writeFileSync(args[2], JSON.stringify({ pending: [], planHash: 'migration-plan', needsSchemaApproval: false })); return; }
      if (tool === 'npm') { writeFileSync('.output/public/_shell.html', 'new entry'); writeFileSync('.output/public/assets/new.js', 'new script'); }
      if (tool === 'bash') {
        writeFileSync('yandex-api/pravdarula-api.zip', 'new archive');
      }
    },
  };
  return { env, options, state, commands, storage, get tokenFileSeen() { return tokenFileSeen; }, cleanup: () => { process.chdir(cwd); rmSync(root, { recursive: true }); } };
}

for (const kind of ['unknown-config', 'unknown-project-file']) {
  test(`unclassified project file ${kind}: automatically selects a complete application release`, async () => {
    const f = setup();
    try {
      const unknown = kind === 'unknown-config' ? 'infra/new-config.json' : 'src/new-feature.tsx';
      writeFileSync(unknown, 'new project content');
      f.options.git = args => args[0] === 'status' ? '' : args[0] === 'rev-parse' ? 'a'.repeat(40) : unknown + '\0';
      await runRelease(f.env, f.options);
      assert.equal(JSON.parse(readFileSync(f.state + '/current.json', 'utf8')).functionVersion, 'v2');
      assert.ok(f.commands.includes('candidate-create'));
    } finally { f.cleanup(); }
  });
}

test('full release: baseline pin precedes new latest; manifest follows actual static/API verification', async () => {
  const f = setup(); try {
    await runRelease(f.env, f.options);
    assert.equal(JSON.parse(readFileSync(f.state + '/current.json', 'utf8')).functionVersion, 'v2');
    assert.equal(existsSync(f.state + '/pending.json'), false);
    assert.ok(f.commands.indexOf('pin-gateway') < f.commands.indexOf('candidate-create'));
    assert.ok(f.commands.indexOf('upload:index.html') < f.commands.indexOf('activate'));
    assert.ok(f.tokenFileSeen); assert.equal(existsSync(f.tokenFileSeen), false, 'short-lived IAM token is cleaned after the run');
  } finally { f.cleanup(); }
});
for (const failure of ['candidate-create', 'candidate-config', 'probe:/api/health', 'upload:index.html', 'activate', 'activated-health']) {
  test(`release failure at ${failure}: previous frontend/API are restored automatically in the same run`, async () => {
    const f = setup({ fail: failure }); try {
      await assert.rejects(runRelease(f.env, f.options));
      assert.equal(existsSync(f.state + '/pending.json'), false, 'same run automatically restored the previous release');
      assert.equal(f.storage['index.html'].toString(), 'old entry');
      assert.equal(existsSync(f.state + '/current.json'), false);
    } finally { f.cleanup(); }
  });
}
test('release does not require compatibility report files or interactive approvals', async () => {
  const f = setup(); try { await runRelease(f.env, f.options); assert.equal(existsSync(f.state + '/pending.json'), false); assert.equal(JSON.parse(readFileSync(f.state + '/current.json', 'utf8')).functionVersion, 'v2'); } finally { f.cleanup(); }
});
test('interface changes with a stable baseline do not write Function or Gateway', async () => {
  const f = setup({ baseline: true }); try {
    await runRelease(f.env, f.options);
    assert.equal(f.commands.some(c => ['set-tag', 'pin-gateway', 'candidate-create', 'activate'].includes(c)), false);
    assert.equal(JSON.parse(readFileSync(f.state + '/current.json', 'utf8')).functionVersion, 'v1');
  } finally { f.cleanup(); }
});
test('a lock left by a killed release blocks all cloud operations with recovery instructions', async () => {
  const f = setup(); mkdirSync(f.state + '/lock');
  try { await assert.rejects(runRelease(f.env, f.options), /Never delete pending/); assert.equal(f.commands.length, 0); } finally { f.cleanup(); }
});
