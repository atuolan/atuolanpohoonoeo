import { describe, expect, it, vi } from "vitest";
import type { ToolImage } from "@/services/toolCalling/types";
import type { McpServerConfig, McpToolEntry } from "@/types/mcp";
import { buildMcpChatTools, DIRECT_SERVER_TOKEN_LIMIT, estimateServerTokens, isMcpServerAllowedForCharacter, MCP_LOADER_TOOL_NAME, MCP_TOOL_TIMEOUT_MS, mcpCategory, planMcpExposure, sanitizeSchema } from "./mcpToolSource";

const tool = (name: string, overrides: Partial<McpToolEntry> = {}): McpToolEntry => ({ name, description: `${name} 的說明`, inputSchema: { type: "object", properties: {} }, enabled: true, requireConfirm: false, ...overrides });
const server = (id: string, tools: McpToolEntry[], overrides: Partial<McpServerConfig> = {}): McpServerConfig => ({ id, name: id, description: "", url: `https://${id}.example.com/mcp`, enabled: true, headers: [], tools, createdAt: 0, updatedAt: 0, ...overrides });
const textCaller = () => ({ callTool: vi.fn(async (..._args: unknown[]) => ({ content: [{ type: "text", text: "已鎖定小紅書" }] })) });

describe("sanitizeSchema", () => {
  it("keeps the safe subset and resolves local refs and unions", () => {
    expect(sanitizeSchema({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      additionalProperties: false,
      $defs: { App: { type: "string", description: "App 名稱", minLength: 1 } },
      properties: {
        apps: { type: "array", items: { $ref: "#/$defs/App" } },
        minutes: { type: ["integer", "null"], description: "分鐘", default: 30 },
        mode: { anyOf: [{ type: "null" }, { type: "string", enum: ["lock", "unlock"] }], description: "模式" },
        missing: { $ref: "#/$defs/Nope" },
      },
      required: ["apps", "ghost"],
    })).toEqual({
      type: "object",
      properties: {
        apps: { type: "array", items: { type: "string", description: "App 名稱" } },
        minutes: { type: "integer", description: "分鐘" },
        mode: { type: "string", enum: ["lock", "unlock"], description: "模式" },
        missing: {},
      },
      required: ["apps"],
    });
  });

  it("always returns an object schema", () => {
    expect(sanitizeSchema(undefined)).toEqual({ type: "object", properties: {} });
    expect(sanitizeSchema({ type: "string" })).toEqual({ type: "object", properties: {} });
  });
});

describe("planMcpExposure", () => {
  it("serves small servers directly and big ones on demand", () => {
    const small = server("small", [tool("lock_phone")]);
    const big = server("big", [tool("huge", { description: "字".repeat(4800) })]);
    expect(estimateServerTokens(big)).toBeGreaterThan(DIRECT_SERVER_TOKEN_LIMIT);
    expect(planMcpExposure([big, small])).toEqual([
      { serverId: "small", mode: "direct", reason: "direct", tokens: estimateServerTokens(small) },
      { serverId: "big", mode: "lazy", reason: "too_many_tools", tokens: estimateServerTokens(big) },
    ]);
  });

  it("stops serving directly once the total budget is used", () => {
    const servers = ["a", "b", "c"].map((id) => server(id, [tool(`${id}_tool`, { description: "字".repeat(3300) })]));
    expect(planMcpExposure(servers).map((entry) => [entry.serverId, entry.mode, entry.reason])).toEqual([["a", "direct", "direct"], ["b", "direct", "direct"], ["c", "lazy", "budget_full"]]);
  });

  it("ignores disabled servers and servers without enabled tools", () => {
    expect(planMcpExposure([server("off", [tool("x")], { enabled: false }), server("none", [tool("y", { enabled: false })])])).toEqual([]);
  });
});

describe("buildMcpChatTools", () => {
  it("turns enabled tools of small servers into chat tools", async () => {
    const lock = server("s1", [tool("lock_phone", { title: "鎖 App", requireConfirm: true }), tool("hidden", { enabled: false })], { name: "鎖手機" });
    const caller = textCaller();
    const tools = buildMcpChatTools({ servers: [lock], reservedNames: ["get_weather"], caller });
    expect(tools.map((entry) => entry.name)).toEqual(["lock_phone"]);
    const [definition] = tools;
    expect(definition).toMatchObject({ displayName: "鎖手機 · 鎖 App", description: "【鎖手機】lock_phone 的說明", category: mcpCategory("s1"), risk: "high", timeoutMs: MCP_TOOL_TIMEOUT_MS, parameters: { type: "object", properties: {} } });
    const controller = new AbortController();
    await expect(Promise.resolve(definition.execute({ apps: ["小紅書"] }, { signal: controller.signal }))).resolves.toEqual({ summary: "已鎖定小紅書" });
    expect(caller.callTool).toHaveBeenCalledWith(lock, "lock_phone", { apps: ["小紅書"] }, { signal: controller.signal, timeoutMs: MCP_TOOL_TIMEOUT_MS });
  });

  it("returns prepared images and reports tool errors", async () => {
    const shot = server("s1", [tool("screenshot")]);
    const prepareImages = vi.fn(async (images: ToolImage[]) => images.map((image) => ({ ...image, data: `small-${image.data}` })));
    const imageCaller = { callTool: vi.fn(async (..._args: unknown[]) => ({ content: [{ type: "image", data: "RAW", mimeType: "image/png" }] })) };
    const [screenshot] = buildMcpChatTools({ servers: [shot], reservedNames: [], caller: imageCaller, prepareImages });
    await expect(Promise.resolve(screenshot.execute({}, {}))).resolves.toEqual({ summary: "回傳了 1 張圖片", images: [{ mimeType: "image/png", data: "small-RAW" }] });
    const failing = { callTool: vi.fn(async (..._args: unknown[]) => ({ content: [{ type: "text", text: "找不到遊戲視窗" }], isError: true })) };
    const [broken] = buildMcpChatTools({ servers: [shot], reservedNames: [], caller: failing });
    await expect(Promise.resolve(broken.execute({}, {}))).rejects.toThrow("找不到遊戲視窗");
  });

  it("asks to re-read tools when the server no longer knows a tool", async () => {
    const gone = { callTool: vi.fn(async (..._args: unknown[]): Promise<unknown> => { throw new Error("伺服器回傳錯誤：MCP error -32602: Unknown tool: lock_phone"); }) };
    const [definition] = buildMcpChatTools({ servers: [server("s1", [tool("lock_phone")])], reservedNames: [], caller: gone });
    await expect(Promise.resolve(definition.execute({}, {}))).rejects.toThrow("（請到設定重新讀取工具）");
  });

  it("puts big servers behind load_mcp_tools", async () => {
    const big = server("big", [tool("search_repositories", { description: "字".repeat(4800) }), tool("create_issue")], { name: "GitHub" });
    const small = server("small", [tool("lock_phone")], { name: "鎖手機" });
    const tools = buildMcpChatTools({ servers: [big, small], reservedNames: [], caller: textCaller() });
    expect(tools.map((entry) => entry.name)).toEqual(["lock_phone", MCP_LOADER_TOOL_NAME]);
    const loader = tools[1];
    expect(loader.parameters).toEqual({ type: "object", properties: { server: { type: "string", enum: ["GitHub"], description: "要載入的工具組名稱" } }, required: ["server"] });
    expect(loader.description).toContain("- GitHub：包含 search_repositories、create_issue 2 個工具");
    const loaded = (await loader.execute({ server: "GitHub" }, {})) as { summary: string; loadTools: Array<{ name: string }> };
    expect(loaded.loadTools.map((entry) => entry.name)).toEqual(["search_repositories", "create_issue"]);
    expect(loaded.summary).toBe("已載入「GitHub」的 2 個工具，現在可以直接呼叫：search_repositories、create_issue");
  });

  it("returns nothing when no server is usable", () => {
    expect(buildMcpChatTools({ servers: [server("off", [tool("x")], { enabled: false })], reservedNames: [], caller: textCaller() })).toEqual([]);
  });
});

describe("isMcpServerAllowedForCharacter", () => {
  it("follows the character switch and the per-server category", () => {
    expect(isMcpServerAllowedForCharacter("s1", undefined)).toBe(true);
    expect(isMcpServerAllowedForCharacter("s1", { enabled: false, categories: {}, tools: {} })).toBe(false);
    expect(isMcpServerAllowedForCharacter("s1", { enabled: true, categories: { "mcp:s1": false }, tools: {} })).toBe(false);
    expect(isMcpServerAllowedForCharacter("s2", { enabled: true, categories: { "mcp:s1": false }, tools: {} })).toBe(true);
  });
});
