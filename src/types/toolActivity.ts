/**
 * 聊天室的工具紀錄：只存名稱、狀態、摘要，不存參數。
 */

export type ToolActivityStatus = "success" | "error" | "rejected" | "cancelled";
/** 生成期間才會出現的狀態（不存檔） */
export type LiveToolActivityStatus = ToolActivityStatus | "running" | "awaiting_confirmation";

export interface ToolActivityRecord {
  /** tool call id */
  id: string;
  /** 註冊用的工具名 */
  toolName: string;
  /** 顯示名稱，例如「鎖手機 · lock_phone」或「查天氣」 */
  label: string;
  status: ToolActivityStatus;
  /** 結果或錯誤的前 200 字 */
  summary?: string;
  imageCount?: number;
  at: number;
}

export interface LiveToolActivity extends Omit<ToolActivityRecord, "status"> {
  status: LiveToolActivityStatus;
}
