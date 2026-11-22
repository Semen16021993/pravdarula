import { complexDocs, type Mode, type Stage } from "./catalog";
import type { FormData } from "./docgen";
import type { Cabinet, Purchase } from "./cabinet";

const KEY = "pravo-rulya-preview-cabinet-v1";
export const PREVIEW_USER = { id: "preview-demo-user", email: "demo@example.test" };
export const demoForm: FormData = {
  fio: "Иванов Иван Иванович", phone: "+7 (900) 123-45-67", email: PREVIEW_USER.email,
  address: "125009, г. Москва, ул. Тверская, д. 1, кв. 10", birthYear: "1985",
  carNumber: "А123БВ777", accidentDate: "2026-10-05", accidentPlace: "г. Москва, ул. Ленина, 5, парковка ТЦ",
  accidentTime: "18:30", victim: "Петров Пётр Петрович",
  gibddName: "ОГИБДД ОМВД России по району Арбат г. Москвы", gibddAddress: "119019, г. Москва, ул. Воздвиженка, д. 10",
  courtName: "Тверской районный суд г. Москвы", courtAddress: "125009, г. Москва, ул. Тверская, д. 7",
  passport: "4500 123456, выдан ОМВД России по району Арбат г. Москвы 10.03.2010",
};

export function loadPreviewCabinet(): Cabinet {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Cabinet;
      if (Array.isArray(stored.purchases) && stored.form) return stored;
    }
  } catch { /* Demo storage is optional. */ }
  return {
    form: { ...demoForm, email: "demo@example.test" },
    purchases: [
      { mode: "complex", stage: 1, docs: complexDocs(1), at: "2026-11-20T10:00:00Z", orderId: "demo-complex" },
      { mode: "single", stage: 3, docs: complexDocs(3).slice(0, 2), at: "2026-11-21T10:00:00Z", orderId: "demo-single" },
    ],
  };
}

export function savePreviewCabinet(cabinet: Cabinet): void {
  try { localStorage.setItem(KEY, JSON.stringify(cabinet)); } catch { /* Demo storage is optional. */ }
}

export function previewPurchase(mode: Mode, stage: Stage, docs: string[]): Purchase {
  return { mode, stage, docs: [...docs], at: new Date().toISOString(), orderId: `demo-${crypto.randomUUID()}` };
}