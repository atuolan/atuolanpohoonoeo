/**
 * 廣場路人噗的排程計算：一次生成的一批噗要排在什麼時間、還剩多少、版主何時處理。
 * 全部是純函式，不碰 store 也不打 API。
 */
import type { PlurkModeration, QZonePost } from "@/types/qzone";

const MIN = 60_000;
const H = 3600_000;

/** 路人多寡 1–5 對應每小時出現幾則路人噗 */
export const SQUARE_POSTS_PER_HOUR = [0.5, 1, 2, 4, 8];
/** 一次 AI 呼叫生幾則（使用者可選） */
export const SQUARE_BATCH_OPTIONS = [5, 10, 15, 20];
export const DEFAULT_SQUARE_BATCH = 10;
/** 離開太久、排好的都出完了：新的一批最多往回補 3 小時 */
export const SQUARE_BACKFILL_MAX = 3 * H;
/** 排隊中的噗剩不到 1 小時的量就補下一批 */
export const SQUARE_REFILL_AHEAD = H;
/** 手動按「讓廣場熱鬧起來」時，馬上出現的那幾則落在過去 40 分鐘內 */
export const SQUARE_IMMEDIATE_WINDOW = 40 * MIN;

/** 每小時幾則（npcLevel 夾在 1–5） */
export function squarePostsPerHour(npcLevel: number): number {
  const rounded = Math.round(npcLevel);
  const level = Math.min(5, Math.max(1, Number.isFinite(rounded) ? rounded : 1));
  return SQUARE_POSTS_PER_HOUR[level - 1];
}

/** 一次生成的批大小，不合法的值回傳預設 */
export function normalizeSquareBatch(value: unknown): number {
  if (typeof value === "number" && SQUARE_BATCH_OPTIONS.includes(value)) return value;
  return DEFAULT_SQUARE_BATCH;
}

/** 凌晨 2–7 點是安靜時段，噗間隔加倍 */
export function isQuietHour(hour: number): boolean {
  return hour >= 2 && hour < 7;
}

/** 從 start 開始往後排 count 則，回傳遞增的時間戳 */
export function scheduleSquareTimes(input: {
  count: number;
  perHour: number;
  start: number;
  random?: () => number;
}): number[] {
  const { count, perHour, start } = input;
  const random = input.random ?? Math.random;
  if (count <= 0 || perHour <= 0) return [];
  const times: number[] = [];
  let t = start;
  for (let i = 0; i < count; i += 1) {
    let gap = (H / perHour) * (0.5 + random());
    if (isQuietHour(new Date(t).getHours())) gap *= 2;
    t += gap;
    times.push(Math.round(t));
  }
  return times;
}

/** 排定一批噗的時間：手動補熱鬧會先塞幾則在過去，平常就接在最後一則後面 */
export function planSquareTimes(input: {
  count: number;
  perHour: number;
  now: number;
  lastAt: number | null;
  manual: boolean;
  random?: () => number;
}): number[] {
  const { count, perHour, now, lastAt, manual } = input;
  const random = input.random ?? Math.random;
  if (count <= 0) return [];
  const times: number[] = [];
  if (manual) {
    const immediate = Math.min(count, Math.ceil(count / 3));
    for (let i = 0; i < immediate; i += 1) {
      times.push(now - Math.round(random() * SQUARE_IMMEDIATE_WINDOW));
    }
    const rest = count - immediate;
    if (rest > 0) {
      times.push(
        ...scheduleSquareTimes({ count: rest, perHour, start: Math.max(now, lastAt ?? 0), random }),
      );
    }
  } else {
    const start = Math.max(lastAt ?? Number.NEGATIVE_INFINITY, now - SQUARE_BACKFILL_MAX);
    times.push(...scheduleSquareTimes({ count, perHour, start, random }));
  }
  return times.sort((a, b) => a - b);
}

/** 是不是廣場生成的噗：路人噗或角色的偷偷說 */
export function isGeneratedSquarePost(post: QZonePost): boolean {
  return !!post.npc || !!post.anonOf;
}

/** 廣場生成的噗裡最新的時間，沒有就 null */
export function latestSquareAt(posts: QZonePost[]): number | null {
  let latest: number | null = null;
  for (const post of posts) {
    if (!isGeneratedSquarePost(post)) continue;
    if (latest === null || post.timestamp > latest) latest = post.timestamp;
  }
  return latest;
}

/** 還排隊中的噗：還沒出現的則數與最後一則的時間 */
export function squareStock(posts: QZonePost[], now: number): { count: number; until: number | null } {
  let count = 0;
  let until: number | null = null;
  for (const post of posts) {
    if (!isGeneratedSquarePost(post)) continue;
    if (post.timestamp <= now) continue;
    count += 1;
    if (until === null || post.timestamp > until) until = post.timestamp;
  }
  return { count, until };
}

/** 排好的噗快出完了，該補下一批 */
export function needsSquareRefill(posts: QZonePost[], now: number): boolean {
  return (latestSquareAt(posts) ?? 0) - now < SQUARE_REFILL_AHEAD;
}

/** 版主處理時間：噗出現後 10–90 分鐘 */
export function moderationDelayAt(at: number, random: () => number = Math.random): number {
  return at + Math.round((10 + random() * 80) * MIN);
}

/** 版主處分該不該顯示了 */
export function isModerationShown(moderation: PlurkModeration | undefined, now: number): boolean {
  return !!moderation && moderation.at <= now;
}

/** 廣場庫存的文案 */
export function squareStockText(stock: { count: number; until: number | null }, now: number): string {
  if (stock.count === 0 || stock.until === null) return "排好的路人噗都出完了";
  const hours = Math.max(1, Math.ceil((stock.until - now) / H));
  return `還有 ${stock.count} 則會在接下來 ${hours} 小時陸續出現`;
}
