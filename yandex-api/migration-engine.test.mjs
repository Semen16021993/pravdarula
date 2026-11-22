import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, validateMigration, sortMigrations } from './migration-engine.mjs';

const m = validateMigration({ id: '001_example', safety: 'additive', idempotent: true, expectedAfter: { example: { columns: [{ name: 'id', type: 'Utf8' }], primary_key: ['id'], indexes: [] } }, recovery: 'Inspect example with DescribeTable; confirm exact schema before explicit idempotent resume. Do not drop a table with data.', statements: ['CREATE TABLE IF NOT EXISTS example (id Utf8 NOT NULL, PRIMARY KEY (id))'] });
function adapter(journal = []) {
  const a = { calls: [], lock: async () => a.calls.push('lock'), unlock: async () => a.calls.push('unlock'), journal: async () => journal, execute: async () => a.calls.push('execute'), record: async (_m, state) => a.calls.push(state) };
  return a;
}
test('applied checksum is skipped, not run twice', async () => {
  const a = adapter([{ ...m, status: 'applied' }]); await applyMigrations(a, [m]); assert.deepEqual(a.calls, ['lock', 'unlock']);
});
test('changed checksum stops before executing DDL', async () => {
  const a = adapter([{ ...m, checksum: 'changed', status: 'applied' }]); await assert.rejects(applyMigrations(a, [m]), /changed/); assert.equal(a.calls.includes('execute'), false);
});
test('failed DDL records failure and releases lock', async () => {
  const a = adapter(); a.execute = async () => { throw new Error('DDL'); };
  await assert.rejects(applyMigrations(a, [m]), /failed/); assert.deepEqual(a.calls, ['lock', 'running', 'failed', 'unlock']);
});
test('unfinished migration never auto-retries', async () => {
  const a = adapter([{ ...m, status: 'running' }]); await assert.rejects(applyMigrations(a, [m]), /Unfinished/); assert.equal(a.calls.includes('execute'), false);
});
test('explicit idempotent resume is allowed', async () => {
  const a = adapter([{ ...m, status: 'failed' }]); await applyMigrations(a, [m], { resume: m.id }); assert.equal(a.calls.includes('execute'), true);
});
test('destructive change requires separate permission', async () => {
  assert.throws(() => validateMigration({ id: '001_drop', safety: 'additive', statements: ['DROP TABLE users'] }), /approval/);
  const a = adapter(); const risky = validateMigration({ id: '002_drop', safety: 'destructive', statements: ['DROP TABLE example'] });
  await assert.rejects(applyMigrations(a, [risky]), /approval/); assert.equal(a.calls.includes('execute'), false);
});
test('multiple statements cannot disguise a data write as additive DDL', () => {
  assert.throws(() => validateMigration({ id: '003_hidden', safety: 'additive', statements: ['CREATE TABLE IF NOT EXISTS example (id Utf8); UPSERT INTO users VALUES ("demo")'] }), /One statement/);
});
test('numeric migration order places 999 before 1000', () => assert.deepEqual(sortMigrations([{ id: '1000_next' }, { id: '999_previous' }]).map(x => x.id), ['999_previous', '1000_next']));
test('all pending migrations are preflighted before any DDL', async () => {
  const a = adapter();
  const risky = validateMigration({ id: '002_drop', safety: 'destructive', statements: ['DROP TABLE example'] });
  await assert.rejects(applyMigrations(a, [m, risky], { approveDestructive: true }), /external recovery/);
  assert.equal(a.calls.includes('execute'), false); assert.equal(a.calls.includes('running'), false);
});
test('schema postcondition failure is recorded and cannot silently become applied', async () => {
  const a = adapter(); a.verify = async () => { throw Error('Wrong index or column type'); };
  await assert.rejects(applyMigrations(a, [m]), /failed/);
  assert.equal(a.calls.includes('applied'), false); assert.equal(a.calls.includes('failed'), true);
});
test('multiple additive DDL statements require operator-led recovery rather than partial automatic apply', async () => {
  const a = adapter();
  await assert.rejects(applyMigrations(a, [{ ...m, statements: [...m.statements, 'ALTER TABLE example ADD COLUMN x Utf8'] }]), /one idempotent/);
  assert.equal(a.calls.includes('execute'), false);
});