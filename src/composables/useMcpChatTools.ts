/**
 * 一對一聊天要給角色的工具：內建工具＋這個角色可以用的 MCP 工具。
 * 有可用的 MCP 伺服器時才動態載入 MCP 模組（含 SDK）。
 */
import { isMcpServerAllowedForCharacter } from "@/services/mcp/mcpToolSource";
import { CHAT_TOOLS } from "@/services/toolCalling/chatTools";
import type { ChatToolDefinition } from "@/services/toolCalling/types";
import { useSettingsStore } from "@/stores/settings";
import type { CharacterToolPermissions } from "@/types/character";

export function useMcpChatTools() {
  const settingsStore = useSettingsStore();

  function rememberRoute(serverId: string, route: "direct" | "proxy"): void {
    const server = settingsStore.mcp.servers.find((entry) => entry.id === serverId);
    if (!server || server.lastRoute === route) return;
    server.lastRoute = route;
    settingsStore.saveSettings().catch((error) => console.warn("[MCP] 儲存連線路線失敗", error));
  }

  async function buildChatTools(permissions?: CharacterToolPermissions | null): Promise<ChatToolDefinition[]> {
    const servers = settingsStore.mcp.servers.filter(
      (server) => server.enabled && server.tools.some((tool) => tool.enabled) && isMcpServerAllowedForCharacter(server.id, permissions),
    );
    if (!servers.length) return CHAT_TOOLS;
    try {
      const mcp = await import("@/services/mcp");
      const manager = mcp.getMcpClientManager();
      manager.setRouteListener(rememberRoute);
      const mcpTools = mcp.buildMcpChatTools({
        // 快照：生成期間設定被修改也不影響這一輪
        servers: JSON.parse(JSON.stringify(servers)),
        reservedNames: CHAT_TOOLS.map((tool) => tool.name),
        caller: manager,
        prepareImages: mcp.downscaleToolImages,
      });
      return [...CHAT_TOOLS, ...mcpTools];
    } catch (error) {
      console.warn("[MCP] 載入工具失敗，這次只用內建工具", error);
      return CHAT_TOOLS;
    }
  }

  return { buildChatTools };
}
