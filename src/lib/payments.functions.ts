import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { priceOrder, type Stage } from "./catalog";

export const createPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    mode: z.enum(["single", "complex"]),
    stage: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    docs: z.array(z.string().max(60)).max(30),
    origin: z.string().url().max(200).refine((u) => /^https?:\/\//.test(u)),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { docs, amount } = priceOrder(data.mode, data.stage as Stage, data.docs);
    if (!docs.length || amount <= 0) throw new Error("Корзина пуста");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin.from("orders")
      .insert({ user_id: context.userId, mode: data.mode, stage: data.stage, docs, amount }).select("id").single();
    if (error || !order) throw new Error("Не удалось создать заказ");
    const { createYandexOrder } = await import("./yandex-pay.server");
    const origin = new URL(data.origin).origin;
    const paymentUrl = await createYandexOrder({ id: order.id, mode: data.mode, stage: data.stage as Stage, docs, amount, origin });
    return { paymentUrl };
  });

export const checkPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.from("orders").select("id, mode, stage, docs").eq("id", data.orderId).maybeSingle();
    if (!own) return { status: "failed" as const, mode: null, stage: null, docs: [] as string[] };
    const { confirmOrder } = await import("./yandex-pay.server");
    const status = await confirmOrder(own.id);
    return { status, mode: own.mode as "single" | "complex", stage: own.stage as Stage, docs: own.docs as string[] };
  });
