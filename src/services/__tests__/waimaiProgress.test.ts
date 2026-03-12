/// <reference types="vitest/globals" />

import { buildAutoProgressMessages } from "../waimaiProgress";
import type { WaimaiOrderSnapshot } from "@/types/chat";

function createBaseOrder(routeType: "local_instant" | "domestic" | "cross_border"): WaimaiOrderSnapshot {
  const paidAt = new Date("2026-03-04T08:00:00.000Z").getTime();

  return {
    orderId: `order_${routeType}`,
    item: {
      itemId: "item_1",
      name: "測試商品",
      storeName: "測試商店",
      section: "kind",
      unitPrice: 200,
      quantity: 1,
    },
    subtotal: 200,
    shippingFee: 60,
    totalPrice: 260,
    recipientName: "小明",
    createdBy: "user",
    payer: "user",
    status: "paid",
    createdAt: paidAt - 60_000,
    paidAt,
    eta: {
      computedAt: paidAt,
      estimatedDeliveryAt: paidAt + 600 * 60_000,
      etaWindowStartAt: paidAt + 560 * 60_000,
      etaWindowEndAt: paidAt + 640 * 60_000,
      totalMinutes: 600,
      weatherLevel: "clear",
      isPeakHour: false,
      routeType,
      originCountry: "TW",
      destinationCountry: routeType === "cross_border" ? "JP" : "TW",
      breakdown: {
        prepMinutes: 30,
        transitMinutes: 300,
        customsMinutes: routeType === "cross_border" ? 120 : 0,
        lastMileMinutes: 150,
      },
    },
  };
}

describe("waimaiProgress - 自動推進訊息", () => {
  it("跨境物流應包含 in_transit -> customs -> delivering -> delivered", () => {
    const order = createBaseOrder("cross_border");
    const messages = buildAutoProgressMessages(order);

    expect(messages.map((m) => m.status)).toEqual([
      "in_transit",
      "customs",
      "delivering",
      "delivered",
    ]);

    expect(messages.every((m, idx) => idx === 0 || m.timestamp >= messages[idx - 1].timestamp)).toBe(true);

    expect(messages[messages.length - 1].isWaimaiDelivery).toBe(true);
    expect(messages.slice(0, -1).every((m) => !m.isWaimaiDelivery)).toBe(true);

    expect(messages[1].content).toContain("清關");
  });

  it("本地/國內物流不應包含 customs 階段", () => {
    const localOrder = createBaseOrder("local_instant");
    const domesticOrder = createBaseOrder("domestic");

    const localMessages = buildAutoProgressMessages(localOrder);
    const domesticMessages = buildAutoProgressMessages(domesticOrder);

    expect(localMessages.map((m) => m.status)).toEqual([
      "in_transit",
      "delivering",
      "delivered",
    ]);
    expect(domesticMessages.map((m) => m.status)).toEqual([
      "in_transit",
      "delivering",
      "delivered",
    ]);
  });

  it("回傳的 order 快照應對應每個進度狀態，且 delivered 帶有 deliveredAt", () => {
    const order = createBaseOrder("cross_border");
    const messages = buildAutoProgressMessages(order);

    messages.forEach((msg) => {
      expect(msg.order.status).toBe(msg.status);
    });

    const deliveredMsg = messages[messages.length - 1];
    expect(deliveredMsg.status).toBe("delivered");
    expect(deliveredMsg.order.deliveredAt).toBe(deliveredMsg.timestamp);
  });

  it("沒有 eta 時應回傳空陣列", () => {
    const order = createBaseOrder("domestic");
    delete order.eta;

    const messages = buildAutoProgressMessages(order);
    expect(messages).toEqual([]);
  });
});
