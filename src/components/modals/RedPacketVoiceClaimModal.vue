<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { Mic, MicOff, X, Send } from "lucide-vue-next";

const props = defineProps<{
  phrase: string;
  blessing?: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [text: string];
}>();

const inputText = ref("");
const isRecording = ref(false);
const recognitionError = ref("");

// Web Speech API（瀏覽器語音辨識）
const SpeechRecognitionCtor: any =
  (typeof window !== "undefined" &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)) ||
  null;
const supportsSpeech = computed(() => !!SpeechRecognitionCtor);
let recognition: any = null;

function startRecording() {
  if (!SpeechRecognitionCtor) return;
  recognitionError.value = "";
  recognition = new SpeechRecognitionCtor();
  recognition.lang = "zh-TW";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.onresult = (e: any) => {
    let transcript = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
    }
    inputText.value = transcript;
  };
  recognition.onerror = (e: any) => {
    recognitionError.value = `辨識失敗：${e.error || "未知錯誤"}`;
    isRecording.value = false;
  };
  recognition.onend = () => {
    isRecording.value = false;
  };
  try {
    recognition.start();
    isRecording.value = true;
  } catch (err) {
    recognitionError.value = "無法啟動麥克風";
    isRecording.value = false;
  }
}

function stopRecording() {
  if (recognition) {
    try {
      recognition.stop();
    } catch {}
  }
  isRecording.value = false;
}

function handleSubmit() {
  const text = inputText.value.trim();
  if (!text) return;
  emit("submit", text);
}

function handleClose() {
  stopRecording();
  emit("close");
}

onUnmounted(() => {
  stopRecording();
});
</script>

<template>
  <div class="rp-voice-overlay" @click.self="handleClose">
    <div class="rp-voice-modal">
      <button class="close-btn" @click="handleClose">
        <X :size="20" />
      </button>

      <div class="rp-voice-header">
        <div class="rp-voice-title">語音紅包</div>
        <div v-if="blessing" class="rp-voice-blessing">{{ blessing }}</div>
      </div>

      <div class="rp-voice-prompt">
        <div class="prompt-label">需要說的話：</div>
        <div class="prompt-text">{{ phrase }}</div>
      </div>

      <div class="rp-voice-input-area">
        <textarea
          v-model="inputText"
          class="voice-input"
          placeholder="輸入或按下方麥克風直接錄音…"
          rows="2"
        ></textarea>
        <div class="input-hint">簡繁體、不同說法都可以，跟著感覺說就行</div>
      </div>

      <div class="rp-voice-actions">
        <button
          v-if="supportsSpeech"
          class="btn-record"
          :class="{ recording: isRecording }"
          @click="isRecording ? stopRecording() : startRecording()"
        >
          <component :is="isRecording ? MicOff : Mic" :size="18" />
          {{ isRecording ? "停止錄音" : "語音輸入" }}
        </button>
        <button
          class="btn-submit"
          :disabled="!inputText.trim()"
          @click="handleSubmit"
        >
          <Send :size="16" /> 領取
        </button>
      </div>

      <div v-if="recognitionError" class="error-text">{{ recognitionError }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.rp-voice-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.rp-voice-modal {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border: 3px solid #222;
  border-radius: 8px;
  padding: 20px 18px 16px;
  position: relative;
  font-family: "Courier New", monospace;
  color: #222;
}

.close-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
  &:hover { color: #000; }
}

.rp-voice-header {
  background: #ef4444;
  color: #fff;
  padding: 10px 12px;
  border: 3px solid #222;
  margin: -8px -8px 14px;
  text-align: center;

  .rp-voice-title {
    font-size: 16px;
    font-weight: bold;
    letter-spacing: 1px;
  }
  .rp-voice-blessing {
    font-size: 12px;
    margin-top: 4px;
    opacity: 0.95;
  }
}

.rp-voice-prompt {
  border: 2px dashed #ef4444;
  padding: 10px;
  margin-bottom: 12px;
  background: #fff8f8;
  border-radius: 4px;

  .prompt-label {
    font-size: 11px;
    color: #888;
    margin-bottom: 4px;
  }
  .prompt-text {
    font-size: 15px;
    font-weight: bold;
    color: #b91c1c;
    word-break: break-word;
  }
}

.rp-voice-input-area {
  margin-bottom: 12px;

  .voice-input {
    width: 100%;
    border: 2px solid #222;
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 14px;
    font-family: inherit;
    resize: vertical;
    box-sizing: border-box;
    outline: none;
    &:focus { border-color: #ef4444; }
  }
  .input-hint {
    margin-top: 6px;
    font-size: 11px;
    color: #888;
    &.matched { color: #16a34a; font-weight: bold; }
  }
}

.rp-voice-actions {
  display: flex;
  gap: 8px;

  button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px;
    border: 2px solid #222;
    border-radius: 4px;
    font-family: inherit;
    font-weight: bold;
    cursor: pointer;
    background: #fff;
    transition: background 0.15s;
    &:hover:not(:disabled) { background: #f0f0f0; }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  .btn-record.recording {
    background: #fee2e2;
    color: #b91c1c;
    border-color: #b91c1c;
  }
  .btn-submit {
    background: #ef4444;
    color: #fff;
    border-color: #b91c1c;
    &:hover:not(:disabled) { background: #dc2626; }
  }
}

.error-text {
  margin-top: 8px;
  color: #b91c1c;
  font-size: 11px;
  text-align: center;
}
</style>
