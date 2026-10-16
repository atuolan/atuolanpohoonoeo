import { describe, expect, it } from "vitest";
import type { McpServerConfig } from "@/types/mcp";
import { McpClientManager } from "./mcpClientManager";
import { convertCallToolResult } from "./mcpResult";

// 用法：先啟動 npx -y @modelcontextprotocol/server-everything streamableHttp（或 sse），
// 再 MCP_E2E_URL=http://localhost:3001/mcp npx vitest run src/services/mcp/mcpClientManager.e2e.test.ts
// 加 MCP_E2E_ROUTE=proxy 會強制經過 Vite 開發代理（要先 npm run dev），用來確認 SSE 長連線能穿過代理。
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const E2E_URL = env.MCP_E2E_URL;
const E2E_ROUTE = env.MCP_E2E_ROUTE === "proxy" ? "proxy" : undefined;

describe.skipIf(!E2E_URL)("McpClientManager against a real server", () => {
  const server: McpServerConfig = {
    id: "e2e", name: "everything", description: "", url: E2E_URL ?? "", enabled: true, headers: [], tools: [], createdAt: 0, updatedAt: 0,
    ...(E2E_ROUTE ? { lastRoute: E2E_ROUTE } : {}),
  };

  it("lists tools, echoes text and returns an image", async () => {
    const manager = new McpClientManager({ proxyBase: "http://localhost:5173/mcp-proxy" });
    const { tools, info, route } = await manager.discover(server);
    expect(tools.length).toBeGreaterThan(0);
    console.log("[MCP e2e]", route, info.name, tools.map((tool) => tool.name));
    if (E2E_ROUTE) expect(route).toBe(E2E_ROUTE);
    const echo = tools.find((tool) => /echo/i.test(tool.name));
    if (echo) {
      const output = convertCallToolResult(await manager.callTool(server, echo.name, { message: "哈囉" }));
      expect(output.text).toContain("哈囉");
    }
    const image = tools.find((tool) => /image/i.test(tool.name) && /tiny/i.test(tool.name));
    if (image) {
      const output = convertCallToolResult(await manager.callTool(server, image.name, {}));
      expect(output.images.length).toBeGreaterThan(0);
    }
    await manager.disconnectAll();
  }, 30_000);
});
