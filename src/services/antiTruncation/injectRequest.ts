/**
 * 防截斷：在請求裡加控制提示與假工具
 */
import type { APIMessage } from "@/api/OpenAICompatible";
import { buildControlPrompt, buildToolDefinition, getSessionToolName, type NativeToolDefinition } from "./toolSpec";

export const CONTROL_PROMPT_IDENTIFIER = "antiTruncationControl";

export interface AntiTruncationInjection {
  messages: APIMessage[];
  tool: NativeToolDefinition;
  toolName: string;
  clientToolNames: Set<string>;
}

/**
 * 控制提示插在結尾的連續 assistant（預填）之前；沒有預填就插在最後一條之前。
 * 不接在最後面，原本處理「最後一條訊息」的邏輯（Gemini／Claude 角色轉換、
 * 最後提示詞角色覆蓋）才會照舊作用在原本那條。
 */
export function findControlInsertIndex(messages: APIMessage[]): number {
  let index = messages.length;
  while (index > 0 && messages[index - 1].role === "assistant") index -= 1;
  if (index < messages.length) return index;
  return Math.max(0, messages.length - 1);
}

export function injectAntiTruncation(messages: APIMessage[], clientToolNames: Iterable<string>): AntiTruncationInjection {
  const clientNames = new Set(clientToolNames);
  const toolName = getSessionToolName(clientNames);
  const insertAt = findControlInsertIndex(messages);
  const control: APIMessage = {
    role: "system",
    content: buildControlPrompt(toolName),
    identifier: CONTROL_PROMPT_IDENTIFIER,
  };
  return {
    messages: [...messages.slice(0, insertAt), control, ...messages.slice(insertAt)],
    tool: buildToolDefinition(toolName),
    toolName,
    clientToolNames: clientNames,
  };
}
