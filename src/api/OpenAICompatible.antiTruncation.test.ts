import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClient, type APIMessage, type GenerationParams } from "./OpenAICompatible";
import type { StreamingEvent } from "@/types/chat";

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

const chat = (): APIMessage[] => [
  { role: "system", content: "Rules" },
  { role: "user", content: "Hello" },
];

function jsonResponse(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
    text: async () => JSON.stringify(value),
    headers: new Headers({ "content-type": "application/json" }),
  } as Response;
}

function errorResponse(status: number, message: string): Response {
  return { ok: false, status, text: async () => message, headers: new Headers() } as Response;
}

function sseResponse(lines: string[], options: { keepOpen?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      if (!options.keepOpen) controller.close();
    },
  });
  return { ok: true, status: 200, body, headers: new Headers({ "content-type": "text/event-stream" }) } as unknown as Response;
}

const bodyOf = (init: RequestInit): any => JSON.parse(String(init.body));
const toolNameOf = (init: RequestInit): string => bodyOf(init).tools.at(-1).function.name;

async function collect(extra: Partial<GenerationParams> = {}, apiSettings = api()) {
  const tokens: string[] = [];
  let done: StreamingEvent | undefined;
  let error: string | undefined;
  for await (const event of new OpenAICompatibleClient(apiSettings).generateStream({
    messages: chat(),
    settings: { ...settings, streaming: true },
    apiSettings,
    ...extra,
  })) {
    if (event.type === "token" && event.token) tokens.push(event.token);
    if (event.type === "done") done = event;
    if (event.type === "error") error = event.error;
  }
  return { tokens, done, error };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("OpenAICompatible 防截斷", () => {
  it("adds the fake tool and control prompt only when asked", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(bodyOf(init));
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    }));
    const client = new OpenAICompatibleClient(api());
    await client.generate({ messages: chat(), settings, apiSettings: api() });
    await client.generate({ messages: chat(), settings, apiSettings: api(), antiTruncation: {} });

    expect(bodies[0].tools).toBeUndefined();
    expect(bodies[0].tool_choice).toBeUndefined();
    expect(bodies[0].messages).toHaveLength(2);

    const tool = bodies[1].tools.at(-1);
    expect(tool.function.parameters.required).toEqual(["content"]);
    expect(bodies[1].tool_choice).toBe("auto");
    expect(bodies[1].messages.at(-2)).toMatchObject({ role: "system", identifier: "antiTruncationControl" });
    expect(bodies[1].messages.at(-2).content).toContain(tool.function.name);
    expect(bodies[1].messages.at(-1)).toMatchObject({ role: "user", content: "Hello" });
  });

  it("keeps client tools in front of the fake tool", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      body = bodyOf(init);
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    }));
    await new OpenAICompatibleClient(api({ toolsEnabled: true })).generate({
      messages: chat(),
      settings,
      apiSettings: api(),
      tools: [{ name: "get_time", description: "time", parameters: { type: "object" } }],
      toolProtocol: "native",
      antiTruncation: {},
    });
    expect(body.tools.map((tool: any) => tool.function.name)[0]).toBe("get_time");
    expect(body.tools).toHaveLength(2);
  });

  it("does not inject in Claude cache mode", async () => {
    let raw = "";
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      raw = String(init.body);
      return jsonResponse({ model: "claude-fixture", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] });
    }));
    const claude = api({ provider: "claude", model: "claude-3-5-sonnet", useClaudeNativeCache: true });
    const result = await new OpenAICompatibleClient(claude).generate({ messages: chat(), settings, apiSettings: claude, antiTruncation: {} });
    expect(result.content).toBe("ok");
    expect(raw).not.toContain("Output Format Protocol");
    expect(JSON.parse(raw).tools).toBeUndefined();
  });

  it("keeps the Gemini trailing-role fix on the original last message", async () => {
    let body: any;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      body = bodyOf(init);
      return jsonResponse({ choices: [{ message: { content: "ok" } }] });
    }));
    const gemini = api({ provider: "gemini", model: "fixture-model" });
    await new OpenAICompatibleClient(gemini).generate({
      messages: [{ role: "user", content: "Hello" }, { role: "system", content: "Format rules" }],
      settings,
      apiSettings: gemini,
      adjustLastMessageRole: true,
      antiTruncation: {},
    });
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Format rules" });
    expect(body.messages.at(-2)).toMatchObject({ role: "system", identifier: "antiTruncationControl" });
  });

  it("restores the reply from the tool call in a non-stream response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => jsonResponse({
      choices: [{
        finish_reason: "tool_calls",
        message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: toolNameOf(init), arguments: JSON.stringify({ content: "完整的回覆" }) } }] },
      }],
    })));
    const result = await new OpenAICompatibleClient(api()).generate({ messages: chat(), settings, apiSettings: api(), antiTruncation: {} });
    expect(result.content).toBe("完整的回覆");
    expect(result.toolCalls).toEqual([]);
    expect(result.diagnostics?.antiTruncation).toEqual({ result: "tool" });
  });

  it("restores a Gemini-style whole tool call in a stream", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => sseResponse([
      `data: ${JSON.stringify({
        choices: [{
          index: 0,
          delta: { role: "assistant", tool_calls: [{ id: "", type: "function", function: { name: toolNameOf(init), arguments: JSON.stringify({ content: "第一段\n第二段" }) } }] },
          finish_reason: "stop",
        }],
      })}`,
      "data: [DONE]",
    ])));
    const { tokens, done } = await collect({ antiTruncation: {} });
    expect(tokens.join("")).toBe("第一段\n第二段");
    expect(done?.content).toBe("第一段\n第二段");
    expect(done?.toolCalls).toBeUndefined();
    expect(done?.diagnostics?.antiTruncation).toEqual({ result: "tool" });
  });

  it("retries a non-stream request once without anti-truncation when the channel rejects it", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(bodyOf(init));
      return bodies.length === 1 ? errorResponse(400, "bad request") : jsonResponse({ choices: [{ message: { content: "ok" } }] });
    }));
    const onWarning = vi.fn();
    const result = await new OpenAICompatibleClient(api()).generate({ messages: chat(), settings, apiSettings: api(), antiTruncation: { onWarning } });
    expect(result.content).toBe("ok");
    expect(bodies).toHaveLength(2);
    expect(bodies[1].tools).toBeUndefined();
    expect(onWarning).toHaveBeenCalledWith("防截斷請求被渠道拒絕（HTTP 400），這次改用一般方式重送");
    expect(result.diagnostics?.antiTruncation).toEqual({ result: "missed", fellBack: true });
  });

  it("retries a stream request once without anti-truncation when the channel rejects it", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(bodyOf(init));
      return bodies.length === 1
        ? errorResponse(422, "bad request")
        : sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}`, "data: [DONE]"]);
    }));
    const onWarning = vi.fn();
    const { done } = await collect({ antiTruncation: { onWarning } });
    expect(done?.content).toBe("ok");
    expect(bodies[1].tools).toBeUndefined();
    expect(onWarning).toHaveBeenCalledOnce();
    expect(done?.diagnostics?.antiTruncation).toEqual({ result: "missed", fellBack: true });
  });
});

describe("OpenAICompatible 接收逾時", () => {
  const fakeTimers = () => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const textChunk = (content: string, extra: Record<string, unknown> = {}) =>
    `data: ${JSON.stringify({ choices: [{ delta: { content }, ...extra }] })}`;

  it("stops reading at [DONE] even if the connection stays open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([textChunk("Hi"), "data: [DONE]"], { keepOpen: true })));
    const { done } = await collect();
    expect(done?.content).toBe("Hi");
  });

  it("ends normally 15 seconds after a finish reason when the connection stays open", async () => {
    fakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([textChunk("Hi", { finish_reason: "stop" })], { keepOpen: true })));
    let finished = false;
    const pending = collect().then((result) => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(14_000);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    const { done, error } = await pending;
    expect(error).toBeUndefined();
    expect(done?.content).toBe("Hi");
    expect(warn.mock.calls.some(([message]) => String(message).includes("視為串流截斷"))).toBe(false);
  });

  it("waits 180 seconds of silence mid-stream before giving up", async () => {
    fakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([textChunk("Hi")], { keepOpen: true })));
    let finished = false;
    const pending = collect().then((result) => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(179_000);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).done?.content).toBe("Hi");
  });

  it("waits 240 seconds for the first chunk", async () => {
    fakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([], { keepOpen: true })));
    let finished = false;
    const pending = collect().then((result) => {
      finished = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(239_000);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect((await pending).error).toContain("240 秒");
  });

  it("waits 240 seconds for a non-stream response", async () => {
    fakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })));
    const pending = new OpenAICompatibleClient(api()).generate({ messages: chat(), settings, apiSettings: api() });
    const assertion = expect(pending).rejects.toThrow("240 秒");
    await vi.advanceTimersByTimeAsync(240_000);
    await assertion;
  });
});
