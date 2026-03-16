<script setup lang="ts">
import WaimaiAddressPickerModal from "@/components/modals/WaimaiAddressPickerModal.vue";
import {
    WAIMAI_SECTION_META,
    getWaimaiCatalogBySection,
    type WaimaiCatalogItem,
    type WaimaiMallSection,
} from "@/data/waimaiCatalog";
import { computeWaimaiEta, formatEtaRangeText } from "@/services/waimaiEta";
import { buildAutoProgressMessages } from "@/services/waimaiProgress";
import { useCharactersStore } from "@/stores";
import type { WaimaiOrderSnapshot } from "@/types/chat";
import type { WaimaiDestinationSnapshot } from "@/types/waimaiDelivery";
import {
    ArrowLeft,
    MessageCircleMore,
    Send,
    ShoppingBag,
    Store,
} from "lucide-vue-next";
import { computed, ref } from "vue";

interface DeliveryMallInjectedMessage {
  content: string;
  isWaimaiShare?: boolean;
  isWaimaiPaymentRequest?: boolean;
  isWaimaiPaymentConfirm?: boolean;
  waimaiOrder: WaimaiOrderSnapshot;
  waimaiProgressMessages?: Array<{
    content: string;
    isWaimaiProgress?: boolean;
    isWaimaiDelivery?: boolean;
    waimaiOrder?: WaimaiOrderSnapshot;
    timestamp?: number;
  }>;
}

interface DeliveryMallSendToChatPayload {
  characterId: string;
  message: DeliveryMallInjectedMessage;
}

type PendingFlow = "share" | "order_self_pay" | "order_request_pay";

const emit = defineEmits<{
  back: [];
  sendToChat: [payload: DeliveryMallSendToChatPayload];
}>();

const charactersStore = useCharactersStore();

const activeSection = ref<WaimaiMallSection>("kind");
const selectedItem = ref<WaimaiCatalogItem | null>(null);
const showCharacterPicker = ref(false);
const showPayMethodPicker = ref(false);
const pendingFlow = ref<PendingFlow | null>(null);
const showAddressPicker = ref(false);
const selectedDestination = ref<WaimaiDestinationSnapshot | null>(null);

const currentItems = computed(() =>
  getWaimaiCatalogBySection(activeSection.value),
);

const selectableCharacters = computed(() =>
  charactersStore.characters.map((c) => ({
    id: c.id,
    name: c.nickname || c.data?.name || "角色",
  })),
);

function openItemDetail(item: WaimaiCatalogItem) {
  selectedItem.value = item;
}

function closeItemDetail() {
  selectedItem.value = null;
  closeCharacterPicker();
  closePayMethodPicker();
  closeAddressPicker();
}

function buildOrderSnapshot(
  item: WaimaiCatalogItem,
  targetCharacterName: string,
  destination?: WaimaiDestinationSnapshot,
): WaimaiOrderSnapshot {
  const subtotal = item.price;
  const shippingFee = 60;
  const isRequestPay = pendingFlow.value === "order_request_pay";

  const eta =
    destination && pendingFlow.value !== "share"
      ? computeWaimaiEta({
          section: item.section,
          logisticsMeta: item.logisticsMeta,
          destinationCountry: destination.countryCode,
          destinationLat: destination.lat,
          destinationLon: destination.lon,
          weatherLevel: "clear",
        })
      : undefined;

  return {
    orderId: `waimai_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    item: {
      itemId: item.id,
      name: item.name,
      storeName: item.storeName,
      section: item.section,
      unitPrice: item.price,
      quantity: 1,
      imageUrl: item.imageUrl,
    },
    subtotal,
    shippingFee,
    totalPrice: subtotal + shippingFee,
    recipientName: targetCharacterName,
    destination,
    eta,
    createdBy: "user",
    payer: isRequestPay ? "assistant" : "user",
    status: isRequestPay ? "payment_requested" : "payment_reviewing",
    createdAt: Date.now(),
  };
}

function openShareFlow() {
  if (!selectedItem.value) return;
  pendingFlow.value = "share";
  showCharacterPicker.value = true;
}

function openOrderFlow() {
  if (!selectedItem.value) return;
  showPayMethodPicker.value = true;
}

function chooseSelfPay() {
  pendingFlow.value = "order_self_pay";
  showPayMethodPicker.value = false;
  showAddressPicker.value = true;
}

function chooseRequestPay() {
  pendingFlow.value = "order_request_pay";
  showPayMethodPicker.value = false;
  showAddressPicker.value = true;
}

function closeCharacterPicker() {
  showCharacterPicker.value = false;
  pendingFlow.value = null;
  selectedDestination.value = null;
}

function closePayMethodPicker() {
  showPayMethodPicker.value = false;
}

function closeAddressPicker() {
  showAddressPicker.value = false;
  if (!showCharacterPicker.value) {
    pendingFlow.value = null;
  }
}

function handleAddressConfirm(payload: {
  destination: WaimaiDestinationSnapshot;
}) {
  selectedDestination.value = payload.destination;
  showAddressPicker.value = false;
  showCharacterPicker.value = true;
}

function formatRouteType(
  routeType: NonNullable<WaimaiOrderSnapshot["eta"]>["routeType"],
): string {
  if (routeType === "local_instant") return "即時配送";
  if (routeType === "domestic") return "國內物流";
  return "跨境物流";
}

function formatDestination(order: WaimaiOrderSnapshot): string {
  if (!order.destination) {
    return "未指定收貨地";
  }
  const d = order.destination;
  return `${d.countryName} ${d.city}｜${d.addressLine}`;
}

function formatOrderSummary(
  itemName: string,
  order: WaimaiOrderSnapshot,
): string {
  const lines = [
    `商品：${itemName}`,
    `小計：🪙 ${order.subtotal}｜運費：🪙 ${order.shippingFee}｜總計：🪙 ${order.totalPrice}`,
  ];

  if (order.destination) {
    lines.push(`收貨地：${formatDestination(order)}`);
  }

  if (order.eta) {
    lines.push(
      `預估送達：${formatEtaRangeText(order.eta)}（${formatRouteType(order.eta.routeType)}）`,
    );
  }

  return lines.join("\n");
}

function sendToCharacter(characterId: string, characterName: string) {
  if (!selectedItem.value || !pendingFlow.value) return;
  if (pendingFlow.value !== "share" && !selectedDestination.value) return;

  const order = buildOrderSnapshot(
    selectedItem.value,
    characterName,
    pendingFlow.value === "share"
      ? undefined
      : (selectedDestination.value ?? undefined),
  );

  if (pendingFlow.value === "share") {
    const shareOrder: WaimaiOrderSnapshot = {
      ...order,
      status: "created",
      payer: "user",
    };
    emit("sendToChat", {
      characterId,
      message: {
        content: `分享商品：${selectedItem.value.name}\n${formatOrderSummary(selectedItem.value.name, shareOrder)}\n（僅分享資訊，未發起付款）`,
        isWaimaiShare: true,
        waimaiOrder: shareOrder,
      },
    });
  } else if (pendingFlow.value === "order_self_pay") {
    const paidOrder: WaimaiOrderSnapshot = {
      ...order,
      status: "paid",
      paidAt: Date.now(),
    };

    const progressMessages = buildAutoProgressMessages(paidOrder).map(
      (msg) => ({
        content: msg.content,
        isWaimaiProgress: true,
        isWaimaiDelivery: msg.isWaimaiDelivery,
        waimaiOrder: msg.order,
        timestamp: msg.timestamp,
      }),
    );

    emit("sendToChat", {
      characterId,
      message: {
        content: `下單商品：${selectedItem.value.name}\n${formatOrderSummary(selectedItem.value.name, paidOrder)}\n（我已先付款，請協助追蹤送達）`,
        isWaimaiPaymentConfirm: true,
        waimaiOrder: paidOrder,
        waimaiProgressMessages: progressMessages,
      },
    });
  } else {
    const requestPayOrder: WaimaiOrderSnapshot = {
      ...order,
      payer: "assistant",
      status: "payment_requested",
    };
    emit("sendToChat", {
      characterId,
      message: {
        content: `請你幫我支付！\n${formatOrderSummary(selectedItem.value.name, requestPayOrder)}\n（請確認是否願意代付，並回覆付款結果）`,
        isWaimaiPaymentRequest: true,
        waimaiOrder: requestPayOrder,
      },
    });
  }

  closeItemDetail();
}
</script>

<template>
  <div class="delivery-mall-screen">
    <header class="screen-header">
      <button class="back-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <h1>
        <ShoppingBag :size="20" />
        外賣商城
      </h1>
    </header>

    <div class="section-tabs">
      <button
        v-for="section in WAIMAI_SECTION_META"
        :key="section.id"
        class="section-tab"
        :class="{ active: activeSection === section.id }"
        @click="activeSection = section.id"
      >
        <span class="tab-label">{{ section.label }}</span>
        <span class="tab-subtitle">{{ section.subtitle }}</span>
      </button>
    </div>

    <div class="content-area">
      <div class="item-grid">
        <button
          v-for="item in currentItems"
          :key="item.id"
          class="item-card"
          :disabled="!item.isAvailable"
          @click="openItemDetail(item)"
        >
          <div class="item-image-wrap">
            <img class="item-image" :src="item.imageUrl" :alt="item.name" />
            <span v-if="!item.isAvailable" class="sold-out">已下架</span>
          </div>
          <div class="item-meta">
            <div class="store-row">
              <Store :size="14" />
              <span>{{ item.storeName }}</span>
            </div>
            <div class="item-name">{{ item.name }}</div>
            <div class="item-desc">{{ item.description || "" }}</div>
            <div class="item-footer">
              <div class="tags">
                <span
                  v-for="tag in item.tags.slice(0, 2)"
                  :key="`${item.id}-${tag}`"
                  >{{ tag }}</span
                >
              </div>
              <div class="price">🪙 {{ item.price }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="selectedItem"
          class="detail-overlay"
          @click="closeItemDetail"
        >
          <div class="detail-sheet" @click.stop>
            <button class="close-btn" @click="closeItemDetail">×</button>
            <img
              class="detail-image"
              :src="selectedItem.imageUrl"
              :alt="selectedItem.name"
            />

            <div class="detail-store">{{ selectedItem.storeName }}</div>
            <div class="detail-name">{{ selectedItem.name }}</div>
            <div class="detail-desc">{{ selectedItem.description || "" }}</div>

            <div class="detail-tags">
              <span
                v-for="tag in selectedItem.tags"
                :key="`detail-${selectedItem.id}-${tag}`"
              >
                {{ tag }}
              </span>
            </div>

            <div class="detail-price">🪙 {{ selectedItem.price }}</div>

            <div class="detail-actions">
              <button
                class="action-btn secondary"
                type="button"
                @click="openShareFlow"
              >
                <MessageCircleMore :size="16" />
                分享給 char 討論
              </button>
              <button
                class="action-btn primary"
                type="button"
                :disabled="!selectedItem.isAvailable"
                @click="openOrderFlow"
              >
                <Send :size="16" />
                {{
                  selectedItem.isAvailable ? "下單 / 發起支付" : "商品已下架"
                }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showPayMethodPicker"
          class="picker-overlay"
          @click="closePayMethodPicker"
        >
          <div class="picker-sheet" @click.stop>
            <h3>選擇支付方式</h3>
            <p>你可以自己付款，或請對方幫你支付。</p>

            <div class="picker-actions">
              <button
                class="picker-btn primary"
                type="button"
                @click="chooseSelfPay"
              >
                自己支付
              </button>
              <button
                class="picker-btn secondary"
                type="button"
                @click="chooseRequestPay"
              >
                請他幫我支付
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showCharacterPicker"
          class="picker-overlay"
          @click="closeCharacterPicker"
        >
          <div class="picker-sheet" @click.stop>
            <h3>選擇要分享的 char</h3>
            <p>發送後會直接切到對應聊天視窗。</p>

            <div class="character-list">
              <button
                v-for="char in selectableCharacters"
                :key="char.id"
                class="character-item"
                type="button"
                @click="sendToCharacter(char.id, char.name)"
              >
                <span>{{ char.name }}</span>
                <small>
                  {{
                    pendingFlow === "order_request_pay"
                      ? "請你幫我支付！"
                      : pendingFlow === "order_self_pay"
                        ? "我先自己付款"
                        : "先分享討論"
                  }}
                </small>
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <WaimaiAddressPickerModal
      :visible="showAddressPicker"
      @close="closeAddressPicker"
      @confirm="handleAddressConfirm"
    />
  </div>
</template>

<style scoped lang="scss">
.delivery-mall-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #f8f9fa);
}

.screen-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  padding-top: max(16px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e8e8e8);

  .back-btn {
    border: none;
    background: transparent;
    border-radius: 8px;
    padding: 8px;
    cursor: pointer;
    color: var(--color-text, #222);

    &:active {
      background: rgba(0, 0, 0, 0.06);
    }
  }

  h1 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 18px;
    color: var(--color-text, #222);
  }
}

.section-tabs {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  overflow-x: auto;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #e8e8e8);

  &::-webkit-scrollbar {
    display: none;
  }

  .section-tab {
    min-width: 150px;
    border: 1px solid #d9d9d9;
    background: #fff;
    border-radius: 12px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;

    .tab-label {
      display: block;
      font-weight: 700;
      font-size: 14px;
      color: #222;
    }

    .tab-subtitle {
      display: block;
      margin-top: 4px;
      font-size: 12px;
      color: #666;
    }

    &.active {
      border-color: #6366f1;
      background: #eef2ff;
    }
  }
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 20px;
}

.item-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (min-width: 1440px) {
  .item-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

.item-card {
  border: 1px solid #ececec;
  background: #fff;
  border-radius: 14px;
  padding: 0;
  text-align: left;
  overflow: hidden;
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.8;
  }

  .item-image-wrap {
    position: relative;
    height: 110px;

    .item-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .sold-out {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 11px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      border-radius: 999px;
      padding: 3px 8px;
    }
  }

  .item-meta {
    padding: 10px;

    .store-row {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #6b7280;
      font-size: 12px;
    }

    .item-name {
      margin-top: 6px;
      font-size: 14px;
      font-weight: 700;
      color: #111827;
      line-height: 1.35;
    }

    .item-desc {
      margin-top: 4px;
      font-size: 12px;
      color: #6b7280;
      min-height: 32px;
    }

    .item-footer {
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;

      .tags {
        display: flex;
        gap: 4px;

        span {
          font-size: 10px;
          background: #f3f4f6;
          color: #4b5563;
          padding: 2px 6px;
          border-radius: 999px;
        }
      }

      .price {
        color: #ef4444;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
      }
    }
  }
}

.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  z-index: 5000;
}

.detail-sheet {
  width: 100%;
  max-height: 86vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 14px 14px 18px;
  position: relative;

  .close-btn {
    position: absolute;
    top: 10px;
    right: 10px;
    border: none;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.08);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
  }

  .detail-image {
    width: 100%;
    border-radius: 12px;
    height: 180px;
    object-fit: cover;
  }

  .detail-store {
    margin-top: 12px;
    font-size: 13px;
    color: #6b7280;
  }

  .detail-name {
    margin-top: 6px;
    font-size: 20px;
    font-weight: 800;
    color: #111827;
  }

  .detail-desc {
    margin-top: 8px;
    font-size: 14px;
    color: #374151;
    line-height: 1.6;
  }

  .detail-tags {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;

    span {
      padding: 4px 8px;
      border-radius: 999px;
      font-size: 12px;
      background: #f3f4f6;
      color: #4b5563;
    }
  }

  .detail-price {
    margin-top: 12px;
    font-size: 24px;
    font-weight: 800;
    color: #ef4444;
  }

  .detail-actions {
    margin-top: 14px;
    display: grid;
    gap: 8px;

    .action-btn {
      border: none;
      border-radius: 12px;
      padding: 12px;
      font-size: 14px;
      font-weight: 700;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 8px;
      cursor: pointer;

      &.secondary {
        background: #eef2ff;
        color: #3730a3;
      }

      &.primary {
        background: #111827;
        color: #fff;
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

.picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 5100;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
}

.picker-sheet {
  width: 100%;
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 16px 14px 20px;

  h3 {
    margin: 0;
    font-size: 18px;
    color: #111827;
  }

  p {
    margin: 8px 0 0;
    color: #6b7280;
    font-size: 13px;
  }
}

.picker-actions {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.picker-btn {
  border: none;
  border-radius: 12px;
  padding: 12px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &.primary {
    background: #111827;
    color: #fff;
  }

  &.secondary {
    background: #eef2ff;
    color: #3730a3;
  }
}

.character-list {
  margin-top: 14px;
  display: grid;
  gap: 8px;
}

.character-item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;

  span {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
  }

  small {
    font-size: 12px;
    color: #6b7280;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
