import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { normalize, equal, stable } from '../scripts/release-safety.mjs';
import { digest } from './migration-engine.mjs';

function typeName(type) {
  if (typeof type === 'string') return type;
  if (type?.type_id) return { UTF8: 'Utf8', TIMESTAMP: 'Timestamp', UINT32: 'Uint32', JSON_DOCUMENT: 'JsonDocument', JSON: 'Json', INT64: 'Int64', UINT64: 'Uint64' }[type.type_id] || String(type.type_id);
  if (type?.optional_type?.item) return typeName(type.optional_type.item) + '?';
  throw Error('Unrecognized YDB column type; inspect DescribeTable response before adopting schema');
}
export function canonicalSchema(raw) {
  const s = normalize(raw);
  if (!Array.isArray(s.columns) || !s.columns.length || !Array.isArray(s.primary_key) || !s.primary_key.length) throw Error('DescribeTable columns/primary_key missing');
  if (!Array.isArray(s.indexes || [])) throw Error('Unrecognized indexes representation');
  const ignored = ['self', 'table_stats', 'partition_stats', 'shard_key_bounds'];
  // Keep ALL nonvolatile table settings, including indexes, TTL/storage/partition settings.
  const schema = Object.fromEntries(Object.entries(s).filter(([key]) => !ignored.includes(key)));
  schema.columns = s.columns.map(c => ({ ...c, type: typeName(c.type) })).sort((a, b) => a.name.localeCompare(b.name));
  schema.indexes = (s.indexes || []).map(index => {
    if (!index.name) throw Error('Index name missing');
    return index;
  }).sort((a, b) => a.name.localeCompare(b.name));
  return stable(schema);
}
export function assertBaselineContract(schema, baseline) {
  for (const [table, names] of Object.entries(baseline.tables)) {
    const s = schema[table];
    if (!s) throw Error(`Missing baseline table: ${table}`);
    for (const name of names) if (!s.columns.some(c => c.name === name)) throw Error(`Missing baseline column: ${table}.${name}`);
    if (!equal(s.primary_key, baseline.primaryKeys[table])) throw Error(`YDB primary key mismatch: ${table}`);
    for (const [name, type] of Object.entries(baseline.typeConstraints?.[table] || {})) if (s.columns.find(c => c.name === name)?.type !== type) throw Error(`YDB type mismatch: ${table}.${name}, expected ${type}`);
  }
}
export function assertAcceptedSchema(actual, accepted) {
  if (!equal(actual, accepted)) throw Error('YDB schema drift: columns/types/PK/indexes/table options changed; inspect read-only snapshot before release');
}
export function isMissingYdbTableError(error) {
  // YDB nests the useful 'table does not exist' diagnostic inside issues; String(error) alone loses it.
  const detail = [String(error?.message || error), JSON.stringify(error?.issues || [])].join(' ');
  return /path.*(not exist|does not exist)|table.*(not found|not exist|does not exist)/i.test(detail);
}
export function readLiveSchema(connection, tables) {
  const url = new URL(connection);
  const database = url.searchParams.get('database');
  if (!database || !['grpc:', 'grpcs:'].includes(url.protocol)) throw Error('Invalid YDB connection endpoint/database');
  const result = {};
  for (const table of tables) {
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw Error('Unsafe schema identifier');
    const args = ['--endpoint', `${url.protocol}//${url.host}`, '--database', database, '--token-file', process.env.YDB_TOKEN_FILE, 'scheme', 'describe', table, '--format', 'proto-json-base64'];
    // Token in a restricted local FILE, never a CLI argument or log.
    if (!process.env.YDB_TOKEN_FILE) throw Error('YDB_TOKEN_FILE required (0600 IAM token file); inspect local ydb CLI auth support');
    if ((statSync(process.env.YDB_TOKEN_FILE).mode & 0o077) !== 0) throw Error('IAM token file permissions must exclude group/other access');
    result[table] = canonicalSchema(JSON.parse(execFileSync('ydb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, env: { ...process.env, GRPC_DNS_RESOLVER: process.env.GRPC_DNS_RESOLVER || 'native' } })));
  }
  return stable(result);
}
export function inspectSchema(connection, baseline, state, directory) {
  const acceptedPath = state + '/schema-accepted.json';
  const accepted = existsSync(acceptedPath) ? JSON.parse(readFileSync(acceptedPath, 'utf8')) : null;
  const tables = [...new Set([...Object.keys(baseline.tables), ...Object.keys(accepted?.tables || {})])];
  const actual = readLiveSchema(connection, tables);
  assertBaselineContract(actual, baseline);
  writeFileSync(directory + '/schema-observed.json', JSON.stringify(actual, null, 2));
  if (accepted) assertAcceptedSchema(actual, accepted.tables);
  return { actual, hash: digest(JSON.stringify(actual)), needsApproval: !accepted };
}
