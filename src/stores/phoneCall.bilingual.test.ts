import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { appendMessages } from "@/storage/chatMessageStorage";
import { loadChatById } from "@/storage/chatStorage";
import { usePhoneCallStore } from "./phoneCall";

vi.mock("@/api/OpenAICompatible", () => ({}));
vi.mock("@/composables/useStreamingWindow", () => ({}));
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
vi.mock("@/stores", () => ({ useSettingsStore: () => ({ minimaxTTS: settings }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

let settings = createDefaultMiniMaxTTSSettings();

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  settings = {
    ...createDefaultMiniMaxTTSSettings(),
    apiKey: "test-key",
    languageBoost: "Chinese",
  };
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
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mockChat(override: Record<string, unknown>) {
  vi.mocked(loadChatById).mockResolvedValue({
    id: "chat-1",
    minimaxTTSEnabled: true,
    minimaxTTSOverride: override,
  } as Awaited<ReturnType<typeof loadChatById>>);
}

async function speak(content: string, extra: Record<string, unknown> = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ base_resp: { status_code: 1, status_msg: "test: no audio" } }),
  });
  vi.stubGlobal("fetch", fetchMock);
  const store = usePhoneCallStore();
  await store.startVideoCall({ chatId: "chat-1", characterId: "char-1", characterName: "小雪" });
  store.callMessages = [{ id: "ai-1", role: "ai", content, timestamp: 1, ...extra }];
  await store.playMessageAudio("ai-1");
  return JSON.parse(fetchMock.mock.calls[0][1].body);
}

describe("通話雙語字幕：語音", () => {
  it("只念原文、保留語音標記，語言用這句標的 lang", async () => {
    mockChat({ callBilingual: true });
    const body = await speak("無理しないで(sighs)<#0.5#>", {
      translation: "別勉強",
      lang: "Japanese",
    });
    expect(body.text).toBe("無理しないで(sighs)<#0.5#>");
    expect(body.language_boost).toBe("Japanese");
  });

  it("沒開雙語時不吃 lang，但 <br> 與 emotion 標記不送出", async () => {
    mockChat({});
    const body = await speak("你好(laughs)<br>再見[emotion=happy]", { lang: "Japanese" });
    expect(body.text).toBe("你好(laughs)\n再见");
    expect(body.language_boost).toBe("Chinese");
  });
});

describe("通話雙語字幕：存檔", () => {
  it("紀錄存字幕，文字版寫成原文（中文）", async () => {
    vi.mocked(loadChatById).mockResolvedValue({ id: "chat-1" } as Awaited<
      ReturnType<typeof loadChatById>
    >);
    const store = usePhoneCallStore();
    await store.startVideoCall({ chatId: "chat-1", characterId: "char-1", characterName: "小雪" });
    store.callMessages = [
      { id: "u1", role: "user", content: "在嗎", timestamp: 1 },
      {
        id: "a1",
        role: "ai",
        content: "もしもし？",
        translation: "喂？",
        lang: "Japanese",
        timestamp: 2,
      },
    ];
    await store.endCall();
    const record = vi.mocked(appendMessages).mock.calls[0][1][0] as any;
    expect(record.content).toContain("小雪: もしもし？（喂？）");
    expect(record.content).toContain("你: 在嗎");
    expect(record.phoneCallHistoryData.messages[1]).toMatchObject({
      content: "もしもし？",
      translation: "喂？",
    });
  });
});
