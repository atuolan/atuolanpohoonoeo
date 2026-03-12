import type { WaimaiOrderSnapshot, WaimaiOrderStatus } from "@/types/chat";
import type { WaimaiEtaSnapshot } from "@/types/waimaiDelivery";

export interface WaimaiProgressMessage {
  status: WaimaiOrderStatus;
  timestamp: number;
  content: string;
  order: WaimaiOrderSnapshot;
  isWaimaiDelivery?: boolean;
}

interface WaimaiProgressStagePoint {
  status: WaimaiOrderStatus;
  ratio: number;
}

function clampRatio(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function buildStagePoints(order: WaimaiOrderSnapshot): WaimaiProgressStagePoint[] {
  const routeType = order.eta?.routeType;

  if (routeType === "cross_border") {
    return [
      { status: "in_transit", ratio: 0.15 },
      { status: "customs", ratio: 0.55 },
      { status: "delivering", ratio: 0.85 },
      { status: "delivered", ratio: 1 },
    ];
  }

  return [
    { status: "in_transit", ratio: 0.2 },
    { status: "delivering", ratio: 0.8 },
    { status: "delivered", ratio: 1 },
  ];
}

function calcEtaRemainingText(eta: WaimaiEtaSnapshot | undefined, at: number): string {
  if (!eta) return "";
  const remainingMinutes = Math.max(0, Math.round((eta.etaWindowEndAt - at) / 60_000));

  if (remainingMinutes <= 0) {
    return "預估：即將送達";
  }
  if (remainingMinutes < 180) {
    return `預估剩餘約 ${remainingMinutes} 分鐘`;
  }

  const days = Math.round((remainingMinutes / 60 / 24) * 10) / 10;
  return `預估剩餘約 ${Math.max(0.1, days)} 天`;
}

function getProgressContent(status: WaimaiOrderStatus, order: WaimaiOrderSnapshot, at: number): string {
  const etaText = calcEtaRemainingText(order.eta, at);

  if (status === "in_transit") {
    return `📦 物流進度更新：訂單已出庫並進入運輸中。${etaText}`;
  }
  if (status === "customs") {
    return `🛃 物流進度更新：包裹已進入清關流程。${etaText}`;
  }
  if (status === "delivering") {
    return `🛵 物流進度更新：包裹已交由末端配送，正在派送。${etaText}`;
  }
  if (status === "delivered") {
    return "✅ 物流進度更新：訂單已送達。";
  }
  return "📣 物流進度更新。";
}

/**
 * 由已付款訂單自動產生物流進度訊息序列。
 * 目前採「一次性排程快照」策略：在注入聊天時直接寫入多筆系統訊息，
 * 以呈現 in_transit → customs(跨境) → delivering → delivered 的自動推進流程。
 */
export function buildAutoProgressMessages(order: WaimaiOrderSnapshot): WaimaiProgressMessage[] {
  if (!order.eta) return [];

  const paidAt = order.paidAt ?? order.createdAt;
  const totalMinutes = Math.max(1, order.eta.totalMinutes || 1);
  const points = buildStagePoints(order);

  return points.map((point) => {
    const at = paidAt + Math.round(totalMinutes * clampRatio(point.ratio)) * 60_000;
    const nextOrder: WaimaiOrderSnapshot = {
      ...order,
      status: point.status,
      deliveredAt: point.status === "delivered" ? at : undefined,
    };

    return {
      status: point.status,
      timestamp: at,
      content: getProgressContent(point.status, nextOrder, at),
      order: nextOrder,
      isWaimaiDelivery: point.status === "delivered",
    };
  });
}
