/**
 * 聊天裝扮：算出每個欄位最後用哪件部件
 *
 * 優先順序：這個聊天正在試穿 → 這個聊天另外指定 → 全域搭配 → 不裝。
 * 找不到、欄位不對、沒擁有（試穿除外）的部件一律當成不裝。
 */
import {
  CHAT_SKIN_SLOTS,
  OWN_COLOR_SLOTS,
  getChatSkinPiece,
  type ChatSkinPiece,
  type ChatSkinSlot,
} from "@/data/chatSkins";

/** 單聊指定「這個聊天不裝」 */
export const CHAT_SKIN_NONE = "none";

/** 單一聊天另外指定的裝扮；沒有 key = 跟全域 */
export interface ChatSkinOverrides {
  /** 部件 ID，或 "none" */
  slots?: Partial<Record<ChatSkinSlot, string>>;
  ownColors?: Partial<Record<ChatSkinSlot, boolean>>;
}

/** 試穿只存在記憶體 */
export interface ChatSkinTryOn {
  chatId: string;
  slot: ChatSkinSlot;
  pieceId: string;
}

export interface ResolvedChatSkinSlot {
  piece: ChatSkinPiece;
  ownColors: boolean;
  tryOn: boolean;
}

export type ResolvedChatSkins = Partial<Record<ChatSkinSlot, ResolvedChatSkinSlot>>;

export interface ResolveChatSkinsInput {
  chatId: string | null;
  owned: readonly string[];
  equipped: Partial<Record<string, string>>;
  ownColors: Partial<Record<string, boolean>>;
  chatOverrides?: ChatSkinOverrides | null;
  tryOn?: ChatSkinTryOn | null;
}

function pieceForSlot(slot: ChatSkinSlot, id: string | undefined): ChatSkinPiece | undefined {
  const piece = getChatSkinPiece(id);
  return piece && piece.slot === slot ? piece : undefined;
}

export function resolveChatSkins(input: ResolveChatSkinsInput): ResolvedChatSkins {
  const result: ResolvedChatSkins = {};
  for (const slot of CHAT_SKIN_SLOTS) {
    const tryOn = input.tryOn;
    if (tryOn && input.chatId && tryOn.chatId === input.chatId && tryOn.slot === slot) {
      const piece = pieceForSlot(slot, tryOn.pieceId);
      if (piece) {
        result[slot] = { piece, ownColors: false, tryOn: true };
        continue;
      }
    }

    const override = input.chatOverrides?.slots?.[slot];
    const pieceId = override !== undefined ? override : input.equipped[slot];
    if (!pieceId || pieceId === CHAT_SKIN_NONE) continue;
    const piece = pieceForSlot(slot, pieceId);
    if (!piece || !input.owned.includes(piece.id)) continue;

    const chatOwnColors = input.chatOverrides?.ownColors?.[slot];
    const ownColors =
      OWN_COLOR_SLOTS.includes(slot) && (chatOwnColors ?? input.ownColors[slot] ?? false);
    result[slot] = { piece, ownColors, tryOn: false };
  }
  return result;
}

/** 部件配色變數；「用我自己的顏色」打開的欄位不輸出 */
export function buildChatSkinVars(resolved: ResolvedChatSkins, nightMode: boolean): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const slot of CHAT_SKIN_SLOTS) {
    const entry = resolved[slot];
    if (!entry || entry.ownColors) continue;
    Object.assign(vars, nightMode ? entry.piece.vars.night : entry.piece.vars.day);
  }
  return vars;
}

/** 掛在聊天畫面最外層的屬性，系列樣式從這裡開始寫選擇器 */
export function buildChatSkinAttrs(resolved: ResolvedChatSkins): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const slot of CHAT_SKIN_SLOTS) {
    const entry = resolved[slot];
    if (!entry) continue;
    attrs[`data-skin-${slot}`] = entry.piece.seriesId;
    if (entry.ownColors) attrs[`data-skin-${slot}-own-colors`] = "";
  }
  return attrs;
}

export function hasAnyChatSkin(resolved: ResolvedChatSkins): boolean {
  return CHAT_SKIN_SLOTS.some((slot) => !!resolved[slot]);
}

/** 存檔前整理單聊設定：拿掉空值與不認得的欄位，沒東西就回傳 {} */
export function normalizeChatSkinOverrides(overrides: ChatSkinOverrides | null | undefined): ChatSkinOverrides {
  const slots: Partial<Record<ChatSkinSlot, string>> = {};
  const ownColors: Partial<Record<ChatSkinSlot, boolean>> = {};
  for (const slot of CHAT_SKIN_SLOTS) {
    const pieceId = overrides?.slots?.[slot];
    if (typeof pieceId === "string" && pieceId) slots[slot] = pieceId;
    const own = overrides?.ownColors?.[slot];
    if (typeof own === "boolean") ownColors[slot] = own;
  }
  const result: ChatSkinOverrides = {};
  if (Object.keys(slots).length > 0) result.slots = slots;
  if (Object.keys(ownColors).length > 0) result.ownColors = ownColors;
  return result;
}
