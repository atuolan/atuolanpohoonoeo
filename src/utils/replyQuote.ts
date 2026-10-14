/**
 * AI 引用回覆：模型在 <reply-to> 裡只抄原訊息的一小段，這裡找出是哪一則
 *
 * 由新到舊比對：
 * 1. 去掉空白、標點、標籤後，片段出現在某則訊息裡
 * 2. 模型整句抄但抄得不完全一樣：字的重疊度夠高也算
 * 都對不上就回傳 null，畫面照舊顯示模型寫的字
 */

export interface QuoteCandidate {
  id: string;
  role: "user" | "ai" | "system";
  content: string;
  isStreaming?: boolean;
  isGroupAction?: boolean;
  isRecall?: boolean;
  isUserRecalled?: boolean;
  isCharRecall?: boolean;
  _isPendingRecall?: boolean;
}

export interface FindQuotedMessageOptions<T> {
  /** 模型標註的被引用者名字（<reply-to name> 或 [回覆 名字：…]），有的話先找這個人的訊息 */
  senderName?: string;
  /** 取得訊息發送者名字，用來比對 senderName */
  senderNameOf?: (message: T) => string | undefined;
}

/** 只往回看這麼多則：模型看得到的歷史也有限 */
const MAX_LOOKBACK = 300;
/** 片段至少這麼長才用重疊度猜，太短的片段只認完全出現 */
const MIN_FUZZY_LENGTH = 6;
const MIN_FUZZY_SCORE = 0.7;

/** 比對用的文字：去掉標籤、空白、標點與符號，全形英數轉半形 */
export function normalizeQuoteText(text: string): string {
  return (text || "")
    .replace(/\[sticker:([^\]]*)\]/g, "$1")
    .replace(/\[img:[^\]]*\]/g, "")
    .replace(/<[^>]*>/g, "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 模型有時把歷史裡的 [時間]、[名字]、[回覆 …] 前綴一起抄進來 */
function stripCopiedPrefixes(quote: string): string {
  return quote.replace(/^(?:\s*\[[^\]\n]{1,120}\])+\s*/, "").trim();
}

function quotableText(message: QuoteCandidate): string {
  return (message.content || "").replace(/^\[語音訊息\]\s*/, "");
}

function isQuotable(message: QuoteCandidate): boolean {
  return (
    message.role !== "system" &&
    !message.isStreaming &&
    !message.isGroupAction &&
    !message.isRecall &&
    !message.isUserRecalled &&
    !message.isCharRecall &&
    !message._isPendingRecall
  );
}

function sameName(a: string | undefined, b: string): boolean {
  if (!a) return false;
  const clean = (s: string) => s.normalize("NFKC").replace(/\s+/g, "");
  return clean(a) === clean(b);
}

function bigrams(text: string): Set<string> {
  const grams = new Set<string>();
  for (let i = 0; i < text.length - 1; i++) grams.add(text.slice(i, i + 2));
  return grams;
}

interface Normalized<T> {
  message: T;
  text: string;
}

function matchByContainment<T>(query: string, pool: Normalized<T>[]): T | null {
  for (const { message, text } of pool) {
    if (query.length <= 2 ? text.startsWith(query) : text.includes(query)) {
      return message;
    }
  }
  return null;
}

function matchBySimilarity<T>(query: string, pool: Normalized<T>[]): T | null {
  if (query.length < MIN_FUZZY_LENGTH) return null;
  const queryGrams = bigrams(query);
  let best: T | null = null;
  let bestScore = 0;
  for (const { message, text } of pool) {
    if (text.length < 2) continue;
    const grams = bigrams(text);
    let shared = 0;
    for (const gram of queryGrams) if (grams.has(gram)) shared++;
    const score = shared / queryGrams.size;
    // 分數相同時保留較新的那則
    if (score > bestScore) {
      best = message;
      bestScore = score;
    }
  }
  return bestScore >= MIN_FUZZY_SCORE ? best : null;
}

/**
 * 找出模型引用的訊息
 * @param quote 模型寫在 <reply-to> 裡的文字
 * @param candidates 依時間排序（舊到新）的訊息，包含同一輪已經出現的訊息
 */
export function findQuotedMessage<T extends QuoteCandidate>(
  quote: string,
  candidates: readonly T[],
  options: FindQuotedMessageOptions<T> = {},
): T | null {
  const query =
    normalizeQuoteText(stripCopiedPrefixes(quote)) || normalizeQuoteText(quote);
  if (!query) return null;

  const pool: Normalized<T>[] = [];
  for (let i = candidates.length - 1; i >= 0 && pool.length < MAX_LOOKBACK; i--) {
    const message = candidates[i];
    if (!isQuotable(message)) continue;
    const text = normalizeQuoteText(quotableText(message));
    if (text) pool.push({ message, text });
  }

  const { senderName, senderNameOf } = options;
  const pools: Normalized<T>[][] = [];
  if (senderName && senderNameOf) {
    const named = pool.filter(({ message }) => sameName(senderNameOf(message), senderName));
    if (named.length > 0) pools.push(named);
  }
  pools.push(pool);

  for (const group of pools) {
    const hit = matchByContainment(query, group);
    if (hit) return hit;
  }
  for (const group of pools) {
    const hit = matchBySimilarity(query, group);
    if (hit) return hit;
  }
  return null;
}
