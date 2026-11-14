/**
 * 好感度數值系統 Zod Schemas
 *
 * 每個角色卡可啟用獨立的數值指標系統（好感度、信任度等），
 * 支援動態指標配置、Zod runtime 驗證、自動 clamp。
 */
import { z } from "zod";
import _ from "lodash";

// ===== 階段定義 =====

export const AffinityStageSchema = z.object({
  name: z.string().min(1),
  minValue: z.number(),
  /** 這個階段角色會怎麼表現（會一起送給 AI） */
  description: z.string().default(""),
});

export type AffinityStage = z.infer<typeof AffinityStageSchema>;

// ===== 指標值類型（數字或字串） =====

export type MetricValue = number | string;

// ===== MVU「[值, 說明]」格式 =====

/**
 * MVU 卡常把變數寫成 `[74, "好感度，0~100，被誇獎時增加"]`：
 * 第一格是值，第二格是給 AI 看的說明。改值時只動第一格，說明要留著。
 */
export function isValueWithDescription(value: unknown): value is [unknown, string] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[1] === "string" &&
    !Array.isArray(value[0])
  );
}

/** 讀值：遇到 [值, 說明] 只取值 */
export function readMvuLeaf(root: unknown, path: string): unknown {
  const value = path ? _.get(root, path) : root;
  return isValueWithDescription(value) ? value[0] : value;
}

/** 寫值：原本是 [值, 說明] 時只換掉值，說明保留 */
export function writeMvuLeaf(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (!path) return;
  const existing = _.get(root, path);
  if (isValueWithDescription(existing) && !Array.isArray(value)) {
    _.set(root, path, [value, existing[1]]);
    return;
  }
  _.set(root, path, value);
}

/** 依指標設定把數字夾進範圍；bounded=false 的指標不夾 */
export function clampMetricNumber(
  value: number,
  metric: Pick<AffinityMetricConfig, "min" | "max" | "bounded">,
): number {
  if (metric.bounded === false) return value;
  return Math.min(metric.max, Math.max(metric.min, value));
}

export const AffinityRuleConditionSchema = z.object({
  path: z.string().min(1),
  operator: z.enum(["gte", "lte", "gt", "lt", "eq", "neq"]),
  value: z.union([z.number(), z.string(), z.boolean()]),
});

export const AffinityPostMutationRuleSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("derive_boolean"),
    targetPath: z.string().min(1),
    mode: z.enum(["all", "any"]).default("all"),
    conditions: z.array(AffinityRuleConditionSchema).min(1),
    trueValue: z.string().default("true"),
    falseValue: z.string().default("false"),
    lockOnTrue: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("clamp_max_when"),
    targetPath: z.string().min(1),
    max: z.number(),
    conditions: z.array(AffinityRuleConditionSchema).min(1),
    mode: z.enum(["all", "any"]).default("all"),
  }),
]);

export type AffinityRuleCondition = z.infer<typeof AffinityRuleConditionSchema>;
export type AffinityPostMutationRule = z.infer<typeof AffinityPostMutationRuleSchema>;

// ===== 單一指標配置 =====

export const AffinityMetricConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().default(""),
  type: z.enum(["number", "string"]).default("number"),
  min: z.number().default(0),
  max: z.number().default(100),
  initial: z.union([z.number(), z.string()]).default(50),
  options: z.array(z.string()).default([]),
  stages: z.array(AffinityStageSchema).default([]),
  /** 這個數值代表什麼、什麼情況會加減（會寫進給 AI 的更新規則） */
  description: z.string().default(""),
  /** AI 單次最多能改多少；0 表示不限 */
  maxChange: z.number().min(0).default(0),
  /** false 時不夾在 min/max 之間（金錢、天數這類沒有上限的值） */
  bounded: z.boolean().default(true),
});

export type AffinityMetricConfig = z.infer<typeof AffinityMetricConfigSchema>;

// ===== 角色級配置（per character） =====

export const CharacterAffinityConfigSchema = z.object({
  characterId: z.string().min(1),
  enabled: z.boolean().default(false),
  /** EJS 路徑名稱：stat_data 下的鍵名，留空時使用角色的 data.name */
  statKey: z.string().default(""),
  /** 由酒館 MVU 角色卡導入時啟用相容模式 */
  mvuEnabled: z.boolean().default(false),
  /** 導入時保留原始 stat_data 初始結構，用於 EJS getvar()/stat_data 相容 */
  mvuInitialData: z.record(z.string(), z.any()).default({}),
  /** 從酒館世界書提取的 MVU 狀態描述模板 */
  mvuPromptTemplate: z.string().default(""),
  /** 從酒館世界書提取的 MVU 變量更新規則 */
  mvuUpdateInstruction: z.string().default(""),
  postMutationRules: z.array(AffinityPostMutationRuleSchema).default([]),
  metrics: z.array(AffinityMetricConfigSchema).default([]),
  promptTemplate: z.string().default(""),
  updateInstruction: z.string().default(""),
  /** 把目前數值送給 AI；世界書已經有狀態條目（MVU 卡常見）時可關掉避免重複 */
  injectStatus: z.boolean().default(true),
  /** 把更新規則送給 AI；世界書已經有規則條目時可關掉避免重複 */
  injectRules: z.boolean().default(true),
  /**
   * 自動產生的規則要 AI 用哪種格式回報：
   * tag = `<affinity-update 好感度="+2"/>`（簡單，小模型也穩）；
   * mvu = `<UpdateVariable>_.set('路徑', 舊值, 新值);</UpdateVariable>`（跟 MVU 卡相容）。
   * 沒設定時 MVU 卡用 mvu，其他用 tag。
   */
  updateFormat: z.enum(["tag", "mvu"]).optional(),
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
  /** 由哪一則 AI 訊息造成；手動調整沒有 */
  messageId: z.string().optional(),
});

export type AffinityChangeRecord = z.infer<typeof AffinityChangeRecordSchema>;

// ===== 樓層狀態（每則 AI 訊息之後的數值） =====

/**
 * 跟 MVU 一樣，每則套用過更新的 AI 訊息都記下「這則之後」的完整狀態。
 * 重抽、換回覆、刪訊息、開分支時，直接取最後一則還在的訊息的狀態，
 * 不用靠「把變化倒回去」，也就不會重抽一次就多加一次。
 */
export const AffinityFloorStateSchema = z.object({
  values: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  statData: z.record(z.string(), z.any()).default({}),
  deltaData: z.record(z.string(), z.any()).default({}),
  /** 這則訊息造成的變化，換回這則回覆時拿來還原「近期變化」 */
  changes: z.array(AffinityChangeRecordSchema).default([]),
  /** 寫入順序，超過上限時先丟最舊的 */
  seq: z.number().default(0),
});

export type AffinityFloorState = z.infer<typeof AffinityFloorStateSchema>;

/** 每個聊天最多保留幾則訊息的狀態；更早的併進 baseState */
export const MAX_FLOOR_STATES = 60;

// ===== 聊天級狀態（per chat） =====

export const ChatAffinityStateSchema = z.object({
  chatId: z.string().min(1),
  characterId: z.string().min(1),
  values: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
  mvuState: z.object({
    statData: z.record(z.string(), z.any()).default({}),
    displayData: z.record(z.string(), z.any()).default({}),
    deltaData: z.record(z.string(), z.any()).default({}),
  }).default({ statData: {}, displayData: {}, deltaData: {} }),
  history: z.array(AffinityChangeRecordSchema).default([]),
  /** 舊版：每條 AI 訊息處理前的數值快照（只剩舊聊天回滾時讀） */
  snapshots: z.record(
    z.string(),
    z.record(z.string(), z.union([z.number(), z.string()])),
  ).default({}),
  /**
   * 最後一次 rescanAffinityFromMessages 已套用的 AI 訊息 id。
   * 用於避免進入聊天 / 自動 rescan 時將同一筆 <UpdateVariable> 絕對值
   * 反覆套用而覆蓋使用者手動調整或剛建立分支的起點。
   */
  lastRescannedMessageId: z.string().optional(),
  /** 每則 AI 訊息之後的狀態，key 為 messageId */
  messageStates: z.record(z.string(), AffinityFloorStateSchema).default({}),
  /** 第一則有記錄的訊息之前的狀態（找不到任何樓層時回到這裡） */
  baseState: AffinityFloorStateSchema.optional(),
  /** 目前數值對應到哪一則訊息；手動調整會寫回這一則 */
  anchorMessageId: z.string().optional(),
  floorSeq: z.number().default(0),
  /** 重置的時間；比這更早的訊息不會被自動重新套用 */
  resetAt: z.number().optional(),
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
  const mvuInitial = config.mvuInitialData ?? {};
  const values: Record<string, MetricValue> = {};
  for (const m of config.metrics) {
    // 優先使用 mvuInitialData 中對應 path 的數值（MVU 卡導入時 stat_data 才是
    // 權威來源；metric.initial 預設 50 經常與卡片實際初始值不一致）。
    const lookupPath = (m.path && m.path.trim()) || m.name;
    const fromMvu = lookupPath ? readMvuLeaf(mvuInitial, lookupPath) : undefined;
    if (
      fromMvu !== undefined &&
      (typeof fromMvu === "number" || typeof fromMvu === "string")
    ) {
      if (m.type === "string") {
        values[m.id] = String(fromMvu);
      } else if (typeof fromMvu === "number") {
        values[m.id] = clampMetricNumber(fromMvu, m);
      } else {
        const n = Number(fromMvu);
        values[m.id] = Number.isNaN(n) ? m.initial : clampMetricNumber(n, m);
      }
    } else {
      values[m.id] = m.initial;
    }
  }
  return ChatAffinityStateSchema.parse({
    chatId,
    characterId: config.characterId,
    values,
    mvuState: {
      statData: JSON.parse(JSON.stringify(mvuInitial)) as Record<string, unknown>,
      displayData: JSON.parse(JSON.stringify(mvuInitial)) as Record<string, unknown>,
      deltaData: {},
    },
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
      const numInitial = typeof m.initial === "number" ? m.initial : 50;
      shape[m.id] = z.preprocess((v) => {
        const n = Number(v);
        if (Number.isNaN(n)) return numInitial;
        return clampMetricNumber(n, m);
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
    mvuState: {
      statData: config?.mvuInitialData ?? {},
      displayData: config?.mvuInitialData ?? {},
      deltaData: {},
    },
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
    if (obj.mvuState && typeof obj.mvuState === "object")
      fallback.mvuState = obj.mvuState;
    if (typeof obj.lastUpdated === "number")
      fallback.lastUpdated = obj.lastUpdated;
  }
  return ChatAffinityStateSchema.parse(fallback);
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * 逐筆檢查指標：一個沒填名稱的指標或清空的數字欄位，
 * 不該讓整份設定讀不出來（以前整份退回空設定，再按儲存就把指標全蓋掉）
 */
function keepValidMetrics(raw: unknown[]): AffinityMetricConfig[] {
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const metric = { ...(item as Record<string, unknown>) };
    // 數字欄位被清空會存成 ""，交給預設值
    for (const key of ["min", "max", "maxChange"]) {
      if (!isFiniteNumber(metric[key])) delete metric[key];
    }
    if (isFiniteNumber(metric.maxChange) && metric.maxChange < 0) delete metric.maxChange;
    if (Array.isArray(metric.stages)) {
      metric.stages = metric.stages
        .map((stage) =>
          stage && typeof stage === "object"
            ? {
                ...stage,
                minValue: isFiniteNumber((stage as { minValue?: unknown }).minValue)
                  ? (stage as { minValue: number }).minValue
                  : 0,
              }
            : stage,
        )
        .filter((stage) => AffinityStageSchema.safeParse(stage).success);
    }
    const parsed = AffinityMetricConfigSchema.safeParse(metric);
    return parsed.success ? [parsed.data] : [];
  });
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
    mvuEnabled: false,
    mvuInitialData: {},
    mvuPromptTemplate: "",
    mvuUpdateInstruction: "",
    postMutationRules: [],
    metrics: [],
    promptTemplate: "",
    updateInstruction: "",
    lastUpdated: 0,
  };
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.enabled === "boolean") fallback.enabled = obj.enabled;
    if (typeof obj.statKey === "string") fallback.statKey = obj.statKey;
    if (Array.isArray(obj.metrics)) fallback.metrics = keepValidMetrics(obj.metrics);
    if (typeof obj.mvuEnabled === "boolean") fallback.mvuEnabled = obj.mvuEnabled;
    if (obj.mvuInitialData && typeof obj.mvuInitialData === "object")
      fallback.mvuInitialData = obj.mvuInitialData;
    if (typeof obj.mvuPromptTemplate === "string")
      fallback.mvuPromptTemplate = obj.mvuPromptTemplate;
    if (typeof obj.mvuUpdateInstruction === "string")
      fallback.mvuUpdateInstruction = obj.mvuUpdateInstruction;
    if (Array.isArray(obj.postMutationRules))
      fallback.postMutationRules = obj.postMutationRules.filter(
        (rule) => AffinityPostMutationRuleSchema.safeParse(rule).success,
      );
    if (typeof obj.promptTemplate === "string")
      fallback.promptTemplate = obj.promptTemplate;
    if (typeof obj.updateInstruction === "string")
      fallback.updateInstruction = obj.updateInstruction;
    if (typeof obj.injectStatus === "boolean") fallback.injectStatus = obj.injectStatus;
    if (typeof obj.injectRules === "boolean") fallback.injectRules = obj.injectRules;
    if (obj.updateFormat === "tag" || obj.updateFormat === "mvu")
      fallback.updateFormat = obj.updateFormat;
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

/** 找出目前所在的階段（含說明），找不到回傳 null */
export function findStage(
  value: MetricValue,
  stages: AffinityStage[],
): AffinityStage | null {
  if (stages.length === 0 || typeof value !== "number") return null;
  const sorted = [...stages].sort((a, b) => b.minValue - a.minValue);
  for (const s of sorted) {
    if (value >= s.minValue) return s;
  }
  return sorted[sorted.length - 1] ?? null;
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
