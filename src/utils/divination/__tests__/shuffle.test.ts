import { describe, expect, it } from "vitest";
import { shuffleDeck } from "../shuffle";

describe("shuffleDeck", () => {
  it("回傳 0..size-1 的排列", () => {
    const r = shuffleDeck(78, true);
    expect(r).toHaveLength(78);
    expect(new Set(r.map((e) => e.cardIndex)).size).toBe(78);
    expect(Math.max(...r.map((e) => e.cardIndex))).toBe(77);
  });

  it("沒有逆位的牌組不會出現逆位", () => {
    expect(shuffleDeck(36, false).every((e) => !e.reversed)).toBe(true);
  });

  it("使用注入的亂數", () => {
    const r = shuffleDeck(3, true, () => 0.99);
    expect(r.every((e) => e.reversed)).toBe(true);
  });
});
