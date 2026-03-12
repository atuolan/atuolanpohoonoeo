<template>
  <div class="phone-call-overlay" @click.self="handleMinimize">
    <div class="phone-call-container" :class="callState">
      <!-- 縮小按鈕 -->
      <button class="minimize-btn" @click="handleMinimize" title="縮小">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13H5v-2h14v2z" />
        </svg>
      </button>

      <!-- 背景模糊效果 -->
      <div class="call-background">
        <!-- 角色專屬背景 -->
        <div
          v-if="characterAvatar"
          class="character-bg-img"
          :style="{ backgroundImage: `url(${characterAvatar})` }"
        ></div>
        <div class="blur-circle c1"></div>
        <div class="blur-circle c2"></div>
      </div>

      <!-- 通話版面容器 -->
      <div class="call-layout">
        <!-- 側邊欄 (手機版為頂部資訊區) -->
        <div class="call-sidebar">
          <div class="avatar-section">
            <div
              class="avatar-ring"
              :class="{
                pulsing: callState === 'ringing' || callState === 'connected',
              }"
            >
              <div class="avatar">
                <img
                  v-if="characterAvatar"
                  :src="characterAvatar"
                  :alt="characterName"
                />
                <div v-else class="avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                </div>
              </div>
            </div>
            <h2 class="character-name">{{ characterName }}</h2>
            <p class="call-status">{{ statusText }}</p>
            <!-- 拒接原因 -->
            <div v-if="callState === 'rejected'" class="reject-reason">
              「{{ rejectReason }}」
            </div>
            <!-- 通話時長顯示於此 -->
            <div v-if="callState === 'connected'" class="call-duration">
              {{ formattedDuration }}
            </div>
          </div>
        </div>

        <!-- 主內容區 (僅在通話接通時顯示) -->
        <div v-if="callState === 'connected'" class="call-main">
          <!-- 通話對話區域 -->
          <div class="call-messages" ref="messagesContainer">
            <template v-for="msg in callMessages" :key="msg.id">
              <!-- 系統提示（居中顯示） -->
              <div v-if="msg.role === 'system'" class="call-system-hint">
                {{ msg.content }}
              </div>
              <!-- 用戶/AI 訊息氣泡 -->
              <div v-else class="call-message" :class="msg.role">
                <div class="message-content">
                  <span v-if="msg.isStreaming" class="streaming-indicator">
                    <span class="dot"></span>
                    <span class="dot"></span>
                    <span class="dot"></span>
                  </span>
                  <template v-else>
                    <span v-if="msg.tone" class="message-tone"
                      >（{{ msg.tone }}）</span
                    >
                    <span>{{ msg.content }}</span>
                  </template>
                </div>
              </div>
            </template>
          </div>

          <!-- 語音輸入區域 -->
          <div class="voice-input-section">
            <div class="input-capsule">
              <input
                v-model="toneText"
                type="text"
                class="tone-input"
                placeholder="語氣（可選）：例如撒嬌、生氣、疲憊"
                :disabled="isGenerating"
              />
              <div class="input-row">
                <input
                  v-model="inputText"
                  type="text"
                  class="voice-input"
                  placeholder="說些什麼...（Enter 只發送文字，空白 Enter 觸發回覆）"
                  @keydown.enter="handleEnterSubmit"
                  :disabled="isGenerating"
                />
                <button
                  class="send-btn"
                  @click="sendAndTriggerAI"
                  :disabled="
                    isGenerating ||
                    (!inputText.trim() && !canTriggerManualResponse)
                  "
                  title="送出（可帶文字）並觸發 AI 回覆"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 通話控制按鈕 -->
      <div class="call-controls">
        <div class="controls-dock">
          <!-- 撥號中：只有掛斷按鈕（角色會自動接聽） -->
          <template v-if="callState === 'ringing'">
            <button class="control-btn hangup large" @click="handleHangup">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
                />
              </svg>
            </button>
          </template>

          <!-- 通話中：靜音/掛斷 -->
          <template v-else-if="callState === 'connected'">
            <button
              class="control-btn mute"
              :class="{ active: isMuted }"
              @click="toggleMute"
            >
              <svg v-if="isMuted" viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"
                />
              </svg>
            </button>
            <button
              class="control-btn regen"
              :disabled="!canRegenerateLastAi"
              @click="handleRegenerate"
              title="重生上一輪回覆"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 6V3L8 7l4 4V8c2.76 0 5 2.24 5 5 0 .34-.03.67-.1.99l1.53 1.2c.36-.93.57-1.94.57-3.02 0-3.87-3.13-7-7-7zm-5.43.83L5.04 8.04C4.68 8.97 4.47 9.98 4.47 11.06c0 3.87 3.13 7 7 7v3l4-4-4-4v3c-2.76 0-5-2.24-5-5 0-.34.03-.67.1-.99z"
                />
              </svg>
            </button>
            <button class="control-btn hangup large" @click="handleHangup">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
                />
              </svg>
            </button>
            <button
              class="control-btn speaker"
              :class="{ active: isSpeaker }"
              @click="toggleSpeaker"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                />
              </svg>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { usePhoneCallStore } from "@/stores/phoneCall";
import { computed, nextTick, ref, watch } from "vue";

const phoneCallStore = usePhoneCallStore();

// 本地 UI 狀態
const inputText = ref("");
const messagesContainer = ref<HTMLElement | null>(null);
const toneText = ref("");

// 從 store 讀取狀態
const callState = computed(() => phoneCallStore.callState);
const callMessages = computed(() => phoneCallStore.callMessages);
const isGenerating = computed(() => phoneCallStore.isGenerating);
const isMuted = computed(() => phoneCallStore.isMuted);
const isSpeaker = computed(() => phoneCallStore.isSpeaker);
const rejectReason = computed(() => phoneCallStore.rejectReason);
const formattedDuration = computed(() => phoneCallStore.formattedDuration);
const canRegenerateLastAi = computed(() => phoneCallStore.canRegenerateLastAi);
const canTriggerManualResponse = computed(
  () => phoneCallStore.canTriggerManualResponse,
);
const characterName = computed(
  () => phoneCallStore.activeCall?.characterName ?? "",
);
const characterAvatar = computed(
  () => phoneCallStore.activeCall?.characterAvatar,
);

const statusText = computed(() => {
  const info = phoneCallStore.activeCall;
  switch (callState.value) {
    case "ringing":
      return info?.isIncoming
        ? `${characterName.value} 來電中...`
        : `正在撥打給 ${characterName.value}...`;
    case "connected":
      return "通話中";
    case "ended":
      return "通話結束";
    case "rejected":
      return info?.isIncoming ? "您拒絕了來電" : "對方拒絕接聽";
    default:
      return "";
  }
});

// 訊息更新時自動滾到底部
watch(
  callMessages,
  () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop =
          messagesContainer.value.scrollHeight;
      }
    });
  },
  { deep: true },
);

function handleHangup() {
  phoneCallStore.endCall();
}
function handleMinimize() {
  phoneCallStore.minimize();
}

function addUserMessageOnly() {
  const text = inputText.value.trim();
  if (!text) return false;

  const ok = phoneCallStore.addUserMessage(text, {
    tone: toneText.value.trim() || undefined,
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

function toggleMute() {
  phoneCallStore.toggleMuteState();
}
function toggleSpeaker() {
  phoneCallStore.toggleSpeakerState();
}
async function handleRegenerate() {
  await phoneCallStore.regenerateLastAiResponse();
}
</script>

<style lang="scss" scoped>
.phone-call-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.phone-call-container {
  position: relative;
  width: 100%;
  max-width: 400px;
  height: 100%;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 480px) {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

  // 電腦版 "連通" 狀態擴展為寬版
  &.connected {
    @media (min-width: 768px) {
      max-width: 900px;
      max-height: 600px;
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }
  }
}

// 背景效果
.call-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: 0;

  .character-bg-img {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-size: cover;
    background-position: center;
    opacity: 0.15; /* 透明度 85% */
    mask-image: radial-gradient(circle at center, black 30%, transparent 80%);
    -webkit-mask-image: radial-gradient(
      circle at center,
      black 30%,
      transparent 80%
    );
    z-index: 1;
    filter: grayscale(20%);
  }

  .blur-circle {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.6;
    z-index: 0; /* 確保在圖片下方 */

    &.c1 {
      width: 300px;
      height: 300px;
      background: var(--color-primary, #7dd3a8);
      top: -100px;
      left: -50px;
      animation: float1 8s ease-in-out infinite;
    }

    &.c2 {
      width: 250px;
      height: 250px;
      background: var(--color-secondary, #f5a9b8);
      bottom: -50px;
      right: -50px;
      animation: float2 10s ease-in-out infinite;
    }
  }
}

@keyframes float1 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(30px, 20px);
  }
}

@keyframes float2 {
  0%,
  100% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(-20px, -30px);
  }
}

// 佈局容器
.call-layout {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  // 電腦版 "連通" 狀態橫向排列
  @media (min-width: 768px) {
    .phone-call-container.connected & {
      flex-direction: row;
    }
  }
}

// 側邊欄 (頭像與狀態)
.call-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: calc(40px + env(safe-area-inset-top, 0px)) 24px 20px;

  // 電腦版 "連通" 狀態樣式
  @media (min-width: 768px) {
    .phone-call-container.connected & {
      width: 320px;
      background: rgba(0, 0, 0, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      justify-content: center;
      padding: 0;
    }
  }
}

// 頭像區域
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;

  .avatar-ring {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    padding: 4px;
    background: rgba(255, 255, 255, 0.2);
    margin-bottom: 16px;
    transition: all 0.3s ease;

    &.pulsing {
      animation: pulse 2s ease-in-out infinite;
    }

    // 電腦版連通時頭像稍微變大
    @media (min-width: 768px) {
      .phone-call-container.connected & {
        width: 140px;
        height: 140px;
      }
    }
  }

  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.1);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 50%;
        height: 50%;
        fill: rgba(255, 255, 255, 0.5);
      }
    }
  }

  .character-name {
    margin: 0 0 8px;
    font-size: 24px;
    font-weight: 600;
    color: white;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }

  .call-status {
    margin: 0;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.7);
  }

  .call-duration {
    margin-top: 12px;
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 12px;
    border-radius: 12px;
  }

  .reject-reason {
    margin-top: 16px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.8);
    font-style: italic;
    text-align: center;
    max-width: 280px;
    line-height: 1.5;
    animation: fadeInUp 0.5s ease;
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.4);
  }
  50% {
    box-shadow: 0 0 0 15px rgba(255, 255, 255, 0);
  }
}

// 主內容區
.call-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

// 通話訊息區域
.call-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
}

// 系統提示（居中顯示）
.call-system-hint {
  align-self: center;
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  padding: 8px 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  max-width: 80%;
  animation: fadeIn 0.3s ease;
}

.call-message {
  max-width: 85%;
  animation: slideIn 0.3s ease;

  &.user {
    align-self: flex-end;

    .message-content {
      background: var(--color-primary, #7dd3a8);
      color: white;
      border-radius: 18px 18px 4px 18px;
    }
  }

  &.ai {
    align-self: flex-start;

    .message-content {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border-radius: 18px 18px 18px 4px;
      backdrop-filter: blur(10px);
    }
  }

  .message-content {
    padding: 12px 16px;
    font-size: 15px;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .message-tone {
    display: block;
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 4px;
    font-style: italic;
  }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 流式輸出指示器
.streaming-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 4px 0;

  .dot {
    width: 6px;
    height: 6px;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite;

    &:nth-child(1) {
      animation-delay: 0s;
    }
    &:nth-child(2) {
      animation-delay: 0.2s;
    }
    &:nth-child(3) {
      animation-delay: 0.4s;
    }
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    transform: translateY(0);
  }
  40% {
    transform: translateY(-6px);
  }
}

// 語音輸入區域
.voice-input-section {
  display: flex;
  justify-content: center;
  padding: 0 24px 16px;
  background: transparent;
  backdrop-filter: none;
  border-top: none;
  margin-top: auto;
  z-index: 10;
}

.input-capsule {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  max-width: 400px; /* 限制最大寬度，讓它看起來更精緻 */
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 20px;
  padding: 10px 10px 10px 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus-within {
    background: rgba(0, 0, 0, 0.7);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }

  .tone-input {
    width: 100%;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 13px;
    padding: 6px 6px;

    &::placeholder {
      color: rgba(255, 255, 255, 0.45);
    }
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .voice-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 15px;
    padding: 8px 6px;
    min-width: 0;

    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }
  }

  .send-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.2);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    flex-shrink: 0;

    svg {
      width: 18px;
      height: 18px;
      margin-left: 2px; /* 視覺微調 */
    }

    &:hover:not(:disabled) {
      background: var(--color-primary, #7dd3a8);
      transform: scale(1.1);
      box-shadow: 0 0 10px var(--color-primary, #7dd3a8);
    }

    &:disabled {
      opacity: 0.3;
      cursor: not-allowed;
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

// 通話控制按鈕 (區域)
.call-controls {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: center;
  padding: 0 24px 24px;
  padding-bottom: max(24px, env(safe-area-inset-bottom, 0px));
  background: transparent;
  pointer-events: none; /* 讓點擊穿透到背景，除非點到按鈕 */
}

// 控制面板 (Dock)
.controls-dock {
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 32px;
  padding: 10px 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  pointer-events: auto; /* 恢復按鈕點擊 */
  transition: all 0.3s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.5);
    transform: translateY(-2px);
    box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);
  }
}

.control-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); /* 彈性動畫 */
  backdrop-filter: blur(5px);
  background: rgba(255, 255, 255, 0.1);
  color: white;

  svg {
    width: 20px;
    height: 20px;
    transition: transform 0.3s ease;
  }

  &:hover {
    transform: scale(1.15);
    background: rgba(255, 255, 255, 0.2);

    svg {
      transform: scale(1.1);
    }
  }

  &:active {
    transform: scale(0.95);
  }

  // 掛斷按鈕
  &.hangup {
    background: rgba(239, 68, 68, 0.8);
    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);

    &:hover {
      background: #ef4444;
      box-shadow: 0 6px 20px rgba(239, 68, 68, 0.6);
    }

    &.large {
      width: 52px;
      height: 52px;

      svg {
        width: 24px;
        height: 24px;
      }
    }
  }

  // 接聽按鈕
  &.answer {
    background: rgba(34, 197, 94, 0.8);
    box-shadow: 0 4px 15px rgba(34, 197, 94, 0.4);

    &:hover {
      background: #22c55e;
      box-shadow: 0 6px 20px rgba(34, 197, 94, 0.6);
    }
  }

  // 靜音與擴音激活狀態
  &.mute.active {
    background: white;
    color: #ef4444;
    box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  }

  &.speaker.active {
    background: white;
    color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
  }
}

.minimize-btn {
  position: absolute;
  top: max(16px, env(safe-area-inset-top, 0px));
  left: max(16px, env(safe-area-inset-left, 0px));
  z-index: 20;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: background 0.2s;
  &:active {
    background: rgba(255, 255, 255, 0.3);
  }
  svg {
    width: 20px;
    height: 20px;
  }
}

// 響應式調整
// 手機版保持原樣但套用樣式
@media (max-width: 480px) {
  .call-controls {
    padding-bottom: max(32px, env(safe-area-inset-bottom, 0px));
  }

  .controls-dock {
    gap: 16px;
    padding: 10px 20px;
    border-radius: 32px;
  }

  .control-btn {
    width: 48px;
    height: 48px;

    &.hangup.large {
      width: 56px;
      height: 56px;
    }
  }
}

// 響應式調整
// 手機版保持原樣
@media (max-width: 480px) {
  .phone-call-container.connected {
    .call-sidebar {
      padding: calc(10px + env(safe-area-inset-top, 0px)) 0 10px;
      flex: 0 0 auto;

      .avatar-ring {
        width: 80px;
        height: 80px;
        margin-bottom: 8px;
      }

      .character-name {
        font-size: 18px;
        margin-bottom: 4px;
      }

      .call-status {
        font-size: 12px;
      }

      .call-duration {
        font-size: 14px;
        margin-top: 4px;
      }
    }

    .call-messages {
      padding: 16px;
    }
  }
}
</style>
