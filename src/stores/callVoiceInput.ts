/**
 * 通話語音輸入 Store
 *
 * 負責免持通話的「輪流說話」：何時開關麥克風、把一段話送去辨識、何時讓角色回覆。
 * 放在全域 store 而不是通話畫面，是因為縮小或切頁時畫面會被卸載，仍要繼續聽。
 *
 * 麥克風開啟條件：使用者沒靜音、看過首次提示、通話已接通、不是角色回合、頁面在前景。
 */
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { recognizeUtterance } from "@/services/asr/recognizeUtterance";
import {
  closeCallAudioContext,
  isAudioCaptureSupported,
  primeCallAudioContext,
} from "@/services/voiceInput/audioContextPrimer";
import {
  MicCapture,
  MicStartFailure,
  type MicStartError,
} from "@/services/voiceInput/micCapture";
import {
  DETECTOR_SAMPLE_RATE,
  type DetectorEvent,
} from "@/services/voiceInput/utteranceDetector";
import { pcmToWavBlob } from "@/utils/wav";
import { usePhoneCallStore, type VoiceMessageExtra } from "./phoneCall";
import { useSettingsStore } from "./settings";

export type VoicePhase =
  | "off"
  | "notice"
  | "listening"
  | "speaking"
  | "paused"
  | MicStartError;

type ExtraProvider = () => VoiceMessageExtra | null | undefined;

const MIC_INTENT_KEY = "phone_call_mic_enabled";
const NOTICE_SEEN_KEY = "phone_call_voice_notice_seen";
/** 連續幾段辨識失敗就顯示橫幅 */
const FAILURE_BANNER_THRESHOLD = 2;
/** 音量更新的最短間隔，避免每 20ms 更新一次畫面 */
const LEVEL_UPDATE_MS = 60;

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const value = globalThis.localStorage?.getItem(key);
    return value == null ? fallback : value === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    globalThis.localStorage?.setItem(key, value ? "1" : "0");
  } catch {
    /* 無痕模式等情況寫不進去，下次用預設值 */
  }
}

function isPageVisible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

export const useCallVoiceInputStore = defineStore("callVoiceInput", () => {
  const phoneCall = usePhoneCallStore();
  const settings = useSettingsStore();
  const supported = isAudioCaptureSupported();

  const micEnabled = ref(readFlag(MIC_INTENT_KEY, true));
  const noticeSeen = ref(readFlag(NOTICE_SEEN_KEY, false));
  const micRunning = ref(false);
  const speaking = ref(false);
  const level = ref(0);
  const startError = ref<MicStartError | null>(null);
  const pageVisible = ref(isPageVisible());
  const pendingCount = ref(0);
  const consecutiveFailures = ref(0);

  let mic: MicCapture | null = null;
  let starting = false;
  let extraProvider: ExtraProvider | null = null;
  let session = new AbortController();
  let lastLevelAt = 0;
  const failedClips = new Map<string, Blob>();
  const extrasById = new Map<string, VoiceMessageExtra>();

  const callConnected = computed(
    () => phoneCall.callState === "connected" && !!phoneCall.activeCall,
  );

  const wantMic = computed(
    () =>
      supported &&
      micEnabled.value &&
      noticeSeen.value &&
      callConnected.value &&
      !phoneCall.aiTurnActive &&
      pageVisible.value &&
      !startError.value,
  );

  const phase = computed<VoicePhase>(() => {
    if (!callConnected.value || !micEnabled.value) return "off";
    if (!supported) return "unsupported";
    if (!noticeSeen.value) return "notice";
    if (startError.value) return startError.value;
    if (phoneCall.aiTurnActive || !pageVisible.value) return "paused";
    return speaking.value ? "speaking" : "listening";
  });

  const showFailureBanner = computed(
    () => consecutiveFailures.value >= FAILURE_BANNER_THRESHOLD,
  );

  /** 使用者正在講話或還有句子在辨識（視訊自動截圖用來避讓） */
  const isUserBusy = computed(() => speaking.value || pendingCount.value > 0);

  // ===== 麥克風開關 =====
  function getMic(): MicCapture {
    if (!mic) {
      mic = new MicCapture({
        endSilenceMs: settings.callVoiceInput.endSilenceMs,
        sensitivity: settings.callVoiceInput.sensitivity,
      });
    }
    return mic;
  }

  function stopMic(): void {
    mic?.stop();
    micRunning.value = false;
    speaking.value = false;
    level.value = 0;
  }

  function syncMic(): void {
    if (!wantMic.value) {
      if (micRunning.value || starting) stopMic();
      return;
    }
    if (micRunning.value || starting) return;
    void startMic();
  }

  async function startMic(): Promise<void> {
    starting = true;
    const capture = getMic();
    try {
      await capture.start({
        onEvent: handleDetectorEvent,
        onLevel: handleLevel,
        onTrackEnded: handleTrackEnded,
      });
      micRunning.value = capture.isRunning;
    } catch (err) {
      startError.value = err instanceof MicStartFailure ? err.reason : "busy";
      console.warn("[callVoice] 收音啟動失敗:", err);
    } finally {
      starting = false;
    }
    // 啟動期間狀態可能變了（例如角色開始回覆、被靜音、被 stop 作廢後又要開）
    if (micRunning.value && !wantMic.value) stopMic();
    else if (!micRunning.value && wantMic.value) void startMic();
  }

  function handleLevel(value: number): void {
    const now = Date.now();
    if (now - lastLevelAt < LEVEL_UPDATE_MS) return;
    lastLevelAt = now;
    level.value = value;
  }

  function handleTrackEnded(): void {
    console.warn("[callVoice] 麥克風被系統中斷");
    micRunning.value = false;
    speaking.value = false;
    level.value = 0;
    syncMic();
  }

  // ===== 斷句事件 =====
  function handleDetectorEvent(event: DetectorEvent): void {
    // 角色回合或通話結束後的殘留事件一律忽略
    if (!micRunning.value || phoneCall.aiTurnActive || !callConnected.value) return;
    if (event.type === "speechstart") {
      speaking.value = true;
      return;
    }
    speaking.value = false;
    if (event.type === "dropped") {
      maybeSubmitTurn();
      return;
    }
    const id = phoneCall.addVoicePlaceholder();
    if (!id) return;
    const extra = readExtra();
    if (extra) extrasById.set(id, extra);
    void transcribe(id, pcmToWavBlob(event.samples, DETECTOR_SAMPLE_RATE), false);
  }

  function readExtra(): VoiceMessageExtra | null {
    try {
      return extraProvider?.() ?? null;
    } catch (err) {
      console.warn("[callVoice] 取得附加欄位失敗:", err);
      return null;
    }
  }

  /** 手動語氣優先；沒有才用自動判斷的語氣（設定可關） */
  function mergeExtra(id: string, autoTone?: string): VoiceMessageExtra {
    const provided = extrasById.get(id) ?? {};
    const manualTone = provided.tone?.trim();
    const tone = manualTone || (settings.callVoiceInput.autoTone ? autoTone : undefined);
    return { ...provided, tone: tone || undefined };
  }

  async function buildContext(): Promise<string> {
    const names = [phoneCall.activeCall?.characterName];
    try {
      const { useUserStore } = await import("@/stores/user");
      names.push(useUserStore().currentPersona?.name);
    } catch {
      /* 拿不到使用者名稱就只帶角色名 */
    }
    return names.filter((n): n is string => !!n?.trim()).join("、");
  }

  async function transcribe(id: string, wav: Blob, isRetry: boolean): Promise<void> {
    const { signal } = session;
    pendingCount.value++;
    try {
      const result = await recognizeUtterance(wav, { context: await buildContext(), signal });
      if (signal.aborted) return;
      consecutiveFailures.value = 0;
      if (!result) {
        extrasById.delete(id);
        phoneCall.removeVoiceMessage(id);
        return;
      }
      const extra = mergeExtra(id, result.tone);
      extrasById.delete(id);
      if (isRetry) phoneCall.requeueVoiceMessage(id, result.text, extra);
      else phoneCall.resolveVoicePlaceholder(id, result.text, extra);
    } catch (err) {
      if (signal.aborted) return;
      console.warn("[callVoice] 辨識失敗:", err);
      consecutiveFailures.value++;
      failedClips.set(id, wav);
      phoneCall.failVoicePlaceholder(id);
    } finally {
      if (!signal.aborted) {
        pendingCount.value = Math.max(0, pendingCount.value - 1);
        maybeSubmitTurn();
      }
    }
  }

  /** 上一則角色訊息之後，有沒有已完成的語音訊息 */
  function hasNewVoiceMessage(): boolean {
    const messages = phoneCall.callMessages;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "ai") return false;
      if (m.role === "user" && m.viaVoice && !m.voiceStatus) return true;
    }
    return false;
  }

  /** 講完了、辨識也都回來了 → 關麥並讓角色回覆 */
  function maybeSubmitTurn(): void {
    if (!micEnabled.value || speaking.value || pendingCount.value > 0) return;
    if (!callConnected.value || phoneCall.aiTurnActive || !hasNewVoiceMessage()) return;
    stopMic(); // iOS 播放語音前必須真的釋放麥克風
    void phoneCall.triggerAIResponse().finally(syncMic);
  }

  // ===== 使用者操作（都在點擊當下呼叫） =====
  function toggleMic(): void {
    primeCallAudioContext();
    if (micEnabled.value && startError.value && startError.value !== "unsupported") {
      startError.value = null; // 出錯時點一下＝重試
    } else {
      micEnabled.value = !micEnabled.value;
      writeFlag(MIC_INTENT_KEY, micEnabled.value);
      startError.value = null;
    }
    syncMic();
  }

  function acknowledgeNotice(): void {
    primeCallAudioContext();
    noticeSeen.value = true;
    writeFlag(NOTICE_SEEN_KEY, true);
    syncMic();
  }

  function declineNotice(): void {
    noticeSeen.value = true;
    writeFlag(NOTICE_SEEN_KEY, true);
    micEnabled.value = false;
    writeFlag(MIC_INTENT_KEY, false);
    syncMic();
  }

  function retryFailed(id: string): void {
    const wav = failedClips.get(id);
    if (!wav) return;
    failedClips.delete(id);
    phoneCall.markVoicePending(id);
    void transcribe(id, wav, true);
  }

  function discardFailed(id: string): void {
    failedClips.delete(id);
    extrasById.delete(id);
    phoneCall.removeVoiceMessage(id);
    maybeSubmitTurn();
  }

  function interrupt(): void {
    phoneCall.interruptAiSpeech();
  }

  /** 通話畫面註冊「要附加到語音訊息的欄位」，回傳取消註冊的函式 */
  function registerExtraProvider(provider: ExtraProvider): () => void {
    extraProvider = provider;
    return () => {
      if (extraProvider === provider) extraProvider = null;
    };
  }

  // ===== 通話生命週期 =====
  function resetSession(): void {
    session.abort();
    session = new AbortController();
    stopMic();
    mic = null;
    failedClips.clear();
    extrasById.clear();
    pendingCount.value = 0;
    consecutiveFailures.value = 0;
    startError.value = null;
    micEnabled.value = readFlag(MIC_INTENT_KEY, true);
  }

  watch(
    () => phoneCall.activeCall,
    (current, previous) => {
      if (current && current !== previous) resetSession();
    },
    { flush: "sync" },
  );

  watch(
    () => phoneCall.callState,
    (state) => {
      if (state === "ended" || state === "rejected") {
        resetSession();
        closeCallAudioContext();
      }
    },
    { flush: "sync" },
  );

  watch(wantMic, () => syncMic(), { flush: "sync", immediate: true });

  watch(
    () =>
      [settings.callVoiceInput.endSilenceMs, settings.callVoiceInput.sensitivity] as const,
    ([endSilenceMs, sensitivity]) => mic?.updateOptions({ endSilenceMs, sensitivity }),
  );

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      pageVisible.value = isPageVisible();
      // 回到前景時，之前「被佔用」的錯誤再試一次
      if (pageVisible.value && startError.value === "busy") startError.value = null;
    });
  }

  return {
    micEnabled,
    phase,
    level,
    showFailureBanner,
    isUserBusy,
    toggleMic,
    acknowledgeNotice,
    declineNotice,
    retryFailed,
    discardFailed,
    interrupt,
    registerExtraProvider,
  };
});
