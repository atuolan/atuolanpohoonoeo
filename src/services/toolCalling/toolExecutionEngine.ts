import type { APIMessage } from "@/api/OpenAICompatible";
import { isToolAllowed } from "./permissions";
import { validateJsonSchema } from "./jsonSchema";
import type { ToolRegistry } from "./toolRegistry";
import type { CharacterToolPermissions } from "@/types/character";
import type { ChatToolContext, ChatToolDefinition, PendingToolConfirmation, ToolCall, ToolResult } from "./types";

export interface ToolExecutionRequestContext {
  chatId?: string;
  characterId?: string;
  globalEnabled?: boolean;
  permissions?: CharacterToolPermissions | null;
  signal?: AbortSignal;
  [key: string]: unknown;
}

export interface ToolGenerationResult {
  content: string;
  toolCalls?: ToolCall[];
}

export type ToolGenerate = (messages: APIMessage[], context: ToolExecutionRequestContext) => Promise<ToolGenerationResult>;

export type ToolExecutionOutcome =
  | { status: "completed"; content: string; messages: APIMessage[]; toolResults: ToolResult[] }
  | { status: "confirmation_required"; pending: PendingToolConfirmation };

interface PendingState {
  pending: PendingToolConfirmation;
  messages: APIMessage[];
  context: ToolExecutionRequestContext;
  toolResults: ToolResult[];
  seen: Set<string>;
  round: number;
  calls: ToolCall[];
  callIndex: number;
  generatedContent: string;
}

export interface ToolExecutionEngineOptions {
  registry: ToolRegistry;
  generate: ToolGenerate;
  timeoutMs?: number;
  maxRounds?: number;
  maxResultChars?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ROUNDS = 5;
const DEFAULT_MAX_RESULT_CHARS = 8_000;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function resultText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && typeof (value as { summary?: unknown }).summary === "string") {
    const summary = (value as { summary: string }).summary;
    const data = (value as { data?: unknown }).data;
    return data === undefined ? summary : `${summary}\n${JSON.stringify(data)}`;
  }
  return JSON.stringify(value);
}

function makeId(): string {
  const cryptoApi = globalThis.crypto as Crypto & { randomUUID?: () => string } | undefined;
  return cryptoApi?.randomUUID?.() ?? `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class ToolExecutionEngine {
  private readonly pending = new Map<string, PendingState>();
  private readonly registry: ToolRegistry;
  private readonly generate: ToolGenerate;
  private readonly timeoutMs: number;
  private readonly maxRounds: number;
  private readonly maxResultChars: number;

  constructor(options: ToolExecutionEngineOptions) {
    this.registry = options.registry;
    this.generate = options.generate;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.maxResultChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
  }

  async run(initialMessages: APIMessage[], requestContext: ToolExecutionRequestContext): Promise<ToolExecutionOutcome> {
    const state = {
      messages: initialMessages.map((message) => ({ ...message })),
      context: requestContext,
      toolResults: [] as ToolResult[],
      seen: new Set<string>(),
      round: 0,
      calls: [] as ToolCall[],
      callIndex: 0,
      generatedContent: "",
    };
    return this.continue(state);
  }

  async resolveToolConfirmation(id: string, decision: "approve" | "reject"): Promise<ToolExecutionOutcome> {
    const state = this.pending.get(id);
    if (!state) throw new Error("Tool confirmation expired or cancelled");
    this.pending.delete(id);
    if (decision === "reject") {
      this.appendResult(state, { toolCallId: state.pending.toolCall.id, name: state.pending.toolCall.name, content: "Tool call rejected by user", ok: false, error: "Tool call rejected by user" });
    } else {
      const result = await this.executeCall(state.pending.tool, state.pending.toolCall, state.context);
      this.appendResult(state, result);
    }
    state.callIndex += 1;
    return this.continueCalls(state);
  }

  cancel(chatId?: string): void {
    for (const [id, state] of this.pending) if (chatId === undefined || state.context.chatId === chatId) this.pending.delete(id);
  }

  private async continue(state: Omit<PendingState, "pending">): Promise<ToolExecutionOutcome> {
    while (state.round < this.maxRounds) {
      state.round += 1;
      let generated: ToolGenerationResult;
      try { generated = await this.generate(state.messages, state.context); }
      catch (error) { return this.complete(state, `工具生成失敗：${error instanceof Error ? error.message : String(error)}`); }
      state.generatedContent = generated.content ?? "";
      state.calls = generated.toolCalls ?? [];
      state.callIndex = 0;
      if (!state.calls.length) return this.complete(state, state.generatedContent);
      const outcome = await this.continueCalls(state);
      if (outcome.status === "confirmation_required") return outcome;
      if (outcome.content !== "") return outcome;
    }
    state.toolResults.push({ toolCallId: "round-cap", name: "tool_execution", content: "Maximum tool execution rounds reached", ok: false, error: "Maximum tool execution rounds reached" });
    return this.complete(state, state.generatedContent || "Maximum tool execution rounds reached");
  }

  private async continueCalls(state: Omit<PendingState, "pending">): Promise<ToolExecutionOutcome> {
    if (state.calls.length) {
      state.messages.push({ role: "assistant", content: state.generatedContent, tool_calls: state.calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
    }
    while (state.callIndex < state.calls.length) {
      const call = state.calls[state.callIndex];
      const tool = this.registry.get(call.name);
      const signature = `${call.name}:${stable(call.arguments)}`;
      if (state.seen.has(signature)) {
        if (!state.toolResults.some((result) => result.error === "Duplicate tool call")) {
          this.appendResult(state, { toolCallId: call.id, name: call.name, content: "Duplicate tool call", ok: false, error: "Duplicate tool call" });
        }
        state.callIndex += 1;
        continue;
      }
      state.seen.add(signature);
      if (!tool) { this.appendResult(state, this.failure(call, "Unknown tool")); state.callIndex += 1; continue; }
      if (!isToolAllowed(tool, state.context.globalEnabled ?? true, state.context.permissions)) { this.appendResult(state, this.failure(call, "Tool is not authorized")); state.callIndex += 1; continue; }
      if (!call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) { this.appendResult(state, this.failure(call, "Tool arguments must be an object")); state.callIndex += 1; continue; }
      const validation = validateJsonSchema(tool.parameters, call.arguments);
      if (!validation.ok) { this.appendResult(state, this.failure(call, `Invalid tool arguments: ${validation.error}`)); state.callIndex += 1; continue; }
      if (tool.risk === "high") {
        const pending: PendingToolConfirmation = { id: makeId(), chatId: state.context.chatId, toolCall: call, tool, createdAt: Date.now() };
        this.pending.set(pending.id, { ...state, pending });
        return { status: "confirmation_required", pending };
      }
      const result = await this.executeCall(tool, call, state.context);
      this.appendResult(state, result);
      state.callIndex += 1;
    }
    return this.continue(state);
  }

  private appendResult(state: Omit<PendingState, "pending">, result: ToolResult): void {
    state.toolResults.push(result);
    state.messages.push({ role: "tool", content: result.content, tool_call_id: result.toolCallId });
  }

  private failure(call: ToolCall, error: string): ToolResult { return { toolCallId: call.id, name: call.name, content: error, ok: false, error }; }

  private async executeCall(tool: ChatToolDefinition, call: ToolCall, requestContext: ToolExecutionRequestContext): Promise<ToolResult> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (requestContext.signal) requestContext.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const promise = Promise.resolve(tool.execute(call.arguments, { ...requestContext, signal: controller.signal } as ChatToolContext));
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Tool timed out")); }, this.timeoutMs); });
      const value = await Promise.race([promise, timeout]);
      const raw = resultText(value);
      const content = raw.length > this.maxResultChars ? `${raw.slice(0, this.maxResultChars - 14)}...[truncated]` : raw;
      return { toolCallId: call.id, name: call.name, content, ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { toolCallId: call.id, name: call.name, content: message, ok: false, error: message };
    } finally {
      if (timer) clearTimeout(timer);
      requestContext.signal?.removeEventListener("abort", abort);
    }
  }

  private complete(state: Omit<PendingState, "pending">, content: string): ToolExecutionOutcome { return { status: "completed", content, messages: state.messages, toolResults: state.toolResults }; }
}
