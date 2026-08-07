import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./toolRegistry";
import { filterToolsForCharacter, isToolAllowed } from "./permissions";
import type { ChatToolDefinition } from "./types";

const tool = (overrides: Partial<ChatToolDefinition> = {}): ChatToolDefinition => ({
  name: "get_time",
  description: "time",
  category: "time",
  risk: "low",
  parameters: { type: "object", properties: {}, additionalProperties: false },
  execute: () => "ok",
  ...overrides,
});

describe("tool permissions and registry", () => {
  it("applies global, character, tool, category, then definition defaults", () => {
    const definition = tool({ enabled: false });
    expect(isToolAllowed(definition, false, { enabled: true, categories: {}, tools: {} })).toBe(false);
    expect(isToolAllowed(definition, true, { enabled: false, categories: {}, tools: {} })).toBe(false);
    expect(isToolAllowed(definition, true, { enabled: true, categories: { time: true }, tools: {} })).toBe(true);
    expect(isToolAllowed(definition, true, { enabled: true, categories: { time: true }, tools: { get_time: true } })).toBe(true);
  });

  it("uses a single-tool override before category and rejects unknown tools", () => {
    const definition = tool();
    expect(isToolAllowed(definition, true, { enabled: true, categories: { time: false }, tools: { get_time: true } })).toBe(true);
    expect(isToolAllowed(tool({ name: "missing" }), true, { enabled: true, categories: {}, tools: {} })).toBe(true);
  });

  it("filters a registry and rejects duplicate names", () => {
    const registry = new ToolRegistry([tool(), tool({ name: "play_music", category: "music" })]);
    expect(() => registry.register(tool())).toThrow(/already registered|duplicate/i);
    expect(filterToolsForCharacter(registry, true, { enabled: true, categories: { music: false }, tools: {} }).map((t) => t.name)).toEqual(["get_time"]);
  });

  it("enforces registry name format and emits OpenAI schemas", () => {
    const registry = new ToolRegistry();
    expect(() => registry.register(tool({ name: "Bad-Name" }))).toThrow();
    registry.register(tool());
    expect(registry.toOpenAITools()).toEqual([{ type: "function", function: { name: "get_time", description: "time", parameters: { type: "object", properties: {}, additionalProperties: false } } }]);
  });
});
