import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { parse } from 'yaml';
import { recoverRelease, savePending } from './release-recovery.mjs';
import { hash, fileManifest } from './release-plan.mjs';
import { pinGateway } from './release-safety.mjs';
function fixture() {
  const state = mkdtempSync(tmpdir() + '/recovery-'); const directory = state + '/release'; mkdirSync(directory); mkdirSync(directory + '/backup');
  const old = { paths: { '/api/health': { get: { 'x-yc-apigateway-integration': { type: 'cloud_functions', function_id: 'fn', service_account_id: 'gateway-sa', tag: '$latest' } } }, '/': { get: { 'x-yc-apigateway-integration': { type: 'object_storage', bucket: 'bucket' } } } } };
  const version = { id: 'v1', function_id: 'fn', runtime: 'nodejs22', entrypoint: 'index.handler', resources: { memory: '268435456' }, execution_timeout: '30s', service_account_id: 'sa', environment: {}, secrets: [] };
  writeFileSync(directory + '/backup/index.html', 'old entry'); writeFileSync(directory + '/backup/app.js', 'old script');
  for (const [name, data] of Object.entries({ 'version-before.json': version, 'gateway-before.json': { openapi_spec: JSON.stringify(old) }, 'gateway-desired.json': old })) writeFileSync(directory + '/' + name, JSON.stringify(data));
  const pending = { directory, previousVersion: 'v1', previousTag: 'release-v1', candidateVersion: 'v2', functionId: 'fn', gatewayId: 'gw', migrationStarted: false, env: { YC_BUCKET: 'bucket', YC_FUNCTION_ID: 'fn', YC_RUNTIME_SA_ID: 'sa', YC_GATEWAY_SA_ID: 'gateway-sa' }, backupHashes: fileManifest(directory + '/backup'), staticMetadata: { 'index.html': { type: 'text/html', cache: 'no-cache' }, 'app.js': { type: 'application/javascript', cache: 'public,max-age=300' } }, snapshotHashes: Object.fromEntries(['version-before.json', 'gateway-before.json', 'gateway-desired.json'].map(name => [directory + '/' + name, hash(readFileSync(directory + '/' + name))])) };
  savePending(state, pending);
  const writes = []; const uploads = {}; let live = pinGateway(old, 'release-v2');
  const adapter = {
    cloud: args => {
      if (args.includes('set-tag')) { writes.push('pin-v1'); return {}; }
      if (args.includes('get-by-tag')) return version;
      if (args[1] === 'function') return version;
      if (args.includes('update')) { writes.push('gateway-old'); live = parse(readFileSync(args[args.indexOf('--spec') + 1], 'utf8')); return {}; }
      return { openapi_spec: JSON.stringify(live) };
    },
    upload: (path, key, metadata) => { assert.ok(metadata.type); writes.push('upload:' + key); uploads[key] = hash(readFileSync(path)); },
    verifyStatic: async expected => assert.deepEqual(uploads, expected),
    verifyPublic: async () => writes.push('health-and-auth-verified'),
  };
  return { state, pending, adapter, writes, cleanup: () => rmSync(state, { recursive: true }) };
}
test('recover frontend, pinned Function and Gateway; verify before clearing pending', async () => {
  const f = fixture(); try { await recoverRelease(f.state, f.adapter); assert.deepEqual(f.writes, ['pin-v1', 'upload:app.js', 'upload:index.html', 'gateway-old', 'health-and-auth-verified']); assert.equal(existsSync(f.state + '/pending.json'), false); assert.equal(existsSync(f.pending.directory + '/recovered.json'), true); } finally { f.cleanup(); }
});
test('failed static upload leaves pending and next release blocked', async () => {
  const f = fixture(); f.adapter.upload = () => { throw Error('network upload failed'); };
  try { await assert.rejects(recoverRelease(f.state, f.adapter), /network/); assert.equal(existsSync(f.state + '/pending.json'), true); assert.equal(f.writes.includes('gateway-old'), false); } finally { f.cleanup(); }
});
test('altered backup fails before any cloud write', async () => {
  const f = fixture(); writeFileSync(f.pending.directory + '/backup/index.html', 'corrupt');
  try { await assert.rejects(recoverRelease(f.state, f.adapter), /checksum/); assert.equal(f.writes.length, 0); } finally { f.cleanup(); }
});
test('rollback after an additive YDB migration restores code and intentionally retains additive schema', async () => {
  const f = fixture(); savePending(f.state, { ...f.pending, migrationStarted: true });
  try { await recoverRelease(f.state, f.adapter); assert.equal(existsSync(f.state + '/pending.json'), false); assert.ok(f.writes.includes('gateway-old')); assert.ok(f.writes.includes('health-and-auth-verified')); } finally { f.cleanup(); }
});
test('failed verification retains pending even after restoration writes', async () => {
  const f = fixture(); f.adapter.verifyPublic = async () => { throw Error('auth check failed'); };
  try { await assert.rejects(recoverRelease(f.state, f.adapter), /auth check/); assert.equal(existsSync(f.state + '/pending.json'), true); } finally { f.cleanup(); }
});
test('wrong recovery version blocks restoration', async () => {
  const f = fixture(); const original = f.adapter.cloud;
  f.adapter.cloud = args => args.includes('get-by-tag') ? { id: 'wrong' } : original(args);
  try { await assert.rejects(recoverRelease(f.state, f.adapter), /does not resolve/); assert.equal(f.writes.some(x => x.startsWith('upload:')), false); } finally { f.cleanup(); }
});
test('recovery restores the old manifest even if a crash followed writing the new manifest', async () => {
  const f = fixture();
  const old = { commit: 'old', functionVersion: 'v1' };
  const file = f.pending.directory + '/current-before.json';
  writeFileSync(file, JSON.stringify(old)); f.pending.snapshotHashes[file] = hash(readFileSync(file));
  writeFileSync(f.state + '/current.json', JSON.stringify({ commit: 'new', functionVersion: 'v2' })); savePending(f.state, f.pending);
  try { await recoverRelease(f.state, f.adapter); assert.deepEqual(JSON.parse(readFileSync(f.state + '/current.json', 'utf8')), old); } finally { f.cleanup(); }
});
