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
  /** 傳出去又收回了（秘密：偷看收回了什麼） */
  recalled?: boolean;
  /** 收回前存在了幾秒 */
  recalledAfter?: number;
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
  /** 輸入框裡打了沒送出的話（秘密） */
  draft?: string;
  /** 草稿之前改過的版本，舊的在前 */
  draftHistory?: string[];
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
  /** 在「最近刪除」裡，剩幾天會永久刪除；沒有代表沒刪 */
  deletedDaysLeft?: number;
  /** 這張照片背後的故事（秘密：偷看這張照片） */
  secret?: string;
}

/** 瀏覽器歷史記錄 */
export interface PeekBrowserEntry {
  id: string;
  /** 頁面標題或搜尋關鍵詞 */
  title: string;
  /** 網址或搜尋詞 */
  url: string;
  /** 時間 (HH:mm) */
  time: string;
  /** 類型：search=搜尋紀錄, adult=成人內容, general=一般瀏覽 */
  category: "search" | "adult" | "general";
}

/** 隱藏的私密照片 */
export interface PeekHiddenPhoto {
  id: string;
  /** 照片描述 */
  description: string;
  /** 類型：selfie=本人自拍, saved=從網路保存, screenshot=截圖 */
  type: "selfie" | "saved" | "screenshot";
  /** 為什麼藏起來（角色的內心獨白） */
  reason: string;
  /** 日期 (YYYY-MM-DD) */
  date: string;
}

/** 鎖屏密碼：跟使用者有關的 4 位數字 */
export interface PeekLockScreen {
  /** 4 位數字 */
  passcode: string;
  /** 給偷看的人的提示 */
  hint: string;
  /** 解開後顯示這組數字的意義 */
  reveal: string;
}

/** 螢幕使用時間（設定 App） */
export interface PeekScreenTime {
  /** 0 點到 23 點，每小時用了幾分鐘 */
  hourly: number[];
  /** 最常使用的 App */
  topApps: { name: string; minutes: number }[];
  /** 今天拿起手機幾次 */
  pickups: number;
  /** 今天第一次拿起的時間 (HH:mm) */
  firstPickup: string;
  /** 從使用紀錄看出來的心事（秘密） */
  insight: string;
}

/** 偷看進度：存在這支手機的資料裡，跟著備份 */
export interface PeekProgress {
  /** 解過鎖屏密碼或跳過了，之後拿起直接進主畫面 */
  unlocked: boolean;
  /** 已找到的秘密 key */
  revealed: string[];
  /** 打開過的 App */
  viewed: PeekPhoneTab[];
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
  /** 瀏覽器歷史 */
  browserHistory: PeekBrowserEntry[];
  /** 隱藏私密照片 */
  hiddenPhotos: PeekHiddenPhoto[];
  /** 鎖屏密碼（舊資料沒有） */
  lockScreen?: PeekLockScreen;
  /** 螢幕使用時間（舊資料沒有） */
  screenTime?: PeekScreenTime;
  /** 偷看進度 */
  progress?: PeekProgress;
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
  | "gallery"
  | "browser"
  | "hidden"
  | "deleted"
  | "settings";
