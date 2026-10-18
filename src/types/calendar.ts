/**
 * 行事曆事件類型定義
 */

/** 行程的時間（角色工具新增時才有；沒有就是整天的行程） */
export interface CalendarEventTime {
  /** 開始時間 HH:MM */
  startTime?: string;
  /** 結束時間 HH:MM */
  endTime?: string;
  /** 跨天行程的結束日期 YYYY-MM-DD */
  endDate?: string;
}

export interface CalendarEvent extends CalendarEventTime {
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
  /** 使用者在行事曆 App 改過的時間；改過的不會因為重新生成被收回 */
  editedAt?: number;
  /** 建立時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
}

/** 聊天裡行事曆卡片的資料 */
export interface CalendarCardData extends CalendarEventData {
  /** 這張卡片新增的那筆行事曆事件；重新生成時用來收回 */
  eventId?: string;
  /** 角色排了跟使用者一起的行程：還沒加進使用者的行事曆，卡片上可以按「加到我的行事曆」 */
  plan?: { planId: string; characterId: string; chatId: string };
}

/** AI 回覆中 <calendar-event> 標籤的解析結果，也是角色工具「新增行程」的結果 */
export interface CalendarEventData extends CalendarEventTime {
  /** 事件類型 */
  type: "user" | "period";
  /** 事件標題 */
  title: string;
  /** 日期 YYYY-MM-DD */
  date: string;
  /** 描述（可選） */
  description?: string;
}
