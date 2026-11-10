/**
 * 訊息裡的 AI 語音（聊天 TTS 段落、舊版單段 TTS、電話通話回放）另外存在 audio-blobs 表，
 * 訊息只留 audioblob_ 開頭的引用（跟錄音同一個表、同一種引用，完整備份本來就會整個表帶走）。
 *
 * 以前音檔轉成 base64 直接放在訊息裡：一則有語音的回覆多幾百 KB 到幾 MB，一通電話更多。
 * 每次 AI 回覆前要讀整個聊天的歷史、存檔時又讀又寫，所有語音都跟著進記憶體；
 * 語音一多，手機的網頁程序就被系統收掉，App 閃退（回一次退一次）。
 *
 * - 寫進 chatMessages 的入口（chatMessageStore 的 save／upsert／append）都先經過 externalizeRecordAudio，
 *   不管是聊天頁、通話、背景訊息、同步還是導入，進資料庫的都只剩引用
 * - 已經存在資料庫裡的舊語音由 migrateInlineMessageAudio 分批搬出去
 * - 播放時用 resolvePlayableAudioUrl 換成 blob: 網址
 */
import { DB_STORES, getDatabase, type AudioBlobRecord } from "./database";

/** 跟 operations.ts 的錄音引用同一個前綴 */
const AUDIO_BLOB_PREFIX = "audioblob_";

export function isMessageAudioRef(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(AUDIO_BLOB_PREFIX);
}

/** 直接放在訊息裡的 base64 音檔 */
export function isInlineAudioDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("data:")) return false;
  const comma = value.indexOf(",");
  return comma > 0 && value.lastIndexOf(";base64", comma) > 0;
}

/** base64 解開後的位元組數（不用真的解開） */
export function decodedDataUrlSize(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const length = dataUrl.length - comma - 1;
  const padding = dataUrl.endsWith("==") ? 2 : dataUrl.endsWith("=") ? 1 : 0;
  return Math.floor((length * 3) / 4) - padding;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const mimeType = dataUrl.slice(5, comma).split(";")[0] || "application/octet-stream";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function newMessageAudioRef(): string {
  return `${AUDIO_BLOB_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

type AnyRecord = Record<string, any>;

function hasInlineAudio(record: AnyRecord): boolean {
  if (isInlineAudioDataUrl(record.ttsAudioUrl)) return true;
  if (Array.isArray(record.ttsSegments) && record.ttsSegments.some((s: AnyRecord) => isInlineAudioDataUrl(s?.audioUrl))) {
    return true;
  }
  const callLines = record.phoneCallHistoryData?.messages;
  return Array.isArray(callLines) && callLines.some((m: AnyRecord) => isInlineAudioDataUrl(m?.audioUrl));
}

export interface AudioStoreAccess {
  get(id: string): Promise<AudioBlobRecord | undefined>;
  put(record: AudioBlobRecord): Promise<unknown>;
}

export interface ExternalizeResult<T> {
  record: T;
  /** 這次新存進 audio-blobs 的位元組數 */
  storedBytes: number;
}

/**
 * 把一筆訊息裡內嵌的 base64 語音換成引用；沒有內嵌語音時回傳 null。
 * 不改動傳進來的物件（巢狀的段落、通話記錄都複製一份再改）。
 *
 * existing 是資料庫裡原本那筆：同一個位置原本已經是引用、音檔大小也一樣，就沿用，不再存一份
 * （畫面上還留著舊的 base64 時，每次存檔都會帶回來）。
 *
 * audio 的 get／put 要在同一個 IndexedDB 交易裡，所以這裡除了交易裡的請求不 await 別的東西。
 */
export async function externalizeRecordAudio<T extends object>(
  record: T,
  audio: AudioStoreAccess,
  existing?: object | null,
): Promise<ExternalizeResult<T> | null> {
  const source = record as AnyRecord;
  if (!hasInlineAudio(source)) return null;

  const previous = (existing ?? null) as AnyRecord | null;
  // 同一則訊息裡同一段音檔（舊版 ttsAudioUrl 和第一段常常一樣）只存一份
  const byValue = new Map<string, string>();
  let storedBytes = 0;

  async function toRef(value: string, previousValue: unknown): Promise<string> {
    const known = byValue.get(value);
    if (known) return known;
    let ref: string | undefined;
    if (isMessageAudioRef(previousValue)) {
      const stored = await audio.get(previousValue);
      if (stored?.blob && stored.blob.size === decodedDataUrlSize(value)) ref = previousValue;
    }
    if (!ref) {
      let blob: Blob;
      try {
        blob = dataUrlToBlob(value);
      } catch (err) {
        // 解不開的就留在原地，至少還播得了
        console.warn("[messageAudio] 語音資料解不開，保留原樣:", err);
        return value;
      }
      ref = newMessageAudioRef();
      await audio.put({
        id: ref,
        blob,
        mimeType: blob.type || "audio/mpeg",
        createdAt: Date.now(),
      });
      storedBytes += blob.size;
    }
    byValue.set(value, ref);
    return ref;
  }

  const next: AnyRecord = { ...source };

  if (isInlineAudioDataUrl(next.ttsAudioUrl)) {
    next.ttsAudioUrl = await toRef(next.ttsAudioUrl, previous?.ttsAudioUrl);
  }

  if (Array.isArray(next.ttsSegments)) {
    const segments: unknown[] = [];
    for (let i = 0; i < next.ttsSegments.length; i++) {
      const seg = next.ttsSegments[i];
      if (seg && isInlineAudioDataUrl(seg.audioUrl)) {
        segments.push({ ...seg, audioUrl: await toRef(seg.audioUrl, previous?.ttsSegments?.[i]?.audioUrl) });
      } else {
        segments.push(seg);
      }
    }
    next.ttsSegments = segments;
  }

  const call = next.phoneCallHistoryData;
  if (call && Array.isArray(call.messages)) {
    const lines: unknown[] = [];
    for (let i = 0; i < call.messages.length; i++) {
      const line = call.messages[i];
      if (line && isInlineAudioDataUrl(line.audioUrl)) {
        lines.push({
          ...line,
          audioUrl: await toRef(line.audioUrl, previous?.phoneCallHistoryData?.messages?.[i]?.audioUrl),
        });
      } else {
        lines.push(line);
      }
    }
    next.phoneCallHistoryData = { ...call, messages: lines };
  }

  return { record: next as T, storedBytes };
}

// ============================================================
// 播放：引用 → blob: 網址
// ============================================================

/** 引用 → blob: 網址。音檔在硬碟上，建網址不會把整個檔讀進記憶體 */
const playableUrlCache = new Map<string, string>();
const MAX_CACHED_URLS = 300;

function rememberPlayableUrl(ref: string, url: string): void {
  playableUrlCache.set(ref, url);
  if (playableUrlCache.size <= MAX_CACHED_URLS) return;
  const oldest = playableUrlCache.keys().next().value;
  if (oldest === undefined) return;
  const oldUrl = playableUrlCache.get(oldest);
  playableUrlCache.delete(oldest);
  if (oldUrl) URL.revokeObjectURL(oldUrl);
}

/**
 * 不用等就能播的網址：一般網址、base64 原樣回傳；引用已經讀過的回傳 blob: 網址，還沒讀過的回傳 undefined。
 * 點擊當下就要出聲（iOS 要求）時先試這個。
 */
export function peekPlayableAudioUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (!isMessageAudioRef(url)) return url;
  return playableUrlCache.get(url);
}

/** 換成播得了的網址；引用對應的音檔不在這台裝置上（例如從別台同步過來）時回傳 null */
export async function resolvePlayableAudioUrl(url: string | undefined): Promise<string | null> {
  if (!url) return null;
  if (!isMessageAudioRef(url)) return url;
  const cached = playableUrlCache.get(url);
  if (cached) return cached;
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(DB_STORES.AUDIO_BLOBS)) return null;
    const record = await db.get(DB_STORES.AUDIO_BLOBS, url);
    if (!record?.blob) return null;
    const playable = URL.createObjectURL(record.blob);
    rememberPlayableUrl(url, playable);
    return playable;
  } catch (err) {
    console.warn("[messageAudio] 讀取語音失敗:", err);
    return null;
  }
}

/** 先把一批引用換成 blob: 網址，之後點擊就能馬上播 */
export function prefetchPlayableAudioUrls(urls: Array<string | undefined>): void {
  for (const url of urls) {
    if (isMessageAudioRef(url) && !playableUrlCache.has(url)) void resolvePlayableAudioUrl(url);
  }
}

/** 引用對應的音檔還在不在（語音從別台裝置同步過來時不在） */
export async function messageAudioExists(ref: string): Promise<boolean> {
  if (playableUrlCache.has(ref)) return true;
  try {
    const db = await getDatabase();
    if (!db.objectStoreNames.contains(DB_STORES.AUDIO_BLOBS)) return false;
    return (await db.getKey(DB_STORES.AUDIO_BLOBS, ref)) !== undefined;
  } catch {
    return false;
  }
}

/** 把一段語音（base64 或 Blob）存進 audio-blobs，回傳引用 */
export async function storeMessageAudio(source: string | Blob, mimeType?: string): Promise<string> {
  const blob = typeof source === "string" ? dataUrlToBlob(source) : source;
  const db = await getDatabase();
  if (!db.objectStoreNames.contains(DB_STORES.AUDIO_BLOBS)) {
    throw new Error("audio-blobs 表不存在");
  }
  const ref = newMessageAudioRef();
  await db.put(DB_STORES.AUDIO_BLOBS, {
    id: ref,
    blob,
    mimeType: mimeType || blob.type || "audio/mpeg",
    createdAt: Date.now(),
  });
  // 不把這個 blob 放進快取：它還在記憶體裡；播的時候從資料庫讀回來的是放在硬碟上的檔案
  return ref;
}

// ============================================================
// 舊資料搬遷
// ============================================================

const MIGRATION_DONE_KEY = "aguaphone.messageAudioMigrated.v1";
/** 每個交易最多處理幾筆、最多新存多少位元組：交易提交前音檔都在記憶體裡，不能一次全搬 */
const BATCH_RECORDS = 20;
const BATCH_BYTES = 8 * 1024 * 1024;

function readMigrationDone(): boolean {
  try {
    return localStorage.getItem(MIGRATION_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeMigrationDone(): void {
  try {
    localStorage.setItem(MIGRATION_DONE_KEY, "1");
  } catch {
    // 存不了就下次開 App 再掃一次，掃過的不會重搬
  }
}

export interface MessageAudioMigrationResult {
  scanned: number;
  migrated: number;
  storedBytes: number;
}

async function migrateKeys(keys: string[]): Promise<MessageAudioMigrationResult> {
  const result: MessageAudioMigrationResult = { scanned: 0, migrated: 0, storedBytes: 0 };
  const db = await getDatabase();
  if (!db.objectStoreNames.contains(DB_STORES.AUDIO_BLOBS)) return result;

  let index = 0;
  while (index < keys.length) {
    const tx = db.transaction([DB_STORES.CHAT_MESSAGES, DB_STORES.AUDIO_BLOBS], "readwrite");
    const messages = tx.objectStore(DB_STORES.CHAT_MESSAGES);
    const audioStore = tx.objectStore(DB_STORES.AUDIO_BLOBS);
    const audio: AudioStoreAccess = {
      get: (id) => audioStore.get(id),
      put: (record) => audioStore.put(record),
    };
    let batchRecords = 0;
    let batchBytes = 0;
    while (index < keys.length && batchRecords < BATCH_RECORDS && batchBytes < BATCH_BYTES) {
      const key = keys[index++];
      batchRecords++;
      const record = await messages.get(key);
      if (!record) continue;
      result.scanned++;
      const converted = await externalizeRecordAudio(record, audio, record);
      if (!converted) continue;
      await messages.put(converted.record);
      result.migrated++;
      result.storedBytes += converted.storedBytes;
      batchBytes += converted.storedBytes;
    }
    await tx.done;
    // 讓出主執行緒，也讓剛提交的音檔從記憶體釋放
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return result;
}

const chatMigrations = new Map<string, Promise<void>>();
let globalMigration: Promise<void> | null = null;

/**
 * 把資料庫裡所有訊息的內嵌語音搬出去。一筆一筆讀、分批寫，不會把整個聊天讀進記憶體。
 * 全部搬完後記下來，之後開 App 不再掃（新寫進去的都會在 chatMessageStore 轉成引用）。
 */
export function migrateInlineMessageAudio(): Promise<void> {
  if (readMigrationDone()) return Promise.resolve();
  globalMigration ??= (async () => {
    try {
      const db = await getDatabase();
      const keys = (await db.getAllKeys(DB_STORES.CHAT_MESSAGES)) as string[];
      const result = await migrateKeys(keys);
      writeMigrationDone();
      if (result.migrated > 0) {
        console.info(
          `[messageAudio] 已把 ${result.migrated} 則訊息的語音搬出去（${(result.storedBytes / 1024 / 1024).toFixed(1)} MB）`,
        );
      }
    } catch (err) {
      console.warn("[messageAudio] 搬移舊語音失敗，下次開 App 再試:", err);
    } finally {
      globalMigration = null;
    }
  })();
  return globalMigration;
}

/**
 * 讀整個聊天之前先把這個聊天的舊語音搬出去，免得 AI 回覆時把所有語音讀進記憶體。
 * 全部搬完過、或這次開 App 已經處理過這個聊天就馬上回來。
 */
export function ensureChatAudioMigrated(chatId: string): Promise<void> {
  if (!chatId || readMigrationDone()) return Promise.resolve();
  let job = chatMigrations.get(chatId);
  if (!job) {
    job = (async () => {
      try {
        const db = await getDatabase();
        const keys = (await db.getAllKeysFromIndex(DB_STORES.CHAT_MESSAGES, "by-chatId", chatId)) as string[];
        await migrateKeys(keys);
      } catch (err) {
        console.warn("[messageAudio] 搬移這個聊天的舊語音失敗:", err);
        chatMigrations.delete(chatId);
      }
    })();
    chatMigrations.set(chatId, job);
  }
  return job;
}

/** 測試用：重設搬遷狀態 */
export function resetMessageAudioStateForTests(): void {
  chatMigrations.clear();
  globalMigration = null;
  for (const url of playableUrlCache.values()) URL.revokeObjectURL(url);
  playableUrlCache.clear();
  try {
    localStorage.removeItem(MIGRATION_DONE_KEY);
  } catch {
    // 沒有 localStorage（測試環境）
  }
}
