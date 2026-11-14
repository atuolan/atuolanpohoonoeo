/**
 * 「用一句話做一個數值」：使用者描述想要的關係變化（或讓 AI 看角色卡自己想），
 * AI 只回名稱、說明、階段名稱和表現；範圍、門檻、起點、每次最多增減都由 app 決定。
 *
 * 走「生成角色卡」的 API 任務（沒另外綁就用聊天的 API）。
 * 回答看不懂時自動再試一次，還是不行就丟錯，讓畫面提供範本當後備。
 */
import { z } from "zod";
import { OpenAICompatibleClient } from "@/api/OpenAICompatible";
import type { AffinityMetricConfig } from "@/schemas/affinity";
import { evenThresholds, startValueForStage } from "@/services/affinityLadder";
import { extractJsonObject } from "@/services/plurkAI";
import { useSettingsStore } from "@/stores/settings";
import { pickGenerationToggles } from "@/utils/generationToggles";

export const AFFINITY_GENERATOR_TASK = "characterGen";

const MIN_STAGES = 2;
const MAX_STAGES = 6;
/** 每一階的寬度：5 階、沒有負的就是 0～100，跟範本一致 */
const STAGE_WIDTH = 20;

const DraftSchema = z.object({
  name: z.string().trim().min(1).max(16),
  kind: z.enum(["score", "state"]).catch("score"),
  description: z.string().trim().default(""),
  stages: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(16),
        behavior: z.string().trim().default(""),
      }),
    )
    .min(MIN_STAGES),
  startStage: z.union([z.number(), z.string()]).optional().catch(undefined),
  /** 哪一階是「沒感覺」；從負面開始（討厭、敵意）時才有，在它下面的階段是負的 */
  zeroStage: z.union([z.number(), z.string()]).optional().catch(undefined),
});

export type AffinityDraft = z.infer<typeof DraftSchema>;

export interface AffinityGenerateInput {
  /** 使用者的一句話；空字串表示「看角色卡幫我想」 */
  request: string;
  character: {
    name?: string;
    description?: string;
    personality?: string;
    scenario?: string;
    firstMessage?: string;
  };
  /** 已經有的數值名稱，不要重複 */
  existingNames: string[];
  signal?: AbortSignal;
}

function clip(text: string | undefined, max: number): string {
  const t = (text || "").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function buildGeneratorPrompt(input: AffinityGenerateInput): string {
  const c = input.character;
  const lines: string[] = [];
  lines.push("你要幫一個角色扮演聊天 app 設計「好感度系統」裡的一個數值。只輸出一個 JSON 物件，不要任何其他文字、不要程式碼框。");
  lines.push("");
  lines.push("[使用者想要的]");
  lines.push(
    input.request.trim() ||
      "使用者沒有寫，請讀角色資料，設計一個最能表現「這個角色和使用者的關係會怎麼變化」的數值。",
  );
  lines.push("");
  lines.push("[角色資料]");
  if (c.name) lines.push(`名字：${c.name}`);
  if (c.description) lines.push(`描述：${clip(c.description, 1500)}`);
  if (c.personality) lines.push(`個性：${clip(c.personality, 600)}`);
  if (c.scenario) lines.push(`情境：${clip(c.scenario, 400)}`);
  if (c.firstMessage) lines.push(`開場白：${clip(c.firstMessage, 400)}`);
  if (input.existingNames.length) {
    lines.push("");
    lines.push(
      `[已經有的數值] ${input.existingNames.join("、")}（使用者想要的如果其實是重做其中一個，就用同樣的名字；不然不要重複）`,
    );
  }
  lines.push("");
  lines.push("[JSON 欄位]");
  lines.push("- name：數值名稱，2～5 個字，例如「好感度」「墮落度」「依賴」");
  lines.push("- kind：\"score\"（會慢慢累積的分數）或 \"state\"（在幾種狀態之間切換，例如心情）");
  lines.push("- description：同時寫出「什麼事會讓它增加」和「什麼事會讓它減少」，一兩句，寫給負責記錄數值的 AI 看");
  lines.push("- stages：由低到高 3～6 個階段（state 時就是各個狀態），每個是 {\"name\": 4 個字以內的名稱, \"behavior\": \"這時候角色會怎麼對待使用者，30 字以內，具體寫出行為和說話方式\"}");
  lines.push("- startStage：一開始在第幾個階段，從 0 開始數");
  lines.push("- zeroStage：只有從負面開始（討厭、敵意）時才填，表示第幾個階段是「沒感覺」；其他情況不要這個欄位");
  lines.push("- name 6 個字以內，不要有空格或符號");
  lines.push("- 用使用者寫的語言回答");
  lines.push("");
  lines.push("[範例]");
  lines.push(
    '{"name":"好感度","kind":"score","description":"被關心、被誇獎時增加；被冷落、被冒犯時減少","stages":[{"name":"討厭","behavior":"說話帶刺，故意不看對方"},{"name":"冷淡","behavior":"愛理不理，只回必要的話"},{"name":"在意","behavior":"嘴上嫌棄，卻會偷偷注意對方"},{"name":"喜歡","behavior":"會害羞地主動靠近，嘴硬但行動誠實"}],"startStage":0,"zeroStage":1}',
  );
  return lines.join("\n");
}

/** 把 AI 的回答轉成草稿；看不懂回傳 null */
export function parseGeneratorReply(reply: string): AffinityDraft | null {
  const text = (reply || "").replace(/<think>[\s\S]*?<\/think>/gi, "");
  const obj = extractJsonObject(text);
  if (!obj) return null;
  const parsed = DraftSchema.safeParse(obj);
  return parsed.success ? parsed.data : null;
}

/** 索引或階段名稱 → 夾在合法範圍內的索引；沒給回傳 null */
function resolveStageIndex(
  raw: number | string | undefined,
  stages: { name: string }[],
): number | null {
  const clamp = (n: number) => Math.min(stages.length - 1, Math.max(0, Math.round(n)));
  if (typeof raw === "number" && Number.isFinite(raw)) return clamp(raw);
  if (typeof raw === "string") {
    const byName = stages.findIndex((s) => s.name === raw.trim());
    if (byName >= 0) return byName;
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) return clamp(n);
  }
  return null;
}

/**
 * 數值名稱會變成 `<affinity-update 名稱="+2"/>` 的屬性名：拿掉空格和符號，
 * 跟已有的重名時加編號
 */
export function sanitizeMetricName(name: string, existing: string[] = []): string {
  const base = name.replace(/[\s"'`=<>/\\{}[\]()（）「」『』:：,，.。;；!?！？+*#&|^~]/g, "").slice(0, 8) || "數值";
  if (!existing.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}${i}`;
    if (!existing.includes(candidate)) return candidate;
  }
}

/** 草稿 → 指標設定：範圍、門檻、起點、每次最多增減由 app 決定 */
export function draftToMetric(
  draft: AffinityDraft,
  existingNames: string[] = [],
  id = `metric_gen_${Date.now()}`,
): AffinityMetricConfig {
  const stages = draft.stages.slice(0, MAX_STAGES).map((s) => ({
    name: s.name.replace(/\s+/g, "").slice(0, 8) || s.name,
    behavior: s.behavior,
  }));
  const start = resolveStageIndex(draft.startStage, stages) ?? 0;
  // 同名不在這裡改號：設定畫面會問要不要取代原本的（例如把預設的好感度換成傲嬌版）
  void existingNames;
  const name = sanitizeMetricName(draft.name);

  if (draft.kind === "state") {
    const behaviors = stages
      .filter((s) => s.behavior)
      .map((s) => `${s.name}：${s.behavior}`)
      .join("；");
    return {
      id,
      name,
      path: "",
      type: "string",
      min: 0,
      max: 100,
      initial: stages[start]?.name ?? stages[0].name,
      options: stages.map((s) => s.name),
      stages: [],
      description: [draft.description, behaviors].filter(Boolean).join("。"),
      maxChange: 0,
      bounded: true,
    };
  }

  // 範圍由 app 算：每階寬 20，「沒感覺」那階從 0 開始，下面的是負的
  const zero = resolveStageIndex(draft.zeroStage, stages) ?? 0;
  const min = zero > 0 ? -STAGE_WIDTH * zero : 0;
  const max = min + STAGE_WIDTH * stages.length;
  const thresholds = evenThresholds(min, max, stages.length);
  const metric: AffinityMetricConfig = {
    id,
    name,
    path: "",
    type: "number",
    min,
    max,
    initial: min,
    options: [],
    stages: stages.map((s, i) => ({ name: s.name, minValue: thresholds[i], description: s.behavior })),
    description: draft.description,
    // 每次最多增減：範圍的 5%，至少 1
    maxChange: Math.max(1, Math.round((max - min) * 0.05)),
    bounded: true,
  };
  metric.initial = startValueForStage(metric, start);
  return metric;
}

export async function generateAffinityMetric(input: AffinityGenerateInput): Promise<AffinityMetricConfig> {
  const settingsStore = useSettingsStore();
  const taskConfig = settingsStore.getAPIForTask(AFFINITY_GENERATOR_TASK);
  const api = taskConfig.api;
  if (!api.endpoint || !api.apiKey || !api.model) {
    throw new Error("還沒有設定 API，先到「設定」填好聊天用的 API");
  }
  const genConfig = taskConfig.generation || settingsStore.generation;
  const prompt = buildGeneratorPrompt(input);
  const client = new OpenAICompatibleClient(api);

  // 看不懂就再試一次
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await client.generate({
      messages: [{ role: "user", content: prompt }],
      settings: {
        maxContextLength: genConfig.maxContextLength || 128000,
        maxResponseLength: Math.max(1500, Math.min(genConfig.maxTokens || 2000, 4000)),
        temperature: 0.8,
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
    const draft = parseGeneratorReply(result.content || "");
    if (draft) return draftToMetric(draft, input.existingNames);
    console.warn("[affinityGenerator] 看不懂 AI 的回答，再試一次", (result.content || "").slice(0, 300));
  }
  throw new Error("做不出來");
}
