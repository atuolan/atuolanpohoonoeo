<script setup lang="ts">
import { computed } from "vue";
import type { WaimaiOrderSnapshot } from "@/types/chat";
import { formatWaimaiDestination } from "@/services/waimaiLocation";

export type WaimaiCardKind =
  | "share"
  | "request"
  | "confirm"
  | "result"
  | "progress"
  | "delivery";

const props = defineProps<{
  order: WaimaiOrderSnapshot;
  kind: WaimaiCardKind;
  /** 已經過代理的商品圖網址（由 MessageBubble 傳入） */
  imageSrc?: string;
}>();

const isFood = computed(() => props.order.item.section === "food");

function formatWaimaiPrice(value?: number): string {
  const amount = Number.isFinite(value) ? Number(value) : 0;
  return `🪙 ${amount.toLocaleString("zh-TW")}`;
}

const statusLabel = computed(() => {
  switch (props.order.status) {
    case "created":
      return "待處理";
    case "payment_requested":
      return "待付款";
    case "payment_reviewing":
      return "付款確認中";
    case "paid":
      return "已付款";
    case "rejected":
      return "已拒絕";
    case "failed":
      return "失敗";
    case "in_transit":
      return "運輸中";
    case "customs":
      return "清關中";
    case "delivering":
      return "末端派送";
    case "delivered":
      return "已送達";
    default:
      return "";
  }
});

const cardTitle = computed(() => {
  switch (props.kind) {
    case "share":
      return "🛍️ 外賣商品分享";
    case "request":
      return "💸 請你幫我支付！";
    case "confirm":
      return "✅ 付款確認";
    case "result":
      return "📣 付款結果";
    case "progress":
      return "📍 物流進度";
    case "delivery":
      return isFood.value ? "🍱 餐點送達" : "📦 包裹送達";
    default:
      return "🧾 外賣訂單";
  }
});

function progressText(): string {
  const food = isFood.value;
  switch (props.order.status) {
    case "in_transit":
      return food ? "外送員已取餐。" : "幹線運輸中，正在前往目的地國家。";
    case "customs":
      return "包裹進入清關流程，完成後交由當地配送。";
    case "delivering":
      return food ? "外送員快到了。" : "已進入末端派送，請留意收貨通知。";
    case "delivered":
      return food ? "餐點送到了，趁熱吃！" : "配送完成，請留意是否已簽收。";
    default:
      return "物流節點已更新。";
  }
}

const summaryText = computed(() => {
  switch (props.kind) {
    case "share":
      return "你可以繼續討論後再決定是否下單。";
    case "request":
      return "對方可在聊天中決定是否替你付款。";
    case "confirm":
      return "已付款，物流進度會自動更新。";
    case "delivery":
      return isFood.value ? "餐點送到了，趁熱吃！" : "包裹送到了。";
    case "progress":
      return progressText();
    case "result":
      if (props.order.status === "paid") {
        return isFood.value
          ? "支付成功，店家正在備餐。"
          : "支付成功，商家正在備貨。";
      }
      if (props.order.status === "rejected") return "對方已拒絕此次代付請求。";
      if (props.order.status === "failed") return "支付失敗，請稍後重試。";
      return "";
    default:
      return "";
  }
});

const routeBadge = computed(() => {
  const eta = props.order.eta;
  if (!eta) return "";
  if (eta.routeType === "local_instant") return "就近外送";
  if (eta.routeType === "domestic") return "國內物流";
  if (eta.routeType === "cross_border") {
    const toFlag = (code: string) => {
      const upper = (code || "").trim().toUpperCase();
      if (upper.length !== 2) return "";
      const a = upper.codePointAt(0)! - 65 + 0x1f1e6;
      const b = upper.codePointAt(1)! - 65 + 0x1f1e6;
      return String.fromCodePoint(a) + String.fromCodePoint(b);
    };
    return `跨境空運 ${toFlag(eta.originCountry)}→${toFlag(eta.destinationCountry)}`;
  }
  return "";
});

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 用絕對時間，過幾天回頭看也不會失真 */
const etaText = computed(() => {
  const eta = props.order.eta;
  if (!eta) return "";
  const start = new Date(eta.etaWindowStartAt);
  const end = new Date(eta.etaWindowEndAt);
  const sameDay = start.toDateString() === end.toDateString();

  if (eta.routeType === "local_instant") {
    const hm = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
    if (sameDay) return `預計 ${hm(start)}–${hm(end)} 送達`;
    return `預計 ${md(start)} ${hm(start)}–${md(end)} ${hm(end)} 送達`;
  }

  const md = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  if (sameDay) return `預計 ${md(start)} 送達`;
  return `預計 ${md(start)}–${md(end)} 送達`;
});

// 新訂單只有國家＋城市；舊版地址簿的訂單才有詳細地址
const destinationText = computed(() => formatWaimaiDestination(props.order.destination));

const recipientName = computed(() => (props.order.recipientName || "").trim());

/** 延遲原因文案（暴雨延遲 / 清關中 / 尖峰時段） */
const delayReason = computed(() => {
  const eta = props.order.eta;
  if (!eta) return "";
  const reasons: string[] = [];
  if (eta.weatherLevel === "storm") reasons.push("⛈️ 暴雨延遲");
  else if (eta.weatherLevel === "rain") reasons.push("🌧️ 雨天延遲");
  if (props.order.status === "customs") reasons.push("🛃 清關中");
  if (eta.isPeakHour && eta.routeType === "local_instant")
    reasons.push("🕐 尖峰時段");
  return reasons.join("　");
});
</script>

<template>
  <div class="waimai-card">
    <div class="waimai-card-head">
      <span class="waimai-card-title">{{ cardTitle }}</span>
      <span v-if="statusLabel" class="waimai-status">{{ statusLabel }}</span>
    </div>

    <div class="waimai-item-row">
      <img
        v-if="imageSrc"
        :src="imageSrc"
        :alt="order.item.name"
        class="waimai-item-image"
      />
      <div class="waimai-item-meta">
        <div class="waimai-item-name">{{ order.item.name }}</div>
        <div class="waimai-item-store">{{ order.item.storeName }}</div>
        <div class="waimai-item-qty">x{{ order.item.quantity }}</div>
      </div>
    </div>

    <div class="waimai-price-grid">
      <span>小計</span>
      <span>{{ formatWaimaiPrice(order.subtotal) }}</span>
      <span>運費</span>
      <span>{{ formatWaimaiPrice(order.shippingFee) }}</span>
      <span class="total-label">總計</span>
      <span class="total-value">{{ formatWaimaiPrice(order.totalPrice) }}</span>
    </div>

    <div v-if="recipientName" class="waimai-recipient">
      收件人：{{ recipientName }}
    </div>
    <div v-if="destinationText" class="waimai-destination">
      送到：{{ destinationText }}
    </div>
    <div v-if="order.eta" class="waimai-eta-row">
      <span class="waimai-eta-text">{{ etaText }}</span>
      <span v-if="routeBadge" class="waimai-route-badge">{{ routeBadge }}</span>
    </div>
    <div v-if="delayReason" class="waimai-delay-reason">
      {{ delayReason }}
    </div>
    <div v-if="summaryText" class="waimai-card-foot">
      {{ summaryText }}
    </div>
  </div>
</template>

<style scoped lang="scss">
// 卡片自己是淺色底，文字色全部寫死，夜間模式才不會變成淺字配白底
.waimai-card {
  width: min(320px, 100%);
  border-radius: 14px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  color: #334155;
  padding: 12px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  text-align: left;

  .waimai-card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
  }

  .waimai-card-title {
    font-size: 13px;
    font-weight: 700;
    color: #334155;
  }

  .waimai-status {
    font-size: 11px;
    color: #475569;
    background: rgba(148, 163, 184, 0.16);
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .waimai-item-row {
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
  }

  .waimai-item-image {
    width: 52px;
    height: 52px;
    border-radius: 10px;
    object-fit: cover;
    flex-shrink: 0;
    background: #e2e8f0;
  }

  .waimai-item-meta {
    min-width: 0;
    flex: 1;
  }

  .waimai-item-name {
    font-size: 14px;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.3;
  }

  .waimai-item-store,
  .waimai-item-qty {
    font-size: 12px;
    color: #64748b;
    margin-top: 2px;
  }

  .waimai-price-grid {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 4px 10px;
    font-size: 12px;
    color: #475569;
    padding: 8px 0;
    border-top: 1px dashed rgba(148, 163, 184, 0.45);
    border-bottom: 1px dashed rgba(148, 163, 184, 0.45);

    .total-label,
    .total-value {
      font-weight: 700;
      color: #0f172a;
    }
  }

  .waimai-recipient {
    margin-top: 8px;
    font-size: 12px;
    color: #334155;
  }

  .waimai-destination {
    margin-top: 6px;
    font-size: 12px;
    color: #334155;
    line-height: 1.4;
  }

  .waimai-eta-row {
    margin-top: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .waimai-eta-text {
    font-size: 12px;
    color: #1e293b;
    font-weight: 600;
  }

  .waimai-route-badge {
    font-size: 11px;
    color: #1d4ed8;
    background: #dbeafe;
    border-radius: 999px;
    padding: 2px 8px;
    white-space: nowrap;
  }

  .waimai-delay-reason {
    margin-top: 5px;
    font-size: 11px;
    color: #b45309;
    line-height: 1.4;
  }

  .waimai-card-foot {
    margin-top: 8px;
    font-size: 12px;
    color: #64748b;
    line-height: 1.45;
  }
}
</style>
