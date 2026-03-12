/**
 * 設定類型定義
 * 用於管理應用全局設定
 */

import type { ChatSettings } from "./chat";
import type { WorldInfoSettings } from "./worldinfo";

// ===== API 提供者 =====
export type APIProvider =
  | "openai"
  | "claude"
  | "gemini"
  | "openrouter"
  | "custom";

// ===== API 設定 =====
export interface APISettings {
  /** 當前提供者 */
  provider: APIProvider;
  /** API 端點 */
  endpoint: string;
  /** API 密鑰 */
  apiKey: string;
  /** 模型名稱 */
  model: string;
  /** 自定義請求頭 */
  customHeaders?: Record<string, string>;
  /** 代理設定 */
  proxy?: string;
  /** 直連模式：跳過伺服器代理，從瀏覽器直接請求 API（可能遇到 CORS 問題） */
  directConnect?: boolean;
}

// ===== 頭像樣式 =====
export enum AvatarStyle {
  ROUND = 0,
  RECTANGULAR = 1,
  SQUARE = 2,
  ROUNDED = 3,
}

// ===== 聊天顯示樣式 =====
export enum ChatDisplayStyle {
  DEFAULT = 0,
  BUBBLES = 1,
  DOCUMENT = 2,
}

// ===== 發送按鍵選項 =====
export enum SendOnEnterOption {
  DISABLED = -1,
  AUTO = 0,
  ENABLED = 1,
}

// ===== 用戶角色描述位置 =====
export enum PersonaDescriptionPosition {
  IN_PROMPT = 0,
  /** @deprecated 使用 IN_PROMPT */
  AFTER_CHAR = 1,
  TOP_AN = 2,
  BOTTOM_AN = 3,
  AT_DEPTH = 4,
  NONE = 9,
}

// ===== UI 設定 =====
export interface UISettings {
  /** 頭像樣式 */
  avatarStyle: AvatarStyle;
  /** 聊天顯示樣式 */
  chatDisplayStyle: ChatDisplayStyle;
  /** 聊天寬度百分比 */
  chatWidth: number;
  /** 字體縮放 */
  fontScale: number;
  /** 模糊強度 */
  blurStrength: number;
  /** 陰影寬度 */
  shadowWidth: number;

  // --- 顏色設定 ---
  /** 主文字顏色 */
  mainTextColor: string;
  /** 斜體文字顏色 */
  italicsTextColor: string;
  /** 引用文字顏色 */
  quoteTextColor: string;
  /** 模糊染色 */
  blurTintColor: string;
  /** 聊天染色 */
  chatTintColor: string;
  /** 用戶消息染色 */
  userMesBlurTintColor: string;
  /** AI 消息染色 */
  botMesBlurTintColor: string;

  // --- 行為設定 ---
  /** Enter 發送 */
  sendOnEnter: SendOnEnterOption;
  /** 自動滾動到底部 */
  autoScrollToBottom: boolean;
  /** 自動修復 Markdown */
  autoFixMarkdown: boolean;
  /** 顯示時間戳 */
  timestampsEnabled: boolean;
  /** 顯示計時器 */
  timerEnabled: boolean;
  /** 確認刪除消息 */
  confirmMessageDelete: boolean;
}

// ===== 進階設定 =====
export interface AdvancedSettings {
  /** Token 填充 */
  tokenPadding: number;
  /** 摺疊換行 */
  collapseNewlines: boolean;
  /** 固定示例 */
  pinExamples: boolean;
  /** 移除示例 */
  stripExamples: boolean;
  /** 修剪句子 */
  trimSentences: boolean;
  /** 強制使用角色名 */
  alwaysForceName2: boolean;
  /** 用戶提示偏置 */
  userPromptBias: string;
  /** 顯示用戶提示偏置 */
  showUserPromptBias: boolean;
  /** 聊天截斷百分比 */
  chatTruncation: number;
  /** 流式 FPS */
  streamingFps: number;
  /** 平滑流式 */
  smoothStreaming: boolean;
  /** 快速 UI 模式 */
  fastUIMode: boolean;
}

// ===== 語音訊息設定 =====
export interface AudioSettings {
  /** 錄音品質：low=32kbps, medium=64kbps, high=128kbps */
  quality: "low" | "medium" | "high";
  /** 最大錄音時長（秒） */
  maxDuration: 30 | 60 | 120 | 300;
  /** 是否啟用 STT */
  sttEnabled: boolean;
  /** 音頻傳輸格式 */
  transmissionFormat: "image_url" | "input_audio";
}

// ===== 自動繼續設定 =====
export interface AutoContinueSettings {
  /** 是否啟用 */
  enabled: boolean;
  /** 允許聊天完成 */
  allowChatCompletions: boolean;
  /** 目標長度 */
  targetLength: number;
}

// ===== 用戶角色 =====
export interface UserPersona {
  /** 唯一識別碼 */
  id: string;
  /** 名稱 */
  name: string;
  /** 頭像 */
  avatar: string;
  /** 描述 */
  description: string;
  /** 描述位置 */
  descriptionPosition: PersonaDescriptionPosition;
  /** 描述深度 */
  descriptionDepth: number;
  /** 描述角色 */
  descriptionRole: number;
}

// ===== 完整應用設定 =====
export interface AppSettings {
  /** API 設定 */
  api: APISettings;
  /** 聊天設定 */
  chat: ChatSettings;
  /** 世界資訊設定 */
  worldInfo: WorldInfoSettings;
  /** UI 設定 */
  ui: UISettings;
  /** 進階設定 */
  advanced: AdvancedSettings;
  /** 自動繼續設定 */
  autoContinue: AutoContinueSettings;
  /** 語音訊息設定 */
  audio: AudioSettings;
  /** 當前用戶角色 ID */
  currentPersonaId: string | null;
  /** 用戶角色列表 */
  personas: UserPersona[];

  // --- 版本與元數據 ---
  /** 設定版本 */
  version: number;
  /** 最後更新時間 */
  updatedAt: number;
}

// ===== 當前設定版本 =====
export const SETTINGS_VERSION = 1;

// ===== 創建默認 API 設定 =====
export const createDefaultAPISettings = (): APISettings => ({
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o-mini",
});

// ===== 創建默認 UI 設定 =====
export const createDefaultUISettings = (): UISettings => ({
  avatarStyle: AvatarStyle.ROUND,
  chatDisplayStyle: ChatDisplayStyle.BUBBLES,
  chatWidth: 50,
  fontScale: 1,
  blurStrength: 10,
  shadowWidth: 2,
  mainTextColor: "#e0e0e0",
  italicsTextColor: "#a0a0a0",
  quoteTextColor: "#7eb8da",
  blurTintColor: "rgba(0, 0, 0, 0.4)",
  chatTintColor: "rgba(0, 0, 0, 0.2)",
  userMesBlurTintColor: "rgba(0, 100, 200, 0.2)",
  botMesBlurTintColor: "rgba(100, 0, 200, 0.2)",
  sendOnEnter: SendOnEnterOption.AUTO,
  autoScrollToBottom: true,
  autoFixMarkdown: true,
  timestampsEnabled: true,
  timerEnabled: true,
  confirmMessageDelete: true,
});

// ===== 創建默認進階設定 =====
export const createDefaultAdvancedSettings = (): AdvancedSettings => ({
  tokenPadding: 64,
  collapseNewlines: false,
  pinExamples: false,
  stripExamples: false,
  trimSentences: false,
  alwaysForceName2: false,
  userPromptBias: "",
  showUserPromptBias: true,
  chatTruncation: 100,
  streamingFps: 30,
  smoothStreaming: false,
  fastUIMode: true,
});

// ===== 創建默認自動繼續設定 =====
export const createDefaultAutoContinueSettings = (): AutoContinueSettings => ({
  enabled: false,
  allowChatCompletions: false,
  targetLength: 400,
});

// ===== 創建默認語音訊息設定 =====
export const createDefaultAudioSettings = (): AudioSettings => ({
  quality: "medium",
  maxDuration: 120,
  sttEnabled: false,
  transmissionFormat: "image_url",
});

// ===== 創建默認用戶角色 =====
export const createDefaultUserPersona = (): UserPersona => ({
  id: crypto.randomUUID(),
  name: "User",
  avatar: "",
  description: "",
  descriptionPosition: PersonaDescriptionPosition.IN_PROMPT,
  descriptionDepth: 4,
  descriptionRole: 0,
});
