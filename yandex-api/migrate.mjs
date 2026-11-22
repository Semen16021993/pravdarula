import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Driver } from '@ydbjs/core';
import { query, unsafe } from '@ydbjs/query';
import { AccessTokenCredentialsProvider } from '@ydbjs/auth/access-token';
import { applyMigrations, validateMigration, digest } from './migration-engine.mjs';

const directory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
const migrations = readdirSync(directory).filter((p) => /^\d{3,}_[a-z0-9_-]+\.json$/.test(p)).sort().map((p) => {
  const m = validateMigration(JSON.parse(readFileSync(join(directory, p), 'utf8')));
  if (p !== `${m.id}.json`) throw new Error('Migration filename and id disagree');
  return m;
});
const mode = process.argv[2] || 'check';
if (!['check', 'apply'].includes(mode)) throw new Error('Use check or apply');
if (!migrations.length) { console.log('No versioned migrations; database untouched.'); process.exit(0); }
if (!process.env.YDB_CONNECTION_STRING) throw new Error('YDB_CONNECTION_STRING required');
const token = process.env.YDB_ACCESS_TOKEN || execFileSync('yc', ['iam', 'create-token'], { encoding: 'utf8' }).trim();
const driver = new Driver(process.env.YDB_CONNECTION_STRING, { credentialsProvider: new AccessTokenCredentialsProvider({ token }) });
const baselineText = readFileSync(join(directory, 'baseline.json'), 'utf8');
const baseline = JSON.parse(baselineText);
const owner = randomUUID();
try {
  await driver.ready();
  const sql = query(driver);
  for (const [table, columns] of Object.entries(baseline.tables)) {
    if (!/^[a-z_]+$/.test(table) || columns.some((c) => !/^[a-z_]+$/.test(c))) throw new Error('Unsafe baseline identifier');
    await sql`${unsafe(`SELECT ${columns.join(', ')} FROM ${table} LIMIT 0`)}`;
  }
  let hasJournal = true;
  try { await sql`SELECT id FROM deployment_migrations LIMIT 0`; }
  catch (error) {
    if (!/path.*(not exist|does not exist)|table.*(not found|not exist)/i.test(String(error))) throw error;
    hasJournal = false;
  }
  if (!hasJournal && mode === 'check') {
    console.log('Baseline columns verified read-only. Review actual types/indexes before APPROVE_YDB_BASELINE=yes.');
  } else {
    if (!hasJournal) {
      if (process.env.APPROVE_YDB_BASELINE !== 'yes') throw new Error('Separate baseline approval required after reviewing actual schema');
      await sql`CREATE TABLE IF NOT EXISTS deployment_migrations (id Utf8 NOT NULL, checksum Utf8 NOT NULL, status Utf8 NOT NULL, updated_at Timestamp NOT NULL, PRIMARY KEY (id))`;
      await sql`CREATE TABLE IF NOT EXISTS deployment_locks (id Utf8 NOT NULL, owner Utf8 NOT NULL, PRIMARY KEY (id))`;
      // INSERT prevents concurrent initialization from overwriting an accepted baseline.
      await sql`INSERT INTO deployment_migrations (id, checksum, status, updated_at) VALUES ("_baseline", ${digest(baselineText)}, "applied", CurrentUtcTimestamp())`;
    }
    const accepted = await sql`SELECT checksum FROM deployment_migrations WHERE id = "_baseline"`;
    if (accepted[0]?.[0]?.checksum !== digest(baselineText)) throw new Error('Baseline checksum mismatch');
    const getJournal = async () => (await sql`SELECT id, checksum, status FROM deployment_migrations WHERE id != "_baseline"`)[0] || [];
    if (mode === 'check') {
      const rows = await getJournal();
      for (const row of rows) {
        const m = migrations.find((x) => x.id === row.id);
        if (!m || m.checksum !== row.checksum || (row.status !== 'applied' && process.env.RESUME_MIGRATION !== row.id)) throw new Error(`Migration requires review: ${row.id}`);
      }
      console.log(`${migrations.filter((m) => !rows.some((r) => r.id === m.id && r.status === 'applied')).length} migrations pending.`);
    } else {
      const adapter = {
        lock: async () => { await sql.begin(async (tx) => {
          const locks = await tx`SELECT owner FROM deployment_locks WHERE id = "release"`;
          if (locks[0]?.length) throw new Error('Migration lock held; inspect previous run before manual recovery');
          await tx`INSERT INTO deployment_locks (id, owner) VALUES ("release", ${owner})`;
        }); },
        unlock: async () => { await sql`DELETE FROM deployment_locks WHERE id = "release" AND owner = ${owner}`; },
        journal: getJournal,
        execute: async (statement) => { await sql`${unsafe(statement)}`; },
        record: async (m, status) => { await sql`UPSERT INTO deployment_migrations (id, checksum, status, updated_at) VALUES (${m.id}, ${m.checksum}, ${status}, CurrentUtcTimestamp())`; },
      };
      await applyMigrations(adapter, migrations, { approveDestructive: process.env.APPROVE_DESTRUCTIVE_MIGRATIONS === 'yes', resume: process.env.RESUME_MIGRATION || null });
      console.log(JSON.stringify(migrations.map((m) => ({ id: m.id, checksum: m.checksum }))));
    }
  }
} finally { await driver.close(); }