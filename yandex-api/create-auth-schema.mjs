import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";

const driver = new Driver(process.env.YDB_CONNECTION_STRING, {
  credentialsProvider: new AccessTokenCredentialsProvider({ token: process.env.YDB_ACCESS_TOKEN }),
});
try {
  await driver.ready();
  const sql = query(driver);
  await sql`CREATE TABLE IF NOT EXISTS users (
    email Utf8 NOT NULL,
    user_id Utf8 NOT NULL,
    created_at Timestamp NOT NULL,
    PRIMARY KEY (email)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_codes (
    email Utf8 NOT NULL,
    code_hash Utf8 NOT NULL,
    expires_at Timestamp NOT NULL,
    attempts Uint32 NOT NULL,
    sent_at Timestamp NOT NULL,
    PRIMARY KEY (email)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash Utf8 NOT NULL,
    user_id Utf8 NOT NULL,
    email Utf8 NOT NULL,
    expires_at Timestamp NOT NULL,
    created_at Timestamp NOT NULL,
    PRIMARY KEY (token_hash)
  )`;
  console.log("Auth schema ready");
} finally {
  await driver.close();
}
