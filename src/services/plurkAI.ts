/**
 * 噗浪的單次 AI 呼叫（廣場路人噗、申訴結果、印象標籤）：用「噗浪發文」的 API；
 * 使用者按按鈕觸發的會接上串流視窗，背景自動跑的不開
 */

import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { useSettingsStore } from "@/stores/settings";
import { pickGenerationToggles } from "@/utils/generationToggles";

export function hasPlurkApi(): boolean {
  const api = useSettingsStore().getAPIForTask("plurkPost").api;
  return !!(api.endpoint && api.apiKey && api.model);
}

/** 使用者在串流視窗按了停止 */
export function isPlurkAbort(error: unknown): boolean {
  return (error as { name?: string })?.name === "AbortError";
}

/** 按停止前已經收到的文字 */
export function abortedPartial(error: unknown): string {
  return (error as { partial?: string })?.partial ?? "";
}

function makeAbortError(partial: string): Error {
  return Object.assign(new Error("已停止生成"), { name: "AbortError", partial });
}

/**
 * 送一段提示詞、拿回整段文字；沒設定 API 時丟錯，按停止時丟 AbortError（partial＝已收到的文字）。
 * window：開了串流輸出和串流視窗時，把這次生成顯示在串流視窗
 */
export async function generatePlurkText(prompt: string, opts: { window?: boolean; label?: string } = {}): Promise<string> {
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask("plurkPost");
  const api = taskConfig.api;
  if (!api.endpoint || !api.apiKey || !api.model) throw new Error("請先配置 API");
  const genConfig = taskConfig.generation || settingsStore.generation;
  const isStreamingEnabled = !!genConfig.streamingEnabled;
  const useWindow = !!opts.window && isStreamingEnabled && !!genConfig.useStreamingWindow;
  const streamingWindow = useStreamingWindow();
  const controller = new AbortController();
  const unbindAbort = useWindow ? streamingWindow.bindAbortController(controller) : null;

  const client = new OpenAICompatibleClient(api);
  const settings = {
    maxContextLength: genConfig.maxContextLength || 128000,
    maxResponseLength: genConfig.maxTokens || 8192,
    temperature: genConfig.temperature || 0.9,
    topP: genConfig.topP || 0.95,
    ...pickGenerationToggles(genConfig),
    frequencyPenalty: genConfig.frequencyPenalty || 0,
    presencePenalty: genConfig.presencePenalty || 0,
    repetitionPenalty: 1,
    stopSequences: [],
    streaming: isStreamingEnabled,
    useStreamingWindow: useWindow,
  };
  const messages = [{ role: "user" as const, content: prompt }];

  if (useWindow) {
    streamingWindow.show(api.model || "AI");
    streamingWindow.setPromptContent([{ role: "user", content: prompt, name: opts.label }]);
  }

  try {
    let result = "";
    let usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
    if (isStreamingEnabled) {
      for await (const event of client.generateStream({ messages, settings, apiSettings: api, signal: controller.signal })) {
        if (event.type === "token" && event.token) {
          result += event.token;
          if (useWindow) streamingWindow.appendToken(event.token);
        } else if (event.type === "done") {
          if (event.content) result = event.content;
          const doneUsage = (event as { usage?: typeof usage }).usage;
          if (doneUsage) usage = doneUsage;
        } else if (event.type === "error") {
          throw new Error(event.error || "噗浪生成失敗");
        }
      }
    } else {
      const generated = await client.generate({ messages, settings, apiSettings: api, signal: controller.signal });
      result = generated.content || "";
    }
    if (controller.signal.aborted) throw makeAbortError(result);
    if (useWindow && usage) streamingWindow.setUsage(usage);
    if (useWindow) streamingWindow.setComplete();
    return result;
  } catch (error) {
    if (useWindow) {
      if (isPlurkAbort(error)) streamingWindow.setComplete();
      else streamingWindow.setError(error instanceof Error ? error.message : String(error));
    }
    throw error;
  } finally {
    unbindAbort?.();
    if (useWindow) streamingWindow.clearAbortBinding();
  }
}

/** 從 AI 輸出裡挖出第一個 JSON 物件；挖不到回傳 null */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const match = raw.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const value = JSON.parse(match[0]);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
