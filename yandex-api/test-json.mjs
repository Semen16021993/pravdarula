import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";

const driver = new Driver(process.env.YDB_CONNECTION_STRING, {
  credentialsProvider: new AccessTokenCredentialsProvider({ token: process.env.YDB_ACCESS_TOKEN }),
});
const userId = "migration-json-test";
try {
  await driver.ready();
  const sql = query(driver);
  await sql`UPSERT INTO cabinets (user_id, form, purchases, updated_at)
    VALUES (${userId}, CAST(${JSON.stringify({ fio: "Тест", phone: "+7" })} AS JsonDocument), CAST(${JSON.stringify([{ mode: "single", stage: 1, docs: ["test"], at: new Date().toISOString() }])} AS JsonDocument), CurrentUtcTimestamp())`;
  const rows = await sql`SELECT form, purchases, updated_at FROM cabinets WHERE user_id = ${userId}`;
  console.log(JSON.stringify(rows, (_k, v) => typeof v === "bigint" ? v.toString() : v));
  await sql`DELETE FROM cabinets WHERE user_id = ${userId}`;
} finally {
  await driver.close();
}
