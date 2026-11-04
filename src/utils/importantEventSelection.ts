/**
 * 重要事件要送哪幾條給 AI
 *
 * - 常駐（優先級 1）：每輪都送，例如開始交往、送戒指
 * - 其他：最近的對話聊到它的關鍵詞、或向量記憶找到它，才送
 *
 * 記錄本設定 injectMode = "all" 時照舊全部送（依優先級取前 maxEvents 條）。
 */
import { expandKeywords } from "@/utils/keywordExpander";
import { extractSummaryKeywords } from "@/utils/summaryKeywordExtractor";

export type ImportantEventInjectMode = "triggered" | "all";

export interface SelectableImportantEvent {
  id: string;
  content: string;
  priority?: number;
  timestamp?: number;
  vectorKeywords?: string[];
}

export interface ImportantEventSelectOptions {
  /** triggered（預設）＝常駐＋聊到才送；all＝全部送 */
  mode?: ImportantEventInjectMode;
  /** 最近幾則對話的文字，用來比對關鍵詞 */
  scanText?: string;
  /** 向量記憶找到的事件 id */
  vectorHitIds?: Iterable<string>;
  /** 角色、使用者的名字：當關鍵詞每句都會中，不算 */
  excludeNames?: string[];
  /** 總共最多送幾條（記錄本的 maxEvents） */
  limit?: number;
  /** 聊到才送的最多幾條 */
  maxTriggered?: number;
}

/** 聊到才送的事件，預設一輪最多幾條 */
export const DEFAULT_MAX_TRIGGERED_EVENTS = 10;

/** 比對關鍵詞時看最近幾則訊息 */
export const EVENT_SCAN_DEPTH = 4;

/** 每則訊息最多看多長，避免超長訊息拖慢比對 */
const MAX_SCAN_CHARS_PER_MESSAGE = 1500;

/** 優先級 1 ＝常駐，每輪都送 */
export function isPinnedEvent(event: { priority?: number }): boolean {
  return event.priority === 1;
}

/** 戒指、求婚這類一送就該一直記得的禮物 */
const PINNED_GIFT_PATTERN = /戒指|婚戒|對戒|鑽戒|求婚/;

export function isPinnedGiftName(giftName: string): boolean {
  return PINNED_GIFT_PATTERN.test(giftName);
}

const QUOTED_PATTERN = /[「『“"]([^「」『』“”"]{2,16})[」』”"]/g;

/**
 * 一條事件的觸發關鍵詞：使用者編輯過的 vectorKeywords，沒有就從內容抓；
 * 再加上「」引號裡的名稱（禮物名、地點），名字類的去掉
 */
export function eventTriggerKeywords(
  event: Pick<SelectableImportantEvent, "content" | "vectorKeywords">,
  excludeNames: string[] = [],
): string[] {
  const content = event.content || "";
  const base =
    event.vectorKeywords && event.vectorKeywords.length > 0
      ? event.vectorKeywords
      : extractSummaryKeywords(content);
  const quoted = [...content.matchAll(QUOTED_PATTERN)].map((m) => m[1]);
  const excluded = new Set(
    excludeNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  const result: string[] = [];
  for (const raw of [...base, ...quoted]) {
    const kw = raw.trim();
    if (kw.length < 2) continue;
    if (excluded.has(kw.toLowerCase())) continue;
    if (result.some((r) => r.toLowerCase() === kw.toLowerCase())) continue;
    result.push(kw);
  }
  return result;
}

/** 最近幾則訊息合成一段文字，給關鍵詞比對用 */
export function buildEventScanText(
  messages: Array<{ content?: unknown } | null | undefined>,
  depth = EVENT_SCAN_DEPTH,
): string {
  return messages
    .slice(-depth)
    .map((m) => (typeof m?.content === "string" ? m.content.slice(-MAX_SCAN_CHARS_PER_MESSAGE) : ""))
    .filter(Boolean)
    .join("\n");
}

/** 這條事件的關鍵詞在對話裡出現幾個（含同義詞） */
function countKeywordHits(
  keywords: string[],
  lowerText: string,
  expandedTerms: Set<string>,
): number {
  let hits = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    if (lowerText.includes(k) || expandedTerms.has(k)) hits++;
  }
  return hits;
}

function byPriorityThenNewest(
  a: SelectableImportantEvent,
  b: SelectableImportantEvent,
): number {
  return (a.priority || 3) - (b.priority || 3) || (b.timestamp ?? 0) - (a.timestamp ?? 0);
}

export function selectImportantEventsForPrompt<T extends SelectableImportantEvent>(
  events: T[],
  options: ImportantEventSelectOptions = {},
): T[] {
  const limit = options.limit ?? Infinity;
  const sorted = events.filter((e) => e?.content?.trim()).sort(byPriorityThenNewest);

  if (options.mode === "all") return sorted.slice(0, limit);

  const pinned = sorted.filter(isPinnedEvent);

  const vectorHits = new Set(options.vectorHitIds ?? []);
  const scanText = options.scanText?.trim() ?? "";
  const lowerText = scanText.toLowerCase();
  const expandedTerms = new Set(
    scanText ? expandKeywords(scanText).expandedTerms.map((t) => t.toLowerCase()) : [],
  );

  const triggered: Array<{ event: T; hits: number }> = [];
  for (const event of sorted) {
    if (isPinnedEvent(event)) continue;
    const hits = scanText
      ? countKeywordHits(eventTriggerKeywords(event, options.excludeNames), lowerText, expandedTerms)
      : 0;
    if (hits > 0 || vectorHits.has(event.id)) {
      // 向量命中算一個關鍵詞，排序時跟關鍵詞一起比
      triggered.push({ event, hits: hits + (vectorHits.has(event.id) ? 1 : 0) });
    }
  }
  // 中越多關鍵詞的越前面；同分保持優先級、新舊順序
  triggered.sort((a, b) => b.hits - a.hits);

  const maxTriggered = options.maxTriggered ?? DEFAULT_MAX_TRIGGERED_EVENTS;
  return [...pinned, ...triggered.slice(0, maxTriggered).map((t) => t.event)].slice(0, limit);
}
