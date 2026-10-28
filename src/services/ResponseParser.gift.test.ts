import { describe, expect, it } from "vitest";
import { needsParsing, parseAIResponse } from "./ResponseParser";

describe("角色送禮標籤", () => {
  it("讀出名稱、描述、小卡", () => {
    const raw = '<content><msg>給你<送禮物 card="今天辛苦了">紙星星｜我自己摺的</送禮物></msg></content>';
    expect(needsParsing(raw)).toBe(true);
    const gift = parseAIResponse(raw).messages.find((m) => m.isGift);
    expect(gift).toMatchObject({ giftName: "紙星星", giftDescription: "我自己摺的", giftCard: "今天辛苦了" });
  });

  it("舊格式照樣能讀", () => {
    const gift = parseAIResponse("<content><msg><送禮物>巧克力</送禮物></msg></content>").messages.find(
      (m) => m.isGift,
    );
    expect(gift?.giftName).toBe("巧克力");
    expect(gift?.giftCard).toBeUndefined();
  });
});
