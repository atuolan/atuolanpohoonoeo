import { describe, expect, it } from "vitest";
import { formatGiftTag, GIFT_TAGS_RE, parseGiftTag } from "../giftTag";

describe("parseGiftTag", () => {
  it("讀舊格式", () => {
    expect(parseGiftTag("<送禮物>巧克力</送禮物>")).toEqual({ name: "巧克力" });
  });

  it("讀 card 和描述", () => {
    expect(parseGiftTag('<送禮物 card="生日快樂">紙星星｜我自己摺的</送禮物>')).toEqual({
      name: "紙星星",
      description: "我自己摺的",
      card: "生日快樂",
    });
  });

  it("半形直線、單引號、全形引號都可以", () => {
    expect(parseGiftTag("<送禮物 card='嗨'>書籤|壓花</送禮物>")).toEqual({
      name: "書籤",
      description: "壓花",
      card: "嗨",
    });
    expect(parseGiftTag("<送禮物 card=“晚安”>月亮燈</送禮物>")?.card).toBe("晚安");
  });

  it("名稱空白或沒有標籤回 null", () => {
    expect(parseGiftTag("<送禮物>｜描述</送禮物>")).toBeNull();
    expect(parseGiftTag("沒有標籤")).toBeNull();
  });

  it("GIFT_TAGS_RE 新舊格式都拿得掉", () => {
    const text = '前<送禮物>花</送禮物>中<送禮物 card="x">糖</送禮物>後';
    expect(text.replace(GIFT_TAGS_RE, "")).toBe("前中後");
  });
});

describe("formatGiftTag", () => {
  it("沒有 card 和描述時是舊格式", () => {
    expect(formatGiftTag({ name: "可樂" })).toBe("<送禮物>可樂</送禮物>");
  });

  it("card 裡的雙引號換成全形，寫出來能再讀回去", () => {
    const tag = formatGiftTag({ name: "戒指", description: "銀的", card: '說"好"' });
    expect(tag).toBe('<送禮物 card="說”好”">戒指｜銀的</送禮物>');
    expect(parseGiftTag(tag)).toEqual({ name: "戒指", description: "銀的", card: "說”好”" });
  });
});
