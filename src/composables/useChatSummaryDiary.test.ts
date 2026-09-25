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

vi.mock("@/db/database", () => ({
  db: { put: (...args: unknown[]) => dbPut(...args), get: vi.fn(), delete: vi.fn() },
  DB_STORES: { SUMMARIES: "summaries", DIARIES: "diaries" },
}));
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream() {
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

type Msg = { id: string; role: "user" | "ai"; content: string; timestamp: number };

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

function setup(fullHistory: Msg[], windowSize: number) {
  const lastSummaryTime = ref(0);
  const chatSummaries = ref<any[]>([]);
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
