import { describe, expect, it } from "vitest";
import type { DeckSpread } from "@/types/divination";
import { buildFlexiblePositions, flexibleRows, resolveSpread } from "../flexibleSpread";

describe("flexibleSpread", () => {
  it("排列規則", () => {
    expect(flexibleRows(1)).toEqual([1]);
    expect(flexibleRows(3)).toEqual([3]);
    expect(flexibleRows(4)).toEqual([2, 2]);
    expect(flexibleRows(5)).toEqual([3, 2]);
    expect(flexibleRows(6)).toEqual([3, 3]);
    expect(flexibleRows(7)).toEqual([4, 3]);
    expect(flexibleRows(8)).toEqual([4, 4]);
    expect(flexibleRows(9)).toEqual([3, 3, 3]);
    expect(flexibleRows(10)).toEqual([5, 5]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("%i 張的牌位", (n) => {
    const ps = buildFlexiblePositions(n);
    expect(ps).toHaveLength(n);
    expect(ps[0].name).toBe("第 1 張");
    expect(ps[n - 1].name).toBe(`第 ${n} 張`);
    for (const p of ps) {
      expect(p.coords.x).toBeGreaterThanOrEqual(0);
      expect(p.coords.x).toBeLessThanOrEqual(100);
      expect(p.coords.y).toBeGreaterThanOrEqual(0);
      expect(p.coords.y).toBeLessThanOrEqual(100);
    }
    expect(new Set(ps.map((p) => `${p.coords.x},${p.coords.y}`)).size).toBe(n);
  });

  it("resolveSpread 只處理 flexible 且夾在範圍內", () => {
    const base: DeckSpread = {
      id: "u",
      name: "萬能",
      description: "",
      category: "萬用",
      tags: [],
      positions: [],
      flexible: { min: 1, max: 10 },
    };
    expect(resolveSpread(base, 12).positions).toHaveLength(10);
    expect(resolveSpread(base, 0).positions).toHaveLength(1);
    const fixed: DeckSpread = { ...base, flexible: undefined, positions: buildFlexiblePositions(2) };
    expect(resolveSpread(fixed, 5)).toBe(fixed);
  });
});
