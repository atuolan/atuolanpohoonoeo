/**
 * MCP 對外入口：一律用 `await import("@/services/mcp")` 載入，
 * 讓 SDK 留在獨立分包，沒設定 MCP 的人不會下載。
 */
export { getMcpClientManager, McpClientManager, McpConnectionError, classifyMcpError } from "./mcpClientManager";
export type { McpDiscoveryResult, McpServerInfo } from "./mcpClientManager";
export { buildMcpChatTools } from "./mcpToolSource";
export { downscaleToolImages } from "./mcpImages";
