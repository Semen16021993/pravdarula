import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMigrations, validateMigration } from './migration-engine.mjs';

const m = validateMigration({ id: '001_example', safety: 'additive', idempotent: true, statements: ['CREATE TABLE IF NOT EXISTS example (id Utf8 NOT NULL, PRIMARY KEY (id))'] });
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