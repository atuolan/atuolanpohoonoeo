import type { CharacterAffection, LayoutConfig, ThemeConfig } from "@/types";
import type {
  CharacterAffinityConfig,
  ChatAffinityState,
} from "@/schemas/affinity";
import type { ChatMessage } from "@/types/chat";
import type { AudioBlobRecord } from "./database";
import { closeDatabase, getDatabase } from "./database";

// ============================================================
// 主題操作
// ============================================================

/**
 * 獲取所有主題
 */
export async function getAllThemes(): Promise<ThemeConfig[]> {
  const db = await getDatabase();
  return db.getAll("themes");
}

/**
 * 獲取當前啟用的主題
 */
export async function getActiveTheme(): Promise<ThemeConfig | undefined> {
  const db = await getDatabase();
  const themes = await db.getAllFromIndex("themes", "by-active", 1);
  return themes[0];
}

/**
 * 根據 ID 獲取主題
 */
export async function getThemeById(
  id: string,
): Promise<ThemeConfig | undefined> {
  const db = await getDatabase();
  return db.get("themes", id);
}

/**
 * 儲存主題
 */
export async function saveTheme(theme: ThemeConfig): Promise<void> {
  const db = await getDatabase();

  // 如果設為啟用，先停用其他主題
  if (theme.isActive) {
    const activeThemes = await db.getAllFromIndex("themes", "by-active", 1);
    const tx = db.transaction("themes", "readwrite");
    for (const t of activeThemes) {
      if (t.id !== theme.id) {
        t.isActive = false;
        await tx.store.put(t);
      }
    }
    await tx.done;
  }

  theme.updatedAt = Date.now();
  await db.put("themes", theme);
}

/**
 * 刪除主題
 */
export async function deleteTheme(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("themes", id);
}

// ============================================================
// 佈局操作
// ============================================================

/**
 * 獲取所有佈局
 */
export async function getAllLayouts(): Promise<LayoutConfig[]> {
  const db = await getDatabase();
  return db.getAll("layouts");
}

/**
 * 獲取當前啟用的佈局
 */
export async function getActiveLayout(): Promise<LayoutConfig | undefined> {
  const db = await getDatabase();
  const layouts = await db.getAllFromIndex("layouts", "by-active", 1);
  return layouts[0];
}

/**
 * 根據 ID 獲取佈局
 */
export async function getLayoutById(
  id: string,
): Promise<LayoutConfig | undefined> {
  const db = await getDatabase();
  return db.get("layouts", id);
}

/**
 * 儲存佈局
 */
export async function saveLayout(layout: LayoutConfig): Promise<void> {
  const db = await getDatabase();

  // 如果設為啟用，先停用其他佈局
  if (layout.isActive) {
    const activeLayouts = await db.getAllFromIndex("layouts", "by-active", 1);
    const tx = db.transaction("layouts", "readwrite");
    for (const l of activeLayouts) {
      if (l.id !== layout.id) {
        l.isActive = false;
        await tx.store.put(l);
      }
    }
    await tx.done;
  }

  layout.updatedAt = Date.now();
  await db.put("layouts", layout);
}

/**
 * 刪除佈局
 */
export async function deleteLayout(id: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("layouts", id);
}

// ============================================================
// 好感度操作（舊版，保留向後相容）
// ============================================================

/**
 * @deprecated 使用 getAffinityConfig 替代
 */
export async function getCharacterAffection(
  characterId: string,
): Promise<CharacterAffection | undefined> {
  const db = await getDatabase();
  return db.get("characterAffections", characterId) as Promise<
    CharacterAffection | undefined
  >;
}

/**
 * @deprecated 使用 saveAffinityConfig 替代
 */
export async function saveCharacterAffection(
  affection: CharacterAffection,
): Promise<void> {
  const db = await getDatabase();
  affection.lastUpdated = Date.now();
  await db.put("characterAffections", affection as never);
}

/**
 * @deprecated 使用 getEnabledAffinityConfigs 替代
 */
export async function getEnabledAffections(): Promise<CharacterAffection[]> {
  const db = await getDatabase();
  return db.getAllFromIndex(
    "characterAffections",
    "by-enabled",
    1,
  ) as Promise<CharacterAffection[]>;
}

// ============================================================
// 好感度數值系統（新版，per-character 配置 + per-chat 狀態）
// ============================================================

/** 獲取角色好感度配置 */
export async function getAffinityConfig(
  characterId: string,
): Promise<CharacterAffinityConfig | undefined> {
  const db = await getDatabase();
  return db.get("characterAffections", characterId) as Promise<
    CharacterAffinityConfig | undefined
  >;
}

/** 儲存角色好感度配置 */
export async function saveAffinityConfig(
  config: CharacterAffinityConfig,
): Promise<void> {
  const db = await getDatabase();
  config.lastUpdated = Date.now();
  await db.put("characterAffections", config as never);
}

/** 刪除角色好感度配置 */
export async function deleteAffinityConfig(
  characterId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.delete("characterAffections", characterId);
}

/** 獲取所有已啟用好感度的角色配置 */
export async function getEnabledAffinityConfigs(): Promise<
  CharacterAffinityConfig[]
> {
  const db = await getDatabase();
  return db.getAllFromIndex(
    "characterAffections",
    "by-enabled",
    1,
  ) as Promise<CharacterAffinityConfig[]>;
}

/** 獲取所有角色好感度配置 */
export async function getAllAffinityConfigs(): Promise<
  CharacterAffinityConfig[]
> {
  const db = await getDatabase();
  return db.getAll("characterAffections") as Promise<
    CharacterAffinityConfig[]
  >;
}

// --- 聊天好感度狀態 ---

/** 獲取聊天好感度狀態 */
export async function getChatAffinityState(
  chatId: string,
): Promise<ChatAffinityState | undefined> {
  const db = await getDatabase();
  return db.get("chatAffinityStates", chatId);
}

/** 儲存聊天好感度狀態 */
export async function saveChatAffinityState(
  state: ChatAffinityState,
): Promise<void> {
  const db = await getDatabase();
  state.lastUpdated = Date.now();
  await db.put("chatAffinityStates", state);
}

/** 刪除聊天好感度狀態 */
export async function deleteChatAffinityState(
  chatId: string,
): Promise<void> {
  const db = await getDatabase();
  await db.delete("chatAffinityStates", chatId);
}

/** 獲取某角色所有聊天的好感度狀態 */
export async function getAffinityStatesByCharacter(
  characterId: string,
): Promise<ChatAffinityState[]> {
  const db = await getDatabase();
  return db.getAllFromIndex(
    "chatAffinityStates",
    "by-character",
    characterId,
  );
}

/** 獲取所有聊天好感度狀態 */
export async function getAllChatAffinityStates(): Promise<
  ChatAffinityState[]
> {
  const db = await getDatabase();
  return db.getAll("chatAffinityStates");
}

// ============================================================
// 設定操作
// ============================================================

/**
 * 獲取設定值
 */
export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDatabase();
  return db.get("settings", key) as Promise<T | undefined>;
}

/**
 * 儲存設定值
 */
export async function saveSetting<T>(key: string, value: T): Promise<void> {
  const db = await getDatabase();
  await db.put("settings", value, key);
}

/**
 * 刪除設定值
 */
export async function deleteSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("settings", key);
}

// ============================================================
// QZone 動態操作
// ============================================================

import type { QZonePost } from "@/types/qzone";

/**
 * 獲取單個動態
 */
export async function getQzonePost(
  postId: string,
): Promise<QZonePost | undefined> {
  const db = await getDatabase();
  return db.get("qzonePosts", postId);
}

/**
 * 獲取所有動態（按時間降序）
 */
export async function getAllQzonePosts(): Promise<QZonePost[]> {
  const db = await getDatabase();
  const posts = await db.getAll("qzonePosts");
  return posts.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 儲存單個動態
 */
export async function saveQzonePost(post: QZonePost): Promise<void> {
  const db = await getDatabase();
  // 轉換為純物件以避免 Vue 響應式代理導致的 DataCloneError
  const plainPost = JSON.parse(JSON.stringify(post));
  await db.put("qzonePosts", plainPost);
}

/**
 * 批量儲存動態
 */
export async function saveQzonePosts(posts: QZonePost[]): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction("qzonePosts", "readwrite");
  // 轉換為純物件以避免 Vue 響應式代理導致的 DataCloneError
  const plainPosts = JSON.parse(JSON.stringify(posts));
  await Promise.all([
    ...plainPosts.map((post: QZonePost) => tx.store.put(post)),
    tx.done,
  ]);
}

/**
 * 刪除動態
 */
export async function deleteQzonePost(postId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("qzonePosts", postId);
}

/**
 * 根據作者獲取動態
 */
export async function getQzonePostsByAuthor(
  authorId: string,
): Promise<QZonePost[]> {
  const db = await getDatabase();
  return db.getAllFromIndex("qzonePosts", "by-author", authorId);
}

/**
 * 獲取動態數量
 */
export async function getQzonePostsCount(): Promise<number> {
  const db = await getDatabase();
  return db.count("qzonePosts");
}

// ============================================================
// 聊天圖片分離儲存操作
// ============================================================

/** 聊天圖片 ID 前綴 */
const CHAT_IMAGE_PREFIX = "chatimg_";

/** 判斷字串是否為 base64 data URL */
function isBase64DataUrl(str: string | undefined): boolean {
  return !!str && str.startsWith("data:");
}

/** 判斷字串是否為圖片引用 ID */
export function isChatImageRef(str: string | undefined): boolean {
  return !!str && str.startsWith(CHAT_IMAGE_PREFIX);
}

/**
 * 將 base64 圖片存入 imageCache 表，返回引用 ID
 */
export async function saveChatImage(
  base64Data: string,
  mimeType?: string,
): Promise<string> {
  const db = await getDatabase();
  const id = `${CHAT_IMAGE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await db.put("imageCache", {
    id,
    data: base64Data,
    thumbnail: "",
    fileName: "chat-image",
    fileSize: base64Data.length,
    mimeType: mimeType || "image/jpeg",
    createdAt: now,
    lastUsedAt: now,
    useCount: 0,
  });

  return id;
}

/**
 * 從 imageCache 表讀取圖片 base64 數據
 */
export async function getChatImage(refId: string): Promise<string | null> {
  const db = await getDatabase();
  const record = await db.get("imageCache", refId);
  return record?.data || null;
}

/**
 * 批量讀取圖片（減少 IDB 交易次數）
 */
export async function getChatImages(
  refIds: string[],
): Promise<Map<string, string>> {
  if (refIds.length === 0) return new Map();
  const db = await getDatabase();
  const result = new Map<string, string>();
  // 使用單一交易批量讀取
  const tx = db.transaction("imageCache", "readonly");
  const promises = refIds.map(async (id) => {
    const record = await tx.store.get(id);
    if (record?.data) result.set(id, record.data);
  });
  await Promise.all(promises);
  await tx.done;
  return result;
}

/**
 * 刪除聊天圖片
 */
export async function deleteChatImage(refId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("imageCache", refId);
}

/**
 * 刪除指定聊天的所有圖片（根據訊息中的引用 ID）
 */
export async function deleteChatImagesByRefs(refIds: string[]): Promise<void> {
  if (refIds.length === 0) return;
  const db = await getDatabase();
  const tx = db.transaction("imageCache", "readwrite");
  await Promise.all(refIds.map((id) => tx.store.delete(id)));
  await tx.done;
}

/**
 * 從訊息列表中提取圖片到 imageCache，訊息中的 base64 替換為引用 ID
 * 返回修改後的訊息列表（不修改原始陣列）
 */
export async function extractImagesFromMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    const hasBase64Url = isBase64DataUrl(msg.imageUrl);
    const hasBase64Data = isBase64DataUrl(msg.imageData);

    if (!hasBase64Url && !hasBase64Data) {
      result.push(msg);
      continue;
    }

    // 需要提取圖片的訊息，建立副本
    const newMsg = { ...msg };

    // imageUrl 和 imageData 可能是同一張圖的不同格式
    // imageUrl 是 data URL（帶 data:image/...;base64, 前綴）
    // imageData 是純 base64（給 AI Vision 用）
    // 通常 imageUrl 包含了 imageData 的內容，所以只存一份

    if (hasBase64Url) {
      const refId = await saveChatImage(msg.imageUrl!, msg.imageMimeType);
      newMsg.imageUrl = refId;
      // 如果 imageData 也是 base64，用同一個引用
      if (hasBase64Data) {
        newMsg.imageData = refId;
      }
    } else if (hasBase64Data) {
      const refId = await saveChatImage(msg.imageData!, msg.imageMimeType);
      newMsg.imageData = refId;
    }

    result.push(newMsg);
  }

  return result;
}

/**
 * 將訊息列表中的圖片引用還原為 base64 數據
 */
export async function restoreImagesToMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  // 先收集所有需要還原的引用 ID
  const refIds = new Set<string>();
  for (const msg of messages) {
    if (isChatImageRef(msg.imageUrl)) refIds.add(msg.imageUrl!);
    if (isChatImageRef(msg.imageData) && msg.imageData !== msg.imageUrl) {
      refIds.add(msg.imageData!);
    }
  }

  if (refIds.size === 0) return messages;

  // 批量讀取
  const imageMap = await getChatImages([...refIds]);

  // 還原
  return messages.map((msg) => {
    const needsUrlRestore = isChatImageRef(msg.imageUrl);
    const needsDataRestore = isChatImageRef(msg.imageData);

    if (!needsUrlRestore && !needsDataRestore) return msg;

    const newMsg = { ...msg };
    if (needsUrlRestore) {
      newMsg.imageUrl = imageMap.get(msg.imageUrl!) || msg.imageUrl;
    }
    if (needsDataRestore) {
      // 如果 imageData 和 imageUrl 用同一個引用，共用同一份數據
      if (msg.imageData === msg.imageUrl && needsUrlRestore) {
        newMsg.imageData = newMsg.imageUrl;
      } else {
        newMsg.imageData = imageMap.get(msg.imageData!) || msg.imageData;
      }
    }
    return newMsg;
  });
}

/**
 * 收集訊息列表中所有的圖片引用 ID
 */
export function collectImageRefs(messages: ChatMessage[]): string[] {
  const refs = new Set<string>();
  for (const msg of messages) {
    if (isChatImageRef(msg.imageUrl)) refs.add(msg.imageUrl!);
    if (isChatImageRef(msg.imageData) && msg.imageData !== msg.imageUrl) {
      refs.add(msg.imageData!);
    }
  }
  return [...refs];
}

// ============================================================
// 音頻 Blob 分離儲存操作
// ============================================================

/** 音頻 Blob ID 前綴 */
const AUDIO_BLOB_PREFIX = "audioblob_";

/** 判斷字串是否為音頻 blob 引用 ID */
export function isAudioBlobRef(str: string | undefined): boolean {
  return !!str && str.startsWith(AUDIO_BLOB_PREFIX);
}

/**
 * 將音頻 Blob 存入 audio-blobs 表，返回引用 ID
 */
export async function saveAudioBlob(
  blob: Blob,
  mimeType: string,
): Promise<string> {
  let db = await getDatabase();

  // 防禦：如果 audio-blobs store 不存在（舊版 DB 連線），重新連線觸發升級
  if (!db.objectStoreNames.contains("audio-blobs")) {
    console.warn("[DB] audio-blobs store 不存在，重新連線觸發升級");
    closeDatabase();
    db = await getDatabase();

    // 如果重連後仍然不存在，說明 DB 版本已是最新但 store 缺失
    // 這種情況下無法自動修復，需要用戶清除瀏覽器數據
    if (!db.objectStoreNames.contains("audio-blobs")) {
      console.error(
        "[DB] audio-blobs store 仍不存在，DB 版本:",
        db.version,
        "可用 stores:",
        [...db.objectStoreNames],
      );
      throw new Error(
        "音頻儲存初始化失敗，請嘗試清除瀏覽器快取後重新載入頁面",
      );
    }
  }

  const id = `${AUDIO_BLOB_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = Date.now();

  await db.put("audio-blobs", {
    id,
    blob,
    mimeType,
    createdAt: now,
  });

  return id;
}

/**
 * 從 audio-blobs 表讀取音頻 Blob
 */
export async function getAudioBlob(
  refId: string,
): Promise<AudioBlobRecord | null> {
  let db = await getDatabase();

  if (!db.objectStoreNames.contains("audio-blobs")) {
    closeDatabase();
    db = await getDatabase();
    if (!db.objectStoreNames.contains("audio-blobs")) return null;
  }

  const record = await db.get("audio-blobs", refId);
  return record || null;
}

/**
 * 批量讀取音頻 Blob
 */
export async function getAudioBlobs(
  refIds: string[],
): Promise<Map<string, AudioBlobRecord>> {
  if (refIds.length === 0) return new Map();
  const db = await getDatabase();
  if (!db.objectStoreNames.contains("audio-blobs")) return new Map();
  const result = new Map<string, AudioBlobRecord>();
  const tx = db.transaction("audio-blobs", "readonly");
  const promises = refIds.map(async (id) => {
    const record = await tx.store.get(id);
    if (record) result.set(id, record);
  });
  await Promise.all(promises);
  await tx.done;
  return result;
}

/**
 * 刪除音頻 Blob
 */
export async function deleteAudioBlob(refId: string): Promise<void> {
  const db = await getDatabase();
  await db.delete("audio-blobs", refId);
}

/**
 * 從訊息列表中提取音頻 Blob 到 audio-blobs store。
 * 訊息中若帶有 _audioBlob（臨時 Blob 數據），則存入 store 並設定 audioBlobId。
 * 返回修改後的訊息列表（不修改原始陣列）。
 */
export async function extractAudioFromMessages(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  const result: ChatMessage[] = [];

  for (const msg of messages) {
    // 只處理有臨時音頻 Blob 的訊息
    const tempBlob = (msg as any)._audioBlob as Blob | undefined;
    if (!tempBlob) {
      result.push(msg);
      continue;
    }

    const newMsg = { ...msg };
    const refId = await saveAudioBlob(
      tempBlob,
      msg.audioMimeType || "audio/webm",
    );
    newMsg.audioBlobId = refId;
    // 移除臨時欄位
    delete (newMsg as any)._audioBlob;
    result.push(newMsg);
  }

  return result;
}

/**
 * 將訊息列表中的音頻 blob 引用還原，返回 blobId → AudioBlobRecord 的映射。
 * 訊息本身不修改（audioBlobId 保持為引用 ID），呼叫方使用映射取得 Blob。
 */
export async function restoreAudioToMessages(
  messages: ChatMessage[],
): Promise<Map<string, AudioBlobRecord>> {
  const refIds = new Set<string>();
  for (const msg of messages) {
    if (isAudioBlobRef(msg.audioBlobId)) {
      refIds.add(msg.audioBlobId!);
    }
  }

  if (refIds.size === 0) return new Map();

  return getAudioBlobs([...refIds]);
}

/**
 * 收集訊息列表中所有的音頻 blob 引用 ID
 */
export function collectAudioBlobRefs(messages: ChatMessage[]): string[] {
  const refs = new Set<string>();
  for (const msg of messages) {
    if (isAudioBlobRef(msg.audioBlobId)) refs.add(msg.audioBlobId!);
  }
  return [...refs];
}

/**
 * 刪除指定的音頻 blob 引用列表
 */
export async function deleteAudioBlobsByRefs(refIds: string[]): Promise<void> {
  if (refIds.length === 0) return;
  const db = await getDatabase();
  const tx = db.transaction("audio-blobs", "readwrite");
  await Promise.all(refIds.map((id) => tx.store.delete(id)));
  await tx.done;
}
