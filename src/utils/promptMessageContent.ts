/**
 * 送給 AI 的聊天歷史裡，畫面上是卡片的訊息（轉帳、紅包、位置、禮物、模式邀請、語音、外賣結果）
 * 寫成角色看得懂的標籤；有收款方動作的（轉帳、紅包、邀請）在後面接 [xx狀態：…]，
 * 角色才知道對方領了、退了還是還沒動。
 */

import type { PlurkShareSnapshot } from "@/types/chat";
import {
  dollPromptNote,
  DOLL_TAG_RE,
  EMPATHY_DOLL_NAME,
  empathyDollGiftNote,
  formatDollTag,
} from "@/services/empathyDoll";
import { formatGiftTag, GIFT_TAGS_RE } from "@/utils/giftTag";
import { describePlurkShareForPrompt } from "@/utils/plurkShare";

type TransferStatus = "sent" | "pending" | "received" | "refunded";
type RequestStatus = "pending" | "accepted" | "rejected";

export interface PromptMessageLike {
  content: string;
  is_user?: boolean;
  isUserRecalled?: boolean;
  isTransfer?: boolean;
  transferType?: "pay" | "refund";
  transferAmount?: number;
  transferNote?: string;
  transferStatus?: TransferStatus;
  isRedpacket?: boolean;
  redpacketData?: { amount: string | number; blessing?: string; type?: string; count?: number; target?: string };
  redpacketState?: {
    claims: Array<{ claimerName: string; cents: number }>;
    fullyClaimed?: boolean;
    remainingCount?: number;
    expired?: boolean;
  };
  isLocation?: boolean;
  locationContent?: string;
  isGift?: boolean;
  giftName?: string;
  giftCard?: string;
  giftDescription?: string;
  isDollTouch?: boolean;
  dollTouchText?: string;
  dollTouchRound?: number;
  dollLookNote?: string;
  messageType?: string;
  audioTranscript?: string;
  isFaceToFaceRequest?: boolean;
  faceToFaceRequestReason?: string;
  faceToFaceRequestStatus?: RequestStatus;
  isOnlineModeRequest?: boolean;
  onlineModeRequestReason?: string;
  onlineModeRequestStatus?: RequestStatus;
  isWaimaiPaymentResult?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiOrder?: { status?: string };
  plurkShare?: PlurkShareSnapshot;
}

export interface PromptMessageNames {
  userName: string;
  charName: string;
  /** 群聊：使用者的轉帳不是給特定一個人 */
  groupChat?: boolean;
  charId?: string;
  /** 群聊成員 id → 名字（偷偷說是誰寫的） */
  memberNames?: Record<string, string>;
}

/** 角色照著歷史寫出來的狀態註記要從回覆裡拿掉，不然會變成一個氣泡 */
const STATUS_NOTE_REGEX = /\[(?:轉帳|紅包|邀請)狀態[:：][^\]\n]*\]/g;

export function stripPromptStatusNotes(text: string): string {
  return text.replace(STATUS_NOTE_REGEX, "");
}

function formatAmount(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "'");
}

function describeTransfer(m: PromptMessageLike, names: PromptMessageNames): string {
  const amount = formatAmount(m.transferAmount ?? 0);
  if (m.transferType === "refund") return `<refund>${amount}</refund>`;

  const tag = `<pay>${amount}${m.transferNote ? `:${m.transferNote}` : ""}</pay>`;
  const status = m.transferStatus;
  if (m.is_user) {
    const state = names.groupChat
      ? status === "received" ? "已被收下" : status === "refunded" ? "已被退回" : "還沒有人收"
      : `${names.charName}${status === "received" ? "已收下" : status === "refunded" ? "已退回" : "還沒收下"}`;
    return `${tag}[轉帳狀態：${state}]`;
  }
  const state = status === "received" ? "已領取" : status === "refunded" ? "已退回" : "還沒領取";
  return `${tag}[轉帳狀態：${names.userName}${state}]`;
}

function describeRedpacket(m: PromptMessageLike): string {
  const data = m.redpacketData!;
  const blessing = data.blessing ? ` blessing="${escapeAttr(data.blessing)}"` : "";
  const type = data.type ? ` type="${data.type}"` : "";
  const count = data.count && data.count > 1 ? ` count="${data.count}"` : "";
  const target = data.target ? ` target="${escapeAttr(data.target)}"` : "";
  const tag = `<redpacket${type} amount="${formatAmount(data.amount)}"${count}${target}${blessing}/>`;
  const claims = m.redpacketState?.claims ?? [];
  const expired = m.redpacketState?.expired && !m.redpacketState.fullyClaimed;
  if (claims.length === 0) return `${tag}[紅包狀態：${expired ? "沒有人領，已過期" : "還沒有人領"}]`;
  const who = claims.map((c) => `${c.claimerName}領了 ${formatAmount(c.cents / 100)} 元`).join("、");
  const remaining = m.redpacketState?.remainingCount;
  const tail = m.redpacketState?.fullyClaimed ? "，已領完" : expired ? "，已過期" : remaining && remaining > 0 ? `，還剩 ${remaining} 份` : "";
  return `${tag}[紅包狀態：${who}${tail}]`;
}

function describeModeRequest(m: PromptMessageLike, names: PromptMessageNames): string {
  const faceToFace = !!m.isFaceToFaceRequest;
  const reason = faceToFace ? m.faceToFaceRequestReason : m.onlineModeRequestReason;
  const status = faceToFace ? m.faceToFaceRequestStatus : m.onlineModeRequestStatus;
  const tagName = faceToFace ? "face-to-face-request" : "online-mode-request";
  const tag = `<${tagName}${reason ? ` reason="${escapeAttr(reason)}"` : ""}/>`;
  const state = status === "accepted" ? "答應了" : status === "rejected" ? "拒絕了" : "還沒回覆";
  return `${tag}[邀請狀態：${names.userName}${state}]`;
}

const TRANSFER_TAGS = /<pay>[\s\S]*?<\/pay>|<transfer\s[^>]*>[\s\S]*?<\/transfer>|<refund>[\s\S]*?<\/refund>|<轉帳>[\s\S]*?<\/轉帳>/gi;
const REDPACKET_TAGS = /<redpacket\s[^>]*?\/?>/gi;
const LOCATION_TAGS = /<location>[\s\S]*?<\/location>/gi;
const MODE_REQUEST_TAGS = /<(?:face-to-face|online-mode)-request\s[^>]*?\/?>/gi;

/** 這則訊息送給 AI 時的內容；不是卡片類訊息就原樣回傳 */
export function describeMessageForPrompt(
  m: PromptMessageLike,
  names: PromptMessageNames,
): string {
  const original = m.content || "";
  // 撤回的訊息內容已經換成撤回提示，卡片不再算數
  if (m.isUserRecalled) return original;
  // 分享噗文的卡片：內容只是畫面摘要，改用看得懂噗文的說明
  if (m.plurkShare) {
    return describePlurkShareForPrompt(m.plurkShare, {
      userName: names.userName,
      charId: names.charId,
      memberNames: names.memberNames,
      groupChat: names.groupChat,
    });
  }

  let text = original;
  const cards: string[] = [];

  if (m.isTransfer && m.transferAmount) {
    text = text.replace(TRANSFER_TAGS, "");
    cards.push(describeTransfer(m, names));
  }
  if (m.isRedpacket && m.redpacketData) {
    text = text.replace(REDPACKET_TAGS, "");
    cards.push(describeRedpacket(m));
  }
  if (m.isLocation && m.locationContent) {
    text = text.replace(LOCATION_TAGS, "");
    // 使用者分享位置時內容就是地點本身
    if (text.trim() === m.locationContent.trim()) text = "";
    cards.push(`<location>${m.locationContent}</location>`);
  }
  if (m.isGift && m.giftName) {
    text = text.replace(GIFT_TAGS_RE, "");
    let giftTag = formatGiftTag({ name: m.giftName, description: m.giftDescription, card: m.giftCard });
    if (m.giftName === EMPATHY_DOLL_NAME) giftTag += empathyDollGiftNote(names);
    cards.push(giftTag);
  }
  if (m.isDollTouch && m.dollTouchText) {
    text = text.replace(DOLL_TAG_RE, "");
    cards.push(formatDollTag(m.dollTouchText) + dollPromptNote(names, m.dollTouchRound, m.dollLookNote));
  }
  if (m.isFaceToFaceRequest || m.isOnlineModeRequest) {
    text = text.replace(MODE_REQUEST_TAGS, "");
    cards.push(describeModeRequest(m, names));
  }
  if (m.isWaimaiPaymentResult && !text.trim() && m.waimaiOrder?.status) {
    const status = m.waimaiOrder.status === "delivered" ? "paid" : m.waimaiOrder.status;
    cards.push(`<waimai-pay status="${status}"/>`);
  } else if (m.isWaimaiDelivery && !text.trim()) {
    cards.push("<waimai-delivery/>");
  }

  // 語音：辨識出的文字才是對方說的話（手動轉文字時內容還是「🎤 語音訊息 (0:05)」）
  if (m.messageType === "audio" && m.audioTranscript?.trim()) {
    const transcript = m.audioTranscript.trim();
    const spoken = text.replace(/^\[語音訊息\]\s*/, "").trim();
    if (spoken === transcript || /^🎤/.test(spoken) || !spoken) {
      text = `[語音訊息] ${transcript}`;
    }
  }

  if (cards.length === 0) return text === original ? original : text;
  const lead = text.trim();
  return lead ? `${lead}\n${cards.join("\n")}` : cards.join("\n");
}
