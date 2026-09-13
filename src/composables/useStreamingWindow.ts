/**
 * 流式輸出窗口 Composable
 * 管理流式輸出窗口的狀態和行為
 */

import { computed, ref } from "vue";
import type { GenerationDiagnostics } from "@/types/chat";

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

export interface PromptDebugMessage {
  role: string;
  content: string;
  identifier?: string;
  name?: string;
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
const promptContent = ref<PromptDebugMessage[]>([]);
const diagnostics = ref<GenerationDiagnostics | null>(null);
/** 是否顯示提示詞（生成完成後可收合） */
const showPrompt = ref(false);
const internalPromptIdentifiers = new Set([
  "chatHistoryOpenTag",
  "chatHistoryCloseTag",
]);
/**
 * 當前擁有這個視窗的生成任務 ID。
 *
 * 視窗狀態是模組級單例，但 aiGeneration store 允許最多 3 個聊天並發生成
 * （MAX_CONCURRENT_GENERATIONS）。離開聊天頁面時 ChatScreen 會卸載，但它的
 * triggerAIResponse 閉包仍在跑；此時在另一個聊天送出訊息會再次呼叫 show()，
 * 把前一輪累積的內容整份抹掉，兩輪的 token 交錯寫進同一個緩衝區。
 *
 * 因此每輪生成都帶一個唯一 ownerId：
 * - 寫入（appendToken 等）帶 ownerId 且與當前擁有者不符時直接丟棄；
 * - 讀取端用 isOwnedBy() 確認緩衝區內容確實屬於自己，否則改用自己的 API 回傳值。
 *
 * 不傳 ownerId 的呼叫端（小劇場、偷看手機、通話、噗浪空間、主動發訊）維持原行為：
 * 寫入不受限，但它們一 show() 就會接手擁有權，讓 ChatScreen 的讀取端自動失配退回。
 */
const activeOwnerId = ref<string | null>(null);
/**
 * 擁有者所屬的 chatId（若擁有者是某個聊天的生成）。
 * 全局「停止」按鈕用它精準中止該聊天的任務，而不是中止所有並發生成。
 * 從 activeOwnerId 反解 chatId 不可靠（chatId 本身可能含分隔符），所以獨立存。
 */
const activeOwnerChatId = ref<string | null>(null);
let stopAbortCleanup: (() => void) | null = null;

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
   * @param ownerId 本輪生成的唯一擁有者 ID（見 activeOwnerId 說明）。
   *                傳入後即接手視窗擁有權，先前擁有者的寫入會被丟棄。
   * @param ownerChatId 擁有者所屬的 chatId（供全局「停止」精準中止該聊天）
   */
  function show(
    model: string = "",
    startMinimized: boolean = true,
    ownerId?: string,
    ownerChatId?: string,
  ) {
    activeOwnerId.value = ownerId ?? null;
    activeOwnerChatId.value = ownerChatId ?? null;
    // 默認以最小化狀態開始，更有沉浸感
    windowState.value = startMinimized ? "minimized" : "visible";
    content.value = "";
    tokenCount.value = 0;
    promptTokens.value = 0;
    completionTokens.value = 0;
    promptContent.value = [];
    diagnostics.value = null;
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
   * 緩衝區內容是否確實屬於指定的生成任務。
   * ownerId 省略時回傳 true（維持舊呼叫端行為）。
   */
  function isOwnedBy(ownerId?: string): boolean {
    if (!ownerId) return true;
    return activeOwnerId.value === ownerId;
  }

  /**
   * 取回屬於指定生成任務的緩衝區內容；不屬於它時回傳空字串。
   * 讀取端（安全網 / 回退路徑）用這個取代直接讀 content.value，
   * 避免撿到別的聊天正在累積的內容。
   */
  function getOwnedContent(ownerId?: string): string {
    return isOwnedBy(ownerId) ? content.value : "";
  }

  /**
   * 釋放擁有權。生成結束時呼叫，讓緩衝區內容不再被任何生成認領。
   *
   * 刻意不清空 content：視窗此時可能還開著給用戶看，清掉會變空白。
   * 殘留內容也不會被下一輪撿走 —— 下一輪帶的是新的 ownerId，
   * isOwnedBy() 對已釋放（null）的擁有者一律回傳 false，而 show() 本身會清空緩衝區。
   *
   * 擁有權已被其他生成接手時不做任何事（不能替別人釋放）。
   */
  function releaseOwnership(ownerId?: string): void {
    if (!isOwnedBy(ownerId)) return;
    activeOwnerId.value = null;
    activeOwnerChatId.value = null;
  }

  /**
   * 追加 token 到內容
   * @param ownerId 呼叫端的生成任務 ID；與當前擁有者不符時丟棄這個 token
   */
  function appendToken(token: string, ownerId?: string) {
    if (!isOwnedBy(ownerId)) return;
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
  function setComplete(ownerId?: string) {
    if (!isOwnedBy(ownerId)) return;
    isComplete.value = true;
  }

  /**
   * 設置 token 使用量（從 API 返回）
   */
  function setUsage(
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number },
    ownerId?: string,
  ) {
    if (!isOwnedBy(ownerId)) return;
    promptTokens.value = usage.prompt_tokens;
    completionTokens.value = usage.completion_tokens;
  }

  /**
   * 設置輸入提示詞內容（用於顯示/隱藏）
   */
  function setPromptContent(messages: PromptDebugMessage[], ownerId?: string) {
    if (!isOwnedBy(ownerId)) return;
    promptContent.value = messages;
  }

  function setDiagnostics(payload: GenerationDiagnostics | null, ownerId?: string) {
    if (!isOwnedBy(ownerId)) return;
    diagnostics.value = payload;
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
  function setError(message: string, ownerId?: string) {
    if (!isOwnedBy(ownerId)) return;
    hasError.value = true;
    errorMessage.value = message;
    isComplete.value = true;
  }

  /**
   * 重置所有狀態
   */
  function reset() {
    stopAbortCleanup?.();
    stopAbortCleanup = null;
    activeOwnerId.value = null;
    activeOwnerChatId.value = null;
    windowState.value = "hidden";
    content.value = "";
    tokenCount.value = 0;
    promptTokens.value = 0;
    completionTokens.value = 0;
    promptContent.value = [];
    diagnostics.value = null;
    showPrompt.value = false;
    metadata.value = null;
    isAutoScrollEnabled.value = true;
    showRawMode.value = false;
    showDebugPanel.value = false;
    isComplete.value = false;
    hasError.value = false;
    errorMessage.value = null;
  }

  function downloadTextFile(text: string, filename: string): boolean {
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch {
      return false;
    }
  }

  function buildPromptContentText(): string {
    return promptContent.value
      .map((message, index) => {
        const parts = [
          `#${index + 1}`,
          `Role: ${message.role || "unknown"}`,
        ];
        if (message.name) parts.push(`Name: ${message.name}`);
        if (message.identifier) parts.push(`Identifier: ${message.identifier}`);
        return `${parts.join(" | ")}\n\n${message.content || ""}`;
      })
      .join("\n\n---\n\n");
  }

  /**
   * 組合可匯出的完整文字。
   * 當正常內容為空（例如上游回了空回應 / 被安全過濾擋下）時，
   * 仍能匯出錯誤訊息與診斷 JSON，方便用戶把完整資訊回報給開發者。
   */
  function buildExportText(): string {
    const sections: string[] = [];
    if (content.value) {
      sections.push(content.value);
    }
    if (errorMessage.value) {
      sections.push(`===== 錯誤訊息 =====\n${errorMessage.value}`);
    }
    if (diagnostics.value) {
      try {
        sections.push(
          `===== 診斷資訊 (JSON) =====\n${JSON.stringify(diagnostics.value, null, 2)}`,
        );
      } catch {
        // ignore
      }
    }
    return sections.join("\n\n");
  }

  /**
   * 是否有任何可匯出的內容（正常內容、錯誤訊息或診斷）。
   * 用來控制「複製／下載」按鈕在空回應時仍可點擊。
   */
  const hasExportableText = computed(
    () => !!(content.value || errorMessage.value || diagnostics.value),
  );

  /**
   * 複製內容到剪貼板
   */
  async function copyContent(): Promise<boolean> {
    try {
      const text = buildExportText();
      if (!text) return false;
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  function downloadContentAsTxt(): boolean {
    const text = buildExportText();
    if (!text) return false;
    return downloadTextFile(text, `streaming-output-${Date.now()}.txt`);
  }

  async function copyPromptContent(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(buildPromptContentText());
      return true;
    } catch {
      return false;
    }
  }

  function downloadPromptContentAsTxt(): boolean {
    return downloadTextFile(
      buildPromptContentText(),
      `streaming-prompts-${Date.now()}.txt`,
    );
  }

  async function copyPromptModuleOrder(): Promise<boolean> {
    try {
      const text = promptContent.value
        .filter(
          (message) =>
            (message.name || message.identifier) &&
            !internalPromptIdentifiers.has(message.identifier || ""),
        )
        .map((message, index) => {
          const label = message.name || message.identifier;
          return `${String(index + 1).padStart(2, "0")}. ${label}`;
        })
        .join("\n");
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  async function copyDiagnostics(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(diagnostics.value ?? {}, null, 2),
      );
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

  /**
   * 將當前 streaming-window 的 stop 動作綁定到指定 AbortController
   * 綁定新 controller 時會自動清除上一個綁定
   * @returns 解除綁定函數
   */
  function bindAbortController(controller: AbortController): () => void {
    stopAbortCleanup?.();
    const unsubscribe = on("stop", () => {
      controller.abort();
    });
    stopAbortCleanup = () => {
      unsubscribe();
      if (stopAbortCleanup) {
        stopAbortCleanup = null;
      }
    };
    return () => {
      stopAbortCleanup?.();
    };
  }

  /**
   * 清除目前 stop 綁定的 AbortController
   */
  function clearAbortBinding() {
    stopAbortCleanup?.();
    stopAbortCleanup = null;
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
    hasExportableText,

    // 計算屬性
    isVisible,
    isMinimized,
    isStreaming,
    tokenCount,
    promptTokens,
    completionTokens,
    promptContent,
    diagnostics,
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
    setDiagnostics,
    togglePrompt,
    setError,
    reset,
    copyContent,
    downloadContentAsTxt,
    copyPromptContent,
    downloadPromptContentAsTxt,
    copyPromptModuleOrder,
    copyDiagnostics,
    setAutoScroll,
    toggleRawMode,
    toggleDebugPanel,
    bindAbortController,
    clearAbortBinding,

    // 擁有權（並發隔離）
    activeOwnerId,
    activeOwnerChatId,
    isOwnedBy,
    getOwnedContent,
    releaseOwnership,

    // 事件系統
    on,
    emit,
  };
}
