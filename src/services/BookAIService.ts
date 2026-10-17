/**
 * 閱讀 App 的 AI 功能（三句接上……）
 * 使用「總結」任務的 API 設定（有設定備用 API 時會走備用）
 */

import type { APIMessage } from "@/api/OpenAICompatible";
import type { PromptDebugMessage } from "@/composables/useStreamingWindow";
import type { BookChapter } from "@/types/book";
import { pickGenerationToggles } from "@/utils/generationToggles";

/**
 * 讀到這裡為止的最後一段內文（不含還沒讀的部分）；
 * 本章讀得不多時，往前補上一章的結尾
 */
export function recapSourceText(
  chapters: BookChapter[],
  chapterIndex: number,
  charOffset: number,
  maxChars = 4000,
): string {
  const current = chapters[chapterIndex];
  if (!current) return "";
  const readPart = current.content.slice(0, Math.max(charOffset, 0));
  let text = readPart.slice(-maxChars);
  let out = `【${current.title}】\n${readPart.length > maxChars ? "……" : ""}${text}`;

  const remaining = maxChars - text.length;
  const prev = chapters[chapterIndex - 1];
  if (remaining > 500 && prev) {
    text = prev.content.slice(-remaining);
    out = `【${prev.title}】\n……${text}\n\n${out}`;
  }
  return out.trim();
}

export function buildRecapPrompt(bookTitle: string, source: string): APIMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是讀書夥伴。讀者暫停了一陣子，現在要接著讀。",
        "請用三句繁體中文幫他接上思路：",
        "第一句：前面發生了什麼／在講什麼；",
        "第二句：他剛好停在哪裡；",
        "第三句：接下來讀的時候可以留意什麼（只能根據已讀內容，不可以透露或猜測後面的情節）。",
        "每句不超過 40 字，口吻自然，不要編號、不要前言，三句各占一行。",
      ].join("\n"),
    },
    {
      role: "user",
      content: `書名：《${bookTitle}》\n以下是讀者讀到這裡為止的內容：\n\n${source}`,
    },
  ];
}

/** 取前三個非空行，去掉模型常加的編號與引號 */
export function parseRecapLines(text: string): string[] {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .split("\n")
    .map((l) => l.trim().replace(/^(\d+[.、．)）]|[-*•]|第[一二三]句[:：])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

/** 使用者在串流視窗按了停止 */
export class AIStoppedError extends Error {
  constructor() {
    super("已停止");
    this.name = "AIStoppedError";
  }
}

export interface AskAIOptions {
  /** 用哪個任務的 API 設定（有設定備用 API 時會走備用） */
  task?: "summary" | "chat";
  temperature?: number;
  /** 背景自己跑的（自動摘要、同步讀）：串流視窗正被別的生成用著就不搶，安靜地跑 */
  background?: boolean;
}

let askSeq = 0;

function toDebugMessage(m: APIMessage): PromptDebugMessage {
  const content =
    typeof m.content === "string"
      ? m.content
      : m.content.map((part) => (part.type === "text" ? part.text : "[圖片]")).join("\n");
  return { role: m.role, content };
}

/**
 * 呼叫 AI 拿回一段文字（串流收完再回傳），去掉思考標籤。
 * 設定裡開著串流視窗時，邊生成邊寫進視窗（縮小開著，點貼邊按鈕看），視窗的停止鍵可以中止
 */
export async function askAI(messages: APIMessage[], options: AskAIOptions = {}): Promise<string> {
  const { useSettingsStore } = await import("@/stores/settings");
  const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
  const { useStreamingWindow } = await import("@/composables/useStreamingWindow");
  const taskConfig = useSettingsStore().getAPIForTask(options.task ?? "summary");
  if (!taskConfig.api.endpoint || !taskConfig.api.apiKey || !taskConfig.api.model) {
    throw new Error("請先在設定中配置 API");
  }

  const generation = taskConfig.generation;
  const streamingWindow = useStreamingWindow();
  const useWindow =
    !!generation.streamingEnabled &&
    !!generation.useStreamingWindow &&
    !(options.background && streamingWindow.isStreaming.value);
  const ownerId = `book:${Date.now()}:${++askSeq}`;
  const abort = new AbortController();
  let unbindAbort: (() => void) | null = null;
  if (useWindow) {
    // 使用者正開著視窗看（例如分段摘要一段接一段）就保持展開
    streamingWindow.show(taskConfig.api.model || "AI", !streamingWindow.isVisible.value, ownerId);
    streamingWindow.setPromptContent(messages.map(toDebugMessage), ownerId);
    unbindAbort = streamingWindow.bindAbortController(abort);
  }

  try {
    const client = new OpenAICompatibleClient({ ...taskConfig.api });
    const stream = client.generateStream({
      messages,
      settings: {
        maxContextLength: generation.maxContextLength || 200000,
        maxResponseLength: generation.maxTokens || 8192,
        temperature: options.temperature ?? 0.7,
        topP: 0.9,
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: true,
        useStreamingWindow: false,
        ...pickGenerationToggles(generation),
      },
      apiSettings: taskConfig.api,
      adjustLastMessageRole: true,
      signal: abort.signal,
    });

    let content = "";
    for await (const event of stream) {
      if (event.type === "token" && event.token) {
        content += event.token;
        if (useWindow) streamingWindow.appendToken(event.token, ownerId);
      } else if (event.type === "done") {
        content = event.content || content;
        if (useWindow && event.usage) streamingWindow.setUsage(event.usage, ownerId);
        if (useWindow && event.diagnostics) streamingWindow.setDiagnostics(event.diagnostics, ownerId);
      } else if (event.type === "error") {
        if (useWindow && event.diagnostics) streamingWindow.setDiagnostics(event.diagnostics, ownerId);
        throw new Error(String(event.error || "AI 沒有回應"));
      }
    }
    // 停止時串流會帶著半截內容正常結束，不能當成完整的回覆
    if (abort.signal.aborted) throw new AIStoppedError();
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    if (!content) throw new Error("AI 沒有回應");
    if (useWindow) streamingWindow.setComplete(ownerId);
    return content;
  } catch (e) {
    if (abort.signal.aborted) {
      if (useWindow) streamingWindow.setComplete(ownerId);
      throw e instanceof AIStoppedError ? e : new AIStoppedError();
    }
    if (useWindow) streamingWindow.setError(e instanceof Error ? e.message : String(e), ownerId);
    throw e;
  } finally {
    unbindAbort?.();
    if (useWindow) streamingWindow.releaseOwnership(ownerId);
  }
}

/** 從模型輸出撈出 JSON（容許前後有說明文字或 ```json 圍欄） */
export function extractJson<T = unknown>(text: string): T | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidates = [fenced, text];
  for (const c of candidates) {
    if (!c) continue;
    const start = c.search(/[[{]/);
    if (start < 0) continue;
    const open = c[start];
    const close = open === "[" ? "]" : "}";
    const end = c.lastIndexOf(close);
    if (end <= start) continue;
    try {
      return JSON.parse(c.slice(start, end + 1)) as T;
    } catch {
      // 試下一個
    }
  }
  return null;
}

/** @param source 讀到這裡為止的內容（bookSummary.recapSource） */
export async function generateRecap(bookTitle: string, source: string): Promise<string[]> {
  if (source.replace(/【[^】]*】/g, "").trim().length < 50) {
    throw new Error("還沒讀到夠多內容，先讀幾頁吧");
  }
  const content = await askAI(buildRecapPrompt(bookTitle, source), { temperature: 0.6 });
  const lines = parseRecapLines(content);
  if (lines.length === 0) throw new Error("AI 沒有回應");
  return lines;
}
