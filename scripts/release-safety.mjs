import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { parse, stringify } from 'yaml';
import { hash } from './release-plan.mjs';

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
export const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const snake = key => key.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
export function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [snake(k), k === 'environment' ? v : normalize(v)]));
  return value;
}
const metadata = ['id', 'function_id', 'created_at', 'description', 'image_size', 'status', 'tags', 'package', 'build_time', 'build_duration', 'log_group_id'];
const settings = ['runtime', 'entrypoint', 'resources', 'execution_timeout', 'service_account_id', 'environment', 'secrets', 'connectivity', 'named_service_accounts', 'log_options', 'async_invocation_config', 'concurrency', 'tmpfs_size', 'metadata_options', 'mounts', 'storage_mounts'];
export function functionConfig(raw) {
  const v = normalize(raw);
  for (const key of Object.keys(v)) if (!metadata.includes(key) && !settings.includes(key)) throw Error(`Unknown Function field: ${key}; review CLI schema before release`);
  for (const key of ['id', 'function_id', 'runtime', 'entrypoint', 'resources', 'execution_timeout', 'service_account_id']) if (!v[key]) throw Error(`Missing Function field: ${key}`);
  const cfg = Object.fromEntries(settings.filter(k => k in v).map(k => [k, v[k]]));
  cfg.secrets = (cfg.secrets || []).sort((a, b) => String(a.environment_variable).localeCompare(String(b.environment_variable)));
  return stable(cfg);
}
export function verifyFunction(raw, env) {
  const cfg = functionConfig(raw), v = normalize(raw);
  if (v.function_id !== env.YC_FUNCTION_ID || cfg.service_account_id !== env.YC_RUNTIME_SA_ID) throw Error('Function or runtime service account mismatch');
  if (cfg.runtime !== 'nodejs22' || cfg.entrypoint !== 'index.handler') throw Error('Runtime/entrypoint incompatible with this archive; review required');
  if (cfg.environment?.YANDEX_PAY_ENV !== 'sandbox' || (env.YANDEX_PAY_ENV && env.YANDEX_PAY_ENV !== 'sandbox')) throw Error('Preserve current Sandbox: payment mode mismatch');
  for (const key of ['APP_BASE_URL', 'YDB_CONNECTION_STRING', 'POSTBOX_FROM_EMAIL', 'APP_ORIGINS', 'APP_PREVIEW_ORIGIN', 'YANDEX_PAY_MERCHANT_ID']) {
    if (env[key] !== undefined && env[key] !== (cfg.environment?.[key] || '')) throw Error(`Function environment mismatch: ${key}; no implicit settings changes allowed`);
  }
  if (cfg.environment?.APP_BASE_URL !== env.APP_BASE_URL || cfg.environment?.YDB_CONNECTION_STRING !== env.YDB_CONNECTION_STRING) throw Error('Function target mismatch');
  const auth = cfg.secrets.find(s => s.environment_variable === 'AUTH_SECRET');
  const pay = cfg.secrets.find(s => s.environment_variable === 'YANDEX_PAY_SANDBOX_API_KEY');
  for (const [secret, id, key] of [[auth, env.YC_AUTH_SECRET_ID, 'AUTH_SECRET'], [pay, env.YC_PAY_SECRET_ID, 'YANDEX_PAY_SANDBOX_API_KEY']]) {
    if (!secret || !id || secret.id !== id || secret.key !== key || !secret.version_id) throw Error(`Secret ID/key/immutable version mismatch or missing: ${key}; inspect Lockbox binding`);
  }
  if (cfg.secrets.some(s => !s.id || !s.key || !s.version_id || !s.environment_variable)) throw Error('Unpinned or incomplete secret binding');
  return cfg;
}
export function assertSameFunction(before, after) {
  const a = functionConfig(before), b = functionConfig(after);
  if (!equal(a, b)) throw Error('Candidate Function configuration differs from baseline; candidate must not be activated');
}
export function candidateArgs(before, archive, description) {
  // Clone every platform setting, not a guessed subset of runtime defaults.
  // Candidate config is read back and compared BEFORE Gateway activation.
  const v = normalize(before);
  functionConfig(v);
  return ['serverless', 'function', 'version', 'create', '--function-id', v.function_id,
    '--source-version-id', v.id, '--source-path', archive, '--description', description, '--format', 'json'];
}
export function gatewaySpec(raw) {
  if (typeof raw === 'string') return parse(raw);
  const v = normalize(raw);
  if (!v.openapi_spec) throw Error('Gateway openapi_spec missing; review CLI output');
  return parse(v.openapi_spec);
}
export function integrations(spec) {
  return Object.entries(spec.paths || {}).flatMap(([path, methods]) => Object.entries(methods).filter(([m]) => /^(get|post|put|delete|patch|options|head)$/.test(m)).map(([method, op]) => ({ path, method: method.toUpperCase(), integration: op['x-yc-apigateway-integration'] })));
}
export function assertGateway(spec, env) {
  const all = integrations(spec);
  if (!all.length) throw Error('Empty Gateway routes');
  for (const { integration: i } of all) {
    if (!i || !['object_storage', 'cloud_functions'].includes(i.type)) throw Error('Unknown Gateway integration; explicit review required');
    if (i.type === 'object_storage' && i.bucket !== env.YC_BUCKET) throw Error('Gateway bucket mismatch');
    if (i.type === 'cloud_functions' && (i.function_id !== env.YC_FUNCTION_ID || i.service_account_id !== env.YC_GATEWAY_SA_ID || !i.tag)) throw Error('Gateway Function/SA/tag mismatch');
  }
}
export function gatewayTags(spec) { return [...new Set(integrations(spec).filter(x => x.integration.type === 'cloud_functions').map(x => x.integration.tag))]; }
export function pinGateway(spec, tag) {
  const copy = structuredClone(spec);
  for (const { integration: i } of integrations(copy)) if (i.type === 'cloud_functions') i.tag = tag;
  return copy;
}
export function writeGateway(path, spec) {
  const deployable = structuredClone(spec);
  // Yandex returns generated public server URLs in get-spec; they are output metadata, not editable spec input.
  delete deployable.servers;
  writeFileSync(path, stringify(deployable));
}
export function comparableGateway(spec) {
  const comparable = structuredClone(spec);
  // Ignore Yandex-generated domain URLs when comparing the authored OpenAPI configuration.
  delete comparable.servers;
  return stable(pinGateway(comparable, '__VERSION__'));
}
export function assertEndpoints(spec, endpoints) {
  const routes = new Set(integrations(spec).filter(x => x.integration.type === 'cloud_functions').map(x => `${x.method} ${x.path}`));
  for (const endpoint of endpoints) if (!routes.has(endpoint)) throw Error(`API endpoint not routed by Gateway: ${endpoint}`);
  for (const route of routes) if (!endpoints.includes(route)) throw Error(`Gateway endpoint absent from verified handler inventory: ${route}`);
}
export function assertCompatibility(evidence, expected) {
  for (const key of ['commit', 'previousVersion', 'frontendHash', 'backendHash', 'gatewayHash']) if (evidence?.[key] !== expected[key]) throw Error(`Compatibility evidence does not match ${key}`);
  for (const name of ['oldFrontendNewBackend', 'newFrontendOldBackend', 'signedInSession', 'sandboxPayment']) {
    const check = evidence?.checks?.[name];
    if (!check || check.passed !== true || !check.report || !existsSync(check.report) || hash(readFileSync(check.report)) !== check.sha256) throw Error(`Missing verified compatibility report: ${name}; perform isolated checks, never approve blindly`);
  }
}
export function assertPendingClear(state) {
  if (existsSync(state + '/pending.json')) throw Error(`Unfinished release blocks deploy. Run the same command and choose RECOVER. Inspect ${state}/pending.json; never delete it to bypass checks.`);
}
export function assertReadOnlyProbe(result, path) {
  if (Number(result.statusCode) !== 200) throw Error(`Candidate read-only probe failed: ${path}`);
  const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body;
  if (path === '/api/auth/me' && body?.user !== null) throw Error('Candidate signed-out auth invariant failed');
  if (path === '/api/health' && body?.ok !== true) throw Error('Candidate health invariant failed');
}
