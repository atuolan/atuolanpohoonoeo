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

type MockEvent = { type: "token"; token: string } | { type: "error"; error: string };
const mockStream = vi.hoisted(() => ({
  events: [] as MockEvent[],
  /** 設定後，串流吐完第一個事件就停下來等它 resolve */
  gate: null as Promise<void> | null,
}));

vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream() {
      for (const [i, event] of mockStream.events.entries()) {
        yield event;
        if (i === 0 && mockStream.gate) await mockStream.gate;
      }
    }
  },
}));

const OK_EVENTS: MockEvent[] = [
  { type: "token", token: "解" },
  { type: "token", token: "讀" },
];

import { db } from "@/db/database";
import { useDivinationStore } from "../divination";

describe("useDivinationStore", () => {
  beforeEach(async () => {
    mockStream.events = OK_EVENTS;
    mockStream.gate = null;
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

  it("牌抽滿就先存一筆沒有解讀的紀錄", async () => {
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    s.pickCard(1);
    s.pickCard(2);
    expect(s.rawHistory.tarot).toHaveLength(0);
    s.pickCard(3);
    expect(s.records).toHaveLength(1);
    expect(s.records[0].id).toBe(s.currentRecordId);
    expect(s.records[0].interpretation).toBeUndefined();
    expect(s.records[0].drawn.map((d) => d.card.id)).toEqual(s.drawn.map((d) => d.card.id));
    await vi.waitFor(async () =>
      expect(await db.get<unknown[]>("gameStates", "fate-readings")).toHaveLength(1),
    );
  });

  it("報數字選滿也會存紀錄", () => {
    const s = useDivinationStore();
    s.openDeck("lenormand");
    s.selectSpread("three-card");
    s.question = "Q";
    s.startTable();
    expect(s.pickByNumbers("1 2 3")).toBeNull();
    expect(s.records).toHaveLength(1);
    expect(s.records[0].deckId).toBe("lenormand");
  });

  it("API 出錯時抽到的牌仍留在紀錄裡", async () => {
    mockStream.events = [{ type: "error", error: "502" }];
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    [1, 2, 3].forEach((i) => s.pickCard(i));
    await s.requestInterpretation();
    expect(s.interpretError).toBe("502");
    s.goHome();

    setActivePinia(createPinia());
    const s2 = useDivinationStore();
    await s2.loadHistory();
    expect(s2.records).toHaveLength(1);
    expect(s2.records[0]).toMatchObject({ question: "Q", interpretation: undefined });
    expect(s2.records[0].drawn).toHaveLength(3);
  });

  it("解讀途中離開，解讀仍寫回同一筆紀錄", async () => {
    let release!: () => void;
    mockStream.gate = new Promise<void>((r) => (release = r));
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    [1, 2, 3].forEach((i) => s.pickCard(i));
    const pending = s.requestInterpretation();
    await vi.waitFor(() => expect(s.interpretation).toBe("解"));
    s.goHome();
    release();
    await pending;
    expect(s.interpretation).toBe("");
    expect(s.isInterpreting).toBe(false);
    expect(s.records).toHaveLength(1);
    expect(s.records[0].interpretation).toBe("解讀");
  });

  it("重新解讀中途出錯，不蓋掉原本的解讀", async () => {
    const s = useDivinationStore();
    await s.loadHistory();
    s.openDeck("tarot");
    s.selectSpread("starcat-3");
    s.question = "Q";
    s.startTable();
    [1, 2, 3].forEach((i) => s.pickCard(i));
    await s.requestInterpretation();
    mockStream.events = [
      { type: "token", token: "半" },
      { type: "error", error: "斷線" },
    ];
    await s.requestInterpretation();
    expect(s.interpretation).toBe("半");
    expect(s.records[0].interpretation).toBe("解讀");
  });

  it("從歷史重新解讀會還原牌並寫回同一筆", async () => {
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
    expect(s.rawHistory.oracle).toHaveLength(1);
    expect(s.records[0]).toMatchObject({ id: record.id, interpretation: "解讀" });
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
