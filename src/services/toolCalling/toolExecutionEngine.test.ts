import { describe, expect, it, vi } from "vitest";
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
    if (resumed.status === "completed") expect(resumed.toolResults[0]).toMatchObject({ ok: false, error: "Tool call rejected by user" });
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
});
