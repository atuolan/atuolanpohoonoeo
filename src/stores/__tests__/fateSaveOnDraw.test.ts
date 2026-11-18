import "fake-indexeddb/auto";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockEvent = { type: "token"; token: string } | { type: "error"; error: string };
const mockStream = vi.hoisted(() => ({ events: [] as MockEvent[] }));

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
      yield* mockStream.events;
    }
  },
}));

import { db } from "@/db/database";
import { useAstroDiceStore } from "../astroDice";
import { useLiuyaoStore } from "../liuyao";

const OK_EVENTS: MockEvent[] = [
  { type: "token", token: "解" },
  { type: "token", token: "卦" },
];

beforeEach(async () => {
  mockStream.events = OK_EVENTS;
  setActivePinia(createPinia());
  await db.put("gameStates", [], "liuyao-readings");
  await db.put("gameStates", [], "astro-dice-readings");
});

describe("六爻：排好盤就存", () => {
  async function castSix() {
    const s = useLiuyaoStore();
    await s.loadHistory();
    s.question = "Q";
    s.method = "input";
    s.startCast();
    [7, 8, 9, 6, 7, 8].forEach((v, i) => s.setInputValue(i, v as 6 | 7 | 8 | 9));
    await s.buildChart();
    return s;
  }

  it("排盤後就有一筆沒有解讀的紀錄", async () => {
    const s = await castSix();
    expect(s.phase).toBe("board");
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0]).toMatchObject({
      id: s.currentReadingId,
      question: "Q",
      values: [7, 8, 9, 6, 7, 8],
      interpretation: "",
    });
  });

  it("API 出錯時卦仍留在紀錄裡", async () => {
    mockStream.events = [{ type: "error", error: "502" }];
    const s = await castSix();
    await s.startInterpretation();
    expect(s.interpretError).toBe("502");
    s.reset();

    setActivePinia(createPinia());
    const s2 = useLiuyaoStore();
    await s2.loadHistory();
    expect(s2.readings).toHaveLength(1);
    expect(s2.readings[0]).toMatchObject({ question: "Q", interpretation: "" });
  });

  it("解讀寫回同一筆，不另存", async () => {
    const s = await castSix();
    await s.startInterpretation();
    await s.startInterpretation();
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0].interpretation).toBe("解卦");
  });

  it("開舊卦再解讀，寫回那一筆", async () => {
    const s = await castSix();
    const id = s.currentReadingId!;
    s.reset();
    await s.openReading(s.readings[0]);
    await s.startInterpretation();
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0]).toMatchObject({ id, interpretation: "解卦" });
  });
});

describe("占星骰子：擲完就存", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  async function roll() {
    vi.useFakeTimers();
    const s = useAstroDiceStore();
    await s.loadHistory();
    s.question = "Q";
    const done = s.rollDice();
    await vi.runAllTimersAsync();
    await done;
    vi.useRealTimers();
    return s;
  }

  it("骰子落定就有一筆沒有解讀的紀錄", async () => {
    const s = await roll();
    expect(s.phase).toBe("result");
    expect(s.readings).toHaveLength(1);
    expect(s.readings[0].id).toBe(s.currentReadingId);
    expect(s.readings[0].interpretation).toBeUndefined();
    expect(s.readings[0].result.planet.id).toBe(s.result!.planet.id);
  });

  it("擲到一半離開，不出結果也不存", async () => {
    vi.useFakeTimers();
    const s = useAstroDiceStore();
    await s.loadHistory();
    s.question = "Q";
    const done = s.rollDice();
    await vi.advanceTimersByTimeAsync(300);
    s.reset();
    await vi.runAllTimersAsync();
    await done;
    expect(s.phase).toBe("question");
    expect(s.result).toBeNull();
    expect(s.readings).toHaveLength(0);
  });

  it("API 出錯時骰子結果仍留在紀錄裡，之後可從紀錄再解讀", async () => {
    mockStream.events = [{ type: "error", error: "502" }];
    const s = await roll();
    await s.startInterpretation();
    expect(s.interpretError).toBe("502");
    s.reset();

    setActivePinia(createPinia());
    const s2 = useAstroDiceStore();
    await s2.loadHistory();
    expect(s2.readings).toHaveLength(1);
    expect(s2.readings[0].interpretation).toBeUndefined();

    mockStream.events = OK_EVENTS;
    s2.openReading(s2.readings[0]);
    await s2.startInterpretation();
    expect(s2.readings).toHaveLength(1);
    expect(s2.readings[0].interpretation).toBe("解卦");
  });
});
