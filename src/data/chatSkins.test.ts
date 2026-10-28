import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAT_SKIN_PIECES,
  CHAT_SKIN_SERIES,
  CHAT_SKIN_STICKER_PACKS,
  CHAT_SKIN_VAR_PROPS,
  computeBundlePrice,
  getChatSkinPiece,
  getChatSkinShopItem,
  getChatSkinStickerPack,
  getPiecesForSlot,
  getSeriesPieces,
  getSeriesShopItems,
} from "@/data/chatSkins";

describe("chatSkins 資料", () => {
  it("每件部件都屬於某個系列，且同系列每個欄位只有一件", () => {
    for (const series of CHAT_SKIN_SERIES) {
      const pieces = getSeriesPieces(series.id);
      expect(pieces.length).toBe(series.pieceIds.length);
      const slots = pieces.map((p) => p.slot);
      expect(new Set(slots).size).toBe(slots.length);
      for (const p of pieces) expect(p.seriesId).toBe(series.id);
    }
    for (const piece of CHAT_SKIN_PIECES) {
      expect(CHAT_SKIN_SERIES.some((s) => s.pieceIds.includes(piece.id))).toBe(true);
    }
  });

  it("白天和夜間配色的變數名稱一樣", () => {
    for (const piece of CHAT_SKIN_PIECES) {
      expect(Object.keys(piece.vars.night).sort()).toEqual(Object.keys(piece.vars.day).sort());
    }
  });

  it("綠泡泡的價格", () => {
    expect(getChatSkinPiece("greenbubble-message")?.price).toBe(30000);
    expect(getChatSkinPiece("greenbubble-header")?.price).toBe(20000);
    expect(getChatSkinPiece("greenbubble-input")?.price).toBe(20000);
    expect(getChatSkinPiece("greenbubble-wallpaper")?.price).toBe(15000);
    expect(getChatSkinPiece("greenbubble-chatList")?.price).toBe(20000);
    expect(getChatSkinStickerPack("greenbubble-stickers")?.price).toBe(15000);
  });

  it("名稱與介紹不出現別家軟體的名字", () => {
    const texts = [
      ...CHAT_SKIN_SERIES.flatMap((s) => [s.name, s.description]),
      ...CHAT_SKIN_PIECES.flatMap((p) => [p.name, p.description]),
      ...CHAT_SKIN_STICKER_PACKS.flatMap((p) => [p.name, p.description, ...p.stickers.map((s) => s.name)]),
    ].join("\n");
    expect(texts).not.toMatch(/微信|WeChat|wechat/i);
  });

  it("找不到或沒給 ID 時回傳 undefined", () => {
    expect(getChatSkinPiece(undefined)).toBeUndefined();
    expect(getChatSkinPiece("")).toBeUndefined();
    expect(getChatSkinPiece("no-such-piece")).toBeUndefined();
  });

  it("依欄位列出部件", () => {
    expect(getPiecesForSlot("header").map((p) => p.id)).toContain("greenbubble-header");
    expect(getPiecesForSlot("header").every((p) => p.slot === "header")).toBe(true);
  });

  it("組合包：全沒有 → 84,000，含五件部件和表情包", () => {
    const bundle = computeBundlePrice("greenbubble", []);
    expect(bundle).toEqual({
      price: 84000,
      originalPrice: 120000,
      pieceIds: [
        "greenbubble-message",
        "greenbubble-wallpaper",
        "greenbubble-header",
        "greenbubble-input",
        "greenbubble-chatList",
        "greenbubble-stickers",
      ],
    });
  });

  it("組合包：已有第一份四件 → 24,500，只剩聊天列表和表情包", () => {
    const bundle = computeBundlePrice("greenbubble", [
      "greenbubble-message",
      "greenbubble-wallpaper",
      "greenbubble-header",
      "greenbubble-input",
    ]);
    expect(bundle).toEqual({
      price: 24500,
      originalPrice: 35000,
      pieceIds: ["greenbubble-chatList", "greenbubble-stickers"],
    });
  });

  it("組合包：只剩一件或找不到系列 → null", () => {
    expect(
      computeBundlePrice("greenbubble", [
        "greenbubble-message",
        "greenbubble-wallpaper",
        "greenbubble-header",
        "greenbubble-input",
        "greenbubble-chatList",
      ]),
    ).toBeNull();
    expect(computeBundlePrice("no-such-series", [])).toBeNull();
  });

  it("CHAT_SKIN_VAR_PROPS 收齊所有部件的變數且不重複", () => {
    expect(CHAT_SKIN_VAR_PROPS).toContain("--skin-header-bg");
    expect(CHAT_SKIN_VAR_PROPS).toContain("--chat-wallpaper");
    expect(new Set(CHAT_SKIN_VAR_PROPS).size).toBe(CHAT_SKIN_VAR_PROPS.length);
  });

  it("表情包：24 張、名稱和檔案不重複、名稱都有系列前綴", () => {
    const pack = getChatSkinStickerPack("greenbubble-stickers")!;
    expect(pack.stickers.length).toBe(24);
    expect(new Set(pack.stickers.map((s) => s.name)).size).toBe(24);
    expect(new Set(pack.stickers.map((s) => s.file)).size).toBe(24);
    expect(pack.stickers.every((s) => s.name.startsWith("綠泡泡．"))).toBe(true);
    expect(pack.stickers[0]).toEqual({ name: "綠泡泡．收到", file: "/chat-skins/greenbubble/stickers/01.webp", emotion: "misc" });
    expect(pack.stickers[23].file).toBe("/chat-skins/greenbubble/stickers/24.webp");
  });

  it("商店品項：系列有六樣，ID 查得到部件和表情包", () => {
    expect(getSeriesShopItems("greenbubble").map((i) => i.label)).toEqual([
      "訊息",
      "背景",
      "頂欄",
      "輸入區",
      "聊天列表",
      "表情包",
    ]);
    expect(getChatSkinShopItem("greenbubble-stickers")).toEqual({
      id: "greenbubble-stickers",
      name: "綠泡泡．表情包",
      price: 15000,
      label: "表情包",
    });
    expect(getChatSkinShopItem("no-such")).toBeUndefined();
  });
  it("所有預覽圖和貼圖檔案都在 public 裡", () => {
    const files = [
      ...CHAT_SKIN_SERIES.flatMap((s) => [s.previewImage.day, s.previewImage.night]),
      ...CHAT_SKIN_PIECES.flatMap((p) => [p.previewImage.day, p.previewImage.night]),
      ...CHAT_SKIN_STICKER_PACKS.flatMap((p) => [
        p.previewImage.day,
        p.previewImage.night,
        p.icon,
        ...p.stickers.map((s) => s.file),
      ]),
    ];
    for (const file of files) expect(existsSync(join("public", file)), file).toBe(true);
  });
});
