import { describe, expect, it } from "vitest";
import { buildSkinStickerCategories } from "@/utils/chatSkinStickers";

describe("buildSkinStickerCategories", () => {
  it("沒擁有表情包 → 沒有分類", () => {
    expect(buildSkinStickerCategories([])).toEqual([]);
    expect(buildSkinStickerCategories(["greenbubble-header"])).toEqual([]);
  });

  it("擁有 → 一個唯讀分類、24 張唯讀表情", () => {
    const [category] = buildSkinStickerCategories(["greenbubble-stickers"]);
    expect(category).toMatchObject({
      id: "skin-pack:greenbubble-stickers",
      name: "綠泡泡",
      icon: "/chat-skins/greenbubble/stickers/01.webp",
      isCustom: false,
      isSkinPack: true,
    });
    expect(category.stickers.length).toBe(24);
    expect(category.stickers.every((s) => s.readOnly === true)).toBe(true);
    expect(category.stickers[0]).toMatchObject({
      id: "greenbubble-stickers-1",
      name: "綠泡泡．收到",
      url: "/chat-skins/greenbubble/stickers/01.webp",
      emotion: "misc",
    });
  });
});
