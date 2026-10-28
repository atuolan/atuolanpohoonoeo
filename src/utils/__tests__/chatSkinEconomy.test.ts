import { describe, expect, it } from "vitest";
import { createDefaultGameState } from "@/schemas/gameEconomy";
import {
  buyChatSkinBundle,
  buyChatSkinPiece,
  equipChatSkinOnState,
  refundRetiredBubbles,
  setChatSkinOwnColorsOnState,
} from "@/utils/chatSkinEconomy";

function stateWith(wallet: number) {
  const state = createDefaultGameState("global");
  state.wallet = wallet;
  return state;
}

describe("buyChatSkinPiece", () => {
  it("扣款、加入擁有、記一筆交易", () => {
    const state = stateWith(50000);
    const r = buyChatSkinPiece(state, "greenbubble-header", 1000);
    expect(r).toEqual({ success: true, price: 20000, pieceIds: ["greenbubble-header"], newBalance: 30000 });
    expect(state.decorations.ownedChatSkins).toEqual(["greenbubble-header"]);
    const tx = state.transactions[state.transactions.length - 1];
    expect(tx).toMatchObject({ type: "expense", amount: 20000, category: "shop", description: "購買 綠泡泡．頂欄", relatedItemId: "greenbubble-header", timestamp: 1000 });
  });

  it("金幣不夠、已擁有、找不到 → 失敗且不動資料", () => {
    const poor = stateWith(100);
    expect(buyChatSkinPiece(poor, "greenbubble-header")).toEqual({ success: false, error: "insufficient_funds" });
    expect(poor.wallet).toBe(100);
    expect(poor.decorations.ownedChatSkins).toEqual([]);

    const owner = stateWith(50000);
    owner.decorations.ownedChatSkins.push("greenbubble-header");
    expect(buyChatSkinPiece(owner, "greenbubble-header")).toEqual({ success: false, error: "already_owned" });
    expect(owner.wallet).toBe(50000);

    expect(buyChatSkinPiece(stateWith(50000), "no-such")).toEqual({ success: false, error: "item_not_found" });
  });

  it("單買表情包：扣款、加入擁有、記交易，不會被裝上", () => {
    const state = stateWith(20000);
    const r = buyChatSkinPiece(state, "greenbubble-stickers", 3000);
    expect(r).toEqual({ success: true, price: 15000, pieceIds: ["greenbubble-stickers"], newBalance: 5000 });
    expect(state.decorations.ownedChatSkins).toEqual(["greenbubble-stickers"]);
    expect(state.decorations.equippedChatSkins).toEqual({});
    expect(state.transactions[state.transactions.length - 1].description).toBe("購買 綠泡泡．表情包");
  });
});

describe("buyChatSkinBundle", () => {
  it("全沒有：84,000 買到六樣，一筆交易", () => {
    const state = stateWith(85000);
    const before = state.transactions.length;
    const r = buyChatSkinBundle(state, "greenbubble", 2000);
    expect(r.success).toBe(true);
    expect(state.wallet).toBe(1000);
    expect(state.decorations.ownedChatSkins.length).toBe(6);
    expect(state.transactions.length).toBe(before + 1);
    expect(state.transactions[state.transactions.length - 1].description).toBe(
      "購買 綠泡泡 組合包（訊息、背景、頂欄、輸入區、聊天列表、表情包）",
    );
  });

  it("已有第一份四件：只買聊天列表和表情包，24,500", () => {
    const state = stateWith(30000);
    state.decorations.ownedChatSkins.push(
      "greenbubble-message",
      "greenbubble-wallpaper",
      "greenbubble-header",
      "greenbubble-input",
    );
    const r = buyChatSkinBundle(state, "greenbubble");
    expect(r).toMatchObject({ success: true, price: 24500, pieceIds: ["greenbubble-chatList", "greenbubble-stickers"] });
    expect(state.wallet).toBe(5500);
  });

  it("金幣不夠 → 一件都不給、不扣款", () => {
    const state = stateWith(83000);
    expect(buyChatSkinBundle(state, "greenbubble")).toEqual({ success: false, error: "insufficient_funds" });
    expect(state.wallet).toBe(83000);
    expect(state.decorations.ownedChatSkins).toEqual([]);
  });

  it("只剩一件 → already_owned；找不到系列 → item_not_found", () => {
    const state = stateWith(99999);
    state.decorations.ownedChatSkins.push(
      "greenbubble-message",
      "greenbubble-wallpaper",
      "greenbubble-header",
      "greenbubble-input",
      "greenbubble-stickers",
    );
    expect(buyChatSkinBundle(state, "greenbubble")).toEqual({ success: false, error: "already_owned" });
    expect(buyChatSkinBundle(state, "no-such")).toEqual({ success: false, error: "item_not_found" });
  });
});

describe("equip / ownColors", () => {
  it("只能裝已擁有、欄位對的部件；null 卸下", () => {
    const state = stateWith(0);
    expect(equipChatSkinOnState(state, "header", "greenbubble-header")).toBe(false);
    state.decorations.ownedChatSkins.push("greenbubble-header");
    expect(equipChatSkinOnState(state, "input", "greenbubble-header")).toBe(false);
    expect(equipChatSkinOnState(state, "header", "greenbubble-header")).toBe(true);
    expect(state.decorations.equippedChatSkins).toEqual({ header: "greenbubble-header" });
    expect(equipChatSkinOnState(state, "header", null)).toBe(true);
    expect(state.decorations.equippedChatSkins).toEqual({});
  });

  it("自己的顏色：true 寫入、false 拿掉", () => {
    const state = stateWith(0);
    setChatSkinOwnColorsOnState(state, "message", true);
    expect(state.decorations.chatSkinOwnColors).toEqual({ message: true });
    setChatSkinOwnColorsOnState(state, "message", false);
    expect(state.decorations.chatSkinOwnColors).toEqual({});
  });

  it("聊天列表可以裝到全域；表情包不能裝", () => {
    const state = stateWith(0);
    state.decorations.ownedChatSkins.push("greenbubble-chatList", "greenbubble-stickers");
    expect(equipChatSkinOnState(state, "chatList", "greenbubble-chatList")).toBe(true);
    expect(state.decorations.equippedChatSkins.chatList).toBe("greenbubble-chatList");
    expect(equipChatSkinOnState(state, "chatList", "greenbubble-stickers")).toBe(false);
  });
});

describe("refundRetiredBubbles", () => {
  it("照原價退款、每件一筆交易、清空，只退一次", () => {
    const state = stateWith(100);
    state.decorations.ownedBubbles = ["bubble_pink", "bubble_galaxy"];
    state.decorations.equippedBubbleId = "bubble_galaxy";
    expect(refundRetiredBubbles(state, 3000)).toEqual({ refunded: 50000, changed: true });
    expect(state.wallet).toBe(50100);
    expect(state.decorations.ownedBubbles).toEqual([]);
    expect(state.decorations.equippedBubbleId).toBeNull();
    const descs = state.transactions.map((t) => t.description);
    expect(descs).toContain("退款：聊天氣泡下架（夢幻粉）");
    expect(descs).toContain("退款：聊天氣泡下架（星河漫步）");
    expect(refundRetiredBubbles(state)).toEqual({ refunded: 0, changed: false });
    expect(state.wallet).toBe(50100);
  });

  it("沒買過的人不受影響", () => {
    const state = stateWith(100);
    expect(refundRetiredBubbles(state)).toEqual({ refunded: 0, changed: false });
    expect(state.transactions).toEqual([]);
  });
});
