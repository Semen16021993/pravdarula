import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { handler } = require("./dist/index.js");
const result = await handler(
  { url: "/api/health", path: "/api/health", httpMethod: "GET", headers: {} },
  { token: process.env.YDB_ACCESS_TOKEN },
);
console.log(result.statusCode, result.body);
