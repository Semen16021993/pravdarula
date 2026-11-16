import { describe, it, expect } from "vitest";
import { STAGE_DOCS, isRecommended, cartTotal } from "./catalog";

describe("каталог", () => {
  it("стадии 1 и 2 — по три позиции, стадия 3 — восемь судебных", () => {
    expect(STAGE_DOCS[1]).toHaveLength(3);
    expect(STAGE_DOCS[2]).toHaveLength(3);
    expect(STAGE_DOCS[3]).toHaveLength(8);
  });
  it("заявление об ознакомлении в ГИБДД — один шаблон на стадиях 1 и 2", () => {
    expect(STAGE_DOCS[1]).toContain("gibdd_familiarize");
    expect(STAGE_DOCS[2]).toContain("gibdd_familiarize");
  });
  it("ознакомление в суде рекомендуется только если материалов нет, но всегда в каталоге", () => {
    expect(isRecommended(3, "court_familiarize", false)).toBe(true);
    expect(isRecommended(3, "court_familiarize", true)).toBe(false);
    expect(STAGE_DOCS[3]).toContain("court_familiarize");
    expect(STAGE_DOCS[3]).toContain("attach_court");
  });
  it("корзина суммирует цены", () => {
    expect(cartTotal(["gibdd_familiarize", "receipt"])).toBe(990 + 790);
  });
});
