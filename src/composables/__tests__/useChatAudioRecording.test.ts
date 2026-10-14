import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref, watch } from "vue";
import { useChatAudioRecording } from "@/composables/useChatAudioRecording";

const { recorder, settingsState, transcribe } = vi.hoisted(() => ({
  recorder: {
    configure: vi.fn(),
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => ({
      blob: new Blob(["x"], { type: "audio/webm" }),
      dataUri: "data:audio/webm;base64,eA==",
      mimeType: "audio/webm",
      duration: 3,
      waveform: [0.1, 0.5],
    })),
    cancel: vi.fn(),
  },
  settingsState: {
    api: { endpoint: "", apiKey: "" },
    audio: {
      quality: "high",
      maxDuration: 30,
      sttEnabled: true,
      transmissionFormat: "image_url",
    },
    callVoiceInput: { endSilenceMs: 1200, sensitivity: "medium", autoTone: true },
  },
  transcribe: vi.fn(),
}));

vi.mock("@/services/AudioRecorder", () => ({
  AudioRecorder: class {
    configure = recorder.configure;
    start = recorder.start;
    stop = recorder.stop;
    cancel = recorder.cancel;
  },
  formatTime: () => "0:03",
  isDurationValid: () => true,
}));
vi.mock("@/services/asr/recognizeUtterance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/asr/recognizeUtterance")>()),
  recognizeUtterance: transcribe,
}));
vi.mock("@/utils/audioConverter", () => ({
  ensureApiSafeAudio: async (blob: Blob, mimeType: string, dataUri: string) => ({
    blob,
    mimeType,
    dataUri,
  }),
}));
vi.mock("@/api/OpenAICompatible", () => ({
  createAudioMessage: vi.fn(),
  createAudioMessageNative: vi.fn(),
}));
vi.mock("@/db/operations", () => ({ saveAudioBlob: vi.fn(async () => "blob-1") }));
vi.mock("@/db/database", () => ({ db: { get: vi.fn() }, DB_STORES: {} }));
vi.mock("@/stores", () => ({ useSettingsStore: () => settingsState }));

const mouseEvent = { clientY: 100 } as unknown as MouseEvent;

function setup() {
  const messages = ref<any[]>([]);
  const saveChatImmediate = vi.fn(async () => {});
  const recording = useChatAudioRecording({
    messages,
    isGenerating: computed(() => false),
    scrollToBottom: () => {},
    saveChatImmediate,
    clearSwipesOnLastAIMessage: () => {},
    clearRoundSwipes: () => {},
    triggerAIResponse: async () => {},
  });
  return { messages, saveChatImmediate, recording };
}

beforeEach(() => {
  vi.stubGlobal("TouchEvent", class {});
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  settingsState.audio.sttEnabled = true;
  settingsState.callVoiceInput.autoTone = true;
  transcribe.mockResolvedValue({ text: "（咳嗽）我剛下班", tone: "開心", events: ["cough"] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("useChatAudioRecording 使用設定頁的錄音設定", () => {
  it("錄音品質與最長時間取自設定頁", async () => {
    const { recording } = setup();
    await recording.startRecording(mouseEvent);
    expect(recorder.configure).toHaveBeenCalledWith({ maxDuration: 30, quality: "high" });
  });

  it("開啟 STT：錄完自動轉文字（含聲音與語氣），畫面上的訊息跟著更新", async () => {
    const { messages, recording, saveChatImmediate } = setup();
    const seen: string[] = [];
    watch(
      () => messages.value[0]?.content,
      (content) => content && seen.push(content),
      { flush: "sync" },
    );
    await recording.startRecording(mouseEvent);
    await recording.finishRecording();
    const expected = "（語氣：開心）（咳嗽）我剛下班";
    await vi.waitFor(() => expect(messages.value[0].audioTranscript).toBe(expected));
    expect(messages.value[0].content).toBe(expected);
    expect(seen).toContain(expected);
    expect(saveChatImmediate).toHaveBeenCalled();
  });

  it("關閉自動判斷語氣時不加語氣", async () => {
    settingsState.callVoiceInput.autoTone = false;
    const { messages, recording } = setup();
    await recording.startRecording(mouseEvent);
    await recording.finishRecording();
    await vi.waitFor(() => expect(messages.value[0].audioTranscript).toBe("（咳嗽）我剛下班"));
  });

  it("辨識不出內容時保留原本的語音訊息", async () => {
    transcribe.mockResolvedValue(null);
    const { messages, recording } = setup();
    await recording.startRecording(mouseEvent);
    await recording.finishRecording();
    await new Promise((r) => setTimeout(r, 0));
    expect(messages.value[0].audioTranscript).toBeUndefined();
    expect(messages.value[0].content).toContain("語音訊息");
  });

  it("關閉 STT 時不轉文字", async () => {
    settingsState.audio.sttEnabled = false;
    const { recording } = setup();
    await recording.startRecording(mouseEvent);
    await recording.finishRecording();
    await new Promise((r) => setTimeout(r, 0));
    expect(transcribe).not.toHaveBeenCalled();
  });
});
