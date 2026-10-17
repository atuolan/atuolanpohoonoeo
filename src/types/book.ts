// 書籍類型定義

export interface BookChapter {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface StoredBook {
  id: string;
  title: string;
  author?: string;
  cover?: string; // base64 封面圖
  format: "txt" | "epub" | "pdf";
  chapters: BookChapter[];
  totalChars: number;
  createdAt: number;
  updatedAt: number;
}

/** 書架用的書籍摘要（不含內文，避免打開書架就把每本書全文讀進記憶體） */
export interface BookMeta {
  id: string;
  title: string;
  author?: string;
  cover?: string;
  format: StoredBook["format"];
  chapterTitles: string[];
  chapterLengths: number[];
  totalChars: number;
  createdAt: number;
  updatedAt: number;
}

export interface BookReadingProgress {
  bookId: string;
  chapterIndex: number;
  /** 章內頁碼（舊版只存這個，換字級後會對不上） */
  scrollPosition: number;
  /** 章內字元位置 */
  charOffset?: number;
  /** 全書百分比 0–100 */
  percent?: number;
  lastReadAt: number;
  /** 每天在這本書上讀了幾秒：YYYY-MM-DD → 秒 */
  dailySeconds?: Record<string, number>;
  /** 劃線與筆記 */
  highlights?: BookHighlight[];
  /** 好玩模式的紀錄 */
  play?: {
    summon?: {
      author: string;
      style: "original" | "modern";
      guest?: string;
      messages: Array<{ role: "user" | "author" | "guest"; name: string; content: string; timestamp: number }>;
    };
    whatIf?: {
      chapterIndex: number;
      charOffset: number;
      branches: string[];
      picked?: number;
      story?: string;
    };
    duels?: Array<{
      characterId: string;
      characterName: string;
      myScore: number;
      rivalScore: number;
      at: number;
    }>;
  };
  /** 上一次「三句接上」的結果（位置沒變就直接沿用） */
  lastRecap?: {
    chapterIndex: number;
    charOffset: number;
    lines: string[];
    createdAt: number;
  };
}

export interface BookHighlight {
  id: string;
  chapterId: string;
  /** 建立時的章節位置（章節 id 找不到時用） */
  chapterIndex: number;
  /** 章內字元位置 [start, end) */
  start: number;
  end: number;
  text: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type ReaderBackground = "sepia" | "white" | "night" | "green";

export interface ReaderPrefs {
  fontSize: number;
  lineHeight: number;
  fontFamily: "serif" | "sans";
  background: ReaderBackground;
  /** 每日閱讀目標（分鐘） */
  dailyGoalMinutes: number;
}

// ===== 伴讀聊天類型 =====

export interface CompanionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  senderName: string;
}

export interface CompanionChatState {
  bookId: string;
  characterId: string;
  triggerFrequency: number;
  pageTurnCounter: number;
  bubblePosition: { x: number; y: number };
  messages: CompanionMessage[];
  /** 已同步到主聊天的訊息數（舊存檔沒有此欄位，視為全部已同步） */
  syncedCount?: number;
}
