import { createHash } from 'node:crypto';

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export function validateMigration(m) {
  if (!/^\d{3,}_[a-z0-9_-]+$/.test(m.id) || !Array.isArray(m.statements) || !m.statements.length || m.statements.some((s) => typeof s !== 'string' || !s.trim())) throw new Error('Invalid migration');
  if (!['additive', 'destructive'].includes(m.safety)) throw new Error('Migration needs explicit safety classification');
  if (m.statements.some((s) => s.trim().replace(/;$/, '').includes(';'))) throw new Error('One statement per migration array item is required');
  if (m.safety === 'additive' && m.statements.some((s) => !/^\s*(CREATE TABLE IF NOT EXISTS\b|ALTER TABLE\s+`?[a-z0-9_]+`?\s+ADD COLUMN\b)/i.test(s) || /\b(DROP|DELETE|UPDATE|REPLACE|RENAME|INSERT|UPSERT|SELECT)\b/i.test(s.replace(/--[^\n]*/g, '')))) throw new Error('Non-additive statement requires destructive approval');
  return { ...m, checksum: digest(JSON.stringify(m)) };
}

/** Adapter makes orchestration testable without touching a real database. */
export async function applyMigrations(adapter, migrations, { approveDestructive = false, resume = null } = {}) {
  await adapter.lock();
  try {
    const journal = await adapter.journal();
    for (const old of journal) {
      const current = migrations.find((m) => m.id === old.id);
      if (!current || current.checksum !== old.checksum) throw new Error(`Applied migration changed or disappeared: ${old.id}`);
      if (old.status !== 'applied' && (resume !== old.id || current.idempotent !== true)) throw new Error(`Unfinished migration ${old.id}; inspect partial DDL before explicit idempotent resume`);
    }
    for (const m of migrations) {
      if (journal.some((old) => old.id === m.id && old.status === 'applied')) continue;
      if (m.safety === 'destructive' && !approveDestructive) throw new Error(`Separate destructive approval required: ${m.id}`);
      await adapter.record(m, 'running');
      try {
        for (const statement of m.statements) await adapter.execute(statement);
        await adapter.record(m, 'applied');
      } catch (error) {
        await adapter.record(m, 'failed');
        throw new Error(`Migration ${m.id} failed; stop release and inspect database before retry`, { cause: error });
      }
    }
  } finally { await adapter.unlock(); }
}