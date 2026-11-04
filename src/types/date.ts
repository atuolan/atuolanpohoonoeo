/**
 * 約會出門
 */

export type DatePayer = "char" | "user" | "split";

export type DateStatus = "invited" | "declined" | "ongoing" | "ended" | "cancelled";

export interface DateEvent {
  id: string;
  /** 已經換成名字的事件文字 */
  text: string;
  /** 忘了帶錢包的是誰（只有忘了帶錢包的事件有） */
  forgotWallet?: "user" | "char";
}

export interface DatePayment {
  payer: DatePayer;
  /** 實際各付了多少 */
  userPaid: number;
  charPaid: number;
  /** 角色帳戶那筆，取消時用來還原 */
  charEntryId?: string;
  /** 給 AI 和聊天看的結果，例如「阿光請客，付了 $1,200」 */
  note: string;
}

/** 一場約會，存在 settings 表 date-session-${chatId}（一個聊天同時只有一場） */
export interface DateSession {
  id: string;
  chatId: string;
  characterId: string;
  spotId: string;
  place: string;
  emoji: string;
  /** 給 AI 看的氣氛（自訂地點是空的） */
  vibe: string;
  startedBy: "user" | "char";
  status: DateStatus;
  /** 邀請／請求卡片那則訊息 */
  inviteMessageId: string;
  /** 角色約的理由，或拒絕的理由 */
  reason?: string;
  durationMinutes: number;
  /** 兩人份總花費 */
  cost: number;
  invitedAt: number;
  startedAt?: number;
  /** 開始時的劇情時間 */
  startedStoryTime?: number;
  event?: DateEvent;
  /** 事件交給 AI 了沒 */
  eventInjected?: boolean;
  /** 開始後角色回了幾輪 */
  aiReplies: number;
  payment?: DatePayment;
  endedAt?: number;
}

/** 聊天裡的約會卡片 */
export interface DateCardData {
  kind: "invite" | "request" | "started" | "ended";
  sessionId: string;
  place: string;
  emoji: string;
  startedBy: "user" | "char";
  /** invite / request：等待中、答應、拒絕 */
  status?: "pending" | "accepted" | "declined";
  reason?: string;
  /** ended：總花費、誰付、事件、回顧、角色的日記 */
  cost?: number;
  paymentNote?: string;
  eventText?: string;
  recap?: string;
  diary?: string;
}

/** 約會回憶，存在 settings 表 date-memories-${characterId} */
export interface DateMemory {
  id: string;
  characterId: string;
  chatId: string;
  place: string;
  emoji: string;
  startedAt: number;
  endedAt: number;
  cost: number;
  paymentNote?: string;
  eventText?: string;
  recap?: string;
  diary?: string;
}
