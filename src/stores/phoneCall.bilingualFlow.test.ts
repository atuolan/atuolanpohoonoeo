import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { loadChatById } from "@/storage/chatStorage";
import { __setConverterLoaderForTest } from "@/utils/toTraditional";
import { usePhoneCallStore } from "./phoneCall";

const builderOptions: any[] = [];
const decisionPrompts: string[] = [];
let streamReply = "";
let decisionReply = "";

vi.mock("@/engine/prompt/PromptBuilder", () => ({
  PromptBuilder: class {
    constructor(options: any) {
      builderOptions.push(options);
    }
    async build() {
      return { messages: [{ role: "user", content: "hi" }] };
    }
  },
}));
vi.mock("@/api/OpenAICompatible", () => ({
  OpenAICompatibleClient: class {
    async *generateStream() {
      yield { type: "done", content: streamReply };
    }
    async generate(request: any) {
      decisionPrompts.push(request.messages[0].content);
      return { content: decisionReply };
    }
  },
}));
vi.mock("@/composables/useStreamingWindow", () => ({
  useStreamingWindow: () => ({ show: vi.fn(), appendToken: vi.fn(), setComplete: vi.fn() }),
}));
vi.mock("@/db/database", () => ({
  db: { get: vi.fn(async () => undefined), getAll: vi.fn(async () => []) },
  DB_STORES: { CHATS: "chats", SUMMARIES: "summaries", IMPORTANT_EVENTS: "importantEvents" },
}));
vi.mock("@/services/ResponseParser", () => ({ parseAffinityUpdateTags: () => [] }));
vi.mock("@/storage/chatStorage", () => ({
  loadChatById: vi.fn(),
  refreshChatDerivedMetadata: vi.fn(),
}));
vi.mock("@/storage/chatMessageStorage", () => ({
  appendMessages: vi.fn(),
  loadMessages: vi.fn(async () => []),
}));
vi.mock("@/services/IncomingCallScheduler", () => ({
  getIncomingCallScheduler: () => ({ recordCallEnded: vi.fn() }),
}));
vi.mock("@/stores", () => ({
  useSettingsStore: () => ({
    minimaxTTS: createDefaultMiniMaxTTSSettings(),
    generation: { temperature: 1, topP: 1 },
    vectorMemoryEnabled: false,
    getAPIForTask: () => ({
      api: { model: "test" },
      generation: {
        streamingEnabled: false,
        useStreamingWindow: false,
        maxContextLength: 1000,
        maxTokens: 100,
        temperature: 1,
        topP: 1,
      },
    }),
  }),
  useCharactersStore: () => ({
    characters: [{ id: "char-1", data: { name: "小雪", personality: "" } }],
  }),
  useLorebooksStore: () => ({ lorebooks: [] }),
  usePromptManagerStore: () => ({ loadConfig: async () => {}, config: {} }),
  useAIGenerationStore: () => ({
    startGeneration: vi.fn(),
    appendContent: vi.fn(),
    completeGeneration: vi.fn(),
    setError: vi.fn(),
  }),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

const storage = new Map<string, string>();
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  builderOptions.length = 0;
  decisionPrompts.length = 0;
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal(
    "Audio",
    class {
      play() {
        return Promise.resolve();
      }
      pause() {}
      removeAttribute() {}
    },
  );
  __setConverterLoaderForTest(async () => (t: string) => t.replace("么", "麼"));
});

afterEach(() => {
  __setConverterLoaderForTest(null);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockChat(override?: Record<string, unknown>) {
  vi.mocked(loadChatById).mockResolvedValue({
    id: "chat-1",
    minimaxTTSOverride: override,
  } as Awaited<ReturnType<typeof loadChatById>>);
}

const info = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };

async function answeredCall() {
  const store = usePhoneCallStore();
  await store.startCall({ ...info, enablePhoneDecision: true });
  await vi.waitFor(() => {
    expect(store.callMessages.some((m) => m.role === "ai")).toBe(true);
  }, { timeout: 5000 });
  return store;
}

describe("通話雙語字幕：生成", () => {
  it("把開關傳給 PromptBuilder，回覆帶出字幕與語言", async () => {
    mockChat({ callBilingual: true });
    const store = usePhoneCallStore();
    await store.startVideoCall(info);
    streamReply = '[{"text":"もしもし？","zh":"喂？怎么了？","lang":"japanese","tone":"溫柔"}]';
    store.addUserMessage("在嗎");
    await store.triggerAIResponse();
    expect(last(builderOptions).callBilingual).toBe(true);
    expect(last(store.callMessages)).toMatchObject({
      role: "ai",
      content: "もしもし？",
      translation: "喂？怎麼了？",
      lang: "Japanese",
      tone: "溫柔",
    });
  });

  it("沒開雙語時照舊", async () => {
    mockChat();
    const store = usePhoneCallStore();
    await store.startVideoCall(info);
    streamReply = '[{"text":"もしもし<br>（喂）","zh":"喂"}]';
    store.addUserMessage("在嗎");
    await store.triggerAIResponse();
    expect(last(builderOptions).callBilingual).toBe(false);
    expect(last(store.callMessages)).toMatchObject({ content: "もしもし<br>（喂）" });
    expect(last(store.callMessages)?.translation).toBeUndefined();
  });

  it("開場白也帶雙語規則與字幕", async () => {
    mockChat({ callBilingual: true });
    decisionReply = '{"answer":true,"openingMessages":[{"text":"もしもし<br>（喂）","tone":"溫柔"}]}';
    const store = await answeredCall();
    expect(last(decisionPrompts)).toContain("雙語通話");
    expect(store.callMessages.find((m) => m.role === "ai")).toMatchObject({
      content: "もしもし",
      translation: "喂",
      tone: "溫柔",
    });
  });

  it("沒開雙語時開場白提示詞不變", async () => {
    mockChat();
    decisionReply = '{"answer":true,"openingMessages":[{"text":"喂？","tone":"接起"}]}';
    const store = await answeredCall();
    expect(last(decisionPrompts)).not.toContain("雙語通話");
    expect(store.callMessages.find((m) => m.role === "ai")).toMatchObject({
      content: "喂？",
      tone: "接起",
    });
  });
});
