import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import type { AuthorsNoteMetadata } from "@/types/prompt";
import type { WaimaiOrderSnapshot, WaimaiOrderStatus } from "@/types/chat";
import { PromptRole } from "@/types/worldinfo";
import { getWaimaiCatalogItemById } from "@/data/waimaiCatalog";
import { computeWaimaiEta, pickWaimaiWeather } from "@/services/waimaiEta";

export interface WaimaiParsedResultLike {
  isWaimaiPaymentResult?: boolean;
  isWaimaiDelivery?: boolean;
  waimaiPaymentStatus?: WaimaiOrderStatus;
}

/** 已付款之後的狀態（含物流各階段） */
const WAIMAI_PAID_STATUSES: ReadonlySet<WaimaiOrderStatus> = new Set([
  "paid",
  "in_transit",
  "customs",
  "delivering",
  "delivered",
]);

/** 允許 AI 付款標籤作用的狀態（角色拒絕後可以改變心意再付） */
const WAIMAI_PAYABLE_STATUSES: ReadonlySet<WaimaiOrderStatus> = new Set([
  "payment_requested",
  "rejected",
  "failed",
]);

/** 自動物流：訂單同時有收貨地和 ETA，進度由系統自動推送 */
function isAutoLogisticsOrder(order: WaimaiOrderSnapshot | undefined): boolean {
  return !!order?.destination && !!order?.eta;
}

/** 還沒到時間的物流進度訊息對角色和畫面都不可見 */
function isFutureProgress(m: Message, now: number): boolean {
  return !!m.isWaimaiProgress && m.timestamp > now;
}

/**
 * 從最近訊息中找到最新的外賣訂單快照（略過還沒到時間的物流訊息）。
 */
export function findLatestWaimaiOrder(
  msgs: Message[],
  now: () => number = Date.now,
): Message["waimaiOrder"] | undefined {
  const current = now();
  return [...msgs]
    .slice(-30)
    .reverse()
    .find((m) => m.waimaiOrder && !isFutureProgress(m, current))?.waimaiOrder;
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

  const recentOrder = findLatestWaimaiOrder(sourceMessages, now);
  if (!recentOrder) return false;

  const clonedOrder = structuredCloneWaimaiOrder(recentOrder);
  let applied = false;

  if (parsedMsg.isWaimaiPaymentResult && parsedMsg.waimaiPaymentStatus) {
    // 只有「請求代付 / 已拒絕 / 失敗」的訂單才吃付款標籤，避免重複付款或分享被當成付款
    if (WAIMAI_PAYABLE_STATUSES.has(clonedOrder.status)) {
      clonedOrder.status = parsedMsg.waimaiPaymentStatus;
      if (parsedMsg.waimaiPaymentStatus === "paid") {
        const paidAt = now();
        clonedOrder.paidAt = paidAt;
        if (clonedOrder.destination) {
          // 代付可能拖很久，ETA 從付款當下重算；找不到商品就保留舊 ETA
          const catalogItem = getWaimaiCatalogItemById(clonedOrder.item.itemId);
          if (catalogItem) {
            clonedOrder.eta = computeWaimaiEta({
              section: catalogItem.section,
              logisticsMeta: catalogItem.logisticsMeta,
              destinationCountry: clonedOrder.destination.countryCode,
              destinationLat: clonedOrder.destination.lat,
              destinationLon: clonedOrder.destination.lon,
              weatherLevel: pickWaimaiWeather(),
              now: paidAt,
            });
          }
          targetMessage.waimaiNeedsProgress = true;
        }
      }
      targetMessage.isWaimaiPaymentResult = true;
      applied = true;
    }
  }

  if (parsedMsg.isWaimaiDelivery) {
    // 自動物流的送達由系統進度訊息負責，AI 不能自己宣布送達
    if (!isAutoLogisticsOrder(recentOrder)) {
      clonedOrder.status = "delivered";
      clonedOrder.deliveredAt = now();
      targetMessage.isWaimaiDelivery = true;
      applied = true;
    }
  }

  if (!applied) return false;

  targetMessage.waimaiOrder = clonedOrder;
  return true;
}

/**
 * 物流進度訊息要依時間放在正確的位置：
 * 下單時進度訊息一次全推進陣列（未來時間），之後的新訊息會排在它們後面，
 * 時間到了卻出現在下單處、不在最新處。這裡把進度訊息依 timestamp 插回去。
 */
export function placeWaimaiProgressChronologically<
  T extends { isWaimaiProgress?: boolean; timestamp: number },
>(messages: T[]): T[] {
  if (!messages.some((m) => m.isWaimaiProgress)) return messages;

  const progress = messages
    .filter((m) => m.isWaimaiProgress)
    .map((m, i) => ({ m, i }))
    .sort((a, b) => a.m.timestamp - b.m.timestamp || a.i - b.i)
    .map((x) => x.m);
  const others = messages.filter((m) => !m.isWaimaiProgress);

  const result: T[] = [];
  let p = 0;
  for (const m of others) {
    // 比這則訊息早的進度訊息先放進去（相同時間時，進度排在後面）
    while (p < progress.length && progress[p].timestamp < m.timestamp) {
      result.push(progress[p++]);
    }
    result.push(m);
  }
  while (p < progress.length) result.push(progress[p++]);
  return result;
}

function isWaimaiContextMessage(m: Message): boolean {
  return !!(
    m.isWaimaiShare ||
    m.isWaimaiPaymentRequest ||
    m.isWaimaiPaymentConfirm ||
    m.isWaimaiPaymentResult ||
    m.isWaimaiProgress ||
    m.isWaimaiDelivery
  );
}

export function buildWaimaiAuthorsNote(
  sourceMessages: Message[],
  now: () => number = Date.now,
): AuthorsNoteMetadata | undefined {
  const current = now();
  const recent = sourceMessages.slice(-20).filter((m) => !isFutureProgress(m, current));

  if (!recent.some(isWaimaiContextMessage)) return undefined;

  // 只看最新一張訂單：以最後一則分享 / 代付請求 / 自己付款確認為準
  let anchorIndex = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m.isWaimaiShare || m.isWaimaiPaymentRequest || m.isWaimaiPaymentConfirm) {
      anchorIndex = i;
      break;
    }
  }
  // 窗口內只剩付款結果 / 物流訊息時（起點被截掉），改用最後一則有訂單的外賣訊息
  if (anchorIndex < 0) {
    for (let i = recent.length - 1; i >= 0; i--) {
      if (isWaimaiContextMessage(recent[i]) && recent[i].waimaiOrder) {
        anchorIndex = i;
        break;
      }
    }
  }

  const anchor = anchorIndex >= 0 ? recent[anchorIndex] : undefined;
  const orderId = anchor?.waimaiOrder?.orderId;
  const sameOrderAfter = recent
    .slice(Math.max(anchorIndex, 0))
    .filter((m) => m.waimaiOrder && (!orderId || m.waimaiOrder.orderId === orderId));
  const order =
    [...sameOrderAfter].reverse().find((m) => m.waimaiOrder)?.waimaiOrder ??
    anchor?.waimaiOrder;

  const results = sameOrderAfter.filter((m) => m.isWaimaiPaymentResult);
  const lastResultStatus = results[results.length - 1]?.waimaiOrder?.status;
  const delivered =
    sameOrderAfter.some((m) => m.isWaimaiDelivery) ||
    order?.status === "delivered";
  const paid =
    delivered ||
    (!!order && WAIMAI_PAID_STATUSES.has(order.status)) ||
    sameOrderAfter.some((m) => m.isWaimaiProgress) ||
    (lastResultStatus !== undefined && WAIMAI_PAID_STATUSES.has(lastResultStatus));
  const declined = lastResultStatus === "rejected" || lastResultStatus === "failed";
  const auto = isAutoLogisticsOrder(order);

  let amountLine = "";
  if (order) {
    const name = order.recipientName?.trim();
    const recipient = !name || name === "我" ? "{{user}}" : name;
    const city = order.destination?.city?.trim();
    amountLine = `目前可見訂單：${order.item.name}，小計 ${order.subtotal} 金幣、運費 ${order.shippingFee} 金幣、總計 ${order.totalPrice} 金幣，收件人：${recipient}${city ? `，收貨城市：${city}` : ""}。`;
  }

  const lines: string[] = [
    "[外賣互動規則]",
    amountLine,
    "",
    "你可以使用以下標籤觸發外賣卡片 UI（標籤會自動渲染成卡片，不需重複寫商品名或金額）：",
    '- 同意付款：<waimai-pay status="paid"/>',
    '- 拒絕付款：<waimai-pay status="rejected"/>',
    '- 付款失敗：<waimai-pay status="failed"/>',
  ];
  if (!auto) lines.push("- 送達通知：<waimai-delivery/>");
  lines.push("");

  if (delivered) {
    lines.push("【當前狀態】已送達。可以聊收到的感想。");
  } else if (paid || (anchor?.isWaimaiPaymentConfirm && !anchor.isWaimaiPaymentRequest)) {
    lines.push(
      "【當前狀態】已付款。",
      auto
        ? "物流進度會由系統自動通知（聊天裡會出現物流進度訊息），不要用 <waimai-delivery/>，也不要自己宣布送達，可以關心或聊等待的心情。"
        : "關心配送進度，在合適時機用 <waimai-delivery/> 表示送達。",
    );
  } else if (anchor?.isWaimaiPaymentRequest && declined) {
    lines.push(
      "【當前狀態】你已經拒絕（或付款失敗）這張代付請求。",
      "除非 {{user}} 再次請你代付，不要再發付款標籤。",
    );
  } else if (anchor?.isWaimaiPaymentRequest) {
    lines.push(
      "【當前狀態】{{user}} 請你代付。",
      "請你決定要不要代付，根據角色性格決定是否願意付款：",
      '- 願意：先用文字表達同意，再附上 <waimai-pay status="paid"/>',
      '- 拒絕：先說明原因，再附上 <waimai-pay status="rejected"/>',
      "不要在沒有表態的情況下直接發標籤。",
    );
  } else if (anchor?.isWaimaiShare) {
    lines.push(
      "【當前狀態】{{user}} 分享了商品，尚未發起付款。",
      "可以評論商品、討論需求，但不可自行宣稱已付款或發送付款標籤。",
      "只有在 {{user}} 明確請你代付時，才能使用 <waimai-pay> 標籤。",
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
