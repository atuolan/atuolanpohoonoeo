/**
 * 通話畫面共用的語音輸入狀態：狀態文字、麥克風鍵外觀與點擊行為
 * PhoneCallModal、VideoCallModal、GlobalPhoneCallBar 共用。
 */
import { computed } from "vue";
import { useCallVoiceInputStore, type VoicePhase } from "@/stores/callVoiceInput";
import { usePhoneCallStore } from "@/stores/phoneCall";

export type MicButtonState =
  | "listening"
  | "speaking"
  | "paused"
  | "muted"
  | "error"
  | "attention";

export function micButtonStateFor(phase: VoicePhase): MicButtonState {
  switch (phase) {
    case "listening":
      return "listening";
    case "speaking":
      return "speaking";
    case "paused":
      return "paused";
    case "denied":
    case "notFound":
    case "unsupported":
      return "error";
    case "needsTap":
    case "busy":
    case "notice":
      return "attention";
    default:
      return "muted";
  }
}

export function voiceStatusTextFor(
  phase: VoicePhase,
  ctx: { generating: boolean; canInterrupt: boolean },
): string {
  switch (phase) {
    case "listening":
      return "聆聽中…";
    case "speaking":
      return "你在說話…";
    case "paused":
      if (ctx.generating) return "角色思考中…";
      return ctx.canInterrupt ? "角色說話中 · 點此打斷" : "請稍候…";
    case "notice":
      return "可以直接用說的";
    case "needsTap":
      return "點麥克風開始收音";
    case "denied":
      return "麥克風權限被拒";
    case "notFound":
      return "找不到麥克風";
    case "busy":
      return "麥克風被佔用";
    case "unsupported":
      return "此瀏覽器不支援語音輸入";
    default:
      return "麥克風已關";
  }
}

const ERROR_TOASTS: Partial<Record<VoicePhase, string>> = {
  denied: "麥克風權限被拒，請到瀏覽器或系統設定允許；仍可以打字",
  notFound: "找不到麥克風；仍可以打字",
  unsupported: "此瀏覽器不支援語音輸入，可以改用打字",
};

function showCallToast(message: string): void {
  if (typeof document === "undefined") return;
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = [
    "position: fixed",
    "left: 50%",
    "bottom: calc(150px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))",
    "transform: translateX(-50%)",
    "max-width: 80vw",
    "background: rgba(0, 0, 0, 0.82)",
    "color: #fff",
    "padding: 10px 16px",
    "border-radius: 12px",
    "font-size: 14px",
    "line-height: 1.4",
    "text-align: center",
    "z-index: 10000",
    "pointer-events: none",
    "transition: opacity 0.3s",
  ].join(";");
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

export function useCallVoiceUi() {
  const voice = useCallVoiceInputStore();
  const phoneCall = usePhoneCallStore();

  /** 角色正在播語音（不是生成中）：狀態列可以點來打斷 */
  const canInterrupt = computed(
    () =>
      voice.phase === "paused" &&
      !phoneCall.isGenerating &&
      (phoneCall.playingMessageId !== null || phoneCall.synthesizingMessageId !== null),
  );

  const statusText = computed(() =>
    voiceStatusTextFor(voice.phase, {
      generating: phoneCall.isGenerating,
      canInterrupt: canInterrupt.value,
    }),
  );

  const micButtonState = computed(() => micButtonStateFor(voice.phase));

  const micTitle = computed(() => {
    switch (micButtonState.value) {
      case "muted":
        return "麥克風已關（點擊開啟）";
      case "error":
      case "attention":
        return statusText.value;
      default:
        return "麥克風開啟中（點擊靜音）";
    }
  });

  /** 外圈光暈大小（0–1），只在收音時有值 */
  const micLevelStyle = computed(() => ({
    "--mic-level":
      voice.phase === "listening" || voice.phase === "speaking" ? voice.level.toFixed(2) : "0",
  }));

  const inputListening = computed(
    () => voice.phase === "listening" || voice.phase === "speaking",
  );

  /** 麥克風鍵（必須直接綁在點擊事件上：iOS 要在點擊當下啟動音訊） */
  function onMicButton(): void {
    if (voice.phase === "notice") {
      voice.acknowledgeNotice();
      return;
    }
    const toast = ERROR_TOASTS[voice.phase];
    if (toast) showCallToast(toast);
    if (voice.phase === "unsupported") return;
    voice.toggleMic();
  }

  function onStatusClick(): void {
    if (canInterrupt.value) voice.interrupt();
  }

  return {
    voice,
    statusText,
    canInterrupt,
    micButtonState,
    micTitle,
    micLevelStyle,
    inputListening,
    onMicButton,
    onStatusClick,
  };
}
