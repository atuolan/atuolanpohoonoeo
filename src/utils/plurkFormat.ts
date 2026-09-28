/**
 * 噗浪發文格式：解析 AI 輸出的 <plurk> 區塊，並把角色最近的噗文整理成提示詞
 *
 * 新格式（屬性與 <image> 皆可省略）：
 *   <plurk qualifier="覺得" reactions="❤️12 😂5">發文內容<image>配圖描述</image></plurk>
 * 舊格式（仍相容）：
 *   <plurk><post>發文內容</post><image>中文描述｜英文提示詞</image><reactions>❤️:12,👍:8</reactions></plurk>
 */

import type { QZonePost } from "@/types/qzone";

/** 完整的 <plurk> 區塊（可帶屬性） */
export const PLURK_BLOCK_PATTERN = /<plurk\b([^>]*)>([\s\S]*?)<\/plurk>/i;
/** 用於從聊天內容中移除所有 <plurk> 區塊 */
export const PLURK_BLOCK_STRIP_PATTERN = /<plurk\b[^>]*>[\s\S]*?<\/plurk>/gi;

export const PLURK_QUALIFIERS = ["說", "想", "愛", "覺得", "會", "需要", "希望", "喜歡"];
export const PLURK_EMOTICONS = ["👍", "❤️", "😂", "😮", "😢", "😠", "🎉", "👏", "🤔", "😊"];

const MAX_REACTION_KINDS = 4;
const MAX_REACTION_COUNT = 99;

export interface ParsedPlurk {
  /** 發文內容（配圖以 <image>描述</image> 保留在內文中，噗浪空間會渲染成拍立得） */
  content: string;
  qualifier?: string;
  /** AI 有給就用 AI 的，否則為空物件 */
  reactions: Record<string, number>;
}

function readAttr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["'“”「]([^"'“”」]*)["'“”」]`, "i"));
  const value = m?.[1].trim();
  return value || undefined;
}

/** 解析「❤️12 😂5」「❤️:12,👍:8」「❤️：12，👍：8」等寫法 */
export function parseReactions(text: string): Record<string, number> {
  const reactions: Record<string, number> = {};
  const pattern = /([^\s,，、;；:：\d]+)\s*[:：]?\s*(\d+)/gu;
  for (const m of text.matchAll(pattern)) {
    if (Object.keys(reactions).length >= MAX_REACTION_KINDS) break;
    const count = Math.min(parseInt(m[2], 10), MAX_REACTION_COUNT);
    if (count > 0) reactions[m[1]] = count;
  }
  return reactions;
}

/** AI 沒填表情回應時自動產生 1-4 種 */
export function generateReactions(random: () => number = Math.random): Record<string, number> {
  const pool = [...PLURK_EMOTICONS];
  const kinds = 1 + Math.floor(random() * MAX_REACTION_KINDS);
  const reactions: Record<string, number> = {};
  for (let i = 0; i < kinds && pool.length > 0; i++) {
    const [emoji] = pool.splice(Math.floor(random() * pool.length), 1);
    reactions[emoji] = 1 + Math.floor(random() * 20);
  }
  return reactions;
}

/** 只保留配圖的中文描述（英文提示詞沒有用途） */
function imageDescription(raw: string): string {
  return raw.split(/[|｜]/)[0].trim();
}

/**
 * 解析噗文。傳入完整的 <plurk> 區塊、舊版的區塊內文，或沒有標籤的純文字皆可。
 * 內容為空時回傳 null。
 */
export function parsePlurkBlock(raw: string): ParsedPlurk | null {
  const block = raw.match(PLURK_BLOCK_PATTERN);
  const attrs = block?.[1] ?? "";
  let inner = block?.[2] ?? raw;

  if (!block) {
    // 沒有 <plurk> 標籤時清掉常見的多餘包裝
    inner = inner
      .replace(/\[QUALIFIER\][\s\S]*?\[\/QUALIFIER\]/gi, "")
      .replace(/<\/?content>/gi, "")
      .replace(/`/g, "");
  }

  const attrReactions = readAttr(attrs, "reactions");
  const tagReactions = inner.match(/<reactions>([\s\S]*?)<\/reactions>/i)?.[1];
  const reactions = parseReactions(attrReactions ?? tagReactions ?? "");

  const images = [...inner.matchAll(/<image>([\s\S]*?)<\/image>/gi)]
    .map((m) => imageDescription(m[1]))
    .filter(Boolean);

  const postMatch = inner.match(/<post>([\s\S]*?)<\/post>/i);
  const body = (postMatch ? postMatch[1] : inner)
    .replace(/<reactions>[\s\S]*?<\/reactions>/gi, "")
    .replace(/<image>[\s\S]*?<\/image>/gi, "")
    .replace(/<\/?post>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const content = [body, ...images.map((d) => `<image>${d}</image>`)]
    .filter(Boolean)
    .join("\n");
  if (!content) return null;

  return { content, qualifier: readAttr(attrs, "qualifier"), reactions };
}

// ============================================================
// {{socialPosts}}：角色最近的噗文
// ============================================================

/** 超過這個時間沒發噗，就在提示詞裡輕推一下 */
const NUDGE_AFTER_MS = 12 * 60 * 60 * 1000;

export function formatElapsed(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小時`;
  return `${Math.floor(hours / 24)} 天`;
}

function formatAgo(ms: number): string {
  const elapsed = formatElapsed(ms);
  return elapsed === "剛剛" ? elapsed : `${elapsed}前`;
}

function summarizePost(post: QZonePost, now: number, withAuthor: boolean): string {
  const text = (post.content || "")
    .replace(/<image>([\s\S]*?)<\/image>/gi, (_, d) => `[配圖：${imageDescription(d)}]`)
    .replace(/\s+/g, " ")
    .trim();
  const clipped = text.length > 100 ? `${text.slice(0, 100)}…` : text;
  const when = formatAgo(now - post.timestamp);
  const author = withAuthor ? `${post.username || "角色"} ` : "";
  const qualifier = post.qualifier ? `${post.qualifier}：` : "";

  const stats: string[] = [];
  const reactionTotal = Object.values(post.emoticons || {}).reduce((a, b) => a + b, 0);
  if (reactionTotal > 0) stats.push(`${reactionTotal} 個表情`);
  const comments = post.comments || [];
  if (comments.length > 0) {
    const latest = comments[comments.length - 1];
    const latestText = latest.content.length > 30 ? `${latest.content.slice(0, 30)}…` : latest.content;
    stats.push(`${comments.length} 則留言，最新是 ${latest.username}「${latestText}」`);
  }

  return `- [${when}] ${author}${qualifier}${clipped}${stats.length ? `（${stats.join("；")}）` : ""}`;
}

/**
 * 整理角色最近的噗文，給 {{socialPosts}} 使用。
 * 單一角色時加上「距離上次發噗」，群聊時列出各角色的噗文。
 */
export function buildSocialPostsText(
  posts: QZonePost[],
  characterIds: string[],
  now: number = Date.now(),
  limit = 5,
): string {
  const ids = new Set(characterIds);
  const own = posts
    .filter((p) => ids.has(p.authorId) && p.type !== "repost")
    .sort((a, b) => b.timestamp - a.timestamp);
  const isGroup = characterIds.length > 1;

  if (own.length === 0) {
    return isGroup
      ? "（角色們最近都還沒發過噗）"
      : "（你還沒發過噗。有想分享的心情或日常時，可以發第一則）";
  }

  const lines = own
    .slice(0, isGroup ? limit + 3 : limit)
    .map((p) => summarizePost(p, now, isGroup));

  if (!isGroup) {
    const sinceLast = now - own[0].timestamp;
    lines.push("", `上次發噗：${formatAgo(sinceLast)}`);
    if (sinceLast >= NUDGE_AFTER_MS) {
      lines.push("已經有一陣子沒發噗了，如果此刻有想分享的事，可以順手發一則。");
    }
  }
  return lines.join("\n");
}
