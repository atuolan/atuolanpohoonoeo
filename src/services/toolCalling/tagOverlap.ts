import type { ToolResult } from "./types";

/**
 * 預約來電、新增行程這兩件事，提示詞標籤和工具都做得到。
 * 角色這一輪已經用工具處理過的，回覆裡同類的標籤就不再執行，免得重複。
 * - 工具做成了：標籤略過
 * - 使用者在確認視窗按了拒絕：標籤也略過，不能繞過使用者的決定
 * - 工具失敗、沒做成：標籤照常執行，當作備援
 */
export interface ToolHandledActions {
  /** 略過 <schedule-call> */
  scheduleCall: boolean;
  /** 略過 type="user" 的 <calendar-event>；經期紀錄工具做不到，照常執行 */
  calendarEvent: boolean;
}

function handledBy(results: readonly ToolResult[], toolName: string): boolean {
  return results.some((result) => result.name === toolName && (result.ok || result.rejected === true));
}

export function getToolHandledActions(results?: readonly ToolResult[] | null): ToolHandledActions {
  const list = results ?? [];
  return {
    scheduleCall: handledBy(list, "schedule_call"),
    calendarEvent: handledBy(list, "create_calendar_event"),
  };
}
