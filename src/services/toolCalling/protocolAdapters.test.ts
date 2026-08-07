import { describe, expect, it } from "vitest";
import {
  ClaudeToolProtocolAdapter,
  OpenAIToolProtocolAdapter,
  TextToolProtocolAdapter,
  createToolProtocolAdapter,
} from "./protocolAdapters";

const definition = { name: "get_time", description: "time", parameters: { type: "object" as const } };

describe("tool protocol adapters", () => {
  it("parses an OpenAI non-stream response while preserving text", () => {
    const result = new OpenAIToolProtocolAdapter().parseGeneration({
      choices: [{ message: { content: "I can check that.", tool_calls: [{ id: "call-1", type: "function", function: { name: "get_time", arguments: '{"tz":"UTC"}' } }] } }],
    });
    expect(result.content).toBe("I can check that.");
    expect(result.toolCalls).toEqual([{ id: "call-1", name: "get_time", arguments: { tz: "UTC" } }]);
  });

  it("accumulates fragmented OpenAI deltas by index", () => {
    const adapter = new OpenAIToolProtocolAdapter();
    const accumulator = adapter.createAccumulator();
    adapter.parseGeneration({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call-1", function: { name: "get_", arguments: '{"tz":' } }] } }] }, accumulator);
    const result = adapter.parseGeneration({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "time", arguments: '"UTC"}' } }] } }] }, accumulator);
    expect(result.toolCalls).toEqual([{ id: "call-1", name: "get_time", arguments: { tz: "UTC" } }]);
  });

  it("parses Claude tool_use and appends tool_result blocks", () => {
    const adapter = new ClaudeToolProtocolAdapter();
    const result = adapter.parseGeneration({ content: [{ type: "text", text: "Working" }, { type: "tool_use", id: "u1", name: "get_time", input: { tz: "UTC" } }] });
    expect(result.content).toBe("Working");
    expect(result.toolCalls).toEqual([{ id: "u1", name: "get_time", arguments: { tz: "UTC" } }]);
    expect(adapter.appendToolResult({ toolCallId: "u1", name: "get_time", content: "12:00", ok: true })).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "u1", content: "12:00" }] });
  });

  it("parses and removes fenced text fallback tool_calls", () => {
    const result = new TextToolProtocolAdapter().parseGeneration({ content: 'Before\n```tool_calls\n[{"id":"x","name":"get_time","arguments":{}}]\n```\nAfter' });
    expect(result.content).toBe("Before\n\nAfter");
    expect(result.toolCalls).toEqual([{ id: "x", name: "get_time", arguments: {} }]);
  });

  it("reports invalid JSON and only auto-falls back for explicit unsupported errors", () => {
    const result = new TextToolProtocolAdapter().parseGeneration({ content: "```tool_calls\nnot-json\n```" });
    expect(result.toolCalls).toEqual([]);
    expect(result.errors?.[0].error).toMatch(/JSON/i);
    const adapter = new OpenAIToolProtocolAdapter();
    expect(adapter.isUnsupportedToolsError({ status: 400, message: "tools are not supported" })).toBe(true);
    expect(adapter.isUnsupportedToolsError({ status: 422, message: "unknown field tools" })).toBe(true);
    expect(adapter.isUnsupportedToolsError({ status: 401, message: "tools are not supported" })).toBe(false);
    expect(adapter.isUnsupportedToolsError({ status: 500, message: "tools are not supported" })).toBe(false);
  });

  it("builds native definitions and disabled adapter omits them", () => {
    expect(createToolProtocolAdapter("native").buildRequestTools([definition])).toEqual([{ type: "function", function: definition }]);
    expect(createToolProtocolAdapter("disabled").buildRequestTools([definition])).toBeUndefined();
  });

  it("extracts Claude text blocks and keeps DeepSeek reasoning fallback intact", () => {
    expect(new TextToolProtocolAdapter().parseGeneration({ content: [{ type: "text", text: "hello" }] }).content).toBe("hello");
    expect(new OpenAIToolProtocolAdapter().parseGeneration({ choices: [{ message: { content: "", reasoning_content: "reason" } }] }).content).toBe("");
  });
});
