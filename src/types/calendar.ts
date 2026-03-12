/**
 * 行事曆事件類型定義
 */

export interface CalendarEvent {
  id: string;
  /** 事件類型 */
  type: "user" | "period" | "holiday";
  /** 事件標題 */
  title: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 描述（可選） */
  description?: string;
  /** 來源角色 ID（AI 建立時記錄） */
  sourceCharacterId?: string;
  /** 來源聊天 ID */
  sourceChatId?: string;
  /** 建立時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
}

/** AI 回覆中 <calendar-event> 標籤的解析結果 */
export interface CalendarEventData {
  /** 事件類型 */
  type: "user" | "period";
  /** 事件標題 */
  title: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 描述（可選） */
  description?: string;
}
