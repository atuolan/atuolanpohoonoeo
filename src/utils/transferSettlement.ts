/**
 * 使用者轉給角色的錢怎麼算收下或退回：
 * - 角色在那筆轉帳之後回了話、沒有退回 → 收下
 * - 角色用 <refund> 退回 → 對到之前還沒收的那一筆（金額一樣的優先，否則最近的一筆），錢退給使用者
 * - 那一輪回覆被換掉（重新生成、換候選）→ 那一輪做的收下／退回都還原
 * 都直接改訊息物件。
 */

export interface SettlementMessage {
  id: string;
  role: "user" | "ai" | "system";
  isTransfer?: boolean;
  transferType?: "pay" | "refund";
  transferAmount?: number;
  transferStatus?: "sent" | "pending" | "received" | "refunded";
  transferSettledBy?: string;
  refundOfMessageId?: string;
  isUserRecalled?: boolean;
  isSystemNotification?: boolean;
  isStreaming?: boolean;
}

export interface MoneyMove {
  transferId: string;
  amount: number;
}

function isUserPay(m: SettlementMessage): boolean {
  return (
    m.role === "user" &&
    !!m.isTransfer &&
    m.transferType !== "refund" &&
    !m.isUserRecalled &&
    (m.transferAmount ?? 0) > 0
  );
}

function isWaitingUserPay(m: SettlementMessage): boolean {
  return isUserPay(m) && (m.transferStatus === "sent" || !m.transferStatus);
}

function isAiRefund(m: SettlementMessage): boolean {
  return m.role === "ai" && !!m.isTransfer && m.transferType === "refund";
}

/** 角色真的回了話（不算飲食記錄之類的系統通知、還在生成中的） */
function isAiReply(m: SettlementMessage): boolean {
  return m.role === "ai" && !m.isSystemNotification && !m.isStreaming;
}

/** 結算：refunds 是要退給使用者的錢，changed 表示有訊息被改（要存檔） */
export function settleUserTransfers(messages: SettlementMessage[]): {
  refunds: MoneyMove[];
  changed: boolean;
} {
  const refunds: MoneyMove[] = [];
  let changed = false;
  const byId = new Map(messages.map((m) => [m.id, m]));

  messages.forEach((refund, index) => {
    if (!isAiRefund(refund)) return;
    const linked = refund.refundOfMessageId ? byId.get(refund.refundOfMessageId) : undefined;
    if (linked?.transferStatus === "refunded" && linked.transferSettledBy === refund.id) return;

    const candidates = messages.slice(0, index).filter(isWaitingUserPay);
    if (candidates.length === 0) return;
    const target =
      [...candidates].reverse().find((t) => t.transferAmount === refund.transferAmount) ??
      candidates[candidates.length - 1];

    target.transferStatus = "refunded";
    target.transferSettledBy = refund.id;
    refund.refundOfMessageId = target.id;
    refund.transferAmount = target.transferAmount;
    refunds.push({ transferId: target.id, amount: target.transferAmount! });
    changed = true;
  });

  messages.forEach((m, index) => {
    if (!isWaitingUserPay(m)) return;
    const reply = messages.slice(index + 1).find(isAiReply);
    if (!reply) return;
    m.transferStatus = "received";
    m.transferSettledBy = reply.id;
    changed = true;
  });

  return { refunds, changed };
}

/** 被換掉的那一輪做過的收下／退回還原成還沒收；回傳要從使用者那裡收回的退款 */
export function unsettleUserTransfers(
  messages: SettlementMessage[],
  removedIds: Set<string>,
): MoneyMove[] {
  const takeBack: MoneyMove[] = [];
  for (const m of messages) {
    if (!isUserPay(m) || !m.transferSettledBy || !removedIds.has(m.transferSettledBy)) continue;
    if (m.transferStatus === "refunded") takeBack.push({ transferId: m.id, amount: m.transferAmount! });
    m.transferStatus = "sent";
    m.transferSettledBy = undefined;
  }
  return takeBack;
}
