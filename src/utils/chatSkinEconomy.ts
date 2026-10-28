/**
 * 聊天裝扮的金幣操作（純函式，直接改傳進來的遊戲狀態）
 *
 * gameEconomy store 包一層並負責存檔。組合包先檢查完才一次扣款加入，不會只買到一部分。
 */
import {
  CHAT_SKIN_SLOT_LABELS,
  computeBundlePrice,
  getChatSkinPiece,
  getChatSkinSeries,
  type ChatSkinSlot,
} from "@/data/chatSkins";
import type { ChatGameState } from "@/schemas/gameEconomy";

export type ChatSkinPurchaseResult =
  | { success: true; price: number; pieceIds: string[]; newBalance: number }
  | { success: false; error: "item_not_found" | "already_owned" | "insufficient_funds" };

/** 已下架的佔位氣泡：名稱與當初售價（退款用） */
export const RETIRED_BUBBLE_ITEMS: Record<string, { name: string; price: number }> = {
  bubble_pink: { name: "夢幻粉", price: 12000 },
  bubble_cyber: { name: "賽博龐克", price: 12000 },
  bubble_ink: { name: "水墨風", price: 12000 },
  bubble_neon: { name: "霓虹閃爍", price: 20000 },
  bubble_galaxy: { name: "星河漫步", price: 38000 },
};

/** 舊資料可能缺這幾個欄位 */
function ensureChatSkinFields(state: ChatGameState) {
  const d = state.decorations;
  d.ownedChatSkins ??= [];
  d.equippedChatSkins ??= {};
  d.chatSkinOwnColors ??= {};
}

function pushTransaction(
  state: ChatGameState,
  type: "income" | "expense",
  amount: number,
  description: string,
  relatedItemId: string,
  now: number,
) {
  state.transactions.push({
    id: `tx-${now}-${Math.random().toString(36).slice(2, 11)}`,
    type,
    amount,
    category: "shop",
    description,
    relatedItemId,
    timestamp: now,
  });
}

export function buyChatSkinPiece(state: ChatGameState, pieceId: string, now = Date.now()): ChatSkinPurchaseResult {
  ensureChatSkinFields(state);
  const piece = getChatSkinPiece(pieceId);
  if (!piece) return { success: false, error: "item_not_found" };
  if (state.decorations.ownedChatSkins.includes(piece.id)) return { success: false, error: "already_owned" };
  if (state.wallet < piece.price) return { success: false, error: "insufficient_funds" };

  state.wallet -= piece.price;
  state.decorations.ownedChatSkins.push(piece.id);
  pushTransaction(state, "expense", piece.price, `購買 ${piece.name}`, piece.id, now);
  return { success: true, price: piece.price, pieceIds: [piece.id], newBalance: state.wallet };
}

export function buyChatSkinBundle(state: ChatGameState, seriesId: string, now = Date.now()): ChatSkinPurchaseResult {
  ensureChatSkinFields(state);
  const series = getChatSkinSeries(seriesId);
  if (!series) return { success: false, error: "item_not_found" };
  const quote = computeBundlePrice(seriesId, state.decorations.ownedChatSkins);
  if (!quote) return { success: false, error: "already_owned" };
  if (state.wallet < quote.price) return { success: false, error: "insufficient_funds" };

  state.wallet -= quote.price;
  state.decorations.ownedChatSkins.push(...quote.pieceIds);
  const slotNames = quote.pieceIds
    .map((id) => {
      const piece = getChatSkinPiece(id);
      return piece ? CHAT_SKIN_SLOT_LABELS[piece.slot] : id;
    })
    .join("、");
  pushTransaction(state, "expense", quote.price, `購買 ${series.name} 組合包（${slotNames}）`, `bundle:${series.id}`, now);
  return { success: true, price: quote.price, pieceIds: quote.pieceIds, newBalance: state.wallet };
}

/** 裝到全域搭配；pieceId 為 null 表示卸下 */
export function equipChatSkinOnState(state: ChatGameState, slot: ChatSkinSlot, pieceId: string | null): boolean {
  ensureChatSkinFields(state);
  if (pieceId === null) {
    delete state.decorations.equippedChatSkins[slot];
    return true;
  }
  const piece = getChatSkinPiece(pieceId);
  if (!piece || piece.slot !== slot || !state.decorations.ownedChatSkins.includes(piece.id)) return false;
  state.decorations.equippedChatSkins[slot] = piece.id;
  return true;
}

export function setChatSkinOwnColorsOnState(state: ChatGameState, slot: ChatSkinSlot, value: boolean): void {
  ensureChatSkinFields(state);
  if (value) state.decorations.chatSkinOwnColors[slot] = true;
  else delete state.decorations.chatSkinOwnColors[slot];
}

/** 佔位氣泡下架：照原價退款並清空；清空後再呼叫不會重複退 */
export function refundRetiredBubbles(state: ChatGameState, now = Date.now()): { refunded: number; changed: boolean } {
  const owned = state.decorations?.ownedBubbles ?? [];
  if (owned.length === 0 && !state.decorations?.equippedBubbleId) return { refunded: 0, changed: false };

  let refunded = 0;
  for (const id of owned) {
    const item = RETIRED_BUBBLE_ITEMS[id];
    if (!item) continue;
    refunded += item.price;
    pushTransaction(state, "income", item.price, `退款：聊天氣泡下架（${item.name}）`, id, now);
  }
  state.wallet += refunded;
  state.decorations.ownedBubbles = [];
  state.decorations.equippedBubbleId = null;
  return { refunded, changed: true };
}
