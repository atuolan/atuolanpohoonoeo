/**
 * 流式輸出窗口 Composable
 * 管理流式輸出窗口的狀態和行為
 */

import { computed, ref } from "vue";

// ===== 窗口狀態類型 =====
export type WindowState = "hidden" | "visible" | "minimized";

// ===== 生成元數據 =====
export interface GenerationMetadata {
  /** 已生成 token 數 */
  tokenCount: number;
  /** 開始時間戳 */
  startTime: number;
  /** 生成速度 (tokens/秒) */
  tokensPerSecond: number;
  /** 使用的模型 */
  model: string;
}

// ===== 事件回調類型 =====
export type StreamingWindowEventType =
  | "close"
  | "stop"
  | "minimize"
  | "restore";
type EventCallback = () => void;

// 單例狀態
const windowState = ref<WindowState>("hidden");
const content = ref("");
const metadata = ref<GenerationMetadata | null>(null);
const isAutoScrollEnabled = ref(true);
const showRawMode = ref(false);
const showDebugPanel = ref(false);
const isComplete = ref(false);
const hasError = ref(false);
const errorMessage = ref<string | null>(null);
const tokenCount = ref(0);
/** 輸入 prompt tokens（從 API usage 返回） */
const promptTokens = ref(0);
/** 輸出 completion tokens（從 API usage 返回） */
const completionTokens = ref(0);
/** 輸入提示詞內容（用於顯示/隱藏） */
const promptContent = ref<Array<{ role: string; content: string }>>([]);
/** 是否顯示提示詞（生成完成後可收合） */
const showPrompt = ref(false);

// 事件回調註冊表（單例）
const eventListeners = new Map<StreamingWindowEventType, Set<EventCallback>>();

/**
 * 流式輸出窗口 Composable
 */
export function useStreamingWindow() {
  // ===== 計算屬性 =====
  const isVisible = computed(() => windowState.value === "visible");
  const isMinimized = computed(() => windowState.value === "minimized");
  const isStreaming = computed(
    () => windowState.value !== "hidden" && !isComplete.value,
  );

  // ===== 方法 =====

  /**
   * 顯示窗口並開始新的流式會話
   * @param model 使用的模型名稱
   * @param startMinimized 是否以最小化狀態開始（默認 true）
   */
  function show(model: string = "", startMinimized: boolean = true) {
    // 默認以最小化狀態開始，更有沉浸感
    windowState.value = startMinimized ? "minimized" : "visible";
    content.value = "";
    tokenCount.value = 0;
    promptTokens.value = 0;
    completionTokens.value = 0;
    promptContent.value = [];
    showPrompt.value = false;
    isComplete.value = false;
    hasError.value = false;
    errorMessage.value = null;
    isAutoScrollEnabled.value = true;

    metadata.value = {
      tokenCount: 0,
      startTime: Date.now(),
      tokensPerSecond: 0,
      model,
    };
  }

  /**
   * 隱藏窗口
   */
  function hide() {
    windowState.value = "hidden";
  }

  /**
   * 最小化窗口
   */
  function minimize() {
    if (windowState.value === "visible") {
      windowState.value = "minimized";
    }
  }

  /**
   * 從最小化恢復
   */
  function restore() {
    if (windowState.value === "minimized") {
      windowState.value = "visible";
    }
  }

  /**
   * 追加 token 到內容
   */
  function appendToken(token: string) {
    tokenCount.value++;
    content.value += token;

    // 更新元數據
    if (metadata.value) {
      metadata.value.tokenCount = tokenCount.value;
      const elapsed = (Date.now() - metadata.value.startTime) / 1000;
      metadata.value.tokensPerSecond =
        elapsed > 0 ? Math.round((tokenCount.value / elapsed) * 10) / 10 : 0;
    }
  }

  /**
   * 設置生成完成
   */
  function setComplete() {
    isComplete.value = true;
  }

  /**
   * 設置 token 使用量（從 API 返回）
   */
  function setUsage(usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number }) {
    promptTokens.value = usage.prompt_tokens;
    completionTokens.value = usage.completion_tokens;
  }

  /**
   * 設置輸入提示詞內容（用於顯示/隱藏）
   */
  function setPromptContent(messages: Array<{ role: string; content: string }>) {
    promptContent.value = messages;
  }

  /**
   * 切換提示詞顯示
   */
  function togglePrompt() {
    showPrompt.value = !showPrompt.value;
  }

  /**
   * 設置錯誤狀態
   */
  function setError(message: string) {
    hasError.value = true;
    errorMessage.value = message;
    isComplete.value = true;
  }

  /**
   * 重置所有狀態
   */
  function reset() {
    windowState.value = "hidden";
    content.value = "";
    tokenCount.value = 0;
    promptTokens.value = 0;
    completionTokens.value = 0;
    promptContent.value = [];
    showPrompt.value = false;
    metadata.value = null;
    isAutoScrollEnabled.value = true;
    showRawMode.value = false;
    showDebugPanel.value = false;
    isComplete.value = false;
    hasError.value = false;
    errorMessage.value = null;
  }

  /**
   * 複製內容到剪貼板
   */
  async function copyContent(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(content.value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 設置自動滾動狀態
   */
  function setAutoScroll(enabled: boolean) {
    isAutoScrollEnabled.value = enabled;
  }

  /**
   * 切換原始模式
   */
  function toggleRawMode() {
    showRawMode.value = !showRawMode.value;
  }

  /**
   * 切換調試面板
   */
  function toggleDebugPanel() {
    showDebugPanel.value = !showDebugPanel.value;
  }

  // ===== 事件系統 =====

  /**
   * 註冊事件回調
   * @returns 取消註冊的函數
   */
  function on(
    event: StreamingWindowEventType,
    callback: EventCallback,
  ): () => void {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    eventListeners.get(event)!.add(callback);
    return () => {
      eventListeners.get(event)?.delete(callback);
    };
  }

  /**
   * 觸發事件（供全局組件調用）
   */
  function emit(event: StreamingWindowEventType) {
    const listeners = eventListeners.get(event);
    if (listeners) {
      listeners.forEach((cb) => cb());
    }
  }

  return {
    // 狀態
    windowState,
    content,
    metadata,
    isAutoScrollEnabled,
    showRawMode,
    showDebugPanel,
    isComplete,
    hasError,
    errorMessage,

    // 計算屬性
    isVisible,
    isMinimized,
    isStreaming,
    tokenCount,
    promptTokens,
    completionTokens,
    promptContent,
    showPrompt,

    // 方法
    show,
    hide,
    minimize,
    restore,
    appendToken,
    setComplete,
    setUsage,
    setPromptContent,
    togglePrompt,
    setError,
    reset,
    copyContent,
    setAutoScroll,
    toggleRawMode,
    toggleDebugPanel,

    // 事件系統
    on,
    emit,
  };
}
