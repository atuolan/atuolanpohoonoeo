import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/stores/settings", () => ({
  useSettingsStore: () => ({
    getAPIForTask: () => ({
      api: { endpoint: "https://example.test" },
      generation: {
        temperature: 1,
        maxTokens: 10,
        maxContextLength: 10,
        topP: 1,
        frequencyPenalty: 0,
        presencePenalty: 0,
      },
    }),
  }),
}));

vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream() {
      yield { type: "token", token: "解" };
      yield { type: "token", token: "讀" };
    }
  },
}));

import { db } from "@/db/database";
import { useDivinationStore } from "../divination";

describe("useDivinationStore", () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.put("gameStates", [], "fate-readings");
    await db.put("gameStates", [], "lenormand-readings");
    await db.put("gameStates", [], "oracle-readings");
  });

  it("開啟牌組時選到該牌組第一個一般牌陣", () => {
    const s = useDivinationStore();
    s.openDeck("lenormand");
    expect(s.phase).toBe("setup");
    expect(s.selectedSpread.flexible).toBeUndefined();
    expect(s.deck.spreads.map((sp) => sp.id)).toContain(s.spreadId);
  });

  it("選滿才可翻牌，可任意順序翻", () => {
    const s = useDivinationStore();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    expect(s.phase).toBe("table");
    expect(s.pickCard(10)).toBe(true);
    expect(s.pickCard(10)).toBe(false);
    s.revealCard(0);
    expect(s.revealed.size).toBe(0);
    s.pickCard(11);
    s.pickCard(12);
    expect(s.isPickComplete).toBe(true);
    expect(s.pickCard(13)).toBe(false);
    s.revealCard(2);
    s.revealCard(0);
    expect([...s.revealed].sort()).toEqual([0, 2]);
    expect(s.allRevealed).toBe(false);
    s.revealAll();
    expect(s.allRevealed).toBe(true);
    expect(s.drawn.map((d) => d.position.name)).toEqual(["過去", "現在", "未來"]);
  });

  it("報數字", () => {
    const s = useDivinationStore();
    s.openDeck("lenormand");
    s.selectSpread("three-card");
    s.startTable();
    expect(s.pickByNumbers("1,2")).toBe("這個牌陣需要 3 個數字，你輸入了 2 個");
    expect(s.pickByNumbers("1 2 36")).toBeNull();
    expect(s.drawn.map((d) => d.card.id)).toEqual(
      [0, 1, 35].map((i) => s.deck.cards[s.shuffled[i].cardIndex].id),
    );
    expect(s.isPickComplete).toBe(true);
  });

  it("萬能牌陣張數", () => {
    const s = useDivinationStore();
    s.openDeck("oracle");
    s.selectSpread("oracle-flexible");
    s.setFlexibleCount(7);
    expect(s.selectedSpread.positions).toHaveLength(7);
    s.setFlexibleCount(99);
    expect(s.selectedSpread.positions).toHaveLength(10);
    s.startTable();
    expect(s.requiredPicks).toBe(10);
  });

  it("解讀完成存成舊格式並出現在 records", async () => {
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    [1, 2, 3].forEach((i) => s.pickCard(i));
    s.revealAll();
    await s.requestInterpretation();
    expect(s.phase).toBe("interpret");
    expect(s.interpretation).toBe("解讀");
    const raw = s.rawHistory.tarot[0] as { drawnCards: { isReversed: boolean }[] };
    expect(raw.drawnCards).toHaveLength(3);
    expect(typeof raw.drawnCards[0].isReversed).toBe("boolean");
    expect(s.records[0]).toMatchObject({ deckId: "tarot", question: "Q", interpretation: "解讀" });
    const stored = await db.get<unknown[]>("gameStates", "fate-readings");
    expect(stored).toHaveLength(1);
  });

  it("從歷史重新解讀會還原牌並另存一筆", async () => {
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("oracle");
    s.selectSpread("oracle-past-present-future");
    s.question = "Q";
    s.startTable();
    [4, 5, 6].forEach((i) => s.pickCard(i));
    await s.requestInterpretation();
    const record = s.records[0];
    s.goHome();
    await s.reinterpret(record);
    expect(s.deckId).toBe("oracle");
    expect(s.drawn.map((d) => d.card.id)).toEqual(record.drawn.map((d) => d.card.id));
    expect(s.allRevealed).toBe(true);
    expect(s.rawHistory.oracle).toHaveLength(2);
  });

  it("backToSetup 清空已選、goHome 保留問題", () => {
    const s = useDivinationStore();
    s.openDeck("tarot");
    s.question = "Q";
    s.startTable();
    s.pickCard(0);
    s.backToSetup();
    expect(s.phase).toBe("setup");
    expect(s.picked).toEqual([]);
    s.goHome();
    expect(s.phase).toBe("home");
    expect(s.question).toBe("Q");
  });

  it("日夜偏好會存起來", async () => {
    const s = useDivinationStore();
    await s.setThemeMode("night");
    expect(await db.get("gameStates", "fate-prefs")).toEqual({ themeMode: "night" });
    setActivePinia(createPinia());
    const s2 = useDivinationStore();
    await s2.loadHistory();
    expect(s2.themeMode).toBe("night");
  });
});
