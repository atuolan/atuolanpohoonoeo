/**
 * 關係階段「梯子」的計算：門檻不讓使用者填，由 app 算。
 *
 * - 新做的階段：在最低～最高之間平均分配門檻
 * - 在兩階之間插一階：放在上下兩格的中間值，不重新分配（不會毀掉 MVU 卡或自訂的門檻）
 * - 「從這裡開始」：一開始的數值放在那一階範圍的中間，不貼邊界，避免一扣分就掉階
 */
import type { AffinityMetricConfig, AffinityStage } from "@/schemas/affinity";

type StageMetric = Pick<AffinityMetricConfig, "min" | "max" | "initial" | "stages" | "bounded">;

/** 由低到高排好的階段（不改原陣列） */
export function sortedStages(stages: AffinityStage[]): AffinityStage[] {
  return [...stages].sort((a, b) => a.minValue - b.minValue);
}

/** 在 min～max 之間平均分配 count 個門檻（第一階從 min 開始） */
export function evenThresholds(min: number, max: number, count: number): number[] {
  if (count <= 0) return [];
  const step = (max - min) / count;
  return Array.from({ length: count }, (_, i) => Math.round(min + step * i));
}

/** 某一階（由低到高的第 index 階）涵蓋的範圍 */
export function stageSpan(metric: StageMetric, index: number): { from: number; to: number } {
  const stages = sortedStages(metric.stages);
  const from = stages[index]?.minValue ?? metric.min;
  const next = stages[index + 1]?.minValue;
  const to = next !== undefined ? next - 1 : Math.max(metric.max, from);
  return { from, to };
}

/** 「從這裡開始」：那一階範圍的中間 */
export function startValueForStage(metric: StageMetric, index: number): number {
  const { from, to } = stageSpan(metric, index);
  return Math.round((from + to) / 2);
}

/** 目前的「一開始」落在哪一階（由低到高的索引）；沒有階段回傳 -1 */
export function startStageIndex(metric: StageMetric): number {
  const stages = sortedStages(metric.stages);
  if (stages.length === 0) return -1;
  const initial = typeof metric.initial === "number" ? metric.initial : Number(metric.initial);
  let found = 0;
  stages.forEach((s, i) => {
    if (Number.isFinite(initial) && initial >= s.minValue) found = i;
  });
  return found;
}

/**
 * 在由低到高第 index 階的「上面」插一階，門檻取上下兩格的中間值；
 * 插在最上面時取最高階和最大值的中間。回傳新的階段陣列（由低到高）。
 * 兩格之間已經沒有空間（門檻相鄰）時回傳 null。
 */
export function insertStageAbove(
  metric: StageMetric,
  index: number,
  stage: Omit<AffinityStage, "minValue">,
): AffinityStage[] | null {
  const stages = sortedStages(metric.stages);
  const lower = stages[index]?.minValue ?? metric.min;
  const upper = stages[index + 1]?.minValue ?? metric.max + 1;
  const mid = Math.round((lower + upper) / 2);
  if (mid <= lower || mid >= upper) return null;
  const next = [...stages];
  next.splice(index + 1, 0, { ...stage, minValue: mid });
  return next;
}

/** 收起時的一行摘要：有階段寫「從『陌生』開始 · 5 個階段」，沒有才寫數字 */
export function metricSummary(metric: AffinityMetricConfig): string {
  if (metric.type === "string") {
    const opts = metric.options?.length ? `${metric.options.length} 種狀態` : "自由填寫";
    return `從「${metric.initial || "—"}」開始 · ${opts}`;
  }
  const stages = sortedStages(metric.stages ?? []);
  if (stages.length > 0) {
    const start = stages[startStageIndex(metric)];
    return `從「${start?.name || "—"}」開始 · ${stages.length} 個階段`;
  }
  return metric.bounded === false
    ? `一開始 ${metric.initial} · 不限範圍`
    : `一開始 ${metric.initial}／${metric.max}`;
}

// ===== 節奏：慢熱／普通／好攻略（就是「每次最多增減」換個說法） =====

export type AffinityPace = "slow" | "normal" | "fast";

export const PACE_LABELS: Record<AffinityPace, string> = {
  slow: "慢熱",
  normal: "普通",
  fast: "好攻略",
};

const PACE_RATIO: Record<AffinityPace, number> = { slow: 0.02, normal: 0.05, fast: 0.08 };

/** 這個節奏對應的「每次最多增減」：範圍的 2%／5%／8%，至少 1 */
export function maxChangeForPace(
  metric: Pick<AffinityMetricConfig, "min" | "max" | "bounded">,
  pace: AffinityPace,
): number {
  const range = metric.bounded === false ? 100 : Math.max(1, metric.max - metric.min);
  return Math.max(1, Math.round(range * PACE_RATIO[pace]));
}

/** 目前的「每次最多增減」最接近哪個節奏；0（不限）或差太多時回傳 null */
export function paceOf(
  metric: Pick<AffinityMetricConfig, "min" | "max" | "bounded" | "maxChange">,
): AffinityPace | null {
  if (!(metric.maxChange > 0)) return null;
  const paces: AffinityPace[] = ["slow", "normal", "fast"];
  return paces.find((p) => maxChangeForPace(metric, p) === metric.maxChange) ?? null;
}

/**
 * 上下顛倒（AI 有時把階段寫成由高到低）：門檻不動，名稱和表現對調，
 * 起點跟著換到對應的那一階
 */
export function reverseStages(metric: StageMetric): { stages: AffinityStage[]; initial: number } {
  const stages = sortedStages(metric.stages);
  const start = startStageIndex(metric);
  const reversed = stages.map((s, i) => {
    const mirror = stages[stages.length - 1 - i];
    return { ...s, name: mirror.name, description: mirror.description };
  });
  const next = { ...metric, stages: reversed };
  return {
    stages: reversed,
    initial: start >= 0 ? startValueForStage(next, stages.length - 1 - start) : Number(metric.initial),
  };
}
