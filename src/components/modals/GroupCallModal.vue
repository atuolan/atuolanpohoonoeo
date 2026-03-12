<template>
  <Teleport to="body">
    <Transition name="call-fade">
      <div v-if="visible" class="group-call-overlay" @click.self="hangUp">
        <div class="group-call-container" :class="{ connected: true }">
          <!-- 背景模糊效果 -->
          <div class="call-background">
            <div class="blur-circle c1"></div>
            <div class="blur-circle c2"></div>
            <div class="blur-circle c3"></div>
          </div>

          <!-- 通話版面容器 -->
          <div class="call-layout">
            <!-- 側邊欄 (參與者區) -->
            <div class="call-sidebar">
              <div class="sidebar-content">
                <!-- 群名稱與狀態 -->
                <div class="call-info">
                  <h2 class="group-name">{{ groupName }}</h2>
                  <div class="call-status">
                    <span class="status-dot"></span>
                    <span class="status-text">群通話進行中</span>
                  </div>
                  <div class="call-duration">{{ formattedDuration }}</div>
                </div>

                <!-- 參與者頭像 -->
                <div class="participants-grid">
                  <div
                    v-for="participant in participants"
                    :key="participant.characterId"
                    class="participant"
                    :class="{ speaking: participant.isSpeaking }"
                  >
                    <div class="participant-avatar">
                      <img
                        v-if="participant.avatar"
                        :src="participant.avatar"
                        :alt="participant.name"
                      />
                      <div v-else class="avatar-placeholder">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path
                            d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                          />
                        </svg>
                      </div>
                      <div
                        v-if="participant.isSpeaking"
                        class="speaking-indicator"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor">
                          <path
                            d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"
                          />
                          <path
                            d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"
                          />
                        </svg>
                      </div>
                    </div>
                    <span class="participant-name">{{ participant.name }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 主內容區 -->
            <div class="call-main">
              <!-- 通話訊息區域 -->
              <div class="call-messages" ref="messagesContainer">
                <template v-for="(message, index) in callMessages" :key="index">
                  <!-- 系統提示 -->
                  <div
                    v-if="message.type === 'system'"
                    class="call-system-hint"
                  >
                    {{ message.content }}
                  </div>
                  <!-- 用戶訊息 -->
                  <div
                    v-else-if="message.type === 'user'"
                    class="call-message user"
                  >
                    <div class="message-content">
                      {{ message.content }}
                    </div>
                  </div>
                  <!-- 角色訊息 -->
                  <div v-else class="call-message ai">
                    <span class="sender-name">{{ message.senderName }}</span>
                    <div class="message-content">
                      {{ message.content }}
                    </div>
                  </div>
                </template>
                <!-- 自動對話倒數提示 -->
                <div
                  v-if="autoTalkCountdown > 0 && !isGenerating"
                  class="auto-talk-hint"
                >
                  {{ autoTalkCountdown }}秒後角色們會繼續聊天...
                </div>
              </div>

              <!-- 語音輸入區域 -->
              <div class="voice-input-section">
                <div class="input-capsule">
                  <input
                    ref="inputRef"
                    v-model="inputText"
                    type="text"
                    class="voice-input"
                    placeholder="說點什麼..."
                    :disabled="isGenerating"
                    @keydown.enter="handleSend"
                  />
                  <button
                    class="send-btn"
                    :disabled="!inputText.trim() || isGenerating"
                    @click="handleSend"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 通話控制按鈕 -->
          <div class="call-controls">
            <div class="controls-dock">
              <button class="control-btn hangup large" @click="hangUp">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";

interface Participant {
  characterId: string;
  name: string;
  avatar?: string;
  isSpeaking?: boolean;
}

interface CallMessage {
  type: "voice" | "system" | "user";
  senderName?: string;
  content: string;
  timestamp: number;
}

const props = defineProps<{
  visible: boolean;
  groupName: string;
  participants: Participant[];
  callMessages: CallMessage[];
  startedAt: number;
  isGenerating?: boolean;
}>();

const emit = defineEmits<{
  hangUp: [];
  sendMessage: [content: string];
  autoTalk: [];
}>();

const messagesContainer = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const inputText = ref("");

// 自動對話計時器
const AUTO_TALK_DELAY = 120; // 2 分鐘 = 120 秒
const autoTalkCountdown = ref(0);
let autoTalkTimer: number | null = null;
let countdownTimer: number | null = null;

// 通話時長
const duration = ref(0);
let durationInterval: number | null = null;

const formattedDuration = computed(() => {
  const minutes = Math.floor(duration.value / 60);
  const seconds = duration.value % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
});

// 重置自動對話計時器
function resetAutoTalkTimer() {
  if (autoTalkTimer) {
    clearTimeout(autoTalkTimer);
    autoTalkTimer = null;
  }
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  autoTalkCountdown.value = 0;

  if (props.visible && !props.isGenerating) {
    autoTalkCountdown.value = AUTO_TALK_DELAY;
    countdownTimer = window.setInterval(() => {
      if (autoTalkCountdown.value > 0) {
        autoTalkCountdown.value--;
      }
    }, 1000);
    autoTalkTimer = window.setTimeout(() => {
      if (props.visible && !props.isGenerating) {
        emit("autoTalk");
      }
    }, AUTO_TALK_DELAY * 1000);
  }
}

watch(
  () => props.visible,
  (newVal) => {
    if (newVal) {
      duration.value = Math.floor((Date.now() - props.startedAt) / 1000);
      durationInterval = window.setInterval(() => {
        duration.value++;
      }, 1000);
      resetAutoTalkTimer();
    } else {
      if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
      }
      duration.value = 0;
      if (autoTalkTimer) {
        clearTimeout(autoTalkTimer);
        autoTalkTimer = null;
      }
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      autoTalkCountdown.value = 0;
    }
  },
  { immediate: true },
);

watch(
  () => props.isGenerating,
  (newVal, oldVal) => {
    if (oldVal === true && newVal === false && props.visible) {
      resetAutoTalkTimer();
    }
    if (newVal === true) {
      autoTalkCountdown.value = 0;
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      if (autoTalkTimer) {
        clearTimeout(autoTalkTimer);
        autoTalkTimer = null;
      }
    }
  },
);

watch(
  () => props.callMessages.length,
  async () => {
    await nextTick();
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    }
  },
);

onUnmounted(() => {
  if (durationInterval) clearInterval(durationInterval);
  if (autoTalkTimer) clearTimeout(autoTalkTimer);
  if (countdownTimer) clearInterval(countdownTimer);
});

function hangUp() {
  emit("hangUp");
}

function handleSend() {
  const text = inputText.value.trim();
  if (!text || props.isGenerating) return;
  emit("sendMessage", text);
  inputText.value = "";
  resetAutoTalkTimer();
}
</script>

<style lang="scss" scoped>
.group-call-overlay {
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
}

.group-call-container {
  position: relative;
  width: 100%;
  max-width: 400px;
  height: 100%;
  max-height: 700px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 480px) {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }

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

  .blur-circle {
    position: absolute;
    border-radius: 50%;
    filter: blur(80px);
    opacity: 0.5;

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

    &.c3 {
      width: 200px;
      height: 200px;
      background: #89cff0;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      animation: float3 12s ease-in-out infinite;
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

@keyframes float3 {
  0%,
  100% {
    transform: translate(-50%, -50%) scale(1);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.2);
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

  @media (min-width: 768px) {
    .group-call-container.connected & {
      flex-direction: row;
    }
  }
}

// 側邊欄
.call-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 16px;

  @media (min-width: 768px) {
    .group-call-container.connected & {
      width: 280px;
      background: rgba(0, 0, 0, 0.2);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      padding: 24px 16px;
    }
  }
}

.sidebar-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.call-info {
  text-align: center;

  .group-name {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 600;
    color: white;
    text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
  }

  .call-status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-bottom: 8px;

    .status-dot {
      width: 8px;
      height: 8px;
      background: #4ade80;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }

    .status-text {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.7);
    }
  }

  .call-duration {
    font-size: 16px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.9);
    font-variant-numeric: tabular-nums;
    background: rgba(0, 0, 0, 0.2);
    padding: 4px 12px;
    border-radius: 12px;
    display: inline-block;
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

// 參與者網格
.participants-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  width: 100%;
}

.participant {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 64px;

  &.speaking .participant-avatar {
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 16px rgba(125, 211, 168, 0.6);
  }
}

.participant-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  overflow: hidden;
  position: relative;
  background: rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;

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
      width: 24px;
      height: 24px;
      fill: rgba(255, 255, 255, 0.5);
    }
  }

  .speaking-indicator {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 18px;
    height: 18px;
    background: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(0, 0, 0, 0.5);

    svg {
      width: 10px;
      height: 10px;
      fill: white;
    }
  }
}

.participant-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
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
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
}

.call-system-hint {
  align-self: center;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  max-width: 80%;
}

.call-message {
  max-width: 85%;
  animation: slideIn 0.3s ease;

  &.user {
    align-self: flex-end;

    .message-content {
      background: var(--color-primary, #7dd3a8);
      color: white;
      border-radius: 16px 16px 4px 16px;
    }
  }

  &.ai {
    align-self: flex-start;

    .sender-name {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-primary, #7dd3a8);
      margin-bottom: 4px;
      margin-left: 4px;
    }

    .message-content {
      background: rgba(255, 255, 255, 0.12);
      color: white;
      border-radius: 16px 16px 16px 4px;
      backdrop-filter: blur(10px);
    }
  }

  .message-content {
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
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

.auto-talk-hint {
  align-self: center;
  text-align: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
  padding: 8px;
}

// 語音輸入區域
.voice-input-section {
  display: flex;
  justify-content: center;
  padding: 0 20px 16px;
  margin-top: auto;
  z-index: 10;
}

.input-capsule {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 400px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 32px;
  padding: 6px 6px 6px 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  &:focus-within {
    background: rgba(0, 0, 0, 0.7);
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  }

  .voice-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: white;
    font-size: 15px;
    padding: 8px 0;
    min-width: 0;

    &::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    &:disabled {
      opacity: 0.5;
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
      margin-left: 2px;
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

// 通話控制按鈕
.call-controls {
  position: relative;
  z-index: 10;
  display: flex;
  justify-content: center;
  padding: 0 24px 24px;
  padding-bottom: max(24px, var(--safe-bottom, 0px));
  background: transparent;
  pointer-events: none;
}

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
  pointer-events: auto;
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
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
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
}

// 過渡動畫
.call-fade-enter-active,
.call-fade-leave-active {
  transition: opacity 0.3s ease;

  .group-call-container {
    transition: transform 0.3s ease;
  }
}

.call-fade-enter-from,
.call-fade-leave-to {
  opacity: 0;

  .group-call-container {
    transform: scale(0.95);
  }
}

// 手機版調整
@media (max-width: 480px) {
  .call-sidebar {
    padding: 16px 12px 12px;
  }

  .call-info .group-name {
    font-size: 18px;
  }

  .participants-grid {
    gap: 8px;
  }

  .participant {
    width: 56px;
  }

  .participant-avatar {
    width: 40px;
    height: 40px;
  }

  .call-messages {
    padding: 12px;
    gap: 8px;
  }

  .call-controls {
    padding-bottom: max(32px, var(--safe-bottom, 0px));
  }

  .control-btn.hangup.large {
    width: 56px;
    height: 56px;
  }
}
</style>
