/**
 * 設定頁「測試收音」：講一句話，顯示即時音量、辨識結果與判斷到的情緒
 * 不用打電話就能調整靈敏度；通話進行中停用，避免兩邊搶麥克風。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { recognizeUtterance } from "@/services/asr/recognizeUtterance";
import {
  closeCallAudioContext,
  isAudioCaptureSupported,
  primeCallAudioContext,
} from "@/services/voiceInput/audioContextPrimer";
import { MicCapture, MicStartFailure } from "@/services/voiceInput/micCapture";
import { DETECTOR_SAMPLE_RATE } from "@/services/voiceInput/utteranceDetector";
import { usePhoneCallStore } from "@/stores/phoneCall";
import { useSettingsStore } from "@/stores/settings";
import { pcmToWavBlob } from "@/utils/wav";

type TestStatus =
  | "idle"
  | "listening"
  | "recognizing"
  | "done"
  | "empty"
  | "noSpeech"
  | "failed"
  | "error";

const LISTEN_TIMEOUT_MS = 15000;

const MIC_ERROR_TEXT: Record<string, string> = {
  denied: "麥克風權限被拒，請到瀏覽器或系統設定允許",
  notFound: "找不到麥克風",
  busy: "麥克風被其他程式佔用",
  needsTap: "請再點一次「開始測試」",
  unsupported: "此瀏覽器不支援語音輸入",
};

export function useCallVoiceTest() {
  const settings = useSettingsStore();
  const phoneCall = usePhoneCallStore();
  const supported = isAudioCaptureSupported();

  const status = ref<TestStatus>("idle");
  const level = ref(0);
  const resultText = ref("");
  const resultTone = ref("");
  const errorText = ref("");

  let mic: MicCapture | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let token = 0;

  const running = computed(
    () => status.value === "listening" || status.value === "recognizing",
  );
  const disabled = computed(
    () => !supported || phoneCall.isActive || status.value === "recognizing",
  );

  const statusText = computed(() => {
    if (!supported) return "此瀏覽器不支援語音輸入";
    if (phoneCall.isActive) return "通話中無法測試";
    switch (status.value) {
      case "listening":
        return "請說一句話…";
      case "recognizing":
        return "辨識中…";
      case "done":
        return "辨識結果：";
      case "empty":
        return "沒有辨識出內容，可以調高靈敏度再試";
      case "noSpeech":
        return "15 秒內沒有偵測到說話，可以調高靈敏度再試";
      case "failed":
        return "辨識服務暫時連不上，請稍後再試";
      case "error":
        return errorText.value;
      default:
        return "按下開始後說一句話，確認收音和辨識是否正常";
    }
  });

  function release(): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    mic?.stop();
    mic = null;
    level.value = 0;
    // 通話中共用同一個 AudioContext，不能關
    if (!phoneCall.isActive) closeCallAudioContext();
  }

  async function start(): Promise<void> {
    const current = ++token;
    resultText.value = "";
    resultTone.value = "";
    errorText.value = "";
    status.value = "listening";
    const capture = new MicCapture({
      endSilenceMs: settings.callVoiceInput.endSilenceMs,
      sensitivity: settings.callVoiceInput.sensitivity,
    });
    mic = capture;
    timer = setTimeout(() => {
      if (current !== token || status.value !== "listening") return;
      release();
      status.value = "noSpeech";
    }, LISTEN_TIMEOUT_MS);
    try {
      await capture.start({
        onLevel: (value) => {
          if (current === token) level.value = value;
        },
        onEvent: (event) => {
          if (current !== token || event.type !== "utterance") return;
          release();
          void recognize(current, pcmToWavBlob(event.samples, DETECTOR_SAMPLE_RATE));
        },
      });
    } catch (err) {
      if (current !== token) return;
      release();
      const reason = err instanceof MicStartFailure ? err.reason : "busy";
      errorText.value = MIC_ERROR_TEXT[reason] ?? "麥克風啟動失敗";
      status.value = "error";
    }
  }

  async function recognize(current: number, wav: Blob): Promise<void> {
    status.value = "recognizing";
    try {
      const result = await recognizeUtterance(wav);
      if (current !== token) return;
      if (!result) {
        status.value = "empty";
        return;
      }
      resultText.value = result.text;
      resultTone.value = settings.callVoiceInput.autoTone ? (result.tone ?? "") : "";
      status.value = "done";
    } catch {
      if (current === token) status.value = "failed";
    }
  }

  function stop(): void {
    token++;
    release();
    if (running.value) status.value = "idle";
  }

  /** 按鈕：開始或停止（必須直接綁在點擊事件上，iOS 才能啟動音訊） */
  function toggle(): void {
    if (status.value === "listening") {
      stop();
      return;
    }
    if (disabled.value) return;
    primeCallAudioContext();
    void start();
  }

  // 測試途中有來電：立刻停止，讓通話使用麥克風
  watch(
    () => phoneCall.isActive,
    (active) => {
      if (active && running.value) stop();
    },
  );

  onBeforeUnmount(stop);

  return { status, statusText, level, resultText, resultTone, running, disabled, toggle };
}
