/**
 * 小屋記事：家裡發生的事照規則記下來（不用 AI），使用者可以勾幾件「告訴他」。
 *
 * - 文字裡的 {char} 是住在小屋的他、{user} 是使用者：小屋裡顯示「他／你」，送進聊天的卡片寫「你／我」
 * - 只留一天：超過一天的事（說過、沒說過都一樣）自己消失，免得隔天才講舊事
 * - 說過的標「已告訴」，不能再說一次
 * - 一樣的事三十分鐘內只記一次（例如連續清好幾灘便便）
 */
import type { HouseNewsShare } from "@/types/houseNews";

export type NewsWho = "char" | "user" | "pet" | "house";

export interface HouseNews {
  id: string;
  at: number;
  who: NewsWho;
  /** 用 {char}、{user} 代替他和使用者 */
  text: string;
  /** 他做的事：是哪個角色（換人住以後，前一個人做的事不拿去跟新的人說） */
  charId?: string;
  /** 告訴他的時間；沒說過是 undefined */
  told?: number;
}

export const NEWS_KEEP_MS = 24 * 60 * 60 * 1000;
export const NEWS_MAX = 40;
export const NEWS_MERGE_MS = 30 * 60 * 1000;
/** 一次最多勾幾件（卡片太長他也記不住） */
export const NEWS_PICK_MAX = 8;

const STORAGE_KEY = "pixel_house_news";
/** 記了新的一件：開著的小屋、聊天的清單跟著更新 */
export const HOUSE_NEWS_EVENT = "pixel-house:news";

const WHO: NewsWho[] = ["char", "user", "pet", "house"];

/** 超過一天的拿掉、最多留 NEWS_MAX 件（新的在前面） */
export function pruneNews(list: HouseNews[], now: number): HouseNews[] {
  return list
    .filter((n) => n.at > now - NEWS_KEEP_MS && n.at <= now + 60_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, NEWS_MAX);
}

/** 加一件；三十分鐘內記過一樣的就不再記 */
export function addNews(list: HouseNews[], entry: Omit<HouseNews, "id" | "at">, now: number): HouseNews[] {
  const text = entry.text.trim();
  if (!text) return pruneNews(list, now);
  if (list.some((n) => n.text === text && n.charId === entry.charId && Math.abs(now - n.at) < NEWS_MERGE_MS)) return pruneNews(list, now);
  const id = `n${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  return pruneNews([{ ...entry, text, id, at: now }, ...list], now);
}

/** 讀存檔：認得的才留 */
export function parseNews(raw: unknown, now: number): HouseNews[] {
  if (!Array.isArray(raw)) return [];
  const out: HouseNews[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const n = r as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.text !== "string" || typeof n.at !== "number" || !WHO.includes(n.who as NewsWho)) continue;
    out.push({
      id: n.id,
      at: n.at,
      who: n.who as NewsWho,
      text: n.text,
      charId: typeof n.charId === "string" ? n.charId : undefined,
      told: typeof n.told === "number" ? n.told : undefined,
    });
  }
  return pruneNews(out, now);
}

export function loadNews(now = Date.now()): HouseNews[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseNews(JSON.parse(raw), now) : [];
  } catch {
    return [];
  }
}

export function saveNews(list: HouseNews[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存不了就算了（無痕模式），記事只是附帶的
  }
  try {
    window.dispatchEvent(new CustomEvent(HOUSE_NEWS_EVENT));
  } catch {
    // 非瀏覽器環境（測試）
  }
}

/** 記下一件事 */
export function logHouseNews(text: string, who: NewsWho, charId?: string, now = Date.now()): void {
  saveNews(addNews(loadNews(now), { text, who, charId: who === "char" ? charId : undefined }, now));
}

/** 這個人可以聽的：他做的事只給做的那個人 */
export function newsFor(list: HouseNews[], charId: string | null | undefined): HouseNews[] {
  return list.filter((n) => n.who !== "char" || !n.charId || n.charId === charId);
}

const fill = (text: string, char: string, user: string) => text.split("{char}").join(char).split("{user}").join(user);

/** 小屋裡顯示：{char} → 他／她、{user} → 你 */
export function newsHouseText(text: string, pronoun: string): string {
  return fill(text, pronoun, "你");
}

/** 卡片上（使用者跟他說）：{char} → 你、{user} → 我 */
export function newsCardText(text: string): string {
  return fill(text, "你", "我");
}

/** 勾好的幾件做成卡片（舊的在前面，照發生的順序讀） */
export function buildNewsShare(list: HouseNews[], ids: string[], now: number): HouseNewsShare | null {
  const picked = list
    .filter((n) => ids.includes(n.id) && !n.told)
    .sort((a, b) => a.at - b.at)
    .slice(-NEWS_PICK_MAX);
  if (!picked.length) return null;
  return { items: picked.map((n) => ({ at: n.at, text: newsCardText(n.text) })), sentAt: now };
}

/** 標成已告訴 */
export function markTold(list: HouseNews[], ids: string[], now: number): HouseNews[] {
  return list.map((n) => (ids.includes(n.id) && !n.told ? { ...n, told: now } : n));
}
