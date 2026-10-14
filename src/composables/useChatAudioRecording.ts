import { computed, ref, type Ref, type ComputedRef } from "vue";
import {
  AudioRecorder,
  formatTime as formatAudioTime,
  isDurationValid,
} from "@/services/AudioRecorder";
import {
  formatRecognitionText,
  recognizeUtterance,
} from "@/services/asr/recognizeUtterance";
import { ensureApiSafeAudio } from "@/utils/audioConverter";
import {
  createAudioMessage,
  createAudioMessageNative,
} from "@/api/OpenAICompatible";
import { saveAudioBlob } from "@/db/operations";
import { useSettingsStore } from "@/stores";

interface Message {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  timestamp: number;
  messageType?: string;
  audioBlobId?: string;
  audioMimeType?: string;
  audioDuration?: number;
  audioWaveform?: number[];
  audioTranscript?: string;
  _audioBlob?: Blob;
  _audioDataUri?: string;
  [key: string]: any;
}

/**
 * 語音錄音交互功能
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatAudioRecording(deps: {
  messages: Ref<Message[]>;
  isGenerating: ComputedRef<boolean>;
  scrollToBottom: () => void;
  saveChatImmediate: () => Promise<void>;
  clearSwipesOnLastAIMessage: () => void;
  clearRoundSwipes: () => void;
  triggerAIResponse: (options?: { audioApiMessage?: any }) => Promise<void>;
}) {
  const settingsStore = useSettingsStore();
  const audioRecorder = new AudioRecorder();
  const isRecording = ref(false);
  const recordingDuration = ref(0);
  const recordingVolumeLevel = ref(0);
  const isCancelMode = ref(false);
  const recordingStartY = ref(0);
  const CANCEL_SLIDE_THRESHOLD = 80;
  const canRecord = ref(
    typeof MediaRecorder !== "undefined" &&
      typeof navigator?.mediaDevices?.getUserMedia === "function",
  );
  // 直接讀設定頁存的值（settingsStore.audio），設定改了立即生效
  const audioSettings = computed(() => settingsStore.audio);

  // ===== 文字輸入語音 =====
  const showTextVoiceModal = ref(false);
  const textVoiceInput = ref("");

  async function sendTextAsVoice() {
    const text = textVoiceInput.value.trim();
    if (!text) return;
    showTextVoiceModal.value = false;
    textVoiceInput.value = "";

    deps.clearSwipesOnLastAIMessage();
    deps.clearRoundSwipes();

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: `[語音訊息] ${text}`,
      timestamp: Date.now(),
      messageType: "audio",
      audioDuration: 0,
      audioWaveform: [],
      audioTranscript: text,
    };
    deps.messages.value.push(userMessage);
    deps.scrollToBottom();
    await deps.saveChatImmediate();
    await deps.triggerAIResponse();
  }

  // 長按/短按判定
  const LONG_PRESS_THRESHOLD = 300;
  let micDownTimestamp = 0;
  let micLongPressTimer: ReturnType<typeof setTimeout> | null = null;
  let micIsLongPress = false;

  function onMicDown(e: MouseEvent | TouchEvent) {
    micDownTimestamp = Date.now();
    micIsLongPress = false;
    micLongPressTimer = setTimeout(() => {
      micIsLongPress = true;
      startRecording(e);
    }, LONG_PRESS_THRESHOLD);
  }

  function onMicUp() {
    if (micLongPressTimer) {
      clearTimeout(micLongPressTimer);
      micLongPressTimer = null;
    }
    if (micIsLongPress || isRecording.value) {
      finishRecording();
    } else {
      showTextVoiceModal.value = true;
    }
  }

  async function startRecording(e: MouseEvent | TouchEvent) {
    if (isRecording.value || deps.isGenerating.value) return;

    if (e instanceof TouchEvent) {
      recordingStartY.value = e.touches[0].clientY;
    } else {
      recordingStartY.value = e.clientY;
    }

    audioRecorder.configure({
      maxDuration: audioSettings.value.maxDuration,
      quality: audioSettings.value.quality,
    });

    try {
      await audioRecorder.start({
        onVolumeUpdate: (level) => {
          recordingVolumeLevel.value = level;
        },
        onTimeUpdate: (seconds) => {
          recordingDuration.value = seconds;
        },
        onMaxDuration: () => {
          finishRecording();
        },
      });
      isRecording.value = true;
      isCancelMode.value = false;
      recordingDuration.value = 0;
      recordingVolumeLevel.value = 0;

      window.addEventListener("mousemove", onRecordingMove);
      window.addEventListener("mouseup", onRecordingEnd);
      window.addEventListener("touchmove", onRecordingMove);
      window.addEventListener("touchend", onRecordingEnd);
    } catch (err: any) {
      console.error("[ChatScreen] 錄音啟動失敗:", err);
      if (
        err.name === "NotAllowedError" ||
        err.name === "PermissionDeniedError"
      ) {
        showToast("需要麥克風權限才能錄音");
      } else {
        showToast("錄音啟動失敗");
      }
    }
  }

  function removeRecordingListeners() {
    window.removeEventListener("mousemove", onRecordingMove);
    window.removeEventListener("mouseup", onRecordingEnd);
    window.removeEventListener("touchmove", onRecordingMove);
    window.removeEventListener("touchend", onRecordingEnd);
  }

  function onRecordingMove(e: MouseEvent | TouchEvent) {
    if (!isRecording.value) return;
    let currentY: number;
    if (e instanceof TouchEvent) {
      currentY = e.touches[0].clientY;
    } else {
      currentY = e.clientY;
    }
    const deltaY = recordingStartY.value - currentY;
    isCancelMode.value = deltaY > CANCEL_SLIDE_THRESHOLD;
  }

  function onRecordingEnd() {
    removeRecordingListeners();
    finishRecording();
  }

  async function finishRecording() {
    if (!isRecording.value) return;
    removeRecordingListeners();

    if (isCancelMode.value) {
      audioRecorder.cancel();
      isRecording.value = false;
      isCancelMode.value = false;
      return;
    }

    try {
      const result = await audioRecorder.stop();
      isRecording.value = false;

      if (!isDurationValid(result.duration)) {
        showToast("錄音時間太短");
        return;
      }

      await sendVoiceMessage(result);
    } catch (err) {
      console.error("[ChatScreen] 停止錄音失敗:", err);
      isRecording.value = false;
      showToast("錄音失敗");
    }
  }

  async function sendVoiceMessage(result: {
    blob: Blob;
    dataUri: string;
    mimeType: string;
    duration: number;
    waveform: number[];
  }) {
    deps.clearSwipesOnLastAIMessage();
    deps.clearRoundSwipes();

    const audioBlobId = await saveAudioBlob(result.blob, result.mimeType);

    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: `🎤 語音訊息 (${formatAudioTime(result.duration)})`,
      timestamp: Date.now(),
      messageType: "audio",
      audioBlobId,
      audioMimeType: result.mimeType,
      audioDuration: result.duration,
      audioWaveform: result.waveform,
      _audioBlob: result.blob,
      _audioDataUri: result.dataUri,
    };
    deps.messages.value.push(userMessage);
    deps.scrollToBottom();

    // 錄音後自動轉文字：和通話同一套免 key 辨識（含咳嗽、笑聲與語氣），結果為繁體
    if (audioSettings.value.sttEnabled) {
      // 聊天錄音最長 5 分鐘，時限放寬
      recognizeUtterance(result.blob, { timeoutMs: 60000 })
        .then(async (recognized) => {
          if (!recognized) return;
          const transcript = formatRecognitionText(
            recognized,
            settingsStore.callVoiceInput.autoTone,
          );
          // 改畫面上（響應式）的那則訊息，畫面才會跟著更新
          const target = deps.messages.value.find((m) => m.id === userMessage.id);
          if (!target) return;
          target.audioTranscript = transcript;
          target.content = transcript;
          await deps.saveChatImmediate();
        })
        .catch((err) => {
          console.warn("[STT] 語音轉文字失敗:", err);
        });
    }

    await deps.saveChatImmediate();

    const safeAudio = await ensureApiSafeAudio(
      result.blob,
      result.mimeType,
      result.dataUri,
    );

    let apiAudioMessage;
    if (audioSettings.value.transmissionFormat === "input_audio") {
      const base64 = safeAudio.dataUri.split(",")[1] || "";
      const format = safeAudio.mimeType.split("/")[1]?.split(";")[0] || "wav";
      apiAudioMessage = createAudioMessageNative("", base64, format);
    } else {
      apiAudioMessage = createAudioMessage("", safeAudio.dataUri);
    }

    // 根據用戶要求，錄音結束後先將語音存入訊息對話中，不再自動觸發 AI 回覆
    // await deps.triggerAIResponse({ audioApiMessage: apiAudioMessage });
  }

  function showToast(message: string) {
    const toast = document.createElement("div");
    toast.className = "chat-toast";
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.75);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      transition: opacity 0.3s;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  return {
    // Refs
    isRecording,
    recordingDuration,
    recordingVolumeLevel,
    isCancelMode,
    canRecord,
    audioSettings,
    showTextVoiceModal,
    textVoiceInput,
    // Functions
    sendTextAsVoice,
    onMicDown,
    onMicUp,
    startRecording,
    finishRecording,
    showToast,
  };
}
