import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@/types/mcp";
import { describeMcpServerStatus } from "./mcpServerStatus";

const server = (overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({
  id: "s1", name: "鎖手機", description: "", url: "https://lock.example.com/mcp", enabled: true, headers: [],
  tools: [{ name: "a", description: "", inputSchema: {}, enabled: true, requireConfirm: false }, { name: "b", description: "", inputSchema: {}, enabled: true, requireConfirm: false }],
  toolsFetchedAt: 1, createdAt: 0, updatedAt: 0, ...overrides,
});

describe("describeMcpServerStatus", () => {
  it("shows errors and unread servers first", () => {
    expect(describeMcpServerStatus(server({ lastError: "連不上伺服器。請確認網址正確、伺服器有開著。" }))).toBe("連線失敗：連不上伺服器。請確認網址正確、伺服器有開著。");
    expect(describeMcpServerStatus(server({ toolsFetchedAt: undefined }))).toBe("尚未讀取工具");
  });

  it("explains disabled servers and tools", () => {
    expect(describeMcpServerStatus(server({ enabled: false }))).toBe("已連線 · 2 個工具 · 已停用");
    expect(describeMcpServerStatus(server({ tools: [{ name: "a", description: "", inputSchema: {}, enabled: false, requireConfirm: false }] }))).toBe("已連線 · 1 個工具 · 工具都關掉了");
  });

  it("shows how the tools reach the model", () => {
    expect(describeMcpServerStatus(server(), { serverId: "s1", mode: "direct", reason: "direct", tokens: 900 })).toBe("已連線 · 2 個工具 · 直接提供，約 900 token／輪");
    expect(describeMcpServerStatus(server(), { serverId: "s1", mode: "lazy", reason: "too_many_tools", tokens: 2000 })).toBe("已連線 · 2 個工具 · 工具較多，改為按需載入");
    expect(describeMcpServerStatus(server(), { serverId: "s1", mode: "lazy", reason: "budget_full", tokens: 900 })).toBe("已連線 · 2 個工具 · 直接提供的額度已滿，改為按需載入");
  });
});
