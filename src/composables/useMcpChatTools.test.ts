import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { McpServerConfig } from "@/types/mcp";

vi.mock("@/storage/settingsStorage", () => ({ SETTINGS_ID: "main-settings", loadSettingsData: vi.fn(), saveSettingsData: vi.fn() }));
const mocks = vi.hoisted(() => ({ buildMcpChatTools: vi.fn(), setRouteListener: vi.fn() }));
vi.mock("@/services/mcp", () => ({
  getMcpClientManager: () => ({ setRouteListener: mocks.setRouteListener }),
  buildMcpChatTools: mocks.buildMcpChatTools,
  downscaleToolImages: vi.fn(),
}));

import { CHAT_TOOLS } from "@/services/toolCalling/chatTools";
import { useSettingsStore } from "@/stores/settings";
import { useMcpChatTools } from "./useMcpChatTools";

const server = (id: string): McpServerConfig => ({
  id, name: id, description: "", url: `https://${id}.example.com/mcp`, enabled: true, headers: [],
  tools: [{ name: "t", description: "", inputSchema: {}, enabled: true, requireConfirm: false }], createdAt: 0, updatedAt: 0,
});

describe("useMcpChatTools", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.buildMcpChatTools.mockReset();
    mocks.setRouteListener.mockReset();
  });

  it("uses only built-in tools when no MCP server is usable", async () => {
    expect(await useMcpChatTools().buildChatTools(null)).toBe(CHAT_TOOLS);
    expect(mocks.buildMcpChatTools).not.toHaveBeenCalled();
  });

  it("adds MCP tools for the servers this character may use", async () => {
    useSettingsStore().mcp.servers = [server("s1"), server("s2")];
    mocks.buildMcpChatTools.mockReturnValue([{ name: "lock_phone" }]);
    const tools = await useMcpChatTools().buildChatTools({ enabled: true, categories: { "mcp:s2": false }, tools: {} });
    expect(tools.map((tool) => tool.name)).toEqual([...CHAT_TOOLS.map((tool) => tool.name), "lock_phone"]);
    const options = mocks.buildMcpChatTools.mock.calls[0][0];
    expect(options.servers.map((entry: { id: string }) => entry.id)).toEqual(["s1"]);
    expect(options.reservedNames).toEqual(CHAT_TOOLS.map((tool) => tool.name));
  });

  it("remembers the route that worked", async () => {
    const store = useSettingsStore();
    store.mcp.servers = [server("s1")];
    mocks.buildMcpChatTools.mockReturnValue([]);
    await useMcpChatTools().buildChatTools(null);
    const listener = mocks.setRouteListener.mock.calls[0][0] as (serverId: string, route: "direct" | "proxy") => void;
    listener("s1", "proxy");
    expect(store.mcp.servers[0].lastRoute).toBe("proxy");
  });

  it("falls back to built-in tools when MCP tools cannot be built", async () => {
    useSettingsStore().mcp.servers = [server("s1")];
    mocks.buildMcpChatTools.mockImplementation(() => { throw new Error("boom"); });
    expect(await useMcpChatTools().buildChatTools(null)).toBe(CHAT_TOOLS);
  });
});
