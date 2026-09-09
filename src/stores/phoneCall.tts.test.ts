import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { usePhoneCallStore } from "./phoneCall";
import { loadChatById } from "@/storage/chatStorage";

// Keep unrelated chat generation and storage out of the voice playback test.
vi.mock("@/api/OpenAICompatible", () => ({}));
vi.mock("@/composables/useStreamingWindow", () => ({}));
vi.mock("@/db/database", () => ({}));
vi.mock("@/engine/prompt/PromptBuilder", () => ({}));
vi.mock("@/services/ResponseParser", () => ({}));
vi.mock("@/storage/chatStorage", () => ({ loadChatById: vi.fn() }));
vi.mock("@/storage/chatMessageStorage", () => ({}));
vi.mock("@/stores", () => ({ useSettingsStore: () => ({ minimaxTTS: settings }) }));
vi.mock("@/stores/user", () => ({ useUserStore: () => ({ currentPersona: null }) }));

let settings = createDefaultMiniMaxTTSSettings();

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  settings = { ...createDefaultMiniMaxTTSSettings(), apiKey: "test-key" };
  vi.stubGlobal("Audio", class {
    play() { return Promise.resolve(); }
    pause() {}
    removeAttribute() {}
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("phone call TTS language handling", () => {
  it.each([
    [undefined, "Chinese", "时间"],
    ["Japanese", "Japanese", "時間"],
    ["auto", "auto", "时间"],
    ["", undefined, "时间"],
  ])("loads the chat language override %s for calls", async (override, expected, text) => {
    settings.languageBoost = "Chinese";
    vi.mocked(loadChatById).mockResolvedValue({
      id: "chat-1", minimaxTTSEnabled: true, minimaxTTSOverride: { languageBoost: override },
    } as Awaited<ReturnType<typeof loadChatById>>);
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ base_resp: { status_code: 1, status_msg: "test: no audio" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = usePhoneCallStore();
    await store.startVideoCall({ chatId: "chat-1", characterId: "char-1", characterName: "Test" });
    store.callMessages = [{ id: "voice-1", role: "ai", content: "時間", timestamp: 1 }];

    await store.playMessageAudio("voice-1");

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe(text);
    expect(body.language_boost).toBe(expected);
    expect(settings.languageBoost).toBe("Chinese");

    vi.mocked(loadChatById).mockResolvedValue(undefined);
    await store.startVideoCall({ chatId: "chat-2", characterId: "char-2", characterName: "Second" });
    store.callMessages = [{ id: "voice-2", role: "ai", content: "時間", timestamp: 2 }];
    await store.playMessageAudio("voice-2");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).language_boost).toBe("Chinese");
  });

  it.each([
    ["時間、大丈夫ですか？", "auto", "時間、大丈夫ですか？"],
    ["時間", "Japanese", "時間"],
    ["時間方便嗎？", "auto", "时间方便吗？"],
  ])("sends intact speech text for %s", async (content, language, expected) => {
    settings.languageBoost = language;
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ base_resp: { status_code: 1, status_msg: "test: no audio" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const store = usePhoneCallStore();
    store.callMessages = [{ id: "voice-1", role: "ai", content, timestamp: 1 }];

    await store.playMessageAudio("voice-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.text).toBe(expected);
    expect(body.language_boost).toBe(language);
  });
});
