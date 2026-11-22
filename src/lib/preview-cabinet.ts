import { complexDocs, type Mode, type Stage } from "./catalog";
import { demoForm } from "./docgen";
import type { Cabinet, Purchase } from "./cabinet";

const KEY = "pravo-rulya-preview-cabinet-v1";

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