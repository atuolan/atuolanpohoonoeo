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
 * 構建備份 ZIP — 真正的流式構建
 *
 * 使用 fflate 的 Zip streaming API，逐個檔案寫入 zip 流。
 * 聊天圖片與其他媒體都是「讀一份 → 立刻寫入 zip → 釋放」，
 * 記憶體峰值 ≈ 單個最大檔案，而非整份備份。
 *
 * 傳入 `sink` 時 ZIP chunks 直接寫出、不回傳資料；
 * 不傳時在記憶體累積並回傳完整 Uint8Array（相容 GitHub 備份等路徑）。
 *
 * ZIP 結構：
 *   backup.json          — 輕量數據（不含聊天）
 *   chats/<chatId>.json  — 每個聊天獨立一個檔案
 *   media/*              — 提取的媒體檔案
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
  const excludeChatImages = options?.excludeChatImages ?? false;
  // 1. 不預先載入輕量數據——每個 store 在步驟 5 才逐個載入、抽媒體、寫出、釋放。
  //    一次全載的峰值發生在第一個進度畫面之前，使用者會看到「什麼都沒彈出就閃退」。
  onProgress?.({ phase: "收集基礎數據..." });
  await yieldToMain();
  await db.init();
  const exportedAt = new Date().toISOString();

  // 2. 建立 fflate Zip 流
  //    有 sink 時 chunk 直接寫出；否則在記憶體累積（向後相容）
  const outputChunks: Uint8Array[] = [];
  let totalOutputSize = 0;
  let zipResolve: () => void;
  let zipRejectRaw: (err: Error) => void;
  const zipDone = new Promise<void>((resolve, reject) => {
    zipResolve = resolve;
    zipRejectRaw = reject;
  });
  // ZIP/sink 一旦壞掉就是致命錯誤：不能被單一聊天的 try/catch 吞掉，
  // 否則會產出被截斷的備份檔
  let zipError: Error | null = null;
  const zipReject = (err: Error) => {
    zipError ??= err;
    zipRejectRaw(err);
  };
  // 未被 await 時避免 unhandled rejection
  zipDone.catch(() => {});

  // sink.write 是 async，用一條串接的 promise 保證 chunk 順序寫出。
  // pendingBytes 追蹤「已交給 sink 但還沒寫完」的量，用於背壓。
  let writeChain: Promise<void> = Promise.resolve();
  let pendingBytes = 0;
  let drainNotify: (() => void) | null = null;

  const zipper = new FflateZip((err, chunk, final) => {
    if (err) {
      console.error("[AutoBackup] ZIP 流錯誤:", err);
      zipReject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    if (sink) {
      const size = chunk.length;
      pendingBytes += size;
      writeChain = writeChain.then(async () => {
        await sink.write(chunk);
        pendingBytes -= size;
        drainNotify?.();
      });
      writeChain.catch((writeErr) => {
        console.error("[AutoBackup] ZIP 寫出失敗:", writeErr);
        pendingBytes = 0;
        drainNotify?.();
        zipReject(
          writeErr instanceof Error ? writeErr : new Error(String(writeErr)),
        );
      });
      if (final) {
        writeChain.then(() => zipResolve()).catch(() => {});
      }
      return;
    }
    outputChunks.push(chunk);
    totalOutputSize += chunk.length;
    if (final) {
      zipResolve();
    }
  });

  /** 等待 sink 積壓降到閾值以下，避免壓縮速度超過磁碟寫入速度 */
  const waitForDrain = async (): Promise<void> => {
    while (sink && pendingBytes > SINK_BACKPRESSURE_BYTES) {
      await Promise.race([
        new Promise<void>((resolve) => {
          drainNotify = resolve;
        }),
        zipDone, // 出錯時直接拋出，不會卡死
      ]);
      drainNotify = null;
    }
  };

  /** 寫入一個 ZIP 檔案項目，並在必要時等待 sink 消化積壓 */
  const writeEntry = async (filename: string, data: Uint8Array) => {
    // 與 zipDone 競賽：ZIP/sink 出錯時立即拋出，避免永遠等不到 final chunk
    await Promise.race([pushFileToZip(zipper, filename, data), zipDone]);
    await waitForDrain();
  };

  // 3. 建立共用的媒體提取器（跨聊天去重）
  //    媒體一產生就寫入 zip 流，不在記憶體累積
  let mediaCount = 0;
  const extractor = new BackupMediaExtractor(async (filename, data) => {
    mediaCount++;
    await writeEntry(filename, data);
  });

  // 4-5. 逐個載入輕量 store → 抽出媒體 → 序列化推入 backup.json → 釋放
  //    絕對不能先把全部 store 讀進一個大物件：「輕量」是誤稱，themes（桌布）、
  //    qzonePosts、stickers、oldSettings（劇場貼文）、canvasLayout 都塞著 base64。
  //    逐個處理後峰值只有「單一 store + 已抽乾的殘骸」。
  //    產出的 backup.json 內容與舊版逐字相同，格式沒有改變。
  onProgress?.({ phase: "寫入基礎數據..." });
  await yieldToMain();
  const lightEntry = openZipEntry(zipper, "backup.json");
  try {
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
      await waitForDrain();
      if (lightEntry.inflight() > ZIP_ENTRY_INFLIGHT_BYTES) {
        await lightEntry.drain();
      }
      if (zipError) throw zipError;
    }

    lightEntry.push(strToU8("}"));
    await Promise.race([lightEntry.end(), zipDone]);
    await waitForDrain();
  } catch (e) {
    if (zipError) throw zipError;
    throw e;
  }

  // 6. 逐個處理聊天 — 讀取 → 媒體即時寫入 zip → 寫入聊天 JSON → 釋放
  const chatKeys = await getAllChatKeys();
  const totalChats = chatKeys.length;

  for (let i = 0; i < chatKeys.length; i++) {
    if (i % 3 === 0) {
      // 報告「已完成 i 筆」而非 i+1——否則顯示 N/N 時最後一筆還在打包，
      // 使用者會以為卡在收尾，實際是還沒開始處理。
      onProgress?.({ phase: "處理聊天", current: i, total: totalChats });
      await yieldToMain();
    }

    try {
      const chat = await db.get<any>(DB_STORES.CHATS, chatKeys[i]);
      if (!chat) continue;

      // v24：從 chatMessages 表載入訊息
      chat.messages = await loadMessages(chat.id);

      if (chat.messages?.length > 0 && !excludeChatImages) {
        try {
          // 逐筆從 imageCache 讀出 → 寫入 zip → 欄位改成 media/ 路徑
          // 不用 restoreImagesToMessages()，避免整批 base64 進記憶體
          await exportChatImageMediaDirect(chat.messages, extractor);
        } catch (imgErr) {
          if (zipError) throw zipError;
          console.warn(`[AutoBackup] 聊天 "${chat.id}" 圖片匯出失敗:`, imgErr);
        }
      }

      if (excludeChatImages && chat.messages?.length > 0) {
        for (const msg of chat.messages) {
          if (msg.imageUrl) msg.imageUrl = "";
          if (msg.imageData) msg.imageData = "";
        }
      }

      await normalizeChatBackupMediaSources(chat);

      await extractMediaFromChatBackupData(chat, extractor);

      // 將聊天序列化後立即寫入 zip 流，然後釋放
      const chatJsonBytes = strToU8(JSON.stringify(chat));
      const safeId = String(chat.id || chatKeys[i]).replace(/[^a-zA-Z0-9_-]/g, "_");
      await writeEntry(`chats/${safeId}.json`, chatJsonBytes);
      // chat 物件在此作用域結束後即可被 GC 回收
    } catch (chatErr) {
      // ZIP 流本身壞了就沒必要繼續，往上拋讓呼叫端刪掉半成品
      if (zipError) throw zipError;
      console.warn(
        `[AutoBackup] 聊天 "${chatKeys[i]}" 讀取失敗，跳過:`,
        chatErr,
      );
    }
  }

  // 迴圈真的跑完了，補報一次滿格
  onProgress?.({ phase: "處理聊天", current: totalChats, total: totalChats });

  const mediaResult = extractor.getResult();
  console.log(
    `[AutoBackup] 媒體提取完成: ${mediaResult.totalExtracted} 個 base64，去重 ${mediaResult.dedupeHits} 個`,
  );

  // 7. 寫入 metadata.json（聊天數量等統計資訊）
  const metadataBytes = strToU8(JSON.stringify({
    version: "2.0",
    format: "aguaphone-streaming-backup",
    exportedAt,
    chatCount: totalChats,
    mediaCount,
  }));
  await writeEntry("metadata.json", metadataBytes);

  // 8. 結束 zip 流，等待中央目錄寫入完成
  onProgress?.({ phase: "完成壓縮..." });
  await yieldToMain();
  zipper.end();
  await zipDone;

  // 9a. sink 路徑：資料已全部寫出，關閉後結束
  if (sink) {
    await sink.close();
    return;
  }

  // 9b. 記憶體路徑：合併所有 chunks 為最終 Uint8Array
  const result = new Uint8Array(totalOutputSize);
  let offset = 0;
  for (const chunk of outputChunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  // 釋放 chunks 陣列
  outputChunks.length = 0;

  return result;
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

  const backupFiles: { name: string; handle: FileSystemFileHandle }[] = [];

  for await (const [name, handle] of (_dirHandle as any).entries()) {
    if (
      handle.kind === "file" &&
      name.startsWith("aguaphone-backup-") &&
      name.endsWith(".zip")
    ) {
      backupFiles.push({ name, handle });
    }
  }

  // 按檔名排序（檔名包含時間戳，字母序 = 時間序）
  backupFiles.sort((a, b) => a.name.localeCompare(b.name));

  // 刪除超出限制的舊檔案
  const toDelete = backupFiles.length - maxBackups;
  if (toDelete > 0) {
    for (let i = 0; i < toDelete; i++) {
      try {
        await _dirHandle.removeEntry(backupFiles[i].name);
        console.log(`[AutoBackup] 已刪除舊備份: ${backupFiles[i].name}`);
      } catch (e) {
        console.warn(`[AutoBackup] 刪除舊備份失敗: ${backupFiles[i].name}`, e);
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

/**
 * 最後手段：ZIP 已在記憶體中，直接包 Blob 交出去。
 * 只在 OPFS 不可用時走到（例如 iOS Safari）。
 */
async function downloadBackup(
  zipData: Uint8Array,
  filename: string,
): Promise<string> {
  const blob = new Blob([zipData as BlobPart], { type: "application/zip" });
  return deliverBackupFile(
    new File([blob], filename, { type: "application/zip" }),
    filename,
  );
}

// ============================================================
// 執行備份
// ============================================================

export type BackupResult = {
  success: boolean;
  message: string;
  filename?: string;
  method?: "fs" | "download";
};

/**
 * 執行一次備份
 * @param forceDownload 強制使用下載方式
 * @param onProgress 進度回調（可選）
 */
export async function performBackup(
  forceDownload = false,
  onProgress?: BackupProgressCallback,
  options?: { excludeChatImages?: boolean },
): Promise<BackupResult> {
  try {
    console.log("[AutoBackup] 開始備份...");
    await cleanStaleOPFSTemps();
    const settings = await loadBackupSettings();
    const filename = generateBackupFilename();

    // FS 路徑：先開好檔案，ZIP 邊打包邊寫入磁碟，整份 ZIP 不進 JS heap
    if (!forceDownload && isFileSystemAccessSupported() && _dirHandle) {
      let fileSink: { sink: BackupOutputSink; abort: () => Promise<void> };
      try {
        fileSink = await openBackupFileSink(filename);
      } catch (e: any) {
        if (e.message === "PERMISSION_NEEDED") {
          return {
            success: false,
            message: "需要重新授權備份資料夾的寫入權限",
          };
        }
        throw e;
      }

      try {
        await buildBackupZipStreaming(onProgress, options, fileSink.sink);
      } catch (e) {
        await fileSink.abort();
        throw e;
      }

      onProgress?.({ phase: "寫入檔案..." });
      if (settings.maxBackups > 0) {
        await cleanOldBackups(settings.maxBackups);
      }

      const msg = `備份成功: ${filename}`;
      console.log(`[AutoBackup] ${msg}`);

      // 更新設定
      settings.lastBackupAt = Date.now();
      settings.lastBackupMessage = msg;
      await saveBackupSettings(settings);

      return { success: true, message: msg, filename, method: "fs" };
    }

    // 下載路徑：優先把 ZIP 串流落到 OPFS 暫存檔，再取回 File 交給下載／分享。
    // 直接在記憶體組整份 ZIP 再包 Blob，資料量大時會 OOM 閃退。
    const opfsDiag: { reason?: string } = {};
    const tmp = await openOPFSTempSink(filename, opfsDiag);
    let outputMode: "opfs" | "memory";
    let deliverVia = "unknown";
    if (tmp) {
      outputMode = "opfs";
      console.log("[AutoBackup] 輸出模式: opfs（ZIP 直接落地，不進 heap）");
      onProgress?.({ phase: "打包中（磁碟串流）..." });
      try {
        await buildBackupZipStreaming(onProgress, options, tmp.sink);
      } catch (e) {
        await tmp.cleanup();
        throw e;
      }
      onProgress?.({ phase: "交付檔案..." });
      // 注意：不在這裡刪暫存檔——瀏覽器下載／分享是非同步的，
      // 這時刪掉會讓正在讀取的 File 失效。殘留檔由下次備份開頭清理。
      const file = await tmp.getFile();
      deliverVia = await deliverBackupFile(file, filename);
    } else {
      // OPFS 不可用（例如 iOS Safari）：只能在記憶體組裝，資料量大時可能閃退
      outputMode = "memory";
      console.warn(
        `[AutoBackup] 輸出模式: memory（OPFS 不可用：${opfsDiag.reason}），資料量大可能閃退`,
      );
      onProgress?.({ phase: `打包中（記憶體模式：${opfsDiag.reason}）...` });
      const zipData = await buildBackupZipStreaming(onProgress, options);
      onProgress?.({ phase: "交付檔案..." });
      deliverVia = await downloadBackup(zipData, filename);
    }

    // 交付方式寫進訊息：blob-download 就是會在 Android 原生層炸掉的那條路，
    // 使用者回報閃退時這行是唯一能分辨的線索
    const msg =
      outputMode === "opfs"
        ? `已備份: ${filename}（${deliverVia}）`
        : `已備份: ${filename}（記憶體模式：${opfsDiag.reason} / ${deliverVia}）`;
    settings.lastBackupAt = Date.now();
    settings.lastBackupMessage = msg;
    await saveBackupSettings(settings);

    return { success: true, message: msg, filename, method: "download" };
  } catch (e: any) {
    const msg = `備份失敗: ${e.message || e}`;
    console.error("[AutoBackup]", msg);
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
