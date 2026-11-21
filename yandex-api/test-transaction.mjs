import { Driver } from "@ydbjs/core";
import { query } from "@ydbjs/query";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";
const driver = new Driver(process.env.YDB_CONNECTION_STRING, { credentialsProvider: new AccessTokenCredentialsProvider({ token: process.env.YDB_ACCESS_TOKEN }) });
try {
  await driver.ready();
  const sql = query(driver);
  const value = await sql.begin(async (tx) => {
    const rows = await tx`SELECT 1 AS ok`;
    return rows[0][0].ok;
  });
  console.log("transaction-ok", value);
} finally { await driver.close(); }
