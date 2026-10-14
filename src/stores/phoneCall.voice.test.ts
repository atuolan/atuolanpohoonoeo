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
const storage = new Map<string, string>();
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  settings = { ...createDefaultMiniMaxTTSSettings(), apiKey: "test-key" };
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
  vi.mocked(loadChatById).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function connected() {
  const store = usePhoneCallStore();
  await store.startVideoCall({ chatId: "chat-1", characterId: "char-1", characterName: "小雪" });
  return store;
}

describe("phone call voice placeholders", () => {
  it("佔位 → 填文字，辨識中不能手動觸發", async () => {
    const store = await connected();
    const id = store.addVoicePlaceholder()!;
    expect(last(store.callMessages)).toMatchObject({
      id,
      role: "user",
      viaVoice: true,
      voiceStatus: "pending",
    });
    expect(store.canTriggerManualResponse).toBe(false);

    expect(store.resolveVoicePlaceholder(id, "你好", { tone: "開心" })).toBe(true);
    expect(last(store.callMessages)).toMatchObject({ content: "你好", tone: "開心", viaVoice: true });
    expect(last(store.callMessages)?.voiceStatus).toBeUndefined();
    expect(store.canTriggerManualResponse).toBe(true);
  });

  it("沒有通話時不能加佔位", () => {
    expect(usePhoneCallStore().addVoicePlaceholder()).toBeNull();
  });

  it("重送成功的句子移到最後", async () => {
    const store = await connected();
    const failed = store.addVoicePlaceholder()!;
    store.failVoicePlaceholder(failed);
    store.callMessages.push({ id: "ai-1", role: "ai", content: "嗯？", timestamp: 1 });
    const newId = store.requeueVoiceMessage(failed, "我剛說我下班了")!;
    expect(store.callMessages.map((m) => m.id)).toEqual(["ai-1", newId]);
    expect(last(store.callMessages)).toMatchObject({ content: "我剛說我下班了", viaVoice: true });
  });

  it("失敗泡泡不影響重生判斷", async () => {
    const store = await connected();
    store.callMessages.push({ id: "u", role: "user", content: "喂", timestamp: 1 });
    store.callMessages.push({ id: "a", role: "ai", content: "嗨", timestamp: 2 });
    const failed = store.addVoicePlaceholder()!;
    store.failVoicePlaceholder(failed);
    expect(store.canRegenerateLastAi).toBe(true);
  });

  it("快照與通話紀錄不含佔位，並保留 viaVoice", async () => {
    vi.mocked(loadChatById).mockResolvedValue({ id: "chat-1" } as any);
    const store = await connected();
    const done = store.addVoicePlaceholder()!;
    store.resolveVoicePlaceholder(done, "你好");
    store.addVoicePlaceholder();
    const failed = store.addVoicePlaceholder()!;
    store.failVoicePlaceholder(failed);

    store.saveCallSnapshot();
    const snapshot = JSON.parse(storage.get("phone_call_snapshot")!);
    expect(snapshot.callMessages).toHaveLength(1);
    expect(snapshot.callMessages[0]).toMatchObject({ content: "你好", viaVoice: true });

    await store.endCall();
    const records = vi.mocked(appendMessages).mock.calls[0][1] as any[];
    expect(records[0].phoneCallHistoryData.messages).toEqual([
      expect.objectContaining({ role: "user", content: "你好", viaVoice: true }),
    ]);
  });
});

describe("aiTurnActive", () => {
  async function answeredWithVoice(fetchImpl: (...args: unknown[]) => Promise<unknown>) {
    vi.mocked(loadChatById).mockResolvedValue({ id: "chat-1", minimaxTTSEnabled: true } as any);
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    const store = usePhoneCallStore();
    await store.startCall({
      chatId: "chat-1",
      characterId: "char-1",
      characterName: "小雪",
      enablePhoneDecision: false,
    });
    expect(store.aiTurnActive).toBe(false);
    await store.handleAnswer([{ text: "喂？" }]);
    return store;
  }

  it("自動語音合成期間為 true，結束後為 false", async () => {
    let finish!: (v: unknown) => void;
    const store = await answeredWithVoice(() => new Promise((resolve) => (finish = resolve)));
    expect(store.aiTurnActive).toBe(true);
    // 等合成流程跑到 fetch
    await vi.advanceTimersByTimeAsync(0);
    expect(store.aiTurnActive).toBe(true);

    finish({ json: async () => ({ base_resp: { status_code: 1, status_msg: "test" } }) });
    await vi.advanceTimersByTimeAsync(50);
    expect(store.aiTurnActive).toBe(false);
  });

  it("interruptAiSpeech 讓角色回合結束", async () => {
    const store = await answeredWithVoice(() => new Promise(() => {}));
    expect(store.aiTurnActive).toBe(true);
    store.interruptAiSpeech();
    expect(store.aiTurnActive).toBe(false);
  });
});
