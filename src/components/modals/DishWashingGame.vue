<template>
  <teleport to="body">
    <transition name="dish-fade">
      <div v-if="visible" class="dish-screen">
        <header class="gs-topbar">
          <button class="gs-round-btn" @click="handleClose" aria-label="返回">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <h2 class="gs-title">洗碗</h2>
          <span class="coin-capsule" :aria-label="`金幣 ${balance}`">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#E8A93A"/><circle cx="10" cy="10" r="6" fill="none" stroke="#FFF1CF" stroke-width="1.5"/><path d="M10 7v6" stroke="#FFF1CF" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span class="balance-text">{{ balance.toLocaleString() }}</span>
          </span>
        </header>

        <div class="header-row">
          <div class="work-count">
            第 <span class="count-num">{{ Math.min(workState.dishesWashedToday + 1, dailyLimit) }}</span> 盤
            <span class="limit-label"> / {{ dailyLimit }}</span>
          </div>
          <div class="reward-info" v-if="rewardConfig">
            每盤 {{ rewardConfig.min }}-{{ rewardConfig.max }} 金幣
            <template v-if="efficiencyMultiplier > 1"> ×{{ efficiencyMultiplier.toFixed(1) }}</template>
          </div>
        </div>

        <div class="sink">
          <div class="sink-inner">
            <div class="faucet"></div>
            <div class="dish" :class="{ 'washing': isWashing, 'clean': dishClean }" @click="handleDishClick"
                 @touchstart="handleTouchStart" @touchmove.prevent="handleTouchMove" @touchend="handleTouchEnd"
                 @mousedown="handleMouseDown" @mousemove="handleMouseMove" @mouseup="handleMouseUp" @mouseleave="handleMouseUp">
              <div class="plate-inner">
                <div v-if="!dishClean" class="dirt-overlay" :style="{ opacity: 0.9 * (1 - washProgress) }">
                  <div v-for="i in 7" :key="i" class="dirt-spot" :style="getDirtStyle(i)" />
                </div>
                <div v-if="isWashing" class="bubbles">
                  <div v-for="i in 6" :key="i" class="bubble" :style="getBubbleStyle(i)" />
                </div>
                <div v-if="dishClean" class="success-stars">★★★</div>
              </div>
            </div>
            <div class="sponge"></div>
          </div>
          <transition name="reward-float">
            <div v-if="showReward" class="reward-float">+{{ lastReward }}</div>
          </transition>
        </div>

        <div class="status-section">
          <div class="status-top">
            <span class="status-label">乾淨度</span>
            <span class="status-pct">{{ Math.round(washProgress * 100) }}%</span>
          </div>
          <div class="progress-track"><div class="progress-fill" :style="{ width: `${washProgress * 100}%` }"/></div>
          <div class="status-text">{{ statusText }}</div>
        </div>

        <div class="stats-row">累計 {{ workState.totalDishesWashed }} 盤 · 這次賺了 {{ sessionEarnings }} · 今天還能洗 {{ dailyLimit - workState.dishesWashedToday }} 盤</div>

        <button class="main-btn" :disabled="!canWash && !dishClean" @click="handleMainBtn">
          {{ btnText }}
        </button>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { useGameEconomyStore } from "@/stores/gameEconomy";
import { computed, ref, watch, onUnmounted } from "vue";

const props = defineProps<{ visible: boolean; chatId?: string }>();
const emit = defineEmits<{ close: []; reward: [amount: number] }>();

const gameEconomyStore = useGameEconomyStore();
const GLOBAL_WALLET_ID = "global";

const isWashing = ref(false);
const washProgress = ref(0);
const dishClean = ref(false);
const showReward = ref(false);
const lastReward = ref(0);
const sessionEarnings = ref(0);
const lastPosition = ref({ x: 0, y: 0 });
const totalDistance = ref(0);
const REQUIRED_DISTANCE = 500;
let rewardTimeout: ReturnType<typeof setTimeout> | null = null;

const balance = computed(() => gameEconomyStore.getBalance(GLOBAL_WALLET_ID));
const workState = computed(() => gameEconomyStore.getWorkState(GLOBAL_WALLET_ID));
const dailyLimit = computed(() => gameEconomyStore.getDishWashingConfig().DAILY_LIMIT);
const canWash = computed(() => gameEconomyStore.canWashDish(GLOBAL_WALLET_ID));
const efficiencyMultiplier = computed(() => gameEconomyStore.calculateWorkEfficiencyMultiplier(GLOBAL_WALLET_ID));
const rewardConfig = computed(() => {
    const config = gameEconomyStore.getDishWashingConfig();
    return { min: config.BASE_REWARD_MIN, max: config.BASE_REWARD_MAX };
});

const statusText = computed(() => {
    if (!canWash.value && !dishClean.value) return "今天洗夠了，明天再來吧";
    if (dishClean.value) return "亮晶晶！可以拿去晾乾了";
    if (washProgress.value === 0) return "油油的，在盤子上來回滑動，或按下面的刷一下";
    return "再刷幾下就乾淨了";
});

const btnText = computed(() => {
    if (!canWash.value && !dishClean.value) return "今天洗夠了";
    if (dishClean.value) return `下一盤　+${lastReward.value}`;
    return "刷一下";
});

function handleClose() { emit("close"); }

function startWashing(x: number, y: number) {
    if (!canWash.value || dishClean.value) return;
    isWashing.value = true;
    lastPosition.value = { x, y };
}

function updateWashing(x: number, y: number) {
    if (!isWashing.value) return;
    const distance = Math.sqrt(Math.pow(x - lastPosition.value.x, 2) + Math.pow(y - lastPosition.value.y, 2));
    totalDistance.value += distance;
    lastPosition.value = { x, y };
    washProgress.value = Math.min(1, totalDistance.value / REQUIRED_DISTANCE);
    if (washProgress.value >= 1) completeDish();
}

function stopWashing() { isWashing.value = false; }
const handleTouchStart = (e: TouchEvent) => startWashing(e.touches[0].clientX, e.touches[0].clientY);
const handleTouchMove = (e: TouchEvent) => updateWashing(e.touches[0].clientX, e.touches[0].clientY);
const handleTouchEnd = stopWashing;
const handleMouseDown = (e: MouseEvent) => startWashing(e.clientX, e.clientY);
const handleMouseMove = (e: MouseEvent) => updateWashing(e.clientX, e.clientY);
const handleMouseUp = stopWashing;

function scrubOnce() {
    totalDistance.value += REQUIRED_DISTANCE * 0.2;
    washProgress.value = Math.min(1, totalDistance.value / REQUIRED_DISTANCE);
    navigator.vibrate?.(10);
    if (washProgress.value >= 1) completeDish();
}

async function completeDish() {
    if (dishClean.value) return;
    isWashing.value = false;
    const result = gameEconomyStore.washDish(GLOBAL_WALLET_ID);
    if (result.success) {
        dishClean.value = true;
        lastReward.value = result.reward || 0;
        sessionEarnings.value += lastReward.value;
        showReward.value = true;
        await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
        emit("reward", lastReward.value);
        rewardTimeout = setTimeout(() => { showReward.value = false; }, 1500);
    } else {
        washProgress.value = 0.95;
        totalDistance.value = REQUIRED_DISTANCE * 0.95;
    }
}

function resetDish() {
    if (rewardTimeout) clearTimeout(rewardTimeout);
    dishClean.value = false;
    washProgress.value = 0;
    totalDistance.value = 0;
    showReward.value = false;
}

function handleMainBtn() {
    if (dishClean.value) resetDish();
    else if (canWash.value) scrubOnce();
}

function handleDishClick() { if (dishClean.value && canWash.value) resetDish(); }

// 污漬位置與大小（相對盤子的百分比），照設計稿的 250px 盤子換算
const DIRT_SPOTS = [
  { x: 23, y: 26, w: 19, h: 12, r: -20, c: "#B5793E" },
  { x: 57, y: 22, w: 13, h: 9, r: 15, c: "#C98B4E" },
  { x: 59, y: 59, w: 23, h: 14, r: 30, c: "#A8613A" },
  { x: 27, y: 64, w: 11, h: 8, r: 0, c: "#D6A15E" },
  { x: 44, y: 45, w: 7, h: 5, r: 10, c: "#7E8E3A" },
  { x: 74, y: 38, w: 4, h: 3, r: 0, c: "#A8613A" },
  { x: 38, y: 80, w: 6, h: 4, r: 0, c: "#B5793E" },
];
function getDirtStyle(i: number) {
  const d = DIRT_SPOTS[(i - 1) % DIRT_SPOTS.length];
  return { left: `${d.x}%`, top: `${d.y}%`, width: `${d.w}%`, height: `${d.h}%`, background: d.c, transform: `rotate(${d.r}deg)` };
}
function getBubbleStyle(i: number) { return { left: `${10 + i * 15}%`, top: `${20 + (i % 2) * 40}%` }; }

watch(
  () => props.visible,
  async (v) => {
    if (!v) {
      if (rewardTimeout) clearTimeout(rewardTimeout);
      return;
    }
    await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
    resetDish();
    sessionEarnings.value = 0;
  },
  { immediate: true },
);
onUnmounted(() => { if (rewardTimeout) clearTimeout(rewardTimeout); });
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;
.dish-screen {
  @include gs.screen;
  gap: 16px; z-index: 1000; overflow-y: auto; background: color-mix(in srgb, #3F7A55 9%, var(--g-bg));
  --ds-accent: #3F7A55;
  .gs-topbar { @include gs.topbar; .gs-title { @include gs.title; font-family: inherit; font-size: 17px; } }
  .gs-round-btn { @include gs.round-btn; }
  .coin-capsule { height: 36px; padding: 0 12px 0 8px; border-radius: 18px; background: var(--g-surface); display: flex; align-items: center; gap: 6px; border: none; color: var(--g-text); .balance-text { font-family: var(--g-num); font-size: 14px; font-weight: 600; } }
  .header-row { display: flex; justify-content: space-between; align-items: baseline; }
  .work-count { font-size: 22px; font-weight: 700; }
  .count-num { font-size: 22px; font-weight: 700; font-family: var(--g-num); }
  .limit-label { font-size: 14px; color: var(--g-text-2); }
  .reward-info { font-size: 13px; font-weight: 700; color: var(--ds-accent); }
  .sink { height: clamp(260px, 40dvh, 340px); background: color-mix(in srgb, var(--ds-accent) 18%, var(--g-surface)); border-radius: 36px; padding: 12px; position: relative; }
  .sink-inner { height: 100%; border-radius: 26px; background: linear-gradient(180deg, #DDECF0 0%, #BCD6DE 100%); position: relative; overflow: hidden; display: flex; justify-content: center; align-items: center; }
  .faucet { position: absolute; top: 0; width: 64px; height: 16px; background: #A9B4B0; border-bottom-left-radius: 10px; border-bottom-right-radius: 10px; }
  .sponge { position: absolute; bottom: 8px; right: 8px; width: 78px; height: 48px; background: #F2D36B; border-radius: 12px; border-top: 16px solid #5E9E6E; box-sizing: border-box; transform: rotate(-18deg); box-shadow: 0 6px 12px rgba(0,0,0,0.15); }
  .dish { width: min(250px, 70%); aspect-ratio: 1; background: white; border-radius: 50%; box-shadow: 0 10px 24px rgba(40,70,60,0.18); position: relative; touch-action: none; user-select: none; display: flex; justify-content: center; align-items: center; }
  .plate-inner { width: 68%; height: 68%; border: 2px solid #E3E9E6; border-radius: 50%; }
  .dirt-spot { position: absolute; border-radius: 50%; }
  .bubble { position: absolute; width: 24px; height: 24px; background: rgba(255,255,255,0.75); border: 1.5px solid #9CC9B4; border-radius: 50%; }
  .success-stars { font-size: 40px; color: var(--ds-accent); }
  .reward-float { position: absolute; top: 20%; font-size: 28px; font-weight: 700; color: var(--ds-accent); font-family: var(--g-num); }
  .status-section { display: flex; flex-direction: column; gap: 8px; }
  .status-top { display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; }
  .progress-track { height: 10px; background: color-mix(in srgb, var(--ds-accent) 15%, var(--g-surface)); border-radius: 5px; overflow: hidden; }
  .progress-fill { height: 100%; background: var(--ds-accent); transition: width 0.15s; }
  .status-text { font-size: 12px; color: var(--g-text-2); }
  .stats-row { font-size: 12px; color: var(--g-text-2); text-align: center; margin-top: auto; }
  .main-btn { height: 60px; border-radius: 30px; background: var(--g-text); color: var(--g-surface); border: none; font-size: 18px; font-weight: 700; margin-top: auto; }
  .main-btn:disabled { background: var(--g-text-2); }
}
.dish-fade-enter-active, .dish-fade-leave-active { transition: opacity 0.25s; }
.dish-fade-enter-from, .dish-fade-leave-to { opacity: 0; transform: translateY(24px); }
.reward-float-enter-active { transition: all 0.5s ease-out; }
.reward-float-enter-from { opacity: 0; transform: translateY(-20px); }
</style>
