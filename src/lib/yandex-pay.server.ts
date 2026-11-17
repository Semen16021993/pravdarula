import { DOCS, COMPLEX_PRICE, STAGES, type Mode, type Stage } from "./catalog";

function base() {
  return process.env['YANDEX_PAY_ENV'] === "live" ? "https://pay.yandex.ru" : "https://sandbox.pay.yandex.ru";
}
function headers() {
  const key = process.env['YANDEX_PAY_API_KEY'];
  if (!key) throw new Error("Оплата ещё не настроена");
  return { Authorization: `Api-Key ${key}`, "Content-Type": "application/json", "X-Request-Id": crypto.randomUUID() };
}
const money = (n: number) => n.toFixed(2);

export async function createYandexOrder(o: { id: string; mode: Mode; stage: Stage; docs: string[]; amount: number; origin: string }) {
  const items = o.mode === "complex"
    ? [{ productId: `complex-${o.stage}`, title: `Комплект документов по ст. 12.27 КоАП, ${STAGES.find((s) => s.id === o.stage)?.short ?? `стадия ${o.stage}`}`.slice(0, 250), quantity: { count: "1" }, total: money(COMPLEX_PRICE[o.stage]) }]
    : o.docs.map((id) => ({ productId: id, title: DOCS[id]!.title.slice(0, 250), quantity: { count: "1" }, total: money(DOCS[id]!.price) }));
  const res = await fetch(`${base()}/api/merchant/v1/orders`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      orderId: o.id,
      currencyCode: "RUB",
      availablePaymentMethods: ["CARD", "SPLIT"],
      cart: { items, total: { amount: money(o.amount) } },
      redirectUrls: { onSuccess: `${o.origin}/?order=${o.id}`, onError: `${o.origin}/?order=${o.id}&fail=1`, onAbort: `${o.origin}/?order=${o.id}&fail=1` },
      ttl: 1800,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { paymentUrl?: string }; reasonCode?: string; reason?: string };
  if (!res.ok || !json.data?.paymentUrl) {
    console.error("Yandex Pay create order failed", res.status, json.reasonCode, json.reason);
    throw new Error("Не удалось создать платёж. Попробуйте ещё раз.");
  }
  return json.data.paymentUrl;
}

/** Статус оплаты из Яндекс Пэй — единственный источник истины. */
export async function getYandexPaymentStatus(orderId: string): Promise<string | null> {
  const res = await fetch(`${base()}/api/merchant/v1/orders/${encodeURIComponent(orderId)}`, { headers: headers() });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { data?: { order?: { paymentStatus?: string } } };
  return json.data?.order?.paymentStatus ?? null;
}

/** Проверяет заказ в Яндексе и, если оплачен, открывает документы в кабинете (однократно). */
export async function confirmOrder(orderId: string): Promise<"paid" | "pending" | "failed"> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return "failed";
  if (order.status === "paid") return "paid";
  const st = await getYandexPaymentStatus(orderId);
  if (st === "CAPTURED" || st === "AUTHORIZED") {
    const { data: upd } = await supabaseAdmin.from("orders").update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", orderId).eq("status", "pending").select("id");
    if (upd?.length) {
      const { data: cab } = await supabaseAdmin.from("cabinets").select("purchases").eq("user_id", order.user_id).maybeSingle();
      const purchases = [...((cab?.purchases as unknown[]) ?? []), { mode: order.mode, stage: order.stage, docs: order.docs, at: new Date().toISOString(), orderId }];
      await supabaseAdmin.from("cabinets").upsert({ user_id: order.user_id, purchases: purchases as never, updated_at: new Date().toISOString() });
    }
    return "paid";
  }
  if (st === "FAILED" || st === "VOIDED" || st === "REFUNDED") {
    await supabaseAdmin.from("orders").update({ status: "failed" }).eq("id", orderId).eq("status", "pending");
    return "failed";
  }
  return "pending";
}
