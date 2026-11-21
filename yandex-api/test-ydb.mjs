import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";

const driver = new Driver(process.env.YDB_CONNECTION_STRING, {
  credentialsProvider: new AccessTokenCredentialsProvider({ token: process.env.YDB_ACCESS_TOKEN }),
});
try {
  await driver.ready();
  const sql = query(driver);
  const ping = await sql`SELECT 1 AS ok`;
  const tables = await sql`SELECT COUNT(*) AS count FROM cabinets`;
  console.log(JSON.stringify({ ping, cabinetsCount: tables }, (_k, v) => typeof v === 'bigint' ? v.toString() : v));
} finally {
  await driver.close();
}
