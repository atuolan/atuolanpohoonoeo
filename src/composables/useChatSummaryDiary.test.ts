import { computed, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamingEvent, SummarySettings } from "@/types/chat";
import {
  DEFAULT_SUMMARY_PROMPT_ORDER,
  SUMMARY_PROMPT_DEFINITIONS,
} from "@/data/defaultPrompts/summary";

const dbPut = vi.fn();
const dbGet = vi.fn();
const notifySystem = vi.fn();
const notifyChatSummary = vi.fn();
let streamEvents: StreamingEvent[] = [];
let lastRequestMessages: Array<{ role: string; content: string }> = [];

vi.mock("@/db/database", () => ({
  db: { put: (...args: unknown[]) => dbPut(...args), get: (...args: unknown[]) => dbGet(...args), delete: vi.fn() },
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
  deleteVectorEmbedding: vi.fn(async () => {}),
  markVectorStale: vi.fn(async () => {}),
}));
vi.mock("@/utils/summaryKeywordExtractor", () => ({ extractSummaryKeywords: vi.fn(() => []) }));
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
  useCharactersStore: () => ({ characters: [] }),
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

const { useChatSummaryDiary, resolveLastSummaryTime } = await import("./useChatSummaryDiary");

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

describe("總結進度與涵蓋範圍", () => {
  it("手動總結會記錄涵蓋範圍並推進進度，之後的自動總結不再重複同一段", async () => {
    const history = makeTurns(30);
    const { api, lastSummaryTime, chatSummaries } = setup(history, 60);
    streamEvents = [{ type: "done", content: "手動" } as StreamingEvent];

    // 還沒有任何總結 → 從最早的訊息開始總結 10 輪
    await api.handleTriggerManualSummary({ actualMessageCount: 10, actualMessageMode: "turn" });

    const end = history[19].timestamp;
    expect(chatSummaries.value[0]).toMatchObject({
      isManual: true,
      coveredFrom: history[0].timestamp,
      coveredUntil: end,
      sourceCount: 20,
    });
    expect(lastSummaryTime.value).toBe(end);

    await runAutoTrigger(api);
    expect(chatSummaries.value).toHaveLength(1);
  });

  it("重新載入時只用本聊天生成的總結推算進度", () => {
    expect(
      resolveLastSummaryTime([
        { id: "summary_1", createdAt: 500, coveredUntil: 400 },
        { id: "summary_2", createdAt: 300 }, // 舊資料沒有涵蓋範圍，退回 createdAt
        { id: "summary_meta_1", createdAt: 900, isMeta: true },
        { id: "summary_batch_1", createdAt: 950 },
        { id: "x", createdAt: 990, isImported: true },
      ]),
    ).toBe(400);
    expect(resolveLastSummaryTime([])).toBe(0);
  });
});

describe("元總結", () => {
  it("串流錯誤時不存成空白元總結", async () => {
    const { api, chatSummaries } = setup(makeTurns(2), 10, {
      summaries: [
        { id: "s1", content: "一", createdAt: 1, messageCount: 2 },
        { id: "s2", content: "二", createdAt: 2, messageCount: 2 },
      ],
    });
    streamEvents = [{ type: "error", error: "500" } as StreamingEvent];

    await api.handleGenerateMetaSummary(["s1", "s2"]);

    expect(chatSummaries.value).toHaveLength(2);
    expect(dbPut).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(expect.stringContaining("500"));
  });

  it("涵蓋範圍取來源總結的聯集", async () => {
    const { api, chatSummaries } = setup(makeTurns(2), 10, {
      summaries: [
        { id: "s1", content: "一", createdAt: 1, messageCount: 2, coveredFrom: 100, coveredUntil: 200 },
        { id: "s2", content: "二", createdAt: 2, messageCount: 2, coveredFrom: 300, coveredUntil: 400 },
      ],
    });
    streamEvents = [{ type: "done", content: "合併" } as StreamingEvent];

    await api.handleGenerateMetaSummary(["s1", "s2"]);

    expect(chatSummaries.value[2]).toMatchObject({ isMeta: true, coveredFrom: 100, coveredUntil: 400 });
  });
});

describe("導入總結", () => {
  it("id 屬於其他聊天時換新 id，不會把原本那條搬過來", async () => {
    dbGet.mockResolvedValue({ id: "s_other", chatId: "chat-2" });
    const { api, chatSummaries } = setup([], 10);

    await api.handleImportSummaries([{ id: "s_other", content: "別的聊天", createdAt: 5 }]);

    expect(chatSummaries.value).toHaveLength(1);
    expect(chatSummaries.value[0].id).not.toBe("s_other");
    expect(chatSummaries.value[0].isImported).toBe(true);
    expect(dbPut).toHaveBeenCalledWith(
      "summaries",
      expect.objectContaining({ id: chatSummaries.value[0].id, chatId: "chat-1" }),
    );
  });

  it("略過重複與空白的總結", async () => {
    dbGet.mockResolvedValue(undefined);
    const { api, chatSummaries } = setup([], 10, {
      summaries: [{ id: "s1", content: "已存在", createdAt: 1, messageCount: 0 }],
    });

    await api.handleImportSummaries([
      { id: "s1", content: "同 id" },
      { id: "s9", content: " 已存在 " },
      { content: "" },
      { content: "新的" },
      { content: "新的" },
    ]);

    expect(chatSummaries.value.map((s) => s.content)).toEqual(["已存在", "新的"]);
    expect(alert).toHaveBeenCalledWith("已導入 1 條總結，略過 4 條重複或空白的總結");
  });
});

describe("編輯總結", () => {
  it("重新抽取關鍵詞時保留使用者自己加的關鍵詞", async () => {
    const { extractSummaryKeywords } = await import("@/utils/summaryKeywordExtractor");
    vi.mocked(extractSummaryKeywords).mockImplementation((text: string) =>
      text.includes("海邊") ? ["海邊"] : ["山上"],
    );
    const { api, chatSummaries } = setup([], 10, {
      summaries: [{ id: "s1", content: "去海邊", createdAt: 1, messageCount: 0, keywords: ["海邊", "約會"] }],
    });

    await api.handleEditSummary("s1", "去山上");

    expect(chatSummaries.value[0].keywords).toEqual(["山上", "約會"]);
    expect(dbPut).toHaveBeenCalledOnce();
    vi.mocked(extractSummaryKeywords).mockImplementation(() => []);
  });
});

describe("合併與恢復", () => {
  function setupMerge() {
    return setup(makeTurns(2), 10, {
      summaries: [
        { id: "s1", content: "一", createdAt: 10, messageCount: 2, coveredUntil: 10 },
        { id: "s2", content: "二", createdAt: 20, messageCount: 2, coveredUntil: 20 },
        { id: "s3", content: "三", createdAt: 30, messageCount: 2, coveredUntil: 30 },
      ],
    });
  }

  it("少於 2 條不合併", async () => {
    const { api, chatSummaries } = setupMerge();
    await api.handleGenerateMetaSummary(["s1"]);
    expect(chatSummaries.value).toHaveLength(3);
  });

  it("合併後原總結收起、元總結不自動釘選且排在原位置，送給 AI 的內容依時間排序", async () => {
    const { api, chatSummaries } = setupMerge();
    streamEvents = [{ type: "done", content: "合併" } as StreamingEvent];

    await api.handleGenerateMetaSummary(["s2", "s1"]);

    const meta = chatSummaries.value.find((x) => x.isMeta)!;
    expect(meta).toMatchObject({ isImportant: false, coveredUntil: 20 });
    expect(chatSummaries.value.find((x) => x.id === "s1")!.mergedInto).toBe(meta.id);
    expect(chatSummaries.value.find((x) => x.id === "s2")!.mergedInto).toBe(meta.id);
    expect(chatSummaries.value.find((x) => x.id === "s3")!.mergedInto).toBeUndefined();
    const sent = lastRequestMessages.map((m) => m.content).join("\n");
    expect(sent.indexOf("一")).toBeLessThan(sent.indexOf("二"));
  });

  it("刪除元總結時恢復被合併的原總結", async () => {
    const { api, chatSummaries } = setupMerge();
    streamEvents = [{ type: "done", content: "合併" } as StreamingEvent];
    await api.handleGenerateMetaSummary(["s1", "s2"]);
    const meta = chatSummaries.value.find((x) => x.isMeta)!;

    await api.handleDeleteSummary(meta.id);

    expect(chatSummaries.value.map((x) => x.id)).toEqual(["s1", "s2", "s3"]);
    expect(chatSummaries.value.every((x) => !x.mergedInto)).toBe(true);
  });

  it("導入時找不到指向的元總結就解除合併", async () => {
    dbGet.mockResolvedValue(undefined);
    const { api, chatSummaries } = setup([], 10);

    await api.handleImportSummaries([
      { id: "m1", content: "元", isMeta: true },
      { id: "x1", content: "被 m1 合併", mergedInto: "m1" },
      { id: "x2", content: "元總結不在檔案裡", mergedInto: "missing" },
    ]);

    expect(chatSummaries.value.find((x) => x.id === "x1")!.mergedInto).toBe("m1");
    expect(chatSummaries.value.find((x) => x.id === "x2")!.mergedInto).toBeUndefined();
  });
});

describe("手動總結接續上次", () => {
  it("從最早未總結的訊息開始取一段，不跳過任何訊息", async () => {
    const history = makeTurns(30);
    const { api, lastSummaryTime, chatSummaries } = setup(history, 60);
    lastSummaryTime.value = history[19].timestamp; // 前 10 輪已總結
    streamEvents = [{ type: "done", content: "接續" } as StreamingEvent];

    const preview = await api.previewManualSummary({ actualMessageCount: 5, actualMessageMode: "turn" });
    expect(preview).toMatchObject({
      count: 10,
      from: history[20].timestamp,
      until: history[29].timestamp,
      unsummarizedCount: 40,
    });

    await api.handleTriggerManualSummary({ actualMessageCount: 5, actualMessageMode: "turn" });

    expect(chatSummaries.value[0]).toMatchObject({
      coveredFrom: history[20].timestamp,
      coveredUntil: history[29].timestamp,
    });
    expect(lastSummaryTime.value).toBe(history[29].timestamp);
  });

  it("全部總結過時改為重新總結最近 N 條", async () => {
    const history = makeTurns(10);
    const { api, lastSummaryTime } = setup(history, 60);
    lastSummaryTime.value = history[history.length - 1].timestamp;

    const preview = await api.previewManualSummary({ actualMessageCount: 4, actualMessageMode: "message" });

    expect(preview).toMatchObject({
      count: 4,
      from: history[16].timestamp,
      unsummarizedCount: 0,
    });
  });
});
