import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { functionConfig, verifyFunction, assertSameFunction, candidateArgs, pinGateway, gatewayTags, assertEndpoints, assertPendingClear, assertCompatibility } from './release-safety.mjs';
const env = { YC_FUNCTION_ID: 'fn', YC_RUNTIME_SA_ID: 'sa', YC_AUTH_SECRET_ID: 'auth', YC_PAY_SECRET_ID: 'pay', APP_BASE_URL: 'https://pravdarula.ru', YDB_CONNECTION_STRING: 'test-db' };
const version = { id: 'v1', function_id: 'fn', runtime: 'nodejs22', entrypoint: 'index.handler', resources: { memory: '268435456' }, execution_timeout: '30s', service_account_id: 'sa', environment: { APP_BASE_URL: env.APP_BASE_URL, YDB_CONNECTION_STRING: 'test-db', YANDEX_PAY_ENV: 'sandbox', EXTRA: 'preserved' }, secrets: [ { id: 'auth', key: 'AUTH_SECRET', version_id: 'a1', environment_variable: 'AUTH_SECRET' }, { id: 'pay', key: 'YANDEX_PAY_SANDBOX_API_KEY', version_id: 'p1', environment_variable: 'YANDEX_PAY_SANDBOX_API_KEY' } ], concurrency: '2', metadata_options: { aws_v1_http_endpoint: 'DISABLED' } };
test('clones full live version instead of hardcoded limits/environment/secret versions', () => {
  assert.equal(verifyFunction(version, env).environment.EXTRA, 'preserved');
  assert.deepEqual(candidateArgs(version, 'api.zip', 'release').slice(6, 8), ['--source-version-id', 'v1']);
  assertSameFunction(version, { ...version, id: 'v2', tags: ['$latest'] });
});
for (const [name, mutate] of Object.entries({ runtime: v => v.runtime = 'nodejs20', serviceAccount: v => v.service_account_id = 'other', memory: v => v.resources.memory = '1', timeout: v => v.execution_timeout = '3s', secretId: v => v.secrets[0].id = 'other', secretKey: v => v.secrets[0].key = 'other', secretVersion: v => v.secrets[0].version_id = 'other', payMode: v => v.environment.YANDEX_PAY_ENV = 'live', extraSetting: v => v.environment.EXTRA = 'lost', concurrency: v => v.concurrency = '1' })) {
  test(`candidate configuration mismatch blocks activation: ${name}`, () => { const changed = structuredClone(version); mutate(changed); assert.throws(() => assertSameFunction(version, changed), /differs/); });
}
test('unknown platform setting and unpinned secret fail closed', () => {
  assert.throws(() => functionConfig({ ...version, unknown_setting: true }), /Unknown/);
  const v = structuredClone(version); delete v.secrets[0].version_id;
  assert.throws(() => verifyFunction(v, env), /immutable/);
});
test('Sandbox cannot be switched by deployment configuration', () => assert.throws(() => verifyFunction(version, { ...env, YANDEX_PAY_ENV: 'live' }), /Sandbox/));
test('pinned old Gateway stays old while candidate latest changes', () => {
  const spec = { paths: { '/api/health': { get: { 'x-yc-apigateway-integration': { type: 'cloud_functions', tag: '$latest' } } } } };
  const old = pinGateway(spec, 'release-v1');
  assert.deepEqual(gatewayTags(old), ['release-v1']);
  assert.deepEqual(gatewayTags(pinGateway(spec, 'release-v2')), ['release-v2']);
  assert.throws(() => assertEndpoints(old, ['POST /api/new']), /not routed/);
});
test('pending release prevents a subsequent deployment', () => {
  const d = mkdtempSync(tmpdir() + '/release-');
  try { assertPendingClear(d); writeFileSync(d + '/pending.json', '{}'); assert.throws(() => assertPendingClear(d), /Unfinished/); } finally { rmSync(d, { recursive: true }); }
});
test('compatibility evidence fails if any required pair has no actual report', () => assert.throws(() => assertCompatibility({ commit: 'c', previousVersion: 'v', frontendHash: 'f', backendHash: 'b', gatewayHash: 'g', checks: {} }, { commit: 'c', previousVersion: 'v', frontendHash: 'f', backendHash: 'b', gatewayHash: 'g' }), /oldFrontendNewBackend/));
