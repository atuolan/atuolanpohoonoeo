import { describe, expect, it } from "vitest";
import { createMcpServerConfig, defaultServerName, mergeDiscoveredTools, normalizeMcpSettings, type McpToolEntry } from "./mcp";

describe("mcp settings", () => {
  it("treats missing data as an empty server list", () => {
    expect(normalizeMcpSettings(undefined)).toEqual({ servers: [] });
    expect(normalizeMcpSettings({ servers: "x" })).toEqual({ servers: [] });
  });

  it("drops invalid servers and tools and fills defaults", () => {
    const result = normalizeMcpSettings({
      servers: [
        { id: "s1", url: " https://lock.example.com/mcp ", tools: [{ name: "lock_phone" }, { description: "no name" }], headers: [{ key: "X-Api-Key", value: "k" }, { key: 1 }], lastRoute: "proxy" },
        { url: "" },
        "junk",
      ],
    }, 5);
    expect(result.servers).toEqual([{
      id: "s1", name: "lock.example.com", description: "", url: "https://lock.example.com/mcp", enabled: true,
      headers: [{ key: "X-Api-Key", value: "k" }],
      tools: [{ name: "lock_phone", description: "", inputSchema: { type: "object", properties: {} }, enabled: true, requireConfirm: false }],
      lastRoute: "proxy", createdAt: 5, updatedAt: 5,
    }]);
  });

  it("creates a server config named after the host", () => {
    const server = createMcpServerConfig("https://game.example.com/mcp", 7);
    expect(server).toMatchObject({ name: "game.example.com", url: "https://game.example.com/mcp", enabled: true, headers: [], tools: [], createdAt: 7, updatedAt: 7 });
    expect(server.id).toBeTruthy();
    expect(defaultServerName("not a url")).toBe("MCP 伺服器");
  });

  it("keeps user choices when tools are re-read", () => {
    const previous: McpToolEntry[] = [
      { name: "lock_phone", description: "old", inputSchema: {}, enabled: false, requireConfirm: true },
      { name: "gone", description: "", inputSchema: {}, enabled: true, requireConfirm: false },
    ];
    expect(mergeDiscoveredTools(previous, [
      { name: "lock_phone", description: "鎖 App", inputSchema: { type: "object", properties: {} } },
      { name: "wipe", title: "清除", destructiveHint: true },
      { name: "unlock_phone" },
    ])).toEqual([
      { name: "lock_phone", description: "鎖 App", inputSchema: { type: "object", properties: {} }, enabled: false, requireConfirm: true },
      { name: "wipe", title: "清除", description: "", inputSchema: { type: "object", properties: {} }, enabled: true, requireConfirm: true },
      { name: "unlock_phone", description: "", inputSchema: { type: "object", properties: {} }, enabled: true, requireConfirm: false },
    ]);
  });
});
