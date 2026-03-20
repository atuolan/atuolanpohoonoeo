import type {
  CharacterAffinityConfig,
  ChatAffinityState,
} from "@/schemas/affinity";
import type {
  CachedImage,
  CallHistoryEntry,
  CharacterAffection,
  LayoutConfig,
  PendingCall,
  QZonePost,
  ThemeConfig,
} from "@/types";
import type { AuthState } from "@/types/auth";
import type { BookReadingProgress, StoredBook } from "@/types/book";
import type { CalendarEvent } from "@/types/calendar";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { HolidayTriggerRecord } from "@/types/holiday";
import type { ImportantEventsLog } from "@/types/importantEvents";
import type { AppSettings } from "@/types/settings";
import type { StickerCategory } from "@/types/sticker";
import type { Lorebook } from "@/types/worldinfo";
import { DBSchema, IDBPDatabase, openDB } from "idb";

// ============================================================
// 總結和日記類型定義
// ============================================================

export interface ConversationSummary {
  id: string;
  chatId: string;
  characterId: string;
  content: string;
  createdAt: number;
  messageCount: number;
  isImportant?: boolean;
  isManual?: boolean;
  isMeta?: boolean;
}

export interface DiaryEntry {
  id: string;
  chatId: string;
  characterId: string;
  content: string;
  createdAt: number;
  messageCount: number;
  isFavorite?: boolean;
  status: "writing" | "ready";
}

// ============================================================
// 向量嵌入記錄類型
// ============================================================

export interface VectorEmbeddingRecord {
  id: string; // 格式: "vec_{sourceId}"
  sourceId: string;
  sourceType: "summary" | "diary";
  chatId: string;
  characterId: string;
  vector: Float32Array | null; // null 表示 stale
  contentHash: string;
  dimensions: number;
  createdAt: number;
  updatedAt: number;
}

// ============================================================
// 音頻 Blob 記錄類型
// ============================================================

export interface AudioBlobRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

// ============================================================
// IndexedDB Schema 定義
// ============================================================

interface AguaphoneDB extends DBSchema {
  themes: {
    key: string;
    value: ThemeConfig;
    indexes: {
      "by-active": number;
      "by-preset": string;
    };
  };
  layouts: {
    key: string;
    value: LayoutConfig;
    indexes: {
      "by-active": number;
    };
  };
  characterAffections: {
    key: string;
    value: CharacterAffinityConfig | CharacterAffection;
    indexes: {
      "by-enabled": number;
    };
  };
  chatAffinityStates: {
    key: string;
    value: ChatAffinityState;
    indexes: {
      "by-character": string;
    };
  };
  settings: {
    key: string;
    value: unknown;
  };
  /**
   * 使用者自訂提示詞庫（不受提示詞 reset-all 影響）
   * - key: 自訂提示詞 identifier
   * - value: PromptDefinition
   */
  promptLibrary: {
    key: string;
    value: import("@/types/promptManager").PromptDefinition;
  };
  // === 新增：角色與世界書 ===
  characters: {
    key: string;
    value: StoredCharacter;
    indexes: {
      "by-name": string;
      "by-updated": number;
    };
  };
  lorebooks: {
    key: string;
    value: Lorebook;
    indexes: {
      "by-name": string;
      "by-updated": number;
    };
  };
  chats: {
    key: string;
    value: Chat;
    indexes: {
      "by-character": string;
      "by-updated": number;
    };
  };
  appSettings: {
    key: string;
    value: AppSettings;
  };
  stickers: {
    key: string;
    value: StickerCategory;
    indexes: {
      "by-custom": number;
    };
  };
  importantEvents: {
    key: string;
    value: ImportantEventsLog;
    indexes: {
      "by-character": string;
      "by-updated": number;
    };
  };
  summaries: {
    key: string;
    value: ConversationSummary;
    indexes: {
      "by-chat": string;
      "by-character": string;
      "by-created": number;
    };
  };
  diaries: {
    key: string;
    value: DiaryEntry;
    indexes: {
      "by-chat": string;
      "by-character": string;
      "by-created": number;
    };
  };
  qzonePosts: {
    key: string;
    value: QZonePost;
    indexes: {
      "by-author": string;
      "by-timestamp": number;
    };
  };
  imageCache: {
    key: string;
    value: CachedImage;
    indexes: {
      "by-lastUsed": number;
      "by-created": number;
    };
  };
  pendingCalls: {
    key: string;
    value: PendingCall;
    indexes: {
      "by-character": string;
      "by-triggerTime": number;
    };
  };
  callHistory: {
    key: string;
    value: CallHistoryEntry;
    indexes: {
      "by-character": string;
      "by-created": number;
    };
  };
  gameStates: {
    key: string;
    value: unknown;
  };
  holidayRecords: {
    key: string;
    value: HolidayTriggerRecord;
    indexes: {
      "by-chat": string;
      "by-date": string;
      "by-triggered": number;
    };
  };
  calendarEvents: {
    key: string;
    value: CalendarEvent;
    indexes: {
      "by-date": string;
      "by-type": string;
    };
  };
  authState: {
    key: string;
    value: AuthState;
  };
  rendererRules: {
    key: string;
    value: Record<string, unknown>;
    indexes: {
      "by-category": string;
      "by-priority": number;
      "by-enabled": number;
    };
  };
  // === v16 新增：書籍閱讀 ===
  books: {
    key: string;
    value: StoredBook;
    indexes: {
      "by-title": string;
      "by-created": number;
    };
  };
  bookProgress: {
    key: string;
    value: BookReadingProgress;
  };
  // === v17 新增：音頻 blob 儲存 ===
  "audio-blobs": {
    key: string;
    value: AudioBlobRecord;
  };
  // === v22 新增：向量嵌入儲存 ===
  vectorEmbeddings: {
    key: string;
    value: VectorEmbeddingRecord;
    indexes: {
      "by-sourceId": string;
      "by-chatId": string;
      "by-sourceType": string;
    };
  };
}

// ============================================================
// 資料庫常數
// ============================================================

const DB_NAME = "aguaphone-db";
const DB_VERSION = 22;

// Store 名稱常量
export const DB_STORES = {
  THEMES: "themes",
  LAYOUTS: "layouts",
  CHARACTER_AFFECTIONS: "characterAffections",
  SETTINGS: "settings",
  PROMPT_LIBRARY: "promptLibrary",
  CHARACTERS: "characters",
  LOREBOOKS: "lorebooks",
  CHATS: "chats",
  APP_SETTINGS: "appSettings",
  STICKERS: "stickers",
  IMPORTANT_EVENTS: "importantEvents",
  SUMMARIES: "summaries",
  DIARIES: "diaries",
  QZONE_POSTS: "qzonePosts",
  IMAGE_CACHE: "imageCache",
  PENDING_CALLS: "pendingCalls",
  CALL_HISTORY: "callHistory",
  GAME_STATES: "gameStates",
  HOLIDAY_RECORDS: "holidayRecords",
  CALENDAR_EVENTS: "calendarEvents",
  AUTH_STATE: "authState",
  RENDERER_RULES: "rendererRules",
  BOOKS: "books",
  BOOK_PROGRESS: "bookProgress",
  AUDIO_BLOBS: "audio-blobs",
  CHAT_AFFINITY_STATES: "chatAffinityStates",
  VECTOR_EMBEDDINGS: "vectorEmbeddings",
} as const;

// ============================================================
// 資料庫實例
// ============================================================

let dbInstance: IDBPDatabase<AguaphoneDB> | null = null;

/**
 * DB 升級前的預防性 OPFS 備份
 * 在 openDB 之前檢查版本，若即將升級則先把關鍵資料備份到 OPFS
 * 防止升級過程中出錯導致資料遺失
 */
async function preUpgradeBackup(): Promise<void> {
  try {
    // 檢查 OPFS 支援
    if (!navigator.storage?.getDirectory) return;

    // 用原生 IDB 檢查當前版本（不觸發 upgrade）
    const currentVersion = await new Promise<number>((resolve) => {
      const req = indexedDB.open(DB_NAME);
      req.onsuccess = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        const ver = idb.version;
        idb.close();
        resolve(ver);
      };
      req.onerror = () => resolve(0);
    });

    // 版本相同，不需要預備份
    if (currentVersion >= DB_VERSION || currentVersion === 0) return;

    console.log(`[DB] 偵測到版本升級 v${currentVersion} → v${DB_VERSION}，執行預防性 OPFS 備份...`);

    // 用原生 IDB 讀取關鍵 store 的資料
    const backupStores = ['characters', 'lorebooks', 'chats', 'summaries', 'diaries', 'importantEvents', 'stickers'];
    const backup: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};

    await new Promise<void>((resolve) => {
      const req = indexedDB.open(DB_NAME, currentVersion);
      req.onsuccess = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        const availableStores = Array.from(idb.objectStoreNames);
        const storesToBackup = backupStores.filter(s => availableStores.includes(s));

        if (storesToBackup.length === 0) {
          idb.close();
          resolve();
          return;
        }

        const tx = idb.transaction(storesToBackup, 'readonly');
        let pending = storesToBackup.length;

        for (const storeName of storesToBackup) {
          const store = tx.objectStore(storeName);
          const getReq = store.getAll();
          getReq.onsuccess = () => {
            const records = getReq.result || [];
            if (storeName === 'chats') {
              // 聊天保留完整訊息（預防性備份不截斷）
              backup[storeName] = records;
            } else {
              backup[storeName] = records;
            }
            counts[storeName] = records.length;
            pending--;
            if (pending === 0) {
              idb.close();
              resolve();
            }
          };
          getReq.onerror = () => {
            pending--;
            if (pending === 0) {
              idb.close();
              resolve();
            }
          };
        }
      };
      req.onerror = () => resolve();
    });

    // 檢查是否有值得備份的資料
    if (!counts['characters'] || counts['characters'] === 0) return;

    // 寫入 OPFS
    const root = await navigator.storage.getDirectory();
    const backupStr = JSON.stringify(backup);
    const sizeMB = backupStr.length / (1024 * 1024);

    const dataHandle = await root.getFileHandle('aguaphone_pre_upgrade_backup.json', { create: true });
    const dataWritable = await (dataHandle as any).createWritable();
    await dataWritable.write(backupStr);
    await dataWritable.close();

    const meta = { timestamp: Date.now(), counts, fromVersion: currentVersion, toVersion: DB_VERSION };
    const metaHandle = await root.getFileHandle('aguaphone_pre_upgrade_backup_meta.json', { create: true });
    const metaWritable = await (metaHandle as any).createWritable();
    await metaWritable.write(JSON.stringify(meta));
    await metaWritable.close();

    console.log(`[DB] 預防性 OPFS 備份完成 (${sizeMB.toFixed(2)}MB):`, counts);
  } catch (error) {
    console.warn('[DB] 預防性備份失敗（非致命）:', error);
  }
}

/**
 * 獲取資料庫實例
 */
export async function getDatabase(): Promise<IDBPDatabase<AguaphoneDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  // 升級前先備份到 OPFS，防止升級過程中資料遺失
  await preUpgradeBackup();

  dbInstance = await openDB<AguaphoneDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion) {
      console.log(`[DB] 升級資料庫 v${oldVersion} -> v${newVersion}`);

      // 建立 themes 表
      if (!db.objectStoreNames.contains("themes")) {
        const themesStore = db.createObjectStore("themes", { keyPath: "id" });
        themesStore.createIndex("by-active", "isActive");
        themesStore.createIndex("by-preset", "preset");
      }

      // 建立 layouts 表
      if (!db.objectStoreNames.contains("layouts")) {
        const layoutsStore = db.createObjectStore("layouts", { keyPath: "id" });
        layoutsStore.createIndex("by-active", "isActive");
      }

      // 建立 characterAffections 表
      if (!db.objectStoreNames.contains("characterAffections")) {
        const affectionStore = db.createObjectStore("characterAffections", {
          keyPath: "characterId",
        });
        affectionStore.createIndex("by-enabled", "enabled");
      }

      // 建立 settings 表
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }

      // 建立 promptLibrary 表（使用者自訂提示詞庫，不受提示詞 reset-all 影響）
      if (!db.objectStoreNames.contains("promptLibrary")) {
        db.createObjectStore("promptLibrary");
      }

      // === v2 新增表 ===

      // 建立 characters 表
      if (!db.objectStoreNames.contains("characters")) {
        const charactersStore = db.createObjectStore("characters", {
          keyPath: "id",
        });
        charactersStore.createIndex("by-name", "nickname");
        charactersStore.createIndex("by-updated", "updatedAt");
      }

      // 建立 lorebooks 表
      if (!db.objectStoreNames.contains("lorebooks")) {
        const lorebooksStore = db.createObjectStore("lorebooks", {
          keyPath: "id",
        });
        lorebooksStore.createIndex("by-name", "name");
        lorebooksStore.createIndex("by-updated", "updatedAt");
      }

      // 建立 chats 表
      if (!db.objectStoreNames.contains("chats")) {
        const chatsStore = db.createObjectStore("chats", { keyPath: "id" });
        chatsStore.createIndex("by-character", "characterId");
        chatsStore.createIndex("by-updated", "updatedAt");
      }

      // 建立 appSettings 表
      if (!db.objectStoreNames.contains("appSettings")) {
        db.createObjectStore("appSettings", { keyPath: "id" });
      }

      // === v3 新增表 ===

      // 建立 stickers 表
      if (!db.objectStoreNames.contains("stickers")) {
        const stickersStore = db.createObjectStore("stickers", {
          keyPath: "id",
        });
        stickersStore.createIndex("by-custom", "isCustom");
      }

      // === v4 新增表 ===

      // 建立 importantEvents 表
      if (!db.objectStoreNames.contains("importantEvents")) {
        const importantEventsStore = db.createObjectStore("importantEvents", {
          keyPath: "id",
        });
        importantEventsStore.createIndex("by-character", "characterId");
        importantEventsStore.createIndex("by-updated", "updatedAt");
      }

      // === v5 新增表 ===

      // 建立 summaries 表
      if (!db.objectStoreNames.contains("summaries")) {
        const summariesStore = db.createObjectStore("summaries", {
          keyPath: "id",
        });
        summariesStore.createIndex("by-chat", "chatId");
        summariesStore.createIndex("by-character", "characterId");
        summariesStore.createIndex("by-created", "createdAt");
      }

      // 建立 diaries 表
      if (!db.objectStoreNames.contains("diaries")) {
        const diariesStore = db.createObjectStore("diaries", { keyPath: "id" });
        diariesStore.createIndex("by-chat", "chatId");
        diariesStore.createIndex("by-character", "characterId");
        diariesStore.createIndex("by-created", "createdAt");
      }

      // === v6 新增表 ===

      // 建立 qzonePosts 表
      if (!db.objectStoreNames.contains("qzonePosts")) {
        const qzonePostsStore = db.createObjectStore("qzonePosts", {
          keyPath: "id",
        });
        qzonePostsStore.createIndex("by-author", "authorId");
        qzonePostsStore.createIndex("by-timestamp", "timestamp");
      }

      // === v7 新增表 ===

      // 建立 imageCache 表
      if (!db.objectStoreNames.contains("imageCache")) {
        const imageCacheStore = db.createObjectStore("imageCache", {
          keyPath: "id",
        });
        imageCacheStore.createIndex("by-lastUsed", "lastUsedAt");
        imageCacheStore.createIndex("by-created", "createdAt");
      }

      // === v8 新增表 ===

      // 建立 pendingCalls 表（待處理來電）
      if (!db.objectStoreNames.contains("pendingCalls")) {
        const pendingCallsStore = db.createObjectStore("pendingCalls", {
          keyPath: "id",
        });
        pendingCallsStore.createIndex("by-character", "characterId");
        pendingCallsStore.createIndex("by-triggerTime", "triggerTime");
      }

      // 建立 callHistory 表（通話記錄）
      if (!db.objectStoreNames.contains("callHistory")) {
        const callHistoryStore = db.createObjectStore("callHistory", {
          keyPath: "id",
        });
        callHistoryStore.createIndex("by-character", "characterId");
        callHistoryStore.createIndex("by-created", "createdAt");
      }

      // === v9 新增表 ===

      // 建立 gameStates 表（遊戲經濟狀態）
      if (!db.objectStoreNames.contains("gameStates")) {
        db.createObjectStore("gameStates");
      }

      // === v10 新增表 ===

      // 建立 holidayRecords 表（節日觸發記錄）
      if (!db.objectStoreNames.contains("holidayRecords")) {
        const holidayRecordsStore = db.createObjectStore("holidayRecords", {
          keyPath: "id",
        });
        holidayRecordsStore.createIndex("by-chat", "chatId");
        holidayRecordsStore.createIndex("by-date", "holidayDate");
        holidayRecordsStore.createIndex("by-triggered", "triggeredAt");
      }

      // === v11 新增表 ===

      // 建立 calendarEvents 表（行事曆事件）
      if (!db.objectStoreNames.contains("calendarEvents")) {
        const calendarEventsStore = db.createObjectStore("calendarEvents", {
          keyPath: "id",
        });
        calendarEventsStore.createIndex("by-date", "date");
        calendarEventsStore.createIndex("by-type", "type");
      }

      // === v12 新增表 ===

      // 建立 authState 表（驗證狀態）
      if (!db.objectStoreNames.contains("authState")) {
        db.createObjectStore("authState", { keyPath: "id" });
      }

      // v13: messageChunks 已移除，訊息回歸存在 chat.messages

      // === v14 新增表 ===

      // 建立 rendererRules 表（自定義渲染規則）
      if (!db.objectStoreNames.contains("rendererRules")) {
        const rendererRulesStore = db.createObjectStore("rendererRules", {
          keyPath: "id",
        });
        rendererRulesStore.createIndex("by-category", "category");
        rendererRulesStore.createIndex("by-priority", "priority");
        rendererRulesStore.createIndex("by-enabled", "enabled");
      }

      // === v16 新增表 ===

      // 建立 books 表（書籍）
      if (!db.objectStoreNames.contains("books")) {
        const booksStore = db.createObjectStore("books", { keyPath: "id" });
        booksStore.createIndex("by-title", "title");
        booksStore.createIndex("by-created", "createdAt");
      }

      // 建立 bookProgress 表（閱讀進度）
      if (!db.objectStoreNames.contains("bookProgress")) {
        db.createObjectStore("bookProgress", { keyPath: "bookId" });
      }

      // === v17 新增表 ===

      // 建立 audio-blobs 表（音頻 blob 儲存）
      if (!db.objectStoreNames.contains("audio-blobs")) {
        db.createObjectStore("audio-blobs", { keyPath: "id" });
      }

      // === v20/v21 新增表 ===

      // 建立 chatAffinityStates 表（聊天好感度狀態）
      if (!db.objectStoreNames.contains("chatAffinityStates")) {
        const chatAffinityStore = db.createObjectStore("chatAffinityStates", {
          keyPath: "chatId",
        });
        chatAffinityStore.createIndex("by-character", "characterId");
      }

      // === v22 新增表 ===

      // 建立 vectorEmbeddings 表（向量嵌入儲存）
      if (!db.objectStoreNames.contains("vectorEmbeddings")) {
        const vectorStore = db.createObjectStore("vectorEmbeddings", {
          keyPath: "id",
        });
        vectorStore.createIndex("by-sourceId", "sourceId");
        vectorStore.createIndex("by-chatId", "chatId");
        vectorStore.createIndex("by-sourceType", "sourceType");
      }
    },
    blocked() {
      console.warn("[DB] 資料庫被阻擋，嘗試關閉舊連線以解除阻擋...");
      // 主動關閉舊連線，讓 upgrade 可以繼續
      if (dbInstance) {
        try {
          dbInstance.close();
        } catch {
          /* 忽略 */
        }
        dbInstance = null;
      }
      db._instance = null;
      db._initialized = false;
    },
    blocking() {
      console.warn("[DB] 資料庫阻擋中，將在需要時重新連接");
      // 關閉當前連接並重置所有狀態，確保下次操作會重新連接
      if (dbInstance) {
        try {
          dbInstance.close();
        } catch {
          // 忽略關閉錯誤
        }
        dbInstance = null;
      }
      // 同步重置 db 封裝層的狀態，避免 isOpen() 回傳不一致
      db._instance = null;
      db._initialized = false;
    },
    terminated() {
      console.error("[DB] 資料庫連接意外終止，將在下次操作時重新連接");
      dbInstance = null;
      // 同步重置 db 封裝層的狀態
      db._instance = null;
      db._initialized = false;
    },
  });

  return dbInstance;
}

/**
 * 關閉資料庫連接
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * 清除所有資料（開發用）
 */
export async function clearAllData(): Promise<void> {
  const database = await getDatabase();
  const stores = [
    "themes",
    "layouts",
    "characterAffections",
    "settings",
    "promptLibrary",
    "characters",
    "lorebooks",
    "chats",
    "appSettings",
    "stickers",
    "importantEvents",
    "summaries",
    "diaries",
    "qzonePosts",
    "imageCache",
    "pendingCalls",
    "callHistory",
    "gameStates",
    "holidayRecords",
    "calendarEvents",
    "authState",
    "rendererRules",
    "books",
    "bookProgress",
    "audio-blobs",
    "chatAffinityStates",
    "vectorEmbeddings",
  ] as const;
  const tx = database.transaction(stores, "readwrite");
  await Promise.all([
    ...stores.map((store) => tx.objectStore(store).clear()),
    tx.done,
  ]);

  // 同時清除畫布佈局資料庫（Aguaphone_V2），包含 widget 自定義圖標等
  // 修復：避免 deleteDatabase 在 blocked 時先 resolve，導致後續導入寫回被「晚到刪除」覆蓋
  try {
    const { storageService } = await import("@/services/storage");
    if (storageService.db) {
      storageService.db.close();
      storageService.db = null;
    }
  } catch {
    // 忽略
  }

  // 改用「開啟資料庫後清空 canvas_layout store」取代 deleteDatabase，避免競態條件
  try {
    await new Promise<void>((resolve) => {
      const openReq = indexedDB.open("Aguaphone_V2");

      openReq.onupgradeneeded = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        if (!idb.objectStoreNames.contains("canvas_layout")) {
          idb.createObjectStore("canvas_layout", { keyPath: "id" });
        }
      };

      openReq.onsuccess = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;

        if (!idb.objectStoreNames.contains("canvas_layout")) {
          idb.close();
          resolve();
          return;
        }

        const tx = idb.transaction(["canvas_layout"], "readwrite");
        const store = tx.objectStore("canvas_layout");
        store.clear();

        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => {
          console.warn("[DB] 清空 canvas_layout 失敗，仍繼續流程");
          idb.close();
          resolve();
        };
        tx.onabort = () => {
          console.warn("[DB] 清空 canvas_layout 中止，仍繼續流程");
          idb.close();
          resolve();
        };
      };

      openReq.onerror = () => {
        console.warn("[DB] 開啟 Aguaphone_V2 失敗，仍繼續流程");
        resolve();
      };
      openReq.onblocked = () => {
        console.warn("[DB] 開啟 Aguaphone_V2 被阻塞，仍繼續流程");
        resolve();
      };
    });

    console.log("[DB] 畫布佈局資料已清空");
  } catch (e) {
    console.warn("[DB] 清空畫布佈局資料失敗:", e);
  }

  console.log("[DB] 所有資料已清除");
}

// ============================================================
// 簡化 DB 封裝（供服務層使用）
// ============================================================

/**
 * 簡化的數據庫操作封裝
 */
export const db = {
  _instance: null as IDBPDatabase<AguaphoneDB> | null,
  _initialized: false,

  /**
   * 初始化數據庫
   */
  async init(): Promise<void> {
    if (this._initialized) return;
    try {
      this._instance = await getDatabase();
      this._initialized = true;
    } catch (e) {
      console.error("[db] Failed to initialize:", e);
      // 等待 500ms 後重試一次（處理 SW 更新時的短暫 blocking）
      await new Promise((r) => setTimeout(r, 500));
      try {
        dbInstance = null; // 重置全域 instance 讓 getDatabase 重新嘗試
        this._instance = await getDatabase();
        this._initialized = true;
        console.log("[db] 重試初始化成功");
      } catch (e2) {
        console.error("[db] 重試初始化仍失敗:", e2);
      }
    }
  },

  /**
   * 檢查是否已開啟
   */
  isOpen(): boolean {
    return this._initialized && this._instance !== null;
  },

  /**
   * 重新連接資料庫
   */
  async reconnect(): Promise<void> {
    this._instance = null;
    this._initialized = false;
    dbInstance = null;
    await this.init();
  },

  /**
   * 獲取單個記錄（帶重試）
   */
  async get<T>(storeName: string, key: string): Promise<T | undefined> {
    if (!this._instance) await this.init();
    if (!this._instance) throw new Error("Database not available");
    try {
      return await (this._instance.get(storeName as any, key) as Promise<
        T | undefined
      >);
    } catch (e) {
      // 連接可能已斷開，嘗試重新連接一次
      console.warn(`[db] get(${storeName}, ${key}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) throw new Error("Database reconnect failed");
      return this._instance.get(storeName as any, key) as Promise<
        T | undefined
      >;
    }
  },

  /**
   * 獲取所有記錄（帶重試）
   */
  async getAll<T>(storeName: string): Promise<T[]> {
    if (!this._instance) await this.init();
    if (!this._instance) return [];
    try {
      return await (this._instance.getAll(storeName as any) as Promise<T[]>);
    } catch (e) {
      // 連接可能已斷開，嘗試重新連接一次
      console.warn(`[db] getAll(${storeName}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) return [];
      return this._instance.getAll(storeName as any) as Promise<T[]>;
    }
  },

  /**
   * 新增或更新記錄
   * @param storeName - store 名稱
   * @param value - 要存儲的值
   * @param key - 可選的 key（用於沒有 keyPath 的 store）
   */
  async put<T>(storeName: string, value: T, key?: string): Promise<string> {
    if (!this._instance) await this.init();
    if (!this._instance) throw new Error("Database not initialized");
    // 防禦性深拷貝：去除 Vue 響應式 Proxy，避免 DataCloneError
    // 對於包含 Blob 等不可 JSON 序列化的物件，先嘗試直接寫入，失敗才用深拷貝
    try {
      return await (this._instance.put(
        storeName as any,
        value as any,
        key,
      ) as Promise<string>);
    } catch (e) {
      // DataCloneError: Vue Proxy 無法被結構化克隆，用 JSON 深拷貝去除
      if (e instanceof DOMException && e.name === "DataCloneError") {
        console.warn(
          `[db] put(${storeName}) 遭遇 DataCloneError，嘗試 JSON 深拷貝後重試`,
        );
        try {
          const plainValue = JSON.parse(JSON.stringify(value));
          return await (this._instance!.put(
            storeName as any,
            plainValue as any,
            key,
          ) as Promise<string>);
        } catch (e2) {
          // 深拷貝後仍失敗，可能是連接斷開，嘗試重連
          console.warn(
            `[db] put(${storeName}) 深拷貝後仍失敗，嘗試重新連接:`,
            e2,
          );
          await this.reconnect();
          if (!this._instance) throw new Error("Database reconnect failed");
          const plainValue = JSON.parse(JSON.stringify(value));
          return this._instance.put(
            storeName as any,
            plainValue as any,
            key,
          ) as Promise<string>;
        }
      }
      // 其他錯誤（如連接斷開），嘗試重連
      console.warn(`[db] put(${storeName}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) throw new Error("Database reconnect failed");
      return this._instance.put(
        storeName as any,
        value as any,
        key,
      ) as Promise<string>;
    }
  },

  /**
   * 刪除記錄（帶重試）
   */
  async delete(storeName: string, key: string): Promise<void> {
    if (!this._instance) await this.init();
    if (!this._instance) throw new Error("Database not initialized");
    try {
      return await this._instance.delete(storeName as any, key);
    } catch (e) {
      console.warn(`[db] delete(${storeName}, ${key}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) throw new Error("Database reconnect failed");
      return this._instance.delete(storeName as any, key);
    }
  },

  /**
   * 清空表（帶重試）
   */
  async clear(storeName: string): Promise<void> {
    if (!this._instance) await this.init();
    if (!this._instance) throw new Error("Database not initialized");
    try {
      return await this._instance.clear(storeName as any);
    } catch (e) {
      console.warn(`[db] clear(${storeName}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) throw new Error("Database reconnect failed");
      return this._instance.clear(storeName as any);
    }
  },

  /**
   * 計數（帶重試）
   */
  async count(storeName: string): Promise<number> {
    if (!this._instance) await this.init();
    if (!this._instance) return 0;
    try {
      return await this._instance.count(storeName as any);
    } catch (e) {
      console.warn(`[db] count(${storeName}) 失敗，嘗試重新連接:`, e);
      await this.reconnect();
      if (!this._instance) return 0;
      return this._instance.count(storeName as any);
    }
  },
};

export type { AguaphoneDB };
