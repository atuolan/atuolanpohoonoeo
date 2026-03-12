/**
 * 小劇場系統類型定義
 * 噗浪空間內建的「小劇場博主」功能
 */

/** 小劇場狀態 */
export type TheaterStatus = "published" | "continued" | "draft";

/** 小劇場模板類型 */
export type TheaterTemplate =
  | "wrong-message" // 誤發訊息給 char
  | "word-ranking" // 給喜歡的詞排名
  | "trend-imitation" // 模仿 trend
  | "misunderstanding" // 誤會場景（以為害羞其實是生氣）
  | "chat-screenshot" // 聊天截圖梗
  | "confession-fail" // 告白翻車
  | "daily-chaos" // 日常混亂
  | "late-night-chat" // 深夜對話
  | "random"; // 隨機

/** 小劇場內嵌的模擬短信 */
export interface TheaterSmsMessage {
  /** 發送者名稱 */
  sender: string;
  /** 是否為 user 發送 */
  isUser: boolean;
  /** 訊息內容 */
  content: string;
  /** 時間標記（顯示用，如 "22:03"） */
  time?: string;
}

/** 小劇場內嵌短信區塊 */
export interface TheaterSmsBlock {
  /** 對話參與者名稱列表 */
  participants: string[];
  /** 短信列表 */
  messages: TheaterSmsMessage[];
}

/** 小劇場評論 */
export interface TheaterComment {
  id: string;
  /** 評論者 ID（char ID 或 user persona ID） */
  authorId: string;
  /** 評論者名稱 */
  authorName: string;
  /** 評論者頭像 */
  authorAvatar: string;
  /** 評論者類型 */
  authorType: "char" | "user" | "blogger";
  /** 評論內容 */
  content: string;
  /** 時間戳 */
  timestamp: number;
  /** 回覆的評論 ID */
  replyToId?: string;
  /** 回覆的評論者名稱 */
  replyToName?: string;
}

/** 小劇場角色配對 */
export interface TheaterCast {
  /** 角色 ID */
  characterId: string;
  /** 角色名稱 */
  characterName: string;
  /** 角色頭像 */
  characterAvatar: string;
  /** User Persona ID */
  userPersonaId: string;
  /** User 名稱 */
  userName: string;
  /** User 頭像 */
  userAvatar: string;
}

/** 小劇場文章 */
export interface TheaterPost {
  id: string;
  /** 博主名稱 */
  bloggerName: string;
  /** 博主頭像 */
  bloggerAvatar: string;
  /** 標題 */
  title: string;
  /** 正文內容（Markdown，含 HTML 短信區塊標記） */
  content: string;
  /** 內嵌短信區塊（解析後） */
  smsBlocks: TheaterSmsBlock[];
  /** 使用的模板類型 */
  template: TheaterTemplate;
  /** 角色配對 */
  cast: TheaterCast;
  /** 點讚數 */
  likeCount: number;
  /** 是否已點讚 */
  liked: boolean;
  /** 評論列表 */
  comments: TheaterComment[];
  /** 續寫次數 */
  continuationCount: number;
  /** 狀態 */
  status: TheaterStatus;
  /** 標籤 */
  tags: string[];
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
  /** NSFW 標記 */
  isNsfw: boolean;
}

/** 小劇場博主設定 */
export interface TheaterBloggerSettings {
  /** 博主名稱 */
  name: string;
  /** 博主頭像 */
  avatar: string;
  /** 博主簡介 */
  bio: string;
  /** 是否啟用自動生成 */
  autoGenerate: boolean;
  /** 自動生成間隔（分鐘） */
  autoInterval: number;
  /** 允許 NSFW */
  allowNsfw: boolean;
  /** 最小生成 token 數 */
  minTokens: number;
  /** 偏好的模板類型（空 = 全部隨機） */
  preferredTemplates: TheaterTemplate[];
}

/** 默認博主設定 */
export const DEFAULT_BLOGGER_SETTINGS: TheaterBloggerSettings = {
  name: "什麼嘛我還以為是阿瓜雲欸 ",
  avatar: "",
  bio: "專門寫 char × user 的同人小劇場，點讚就續寫！",
  autoGenerate: false,
  autoInterval: 120,
  allowNsfw: true,
  minTokens: 2000,
  preferredTemplates: [],
};
