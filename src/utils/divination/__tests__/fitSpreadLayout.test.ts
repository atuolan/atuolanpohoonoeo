import { describe, expect, it } from "vitest";
import type { SpreadCoords } from "@/types/divination";
import { buildFlexiblePositions } from "../flexibleSpread";
import { findOverlaps, fitSpreadLayout, type SpreadLayout } from "../fitSpreadLayout";

const LABEL_H = 14;
const box = { width: 328, height: 300 };

function inBounds(l: SpreadLayout, b: { width: number; height: number }) {
  return l.slots.every((s) => {
    const rot = s.rotate % 180 !== 0;
    const fw = rot ? l.cardH : l.cardW;
    const fh = (rot ? l.cardW : l.cardH) + LABEL_H;
    return (
      s.left - fw / 2 >= -0.5 &&
      s.left + fw / 2 <= b.width + 0.5 &&
      s.top - fh / 2 >= -0.5 &&
      s.top + fh / 2 <= b.height + 0.5
    );
  });
}

function expectFits(coords: SpreadCoords[], b: { width: number; height: number }) {
  const l = fitSpreadLayout(coords, b);
  expect(l.cardH).toBeGreaterThanOrEqual(40);
  expect(findOverlaps(l, coords)).toEqual([]);
  expect(inBounds(l, b)).toBe(true);
}

describe("fitSpreadLayout", () => {
  it("單張置中且不超過 200 高", () => {
    const l = fitSpreadLayout([{ x: 50, y: 50 }], { width: 400, height: 800 });
    expect(l.cardH).toBe(200);
    expect(l.slots[0]).toMatchObject({ left: 200, top: 400, rotate: 0 });
  });

  it("一排三張會攤滿寬度且不重疊", () => {
    const c = [
      { x: 20, y: 50 },
      { x: 50, y: 50 },
      { x: 80, y: 50 },
    ];
    const l = fitSpreadLayout(c, box);
    expect(findOverlaps(l, c)).toEqual([]);
    expect(inBounds(l, box)).toBe(true);
    expect(l.cardH).toBeGreaterThan(120);
  });

  it("座標相同的第二張自動橫放、不算重疊", () => {
    const c = [
      { x: 30, y: 50 },
      { x: 30, y: 50 },
      { x: 80, y: 50 },
    ];
    const l = fitSpreadLayout(c, box);
    expect(l.slots[1].rotate).toBe(90);
    expect(findOverlaps(l, c)).toEqual([]);
  });

  it("空間很多時不會把牌撐到四角，排與排之間保持緊湊並置中", () => {
    const c = buildFlexiblePositions(10).map((p) => p.coords);
    const tall = { width: 358, height: 900 };
    const l = fitSpreadLayout(c, tall);
    const rowGap = l.slots[5].top - l.slots[0].top;
    expect(rowGap).toBeLessThanOrEqual((l.cardH + LABEL_H) * 1.6);
    const midY = (l.slots[0].top + l.slots[9].top) / 2;
    expect(Math.abs(midY - tall.height / 2)).toBeLessThan(1);
    expect(findOverlaps(l, c)).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("萬能牌陣 %i 張在小螢幕放得下", (n) => {
    expectFits(
      buildFlexiblePositions(n).map((p) => p.coords),
      box,
    );
  });
});
