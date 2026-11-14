<script setup lang="ts">
/**
 * 商店：原本的「購物」和「外賣」合成一個地方。
 * 上面先選「外送・禮物」或「裝扮・道具」，再選哪一頁；哪一樣放哪一區見 storeTabs.ts。
 * 小屋的擺件、家具款式、衣服不在這裡，在小屋裡買。
 */
import GiftCabinet from "@/components/gift/GiftCabinet.vue";
import DeliveryMallPanel from "@/components/shop/DeliveryMallPanel.vue";
import type { DeliveryMallSendToChatPayload } from "@/components/shop/DeliveryMallPanel.vue";
import ShopItemsPanel from "@/components/shop/ShopItemsPanel.vue";
import type { ShopPanelCategory } from "@/components/shop/ShopItemsPanel.vue";
import {
  STORE_GROUPS,
  getStoreTab,
  isDeliveryTab,
  loadLastStoreTab,
  resolveInitialStoreTab,
  saveLastStoreTab,
  storeTabsInGroup,
  takeNextStoreTab,
  type StoreGroupId,
  type StoreTabId,
} from "@/components/shop/storeTabs";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
  Archive,
  ArrowLeft,
  Coins,
  Fish,
  Flame,
  Frame,
  Gift,
  HeartHandshake,
  Package,
  Palette,
  ShoppingBasket,
  UtensilsCrossed,
} from "lucide-vue-next";
import type { Component } from "vue";
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { formatCoins } from "@/utils/coins";

const props = defineProps<{
  /** 從哪個入口進來就先停在哪一頁（例如外賣 → 美食廣場）；沒給就回到上次停的那頁 */
  entryTab?: StoreTabId | null;
}>();

const emit = defineEmits<{
  back: [];
  tryOnChatSkin: [pieceId: string];
  sendToChat: [payload: DeliveryMallSendToChatPayload];
}>();

const WALLET_ID = "global";

const TAB_ICONS: Record<StoreTabId, Component> = {
  food: UtensilsCrossed,
  kind: ShoppingBasket,
  spicy: Flame,
  gift: Gift,
  care: HeartHandshake,
  cabinet: Archive,
  chatskin: Palette,
  frame: Frame,
  rod: Fish,
  consumable: Package,
};

const gameEconomyStore = useGameEconomyStore();
const balance = computed(() => gameEconomyStore.getBalance(WALLET_ID));

const tab = ref<StoreTabId>(
  resolveInitialStoreTab({
    requested: takeNextStoreTab(),
    entry: props.entryTab,
    last: loadLastStoreTab(),
  }),
);
const group = computed(() => getStoreTab(tab.value).group);
const groupTabs = computed(() => storeTabsInGroup(group.value));
const caption = computed(() => getStoreTab(tab.value).caption);

// 切到另一區時回到那一區上次看的那頁
const lastTabInGroup = reactive<Record<StoreGroupId, StoreTabId>>({
  goods: "food",
  style: "chatskin",
});

const deliverySection = computed(() =>
  isDeliveryTab(tab.value) ? tab.value : null,
);
const shopCategory = computed<ShopPanelCategory | null>(() =>
  isDeliveryTab(tab.value) || tab.value === "cabinet" ? null : tab.value,
);

const chipRow = ref<HTMLElement | null>(null);

function selectTab(id: StoreTabId) {
  tab.value = id;
}

function selectGroup(id: StoreGroupId) {
  if (id === group.value) return;
  tab.value = lastTabInGroup[id];
}

/** 選到的分頁在橫向捲動的標籤列外面時，捲進來 */
function revealActiveChip() {
  const row = chipRow.value;
  const chip = row?.querySelector<HTMLElement>(".tab-chip.active");
  if (!row || !chip) return;
  // .tab-chips 是 position: relative，offsetLeft 就是相對標籤列
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < row.scrollLeft) {
    row.scrollLeft = Math.max(0, left - 16);
  } else if (right > row.scrollLeft + row.clientWidth) {
    row.scrollLeft = right - row.clientWidth + 16;
  }
}

watch(
  tab,
  (id) => {
    lastTabInGroup[getStoreTab(id).group] = id;
    saveLastStoreTab(id);
    void nextTick(revealActiveChip);
  },
  { immediate: true },
);

onMounted(() => {
  void gameEconomyStore.loadState(WALLET_ID);
  revealActiveChip();
});
</script>

<template>
  <div class="store-screen">
    <header class="store-header">
      <button class="back-btn" aria-label="返回" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <h1>商店</h1>
      <div class="balance-chip">
        <Coins :size="15" />
        <span>{{ formatCoins(balance) }}</span>
      </div>
    </header>

    <nav class="store-nav">
      <div class="group-switch" role="tablist">
        <button
          v-for="g in STORE_GROUPS"
          :key="g.id"
          role="tab"
          class="group-btn"
          :class="{ active: group === g.id }"
          :aria-selected="group === g.id"
          @click="selectGroup(g.id)"
        >
          {{ g.label }}
        </button>
      </div>
      <div ref="chipRow" class="tab-chips">
        <button
          v-for="t in groupTabs"
          :key="t.id"
          class="tab-chip"
          :class="{ active: tab === t.id }"
          @click="selectTab(t.id)"
        >
          <component :is="TAB_ICONS[t.id]" :size="15" />
          <span>{{ t.label }}</span>
        </button>
      </div>
      <p class="tab-caption">{{ caption }}</p>
    </nav>

    <DeliveryMallPanel
      v-if="deliverySection"
      :section="deliverySection"
      @send-to-chat="emit('sendToChat', $event)"
    >
      <p class="store-footnote">小屋的擺件、家具款式和衣服，在小屋裡買</p>
    </DeliveryMallPanel>
    <ShopItemsPanel
      v-else-if="shopCategory"
      :category="shopCategory"
      @try-on-chat-skin="emit('tryOnChatSkin', $event)"
    >
      <p class="store-footnote">小屋的擺件、家具款式和衣服，在小屋裡買</p>
    </ShopItemsPanel>
    <GiftCabinet v-else />
  </div>
</template>

<style lang="scss" scoped>
.store-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #f8f9fa);
}

.store-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);

  .back-btn {
    display: flex;
    border: none;
    background: none;
    padding: 8px;
    margin-left: -8px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--color-text, #333);

    &:active {
      background: var(--color-surface-hover, #f0f0f0);
    }
  }

  h1 {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text, #333);
  }
}

.balance-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.store-nav {
  padding: 0 16px 10px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);
}

.group-switch {
  display: flex;
  padding: 3px;
  border-radius: 12px;
  background: var(--color-surface-hover, #f0f0f0);
}

.group-btn {
  flex: 1;
  padding: 8px 10px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;

  &.active {
    background: var(--color-surface, #fff);
    color: var(--color-text, #333);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
}

.tab-chips {
  position: relative;
  display: flex;
  gap: 8px;
  margin: 10px -16px 0;
  padding: 0 16px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab-chip {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: none;
  border-radius: 999px;
  background: var(--color-surface-hover, #f3f4f6);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #6b7280);
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 0.2s,
    color 0.2s;

  &.active {
    background: var(--color-primary, #7dd3a8);
    color: var(--color-on-primary-contrast, #fff);
  }

  &:active {
    transform: scale(0.97);
  }
}

.tab-caption {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-secondary, #888);
}

.store-footnote {
  margin: 20px 0 4px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary, #999);
}

// body.is-night-mode 由 theme store 同步切換，保持巢狀讓 scoped 附在內層元素上。
body.is-night-mode {
  .balance-chip {
    background: rgba(255, 183, 77, 0.15);
    color: #ffb74d;
  }

  .group-btn.active {
    background: rgba(255, 255, 255, 0.14);
    color: var(--color-text);
    box-shadow: none;
  }
}
</style>
