import { describe, expect, it } from "vitest";
import { restoreJsonPayload } from "../jsonRestorer";

const OWN = "dispatch_stream_payload_0123456789abcdef";
const ctx = { toolName: OWN, clientToolNames: new Set(["get_weather"]) };
const call = (name: string, args: string, id = "c") => ({ id, type: "function", function: { name, arguments: args } });

describe("restoreJsonPayload", () => {
  it("moves the tool argument into message.content", () => {
    const data: any = { choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [call(OWN, '{"content":"完整回覆"}')] } }] };
    const stats = restoreJsonPayload(data, ctx);
    expect(data.choices[0].message).toEqual({ content: "完整回覆" });
    expect(data.choices[0].finish_reason).toBe("stop");
    expect(stats).toMatchObject({ syntheticSeen: true, plainWon: false, decodedChars: 4 });
  });

  it("keeps client tool calls next to the restored text", () => {
    const data: any = {
      choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [call(OWN, '{"content":"正文"}'), call("get_weather", "{}", "w")] } }],
    };
    restoreJsonPayload(data, ctx);
    expect(data.choices[0].message.content).toBe("正文");
    expect(data.choices[0].message.tool_calls).toEqual([call("get_weather", "{}", "w")]);
    expect(data.choices[0].finish_reason).toBe("tool_calls");
  });

  it("salvages a truncated argument string and drops unreadable own calls", () => {
    const data: any = { choices: [{ message: { content: "", tool_calls: [call(OWN, '{"content":"寫到一半'), call(OWN, "", "c2")] } }] };
    restoreJsonPayload(data, ctx);
    expect(data.choices[0].message.content).toBe("寫到一半");
    expect(data.choices[0].message.tool_calls).toBeUndefined();
  });

  it("keeps the longer plain content and reports it", () => {
    const data: any = { choices: [{ message: { content: "一般正文比較長", tool_calls: [call(OWN, '{"content":"短"}')] } }] };
    expect(restoreJsonPayload(data, ctx).plainWon).toBe(true);
    expect(data.choices[0].message.content).toBe("一般正文比較長");
  });

  it("leaves responses without its tool alone", () => {
    const data: any = { choices: [{ message: { content: "普通" } }] };
    expect(restoreJsonPayload(data, ctx).syntheticSeen).toBe(false);
    expect(data).toEqual({ choices: [{ message: { content: "普通" } }] });
    expect(restoreJsonPayload(null, ctx).syntheticSeen).toBe(false);
  });
});
