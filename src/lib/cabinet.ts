import type { FormData } from "./docgen";
import type { Mode, Stage } from "./catalog";

export interface Purchase {
  mode: Mode;
  stage: Stage;
  docs: string[];
  at: string;
  orderId?: string;
}

export interface Cabinet {
  form: Partial<FormData>;
  purchases: Purchase[];
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не удалось сохранить данные.");
  return data as T;
}

export async function loadCabinet(_userId?: string): Promise<Cabinet> {
  const data = await apiRequest<Cabinet>("/api/cabinet");
  return {
    form: data.form ?? {},
    purchases: Array.isArray(data.purchases) ? data.purchases : [],
  };
}

export async function saveForm(_userId: string, form: FormData) {
  await apiRequest<{ ok: boolean }>("/api/cabinet/form", {
    method: "PUT",
    body: JSON.stringify({ form }),
  });
}
