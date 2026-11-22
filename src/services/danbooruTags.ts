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

/** 用萬用字元查詢標籤，依使用次數排序 */
export async function searchDanbooruTags(
  query: string,
  limit = 8,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<DanbooruTag[]> {
  const pattern = toDanbooruTagPattern(query);
  if (!pattern) return [];
  const fetchImpl = options.fetchImpl ?? fetch;
  const directUrl = buildDanbooruTagsUrl(pattern, limit);
  const proxyUrl = buildDanbooruTagsUrl(pattern, limit, `${aiProxyHost()}/proxy/${DANBOORU_HOST}`);

  let json: unknown;
  if (useProxyRoute) {
    json = await fetchJson(proxyUrl, fetchImpl, options.signal);
  } else {
    try {
      json = await fetchJson(directUrl, fetchImpl, options.signal);
    } catch (directError) {
      if (options.signal?.aborted) throw directError;
      console.warn("[Danbooru] 直連失敗，改走代理", directError);
      json = await fetchJson(proxyUrl, fetchImpl, options.signal);
      useProxyRoute = true;
    }
  }

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
