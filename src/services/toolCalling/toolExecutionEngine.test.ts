import { describe, expect, it, vi } from "vitest";
import type { APIMessage } from "@/api/OpenAICompatible";
import { ToolExecutionEngine, type ToolExecutionRequestContext } from "./toolExecutionEngine";
import { ToolRegistry } from "./toolRegistry";
import type { ChatToolDefinition } from "./types";

const definition = (overrides: Partial<ChatToolDefinition> = {}): ChatToolDefinition => ({
  name: "get_time",
  description: "time",
  category: "time",
  risk: "low",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: () => "12:00",
  ...overrides,
});

const context = (overrides: Partial<ToolExecutionRequestContext> = {}): ToolExecutionRequestContext => ({
  chatId: "chat-1",
  characterId: "char-1",
  globalEnabled: true,
  ...overrides,
});

const generator = (responses: Array<{ content: string; toolCalls?: any[] }>) => {
  let index = 0;
  return vi.fn(async () => responses[Math.min(index++, responses.length - 1)]);
};

describe("ToolExecutionEngine", () => {
  it("automatically executes low-risk calls and resumes generation", async () => {
    const generate = generator([{ content: "", toolCalls: [{ id: "c1", name: "get_time", arguments: {} }] }, { content: "It is noon.", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition()]), generate });
    const result = await engine.run([{ role: "user", content: "time?" }], context());
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.content).toBe("It is noon.");
      expect(result.toolResults[0]).toMatchObject({ toolCallId: "c1", ok: true, content: "12:00" });
      expect(generate).toHaveBeenCalledTimes(2);
    }
  });

  it("pauses high-risk calls and resumes after approval", async () => {
    const generate = generator([{ content: "", toolCalls: [{ id: "c1", name: "delete_note", arguments: { id: "n1" } }] }, { content: "Deleted.", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "delete_note", risk: "high", parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false }, execute: () => "done" })]), generate });
    const pending = await engine.run([], context());
    expect(pending.status).toBe("confirmation_required");
    if (pending.status === "confirmation_required") {
      expect(pending.pending.toolCall.name).toBe("delete_note");
      const resumed = await engine.resolveToolConfirmation(pending.pending.id, "approve");
      expect(resumed.status).toBe("completed");
      if (resumed.status === "completed") expect(resumed.content).toBe("Deleted.");
    }
  });

  it("returns a rejected tool result and resumes generation", async () => {
    const generate = generator([{ content: "", toolCalls: [{ id: "c1", name: "delete_note", arguments: {} }] }, { content: "Okay, I will not.", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "delete_note", risk: "high" })]), generate });
    const pending = await engine.run([], context());
    if (pending.status !== "confirmation_required") throw new Error("expected pending confirmation");
    const resumed = await engine.resolveToolConfirmation(pending.pending.id, "reject");
    expect(resumed.status).toBe("completed");
    if (resumed.status === "completed") expect(resumed.toolResults[0]).toMatchObject({ ok: false, error: "Tool call rejected by user", rejected: true });
  });

  it("rejects unknown, denied, invalid-args, and tool-error calls without executing", async () => {
    const execute = vi.fn(() => "ok");
    const generate = generator([{ content: "", toolCalls: [
      { id: "u", name: "missing", arguments: {} },
      { id: "d", name: "get_time", arguments: {} },
      { id: "i", name: "strict", arguments: { extra: true } },
      { id: "e", name: "throws", arguments: {} },
    ] }, { content: "finished", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([
      definition(),
      definition({ name: "strict", parameters: { type: "object", properties: {}, additionalProperties: false } }),
      definition({ name: "throws", execute: () => { throw new Error("boom"); } }),
    ]), generate });
    const result = await engine.run([], context({ permissions: { enabled: true, categories: {}, tools: { get_time: false } } }));
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.toolResults.map((r) => r.ok)).toEqual([false, false, false, false]);
      expect(execute).not.toHaveBeenCalled();
    }
  });

  it("times out after 15 seconds and truncates results to 8,000 characters", async () => {
    vi.useFakeTimers();
    try {
      const generate = generator([{ content: "", toolCalls: [{ id: "slow", name: "slow", arguments: {} }, { id: "long", name: "long", arguments: {} }] }, { content: "done", toolCalls: [] }]);
      const engine = new ToolExecutionEngine({ registry: new ToolRegistry([
        definition({ name: "slow", execute: () => new Promise(() => {}) }),
        definition({ name: "long", execute: () => "x".repeat(9000) }),
      ]), generate });
      const promise = engine.run([], context());
      await vi.advanceTimersByTimeAsync(15000);
      const result = await promise;
      expect(result.status).toBe("completed");
      if (result.status === "completed") {
        expect(result.toolResults.find((r) => r.name === "slow")?.error).toMatch(/timed out/i);
        expect(result.toolResults.find((r) => r.name === "long")?.content.length).toBe(8000);
      }
    } finally { vi.useRealTimers(); }
  });

  it("deduplicates normalized calls and enforces a five-round cap", async () => {
    const generate = generator(Array.from({ length: 7 }, (_, i) => ({ content: "", toolCalls: [{ id: `c${i}`, name: "get_time", arguments: i === 0 ? { b: 2, a: 1 } : { a: 1, b: 2 } }] })));
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition()]), generate });
    const result = await engine.run([], context());
    expect(result.status).toBe("completed");
    if (result.status === "completed") {
      expect(result.toolResults.filter((r) => r.error === "Duplicate tool call")).toHaveLength(1);
      expect(result.toolResults.some((r) => /maximum.*round/i.test(r.error ?? ""))).toBe(true);
      expect(generate).toHaveBeenCalledTimes(5);
    }
  });

  it("invalidates pending confirmations when cancelled", async () => {
    const generate = generator([{ content: "", toolCalls: [{ id: "c1", name: "delete_note", arguments: {} }] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "delete_note", risk: "high" })]), generate });
    const pending = await engine.run([], context());
    expect(pending.status).toBe("confirmation_required");
    engine.cancel("chat-1");
    if (pending.status === "confirmation_required") await expect(engine.resolveToolConfirmation(pending.pending.id, "approve")).rejects.toThrow(/expired|cancel/i);
  });

  it("reports call start and end through hooks", async () => {
    const onCallStart = vi.fn();
    const onCallEnd = vi.fn();
    const generate = generator([{ content: "", toolCalls: [{ id: "c1", name: "get_time", arguments: {} }, { id: "c2", name: "missing", arguments: {} }] }, { content: "done", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition()]), generate, onCallStart, onCallEnd });
    await engine.run([], context());
    expect(onCallStart).toHaveBeenCalledTimes(1);
    expect(onCallStart.mock.calls[0][0]).toMatchObject({ id: "c1" });
    expect(onCallEnd.mock.calls.map(([call, , result]) => [call.id, result.ok])).toEqual([["c1", true], ["c2", false]]);
  });

  it("registers tools returned by loadTools for the following rounds", async () => {
    const loaded = definition({ name: "lock_phone", execute: vi.fn(() => "locked") });
    const loader = definition({ name: "load_mcp_tools", execute: () => ({ summary: "loaded", loadTools: [loaded] }) });
    const registry = new ToolRegistry([loader]);
    const generate = generator([
      { content: "", toolCalls: [{ id: "c1", name: "load_mcp_tools", arguments: {} }] },
      { content: "", toolCalls: [{ id: "c2", name: "lock_phone", arguments: {} }] },
      { content: "Locked.", toolCalls: [] },
    ]);
    const engine = new ToolExecutionEngine({ registry, generate });
    const result = await engine.run([], context());
    expect(registry.get("lock_phone")).toBeDefined();
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.toolResults.map((entry) => [entry.name, entry.ok, entry.content])).toEqual([["load_mcp_tools", true, "loaded"], ["lock_phone", true, "locked"]]);
    expect(result.content).toBe("Locked.");
  });

  it("uses a tool's own timeout", async () => {
    vi.useFakeTimers();
    try {
      const generate = generator([{ content: "", toolCalls: [{ id: "s", name: "slow", arguments: {} }] }, { content: "done", toolCalls: [] }]);
      const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "slow", timeoutMs: 30_000, execute: () => new Promise(() => {}) })]), generate });
      const promise = engine.run([], context());
      await vi.advanceTimersByTimeAsync(15_000);
      expect(generate).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15_000);
      const result = await promise;
      if (result.status !== "completed") throw new Error("expected completion");
      expect(result.toolResults[0].error).toMatch(/timed out/i);
    } finally { vi.useRealTimers(); }
  });

  it("sends tool images to the model as one user message after the tool results", async () => {
    const snapshots: APIMessage[][] = [];
    const responses = [{ content: "", toolCalls: [{ id: "c1", name: "shot", arguments: {} }] }, { content: "I see it.", toolCalls: [] }];
    const generate = vi.fn(async (messages: APIMessage[]) => { snapshots.push(structuredClone(messages)); return responses[snapshots.length - 1]; });
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "shot", execute: () => ({ summary: "截圖完成", images: [{ mimeType: "image/png", data: "AAAA" }] }) })]), generate });
    const result = await engine.run([{ role: "user", content: "看一下" }], context());
    expect(snapshots[1].map((message) => message.role)).toEqual(["user", "assistant", "tool", "user"]);
    expect(snapshots[1][3].content).toEqual([
      { type: "text", text: "以下是工具回傳的圖片：" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.toolResults[0]).toMatchObject({ content: "截圖完成", ok: true, images: [{ mimeType: "image/png", data: "AAAA" }] });
  });

  it("retries once without images when the request with images fails", async () => {
    const snapshots: APIMessage[][] = [];
    const generate = vi.fn(async (messages: APIMessage[]) => {
      snapshots.push(structuredClone(messages));
      if (snapshots.length === 1) return { content: "", toolCalls: [{ id: "c1", name: "shot", arguments: {} }] };
      if (snapshots.length === 2) throw new Error("API error: 400 - image input is not supported");
      return { content: "I cannot see images.", toolCalls: [] };
    });
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition({ name: "shot", execute: () => ({ summary: "截圖完成", images: [{ mimeType: "image/png", data: "AAAA" }] }) })]), generate });
    const result = await engine.run([], context());
    expect(generate).toHaveBeenCalledTimes(3);
    expect(snapshots[2][snapshots[2].length - 1]).toEqual({ role: "user", content: "（工具回傳了 1 張圖片，但目前的模型無法看圖）" });
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.content).toBe("I cannot see images.");
  });

  it("keeps the last non-empty reply when the final round is empty", async () => {
    const generate = generator([{ content: "好，這就幫你鎖上～", toolCalls: [{ id: "c1", name: "get_time", arguments: {} }] }, { content: "", toolCalls: [] }]);
    const engine = new ToolExecutionEngine({ registry: new ToolRegistry([definition()]), generate });
    const result = await engine.run([], context());
    if (result.status !== "completed") throw new Error("expected completion");
    expect(result.content).toBe("好，這就幫你鎖上～");
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
