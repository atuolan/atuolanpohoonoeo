/**
 * 非串流回應還原：把假工具拿掉、參數放回 message.content。
 * 移植自酒館助手防截斷腳本的 restorer-json.js。
 */
import { StreamArgDecoder } from "./argDecoder";
import { createRestoreStats, type RestoreContext, type RestoreStats } from "./stats";
import { CONTENT_PARAM, classifyToolName } from "./toolSpec";

type Json = Record<string, any>;

/** 讀出工具參數裡的正文；參數 JSON 不完整時用串流解碼器盡量救回 */
export function readArgsContent(args: unknown): string | undefined {
  if (typeof args === "string") {
    if (!args) return undefined;
    try {
      const parsed: unknown = JSON.parse(args);
      const value = parsed && typeof parsed === "object" ? (parsed as Json)[CONTENT_PARAM] : undefined;
      return typeof value === "string" ? value : undefined;
    } catch {
      const decoder = new StreamArgDecoder(CONTENT_PARAM);
      const salvaged = decoder.feed(args) + decoder.finish();
      return salvaged || undefined;
    }
  }
  if (args && typeof args === "object") {
    const value = (args as Json)[CONTENT_PARAM];
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

/**
 * 直接改寫已解析的回應物件：choices[].message.tool_calls 裡自己的呼叫一律拿掉
 * （參數讀不出來也拿掉，免得被當成角色工具執行），正文與原 content 取較長者。
 */
export function restoreJsonPayload(data: unknown, ctx: RestoreContext): RestoreStats {
  const stats = createRestoreStats();
  const choices = data && typeof data === "object" ? (data as Json).choices : undefined;
  if (!Array.isArray(choices)) return stats;

  for (const choice of choices as Json[]) {
    const message: Json | undefined = choice?.message;
    if (!message || !Array.isArray(message.tool_calls)) continue;

    const kept: unknown[] = [];
    const carried: string[] = [];
    let sawOwn = false;
    for (const call of message.tool_calls as Json[]) {
      const fn = call?.function;
      if (fn && classifyToolName(fn.name, ctx.toolName, ctx.clientToolNames) !== "client") {
        sawOwn = true;
        const value = readArgsContent(fn.arguments);
        if (value) carried.push(value);
        continue;
      }
      kept.push(call);
    }
    if (!sawOwn) continue;

    stats.syntheticSeen = true;
    const plain = typeof message.content === "string" ? message.content : "";
    let best = plain;
    let bestIsPlain = true;
    for (const candidate of carried) {
      if (candidate.length >= best.length) {
        best = candidate;
        bestIsPlain = false;
      }
    }
    if ((plain ? 1 : 0) + carried.length > 1) {
      stats.contentConflict = true;
      if (bestIsPlain) stats.plainWon = true;
    }
    if (!bestIsPlain) stats.decodedChars += best.length;

    message.content = best;
    if (kept.length > 0) {
      message.tool_calls = kept;
    } else {
      delete message.tool_calls;
      if (choice.finish_reason === "tool_calls") choice.finish_reason = "stop";
    }
  }
  return stats;
}
