import type { GenerationTaskType } from "@/stores/aiGeneration";

export interface IndicatorTask {
  chatId: string;
  taskType: GenerationTaskType;
}

export interface GenerationIndicatorContext<T extends IndicatorTask> {
  /** 正在生成的任務 */
  activeTasks: T[];
  /** 目前開著的聊天（在聊天頁才有）：它自己的回覆已經有頂欄「正在輸入...」和停止鍵 */
  coveredChatId: string | null;
  /** 通話中的任務 ID：通話畫面或縮小的通話條自己會顯示狀態 */
  callTaskId: string | null;
  /** 通話畫面或串流視窗開著：浮動按鈕先收起來，不要疊在上面 */
  overlayOpen: boolean;
  /** 串流視窗正在串流 */
  streamingInProgress: boolean;
}

export interface GenerationIndicatorView<T extends IndicatorTask> {
  visible: boolean;
  /** 清單裡要列出的任務 */
  tasks: T[];
}

function isCovered(task: IndicatorTask, ctx: GenerationIndicatorContext<IndicatorTask>): boolean {
  if (task.taskType !== "chat") return false;
  return task.chatId === ctx.coveredChatId || task.chatId === ctx.callTaskId;
}

/**
 * 浮動按鈕只提示「目前畫面上看不到的」AI 任務。
 * 偷看手機、噗浪等功能串流時不登記任務；完全沒有任務卻在串流，就是它們，也要顯示。
 */
export function resolveGenerationIndicator<T extends IndicatorTask>(
  ctx: GenerationIndicatorContext<T>,
): GenerationIndicatorView<T> {
  if (ctx.overlayOpen) return { visible: false, tasks: [] };
  const tasks = ctx.activeTasks.filter((task) => !isCovered(task, ctx));
  const untrackedStreaming = ctx.streamingInProgress && ctx.activeTasks.length === 0;
  return { visible: tasks.length > 0 || untrackedStreaming, tasks };
}
