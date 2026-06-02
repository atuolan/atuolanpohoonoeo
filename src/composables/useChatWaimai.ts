import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import type { AuthorsNoteMetadata } from "@/types/prompt";
import type { WaimaiOrderSnapshot, WaimaiOrderStatus } from "@/types/chat";
import { PromptRole } from "@/types/worldinfo";

export interface WaimaiParsedResultLike {
  isWaimaiPaymentResult?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiPaymentStatus?: WaimaiOrderStatus;
}

/**
 * 從最近訊息中找到最新的外賣訂單快照。
 */
export function findLatestWaimaiOrder(
  msgs: Message[],
): Message["waimaiOrder"] | undefined {
  return [...msgs]
    .slice(-30)
    .reverse()
    .find((m) => m.waimaiOrder)?.waimaiOrder;
}

/**
 * 將 AI 解析出的外賣付款/送達結果套用到新訊息，並附上最新訂單快照。
 */
export function applyWaimaiParsedResultToMessage(
  targetMessage: Message,
  parsedMsg: WaimaiParsedResultLike,
  sourceMessages: Message[],
  now: () => number = Date.now,
): boolean {
  if (!parsedMsg.isWaimaiPaymentResult && !parsedMsg.isWaimaiDelivery) {
    return false;
  }

  const recentOrder = findLatestWaimaiOrder(sourceMessages);
  if (!recentOrder) return false;

  const clonedOrder = structuredCloneWaimaiOrder(recentOrder);

  if (parsedMsg.isWaimaiPaymentResult && parsedMsg.waimaiPaymentStatus) {
    clonedOrder.status = parsedMsg.waimaiPaymentStatus;
    if (parsedMsg.waimaiPaymentStatus === "paid") {
      clonedOrder.paidAt = now();
    }
    targetMessage.isWaimaiPaymentResult = true;
  }

  if (parsedMsg.isWaimaiDelivery) {
    clonedOrder.status = "delivered";
    clonedOrder.deliveredAt = now();
    targetMessage.isWaimaiDelivery = true;
  }

  targetMessage.waimaiOrder = clonedOrder;
  return true;
}

export function buildWaimaiAuthorsNote(
  sourceMessages: Message[],
): AuthorsNoteMetadata | undefined {
  const recent = sourceMessages.slice(-20);
  const hasWaimaiContext = recent.some(
    (m) =>
      m.isWaimaiShare ||
      m.isWaimaiPaymentRequest ||
      m.isWaimaiPaymentConfirm ||
      m.isWaimaiPaymentResult ||
      m.isWaimaiDelivery,
  );

  if (!hasWaimaiContext) return undefined;

  const order = findLatestWaimaiOrder(recent);
  const amountLine = order
    ? `目前可見訂單：${order.item.name}，小計🪙 ${order.subtotal}、運費🪙 ${order.shippingFee}、總計🪙 ${order.totalPrice}，收件人：${order.recipientName}。`
    : "";

  const latestWaimaiMsg = [...recent]
    .reverse()
    .find(
      (m) =>
        m.isWaimaiShare ||
        m.isWaimaiPaymentRequest ||
        m.isWaimaiPaymentConfirm ||
        m.isWaimaiPaymentResult ||
        m.isWaimaiDelivery,
    );
  const alreadyPaid = recent.some((m) => m.isWaimaiPaymentResult);
  const alreadyDelivered = recent.some((m) => m.isWaimaiDelivery);

  const lines: string[] = [
    "[外賣互動規則]",
    amountLine,
    "",
    "你可以使用以下標籤觸發外賣卡片 UI（標籤會自動渲染成卡片，不需重複寫商品名或金額）：",
    '- 同意付款：<waimai-pay status="paid"/>',
    '- 拒絕付款：<waimai-pay status="rejected"/>',
    '- 付款失敗：<waimai-pay status="failed"/>',
    "- 送達通知：<waimai-delivery/>",
    "",
  ];

  if (latestWaimaiMsg?.isWaimaiPaymentRequest && !alreadyPaid) {
    lines.push(
      "【當前狀態】{{user}} 請你代付。",
      "根據角色性格決定是否願意付款：",
      '- 願意：先用文字表達同意，再附上 <waimai-pay status="paid"/>' ,
      '- 拒絕：先說明原因，再附上 <waimai-pay status="rejected"/>' ,
      "不要在沒有表態的情況下直接發標籤。",
    );
  } else if (latestWaimaiMsg?.isWaimaiShare && !alreadyPaid) {
    lines.push(
      "【當前狀態】{{user}} 分享了商品，尚未發起付款。",
      "可以評論商品、討論需求，但不可自行宣稱已付款或發送付款標籤。",
      "只有在 {{user}} 明確請你代付時，才能使用 <waimai-pay> 標籤。",
    );
  } else if (
    latestWaimaiMsg?.isWaimaiPaymentConfirm ||
    (alreadyPaid && !alreadyDelivered)
  ) {
    lines.push(
      "【當前狀態】已付款，等待送達。",
      "關心配送進度，在合適時機用 <waimai-delivery/> 表示送達。",
    );
  }

  lines.push(
    "",
    "⚠️ 不要捏造不存在的訂單細節。不要無中生有地使用外賣標籤——只在有對應訂單時才使用。",
  );

  return {
    prompt: lines.join("\n"),
    interval: 1,
    depth: 4,
    position: 0,
    role: PromptRole.SYSTEM,
  };
}

function structuredCloneWaimaiOrder(
  order: WaimaiOrderSnapshot,
): WaimaiOrderSnapshot {
  if (typeof structuredClone === "function") {
    return structuredClone(order);
  }
  return JSON.parse(JSON.stringify(order)) as WaimaiOrderSnapshot;
}
