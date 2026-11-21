import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";
const driver = new Driver(process.env.YDB_CONNECTION_STRING, { credentialsProvider: new AccessTokenCredentialsProvider({ token: process.env.YDB_ACCESS_TOKEN }) });
try {
  await driver.ready();
  const sql = query(driver);
  const expires = new Date(Date.now() + 60_000);
  await sql`UPSERT INTO auth_sessions (token_hash, user_id, email, expires_at, created_at)
    VALUES ("timestamp-test", "test", "test@example.invalid", ${expires}, CurrentUtcTimestamp())`;
  const rows = await sql`SELECT expires_at FROM auth_sessions WHERE token_hash = "timestamp-test"`;
  console.log(JSON.stringify(rows));
  await sql`DELETE FROM auth_sessions WHERE token_hash = "timestamp-test"`;
} finally { await driver.close(); }
