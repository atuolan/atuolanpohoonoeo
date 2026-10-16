/**
 * 串流回應還原：把假工具參數改寫回一般正文（delta.content），角色工具呼叫原樣保留。
 * 移植自酒館助手防截斷腳本的 restorer-sse.js，改成逐行處理以配合現有解析。
 */
import { StreamArgDecoder } from "./argDecoder";
import { JsonArraySplitter, flattenJsonElement } from "./jsonArraySplitter";
import { createRestoreStats, type RestoreContext, type RestoreStats } from "./stats";
import { CONTENT_PARAM, classifyToolName, extractBareToolName } from "./toolSpec";

type Json = Record<string, any>;

interface Channel {
  decoder: StreamArgDecoder;
  text: string;
}

interface ChoiceState {
  dialect: "openai" | "google";
  /** 一般正文：先留著，結束時跟工具通道比長短 */
  plain: string;
  /** 已經往下送出的文字 */
  sent: string;
  channels: Map<string, Channel>;
  /** OpenAI tool_calls 的 index → 通道名 */
  slotNames: Map<number, string>;
  activeGoogleChannel?: string;
  sawSynthetic: boolean;
  sawClientCall: boolean;
}

export class StreamContentRestorer {
  readonly stats: RestoreStats = createRestoreStats();
  private readonly states = new Map<number, ChoiceState>();
  private readonly meta = { id: "chatcmpl-anti-truncation", model: "unknown", created: Math.floor(Date.now() / 1000) };

  constructor(private readonly ctx: RestoreContext) {}

  /** 改寫一行 data: 的內容；回傳 undefined 表示這行先不送 */
  transformPayload(payload: string): string | undefined {
    let chunk: Json;
    try {
      const parsed: unknown = JSON.parse(payload);
      if (!parsed || typeof parsed !== "object") return payload;
      chunk = parsed as Json;
    } catch {
      return payload;
    }
    if (typeof chunk.id === "string") this.meta.id = chunk.id;
    if (typeof chunk.model === "string") this.meta.model = chunk.model;
    if (typeof chunk.created === "number") this.meta.created = chunk.created;
    if (Array.isArray(chunk.choices)) return this.rewriteOpenAiChoices(chunk, payload);
    if (Array.isArray(chunk.candidates)) return this.rewriteGoogleCandidates(chunk, payload);
    return payload;
  }

  /** 串流結束或讀到 [DONE]：把還留著的內容做成補送的資料行 */
  finalizePending(): string[] {
    const payloads: string[] = [];
    for (const [index, state] of this.states) {
      const pending = this.finalizeChoice(state);
      if (!pending) continue;
      payloads.push(
        state.dialect === "google"
          ? JSON.stringify({ candidates: [{ index, content: { role: "model", parts: [{ text: pending }] } }] })
          : JSON.stringify({
              id: this.meta.id,
              object: "chat.completion.chunk",
              created: this.meta.created,
              model: this.meta.model,
              choices: [{ index, delta: { content: pending }, finish_reason: null }],
            }),
      );
    }
    return payloads;
  }

  private getState(index: number, dialect: ChoiceState["dialect"]): ChoiceState {
    let state = this.states.get(index);
    if (!state) {
      state = {
        dialect,
        plain: "",
        sent: "",
        channels: new Map(),
        slotNames: new Map(),
        sawSynthetic: false,
        sawClientCall: false,
      };
      this.states.set(index, state);
    }
    state.dialect = dialect;
    return state;
  }

  private getChannel(state: ChoiceState, name: string): Channel {
    let channel = state.channels.get(name);
    if (!channel) {
      channel = { decoder: new StreamArgDecoder(CONTENT_PARAM), text: "" };
      state.channels.set(name, channel);
    }
    return channel;
  }

  private markSynthetic(state: ChoiceState): void {
    state.sawSynthetic = true;
    this.stats.syntheticSeen = true;
  }

  /** 收下工具通道的字：只有工具通道有字時即時送出，否則先留著等結束時仲裁 */
  private absorb(state: ChoiceState, channel: Channel, text: string): string {
    if (!text) return "";
    channel.text += text;
    if (state.plain !== "" || state.channels.size > 1) return "";
    state.sent += text;
    this.stats.decodedChars += text.length;
    return text;
  }

  /** 結束時取最長的一份，回傳還沒送出的部分 */
  private finalizeChoice(state: ChoiceState): string {
    let best = "";
    let bestIsPlain = false;
    let contenders = 0;
    for (const channel of state.channels.values()) {
      channel.text += channel.decoder.finish();
      if (channel.text) contenders += 1;
      if (channel.text.length > best.length) {
        best = channel.text;
        bestIsPlain = false;
      }
      channel.text = "";
    }
    if (state.plain) {
      contenders += 1;
      if (state.plain.length > best.length) {
        best = state.plain;
        bestIsPlain = true;
      }
    }
    state.plain = "";
    if (contenders > 1) {
      this.stats.contentConflict = true;
      if (bestIsPlain) this.stats.plainWon = true;
    }
    const tail = best.startsWith(state.sent) ? best.slice(state.sent.length) : best;
    state.sent += tail;
    if (!bestIsPlain) this.stats.decodedChars += tail.length;
    return tail;
  }

  private rewriteOpenAiChoices(chunk: Json, raw: string): string | undefined {
    let touched = false;
    let anythingToSend = false;
    for (const choice of chunk.choices as unknown[]) {
      if (!choice || typeof choice !== "object") continue;
      const item = choice as Json;
      const index = typeof item.index === "number" ? item.index : 0;
      const state = this.getState(index, "openai");
      const field = item.delta !== undefined ? "delta" : item.message ? "message" : "delta";
      const delta: Json = item[field] ?? {};
      let streamed = "";

      if (Array.isArray(delta.tool_calls)) {
        const { handled, decoded, remaining } = this.consumeToolCalls(state, delta.tool_calls);
        streamed += decoded;
        if (handled) {
          touched = true;
          if (remaining.length > 0) delta.tool_calls = remaining;
          else delete delta.tool_calls;
        }
      }

      if (typeof delta.content === "string" && delta.content) {
        touched = true;
        state.plain += delta.content;
        delete delta.content;
      }

      if (streamed) {
        delta.content = streamed;
        anythingToSend = true;
      }

      const finish = item.finish_reason;
      if (finish !== null && finish !== undefined) {
        touched = true;
        anythingToSend = true;
        const tail = this.finalizeChoice(state);
        if (tail) delta.content = (delta.content ?? "") + tail;
        if (state.sawSynthetic && !state.sawClientCall && finish === "tool_calls") item.finish_reason = "stop";
      }

      if (Object.keys(delta).length > 0) anythingToSend = true;
      item[field] = delta;
    }
    if (!touched) return raw;
    if (!anythingToSend) return undefined;
    return JSON.stringify(chunk);
  }

  private consumeToolCalls(state: ChoiceState, calls: unknown[]): { handled: boolean; decoded: string; remaining: unknown[] } {
    let handled = false;
    let decoded = "";
    const remaining: unknown[] = [];
    for (const raw of calls) {
      if (!raw || typeof raw !== "object") {
        remaining.push(raw);
        continue;
      }
      const call = raw as Json;
      const callIndex = typeof call.index === "number" ? call.index : 0;
      const fn: Json = call.function ?? {};
      const name = typeof fn.name === "string" ? fn.name : "";
      let channelName = state.slotNames.get(callIndex);
      if (name) {
        if (classifyToolName(name, this.ctx.toolName, this.ctx.clientToolNames) === "client") {
          channelName = undefined;
          state.slotNames.delete(callIndex);
        } else {
          channelName = extractBareToolName(name);
          state.slotNames.set(callIndex, channelName);
        }
      }
      if (channelName === undefined) {
        state.sawClientCall = true;
        remaining.push(raw);
        continue;
      }
      handled = true;
      this.markSynthetic(state);
      const channel = this.getChannel(state, channelName);
      const args = typeof fn.arguments === "string" ? fn.arguments : fn.arguments ? JSON.stringify(fn.arguments) : "";
      if (args) decoded += this.absorb(state, channel, channel.decoder.feed(args));
    }
    return { handled, decoded, remaining };
  }

  private rewriteGoogleCandidates(chunk: Json, raw: string): string | undefined {
    let touched = false;
    let anythingToSend = false;
    for (const candidate of chunk.candidates as unknown[]) {
      if (!candidate || typeof candidate !== "object") continue;
      const item = candidate as Json;
      const index = typeof item.index === "number" ? item.index : 0;
      const state = this.getState(index, "google");
      const content: Json = item.content && typeof item.content === "object" ? item.content : {};
      let streamed = "";
      let candidateTouched = false;
      const kept: unknown[] = [];

      if (Array.isArray(content.parts)) {
        for (const part of content.parts as unknown[]) {
          if (!part || typeof part !== "object") {
            kept.push(part);
            continue;
          }
          const entry = part as Json;
          if (entry.functionCall && typeof entry.functionCall === "object") {
            const consumed = this.consumeGoogleCall(state, entry.functionCall);
            if (!consumed.handled) {
              kept.push(part);
              continue;
            }
            streamed += consumed.decoded;
            candidateTouched = true;
            continue;
          }
          if (entry.thought === true) {
            kept.push(part);
            continue;
          }
          if (typeof entry.text === "string" && entry.text) {
            candidateTouched = true;
            state.plain += entry.text;
            continue;
          }
          kept.push(part);
        }
      }

      let emitted = streamed;
      const finished = item.finishReason !== null && item.finishReason !== undefined;
      if (finished) {
        candidateTouched = true;
        emitted += this.finalizeChoice(state);
      }
      if (!candidateTouched) continue;

      touched = true;
      const nextParts = emitted ? [{ text: emitted }, ...kept] : kept;
      content.parts = nextParts;
      if (typeof content.role !== "string") content.role = "model";
      item.content = content;
      if (nextParts.length > 0 || finished) anythingToSend = true;
    }
    if (!touched) return raw;
    if (!anythingToSend) return undefined;
    return JSON.stringify(chunk);
  }

  private consumeGoogleCall(state: ChoiceState, call: Json): { handled: boolean; decoded: string } {
    let channelName: string | undefined;
    if (typeof call.name === "string" && call.name) {
      if (classifyToolName(call.name, this.ctx.toolName, this.ctx.clientToolNames) === "client") {
        state.activeGoogleChannel = undefined;
        return { handled: false, decoded: "" };
      }
      channelName = extractBareToolName(call.name);
      state.activeGoogleChannel = channelName;
    } else {
      channelName = state.activeGoogleChannel;
    }
    if (channelName === undefined) {
      const empty = call.args === undefined && call.partialArgs === undefined && state.sawSynthetic;
      return { handled: empty, decoded: "" };
    }

    this.markSynthetic(state);
    const channel = this.getChannel(state, channelName);
    let text = "";
    if (Array.isArray(call.partialArgs)) {
      for (const fragment of call.partialArgs as Json[]) {
        if (fragment?.jsonPath === `$.${CONTENT_PARAM}` && typeof fragment.stringValue === "string") {
          text += fragment.stringValue;
        }
      }
    }
    if (typeof call.args === "string") {
      text += channel.decoder.feed(call.args);
    } else if (call.args && typeof call.args === "object" && typeof call.args[CONTENT_PARAM] === "string") {
      const value: string = call.args[CONTENT_PARAM];
      // 有些實作每次給到目前為止的完整內容，有些只給新增的部分
      if (!channel.text) text += value;
      else if (value.startsWith(channel.text)) text += value.slice(channel.text.length);
      else if (!channel.text.startsWith(value)) text += value;
    }
    if (call.willContinue !== true) state.activeGoogleChannel = undefined;
    return { handled: true, decoded: this.absorb(state, channel, text) };
  }
}

export interface RestoredStream {
  body: ReadableStream<Uint8Array>;
  /** 目前為止的統計（讀完串流後呼叫） */
  readStats: () => RestoreStats;
}

/** 先不送的行改送 SSE 註解當心跳，下游的閒置計時才不會誤判 */
const KEEP_ALIVE = ": keep-alive\n";

type Emit = (text: string) => void;

export function restoreStreamBody(body: ReadableStream<Uint8Array>, ctx: RestoreContext): RestoredStream {
  const restorer = new StreamContentRestorer(ctx);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const splitter = new JsonArraySplitter();
  let mode: "undecided" | "sse" | "json-array" | "passthrough" = "undecided";
  let head = "";
  let partialLine = "";
  let carryCR = false;

  const emitPending = (emit: Emit) => {
    for (const payload of restorer.finalizePending()) emit(`data: ${payload}\n\n`);
  };

  const handleLine = (line: string, emit: Emit) => {
    if (!line.startsWith("data:")) {
      emit(`${line}\n`);
      return;
    }
    const payload = line.slice(5).replace(/^ /, "");
    if (payload.trim() === "[DONE]") {
      // 下游讀到 [DONE] 就停，留著的內容要先補送
      emitPending(emit);
      emit(`${line}\n`);
      return;
    }
    const rewritten = restorer.transformPayload(payload);
    emit(rewritten === undefined ? KEEP_ALIVE : `data: ${rewritten}\n`);
  };

  const feedSse = (raw: string, emit: Emit) => {
    let text = (carryCR ? "\r" : "") + raw;
    carryCR = text.endsWith("\r");
    if (carryCR) text = text.slice(0, -1);
    partialLine += text.replace(/\r\n?/g, "\n");
    let newline = partialLine.indexOf("\n");
    while (newline !== -1) {
      handleLine(partialLine.slice(0, newline), emit);
      partialLine = partialLine.slice(newline + 1);
      newline = partialLine.indexOf("\n");
    }
  };

  const emitElement = (element: string, emit: Emit) => {
    const rewritten = restorer.transformPayload(flattenJsonElement(element));
    emit(rewritten === undefined ? `${KEEP_ALIVE}\n` : `data: ${rewritten}\n\n`);
  };

  const route = (text: string, emit: Emit) => {
    if (mode === "sse") feedSse(text, emit);
    else if (mode === "json-array") for (const element of splitter.push(text)) emitElement(element, emit);
    else if (text) emit(text);
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const emit: Emit = (text) => controller.enqueue(encoder.encode(text));
      const text = decoder.decode(chunk, { stream: true });
      if (mode !== "undecided") {
        route(text, emit);
        return;
      }
      head += text;
      const first = head.trimStart()[0];
      if (first === undefined) return;
      // 只看第一個非空白字元：等開頭湊滿再判斷，會讓下游的逾時計時晚開始
      mode = first === "[" ? "json-array" : first === "{" ? "passthrough" : "sse";
      route(head, emit);
      head = "";
    },
    flush(controller) {
      const emit: Emit = (text) => controller.enqueue(encoder.encode(text));
      if (mode === "undecided") mode = "sse";
      route(head + decoder.decode(), emit);
      head = "";
      if (mode === "passthrough") return;
      if (mode === "sse") {
        carryCR = false;
        if (partialLine) handleLine(partialLine, emit);
        partialLine = "";
      } else {
        const tail = splitter.finish();
        if (tail.trim()) emitElement(tail, emit);
      }
      emitPending(emit);
      if (mode === "json-array" && splitter.complete) emit("data: [DONE]\n\n");
    },
  });

  return { body: body.pipeThrough(transform), readStats: () => ({ ...restorer.stats }) };
}
