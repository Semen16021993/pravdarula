import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalSchema, assertBaselineContract, assertAcceptedSchema } from './schema-check.mjs';
const raw = { columns: [{ name: 'email', type: { typeId: 'UTF8' } }, { name: 'created_at', type: { typeId: 'TIMESTAMP' } }], primaryKey: ['email'], indexes: [{ name: 'created', indexColumns: ['created_at'], type: 'GLOBAL_SYNC' }] };
const schema = canonicalSchema(raw);
const baseline = { tables: { users: ['email', 'created_at'] }, primaryKeys: { users: ['email'] }, typeConstraints: { users: { email: 'Utf8', created_at: 'Timestamp' } } };
test('types and keys are verified, not just column names', () => {
  assertBaselineContract({ users: schema }, baseline);
  const wrong = structuredClone(schema); wrong.columns.find(c => c.name === 'email').type = 'Uint32';
  assert.throws(() => assertBaselineContract({ users: wrong }, baseline), /type mismatch/);
  wrong.primary_key = ['created_at']; assert.throws(() => assertBaselineContract({ users: wrong }, baseline), /primary key/);
});
test('index definition changes block schema adoption/release', () => {
  const changed = structuredClone(schema); changed.indexes[0].index_columns = ['email'];
  assert.throws(() => assertAcceptedSchema({ users: changed }, { users: schema }), /schema drift/);
});
test('nullable type drift is not silently accepted', () => {
  const changed = canonicalSchema({ ...raw, columns: [{ name: 'email', type: { optionalType: { item: { typeId: 'UTF8' } } } }, raw.columns[1]] });
  assert.equal(changed.columns.find(c => c.name === 'email').type, 'Utf8?');
  assert.throws(() => assertBaselineContract({ users: changed }, baseline), /type mismatch/);
});
test('unexpected table settings remain part of drift comparison', () => assert.throws(() => assertAcceptedSchema({ users: { ...schema, ttl_settings: { column_name: 'created_at' } } }, { users: schema }), /drift/));
