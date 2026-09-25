import { describe, expect, it } from "vitest";
import type { ReadingRecord } from "@/types/divination";
import { resolveSpread } from "@/utils/divination/flexibleSpread";
import { findOverlaps, fitSpreadLayout } from "@/utils/divination/fitSpreadLayout";
import { deckOrder, decks } from "../index";

/** 牌陣區在各種手機上的可用尺寸（抽牌時較矮、翻牌時較高） */
const BOARD_SIZES = [
  { width: 328, height: 300 },
  { width: 343, height: 340 },
  { width: 358, height: 480 },
];

describe.each(deckOrder)("%s 牌組定義", (id) => {
  const deck = decks[id];

  it("卡數正確、id 不重複、都有圖和牌義", () => {
    expect(deck.cards).toHaveLength(deck.cardCount);
    expect(new Set(deck.cards.map((c) => c.id)).size).toBe(deck.cardCount);
    expect(deck.cards.every((c) => c.image && c.name && c.meaning.upright)).toBe(true);
  });

  it("每個牌陣都有分類與座標，且恰有一個萬能牌陣", () => {
    for (const s of deck.spreads) {
      expect(deck.categories).toContain(s.category);
      if (!s.flexible) expect(s.positions.length).toBeGreaterThan(0);
      expect(s.positions.every((p) => Number.isFinite(p.coords.x) && Number.isFinite(p.coords.y))).toBe(true);
    }
    expect(deck.spreads.filter((s) => s.flexible)).toHaveLength(1);
  });

  it("牌陣名稱與說明沒有簡體字", () => {
    const text = deck.spreads.map((s) => s.name + s.description).join("");
    expect(text).not.toMatch(/[们这个说为时会发对么阵张选择爱灵门]/);
  });

  it.each(BOARD_SIZES)("所有牌陣在 $width×$height 放得下且不重疊", (box) => {
    for (const s of deck.spreads.filter((sp) => !sp.flexible)) {
      const coords = s.positions.map((p) => p.coords);
      const layout = fitSpreadLayout(coords, box);
      expect({ spread: s.name, overlaps: findOverlaps(layout, coords) }).toEqual({ spread: s.name, overlaps: [] });
      expect(layout.cardH).toBeGreaterThanOrEqual(40);
    }
  });

  it.each([false, true])("新紀錄 fromRecord → toRecord 保留內容（萬能牌陣：%s）", (flexible) => {
    const base = flexible ? deck.spreads.find((s) => s.flexible)! : deck.spreads.find((s) => !s.flexible && s.positions.length === 3)!;
    const spread = resolveSpread(base, 3);
    const drawn = spread.positions.map((position, i) => ({
      card: deck.cards[i + 5],
      reversed: deck.hasReversed && i === 1,
      position,
    }));
    const rec: ReadingRecord = { id: "r1", deckId: id, question: "Q", spread, drawn, interpretation: "I", createdAt: 1 };
    const back = deck.toRecord(JSON.parse(JSON.stringify(deck.fromRecord(rec))));
    expect(back).toMatchObject({ id: "r1", deckId: id, question: "Q", interpretation: "I", createdAt: 1 });
    expect(back.spread.positions.map((p) => p.name)).toEqual(spread.positions.map((p) => p.name));
    expect(back.drawn.map((d) => [d.card.id, d.reversed, d.position.name])).toEqual(
      drawn.map((d) => [d.card.id, d.reversed, d.position.name]),
    );
  });

  it("紀錄讀回來的牌陣座標與牌組定義一致（歷史詳情不會疊牌）", () => {
    for (const spread of deck.spreads.filter((s) => !s.flexible)) {
      const drawn = spread.positions.map((position, i) => ({ card: deck.cards[i], reversed: false, position }));
      const rec: ReadingRecord = { id: "r", deckId: id, question: "Q", spread, drawn, createdAt: 1 };
      const back = deck.toRecord(JSON.parse(JSON.stringify(deck.fromRecord(rec))));
      expect({ id: spread.id, coords: back.spread.positions.map((p) => [p.coords.x, p.coords.y]) }).toEqual({
        id: spread.id,
        coords: spread.positions.map((p) => [p.coords.x, p.coords.y]),
      });
    }
  });

  it("buildPrompt 包含問題與牌名", () => {
    const spread = deck.spreads.find((s) => !s.flexible)!;
    const drawn = spread.positions.map((position, i) => ({ card: deck.cards[i], reversed: false, position }));
    const p = deck.buildPrompt("我的問題", spread, drawn);
    expect(p).toContain("我的問題");
    expect(p).toContain(deck.cards[0].name);
  });
});
