import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildDanbooruTagsUrl,
  describeDanbooruTags,
  resetDanbooruRoute,
  searchDanbooruTags,
  toDanbooruTagPattern,
} from "./danbooruTags";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const TAGS = [
  { name: "twintails", post_count: 812345, category: 0 },
  { name: "low_twintails", post_count: 90123, category: 0 },
];

afterEach(() => resetDanbooruRoute());

describe("查 Danbooru 標籤", () => {
  it("關鍵字轉成萬用字元查詢", () => {
    expect(toDanbooruTagPattern("Twin Tails")).toBe("*twin*tails*");
    expect(toDanbooruTagPattern("  sitting   window ")).toBe("*sitting*window*");
    expect(toDanbooruTagPattern("long hair*")).toBe("long_hair*");
    expect(toDanbooruTagPattern("   ")).toBe("");
  });

  it("網址帶查詢、隱藏空標籤、依張數排序", () => {
    const url = new URL(buildDanbooruTagsUrl("*twin*", 5));
    expect(url.origin + url.pathname).toBe("https://danbooru.donmai.us/tags.json");
    expect(url.searchParams.get("search[name_or_alias_matches]")).toBe("*twin*");
    expect(url.searchParams.get("search[hide_empty]")).toBe("true");
    expect(url.searchParams.get("search[order]")).toBe("count");
    expect(url.searchParams.get("limit")).toBe("5");
  });

  it("直連成功：底線換空格，讀出張數與分類", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(TAGS));
    const tags = await searchDanbooruTags("twin tails", 5, { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String((fetchImpl.mock.calls[0] as unknown[])[0])).toContain("https://danbooru.donmai.us/tags.json?");
    expect(tags).toEqual([
      { name: "twintails", postCount: 812345, category: 0 },
      { name: "low twintails", postCount: 90123, category: 0 },
    ]);
  });

  it("直連失敗改走代理，之後一直走代理", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith("https://danbooru.donmai.us/")) throw new TypeError("Failed to fetch");
      return jsonResponse(TAGS);
    });
    const opts = { fetchImpl: fetchImpl as unknown as typeof fetch };
    await searchDanbooruTags("twin", 5, opts);
    expect(String((fetchImpl.mock.calls[1] as unknown[])[0])).toContain("/proxy/danbooru.donmai.us/tags.json?");
    await searchDanbooruTags("cat", 5, opts);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String((fetchImpl.mock.calls[2] as unknown[])[0])).toContain("/proxy/danbooru.donmai.us/");
  });

  it("兩條路都失敗時丟錯", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "x" }, 503));
    await expect(
      searchDanbooruTags("twin", 5, { fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow("Danbooru 回應 503");
  });

  it("整理成給模型看的文字", () => {
    expect(describeDanbooruTags("twin", [{ name: "twintails", postCount: 812345, category: 0 }])).toBe(
      "「twin」：\n- twintails（一般，812,345 張）",
    );
    expect(describeDanbooruTags("zzz", [])).toContain("找不到");
  });
});

describe("search_danbooru_tags 工具", () => {
  it("一次查好幾個關鍵字，整理成一段文字", async () => {
    const { CHAT_TOOLS, DANBOORU_TAGS_TOOL_NAME } = await import("@/services/toolCalling/chatTools");
    const tool = CHAT_TOOLS.find((t) => t.name === DANBOORU_TAGS_TOOL_NAME)!;
    const fetchMock = vi.fn(async () => jsonResponse(TAGS));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const text = String(await tool.execute({ queries: ["twin tails", "  ", "ponytail"], limit: 5 }, {}));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(text).toContain("「twin tails」：");
      expect(text).toContain("「ponytail」：");
      expect(text).toContain("- low twintails（一般，90,123 張）");
      await expect(tool.execute({ queries: [] }, {})).rejects.toThrow("至少一個");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
