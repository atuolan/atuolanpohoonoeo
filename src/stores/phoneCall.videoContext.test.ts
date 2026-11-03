import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { loadChatById } from "@/storage/chatStorage";
import { usePhoneCallStore } from "./phoneCall";
import { loadCallContext } from "./phoneCallContext";

vi.mock("@/api/OpenAICompatible", () => ({}));
vi.mock("@/composables/useStreamingWindow", () => ({
  useStreamingWindow: () => ({
    show: vi.fn(),
    hide: vi.fn(),
    appendToken: vi.fn(),
    setComplete: vi.fn(),
  }),
}));
vi.mock("@/db/database", () => ({}));
vi.mock("@/engine/prompt/PromptBuilder", () => ({}));
vi.mock("@/services/ResponseParser", () => ({}));
vi.mock("@/storage/chatStorage", () => ({
  loadChatById: vi.fn(),
  refreshChatDerivedMetadata: vi.fn(),
}));
vi.mock("@/storage/chatMessageStorage", () => ({ appendMessages: vi.fn() }));
vi.mock("@/services/IncomingCallScheduler", () => ({
  getIncomingCallScheduler: () => ({ recordCallEnded: vi.fn() }),
}));
vi.mock("./phoneCallContext", () => ({
  loadCallContext: vi.fn(async () => ({
    summaries: [],
    importantEvents: [],
    recentChatHistory: [],
  })),
}));
vi.mock("@/stores", () => ({
  useSettingsStore: () => ({
    minimaxTTS: createDefaultMiniMaxTTSSettings(),
    getAPIForTask: () => ({ generation: {} }),
  }),
  useCharactersStore: () => ({ characters: [] }),
  useLorebooksStore: () => ({ lorebooks: [] }),
  usePromptManagerStore: () => ({ config: {} }),
  useAIGenerationStore: () => ({
    startGeneration: vi.fn(),
    setError: vi.fn(),
    appendContent: vi.fn(),
    completeGeneration: vi.fn(),
  }),
}));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
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
  vi.mocked(loadChatById).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("通話開始時載入上下文", () => {
  it("視訊通話跟語音一樣會載入總結、重要事件和聊天紀錄", async () => {
    const store = usePhoneCallStore();
    const info = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };

    await store.startVideoCall(info);

    expect(loadCallContext).toHaveBeenCalledWith(info);
  });

  it("語音通話也會載入", async () => {
    const store = usePhoneCallStore();
    const info = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };

    await store.startCall(info);

    expect(loadCallContext).toHaveBeenCalledWith(info);
  });

  it("連打兩個不同角色，第二通讀的是第二個角色", async () => {
    const store = usePhoneCallStore();
    const first = { chatId: "chat-1", characterId: "char-1", characterName: "小雪" };
    const second = { chatId: "chat-2", characterId: "char-2", characterName: "梁sir" };

    await store.startCall(first);
    await store.endCall();
    await store.startVideoCall(second);

    expect(loadCallContext).toHaveBeenLastCalledWith(second);
  });
});
