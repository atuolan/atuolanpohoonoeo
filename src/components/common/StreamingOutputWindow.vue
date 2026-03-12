<script setup lang="ts">
/**
 * 流式輸出窗口組件
 * 在 AI 生成回覆時以浮動視窗形式顯示即時輸出內容
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 3.1, 3.2, 3.4
 */

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { marked } from "marked";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";

// 配置 marked
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Props
interface Props {
  visible: boolean;
  isMinimizing?: boolean; // 是否正在最小化（用於動畫）
}

const props = withDefaults(defineProps<Props>(), {
  isMinimizing: false,
});

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "stop"): void;
  (e: "minimize"): void;
}>();

// 根據是否最小化選擇不同的過渡動畫
const transitionName = computed(() => {
  return props.isMinimizing ? "minimize" : "slide-up";
});

// 使用 composable
const {
  content,
  metadata,
  isAutoScrollEnabled,
  showRawMode,
  showDebugPanel,
  isComplete,
  hasError,
  errorMessage,
  isStreaming,
  tokenCount,
  promptTokens,
  completionTokens,
  promptContent,
  showPrompt,
  copyContent,
  setAutoScroll,
  toggleRawMode,
  toggleDebugPanel,
  togglePrompt,
} = useStreamingWindow();

// Refs
const scrollContainer = ref<HTMLElement | null>(null);
const copySuccess = ref(false);

// 自動滾動閾值（像素）
const AUTO_SCROLL_THRESHOLD = 50;

// ===== 計算屬性 =====

// 渲染 Markdown 內容
const renderedContent = computed(() => {
  if (!content.value) return "";
  if (showRawMode.value) return content.value;
  try {
    return marked.parse(content.value) as string;
  } catch {
    return content.value;
  }
});

// 計算經過時間
const elapsedTime = computed(() => {
  if (!metadata.value) return "0.0s";
  const elapsed = (Date.now() - metadata.value.startTime) / 1000;
  return `${elapsed.toFixed(1)}s`;
});

// 生成速度
const tokensPerSecond = computed(() => {
  if (!metadata.value) return "0.0";
  return metadata.value.tokensPerSecond.toFixed(1);
});

// ===== 方法 =====

// 滾動到底部
function scrollToBottom() {
  if (!scrollContainer.value) return;
  scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight;
}

// 檢查是否在底部
function isAtBottom(): boolean {
  if (!scrollContainer.value) return true;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer.value;
  return scrollHeight - scrollTop - clientHeight < AUTO_SCROLL_THRESHOLD;
}

// 處理滾動事件
function handleScroll() {
  if (!scrollContainer.value) return;
  const atBottom = isAtBottom();
  setAutoScroll(atBottom);
}

// 處理複製
async function handleCopy() {
  const success = await copyContent();
  if (success) {
    copySuccess.value = true;
    setTimeout(() => {
      copySuccess.value = false;
    }, 2000);
  }
}

// 處理停止
function handleStop() {
  emit("stop");
}

// 處理關閉
function handleClose() {
  emit("close");
}

// 處理最小化
function handleMinimize() {
  emit("minimize");
}

// ===== 監聽內容變化，自動滾動 =====
watch(content, () => {
  if (isAutoScrollEnabled.value) {
    nextTick(() => {
      scrollToBottom();
    });
  }
});

// 更新經過時間的定時器
let elapsedTimer: number | null = null;

onMounted(() => {
  // 定時更新經過時間顯示
  elapsedTimer = window.setInterval(() => {
    // 觸發重新計算
  }, 100);
});

onUnmounted(() => {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
  }
});
</script>

<template>
  <Transition :name="transitionName">
    <div v-if="visible" class="streaming-window">
      <!-- Header -->
      <div class="window-header">
        <div class="drag-handle">
          <span class="handle-bar"></span>
        </div>
        <div class="header-actions">
          <button
            class="header-btn minimize-btn"
            @click="handleMinimize"
            title="最小化"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13H5v-2h14v2z" />
            </svg>
          </button>
          <button
            class="header-btn close-btn"
            @click="handleClose"
            :disabled="isStreaming"
            title="關閉"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Content Area -->
      <div ref="scrollContainer" class="window-content" @scroll="handleScroll">
        <div v-if="showRawMode" class="content-raw">{{ content }}</div>
        <div v-else class="content-markdown" v-html="renderedContent"></div>
        <!-- 流式游標 -->
        <span v-if="isStreaming" class="streaming-cursor">▊</span>
        <!-- 完成指示器 -->
        <div v-if="isComplete && !hasError" class="completion-indicator">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          <span>生成完成</span>
        </div>
        <!-- 中斷指示器 -->
        <div v-if="isComplete && hasError" class="error-indicator">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"
            />
          </svg>
          <span>{{ errorMessage || "已中斷" }}</span>
        </div>
      </div>

      <!-- Debug Panel -->
      <div class="debug-panel" :class="{ expanded: showDebugPanel }">
        <button class="debug-toggle" @click="toggleDebugPanel">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            :class="{ rotated: showDebugPanel }"
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
          </svg>
          <span>調試資訊</span>
        </button>
        <Transition name="collapse">
          <div v-if="showDebugPanel" class="debug-content">
            <!-- Token 使用量（輸入/輸出） -->
            <div class="debug-row token-usage-row">
              <span class="debug-label">📥 輸入 Token</span>
              <span class="debug-value">{{
                promptTokens > 0
                  ? promptTokens.toLocaleString()
                  : isComplete
                    ? "—"
                    : "..."
              }}</span>
            </div>
            <div class="debug-row token-usage-row">
              <span class="debug-label">📤 輸出 Token</span>
              <span class="debug-value">{{
                completionTokens > 0
                  ? completionTokens.toLocaleString()
                  : tokenCount.toLocaleString()
              }}</span>
            </div>
            <div class="debug-row token-usage-row">
              <span class="debug-label">📊 合計</span>
              <span class="debug-value">{{
                (
                  promptTokens + (completionTokens || tokenCount)
                ).toLocaleString()
              }}</span>
            </div>
            <div class="debug-row">
              <span class="debug-label">生成速度</span>
              <span class="debug-value">{{ tokensPerSecond }} tokens/s</span>
            </div>
            <div class="debug-row">
              <span class="debug-label">經過時間</span>
              <span class="debug-value">{{ elapsedTime }}</span>
            </div>
            <div class="debug-row">
              <span class="debug-label">模型</span>
              <span class="debug-value">{{ metadata?.model || "-" }}</span>
            </div>
            <div class="debug-row">
              <label class="raw-mode-toggle">
                <input
                  type="checkbox"
                  :checked="showRawMode"
                  @change="toggleRawMode"
                />
                <span>顯示原始文字</span>
              </label>
            </div>
            <!-- 提示詞查看按鈕 -->
            <div v-if="promptContent.length > 0" class="debug-row">
              <button class="prompt-toggle-btn" @click="togglePrompt">
                {{ showPrompt ? "🔽 隱藏提示詞" : "📋 查看提示詞" }}
                <span class="prompt-msg-count"
                  >({{ promptContent.length }} 條訊息)</span
                >
              </button>
            </div>
            <!-- 提示詞內容（可收合） -->
            <Transition name="collapse">
              <div
                v-if="showPrompt && promptContent.length > 0"
                class="prompt-viewer"
              >
                <div
                  v-for="(msg, idx) in promptContent"
                  :key="idx"
                  class="prompt-message"
                  :class="'prompt-role-' + msg.role"
                >
                  <div class="prompt-role-tag">
                    {{ msg.role.toUpperCase() }}
                  </div>
                  <pre class="prompt-text">{{ msg.content }}</pre>
                </div>
              </div>
            </Transition>
            <!-- 錯誤詳情 -->
            <div v-if="hasError && errorMessage" class="debug-error">
              <span class="debug-label">錯誤詳情</span>
              <pre class="error-details">{{ errorMessage }}</pre>
            </div>
          </div>
        </Transition>
      </div>

      <!-- Footer -->
      <div class="window-footer">
        <button
          v-if="isStreaming"
          class="footer-btn stop-btn"
          @click="handleStop"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h12v12H6z" />
          </svg>
          <span>停止</span>
        </button>
        <button
          class="footer-btn copy-btn"
          @click="handleCopy"
          :disabled="!content"
        >
          <svg v-if="!copySuccess" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
          <span>{{ copySuccess ? "已複製" : "複製" }}</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style lang="scss" scoped>
// ===== 窗口容器 =====
.streaming-window {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;

  display: flex;
  flex-direction: column;

  background: var(--color-surface);
  border-top-left-radius: var(--radius-xl);
  border-top-right-radius: var(--radius-xl);
  box-shadow: 0 -4px 24px var(--color-shadow);

  // 安全區域適配 (Requirements: 4.1, 4.2, 4.3, 4.4, 4.5)
  padding-bottom: var(--safe-bottom, 0px);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);

  // 動態高度（使用 dvh 單位）
  max-height: calc(85dvh - var(--safe-bottom, 0px));
  min-height: calc(40dvh - var(--safe-bottom, 0px));
  overflow: hidden;

  // 平滑過渡 (Requirements: 6.5)
  transition:
    height 0.3s ease,
    max-height 0.3s ease,
    transform 0.3s ease;

  // Fallback for browsers without dvh support
  @supports not (height: 1dvh) {
    max-height: calc(85vh - var(--safe-bottom, 0px));
    min-height: calc(40vh - var(--safe-bottom, 0px));
  }
}

// ===== Header =====
.window-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.drag-handle {
  flex: 1;
  display: flex;
  justify-content: center;
  padding: 8px 0;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }
}

.handle-bar {
  width: 40px;
  height: 4px;
  background: var(--color-border);
  border-radius: var(--radius-full);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    color: var(--color-text-secondary);
  }

  &:hover:not(:disabled) {
    background: var(--color-surface-hover);

    svg {
      color: var(--color-text);
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.close-btn:hover:not(:disabled) svg {
  color: var(--color-error);
}

// ===== Content Area =====
.window-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  scroll-behavior: smooth;

  // 自定義滾動條
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: var(--radius-full);

    &:hover {
      background: var(--color-text-muted);
    }
  }
}

// 原始文字模式
.content-raw {
  font-family: monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text);
}

// Markdown 渲染內容 (Requirements: 5.3)
.content-markdown {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-text);

  :deep(p) {
    margin: 0;

    & + p {
      margin-top: 12px;
    }
  }

  :deep(h1),
  :deep(h2),
  :deep(h3),
  :deep(h4),
  :deep(h5),
  :deep(h6) {
    margin: 16px 0 8px;
    color: var(--color-text);
    font-weight: 600;
  }

  :deep(code) {
    background: rgba(0, 0, 0, 0.08);
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 14px;
  }

  :deep(pre) {
    background: rgba(0, 0, 0, 0.08);
    padding: 12px;
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin: 12px 0;

    code {
      background: none;
      padding: 0;
    }
  }

  :deep(ul),
  :deep(ol) {
    margin: 8px 0;
    padding-left: 24px;
  }

  :deep(li) {
    margin: 4px 0;
  }

  :deep(blockquote) {
    margin: 12px 0;
    padding: 8px 16px;
    border-left: 4px solid var(--color-primary);
    background: var(--color-surface-hover);
    border-radius: 0 var(--radius-md) var(--radius-md) 0;
  }

  :deep(a) {
    color: var(--color-primary);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 16px 0;
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;

    th,
    td {
      border: 1px solid var(--color-border);
      padding: 8px 12px;
      text-align: left;
    }

    th {
      background: var(--color-surface-hover);
      font-weight: 600;
    }
  }
}

// 流式游標 (Requirements: 6.4)
.streaming-cursor {
  display: inline-block;
  animation: blink 1s infinite;
  color: var(--color-primary);
  font-weight: bold;
  margin-left: 2px;
}

@keyframes blink {
  0%,
  50% {
    opacity: 1;
  }
  51%,
  100% {
    opacity: 0;
  }
}

// 完成指示器
.completion-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  background: rgba(125, 211, 168, 0.15);
  border-radius: var(--radius-md);
  color: var(--color-success);
  font-size: 14px;

  svg {
    width: 18px;
    height: 18px;
  }
}

// 錯誤指示器
.error-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding: 8px 12px;
  background: rgba(255, 123, 123, 0.15);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 14px;

  svg {
    width: 18px;
    height: 18px;
  }
}

// ===== Debug Panel (Requirements: 3.1, 3.2, 3.4) =====
.debug-panel {
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.debug-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
    transition: transform var(--transition-fast);

    &.rotated {
      transform: rotate(180deg);
    }
  }

  &:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
  }
}

.debug-content {
  padding: 0 16px 12px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
  max-height: 35vh;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: var(--radius-full);
  }
}

.debug-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;

  &:not(:last-child) {
    border-bottom: 1px solid var(--color-border);
  }
}

.debug-label {
  color: var(--color-text-secondary);
}

.debug-value {
  color: var(--color-text);
  font-family: monospace;
}

.raw-mode-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;

  input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--color-primary);
  }

  span {
    color: var(--color-text-secondary);
  }
}

.debug-error {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
}

// Token 使用量行
.token-usage-row {
  .debug-value {
    font-weight: 600;
    color: var(--color-primary);
  }
}

// 提示詞查看按鈕
.prompt-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: var(--color-surface-hover);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .prompt-msg-count {
    font-size: 12px;
    opacity: 0.7;
  }
}

// 提示詞查看器
.prompt-viewer {
  margin-top: 8px;
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(0, 0, 0, 0.03);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: var(--radius-full);
  }
}

.prompt-message {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
}

.prompt-role-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.prompt-role-system .prompt-role-tag {
  background: rgba(255, 165, 0, 0.15);
  color: #e69500;
}

.prompt-role-user .prompt-role-tag {
  background: rgba(59, 130, 246, 0.15);
  color: #3b82f6;
}

.prompt-role-assistant .prompt-role-tag {
  background: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.prompt-text {
  margin: 0;
  padding: 4px 0;
  font-size: 12px;
  font-family: monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-secondary);
  max-height: 150px;
  overflow-y: auto;
}

.error-details {
  margin-top: 4px;
  padding: 8px;
  background: rgba(255, 123, 123, 0.1);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-family: monospace;
  color: var(--color-error);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 100px;
  overflow-y: auto;
}

// ===== Footer =====
.window-footer {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border);
  flex-shrink: 0;
}

.footer-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px 16px;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.stop-btn {
  background: var(--color-error);
  color: white;

  &:hover:not(:disabled) {
    background: #e06060;
    transform: scale(1.02);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}

.copy-btn {
  background: var(--color-surface-hover);
  color: var(--color-text);

  &:hover:not(:disabled) {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }
}

// ===== Animations (Requirements: 6.1, 6.3) =====
.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}

.slide-up-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

// Collapse animation for debug panel
.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  max-height: 50vh;
}

// ===== Minimize Animation (Requirements: 6.2) =====
.minimize-leave-active {
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.35s ease,
    border-radius 0.35s ease;
}

.minimize-leave-to {
  // 縮小並移動到右下角（指示器位置）
  transform: scale(0.1) translate(calc(50vw - 60px), calc(50vh - 40px));
  opacity: 0;
  border-radius: 50%;
}

// Restore animation (from minimized indicator back to full window)
.minimize-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.35s ease,
    border-radius 0.35s ease;
}

.minimize-enter-from {
  transform: scale(0.1) translate(calc(50vw - 60px), calc(50vh - 40px));
  opacity: 0;
  border-radius: 50%;
}
</style>
