import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClient, type APIMessage } from "./OpenAICompatible";

const settings = {
  maxContextLength: 4096,
  maxResponseLength: 64,
  temperature: 0.2,
  topP: 1,
  topK: 0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  repetitionPenalty: 1,
  stopSequences: [],
  streaming: false,
  useStreamingWindow: false,
};

const api = (overrides: Record<string, unknown> = {}) => ({
  provider: "openai" as const,
  endpoint: "https://example.test/v1/chat/completions",
  apiKey: "KEY",
  model: "fixture-model",
  directConnect: true,
  ...overrides,
});

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
    text: async () => JSON.stringify(value),
    headers: new Headers({ "content-type": "application/json" }),
  } as Response;
}

afterEach(() => vi.restoreAllMocks());

describe("OpenAICompatible request integration", () => {
  it("post-processes strict prompts without mutating caller messages", async () => {
    const messages: APIMessage[] = [
      { role: "system", content: "Rules" },
      { role: "assistant", content: "History" },
      { role: "user", content: "Hello" },
    ];
    const original = structuredClone(messages);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.messages).toEqual([
        { role: "system", content: "Rules" },
        { role: "user", content: "[Start a new chat]" },
        { role: "assistant", content: "History" },
        { role: "user", content: "Hello" },
      ]);
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new OpenAICompatibleClient(api({ promptPostProcessing: "strict" })).generate({ messages, settings, apiSettings: api(), promptPostProcessing: "strict" });
    expect(messages).toEqual(original);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("sends native OpenAI tools only when enabled and preserves tool fields", async () => {
    const messages: APIMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "get_time", arguments: "{}" } }] },
      { role: "tool", content: "12:00", tool_call_id: "c1" },
    ];
    const tool = { name: "get_time", description: "time", parameters: { type: "object", properties: {} } };
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools).toEqual([{ type: "function", function: tool }]);
      expect(body.messages[0].tool_calls).toBeDefined();
      expect(body.messages[1].tool_call_id).toBe("c1");
      return jsonResponse({ choices: [{ message: { content: "", tool_calls: [{ id: "c2", type: "function", function: { name: "get_time", arguments: "{\"tz\":\"UTC\"}" } }] } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAICompatibleClient(api({ toolsEnabled: true })).generate({ messages, settings, apiSettings: api(), tools: [tool], toolProtocol: "native", promptPostProcessing: "merge_tools" });
    expect(result.content).toBe("");
    expect(result.toolCalls).toEqual([{ id: "c2", name: "get_time", arguments: { tz: "UTC" } }]);
  });

  it("removes tool metadata in non-tools processing", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools).toBeUndefined();
      expect(body.messages[0].role).toBe("assistant");
      expect(body.messages[0].tool_calls).toBeUndefined();
      expect(body.messages[1].tool_call_id).toBeUndefined();
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    await new OpenAICompatibleClient(api()).generate({
      messages: [
        { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "x", arguments: "{}" } }] },
        { role: "tool", content: "result", tool_call_id: "c1" },
      ], settings, apiSettings: api(), tools: [{ name: "x", description: "x", parameters: { type: "object" } }], toolProtocol: "disabled", promptPostProcessing: "none",
    });
  });

  it("emits Claude tool_use and tool_result blocks", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.tools).toEqual([{ name: "get_time", description: "time", input_schema: { type: "object" } }]);
      expect(body.messages.flatMap((m: any) => m.content)).toContainEqual({ type: "tool_result", tool_use_id: "c1", content: "12:00" });
      return jsonResponse({ model: "claude-fixture", stop_reason: "tool_use", content: [{ type: "text", text: "Working" }, { type: "tool_use", id: "c2", name: "get_time", input: { tz: "UTC" } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await new OpenAICompatibleClient(api({ provider: "claude", model: "claude-3-5-sonnet", useClaudeNativeCache: true })).generate({
      messages: [{ role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "get_time", arguments: "{}" } }] }, { role: "tool", content: "12:00", tool_call_id: "c1" }],
      settings, apiSettings: api({ provider: "claude", model: "claude-3-5-sonnet", useClaudeNativeCache: true }), tools: [{ name: "get_time", description: "time", parameters: { type: "object" } }], toolProtocol: "native", promptPostProcessing: "merge_tools",
    });
    expect(result.content).toBe("Working");
    expect(result.toolCalls?.[0].id).toBe("c2");
  });
});
