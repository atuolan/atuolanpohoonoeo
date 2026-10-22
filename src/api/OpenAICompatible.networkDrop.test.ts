/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAICompatibleClient, type APIMessage } from "./OpenAICompatible";
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
  streaming: true,
  useStreamingWindow: false,
};

const api = {
  provider: "openai" as const,
  endpoint: "https://example.test/v1/chat/completions",
  apiKey: "KEY",
  model: "fixture-model",
  directConnect: true,
};

const messages: APIMessage[] = [{ role: "user", content: "Hello" }];

/** 先送出幾行 SSE，接著像 iOS 背景斷線那樣丟出 Load failed */
function droppingResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  // 用 pull 一次給一行，全部讀完才出錯（start 裡直接 error 會把還沒讀的內容一起丟掉）
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < lines.length) controller.enqueue(encoder.encode(`${lines[index++]}\n`));
      else controller.error(new TypeError("Load failed"));
    },
  });
  return {
    ok: true,
    status: 200,
    body,
    headers: new Headers({ "content-type": "text/event-stream" }),
  } as unknown as Response;
}

async function collect(response: Response): Promise<StreamingEvent[]> {
  vi.stubGlobal("fetch", vi.fn(async () => response));
  const events: StreamingEvent[] = [];
  const client = new OpenAICompatibleClient(api);
  for await (const event of client.generateStream({ messages, settings, apiSettings: api })) {
    events.push(event);
  }
  return events;
}

afterEach(() => vi.restoreAllMocks());

describe("串流中途斷線", () => {
  it("已收到內容時照常結束並保留內容，標記為網路中斷", async () => {
    const events = await collect(
      droppingResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: "完整的回覆" } }] })}`]),
    );
    expect(events.filter((event) => event.type === "error")).toEqual([]);
    const done = events.find((event) => event.type === "done");
    expect(done?.content).toBe("完整的回覆");
    expect(done?.diagnostics?.rawFinishReason).toBe("network_interrupted");
    expect(done?.diagnostics?.networkInterruption).toContain("Load failed");
    expect(done?.diagnostics?.networkInterruption).toContain("串流中途斷開");
  });

  it("什麼都沒收到時仍然是錯誤", async () => {
    const events = await collect(droppingResponse([]));
    const error = events.find((event) => event.type === "error");
    expect(error?.error).toContain("Load failed");
    expect(error?.error).toContain("[診斷]");
  });
});
