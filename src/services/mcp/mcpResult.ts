/**
 * MCP tools/call 的結果 → 交給模型的文字＋圖片
 */
import type { ToolImage } from "@/services/toolCalling/types";

/** 每次工具呼叫最多交給模型的圖片數 */
export const MAX_TOOL_IMAGES = 3;

export interface McpToolOutput {
  text: string;
  images: ToolImage[];
  isError: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function convertCallToolResult(result: unknown): McpToolOutput {
  const value = isRecord(result) ? result : {};
  const parts: string[] = [];
  const images: ToolImage[] = [];
  let skippedImages = 0;
  for (const block of Array.isArray(value.content) ? value.content : []) {
    if (!isRecord(block)) continue;
    switch (block.type) {
      case "text":
        if (typeof block.text === "string" && block.text) parts.push(block.text);
        break;
      case "image":
        if (typeof block.data === "string" && typeof block.mimeType === "string") {
          if (images.length < MAX_TOOL_IMAGES) images.push({ mimeType: block.mimeType, data: block.data });
          else skippedImages += 1;
        }
        break;
      case "resource": {
        const resource = isRecord(block.resource) ? block.resource : {};
        parts.push(typeof resource.text === "string" ? resource.text : `[檔案] ${String(resource.uri ?? "")}`.trim());
        break;
      }
      case "resource_link":
        parts.push(`[連結] ${String(block.uri ?? "")}`.trim());
        break;
      case "audio":
        parts.push("[音訊內容，目前不支援]");
        break;
      default:
        parts.push(`[不支援的內容類型：${String(block.type)}]`);
    }
  }
  if (skippedImages) parts.push(`（另有 ${skippedImages} 張圖片未附上）`);
  if (!parts.length && value.structuredContent !== undefined) parts.push(JSON.stringify(value.structuredContent));
  if (!parts.length && value.toolResult !== undefined) {
    parts.push(typeof value.toolResult === "string" ? value.toolResult : JSON.stringify(value.toolResult));
  }
  return { text: parts.join("\n"), images, isError: value.isError === true };
}
