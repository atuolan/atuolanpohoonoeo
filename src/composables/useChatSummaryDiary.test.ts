import { computed, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamingEvent, SummarySettings } from "@/types/chat";
import {
  DEFAULT_SUMMARY_PROMPT_ORDER,
  SUMMARY_PROMPT_DEFINITIONS,
} from "@/data/defaultPrompts/summary";

const dbPut = vi.fn();
const notifySystem = vi.fn();
const notifyChatSummary = vi.fn();
let streamEvents: StreamingEvent[] = [];
let lastRequestMessages: Array<{ role: string; content: string }> = [];

vi.mock("@/db/database", () => ({
  db: { put: (...args: unknown[]) => dbPut(...args), get: vi.fn(), delete: vi.fn() },
  DB_STORES: { SUMMARIES: "summaries", DIARIES: "diaries" },
}));
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream(req: { messages: Array<{ role: string; content: string }> }) {
      lastRequestMessages = req.messages;
      for (const event of streamEvents) yield event;
    }
  },
}));
vi.mock("@/utils/generationToggles", () => ({ pickGenerationToggles: () => ({}) }));
vi.mock("@/services/selfHostedSyncState", () => ({
  recordDeletedEntity: vi.fn(),
  scheduleSelfHostedAutoSync: vi.fn(),
}));
vi.mock("@/services/memoryRetriever", () => ({ MemoryRetrieverService: class {} }));
vi.mock("@/db/vectorStore", () => ({
  deleteVectorEmbedding: vi.fn(),
  markVectorStale: vi.fn(),
}));
vi.mock("@/utils/summaryKeywordExtractor", () => ({ extractSummaryKeywords: () => [] }));
vi.mock("@/stores/notification", () => ({
  useNotificationStore: () => ({ notifySystem, notifyChatSummary, notifyDiaryEntry: vi.fn() }),
}));
vi.mock("@/stores", () => ({
  useAIGenerationStore: () => ({
    startGeneration: () => ({ success: true, controller: new AbortController() }),
    updateContent: vi.fn(),
    completeGeneration: vi.fn(),
    setError: vi.fn(),
  }),
  usePromptManagerStore: () => ({
    loadConfig: vi.fn(),
    summaryPrompts: SUMMARY_PROMPT_DEFINITIONS,
    summaryPromptOrder: DEFAULT_SUMMARY_PROMPT_ORDER,
    diaryPrompts: [],
    diaryPromptOrder: [],
  }),
  useSettingsStore: () => ({
    vectorMemoryEnabled: false,
    getAPIForTask: () => ({
      api: { endpoint: "https://example.test", apiKey: "k", model: "m" },
      generation: { streamingEnabled: false },
    }),
  }),
}));

const { useChatSummaryDiary } = await import("./useChatSummaryDiary");

type Msg = {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  storyTime?: number;
  isTimetravel?: boolean;
  timetravelContent?: string;
};

/** 產生 turns 輪 user/ai 對話，時間戳遞增 */
function makeTurns(turns: number): Msg[] {
  const msgs: Msg[] = [];
  for (let i = 0; i < turns; i++) {
    msgs.push({ id: `u${i}`, role: "user", content: `問${i}`, timestamp: 1000 + i * 10 });
    msgs.push({ id: `a${i}`, role: "ai", content: `答${i}`, timestamp: 1005 + i * 10 });
  }
  return msgs;
}

const settings: SummarySettings = {
  intervalMode: "turn",
  summaryIntervalMessage: 60,
  summaryIntervalTurn: 30,
  diaryIntervalMessage: 9999,
  diaryIntervalTurn: 9999,
  actualMessageCount: 30,
  actualMessageMode: "turn",
  summaryReadMode: "recent",
  summaryReadCount: 5,
};

function setup(
  fullHistory: Msg[],
  windowSize: number,
  extra: {
    getRealTimeAwareness?: () => boolean;
    getChatNow?: () => Date;
    summaries?: any[];
  } = {},
) {
  const lastSummaryTime = ref(0);
  const chatSummaries = ref<any[]>(extra.summaries ?? []);
  const api = useChatSummaryDiary({
    messages: ref(fullHistory.slice(-windowSize)),
    currentChatId: ref("chat-1"),
    currentChatData: ref({ isGroupChat: false }),
    currentCharacter: computed(() => ({ id: "char-1", data: { name: "角色" } })),
    effectivePersona: computed(() => ({ name: "用戶" })),
    isGenerating: computed(() => false),
    isGeneratingSummary: ref(false),
    chatSummarySettings: ref(settings),
    chatSummaries,
    chatDiaries: ref([]),
    lastSummaryTime,
    lastDiaryTime: ref(0),
    streamingWindow: { show: vi.fn(), appendToken: vi.fn(), setComplete: vi.fn() },
    useStreamingWindowEnabled: computed(() => false),
    characterId: "char-1",
    characterName: "角色",
    characterAvatar: "",
    chatId: "chat-1",
    saveChat: vi.fn(),
    triggerAutoEventsExtraction: vi.fn(),
    loadCompleteMessages: async () => fullHistory,
    getRealTimeAwareness: extra.getRealTimeAwareness,
    getChatNow: extra.getChatNow,
  });
  return { api, lastSummaryTime, chatSummaries };
}

async function runAutoTrigger(api: ReturnType<typeof useChatSummaryDiary>) {
  await api.checkAndTriggerSummaryOrDiary();
  await vi.advanceTimersByTimeAsync(2000);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("alert", vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("自動總結", () => {
  it("用完整歷史計算間隔，不受分頁視窗大小影響", async () => {
    const history = makeTurns(30);
    // 視窗只有 20 條（10 輪），但完整歷史已滿 30 輪
    const { api, lastSummaryTime, chatSummaries } = setup(history, 20);
    streamEvents = [{ type: "done", content: "<content>總結內容</content>" } as StreamingEvent];

    await runAutoTrigger(api);

    expect(chatSummaries.value).toHaveLength(1);
    expect(chatSummaries.value[0].content).toBe("總結內容");
    expect(chatSummaries.value[0].isManual).toBe(false);
    expect(lastSummaryTime.value).toBe(history[history.length - 1].timestamp);
    expect(notifyChatSummary).toHaveBeenCalledOnce();
  });

  it("串流錯誤時不存檔、不推進 lastSummaryTime、不彈 alert", async () => {
    const { api, lastSummaryTime, chatSummaries } = setup(makeTurns(30), 20);
    streamEvents = [{ type: "error", error: "429 Too Many Requests" } as StreamingEvent];

    await runAutoTrigger(api);

    expect(chatSummaries.value).toHaveLength(0);
    expect(dbPut).not.toHaveBeenCalled();
    expect(lastSummaryTime.value).toBe(0);
    expect(notifyChatSummary).not.toHaveBeenCalled();
    expect(notifySystem).toHaveBeenCalledWith("自動總結失敗", expect.stringContaining("429"));
    expect(alert).not.toHaveBeenCalled();
  });

  it("AI 回傳空內容時不存成空白總結", async () => {
    const { api, lastSummaryTime, chatSummaries } = setup(makeTurns(30), 60);
    streamEvents = [{ type: "done", content: "<content>  </content>" } as StreamingEvent];

    await runAutoTrigger(api);

    expect(chatSummaries.value).toHaveLength(0);
    expect(lastSummaryTime.value).toBe(0);
  });

  it("失敗後冷卻期內不重試，冷卻後重試成功", async () => {
    const { api, chatSummaries } = setup(makeTurns(30), 20);
    streamEvents = [{ type: "error", error: "boom" } as StreamingEvent];
    await runAutoTrigger(api);

    streamEvents = [{ type: "done", content: "重試成功" } as StreamingEvent];
    await runAutoTrigger(api);
    expect(chatSummaries.value).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
    await runAutoTrigger(api);
    expect(chatSummaries.value).toHaveLength(1);
  });
});

describe("總結的時間脈絡", () => {
  const day = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();

  function sentText(): string {
    return lastRequestMessages.map((m) => m.content).join("\n");
  }

  it("開啟感知現實時間時，日期標記用訊息的劇情時間而不是現實發送時間", async () => {
    const history: Msg[] = [
      { id: "u0", role: "user", content: "早安", timestamp: day(2026, 9, 1), storyTime: day(2024, 7, 1, 8) },
      { id: "a0", role: "ai", content: "早", timestamp: day(2026, 9, 5), storyTime: day(2024, 7, 1, 9) },
    ];
    const { api } = setup(history, 10, { getRealTimeAwareness: () => true });
    streamEvents = [{ type: "done", content: "ok" } as StreamingEvent];

    await api.handleTriggerManualSummary({ actualMessageCount: 10, actualMessageMode: "turn" });

    const text = sentText();
    expect(text).toContain("[2024/07/01 08:00]");
    expect(text).not.toContain("[2026/09/01");
    expect(text).not.toContain("[2026/09/05");
    // 同一天、間隔不到 30 分鐘不重複標記；超過 1 小時要標
    expect(text).toContain("[09:00]");
    expect(text).toContain("劇情中發生的日期與時間");
  });

  it("舊訊息沒有劇情時間時，套用目前的時間偏移", async () => {
    const offset = day(2024, 7, 1) - day(2026, 9, 1);
    vi.setSystemTime(day(2026, 9, 1));
    const history: Msg[] = [
      { id: "u0", role: "user", content: "嗨", timestamp: day(2026, 9, 1) },
      { id: "a0", role: "ai", content: "嗨嗨", timestamp: day(2026, 9, 1) },
    ];
    const { api } = setup(history, 10, {
      getRealTimeAwareness: () => true,
      getChatNow: () => new Date(Date.now() + offset),
    });
    streamEvents = [{ type: "done", content: "ok" } as StreamingEvent];

    await api.handleTriggerManualSummary({ actualMessageCount: 10, actualMessageMode: "turn" });

    expect(sentText()).toContain("[2024/07/01 12:00]");
  });

  it("關閉感知現實時間時不附現實日期，改帶時空跳轉、上一篇總結與說明", async () => {
    const history: Msg[] = [
      { id: "t0", role: "system", content: "", timestamp: day(2026, 9, 1), isTimetravel: true, timetravelContent: "7月3日 傍晚 海邊" },
      { id: "u0", role: "user", content: "好美", timestamp: day(2026, 9, 2) },
      { id: "t1", role: "system", content: "", timestamp: day(2026, 9, 3), isTimetravel: true, timetravelContent: "隔天早上" },
      { id: "a0", role: "ai", content: "早安", timestamp: day(2026, 9, 4) },
    ];
    const { api } = setup(history, 10, {
      getRealTimeAwareness: () => false,
      summaries: [
        { id: "s1", content: "7月2日，我們約好去海邊。", createdAt: 1, messageCount: 2 },
      ],
    });
    streamEvents = [{ type: "done", content: "ok" } as StreamingEvent];

    await api.handleTriggerManualSummary({ actualMessageCount: 10, actualMessageMode: "turn" });

    const text = sentText();
    expect(text).not.toMatch(/\[20\d\d\/\d\d\/\d\d/);
    expect(text).not.toMatch(/\[\d\d:\d\d\]/);
    expect(text).toContain("沒有開啟「感知現實時間」");
    expect(text).toContain("最近一次的場景與時間切換：7月3日 傍晚 海邊");
    expect(text).toContain("[場景與時間切換到：隔天早上]");
    expect(text).toContain("7月2日，我們約好去海邊。");
    // 時空跳轉要出現在正確的位置
    expect(text.indexOf("好美")).toBeLessThan(text.indexOf("隔天早上]"));
    expect(text.indexOf("隔天早上]")).toBeLessThan(text.indexOf("早安"));
  });
});

describe("formatMessagesWithDates 時間標記", () => {
  it("面對面劇情同一天內只在時間推進超過 30 分鐘時標記", async () => {
    const { formatMessagesWithDates } = await import("./useChatSummaryDiary");
    const at = (h: number, m: number) => new Date(2024, 6, 3, h, m).getTime();
    const msgs = [
      { id: "1", role: "user" as const, content: "早安", timestamp: 1, storyTime: at(9, 12) },
      { id: "2", role: "ai" as const, content: "牽手", timestamp: 2, storyTime: at(9, 14) },
      { id: "3", role: "user" as const, content: "吃午餐", timestamp: 3, storyTime: at(12, 5) },
      { id: "4", role: "ai" as const, content: "夕陽", timestamp: 4, storyTime: at(18, 40) },
      { id: "5", role: "user" as const, content: "隔天", timestamp: 5, storyTime: new Date(2024, 6, 4, 8, 0).getTime() },
    ];
    const text = formatMessagesWithDates(msgs, () => "用戶", () => "角色", { aware: true, fallbackOffsetMs: 0 });
    expect(text.split("\n\n")).toEqual([
      "[2024/07/03 09:12]",
      "用戶: 早安",
      "角色: 牽手",
      "[12:05]",
      "用戶: 吃午餐",
      "[18:40]",
      "角色: 夕陽",
      "[2024/07/04 08:00]",
      "用戶: 隔天",
    ]);
  });
});
