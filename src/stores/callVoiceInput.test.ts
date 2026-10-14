import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultMiniMaxTTSSettings } from "@/api/MiniMaxTTSApi";
import { closeCallAudioContext } from "@/services/voiceInput/audioContextPrimer";
import { loadChatById } from "@/storage/chatStorage";
import { useCallVoiceInputStore } from "./callVoiceInput";
import { usePhoneCallStore } from "./phoneCall";

const { FakeMic, mics, recognize, settingsState, visibility } = vi.hoisted(() => {
  const mics: FakeMicInstance[] = [];
  interface FakeMicInstance {
    callbacks: { onEvent: (event: unknown) => void } | null;
    running: boolean;
    starts: number;
    stops: number;
    emit(event: unknown): void;
  }
  class FakeMic implements FakeMicInstance {
    callbacks: { onEvent: (event: unknown) => void } | null = null;
    running = false;
    starts = 0;
    stops = 0;
    constructor() {
      mics.push(this);
    }
    get isRunning() {
      return this.running;
    }
    updateOptions() {}
    async start(cb: { onEvent: (event: unknown) => void }) {
      this.starts++;
      this.callbacks = cb;
      this.running = true;
    }
    stop() {
      this.stops++;
      this.running = false;
    }
    emit(event: unknown) {
      this.callbacks?.onEvent(event);
    }
  }
  return {
    FakeMic,
    mics,
    recognize: vi.fn(),
    settingsState: {
      callVoiceInput: { endSilenceMs: 1200, sensitivity: "medium", autoTone: true },
    },
    visibility: { state: "visible", handler: null as null | (() => void) },
  };
});

vi.mock("@/services/voiceInput/micCapture", () => ({
  MicCapture: FakeMic,
  MicStartFailure: class extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  },
}));
vi.mock("@/services/voiceInput/audioContextPrimer", () => ({
  primeCallAudioContext: vi.fn(),
  closeCallAudioContext: vi.fn(),
  isAudioCaptureSupported: () => true,
}));
vi.mock("@/services/asr/recognizeUtterance", () => ({ recognizeUtterance: recognize }));
vi.mock("@/stores/settings", () => ({ useSettingsStore: () => settingsState }));
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
vi.mock("@/stores", () => ({
  useSettingsStore: () => ({ minimaxTTS: createDefaultMiniMaxTTSSettings() }),
}));
vi.mock("@/stores/user", () => ({
  useUserStore: () => ({ currentPersona: { name: "阿明" } }),
}));

const storage = new Map<string, string>();
const last = <T,>(items: T[]): T | undefined => items[items.length - 1];
const utterance = { type: "utterance", samples: new Float32Array(320), voicedMs: 600 };

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  setActivePinia(createPinia());
  mics.length = 0;
  storage.clear();
  storage.set("phone_call_voice_notice_seen", "1");
  visibility.state = "visible";
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal("document", {
    get visibilityState() {
      return visibility.state;
    },
    addEventListener: (_: string, handler: () => void) => {
      visibility.handler = handler;
    },
  });
  vi.mocked(loadChatById).mockResolvedValue(undefined);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function setup() {
  const phoneCall = usePhoneCallStore();
  const voice = useCallVoiceInputStore();
  const trigger = vi.spyOn(phoneCall, "triggerAIResponse").mockImplementation(async () => {});
  await phoneCall.startVideoCall({ chatId: "chat-1", characterId: "char-1", characterName: "小雪" });
  await flush();
  return { phoneCall, voice, trigger, mic: () => mics[mics.length - 1] };
}

describe("callVoiceInput", () => {
  it("接通後開始收音", async () => {
    const { voice, mic } = await setup();
    expect(mic().starts).toBe(1);
    expect(voice.phase).toBe("listening");
  });

  it("首次提示確認前不開麥", async () => {
    storage.delete("phone_call_voice_notice_seen");
    const { voice, mic } = await setup();
    expect(voice.phase).toBe("notice");
    expect(mics).toHaveLength(0);
    voice.acknowledgeNotice();
    await flush();
    expect(mic().starts).toBe(1);
    expect(storage.get("phone_call_voice_notice_seen")).toBe("1");
  });

  it("一段話：佔位 → 填文字 → 關麥並讓角色回覆", async () => {
    recognize.mockResolvedValue({ text: "你好", tone: "開心", events: [] });
    const { phoneCall, voice, trigger, mic } = await setup();
    voice.registerExtraProvider(() => ({ imageData: "IMG" }));
    mic().emit({ type: "speechstart" });
    expect(voice.phase).toBe("speaking");
    mic().emit(utterance);
    expect(last(phoneCall.callMessages)).toMatchObject({ voiceStatus: "pending" });
    await flush();
    expect(last(phoneCall.callMessages)).toMatchObject({
      content: "你好",
      tone: "開心",
      imageData: "IMG",
      viaVoice: true,
    });
    expect(mic().stops).toBeGreaterThan(0);
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(recognize.mock.calls[0][1].context).toBe("小雪、阿明");
  });

  it("手動語氣優先於自動語氣", async () => {
    recognize.mockResolvedValue({ text: "你好", tone: "開心", events: [] });
    const { phoneCall, voice, mic } = await setup();
    voice.registerExtraProvider(() => ({ tone: "撒嬌" }));
    mic().emit(utterance);
    await flush();
    expect(last(phoneCall.callMessages)?.tone).toBe("撒嬌");
  });

  it("辨識回來時還在講話，等下一段講完才送出", async () => {
    const first = deferred<unknown>();
    recognize
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ text: "還有", events: [] });
    const { trigger, mic } = await setup();
    mic().emit(utterance);
    mic().emit({ type: "speechstart" });
    first.resolve({ text: "我跟你說", events: [] });
    await flush();
    expect(trigger).not.toHaveBeenCalled();
    mic().emit(utterance);
    await flush();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("靜音後已講完的句子照樣加入，但不自動送出", async () => {
    const result = deferred<unknown>();
    recognize.mockReturnValue(result.promise);
    const { phoneCall, voice, trigger, mic } = await setup();
    mic().emit(utterance);
    voice.toggleMic();
    expect(voice.phase).toBe("off");
    expect(mic().running).toBe(false);
    result.resolve({ text: "等一下", events: [] });
    await flush();
    expect(last(phoneCall.callMessages)?.content).toBe("等一下");
    expect(trigger).not.toHaveBeenCalled();
    expect(storage.get("phone_call_mic_enabled")).toBe("0");
  });

  it("辨識失敗：失敗泡泡、連續兩次顯示橫幅、重送成功移到最後", async () => {
    recognize.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    const { phoneCall, voice, trigger, mic } = await setup();
    mic().emit(utterance);
    await flush();
    const failedId = last(phoneCall.callMessages)!.id;
    expect(last(phoneCall.callMessages)?.voiceStatus).toBe("failed");
    expect(voice.showFailureBanner).toBe(false);
    mic().emit(utterance);
    await flush();
    expect(voice.showFailureBanner).toBe(true);
    expect(trigger).not.toHaveBeenCalled();

    recognize.mockResolvedValueOnce({ text: "重送的", events: [] });
    voice.retryFailed(failedId);
    await flush();
    expect(phoneCall.callMessages.some((m) => m.id === failedId)).toBe(false);
    expect(last(phoneCall.callMessages)).toMatchObject({ content: "重送的", viaVoice: true });
    expect(voice.showFailureBanner).toBe(false);
  });

  it("空白結果移除佔位", async () => {
    recognize.mockResolvedValue(null);
    const { phoneCall, mic } = await setup();
    mic().emit(utterance);
    await flush();
    expect(phoneCall.callMessages.some((m) => m.viaVoice)).toBe(false);
  });

  it("角色回合關麥，結束後重開；期間的殘留事件忽略", async () => {
    const { phoneCall, voice, mic } = await setup();
    phoneCall.isGenerating = true;
    expect(mic().running).toBe(false);
    expect(voice.phase).toBe("paused");
    mic().emit(utterance);
    expect(phoneCall.callMessages.some((m) => m.viaVoice)).toBe(false);
    phoneCall.isGenerating = false;
    await flush();
    expect(mic().running).toBe(true);
    expect(mic().starts).toBe(2);
  });

  it("切到背景關麥，回來重開", async () => {
    const { voice, mic } = await setup();
    visibility.state = "hidden";
    visibility.handler?.();
    expect(mic().running).toBe(false);
    visibility.state = "visible";
    visibility.handler?.();
    await flush();
    expect(mic().running).toBe(true);
    expect(voice.phase).toBe("listening");
  });

  it("掛斷：關麥、釋放音訊環境，晚到的辨識結果被忽略", async () => {
    const late = deferred<unknown>();
    recognize.mockReturnValue(late.promise);
    const { phoneCall, mic } = await setup();
    mic().emit(utterance);
    await phoneCall.endCall();
    expect(mic().running).toBe(false);
    expect(vi.mocked(closeCallAudioContext)).toHaveBeenCalled();
    const before = JSON.stringify(phoneCall.callMessages);
    late.resolve({ text: "太晚了", events: [] });
    await flush();
    expect(JSON.stringify(phoneCall.callMessages)).toBe(before);
  });

  it("太短的聲音（dropped）也會觸發送出檢查", async () => {
    const result = deferred<unknown>();
    recognize.mockReturnValue(result.promise);
    const { trigger, mic } = await setup();
    mic().emit(utterance);
    mic().emit({ type: "speechstart" });
    result.resolve({ text: "嗯", events: [] });
    await flush();
    expect(trigger).not.toHaveBeenCalled();
    mic().emit({ type: "dropped", voicedMs: 80 });
    await flush();
    expect(trigger).toHaveBeenCalledTimes(1);
  });
});
