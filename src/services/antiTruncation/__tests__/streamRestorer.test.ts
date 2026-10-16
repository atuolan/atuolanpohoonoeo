import { describe, expect, it } from "vitest";
import { restoreStreamBody } from "../streamRestorer";
import type { RestoreStats } from "../stats";

const OWN = "dispatch_stream_payload_0123456789abcdef";
const ctx = { toolName: OWN, clientToolNames: new Set(["get_weather"]) };

async function run(chunks: string[]): Promise<{ output: string; stats: RestoreStats }> {
  const encoder = new TextEncoder();
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const restored = restoreStreamBody(source, ctx);
  const output = await new Response(restored.body).text();
  return { output, stats: restored.readStats() };
}

const data = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const ownCall = (args: string, extra: Record<string, unknown> = {}) => ({
  choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: OWN, arguments: args } }] }, ...extra }],
});

/** 把輸出裡每行 data 的正文接起來 */
function contentOf(output: string): string {
  return output
    .split("\n")
    .filter((line) => line.startsWith("data: ") && line !== "data: [DONE]")
    .map((line) => {
      const json: any = JSON.parse(line.slice(6));
      if (json.choices) return json.choices.map((choice: any) => choice.delta?.content ?? choice.message?.content ?? "").join("");
      if (json.candidates) {
        return json.candidates
          .map((candidate: any) => (candidate.content?.parts ?? []).map((part: any) => part.text ?? "").join(""))
          .join("");
      }
      return "";
    })
    .join("");
}

describe("restoreStreamBody", () => {
  it("streams tool arguments out as content as they arrive", async () => {
    const { output, stats } = await run([
      data({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: "c1", function: { name: OWN, arguments: '{"conte' } }] } }] }),
      data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'nt":"你好' } }] } }] }),
      data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '，世界"}' } }] } }] }),
      data({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] }),
      "data: [DONE]\n\n",
    ]);
    expect(contentOf(output)).toBe("你好，世界");
    expect(output).not.toContain("tool_calls");
    expect(output).toContain('"finish_reason":"stop"');
    expect(output.trim().endsWith("data: [DONE]")).toBe(true);
    expect(stats).toMatchObject({ syntheticSeen: true, plainWon: false, decodedChars: 5 });
  });

  it("handles a Gemini-style call sent whole without index or id", async () => {
    const { output, stats } = await run([
      data({
        choices: [{
          index: 0,
          delta: { role: "assistant", tool_calls: [{ id: "", type: "function", function: { name: OWN, arguments: JSON.stringify({ content: "整段\n回覆" }) } }] },
          finish_reason: "stop",
        }],
      }),
    ]);
    expect(contentOf(output)).toBe("整段\n回覆");
    expect(stats.syntheticSeen).toBe(true);
  });

  it("holds content when both channels have text, keeps the longest and sends heartbeats", async () => {
    const { output, stats } = await run([
      data({ choices: [{ index: 0, delta: { content: "好的，" } }] }),
      data(ownCall(JSON.stringify({ content: "這是完整的長回覆" }))),
      data({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
    ]);
    expect(output).toContain(": keep-alive");
    expect(contentOf(output)).toBe("這是完整的長回覆");
    expect(stats).toMatchObject({ contentConflict: true, plainWon: false, decodedChars: 8 });
  });

  it("lets the plain channel win when it is longer", async () => {
    const { output, stats } = await run([
      data({ choices: [{ index: 0, delta: { content: "一般正文比較長的內容" } }] }),
      data(ownCall('{"content":"短"}', { finish_reason: "stop" })),
    ]);
    expect(contentOf(output)).toBe("一般正文比較長的內容");
    expect(stats.plainWon).toBe(true);
  });

  it("keeps client tool calls untouched", async () => {
    const { output, stats } = await run([
      data({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: "w1", function: { name: "get_weather", arguments: '{"city":"台北"}' } }] }, finish_reason: "tool_calls" }] }),
    ]);
    expect(output).toContain('"name":"get_weather"');
    expect(output).toContain('"finish_reason":"tool_calls"');
    expect(stats.syntheticSeen).toBe(false);
  });

  it("strips only its own call when the model also calls a client tool", async () => {
    const { output } = await run([
      data({
        choices: [{
          index: 0,
          delta: {
            tool_calls: [
              { index: 0, id: "a", function: { name: OWN, arguments: '{"content":"正文"}' } },
              { index: 1, id: "w1", function: { name: "get_weather", arguments: "{}" } },
            ],
          },
          finish_reason: "tool_calls",
        }],
      }),
    ]);
    expect(contentOf(output)).toBe("正文");
    expect(output).toContain('"name":"get_weather"');
    expect(output).not.toContain(OWN);
    expect(output).toContain('"finish_reason":"tool_calls"');
  });

  it("flushes held content when the stream ends without a finish reason", async () => {
    const { output } = await run([data({ choices: [{ index: 0, delta: { content: "被切掉的正文" } }] })]);
    expect(contentOf(output)).toBe("被切掉的正文");
  });

  it("sends held content before [DONE]", async () => {
    const { output } = await run([data({ choices: [{ index: 0, delta: { content: "正文" } }] }), "data: [DONE]\n\n"]);
    expect(output.indexOf("正文")).toBeGreaterThan(-1);
    expect(output.indexOf("正文")).toBeLessThan(output.indexOf("data: [DONE]"));
  });

  it("works with single-newline line breaks and CRLF", async () => {
    const single = await run([`data: ${JSON.stringify(ownCall('{"content":"單行"}', { finish_reason: "stop" }))}\n`]);
    expect(contentOf(single.output)).toBe("單行");
    const crlf = await run([`data: ${JSON.stringify(ownCall('{"content":"換行"}', { finish_reason: "stop" }))}\r`, "\n\r\ndata: [DONE]\r\n\r\n"]);
    expect(contentOf(crlf.output)).toBe("換行");
  });

  it("reframes a JSON-array stream into SSE", async () => {
    const body = JSON.stringify([ownCall('{"content":"陣列格式"}'), { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }]);
    const { output } = await run([body.slice(0, 40), body.slice(40)]);
    expect(contentOf(output)).toBe("陣列格式");
    expect(output.trim().endsWith("data: [DONE]")).toBe(true);
  });

  it("restores Gemini native functionCall parts", async () => {
    const { output } = await run([
      data({ candidates: [{ index: 0, content: { role: "model", parts: [{ functionCall: { name: OWN, args: { content: "原生格式" } } }] }, finishReason: "STOP" }] }),
    ]);
    expect(contentOf(output)).toBe("原生格式");
  });

  it("passes a whole JSON body through untouched", async () => {
    const body = JSON.stringify({ choices: [{ message: { content: "x" } }] });
    expect((await run([body])).output).toBe(body);
  });
});
