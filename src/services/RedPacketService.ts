/**
 * 群聊紅包協助函式
 * 提供金額計算、拼手氣隨機分配、判定可領者等邏輯
 */

import type { Message } from "@/types/chat";

export type RedPacketType = "lucky" | "exclusive" | "voice" | "split";

/** 將「12.34」字串轉為分（整數），避免浮點誤差 */
export function toCents(amount: string | number): number {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100);
}

/** 將分轉回「12.34」字串 */
export function centsToYuan(cents: number): string {
  if (!Number.isFinite(cents) || cents <= 0) return "0.00";
  return (cents / 100).toFixed(2);
}

/**
 * 微信「二倍均值法」拼手氣紅包：
 * 每次領取的隨機區間為 [0.01, 剩餘金額/剩餘人數 * 2]，
 * 最後一個人領完所有剩餘。
 */
export function pickLuckyShare(
  remainingCents: number,
  remainingCount: number,
): number {
  if (remainingCount <= 0 || remainingCents <= 0) return 0;
  if (remainingCount === 1) return remainingCents;
  // 留至少 1 分給後面每個人
  const reserve = remainingCount - 1; // 1 分 × 後面人數
  const max = Math.max(1, Math.floor((remainingCents / remainingCount) * 2));
  const safeMax = Math.min(max, remainingCents - reserve);
  if (safeMax <= 1) return 1;
  // 1 .. safeMax
  return Math.floor(Math.random() * safeMax) + 1;
}

/**
 * 平分紅包：每人金額固定 = floor(總額/份數)，最後一人補餘數。
 */
export function pickSplitShare(
  totalCents: number,
  totalCount: number,
  remainingCount: number,
): number {
  if (totalCount <= 0 || totalCents <= 0) return 0;
  const base = Math.floor(totalCents / totalCount);
  // 最後一人補齊餘數
  if (remainingCount === 1) {
    const consumed = base * (totalCount - 1);
    return Math.max(base, totalCents - consumed);
  }
  return base;
}

/** 初始化紅包領取狀態（首次入庫時呼叫） */
export function initRedPacketState(
  data: NonNullable<Message["redpacketData"]>,
): NonNullable<Message["redpacketState"]> {
  const totalCents = toCents(data.amount);
  // 預設份數：lucky/split 至少 1，exclusive 固定 1，voice 預設用 count，缺則 1
  let totalCount = data.count && data.count > 0 ? Math.floor(data.count) : 1;
  if (data.type === "exclusive") totalCount = 1;
  return {
    totalCents,
    totalCount,
    remainingCents: totalCents,
    remainingCount: totalCount,
    claims: [],
    fullyClaimed: false,
  };
}

/** 判定指定領取者是否「有資格」領這個紅包（不檢查口令文字，由呼叫端處理） */
export function canClaim(
  msg: Message,
  claimerName: string,
  isUser: boolean,
): { ok: boolean; reason?: string } {
  if (!msg.isRedpacket || !msg.redpacketData || !msg.redpacketState) {
    return { ok: false, reason: "not-redpacket" };
  }
  const { redpacketData: data, redpacketState: state } = msg;
  if (state.fullyClaimed || state.remainingCount <= 0) {
    return { ok: false, reason: "exhausted" };
  }
  // 已領過則不可重領
  if (
    state.claims.some(
      (c) => c.claimerName === claimerName && c.isUser === isUser,
    )
  ) {
    return { ok: false, reason: "already-claimed" };
  }
  // 專屬：限定 target
  if (data.type === "exclusive") {
    if (!data.target || data.target.trim() !== claimerName.trim()) {
      return { ok: false, reason: "not-target" };
    }
  }
  return { ok: true };
}

/** 套用一次領取，回傳領到的金額（分） */
export function applyClaim(
  msg: Message,
  claimerName: string,
  claimerCharId: string | undefined,
  isUser: boolean,
): number {
  if (!msg.isRedpacket || !msg.redpacketData || !msg.redpacketState) return 0;
  const data = msg.redpacketData;
  const state = msg.redpacketState;

  let cents = 0;
  if (data.type === "split") {
    cents = pickSplitShare(
      state.totalCents,
      state.totalCount,
      state.remainingCount,
    );
  } else {
    // lucky / voice / exclusive / 未指定 → 一律走拼手氣分配
    cents = pickLuckyShare(state.remainingCents, state.remainingCount);
  }
  if (cents <= 0) cents = Math.min(1, state.remainingCents);

  state.claims.push({
    claimerName,
    claimerCharId,
    isUser,
    cents,
    timestamp: Date.now(),
  });
  state.remainingCents = Math.max(0, state.remainingCents - cents);
  state.remainingCount = Math.max(0, state.remainingCount - 1);
  state.fullyClaimed = state.remainingCount <= 0 || state.remainingCents <= 0;

  return cents;
}

/** 在訊息列表中尋找最近一個尚未領完、可被指定者領取的群聊紅包 */
export function findClaimableRedPacket(
  messages: Message[],
  claimerName: string,
  isUser: boolean,
): Message | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.isRedpacket || !m.redpacketData || !m.redpacketState) continue;
    const check = canClaim(m, claimerName, isUser);
    if (check.ok) return m;
  }
  return undefined;
}

/** 判斷用戶最近 K 條訊息是否有說出 voice 口令 */
export function userSpokeVoice(
  messages: Message[],
  voicePhrase: string,
  lookback = 6,
): boolean {
  if (!voicePhrase) return true;
  const phrase = voicePhrase.trim();
  if (!phrase) return true;
  const userMsgs = messages.filter((m) => m.role === "user");
  const slice = userMsgs.slice(-lookback);
  return slice.some((m) => (m.content || "").includes(phrase));
}
