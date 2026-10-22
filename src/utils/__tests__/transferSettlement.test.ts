import { describe, expect, it } from "vitest";
import {
  settleUserTransfers,
  unsettleUserTransfers,
  type SettlementMessage,
} from "@/utils/transferSettlement";

const pay = (id: string, amount: number, extra: Partial<SettlementMessage> = {}): SettlementMessage => ({
  id,
  role: "user",
  isTransfer: true,
  transferType: "pay",
  transferAmount: amount,
  transferStatus: "sent",
  ...extra,
});
const refund = (id: string, amount: number): SettlementMessage => ({
  id,
  role: "ai",
  isTransfer: true,
  transferType: "refund",
  transferAmount: amount,
  transferStatus: "refunded",
});
const reply = (id: string, extra: Partial<SettlementMessage> = {}): SettlementMessage => ({ id, role: "ai", ...extra });

describe("settleUserTransfers", () => {
  it("角色還沒回話時維持還沒收", () => {
    const msgs = [pay("t1", 100)];
    expect(settleUserTransfers(msgs)).toEqual({ refunds: [], changed: false });
    expect(msgs[0].transferStatus).toBe("sent");
  });

  it("角色回話沒退回就算收下", () => {
    const msgs = [pay("t1", 100), reply("a1")];
    expect(settleUserTransfers(msgs)).toEqual({ refunds: [], changed: true });
    expect(msgs[0]).toMatchObject({ transferStatus: "received", transferSettledBy: "a1" });
  });

  it("飲食通知、生成中的訊息不算回話", () => {
    const msgs = [pay("t1", 100), reply("n1", { isSystemNotification: true }), reply("s1", { isStreaming: true })];
    settleUserTransfers(msgs);
    expect(msgs[0].transferStatus).toBe("sent");
  });

  it("角色退款對到金額一樣的那筆，錢退回", () => {
    const msgs = [pay("t1", 100), pay("t2", 200), reply("a1"), refund("r1", 100)];
    expect(settleUserTransfers(msgs).refunds).toEqual([{ transferId: "t1", amount: 100 }]);
    expect(msgs[0]).toMatchObject({ transferStatus: "refunded", transferSettledBy: "r1" });
    expect(msgs[1]).toMatchObject({ transferStatus: "received", transferSettledBy: "a1" });
    expect(msgs[3].refundOfMessageId).toBe("t1");
  });

  it("金額對不上就退最近一筆，卡片金額改成那筆", () => {
    const msgs = [pay("t1", 100), pay("t2", 200), refund("r1", 150)];
    expect(settleUserTransfers(msgs).refunds).toEqual([{ transferId: "t2", amount: 200 }]);
    expect(msgs[2].transferAmount).toBe(200);
    expect(msgs[0].transferStatus).toBe("received");
  });

  it("沒有可以退的轉帳就不給錢", () => {
    const msgs = [reply("a0"), refund("r1", 999)];
    expect(settleUserTransfers(msgs).refunds).toEqual([]);
    expect(msgs[1].refundOfMessageId).toBeUndefined();
  });

  it("已經收下或退過的不會再退一次", () => {
    const msgs = [pay("t1", 100), refund("r1", 100)];
    expect(settleUserTransfers(msgs).refunds).toHaveLength(1);
    expect(settleUserTransfers(msgs).refunds).toEqual([]);
    const later = [pay("t1", 100, { transferStatus: "received", transferSettledBy: "a1" }), reply("a1"), refund("r2", 100)];
    expect(settleUserTransfers(later).refunds).toEqual([]);
  });

  it("撤回的轉帳不算", () => {
    const msgs = [pay("t1", 100, { isUserRecalled: true }), reply("a1"), refund("r1", 100)];
    expect(settleUserTransfers(msgs).refunds).toEqual([]);
    expect(msgs[0].transferStatus).toBe("sent");
  });
});

describe("unsettleUserTransfers", () => {
  it("那一輪被換掉：收下和退回都還原，退回的錢要收回", () => {
    const msgs = [pay("t1", 100), pay("t2", 50), reply("a1"), refund("r1", 100)];
    settleUserTransfers(msgs);
    const takeBack = unsettleUserTransfers(msgs, new Set(["a1", "r1"]));
    expect(takeBack).toEqual([{ transferId: "t1", amount: 100 }]);
    expect(msgs[0]).toMatchObject({ transferStatus: "sent", transferSettledBy: undefined });
    expect(msgs[1]).toMatchObject({ transferStatus: "sent", transferSettledBy: undefined });
  });

  it("別輪結算的不動", () => {
    const msgs = [pay("t1", 100), reply("a1"), pay("t2", 30), reply("a2")];
    settleUserTransfers(msgs);
    expect(unsettleUserTransfers(msgs, new Set(["a2"]))).toEqual([]);
    expect(msgs[0].transferStatus).toBe("received");
    expect(msgs[2].transferStatus).toBe("sent");
  });
});
