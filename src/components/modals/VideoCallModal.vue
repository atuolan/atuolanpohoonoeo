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

        <div class="local-video" :class="{ 'screen-sharing-active': screenShareEnabled }">
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

        <!-- 螢幕分享畫面：分享時顯示在主區域 -->
        <div v-if="screenShareEnabled" class="screen-share-view">
          <video
            ref="screenShareVideoEl"
            class="video-image screen-share-fit"
            autoplay
            playsinline
            muted
          />
          <div class="screen-share-label">
            螢幕分享中
            <span v-if="autoCaptureCountdown > 0" class="auto-capture-countdown">
              · {{ formatCountdown(autoCaptureCountdown) }} 後自動截圖
            </span>
          </div>
        </div>

        <!-- iOS fallback：上傳的圖片預覽 -->
        <div v-if="uploadedImagePreview" class="screen-share-view">
          <img
            :src="uploadedImagePreview"
            alt="上傳的圖片"
            class="video-image screen-share-fit"
          />
          <div class="screen-share-label uploaded-label">
            已附加圖片
            <button class="clear-upload-btn" @click="clearUploadedImage" title="移除圖片">✕</button>
          </div>
        </div>

        <!-- 隱藏的檔案選擇器（iOS fallback） -->
        <input
          ref="fileInputEl"
          type="file"
          accept="image/*"
          style="display: none"
          @change="handleImageUpload"
        />
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
          v-if="callState === 'connected' && supportsScreenShare"
          class="control-btn screen-share"
          :class="{ active: screenShareEnabled }"
          @click="toggleScreenShare"
          :title="screenShareEnabled ? '停止螢幕分享' : '分享螢幕'"
        >
          {{ screenShareEnabled ? '停止分享' : '螢幕' }}
        </button>

        <button
          v-if="callState === 'connected' && !supportsScreenShare"
          class="control-btn screen-share"
          :class="{ active: !!uploadedImagePreview }"
          @click="uploadedImagePreview ? clearUploadedImage() : triggerImageUpload()"
          :title="uploadedImagePreview ? '移除圖片' : '上傳圖片給 AI 看'"
        >
          {{ uploadedImagePreview ? '移除圖片' : '圖片' }}
        </button>

        <button
          v-if="callState === 'connected' && supportsPiP"
          class="control-btn pip"
          :class="{ active: pipActive }"
          @click="togglePiP"
          :title="pipActive ? '關閉子母畫面' : '子母畫面'"
        >
          {{ pipActive ? '關閉PiP' : 'PiP' }}
        </button>

        <button
          v-if="callState === 'connected' && ttsAvailable"
          class="control-btn speaker"
          :class="{ active: isSpeaker }"
          @click="toggleSpeaker"
          :title="isSpeaker ? '自動語音：開（點擊靜音）' : '自動語音：靜音（點擊開啟）'"
        >
          {{ isSpeaker ? '擴音' : '靜音' }}
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

// 螢幕分享
const screenShareVideoEl = ref<HTMLVideoElement | null>(null);
const screenShareStream = ref<MediaStream | null>(null);
const screenShareEnabled = ref(false);
const pipActive = ref(false);

// 定時自動截圖
const AUTO_CAPTURE_INTERVAL = 3 * 60; // 3 分鐘（秒）
let autoCaptureTimer: ReturnType<typeof setInterval> | null = null;
const autoCaptureCountdown = ref(0);

// iOS fallback：圖片上傳
const fileInputEl = ref<HTMLInputElement | null>(null);
const uploadedImageData = ref<string | null>(null);
const uploadedImagePreview = ref<string | null>(null);

const supportsScreenShare = computed(() => {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
});

const callState = computed(() => phoneCallStore.callState);
const callMessages = computed(() => phoneCallStore.callMessages);
const isGenerating = computed(() => phoneCallStore.isGenerating);
const isMuted = computed(() => phoneCallStore.isMuted);
const isSpeaker = computed(() => phoneCallStore.isSpeaker);
const ttsAvailable = computed(() => phoneCallStore.ttsAvailable);
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
  // 優先擷取螢幕分享畫面
  if (screenShareEnabled.value && screenShareVideoEl.value) {
    const captured = captureVideoElement(
      screenShareVideoEl.value,
      "用戶正在分享的螢幕畫面",
    );
    if (captured) return captured;
  }

  // 其次：iOS fallback 上傳的圖片
  if (uploadedImageData.value) {
    return {
      imageData: uploadedImageData.value,
      imageMimeType: "image/jpeg",
      imageCaption: "用戶上傳的圖片（截圖或照片）",
    };
  }

  // 最後：本地相機畫面
  if (!cameraEnabled.value || !localVideoEl.value) return null;
  return captureVideoElement(
    localVideoEl.value,
    "用戶在視訊通話中即時拍攝的自拍畫面",
  );
}

/** 從 <video> 元素擷取一幀 */
function captureVideoElement(
  video: HTMLVideoElement,
  caption: string,
): { imageData: string; imageMimeType: string; imageCaption: string } | null {
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
    imageCaption: caption,
  };
}

// ===== 螢幕分享 =====
async function startScreenShare() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getDisplayMedia) {
    console.warn("[螢幕分享] 此瀏覽器不支援 getDisplayMedia");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" } as any,
      audio: false,
    });

    screenShareStream.value = stream;
    screenShareEnabled.value = true;

    await nextTick();
    if (screenShareVideoEl.value) {
      screenShareVideoEl.value.srcObject = stream;
    }

    // 啟動定時自動截圖
    startAutoCapture();

    // 當使用者從瀏覽器原生 UI 停止分享時自動清理
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      stopScreenShare();
    });
  } catch (err) {
    console.warn("[螢幕分享] 使用者取消或失敗:", err);
    screenShareEnabled.value = false;
  }
}

function stopScreenShare() {
  stopAutoCapture();
  if (screenShareStream.value) {
    screenShareStream.value.getTracks().forEach((t) => t.stop());
    screenShareStream.value = null;
  }
  screenShareEnabled.value = false;
  if (screenShareVideoEl.value) {
    screenShareVideoEl.value.srcObject = null;
  }
}

// ===== 定時自動截圖 =====
function startAutoCapture() {
  stopAutoCapture();
  autoCaptureCountdown.value = AUTO_CAPTURE_INTERVAL;

  autoCaptureTimer = setInterval(() => {
    autoCaptureCountdown.value--;

    if (autoCaptureCountdown.value <= 0) {
      performAutoCapture();
      autoCaptureCountdown.value = AUTO_CAPTURE_INTERVAL;
    }
  }, 1000);
}

function stopAutoCapture() {
  if (autoCaptureTimer) {
    clearInterval(autoCaptureTimer);
    autoCaptureTimer = null;
  }
  autoCaptureCountdown.value = 0;
}

async function performAutoCapture() {
  if (!screenShareEnabled.value || !screenShareVideoEl.value) return;
  if (isGenerating.value) return; // AI 正在生成中，跳過這次

  const snapshot = captureVideoElement(
    screenShareVideoEl.value,
    "系統定時自動擷取的螢幕分享畫面",
  );
  if (!snapshot) return;

  console.log("[自動截圖] 擷取螢幕畫面並傳送給 AI");

  phoneCallStore.addUserMessage("我目前的螢幕畫面", {
    ...snapshot,
  });
  await phoneCallStore.triggerAIResponse();
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function toggleScreenShare() {
  if (screenShareEnabled.value) {
    stopScreenShare();
  } else {
    await startScreenShare();
  }
}

// ===== iOS fallback：圖片上傳 =====
function triggerImageUpload() {
  fileInputEl.value?.click();
}

function handleImageUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result as string;
    uploadedImagePreview.value = dataUrl;

    // 提取 base64 部分
    const base64 = dataUrl.split(",")[1];
    uploadedImageData.value = base64 || null;
  };
  reader.readAsDataURL(file);

  // 重設 input 以便再次選擇同一檔案
  input.value = "";
}

function clearUploadedImage() {
  uploadedImageData.value = null;
  uploadedImagePreview.value = null;
}

// ===== PiP 子母畫面 =====
const supportsPiP = computed(() => {
  return typeof document !== "undefined" && "pictureInPictureEnabled" in document;
});

async function togglePiP() {
  try {
    // 已在 PiP 模式，關閉
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      return;
    }

    // 優先使用螢幕分享的 video
    const targetVideo = screenShareEnabled.value
      ? screenShareVideoEl.value
      : localVideoEl.value;

    if (!targetVideo) {
      console.warn("[PiP] 沒有可用的視訊來源");
      return;
    }

    await targetVideo.requestPictureInPicture();
  } catch (err) {
    console.warn("[PiP] 失敗:", err);
  }
}

function exitPiP() {
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  pipActive.value = false;
}

function handleMinimize() {
  phoneCallStore.minimize();
}

function handleHangup() {
  exitPiP();
  stopScreenShare();
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
      exitPiP();
      stopScreenShare();
      stopLocalCamera();
    }
  },
  { immediate: false },
);

function onEnterPiP() { pipActive.value = true; }
function onLeavePiP() { pipActive.value = false; }

onMounted(() => {
  startLocalCamera();
  document.addEventListener("enterpictureinpicture", onEnterPiP);
  document.addEventListener("leavepictureinpicture", onLeavePiP);
});

onUnmounted(() => {
  exitPiP();
  stopScreenShare();
  stopLocalCamera();
  document.removeEventListener("enterpictureinpicture", onEnterPiP);
  document.removeEventListener("leavepictureinpicture", onLeavePiP);
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

// ===== 螢幕分享 =====
.screen-sharing-active {
  // 分享時本地攝影機縮小到左下角
  right: auto;
  left: 16px;
  bottom: 90px;
  top: auto;
  width: 120px;
  height: 90px;
  z-index: 3;

  @media (max-width: 768px) {
    width: 100px;
    height: 75px;
    bottom: 90px;
  }
}

.screen-share-view {
  position: absolute;
  inset: 0;
  z-index: 2;
  background: #0d0e11;
  display: flex;
  align-items: center;
  justify-content: center;
}

.screen-share-fit {
  object-fit: contain !important;
  background: #000;
}

.screen-share-label {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  color: #fff;
  background: rgba(229, 57, 53, 0.75);
  padding: 3px 12px;
  border-radius: 999px;
  z-index: 3;

  .auto-capture-countdown {
    opacity: 0.85;
    font-size: 11px;
  }

  &.uploaded-label {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(76, 175, 80, 0.8);
  }
}

.clear-upload-btn {
  background: none;
  border: none;
  color: #fff;
  font-size: 14px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  opacity: 0.85;

  &:hover {
    opacity: 1;
  }
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

  &.screen-share.active {
    background: #7c4dff;
  }

  &.pip.active {
    background: #ff9800;
  }

  &.hangup {
    background: #e53935;
  }
}
</style>
