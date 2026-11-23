/**
 * 查 Danbooru 標籤：給模型寫 NovelAI 提示詞前確認正式標籤名與熱門程度。
 * 先直連 danbooru.donmai.us；連不上（CORS、被牆）就改走 App 的代理 Worker（/proxy/{host}/...），之後一直走代理。
 */
import { aiProxyHost } from "@/native/platform";

const DANBOORU_HOST = "danbooru.donmai.us";

export interface DanbooruTag {
  /** 正式標籤名（底線已換成空格，跟 NovelAI 提示詞的寫法一樣） */
  name: string;
  postCount: number;
  category: number;
}

const CATEGORY_LABELS: Record<number, string> = {
  0: "一般",
  1: "畫師",
  3: "作品",
  4: "角色",
  5: "meta",
};

/** 模型給的關鍵字轉成 Danbooru 的萬用字元查詢：小寫、空白換 *、前後補 *（自己寫了 * 就照用） */
export function toDanbooruTagPattern(query: string): string {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return "";
  if (q.includes("*")) return q.replace(/ /g, "_");
  return `*${q.replace(/ /g, "*")}*`;
}

export function buildDanbooruTagsUrl(pattern: string, limit: number, origin = `https://${DANBOORU_HOST}`): string {
  const params = new URLSearchParams({
    "search[name_or_alias_matches]": pattern,
    "search[hide_empty]": "true",
    "search[order]": "count",
    limit: String(limit),
  });
  return `${origin}/tags.json?${params.toString()}`;
}

/** 這個工作階段已確認直連不通，之後直接走代理 */
let useProxyRoute = false;

/** 測試用：重設連線路線 */
export function resetDanbooruRoute(): void {
  useProxyRoute = false;
}

async function fetchJson(url: string, fetchImpl: typeof fetch, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchImpl(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error(`Danbooru 回應 ${response.status}`);
  return response.json();
}

interface DanbooruRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** GET Danbooru 的 JSON（path 含查詢字串，例如 /tags.json?...）：先直連，不通就走代理，之後一直走代理 */
async function danbooruGet(path: string, options: DanbooruRequestOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const directUrl = `https://${DANBOORU_HOST}${path}`;
  const proxyUrl = `${aiProxyHost()}/proxy/${DANBOORU_HOST}${path}`;
  if (useProxyRoute) return fetchJson(proxyUrl, fetchImpl, options.signal);
  try {
    return await fetchJson(directUrl, fetchImpl, options.signal);
  } catch (directError) {
    if (options.signal?.aborted) throw directError;
    console.warn("[Danbooru] 直連失敗，改走代理", directError);
    const json = await fetchJson(proxyUrl, fetchImpl, options.signal);
    useProxyRoute = true;
    return json;
  }
}

/** 用萬用字元查詢標籤，依使用次數排序 */
export async function searchDanbooruTags(
  query: string,
  limit = 8,
  options: DanbooruRequestOptions = {},
): Promise<DanbooruTag[]> {
  const pattern = toDanbooruTagPattern(query);
  if (!pattern) return [];
  const url = new URL(buildDanbooruTagsUrl(pattern, limit));
  const json = await danbooruGet(`${url.pathname}${url.search}`, options);

  if (!Array.isArray(json)) throw new Error("Danbooru 回傳格式看不懂");
  return json
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && typeof t.name === "string")
    .map((t) => ({
      name: String(t.name).replace(/_/g, " "),
      postCount: Number(t.post_count) || 0,
      category: Number(t.category) || 0,
    }));
}

/** 整理成給模型看的文字 */
export function describeDanbooruTags(query: string, tags: DanbooruTag[]): string {
  if (!tags.length) return `「${query}」在 Danbooru 找不到標籤，換個英文說法再查，或改用更常見的詞。`;
  const lines = tags.map(
    (t) => `- ${t.name}（${CATEGORY_LABELS[t.category] ?? "其他"}，${t.postCount.toLocaleString("en-US")} 張）`,
  );
  return [`「${query}」：`, ...lines].join("\n");
}

// ===== 找繪師：常畫某類內容的繪師（Danbooru 相關標籤） =====

/** Danbooru 未登入時一次搜尋最多 2 個標籤 */
export const RELATED_QUERY_MAX_TAGS = 2;

export interface DanbooruArtist {
  /** 繪師標籤（底線換成空格） */
  name: string;
  /** 使用張數；Danbooru 沒回傳時是 undefined */
  postCount?: number;
  /** 各組查詢的相關程度加總，越大越相關 */
  score: number;
  /** 出現在幾組查詢的結果裡 */
  hits: number;
}

/** "hanfu, male focus" → "hanfu male_focus"（最多 2 個標籤，多的丟掉） */
export function toRelatedTagQuery(query: string): string {
  return query
    .split(/[,，、|]/)
    .map((tag) => tag.trim().toLowerCase().replace(/\s+/g, "_"))
    .filter(Boolean)
    .slice(0, RELATED_QUERY_MAX_TAGS)
    .join(" ");
}

export function buildRelatedArtistsPath(query: string, limit = 40): string {
  // 新舊版參數寫法都帶上，Danbooru 認得哪個就用哪個
  const params = new URLSearchParams({
    "search[query]": query,
    "search[category]": "artist",
    query,
    category: "artist",
    limit: String(limit),
  });
  return `/related_tag.json?${params.toString()}`;
}

/** 解析 related_tag.json：新版 related_tags[{ tag, cosine_similarity }]，舊版 tags[[name, category]] */
export function parseRelatedArtists(json: unknown): { name: string; postCount?: number; score: number }[] {
  const data = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const out: { name: string; postCount?: number; score: number }[] = [];
  if (Array.isArray(data.related_tags)) {
    data.related_tags.forEach((entry: any, index: number) => {
      const tag = entry?.tag ?? entry;
      if (typeof tag?.name !== "string") return;
      if (tag.category !== undefined && Number(tag.category) !== 1) return;
      const cosine = Number(entry?.cosine_similarity);
      out.push({
        name: tag.name,
        postCount: tag.post_count !== undefined ? Number(tag.post_count) || 0 : undefined,
        score: Number.isFinite(cosine) && cosine > 0 ? cosine : 1 / (index + 2),
      });
    });
  } else if (Array.isArray(data.tags)) {
    data.tags.forEach((entry: any, index: number) => {
      const [name, category] = Array.isArray(entry) ? entry : [entry?.name, entry?.category];
      if (typeof name !== "string") return;
      if (category !== undefined && Number(category) !== 1) return;
      out.push({ name, score: 1 / (index + 2) });
    });
  }
  return out;
}

/**
 * 找常畫這些內容的繪師：每組查詢最多 2 個標籤，各組結果合併，
 * 依「出現在幾組」再依相關程度排序。找到的是內容相近，畫風不一定像。
 */
export async function findRelatedArtists(
  queries: string[],
  limit = 10,
  options: DanbooruRequestOptions = {},
): Promise<DanbooruArtist[]> {
  const merged = new Map<string, DanbooruArtist>();
  for (const raw of queries) {
    const query = toRelatedTagQuery(raw);
    if (!query) continue;
    const json = await danbooruGet(buildRelatedArtistsPath(query), options);
    for (const artist of parseRelatedArtists(json)) {
      const name = artist.name.replace(/_/g, " ");
      const prev = merged.get(name);
      if (prev) {
        prev.score += artist.score;
        prev.hits += 1;
        prev.postCount ??= artist.postCount;
      } else {
        merged.set(name, { name, postCount: artist.postCount, score: artist.score, hits: 1 });
      }
    }
  }
  return [...merged.values()]
    .sort((a, b) => b.hits - a.hits || b.score - a.score)
    .slice(0, limit);
}

/** 整理成給模型看的文字 */
export function describeRelatedArtists(queries: string[], artists: DanbooruArtist[]): string {
  const asked = queries.map((q) => `「${toRelatedTagQuery(q).replace(/_/g, " ")}」`).join("、");
  if (!artists.length) return `用 ${asked} 找不到繪師，換更常見的內容標籤再查。`;
  const lines = artists.map((a) => {
    const count = a.postCount !== undefined ? `，${a.postCount.toLocaleString("en-US")} 張` : "";
    return `- ${a.name}（出現在 ${a.hits} 組${count}）`;
  });
  return [
    `常畫 ${asked} 的繪師：`,
    ...lines,
    "這些是常畫這類內容的繪師，畫風不一定像；張數太少的 NovelAI 認不得。寫進 NovelAI 提示詞時加 artist: 前綴，例如 artist:名字。",
  ].join("\n");
}
