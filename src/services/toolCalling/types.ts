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

export interface ChatToolDefinition {
  name: string;
  description: string;
  category: ChatToolCategory;
  risk: "low" | "high";
  parameters: JsonSchema;
  enabled?: boolean;
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
}

export interface PendingToolConfirmation {
  id: string;
  chatId?: string;
  toolCall: ToolCall;
  tool: ChatToolDefinition;
  createdAt: number;
}
