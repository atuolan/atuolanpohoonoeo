/**
 * 舊版備份恢復服務
 * 用於將 v1 版本的備份檔案轉換並恢復到新版 IndexedDB
 */

import {
    db,
    DB_STORES,
    type ConversationSummary,
    type DiaryEntry,
} from "@/db/database";
import { extractImagesFromMessages } from "@/db/operations";
import type { CharacterCardV2Data, StoredCharacter } from "@/types/character";
import { createDefaultCharacterData } from "@/types/character";
import type { Chat, ChatMessage } from "@/types/chat";
import type { ImportantEventsLog } from "@/types/importantEvents";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import type { StickerCategory } from "@/types/sticker";
import type { Lorebook, WorldInfoEntry } from "@/types/worldinfo";
import {
    createDefaultWorldInfoEntry,
    WorldInfoLogic,
    WorldInfoPosition,
} from "@/types/worldinfo";
import * as fflate from "fflate";

// ============================================================
// 解壓縮工具函數（用於處理舊版 pako 壓縮的資料）
// ============================================================

/**
 * 解壓縮 Base64 資料（處理 compressed: 前綴格式）
 * 舊版備份使用 pako deflate 壓縮，這裡用 fflate 解壓
 */
function decompressBase64(compressedBase64: string): string {
  try {
    if (!compressedBase64 || compressedBase64.length === 0)
      return compressedBase64;

    // 如果不是壓縮資料，直接返回
    if (!compressedBase64.startsWith("compressed:")) {
      return compressedBase64;
    }

    // 移除前綴
    const base64 = compressedBase64.slice("compressed:".length);

    // 解碼 Base64 → 壓縮的二進制
    const compressedBinary = atob(base64);
    const compressed = new Uint8Array(compressedBinary.length);
    for (let i = 0; i < compressedBinary.length; i++) {
      compressed[i] = compressedBinary.charCodeAt(i);
    }

    // 嘗試多種解壓方式（pako 可能使用不同的壓縮格式）
    let decompressed: Uint8Array;
    try {
      // 先嘗試 raw deflate（pako.deflate 預設使用 raw）
      decompressed = fflate.inflateSync(compressed);
    } catch {
      try {
        // 如果失敗，嘗試 zlib 格式
        decompressed = fflate.unzlibSync(compressed);
      } catch {
        // 最後嘗試 gzip 格式
        decompressed = fflate.gunzipSync(compressed);
      }
    }

    // 將解壓後的二進制數據轉為 Base64
    // 使用分塊處理避免棧溢出
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < decompressed.length; i += chunkSize) {
      const chunk = decompressed.subarray(
        i,
        Math.min(i + chunkSize, decompressed.length),
      );
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }

    // 轉為 Base64
    return btoa(binary);
  } catch (error) {
    console.error("❌ 解壓失敗:", error);
    console.error("原始數據長度:", compressedBase64.length);
    console.error("原始數據預覽:", compressedBase64.substring(0, 100));
    return compressedBase64;
  }
}

// ============================================================
// 舊版資料類型定義
// ============================================================

/** 舊版訊息格式 */
interface LegacyMessage {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  type: "text" | "image" | "sticker" | "diary";
  timestamp: number;
  groupId?: string;
  deleted?: boolean;
  imageUrl?: string;
  thoughts?: string;
  senderName?: string;
  diaryData?: {
    id: string;
    content: string;
    summary?: string;
    createdAt: number;
    messageCount: number;
    status: string;
    isFavorite?: boolean;
  };
}

/** 舊版聊天設定 */
interface LegacyChatSettings {
  myNickname?: string;
  theme?: string;
  fontSize?: number;
  linkedMemoryChats?: string[];
  autoReply?: boolean;
  linkedWorldBookIds?: string[];
  aiPersona?: string;
  bilingualMode?: boolean;
  onlineMode?: boolean;
  diaryInterval?: number;
  actualMessageCount?: number;
  summaryReadMode?: string;
  summaryReadCount?: number;
  chineseMode?: string;
  backgroundImage?: string;
  userAvatar?: string;
  charAvatar?: string;
  userBubbleColor?: string;
  userBubbleStyle?: string;
  charBubbleColor?: string;
  charBubbleStyle?: string;
  userName?: string;
  userPersona?: string;
  messageFontSize?: number;
  messageFontFamily?: string;
  bubbleAnimation?: boolean;
  animationType?: string;
  bannedWords?: string[];
  selectedPersonaId?: string;
}

/** 舊版總結 */
interface LegacySummary {
  id: string;
  content: string;
  messageCount: number;
  startMessageId: string;
  endMessageId: string;
  createdAt: number;
  isImportant?: boolean;
}

/** 舊版聊天格式 */
interface LegacyChat {
  id: string;
  name: string;
  originalName?: string;
  avatar?: string;
  isGroup?: boolean;
  settings: LegacyChatSettings;
  history: LegacyMessage[];
  longTermMemory?: string[];
  lastMessageTime?: number;
  unreadCount?: number;
  summaries?: LegacySummary[];
  lorebookIds?: string[];
  characterId?: string;
  conversationSummary?: string;
  lastSummaryTime?: number;
}

/** 舊版角色格式 - 實際上是 SillyTavern Character Card 格式 */
interface LegacyCharacter {
  id?: string;
  // V2 格式欄位
  name?: string;
  data?: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    system_prompt: string;
    post_history_instructions: string;
    tags: string[];
    creator: string;
    character_version: string;
    alternate_greetings: string[];
    extensions: Record<string, unknown>;
    character_book?: {
      name?: string;
      description?: string;
      entries: Array<Record<string, unknown>>;
    };
  };
  // 舊版簡化欄位（備用）
  avatar?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  first_mes?: string;
  exampleDialogue?: string;
  mes_example?: string;
  systemPrompt?: string;
  system_prompt?: string;
  creatorNotes?: string;
  creator_notes?: string;
  creatorcomment?: string;
  tags?: string[];
  lorebookIds?: string[];
  createdAt?: number;
  updatedAt?: number;
  create_date?: string;
  imported?: boolean;
  source?: string;
}

/** 舊版世界書條目 */
interface LegacyWorldInfoEntry {
  id: number;
  keys: string[];
  secondaryKeys?: string[];
  comment?: string;
  content: string;
  constant?: boolean;
  enabled?: boolean;
  selective?: boolean;
  selectiveLogic?: number;
  order?: number;
  position?: number | string;
  depth?: number;
  role?: number;
  probability?: number;
  useProbability?: boolean;
  group?: string;
  groupWeight?: number;
  scanDepth?: number;
  caseSensitive?: boolean;
  matchWholeWords?: boolean;
  excludeRecursion?: boolean;
  preventRecursion?: boolean;
}

/** 舊版世界書 */
interface LegacyLorebook {
  id: string;
  name: string;
  description?: string;
  entries: LegacyWorldInfoEntry[];
  scanDepth?: number;
  tokenBudget?: number;
  recursiveScanning?: boolean;
  createdAt?: number;
  updatedAt?: number;
}

/** 舊版貼文評論 */
interface LegacyPostComment {
  id: string;
  authorId: string;
  username: string;
  avatar: string;
  content: string;
  timestamp: number;
  authorType?: "user" | "ai";
  replyToId?: string;
  replyToUsername?: string;
}

/** 舊版貼文 */
interface LegacyPost {
  id: string;
  authorId: string;
  username?: string;
  avatar?: string;
  type: string;
  content?: string;
  publicText?: string;
  hiddenContent?: string;
  imageDescription?: string;
  images?: string[];
  timestamp: number;
  comments: LegacyPostComment[];
  likes: string[];
  visibility?: string;
  qualifier?: string;
  authorType?: "user" | "ai";
  liked?: boolean;
  likeCount?: number;
  commentCount?: number;
}

/** 舊版貼圖 */
interface LegacySticker {
  id: string;
  name: string;
  url: string;
  keywords?: string[];
}

/** 舊版貼圖分類 */
interface LegacyStickerCategory {
  id: string;
  name: string;
  icon?: string;
  stickers: LegacySticker[];
}

/** 舊版重要事件 */
interface LegacyImportantEvent {
  id: string;
  content: string;
  timestamp: number;
  source?: string;
  category?: string;
  priority?: number;
  tags?: string[];
  relatedMessageId?: string;
}

/** 舊版重要事件記錄（陣列格式） */
interface LegacyImportantEventsEntry {
  id: string;
  characterId: string;
  chatId?: string;
  events: LegacyImportantEvent[];
  settings?: {
    enabled?: boolean;
    autoSave?: boolean;
    maxEvents?: number;
  };
  createdAt?: number;
  updatedAt?: number;
}

/** 舊版 API 設定 */
interface LegacyAPIConfig {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}

/** 舊版 API Profile */
interface LegacyAPIProfile {
  id: string;
  name: string;
  endpoint: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

/** 舊版備份資料結構 */
interface LegacyBackupData {
  version: number;
  timestamp: number;
  exportDate: string;
  data: {
    chats?: LegacyChat[];
    characters?: LegacyCharacter[];
    lorebooks?: LegacyLorebook[];
    personas?: Array<{
      id: string;
      name: string;
      avatar?: string;
      description?: string;
    }>;
    posts?: LegacyPost[];
    apiConfig?: LegacyAPIConfig;
    apiProfiles?: LegacyAPIProfile[];
    apiAuxiliaryProfiles?: LegacyAPIProfile[];
    currentProfileId?: string;
    currentAuxiliaryProfileId?: string;
    settings?: Record<string, unknown>;
    customTheme?: Record<string, unknown>;
    customThemes?: Array<Record<string, unknown>>;
    appTheme?: string;
    customStickers?: LegacyStickerCategory[];
    importantEvents?:
      | LegacyImportantEventsEntry[]
      | Record<string, LegacyImportantEvent[]>;
    calendarEvents?: unknown[];
    autoInteractionConfig?: Record<string, unknown>;
    qzoneEnableAiImage?: boolean;
  };
}

// ============================================================
// 恢復結果類型
// ============================================================

export interface RestoreResult {
  success: boolean;
  error?: string;
  stats: {
    chats: number;
    characters: number;
    lorebooks: number;
    summaries: number;
    posts: number;
    stickers: number;
    importantEvents: number;
  };
  warnings: string[];
}

// ============================================================
// 轉換函數
// ============================================================

/**
 * 解壓縮頭像資料
 * 處理 compressed: 前綴的壓縮 base64 資料
 */
function decompressAvatar(avatar: string | undefined): string {
  if (!avatar) return "";

  console.log("[decompressAvatar] 輸入:", {
    length: avatar.length,
    prefix: avatar.substring(0, 50),
    isCompressed: avatar.includes("compressed:"),
    isDataURL: avatar.startsWith("data:"),
    isHTTP: avatar.startsWith("http"),
  });

  // 如果是 HTTP URL，直接返回（外部圖片）
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    console.log("[decompressAvatar] HTTP URL，直接返回");
    return avatar;
  }

  // 檢查是否為壓縮格式
  if (avatar.startsWith("data:") && avatar.includes(",compressed:")) {
    // Data URL 格式：data:image/png;base64,compressed:XXX
    const parts = avatar.split(",");
    if (parts.length === 2 && parts[1].startsWith("compressed:")) {
      const prefix = parts[0] + ",";
      const decompressed = decompressBase64(parts[1]);
      const result = prefix + decompressed;
      console.log("[decompressAvatar] Data URL 解壓完成:", {
        originalLength: avatar.length,
        decompressedLength: result.length,
        prefix,
      });
      return result;
    }
  } else if (avatar.startsWith("compressed:")) {
    // 純壓縮格式：compressed:XXX
    const decompressed = decompressBase64(avatar);
    const result = `data:image/png;base64,${decompressed}`;
    console.log("[decompressAvatar] 純壓縮格式解壓完成:", {
      originalLength: avatar.length,
      decompressedLength: result.length,
    });
    return result;
  }

  // 如果是普通 Data URL，直接返回
  if (avatar.startsWith("data:")) {
    console.log("[decompressAvatar] 普通 Data URL，直接返回");
    return avatar;
  }

  // 其他情況，返回原始數據
  console.log("[decompressAvatar] 未知格式，返回原始數據");
  return avatar;
}

/**
 * 從訊息內容中提取心聲（想法）
 * 支援新格式 ˇ想法ˇ 和舊格式 ~(想法)~
 */
function extractThought(content: string): {
  thought?: string;
  cleanContent: string;
} {
  let cleanContent = content;

  // 新格式 ˇ想法ˇ（注音符號）
  const thoughtMatchNew = cleanContent.match(/ˇ([^ˇ]+)ˇ/g);
  if (thoughtMatchNew && thoughtMatchNew.length > 0) {
    const lastThought = thoughtMatchNew[thoughtMatchNew.length - 1];
    const innerMatch = lastThought.match(/ˇ([^ˇ]+)ˇ/);
    const thought = innerMatch ? innerMatch[1] : undefined;
    cleanContent = cleanContent.replace(/\s*ˇ[^ˇ]+ˇ/g, "").trim();
    return { thought, cleanContent };
  }

  // 舊格式 ~(想法)~ — 使用非貪婪匹配以支援內容中包含括號的情況
  const thoughtMatchOld = cleanContent.match(/~\(([\s\S]+?)\)~/g);
  if (thoughtMatchOld && thoughtMatchOld.length > 0) {
    const lastThought = thoughtMatchOld[thoughtMatchOld.length - 1];
    const innerMatch = lastThought.match(/~\(([\s\S]+?)\)~/);
    const thought = innerMatch ? innerMatch[1] : undefined;
    cleanContent = cleanContent.replace(/\s*~\([\s\S]+?\)~/g, "").trim();
    return { thought, cleanContent };
  }

  return { cleanContent };
}

/**
 * 轉換舊版訊息為新版格式
 */
function convertMessage(
  msg: LegacyMessage,
  chatName: string,
): ChatMessage | null {
  // 跳過已刪除的訊息
  if (msg.deleted) return null;

  // 跳過日記訊息（日記會單獨提取到 diaries 表）
  if (msg.type === "diary") return null;

  // 從 AI 訊息中提取心聲（優先使用舊版獨立的 thoughts 欄位）
  const { thought, cleanContent } =
    msg.role === "ai"
      ? extractThought(msg.content)
      : { cleanContent: msg.content };
  const finalThought = msg.thoughts || thought;

  return {
    id: msg.id,
    sender:
      msg.role === "user" ? "user" : msg.role === "ai" ? "assistant" : "system",
    name: msg.role === "user" ? "User" : chatName,
    content: cleanContent,
    is_user: msg.role === "user",
    status: "sent",
    createdAt: msg.timestamp,
    updatedAt: msg.timestamp,
    messageType: msg.type === "image" ? "image" : "text",
    imageUrl: msg.imageUrl,
    ...(finalThought ? { thought: finalThought } : {}),
  };
}

/**
 * 轉換舊版聊天為新版格式
 */
function convertChat(
  legacy: LegacyChat,
  extractedAvatars: {
    userAvatar?: string;
    charAvatar?: string;
  } = {},
): Chat {
  const messages = legacy.history
    .map((msg) => convertMessage(msg, legacy.name))
    .filter((m): m is ChatMessage => m !== null);

  // 解壓縮背景圖片
  const backgroundImage = legacy.settings.backgroundImage
    ? decompressAvatar(legacy.settings.backgroundImage)
    : "";

  return {
    id: legacy.id,
    name: legacy.name,
    characterId: legacy.characterId || "",
    messages,
    metadata: {
      variables: {},
      // 保存提取的頭像信息到元數據（供後續使用）
      ...(extractedAvatars.userAvatar || extractedAvatars.charAvatar
        ? {
            legacyAvatars: {
              userAvatar: extractedAvatars.userAvatar,
              charAvatar: extractedAvatars.charAvatar,
            },
          }
        : {}),
    },
    createdAt: legacy.history[0]?.timestamp || Date.now(),
    updatedAt: legacy.lastMessageTime || Date.now(),
    appearance: backgroundImage
      ? {
          useCustom: true,
          wallpaper: {
            type: "image",
            value: backgroundImage,
            blur: 0,
            opacity: 1,
            overlay: "",
          },
          bubble: {
            userBgColor: legacy.settings.userBubbleColor || "#95EC69",
            userBgGradient: "",
            userTextColor: "#000000",
            aiBgColor: legacy.settings.charBubbleColor || "#FFFFFF",
            aiTextColor: "#000000",
            borderRadius: 16,
            maxWidth: 80,
            showAvatar: true,
          },
        }
      : undefined,
  };
}

/**
 * 從舊版聊天提取總結
 */
function extractSummaries(legacy: LegacyChat): ConversationSummary[] {
  if (!legacy.summaries?.length) return [];

  return legacy.summaries.map((s) => ({
    id: s.id,
    chatId: legacy.id,
    characterId: legacy.characterId || "",
    content: s.content,
    createdAt: s.createdAt,
    messageCount: s.messageCount,
    isImportant: s.isImportant,
  }));
}

/**
 * 從舊版聊天歷史中提取日記
 */
function extractDiaries(legacy: LegacyChat): DiaryEntry[] {
  const diaryMessages = legacy.history.filter((msg) => msg.type === "diary");
  if (!diaryMessages.length) return [];

  return diaryMessages.map((msg) => {
    const dd = msg.diaryData;
    return {
      id: dd?.id || msg.id,
      chatId: legacy.id,
      characterId: legacy.characterId || "",
      content: dd?.content || msg.content,
      createdAt: dd?.createdAt || msg.timestamp,
      messageCount: dd?.messageCount || 0,
      isFavorite: dd?.isFavorite || false,
      status: (dd?.status as "writing" | "ready") || "ready",
    };
  });
}

/**
 * 轉換舊版角色為新版格式
 */
function convertCharacter(legacy: LegacyCharacter): StoredCharacter {
  // 解壓縮頭像
  const avatar = decompressAvatar(legacy.avatar);

  // 生成 ID（如果舊版沒有 ID，則生成新的）
  const characterId = legacy.id || crypto.randomUUID();

  // 檢查是否為 SillyTavern V2 格式（有 data 欄位）
  if (legacy.data && typeof legacy.data === "object") {
    const cardData = legacy.data;
    const data: CharacterCardV2Data = {
      ...createDefaultCharacterData(),
      name: cardData.name || legacy.name || "",
      description: cardData.description || "",
      personality: cardData.personality || "",
      scenario: cardData.scenario || "",
      first_mes: cardData.first_mes || "",
      mes_example: cardData.mes_example || "",
      system_prompt: cardData.system_prompt || "",
      post_history_instructions: cardData.post_history_instructions || "",
      creator_notes: cardData.creator_notes || "",
      creator: cardData.creator || "",
      character_version: cardData.character_version || "1.0",
      tags: cardData.tags || [],
      alternate_greetings: cardData.alternate_greetings || [],
      extensions:
        (cardData.extensions as CharacterCardV2Data["extensions"]) || {
          talkativeness: 0.5,
          fav: false,
          world: "",
          depth_prompt: { depth: 4, prompt: "", role: "system" },
          regex_scripts: [],
        },
    };

    return {
      id: characterId,
      nickname: cardData.name || legacy.name || "",
      avatar,
      data,
      lorebookIds: legacy.lorebookIds || [],
      source: "import",
      createdAt: legacy.createdAt || Date.now(),
      updatedAt: legacy.updatedAt || Date.now(),
    };
  }

  // 舊版簡化格式（備用）- SillyTavern V1 格式
  const data: CharacterCardV2Data = {
    ...createDefaultCharacterData(),
    name: legacy.name || "",
    description: legacy.description || "",
    personality: legacy.personality || "",
    scenario: legacy.scenario || "",
    first_mes: legacy.firstMessage || legacy.first_mes || "",
    mes_example: legacy.exampleDialogue || legacy.mes_example || "",
    system_prompt: legacy.systemPrompt || legacy.system_prompt || "",
    creator_notes:
      legacy.creatorNotes ||
      legacy.creator_notes ||
      legacy.creatorcomment ||
      "",
    tags: legacy.tags || [],
  };

  return {
    id: characterId,
    nickname: legacy.name || "",
    avatar,
    data,
    lorebookIds: legacy.lorebookIds || [],
    source: "import",
    createdAt: legacy.createdAt || Date.now(),
    updatedAt: legacy.updatedAt || Date.now(),
  };
}

/**
 * 轉換舊版世界書條目
 */
function convertWorldInfoEntry(legacy: LegacyWorldInfoEntry): WorldInfoEntry {
  // 處理位置轉換
  let position = WorldInfoPosition.BEFORE_CHAR;
  if (typeof legacy.position === "number") {
    position = legacy.position;
  } else if (typeof legacy.position === "string") {
    const posMap: Record<string, WorldInfoPosition> = {
      before_char: WorldInfoPosition.BEFORE_CHAR,
      after_char: WorldInfoPosition.AFTER_CHAR,
      an_top: WorldInfoPosition.AN_TOP,
      an_bottom: WorldInfoPosition.AN_BOTTOM,
      at_depth: WorldInfoPosition.AT_DEPTH,
    };
    position =
      posMap[legacy.position.toLowerCase()] ?? WorldInfoPosition.BEFORE_CHAR;
  }

  return {
    ...createDefaultWorldInfoEntry(legacy.id),
    uid: legacy.id,
    key: legacy.keys || [],
    keysecondary: legacy.secondaryKeys || [],
    comment: legacy.comment || "",
    content: legacy.content || "",
    constant: legacy.constant || false,
    disable: legacy.enabled === false,
    selective: legacy.selective || false,
    selectiveLogic: legacy.selectiveLogic ?? WorldInfoLogic.AND_ANY,
    order: legacy.order || 100,
    position,
    depth: legacy.depth ?? 4,
    role: legacy.role ?? null,
    probability: legacy.probability ?? 100,
    useProbability: legacy.useProbability ?? true,
    group: legacy.group || "",
    groupWeight: legacy.groupWeight ?? 100,
    scanDepth: legacy.scanDepth ?? null,
    caseSensitive: legacy.caseSensitive ?? null,
    matchWholeWords: legacy.matchWholeWords ?? null,
    excludeRecursion: legacy.excludeRecursion || false,
    preventRecursion: legacy.preventRecursion || false,
  };
}

/**
 * 轉換舊版世界書
 */
function convertLorebook(legacy: LegacyLorebook): Lorebook {
  return {
    id: legacy.id,
    name: legacy.name,
    description: legacy.description,
    entries: legacy.entries.map(convertWorldInfoEntry),
    scanDepth: legacy.scanDepth,
    tokenBudget: legacy.tokenBudget,
    recursiveScanning: legacy.recursiveScanning,
    createdAt: legacy.createdAt || Date.now(),
    updatedAt: legacy.updatedAt || Date.now(),
  };
}

/**
 * 轉換舊版貼文
 */
function convertPost(legacy: LegacyPost): QZonePost {
  const comments: QZoneComment[] = (legacy.comments || []).map((c) => ({
    id: c.id,
    authorId: c.authorId,
    username: c.username,
    avatar: c.avatar,
    content: c.content,
    timestamp: c.timestamp,
    authorType: c.authorType,
    replyToId: c.replyToId,
    replyToUsername: c.replyToUsername,
  }));

  return {
    id: legacy.id,
    authorId: legacy.authorId,
    username: legacy.username,
    avatar: legacy.avatar,
    type: legacy.type as QZonePost["type"],
    content: legacy.content,
    publicText: legacy.publicText,
    hiddenContent: legacy.hiddenContent,
    imageDescription: legacy.imageDescription,
    images: legacy.images,
    timestamp: legacy.timestamp,
    comments,
    likes: legacy.likes || [],
    visibility: (legacy.visibility as QZonePost["visibility"]) || "public",
    qualifier: legacy.qualifier,
    authorType: legacy.authorType,
    liked: legacy.liked,
    likeCount: legacy.likeCount,
    commentCount: legacy.commentCount,
  };
}

/**
 * 轉換舊版貼圖分類
 */
function convertStickerCategory(
  legacy: LegacyStickerCategory,
): StickerCategory {
  return {
    id: legacy.id,
    name: legacy.name,
    icon: legacy.icon || "📁",
    isCustom: true,
    stickers: legacy.stickers.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      keywords: s.keywords,
      isCustom: true,
    })),
  };
}

// ============================================================
// 主要服務類
// ============================================================

export class LegacyBackupService {
  /**
   * 解析備份檔案
   */
  async parseBackupFile(file: File): Promise<LegacyBackupData> {
    const text = await file.text();
    return JSON.parse(text) as LegacyBackupData;
  }

  /**
   * 驗證備份格式
   */
  validateBackup(backup: LegacyBackupData): { valid: boolean; error?: string } {
    if (!backup.version) {
      return { valid: false, error: "無效的備份格式：缺少版本號" };
    }
    if (backup.version !== 1) {
      return { valid: false, error: `不支援的備份版本：${backup.version}` };
    }
    if (!backup.data) {
      return { valid: false, error: "無效的備份格式：缺少資料區塊" };
    }
    return { valid: true };
  }

  /**
   * 恢復備份資料
   */
  async restoreBackup(
    backup: LegacyBackupData,
    options: {
      overwrite?: boolean;
      skipChats?: boolean;
      skipCharacters?: boolean;
      skipLorebooks?: boolean;
      skipPosts?: boolean;
      skipStickers?: boolean;
      skipImportantEvents?: boolean;
      skipUserPersonas?: boolean;
    } = {},
  ): Promise<RestoreResult> {
    const stats = {
      chats: 0,
      characters: 0,
      lorebooks: 0,
      summaries: 0,
      posts: 0,
      stickers: 0,
      importantEvents: 0,
    };
    const warnings: string[] = [];

    try {
      // 確保資料庫已初始化
      await db.init();

      const data = backup.data;

      // 收集所有用戶頭像（用於創建 UserPersona）
      const userAvatars = new Map<string, string>();
      const userNames = new Map<string, string>();
      const userPersonas = new Map<string, string>();

      if (data.chats) {
        for (const chat of data.chats) {
          // 收集用戶頭像
          if (chat.settings.userAvatar) {
            const decompressed = decompressAvatar(chat.settings.userAvatar);
            userAvatars.set(chat.id, decompressed);
          }
          // 收集用戶名稱
          if (chat.settings.userName) {
            userNames.set(chat.id, chat.settings.userName);
          }
          // 收集用戶 Persona
          if (chat.settings.userPersona) {
            userPersonas.set(chat.id, chat.settings.userPersona);
          }
        }
      }

      // 1. 從聊天中提取並創建角色（如果沒有獨立的 characters 數組）
      const createdCharacterIds = new Map<string, string>(); // chatId -> characterId

      if (data.chats?.length && !data.characters?.length) {
        warnings.push("⚠️ 舊版備份沒有獨立的角色數據，將從聊天中提取角色");

        for (const chat of data.chats) {
          // 跳過群組聊天
          if (chat.isGroup) continue;

          // 如果聊天已經有 characterId，跳過
          if (chat.characterId && createdCharacterIds.has(chat.id)) continue;

          try {
            // 從聊天設定中提取角色信息
            const characterName =
              chat.name || chat.originalName || "未命名角色";
            const aiPersona = chat.settings.aiPersona || "";
            const charAvatar = chat.settings.charAvatar
              ? decompressAvatar(chat.settings.charAvatar)
              : chat.avatar
                ? decompressAvatar(chat.avatar)
                : "";

            // 創建角色
            const character: StoredCharacter = {
              id: chat.characterId || `character-legacy-${chat.id}`,
              nickname: characterName,
              avatar: charAvatar,
              data: {
                ...createDefaultCharacterData(),
                name: characterName,
                description: aiPersona.substring(0, 500), // 取前500字作為描述
                first_mes: `你好，我是${characterName}。`,
                system_prompt: aiPersona,
              },
              lorebookIds: chat.settings.linkedWorldBookIds || [],
              source: "import",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };

            console.log(`[LegacyBackup] 從聊天提取角色: ${characterName}`, {
              hasAvatar: !!character.avatar,
              avatarLength: character.avatar?.length || 0,
              avatarType: character.avatar?.startsWith("data:")
                ? "Base64"
                : character.avatar?.startsWith("http")
                  ? "URL"
                  : character.avatar
                    ? "其他"
                    : "無",
            });

            await db.put(DB_STORES.CHARACTERS, character);
            createdCharacterIds.set(chat.id, character.id);
            stats.characters++;
          } catch (e) {
            warnings.push(`從聊天 "${chat.name}" 提取角色失敗: ${e}`);
            console.error(`[LegacyBackup] 提取角色失敗:`, chat, e);
          }
        }
      }

      // 2. 恢復世界書（先恢復，因為角色可能引用）
      if (!options.skipLorebooks && data.lorebooks?.length) {
        for (const legacy of data.lorebooks) {
          try {
            const lorebook = convertLorebook(legacy);
            await db.put(DB_STORES.LOREBOOKS, lorebook);
            stats.lorebooks++;
          } catch (e) {
            warnings.push(`世界書 "${legacy.name}" 恢復失敗: ${e}`);
          }
        }
      }

      // 3. 恢復角色（如果有獨立的 characters 數組）
      if (!options.skipCharacters && data.characters?.length) {
        for (const legacy of data.characters) {
          try {
            const character = convertCharacter(legacy);

            // 調試：記錄頭像信息
            console.log(`[LegacyBackup] 恢復角色: ${character.nickname}`, {
              hasAvatar: !!character.avatar,
              avatarLength: character.avatar?.length || 0,
              avatarType: character.avatar?.startsWith("data:")
                ? "Base64"
                : character.avatar?.startsWith("http")
                  ? "URL"
                  : character.avatar
                    ? "其他"
                    : "無",
              avatarPreview: character.avatar?.substring(0, 100),
            });

            await db.put(DB_STORES.CHARACTERS, character);
            stats.characters++;
          } catch (e) {
            warnings.push(`角色 "${legacy.name}" 恢復失敗: ${e}`);
            console.error(`[LegacyBackup] 角色恢復失敗:`, legacy, e);
          }
        }
      }

      // 4. 恢復用戶 Personas（從聊天設定中提取）
      if (!options.skipUserPersonas && userAvatars.size > 0) {
        try {
          // 獲取現有的 user store 數據
          const existingUserData = await db.get<{
            currentPersonaId: string;
            personas: Array<{
              id: string;
              name: string;
              avatar: string;
              description: string;
              secrets: string;
              powerDynamic: string;
            }>;
          }>("settings", "user-store");

          const personas = existingUserData?.personas || [];

          // 為每個唯一的用戶頭像創建 Persona
          const uniqueAvatars = new Map<string, string>();
          userAvatars.forEach((avatar, chatId) => {
            const name = userNames.get(chatId) || "使用者";
            const description = userPersonas.get(chatId) || "";
            const key = `${name}-${avatar.substring(0, 50)}`;
            if (!uniqueAvatars.has(key)) {
              uniqueAvatars.set(key, avatar);

              // 檢查是否已存在相同的 Persona
              const existing = personas.find(
                (p) => p.name === name && p.avatar === avatar,
              );
              if (!existing) {
                personas.push({
                  id: `persona-legacy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  name,
                  avatar,
                  description,
                  secrets: "",
                  powerDynamic: "",
                });
              }
            }
          });

          // 保存更新後的 user store
          if (personas.length > 0) {
            await db.put(
              "settings",
              {
                currentPersonaId:
                  existingUserData?.currentPersonaId || personas[0].id,
                personas,
              },
              "user-store",
            );
            warnings.push(
              `✅ 已從聊天設定中提取 ${uniqueAvatars.size} 個用戶 Persona`,
            );
          }
        } catch (e) {
          warnings.push(`⚠️ 用戶 Persona 恢復失敗: ${e}`);
        }
      }

      // 5. 恢復聊天和總結
      if (!options.skipChats && data.chats?.length) {
        for (const legacy of data.chats) {
          try {
            // 如果從聊天中創建了角色，更新 characterId
            if (createdCharacterIds.has(legacy.id)) {
              legacy.characterId = createdCharacterIds.get(legacy.id);
            }

            // 提取頭像信息
            const extractedAvatars = {
              userAvatar: userAvatars.get(legacy.id),
              charAvatar: legacy.settings.charAvatar
                ? decompressAvatar(legacy.settings.charAvatar)
                : undefined,
            };

            // 轉換聊天
            const chat = convertChat(legacy, extractedAvatars);
            const messagesToSave = chat.messages || [];
            chat.lastMessagePreview =
              messagesToSave[messagesToSave.length - 1]?.content?.slice(
                0,
                100,
              ) || "";
            chat.messageCount = messagesToSave.length;
            // 圖片分離後存回 chat.messages
            if (messagesToSave.length > 0) {
              chat.messages = await extractImagesFromMessages(messagesToSave);
            }
            await db.put(DB_STORES.CHATS, chat);
            stats.chats++;

            // 提取並保存總結
            const summaries = extractSummaries(legacy);
            for (const summary of summaries) {
              await db.put(DB_STORES.SUMMARIES, summary);
              stats.summaries++;
            }

            // 提取並保存日記
            const diaries = extractDiaries(legacy);
            for (const diary of diaries) {
              await db.put(DB_STORES.DIARIES, diary);
            }
          } catch (e) {
            warnings.push(`聊天 "${legacy.name}" 恢復失敗: ${e}`);
          }
        }
      }

      // 5. 恢復貼文（解壓縮頭像）
      if (!options.skipPosts && data.posts?.length) {
        for (const legacy of data.posts) {
          try {
            const post = convertPost(legacy);
            // 解壓縮作者頭像
            if (post.avatar) {
              post.avatar = decompressAvatar(post.avatar);
            }
            // 解壓縮評論者頭像
            if (post.comments) {
              post.comments = post.comments.map((c) => ({
                ...c,
                avatar: c.avatar ? decompressAvatar(c.avatar) : c.avatar,
              }));
            }
            await db.put(DB_STORES.QZONE_POSTS, post);
            stats.posts++;
          } catch (e) {
            warnings.push(`貼文 ${legacy.id} 恢復失敗: ${e}`);
          }
        }
      }

      // 6. 恢復自訂貼圖
      if (!options.skipStickers && data.customStickers?.length) {
        for (const legacy of data.customStickers) {
          try {
            const category = convertStickerCategory(legacy);
            await db.put(DB_STORES.STICKERS, category);
            stats.stickers++;
          } catch (e) {
            warnings.push(`貼圖分類 "${legacy.name}" 恢復失敗: ${e}`);
          }
        }
      }

      // 7. 恢復重要事件
      if (!options.skipImportantEvents && data.importantEvents) {
        // 判斷是陣列格式（新版備份）還是物件格式（舊版備份）
        if (Array.isArray(data.importantEvents)) {
          // 陣列格式：[{ id, characterId, chatId, events: [...] }]
          for (const entry of data.importantEvents) {
            try {
              const log: ImportantEventsLog = {
                id: entry.chatId || entry.characterId || entry.id,
                characterId: entry.characterId,
                chatId: entry.chatId,
                events: entry.events.map((e) => ({
                  id: e.id,
                  content: e.content,
                  timestamp: e.timestamp,
                  source: (e.source as "user" | "ai" | "system") || "user",
                  category:
                    (e.category as ImportantEventsLog["events"][0]["category"]) ||
                    "custom",
                  priority: (e.priority as 1 | 2 | 3) || 2,
                  tags: e.tags || [],
                })),
                settings: entry.settings
                  ? {
                      enabled: entry.settings.enabled ?? true,
                      autoSave: entry.settings.autoSave ?? true,
                      maxEvents: entry.settings.maxEvents ?? 50,
                    }
                  : { enabled: true, autoSave: true, maxEvents: 50 },
                createdAt: entry.createdAt || Date.now(),
                updatedAt: entry.updatedAt || Date.now(),
              };
              await db.put(DB_STORES.IMPORTANT_EVENTS, log);
              stats.importantEvents += entry.events.length;
            } catch (e) {
              warnings.push(
                `角色 ${entry.characterId} 的重要事件恢復失敗: ${e}`,
              );
            }
          }
        } else {
          // 物件格式：{ [characterId]: LegacyImportantEvent[] }
          for (const [characterId, events] of Object.entries(
            data.importantEvents,
          )) {
            try {
              const log: ImportantEventsLog = {
                id: characterId,
                characterId,
                events: events.map((e) => ({
                  id: e.id,
                  content: e.content,
                  timestamp: e.timestamp,
                  source: (e.source as "user" | "ai" | "system") || "user",
                  category:
                    (e.category as ImportantEventsLog["events"][0]["category"]) ||
                    "custom",
                  priority: (e.priority as 1 | 2 | 3) || 2,
                  tags: e.tags || [],
                })),
                settings: { enabled: true, autoSave: true, maxEvents: 50 },
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              await db.put(DB_STORES.IMPORTANT_EVENTS, log);
              stats.importantEvents += events.length;
            } catch (e) {
              warnings.push(`角色 ${characterId} 的重要事件恢復失敗: ${e}`);
            }
          }
        }
      }

      return {
        success: true,
        stats,
        warnings,
      };
    } catch (e) {
      return {
        success: false,
        error: String(e),
        stats,
        warnings,
      };
    }
  }

  /**
   * 從檔案恢復備份
   */
  async restoreFromFile(
    file: File,
    options?: Parameters<LegacyBackupService["restoreBackup"]>[1],
  ): Promise<RestoreResult> {
    try {
      const backup = await this.parseBackupFile(file);
      const validation = this.validateBackup(backup);

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          stats: {
            chats: 0,
            characters: 0,
            lorebooks: 0,
            summaries: 0,
            posts: 0,
            stickers: 0,
            importantEvents: 0,
          },
          warnings: [],
        };
      }

      return this.restoreBackup(backup, options);
    } catch (e) {
      return {
        success: false,
        error: `解析備份檔案失敗: ${e}`,
        stats: {
          chats: 0,
          characters: 0,
          lorebooks: 0,
          summaries: 0,
          posts: 0,
          stickers: 0,
          importantEvents: 0,
        },
        warnings: [],
      };
    }
  }

  /**
   * 預覽備份內容
   */
  async previewBackup(file: File): Promise<{
    success: boolean;
    error?: string;
    preview?: {
      version: number;
      exportDate: string;
      counts: {
        chats: number;
        characters: number;
        lorebooks: number;
        posts: number;
        stickers: number;
      };
    };
  }> {
    try {
      const backup = await this.parseBackupFile(file);
      const validation = this.validateBackup(backup);

      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      return {
        success: true,
        preview: {
          version: backup.version,
          exportDate: backup.exportDate,
          counts: {
            chats: backup.data.chats?.length || 0,
            characters: backup.data.characters?.length || 0,
            lorebooks: backup.data.lorebooks?.length || 0,
            posts: backup.data.posts?.length || 0,
            stickers: backup.data.customStickers?.length || 0,
          },
        },
      };
    } catch (e) {
      return { success: false, error: `解析備份檔案失敗: ${e}` };
    }
  }
}

// 全局單例
let legacyBackupService: LegacyBackupService | null = null;

export function getLegacyBackupService(): LegacyBackupService {
  if (!legacyBackupService) {
    legacyBackupService = new LegacyBackupService();
  }
  return legacyBackupService;
}
