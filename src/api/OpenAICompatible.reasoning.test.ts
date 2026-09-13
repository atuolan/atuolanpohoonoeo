/// <reference types="vitest/globals" />

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
  streaming: true,
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

/** 把 SSE 行組成一個可讀流回應，模擬上游串流。 */
function sseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers({ "content-type": "text/event-stream" }),
  } as unknown as Response;
}

const messages: APIMessage[] = [{ role: "user", content: "Hello" }];

async function collectStream(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const tokens: string[] = [];
  let done: { content?: string } | undefined;
  const client = new OpenAICompatibleClient(api());
  for await (const event of client.generateStream({
    messages,
    settings,
    apiSettings: api(),
  })) {
    if (event.type === "token" && event.token) tokens.push(event.token);
    if (event.type === "done") done = event as { content?: string };
  }
  return { tokens, done };
}

afterEach(() => vi.restoreAllMocks());

describe("generateStream reasoning_content 回退", () => {
  it("正文為空時把推理內容分塊 yield，而不是一次吐出整段", async () => {
    // 只吐 reasoning_content、正文始終為 null 的推理模型
    const reasoning = "這是一整段很長的思維鏈".repeat(12);
    const { tokens, done } = await collectStream(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: reasoning } }] })}`,
        "data: [DONE]",
      ]),
    );

    // 回退後的內容必須完整無損
    expect(tokens.join("")).toBe(reasoning);
    expect(done?.content).toBe(reasoning);

    // 關鍵：不能是單一個巨大 token（那會讓 tokenCount 只加 1、
    // 串流視窗一瞬間刷出整塊文字）
    expect(tokens.length).toBeGreaterThan(1);
    // 每塊都不該超過分塊大小
    for (const token of tokens) {
      expect(token.length).toBeLessThanOrEqual(24);
    }
  });

  it("正文有內容時不觸發回退，推理內容不進正文", async () => {
    const { tokens, done } = await collectStream(
      sseResponse([
        `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "內部思考" } }] })}`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "正式回覆" } }] })}`,
        "data: [DONE]",
      ]),
    );

    expect(tokens.join("")).toBe("正式回覆");
    expect(done?.content).toBe("正式回覆");
  });
});
