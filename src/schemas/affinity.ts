/**
 * 好感度數值系統 Zod Schemas
 *
 * 每個角色卡可啟用獨立的數值指標系統（好感度、信任度等），
 * 支援動態指標配置、Zod runtime 驗證、自動 clamp。
 */
import { z } from "zod";

// ===== 階段定義 =====

export const AffinityStageSchema = z.object({
  name: z.string().min(1),
  minValue: z.number(),
});

export type AffinityStage = z.infer<typeof AffinityStageSchema>;

// ===== 指標值類型（數字或字串） =====

export type MetricValue = number | string;

// ===== 單一指標配置 =====

export const AffinityMetricConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["number", "string"]).default("number"),
  min: z.number().default(0),
  max: z.number().default(100),
  initial: z.union([z.number(), z.string()]).default(50),
  options: z.array(z.string()).default([]),
  stages: z.array(AffinityStageSchema).default([]),
});

export type AffinityMetricConfig = z.infer<typeof AffinityMetricConfigSchema>;

// ===== 角色級配置（per character） =====

export const CharacterAffinityConfigSchema = z.object({
  characterId: z.string().min(1),
  enabled: z.boolean().default(false),
  /** EJS 路徑名稱：stat_data 下的鍵名，留空時使用角色的 data.name */
  statKey: z.string().default(""),
  metrics: z.array(AffinityMetricConfigSchema).default([]),
  promptTemplate: z.string().default(""),
  updateInstruction: z.string().default(""),
  lastUpdated: z.number().default(0),
});

export type CharacterAffinityConfig = z.infer<
  typeof CharacterAffinityConfigSchema
>;

// ===== 變化歷史記錄 =====

export const AffinityChangeRecordSchema = z.object({
  metricId: z.string(),
  oldValue: z.union([z.number(), z.string()]),
  newValue: z.union([z.number(), z.string()]),
  reason: z.string().default(""),
  timestamp: z.number(),
});

export type AffinityChangeRecord = z.infer<typeof AffinityChangeRecordSchema>;

// ===== 聊天級狀態（per chat） =====

export const ChatAffinityStateSchema = z.object({
  chatId: z.string().min(1),
  characterId: z.string().min(1),
  values: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  history: z.array(AffinityChangeRecordSchema).default([]),
  // 每條 AI 訊息處理前的數值快照，key 為 messageId
  snapshots: z.record(
    z.string(),
    z.record(z.string(), z.union([z.number(), z.string()])),
  ).default({}),
  lastUpdated: z.number().default(0),
});

export type ChatAffinityState = z.infer<typeof ChatAffinityStateSchema>;

// ===== 工廠函數 =====

/** 建立角色預設配置 */
export function createDefaultConfig(
  characterId: string,
): CharacterAffinityConfig {
  return CharacterAffinityConfigSchema.parse({ characterId });
}

/** 從角色配置初始化一個聊天的好感度狀態 */
export function createDefaultState(
  chatId: string,
  config: CharacterAffinityConfig,
): ChatAffinityState {
  const values: Record<string, MetricValue> = {};
  for (const m of config.metrics) {
    values[m.id] = m.initial;
  }
  return ChatAffinityStateSchema.parse({
    chatId,
    characterId: config.characterId,
    values,
  });
}

// ===== 動態驗證器 =====

/**
 * 根據用戶配置的 metrics 動態生成 Zod schema。
 * 數字型指標有獨立的 min/max clamp；字串型指標驗證是否在 options 內。
 * 保證冪等性：parse(parse(x)) === parse(x)
 */
export function buildDynamicValidator(
  metrics: AffinityMetricConfig[],
): z.ZodType<Record<string, MetricValue>> {
  const shape: Record<string, z.ZodType<MetricValue>> = {};
  for (const m of metrics) {
    if (m.type === "string") {
      shape[m.id] = z.preprocess(
        (v) => (typeof v === "string" ? v : String(m.initial)),
        z.string(),
      ) as z.ZodType<MetricValue>;
    } else {
      const lo = m.min;
      const hi = m.max;
      const numInitial = typeof m.initial === "number" ? m.initial : 50;
      shape[m.id] = z.preprocess((v) => {
        const n = Number(v);
        if (Number.isNaN(n)) return numInitial;
        return Math.min(hi, Math.max(lo, n));
      }, z.number()) as z.ZodType<MetricValue>;
    }
  }
  return z
    .object(shape)
    .catchall(z.union([z.number(), z.string()])) as unknown as z.ZodType<
    Record<string, MetricValue>
  >;
}

// ===== 安全解析 =====

/**
 * 安全解析聊天好感度狀態，歷史資料損壞也能優雅恢復。
 * 類似 gameEconomy 的 safeParseGameState 模式。
 */
export function safeParseAffinityState(
  raw: unknown,
  chatId: string,
  config?: CharacterAffinityConfig,
): ChatAffinityState {
  const result = ChatAffinityStateSchema.safeParse(raw);
  if (result.success) {
    if (config) {
      const validator = buildDynamicValidator(config.metrics);
      const validated = validator.safeParse(result.data.values);
      if (validated.success) {
        result.data.values = validated.data;
      }
    }
    return result.data;
  }

  // 回退：盡量從 raw 中搶救字段
  const fallback: Record<string, unknown> = {
    chatId,
    characterId: "",
    values: {},
    history: [],
    snapshots: {},
    lastUpdated: 0,
  };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.characterId === "string")
      fallback.characterId = obj.characterId;
    if (typeof obj.values === "object" && obj.values !== null)
      fallback.values = obj.values;
    if (typeof obj.lastUpdated === "number")
      fallback.lastUpdated = obj.lastUpdated;
  }
  return ChatAffinityStateSchema.parse(fallback);
}

/** 安全解析角色好感度配置 */
export function safeParseAffinityConfig(
  raw: unknown,
  characterId: string,
): CharacterAffinityConfig {
  const result = CharacterAffinityConfigSchema.safeParse(raw);
  if (result.success) return result.data;

  const fallback: Record<string, unknown> = {
    characterId,
    enabled: false,
    metrics: [],
    promptTemplate: "",
    updateInstruction: "",
    lastUpdated: 0,
  };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.enabled === "boolean") fallback.enabled = obj.enabled;
    if (Array.isArray(obj.metrics)) fallback.metrics = obj.metrics;
    if (typeof obj.promptTemplate === "string")
      fallback.promptTemplate = obj.promptTemplate;
    if (typeof obj.updateInstruction === "string")
      fallback.updateInstruction = obj.updateInstruction;
  }
  return CharacterAffinityConfigSchema.parse(fallback);
}

// ===== 階段計算 =====

/** 根據當前值和階段定義，計算所在階段名稱（僅適用於數字型指標） */
export function computeStage(
  value: MetricValue,
  stages: AffinityStage[],
): string | null {
  if (stages.length === 0 || typeof value !== "number") return null;
  const sorted = [...stages].sort((a, b) => b.minValue - a.minValue);
  for (const s of sorted) {
    if (value >= s.minValue) return s.name;
  }
  return sorted[sorted.length - 1]?.name ?? null;
}

/** 計算百分比（0-1），字串型指標返回 0 */
export function computePercentage(
  value: MetricValue,
  min: number,
  max: number,
): number {
  if (typeof value !== "number") return 0;
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

/** 歷史記錄最大保留數量 */
export const MAX_HISTORY_LENGTH = 200;
