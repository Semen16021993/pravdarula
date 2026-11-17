import { createFileRoute } from "@tanstack/react-router";

// Уведомление Яндекс Пэй приходит как JWT. Содержимому не доверяем: берём только orderId
// и перепроверяем статус оплаты напрямую в API Яндекса с нашим ключом.
export const Route = createFileRoute("/api/public/yandex-pay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.text()).slice(0, 20000);
        let orderId: string | undefined;
        try {
          const part = body.trim().split(".")[1];
          const payload = part ? JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) : JSON.parse(body);
          orderId = payload?.order?.orderId ?? payload?.orderId;
        } catch { /* ignore */ }
        if (!orderId || !/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({ status: "success" });
        const { confirmOrder } = await import("@/lib/yandex-pay.server");
        await confirmOrder(orderId);
        return Response.json({ status: "success" });
      },
    },
  },
});
