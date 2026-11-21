import type { Mode, Stage } from "./catalog";

type CreatePaymentInput = {
  mode: Mode;
  stage: Stage;
  docs: string[];
};

type CheckPaymentResult = {
  status: "paid" | "pending" | "failed";
  mode: Mode | null;
  stage: Stage | null;
  docs: string[];
};

async function post<T>(path: string, data: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Не удалось выполнить запрос.");
  return result as T;
}

export async function createPayment({ data }: { data: CreatePaymentInput }) {
  return post<{ paymentUrl: string; orderId: string }>("/api/payments/create", data);
}

export async function checkPayment({ data }: { data: { orderId: string } }) {
  return post<CheckPaymentResult>("/api/payments/check", data);
}
