import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadGate() {
  vi.resetModules();
  return import("@/composables/usePeerApplyGate");
}

function batch(requestId: string, count: number, sourceDeviceId = "devA") {
  return {
    requestId,
    sourceDeviceId,
    operation: "push" as const,
    totalEnvelopes: count,
    summary: [{ entityType: "chat_message", count }],
    sourceDisplayName: "Edge",
  };
}

describe("usePeerApplyGate", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("同一次傳輸的後續批次併進同一個確認視窗，不會把前面的批次自動拒絕", async () => {
    const gate = await loadGate();
    const first = gate.requestPeerApplyApproval(batch("r1", 20));
    const second = gate.requestPeerApplyApproval(batch("r2", 20));
    const third = gate.requestPeerApplyApproval(batch("r3", 15));

    expect(gate.pendingPeerApply.value?.totalEnvelopes).toBe(55);
    expect(gate.pendingPeerApply.value?.summary).toEqual([{ entityType: "chat_message", count: 55 }]);

    gate.approvePeerApply();
    await expect(Promise.all([first, second, third])).resolves.toEqual([true, true, true]);
    expect(gate.pendingPeerApply.value).toBeNull();
  });

  it("使用者拒絕時，同一次傳輸的所有批次一起拒絕", async () => {
    const gate = await loadGate();
    const first = gate.requestPeerApplyApproval(batch("r1", 20));
    const second = gate.requestPeerApplyApproval(batch("r2", 20));
    gate.rejectPeerApply();
    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it("接受後同一個裝置的後續批次自動放行", async () => {
    const gate = await loadGate();
    const first = gate.requestPeerApplyApproval(batch("r1", 20));
    gate.approvePeerApply();
    await first;
    await expect(gate.requestPeerApplyApproval(batch("r2", 20))).resolves.toBe(true);
    expect(gate.pendingPeerApply.value).toBeNull();
  });

  it("另一台裝置的請求才會取代目前的視窗", async () => {
    const gate = await loadGate();
    const fromA = gate.requestPeerApplyApproval(batch("r1", 20, "devA"));
    const fromB = gate.requestPeerApplyApproval(batch("r2", 5, "devB"));
    await expect(fromA).resolves.toBe(false);
    expect(gate.pendingPeerApply.value?.sourceDeviceId).toBe("devB");
    gate.approvePeerApply();
    await expect(fromB).resolves.toBe(true);
  });

  it("接受後顯示套用進度：之後才到的批次也算進總數，全部套用完就清掉", async () => {
    vi.useFakeTimers();
    const gate = await loadGate();
    const first = gate.requestPeerApplyApproval(batch("r1", 20));
    const second = gate.requestPeerApplyApproval(batch("r2", 20));
    gate.approvePeerApply();
    await Promise.all([first, second]);
    expect(gate.peerReceiveProgress.value).toMatchObject({ sourceDeviceId: "devA", done: 0, total: 40 });

    await gate.requestPeerApplyApproval(batch("r3", 10));
    expect(gate.peerReceiveProgress.value?.total).toBe(50);

    gate.reportPeerApplyProgress("devA", 20);
    gate.reportPeerApplyProgress("devA", 20);
    expect(gate.peerReceiveProgress.value?.done).toBe(40);
    gate.reportPeerApplyProgress("devA", 10);
    expect(gate.peerReceiveProgress.value?.done).toBe(50);
    vi.advanceTimersByTime(2000);
    expect(gate.peerReceiveProgress.value).toBeNull();
  });

  it("套用進度卡住時（對方斷線）一段時間沒更新就自己清掉", async () => {
    vi.useFakeTimers();
    const gate = await loadGate();
    const first = gate.requestPeerApplyApproval(batch("r1", 40));
    gate.approvePeerApply();
    await first;
    gate.reportPeerApplyProgress("devA", 20);
    vi.advanceTimersByTime(60_000);
    expect(gate.peerReceiveProgress.value).toBeNull();
  });
});

