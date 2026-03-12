/**
 * 重要事件記錄本類型定義
 */

// ===== 事件分類 =====
export type ImportantEventCategory = 
  | 'relationship'  // 關係與交往
  | 'promise'       // 約定與承諾
  | 'secret'        // 秘密與隱私
  | 'fact'          // 重要事實
  | 'custom';       // 其他

// ===== 事件優先級 =====
export type ImportantEventPriority = 1 | 2 | 3; // 1=最重要，3=一般

// ===== 事件來源 =====
export type ImportantEventSource = 'user' | 'ai' | 'system';

// ===== 單個重要事件 =====
export interface ImportantEvent {
  /** 唯一 ID */
  id: string;
  /** 事件內容 */
  content: string;
  /** 創建時間 */
  timestamp: number;
  /** 事件分類 */
  category?: ImportantEventCategory;
  /** 優先級（1=最重要，3=一般） */
  priority?: ImportantEventPriority;
  /** 來源 */
  source?: ImportantEventSource;
  /** 標籤 */
  tags?: string[];
  /** 關聯的消息 ID */
  relatedMessageId?: string;
}

// ===== 重要事件設置 =====
export interface ImportantEventsSettings {
  /** 是否啟用 */
  enabled: boolean;
  /** 是否自動從對話中提取重要事件 */
  autoSave: boolean;
  /** 最大事件數量 */
  maxEvents: number;
}

// ===== 重要事件記錄本 =====
export interface ImportantEventsLog {
  /** 主鍵（優先使用 chatId，向後兼容 characterId） */
  id: string;
  /** 綁定的角色 ID（向後兼容） */
  characterId: string;
  /** 綁定的聊天 ID（新版，優先使用） */
  chatId?: string;
  /** 事件列表 */
  events: ImportantEvent[];
  /** 設置 */
  settings: ImportantEventsSettings;
  /** 創建時間 */
  createdAt?: number;
  /** 更新時間 */
  updatedAt?: number;
}

// ===== 創建默認設置 =====
export const createDefaultImportantEventsSettings = (): ImportantEventsSettings => ({
  enabled: true,
  autoSave: true,
  maxEvents: 50,
});

// ===== 創建默認記錄本 =====
export const createDefaultImportantEventsLog = (
  characterId: string,
  chatId?: string,
): ImportantEventsLog => ({
  id: chatId || characterId,
  characterId,
  chatId,
  events: [],
  settings: createDefaultImportantEventsSettings(),
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ===== 創建新事件 =====
export const createImportantEvent = (
  content: string,
  options?: Partial<Omit<ImportantEvent, 'id' | 'content' | 'timestamp'>>,
): ImportantEvent => ({
  id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  content,
  timestamp: Date.now(),
  category: options?.category || 'custom',
  priority: options?.priority || 2,
  source: options?.source || 'user',
  tags: options?.tags || [],
  relatedMessageId: options?.relatedMessageId,
});
