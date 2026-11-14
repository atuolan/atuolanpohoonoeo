<script setup lang="ts">
/**
 * 商店裡「美食廣場、良心商店、邪氣商店」這幾頁：商品、詳情、下單、代付、分享到聊天
 *
 * 分頁、返回在 StoreScreen；這裡只顯示 section 那一區的商品
 */
import {
    getWaimaiCatalogBySection,
    type WaimaiCatalogItem,
    type WaimaiMallSection,
} from "@/data/waimaiCatalog";
import {
    computeWaimaiEta,
    formatEtaRangeText,
    pickWaimaiWeather,
} from "@/services/waimaiEta";
import { buildAutoProgressMessages } from "@/services/waimaiProgress";
import {
    computeWaimaiShippingFee,
    formatWaimaiRouteName,
    resolveWaimaiRoute,
} from "@/services/waimaiShipping";
import { useCharactersStore } from "@/stores";
import {
    buildRecipientDestination,
    formatWaimaiDestination,
    resolvePlaceText,
    type WaimaiRecipientKind,
} from "@/services/waimaiLocation";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import { useWeatherStore } from "@/stores/weather";
import type { WaimaiOrderSnapshot } from "@/types/chat";
import type { WaimaiDestinationSnapshot } from "@/types/waimaiDelivery";
import {
    Coins,
    MessageCircleMore,
    Send,
    Store,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

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

export interface DeliveryMallSendToChatPayload {
  characterId: string;
  message: DeliveryMallInjectedMessage;
}

type PendingFlow = "share" | "order_self_pay" | "order_request_pay";

// 跟商店其他頁一樣使用全域錢包
const WALLET_ID = "global";

const SECTION_EMOJI: Record<WaimaiMallSection, string> = {
  kind: "🧴",
  spicy: "🌙",
  food: "🍱",
};

const props = defineProps<{
  section: WaimaiMallSection;
}>();

const emit = defineEmits<{
  sendToChat: [payload: DeliveryMallSendToChatPayload];
}>();

const charactersStore = useCharactersStore();
const gameEconomyStore = useGameEconomyStore();
const weatherStore = useWeatherStore();

const selectedItem = ref<WaimaiCatalogItem | null>(null);
const showCharacterPicker = ref(false);
const showPayMethodPicker = ref(false);
const pendingFlow = ref<PendingFlow | null>(null);

// 確認訂單：進入時就算好快照，確認時送出同一份，畫面上的 ETA 才會一致
const showConfirm = ref(false);
const pendingOrder = ref<WaimaiOrderSnapshot | null>(null);
const pendingCharacter = ref<{ id: string; name: string } | null>(null);
const confirmError = ref("");
const submitting = ref(false);

// 收件人：送給自己或送給角色，收貨地依收件人所在地自動帶入
const recipientKind = ref<WaimaiRecipientKind>("me");
// 這一單手動改的地點（只用這一次，不會改角色或天氣設定）
const overridePlace = ref("");
const editingPlace = ref(false);
const placeDraft = ref("");
// 用了替代地點時的說明（例如角色還沒設定所在地）
const destinationNote = ref("");

// 載入失敗的圖片商品 id
const failedImageIds = ref<Set<string>>(new Set());

onMounted(() => {
  void gameEconomyStore.loadState(WALLET_ID);
});

const balance = computed(() => gameEconomyStore.getBalance(WALLET_ID));

// 使用者所在地：天氣設定手動填的城市，或自動定位抓到的城市＋國家
const userPlaceText = computed(() => {
  const loc = weatherStore.userLocation;
  const data = weatherStore.weatherData?.location;
  const city = (loc.mode === "manual" && loc.city) || data?.name || "";
  return [city, data?.country].filter(Boolean).join(", ");
});

const userCountryCode = computed(
  () => resolvePlaceText(userPlaceText.value)?.countryCode ?? "TW",
);

const currentItems = computed(() =>
  getWaimaiCatalogBySection(props.section),
);

const selectableCharacters = computed(() =>
  charactersStore.characters.map((c) => {
    const name = c.nickname || c.data?.name || "角色";
    return {
      id: c.id,
      name,
      avatar: c.avatar || "",
      initial: name.trim().charAt(0) || "角",
    };
  }),
);

const characterPickerTitle = computed(() => {
  if (pendingFlow.value === "order_request_pay") return "要請誰幫你付？";
  if (pendingFlow.value === "order_self_pay") return "要跟誰說你下單了？";
  return "要分享給誰？";
});

// 商品詳情的運費估算：先以使用者所在國家計算，送給角色時依角色所在地重算
const detailEstimate = computed(() => {
  const item = selectedItem.value;
  if (!item) return null;
  const routeType = resolveWaimaiRoute(item, userCountryCode.value);
  const fee = computeWaimaiShippingFee(routeType);
  const routeName = formatWaimaiRouteName(routeType);
  const routeText =
    routeType === "cross_border" ? `${routeName}，依收件人所在地計算` : routeName;
  return { fee, routeText, total: item.price + fee };
});

// 確認視窗用的小計算
const confirmIsSelfPay = computed(
  () => pendingFlow.value === "order_self_pay",
);
const balanceAfter = computed(() =>
  pendingOrder.value ? balance.value - pendingOrder.value.totalPrice : 0,
);
const shortfall = computed(() => (balanceAfter.value < 0 ? -balanceAfter.value : 0));
const confirmDisabled = computed(
  () => submitting.value || (confirmIsSelfPay.value && shortfall.value > 0),
);

function formatCoin(value: number): string {
  return value.toLocaleString("zh-TW");
}

function sectionEmoji(section: WaimaiMallSection): string {
  return SECTION_EMOJI[section] ?? "🛍️";
}

function showPlaceholder(item: WaimaiCatalogItem): boolean {
  return !item.imageUrl || failedImageIds.value.has(item.id);
}

function markImageFailed(itemId: string) {
  failedImageIds.value.add(itemId);
}

function openItemDetail(item: WaimaiCatalogItem) {
  selectedItem.value = item;
}

function closeItemDetail() {
  selectedItem.value = null;
  closeConfirm();
  closeCharacterPicker();
  closePayMethodPicker();
}

function buildOrderSnapshot(
  item: WaimaiCatalogItem,
  destination?: WaimaiDestinationSnapshot,
): WaimaiOrderSnapshot {
  const subtotal = item.price;
  const isRequestPay = pendingFlow.value === "order_request_pay";
  // 分享沒有收貨地，用使用者所在國家估運費
  const country = destination?.countryCode ?? userCountryCode.value;
  const shippingFee = computeWaimaiShippingFee(resolveWaimaiRoute(item, country));

  const eta =
    destination && pendingFlow.value !== "share"
      ? computeWaimaiEta({
          section: item.section,
          logisticsMeta: item.logisticsMeta,
          destinationCountry: destination.countryCode,
          destinationLat: destination.lat,
          destinationLon: destination.lon,
          weatherLevel: pickWaimaiWeather(),
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
    // 收件人：「我」或角色名字；分享沒有收件人就留空
    recipientName: destination?.recipientName ?? "",
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
  showCharacterPicker.value = true;
}

function chooseRequestPay() {
  pendingFlow.value = "order_request_pay";
  showPayMethodPicker.value = false;
  showCharacterPicker.value = true;
}

function closeCharacterPicker() {
  showCharacterPicker.value = false;
  if (!showConfirm.value) {
    pendingFlow.value = null;
  }
}

function closePayMethodPicker() {
  showPayMethodPicker.value = false;
}

function resetRecipient() {
  recipientKind.value = "me";
  overridePlace.value = "";
  editingPlace.value = false;
  placeDraft.value = "";
  destinationNote.value = "";
}

// 依收件人重算收貨地、運費與預估送達
function rebuildPendingOrder() {
  const item = selectedItem.value;
  const character = pendingCharacter.value;
  if (!item || !character) return;
  const stored = charactersStore.characters.find((c) => c.id === character.id);
  const { destination, note } = buildRecipientDestination({
    recipient: recipientKind.value,
    charName: character.name,
    charPlace: stored?.worldSettings?.location,
    userPlace: userPlaceText.value,
    overridePlace: overridePlace.value,
  });
  pendingOrder.value = buildOrderSnapshot(item, destination);
  destinationNote.value = note;
}

function setRecipient(kind: WaimaiRecipientKind) {
  if (recipientKind.value === kind) return;
  recipientKind.value = kind;
  overridePlace.value = "";
  editingPlace.value = false;
  rebuildPendingOrder();
}

function startEditPlace() {
  placeDraft.value = overridePlace.value;
  editingPlace.value = true;
}

function applyPlace() {
  overridePlace.value = placeDraft.value.trim();
  editingPlace.value = false;
  rebuildPendingOrder();
}

function cancelEditPlace() {
  editingPlace.value = false;
}

// 關閉確認視窗並把整條下單流程的暫存清乾淨
function closeConfirm() {
  showConfirm.value = false;
  pendingOrder.value = null;
  pendingCharacter.value = null;
  confirmError.value = "";
  submitting.value = false;
  resetRecipient();
  if (!showCharacterPicker.value) {
    pendingFlow.value = null;
  }
}

// 從確認視窗返回選角色
function backToCharacterPicker() {
  showConfirm.value = false;
  pendingOrder.value = null;
  pendingCharacter.value = null;
  confirmError.value = "";
  resetRecipient();
  showCharacterPicker.value = true;
}

function formatDestination(order: WaimaiOrderSnapshot): string {
  return formatWaimaiDestination(order.destination) || "未指定收貨地";
}

function formatOrderSummary(
  itemName: string,
  order: WaimaiOrderSnapshot,
): string {
  const lines = [
    `商品：${itemName}`,
    `小計：${order.subtotal} 金幣｜運費：${order.shippingFee} 金幣｜總計：${order.totalPrice} 金幣`,
  ];

  if (order.destination) {
    lines.push(`收件人：${order.recipientName}｜送到：${formatDestination(order)}`);
  }

  if (order.eta) {
    lines.push(
      `預估送達：${formatEtaRangeText(order.eta)}（${formatWaimaiRouteName(order.eta.routeType)}）`,
    );
  }

  return lines.join("\n");
}

function sendToCharacter(characterId: string, characterName: string) {
  const item = selectedItem.value;
  if (!item || !pendingFlow.value) return;

  // 分享：不花錢，選完角色直接送出
  if (pendingFlow.value === "share") {
    const shareOrder: WaimaiOrderSnapshot = {
      ...buildOrderSnapshot(item),
      status: "created",
      payer: "user",
    };
    emit("sendToChat", {
      characterId,
      message: {
        content: `🛍️ 分享商品\n${formatOrderSummary(item.name, shareOrder)}\n（僅分享資訊，未發起付款）`,
        isWaimaiShare: true,
        waimaiOrder: shareOrder,
      },
    });
    closeItemDetail();
    return;
  }

  // 下單：先進確認視窗，快照在這裡算好（預設送給自己）
  pendingCharacter.value = { id: characterId, name: characterName };
  resetRecipient();
  rebuildPendingOrder();
  confirmError.value = "";
  showCharacterPicker.value = false;
  showConfirm.value = true;
}

async function confirmOrder() {
  const item = selectedItem.value;
  const order = pendingOrder.value;
  const character = pendingCharacter.value;
  if (!item || !order || !character || !pendingFlow.value || submitting.value)
    return;

  submitting.value = true;
  confirmError.value = "";

  try {
    if (pendingFlow.value === "order_self_pay") {
      const r = gameEconomyStore.spendMoney(
        WALLET_ID,
        order.totalPrice,
        "shop",
        `外賣：${item.name}`,
        item.id,
      );
      if (!r.success) {
        confirmError.value = "餘額不足";
        return;
      }
      await gameEconomyStore.saveState(WALLET_ID);

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
        characterId: character.id,
        message: {
          content: `${recipientKind.value === "char" ? "🎁 我點了外賣送給你" : "🧾 我下單了"}\n${formatOrderSummary(item.name, paidOrder)}\n（我已經付款了，物流進度會自動更新）`,
          isWaimaiPaymentConfirm: true,
          waimaiOrder: paidOrder,
          waimaiProgressMessages: progressMessages,
        },
      });
    } else {
      // 請角色代付：不扣使用者的錢
      const requestPayOrder: WaimaiOrderSnapshot = {
        ...order,
        payer: "assistant",
        status: "payment_requested",
      };
      emit("sendToChat", {
        characterId: character.id,
        message: {
          content: `請你幫我支付！\n${formatOrderSummary(item.name, requestPayOrder)}\n（請確認是否願意代付，並回覆付款結果）`,
          isWaimaiPaymentRequest: true,
          waimaiOrder: requestPayOrder,
        },
      });
    }

    closeItemDetail();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="delivery-mall-panel">
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
            <div v-if="showPlaceholder(item)" class="image-placeholder">
              {{ sectionEmoji(item.section) }}
            </div>
            <img
              v-else
              class="item-image"
              :src="item.imageUrl"
              :alt="item.name"
              @error="markImageFailed(item.id)"
            />
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
              <div class="price">
                <Coins :size="14" class="coin" />{{ formatCoin(item.price) }}
              </div>
            </div>
          </div>
        </button>
      </div>
      <slot />
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
            <div
              v-if="showPlaceholder(selectedItem)"
              class="image-placeholder detail-image"
            >
              {{ sectionEmoji(selectedItem.section) }}
            </div>
            <img
              v-else
              class="detail-image"
              :src="selectedItem.imageUrl"
              :alt="selectedItem.name"
              @error="markImageFailed(selectedItem.id)"
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

            <div class="detail-price">
              <Coins :size="22" class="coin" />{{ formatCoin(selectedItem.price) }}
            </div>
            <div v-if="detailEstimate" class="detail-shipping">
              運費 <Coins :size="13" class="coin inline" />{{ formatCoin(detailEstimate.fee) }}（{{ detailEstimate.routeText }}）・合計
              <Coins :size="13" class="coin inline" />{{ formatCoin(detailEstimate.total) }}
            </div>

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
            <h3>{{ characterPickerTitle }}</h3>
            <p>發送後會直接切到對應聊天視窗。</p>

            <div v-if="selectableCharacters.length" class="character-list">
              <button
                v-for="char in selectableCharacters"
                :key="char.id"
                class="character-item"
                type="button"
                @click="sendToCharacter(char.id, char.name)"
              >
                <img
                  v-if="char.avatar"
                  class="character-avatar"
                  :src="char.avatar"
                  alt=""
                />
                <span v-else class="character-avatar fallback">{{
                  char.initial
                }}</span>
                <span class="character-name">{{ char.name }}</span>
              </button>
            </div>
            <div v-else class="character-empty">
              還沒有角色，先去建立一個吧
            </div>
          </div>
        </div>
      </transition>
    </teleport>

    <teleport to="body">
      <transition name="fade">
        <div
          v-if="showConfirm && pendingOrder"
          class="picker-overlay"
          @click="closeConfirm"
        >
          <div class="picker-sheet confirm-sheet" @click.stop>
            <h3>確認訂單</h3>

            <div class="confirm-body">
              <div class="confirm-item">
                <div class="confirm-item-name">{{ pendingOrder.item.name }}</div>
                <div class="confirm-item-store">
                  {{ pendingOrder.item.storeName }}
                </div>
              </div>

              <div class="recipient-block">
                <div class="recipient-head">送給</div>
                <div class="recipient-toggle">
                  <button
                    type="button"
                    :class="{ active: recipientKind === 'me' }"
                    @click="setRecipient('me')"
                  >
                    我
                  </button>
                  <button
                    type="button"
                    :class="{ active: recipientKind === 'char' }"
                    @click="setRecipient('char')"
                  >
                    {{ pendingCharacter?.name }}
                  </button>
                </div>
                <div class="recipient-place">
                  <span class="place-text">送到：{{ formatDestination(pendingOrder) }}</span>
                  <button
                    v-if="!editingPlace"
                    type="button"
                    class="place-edit-btn"
                    @click="startEditPlace"
                  >
                    改地點
                  </button>
                </div>
                <div v-if="editingPlace" class="place-editor">
                  <input
                    v-model="placeDraft"
                    class="place-input"
                    type="text"
                    placeholder="例如：東京、Taipei, Taiwan"
                    @keydown.enter="applyPlace"
                  />
                  <button type="button" class="place-apply" @click="applyPlace">
                    套用
                  </button>
                  <button type="button" class="place-cancel" @click="cancelEditPlace">
                    取消
                  </button>
                </div>
                <div v-if="destinationNote" class="place-note">
                  {{ destinationNote }}
                </div>
              </div>

              <div class="confirm-rows">
                <div class="confirm-row">
                  <span>小計</span>
                  <span class="amount"><Coins :size="13" class="coin" />{{ formatCoin(pendingOrder.subtotal) }}</span>
                </div>
                <div class="confirm-row">
                  <span>{{
                    pendingOrder.eta
                      ? `運費（${formatWaimaiRouteName(pendingOrder.eta.routeType)}）`
                      : "運費"
                  }}</span>
                  <span class="amount"><Coins :size="13" class="coin" />{{ formatCoin(pendingOrder.shippingFee) }}</span>
                </div>
                <div class="confirm-row total">
                  <span>總計</span>
                  <span class="amount"><Coins :size="13" class="coin" />{{ formatCoin(pendingOrder.totalPrice) }}</span>
                </div>
              </div>

              <div class="confirm-rows">
                <div v-if="pendingOrder.eta" class="confirm-row">
                  <span>預估送達</span>
                  <span>{{ formatEtaRangeText(pendingOrder.eta) }}</span>
                </div>
                <div class="confirm-row">
                  <span>付款方式</span>
                  <span>{{
                    confirmIsSelfPay
                      ? "自己支付"
                      : `請 ${pendingCharacter?.name ?? "對方"} 代付`
                  }}</span>
                </div>
              </div>

              <div v-if="confirmIsSelfPay" class="confirm-balance">
                目前餘額 <Coins :size="13" class="coin inline" />{{ formatCoin(balance) }}
                → 付款後 <Coins :size="13" class="coin inline" />{{ formatCoin(balanceAfter) }}
              </div>
              <div v-if="confirmIsSelfPay && shortfall > 0" class="confirm-error">
                餘額不足，還差 <Coins :size="13" class="coin inline" />{{ formatCoin(shortfall) }}
              </div>
              <div v-else-if="confirmError" class="confirm-error">
                {{ confirmError }}
              </div>
            </div>

            <div class="confirm-actions">
              <button
                class="picker-btn secondary"
                type="button"
                @click="backToCharacterPicker"
              >
                返回
              </button>
              <button
                class="picker-btn primary"
                type="button"
                :disabled="confirmDisabled"
                @click="confirmOrder"
              >
                {{ confirmIsSelfPay ? "確認付款" : "送出代付請求" }}
              </button>
            </div>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style scoped lang="scss">
.delivery-mall-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 20px;
}

.item-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

@media (min-width: 600px) {
  .item-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
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

    .image-placeholder {
      width: 100%;
      height: 100%;
      font-size: 40px;
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
        flex-wrap: nowrap;
        gap: 4px;
        min-width: 0;
        overflow: hidden;

        span {
          white-space: nowrap;
          flex-shrink: 0;
          font-size: 10px;
          background: #f3f4f6;
          color: #4b5563;
          padding: 2px 6px;
          border-radius: 999px;
        }
      }

      .price {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        color: #ef4444;
        font-size: 14px;
        font-weight: 700;
        white-space: nowrap;
        flex-shrink: 0;
      }
    }
  }
}

// 圖片載入失敗或沒有圖片時的佔位方塊
.image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #eef2ff;
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
  padding: 14px 14px calc(18px + env(safe-area-inset-bottom, 0px));
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

    &.image-placeholder {
      font-size: 64px;
    }
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
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 12px;
    font-size: 24px;
    font-weight: 800;
    color: #ef4444;
  }

  .detail-shipping {
    margin-top: 4px;
    font-size: 13px;
    color: #6b7280;
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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 18px 18px 0 0;
  padding: 16px 14px calc(20px + env(safe-area-inset-bottom, 0px));

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

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.character-list {
  margin-top: 14px;
  display: grid;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
}

.character-empty {
  margin-top: 14px;
  padding: 20px 0;
  text-align: center;
  font-size: 14px;
  color: #6b7280;
}

.confirm-sheet {
  .confirm-body {
    margin-top: 12px;
    overflow-y: auto;
    min-height: 0;
  }

  .confirm-item-name {
    font-size: 16px;
    font-weight: 800;
    color: #111827;
  }

  .confirm-item-store {
    margin-top: 2px;
    font-size: 12px;
    color: #6b7280;
  }

  .confirm-rows {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 12px;
    background: #f3f4f6;
  }

  .confirm-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 4px 0;
    font-size: 13px;
    color: #374151;

    > span:last-child {
      text-align: right;
      min-width: 0;
      word-break: break-all;
    }

    .amount {
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    &.total {
      font-weight: 800;
      color: #111827;
    }
  }

  .confirm-balance {
    margin-top: 12px;
    font-size: 13px;
    color: #374151;
  }

  .confirm-error {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #dc2626;
  }

  .confirm-actions {
    margin-top: 14px;
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 8px;
  }

  .recipient-block {
    margin-top: 12px;
  }

  .recipient-head {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 6px;
  }

  .recipient-toggle {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;

    button {
      border: 1px solid #d1d5db;
      background: #fff;
      color: #374151;
      border-radius: 10px;
      padding: 9px 8px;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      &.active {
        border-color: #6366f1;
        background: #eef2ff;
        color: #3730a3;
      }
    }
  }

  .recipient-place {
    margin-top: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    color: #374151;

    .place-text {
      min-width: 0;
      word-break: break-all;
    }
  }

  .place-edit-btn {
    flex-shrink: 0;
    border: none;
    background: transparent;
    color: #4f46e5;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 2px 0;
  }

  .place-editor {
    margin-top: 6px;
    display: flex;
    gap: 6px;

    .place-input {
      flex: 1;
      min-width: 0;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
      background: #fff;
      color: #111827;
    }

    button {
      flex-shrink: 0;
      border: none;
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }

    .place-apply {
      background: #111827;
      color: #fff;
    }

    .place-cancel {
      background: #f3f4f6;
      color: #374151;
    }
  }

  .place-note {
    margin-top: 6px;
    font-size: 12px;
    color: #b45309;
    line-height: 1.4;
  }
}

.character-item {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  text-align: left;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;

  .character-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;

    &.fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e0e7ff;
      color: #3730a3;
      font-size: 15px;
      font-weight: 700;
    }
  }

  .character-name {
    font-size: 14px;
    font-weight: 700;
    color: #111827;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

// ===== 夜晚模式覆蓋 =====
// 頁面底色跟著主題變數變深，但商品卡與底部彈窗寫死淺色；
// 金幣圖示：跟商店其他頁一樣用 Coins，不用 🪙（iPhone 上是銀色的）
.coin {
  flex-shrink: 0;
  color: #d97706;

  &.inline {
    display: inline-block;
    vertical-align: -2px;
    margin: 0 1px 0 2px;
  }
}

// body.is-night-mode 由 theme store 同步切換，保持巢狀讓 scoped 附在內層元素上。
body.is-night-mode {
  .coin {
    color: #ffb74d;
  }

  .image-placeholder {
    background: rgba(129, 140, 248, 0.15);
  }

  .item-card {
    border-color: var(--color-border);
    background: var(--color-surface);

    .item-meta {
      .store-row,
      .item-desc {
        color: var(--color-text-secondary);
      }

      .item-name {
        color: var(--color-text);
      }

      .item-footer .tags span {
        background: rgba(255, 255, 255, 0.08);
        color: var(--color-text-secondary);
      }

      .item-footer .price {
        color: #ff7b7b;
      }
    }
  }

  .detail-sheet,
  .picker-sheet {
    background: var(--color-surface);
  }

  .detail-sheet {
    .close-btn {
      background: rgba(255, 255, 255, 0.1);
      color: var(--color-text);
    }

    .detail-store {
      color: var(--color-text-secondary);
    }

    .detail-name {
      color: var(--color-text);
    }

    .detail-desc {
      color: var(--color-text-secondary);
    }

    .detail-tags span {
      background: rgba(255, 255, 255, 0.08);
      color: var(--color-text-secondary);
    }

    .detail-price {
      color: #ff7b7b;
    }

    .detail-shipping {
      color: var(--color-text-secondary);
    }
  }

  .confirm-sheet {
    .confirm-item-name,
    .confirm-row.total {
      color: var(--color-text);
    }

    .confirm-item-store,
    .confirm-row,
    .confirm-balance {
      color: var(--color-text-secondary);
    }

    .confirm-rows {
      background: var(--color-surface-hover);
    }

    .confirm-error {
      color: #ff7b7b;
    }

    .recipient-head,
    .recipient-place {
      color: var(--color-text-secondary);
    }

    .recipient-toggle button {
      border-color: var(--color-border);
      background: var(--color-surface-hover);
      color: var(--color-text);

      &.active {
        border-color: #818cf8;
        background: rgba(129, 140, 248, 0.15);
        color: #c7d2fe;
      }
    }

    .place-edit-btn {
      color: #a5b4fc;
    }

    .place-editor {
      .place-input {
        border-color: var(--color-border);
        background: var(--color-surface-hover);
        color: var(--color-text);
      }

      .place-apply {
        background: var(--color-text);
        color: #1a1a2e;
      }

      .place-cancel {
        background: rgba(255, 255, 255, 0.08);
        color: var(--color-text);
      }
    }

    .place-note {
      color: #fbbf24;
    }
  }

  .character-empty {
    color: var(--color-text-secondary);
  }

  .picker-sheet {
    h3 {
      color: var(--color-text);
    }

    p {
      color: var(--color-text-secondary);
    }
  }

  .detail-sheet .detail-actions .action-btn,
  .picker-btn {
    &.secondary {
      background: rgba(129, 140, 248, 0.15);
      color: #c7d2fe;
    }

    &.primary {
      background: var(--color-text);
      color: #1a1a2e;
    }
  }

  .character-item {
    border-color: var(--color-border);
    background: var(--color-surface-hover);

    .character-name {
      color: var(--color-text);
    }

    .character-avatar.fallback {
      background: rgba(129, 140, 248, 0.15);
      color: #c7d2fe;
    }
  }
}
</style>
