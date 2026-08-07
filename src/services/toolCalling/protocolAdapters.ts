import type { ToolCall, ToolResult } from "./types";

export type ToolProtocol = "auto" | "native" | "text" | "disabled";

export interface OpenAIToolDefinition {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
}

export interface ToolCallParseError {
  id?: string;
  name?: string;
  error: string;
}

export interface ParsedGeneration {
  content: string;
  toolCalls: ToolCall[];
  errors?: ToolCallParseError[];
  raw?: unknown;
}

export interface ToolCallAccumulator {
  calls: Map<string, { index: number; id: string; name: string; arguments: string }>;
}

export interface ToolProtocolAdapter {
  buildRequestTools(tools: OpenAIToolDefinition[]): unknown[] | undefined;
  parseGeneration(raw: any, accumulator?: ToolCallAccumulator): ParsedGeneration;
  appendToolResult(result: ToolResult): unknown;
  isUnsupportedToolsError(error: unknown): boolean;
  createAccumulator(): ToolCallAccumulator;
}

const makeAccumulator = (): ToolCallAccumulator => ({ calls: new Map() });

function parseArguments(id: string, name: string, raw: string): { call?: ToolCall; error?: ToolCallParseError } {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { error: { id, name, error: "Tool arguments must be a JSON object" } };
    }
    return { call: { id, name, arguments: value as Record<string, unknown> } };
  } catch (error) {
    return { error: { id, name, error: `Invalid tool arguments JSON: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

function unsupportedToolsError(error: unknown): boolean {
  const source = error as { status?: number; message?: string; error?: { message?: string } };
  if (source?.status !== 400 && source?.status !== 422) return false;
  const message = String(source.message ?? source.error?.message ?? error ?? "").toLowerCase();
  return /(?:tool_calls?|tools?)[^\n]*(?:not supported|unsupported|unknown|unrecognized|invalid field)|(?:not supported|unsupported|unknown|unrecognized)[^\n]*(?:tool_calls?|tools?)/i.test(message);
}

export class OpenAIToolProtocolAdapter implements ToolProtocolAdapter {
  createAccumulator = makeAccumulator;

  buildRequestTools(tools: OpenAIToolDefinition[]): unknown[] | undefined {
    return tools.length ? tools.map((tool) => ({ type: "function", function: tool })) : undefined;
  }

  parseGeneration(raw: any, accumulator = makeAccumulator()): ParsedGeneration {
    void accumulator;
    const choice = raw?.choices?.[0] ?? {};
    const message = choice.message ?? {};
    const delta = choice.delta ?? {};
    const calls = message.tool_calls ?? delta.tool_calls ?? [];
    for (const entry of calls) {
      const index = Number.isInteger(entry.index) ? entry.index : 0;
      const key = entry.id ? String(entry.id) : [...accumulator.calls.entries()].find(([, value]) => value.index === index)?.[0] ?? `index:${index}`;
      const current = accumulator.calls.get(key) ?? { index, id: entry.id ?? `call-${index}`, name: "", arguments: "" };
      current.index = index;
      if (entry.id) current.id = entry.id;
      if (entry.function?.name) current.name += entry.function.name;
      if (typeof entry.function?.arguments === "string") current.arguments += entry.function.arguments;
      accumulator.calls.set(key, current);
    }
    const toolCalls: ToolCall[] = [];
    const errors: ToolCallParseError[] = [];
    for (const current of [...accumulator.calls.values()].sort((a, b) => a.index - b.index)) {
      const parsed = parseArguments(current.id, current.name, current.arguments);
      if (parsed.call) toolCalls.push(parsed.call);
      else if (parsed.error) errors.push(parsed.error);
    }
    return { content: typeof message.content === "string" ? message.content : typeof choice.text === "string" ? choice.text : "", toolCalls, ...(errors.length ? { errors } : {}), raw };
  }

  appendToolResult(result: ToolResult): unknown {
    return { role: "tool", tool_call_id: result.toolCallId, content: result.content };
  }

  isUnsupportedToolsError(error: unknown): boolean { return unsupportedToolsError(error); }
}

export class ClaudeToolProtocolAdapter implements ToolProtocolAdapter {
  createAccumulator = makeAccumulator;

  buildRequestTools(tools: OpenAIToolDefinition[]): unknown[] | undefined {
    return tools.length ? tools.map(({ name, description, parameters }) => ({ name, description: description ?? "", input_schema: parameters })) : undefined;
  }

  parseGeneration(raw: any, accumulator = makeAccumulator()): ParsedGeneration {
    void accumulator;
    const blocks = Array.isArray(raw?.content) ? raw.content : [];
    const text = blocks.filter((block: any) => block?.type === "text").map((block: any) => block.text ?? "").join("");
    const toolCalls: ToolCall[] = [];
    const errors: ToolCallParseError[] = [];
    for (const block of blocks.filter((item: any) => item?.type === "tool_use")) {
      if (!block.input || typeof block.input !== "object" || Array.isArray(block.input)) errors.push({ id: block.id, name: block.name, error: "Tool arguments must be a JSON object" });
      else toolCalls.push({ id: String(block.id), name: String(block.name), arguments: block.input });
    }
    return { content: text, toolCalls, ...(errors.length ? { errors } : {}), raw };
  }

  appendToolResult(result: ToolResult): unknown {
    return { role: "user", content: [{ type: "tool_result", tool_use_id: result.toolCallId, content: result.content, ...(result.ok ? {} : { is_error: true }) }] };
  }

  isUnsupportedToolsError(error: unknown): boolean { return unsupportedToolsError(error); }
}

const FENCED_TOOL_CALLS = /```tool_calls\s*\n([\s\S]*?)\n?```/gi;

export class TextToolProtocolAdapter implements ToolProtocolAdapter {
  createAccumulator = makeAccumulator;
  buildRequestTools(): undefined { return undefined; }

  parseGeneration(raw: any): ParsedGeneration {
    const source = typeof raw === "string" ? raw : String(raw?.content ?? "");
    const toolCalls: ToolCall[] = [];
    const errors: ToolCallParseError[] = [];
    const content = source.replace(FENCED_TOOL_CALLS, (_match, body: string) => {
      try {
        const parsed: unknown = JSON.parse(body);
        const entries = Array.isArray(parsed) ? parsed : [parsed];
        for (const entry of entries) {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new Error("Tool call must be an object");
          const item = entry as Record<string, unknown>;
          if (typeof item.name !== "string" || typeof item.id !== "string" || !item.arguments || typeof item.arguments !== "object" || Array.isArray(item.arguments)) throw new Error("Tool call requires id, name and object arguments");
          toolCalls.push({ id: item.id, name: item.name, arguments: item.arguments as Record<string, unknown> });
        }
      } catch (error) {
        errors.push({ error: `Invalid tool_calls JSON: ${error instanceof Error ? error.message : String(error)}` });
      }
      return "";
    });
    return { content, toolCalls, ...(errors.length ? { errors } : {}), raw };
  }

  appendToolResult(result: ToolResult): unknown {
    return { role: "user", content: `Tool result (${result.name}, ${result.toolCallId}): ${result.content}` };
  }

  isUnsupportedToolsError(error: unknown): boolean { return unsupportedToolsError(error); }
}

class DisabledToolProtocolAdapter extends OpenAIToolProtocolAdapter {
  buildRequestTools(): undefined { return undefined; }
  parseGeneration(raw: any): ParsedGeneration {
    const choice = raw?.choices?.[0] ?? {};
    return { content: typeof choice.message?.content === "string" ? choice.message.content : typeof raw?.content === "string" ? raw.content : "", toolCalls: [], raw };
  }
  appendToolResult(result: ToolResult): unknown { return { role: "user", content: result.content }; }
}

export function createToolProtocolAdapter(protocol: ToolProtocol, claude = false): ToolProtocolAdapter {
  if (protocol === "disabled") return new DisabledToolProtocolAdapter();
  if (protocol === "text") return new TextToolProtocolAdapter();
  if (claude) return new ClaudeToolProtocolAdapter();
  return new OpenAIToolProtocolAdapter();
}
