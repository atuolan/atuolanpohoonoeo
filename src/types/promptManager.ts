/**
 * 提示詞管理器類型定義
 * 參考 SillyTavern PromptManager.js 規格
 *
 * 支援功能：
 * - 提示詞順序自定義（拖拽排序）
 * - 提示詞啟用/禁用
 * - 角色獨立配置（可覆蓋全局）
 * - 自定義提示詞
 * - Marker 系統
 * - 導演系統（基拉祈 + 雪拉比）
 */

// ===== 提示詞分類 =====
/**
 * 提示詞分類
 * - system: 系統核心（main, chatHistory 等）
 * - director: 導演系統（基拉祈、雪拉比）
 * - context: 上下文信息（時間、天氣、世界書等）
 * - character: 角色設定（用戶、角色信息）
 * - rules: 規則約束（禁詞、原則等）
 * - custom: 用戶自定義
 */
export type PromptCategory =
  | "system"
  | "director"
  | "context"
  | "character"
  | "rules"
  | "custom";

// ===== 分類信息 =====
export const CATEGORY_INFO: Record<
  PromptCategory,
  { name: string; icon: string; color: string; description: string }
> = {
  system: {
    name: "系統核心",
    icon: "mdi:cog",
    color: "#6b7280",
    description: "系統必要的核心提示詞",
  },
  director: {
    name: "導演系統",
    icon: "mdi:movie-open",
    color: "#8b5cf6",
    description: "基拉祈和雪拉比的導演配置",
  },
  context: {
    name: "上下文信息",
    icon: "mdi:information",
    color: "#3b82f6",
    description: "時間、歷史、世界觀等上下文",
  },
  character: {
    name: "角色設定",
    icon: "mdi:account",
    color: "#ec4899",
    description: "角色和用戶的人設信息",
  },
  rules: {
    name: "規則約束",
    icon: "mdi:shield-check",
    color: "#22c55e",
    description: "禁詞、原則等約束規則",
  },
  custom: {
    name: "自定義",
    icon: "mdi:pencil",
    color: "#f59e0b",
    description: "用戶自定義的提示詞",
  },
};

// ===== 提示詞標識符 =====
/**
 * 系統內建的提示詞標識符
 * 對應 SillyTavern 的 marker 和 system_prompt
 */
export type SystemPromptIdentifier =
  // 主要提示詞
  | "main" // 主提示詞
  | "nsfw" // NSFW 提示詞
  | "jailbreak" // 越獄/後置指令
  | "enhanceDefinitions" // 增強定義
  // 角色相關 Marker
  | "charDescription" // 角色描述
  | "charPersonality" // 角色性格
  | "scenario" // 場景
  | "personaDescription" // 用戶人設
  | "userSecrets" // 用戶秘密
  | "powerDynamic" // 權力關係
  // 世界書 Marker
  | "worldInfoBefore" // 世界書 ↑Char
  | "worldInfoAfter" // 世界書 ↓Char
  // 對話相關 Marker
  | "dialogueExamples" // 對話示例
  | "chatHistory" // 聊天歷史
  // 作者筆記
  | "authorsNote" // 作者筆記
  // 導演系統
  | "directorIdentity" // 導演系統身份
  | "narrativeMission" // 故事使命
  | "sacredCreation" // 神聖創造
  | "ambiguityVsLove" // 曖昧與緊張
  | "directorDetails" // 導演詳細配置
  | "mandatoryFormat" // 強制輸出格式
  // 規則約束
  | "coreRules" // 核心規則
  | "healthyEmotion" // 健康情緒指引
  // 上下文信息
  | "languageMode" // 語言模式
  | "timeInfo" // 時間信息
  | "weatherInfo" // 天氣資訊
  | "characterWorldContext" // 角色世界設定情境
  | "f2fCharacterWorldContext" // 面對面模式角色世界設定情境
  | "gcCharacterWorldContext" // 群聊模式角色世界設定情境
  | "importantEvents" // 重要事件
  | "summaries" // 對話總結
  | "stickerSystem" // 表情包系統
  | "stickerGuidance"; // 表情包指導
// ===== 注入位置類型 =====
export enum PromptInjectionPosition {
  /** 相對位置（按順序插入） */
  RELATIVE = 0,
  /** 絕對位置（在聊天歷史中按深度插入） */
  ABSOLUTE = 1,
}

// ===== 提示詞角色 =====
export type PromptRoleType = "system" | "user" | "assistant";

// ===== 提示詞順序項 =====
export interface PromptOrderEntry {
  /** 提示詞標識符 */
  identifier: string;
  /** 是否啟用 */
  enabled: boolean;
}

// ===== 提示詞定義 =====
export interface PromptDefinition {
  /** 唯一標識符 */
  identifier: string;
  /** 顯示名稱 */
  name: string;
  /** 描述 */
  description?: string;
  /** 分類 */
  category: PromptCategory;
  /** 角色（system/user/assistant） */
  role: PromptRoleType;
  /** 內容 */
  content: string;
  /** 是否為系統內建提示詞 */
  system_prompt: boolean;
  /** 是否為 Marker（佔位符，內容由系統填充） */
  marker: boolean;
  /** 注入位置類型 */
  injection_position: PromptInjectionPosition;
  /** 注入深度（僅 ABSOLUTE 位置有效） */
  injection_depth: number;
  /** 注入順序（同深度時的排序） */
  injection_order: number;
  /** 禁止覆蓋（保護此提示詞不被角色卡覆蓋） */
  forbid_overrides: boolean;
  /** 由擴展添加 */
  extension: boolean;
  /** 觸發類型（如 'normal', 'continue', 'impersonate'） */
  injection_trigger: string[];
  /** 是否可編輯內容 */
  isEditable: boolean;
  /** 是否可刪除 */
  isDeletable: boolean;
  /** 依賴的其他模塊 ID */
  dependencies?: string[];
  /** 是否僅管理員可見/可編輯 */
  adminOnly?: boolean;
}

// ===== 角色提示詞配置 =====
export interface CharacterPromptConfig {
  /** 角色 ID */
  characterId: string;
  /** 提示詞順序（如果為空則使用全局） */
  promptOrder: PromptOrderEntry[];
  /** 自定義提示詞內容覆蓋 */
  promptOverrides: Record<string, string>;
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
}

// ===== 全局提示詞管理配置 =====
export interface PromptManagerConfig {
  /** 版本號 */
  version: number;
  /** 所有提示詞定義 */
  prompts: PromptDefinition[];
  /** 全局默認順序 */
  globalPromptOrder: PromptOrderEntry[];
  /** 角色獨立配置 */
  characterConfigs: Record<string, CharacterPromptConfig>;
  /** 日記提示詞定義 */
  diaryPrompts?: PromptDefinition[];
  /** 日記提示詞順序 */
  diaryPromptOrder?: PromptOrderEntry[];
  /** 總結提示詞定義 */
  summaryPrompts?: PromptDefinition[];
  /** 總結提示詞順序 */
  summaryPromptOrder?: PromptOrderEntry[];
  /** 重要事件提示詞定義 */
  eventsPrompts?: PromptDefinition[];
  /** 重要事件提示詞順序 */
  eventsPromptOrder?: PromptOrderEntry[];
  /** 噗浪發文提示詞定義 */
  plurkPostPrompts?: PromptDefinition[];
  /** 噗浪發文提示詞順序 */
  plurkPostPromptOrder?: PromptOrderEntry[];
  /** 噗浪評論提示詞定義 */
  plurkCommentPrompts?: PromptDefinition[];
  /** 噗浪評論提示詞順序 */
  plurkCommentPromptOrder?: PromptOrderEntry[];
  /** 批量評論提示詞定義 */
  batchCommentsPrompts?: PromptDefinition[];
  /** 批量評論提示詞順序 */
  batchCommentsPromptOrder?: PromptOrderEntry[];
  /** 面對面模式提示詞定義 */
  faceToFacePrompts?: PromptDefinition[];
  /** 面對面模式提示詞順序 */
  faceToFacePromptOrder?: PromptOrderEntry[];
  /** 群聊模式提示詞定義 */
  groupChatPrompts?: PromptDefinition[];
  /** 群聊模式提示詞順序 */
  groupChatPromptOrder?: PromptOrderEntry[];
  /** 用戶主動刪除的默認提示詞 ID（全局模式） */
  deletedDefaultPromptIds?: string[];
  /** 用戶主動刪除的面對面模式默認提示詞 ID */
  deletedFaceToFacePromptIds?: string[];
  /** 用戶主動刪除的群聊模式默認提示詞 ID */
  deletedGroupChatPromptIds?: string[];
  /** 用戶主動刪除的日記模式默認提示詞 ID */
  deletedDiaryPromptIds?: string[];
  /** 用戶主動刪除的總結模式默認提示詞 ID */
  deletedSummaryPromptIds?: string[];
  /** 用戶主動刪除的重要事件模式默認提示詞 ID */
  deletedEventsPromptIds?: string[];
  /** 用戶主動刪除的噗浪發文模式默認提示詞 ID */
  deletedPlurkPostPromptIds?: string[];
  /** 用戶主動刪除的噗浪評論模式默認提示詞 ID */
  deletedPlurkCommentPromptIds?: string[];
}

// ===== 默認提示詞定義 =====
// 注意：完整的默認提示詞定義已移至 @/data/defaultPrompts.ts
// 這裡僅保留導入和重新導出
import {
  BATCH_COMMENTS_PROMPT_DEFINITIONS as IMPORTED_BATCH_COMMENTS_DEFINITIONS,
  DEFAULT_BATCH_COMMENTS_PROMPT_ORDER as IMPORTED_BATCH_COMMENTS_ORDER,
  DEFAULT_PROMPT_DEFINITIONS as IMPORTED_DEFINITIONS,
  DIARY_PROMPT_DEFINITIONS as IMPORTED_DIARY_DEFINITIONS,
  DEFAULT_DIARY_PROMPT_ORDER as IMPORTED_DIARY_ORDER,
  IMPORTANT_EVENTS_PROMPT_DEFINITIONS as IMPORTED_EVENTS_DEFINITIONS,
  DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER as IMPORTED_EVENTS_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS as IMPORTED_FACE_TO_FACE_DEFINITIONS,
  DEFAULT_FACE_TO_FACE_PROMPT_ORDER as IMPORTED_FACE_TO_FACE_ORDER,
  GROUP_CHAT_PROMPT_DEFINITIONS as IMPORTED_GROUP_CHAT_DEFINITIONS,
  DEFAULT_GROUP_CHAT_PROMPT_ORDER as IMPORTED_GROUP_CHAT_ORDER,
  DEFAULT_PROMPT_ORDER as IMPORTED_ORDER,
  PHONE_CALL_PROMPT_DEFINITIONS as IMPORTED_PHONE_CALL_DEFINITIONS,
  DEFAULT_PHONE_CALL_PROMPT_ORDER as IMPORTED_PHONE_CALL_ORDER,
  PLURK_COMMENT_PROMPT_DEFINITIONS as IMPORTED_PLURK_COMMENT_DEFINITIONS,
  DEFAULT_PLURK_COMMENT_PROMPT_ORDER as IMPORTED_PLURK_COMMENT_ORDER,
  PLURK_POST_PROMPT_DEFINITIONS as IMPORTED_PLURK_POST_DEFINITIONS,
  DEFAULT_PLURK_POST_PROMPT_ORDER as IMPORTED_PLURK_POST_ORDER,
  SUMMARY_PROMPT_DEFINITIONS as IMPORTED_SUMMARY_DEFINITIONS,
  DEFAULT_SUMMARY_PROMPT_ORDER as IMPORTED_SUMMARY_ORDER,
} from "@/data/defaultPrompts";

export const DEFAULT_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_DEFINITIONS;
export const DIARY_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_DIARY_DEFINITIONS;
export const SUMMARY_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_SUMMARY_DEFINITIONS;
export const IMPORTANT_EVENTS_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_EVENTS_DEFINITIONS;
export const PLURK_POST_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_PLURK_POST_DEFINITIONS;
export const PLURK_COMMENT_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_PLURK_COMMENT_DEFINITIONS;

// ===== 默認提示詞順序 =====
export const DEFAULT_PROMPT_ORDER: PromptOrderEntry[] = IMPORTED_ORDER;
export const DEFAULT_DIARY_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_DIARY_ORDER;
export const DEFAULT_SUMMARY_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_SUMMARY_ORDER;
export const DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_EVENTS_ORDER;
export const DEFAULT_PLURK_POST_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_PLURK_POST_ORDER;
export const DEFAULT_PLURK_COMMENT_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_PLURK_COMMENT_ORDER;
export const PHONE_CALL_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_PHONE_CALL_DEFINITIONS;
export const DEFAULT_PHONE_CALL_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_PHONE_CALL_ORDER;
export const BATCH_COMMENTS_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_BATCH_COMMENTS_DEFINITIONS;
export const DEFAULT_BATCH_COMMENTS_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_BATCH_COMMENTS_ORDER;
export const FACE_TO_FACE_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_FACE_TO_FACE_DEFINITIONS;
export const DEFAULT_FACE_TO_FACE_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_FACE_TO_FACE_ORDER;
export const GROUP_CHAT_PROMPT_DEFINITIONS: PromptDefinition[] =
  IMPORTED_GROUP_CHAT_DEFINITIONS;
export const DEFAULT_GROUP_CHAT_PROMPT_ORDER: PromptOrderEntry[] =
  IMPORTED_GROUP_CHAT_ORDER;

// ===== 創建默認配置 =====
export function createDefaultPromptManagerConfig(): PromptManagerConfig {
  return {
    version: 1,
    prompts: structuredClone(DEFAULT_PROMPT_DEFINITIONS),
    globalPromptOrder: structuredClone(DEFAULT_PROMPT_ORDER),
    characterConfigs: {},
    diaryPrompts: structuredClone(DIARY_PROMPT_DEFINITIONS),
    diaryPromptOrder: structuredClone(DEFAULT_DIARY_PROMPT_ORDER),
    summaryPrompts: structuredClone(SUMMARY_PROMPT_DEFINITIONS),
    summaryPromptOrder: structuredClone(DEFAULT_SUMMARY_PROMPT_ORDER),
    eventsPrompts: structuredClone(IMPORTANT_EVENTS_PROMPT_DEFINITIONS),
    eventsPromptOrder: structuredClone(DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER),
    plurkPostPrompts: structuredClone(PLURK_POST_PROMPT_DEFINITIONS),
    plurkPostPromptOrder: structuredClone(DEFAULT_PLURK_POST_PROMPT_ORDER),
    plurkCommentPrompts: structuredClone(PLURK_COMMENT_PROMPT_DEFINITIONS),
    plurkCommentPromptOrder: structuredClone(
      DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
    ),
    batchCommentsPrompts: structuredClone(BATCH_COMMENTS_PROMPT_DEFINITIONS),
    batchCommentsPromptOrder: structuredClone(
      DEFAULT_BATCH_COMMENTS_PROMPT_ORDER,
    ),
    faceToFacePrompts: structuredClone(FACE_TO_FACE_PROMPT_DEFINITIONS),
    faceToFacePromptOrder: structuredClone(DEFAULT_FACE_TO_FACE_PROMPT_ORDER),
    groupChatPrompts: structuredClone(GROUP_CHAT_PROMPT_DEFINITIONS),
    groupChatPromptOrder: structuredClone(DEFAULT_GROUP_CHAT_PROMPT_ORDER),
    deletedDefaultPromptIds: [],
    deletedFaceToFacePromptIds: [],
    deletedGroupChatPromptIds: [],
    deletedDiaryPromptIds: [],
    deletedSummaryPromptIds: [],
    deletedEventsPromptIds: [],
    deletedPlurkPostPromptIds: [],
    deletedPlurkCommentPromptIds: [],
  };
}

// ===== 創建角色配置（從全局複製） =====
export function createCharacterPromptConfig(
  characterId: string,
  globalOrder: PromptOrderEntry[],
): CharacterPromptConfig {
  // 使用 JSON 方法來深拷貝，避免 Vue reactive 物件無法被 structuredClone 的問題
  return {
    characterId,
    promptOrder: JSON.parse(JSON.stringify(globalOrder)),
    promptOverrides: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ===== 獲取有效的提示詞順序（角色 > 全局） =====
export function getEffectivePromptOrder(
  config: PromptManagerConfig,
  characterId?: string,
): PromptOrderEntry[] {
  if (characterId && config.characterConfigs[characterId]) {
    const charConfig = config.characterConfigs[characterId];
    if (charConfig.promptOrder.length > 0) {
      return charConfig.promptOrder;
    }
  }
  return config.globalPromptOrder;
}

// ===== 獲取提示詞定義 =====
export function getPromptDefinition(
  config: PromptManagerConfig,
  identifier: string,
): PromptDefinition | undefined {
  return config.prompts.find((p) => p.identifier === identifier);
}

// ===== 檢查是否為 Marker =====
export function isMarkerPrompt(prompt: PromptDefinition): boolean {
  return prompt.marker;
}

// ===== 檢查是否可編輯 =====
export function isPromptEditable(prompt: PromptDefinition): boolean {
  // Marker 不可編輯內容（由系統填充）
  // 但可以編輯注入位置等屬性
  return !prompt.marker;
}

// ===== 檢查是否可刪除 =====
export function isPromptDeletable(prompt: PromptDefinition): boolean {
  // chatHistory 是系統必要佔位符，不可刪除
  const undeletableIdentifiers = ["chatHistory"];
  return !undeletableIdentifiers.includes(prompt.identifier);
}

// ===== 檢查是否可切換 =====
export function isPromptToggleable(prompt: PromptDefinition): boolean {
  // 某些核心 Marker 不可禁用
  const requiredPrompts = ["chatHistory"];
  return !requiredPrompts.includes(prompt.identifier);
}
