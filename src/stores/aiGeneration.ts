/**
 * AI 生成狀態全局管理 Store
 *
 * 功能：
 * 1. 管理所有聊天的 AI 生成狀態（支持並發）
 * 2. 離開聊天介面後仍然保持生成狀態
 * 3. 支持日記、總結等不同類型的生成任務
 * 4. 提供全局的生成狀態查詢和控制
 */

import { defineStore } from "pinia";
import { computed, ref } from "vue";

// 生成任務類型
export type GenerationTaskType =
  | "chat"
  | "diary"
  | "summary"
  | "meta-summary"
  | "continue"
  | "events"
  | "qzone-comments"
  | "theater";

// 單個生成任務的狀態
export interface GenerationTask {
  id: string; // 任務 ID（通常是 chatId 或 chatId_taskType）
  chatId: string; // 關聯的聊天 ID
  taskType: GenerationTaskType; // 任務類型
  isGenerating: boolean; // 是否正在生成
  controller: AbortController; // 中止控制器
  startTime: number; // 開始時間
  content: string; // 當前生成的內容（流式累積）
  characterName?: string; // 角色名稱（用於顯示）
  characterAvatar?: string; // 角色頭像
  error?: string; // 錯誤信息
  isComplete?: boolean; // 是否已完成
}

// 最大並發生成數量
const MAX_CONCURRENT_GENERATIONS = 3;

export const useAIGenerationStore = defineStore("aiGeneration", () => {
  // ===== State =====

  // 所有生成任務的 Map（key: taskId）
  const tasks = ref<Map<string, GenerationTask>>(new Map());

  // ===== Getters =====

  // 當前並發生成數量
  const concurrentCount = computed(() => {
    return Array.from(tasks.value.values()).filter((t) => t.isGenerating)
      .length;
  });

  // 是否有任何生成正在進行
  const hasActiveGeneration = computed(() => {
    return concurrentCount.value > 0;
  });

  // 獲取所有正在生成的任務
  const activeTasks = computed(() => {
    return Array.from(tasks.value.values()).filter((t) => t.isGenerating);
  });

  // 獲取所有正在生成的聊天 ID
  const generatingChatIds = computed(() => {
    return [...new Set(activeTasks.value.map((t) => t.chatId))];
  });

  // ===== Actions =====

  /**
   * 生成任務 ID
   */
  function getTaskId(
    chatId: string,
    taskType: GenerationTaskType = "chat",
  ): string {
    return taskType === "chat" ? chatId : `${chatId}_${taskType}`;
  }

  /**
   * 檢查特定聊天是否正在生成（任何類型）
   */
  function isChatGenerating(chatId: string): boolean {
    return Array.from(tasks.value.values()).some(
      (t) => t.chatId === chatId && t.isGenerating,
    );
  }

  /**
   * 檢查特定任務是否正在生成
   */
  function isTaskGenerating(
    chatId: string,
    taskType: GenerationTaskType = "chat",
  ): boolean {
    const taskId = getTaskId(chatId, taskType);
    return tasks.value.get(taskId)?.isGenerating ?? false;
  }

  /**
   * 檢查是否可以開始新的生成（並發限制）
   */
  function canStartGeneration(): boolean {
    return concurrentCount.value < MAX_CONCURRENT_GENERATIONS;
  }

  /**
   * 開始生成任務
   */
  function startGeneration(
    chatId: string,
    taskType: GenerationTaskType = "chat",
    options?: {
      characterName?: string;
      characterAvatar?: string;
    },
  ): { success: boolean; controller?: AbortController; error?: string } {
    // 檢查並發限制
    if (!canStartGeneration()) {
      return {
        success: false,
        error: `已達到最大並發數 ${MAX_CONCURRENT_GENERATIONS}，請等待其他生成完成`,
      };
    }

    const taskId = getTaskId(chatId, taskType);

    // 檢查是否已有相同任務正在進行
    const existingTask = tasks.value.get(taskId);
    if (existingTask?.isGenerating) {
      return {
        success: false,
        error: `任務 ${taskId} 正在生成中`,
      };
    }

    // 創建新的 AbortController
    const controller = new AbortController();

    // 創建任務
    const task: GenerationTask = {
      id: taskId,
      chatId,
      taskType,
      isGenerating: true,
      controller,
      startTime: Date.now(),
      content: "",
      characterName: options?.characterName,
      characterAvatar: options?.characterAvatar,
    };

    tasks.value.set(taskId, task);

    console.log(`🤖 [AIGeneration] 開始生成任務: ${taskId}`, {
      concurrent: concurrentCount.value,
      max: MAX_CONCURRENT_GENERATIONS,
    });

    return { success: true, controller };
  }

  /**
   * 更新生成內容（流式累積）
   */
  function updateContent(
    chatId: string,
    content: string,
    taskType: GenerationTaskType = "chat",
  ): void {
    const taskId = getTaskId(chatId, taskType);
    const task = tasks.value.get(taskId);
    if (task) {
      task.content = content;
    }
  }

  /**
   * 追加生成內容（流式 token）
   */
  function appendContent(
    chatId: string,
    token: string,
    taskType: GenerationTaskType = "chat",
  ): void {
    const taskId = getTaskId(chatId, taskType);
    const task = tasks.value.get(taskId);
    if (task) {
      task.content += token;
    }
  }

  /**
   * 完成生成任務
   */
  function completeGeneration(
    chatId: string,
    taskType: GenerationTaskType = "chat",
    finalContent?: string,
  ): void {
    const taskId = getTaskId(chatId, taskType);
    const task = tasks.value.get(taskId);
    if (task) {
      task.isGenerating = false;
      task.isComplete = true;
      if (finalContent !== undefined) {
        task.content = finalContent;
      }

      const duration = Date.now() - task.startTime;
      console.log(`✅ [AIGeneration] 完成生成任務: ${taskId}`, {
        duration: `${(duration / 1000).toFixed(1)}s`,
        contentLength: task.content.length,
      });
    }
  }

  /**
   * 設置生成錯誤
   */
  function setError(
    chatId: string,
    error: string,
    taskType: GenerationTaskType = "chat",
  ): void {
    const taskId = getTaskId(chatId, taskType);
    const task = tasks.value.get(taskId);
    if (task) {
      task.isGenerating = false;
      task.error = error;
      console.error(`❌ [AIGeneration] 生成錯誤: ${taskId}`, error);
    }
  }

  /**
   * 中止生成任務
   */
  function abortGeneration(
    chatId: string,
    taskType: GenerationTaskType = "chat",
  ): void {
    const taskId = getTaskId(chatId, taskType);
    const task = tasks.value.get(taskId);
    if (task && task.isGenerating) {
      task.controller.abort();
      task.isGenerating = false;
      task.error = "已中斷";
      console.log(`⏹️ [AIGeneration] 中止生成任務: ${taskId}`);
    }
  }

  /**
   * 中止特定聊天的所有生成任務
   */
  function abortAllForChat(chatId: string): void {
    for (const [taskId, task] of tasks.value.entries()) {
      if (task.chatId === chatId && task.isGenerating) {
        task.controller.abort();
        task.isGenerating = false;
        task.error = "已中斷";
        console.log(`⏹️ [AIGeneration] 中止生成任務: ${taskId}`);
      }
    }
  }

  /**
   * 獲取任務狀態
   */
  function getTask(
    chatId: string,
    taskType: GenerationTaskType = "chat",
  ): GenerationTask | undefined {
    const taskId = getTaskId(chatId, taskType);
    return tasks.value.get(taskId);
  }

  /**
   * 獲取聊天的所有任務
   */
  function getTasksForChat(chatId: string): GenerationTask[] {
    return Array.from(tasks.value.values()).filter((t) => t.chatId === chatId);
  }

  /**
   * 清理已完成的任務（釋放內存）
   */
  function cleanupCompletedTasks(maxAge: number = 5 * 60 * 1000): void {
    const now = Date.now();
    for (const [taskId, task] of tasks.value.entries()) {
      if (!task.isGenerating && now - task.startTime > maxAge) {
        tasks.value.delete(taskId);
      }
    }
  }

  /**
   * 清理特定聊天的已完成任務
   */
  function cleanupTasksForChat(chatId: string): void {
    for (const [taskId, task] of tasks.value.entries()) {
      if (task.chatId === chatId && !task.isGenerating) {
        tasks.value.delete(taskId);
      }
    }
  }

  return {
    // State
    tasks,
    // Getters
    concurrentCount,
    hasActiveGeneration,
    activeTasks,
    generatingChatIds,
    // Actions
    getTaskId,
    isChatGenerating,
    isTaskGenerating,
    canStartGeneration,
    startGeneration,
    updateContent,
    appendContent,
    completeGeneration,
    setError,
    abortGeneration,
    abortAllForChat,
    getTask,
    getTasksForChat,
    cleanupCompletedTasks,
    cleanupTasksForChat,
  };
});
