import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type { FormData } from "./docgen";
import type { Mode, Stage } from "./catalog";

export interface Purchase { mode: Mode; stage: Stage; docs: string[]; at: string }
export interface Cabinet { form: Partial<FormData>; purchases: Purchase[] }

export async function loadCabinet(userId: string): Promise<Cabinet> {
  const { data } = await supabase.from("cabinets").select("form, purchases").eq("user_id", userId).maybeSingle();
  return { form: (data?.form ?? {}) as Partial<FormData>, purchases: (data?.purchases ?? []) as unknown as Purchase[] };
}

export async function saveForm(userId: string, form: FormData) {
  await supabase.from("cabinets").upsert({ user_id: userId, form: form as unknown as Json, updated_at: new Date().toISOString() });
}

export async function addPurchase(userId: string, p: Purchase) {
  const cur = await loadCabinet(userId);
  const purchases = [...cur.purchases, p];
  await supabase.from("cabinets").upsert({ user_id: userId, purchases: purchases as unknown as Json, updated_at: new Date().toISOString() });
  return purchases;
}
