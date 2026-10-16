import type { APIMessage, ImageContent, TextContent } from "@/api/OpenAICompatible";
import { isToolAllowed } from "./permissions";
import { validateJsonSchema } from "./jsonSchema";
import type { ToolRegistry } from "./toolRegistry";
import type { CharacterToolPermissions } from "@/types/character";
import type { ChatToolContext, ChatToolDefinition, PendingToolConfirmation, ToolCall, ToolImage, ToolResult } from "./types";

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

interface RunState {
  messages: APIMessage[];
  context: ToolExecutionRequestContext;
  toolResults: ToolResult[];
  seen: Set<string>;
  round: number;
  calls: ToolCall[];
  callIndex: number;
  generatedContent: string;
  /** 最近一次非空的生成文字；最後一輪沒有文字時拿來當回覆 */
  lastNonEmptyContent: string;
  assistantMessageAppended: boolean;
  /** 這一輪工具回傳、還沒交給模型的圖片 */
  pendingImages: ToolImage[];
  /** 帶圖 user 訊息在 messages 裡的位置；模型接受後清掉 */
  imageMessageIndex?: number;
}

interface PendingState extends RunState {
  pending: PendingToolConfirmation;
}

export interface ToolExecutionEngineOptions {
  registry: ToolRegistry;
  generate: ToolGenerate;
  timeoutMs?: number;
  maxRounds?: number;
  maxResultChars?: number;
  /** 工具開始執行（或開始等確認）時呼叫 */
  onCallStart?: (call: ToolCall, tool: ChatToolDefinition) => void;
  /** 工具有結果時呼叫（含失敗與拒絕；重複呼叫不通知） */
  onCallEnd?: (call: ToolCall, tool: ChatToolDefinition | undefined, result: ToolResult) => void;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ROUNDS = 5;
const DEFAULT_MAX_RESULT_CHARS = 8_000;
const DUPLICATE_CALL = "Duplicate tool call";
const REJECTED = "Tool call rejected by user";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractImages(value: unknown): ToolImage[] {
  if (!isRecord(value) || !Array.isArray(value.images)) return [];
  return value.images.filter((image): image is ToolImage => isRecord(image) && typeof image.mimeType === "string" && typeof image.data === "string" && image.data.length > 0);
}

function extractLoadTools(value: unknown): ChatToolDefinition[] {
  if (!isRecord(value) || !Array.isArray(value.loadTools)) return [];
  return value.loadTools.filter((tool): tool is ChatToolDefinition => isRecord(tool) && typeof tool.name === "string" && typeof tool.execute === "function");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  private readonly onCallStart?: ToolExecutionEngineOptions["onCallStart"];
  private readonly onCallEnd?: ToolExecutionEngineOptions["onCallEnd"];

  constructor(options: ToolExecutionEngineOptions) {
    this.registry = options.registry;
    this.generate = options.generate;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS;
    this.maxResultChars = options.maxResultChars ?? DEFAULT_MAX_RESULT_CHARS;
    this.onCallStart = options.onCallStart;
    this.onCallEnd = options.onCallEnd;
  }

  async run(initialMessages: APIMessage[], requestContext: ToolExecutionRequestContext): Promise<ToolExecutionOutcome> {
    const state: RunState = {
      messages: initialMessages.map((message) => ({ ...message })),
      context: requestContext,
      toolResults: [],
      seen: new Set<string>(),
      round: 0,
      calls: [],
      callIndex: 0,
      generatedContent: "",
      lastNonEmptyContent: "",
      assistantMessageAppended: false,
      pendingImages: [],
    };
    return this.continue(state);
  }

  async resolveToolConfirmation(id: string, decision: "approve" | "reject"): Promise<ToolExecutionOutcome> {
    const state = this.pending.get(id);
    if (!state) throw new Error("Tool confirmation expired or cancelled");
    this.pending.delete(id);
    const { toolCall, tool } = state.pending;
    if (decision === "reject") {
      this.appendResult(state, { toolCallId: toolCall.id, name: toolCall.name, content: REJECTED, ok: false, error: REJECTED, rejected: true }, toolCall, tool);
    } else {
      const result = await this.executeCall(tool, toolCall, state.context);
      this.appendResult(state, result, toolCall, tool);
    }
    state.callIndex += 1;
    return this.continueCalls(state);
  }

  cancel(chatId?: string): void {
    for (const [id, state] of this.pending) if (chatId === undefined || state.context.chatId === chatId) this.pending.delete(id);
  }

  private async continue(state: RunState): Promise<ToolExecutionOutcome> {
    while (state.round < this.maxRounds) {
      if (state.context.signal?.aborted) return this.complete(state, "工具執行已取消");
      state.round += 1;
      let generated: ToolGenerationResult;
      try { generated = await this.generateWithImageFallback(state); }
      catch (error) { return this.complete(state, `工具生成失敗：${errorMessage(error)}`); }
      state.generatedContent = generated.content ?? "";
      if (state.generatedContent.trim()) state.lastNonEmptyContent = state.generatedContent;
      state.calls = generated.toolCalls ?? [];
      state.callIndex = 0;
      state.assistantMessageAppended = false;
      if (!state.calls.length) return this.complete(state, state.generatedContent || state.lastNonEmptyContent);
      const outcome = await this.continueCalls(state);
      if (outcome.status === "confirmation_required") return outcome;
      if (outcome.content !== "") return outcome;
    }
    state.toolResults.push({ toolCallId: "round-cap", name: "tool_execution", content: "Maximum tool execution rounds reached", ok: false, error: "Maximum tool execution rounds reached" });
    return this.complete(state, state.generatedContent || state.lastNonEmptyContent || "Maximum tool execution rounds reached");
  }

  /** 帶圖的請求失敗時，把圖片換成文字說明再試一次（模型可能不支援看圖） */
  private async generateWithImageFallback(state: RunState): Promise<ToolGenerationResult> {
    try {
      const generated = await this.generate(state.messages, state.context);
      state.imageMessageIndex = undefined;
      return generated;
    } catch (error) {
      if (state.context.signal?.aborted || !this.stripImages(state)) throw error;
      return this.generate(state.messages, state.context);
    }
  }

  private stripImages(state: RunState): boolean {
    const index = state.imageMessageIndex;
    if (index === undefined) return false;
    const content = state.messages[index]?.content;
    const count = Array.isArray(content) ? content.filter((part) => part.type === "image_url").length : 0;
    state.messages[index] = { role: "user", content: `（工具回傳了 ${count} 張圖片，但目前的模型無法看圖）` };
    state.imageMessageIndex = undefined;
    return true;
  }

  private async continueCalls(state: RunState): Promise<ToolExecutionOutcome> {
    if (state.calls.length && !state.assistantMessageAppended) {
      state.messages.push({ role: "assistant", content: state.generatedContent, tool_calls: state.calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: JSON.stringify(call.arguments) } })) });
      state.assistantMessageAppended = true;
    }
    while (state.callIndex < state.calls.length) {
      const call = state.calls[state.callIndex];
      const tool = this.registry.get(call.name);
      const signature = `${call.name}:${stable(call.arguments)}`;
      if (state.seen.has(signature)) {
        if (!state.toolResults.some((result) => result.error === DUPLICATE_CALL)) {
          this.appendResult(state, this.failure(call, DUPLICATE_CALL), call, tool, false);
        }
        state.callIndex += 1;
        continue;
      }
      state.seen.add(signature);
      if (!tool) { this.appendResult(state, this.failure(call, "Unknown tool"), call, tool); state.callIndex += 1; continue; }
      if (!isToolAllowed(tool, state.context.globalEnabled ?? true, state.context.permissions)) { this.appendResult(state, this.failure(call, "Tool is not authorized"), call, tool); state.callIndex += 1; continue; }
      if (!call.arguments || typeof call.arguments !== "object" || Array.isArray(call.arguments)) { this.appendResult(state, this.failure(call, "Tool arguments must be an object"), call, tool); state.callIndex += 1; continue; }
      const validation = validateJsonSchema(tool.parameters, call.arguments);
      if (!validation.ok) { this.appendResult(state, this.failure(call, `Invalid tool arguments: ${validation.error}`), call, tool); state.callIndex += 1; continue; }
      this.onCallStart?.(call, tool);
      if (tool.risk === "high") {
        const pending: PendingToolConfirmation = { id: makeId(), chatId: state.context.chatId, toolCall: call, tool, createdAt: Date.now() };
        this.pending.set(pending.id, { ...state, pending });
        setTimeout(() => {
          if (this.pending.get(pending.id)?.pending === pending) this.pending.delete(pending.id);
        }, 5 * 60 * 1000);
        return { status: "confirmation_required", pending };
      }
      const result = await this.executeCall(tool, call, state.context);
      this.appendResult(state, result, call, tool);
      state.callIndex += 1;
    }
    this.flushImages(state);
    return this.continue(state);
  }

  private appendResult(state: RunState, result: ToolResult, call: ToolCall, tool: ChatToolDefinition | undefined, notify = true): void {
    state.toolResults.push(result);
    state.messages.push({ role: "tool", content: result.content, tool_call_id: result.toolCallId });
    if (result.images?.length) state.pendingImages.push(...result.images);
    if (notify) this.onCallEnd?.(call, tool, result);
  }

  /** OpenAI 格式的 tool 訊息不能放圖片，所以一輪的圖片集中成一則 user 訊息 */
  private flushImages(state: RunState): void {
    if (!state.pendingImages.length) return;
    const parts: Array<TextContent | ImageContent> = [{ type: "text", text: "以下是工具回傳的圖片：" }];
    for (const image of state.pendingImages) {
      parts.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
    }
    state.messages.push({ role: "user", content: parts });
    state.imageMessageIndex = state.messages.length - 1;
    state.pendingImages = [];
  }

  private failure(call: ToolCall, error: string): ToolResult { return { toolCallId: call.id, name: call.name, content: error, ok: false, error }; }

  private async executeCall(tool: ChatToolDefinition, call: ToolCall, requestContext: ToolExecutionRequestContext): Promise<ToolResult> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (requestContext.signal) requestContext.signal.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutMs = tool.timeoutMs ?? this.timeoutMs;
    try {
      const promise = Promise.resolve(tool.execute(call.arguments, { ...requestContext, signal: controller.signal } as ChatToolContext));
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("Tool timed out")); }, timeoutMs); });
      const value = await Promise.race([promise, timeout]);
      for (const loaded of extractLoadTools(value)) {
        if (this.registry.get(loaded.name)) continue;
        try { this.registry.register(loaded); } catch (error) { console.warn("[MCP] 略過無法註冊的工具", loaded.name, error); }
      }
      const raw = resultText(value);
      const content = raw.length > this.maxResultChars ? `${raw.slice(0, this.maxResultChars - 14)}...[truncated]` : raw;
      const images = extractImages(value);
      return { toolCallId: call.id, name: call.name, content, ok: true, ...(images.length ? { images } : {}) };
    } catch (error) {
      const message = errorMessage(error);
      return { toolCallId: call.id, name: call.name, content: message, ok: false, error: message };
    } finally {
      if (timer) clearTimeout(timer);
      requestContext.signal?.removeEventListener("abort", abort);
    }
  }

  private complete(state: RunState, content: string): ToolExecutionOutcome { return { status: "completed", content, messages: state.messages, toolResults: state.toolResults }; }
}
