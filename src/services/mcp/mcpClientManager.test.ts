import { describe, expect, it, vi } from "vitest";
import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import type { McpServerConfig } from "@/types/mcp";
import { classifyMcpError, McpClientManager, McpConnectionError, MCP_ERROR_MESSAGES, shouldFallbackToSse } from "./mcpClientManager";

const server: McpServerConfig = {
  id: "s1", name: "測試", description: "", url: "https://mcp.example.com/mcp", enabled: true, token: "tok",
  headers: [{ key: "X-Api-Key", value: "k" }], tools: [], createdAt: 0, updatedAt: 0,
};
const PROXY = "https://proxy.test/";

interface FakeOptions {
  tools?: Array<Record<string, unknown>>;
  expireSessionOnce?: boolean;
  status?: number;
  wwwAuthenticate?: string;
}

function createFakeServer(options: FakeOptions = {}) {
  let sessions = 0;
  let expired = false;
  const methods: string[] = [];
  const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
    if (options.status) {
      return new Response("denied", { status: options.status, headers: options.wwwAuthenticate ? { "WWW-Authenticate": options.wwwAuthenticate } : {} });
    }
    if ((init?.method ?? "GET") !== "POST") return new Response(null, { status: 405 });
    const message = JSON.parse(String(init?.body));
    methods.push(message.method);
    if (message.method === "initialize") {
      sessions += 1;
      return Response.json(
        { jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fake-server", version: "1.0.0" }, instructions: "測試用伺服器" } },
        { headers: { "Mcp-Session-Id": `session-${sessions}` } },
      );
    }
    if (message.id === undefined) return new Response(null, { status: 202 });
    if (message.method === "tools/call" && options.expireSessionOnce && !expired) {
      expired = true;
      return new Response("session not found", { status: 404 });
    }
    if (message.method === "tools/list") return Response.json({ jsonrpc: "2.0", id: message.id, result: { tools: options.tools ?? [] } });
    if (message.method === "tools/call") return Response.json({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: `called ${message.params.name}` }] } });
    return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Method not found" } });
  });
  return { fetchImpl, methods };
}

describe("McpClientManager", () => {
  it("reads server info and tools with the configured auth headers", async () => {
    const fake = createFakeServer({ tools: [{ name: "lock_phone", description: "鎖 App", inputSchema: { type: "object", properties: {} }, annotations: { title: "鎖 App", destructiveHint: true } }] });
    const result = await new McpClientManager({ fetchImpl: fake.fetchImpl, proxyBase: PROXY }).discover(server);
    expect(result.info).toEqual({ name: "fake-server", version: "1.0.0", instructions: "測試用伺服器" });
    expect(result.tools).toEqual([{ name: "lock_phone", title: "鎖 App", description: "鎖 App", inputSchema: { type: "object", properties: {} }, destructiveHint: true }]);
    expect(result.route).toBe("direct");
    const headers = new Headers(fake.fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok");
    expect(headers.get("x-api-key")).toBe("k");
  });

  it("reuses the connection between calls", async () => {
    const fake = createFakeServer();
    const manager = new McpClientManager({ fetchImpl: fake.fetchImpl, proxyBase: PROXY });
    await manager.callTool(server, "a", {});
    await manager.callTool(server, "b", {});
    expect(fake.methods.filter((method) => method === "initialize")).toHaveLength(1);
  });

  it("reconnects once when the session expired", async () => {
    const fake = createFakeServer({ expireSessionOnce: true });
    const result = await new McpClientManager({ fetchImpl: fake.fetchImpl, proxyBase: PROXY }).callTool(server, "lock_phone", { apps: "小紅書" });
    expect(result).toMatchObject({ content: [{ type: "text", text: "called lock_phone" }] });
    expect(fake.methods.filter((method) => method === "initialize")).toHaveLength(2);
  });

  it("switches to the proxy route and reports it", async () => {
    const fake = createFakeServer();
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      if (String(url).startsWith("https://mcp.example.com")) throw new TypeError("Failed to fetch");
      return fake.fetchImpl(new URL(String(url)).searchParams.get("target") as string, init);
    });
    const manager = new McpClientManager({ fetchImpl, proxyBase: PROXY });
    const listener = vi.fn();
    manager.setRouteListener(listener);
    const result = await manager.discover(server);
    expect(result.route).toBe("proxy");
    expect(listener).toHaveBeenCalledWith("s1", "proxy");
  });

  it("explains OAuth-only servers and bad tokens", async () => {
    const oauth = createFakeServer({ status: 401, wwwAuthenticate: 'Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"' });
    await expect(new McpClientManager({ fetchImpl: oauth.fetchImpl, proxyBase: PROXY }).discover(server)).rejects.toMatchObject({ kind: "oauth", message: MCP_ERROR_MESSAGES.oauth });
    const token = createFakeServer({ status: 401 });
    await expect(new McpClientManager({ fetchImpl: token.fetchImpl, proxyBase: PROXY }).discover(server)).rejects.toMatchObject({ kind: "unauthorized", message: MCP_ERROR_MESSAGES.unauthorized });
  });

  it("says the url is not an MCP endpoint when both transports get 404", async () => {
    const fake = createFakeServer({ status: 404 });
    await expect(new McpClientManager({ fetchImpl: fake.fetchImpl, proxyBase: PROXY }).discover(server)).rejects.toMatchObject({ kind: "not_mcp", message: MCP_ERROR_MESSAGES.not_mcp });
  });
});

describe("classifyMcpError", () => {
  it("maps transport failures to friendly messages", () => {
    expect(classifyMcpError(new TypeError("Failed to fetch")).kind).toBe("unreachable");
    expect(classifyMcpError(new StreamableHTTPError(405, "x")).kind).toBe("not_mcp");
    expect(classifyMcpError(new McpError(ErrorCode.RequestTimeout, "timeout")).kind).toBe("timeout");
    expect(classifyMcpError(new Error("x"), { route: "proxy", proxyErrorCode: "private_address" }).message).toBe(MCP_ERROR_MESSAGES.private);
    expect(classifyMcpError(new Error("boom")).message).toBe("伺服器回傳錯誤：boom");
    const existing = new McpConnectionError("timeout", "x");
    expect(classifyMcpError(existing)).toBe(existing);
  });

  it("only falls back to SSE for 400, 404 and 405", () => {
    expect([400, 401, 403, 404, 405, 500].map((code) => shouldFallbackToSse(new StreamableHTTPError(code, "x")))).toEqual([true, false, false, true, true, false]);
  });
});
