import { describe, expect, it } from "vitest";
import {
  applyWaimaiParsedResultToMessage,
  buildWaimaiAuthorsNote,
  placeWaimaiProgressChronologically,
} from "@/composables/useChatWaimai";
import type { ChatScreenMessage as Message } from "@/types/chatScreen";
import type { WaimaiOrderSnapshot } from "@/types/chat";
import { WAIMAI_CATALOG } from "@/data/waimaiCatalog";

const foodItem = WAIMAI_CATALOG.find((i) => i.section === "food")!;

function makeOrder(
  orderId: string,
  over: Partial<WaimaiOrderSnapshot> = {},
): WaimaiOrderSnapshot {
  return {
    orderId,
    item: {
      itemId: foodItem.id,
      name: foodItem.name,
      storeName: foodItem.storeName,
      section: "food",
      unitPrice: 100,
      quantity: 1,
    },
    subtotal: 100,
    shippingFee: 30,
    totalPrice: 130,
    recipientName: "我",
    createdBy: "user",
    payer: "assistant",
    status: "payment_requested",
    createdAt: 1000,
    ...over,
  };
}

function msg(id: string, over: Partial<Message>): Message {
  return { id, role: "user", content: id, timestamp: 1000, ...over } as Message;
}

const autoDest = {
  source: "address_book" as const,
  recipientName: "我",
  countryCode: "TW",
  countryName: "台灣",
  city: "台北市",
  addressLine: "某路 1 號",
};
const oldEta = {
  computedAt: 1000,
  estimatedDeliveryAt: 2000,
  etaWindowStartAt: 1500,
  etaWindowEndAt: 2500,
  totalMinutes: 20,
  weatherLevel: "clear" as const,
  isPeakHour: false,
  routeType: "local_instant" as const,
  originCountry: "TW",
  destinationCountry: "TW",
  breakdown: { prepMinutes: 1, transitMinutes: 1, customsMinutes: 0, lastMileMinutes: 0 },
};

describe("buildWaimaiAuthorsNote", () => {
  it("拒絕後再次請求代付：要求決定是否代付，不是已付款", () => {
    const o1 = makeOrder("o1");
    const note = buildWaimaiAuthorsNote(
      [
        msg("a", { isWaimaiPaymentRequest: true, waimaiOrder: o1 }),
        msg("b", {
          role: "ai",
          isWaimaiPaymentResult: true,
          waimaiOrder: { ...o1, status: "rejected" },
        }),
        msg("c", { isWaimaiPaymentRequest: true, waimaiOrder: o1, timestamp: 2000 }),
      ],
      () => 5000,
    );
    expect(note?.prompt).toContain("決定要不要代付");
    expect(note?.prompt).not.toContain("【當前狀態】已付款");
  });

  it("拒絕後沒有再請求：告知已拒絕", () => {
    const o1 = makeOrder("o1");
    const note = buildWaimaiAuthorsNote(
      [
        msg("a", { isWaimaiPaymentRequest: true, waimaiOrder: o1 }),
        msg("b", {
          role: "ai",
          isWaimaiPaymentResult: true,
          waimaiOrder: { ...o1, status: "rejected" },
        }),
      ],
      () => 5000,
    );
    expect(note?.prompt).toContain("你已經拒絕");
  });

  it("前一張已送達，新的代付請求拿到代付說明", () => {
    const o1 = makeOrder("o1");
    const o2 = makeOrder("o2");
    const note = buildWaimaiAuthorsNote(
      [
        msg("a", { isWaimaiPaymentRequest: true, waimaiOrder: o1 }),
        msg("b", { isWaimaiPaymentResult: true, waimaiOrder: { ...o1, status: "paid" } }),
        msg("c", { isWaimaiDelivery: true, isWaimaiProgress: true, waimaiOrder: { ...o1, status: "delivered" } }),
        msg("d", { isWaimaiPaymentRequest: true, waimaiOrder: o2, timestamp: 3000 }),
      ],
      () => 5000,
    );
    expect(note?.prompt).toContain("決定要不要代付");
    expect(note?.prompt).toContain("{{user}} 請你代付");
  });

  it("自動物流訂單不列出送達標籤，且已付款說明不讓 AI 宣布送達", () => {
    const o = makeOrder("o1", { status: "paid", destination: autoDest, eta: oldEta });
    const note = buildWaimaiAuthorsNote(
      [msg("a", { isWaimaiPaymentConfirm: true, waimaiOrder: o })],
      () => 5000,
    );
    expect(note?.prompt).not.toContain("<waimai-delivery/>,");
    expect(note?.prompt).not.toMatch(/送達通知：<waimai-delivery\/>/);
    expect(note?.prompt).toContain("不要用 <waimai-delivery/>");
    expect(note?.prompt).toContain("收件人：{{user}}");
    expect(note?.prompt).toContain("台北市");
  });

  it("舊訂單（沒有 eta）仍列出送達標籤", () => {
    const o = makeOrder("o1", { status: "paid" });
    const note = buildWaimaiAuthorsNote(
      [msg("a", { isWaimaiPaymentConfirm: true, waimaiOrder: o })],
      () => 5000,
    );
    expect(note?.prompt).toMatch(/送達通知：<waimai-delivery\/>/);
  });
});

describe("applyWaimaiParsedResultToMessage", () => {
  it("自動物流訂單收到送達標籤：忽略", () => {
    const o = makeOrder("o1", { status: "paid", destination: autoDest, eta: oldEta });
    const target = msg("t", { role: "ai" });
    const ok = applyWaimaiParsedResultToMessage(
      target,
      { isWaimaiDelivery: true },
      [msg("a", { isWaimaiPaymentConfirm: true, waimaiOrder: o })],
      () => 5000,
    );
    expect(ok).toBe(false);
    expect(target.isWaimaiDelivery).toBeUndefined();
  });

  it("舊訂單的送達標籤照舊處理", () => {
    const o = makeOrder("o1", { status: "paid" });
    const target = msg("t", { role: "ai" });
    const ok = applyWaimaiParsedResultToMessage(
      target,
      { isWaimaiDelivery: true },
      [msg("a", { waimaiOrder: o })],
      () => 5000,
    );
    expect(ok).toBe(true);
    expect(target.waimaiOrder?.status).toBe("delivered");
  });

  it("分享後 AI 發付款標籤：忽略", () => {
    const o = makeOrder("o1", { status: "created" });
    const target = msg("t", { role: "ai" });
    const ok = applyWaimaiParsedResultToMessage(
      target,
      { isWaimaiPaymentResult: true, waimaiPaymentStatus: "paid" },
      [msg("a", { isWaimaiShare: true, waimaiOrder: o })],
      () => 5000,
    );
    expect(ok).toBe(false);
    expect(target.isWaimaiPaymentResult).toBeUndefined();
  });

  it("代付 paid：重算 ETA、設定 paidAt 與補進度旗標", () => {
    const o = makeOrder("o1", { destination: autoDest, eta: oldEta });
    const target = msg("t", { role: "ai" });
    const ok = applyWaimaiParsedResultToMessage(
      target,
      { isWaimaiPaymentResult: true, waimaiPaymentStatus: "paid" },
      [msg("a", { isWaimaiPaymentRequest: true, waimaiOrder: o })],
      () => 9_000_000,
    );
    expect(ok).toBe(true);
    expect(target.waimaiOrder?.status).toBe("paid");
    expect(target.waimaiOrder?.paidAt).toBe(9_000_000);
    expect(target.waimaiNeedsProgress).toBe(true);
    expect(target.waimaiOrder?.eta?.computedAt).toBe(9_000_000);
  });

  it("拒絕後可以再付；已付款後再發付款標籤忽略", () => {
    const o = makeOrder("o1", { status: "rejected" });
    const t1 = msg("t1", { role: "ai" });
    expect(
      applyWaimaiParsedResultToMessage(
        t1,
        { isWaimaiPaymentResult: true, waimaiPaymentStatus: "paid" },
        [msg("a", { waimaiOrder: o })],
        () => 5000,
      ),
    ).toBe(true);
    const t2 = msg("t2", { role: "ai" });
    expect(
      applyWaimaiParsedResultToMessage(
        t2,
        { isWaimaiPaymentResult: true, waimaiPaymentStatus: "paid" },
        [msg("a", { waimaiOrder: t1.waimaiOrder })],
        () => 6000,
      ),
    ).toBe(false);
  });

  it("略過還沒到時間的物流訊息", () => {
    const o = makeOrder("o1", { status: "payment_requested" });
    const future = msg("f", {
      isWaimaiProgress: true,
      timestamp: 99_000,
      waimaiOrder: makeOrder("o1", { status: "delivered" }),
    });
    const target = msg("t", { role: "ai" });
    const ok = applyWaimaiParsedResultToMessage(
      target,
      { isWaimaiPaymentResult: true, waimaiPaymentStatus: "rejected" },
      [msg("a", { waimaiOrder: o }), future],
      () => 5000,
    );
    expect(ok).toBe(true);
    expect(target.waimaiOrder?.status).toBe("rejected");
  });
});

describe("placeWaimaiProgressChronologically", () => {
  it("沒有進度訊息時回傳原陣列", () => {
    const arr = [{ timestamp: 1 }, { timestamp: 2 }];
    expect(placeWaimaiProgressChronologically(arr)).toBe(arr);
  });

  it("進度訊息依時間插到對的位置，其餘保持順序", () => {
    const list = [
      { id: "u1", timestamp: 100 },
      { id: "p2", timestamp: 500, isWaimaiProgress: true },
      { id: "p1", timestamp: 300, isWaimaiProgress: true },
      { id: "u2", timestamp: 400 },
      { id: "u3", timestamp: 600 },
      { id: "p3", timestamp: 900, isWaimaiProgress: true },
    ];
    expect(placeWaimaiProgressChronologically(list).map((m) => m.id)).toEqual([
      "u1",
      "p1",
      "u2",
      "p2",
      "u3",
      "p3",
    ]);
  });
});
