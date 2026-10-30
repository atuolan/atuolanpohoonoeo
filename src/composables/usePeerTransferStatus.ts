/**
 * 裝置互傳的進度文字與百分比：傳送端看 selfHostedSync store 的 peerTransfer，
 * 接收端看 usePeerApplyGate 的 peerReceiveProgress。全域進度條和同步設定頁共用。
 */
import { computed } from "vue";
import { peerReceiveProgress } from "@/composables/usePeerApplyGate";
import { useSelfHostedSyncStore } from "@/stores/selfHostedSync";

export interface PeerTransferStatus {
  /** 對方裝置；傳送端用來對到設定頁的哪張裝置卡片 */
  peerDeviceId: string;
  text: string;
  /** null＝還不知道進度（比對中、等對方接受、重連中），顯示來回跑的動畫 */
  percent: number | null;
}

function formatCount(done: number, total: number): string {
  return `${done}／${total}`;
}

export function usePeerTransferStatus() {
  const syncStore = useSelfHostedSyncStore();

  function peerName(deviceId: string): string {
    const peer = syncStore.peerList.find((p) => p.deviceId === deviceId);
    return peer?.customName ?? peer?.model ?? `${deviceId.slice(0, 6)}…`;
  }

  const sending = computed<PeerTransferStatus | null>(() => {
    const t = syncStore.peerTransfer;
    if (!t) return null;
    const name = peerName(t.targetDeviceId);
    const percent = (n: number) => (t.total > 0 ? Math.round((n / t.total) * 100) : null);
    switch (t.stage) {
      case "comparing":
        return { peerDeviceId: t.targetDeviceId, text: `正在和 ${name} 比對資料…`, percent: null };
      case "waiting":
        return {
          peerDeviceId: t.targetDeviceId,
          text: `等 ${name} 按接受…（${t.total} 筆）`,
          percent: null,
        };
      case "transferring":
        return {
          peerDeviceId: t.targetDeviceId,
          text:
            t.direction === "push"
              ? `傳到 ${name}：${formatCount(t.done, t.total)}`
              : `從 ${name} 下載：${formatCount(t.done, t.total)}`,
          percent: percent(t.done),
        };
      case "applying":
        return { peerDeviceId: t.targetDeviceId, text: `寫入本機中…（${t.total} 筆）`, percent: 100 };
      case "reconnecting":
        return { peerDeviceId: t.targetDeviceId, text: "連線中斷，重連中…（請留在小手機）", percent: null };
    }
    return null;
  });

  const receiving = computed<PeerTransferStatus | null>(() => {
    const r = peerReceiveProgress.value;
    if (!r) return null;
    return {
      peerDeviceId: r.sourceDeviceId,
      text:
        r.done >= r.total
          ? `已從 ${r.sourceDisplayName} 套用 ${r.total} 筆`
          : `從 ${r.sourceDisplayName} 套用中：${formatCount(r.done, r.total)}`,
      percent: r.total > 0 ? Math.round((r.done / r.total) * 100) : null,
    };
  });

  /** 全域進度條：傳送優先，沒有才顯示接收 */
  const current = computed(() => sending.value ?? receiving.value);

  return { sending, receiving, current };
}
