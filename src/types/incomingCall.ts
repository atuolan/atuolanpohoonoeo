/**
 * 來電功能類型定義
 */

/** 待處理來電記錄 */
export interface PendingCall {
  /** 唯一識別碼 */
  id: string;
  /** 角色 ID */
  characterId: string;
  /** 角色名稱 */
  characterName: string;
  /** 角色頭像（可選） */
  characterAvatar?: string;
  /** 聊天 ID */
  chatId: string;
  /** 觸發時間（Unix timestamp） */
  triggerTime: number;
  /** 來電原因（內部使用） */
  reason: string;
  /** 開場白（可選） */
  opening?: string;
  /** 建立時間 */
  createdAt: number;
}

/** 通話類型 */
export type CallType = "outgoing" | "incoming";

/** 通話狀態 */
export type CallStatus = "answered" | "declined" | "missed";

/** 通話記錄 */
export interface CallHistoryEntry {
  /** 唯一識別碼 */
  id: string;
  /** 角色 ID */
  characterId: string;
  /** 聊天 ID */
  chatId: string;
  /** 通話類型 */
  type: CallType;
  /** 通話狀態 */
  status: CallStatus;
  /** 通話時長（秒） */
  duration: number;
  /** 來電原因（僅 incoming） */
  reason?: string;
  /** 建立時間 */
  createdAt: number;
}

/** Schedule-call 標籤解析結果 */
export interface ScheduleCallData {
  /** 延遲時間，如 "5s", "30m", "1h" */
  delay: string;
  /** 來電原因（內部使用） */
  reason: string;
  /** 可選的開場白 */
  opening?: string;
}
