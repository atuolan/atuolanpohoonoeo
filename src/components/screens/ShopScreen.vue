<script setup lang="ts">
/**
 * 商城介面
 *
 * 顯示所有可購買商品，支援分類瀏覽和購買功能
 *
 * @requirements 5.1, 5.2, 10.3
 */
import PixelRod from "@/components/common/PixelRod.vue";
import {
    getAvatarFrameLayers,
    getAvatarFrameSvg,
    getLayerSrc,
    isAvatarFrameImage,
    isAvatarFrameSvg,
} from "@/data/avatarFrames";
import {
    BUBBLE_ITEMS,
    CONSUMABLE_ITEMS,
    FRAME_ITEMS,
    GIFT_ITEMS,
    ROD_ITEMS,
    type ShopCategory,
    type ShopItem,
    type ShopItemVariant,
} from "@/data/shopItems";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
    ArrowLeft,
    Cake,
    Check,
    Coffee,
    Coins,
    Diamond,
    Fish,
    Flower2,
    Frame,
    Gem,
    Gift,
    Heart,
    MessageCircle,
    Package,
    ShoppingBag,
    Sparkles,
    Star,
    X,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{
  back: [];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();

// 使用全局 ID 作為錢包標識
const GLOBAL_WALLET_ID = "global";

// 分類定義
interface CategoryTab {
  id: ShopCategory;
  label: string;
  icon: typeof Frame;
  items: ShopItem[];
}

const categories: CategoryTab[] = [
  { id: "frame", label: "頭像框", icon: Frame, items: FRAME_ITEMS },
  { id: "bubble", label: "氣泡", icon: MessageCircle, items: BUBBLE_ITEMS },
  { id: "rod", label: "魚竿", icon: Fish, items: ROD_ITEMS },
  { id: "gift", label: "禮物", icon: Gift, items: GIFT_ITEMS },
  { id: "consumable", label: "道具", icon: Package, items: CONSUMABLE_ITEMS },
];

// 當前選擇的分類
const activeCategory = ref<ShopCategory>("frame");

// 當前分類的商品
const currentItems = computed(() => {
  const category = categories.find((c) => c.id === activeCategory.value);
  return category?.items || [];
});

// 錢包餘額
const balance = computed(() => {
  return gameEconomyStore.getBalance(GLOBAL_WALLET_ID);
});

// 已擁有的裝飾品
const ownedDecorations = computed(() => {
  const decorations = gameEconomyStore.getDecorations(GLOBAL_WALLET_ID);
  return {
    frames: decorations?.ownedFrames || [],
    bubbles: decorations?.ownedBubbles || [],
  };
});

// 購買確認彈窗
const showPurchaseModal = ref(false);
const selectedItem = ref<ShopItem | null>(null);
const selectedVariant = ref<ShopItemVariant | null>(null);
const purchaseQuantity = ref(1);
const purchaseResult = ref<{
  success: boolean;
  message: string;
} | null>(null);

// 當前預覽的 frame ID（根據選擇的變體動態變化）
const previewFrameId = computed(() => {
  if (!selectedItem.value) return null;
  if (selectedItem.value.category !== "frame") return selectedItem.value.id;

  // 如果有變體且已選擇，使用變體 ID
  if (selectedVariant.value) {
    return `${selectedItem.value.id}_${selectedVariant.value.variantId}`;
  }

  // 如果有變體但未選擇，顯示第一個變體
  if (selectedItem.value.variants && selectedItem.value.variants.length > 0) {
    return `${selectedItem.value.id}_${selectedItem.value.variants[0].variantId}`;
  }

  return selectedItem.value.id;
});

// 檢查是否已擁有（僅限裝飾品）
function isOwned(item: ShopItem, variant?: ShopItemVariant | null): boolean {
  if (item.category === "frame") {
    // 如果有變體，檢查變體 ID
    if (variant) {
      const variantFrameId = `${item.id}_${variant.variantId}`;
      return ownedDecorations.value.frames.includes(variantFrameId);
    }
    // 如果商品有變體但沒選擇，檢查是否擁有任一變體
    if (item.variants && item.variants.length > 0) {
      return item.variants.some((v) =>
        ownedDecorations.value.frames.includes(`${item.id}_${v.variantId}`),
      );
    }
    return ownedDecorations.value.frames.includes(item.id);
  }
  if (item.category === "bubble") {
    return ownedDecorations.value.bubbles.includes(item.id);
  }
  return false;
}

// 檢查特定變體是否已擁有
function isVariantOwned(item: ShopItem, variant: ShopItemVariant): boolean {
  const variantFrameId = `${item.id}_${variant.variantId}`;
  return ownedDecorations.value.frames.includes(variantFrameId);
}

// 取得變體商品的擁有狀態
function getVariantOwnedStatus(item: ShopItem): "none" | "partial" | "all" {
  if (!item.variants || item.variants.length === 0) return "none";
  const ownedCount = item.variants.filter((v) =>
    isVariantOwned(item, v),
  ).length;
  if (ownedCount === 0) return "none";
  if (ownedCount === item.variants.length) return "all";
  return "partial";
}

// 檢查是否可購買
function canPurchase(
  item: ShopItem,
  variant?: ShopItemVariant | null,
): boolean {
  // 有變體的商品，需要選擇變體後才能判斷
  if (item.variants && item.variants.length > 0) {
    if (!variant) {
      // 還沒選變體，先檢查餘額
      return balance.value >= item.price;
    }
    // 檢查該變體是否已擁有
    if (isVariantOwned(item, variant)) {
      return false;
    }
  } else {
    // 無變體的裝飾品不可重複購買
    if (
      (item.category === "frame" || item.category === "bubble") &&
      isOwned(item)
    ) {
      return false;
    }
  }
  // 餘額檢查
  return balance.value >= item.price;
}

// 取得購買按鈕文字
function getPurchaseButtonText(item: ShopItem): string {
  // 有變體的商品顯示「選擇樣式」
  if (item.variants && item.variants.length > 0) {
    // 檢查是否所有變體都已擁有
    const allOwned = item.variants.every((v) => isVariantOwned(item, v));
    if (allOwned) return "已全部擁有";
    if (balance.value < item.price) return "餘額不足";
    return "選擇樣式";
  }
  if (isOwned(item)) return "已擁有";
  if (balance.value < item.price) return "餘額不足";
  return "購買";
}

// 打開購買確認
function openPurchaseModal(item: ShopItem) {
  // 有變體的商品，檢查是否所有變體都已擁有
  if (item.variants && item.variants.length > 0) {
    const allOwned = item.variants.every((v) => isVariantOwned(item, v));
    if (allOwned) return;
  } else {
    // 無變體的裝飾品，已擁有則不能打開
    if (
      (item.category === "frame" || item.category === "bubble") &&
      isOwned(item)
    ) {
      return;
    }
  }
  selectedItem.value = item;
  selectedVariant.value = null;
  purchaseQuantity.value = 1;
  purchaseResult.value = null;
  showPurchaseModal.value = true;
}

// 選擇變體
function selectVariant(variant: ShopItemVariant) {
  if (!selectedItem.value) return;
  if (isVariantOwned(selectedItem.value, variant)) return;
  selectedVariant.value = variant;
}

// 關閉購買確認
function closePurchaseModal() {
  showPurchaseModal.value = false;
  selectedItem.value = null;
  selectedVariant.value = null;
  purchaseQuantity.value = 1;
  purchaseResult.value = null;
}

// 計算總價
const totalPrice = computed(() => {
  if (!selectedItem.value) return 0;
  return selectedItem.value.price * purchaseQuantity.value;
});

// 最大可購買數量
const maxPurchaseQuantity = computed(() => {
  if (!selectedItem.value) return 1;
  return Math.floor(balance.value / selectedItem.value.price);
});

// 調整購買數量
function adjustQuantity(delta: number) {
  const newQty = purchaseQuantity.value + delta;
  if (newQty >= 1 && newQty <= maxPurchaseQuantity.value) {
    purchaseQuantity.value = newQty;
  }
}

// 確認購買
async function confirmPurchase() {
  if (!selectedItem.value) return;

  // 有變體的商品必須選擇變體
  if (selectedItem.value.variants && selectedItem.value.variants.length > 0) {
    if (!selectedVariant.value) {
      purchaseResult.value = {
        success: false,
        message: "請先選擇樣式",
      };
      return;
    }
  }

  // 計算實際購買的 ID（變體商品使用 itemId_variantId 格式）
  const purchaseId = selectedVariant.value
    ? `${selectedItem.value.id}_${selectedVariant.value.variantId}`
    : selectedItem.value.id;

  const result = gameEconomyStore.purchaseItem(
    GLOBAL_WALLET_ID,
    purchaseId,
    selectedItem.value.category === "rod" ? purchaseQuantity.value : 1,
  );

  if (result.success) {
    const itemName = selectedVariant.value
      ? `${selectedItem.value.name} - ${selectedVariant.value.name}`
      : selectedItem.value.name;
    const quantityText =
      selectedItem.value.category === "rod" && purchaseQuantity.value > 1
        ? ` x${purchaseQuantity.value}`
        : "";
    purchaseResult.value = {
      success: true,
      message: `成功購買 ${itemName}${quantityText}！`,
    };
    // 保存狀態
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    // 延遲關閉
    setTimeout(() => {
      closePurchaseModal();
    }, 1500);
  } else {
    const errorMessages: Record<string, string> = {
      insufficient_funds: "餘額不足",
      item_not_found: "商品不存在",
      already_owned: "已擁有此商品",
      invalid_item: "無效的商品",
    };
    purchaseResult.value = {
      success: false,
      message: errorMessages[result.error || ""] || "購買失敗",
    };
  }
}

// 取得稀有度顏色類名
function getRarityClass(rarity: string): string {
  return `rarity-${rarity}`;
}

// 取得稀有度標籤
function getRarityLabel(rarity: string): string {
  const labels: Record<string, string> = {
    common: "普通",
    uncommon: "優良",
    rare: "稀有",
    epic: "史詩",
    legendary: "傳說",
  };
  return labels[rarity] || rarity;
}

// 取得禮物圖標
function getGiftIcon(itemId: string) {
  const iconMap: Record<string, typeof Gift> = {
    // Common
    gift_flower: Flower2,
    gift_chocolate: Cake,
    gift_cake: Cake,
    gift_cola: Coffee,
    gift_mug_simple: Coffee,
    gift_plush_bear: Heart,
    // Uncommon
    gift_lotion: Sparkles,
    gift_toner: Sparkles,
    gift_mug_cat: Coffee,
    gift_plush_bunny: Heart,
    gift_charm_star: Star,
    gift_earring_pearl: Sparkles,
    gift_crystal_clear: Gem,
    // Rare
    gift_necklace_silver: Sparkles,
    gift_ring_silver: Sparkles,
    gift_crystal_rose: Gem,
    gift_crystal_amethyst: Gem,
    gift_crystal_citrine: Gem,
    gift_earring_crystal: Sparkles,
    gift_plush_giant: Heart,
    gift_charm_moon: Star,
    gift_skincare_set: Gift,
    // Epic
    gift_necklace_gold: Sparkles,
    gift_ring_gold: Sparkles,
    gift_crystal_obsidian: Gem,
    gift_crystal_moonstone: Gem,
    gift_crystal_labradorite: Gem,
    gift_crystal_aquamarine: Gem,
    gift_earring_diamond: Diamond,
    gift_charm_custom: Star,
    gift_limited_box: Gift,
    // Legendary
    gift_diamond: Diamond,
    gift_necklace_custom: Sparkles,
    gift_crystal_ruby: Gem,
    gift_crystal_sapphire: Gem,
    gift_crystal_emerald: Gem,
    gift_ring_diamond: Diamond,
    gift_charm_diamond: Diamond,
    gift_crystal_alexandrite: Gem,
  };
  return iconMap[itemId] || Gift;
}

// 載入遊戲狀態
onMounted(async () => {
  await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
});
</script>

<template>
  <div class="shop-screen">
    <!-- 頂部導航 -->
    <header class="screen-header">
      <button class="back-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <h1>
        <ShoppingBag :size="20" />
        商城
      </h1>
      <div class="balance-display">
        <Coins :size="16" />
        <span>{{ balance.toLocaleString() }}</span>
      </div>
    </header>

    <!-- 分類標籤 -->
    <div class="category-tabs">
      <button
        v-for="category in categories"
        :key="category.id"
        class="category-tab"
        :class="{ active: activeCategory === category.id }"
        @click="activeCategory = category.id"
      >
        <component :is="category.icon" :size="18" />
        <span>{{ category.label }}</span>
      </button>
    </div>

    <!-- 商品列表 -->
    <div class="shop-content">
      <div class="items-grid">
        <div
          v-for="item in currentItems"
          :key="item.id"
          class="shop-item"
          :class="[
            getRarityClass(item.rarity),
            {
              owned: isOwned(item) && !item.variants,
              'all-owned':
                item.variants && getVariantOwnedStatus(item) === 'all',
            },
          ]"
          @click="openPurchaseModal(item)"
        >
          <!-- 稀有度標籤 -->
          <div class="rarity-badge" :class="getRarityClass(item.rarity)">
            {{ getRarityLabel(item.rarity) }}
          </div>

          <!-- 已擁有標記 -->
          <div v-if="isOwned(item) && !item.variants" class="owned-badge">
            <Check :size="14" />
            已擁有
          </div>
          <!-- 變體商品擁有狀態 -->
          <div
            v-else-if="item.variants && getVariantOwnedStatus(item) !== 'none'"
            class="owned-badge"
            :class="{ partial: getVariantOwnedStatus(item) === 'partial' }"
          >
            <Check :size="14" />
            {{
              getVariantOwnedStatus(item) === "all" ? "已全部擁有" : "部分擁有"
            }}
          </div>

          <!-- 商品圖標 -->
          <div
            class="item-icon"
            :class="[
              getRarityClass(item.rarity),
              {
                'svg-frame':
                  item.category === 'frame' && isAvatarFrameSvg(item.id),
                'image-frame':
                  item.category === 'frame' && isAvatarFrameImage(item.id),
              },
            ]"
          >
            <PixelRod
              v-if="item.category === 'rod'"
              :rod-id="item.id"
              :size="48"
            />
            <component
              v-else-if="item.category === 'gift'"
              :is="getGiftIcon(item.id)"
              :size="32"
            />
            <div
              v-else-if="item.category === 'frame' && isAvatarFrameSvg(item.id)"
              class="svg-frame-preview"
              v-html="getAvatarFrameSvg(item.id, 'circle')"
            ></div>
            <div
              v-else-if="
                item.category === 'frame' && isAvatarFrameImage(item.id)
              "
              class="image-frame-preview"
            >
              <img
                v-if="getAvatarFrameLayers(item.id)?.background"
                class="frame-layer-bg"
                :src="getLayerSrc(getAvatarFrameLayers(item.id)?.background)"
                :style="{
                  filter: getAvatarFrameLayers(item.id)?.background?.filter,
                }"
                alt=""
              />
              <img
                v-if="getAvatarFrameLayers(item.id)?.overlay"
                class="frame-layer-overlay"
                :src="getLayerSrc(getAvatarFrameLayers(item.id)?.overlay)"
                :style="{
                  filter: getAvatarFrameLayers(item.id)?.overlay?.filter,
                }"
                alt=""
              />
              <img
                v-if="getAvatarFrameLayers(item.id)?.decoration"
                class="frame-layer-decoration"
                :src="getLayerSrc(getAvatarFrameLayers(item.id)?.decoration)"
                :style="{
                  filter: getAvatarFrameLayers(item.id)?.decoration?.filter,
                }"
                alt=""
              />
            </div>
            <Sparkles v-else :size="32" />
          </div>

          <!-- 商品資訊 -->
          <div class="item-info">
            <div class="item-name">{{ item.name }}</div>
            <div class="item-desc">{{ item.description }}</div>
          </div>

          <!-- 價格 -->
          <div
            class="item-price"
            :class="{ insufficient: balance < item.price }"
          >
            <Coins :size="14" />
            <span>{{ item.price.toLocaleString() }}</span>
          </div>

          <!-- 魚竿屬性 -->
          <div v-if="item.rodStats" class="rod-stats">
            <span>耐久 {{ item.rodStats.maxDurability }}</span>
            <span
              >等級 {{ item.rodStats.minFishTier }}-{{
                item.rodStats.maxFishTier
              }}</span
            >
          </div>

          <!-- 消耗品效果 -->
          <div v-if="item.consumableEffect" class="consumable-effect">
            <span
              >效率 +{{
                Math.round((item.consumableEffect.multiplier - 1) * 100)
              }}%</span
            >
          </div>
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-if="currentItems.length === 0" class="empty-state">
        <ShoppingBag :size="48" />
        <span>此分類暫無商品</span>
      </div>
    </div>

    <!-- 購買確認彈窗 -->
    <teleport to="body">
      <transition name="modal">
        <div
          v-if="showPurchaseModal"
          class="purchase-modal-overlay"
          @click="closePurchaseModal"
        >
          <div class="purchase-modal" @click.stop>
            <!-- 關閉按鈕 -->
            <button class="close-btn" @click="closePurchaseModal">
              <X :size="20" />
            </button>

            <!-- 購買結果 -->
            <div
              v-if="purchaseResult"
              class="purchase-result"
              :class="{ success: purchaseResult.success }"
            >
              <div class="result-icon">
                <Check v-if="purchaseResult.success" :size="32" />
                <X v-else :size="32" />
              </div>
              <div class="result-message">{{ purchaseResult.message }}</div>
            </div>

            <!-- 購買確認內容 -->
            <template v-else-if="selectedItem">
              <div
                class="modal-item-icon"
                :class="[
                  getRarityClass(selectedItem.rarity),
                  {
                    'svg-frame':
                      selectedItem.category === 'frame' &&
                      isAvatarFrameSvg(previewFrameId),
                    'image-frame':
                      selectedItem.category === 'frame' &&
                      isAvatarFrameImage(previewFrameId),
                  },
                ]"
              >
                <PixelRod
                  v-if="selectedItem.category === 'rod'"
                  :rod-id="selectedItem.id"
                  :size="64"
                />
                <component
                  v-else-if="selectedItem.category === 'gift'"
                  :is="getGiftIcon(selectedItem.id)"
                  :size="48"
                />
                <div
                  v-else-if="
                    selectedItem.category === 'frame' &&
                    isAvatarFrameSvg(previewFrameId)
                  "
                  class="svg-frame-preview"
                  v-html="getAvatarFrameSvg(previewFrameId, 'circle')"
                ></div>
                <div
                  v-else-if="
                    selectedItem.category === 'frame' &&
                    isAvatarFrameImage(previewFrameId)
                  "
                  class="image-frame-preview"
                >
                  <img
                    v-if="getAvatarFrameLayers(previewFrameId)?.background"
                    class="frame-layer-bg"
                    :src="
                      getLayerSrc(
                        getAvatarFrameLayers(previewFrameId)?.background,
                      )
                    "
                    :style="{
                      filter:
                        getAvatarFrameLayers(previewFrameId)?.background
                          ?.filter,
                    }"
                    alt=""
                  />
                  <img
                    v-if="getAvatarFrameLayers(previewFrameId)?.overlay"
                    class="frame-layer-overlay"
                    :src="
                      getLayerSrc(getAvatarFrameLayers(previewFrameId)?.overlay)
                    "
                    :style="{
                      filter:
                        getAvatarFrameLayers(previewFrameId)?.overlay?.filter,
                    }"
                    alt=""
                  />
                  <img
                    v-if="getAvatarFrameLayers(previewFrameId)?.decoration"
                    class="frame-layer-decoration"
                    :src="
                      getLayerSrc(
                        getAvatarFrameLayers(previewFrameId)?.decoration,
                      )
                    "
                    :style="{
                      filter:
                        getAvatarFrameLayers(previewFrameId)?.decoration
                          ?.filter,
                    }"
                    alt=""
                  />
                </div>
                <Sparkles v-else :size="48" />
              </div>

              <div class="modal-item-name">{{ selectedItem.name }}</div>
              <div class="modal-item-desc">{{ selectedItem.description }}</div>

              <div
                class="modal-rarity"
                :class="getRarityClass(selectedItem.rarity)"
              >
                {{ getRarityLabel(selectedItem.rarity) }}
              </div>

              <!-- 變體選擇器（類似 Discord 顏色選擇） -->
              <div
                v-if="selectedItem.variants && selectedItem.variants.length > 0"
                class="variant-selector"
              >
                <div class="variant-label">選擇樣式</div>
                <div class="variant-options">
                  <button
                    v-for="variant in selectedItem.variants"
                    :key="variant.variantId"
                    class="variant-option"
                    :class="{
                      selected:
                        selectedVariant?.variantId === variant.variantId,
                      owned: isVariantOwned(selectedItem, variant),
                    }"
                    :disabled="isVariantOwned(selectedItem, variant)"
                    @click="selectVariant(variant)"
                  >
                    <div
                      class="variant-color"
                      :style="{ background: variant.previewColor }"
                    ></div>
                    <div class="variant-info">
                      <span class="variant-name">{{ variant.name }}</span>
                      <span
                        v-if="isVariantOwned(selectedItem, variant)"
                        class="variant-owned"
                      >
                        已擁有
                      </span>
                    </div>
                    <Check
                      v-if="selectedVariant?.variantId === variant.variantId"
                      :size="16"
                      class="variant-check"
                    />
                  </button>
                </div>
                <div v-if="selectedVariant" class="variant-description">
                  {{ selectedVariant.description || selectedItem.description }}
                </div>
              </div>

              <!-- 魚竿詳細屬性 -->
              <div v-if="selectedItem.rodStats" class="modal-rod-stats">
                <div class="stat-row">
                  <span class="stat-label">最大耐久度</span>
                  <span class="stat-value">{{
                    selectedItem.rodStats.maxDurability
                  }}</span>
                </div>
                <div class="stat-row">
                  <span class="stat-label">可釣魚等級</span>
                  <span class="stat-value"
                    >{{ selectedItem.rodStats.minFishTier }} -
                    {{ selectedItem.rodStats.maxFishTier }}</span
                  >
                </div>
                <div class="stat-row">
                  <span class="stat-label">效率加成</span>
                  <span class="stat-value"
                    >x{{ selectedItem.rodStats.efficiency }}</span
                  >
                </div>
              </div>

              <!-- 消耗品詳細效果 -->
              <div
                v-if="selectedItem.consumableEffect"
                class="modal-consumable-effect"
              >
                <div class="effect-type">
                  {{
                    selectedItem.consumableEffect.type === "work_efficiency"
                      ? "洗盤子效率"
                      : "釣魚效率"
                  }}
                </div>
                <div class="effect-value">
                  +{{
                    Math.round(
                      (selectedItem.consumableEffect.multiplier - 1) * 100,
                    )
                  }}%
                </div>
              </div>

              <!-- 魚竿數量選擇器 -->
              <div
                v-if="selectedItem.category === 'rod'"
                class="quantity-selector"
              >
                <div class="quantity-label">購買數量</div>
                <div class="quantity-controls">
                  <button
                    class="qty-btn"
                    :disabled="purchaseQuantity <= 1"
                    @click="adjustQuantity(-1)"
                  >
                    −
                  </button>
                  <span class="qty-value">{{ purchaseQuantity }}</span>
                  <button
                    class="qty-btn"
                    :disabled="purchaseQuantity >= maxPurchaseQuantity"
                    @click="adjustQuantity(1)"
                  >
                    +
                  </button>
                </div>
                <div class="quantity-hint">耐久度將疊加到現有魚竿</div>
              </div>

              <div class="modal-price">
                <div class="price-label">價格</div>
                <div class="price-value">
                  <Coins :size="20" />
                  <span>{{ totalPrice.toLocaleString() }}</span>
                </div>
              </div>

              <div class="modal-balance">
                購買後餘額：{{ (balance - totalPrice).toLocaleString() }}
              </div>

              <div class="modal-actions">
                <button class="cancel-btn" @click="closePurchaseModal">
                  取消
                </button>
                <button
                  class="confirm-btn"
                  :disabled="
                    balance < totalPrice ||
                    (selectedItem.variants &&
                      selectedItem.variants.length > 0 &&
                      !selectedVariant)
                  "
                  @click="confirmPurchase"
                >
                  <ShoppingBag :size="18" />
                  {{ balance < totalPrice ? "餘額不足" : "確認購買" }}
                </button>
              </div>
            </template>
          </div>
        </div>
      </transition>
    </teleport>
  </div>
</template>

<style lang="scss" scoped>
.shop-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #f8f9fa);
}

.screen-header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);
  gap: 12px;

  .back-btn {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--color-text, #333);
    border-radius: 8px;

    &:active {
      background: var(--color-hover, #f0f0f0);
    }
  }

  h1 {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text, #333);
  }

  .balance-display {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #fef3c7;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    color: #92400e;
  }
}

.category-tabs {
  display: flex;
  padding: 12px 16px;
  gap: 8px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);
  overflow-x: auto;

  &::-webkit-scrollbar {
    display: none;
  }
}

.category-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: #f5f5f5;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;

  &.active {
    background: #7dd3a8;
    color: white;
  }

  &:active {
    transform: scale(0.98);
  }
}

.shop-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.items-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.shop-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    transform: scale(0.98);
  }

  &.owned,
  &.all-owned {
    opacity: 0.7;
    cursor: default;

    &:active {
      transform: none;
    }
  }

  &.rarity-rare {
    border-color: rgba(59, 130, 246, 0.3);
  }

  &.rarity-epic {
    border-color: rgba(168, 85, 247, 0.3);
  }

  &.rarity-legendary {
    border-color: rgba(245, 158, 11, 0.3);
    background: linear-gradient(
      135deg,
      rgba(245, 158, 11, 0.05) 0%,
      rgba(239, 68, 68, 0.05) 100%
    );
  }
}

.rarity-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;

  &.rarity-common {
    background: #e5e7eb;
    color: #6b7280;
  }

  &.rarity-uncommon {
    background: #d1fae5;
    color: #059669;
  }

  &.rarity-rare {
    background: #dbeafe;
    color: #2563eb;
  }

  &.rarity-epic {
    background: #ede9fe;
    color: #7c3aed;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #fef3c7 0%, #fee2e2 100%);
    color: #b45309;
  }
}

.owned-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: #7dd3a8;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  color: white;

  &.partial {
    background: #fbbf24;
    color: #78350f;
  }
}

.item-icon {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: white;

  &.rarity-common {
    background: #9ca3af;
  }

  &.rarity-uncommon {
    background: #22c55e;
  }

  &.rarity-rare {
    background: #3b82f6;
  }

  &.rarity-epic {
    background: #a855f7;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  }

  // SVG 頭像框預覽
  &.svg-frame {
    background: transparent;
    width: 80px;
    height: 80px;
    margin-bottom: 4px;

    .svg-frame-preview {
      width: 100%;
      height: 100%;

      :deep(svg) {
        width: 100%;
        height: 100%;
      }
    }
  }

  // 圖片頭像框預覽
  &.image-frame {
    background: transparent;
    width: 80px;
    height: 80px;
    margin-bottom: 4px;

    .image-frame-preview {
      width: 100%;
      height: 100%;
      position: relative;

      img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;

        &.frame-layer-bg {
          z-index: 0;
        }
        &.frame-layer-overlay {
          z-index: 1;
        }
        &.frame-layer-decoration {
          z-index: 2;
        }
      }
    }
  }
}

.item-info {
  text-align: center;
  margin-bottom: 8px;

  .item-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin-bottom: 4px;
  }

  .item-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.item-price {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #fef3c7;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  color: #92400e;

  &.insufficient {
    background: #fee2e2;
    color: #dc2626;
  }
}

.rod-stats,
.consumable-effect {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  font-size: 10px;
  color: var(--color-text-secondary, #888);

  span {
    padding: 2px 6px;
    background: #f3f4f6;
    border-radius: 6px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--color-text-secondary, #888);
  gap: 12px;
}

// ===== 購買確認彈窗 =====
.purchase-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  padding-top: calc(20px + env(safe-area-inset-top, 0px));
  padding-bottom: calc(20px + var(--safe-bottom, 0px));
  backdrop-filter: blur(4px);
}

.purchase-modal {
  position: relative;
  background: white;
  border-radius: 20px;
  padding: 24px;
  width: 100%;
  max-width: 320px;
  max-height: calc(
    100dvh - 40px - env(safe-area-inset-top, 0px) - var(--safe-bottom, 0px)
  );
  overflow-y: auto;
  text-align: center;

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
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

    &:active {
      background: #e5e7eb;
    }
  }
}

.modal-item-icon {
  width: 80px;
  height: 80px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  color: white;

  &.rarity-common {
    background: #9ca3af;
  }

  &.rarity-uncommon {
    background: #22c55e;
  }

  &.rarity-rare {
    background: #3b82f6;
  }

  &.rarity-epic {
    background: #a855f7;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%);
  }

  // SVG 頭像框預覽
  &.svg-frame {
    background: transparent;
    width: 120px;
    height: 120px;

    .svg-frame-preview {
      width: 100%;
      height: 100%;

      :deep(svg) {
        width: 100%;
        height: 100%;
      }
    }
  }

  // 圖片頭像框預覽
  &.image-frame {
    background: transparent;
    width: 120px;
    height: 120px;

    .image-frame-preview {
      width: 100%;
      height: 100%;
      position: relative;

      img {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        object-fit: contain;

        &.frame-layer-bg {
          z-index: 0;
        }
        &.frame-layer-overlay {
          z-index: 1;
        }
        &.frame-layer-decoration {
          z-index: 2;
        }
      }
    }
  }
}

.modal-item-name {
  font-size: 20px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}

.modal-item-desc {
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 12px;
  line-height: 1.4;
}

.modal-rarity {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 16px;

  &.rarity-common {
    background: #e5e7eb;
    color: #6b7280;
  }

  &.rarity-uncommon {
    background: #d1fae5;
    color: #059669;
  }

  &.rarity-rare {
    background: #dbeafe;
    color: #2563eb;
  }

  &.rarity-epic {
    background: #ede9fe;
    color: #7c3aed;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #fef3c7 0%, #fee2e2 100%);
    color: #b45309;
  }
}

// ===== 變體選擇器（類似 Discord 顏色選擇） =====
.variant-selector {
  background: #f9fafb;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;
  text-align: left;

  .variant-label {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 10px;
  }

  .variant-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .variant-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
      border-color: #d1d5db;
      background: #fafafa;
    }

    &.selected {
      border-color: #7dd3a8;
      background: #f0fdf4;
    }

    &.owned {
      opacity: 0.6;
      cursor: not-allowed;
      background: #f3f4f6;
    }

    &:disabled {
      cursor: not-allowed;
    }

    .variant-color {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      flex-shrink: 0;
      border: 2px solid rgba(0, 0, 0, 0.1);
    }

    .variant-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 2px;

      .variant-name {
        font-size: 14px;
        font-weight: 500;
        color: #1f2937;
      }

      .variant-owned {
        font-size: 11px;
        color: #9ca3af;
      }
    }

    .variant-check {
      color: #16a34a;
      flex-shrink: 0;
    }
  }

  .variant-description {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #e5e7eb;
    font-size: 12px;
    color: #6b7280;
    line-height: 1.4;
  }
}

.modal-rod-stats {
  background: #f9fafb;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;

  .stat-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 13px;

    &:not(:last-child) {
      border-bottom: 1px solid #e5e7eb;
    }

    .stat-label {
      color: #6b7280;
    }

    .stat-value {
      font-weight: 600;
      color: #1f2937;
    }
  }
}

.modal-consumable-effect {
  background: #f0fdf4;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;

  .effect-type {
    font-size: 12px;
    color: #059669;
    margin-bottom: 4px;
  }

  .effect-value {
    font-size: 20px;
    font-weight: 700;
    color: #16a34a;
  }
}

.quantity-selector {
  background: #f9fafb;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 16px;

  .quantity-label {
    font-size: 12px;
    color: #6b7280;
    margin-bottom: 8px;
  }

  .quantity-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;

    .qty-btn {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 50%;
      background: #e5e7eb;
      font-size: 18px;
      font-weight: 600;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;

      &:active:not(:disabled) {
        transform: scale(0.95);
        background: #d1d5db;
      }

      &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
    }

    .qty-value {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
      min-width: 48px;
      text-align: center;
    }
  }

  .quantity-hint {
    font-size: 11px;
    color: #9ca3af;
    margin-top: 8px;
  }
}

.modal-price {
  margin-bottom: 8px;

  .price-label {
    font-size: 12px;
    color: #9ca3af;
    margin-bottom: 4px;
  }

  .price-value {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 24px;
    font-weight: 700;
    color: #92400e;
  }
}

.modal-balance {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 20px;
}

.modal-actions {
  display: flex;
  gap: 12px;

  button {
    flex: 1;
    padding: 14px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;

    &:active {
      transform: scale(0.98);
    }
  }

  .cancel-btn {
    background: #f3f4f6;
    border: none;
    color: #374151;
  }

  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: #7dd3a8;
    border: none;
    color: white;

    &:disabled {
      background: #d1d5db;
      cursor: not-allowed;
      opacity: 0.7;

      &:active {
        transform: none;
      }
    }
  }
}

// ===== 購買結果 =====
.purchase-result {
  padding: 24px 0;

  .result-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    background: #fee2e2;
    color: #dc2626;
  }

  &.success .result-icon {
    background: #d1fae5;
    color: #16a34a;
  }

  .result-message {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
  }
}

// ===== 動畫 =====
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;

  .purchase-modal {
    transition: transform 0.2s ease-out;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .purchase-modal {
    transform: scale(0.95);
  }
}
</style>
