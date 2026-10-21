/**
 * 噗浪的單次背景 AI 呼叫（廣場路人噗、申訴結果、印象標籤）：用「噗浪發文」的 API，不開串流視窗
 */

import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import { useSettingsStore } from "@/stores/settings";
import { pickGenerationToggles } from "@/utils/generationToggles";

export function hasPlurkApi(): boolean {
  const api = useSettingsStore().getAPIForTask("plurkPost").api;
  return !!(api.endpoint && api.apiKey && api.model);
}

/** 送一段提示詞、拿回整段文字；沒設定 API 時丟錯 */
export async function generatePlurkText(prompt: string): Promise<string> {
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask("plurkPost");
  const api = taskConfig.api;
  if (!api.endpoint || !api.apiKey || !api.model) throw new Error("請先配置 API");
  const genConfig = taskConfig.generation || settingsStore.generation;
  const client = new OpenAICompatibleClient(api);
  const generated = await client.generate({
    messages: [{ role: "user", content: prompt }],
    settings: {
      maxContextLength: genConfig.maxContextLength || 128000,
      maxResponseLength: genConfig.maxTokens || 8192,
      temperature: genConfig.temperature || 0.9,
      topP: genConfig.topP || 0.95,
      ...pickGenerationToggles(genConfig),
      frequencyPenalty: genConfig.frequencyPenalty || 0,
      presencePenalty: genConfig.presencePenalty || 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: false,
      useStreamingWindow: false,
    },
    apiSettings: api,
  });
  return generated.content || "";
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
