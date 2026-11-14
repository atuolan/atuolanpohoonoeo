/**
 * 好感度旁觀者：聊天的 AI 回覆完之後，另外請一個 AI 讀這一輪對話，判斷數值變化
 * （對應 MVU 的「額外模型解析」）。
 *
 * 用「好感度旁觀者」這個任務的 API（沒有另外綁定就用主 API）。
 * 失敗一律回傳空陣列，不打斷聊天。
 */
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import type { CharacterAffinityConfig, ChatAffinityState } from "@/schemas/affinity";
import { affinityTemplateService } from "@/services/AffinityTemplateService";
import { type AffinityUpdateEntry, parseAffinityUpdateTags } from "@/services/ResponseParser";
import { useSettingsStore } from "@/stores/settings";
import { pickGenerationToggles } from "@/utils/generationToggles";

export const AFFINITY_JUDGE_TASK = "affinityJudge";

export interface AffinityJudgeInput {
  config: CharacterAffinityConfig;
  state: ChatAffinityState;
  charName: string;
  userName: string;
  /** 這一輪的對話，已經整理成「名字：內容」一行一句 */
  dialogue: string;
  signal?: AbortSignal;
}

export function hasAffinityJudgeApi(): boolean {
  const api = useSettingsStore().getAPIForTask(AFFINITY_JUDGE_TASK).api;
  return !!(api.endpoint && api.apiKey && api.model);
}

/** 把旁觀者的回答轉成更新；回答「無」或看不懂都回傳空陣列 */
export function parseJudgeReply(reply: string): AffinityUpdateEntry[] {
  const text = (reply || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!text || /^[「"']?無[」"']?[。.]?$/.test(text)) return [];
  return parseAffinityUpdateTags(text).map((u) => ({
    ...u,
    reason: u.reason && !u.reason.startsWith("MVU ") ? u.reason : "旁觀者判斷",
  }));
}

export async function judgeAffinityUpdates(input: AffinityJudgeInput): Promise<AffinityUpdateEntry[]> {
  if (!input.dialogue.trim()) return [];
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask(AFFINITY_JUDGE_TASK);
  const api = taskConfig.api;
  if (!api.endpoint || !api.apiKey || !api.model) {
    console.warn("[affinityJudge] 沒有設定 API，略過");
    return [];
  }
  const genConfig = taskConfig.generation || settingsStore.generation;
  const prompt = affinityTemplateService.buildJudgePrompt(input.config, input.state, {
    charName: input.charName,
    userName: input.userName,
    dialogue: input.dialogue,
  });

  try {
    const client = new OpenAICompatibleClient(api);
    const result = await client.generate({
      messages: [{ role: "user", content: prompt }],
      settings: {
        maxContextLength: genConfig.maxContextLength || 128000,
        maxResponseLength: Math.min(genConfig.maxTokens || 2048, 2048),
        // 判斷要穩，不要有創意
        temperature: 0.3,
        topP: genConfig.topP || 0.95,
        ...pickGenerationToggles(genConfig),
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      apiSettings: api,
      signal: input.signal,
    });
    const updates = parseJudgeReply(result.content || "");
    console.log("[affinityJudge] 旁觀者判斷完成", { updates: updates.length });
    return updates;
  } catch (error) {
    console.warn("[affinityJudge] 旁觀者判斷失敗，略過這一輪:", error);
    return [];
  }
}
