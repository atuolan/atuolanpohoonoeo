import { describe, expect, it } from "vitest";
import type { APIMessage } from "@/api/OpenAICompatible";
import { applyTextToolProtocol, buildTextToolInstructions, convertToolMessagesToText, insertToolInstructions, TOOL_INSTRUCTIONS_IDENTIFIER } from "./textToolPrompt";

const tools = [{ name: "get_time", description: "查時間", parameters: { type: "object", properties: { tz: { type: "string" } } } }];

describe("text tool protocol", () => {
  it("lists every tool with its parameters and the call format", () => {
    const text = buildTextToolInstructions(tools);
    expect(text).toContain("- get_time：查時間");
    expect(text).toContain('{"type":"object","properties":{"tz":{"type":"string"}}}');
    expect(text).toContain("```tool_calls");
  });

  it("turns native tool history into plain text", () => {
    const messages: APIMessage[] = [
      { role: "user", content: "幾點？" },
      { role: "assistant", content: "我看一下", tool_calls: [{ id: "c1", type: "function", function: { name: "get_time", arguments: '{"tz":"Asia/Taipei"}' } }] },
      { role: "tool", content: "12:00", tool_call_id: "c1" },
    ];
    expect(convertToolMessagesToText(messages)).toEqual([
      { role: "user", content: "幾點？" },
      { role: "assistant", content: '我看一下\n```tool_calls\n[{"id":"c1","name":"get_time","arguments":{"tz":"Asia/Taipei"}}]\n```' },
      { role: "user", content: "工具結果（get_time，c1）：12:00" },
    ]);
  });

  it("inserts the instructions after the leading system messages", () => {
    const result = insertToolInstructions([{ role: "system", content: "A" }, { role: "system", content: "B" }, { role: "user", content: "hi" }], "TOOLS");
    expect(result.map((message) => message.content)).toEqual(["A", "B", "TOOLS", "hi"]);
    expect(result[2]).toMatchObject({ role: "system", identifier: TOOL_INSTRUCTIONS_IDENTIFIER });
  });

  it("puts the instructions first when there is no system message", () => {
    expect(insertToolInstructions([{ role: "user", content: "hi" }], "TOOLS").map((message) => message.content)).toEqual(["TOOLS", "hi"]);
  });

  it("does not mutate the caller's messages", () => {
    const messages: APIMessage[] = [{ role: "user", content: "hi" }];
    applyTextToolProtocol(messages, tools);
    expect(messages).toEqual([{ role: "user", content: "hi" }]);
  });
});
