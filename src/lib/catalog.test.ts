import { describe, it, expect } from "vitest";
import { STAGE_DOCS, isRecommended, cartTotal, complexDocs, roadmapFrom } from "./catalog";

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
  it("комплекс покрывает стадии от текущей до конца", () => {
    expect(roadmapFrom(1).map((g) => g.stage)).toEqual([1, 2, 3]);
    expect(roadmapFrom(2).map((g) => g.stage)).toEqual([2, 3]);
    expect(roadmapFrom(3).map((g) => g.stage)).toEqual([3]);
    expect(complexDocs(1)).toEqual(expect.arrayContaining(["receipt", "postpone_court", "objections_kit"]));
    expect(complexDocs(2)).not.toContain("receipt");
    expect(complexDocs(2)).not.toContain("victim_requalify_gibdd");
    expect(complexDocs(2)).toContain("objections_kit");
    expect(complexDocs(3)).toEqual(complexDocs(3));
  });
});

import { priceOrder } from "./catalog";
describe("priceOrder", () => {
  it("комплекс стоит цену стадии", () => {
    expect(priceOrder("complex", 1, []).amount).toBe(3990);
    expect(priceOrder("complex", 3, ["x"]).amount).toBe(7990);
  });
  it("отбрасывает чужие и повторные документы", () => {
    const r = priceOrder("single", 1, ["gibdd_familiarize", "gibdd_familiarize", "fake"]);
    expect(r.docs).toEqual(["gibdd_familiarize"]);
    expect(r.amount).toBe(990);
  });
});
