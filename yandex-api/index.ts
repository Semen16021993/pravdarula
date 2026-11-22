import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { Driver } from "@ydbjs/core";
import { AccessTokenCredentialsProvider } from "@ydbjs/auth/access-token";
import { query } from "@ydbjs/query";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { priceOrder, type Mode, type Stage } from "../src/lib/catalog";

type GatewayEvent = {
  url?: string;
  path?: string;
  httpMethod?: string;
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  queryStringParameters?: Record<string, string | undefined> | null;
  requestContext?: { identity?: { sourceIp?: string }; httpMethod?: string };
};
type GatewayContext = { token?: string | { access_token?: string; expires_in?: number; token_type?: string }; requestId?: string };
type Sql = ReturnType<typeof query>;
type Session = { userId: string; email: string };
type ApiError = Error & { statusCode: number };

const COOKIE_NAME = "pravo_session";
const SESSION_DAYS = 30;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_RESEND_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const PAY_ITEM_TITLE =
  "Комплект юридических документов для защиты по административному правонарушению";

function httpError(statusCode: number, message: string): ApiError {
  return Object.assign(new Error(message), { statusCode });
}

function json(statusCode: number, data: unknown, headers: Record<string, string> = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
    isBase64Encoded: false,
    body: JSON.stringify(data),
  };
}

function header(event: GatewayEvent, name: string): string {
  const target = name.toLowerCase();
  const entry = Object.entries(event.headers ?? {}).find(([key]) => key.toLowerCase() === target);
  return entry?.[1] ?? "";
}

function requestPath(event: GatewayEvent): string {
  const raw = event.url || event.path || "/";
  try {
    return new URL(raw, "https://gateway.invalid").pathname;
  } catch {
    return "/";
  }
}

function requestMethod(event: GatewayEvent): string {
  return (event.httpMethod || event.requestContext?.httpMethod || "GET").toUpperCase();
}

function requestBody(event: GatewayEvent): Record<string, unknown> {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw httpError(400, "Некорректный формат запроса.");
  }
}

function firstRow<T = Record<string, unknown>>(result: unknown): T | null {
  const sets = result as T[][] | undefined;
  return sets?.[0]?.[0] ?? null;
}

function rows<T = Record<string, unknown>>(result: unknown): T[] {
  const sets = result as T[][] | undefined;
  return sets?.[0] ?? [];
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codeDigest(email: string, code: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not configured");
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function safeHexEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(a) || !/^[0-9a-f]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

function parseCookies(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function sessionCookie(token: string, maxAge: number): string {
  const secure = new URL(process.env.APP_BASE_URL || "https://pravdarula.ru").protocol === "https:";
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

function clearSessionCookie(): string {
  return sessionCookie("", 0);
}

function assertAllowedOrigin(event: GatewayEvent): void {
  const origin = header(event, "origin");
  if (!origin) return;
  const base = process.env.APP_BASE_URL || "https://pravdarula.ru";
  const configured = process.env.APP_ORIGINS
    ? process.env.APP_ORIGINS.split(",").map((item) => item.trim()).filter(Boolean)
    : [base];
  const previewOrigin = process.env.APP_PREVIEW_ORIGIN?.trim();
  if (previewOrigin) configured.push(previewOrigin);
  if (base === "https://pravdarula.ru") configured.push("https://www.pravdarula.ru");
  if (!configured.includes(origin)) throw httpError(403, "Запрос отклонён.");
}

async function openDatabase(token: string) {
  const connectionString = process.env.YDB_CONNECTION_STRING;
  if (!connectionString) throw new Error("YDB_CONNECTION_STRING is not configured");
  const driver = new Driver(connectionString, {
    credentialsProvider: new AccessTokenCredentialsProvider({ token }),
  });
  await driver.ready();
  return { driver, sql: query(driver) };
}

async function withDatabase<T>(token: string, callback: (sql: Sql) => Promise<T>): Promise<T> {
  const { driver, sql } = await openDatabase(token);
  try {
    return await callback(sql);
  } finally {
    await driver.close();
  }
}

function requireToken(context: GatewayContext): string {
  const runtimeToken = context?.token;
  const token = typeof runtimeToken === "string"
    ? runtimeToken
    : runtimeToken?.access_token || process.env.YDB_ACCESS_TOKEN;
  if (!token) throw new Error("Cloud Function service-account token is unavailable");
  return token;
}

async function getSession(sql: Sql, event: GatewayEvent): Promise<Session | null> {
  const rawCookie = header(event, "cookie");
  const token = parseCookies(rawCookie)[COOKIE_NAME];
  if (!token || token.length < 40 || token.length > 200) return null;
  const tokenHash = sha256(token);
  const row = firstRow<{ user_id: string; email: string }>(
    await sql`SELECT user_id, email FROM auth_sessions
      WHERE token_hash = ${tokenHash} AND expires_at > CurrentUtcTimestamp()`,
  );
  return row ? { userId: row.user_id, email: row.email } : null;
}

async function sendLoginCode(token: string, email: string, code: string): Promise<void> {
  const from = process.env.POSTBOX_FROM_EMAIL || "no-reply@auth.pravdarula.ru";
  const subject = "Код для входа в Право Руля";
  const textBody =
    `Ваш код для входа в личный кабинет «Право Руля»: ${code}\n\nКод действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.`;
  const htmlBody = `<!doctype html><html lang="ru"><body style="margin:0;background:#f5f6f8;padding:32px 16px;font-family:Arial,sans-serif;color:#1f2937"><div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px"><div style="font-size:22px;font-weight:700">Право Руля</div><p style="font-size:15px;line-height:1.6">Код для входа в личный кабинет:</p><div style="margin:24px 0;padding:18px;background:#f3f4f6;border-radius:12px;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700">${code}</div><p style="font-size:13px;color:#6b7280;line-height:1.6">Код действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.</p></div></body></html>`;
  const response = await fetch("https://postbox.cloud.yandex.net/v2/email/outbound-emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YaCloud-SubjectToken": token,
    },
    body: JSON.stringify({
      FromEmailAddress: from,
      Destination: { ToAddresses: [email] },
      Content: {
        Simple: {
          Subject: { Data: subject, Charset: "UTF-8" },
          Body: {
            Text: { Data: textBody, Charset: "UTF-8" },
            Html: { Data: htmlBody, Charset: "UTF-8" },
          },
        },
      },
    }),
  });
  if (!response.ok) {
    const details = (await response.text().catch(() => "")).slice(0, 300);
    console.error("Yandex Postbox send failed", response.status, details);
    throw httpError(502, "Не удалось отправить код. Попробуйте ещё раз позже.");
  }
}

async function requestLoginCode(sql: Sql, token: string, event: GatewayEvent) {
  assertAllowedOrigin(event);
  const body = requestBody(event);
  const email = String(body.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Укажите корректный адрес электронной почты.");
  }

  const existing = firstRow<{ sent_at: string }>(
    await sql`SELECT sent_at FROM auth_codes WHERE email = ${email}`,
  );
  if (existing && Date.now() - new Date(existing.sent_at).getTime() < CODE_RESEND_MS) {
    throw httpError(429, "Новый код можно запросить через минуту.");
  }

  const code = String(randomInt(100000, 1000000));
  const now = new Date();
  const expires = new Date(now.getTime() + CODE_TTL_MS);
  await sql`UPSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at)
    VALUES (${email}, ${codeDigest(email, code)}, ${expires}, 0, ${now})`;

  try {
    await sendLoginCode(token, email, code);
  } catch (error) {
    await sql`DELETE FROM auth_codes WHERE email = ${email}`.catch(() => undefined);
    throw error;
  }
  return json(200, { ok: true });
}

async function verifyLoginCode(sql: Sql, event: GatewayEvent) {
  assertAllowedOrigin(event);
  const body = requestBody(event);
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code)) {
    throw httpError(400, "Проверьте адрес почты и код из письма.");
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const sessionHash = sha256(sessionToken);
  const result = await sql.begin(async (tx) => {
    const row = firstRow<{ code_hash: string; expires_at: string; attempts: number | bigint; sent_at: string }>(
      await tx`SELECT code_hash, expires_at, attempts, sent_at FROM auth_codes WHERE email = ${email}`,
    );
    if (!row) return { ok: false as const, message: "Код неверный или устарел. Запросите новый." };

    const attempts = Number(row.attempts);
    if (attempts >= MAX_CODE_ATTEMPTS || new Date(row.expires_at).getTime() <= Date.now()) {
      await tx`DELETE FROM auth_codes WHERE email = ${email}`;
      return { ok: false as const, message: "Код неверный или устарел. Запросите новый." };
    }

    if (!safeHexEqual(row.code_hash, codeDigest(email, code))) {
      await tx`UPSERT INTO auth_codes (email, code_hash, expires_at, attempts, sent_at)
        VALUES (${email}, ${row.code_hash}, ${new Date(row.expires_at)}, ${attempts + 1}, ${new Date(row.sent_at)})`;
      return { ok: false as const, message: "Код неверный или устарел. Запросите новый." };
    }

    const existingUser = firstRow<{ user_id: string }>(
      await tx`SELECT user_id FROM users WHERE email = ${email}`,
    );
    const userId = existingUser?.user_id || sha256(email);
    if (!existingUser) {
      await tx`UPSERT INTO users (email, user_id, created_at)
        VALUES (${email}, ${userId}, CurrentUtcTimestamp())`;
    }

    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await tx`UPSERT INTO auth_sessions (token_hash, user_id, email, expires_at, created_at)
      VALUES (${sessionHash}, ${userId}, ${email}, ${expiresAt}, CurrentUtcTimestamp())`;
    await tx`DELETE FROM auth_codes WHERE email = ${email}`;
    return { ok: true as const, userId, email };
  });

  if (!result.ok) throw httpError(400, result.message);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return json(
    200,
    { user: { id: result.userId, email: result.email } },
    { "Set-Cookie": sessionCookie(sessionToken, maxAge) },
  );
}

async function logout(sql: Sql, event: GatewayEvent) {
  assertAllowedOrigin(event);
  const token = parseCookies(header(event, "cookie"))[COOKIE_NAME];
  if (token) await sql`DELETE FROM auth_sessions WHERE token_hash = ${sha256(token)}`;
  return json(200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
}

async function getCabinet(sql: Sql, session: Session) {
  const row = firstRow<{ form: unknown; purchases: unknown }>(
    await sql`SELECT form, purchases FROM cabinets WHERE user_id = ${session.userId}`,
  );
  return json(200, {
    form: parseJsonValue(row?.form, {}),
    purchases: parseJsonValue(row?.purchases, []),
  });
}

async function saveCabinetForm(sql: Sql, event: GatewayEvent, session: Session) {
  assertAllowedOrigin(event);
  const body = requestBody(event);
  const form = body.form;
  if (!form || typeof form !== "object" || Array.isArray(form)) {
    throw httpError(400, "Анкета заполнена некорректно.");
  }
  const serialized = JSON.stringify(form);
  if (serialized.length > 50_000) throw httpError(413, "Слишком большой объём данных анкеты.");

  const existing = firstRow<{ purchases: unknown }>(
    await sql`SELECT purchases FROM cabinets WHERE user_id = ${session.userId}`,
  );
  const purchases = parseJsonValue(existing?.purchases, []);
  await sql`UPSERT INTO cabinets (user_id, form, purchases, updated_at)
    VALUES (${session.userId}, CAST(${serialized} AS JsonDocument),
      CAST(${JSON.stringify(purchases)} AS JsonDocument), CurrentUtcTimestamp())`;
  return json(200, { ok: true });
}

function payBaseUrl(): string {
  return process.env.YANDEX_PAY_ENV === "live"
    ? "https://pay.yandex.ru"
    : "https://sandbox.pay.yandex.ru";
}

function getPayApiKey(): string | undefined {
  return process.env.YANDEX_PAY_ENV === "live"
    ? process.env.YANDEX_PAY_API_KEY
    : process.env.YANDEX_PAY_SANDBOX_API_KEY || process.env.YANDEX_PAY_API_KEY;
}

function payHeaders() {
  const key = getPayApiKey();
  if (!key) throw httpError(503, "Оплата временно не настроена. Свяжитесь с поддержкой.");
  return {
    Authorization: `Api-Key ${key}`,
    "Content-Type": "application/json",
    "X-Request-Id": randomUUID(),
    "X-Request-Timeout": "10000",
  };
}

async function createYandexOrder(input: {
  id: string;
  mode: Mode;
  stage: Stage;
  docs: string[];
  amount: number;
}) {
  const origin = (process.env.APP_BASE_URL || "https://pravdarula.ru").replace(/\/$/, "");
  const items = [{
    productId: input.mode === "complex" ? `complex-${input.stage}` : "documents",
    title: PAY_ITEM_TITLE,
    quantity: { count: "1" },
    total: (input.amount / 100).toFixed(2),
  }];
  const response = await fetch(`${payBaseUrl()}/api/merchant/v1/orders`, {
    method: "POST",
    headers: payHeaders(),
    body: JSON.stringify({
      orderId: input.id,
      currencyCode: "RUB",
      availablePaymentMethods: ["CARD", "SPLIT"],
      cart: { items, total: { amount: (input.amount / 100).toFixed(2) } },
      redirectUrls: {
        onSuccess: `${origin}/?order=${input.id}`,
        onError: `${origin}/?order=${input.id}&fail=1`,
        onAbort: `${origin}/?order=${input.id}&fail=1`,
      },
      ttl: 1800,
    }),
  });
  const data = await response.json().catch(() => ({})) as {
    data?: { paymentUrl?: string };
    reasonCode?: string;
    reason?: string;
  };
  if (!response.ok || !data.data?.paymentUrl) {
    console.error("Yandex Pay order creation failed", response.status, data.reasonCode, data.reason);
    throw httpError(502, "Не удалось создать платёж. Попробуйте ещё раз.");
  }
  return data.data.paymentUrl;
}

async function createPayment(sql: Sql, event: GatewayEvent, session: Session) {
  assertAllowedOrigin(event);
  const body = requestBody(event);
  const mode = body.mode;
  const stage = Number(body.stage);
  const docs = Array.isArray(body.docs) ? body.docs.map((item) => String(item)) : [];
  if ((mode !== "single" && mode !== "complex") || ![1, 2, 3].includes(stage)) {
    throw httpError(400, "Проверьте выбранный режим и стадию дела.");
  }
  if (docs.length > 30 || docs.some((id) => id.length > 60)) {
    throw httpError(400, "Некорректный список документов.");
  }
  const priced = priceOrder(mode as Mode, stage as Stage, docs);
  if (!priced.docs.length || priced.amount <= 0) throw httpError(400, "Корзина пуста.");
  if (!getPayApiKey()) {
    throw httpError(503, "Оплата временно не настроена. Свяжитесь с поддержкой.");
  }

  const orderId = randomUUID();
  const amountKopecks = Math.round(priced.amount * 100);
  await sql`UPSERT INTO orders
    (id, user_id, mode, stage, docs, amount_kopecks, status, created_at)
    VALUES (${orderId}, ${session.userId}, ${mode}, CAST(${stage} AS Uint32),
      CAST(${JSON.stringify(priced.docs)} AS JsonDocument),
      CAST(${amountKopecks} AS Uint64), "pending", CurrentUtcTimestamp())`;

  const paymentUrl = await createYandexOrder({
    id: orderId,
    mode: mode as Mode,
    stage: stage as Stage,
    docs: priced.docs,
    amount: amountKopecks,
  });
  return json(200, { paymentUrl, orderId });
}

async function getYandexPaymentStatus(orderId: string): Promise<string | null> {
  const response = await fetch(
    `${payBaseUrl()}/api/merchant/v1/orders/${encodeURIComponent(orderId)}`,
    { headers: payHeaders() },
  );
  if (!response.ok) {
    console.error("Yandex Pay status request failed", response.status);
    return null;
  }
  const body = await response.json().catch(() => ({})) as {
    data?: { order?: { paymentStatus?: string } };
  };
  return body.data?.order?.paymentStatus ?? null;
}

async function confirmOrder(sql: Sql, orderId: string): Promise<"paid" | "pending" | "failed"> {
  const order = firstRow<{ id: string; user_id: string; mode: string; stage: number | bigint; docs: unknown; status: string }>(
    await sql`SELECT id, user_id, mode, stage, docs, status FROM orders WHERE id = ${orderId}`,
  );
  if (!order) return "failed";
  if (order.status === "paid") return "paid";
  if (order.status !== "pending") return "failed";

  const paymentStatus = await getYandexPaymentStatus(orderId);
  if (paymentStatus === "CAPTURED" || paymentStatus === "AUTHORIZED") {
    await sql.begin(async (tx) => {
      const fresh = firstRow<{ user_id: string; mode: string; stage: number | bigint; docs: unknown; status: string }>(
        await tx`SELECT user_id, mode, stage, docs, status FROM orders WHERE id = ${orderId}`,
      );
      if (!fresh || fresh.status === "paid" || fresh.status !== "pending") return;

      const cabinet = firstRow<{ form: unknown; purchases: unknown }>(
        await tx`SELECT form, purchases FROM cabinets WHERE user_id = ${fresh.user_id}`,
      );
      const form = parseJsonValue(cabinet?.form, {});
      const purchases = parseJsonValue<Array<Record<string, unknown>>>(cabinet?.purchases, []);
      if (!purchases.some((item) => item.orderId === orderId)) {
        purchases.push({
          mode: fresh.mode,
          stage: Number(fresh.stage),
          docs: parseJsonValue(fresh.docs, []),
          at: new Date().toISOString(),
          orderId,
        });
      }
      await tx`UPSERT INTO cabinets (user_id, form, purchases, updated_at)
        VALUES (${fresh.user_id}, CAST(${JSON.stringify(form)} AS JsonDocument),
          CAST(${JSON.stringify(purchases)} AS JsonDocument), CurrentUtcTimestamp())`;
      await tx`UPDATE orders SET status = "paid", paid_at = CurrentUtcTimestamp()
        WHERE id = ${orderId} AND status = "pending"`;
    });
    return "paid";
  }

  if (paymentStatus === "FAILED" || paymentStatus === "VOIDED" || paymentStatus === "REFUNDED") {
    await sql`UPDATE orders SET status = "failed"
      WHERE id = ${orderId} AND status = "pending"`;
    return "failed";
  }
  return "pending";
}

async function checkPayment(sql: Sql, event: GatewayEvent, session: Session) {
  assertAllowedOrigin(event);
  const body = requestBody(event);
  const orderId = String(body.orderId || "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw httpError(400, "Некорректный номер заказа.");
  const order = firstRow<{ user_id: string; mode: string; stage: number | bigint; docs: unknown }>(
    await sql`SELECT user_id, mode, stage, docs FROM orders WHERE id = ${orderId}`,
  );
  if (!order || order.user_id !== session.userId) {
    return json(200, { status: "failed", mode: null, stage: null, docs: [] });
  }
  const status = await confirmOrder(sql, orderId);
  return json(200, {
    status,
    mode: order.mode,
    stage: Number(order.stage),
    docs: parseJsonValue(order.docs, []),
  });
}

let cachedPayJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedPayJwksUrl = "";

async function verifyYandexWebhook(body: string): Promise<string | null> {
  const jwt = body.trim();
  if (!jwt || jwt.length > 20_000) throw httpError(400, "Некорректное уведомление.");
  try {
    const jwksUrl = `${payBaseUrl()}/api/jwks`;
    if (!cachedPayJwks || cachedPayJwksUrl !== jwksUrl) {
      cachedPayJwks = createRemoteJWKSet(new URL(jwksUrl));
      cachedPayJwksUrl = jwksUrl;
    }
    const { payload } = await jwtVerify(jwt, cachedPayJwks, { algorithms: ["ES256"] });
    const expectedMerchantId = process.env.YANDEX_PAY_MERCHANT_ID;
    if (expectedMerchantId && payload.merchantId !== expectedMerchantId) {
      throw httpError(401, "Уведомление относится к другому магазину.");
    }
    const orderId = (payload as Record<string, any>)?.order?.orderId
      ?? (payload as Record<string, any>)?.orderId;
    return typeof orderId === "string" && /^[0-9a-f-]{36}$/i.test(orderId) ? orderId : null;
  } catch (error) {
    if (Number((error as ApiError)?.statusCode)) throw error;
    console.warn("Yandex Pay webhook signature verification failed");
    throw httpError(401, "Не удалось проверить подпись уведомления.");
  }
}

async function route(sql: Sql, token: string, event: GatewayEvent) {
  const method = requestMethod(event);
  const path = requestPath(event);

  if (method === "GET" && path === "/api/health") {
    await sql`SELECT 1 AS ok`;
    return json(200, { ok: true, database: "connected" });
  }

  if (method === "POST" && path === "/api/auth/request-code") {
    return requestLoginCode(sql, token, event);
  }
  if (method === "POST" && path === "/api/auth/verify-code") {
    return verifyLoginCode(sql, event);
  }
  if (method === "GET" && path === "/api/auth/me") {
    const session = await getSession(sql, event);
    return json(200, { user: session ? { id: session.userId, email: session.email } : null });
  }
  if (method === "POST" && path === "/api/auth/logout") {
    return logout(sql, event);
  }

  if (method === "GET" && path === "/api/cabinet") {
    const session = await getSession(sql, event);
    if (!session) throw httpError(401, "Войдите в личный кабинет.");
    return getCabinet(sql, session);
  }
  if ((method === "PUT" || method === "POST") && path === "/api/cabinet/form") {
    const session = await getSession(sql, event);
    if (!session) throw httpError(401, "Войдите в личный кабинет.");
    return saveCabinetForm(sql, event, session);
  }

  if (method === "POST" && path === "/api/payments/create") {
    const session = await getSession(sql, event);
    if (!session) throw httpError(401, "Войдите в личный кабинет.");
    return createPayment(sql, event, session);
  }
  if (method === "POST" && path === "/api/payments/check") {
    const session = await getSession(sql, event);
    if (!session) throw httpError(401, "Войдите в личный кабинет.");
    return checkPayment(sql, event, session);
  }

  if (method === "POST" && (path === "/api/public/yandex-pay-webhook" || path === "/v1/webhook")) {
    const raw = event.body
      ? event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body
      : "";
    const orderId = await verifyYandexWebhook(raw);
    if (orderId) await confirmOrder(sql, orderId);
    return json(200, { status: "success" });
  }

  return json(404, { error: "Не найдено." });
}

export async function handler(event: GatewayEvent, context: GatewayContext) {
  try {
    const token = requireToken(context);
    return await withDatabase(token, (sql) => route(sql, token, event));
  } catch (error) {
    const statusCode = Number((error as ApiError)?.statusCode) || 500;
    if (statusCode >= 500) console.error("Pravdo Rulya API error", error);
    return json(statusCode, {
      error: statusCode >= 500
        ? "Сервис временно недоступен. Попробуйте ещё раз позже."
        : (error as Error).message,
    });
  }
}
