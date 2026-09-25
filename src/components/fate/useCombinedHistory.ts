/**
 * 合併四種占卜的歷史紀錄（塔羅／雷諾曼／神諭卡＋占星骰子），新到舊
 */
import { useAstroDiceStore } from "@/stores/astroDice";
import { useDivinationStore } from "@/stores/divination";
import type { AstroDiceReading } from "@/types/astroDice";
import type { DeckId, ReadingRecord } from "@/types/divination";
import { computed } from "vue";

export type HistoryKind = DeckId | "astro";

export interface HistoryItem {
  kind: HistoryKind;
  id: string;
  question: string;
  summary: string;
  createdAt: number;
  interpretation?: string;
  record?: ReadingRecord;
  astro?: AstroDiceReading;
}

export const HISTORY_KIND_LABEL: Record<HistoryKind, string> = {
  tarot: "塔羅",
  lenormand: "雷諾曼",
  oracle: "神諭卡",
  astro: "占星骰子",
};

/** 列表上的單字標記 */
export const HISTORY_KIND_MARK: Record<HistoryKind, string> = {
  tarot: "塔",
  lenormand: "雷",
  oracle: "諭",
  astro: "骰",
};

export function astroSummary(r: AstroDiceReading): string {
  const { planet, sign, house } = r.result;
  return `${planet.symbol} ${planet.nameCn} + ${sign.symbol} ${sign.nameCn} + ${house.romanNumeral} ${house.nameCn}`;
}

function recordSummary(r: ReadingRecord): string {
  const cards = r.drawn.map((d) => `${d.card.name}${d.reversed ? "(逆)" : ""}`).join("、");
  return `${r.spread.name}・${cards}`;
}

export function useCombinedHistory() {
  const store = useDivinationStore();
  const astroStore = useAstroDiceStore();

  const items = computed<HistoryItem[]>(() => {
    const cardItems = store.records.map((record) => ({
      kind: record.deckId,
      id: record.id,
      question: record.question,
      summary: recordSummary(record),
      createdAt: record.createdAt,
      interpretation: record.interpretation,
      record,
    }));
    const astroItems = astroStore.readings.map((astro) => ({
      kind: "astro" as const,
      id: astro.id,
      question: astro.question,
      summary: astroSummary(astro),
      createdAt: astro.createdAt,
      interpretation: astro.interpretation,
      astro,
    }));
    return [...cardItems, ...astroItems].sort((a, b) => b.createdAt - a.createdAt);
  });

  async function remove(item: HistoryItem) {
    if (item.kind === "astro") await astroStore.deleteReading(item.id);
    else await store.deleteRecord(item.kind, item.id);
  }

  async function clearAll() {
    await Promise.all([store.clearHistory(), astroStore.clearHistory()]);
  }

  return { items, remove, clearAll };
}

/** 相對時間：今天 14:05／昨天／3 天前／2026/9/18 */
export function formatWhen(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((startOfToday.getTime() - ts) / 86_400_000) + 1;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (ts >= startOfToday.getTime()) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (dayDiff === 1) return "昨天";
  if (dayDiff < 7) return `${dayDiff} 天前`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
