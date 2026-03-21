/**
 * 自動備份服務
 *
 * 主方案：File System Access API（直接寫入使用者選擇的本地資料夾）
 * Fallback：觸發下載（不支援 FSAA 的瀏覽器）
 *
 * dirHandle 存入 IndexedDB，下次開頁面可重新取得權限。
 */

import { db, DB_STORES } from "@/db/database";
import { restoreImagesToMessages } from "@/db/operations";
import {
  BackupMediaExtractor,
  extractAllMediaFromBackupData,
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
async function collectLightData(): Promise<Record<string, unknown>> {
  await db.init();

  const characters = await db.getAll(DB_STORES.CHARACTERS);
  const lorebooks = await db.getAll(DB_STORES.LOREBOOKS);
  const themes = await db.getAll(DB_STORES.THEMES);
  const layouts = await db.getAll(DB_STORES.LAYOUTS);
  const characterAffections = await db.getAll(DB_STORES.CHARACTER_AFFECTIONS);
  const settings = await db.get(DB_STORES.APP_SETTINGS, "main-settings");
  const userData = await db.get(DB_STORES.APP_SETTINGS, "user-data");
  const qzonePosts = await db.getAll(DB_STORES.QZONE_POSTS);
  const summaries = await db.getAll(DB_STORES.SUMMARIES);
  const diaries = await db.getAll(DB_STORES.DIARIES);
  const pendingCalls = await db.getAll(DB_STORES.PENDING_CALLS);
  const callHistory = await db.getAll(DB_STORES.CALL_HISTORY);
  const holidayRecords = await db.getAll(DB_STORES.HOLIDAY_RECORDS);
  const calendarEvents = await db.getAll(DB_STORES.CALENDAR_EVENTS);
  const importantEvents = await db.getAll(DB_STORES.IMPORTANT_EVENTS);
  const books = await db.getAll(DB_STORES.BOOKS);
  const stickers = await db.getAll(DB_STORES.STICKERS);
  const gameStates = await db.getAll(DB_STORES.GAME_STATES);
  const rendererRules = await db.getAll(DB_STORES.RENDERER_RULES);
  const bookProgress = await db.getAll(DB_STORES.BOOK_PROGRESS);
  const chatAffinityStates = await db.getAll(DB_STORES.CHAT_AFFINITY_STATES);

  // 向量嵌入（Float32Array → 普通陣列，以便 JSON 序列化）
  const vectorEmbeddings = await (async () => {
    try {
      const all = await db.getAll(DB_STORES.VECTOR_EMBEDDINGS);
      return all.map((rec: any) => ({
        ...rec,
        vector: rec.vector ? Array.from(rec.vector as Float32Array) : null,
      }));
    } catch {
      return [];
    }
  })();

  // promptLibrary（使用者自訂提示詞庫，不受 reset-all 影響）
  const promptLibrary = await (async () => {
    try {
      if (!db._instance) await db.init();
      if (!db._instance) return [];
      const tx = db._instance.transaction("promptLibrary", "readonly");
      const store = tx.objectStore("promptLibrary");
      const keys = await store.getAllKeys();
      const values = await store.getAll();
      return keys.map((key: IDBValidKey, i: number) => ({
        key: String(key),
        value: values[i],
      }));
    } catch {
      return [];
    }
  })();

  // oldSettings（settings store 的 key-value 對：劇場貼文、提示詞管理器、健身設定等）
  const oldSettings = await (async () => {
    try {
      if (!db._instance) await db.init();
      if (!db._instance) return [];
      const tx = db._instance.transaction("settings", "readonly");
      const store = tx.objectStore("settings");
      const keys = await store.getAllKeys();
      const values = await store.getAll();
      return keys.map((key: IDBValidKey, i: number) => ({
        key: String(key),
        value: values[i],
      }));
    } catch {
      return [];
    }
  })();

  // canvas layout（widget 佈局、app 圖標、日曆顏色等）存在獨立的 Aguaphone_V2 IDB
  const canvasLayout = await (async () => {
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
  })();

  return {
    version: 1,
    type: "aguaphone-auto-backup",
    exportedAt: new Date().toISOString(),
    characters,
    lorebooks,
    settings,
    userData,
    themes,
    layouts,
    characterAffections,
    qzonePosts,
    summaries,
    diaries,
    pendingCalls,
    callHistory,
    holidayRecords,
    calendarEvents,
    importantEvents,
    books,
    stickers,
    gameStates,
    rendererRules,
    bookProgress,
    chatAffinityStates,
    vectorEmbeddings,
    promptLibrary,
    oldSettings,
    canvasLayout,
  };
}

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

/**
 * 讓出主線程，避免長時間阻塞導致瀏覽器殺掉頁面
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 將一個 Uint8Array 推入 fflate Zip 流（使用 AsyncZipDeflate 壓縮）
 * 回傳 Promise，在該檔案完全寫入後 resolve
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
        passThrough.push(data, true);
        resolve();
      } else {
        const deflater = new AsyncZipDeflate(filename, { level });
        zipper.add(deflater);
        deflater.push(data, true);
        resolve();
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * 構建備份 ZIP — 真正的流式構建
 *
 * 使用 fflate 的 Zip streaming API，逐個檔案寫入 zip 流，
 * 每個聊天處理完後立即釋放，記憶體峰值 ≈ 單個最大聊天的大小。
 *
 * ZIP 結構：
 *   backup.json          — 輕量數據（不含聊天）
 *   chats/<chatId>.json  — 每個聊天獨立一個檔案
 *   media/*              — 提取的媒體檔案
 */
async function buildBackupZipStreaming(
  onProgress?: BackupProgressCallback,
): Promise<Uint8Array> {
  // 1. 收集輕量數據
  onProgress?.({ phase: "收集基礎數據..." });
  await yieldToMain();
  const lightData = await collectLightData();

  // 建立共用的媒體提取器（跨聊天去重）
  const extractor = new BackupMediaExtractor();

  // 2. 先提取輕量數據中的媒體（角色頭像、主題桌布等）
  extractAllMediaFromBackupData(lightData, extractor);

  // 3. 建立 fflate Zip 流，收集輸出 chunks
  const outputChunks: Uint8Array[] = [];
  let totalOutputSize = 0;
  let zipResolve: () => void;
  let zipReject: (err: Error) => void;
  const zipDone = new Promise<void>((resolve, reject) => {
    zipResolve = resolve;
    zipReject = reject;
  });

  const zipper = new FflateZip((err, chunk, final) => {
    if (err) {
      console.error("[AutoBackup] ZIP 流錯誤:", err);
      zipReject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    outputChunks.push(chunk);
    totalOutputSize += chunk.length;
    if (final) {
      zipResolve();
    }
  });

  // 4. 寫入輕量數據（不含聊天）
  onProgress?.({ phase: "寫入基礎數據..." });
  await yieldToMain();
  const lightJsonBytes = strToU8(JSON.stringify(lightData));
  await pushFileToZip(zipper, "backup.json", lightJsonBytes);

  // 5. 逐個處理聊天 — 讀取 → 提取媒體 → 寫入 zip → 釋放
  const chatKeys = await getAllChatKeys();
  const totalChats = chatKeys.length;

  for (let i = 0; i < chatKeys.length; i++) {
    if (i % 3 === 0) {
      onProgress?.({ phase: "處理聊天", current: i + 1, total: totalChats });
      await yieldToMain();
    }

    try {
      const chat = await db.get<any>(DB_STORES.CHATS, chatKeys[i]);
      if (!chat) continue;

      if (chat.messages?.length > 0) {
        try {
          chat.messages = await restoreImagesToMessages(chat.messages);
        } catch (imgErr) {
          console.warn(`[AutoBackup] 聊天 "${chat.id}" 圖片還原失敗:`, imgErr);
        }

        // 立即提取該聊天的媒體，將 base64 替換為短路徑
        for (const msg of chat.messages) {
          if (msg.imageUrl?.startsWith("data:image/")) {
            const f = extractor.extract(msg.imageUrl, "chat");
            if (f) msg.imageUrl = f;
          }
          if (msg.imageData?.startsWith("data:image/")) {
            const f = extractor.extract(msg.imageData, "chat_data");
            if (f) msg.imageData = f;
          }
        }
        if (
          chat.appearance?.wallpaper?.type === "image" &&
          chat.appearance.wallpaper.value?.startsWith("data:image/")
        ) {
          const f = extractor.extract(
            chat.appearance.wallpaper.value,
            "chat_wallpaper",
          );
          if (f) chat.appearance.wallpaper.value = f;
        }
      }

      // 將聊天序列化後立即寫入 zip 流，然後釋放
      const chatJsonBytes = strToU8(JSON.stringify(chat));
      const safeId = String(chat.id || chatKeys[i]).replace(/[^a-zA-Z0-9_-]/g, "_");
      await pushFileToZip(zipper, `chats/${safeId}.json`, chatJsonBytes);
      // chat 物件在此作用域結束後即可被 GC 回收
    } catch (chatErr) {
      console.warn(
        `[AutoBackup] 聊天 "${chatKeys[i]}" 讀取失敗，跳過:`,
        chatErr,
      );
    }
  }

  // 6. 寫入媒體檔案
  const mediaResult = extractor.getResult();
  console.log(
    `[AutoBackup] 媒體提取完成: ${mediaResult.totalExtracted} 個 base64，去重 ${mediaResult.dedupeHits} 個`,
  );

  onProgress?.({ phase: "寫入媒體檔案..." });
  const mediaEntries = Object.entries(mediaResult.files);
  for (let i = 0; i < mediaEntries.length; i++) {
    if (i % 10 === 0) {
      onProgress?.({ phase: "寫入媒體", current: i + 1, total: mediaEntries.length });
      await yieldToMain();
    }
    const [filename, data] = mediaEntries[i];
    await pushFileToZip(zipper, filename, data);
  }

  // 7. 寫入 metadata.json（聊天數量等統計資訊）
  const metadataBytes = strToU8(JSON.stringify({
    version: "2.0",
    format: "aguaphone-streaming-backup",
    exportedAt: lightData.exportedAt,
    chatCount: totalChats,
    mediaCount: mediaEntries.length,
  }));
  await pushFileToZip(zipper, "metadata.json", metadataBytes);

  // 8. 結束 zip 流，等待中央目錄寫入完成
  onProgress?.({ phase: "完成壓縮..." });
  await yieldToMain();
  zipper.end();
  await zipDone;

  // 9. 合併所有 chunks 為最終 Uint8Array
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

/**
 * 構建備份 JSON — 將所有數據（含聊天）收集到一個 JSON 物件
 * 圖片保留 base64 DataURL，不做媒體提取
 */
async function buildBackupJson(
  onProgress?: BackupProgressCallback,
): Promise<string> {
  // 1. 收集輕量數據
  onProgress?.({ phase: "收集基礎數據..." });
  await yieldToMain();
  const data = await collectLightData();

  // 2. 逐個載入聊天
  const chatKeys = await getAllChatKeys();
  const totalChats = chatKeys.length;
  const chats: any[] = [];

  for (let i = 0; i < chatKeys.length; i++) {
    if (i % 3 === 0) {
      onProgress?.({ phase: "處理聊天", current: i + 1, total: totalChats });
      await yieldToMain();
    }
    try {
      const chat = await db.get<any>(DB_STORES.CHATS, chatKeys[i]);
      if (!chat) continue;
      if (chat.messages?.length > 0) {
        try {
          chat.messages = await restoreImagesToMessages(chat.messages);
        } catch (imgErr) {
          console.warn(`[AutoBackup] 聊天 "${chat.id}" 圖片還原失敗:`, imgErr);
        }
      }
      chats.push(chat);
    } catch (chatErr) {
      console.warn(`[AutoBackup] 聊天 "${chatKeys[i]}" 讀取失敗，跳過:`, chatErr);
    }
  }

  data.chats = chats;

  onProgress?.({ phase: "序列化 JSON..." });
  await yieldToMain();
  return JSON.stringify(data);
}

// ============================================================
// 寫入備份檔案
// ============================================================

function generateBackupFilename(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}h${pad(now.getMinutes())}m${pad(now.getSeconds())}s`;
  return `aguaphone-backup-${date}_${time}.json`;
}

/**
 * 使用 File System Access API 寫入備份
 */
async function writeBackupToFS(
  data: Blob,
  filename: string,
  settings: AutoBackupSettings,
): Promise<void> {
  if (!_dirHandle) throw new Error("未選擇備份資料夾");

  // 檢查權限
  const perm = await (_dirHandle as any).queryPermission({ mode: "readwrite" });
  if (perm !== "granted") {
    throw new Error("PERMISSION_NEEDED");
  }

  const fileHandle = await _dirHandle.getFileHandle(filename, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(data);
  await writable.close();

  // 清理舊備份
  if (settings.maxBackups > 0) {
    await cleanOldBackups(settings.maxBackups);
  }
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
      (name.endsWith(".zip") || name.endsWith(".json"))
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
 * Fallback：觸發瀏覽器下載
 */
async function downloadBackup(
  blob: Blob,
  filename: string,
): Promise<void> {
  const mimeType = filename.endsWith(".json") ? "application/json" : "application/zip";

  // iOS Safari: 使用 Web Share API（<a download> 在 iOS 上不可靠）
  if (
    navigator.share &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)
  ) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      await navigator.share({ files: [file] });
      return;
    } catch (shareErr: any) {
      if (shareErr?.name === "AbortError") return; // 使用者取消
      console.warn("[AutoBackup] Web Share 失敗，嘗試 <a> 下載:", shareErr);
    }
  }

  // 標準 <a> 下載（含 iOS fallback）
  const url = URL.createObjectURL(blob);
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
): Promise<BackupResult> {
  try {
    console.log("[AutoBackup] 開始備份...");
    const settings = await loadBackupSettings();
    const filename = generateBackupFilename();

    // 使用 JSON 格式備份
    const jsonStr = await buildBackupJson(onProgress);
    const blob = new Blob([jsonStr], { type: "application/json" });

    onProgress?.({ phase: "寫入檔案..." });

    if (!forceDownload && isFileSystemAccessSupported() && _dirHandle) {
      try {
        await writeBackupToFS(blob, filename, settings);
        const msg = `備份成功: ${filename}`;
        console.log(`[AutoBackup] ${msg}`);

        // 更新設定
        settings.lastBackupAt = Date.now();
        settings.lastBackupMessage = msg;
        await saveBackupSettings(settings);

        return { success: true, message: msg, filename, method: "fs" };
      } catch (e: any) {
        if (e.message === "PERMISSION_NEEDED") {
          return {
            success: false,
            message: "需要重新授權備份資料夾的寫入權限",
          };
        }
        throw e;
      }
    }

    // Fallback: 下載
    await downloadBackup(blob, filename);
    const msg = `已下載備份: ${filename}`;
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
