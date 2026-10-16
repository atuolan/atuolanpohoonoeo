import type { JsonSchema } from "./jsonSchema";

export type ChatToolCategory =
  | "time"
  | "weather"
  | "calendar"
  | "music"
  | "media"
  | "memory"
  | "phone"
  | "system"
  | (string & {});

export interface ChatToolContext {
  characterId?: string;
  chatId?: string;
  signal?: AbortSignal;
  [key: string]: unknown;
}

/** 工具回傳的圖片（base64，不含 data: 前綴） */
export interface ToolImage {
  mimeType: string;
  data: string;
}

/** execute() 可以回傳的結構化結果 */
export interface ToolExecutionValue {
  summary: string;
  data?: unknown;
  /** 要交給模型看的圖片 */
  images?: ToolImage[];
  /** 本次生成剩下的輪次要額外註冊的工具（MCP 按需載入用） */
  loadTools?: ChatToolDefinition[];
}

export interface ChatToolDefinition {
  name: string;
  /** 介面上顯示的名稱，例如「查天氣」或「鎖手機 · lock_phone」 */
  displayName?: string;
  description: string;
  category: ChatToolCategory;
  risk: "low" | "high";
  parameters: JsonSchema;
  enabled?: boolean;
  /** 這個工具自己的逾時（毫秒）；沒設定時用引擎預設的 15 秒 */
  timeoutMs?: number;
  execute: (args: Record<string, unknown>, context: ChatToolContext) => unknown | Promise<unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  content: string;
  ok: boolean;
  error?: string;
  /** 工具回傳的圖片；引擎會另外加一則 user 訊息交給模型 */
  images?: ToolImage[];
  /** 使用者在確認視窗按了拒絕 */
  rejected?: boolean;
}

export interface PendingToolConfirmation {
  id: string;
  chatId?: string;
  toolCall: ToolCall;
  tool: ChatToolDefinition;
  createdAt: number;
}
