import { describe, expect, it } from "vitest";
import type { QZonePost } from "@/types/qzone";
import {
  buildSocialPostsText,
  generateReactions,
  parsePlurkBlock,
  parseReactions,
  PLURK_EMOTICONS,
} from "./plurkFormat";

describe("parsePlurkBlock", () => {
  it("新格式：只有內文", () => {
    expect(parsePlurkBlock("<plurk>今天好累</plurk>")).toEqual({
      content: "今天好累",
      qualifier: undefined,
      reactions: {},
    });
  });

  it("新格式：限定詞、表情、配圖留在內文", () => {
    const parsed = parsePlurkBlock(
      '<plurk qualifier="覺得" reactions="❤️12 😂5">雨大到傘都翻了<image>被吹翻的透明雨傘</image></plurk>',
    );
    expect(parsed).toEqual({
      content: "雨大到傘都翻了\n<image>被吹翻的透明雨傘</image>",
      qualifier: "覺得",
      reactions: { "❤️": 12, "😂": 5 },
    });
  });

  it("舊格式：<post>/<image>/<reactions>，全形分隔的英文提示詞會被丟掉", () => {
    const parsed = parsePlurkBlock(`<plurk>
  <post>剛跑完三公里</post>
  <image>夕陽下的操場｜sunset running track</image>
  <reactions>❤️:12,👍:8,😊:5</reactions>
</plurk>`);
    expect(parsed).toEqual({
      content: "剛跑完三公里\n<image>夕陽下的操場</image>",
      qualifier: undefined,
      reactions: { "❤️": 12, "👍": 8, "😊": 5 },
    });
  });

  it("舊版傳入的區塊內文（沒有外層 <plurk>）也能解析", () => {
    expect(parsePlurkBlock("<post>哈囉</post><reactions>👍:3</reactions>")?.content).toBe("哈囉");
  });

  it("沒有標籤的純文字會清掉多餘包裝", () => {
    expect(parsePlurkBlock("[QUALIFIER]想[/QUALIFIER]<content>`好想吃拉麵`</content>")?.content).toBe(
      "好想吃拉麵",
    );
  });

  it("內容為空回傳 null", () => {
    expect(parsePlurkBlock("<plurk>  </plurk>")).toBeNull();
    expect(parsePlurkBlock('<plurk reactions="❤️3"><reactions>👍:1</reactions></plurk>')).toBeNull();
  });
});

describe("parseReactions", () => {
  it("支援各種分隔符號與全形冒號", () => {
    expect(parseReactions("❤️：12，👍：8、😂 3")).toEqual({ "❤️": 12, "👍": 8, "😂": 3 });
  });

  it("最多 4 種、數量上限 99、忽略 0", () => {
    expect(parseReactions("👍1 ❤️0 😂150 😮2 😢3 😠4")).toEqual({
      "👍": 1,
      "😂": 99,
      "😮": 2,
      "😢": 3,
    });
  });
});

describe("generateReactions", () => {
  it("產生 1-4 種內建表情，數量為正整數", () => {
    for (let i = 0; i < 50; i++) {
      const reactions = generateReactions();
      const keys = Object.keys(reactions);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      expect(keys.length).toBeLessThanOrEqual(4);
      for (const key of keys) {
        expect(PLURK_EMOTICONS).toContain(key);
        expect(reactions[key]).toBeGreaterThan(0);
      }
    }
  });
});

describe("buildSocialPostsText", () => {
  const HOUR = 60 * 60 * 1000;
  const now = new Date(2026, 8, 28, 12, 0).getTime();

  function post(extra: Partial<QZonePost>): QZonePost {
    return {
      id: Math.random().toString(36),
      authorId: "char-a",
      username: "小A",
      type: "shuoshuo",
      content: "內容",
      timestamp: now - HOUR,
      comments: [],
      likes: [],
      visibility: "public",
      ...extra,
    };
  }

  it("沒有噗文時提示可以發第一則", () => {
    expect(buildSocialPostsText([], ["char-a"], now)).toContain("你還沒發過噗");
  });

  it("只列出該角色的噗文，由新到舊，附上表情、留言與上次發噗時間", () => {
    const text = buildSocialPostsText(
      [
        post({ content: "比較舊的", timestamp: now - 5 * HOUR }),
        post({
          content: "新的\n<image>貓咪</image>",
          qualifier: "覺得",
          timestamp: now - 2 * HOUR,
          emoticons: { "❤️": 3, "😂": 2 },
          comments: [
            {
              id: "c1",
              authorId: "user",
              username: "用戶",
              avatar: "",
              content: "好可愛",
              timestamp: now,
            },
          ],
        }),
        post({ authorId: "char-b", content: "別人的" }),
      ],
      ["char-a"],
      now,
    );
    const lines = text.split("\n");
    expect(lines[0]).toBe("- [2 小時前] 覺得：新的 [配圖：貓咪]（5 個表情；1 則留言，最新是 用戶「好可愛」）");
    expect(lines[1]).toBe("- [5 小時前] 比較舊的");
    expect(text).not.toContain("別人的");
    expect(text).toContain("上次發噗：2 小時前");
    expect(text).not.toContain("有一陣子沒發噗");
  });

  it("超過 12 小時沒發噗會輕推一下", () => {
    const text = buildSocialPostsText([post({ timestamp: now - 30 * HOUR })], ["char-a"], now);
    expect(text).toContain("上次發噗：1 天前");
    expect(text).toContain("有一陣子沒發噗");
  });

  it("群聊時標出作者，不加上次發噗提示", () => {
    const text = buildSocialPostsText(
      [post({}), post({ authorId: "char-b", username: "小B", content: "B 的噗" })],
      ["char-a", "char-b"],
      now,
    );
    expect(text).toContain("小A 內容");
    expect(text).toContain("小B B 的噗");
    expect(text).not.toContain("上次發噗");
  });
});
