/**
 * 頭盔TA手機 - 類型定義
 * 查看角色的手機內容：聊天、行程、飲食、存款、備忘錄、記事本、日記
 */

/** 角色手機聊天訊息 */
export interface PeekChatMessage {
  id: string;
  /** 發送者名稱 */
  senderName: string;
  /** 發送者頭像 */
  senderAvatar?: string;
  /** 訊息內容 */
  content: string;
  /** 是否為角色自己發的 */
  isSelf: boolean;
  /** 時間戳 */
  timestamp: number;
}

/** 角色手機聊天對話 */
export interface PeekChatThread {
  id: string;
  /** 對方名稱 */
  contactName: string;
  /** 對方頭像 */
  contactAvatar?: string;
  /** 訊息列表 */
  messages: PeekChatMessage[];
  /** 最後更新 */
  updatedAt: number;
}

/** 行程項目 */
export interface PeekScheduleItem {
  id: string;
  /** 時間 (HH:mm) */
  time: string;
  /** 標題 */
  title: string;
  /** 地點 */
  location?: string;
  /** 是否已完成 */
  done: boolean;
}

/** 飲食記錄 */
export interface PeekMealRecord {
  id: string;
  /** 餐別 */
  mealType: "breakfast" | "lunch" | "dinner" | "snack";
  /** 食物名稱 */
  food: string;
  /** 備註 */
  note?: string;
  /** 時間 */
  time: string;
}

/** 備忘錄 */
export interface PeekMemo {
  id: string;
  /** 內容 */
  content: string;
  /** 是否已完成 */
  done: boolean;
  /** 建立時間 */
  createdAt: number;
}

/** 記事本 */
export interface PeekNote {
  id: string;
  /** 標題 */
  title: string;
  /** 內容 */
  content: string;
  /** 更新時間 */
  updatedAt: number;
}

/** 日記 */
export interface PeekDiaryEntry {
  id: string;
  /** 日期 (YYYY-MM-DD) */
  date: string;
  /** 心情 */
  mood: "happy" | "neutral" | "sad" | "angry" | "excited";
  /** 內容 */
  content: string;
  /** 天氣 */
  weather?: string;
}

/** 錢包交易記錄 */
export interface PeekTransaction {
  id: string;
  /** 交易描述 */
  description: string;
  /** 金額（正數=入帳，負數=出帳） */
  amount: number;
  /** 時間 (HH:mm) */
  time: string;
}

/** 相冊照片 */
export interface PeekGalleryItem {
  id: string;
  /** 照片描述（AI 生成的文字描述） */
  description: string;
  /** 來源：selfie=角色自拍, scene=角色拍攝的風景/物品, saved=從聊天保存 */
  source: "selfie" | "scene" | "saved";
  /** 保存原因（角色的內心獨白，為什麼保存這張） */
  reason: string;
  /** 日期 (YYYY-MM-DD) */
  date: string;
}

/** 角色手機完整資料 */
export interface PeekPhoneData {
  characterId: string;
  /** 聊天記錄 */
  chats: PeekChatThread[];
  /** 今日行程 */
  schedule: PeekScheduleItem[];
  /** 飲食記錄 */
  meals: PeekMealRecord[];
  /** 存款金額 */
  balance: number;
  /** 錢包交易記錄 */
  transactions: PeekTransaction[];
  /** 備忘錄 */
  memos: PeekMemo[];
  /** 記事本 */
  notes: PeekNote[];
  /** 日記 */
  diary: PeekDiaryEntry[];
  /** 相冊 */
  gallery: PeekGalleryItem[];
}

/** 偷窺手機的 Tab 類型 */
export type PeekPhoneTab =
  | "chat"
  | "schedule"
  | "meals"
  | "balance"
  | "memo"
  | "notes"
  | "diary"
  | "gallery";
