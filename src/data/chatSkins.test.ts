import { describe, expect, it } from "vitest";
import {
  CHAT_SKIN_PIECES,
  CHAT_SKIN_SERIES,
  CHAT_SKIN_VAR_PROPS,
  computeBundlePrice,
  getChatSkinPiece,
  getPiecesForSlot,
  getSeriesPieces,
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

  it("綠泡泡四件的價格", () => {
    expect(getChatSkinPiece("greenbubble-message")?.price).toBe(30000);
    expect(getChatSkinPiece("greenbubble-header")?.price).toBe(20000);
    expect(getChatSkinPiece("greenbubble-input")?.price).toBe(20000);
    expect(getChatSkinPiece("greenbubble-wallpaper")?.price).toBe(15000);
  });

  it("名稱與介紹不出現別家軟體的名字", () => {
    const texts = [
      ...CHAT_SKIN_SERIES.flatMap((s) => [s.name, s.description]),
      ...CHAT_SKIN_PIECES.flatMap((p) => [p.name, p.description]),
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

  it("組合包：全沒有 → 59,500", () => {
    const bundle = computeBundlePrice("greenbubble", []);
    expect(bundle).toEqual({
      price: 59500,
      originalPrice: 85000,
      pieceIds: ["greenbubble-message", "greenbubble-wallpaper", "greenbubble-header", "greenbubble-input"],
    });
  });

  it("組合包：已有訊息 → 38,500，只含另外三件", () => {
    const bundle = computeBundlePrice("greenbubble", ["greenbubble-message"]);
    expect(bundle?.price).toBe(38500);
    expect(bundle?.originalPrice).toBe(55000);
    expect(bundle?.pieceIds).not.toContain("greenbubble-message");
  });

  it("組合包：只剩一件或找不到系列 → null", () => {
    expect(
      computeBundlePrice("greenbubble", ["greenbubble-message", "greenbubble-wallpaper", "greenbubble-header"]),
    ).toBeNull();
    expect(computeBundlePrice("no-such-series", [])).toBeNull();
  });

  it("CHAT_SKIN_VAR_PROPS 收齊所有部件的變數且不重複", () => {
    expect(CHAT_SKIN_VAR_PROPS).toContain("--skin-header-bg");
    expect(CHAT_SKIN_VAR_PROPS).toContain("--chat-wallpaper");
    expect(new Set(CHAT_SKIN_VAR_PROPS).size).toBe(CHAT_SKIN_VAR_PROPS.length);
  });
});
