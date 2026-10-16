import type { McpServerExposure } from "@/services/mcp/mcpToolSource";
import type { McpServerConfig } from "@/types/mcp";

/** 伺服器卡片上的一行狀態 */
export function describeMcpServerStatus(server: McpServerConfig, exposure?: McpServerExposure): string {
  if (server.lastError) return `連線失敗：${server.lastError}`;
  if (!server.toolsFetchedAt) return "尚未讀取工具";
  const head = `已連線 · ${server.tools.length} 個工具`;
  if (!server.enabled) return `${head} · 已停用`;
  if (!server.tools.some((tool) => tool.enabled)) return `${head} · 工具都關掉了`;
  if (!exposure) return head;
  if (exposure.mode === "direct") return `${head} · 直接提供，約 ${exposure.tokens} token／輪`;
  return `${head} · ${exposure.reason === "too_many_tools" ? "工具較多" : "直接提供的額度已滿"}，改為按需載入`;
}
