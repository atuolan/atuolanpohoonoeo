<template>
  <teleport to="body">
    <transition name="fish-slide">
      <div v-if="visible" class="fish-screen" :style="themeStyle">
        <!-- 頂欄 -->
        <header class="fish-header">
          <div class="header-main">
            <button class="nav-btn" aria-label="返回" @click="handleClose">
              <ChevronLeft :size="20" />
            </button>
            <h1 class="header-title">釣魚</h1>
            <div class="header-right">
              <button class="nav-btn" aria-label="釣魚說明" @click="showGuide = true">
                <HelpCircle :size="20" />
              </button>
              <div class="coin-chip">
                <svg viewBox="0 0 20 20" class="coin-icon" aria-hidden="true">
                  <circle cx="10" cy="10" r="9" fill="#E8A93A" />
                  <circle cx="10" cy="10" r="6" fill="none" stroke="#FFF1CF" stroke-width="1.5" />
                  <path d="M10 7v6" stroke="#FFF1CF" stroke-width="1.5" stroke-linecap="round" />
                </svg>
                <span class="coin-amount">{{ gameEconomyStore.getBalance(GLOBAL_WALLET_ID).toLocaleString() }}</span>
              </div>
            </div>
          </div>
          <div class="stats-row">
            <div class="stat-chip">累計 {{ gameEconomyStore.getFishingStats(GLOBAL_WALLET_ID).totalFishCaught }} 條</div>
            <div class="stat-chip">魚簍 {{ fishInventory.length }} 條</div>
          </div>
        </header>

        <!-- 場景 -->
        <div class="scene">
          <div class="sky" />
          <div class="water" />
          <div class="sun-moon" />
          <div v-if="timeOfDay === 'night'" class="stars" aria-hidden="true">
            <span class="star s1" />
            <span class="star s2" />
            <span class="star s3" />
            <span class="star s4" />
            <span class="star s5" />
          </div>
          <!-- 水面山丘 -->
          <svg class="scene-hills" viewBox="0 0 390 52" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 52V30Q60 6 122 26T236 20Q300 2 390 26V52Z" />
          </svg>
          <!-- 水面倒影 -->
          <div class="sun-reflection" aria-hidden="true">
            <span class="ref-line r1" />
            <span class="ref-line r2" />
            <span class="ref-line r3" />
          </div>

          <!-- 全尺寸 SVG：魚線、浮標、水下魚影、漣漪、魚竿 -->
          <svg class="fishing-svg" viewBox="0 0 390 550" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
            <!-- 水下魚影（只在 waiting / hooked 顯示） -->
            <g
              v-if="gamePhase === 'waiting' || gamePhase === 'hooked'"
              class="fish-shadow"
              :class="{ 'swimming-hooked': gamePhase === 'hooked' }"
              opacity="0.3"
            >
              <ellipse cx="264" cy="424" rx="34" ry="11" fill="#0B1224" />
              <path d="M296 424l18-12v24z" fill="#0B1224" />
            </g>

            <!-- 漣漪兩圈 -->
            <g
              v-if="gamePhase !== 'idle'"
              class="ripples"
              :class="{ 'ripples-fast': gamePhase === 'hooked', 'ripples-slow': gamePhase === 'waiting' }"
            >
              <ellipse cx="236" cy="362" rx="28" ry="5" fill="none" stroke="#FFFFFF" stroke-opacity="0.6" stroke-width="1.2" />
              <ellipse cx="236" cy="364" rx="50" ry="9" fill="none" stroke="#FFFFFF" stroke-opacity="0.3" stroke-width="1.2" />
            </g>

            <!-- 魚線（idle 時不畫） -->
            <path
              v-if="gamePhase !== 'idle'"
              class="fishing-line"
              d="M300 104Q296 240 236 340"
              stroke="var(--line)"
              stroke-width="1.2"
              fill="none"
            />

            <!-- 浮標（idle 時不畫） -->
            <g
              v-if="gamePhase !== 'idle'"
              class="bobber-group"
              :class="{
                'bobber-casting': gamePhase === 'casting',
                'bobber-waiting': gamePhase === 'waiting',
                'bobber-hooked': gamePhase === 'hooked',
              }"
            >
              <path d="M236 340V348" stroke="#121214" stroke-width="2" stroke-linecap="round" />
              <path d="M226 358a10 10 0 0 1 20 0Z" fill="#E5533D" stroke="#121214" stroke-width="1.6" stroke-linejoin="round" />
              <path d="M226 358a10 10 0 0 0 20 0Z" fill="#FFFFFF" stroke="#121214" stroke-width="1.6" stroke-linejoin="round" />
            </g>

            <!-- 魚竿 -->
            <g class="fishing-rod-graphic" :class="{ 'rod-bending': gamePhase === 'hooked' }">
              <path d="M430 590L300 104" stroke="#3A2A1E" stroke-width="7" stroke-linecap="round" />
              <path d="M430 590L370 362" stroke="#1F1712" stroke-width="12" stroke-linecap="round" />
              <circle cx="352" cy="300" r="12" fill="#5A4636" stroke="#1F1712" stroke-width="2" />
            </g>
          </svg>

          <!-- 浮標上方的狀態膠囊（idle 不顯示） -->
          <div v-if="gamePhase !== 'idle'" class="scene-status-capsule" :class="`status-${gamePhase}`">
            <span class="status-dot" />
            <span class="status-label">
              <template v-if="gamePhase === 'casting'">拋竿中…</template>
              <template v-else-if="gamePhase === 'waiting'">等魚上鉤…</template>
              <template v-else-if="gamePhase === 'hooked'">咬鉤了！</template>
              <template v-else-if="gamePhase === 'caught'">釣到了！</template>
              <template v-else-if="gamePhase === 'trash'">釣到垃圾…</template>
              <template v-else-if="gamePhase === 'missed'">魚跑了</template>
            </span>
          </div>
        </div>
        <!-- 底部白色操作抽屜 -->
        <main class="fish-drawer">
          <!-- a. 魚竿列 -->
          <button class="rod-card-btn" type="button" aria-label="換魚竿" @click="showRodSelector = true">
            <template v-if="equippedRod">
              <div class="rod-thumb">
                <PixelRod :rod-id="getRodItemId(equippedRod)" :size="32" />
              </div>
              <div class="rod-detail">
                <div class="rod-detail-top">
                  <span class="rod-name">{{ equippedRod.name }}</span>
                  <span class="rod-durability-num">耐久 {{ equippedRod.durability }}/{{ equippedRod.maxDurability }}</span>
                </div>
                <div class="rod-meter-track">
                  <div
                    class="rod-meter-fill"
                    :style="{
                      width: `${Math.min(100, Math.max(0, (equippedRod.durability / equippedRod.maxDurability) * 100))}%`,
                      backgroundColor:
                        equippedRod.durability / equippedRod.maxDurability > 0.5
                          ? '#2F7A4A'
                          : equippedRod.durability / equippedRod.maxDurability >= 0.2
                            ? '#C9861A'
                            : '#B4233F'
                    }"
                  />
                </div>
              </div>
              <ChevronRight :size="18" class="rod-arrow" />
            </template>
            <template v-else>
              <div class="rod-empty-info">
                <span class="empty-text">還沒裝備魚竿</span>
                <span class="equip-chip">去裝備</span>
              </div>
              <ChevronRight :size="18" class="rod-arrow" />
            </template>
          </button>

          <!-- b. 主按鈕 -->
          <button
            class="main-action-btn"
            type="button"
            :class="{
              'btn-idle': gamePhase === 'idle' && !isIdling,
              'btn-waiting': (gamePhase === 'casting' || gamePhase === 'waiting') && !isIdling,
              'btn-hooked': gamePhase === 'hooked' && !isIdling,
              'btn-recast': ['caught', 'trash', 'missed'].includes(gamePhase) && !isIdling,
              'btn-claim': isIdling,
            }"
            :disabled="(!canFish && gamePhase === 'idle' && !isIdling) || ((gamePhase === 'casting' || gamePhase === 'waiting') && !isIdling)"
            @click="handlePrimaryAction"
          >
            <template v-if="isIdling">
              <span class="btn-main-text">領取收益</span>
              <span class="btn-sub-text">掛機中 {{ idleDurationText }} · 預計 {{ idleRewards?.fishCount || 0 }} 條</span>
            </template>
            <template v-else-if="gamePhase === 'idle'">
              <span class="btn-main-text">拋竿</span>
              <span class="btn-sub-text">{{ canFish ? '等浮標沉下去再收竿' : '魚竿壞了，先換一支' }}</span>
            </template>
            <template v-else-if="gamePhase === 'casting' || gamePhase === 'waiting'">
              <span class="btn-main-text">等魚上鉤…</span>
            </template>
            <template v-else-if="gamePhase === 'hooked'">
              <span class="btn-main-text">收竿！</span>
              <span class="btn-sub-text">快！3 秒內</span>
            </template>
            <template v-else>
              <span class="btn-main-text">再拋一次</span>
              <span v-if="!canFish" class="btn-sub-text">魚竿壞了，先換一支</span>
            </template>
          </button>

          <!-- c. 次要操作列 -->
          <div v-if="(gamePhase === 'idle' && canFish && !isIdling) || isIdling" class="secondary-actions">
            <button
              v-if="!isIdling"
              type="button"
              class="sec-btn idle-start-btn"
              @click="handleStartIdle"
            >
              <Moon :size="16" />
              <span>掛機釣魚</span>
            </button>
            <button
              v-else
              type="button"
              class="sec-btn idle-cancel-btn"
              @click="handleCancelIdle"
            >
              <span>取消掛機</span>
            </button>
          </div>

          <!-- d. 收穫卡 -->
          <div v-if="gamePhase === 'caught' && caughtFish" class="result-card catch-card">
            <div class="result-fish-thumb">
              <PixelFish :fish-id="caughtFish.fishTypeId" :size="36" />
            </div>
            <div class="result-fish-meta">
              <div class="result-title-row">
                <span class="result-name">{{ caughtFish.name }}</span>
                <span class="rarity-tag" :class="`rarity-${caughtFish.rarity}`">
                  {{ rarityLabels[caughtFish.rarity] || caughtFish.rarity }}
                </span>
              </div>
              <span class="result-weight">{{ caughtFish.weight.toFixed(2) }} kg</span>
            </div>
            <div class="result-price">+{{ caughtFish.finalPrice }}</div>
          </div>
          <div v-else-if="gamePhase === 'trash' && trashResult" class="result-card trash-card">
            <div class="result-trash-icon">
              <Trash2 :size="28" />
            </div>
            <div class="result-fish-meta">
              <span class="result-name">{{ trashResult.name }}</span>
            </div>
            <div class="result-cost">-{{ trashResult.cost }}</div>
          </div>

          <!-- e. 魚簍 -->
          <section class="creel-section">
            <div class="creel-header">
              <h2 class="creel-title">魚簍 {{ fishInventory.length }}</h2>
              <button
                v-if="fishInventory.length > 0"
                type="button"
                class="sell-all-btn"
                @click="handleSellAll"
              >
                全部賣出 +{{ totalFishValue.toLocaleString() }}
              </button>
            </div>
            <div v-if="fishInventory.length > 0" class="creel-scroll">
              <div
                v-for="fish in fishInventory"
                :key="fish.id"
                class="creel-item"
              >
                <PixelFish :fish-id="fish.fishTypeId" :size="28" />
                <span class="creel-fish-name">{{ fish.name }}</span>
                <span class="creel-fish-price">{{ fish.finalPrice }}</span>
              </div>
            </div>
            <p v-else class="creel-empty">魚簍是空的</p>
          </section>
        </main>
        <!-- 魚竿選擇器（從抽屜上方滑出的底部抽屜） -->
        <transition name="drawer-slide">
          <div v-if="showRodSelector" class="rod-selector-backdrop" @click.self="showRodSelector = false">
            <div class="rod-selector-drawer">
              <div class="rod-selector-header">
                <h3 class="rod-selector-title">換魚竿</h3>
                <button
                  type="button"
                  class="rod-selector-close"
                  aria-label="關閉"
                  @click="showRodSelector = false"
                >
                  <X :size="20" />
                </button>
              </div>
              <div class="rod-list">
                <div
                  v-for="rod in sortedRods"
                  :key="rod.id"
                  class="rod-item-card"
                  :class="{
                    'is-equipped': equippedRod?.id === rod.id,
                    'is-broken': rod.durability <= 0,
                  }"
                  @click="selectRod(rod)"
                >
                  <div class="rod-item-thumb">
                    <PixelRod :rod-id="getRodItemId(rod)" :size="32" />
                  </div>
                  <div class="rod-item-meta">
                    <div class="rod-item-name-row">
                      <span class="rod-item-name">{{ rod.name }}</span>
                      <span v-if="equippedRod?.id === rod.id" class="equipped-badge">已裝備</span>
                    </div>
                    <div class="rod-item-durability">
                      耐久 {{ rod.durability }}/{{ rod.maxDurability }}
                      <span v-if="rod.durability <= 0" class="broken-hint">（已損壞）</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </transition>

        <!-- 說明彈窗 -->
        <FishingGuideModal
          :visible="showGuide"
          @close="showGuide = false"
        />
      </div>
    </transition>
  </teleport>
</template>
<script setup lang="ts">
import PixelFish from "@/components/common/PixelFish.vue";
import PixelRod from "@/components/common/PixelRod.vue";
import FishingGuideModal from "@/components/modals/FishingGuideModal.vue";
import { getShopItemById } from "@/data/shopItems";
import type { CaughtFish, FishingRod, Rarity } from "@/schemas/gameEconomy";
import { useNotificationStore } from "@/stores";
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  Moon,
  Trash2,
  X,
} from "lucide-vue-next";
import { computed, onUnmounted, ref, watch } from "vue";

type GamePhase =
  | "idle"
  | "casting"
  | "waiting"
  | "hooked"
  | "caught"
  | "trash"
  | "missed";

const props = defineProps<{
  visible: boolean;
  chatId?: string;
}>();

const emit = defineEmits<{
  close: [];
  catch: [fish: CaughtFish];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();
const notificationStore = useNotificationStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 遊戲狀態
const gamePhase = ref<GamePhase>("idle");
const caughtFish = ref<CaughtFish | null>(null);
const trashResult = ref<{ name: string; cost: number } | null>(null);
const showRodSelector = ref(false);
const showGuide = ref(false);

// 計時器
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let hookTimer: ReturnType<typeof setTimeout> | null = null;
let castTimer: ReturnType<typeof setTimeout> | null = null;

// 時段計算
const now = ref(new Date());
let nowTimer: ReturnType<typeof setInterval> | null = null;

const timeOfDay = computed<'day' | 'dusk' | 'night'>(() => {
  const h = now.value.getHours();
  if (h >= 6 && h < 16) return 'day';
  if (h >= 16 && h < 19) return 'dusk';
  return 'night';
});

const themeStyle = computed(() => {
  const t = timeOfDay.value;
  if (t === 'day') {
    return {
      '--sky-top': '#9CC3E6',
      '--sky-bot': '#E6F0F7',
      '--water-top': '#6F9CC4',
      '--water-bot': '#3E6A93',
      '--sun': '#FBE7A8',
      '--sun-top': '120px',
      '--hill': '#7FA58C',
      '--line': '#FFFFFF',
      '--fg': '#121214',
      '--chip': 'rgba(255,255,255,0.8)',
    };
  }
  if (t === 'dusk') {
    return {
      '--sky-top': '#5E7FA8',
      '--sky-bot': '#EDB892',
      '--water-top': '#8A7F95',
      '--water-bot': '#3E4A66',
      '--sun': '#F6A66B',
      '--sun-top': '236px',
      '--hill': '#4E4A5A',
      '--line': '#FFFFFF',
      '--fg': '#FFFFFF',
      '--chip': 'rgba(16,16,18,0.32)',
    };
  }
  return {
    '--sky-top': '#0F1830',
    '--sky-bot': '#2B3A5C',
    '--water-top': '#1E2A47',
    '--water-bot': '#0B1224',
    '--sun': '#E8E4D8',
    '--sun-top': '130px',
    '--hill': '#0A1022',
    '--line': '#C9D2E6',
    '--fg': '#FFFFFF',
    '--chip': 'rgba(255,255,255,0.14)',
  };
});

// 稀有度標籤
const rarityLabels: Record<Rarity, string> = {
  common: "普通",
  uncommon: "稀有",
  rare: "珍稀",
  epic: "史詩",
  legendary: "傳說",
};

// 計算屬性
const equippedRod = computed(() => {
  return gameEconomyStore.getEquippedRod(GLOBAL_WALLET_ID);
});

const fishingRods = computed(() => {
  return gameEconomyStore.getFishingRods(GLOBAL_WALLET_ID);
});

const fishInventory = computed(() => {
  return gameEconomyStore.getFishInventory(GLOBAL_WALLET_ID);
});

const totalFishValue = computed(() => {
  return fishInventory.value.reduce((sum, fish) => sum + fish.finalPrice, 0);
});

const canFish = computed(() => {
  return equippedRod.value && equippedRod.value.durability > 0;
});

// 掛機相關
const isIdling = computed(() => {
  return gameEconomyStore.isIdle(GLOBAL_WALLET_ID);
});

const idleSession = computed(() => {
  return gameEconomyStore.getCurrentIdleSession(GLOBAL_WALLET_ID);
});

const idleRewards = computed(() => {
  if (!isIdling.value) return null;
  return gameEconomyStore.calculateIdleRewards(GLOBAL_WALLET_ID);
});

const idleDurationText = computed(() => {
  if (!idleRewards.value) return "";
  const minutes = Math.floor(idleRewards.value.duration / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}小時${mins}分鐘`;
  }
  return `${mins}分鐘`;
});

// 掛機更新計時器
let idleUpdateTimer: ReturnType<typeof setInterval> | null = null;
const idleUpdateTrigger = ref(0);

function startIdleUpdateTimer() {
  if (idleUpdateTimer) return;
  idleUpdateTimer = setInterval(() => {
    idleUpdateTrigger.value++;
  }, 10000); // 每 10 秒更新一次顯示
}

function stopIdleUpdateTimer() {
  if (idleUpdateTimer) {
    clearInterval(idleUpdateTimer);
    idleUpdateTimer = null;
  }
}

// 按稀有度排序魚竿
const sortedRods = computed(() => {
  const rarityOrder = ["common", "uncommon", "rare", "epic", "legendary"];
  return [...fishingRods.value].sort((a, b) => {
    const rarityA = getRodRarity(a);
    const rarityB = getRodRarity(b);
    return rarityOrder.indexOf(rarityA) - rarityOrder.indexOf(rarityB);
  });
});

// 方法
function handleClose() {
  clearTimers();
  emit("close");
}

function clearTimers() {
  if (castTimer) {
    clearTimeout(castTimer);
    castTimer = null;
  }
  if (waitTimer) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
  if (hookTimer) {
    clearTimeout(hookTimer);
    hookTimer = null;
  }
}

function getRodRarity(rod: FishingRod): string {
  // 根據魚竿名稱找到對應的商品來獲取稀有度
  const rodItems = [
    "rod_bamboo",
    "rod_wooden",
    "rod_carbon",
    "rod_steel",
    "rod_pro",
    "rod_titanium",
    "rod_gold",
    "rod_legendary",
  ];
  for (const itemId of rodItems) {
    const item = getShopItemById(itemId);
    if (item && item.name === rod.name) {
      return item.rarity;
    }
  }
  return "common";
}

function getRodItemId(rod: FishingRod): string {
  // 根據魚竿名稱找到對應的商品 ID
  const rodItems = [
    "rod_bamboo",
    "rod_wooden",
    "rod_carbon",
    "rod_steel",
    "rod_pro",
    "rod_titanium",
    "rod_gold",
    "rod_legendary",
  ];
  for (const itemId of rodItems) {
    const item = getShopItemById(itemId);
    if (item && item.name === rod.name) {
      return itemId;
    }
  }
  return "rod_bamboo";
}

function startFishing() {
  if (!canFish.value) return;

  clearTimers();
  gamePhase.value = "casting";
  caughtFish.value = null;

  // 拋竿動畫後進入等待
  castTimer = setTimeout(() => {
    gamePhase.value = "waiting";

    // 隨機等待時間 (2-8 秒)
    const waitTime = 2000 + Math.random() * 6000;
    waitTimer = setTimeout(() => {
      gamePhase.value = "hooked";

      // 上鉤後有 3 秒時間收竿
      hookTimer = setTimeout(() => {
        if (gamePhase.value === "hooked") {
          gamePhase.value = "missed";
        }
      }, 3000);
    }, waitTime);
  }, 800);
}

function handlePrimaryAction() {
  if (isIdling.value) {
    handleClaimIdle();
  } else if (gamePhase.value === 'idle') {
    startFishing();
  } else if (gamePhase.value === 'hooked') {
    reelIn();
  } else if (['caught', 'trash', 'missed'].includes(gamePhase.value)) {
    if (canFish.value) {
      resetGame();
      startFishing();
    } else {
      resetGame();
    }
  }
}

async function reelIn() {
  if (gamePhase.value !== "hooked") return;

  clearTimers();

  // 執行釣魚邏輯
  const result = gameEconomyStore.catchFish(GLOBAL_WALLET_ID);

  if (result.success && result.isTrash) {
    // 釣到垃圾
    trashResult.value = {
      name: result.trashName!,
      cost: result.trashCost!,
    };
    caughtFish.value = null;
    gamePhase.value = "trash";

    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);

    if (result.rodBroken) {
      notificationStore.notifyFishingStamina();
    }
  } else if (result.success && result.fish) {
    caughtFish.value = result.fish;
    trashResult.value = null;
    gamePhase.value = "caught";

    // 保存狀態
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);

    // 魚竿損壞通知
    if (result.rodBroken) {
      notificationStore.notifyFishingStamina();
    }

    // 發送事件
    emit("catch", result.fish);
  } else {
    gamePhase.value = "missed";
  }
}

function resetGame() {
  clearTimers();
  gamePhase.value = "idle";
  caughtFish.value = null;
  trashResult.value = null;
}

async function selectRod(rod: FishingRod) {
  if (rod.durability <= 0) return;

  gameEconomyStore.equipRod(GLOBAL_WALLET_ID, rod.id);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  showRodSelector.value = false;
}

async function handleSellAll() {
  const amount = gameEconomyStore.sellAllFish(GLOBAL_WALLET_ID);
  if (amount > 0) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  }
}

// 掛機操作
async function handleStartIdle() {
  if (!canFish.value) return;

  const result = gameEconomyStore.startIdleSession(GLOBAL_WALLET_ID);
  if (result.success) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    startIdleUpdateTimer();
  }
}

async function handleClaimIdle() {
  // 先檢查是否達到 24h 上限
  const rewards = gameEconomyStore.calculateIdleRewards(GLOBAL_WALLET_ID);
  const hitDailyLimit =
    rewards.hasSession && rewards.duration > rewards.effectiveDuration;

  const result = gameEconomyStore.claimIdleRewards(GLOBAL_WALLET_ID);
  if (result.success) {
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    stopIdleUpdateTimer();

    // 魚竿損壞通知
    if (result.rodBroken) {
      notificationStore.notifyFishingStamina();
    }

    // 24h 掛機上限通知
    if (hitDailyLimit) {
      notificationStore.notifyFishingDailyLimit();
    }
  }
}

async function handleCancelIdle() {
  gameEconomyStore.cancelIdleSession(GLOBAL_WALLET_ID);
  await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
  stopIdleUpdateTimer();
}

function startNowTimer() {
  now.value = new Date();
  if (nowTimer) return;
  nowTimer = setInterval(() => {
    now.value = new Date();
  }, 60000);
}

function stopNowTimer() {
  if (nowTimer) {
    clearInterval(nowTimer);
    nowTimer = null;
  }
}

// 監聯可見性
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      startNowTimer();
      // 強制重新載入狀態（會自動合併魚竿）
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID, true);
      // 額外保存一次確保合併結果被保存
      await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
      resetGame();
      // 如果正在掛機，啟動更新計時器
      if (gameEconomyStore.isIdle(GLOBAL_WALLET_ID)) {
        startIdleUpdateTimer();
      }
    } else {
      stopNowTimer();
      clearTimers();
      stopIdleUpdateTimer();
    }
  },
  { immediate: true },
);

// 清理
onUnmounted(() => {
  stopNowTimer();
  clearTimers();
  stopIdleUpdateTimer();
});
</script>


<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;
.fish-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  @include gs.vars;
  background: var(--g-surface);
  --sheet-h: 380px;
}

// 畫面進入淡入與往上滑入動畫
.fish-slide-enter-active,
.fish-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.fish-slide-enter-from,
.fish-slide-leave-to {
  opacity: 0;
  transform: translateY(24px);
}

// 頂欄
.fish-header {
  position: absolute;
  left: 20px;
  right: 20px;
  top: max(16px, var(--safe-area-inset-top, env(safe-area-inset-top)));
  z-index: 20;
  color: var(--fg);
  display: flex;
  flex-direction: column;
  gap: 12px;

  .header-main {
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .nav-btn {
    width: 44px;
    height: 44px;
    border-radius: 22px;
    border: none;
    background: var(--chip);
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    backdrop-filter: blur(8px);
    transition: opacity 0.15s ease;

    &:active {
      opacity: 0.8;
    }
  }

  .header-title {
    font-size: 17px;
    font-weight: 700;
    margin: 0;
    color: inherit;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .coin-chip {
    height: 36px;
    padding: 0 12px 0 8px;
    border-radius: 18px;
    background: var(--chip);
    display: inline-flex;
    align-items: center;
    gap: 6px;
    backdrop-filter: blur(8px);

    .coin-icon {
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }

    .coin-amount {
      font-family: var(--g-num);
      font-size: 14px;
      font-weight: 600;
      color: inherit;
    }
  }

  .stats-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .stat-chip {
    height: 28px;
    padding: 0 10px;
    border-radius: 14px;
    background: var(--chip);
    font-size: 12px;
    color: var(--fg);
    display: inline-flex;
    align-items: center;
    backdrop-filter: blur(8px);
  }
}
// 場景
.scene {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: calc(100% - var(--sheet-h));
  overflow: hidden;

  .sky {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(180deg, var(--sky-top) 0%, var(--sky-bot) 100%);
  }

  .water {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 40%;
    background: linear-gradient(180deg, var(--water-top) 0%, var(--water-bot) 100%);
  }

  .sun-moon {
    position: absolute;
    left: 62px;
    top: var(--sun-top);
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: var(--sun);
    box-shadow: 0 0 32px var(--sun);
    pointer-events: none;
    transition: top 0.4s ease;
  }

  .stars {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    pointer-events: none;

    .star {
      position: absolute;
      background: #FFFFFF;
      border-radius: 50%;
      opacity: 0.85;

      &.s1 { width: 3px; height: 3px; top: 18%; left: 22%; }
      &.s2 { width: 2px; height: 2px; top: 28%; left: 45%; }
      &.s3 { width: 3px; height: 3px; top: 12%; left: 78%; }
      &.s4 { width: 2px; height: 2px; top: 35%; left: 82%; }
      &.s5 { width: 2.5px; height: 2.5px; top: 44%; left: 32%; }
    }
  }

  .scene-hills {
    position: absolute;
    top: calc(60% - 26px);
    left: 0;
    width: 100%;
    height: 52px;
    path {
      fill: var(--hill);
    }
  }

  .sun-reflection {
    position: absolute;
    left: 62px;
    top: calc(60% + 8px);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: none;

    .ref-line {
      height: 2px;
      border-radius: 1px;
      background: var(--sun);

      &.r1 { width: 36px; opacity: 0.55; }
      &.r2 { width: 24px; opacity: 0.4; }
      &.r3 { width: 14px; opacity: 0.3; }
    }
  }

  .fishing-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  // 魚影游動動畫
  .fish-shadow {
    transition: transform 0.3s ease;
    &.swimming-hooked {
      animation: fishSwim 1s ease-in-out infinite alternate;
    }
  }

  // 漣漪動畫
  .ripples {
    transform-origin: 236px 363px;
    &.ripples-slow {
      animation: ripplePulse 2.4s ease-out infinite;
    }
    &.ripples-fast {
      animation: ripplePulse 0.9s ease-out infinite;
    }
  }

  // 浮標各階段動畫
  .bobber-group {
    transform-origin: 236px 350px;
    &.bobber-waiting {
      animation: bobberFloat 2s ease-in-out infinite alternate;
    }
    &.bobber-hooked {
      animation: bobberShake 0.15s ease-in-out infinite alternate;
    }
    &.bobber-casting {
      animation: bobberCast 0.8s cubic-bezier(0.2, 0.8, 0.4, 1) forwards;
    }
  }

  // 魚竿彎曲抖動
  .fishing-rod-graphic {
    transform-origin: 430px 590px;
    &.rod-bending {
      animation: rodBend 0.2s ease-in-out infinite alternate;
    }
  }

  // 浮標上方狀態膠囊
  .scene-status-capsule {
    position: absolute;
    left: 236px;
    top: calc(100% - 190px);
    transform: translateX(-50%);
    height: 34px;
    padding: 0 14px;
    border-radius: 17px;
    background: #FFFFFF;
    color: #121214;
    font-size: 14px;
    font-weight: 700;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
    display: inline-flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
    z-index: 10;
    pointer-events: none;

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #8E8E93;
    }

    &.status-hooked {
      animation: capsuleBounce 0.4s ease-in-out infinite alternate;
      .status-dot {
        background: #E5533D;
      }
    }

    &.status-caught .status-dot {
      background: #2F7A4A;
    }

    &.status-trash .status-dot,
    &.status-missed .status-dot {
      background: #8E8E93;
    }
  }
}

@keyframes fishSwim {
  0% { transform: translate(0, 0); }
  100% { transform: translate(-28px, -60px) scale(1.05); }
}

@keyframes ripplePulse {
  0% { transform: scale(0.85); opacity: 0.9; }
  100% { transform: scale(1.3); opacity: 0.15; }
}

@keyframes bobberFloat {
  0% { transform: translateY(-3px); }
  100% { transform: translateY(4px); }
}

@keyframes bobberShake {
  0% { transform: translateY(6px) rotate(-3deg); }
  100% { transform: translateY(14px) rotate(3deg); }
}

@keyframes bobberCast {
  0% { transform: translate(64px, -240px) scale(0.6); opacity: 0; }
  40% { transform: translate(20px, -140px) scale(0.85); opacity: 1; }
  100% { transform: translate(0, 0) scale(1); opacity: 1; }
}

@keyframes rodBend {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(4deg); }
}

@keyframes capsuleBounce {
  0% { transform: translate(-50%, 0); }
  100% { transform: translate(-50%, -4px); }
}
// 底部抽屜
.fish-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--sheet-h);
  max-height: 60%;
  background: var(--g-surface);
  color: var(--g-text);
  border-radius: 28px 28px 0 0;
  padding: 22px 20px max(28px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  box-sizing: border-box;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.08);
  z-index: 25;
}

// a. 魚竿列按鈕
.rod-card-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: transparent;
  border: 1px solid var(--g-border);
  border-radius: 18px;
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background-color 0.15s ease;

  &:hover {
    background: var(--g-muted);
  }

  .rod-thumb {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--g-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .rod-detail {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .rod-detail-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rod-name {
    font-size: 14px;
    font-weight: 700;
  }

  .rod-durability-num {
    font-size: 11px;
    color: var(--g-text-2);
  }

  .rod-meter-track {
    width: 100%;
    height: 8px;
    border-radius: 4px;
    background: var(--g-muted);
    overflow: hidden;
  }

  .rod-meter-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.25s ease, background-color 0.25s ease;
  }

  .rod-empty-info {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;

    .empty-text {
      font-size: 14px;
      font-weight: 600;
      color: var(--g-text-2);
    }

    .equip-chip {
      height: 24px;
      padding: 0 10px;
      border-radius: 12px;
      background: var(--g-muted);
      font-size: 12px;
      display: inline-flex;
      align-items: center;
    }
  }

  .rod-arrow {
    color: var(--g-text-2);
    flex-shrink: 0;
  }
}

// b. 主按鈕
.main-action-btn {
  height: 62px;
  border-radius: 31px;
  border: none;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.12s ease, opacity 0.15s ease, background-color 0.2s ease;
  user-select: none;

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  .btn-main-text {
    font-size: 18px;
    font-weight: 700;
  }

  .btn-sub-text {
    font-size: 11px;
    opacity: 0.85;
    margin-top: 2px;
  }

  &.btn-idle {
    background: var(--g-text);
    color: var(--g-surface);
  }

  &.btn-waiting {
    background: var(--g-text);
    color: var(--g-surface);
    opacity: 0.6;
    cursor: not-allowed;
  }

  &.btn-hooked {
    background: #E5533D;
    color: #FFFFFF;
    animation: hookPulse 0.6s infinite alternate;
  }

  &.btn-recast {
    background: var(--g-text);
    color: var(--g-surface);
  }

  &.btn-claim {
    background: var(--g-text);
    color: var(--g-surface);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@keyframes hookPulse {
  0% { transform: scale(1); box-shadow: 0 0 0 rgba(229, 83, 61, 0.4); }
  100% { transform: scale(1.02); box-shadow: 0 4px 16px rgba(229, 83, 61, 0.6); }
}

// c. 次要操作列
.secondary-actions {
  display: flex;
  gap: 8px;

  .sec-btn {
    @include gs.pill-outline(44px);
    width: 100%;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    font-weight: 600;
  }
}

// d. 收穫卡
.result-card {
  border: 1px solid var(--g-border);
  border-radius: 18px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 12px;

  .result-fish-thumb,
  .result-trash-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: var(--g-muted);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .result-fish-meta {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .result-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .result-name {
    font-size: 16px;
    font-weight: 700;
  }

  .result-weight {
    font-size: 12px;
    color: var(--g-text-2);
  }

  .rarity-tag {
    height: 22px;
    padding: 0 8px;
    border-radius: 11px;
    font-size: 11px;
    display: inline-flex;
    align-items: center;
    font-weight: 600;

    &.rarity-common { background: var(--g-muted); color: var(--g-text-2); }
    &.rarity-uncommon { background: #E4F0E8; color: #2F7A4A; }
    &.rarity-rare { background: #E3ECF8; color: #3D6A9E; }
    &.rarity-epic { background: #EFE6F7; color: #7A4FA0; }
    &.rarity-legendary { background: #FFF3DA; color: #8A5A00; }
  }

  .result-price {
    font-family: var(--g-num);
    font-size: 16px;
    font-weight: 700;
    color: #2F7A4A;
    flex-shrink: 0;
  }

  .result-cost {
    font-family: var(--g-num);
    font-size: 16px;
    font-weight: 700;
    color: #B4233F;
    flex-shrink: 0;
  }
}

// e. 魚簍
.creel-section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .creel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .creel-title {
    font-size: 15px;
    font-weight: 700;
    margin: 0;
  }

  .sell-all-btn {
    @include gs.pill-dark(36px);
    cursor: pointer;
    font-size: 13px;
    padding: 0 14px;
    border: none;
  }

  .creel-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .creel-item {
    width: 64px;
    height: 72px;
    flex-shrink: 0;
    border-radius: 14px;
    background: var(--g-muted);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px;
    box-sizing: border-box;

    .creel-fish-name {
      font-size: 11px;
      max-width: 56px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .creel-fish-price {
      font-family: var(--g-num);
      font-size: 11px;
      color: var(--g-text-2);
    }
  }

  .creel-empty {
    font-size: 13px;
    color: var(--g-text-2);
    margin: 8px 0;
  }
}

// 魚竿選擇器抽屜
.rod-selector-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  z-index: 1050;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.rod-selector-drawer {
  background: var(--g-surface);
  color: var(--g-text);
  border-radius: 24px 24px 0 0;
  padding: 20px 20px max(24px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  gap: 16px;

  .rod-selector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .rod-selector-title {
    font-size: 17px;
    font-weight: 700;
    margin: 0;
  }

  .rod-selector-close {
    width: 32px;
    height: 32px;
    border-radius: 16px;
    border: none;
    background: var(--g-muted);
    color: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .rod-list {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .rod-item-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--g-border);
    cursor: pointer;
    transition: border-color 0.15s ease, opacity 0.15s ease;

    &.is-equipped {
      border: 2px solid var(--g-text);
    }

    &.is-broken {
      opacity: 0.45;
      cursor: not-allowed;
    }

    .rod-item-thumb {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: var(--g-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .rod-item-meta {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .rod-item-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .rod-item-name {
      font-size: 14px;
      font-weight: 700;
    }

    .equipped-badge {
      font-size: 11px;
      background: var(--g-text);
      color: var(--g-surface);
      padding: 1px 6px;
      border-radius: 6px;
    }

    .rod-item-durability {
      font-size: 12px;
      color: var(--g-text-2);
    }

    .broken-hint {
      color: #B4233F;
    }
  }
}

// 抽屜滑入滑出
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: opacity 0.2s ease;
  .rod-selector-drawer {
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  .rod-selector-drawer {
    transform: translateY(100%);
  }
}
</style>
