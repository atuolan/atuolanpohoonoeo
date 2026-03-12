<template>
  <div class="video-call-overlay" @click.self="handleMinimize">
    <div class="video-call-container" :class="callState">
      <button class="minimize-btn" @click="handleMinimize" title="縮小">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13H5v-2h14v2z" />
        </svg>
      </button>

      <div class="video-stage">
        <div class="remote-video">
          <img
            v-if="remoteImageUrl"
            :src="remoteImageUrl"
            :alt="`${characterName} 視訊畫面`"
            class="video-image"
          />
          <div v-else class="video-placeholder">
            <span>{{ characterName || "對方" }} 暫無畫面</span>
          </div>
          <div class="remote-label">{{ characterName || "對方" }}</div>
        </div>

        <div class="local-video">
          <video
            v-if="cameraEnabled"
            ref="localVideoEl"
            class="video-image"
            autoplay
            playsinline
            muted
          />
          <img
            v-else-if="localImageUrl"
            :src="localImageUrl"
            alt="我的視訊畫面"
            class="video-image"
          />
          <div v-else class="video-placeholder small">
            <span>我的畫面</span>
          </div>
          <div class="local-label">你</div>
        </div>
      </div>

      <div class="status-bar">
        <h3 class="name">{{ characterName || "角色" }}</h3>
        <p class="status">{{ statusText }}</p>
        <p v-if="callState === 'connected'" class="duration">{{ formattedDuration }}</p>
      </div>

      <div v-if="callState === 'connected'" class="message-panel">
        <div class="message-list" ref="messagesContainer">
          <template v-for="msg in callMessages" :key="msg.id">
            <div v-if="msg.role === 'system'" class="msg system">{{ msg.content }}</div>
            <div v-else class="msg" :class="msg.role">
              <span v-if="msg.tone" class="tone">（{{ msg.tone }}）</span>
              <span>{{ msg.content || (msg.isStreaming ? "正在思考..." : "") }}</span>
              <span v-if="msg.isStreaming" class="stream-caret">▌</span>
            </div>
          </template>
        </div>

        <div class="message-input-wrap">
          <input
            v-model="toneText"
            class="tone-input"
            type="text"
            placeholder="語氣（可選）：撒嬌 / 冷淡 / 生氣..."
            :disabled="isGenerating"
          />
          <div class="input-row">
            <input
              v-model="inputText"
              class="message-input"
              type="text"
              placeholder="輸入訊息（Enter 只發送文字，空白 Enter 觸發回覆）"
              :disabled="isGenerating"
              @keydown.enter="handleEnterSubmit"
            />
            <button
              class="message-send"
              :disabled="isGenerating || (!inputText.trim() && !canTriggerManualResponse)"
              @click="sendAndTriggerAI"
            >
              發送
            </button>
          </div>
        </div>
      </div>

      <div class="controls-dock" v-if="callState === 'connected' || callState === 'ringing'">
        <button
          v-if="callState === 'connected'"
          class="control-btn mute"
          :class="{ active: isMuted }"
          @click="toggleMute"
        >
          靜音
        </button>

        <button
          v-if="callState === 'connected'"
          class="control-btn regen"
          :disabled="!canRegenerateLastAi"
          @click="handleRegenerate"
          title="重生上一輪回覆"
        >
          重生
        </button>

        <button class="control-btn hangup" @click="handleHangup">掛斷</button>

        <button
          v-if="callState === 'connected'"
          class="control-btn speaker"
          :class="{ active: isSpeaker }"
          @click="toggleSpeaker"
        >
          擴音
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePhoneCallStore } from "@/stores/phoneCall";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

const phoneCallStore = usePhoneCallStore();

const inputText = ref("");
const toneText = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const localVideoEl = ref<HTMLVideoElement | null>(null);
const localStream = ref<MediaStream | null>(null);
const cameraEnabled = ref(false);

const callState = computed(() => phoneCallStore.callState);
const callMessages = computed(() => phoneCallStore.callMessages);
const isGenerating = computed(() => phoneCallStore.isGenerating);
const isMuted = computed(() => phoneCallStore.isMuted);
const isSpeaker = computed(() => phoneCallStore.isSpeaker);
const formattedDuration = computed(() => phoneCallStore.formattedDuration);
const canRegenerateLastAi = computed(() => phoneCallStore.canRegenerateLastAi);
const canTriggerManualResponse = computed(() => phoneCallStore.canTriggerManualResponse);
const characterName = computed(() => phoneCallStore.activeCall?.characterName ?? "");
const remoteImageUrl = computed(() => phoneCallStore.videoSession.remoteImageUrl);
const localImageUrl = computed(() => phoneCallStore.videoSession.localImageUrl);

const statusText = computed(() => {
  switch (callState.value) {
    case "ringing":
      return `正在連線 ${characterName.value || "角色"}...`;
    case "connected":
      return "視訊通話中";
    case "rejected":
      return "對方拒絕接聽";
    case "ended":
      return "通話結束";
    default:
      return "";
  }
});

watch(
  callMessages,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
      }
    });
  },
  { deep: true },
);

function addUserMessageOnly() {
  const text = inputText.value.trim();
  if (!text) return false;

  const snapshot = captureLocalFrame();
  const ok = phoneCallStore.addUserMessage(text, {
    tone: toneText.value.trim() || undefined,
    ...(snapshot || {}),
  });

  if (ok) {
    inputText.value = "";
  }
  return ok;
}

async function sendAndTriggerAI() {
  addUserMessageOnly();
  await phoneCallStore.triggerAIResponse();
}

async function handleEnterSubmit() {
  if (!inputText.value.trim()) {
    await phoneCallStore.triggerAIResponse();
    return;
  }
  addUserMessageOnly();
}

async function startLocalCamera() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    });

    localStream.value = stream;
    cameraEnabled.value = true;

    await nextTick();
    if (localVideoEl.value) {
      localVideoEl.value.srcObject = stream;
    }
  } catch {
    cameraEnabled.value = false;
  }
}

function stopLocalCamera() {
  if (localStream.value) {
    localStream.value.getTracks().forEach((t) => t.stop());
    localStream.value = null;
  }
  cameraEnabled.value = false;
  if (localVideoEl.value) {
    localVideoEl.value.srcObject = null;
  }
}

function captureLocalFrame():
  | { imageData: string; imageMimeType: string; imageCaption: string }
  | null {
  if (!cameraEnabled.value || !localVideoEl.value) return null;

  const video = localVideoEl.value;
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
  const base64 = dataUrl.split(",")[1];
  if (!base64) return null;

  return {
    imageData: base64,
    imageMimeType: "image/jpeg",
    imageCaption: "用戶在視訊通話中即時拍攝的自拍畫面",
  };
}

function handleMinimize() {
  phoneCallStore.minimize();
}

function handleHangup() {
  stopLocalCamera();
  phoneCallStore.endCall();
}

function toggleMute() {
  phoneCallStore.toggleMuteState();
}

function toggleSpeaker() {
  phoneCallStore.toggleSpeakerState();
}

async function handleRegenerate() {
  await phoneCallStore.regenerateLastAiResponse();
}

watch(
  callState,
  (state) => {
    if (state === "ended" || state === "rejected") {
      stopLocalCamera();
    }
  },
  { immediate: false },
);

onMounted(() => {
  startLocalCamera();
});

onUnmounted(() => {
  stopLocalCamera();
});
</script>

<style scoped lang="scss">
.video-call-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
}

.video-call-container {
  position: relative;
  width: min(100vw, 980px);
  height: min(100dvh, 700px);
  border-radius: 20px;
  overflow: hidden;
  background: #101114;
  border: 1px solid rgba(255, 255, 255, 0.12);

  @media (max-width: 768px) {
    width: 100vw;
    height: 100dvh;
    border-radius: 0;
  }
}

.minimize-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  cursor: pointer;
}

.video-stage {
  position: absolute;
  inset: 0;
}

.remote-video {
  width: 100%;
  height: 100%;
  background: #1a1c21;
}

.local-video {
  position: absolute;
  right: 16px;
  top: 16px;
  width: 180px;
  height: 240px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: #15171b;

  @media (max-width: 768px) {
    width: 120px;
    height: 160px;
  }
}

.video-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;

  &.small {
    font-size: 12px;
  }
}

.remote-label,
.local-label {
  position: absolute;
  left: 10px;
  bottom: 8px;
  font-size: 12px;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  padding: 2px 8px;
  border-radius: 999px;
}

.local-label {
  bottom: 10px;
}

.status-bar {
  position: absolute;
  left: 18px;
  top: 16px;
  z-index: 4;
  color: #fff;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);

  .name {
    margin: 0;
    font-size: 20px;
    font-weight: 700;
  }

  .status,
  .duration {
    margin: 4px 0 0;
    font-size: 13px;
    opacity: 0.9;
  }
}

.message-panel {
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 80px;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 40%;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.msg {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  line-height: 1.45;

  &.system {
    text-align: center;
    background: rgba(255, 255, 255, 0.08);
  }

  &.user {
    margin-left: auto;
    width: fit-content;
    max-width: 80%;
    background: rgba(76, 175, 80, 0.35);
  }

  &.ai {
    margin-right: auto;
    width: fit-content;
    max-width: 80%;
    background: rgba(255, 255, 255, 0.16);
  }
}

.stream-caret {
  display: inline-block;
  margin-left: 2px;
  animation: blink 1s steps(1, end) infinite;
  opacity: 0.9;
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }

  50.01%,
  100% {
    opacity: 0;
  }
}

.tone {
  opacity: 0.8;
  margin-right: 4px;
}

.message-input-wrap {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tone-input {
  width: 100%;
  min-width: 0;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  padding: 0 14px;
  outline: none;
}

.input-row {
  display: flex;
  gap: 8px;
}

.message-input {
  flex: 1;
  height: 40px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  padding: 0 14px;
  outline: none;
}

.message-send {
  height: 40px;
  min-width: 68px;
  border-radius: 999px;
  border: 0;
  background: #1e88e5;
  color: #fff;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
}

.controls-dock {
  position: absolute;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 10px;
}

.control-btn {
  min-width: 72px;
  height: 40px;
  border-radius: 999px;
  border: 0;
  color: #fff;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.2);

  &.active {
    background: #4caf50;
  }

  &.hangup {
    background: #e53935;
  }
}
</style>
