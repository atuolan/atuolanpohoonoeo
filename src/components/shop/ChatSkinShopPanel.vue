<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ArrowLeft, Check, Sparkles } from "lucide-vue-next";
import { db, DB_STORES } from "@/db/database";
import type { Chat } from "@/types/chat";
import {
  CHAT_SKIN_SERIES,
  CHAT_SKIN_SLOT_LABELS,
  computeBundlePrice,
  getChatSkinSeries,
  getSeriesPieces,
  type ChatSkinPiece,
} from "@/data/chatSkins";
import { useGameEconomyStore } from "@/stores/gameEconomy";

const emit = defineEmits<{
  (e: "tryOn", pieceId: string): void;
}>();

const gameEconomyStore = useGameEconomyStore();

const selectedSeriesId = ref<string | null>(null);
const previewNight = ref(false);
const hasChatForTryOn = ref(true);

onMounted(async () => {
  await db.init();
  const chats = await db.getAll<Chat>(DB_STORES.CHATS);
  hasChatForTryOn.value = chats.some((c) => !c.archivedAt);
});

const loadout = computed(() => gameEconomyStore.getChatSkinLoadout("global"));

const currentSeries = computed(() => getChatSkinSeries(selectedSeriesId.value));
const currentPieces = computed(() =>
  selectedSeriesId.value ? getSeriesPieces(selectedSeriesId.value) : []
);
const bundleQuote = computed(() => {
  if (!selectedSeriesId.value) return null;
  return computeBundlePrice(selectedSeriesId.value, loadout.value.owned);
});

function getOwnedCount(seriesId: string): number {
  const pieces = getSeriesPieces(seriesId);
  const ownedSet = new Set(loadout.value.owned);
  return pieces.filter((p) => ownedSet.has(p.id)).length;
}

function selectSeries(id: string) {
  selectedSeriesId.value = id;
  previewNight.value = false;
}

function backToList() {
  selectedSeriesId.value = null;
}

async function handlePurchasePiece(piece: ChatSkinPiece) {
  if (
    !confirm(
      `用 ${piece.price.toLocaleString()} 買下 ${piece.name}？`
    )
  ) {
    return;
  }
  const result = gameEconomyStore.purchaseChatSkinPiece("global", piece.id);
  if (!result.success) {
    if (result.error === "insufficient_funds") {
      alert("金幣不夠");
    }
    return;
  }
  await gameEconomyStore.saveState("global");
  if (confirm("買好了！要現在裝上嗎？")) {
    gameEconomyStore.equipChatSkin("global", piece.slot, piece.id);
    await gameEconomyStore.saveState("global");
  }
}

async function handlePurchaseBundle() {
  if (!selectedSeriesId.value || !bundleQuote.value) return;
  const series = currentSeries.value;
  if (!series) return;
  if (
    !confirm(
      `用 ${bundleQuote.value.price.toLocaleString()} 買下「${series.name}」組合包？`
    )
  ) {
    return;
  }
  const result = gameEconomyStore.purchaseChatSkinBundle("global", series.id);
  if (!result.success) {
    if (result.error === "insufficient_funds") {
      alert("金幣不夠");
    }
    return;
  }
  await gameEconomyStore.saveState("global");
  if (confirm("買好了！要現在裝上嗎？")) {
    const pieces = currentPieces.value;
    for (const piece of pieces) {
      gameEconomyStore.equipChatSkin("global", piece.slot, piece.id);
    }
    await gameEconomyStore.saveState("global");
  }
}

async function handleEquip(piece: ChatSkinPiece) {
  gameEconomyStore.equipChatSkin("global", piece.slot, piece.id);
  await gameEconomyStore.saveState("global");
}

function handleTryOn(piece: ChatSkinPiece) {
  if (!hasChatForTryOn.value) return;
  emit("tryOn", piece.id);
}
</script>

<template>
  <div class="chat-skin-shop">
    <!-- 系列卡片列表 -->
    <div v-if="!selectedSeriesId" class="series-list">
      <div
        v-for="series in CHAT_SKIN_SERIES"
        :key="series.id"
        class="series-card"
        @click="selectSeries(series.id)"
      >
        <div class="series-preview-box">
          <img
            :src="series.previewImage.day"
            :alt="series.name"
            class="series-preview-img"
          />
        </div>
        <div class="series-info">
          <div class="series-name">{{ series.name }}</div>
          <div class="series-desc">{{ series.description }}</div>
          <div class="series-progress">
            已擁有 {{ getOwnedCount(series.id) }}／{{ series.pieceIds.length }}
          </div>
        </div>
      </div>
    </div>

    <!-- 系列詳情頁 -->
    <div v-else-if="currentSeries" class="series-detail">
      <button class="back-link" @click="backToList">
        <ArrowLeft :size="16" />
        <span>聊天裝扮</span>
      </button>

      <!-- 大預覽圖＋日夜切換 -->
      <div class="preview-hero">
        <div class="preview-hero-frame">
          <img
            :src="previewNight ? currentSeries.previewImage.night : currentSeries.previewImage.day"
            :alt="currentSeries.name"
            class="preview-hero-img"
          />
        </div>
        <div class="mode-toggles">
          <button
            type="button"
            class="mode-btn"
            :class="{ active: !previewNight }"
            @click="previewNight = false"
          >
            白天
          </button>
          <button
            type="button"
            class="mode-btn"
            :class="{ active: previewNight }"
            @click="previewNight = true"
          >
            夜間
          </button>
        </div>
      </div>

      <!-- 名稱與介紹 -->
      <div class="series-header">
        <h2 class="detail-title">{{ currentSeries.name }}</h2>
        <p class="detail-desc">{{ currentSeries.description }}</p>
      </div>

      <!-- 組合包區塊 -->
      <div v-if="bundleQuote" class="bundle-box">
        <div class="bundle-content-line">
          包含：{{
            bundleQuote.pieceIds
              .map((id) => {
                const p = currentPieces.find((item) => item.id === id);
                return p ? CHAT_SKIN_SLOT_LABELS[p.slot] : "";
              })
              .filter(Boolean)
              .join("、")
          }}
        </div>
        <div class="bundle-pricing">
          <span class="original-price">{{ bundleQuote.originalPrice.toLocaleString() }}</span>
          <span class="bundle-price">{{ bundleQuote.price.toLocaleString() }} 金幣</span>
        </div>
        <button class="buy-bundle-btn" @click="handlePurchaseBundle">
          <Sparkles :size="16" />
          購買組合包
        </button>
      </div>

      <!-- 部件清單 -->
      <div class="pieces-list">
        <div
          v-for="piece in currentPieces"
          :key="piece.id"
          class="piece-row"
        >
          <div class="piece-thumb" :class="'slot-' + piece.slot">
            <img
              :src="previewNight ? piece.previewImage.night : piece.previewImage.day"
              :alt="piece.name"
            />
          </div>
          <div class="piece-info">
            <div class="piece-slot-badge">{{ CHAT_SKIN_SLOT_LABELS[piece.slot] }}</div>
            <div class="piece-name">{{ piece.name }}</div>
            <div class="piece-price">{{ piece.price.toLocaleString() }} 金幣</div>
            <div
              v-if="!loadout.owned.includes(piece.id) && !hasChatForTryOn"
              class="try-on-hint"
            >
              先開一個聊天才能試穿
            </div>
          </div>
          <div class="piece-actions">
            <!-- 沒擁有 -->
            <template v-if="!loadout.owned.includes(piece.id)">
              <button
                class="action-btn try-on-btn"
                :disabled="!hasChatForTryOn"
                @click="handleTryOn(piece)"
              >
                試穿
              </button>
              <button class="action-btn buy-btn" @click="handlePurchasePiece(piece)">
                購買
              </button>
            </template>
            <!-- 已擁有，但全域未裝 -->
            <button
              v-else-if="loadout.equipped[piece.slot] !== piece.id"
              class="action-btn equip-btn"
              @click="handleEquip(piece)"
            >
              裝上
            </button>
            <!-- 已擁有且使用中 -->
            <div v-else class="status-badge in-use">
              <Check :size="14" />
              使用中
            </div>
          </div>
        </div>

        <!-- 即將推出 -->
        <div
          v-for="slotName in currentSeries.upcomingSlots"
          :key="slotName"
          class="piece-row upcoming-row"
        >
          <div class="upcoming-content">
            <span class="upcoming-name">{{ slotName }}</span>
            <span class="upcoming-badge">即將推出</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-skin-shop {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
}

/* 系列列表 */
.series-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.series-card {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.series-card:active {
  transform: scale(0.98);
}

.series-preview-box {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: rgba(0, 0, 0, 0.04);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.series-preview-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

.series-info {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.series-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #111111);
}

.series-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #666666);
  line-height: 1.4;
}

.series-progress {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-primary, #4caf50);
  font-weight: 500;
}

/* 系列詳情頁 */
.series-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.back-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: none;
  background: transparent;
  color: var(--color-primary, #4caf50);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  padding: 4px 0;
}

.preview-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.preview-hero-frame {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border, #e0e0e0);
}

.preview-hero-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

.mode-toggles {
  display: inline-flex;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 20px;
  padding: 2px;
  gap: 2px;
}

.mode-btn {
  border: none;
  background: transparent;
  padding: 4px 12px;
  font-size: 12px;
  border-radius: 16px;
  color: var(--color-text-secondary, #666666);
  cursor: pointer;
}

.mode-btn.active {
  background: var(--color-primary, #4caf50);
  color: var(--color-on-primary-contrast, #ffffff);
  font-weight: 600;
}

.series-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: var(--color-text, #111111);
}

.detail-desc {
  font-size: 13px;
  color: var(--color-text-secondary, #666666);
  line-height: 1.4;
  margin: 0;
}

/* 組合包 */
.bundle-box {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-primary, #4caf50);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.bundle-content-line {
  font-size: 13px;
  color: var(--color-text, #111111);
}

.bundle-pricing {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.original-price {
  font-size: 13px;
  color: var(--color-text-secondary, #888888);
  text-decoration: line-through;
}

.bundle-price {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-primary, #4caf50);
}

.buy-bundle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--color-primary, #4caf50);
  color: var(--color-on-primary-contrast, #ffffff);
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.buy-bundle-btn:active {
  opacity: 0.9;
}

/* 部件清單 */
.pieces-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.piece-row {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.piece-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  border: 1px solid var(--color-border, #e0e0e0);
}

.piece-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

/* 輸入區縮圖：中間只有空白輸入框，改露出右邊的按鈕 */
.piece-thumb.slot-input img {
  object-position: right center;
}

.piece-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.piece-slot-badge {
  font-size: 11px;
  color: var(--color-text-secondary, #888888);
}

.piece-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #111111);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.piece-price {
  font-size: 12px;
  color: var(--color-primary, #4caf50);
  font-weight: 500;
}

.try-on-hint {
  font-size: 10px;
  color: var(--color-text-secondary, #999999);
}

.piece-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-btn {
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.try-on-btn {
  background: rgba(0, 0, 0, 0.06);
  color: var(--color-text, #111111);
}

.try-on-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.buy-btn,
.equip-btn {
  background: var(--color-primary, #4caf50);
  color: var(--color-on-primary-contrast, #ffffff);
}

.action-btn:active:not(:disabled) {
  opacity: 0.85;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-secondary, #888888);
  padding: 6px 8px;
}

/* 即將推出 */
.upcoming-row {
  opacity: 0.65;
  background: rgba(0, 0, 0, 0.02);
  border-style: dashed;
}

.upcoming-content {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 6px;
}

.upcoming-name {
  font-size: 13px;
  color: var(--color-text-secondary, #666666);
}

.upcoming-badge {
  font-size: 11px;
  color: var(--color-text-secondary, #888888);
}

/* 夜晚模式相容 */
body.is-night-mode .series-card {
  background: var(--color-surface, #1e1e1e);
  border-color: var(--color-border, #333333);
}

body.is-night-mode .series-name,
body.is-night-mode .detail-title,
body.is-night-mode .piece-name,
body.is-night-mode .bundle-content-line {
  color: var(--color-text, #e0e0e0);
}

body.is-night-mode .mode-toggles {
  background: var(--color-surface, #242424);
  border-color: var(--color-border, #333333);
}

body.is-night-mode .preview-hero-frame,
body.is-night-mode .piece-row {
  background: var(--color-surface, #1e1e1e);
  border-color: var(--color-border, #333333);
}

body.is-night-mode .bundle-box {
  background: var(--color-surface, #1e1e1e);
}

body.is-night-mode .try-on-btn {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text, #e0e0e0);
}

body.is-night-mode .upcoming-row {
  background: rgba(255, 255, 255, 0.02);
}
</style>
