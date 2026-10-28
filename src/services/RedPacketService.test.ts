import { describe, expect, it } from "vitest";
import {
  REDPACKET_EXPIRE_MS,
  canClaim,
  expireRedPackets,
  findClaimableRedPacket,
  initRedPacketState,
  type RedPacketMessageLike,
} from "./RedPacketService";

const NOW = 1_800_000_000_000;

function packet(role: string, ageMs: number, claimed = 0): RedPacketMessageLike {
  const redpacketData = { amount: "10", blessing: "發財", type: "lucky" as const, count: 3 };
  const state = initRedPacketState(redpacketData);
  for (let i = 0; i < claimed; i++) {
    state.claims.push({ claimerName: `角色${i}`, isUser: false, cents: 100, timestamp: NOW });
    state.remainingCents -= 100;
    state.remainingCount -= 1;
  }
  state.fullyClaimed = state.remainingCount <= 0;
  return { role, timestamp: NOW - ageMs, isRedpacket: true, redpacketData, redpacketState: state };
}

describe("紅包過期", () => {
  it("超過 24 小時不能再領", () => {
    expect(canClaim(packet("user", REDPACKET_EXPIRE_MS - 1), "小美", false, NOW).ok).toBe(true);
    expect(canClaim(packet("user", REDPACKET_EXPIRE_MS), "小美", false, NOW)).toEqual({ ok: false, reason: "expired" });
    expect(findClaimableRedPacket([packet("ai", REDPACKET_EXPIRE_MS + 1)], "小美", false, NOW)).toBeUndefined();
  });

  it("使用者發的退回剩下的錢，角色發的只標過期", () => {
    const mine = packet("user", REDPACKET_EXPIRE_MS + 1, 1);
    const theirs = packet("ai", REDPACKET_EXPIRE_MS + 1);
    const result = expireRedPackets([mine, theirs], NOW);
    expect(result.map((r) => r.refundCents)).toEqual([900, 0]);
    expect(mine.redpacketState).toMatchObject({ expired: true, refundedCents: 900 });
    expect(theirs.redpacketState).toMatchObject({ expired: true, refundedCents: undefined });
  });

  it("已領完、還沒到期、已經過期過的都不動", () => {
    const done = packet("user", REDPACKET_EXPIRE_MS + 1, 3);
    const fresh = packet("user", 1000);
    const again = packet("user", REDPACKET_EXPIRE_MS + 1);
    expireRedPackets([again], NOW);
    expect(expireRedPackets([done, fresh, again], NOW)).toEqual([]);
    expect(done.redpacketState?.expired).toBeUndefined();
  });
});
