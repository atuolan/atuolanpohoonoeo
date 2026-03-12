<script setup lang="ts">
/**
 * 伴讀聊天面板組件
 * 浮動聊天視窗，包含訊息列表、輸入框、觸發頻率設定
 * Requirements: 4.1, 5.1, 5.2, 5.3, 2.1
 */

import type { CompanionMessage } from "@/types/book";
import { Loader2, Minus, Send, Settings2 } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";

interface Props {
  /** 角色名稱 */
  characterName: string;
  /** 書名 */
  bookTitle: string;
  /** 訊息列表 */
  messages: CompanionMessage[];
  /** AI 是否正在生成 */
  isGenerating: boolean;
  /** 當前觸發頻率 */
  triggerFrequency: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "minimize"): void;
  (e: "send", content: string): void;
  (e: "update:triggerFrequency", value: number): void;
}>();

// 輸入框內容
const inputText = ref("");
// 設定 popover 顯示狀態
const showSettings = ref(false);
// 訊息列表容器 ref
const messageListRef = ref<HTMLElement | null>(null);

const FREQUENCY_OPTIONS = [1, 3, 5, 10];

// 格式化時間戳
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

// 發送訊息
function handleSend() {
  const text = inputText.value.trim();
  if (!text || props.isGenerating) return;
  emit("send", text);
  inputText.value = "";
}

// 鍵盤 Enter 發送
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

// 設定觸發頻率
function selectFrequency(n: number) {
  emit("update:triggerFrequency", n);
  showSettings.value = false;
}

// 自動捲動到底部
function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
}

// 監聽訊息變化，自動捲動
watch(
  () => props.messages.length,
  () => scrollToBottom(),
);

// 監聽 isGenerating 變化（串流輸出時也捲動）
watch(
  () => props.isGenerating,
  () => scrollToBottom(),
);

const isEmpty = computed(() => props.messages.length === 0);
</script>

<template>
  <Teleport to="body">
    <div class="companion-panel">
      <!-- 頂欄 -->
      <div class="panel-header">
        <div class="header-info">
          <span class="header-name">{{ characterName }}</span>
          <span class="header-book">{{ bookTitle }}</span>
        </div>
        <div class="header-actions">
          <div class="settings-wrapper">
            <button
              class="header-btn"
              :title="`觸發頻率：每 ${triggerFrequency} 頁`"
              @click.stop="showSettings = !showSettings"
            >
              <Settings2 :size="16" />
            </button>
            <!-- 觸發頻率設定 popover -->
            <Transition name="fade">
              <div v-if="showSettings" class="freq-popover">
                <p class="freq-label">翻頁觸發頻率</p>
                <div class="freq-options">
                  <button
                    v-for="n in FREQUENCY_OPTIONS"
                    :key="n"
                    class="freq-btn"
                    :class="{ active: triggerFrequency === n }"
                    @click="selectFrequency(n)"
                  >
                    {{ n }} 頁
                  </button>
                </div>
              </div>
            </Transition>
          </div>
          <button class="header-btn" title="縮小" @click="emit('minimize')">
            <Minus :size="16" />
          </button>
        </div>
      </div>

      <!-- 訊息列表 -->
      <div ref="messageListRef" class="message-list">
        <div v-if="isEmpty" class="empty-hint">
          <p>📖 伴讀聊天已開始</p>
          <p class="sub">
            翻頁後{{ characterName }}會自動發表評論，你也可以直接輸入訊息
          </p>
        </div>
        <div
          v-for="msg in messages"
          :key="msg.id"
          class="msg-item"
          :class="{
            'msg-user': msg.role === 'user',
            'msg-ai': msg.role === 'assistant',
          }"
        >
          <span class="msg-sender">{{ msg.senderName }}</span>
          <div class="msg-bubble">{{ msg.content }}</div>
          <span class="msg-time">{{ formatTime(msg.timestamp) }}</span>
        </div>

        <!-- 生成中指示器 (Requirement 5.3) -->
        <div v-if="isGenerating" class="msg-item msg-ai generating">
          <span class="msg-sender">{{ characterName }}</span>
          <div class="msg-bubble loading-bubble">
            <Loader2 :size="16" class="spin" />
            <span>思考中…</span>
          </div>
        </div>
      </div>

      <!-- 輸入區 (Requirement 5.1) -->
      <div class="input-area">
        <input
          v-model="inputText"
          class="msg-input"
          type="text"
          placeholder="輸入訊息…"
          :disabled="isGenerating"
          @keydown="handleKeydown"
        />
        <button
          class="send-btn"
          :disabled="!inputText.trim() || isGenerating"
          @click="handleSend"
        >
          <Send :size="16" />
        </button>
      </div>

      <!-- 點擊外部關閉設定 -->
      <div
        v-if="showSettings"
        class="settings-backdrop"
        @click="showSettings = false"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.companion-panel {
  position: fixed;
  left: 12px;
  top: 60px;
  bottom: 60px;
  width: min(320px, 85vw);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #1e1e2e);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  overflow: hidden;
}

// ===== 頂欄 =====
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.03);
}

.header-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.header-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-book {
  font-size: 11px;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text, #e0e0e0);
  cursor: pointer;
  opacity: 0.65;
  transition:
    opacity 0.15s,
    background 0.15s;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.08);
  }
}

// ===== 觸發頻率設定 popover =====
.settings-wrapper {
  position: relative;
}

.freq-popover {
  position: absolute;
  top: 36px;
  right: 0;
  background: var(--color-surface-variant, #2a2a3e);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  padding: 10px 12px;
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  min-width: 160px;
}

.freq-label {
  font-size: 12px;
  opacity: 0.6;
  margin: 0 0 8px;
}

.freq-options {
  display: flex;
  gap: 6px;
}

.freq-btn {
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: transparent;
  color: var(--color-text, #e0e0e0);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  &.active {
    background: var(--color-primary, #7dd3a8);
    color: #1a1a2e;
    border-color: var(--color-primary, #7dd3a8);
    font-weight: 600;
  }
}

// ===== 訊息列表 =====
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.empty-hint {
  text-align: center;
  padding: 32px 16px;
  opacity: 0.5;
  font-size: 14px;

  .sub {
    font-size: 12px;
    margin-top: 6px;
    opacity: 0.7;
  }
}

.msg-item {
  display: flex;
  flex-direction: column;
  max-width: 85%;

  &.msg-user {
    align-self: flex-end;
    align-items: flex-end;

    .msg-bubble {
      background: var(--color-primary, #7dd3a8);
      color: #1a1a2e;
      border-radius: 12px 12px 4px 12px;
    }
  }

  &.msg-ai {
    align-self: flex-start;
    align-items: flex-start;

    .msg-bubble {
      background: rgba(255, 255, 255, 0.08);
      border-radius: 12px 12px 12px 4px;
    }
  }
}

.msg-sender {
  font-size: 11px;
  opacity: 0.5;
  margin-bottom: 3px;
  padding: 0 4px;
}

.msg-bubble {
  padding: 8px 12px;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
}

.msg-time {
  font-size: 10px;
  opacity: 0.35;
  margin-top: 2px;
  padding: 0 4px;
}

// 生成中指示器
.loading-bubble {
  display: flex;
  align-items: center;
  gap: 6px;
  opacity: 0.7;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// ===== 輸入區 =====
.input-area {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.02);
}

.msg-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--color-text, #e0e0e0);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;

  &::placeholder {
    opacity: 0.4;
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.send-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: var(--color-primary, #7dd3a8);
  color: #1a1a2e;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    opacity 0.15s,
    transform 0.1s;

  &:hover:not(:disabled) {
    transform: scale(1.05);
  }

  &:active:not(:disabled) {
    transform: scale(0.95);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

// 設定背景遮罩
.settings-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
