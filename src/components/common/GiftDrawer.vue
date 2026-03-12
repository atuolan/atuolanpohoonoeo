<template>
  <teleport to="body">
    <transition name="drawer">
      <div v-if="visible" class="gift-drawer-overlay" @click="handleClose">
        <div class="gift-drawer" @click.stop>
          <!-- 頭部 -->
          <div class="drawer-header">
            <h3>{{ tabTitles[activeTab] }}</h3>
            <button class="close-btn" @click="handleClose">
              <X :size="20" />
            </button>
          </div>

          <!-- 分頁標籤 -->
          <div class="tab-bar">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              class="tab-btn"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              <component :is="tab.icon" :size="18" />
              <span>{{ tab.label }}</span>
            </button>
          </div>

          <!-- 內容區 -->
          <div class="drawer-content">
            <!-- 錢包分頁 -->
            <div v-if="activeTab === 'wallet'" class="wallet-tab">
              <!-- 餘額卡片 -->
              <div class="balance-card">
                <div class="balance-label">當前餘額</div>
                <div class="balance-amount">
                  <Coins :size="24" />
                  <span>{{ balance.toLocaleString() }}</span>
                </div>
              </div>

              <!-- 商城入口 -->
              <button class="shop-entry-btn" @click="emit('openShop')">
                <ShoppingBag :size="20" />
                <span>前往商城</span>
                <ChevronRight :size="18" />
              </button>

              <!-- 交易記錄 -->
              <div class="section-header">
                <History :size="18" />
                <span>交易記錄</span>
              </div>
              <div class="transaction-list">
                <div
                  v-for="tx in transactions"
                  :key="tx.id"
                  class="transaction-item"
                  :class="tx.type"
                >
                  <div class="tx-icon">
                    <TrendingUp v-if="tx.type === 'income'" :size="16" />
                    <TrendingDown v-else :size="16" />
                  </div>
                  <div class="tx-info">
                    <div class="tx-desc">{{ tx.description }}</div>
                    <div class="tx-time">{{ formatTime(tx.timestamp) }}</div>
                  </div>
                  <div class="tx-amount" :class="tx.type">
                    {{ tx.type === "income" ? "+" : "-" }}{{ tx.amount }}
                  </div>
                </div>
                <div v-if="transactions.length === 0" class="empty-state">
                  <Receipt :size="32" />
                  <span>暫無交易記錄</span>
                </div>
              </div>
            </div>

            <!-- 轉帳分頁 -->
            <div v-if="activeTab === 'transfer'" class="transfer-tab">
              <div class="transfer-card">
                <div class="transfer-header">
                  <div class="avatar-placeholder">
                    <img
                      v-if="characterAvatar"
                      :src="characterAvatar"
                      alt="角色頭像"
                    />
                    <User v-else :size="32" />
                  </div>
                  <div class="transfer-to">
                    <span class="label">轉帳給</span>
                    <span class="name">{{ characterName }}</span>
                  </div>
                </div>

                <div class="amount-input-group">
                  <label>轉帳金額</label>
                  <div class="amount-input-wrapper">
                    <Coins :size="20" />
                    <input
                      v-model.number="transferAmount"
                      type="number"
                      min="1"
                      :max="balance"
                      placeholder="輸入金額"
                      class="amount-input"
                    />
                  </div>
                  <div class="balance-hint">
                    可用餘額：{{ balance.toLocaleString() }}
                  </div>
                </div>

                <!-- 快速金額按鈕 -->
                <div class="quick-amounts">
                  <button
                    v-for="amount in quickAmounts"
                    :key="amount"
                    class="quick-amount-btn"
                    :disabled="amount > balance"
                    @click="transferAmount = amount"
                  >
                    {{ amount }}
                  </button>
                </div>

                <!-- 備註輸入 -->
                <div class="note-input-group">
                  <label>備註（選填）</label>
                  <input
                    v-model="transferNote"
                    type="text"
                    placeholder="輸入備註..."
                    class="note-input"
                    maxlength="50"
                  />
                </div>

                <button
                  class="transfer-btn"
                  :disabled="!canTransfer"
                  @click="handleTransfer"
                >
                  <Send :size="18" />
                  <span>確認轉帳</span>
                </button>
              </div>
            </div>

            <!-- 禮物分頁 -->
            <div v-if="activeTab === 'gift'" class="gift-tab">
              <div v-if="ownedGifts.length > 0" class="gift-grid">
                <div
                  v-for="gift in ownedGifts"
                  :key="gift.id"
                  class="gift-item"
                  :class="{ selected: selectedGiftId === gift.id }"
                  @click="selectGift(gift.id)"
                >
                  <div class="gift-icon" :class="gift.rarity">
                    <Gift :size="28" />
                  </div>
                  <div class="gift-name">{{ gift.name }}</div>
                  <div class="gift-quantity">x{{ gift.quantity }}</div>
                </div>
              </div>
              <div v-else class="empty-state">
                <Gift :size="48" />
                <span>還沒有禮物</span>
                <button class="go-shop-btn" @click="emit('openShop')">
                  去商城購買
                </button>
              </div>

              <!-- 送禮按鈕 -->
              <div v-if="ownedGifts.length > 0" class="send-gift-section">
                <button
                  class="send-gift-btn"
                  :disabled="!selectedGiftId"
                  @click="handleSendGift"
                >
                  <Heart :size="18" />
                  <span>送出禮物</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { getShopItemById } from "@/data/shopItems";
import { useGameEconomyStore, type Transaction } from "@/stores/gameEconomy";
import {
    ChevronRight,
    Coins,
    Gift,
    Heart,
    History,
    Receipt,
    Send,
    ShoppingBag,
    TrendingDown,
    TrendingUp,
    User,
    Wallet,
    X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

type TabId = "wallet" | "transfer" | "gift";

interface OwnedGift {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  rarity: string;
}

const props = defineProps<{
  visible: boolean;
  chatId: string;
  characterName: string;
  characterAvatar?: string;
}>();

const emit = defineEmits<{
  close: [];
  openShop: [];
  transfer: [amount: number, note: string];
  sendGift: [giftItemId: string, giftName: string];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 分頁狀態
const activeTab = ref<TabId>("wallet");

// 分頁定義
const tabs = [
  { id: "wallet" as TabId, label: "錢包", icon: Wallet },
  { id: "transfer" as TabId, label: "轉帳", icon: Send },
  { id: "gift" as TabId, label: "禮物", icon: Gift },
];

const tabTitles: Record<TabId, string> = {
  wallet: "我的錢包",
  transfer: "轉帳",
  gift: "送禮物",
};

// 錢包數據
const balance = computed(() => {
  return gameEconomyStore.getBalance(GLOBAL_WALLET_ID);
});

const transactions = computed<Transaction[]>(() => {
  return gameEconomyStore.getTransactions(GLOBAL_WALLET_ID, 20);
});

// 轉帳數據
const transferAmount = ref<number | undefined>(undefined);
const transferNote = ref("");
const quickAmounts = [10, 50, 100, 500, 1000];

const canTransfer = computed(() => {
  return (
    transferAmount.value &&
    transferAmount.value > 0 &&
    transferAmount.value <= balance.value
  );
});

// 禮物數據
const selectedGiftId = ref<string | null>(null);

const ownedGifts = computed<OwnedGift[]>(() => {
  const inventory = gameEconomyStore.getInventory(GLOBAL_WALLET_ID);
  return inventory
    .filter((item) => item.type === "gift")
    .map((item) => {
      const shopItem = getShopItemById(item.itemId);
      return {
        id: item.id,
        itemId: item.itemId,
        name: item.name,
        quantity: item.quantity,
        rarity: shopItem?.rarity || "common",
      };
    });
});

// 方法
function handleClose() {
  emit("close");
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "剛剛";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;

  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}

async function handleTransfer() {
  if (!canTransfer.value || !transferAmount.value) return;

  const result = gameEconomyStore.transfer(
    GLOBAL_WALLET_ID,
    transferAmount.value,
  );
  if (result.success) {
    emit("transfer", transferAmount.value, transferNote.value);
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    transferAmount.value = undefined;
    transferNote.value = "";
    handleClose();
  }
}

function selectGift(giftId: string) {
  selectedGiftId.value = selectedGiftId.value === giftId ? null : giftId;
}

async function handleSendGift() {
  if (!selectedGiftId.value) return;

  const gift = ownedGifts.value.find((g) => g.id === selectedGiftId.value);
  if (!gift) return;

  const result = gameEconomyStore.sendGift(
    GLOBAL_WALLET_ID,
    selectedGiftId.value,
  );
  if (result.success) {
    emit("sendGift", gift.itemId, gift.name);
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    selectedGiftId.value = null;
    handleClose();
  }
}

// 載入遊戲狀態
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
    }
  },
  { immediate: true },
);
</script>

<style scoped lang="scss">
.gift-drawer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.gift-drawer {
  background: white;
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease-out;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: #1f2937;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:active {
      transform: scale(0.95);
      background: #e5e7eb;
    }
  }
}

.tab-bar {
  display: flex;
  padding: 8px 16px;
  gap: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  border: none;
  background: #f5f5f5;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.2s;

  &.active {
    background: #7dd3a8;
    color: white;
  }

  &:active {
    transform: scale(0.98);
  }
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

// ===== 錢包分頁樣式 =====
.wallet-tab {
  .balance-card {
    background: linear-gradient(135deg, #7dd3a8 0%, #5cb88a 100%);
    border-radius: 16px;
    padding: 20px;
    margin-bottom: 16px;
    color: white;

    .balance-label {
      font-size: 13px;
      opacity: 0.9;
      margin-bottom: 8px;
    }

    .balance-amount {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 28px;
      font-weight: 700;
    }
  }

  .shop-entry-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 14px 16px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    margin-bottom: 20px;
    transition: all 0.2s;

    span {
      flex: 1;
      text-align: left;
    }

    &:active {
      background: #f3f4f6;
    }
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 12px;
  }

  .transaction-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .transaction-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 10px;

    .tx-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    &.income .tx-icon {
      background: #dcfce7;
      color: #16a34a;
    }

    &.expense .tx-icon {
      background: #fee2e2;
      color: #dc2626;
    }

    .tx-info {
      flex: 1;
      min-width: 0;

      .tx-desc {
        font-size: 14px;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tx-time {
        font-size: 12px;
        color: #9ca3af;
        margin-top: 2px;
      }
    }

    .tx-amount {
      font-size: 15px;
      font-weight: 600;

      &.income {
        color: #16a34a;
      }

      &.expense {
        color: #dc2626;
      }
    }
  }
}

// ===== 轉帳分頁樣式 =====
.transfer-tab {
  .transfer-card {
    background: #f9fafb;
    border-radius: 16px;
    padding: 20px;
  }

  .transfer-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;

    .avatar-placeholder {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #9ca3af;
      overflow: hidden;

      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }

    .transfer-to {
      display: flex;
      flex-direction: column;

      .label {
        font-size: 12px;
        color: #9ca3af;
      }

      .name {
        font-size: 16px;
        font-weight: 600;
        color: #1f2937;
      }
    }
  }

  .amount-input-group {
    margin-bottom: 16px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
      margin-bottom: 8px;
    }

    .amount-input-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 12px 14px;
      transition: border-color 0.2s;

      &:focus-within {
        border-color: #7dd3a8;
      }

      .amount-input {
        flex: 1;
        border: none;
        background: none;
        font-size: 18px;
        font-weight: 600;
        color: #1f2937;
        outline: none;

        &::placeholder {
          color: #d1d5db;
          font-weight: 400;
        }
      }
    }

    .balance-hint {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 6px;
    }
  }

  .quick-amounts {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .quick-amount-btn {
    padding: 8px 16px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;

    &:active:not(:disabled) {
      background: #7dd3a8;
      border-color: #7dd3a8;
      color: white;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .note-input-group {
    margin-bottom: 16px;

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #6b7280;
      margin-bottom: 8px;
    }

    .note-input {
      width: 100%;
      padding: 10px 14px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      font-size: 14px;
      color: #1f2937;
      outline: none;
      transition: border-color 0.2s;
      box-sizing: border-box;

      &:focus {
        border-color: #7dd3a8;
      }

      &::placeholder {
        color: #d1d5db;
      }
    }
  }

  .transfer-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: #7dd3a8;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.2s;

    &:active:not(:disabled) {
      opacity: 0.9;
      transform: scale(0.98);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// ===== 禮物分頁樣式 =====
.gift-tab {
  .gift-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }

  .gift-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 14px 8px;
    background: #f9fafb;
    border: 2px solid transparent;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;

    &.selected {
      border-color: #7dd3a8;
      background: #f0fdf4;
    }

    &:active {
      transform: scale(0.98);
    }

    .gift-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      color: white;

      &.common {
        background: #9ca3af;
      }

      &.uncommon {
        background: #22c55e;
      }

      &.rare {
        background: #3b82f6;
      }

      &.epic {
        background: #a855f7;
      }

      &.legendary {
        background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
      }
    }

    .gift-name {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      text-align: center;
    }

    .gift-quantity {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 2px;
    }
  }

  .send-gift-section {
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .send-gift-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: #f472b6;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    color: white;
    cursor: pointer;
    transition: all 0.2s;

    &:active:not(:disabled) {
      opacity: 0.9;
      transform: scale(0.98);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

// ===== 空狀態 =====
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: #9ca3af;
  gap: 12px;

  span {
    font-size: 14px;
  }

  .go-shop-btn {
    margin-top: 8px;
    padding: 10px 20px;
    background: #7dd3a8;
    border: none;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all 0.2s;

    &:active {
      opacity: 0.9;
    }
  }
}

// ===== 動畫 =====
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.25s;

  .gift-drawer {
    transition: transform 0.25s ease-out;
  }
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;

  .gift-drawer {
    transform: translateY(100%);
  }
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
