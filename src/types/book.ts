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

export interface BookReadingProgress {
  bookId: string;
  chapterIndex: number;
  scrollPosition: number;
  lastReadAt: number;
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
}
