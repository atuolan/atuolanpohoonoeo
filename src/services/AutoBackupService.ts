/**
 * 自動備份服務
 *
 * 主方案：File System Access API（直接寫入使用者選擇的本地資料夾）
 * Fallback：觸發下載（不支援 FSAA 的瀏覽器）
 *
 * dirHandle 存入 IndexedDB，下次開頁面可重新取得權限。
 */

import { db, DB_STORES } from "@/db/database";
import { exportChatImageMediaDirect } from "@/db/operations";
import { loadMessages } from "@/storage/chatMessageStorage";
import {
  BackupMediaExtractor,
  extractMediaFromChatBackupData,
  extractAllMediaFromBackupData,
  normalizeChatBackupMediaSources,
} from "@/utils/backupMediaExtractor";
import { strToU8, zip, Zip as FflateZip, AsyncZipDeflate, ZipPassThrough } from "fflate";

// ============================================================
// 類型
// ============================================================

export interface AutoBackupSettings {
  /** 是否啟用自動備份 */
  enabled: boolean;
  /** 備份間隔（分鐘） */
  intervalMinutes: number;
  /** 最多保留幾份備份（0 = 不限） */
  maxBackups: number;
  /** 上次備份時間戳 */
  lastBackupAt: number | null;
  /** 上次備份狀態訊息 */
  lastBackupMessage: string;
}

export const DEFAULT_BACKUP_SETTINGS: AutoBackupSettings = {
  enabled: false,
  intervalMinutes: 30,
  maxBackups: 10,
  lastBackupAt: null,
  lastBackupMessage: "",
};

// ============================================================
// 內部狀態
// ============================================================

const IDB_DIR_HANDLE_KEY = "autoBackup-dirHandle";
const IDB_SETTINGS_KEY = "autoBackup-settings";

let _timer: ReturnType<typeof setInterval> | null = null;
let _dirHandle: FileSystemDirectoryHandle | null = null;

// ============================================================
// File System Access API 偵測
// ============================================================

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

// ============================================================
// dirHandle 持久化（存入 IndexedDB settings store）
// ============================================================

async function saveDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await db.init();
  await db.put(DB_STORES.SETTINGS, handle, IDB_DIR_HANDLE_KEY);
}

async function loadDirHandle(): Promise<FileSystemDirectoryHandle | null> {
  await db.init();
  const handle = await db.get<FileSystemDirectoryHandle>(
    DB_STORES.SETTINGS,
    IDB_DIR_HANDLE_KEY,
  );
  return handle ?? null;
}

async function clearDirHandle(): Promise<void> {
  await db.init();
  await db.delete(DB_STORES.SETTINGS, IDB_DIR_HANDLE_KEY);
}

// ============================================================
// 設定持久化
// ============================================================

export async function loadBackupSettings(): Promise<AutoBackupSettings> {
  await db.init();
  const saved = await db.get<AutoBackupSettings>(
    DB_STORES.SETTINGS,
    IDB_SETTINGS_KEY,
  );
  return saved
    ? { ...DEFAULT_BACKUP_SETTINGS, ...saved }
    : { ...DEFAULT_BACKUP_SETTINGS };
}

export async function saveBackupSettings(
  settings: AutoBackupSettings,
): Promise<void> {
  await db.init();
  await db.put(DB_STORES.SETTINGS, { ...settings }, IDB_SETTINGS_KEY);
}

// ============================================================
// 權限檢查
// ============================================================

/**
 * 檢查已儲存的 dirHandle 是否仍有寫入權限
 * 回傳 'granted' | 'denied' | 'prompt' | 'no-handle'
 */
export async function checkPermission(): Promise<
  "granted" | "denied" | "prompt" | "no-handle"
> {
  const handle = _dirHandle ?? (await loadDirHandle());
  if (!handle) return "no-handle";
  _dirHandle = handle;
  try {
    const perm = await (handle as any).queryPermission({ mode: "readwrite" });
    return perm as "granted" | "denied" | "prompt";
  } catch {
    return "denied";
  }
}

/**
 * 請求已儲存 dirHandle 的寫入權限（需要使用者手勢觸發）
 */
export async function requestPermission(): Promise<boolean> {
  const handle = _dirHandle ?? (await loadDirHandle());
  if (!handle) return false;
  _dirHandle = handle;
  try {
    const perm = await (handle as any).requestPermission({ mode: "readwrite" });
    return perm === "granted";
  } catch {
    return false;
  }
}

// ============================================================
// 選擇備份資料夾
// ============================================================

/**
 * 讓使用者選擇備份資料夾（需要使用者手勢觸發）
 */
export async function pickBackupDirectory(): Promise<boolean> {
  if (!isFileSystemAccessSupported()) return false;
  try {
    const handle = await (window as any).showDirectoryPicker({
      mode: "readwrite",
    });
    _dirHandle = handle;
    await saveDirHandle(handle);
    return true;
  } catch (e: any) {
    // 使用者取消
    if (e.name === "AbortError") return false;
    console.error("[AutoBackup] 選擇資料夾失敗:", e);
    return false;
  }
}

/**
 * 取得目前已選擇的資料夾名稱
 */
export async function getSelectedFolderName(): Promise<string | null> {
  const handle = _dirHandle ?? (await loadDirHandle());
  if (!handle) return null;
  _dirHandle = handle;
  return handle.name;
}

/**
 * 清除已選擇的資料夾
 */
export async function clearBackupDirectory(): Promise<void> {
  _dirHandle = null;
  await clearDirHandle();
}

// ============================================================
// 備份資料收集（流式 / 分塊，降低記憶體峰值）
// ============================================================

/** 進度回調 */
export type BackupProgressCallback = (info: {
  phase: string;
  current?: number;
  total?: number;
}) => void;

/**
 * 收集非聊天的輕量數據（通常 < 5 MB）
 */
/** 手動取 key-value 對的 store（沒有 keyPath，例如 gameStates / settings） */
async function loadKeyValueStore(
  storeName: "gameStates" | "promptLibrary" | "settings",
): Promise<Array<{ key: string; value: unknown }>> {
  try {
    if (!db._instance) await db.init();
    if (!db._instance) return [];
    const tx = db._instance.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const keys = await store.getAllKeys();
    const values = await store.getAll();
    return keys.map((key: IDBValidKey, i: number) => ({
      key: String(key),
      value: values[i],
    }));
  } catch {
    return [];
  }
}

/** 向量嵌入（Float32Array → 普通陣列，以便 JSON 序列化） */
async function loadVectorEmbeddings(): Promise<unknown[]> {
  try {
    const all = await db.getAll(DB_STORES.VECTOR_EMBEDDINGS);
    return all.map((rec: any) => ({
      ...rec,
      vector: rec.vector ? Array.from(rec.vector as Float32Array) : null,
    }));
  } catch {
    return [];
  }
}

/** canvas layout（widget 佈局、app 圖標、日曆顏色等）存在獨立的 Aguaphone_V2 IDB */
async function loadCanvasLayout(): Promise<any> {
  try {
    return await new Promise<any>((resolve) => {
      const req = indexedDB.open("Aguaphone_V2");
      req.onsuccess = (e) => {
        const idb = (e.target as IDBOpenDBRequest).result;
        if (!idb.objectStoreNames.contains("canvas_layout")) {
          idb.close();
          resolve(null);
          return;
        }
        const tx = idb.transaction(["canvas_layout"], "readonly");
        const store = tx.objectStore("canvas_layout");
        const getReq = store.get("main_layout");
        getReq.onsuccess = () => {
          idb.close();
          resolve(getReq.result || null);
        };
        getReq.onerror = () => {
          idb.close();
          resolve(null);
        };
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * 輕量資料的逐個載入器。
 *
 * 不可以一次把全部 store 讀進記憶體再處理——「輕量」是誤稱：
 * themes（桌布）、qzonePosts、stickers、oldSettings（劇場貼文）、canvasLayout
 * 裡面都塞著 base64 圖片。全部同時載入的峰值發生在第一個進度回報之前，
 * 資料量大的使用者會在畫面還沒出現時就閃退（症狀：什麼都沒彈出來）。
 *
 * 改成逐個載入 → 立刻抽出 base64 到 media/ → 只留下被路徑取代後的小物件，
 * 峰值就變成「單一 store + 全部已抽乾的 store」。
 */
const LIGHT_LOADERS: Array<{ key: string; load: () => Promise<unknown> }> = [
  { key: "characters", load: () => db.getAll(DB_STORES.CHARACTERS) },
  { key: "lorebooks", load: () => db.getAll(DB_STORES.LOREBOOKS) },
  { key: "settings", load: () => db.get(DB_STORES.APP_SETTINGS, "main-settings") },
  { key: "userData", load: () => db.get(DB_STORES.APP_SETTINGS, "user-data") },
  { key: "themes", load: () => db.getAll(DB_STORES.THEMES) },
  { key: "layouts", load: () => db.getAll(DB_STORES.LAYOUTS) },
  {
    key: "characterAffections",
    load: () => db.getAll(DB_STORES.CHARACTER_AFFECTIONS),
  },
  { key: "qzonePosts", load: () => db.getAll(DB_STORES.QZONE_POSTS) },
  { key: "summaries", load: () => db.getAll(DB_STORES.SUMMARIES) },
  { key: "diaries", load: () => db.getAll(DB_STORES.DIARIES) },
  { key: "pendingCalls", load: () => db.getAll(DB_STORES.PENDING_CALLS) },
  { key: "callHistory", load: () => db.getAll(DB_STORES.CALL_HISTORY) },
  { key: "holidayRecords", load: () => db.getAll(DB_STORES.HOLIDAY_RECORDS) },
  { key: "calendarEvents", load: () => db.getAll(DB_STORES.CALENDAR_EVENTS) },
  { key: "importantEvents", load: () => db.getAll(DB_STORES.IMPORTANT_EVENTS) },
  { key: "books", load: () => db.getAll(DB_STORES.BOOKS) },
  { key: "stickers", load: () => db.getAll(DB_STORES.STICKERS) },
  { key: "gameStates", load: () => loadKeyValueStore("gameStates") },
  { key: "rendererRules", load: () => db.getAll(DB_STORES.RENDERER_RULES) },
  { key: "bookProgress", load: () => db.getAll(DB_STORES.BOOK_PROGRESS) },
  {
    key: "chatAffinityStates",
    load: () => db.getAll(DB_STORES.CHAT_AFFINITY_STATES),
  },
  { key: "vectorEmbeddings", load: loadVectorEmbeddings },
  { key: "promptLibrary", load: () => loadKeyValueStore("promptLibrary") },
  { key: "oldSettings", load: () => loadKeyValueStore("settings") },
  { key: "canvasLayout", load: loadCanvasLayout },
];

/**
 * 取得所有聊天的 key 列表（不載入完整數據）
 */
async function getAllChatKeys(): Promise<string[]> {
  await db.init();
  // 使用原生 IDB 取 keys，避免載入所有聊天到記憶體
  return new Promise((resolve, reject) => {
    const rawReq = indexedDB.open("aguaphone-db");
    rawReq.onsuccess = (e) => {
      const idb = (e.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains("chats")) {
        idb.close();
        resolve([]);
        return;
      }
      const tx = idb.transaction(["chats"], "readonly");
      const store = tx.objectStore("chats");
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        idb.close();
        resolve(keysReq.result as string[]);
      };
      keysReq.onerror = () => {
        idb.close();
        reject(keysReq.error);
      };
    };
    rawReq.onerror = () => reject(rawReq.error);
  });
}

/** sink 未寫完的積壓上限，超過就暫停餵資料（背壓） */
const SINK_BACKPRESSURE_BYTES = 8 * 1024 * 1024;

/**
 * 讓出主線程，避免長時間阻塞導致瀏覽器殺掉頁面
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 將一個 Uint8Array 推入 fflate Zip 流。
 *
 * 回傳的 Promise 在該檔案的壓縮輸出全部交給 Zip（final chunk 已送出）後才 resolve，
 * 形成天然的背壓：呼叫端 await 之後才會讀下一份資料，pending 的壓縮量最多一個檔案。
 */
function pushFileToZip(
  zipper: FflateZip,
  filename: string,
  data: Uint8Array,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6,
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // 媒體檔案（已壓縮的圖片/音訊）用 level 0 直接存儲，節省 CPU
      const isMedia = filename.startsWith("media/");
      if (isMedia) {
        const passThrough = new ZipPassThrough(filename);
        zipper.add(passThrough);
        // ZipPassThrough 是同步的，push 回傳時資料已全部交給 zipper
        passThrough.push(data, true);
        resolve();
      } else {
        // AsyncZipDeflate 在 worker 中壓縮，等 final chunk 回來才算寫完
        const deflater = new AsyncZipDeflate(filename, { level });
        // 必須先 add：Zip.add() 會覆寫 file.ondata，之後才能包裝它
        zipper.add(deflater);
        const zipOndata = deflater.ondata;
        deflater.ondata = (err, chunk, final) => {
          zipOndata.call(deflater, err, chunk, final);
          if (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          } else if (final) {
            resolve();
          }
        };
        deflater.push(data, true);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/** 單一 ZIP entry 的輸入積壓上限，超過就等 worker 消化 */
const ZIP_ENTRY_INFLIGHT_BYTES = 2 * 1024 * 1024;

/**
 * 把 `backup.json` 的一個 top-level key 推入 entry。
 *
 * 陣列型 store（characters、vectorEmbeddings 等）逐筆序列化後推出，
 * 避免單一 store 整包 `JSON.stringify()` 產生巨大字串——vectorEmbeddings
 * 把 Float32Array 展成 JS number 陣列後，每個浮點數約 20 個字元，
 * 整包序列化足以單獨吃掉數十 MB。
 *
 * 輸出位元組與 `JSON.stringify(整包)` 對該 key 的輸出逐字相同。
 * 回傳 false 表示該 key 被省略（值為 undefined／函式／symbol）。
 */
async function pushLightValue(
  entry: { push: (data: Uint8Array) => void; inflight: () => number; drain: () => Promise<void> },
  key: string,
  value: unknown,
  isFirst: boolean,
): Promise<boolean> {
  const prefix = `${isFirst ? "" : ","}${JSON.stringify(key)}:`;

  if (Array.isArray(value)) {
    entry.push(strToU8(`${prefix}[`));
    for (let i = 0; i < value.length; i++) {
      // 陣列中的 undefined／函式／symbol 序列化為 null（與 JSON.stringify 一致）
      const itemJson = JSON.stringify(value[i]) ?? "null";
      entry.push(strToU8(i === 0 ? itemJson : `,${itemJson}`));
      if (entry.inflight() > ZIP_ENTRY_INFLIGHT_BYTES) {
        await entry.drain();
      }
    }
    entry.push(strToU8("]"));
    return true;
  }

  const json = JSON.stringify(value);
  // 與 JSON.stringify(整包) 一致：undefined 值的 key 會被省略
  if (json === undefined) return false;
  entry.push(strToU8(`${prefix}${json}`));
  return true;
}

/**
 * 開啟一個可分段寫入的 ZIP 檔案項目。
 *
 * 與 `pushFileToZip` 的差別：資料可以分多次餵進去，讓呼叫端不必先在
 * 記憶體組出完整內容。用於 `backup.json`——那包資料有 26 個 store，
 * 整包 `JSON.stringify()` 會產生單一巨大字串，峰值是資料本身的數倍。
 */
function openZipEntry(
  zipper: FflateZip,
  filename: string,
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6,
): {
  push: (data: Uint8Array) => void;
  /** 已餵給 worker 但還沒回吐輸出的位元組數 */
  inflight: () => number;
  /** 等到 worker 有輸出（或已無積壓）為止 */
  drain: () => Promise<void>;
  end: () => Promise<void>;
} {
  const deflater = new AsyncZipDeflate(filename, { level });
  // 必須先 add：Zip.add() 會覆寫 file.ondata，之後才能包裝它
  zipper.add(deflater);
  const zipOndata = deflater.ondata;

  let resolveEnd: () => void;
  let rejectEnd: (err: Error) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveEnd = resolve;
    rejectEnd = reject;
  });

  // waitForDrain() 只看 sink 的輸出積壓，看不到「已 push 進 worker 但還沒
  // 壓縮完」的輸入積壓。連續 push 時 worker 可以排上數 MB 而輸出 callback
  // 一次都還沒觸發，所以輸入端要自己計量。
  let pushedBytes = 0;
  let outputSeen = 0;
  let notify: (() => void) | null = null;

  deflater.ondata = (err, chunk, final) => {
    zipOndata.call(deflater, err, chunk, final);
    outputSeen++;
    pushedBytes = 0; // worker 已吐出資料，視為輸入端已消化
    notify?.();
    if (err) {
      rejectEnd(err instanceof Error ? err : new Error(String(err)));
    } else if (final) {
      resolveEnd();
    }
  };

  return {
    push: (data: Uint8Array) => {
      pushedBytes += data.length;
      deflater.push(data, false);
    },
    inflight: () => pushedBytes,
    drain: async () => {
      const before = outputSeen;
      // 讓出主線程給 worker 回呼的機會；worker 有輸出或積壓清空就結束等待
      for (let i = 0; i < 50 && pushedBytes > 0 && outputSeen === before; i++) {
        await Promise.race([
          new Promise<void>((resolve) => {
            notify = resolve;
          }),
          new Promise<void>((resolve) => setTimeout(resolve, 4)),
        ]);
        notify = null;
      }
    },
    end: () => {
      deflater.push(new Uint8Array(0), true);
      return done;
    },
  };
}

/**
 * ZIP 輸出接收端。提供時 ZIP chunks 直接寫出（例如寫入檔案系統），
 * 不在記憶體累積整份 ZIP。
 */
export type BackupOutputSink = {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
};

/**
 * 單包 ZIP 項目數上限。fflate 不寫 ZIP64，超過 65535 個項目的 ZIP 會損壞；
 * 圖片多的使用者單靠大小預算可能先撞到這條線。
 */
const MAX_ZIP_ENTRIES_PER_PART = 60000;

/** 巨大聊天每批處理的訊息數；分包只會切在批次之間 */
const CHAT_MESSAGE_BATCH = 100;

/**
 * 一個分包的 ZIP 寫出器：fflate Zip 流 + sink 背壓 + 錯誤傳遞。
 *
 * 有 sink 時 chunk 直接寫出；否則在記憶體累積，`finish()` 回傳完整 ZIP。
 */
class ZipPartWriter {
  private readonly zipper: FflateZip;
  private readonly outputChunks: Uint8Array[] = [];
  /** zipper 已吐出的位元組數（兩種模式都計），即最後的檔案大小 */
  outputBytes = 0;
  /**
   * 已餵進本包的未壓縮位元組數，用來判斷何時切包。
   *
   * 不能看 outputBytes：分段寫入的項目要等 worker 壓完才吐輸出，
   * 一個巨大聊天寫到一半時輸出幾乎不動，就永遠切不下去。
   * 而且導入端會把整包解壓進記憶體，真正要控制的本來就是解壓後的大小。
   */
  inputBytes = 0;
  entryCount = 0;
  /** ZIP/sink 一旦壞掉就是致命錯誤：不能被單一聊天的 try/catch 吞掉 */
  error: Error | null = null;
  readonly done: Promise<void>;

  private resolveDone!: () => void;
  private rejectDone!: (err: Error) => void;
  // sink.write 是 async，用一條串接的 promise 保證 chunk 順序寫出。
  // pendingBytes 追蹤「已交給 sink 但還沒寫完」的量，用於背壓。
  private writeChain: Promise<void> = Promise.resolve();
  private pendingBytes = 0;
  private drainNotify: (() => void) | null = null;

  constructor(private readonly sink?: BackupOutputSink) {
    this.done = new Promise<void>((resolve, reject) => {
      this.resolveDone = resolve;
      this.rejectDone = reject;
    });
    // 未被 await 時避免 unhandled rejection
    this.done.catch(() => {});

    this.zipper = new FflateZip((err, chunk, final) => {
      if (err) {
        console.error("[AutoBackup] ZIP 流錯誤:", err);
        this.fail(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      this.outputBytes += chunk.length;
      if (sink) {
        const size = chunk.length;
        this.pendingBytes += size;
        this.writeChain = this.writeChain.then(async () => {
          await sink.write(chunk);
          this.pendingBytes -= size;
          this.drainNotify?.();
        });
        this.writeChain.catch((writeErr) => {
          console.error("[AutoBackup] ZIP 寫出失敗:", writeErr);
          this.pendingBytes = 0;
          this.drainNotify?.();
          this.fail(
            writeErr instanceof Error ? writeErr : new Error(String(writeErr)),
          );
        });
        if (final) {
          this.writeChain.then(() => this.resolveDone()).catch(() => {});
        }
        return;
      }
      this.outputChunks.push(chunk);
      if (final) this.resolveDone();
    });
  }

  private fail(err: Error) {
    this.error ??= err;
    this.rejectDone(err);
  }

  /** 等待 sink 積壓降到閾值以下，避免壓縮速度超過磁碟寫入速度 */
  async waitForDrain(): Promise<void> {
    while (this.sink && this.pendingBytes > SINK_BACKPRESSURE_BYTES) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.drainNotify = resolve;
        }),
        this.done, // 出錯時直接拋出，不會卡死
      ]);
      this.drainNotify = null;
    }
  }

  /** 寫入一個完整的 ZIP 檔案項目，並在必要時等待 sink 消化積壓 */
  async writeEntry(filename: string, data: Uint8Array): Promise<void> {
    this.entryCount++;
    this.inputBytes += data.length;
    // 與 done 競賽：ZIP/sink 出錯時立即拋出，避免永遠等不到 final chunk
    await Promise.race([pushFileToZip(this.zipper, filename, data), this.done]);
    await this.waitForDrain();
  }

  /** 開啟一個可分段寫入的項目 */
  openEntry(filename: string): ReturnType<typeof openZipEntry> {
    this.entryCount++;
    const entry = openZipEntry(this.zipper, filename);
    return {
      ...entry,
      push: (data: Uint8Array) => {
        this.inputBytes += data.length;
        entry.push(data);
      },
    };
  }

  /** 結束 zip 流、等中央目錄寫完；記憶體模式回傳完整 ZIP */
  async finish(): Promise<Uint8Array | undefined> {
    this.zipper.end();
    await this.done;
    if (this.sink) {
      await this.sink.close();
      return undefined;
    }
    const result = new Uint8Array(this.outputBytes);
    let offset = 0;
    for (const chunk of this.outputChunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    this.outputChunks.length = 0;
    return result;
  }
}

/** 已寫完（sink 已 close）的分包 */
export interface ClosedBackupPart {
  /** 0 起算 */
  index: number;
  isLast: boolean;
  bytes: number;
  /** 記憶體模式（openPart 未回傳 sink）時的完整 ZIP */
  data?: Uint8Array;
}

export interface BuildSplitBackupOptions {
  onProgress?: BackupProgressCallback;
  excludeChatImages?: boolean;
  /**
   * 單一分包的未壓縮位元組預算。達到後在下一個安全點（聊天之間，或巨大聊天的
   * 訊息批次之間）切包。Infinity = 不分包。
   */
  partBudgetBytes?: number;
  /** 開啟第 index 個分包的輸出；回傳 undefined 表示該包在記憶體組裝 */
  openPart: (index: number) => Promise<BackupOutputSink | undefined>;
  /** 分包寫完。回呼結束前不會開始下一包，可用來等待使用者交付 */
  onPartClosed: (part: ClosedBackupPart) => Promise<void>;
  /** 寫到一半失敗時清理該分包的輸出 */
  abortPart?: (index: number) => Promise<void>;
}

/** 安全序列化單筆訊息；無法序列化就跳過該筆，不拖垮整個聊天 */
function stringifyMessage(msg: unknown, chatId: string): string | null {
  try {
    return JSON.stringify(msg) ?? null;
  } catch (err) {
    console.warn(
      `[AutoBackup] 聊天 "${chatId}" 有一筆訊息無法序列化，已跳過:`,
      err,
    );
    return null;
  }
}

/**
 * 分包構建備份 ZIP — 真正的流式構建
 *
 * 讀一份 → 立刻寫入 zip → 釋放，記憶體峰值 ≈ 單個最大檔案。
 * 每個分包都自成一體（媒體在包內去重），可以單獨導入。
 *
 * 第 1 包結構與舊版單檔備份相同：
 *   backup.json          — 輕量數據（不含聊天）
 *   chats/<chatId>.json  — 每個聊天獨立一個檔案
 *   media/*              — 提取的媒體檔案
 *   metadata.json        — 統計與分包資訊
 * 後續分包沒有 backup.json，另外可能有：
 *   chat-segments/<chatId>.<n>.json — 被切開的巨大聊天的後續訊息
 *     （放在 chats/ 之外：舊版導入器看不到它，就不會用它整個覆蓋掉聊天）
 */
export async function buildSplitBackup(
  opts: BuildSplitBackupOptions,
): Promise<void> {
  const { onProgress } = opts;
  const excludeChatImages = opts.excludeChatImages ?? false;
  const budget = opts.partBudgetBytes ?? Infinity;
  // 不分包時（例如 GitHub 備份）只能產出單一 ZIP，項目數上限也跟著不適用
  const entryCap = Number.isFinite(budget) ? MAX_ZIP_ENTRIES_PER_PART : Infinity;

  // 1. 不預先載入輕量數據——每個 store 在步驟 4 才逐個載入、抽媒體、寫出、釋放。
  //    一次全載的峰值發生在第一個進度畫面之前，使用者會看到「什麼都沒彈出就閃退」。
  onProgress?.({ phase: "收集基礎數據..." });
  await yieldToMain();
  await db.init();
  const exportedAt = new Date().toISOString();
  const backupId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const chatKeys = await getAllChatKeys();
  const totalChats = chatKeys.length;

  let partIndex = 0;
  let part!: ZipPartWriter;
  let partOpen = false;
  let extractor!: BackupMediaExtractor;
  let partMediaCount = 0;
  let partChatCount = 0;

  const partLabel = () => (partIndex > 0 ? `（第 ${partIndex + 1} 部分）` : "");

  // 2. 每個分包一個 Zip 流、一個媒體提取器（包內去重，分包才能單獨導入）
  const startPart = async () => {
    const sink = await opts.openPart(partIndex);
    part = new ZipPartWriter(sink);
    partOpen = true;
    partMediaCount = 0;
    partChatCount = 0;
    extractor = new BackupMediaExtractor(async (filename, data) => {
      partMediaCount++;
      await part.writeEntry(filename, data);
    });
  };

  const closePart = async (isLast: boolean) => {
    const mediaResult = extractor.getResult();
    console.log(
      `[AutoBackup] 分包 ${partIndex + 1} 媒體提取完成: ${mediaResult.totalExtracted} 個 base64，去重 ${mediaResult.dedupeHits} 個`,
    );
    await part.writeEntry(
      "metadata.json",
      strToU8(
        JSON.stringify({
          version: "2.0",
          format: "aguaphone-streaming-backup",
          exportedAt,
          chatCount: totalChats,
          mediaCount: partMediaCount,
          backupId,
          partIndex,
          partChatCount,
          isLastPart: isLast,
          ...(isLast ? { totalParts: partIndex + 1 } : {}),
        }),
      ),
    );
    onProgress?.({ phase: `完成壓縮${partLabel()}...` });
    await yieldToMain();
    const data = await part.finish();
    partOpen = false;
    await opts.onPartClosed({
      index: partIndex,
      isLast,
      bytes: part.outputBytes,
      data,
    });
  };

  const shouldRotate = () =>
    part.inputBytes >= budget || part.entryCount >= entryCap;

  const rotate = async () => {
    await closePart(false);
    partIndex++;
    await startPart();
  };

  try {
    await startPart();

    // 3. 逐個載入輕量 store → 抽出媒體 → 序列化推入 backup.json → 釋放
    //    絕對不能先把全部 store 讀進一個大物件：「輕量」是誤稱，themes（桌布）、
    //    qzonePosts、stickers、oldSettings（劇場貼文）、canvasLayout 都塞著 base64。
    //    逐個處理後峰值只有「單一 store + 已抽乾的殘骸」。
    //    產出的 backup.json 內容與舊版逐字相同，格式沒有改變。
    onProgress?.({ phase: "寫入基礎數據..." });
    await yieldToMain();
    const lightEntry = part.openEntry("backup.json");
    lightEntry.push(strToU8("{"));
    let first = true;
    // 固定前綴（順序必須與舊版 collectLightData 的回傳一致）
    for (const [key, value] of [
      ["version", 1],
      ["type", "aguaphone-auto-backup"],
      ["exportedAt", exportedAt],
    ] as Array<[string, unknown]>) {
      await pushLightValue(lightEntry, key, value, first);
      first = false;
    }

    for (let li = 0; li < LIGHT_LOADERS.length; li++) {
      const { key, load } = LIGHT_LOADERS[li];
      onProgress?.({
        phase: "寫入基礎數據",
        current: li,
        total: LIGHT_LOADERS.length,
      });
      await yieldToMain();

      // 單 key 包裝物件：直接複用既有的 per-key 媒體抽取邏輯，
      // 且共用同一個 extractor，去重快取跨 store 仍有效
      const wrapper: Record<string, unknown> = { [key]: await load() };
      await extractAllMediaFromBackupData(wrapper, extractor);

      const written = await pushLightValue(lightEntry, key, wrapper[key], first);
      if (written) first = false;
      // 已序列化就釋放，讓 GC 在迴圈中就能回收
      delete wrapper[key];
      // 兩端都要等：sink 的輸出積壓，以及 worker 的輸入積壓
      await part.waitForDrain();
      if (lightEntry.inflight() > ZIP_ENTRY_INFLIGHT_BYTES) {
        await lightEntry.drain();
      }
      if (part.error) throw part.error;
    }

    lightEntry.push(strToU8("}"));
    await Promise.race([lightEntry.end(), part.done]);
    await part.waitForDrain();

    // 4. 逐個處理聊天 — 讀取 → 媒體即時寫入 zip → 分批寫入聊天 JSON → 釋放
    for (let i = 0; i < chatKeys.length; i++) {
      if (i % 3 === 0) {
        // 報告「已完成 i 筆」而非 i+1——否則顯示 N/N 時最後一筆還在打包，
        // 使用者會以為卡在收尾，實際是還沒開始處理。
        onProgress?.({
          phase: `處理聊天${partLabel()}`,
          current: i,
          total: totalChats,
        });
        await yieldToMain();
      }

      // 切包只發生在聊天之間或訊息批次之間，永遠不會切斷一個 JSON 項目
      if (shouldRotate()) {
        await rotate();
      }

      let chat: any;
      let messages: any[];
      try {
        chat = await db.get<any>(DB_STORES.CHATS, chatKeys[i]);
        if (!chat) continue;
        // v24：從 chatMessages 表載入訊息（只有紀錄本身，圖片在 imageCache）
        messages = await loadMessages(chat.id);
        chat.messages = [];
        // 聊天本身的媒體（桌布、頭像覆寫）：此時 messages 為空，只處理表頭
        await normalizeChatBackupMediaSources(chat);
        await extractMediaFromChatBackupData(chat, extractor);
      } catch (chatErr) {
        // ZIP 流本身壞了就沒必要繼續，往上拋讓呼叫端刪掉半成品
        if (part.error) throw part.error;
        console.warn(
          `[AutoBackup] 聊天 "${chatKeys[i]}" 讀取失敗，跳過:`,
          chatErr,
        );
        continue;
      }

      const chatId = String(chat.id || chatKeys[i]);
      const safeId = chatId.replace(/[^a-zA-Z0-9_-]/g, "_");

      // 表頭 JSON：把 messages 移到最後，後面接著分批推入的訊息陣列
      const { messages: _omit, ...header } = chat;
      const headerJson = JSON.stringify({ ...header, messages: [] });
      const openTail = '"messages":[]}';
      if (!headerJson.endsWith(openTail)) {
        throw new Error(`聊天 "${chatId}" 表頭序列化結果不符預期`);
      }

      let segment = 0;
      let entry = part.openEntry(`chats/${safeId}.json`);
      entry.push(strToU8(headerJson.slice(0, -2)));
      let firstInEntry = true;
      partChatCount++;

      for (let b = 0; b < messages.length; b += CHAT_MESSAGE_BATCH) {
        // 巨大聊天：本包滿了就收尾，後續訊息寫到下一包的 chat-segments/
        if (b > 0 && shouldRotate()) {
          entry.push(strToU8("]}"));
          await Promise.race([entry.end(), part.done]);
          await rotate();
          segment++;
          entry = part.openEntry(`chat-segments/${safeId}.${segment}.json`);
          entry.push(
            strToU8(
              `{"id":${JSON.stringify(chatId)},"_segment":${segment},"messages":[`,
            ),
          );
          firstInEntry = true;
          partChatCount++;
        }

        const batch = messages.slice(b, b + CHAT_MESSAGE_BATCH);
        if (!excludeChatImages) {
          try {
            // 逐筆從 imageCache 讀出 → 寫入 zip → 欄位改成 media/ 路徑
            // 不用 restoreImagesToMessages()，避免整批 base64 進記憶體
            await exportChatImageMediaDirect(batch, extractor);
          } catch (imgErr) {
            if (part.error) throw part.error;
            console.warn(`[AutoBackup] 聊天 "${chatId}" 圖片匯出失敗:`, imgErr);
          }
        } else {
          for (const msg of batch) {
            if (msg.imageUrl) msg.imageUrl = "";
            if (msg.imageData) msg.imageData = "";
          }
        }
        try {
          // 舊資料可能把 base64 直接存在訊息欄位裡
          await extractMediaFromChatBackupData({ messages: batch }, extractor);
        } catch (mediaErr) {
          if (part.error) throw part.error;
          console.warn(`[AutoBackup] 聊天 "${chatId}" 內嵌媒體抽取失敗:`, mediaErr);
        }

        for (const msg of batch) {
          const json = stringifyMessage(msg, chatId);
          if (json === null) continue;
          entry.push(strToU8(firstInEntry ? json : `,${json}`));
          firstInEntry = false;
        }
        // 已序列化的訊息立刻放掉，巨大聊天才不會整份留在記憶體
        for (let k = b; k < b + batch.length; k++) messages[k] = undefined;

        if (entry.inflight() > ZIP_ENTRY_INFLIGHT_BYTES) {
          await entry.drain();
        }
        await part.waitForDrain();
        if (part.error) throw part.error;
        if (b % (CHAT_MESSAGE_BATCH * 10) === 0) await yieldToMain();
      }

      entry.push(strToU8("]}"));
      await Promise.race([entry.end(), part.done]);
      await part.waitForDrain();
      if (part.error) throw part.error;
    }

    // 迴圈真的跑完了，補報一次滿格
    onProgress?.({
      phase: `處理聊天${partLabel()}`,
      current: totalChats,
      total: totalChats,
    });

    // 5. 最後一包：寫入 metadata、結束 zip 流
    await closePart(true);
  } catch (e) {
    if (partOpen) {
      await opts.abortPart?.(partIndex).catch(() => {});
    }
    if (partOpen && part.error) throw part.error;
    throw e;
  }
}

/**
 * 構建單一備份 ZIP（不分包）。
 *
 * 傳入 `sink` 時 ZIP chunks 直接寫出、不回傳資料；
 * 不傳時在記憶體累積並回傳完整 Uint8Array（相容 GitHub 備份等路徑）。
 */
export async function buildBackupZipStreaming(
  onProgress?: BackupProgressCallback,
  options?: { excludeChatImages?: boolean },
): Promise<Uint8Array>;
export async function buildBackupZipStreaming(
  onProgress: BackupProgressCallback | undefined,
  options: { excludeChatImages?: boolean } | undefined,
  sink: BackupOutputSink,
): Promise<void>;
export async function buildBackupZipStreaming(
  onProgress?: BackupProgressCallback,
  options?: { excludeChatImages?: boolean },
  sink?: BackupOutputSink,
): Promise<Uint8Array | void> {
  let result: Uint8Array | undefined;
  await buildSplitBackup({
    onProgress,
    excludeChatImages: options?.excludeChatImages,
    partBudgetBytes: Infinity,
    openPart: async () => sink,
    onPartClosed: async (p) => {
      // 預算是 Infinity，不應該切包；真的切了就是 bug，寧可失敗也不要默默丟掉前面的包
      if (p.index > 0) throw new Error("單檔備份意外被分包");
      result = p.data;
    },
  });
  if (sink) return;
  return result!;
}

// ============================================================
// 寫入備份檔案
// ============================================================

function generateBackupFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s`;
  return `aguaphone-backup-${date}_${time}.zip`;
}

/**
 * 分包檔名：第 1 包沿用原檔名（資料量小、只有一包的使用者看不出差異），
 * 之後依序加上 -part2、-part3…
 */
export function getBackupPartFilename(baseFilename: string, index: number): string {
  if (index === 0) return baseFilename;
  return baseFilename.replace(/\.zip$/i, `-part${index + 1}.zip`);
}

/** 分包檔名 → 所屬備份的第 1 包檔名（用來把同一份備份的分包歸成一組） */
export function getBackupGroupFilename(filename: string): string {
  return filename.replace(/-part\d+\.zip$/i, ".zip");
}

/** 分包序號（0 起算）；不是分包檔名時回傳 0 */
export function getBackupPartIndexFromFilename(filename: string): number {
  const m = /-part(\d+)\.zip$/i.exec(filename);
  return m ? Math.max(0, Number(m[1]) - 1) : 0;
}

const MB = 1024 * 1024;

/**
 * 手機（以及記憶體模式）的分包預算。導入端要把整包讀進記憶體再解壓，
 * 打包的記憶體模式也吃這個量。iOS 使用者實測 300MB 的備份可以正常導出。
 */
const PART_BUDGET_MOBILE = 300 * MB;
/**
 * 電腦的分包預算：記憶體寬裕，資料量一般的使用者就只會有一個檔案。
 * 不能再大：fflate 不寫 ZIP64，單一 ZIP 超過 4GB 會損壞，導入時也要整包進記憶體。
 */
const PART_BUDGET_DESKTOP = 1024 * MB;

/** iPhone／iPad（含偽裝成 Mac 的 iPadOS）或 Android */
export function isMobileDevice(
  userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints: number = typeof navigator !== "undefined"
    ? navigator.maxTouchPoints ?? 0
    : 0,
): boolean {
  if (/iPhone|iPad|iPod|Android/i.test(userAgent)) return true;
  // iPadOS 13+ 預設回報桌面版 Safari 的 UA
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
}

/** 單一分包的未壓縮位元組預算 */
export function getPartBudgetBytes(
  mode: "disk" | "memory",
  mobile: boolean = isMobileDevice(),
): number {
  if (mobile || mode === "memory") return PART_BUDGET_MOBILE;
  return PART_BUDGET_DESKTOP;
}

/**
 * OPFS 剩餘空間是否還放得下再一包。
 *
 * 分包預設全部打包完才一次交付，暫存會疊到跟整份備份一樣大；
 * 空間不夠時就先把已完成的分包交出去、刪掉暫存，再繼續打包。
 * 查不到配額時保守回傳 false（逐包交付，行為與舊版相同）。
 */
async function hasRoomForAnotherPart(budget: number): Promise<boolean> {
  try {
    const est = await (navigator as any).storage?.estimate?.();
    if (!est?.quota || typeof est.usage !== "number") return false;
    return est.quota - est.usage > budget * 1.5 + 64 * MB;
  } catch {
    return false;
  }
}

/**
 * 開啟備份檔案的 writable，包成 BackupOutputSink。
 *
 * 在打包「之前」就開好檔案，讓 ZIP chunks 邊產生邊落地，
 * 整份 ZIP 不會停留在 JS heap。
 */
async function openBackupFileSink(
  filename: string,
): Promise<{ sink: BackupOutputSink; abort: () => Promise<void> }> {
  if (!_dirHandle) throw new Error("未選擇備份資料夾");

  // 檢查權限
  const perm = await (_dirHandle as any).queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    throw new Error("PERMISSION_NEEDED");
  }

  const fileHandle = await _dirHandle.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as any).createWritable();

  return {
    sink: {
      async write(chunk: Uint8Array) {
        await writable.write(chunk);
      },
      async close() {
        await writable.close();
      },
    },
    abort: async () => {
      // 寫入中途失敗：中止 writable 並刪掉半成品檔案
      try {
        await writable.abort?.();
      } catch {
        /* 已關閉或不支援 abort */
      }
      try {
        await _dirHandle?.removeEntry(filename);
      } catch {
        /* 檔案可能還沒建立 */
      }
    },
  };
}

/**
 * 清理超出數量限制的舊備份
 */
async function cleanOldBackups(maxBackups: number): Promise<void> {
  if (!_dirHandle) return;

  // 同一份備份的分包歸成一組，按「份」計算保留數量，
  // 否則一份 10 包的備份就會把自己的前幾包當成舊備份刪掉
  const groups = new Map<string, string[]>();

  for await (const [name, handle] of (_dirHandle as any).entries()) {
    if (
      handle.kind === "file" &&
      name.startsWith("aguaphone-backup-") &&
      name.endsWith(".zip")
    ) {
      const group = getBackupGroupFilename(name);
      const names = groups.get(group) ?? [];
      names.push(name);
      groups.set(group, names);
    }
  }

  // 按檔名排序（檔名包含時間戳，字母序 = 時間序）
  const groupNames = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  // 刪除超出限制的舊備份（整組刪）
  const toDelete = groupNames.length - maxBackups;
  for (let i = 0; i < toDelete; i++) {
    for (const name of groups.get(groupNames[i])!) {
      try {
        await _dirHandle.removeEntry(name);
        console.log(`[AutoBackup] 已刪除舊備份: ${name}`);
      } catch (e) {
        console.warn(`[AutoBackup] 刪除舊備份失敗: ${name}`, e);
      }
    }
  }
}

/**
 * 開啟 OPFS 暫存檔的 sink，供「下載」路徑在打包時就把 ZIP 落到磁碟。
 *
 * 這樣整份 ZIP 不必先在 JS heap 組成 Uint8Array 再包 Blob——
 * 資料量大的使用者在那一步會直接 OOM 閃退（症狀：進度跑完、按下載就閃退）。
 * 落地後用 `getFile()` 取回由磁碟撐著的 File，交給 share / <a download>。
 *
 * 回傳 null 表示 OPFS 不可用（例如 iOS Safari 沒有主線程 createWritable），
 * 呼叫端需 fallback 到記憶體路徑。`diag.reason` 會填入不可用的原因，
 * 讓使用者在畫面上就能看出跑的是哪條路徑——閃退時這是唯一的線索。
 */
async function openOPFSTempSink(
  filename: string,
  diag: { reason?: string } = {},
): Promise<{
  sink: BackupOutputSink;
  /** 打包完成後取回落地的檔案 */
  getFile: () => Promise<File>;
  /** 刪除暫存檔（成功或失敗都要呼叫） */
  cleanup: () => Promise<void>;
} | null> {
  const storage = (navigator as any).storage;
  if (!storage?.getDirectory) {
    diag.reason = "no-getDirectory";
    return null;
  }

  const tmpName = `__tmp_${filename}`;
  let root: any;
  try {
    root = await storage.getDirectory();
    const fileHandle = await root.getFileHandle(tmpName, { create: true });
    // iOS Safari 的 OPFS 沒有 createWritable（僅 Worker 內的 SyncAccessHandle）
    if (typeof fileHandle.createWritable !== "function") {
      diag.reason = "no-createWritable";
      await root.removeEntry(tmpName).catch(() => {});
      return null;
    }
    const writable = await fileHandle.createWritable();

    return {
      sink: {
        async write(chunk: Uint8Array) {
          await writable.write(chunk);
        },
        async close() {
          await writable.close();
        },
      },
      getFile: async () => {
        const file = await fileHandle.getFile();
        return new File([file], filename, { type: "application/zip" });
      },
      cleanup: async () => {
        try {
          await writable.abort?.();
        } catch {
          /* 已關閉或不支援 abort */
        }
        try {
          await root.removeEntry(tmpName);
        } catch {
          /* 暫存檔可能不存在 */
        }
      },
    };
  } catch (err) {
    console.warn("[AutoBackup] OPFS 暫存檔開啟失敗:", err);
    diag.reason = `open-failed: ${(err as any)?.name || err}`;
    try {
      await root?.removeEntry(tmpName);
    } catch {
      /* ignore */
    }
    return null;
  }
}

type OPFSTempSink = NonNullable<Awaited<ReturnType<typeof openOPFSTempSink>>>;

/** Worker 開檔的等待上限：Worker 載入失敗時不一定會觸發 onerror */
const OPFS_WORKER_OPEN_TIMEOUT_MS = 10_000;

/**
 * iOS 用的 OPFS 暫存檔 sink：主線程沒有 `createWritable()`，
 * 改由 Worker 以 `createSyncAccessHandle()` 寫入。
 *
 * 介面與 `openOPFSTempSink` 相同。回傳 null 表示這條路也不可用，
 * 呼叫端只能退回記憶體模式。
 */
async function openOPFSWorkerSink(
  filename: string,
  diag: { reason?: string } = {},
): Promise<OPFSTempSink | null> {
  const storage = (navigator as any).storage;
  if (!storage?.getDirectory || typeof Worker === "undefined") {
    diag.reason = `${diag.reason ?? ""}; worker: unsupported`;
    return null;
  }

  const tmpName = `__tmp_${filename}`;
  let worker: Worker;
  try {
    worker = new Worker(
      new URL("../workers/opfsWriterWorker.ts", import.meta.url),
      { type: "module" },
    );
  } catch (err) {
    diag.reason = `${diag.reason ?? ""}; worker: ${(err as any)?.name || err}`;
    return null;
  }

  let seq = 0;
  let terminated = false;
  const pending = new Map<
    number,
    { resolve: () => void; reject: (err: Error) => void }
  >();
  const rejectAll = (err: Error) => {
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };
  const terminate = () => {
    if (terminated) return;
    terminated = true;
    worker.terminate();
    rejectAll(new Error("OPFS Worker 已終止"));
  };
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, error } = e.data ?? {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve();
    else p.reject(new Error(error || "OPFS Worker 錯誤"));
  };
  worker.onerror = (e: ErrorEvent) => {
    e.preventDefault?.();
    rejectAll(new Error(`OPFS Worker 錯誤: ${e.message || "載入失敗"}`));
  };
  const call = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
    new Promise<void>((resolve, reject) => {
      if (terminated) {
        reject(new Error("OPFS Worker 已終止"));
        return;
      }
      const id = ++seq;
      pending.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer);
    });

  try {
    await Promise.race([
      call({ type: "open", name: tmpName }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("timeout")),
          OPFS_WORKER_OPEN_TIMEOUT_MS,
        ),
      ),
    ]);
  } catch (err) {
    console.warn("[AutoBackup] OPFS Worker 開檔失敗:", err);
    diag.reason = `${diag.reason ?? ""}; worker: ${(err as any)?.message || err}`;
    terminate();
    return null;
  }

  const removeTemp = async () => {
    try {
      const root: any = await storage.getDirectory();
      await root.removeEntry(tmpName);
    } catch {
      /* 暫存檔可能不存在 */
    }
  };

  return {
    sink: {
      async write(chunk: Uint8Array) {
        // 複製一份再 transfer：fflate 的 chunk 可能是共用 buffer 的 view，
        // 直接 transfer 會把還在用的 buffer 一起搬走
        const copy = chunk.slice();
        await call({ type: "write", chunk: copy }, [copy.buffer]);
      },
      async close() {
        await call({ type: "close" });
        terminate();
      },
    },
    getFile: async () => {
      const root: any = await storage.getDirectory();
      const fileHandle = await root.getFileHandle(tmpName);
      const file = await fileHandle.getFile();
      return new File([file], filename, { type: "application/zip" });
    },
    cleanup: async () => {
      if (!terminated) {
        // Worker 還握著 SyncAccessHandle：由它關閉並刪檔
        await call({ type: "abort" }).catch(() => {});
        terminate();
      }
      await removeTemp();
    },
  };
}

/**
 * 把已落地的 File 交給使用者：iOS 走 Web Share，其餘走 <a download>。
 * File 由磁碟撐著，不佔 JS heap。
 */
async function deliverBackupFile(
  file: File,
  filename: string,
): Promise<string> {
  // 交付順序刻意避開 blob: URL 下載。
  //
  // Android WebView 的 blob: URL 下載會經由 JavaBridge 交給原生下載管理員，
  // 而它會把整個 blob 讀進 Java 層——那裡的記憶體上限與 JS heap 無關，
  // 所以檔案大時會在原生層炸掉（症狀：toast「Exception Happend
  // Thread[JavaBridge,...]」後閃退，JS 這邊完全沒有錯誤）。
  //
  // 1. showSaveFilePicker：串流寫入使用者選的位置，記憶體中不留整份檔案
  // 2. Web Share：直接把 File 交給 OS，不經下載管理員
  // 3. <a download>：最後手段，就是會炸的那條路
  const nav = navigator as any;
  const win = window as any;

  if (typeof win.showSaveFilePicker === "function") {
    try {
      const handle = await win.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: "備份檔",
            accept: { "application/zip": [".zip"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      // 用 stream 而非整份 blob，避免再複製一次
      if (typeof file.stream === "function" && typeof writable.write === "function") {
        await file.stream().pipeTo(writable);
      } else {
        await writable.write(file);
        await writable.close();
      }
      console.log("[AutoBackup] 交付方式: showSaveFilePicker（串流寫入）");
      return "save-picker";
    } catch (pickErr: any) {
      if (pickErr?.name === "AbortError") return "cancelled"; // 使用者取消
      console.warn(
        "[AutoBackup] showSaveFilePicker 失敗，改試 Web Share:",
        pickErr,
      );
    }
  }

  if (typeof nav.share === "function") {
    let shareable = true;
    try {
      // canShare 不存在時（舊版）就直接試，失敗再 fallback
      if (typeof nav.canShare === "function") {
        shareable = nav.canShare({ files: [file] });
      }
    } catch {
      shareable = false;
    }

    if (shareable) {
      try {
        await nav.share({ files: [file] });
        console.log("[AutoBackup] 交付方式: Web Share");
        return "share";
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") return "cancelled"; // 使用者取消
        console.warn("[AutoBackup] Web Share 失敗，改用 <a> 下載:", shareErr);
      }
    }
  }

  console.warn(
    "[AutoBackup] 交付方式: <a download>（經過原生下載管理員，檔案大時可能閃退）",
  );
  triggerAnchorDownload(file, filename);
  return "blob-download";
}

/**
 * 一次交付多個已落地的檔案，使用者只需要點一次。
 *
 * 1. showDirectoryPicker（電腦版 Chrome／Edge）：選一個資料夾，全部串流寫進去
 * 2. Web Share（iOS、Android）：分享面板一次帶走全部檔案，「儲存到檔案」可以一起存
 *
 * 只有一個檔案時等同 deliverBackupFile()。回傳 "unsupported" 表示這個
 * 瀏覽器沒辦法一次交付多個檔案，呼叫端要改成逐個交付。
 */
async function deliverBackupFiles(files: File[]): Promise<string> {
  if (files.length === 1) return deliverBackupFile(files[0], files[0].name);

  const nav = navigator as any;
  const win = window as any;

  if (typeof win.showDirectoryPicker === "function") {
    let dir: any = null;
    const created: string[] = [];
    try {
      dir = await win.showDirectoryPicker({ mode: "readwrite" });
      for (const file of files) {
        const handle = await dir.getFileHandle(file.name, { create: true });
        created.push(file.name);
        const writable = await handle.createWritable();
        await file.stream().pipeTo(writable);
      }
      console.log(`[AutoBackup] 交付方式: showDirectoryPicker（${files.length} 個檔案）`);
      return "directory-picker";
    } catch (dirErr: any) {
      // 寫到一半失敗：不在使用者的資料夾留下殘缺的備份
      for (const name of created) {
        await dir?.removeEntry(name).catch(() => {});
      }
      if (dirErr?.name === "AbortError") return "cancelled";
      console.warn("[AutoBackup] showDirectoryPicker 失敗，改試 Web Share:", dirErr);
    }
  }

  if (typeof nav.share === "function") {
    let shareable = true;
    try {
      if (typeof nav.canShare === "function") {
        shareable = nav.canShare({ files });
      }
    } catch {
      shareable = false;
    }
    if (shareable) {
      try {
        await nav.share({ files });
        console.log(`[AutoBackup] 交付方式: Web Share（${files.length} 個檔案）`);
        return "share";
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") return "cancelled";
        console.warn("[AutoBackup] 一次分享多個檔案失敗，改為逐個交付:", shareErr);
      }
    }
  }

  return "unsupported";
}

/** 交付完成、瀏覽器已讀完檔案，可以立刻刪暫存的交付方式 */
const DELIVERED_SYNCHRONOUSLY = new Set(["save-picker", "share", "directory-picker"]);

/** 用 <a download> 觸發下載，3 秒後回收 object URL */
function triggerAnchorDownload(data: Blob, filename: string): void {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 3000);
}

/**
 * 清理上次下載留下的 OPFS 暫存檔。
 *
 * 下載成功時不能立刻刪（瀏覽器還在非同步讀取那個 File），
 * 所以改成在下一次備份開頭清掉，避免 OPFS 無限膨脹。
 */
async function cleanStaleOPFSTemps(): Promise<void> {
  const storage = (navigator as any).storage;
  if (!storage?.getDirectory) return;
  try {
    const root: any = await storage.getDirectory();
    if (typeof root.entries !== "function") return;
    for await (const [name, handle] of root.entries()) {
      if (handle.kind !== "file") continue;
      if (name.startsWith("__tmp_") || name.startsWith("__share_")) {
        await root.removeEntry(name).catch(() => {});
      }
    }
  } catch (err) {
    console.warn("[AutoBackup] 清理 OPFS 暫存檔失敗:", err);
  }
}

// ============================================================
// 執行備份
// ============================================================

export type BackupResult = {
  success: boolean;
  message: string;
  filename?: string;
  method?: "fs" | "download";
  /** 分包數量（1 = 沒有分包） */
  partCount?: number;
};

/** 一個已打包好的分包 */
export interface BackupPartFile {
  /** 0 起算 */
  index: number;
  filename: string;
  bytes: number;
}

/**
 * 一批已打包好、等待交付的分包。
 *
 * 通常整份備份打包完才交付一次（一批就是全部）；手機空間不夠同時暫存
 * 全部分包時，會分成幾批交付。
 */
export interface BackupBatchReady {
  parts: BackupPartFile[];
  /** 這一批含最後一包：交付完備份就結束了 */
  isLast: boolean;
  /**
   * 一次交付整批（存檔面板／資料夾／系統分享）。
   *
   * 必須在使用者點擊的 handler 裡直接呼叫：share 與存檔面板都要求
   * 「剛點過」，而打包動輒數分鐘，點「導出」時的那一下早就過期了。
   * 回傳交付方式；"cancelled" 表示使用者取消，可以重試；
   * "unsupported" 表示無法一次交付多個檔案，要改用 deliverOne()。
   */
  deliverAll: () => Promise<string>;
  /** 逐個交付第 i 個檔案（i 是 parts 陣列裡的位置）。同樣要在點擊 handler 裡呼叫 */
  deliverOne: (i: number) => Promise<string>;
}

/**
 * 一批分包就緒時的處理者（通常是 UI：顯示「儲存」按鈕）。
 * resolve 表示這批已交付完畢，才會繼續打包；reject（例如
 * BackupCancelledError）會中止整份備份。
 */
export type BackupBatchReadyHandler = (batch: BackupBatchReady) => Promise<void>;

/** 使用者在逐包交付時取消整份備份 */
export class BackupCancelledError extends Error {
  constructor() {
    super("已取消備份");
    this.name = "BackupCancelledError";
  }
}

/**
 * 備份開始時先留下「未完成」紀錄。
 *
 * 記憶體不足時頁面是被系統直接殺掉的，JS 來不及寫任何東西——
 * 之前使用者回報閃退時「上次備份」一片空白，完全看不出走的是哪條路徑。
 * 成功或失敗時這筆紀錄會被覆寫；還留著就代表備份途中閃退。
 */
async function markBackupInProgress(mode: string): Promise<void> {
  try {
    const settings = await loadBackupSettings();
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    settings.lastBackupMessage = `備份未完成：${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} 開始（${mode}），途中中斷，可能是記憶體不足閃退`;
    await saveBackupSettings(settings);
  } catch {
    /* 只是診斷用，失敗不影響備份 */
  }
}

async function saveBackupMessage(message: string, success: boolean): Promise<void> {
  const settings = await loadBackupSettings();
  if (success) settings.lastBackupAt = Date.now();
  settings.lastBackupMessage = message;
  await saveBackupSettings(settings);
}

/** 備份資料夾路徑：每包直接寫進使用者選的資料夾 */
async function performFolderBackup(
  filename: string,
  onProgress: BackupProgressCallback | undefined,
  excludeChatImages: boolean,
): Promise<BackupResult> {
  const written: string[] = [];
  let current: { sink: BackupOutputSink; abort: () => Promise<void> } | null =
    null;

  try {
    await markBackupInProgress("資料夾");
    await buildSplitBackup({
      onProgress,
      excludeChatImages,
      partBudgetBytes: getPartBudgetBytes("disk"),
      openPart: async (index) => {
        const name = getBackupPartFilename(filename, index);
        current = await openBackupFileSink(name);
        written.push(name);
        return current.sink;
      },
      onPartClosed: async () => {
        current = null;
      },
      abortPart: async () => {
        await current?.abort();
        current = null;
      },
    });
  } catch (e: any) {
    if (e?.message === "PERMISSION_NEEDED") {
      return { success: false, message: "需要重新授權備份資料夾的寫入權限" };
    }
    // 缺包的備份沒有意義：已寫完的分包一起刪掉
    for (const name of written) {
      await _dirHandle?.removeEntry(name).catch(() => {});
    }
    throw e;
  }

  onProgress?.({ phase: "寫入檔案..." });
  const settings = await loadBackupSettings();
  if (settings.maxBackups > 0) {
    await cleanOldBackups(settings.maxBackups);
  }

  const partCount = written.length;
  const msg =
    partCount > 1
      ? `備份成功: ${filename}（共 ${partCount} 個分包）`
      : `備份成功: ${filename}`;
  console.log(`[AutoBackup] ${msg}`);
  await saveBackupMessage(msg, true);
  return { success: true, message: msg, filename, method: "fs", partCount };
}

/**
 * 下載路徑：每包先串流落到 OPFS 暫存檔（iOS 走 Worker），全部打包完再一次交付。
 * 手機空間不夠同時暫存全部分包時，改成分批交付。
 * 兩種 OPFS 都不可用時才在記憶體組裝，此時每包打包完就得立刻交付。
 */
async function performDownloadBackup(
  filename: string,
  onProgress: BackupProgressCallback | undefined,
  excludeChatImages: boolean,
  onBatchReady: BackupBatchReadyHandler | undefined,
): Promise<BackupResult> {
  const diag: { reason?: string } = {};

  const openTemp = async (
    name: string,
    mode: "opfs" | "opfs-worker" | undefined,
  ): Promise<{ tmp: OPFSTempSink; mode: "opfs" | "opfs-worker" } | null> => {
    if (mode !== "opfs-worker") {
      const tmp = await openOPFSTempSink(name, diag);
      if (tmp) return { tmp, mode: "opfs" };
    }
    if (mode !== "opfs") {
      const tmp = await openOPFSWorkerSink(name, diag);
      if (tmp) return { tmp, mode: "opfs-worker" };
    }
    return null;
  };

  // 先開第 1 包：輸出模式決定分包預算，必須在開始打包前就知道
  const first = await openTemp(getBackupPartFilename(filename, 0), undefined);
  const mode: "opfs" | "opfs-worker" | "memory" = first?.mode ?? "memory";
  let tmp: OPFSTempSink | null = first?.tmp ?? null;
  const budget = getPartBudgetBytes(mode === "memory" ? "memory" : "disk");

  if (mode === "memory") {
    console.warn(
      `[AutoBackup] 輸出模式: memory（OPFS 不可用：${diag.reason}），每包打包完就得交付`,
    );
  } else {
    console.log(`[AutoBackup] 輸出模式: ${mode}（ZIP 直接落地，不進 heap）`);
  }
  onProgress?.({
    phase:
      mode === "memory"
        ? `打包中（記憶體模式：${diag.reason}）...`
        : "打包中（磁碟串流）...",
  });
  await markBackupInProgress(
    mode === "memory" ? `記憶體模式：${diag.reason}` : mode,
  );

  /** 已打包完、還沒交付的分包 */
  type ReadyPart = BackupPartFile & {
    file: File;
    tmp: OPFSTempSink | null;
    via: string;
  };
  let pending: ReadyPart[] = [];
  const deliveredVia: string[] = [];
  let partCount = 0;
  let batchCount = 0;

  const cleanupPending = async () => {
    for (const part of pending) await part.tmp?.cleanup();
    pending = [];
  };

  /** 把累積的分包交給使用者，交付完刪掉暫存 */
  const flush = async (isLast: boolean) => {
    const batch = pending;
    batchCount++;

    const deliverOne = async (i: number) => {
      const part = batch[i];
      part.via = await deliverBackupFile(part.file, part.filename);
      return part.via;
    };
    const deliverAll = async () => {
      const via = await deliverBackupFiles(batch.map((part) => part.file));
      if (via !== "cancelled" && via !== "unsupported") {
        for (const part of batch) part.via = via;
      }
      return via;
    };

    const first = batch[0].index + 1;
    const last = batch[batch.length - 1].index + 1;
    if (onBatchReady) {
      onProgress?.({
        phase:
          first === last
            ? `第 ${first} 部分已打包完成，等待儲存...`
            : `第 ${first}–${last} 部分已打包完成，等待儲存...`,
      });
      await onBatchReady({
        parts: batch.map(({ index, filename, bytes }) => ({ index, filename, bytes })),
        isLast,
        deliverAll,
        deliverOne,
      });
    } else {
      // 沒有 UI 可以等點擊：能一次交就一次交，不行就逐個交
      onProgress?.({ phase: "交付檔案..." });
      if ((await deliverAll()) === "unsupported") {
        for (let i = 0; i < batch.length; i++) await deliverOne(i);
      }
    }

    for (const part of batch) {
      deliveredVia.push(part.via);
      // 存檔面板／資料夾／分享完成時檔案已被讀完，立刻刪掉暫存檔：
      // 2G 的資料再疊一份 2G 暫存很容易撞上 iOS 的儲存配額。
      // <a download> 是非同步讀取，只能留給下次備份開頭清理。
      if (part.tmp && DELIVERED_SYNCHRONOUSLY.has(part.via)) {
        await part.tmp.cleanup();
      }
    }
    pending = [];
  };

  try {
    await buildSplitBackup({
      onProgress,
      excludeChatImages,
      partBudgetBytes: budget,
      openPart: async (index) => {
        if (mode === "memory") return undefined;
        if (index === 0) return tmp!.sink;
        const opened = await openTemp(getBackupPartFilename(filename, index), mode);
        if (!opened) {
          throw new Error(`第 ${index + 1} 部分無法開啟暫存檔（${diag.reason}）`);
        }
        tmp = opened.tmp;
        return tmp.sink;
      },
      abortPart: async () => {
        await tmp?.cleanup();
        tmp = null;
      },
      onPartClosed: async (part) => {
        partCount++;
        const name = getBackupPartFilename(filename, part.index);
        const partTmp = tmp;
        tmp = null;
        const file = partTmp
          ? await partTmp.getFile()
          : new File([part.data as BlobPart], name, { type: "application/zip" });
        pending.push({
          index: part.index,
          filename: name,
          bytes: part.bytes,
          file,
          tmp: partTmp,
          via: "not-delivered",
        });

        // 記憶體模式的分包佔著 heap，不能累積；磁碟模式在空間不夠時提早交付
        if (
          part.isLast ||
          mode === "memory" ||
          !(await hasRoomForAnotherPart(budget))
        ) {
          await flush(part.isLast);
        }
      },
    });
  } catch (e) {
    await tmp?.cleanup();
    await cleanupPending();
    throw e;
  }

  // 交付方式寫進訊息：blob-download 就是會在 Android 原生層炸掉的那條路，
  // 使用者回報閃退時這行是唯一能分辨的線索
  const parts =
    partCount > 1
      ? `，共 ${partCount} 個分包${batchCount > 1 ? `／分 ${batchCount} 批儲存` : ""}`
      : "";
  const vias = [...new Set(deliveredVia)].join("/");
  const msg =
    mode === "memory"
      ? `已備份: ${filename}（記憶體模式：${diag.reason} / ${vias}${parts}）`
      : `已備份: ${filename}（${mode} / ${vias}${parts}）`;
  await saveBackupMessage(msg, true);
  return { success: true, message: msg, filename, method: "download", partCount };
}

/**
 * 執行一次備份
 * @param forceDownload 強制使用下載方式
 * @param onProgress 進度回調（可選）
 * @param options.onBatchReady 下載路徑的交付處理者（等使用者點擊）；不提供時打包完直接交付
 */
export async function performBackup(
  forceDownload = false,
  onProgress?: BackupProgressCallback,
  options?: {
    excludeChatImages?: boolean;
    onBatchReady?: BackupBatchReadyHandler;
  },
): Promise<BackupResult> {
  try {
    console.log("[AutoBackup] 開始備份...");
    await cleanStaleOPFSTemps();
    const filename = generateBackupFilename();
    const excludeChatImages = options?.excludeChatImages ?? false;

    // FS 路徑：先開好檔案，ZIP 邊打包邊寫入磁碟，整份 ZIP 不進 JS heap
    if (!forceDownload && isFileSystemAccessSupported() && _dirHandle) {
      return await performFolderBackup(filename, onProgress, excludeChatImages);
    }
    return await performDownloadBackup(
      filename,
      onProgress,
      excludeChatImages,
      options?.onBatchReady,
    );
  } catch (e: any) {
    const msg =
      e instanceof BackupCancelledError
        ? "已取消備份"
        : `備份失敗: ${e.message || e}`;
    console.error("[AutoBackup]", msg);
    try {
      await saveBackupMessage(msg, false);
    } catch {
      /* 設定寫不進去也要把結果回報給呼叫端 */
    }
    return { success: false, message: msg };
  }
}

// ============================================================
// 定時器管理
// ============================================================

/**
 * 啟動自動備份定時器
 */
export async function startAutoBackup(): Promise<void> {
  stopAutoBackup();

  const settings = await loadBackupSettings();
  if (!settings.enabled) return;

  const intervalMs = settings.intervalMinutes * 60 * 1000;

  // 初始化 dirHandle
  if (!_dirHandle) {
    _dirHandle = await loadDirHandle();
  }

  // 檢查距離上次備份是否已超過間隔，超過就立刻備份
  const now = Date.now();
  const elapsed = settings.lastBackupAt
    ? now - settings.lastBackupAt
    : Infinity;

  if (elapsed >= intervalMs) {
    // 已超過間隔（或從未備份），立刻備份一次
    console.log("[AutoBackup] 距離上次備份已超過間隔，立即備份");
    const result = await performBackup();
    if (!result.success) {
      console.warn("[AutoBackup] 自動備份失敗:", result.message);
    }
  }

  // 之後按固定間隔定時備份
  _timer = setInterval(async () => {
    const result = await performBackup();
    if (!result.success) {
      console.warn("[AutoBackup] 自動備份失敗:", result.message);
    }
  }, intervalMs);

  console.log(`[AutoBackup] 已啟動，間隔 ${settings.intervalMinutes} 分鐘`);
}

/**
 * 停止自動備份定時器
 */
export function stopAutoBackup(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
    console.log("[AutoBackup] 已停止");
  }
}

/**
 * 初始化自動備份（App 啟動時呼叫）
 */
export async function initAutoBackup(): Promise<void> {
  const settings = await loadBackupSettings();
  if (settings.enabled) {
    _dirHandle = await loadDirHandle();
    await startAutoBackup();
  }
}
