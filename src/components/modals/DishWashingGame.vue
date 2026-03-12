<template>
  <teleport to="body">
    <transition name="modal">
      <div v-if="visible" class="game-overlay" @click.self="handleClose">
        <div class="game-modal">
          <!-- 頭部 -->
          <div class="modal-header">
            <div class="header-left">
              <div class="game-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <ellipse cx="12" cy="5" rx="9" ry="3" />
                  <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
                  <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
                </svg>
              </div>
              <div class="header-info">
                <h3>刷盤子打工</h3>
                <p class="subtitle">滑動清洗盤子賺取金幣</p>
              </div>
            </div>
            <button class="close-btn" @click="handleClose">
              <X :size="20" />
            </button>
          </div>

          <!-- 可滾動內容區 -->
          <div class="modal-body">
            <!-- 進度資訊 -->
            <div class="progress-section">
              <div class="progress-info">
                <div class="progress-item">
                  <Coins :size="16" />
                  <span>餘額：{{ balance.toLocaleString() }}</span>
                </div>
                <div class="progress-item">
                  <Target :size="16" />
                  <span
                    >今日：{{ workState.dishesWashedToday }} /
                    {{ dailyLimit }}</span
                  >
                </div>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-fill"
                  :style="{
                    width: `${(workState.dishesWashedToday / dailyLimit) * 100}%`,
                  }"
                />
              </div>
              <div v-if="efficiencyMultiplier > 1" class="efficiency-badge">
                <Zap :size="14" />
                <span>效率加成 x{{ efficiencyMultiplier.toFixed(1) }}</span>
              </div>
            </div>

            <!-- 遊戲區域 -->
            <div class="game-area">
              <!-- 盤子 -->
              <div
                class="dish-container"
                :class="{
                  washing: isWashing,
                  clean: dishClean,
                  disabled: !canWash,
                }"
              >
                <div
                  class="dish"
                  @touchstart="handleTouchStart"
                  @touchmove="handleTouchMove"
                  @touchend="handleTouchEnd"
                  @mousedown="handleMouseDown"
                  @mousemove="handleMouseMove"
                  @mouseup="handleMouseUp"
                  @mouseleave="handleMouseUp"
                >
                  <!-- 盤子圖案 -->
                  <svg class="dish-svg" viewBox="0 0 200 200">
                    <ellipse
                      cx="100"
                      cy="100"
                      rx="90"
                      ry="90"
                      class="dish-outer"
                    />
                    <ellipse
                      cx="100"
                      cy="100"
                      rx="70"
                      ry="70"
                      class="dish-inner"
                    />
                    <ellipse
                      cx="100"
                      cy="100"
                      rx="40"
                      ry="40"
                      class="dish-center"
                    />
                  </svg>

                  <!-- 髒污效果 -->
                  <div
                    v-if="!dishClean"
                    class="dirt-overlay"
                    :style="{ opacity: 1 - washProgress }"
                  >
                    <div
                      v-for="i in 8"
                      :key="i"
                      class="dirt-spot"
                      :style="getDirtStyle(i)"
                    />
                  </div>

                  <!-- 清洗進度環 -->
                  <svg class="progress-ring" viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="95" class="progress-bg" />
                    <circle
                      cx="100"
                      cy="100"
                      r="95"
                      class="progress-value"
                      :style="{ strokeDashoffset: progressOffset }"
                    />
                  </svg>

                  <!-- 水花效果 -->
                  <div v-if="isWashing" class="water-effects">
                    <div
                      v-for="i in 6"
                      :key="i"
                      class="water-drop"
                      :style="getWaterDropStyle(i)"
                    />
                  </div>
                </div>

                <!-- 提示文字 -->
                <div class="dish-hint">
                  <template v-if="!canWash">
                    <AlertCircle :size="20" />
                    <span>今日已達上限，明天再來吧！</span>
                  </template>
                  <template v-else-if="dishClean">
                    <CheckCircle :size="20" />
                    <span>洗好了！點擊繼續</span>
                  </template>
                  <template v-else>
                    <Hand :size="20" />
                    <span>在盤子上滑動清洗</span>
                  </template>
                </div>
              </div>
            </div>

            <!-- 獎勵顯示 -->
            <transition name="reward">
              <div v-if="showReward" class="reward-popup">
                <div class="reward-content">
                  <Coins :size="32" />
                  <span class="reward-amount">+{{ lastReward }}</span>
                  <span class="reward-label">金幣</span>
                </div>
              </div>
            </transition>

            <!-- 底部統計 -->
            <div class="stats-section">
              <div class="stat-item">
                <div class="stat-value">{{ workState.totalDishesWashed }}</div>
                <div class="stat-label">累計洗盤</div>
              </div>
              <div class="stat-item highlight">
                <div class="stat-value">{{ sessionEarnings }}</div>
                <div class="stat-label">本次收益</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">
                  {{ dailyLimit - workState.dishesWashedToday }}
                </div>
                <div class="stat-label">剩餘次數</div>
              </div>
            </div>
          </div>
          <!-- 結束 modal-body -->
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { useGameEconomyStore } from "@/stores/gameEconomy";
import {
  AlertCircle,
  CheckCircle,
  Coins,
  Hand,
  Target,
  X,
  Zap,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  visible: boolean;
  chatId?: string;
}>();

const emit = defineEmits<{
  close: [];
  reward: [amount: number];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 遊戲狀態
const isWashing = ref(false);
const washProgress = ref(0);
const dishClean = ref(false);
const showReward = ref(false);
const lastReward = ref(0);
const sessionEarnings = ref(0);

// 滑動追蹤
const lastPosition = ref({ x: 0, y: 0 });
const totalDistance = ref(0);
const REQUIRED_DISTANCE = 500; // 需要滑動的總距離

// 計算屬性
const balance = computed(() => {
  return gameEconomyStore.getBalance(GLOBAL_WALLET_ID);
});

const workState = computed(() => {
  return gameEconomyStore.getWorkState(GLOBAL_WALLET_ID);
});

const dailyLimit = computed(() => {
  return gameEconomyStore.getDishWashingConfig().DAILY_LIMIT;
});

const canWash = computed(() => {
  return gameEconomyStore.canWashDish(GLOBAL_WALLET_ID);
});

const efficiencyMultiplier = computed(() => {
  return gameEconomyStore.calculateWorkEfficiencyMultiplier(GLOBAL_WALLET_ID);
});

const progressOffset = computed(() => {
  const circumference = 2 * Math.PI * 95;
  return circumference * (1 - washProgress.value);
});

// 方法
function handleClose() {
  emit("close");
}

function handleTouchStart(e: TouchEvent) {
  if (!canWash.value || dishClean.value) return;
  e.preventDefault();
  const touch = e.touches[0];
  startWashing(touch.clientX, touch.clientY);
}

function handleTouchMove(e: TouchEvent) {
  if (!isWashing.value) return;
  e.preventDefault();
  const touch = e.touches[0];
  updateWashing(touch.clientX, touch.clientY);
}

function handleTouchEnd() {
  stopWashing();
}

function handleMouseDown(e: MouseEvent) {
  if (!canWash.value || dishClean.value) return;
  startWashing(e.clientX, e.clientY);
}

function handleMouseMove(e: MouseEvent) {
  if (!isWashing.value) return;
  updateWashing(e.clientX, e.clientY);
}

function handleMouseUp() {
  stopWashing();
}

function startWashing(x: number, y: number) {
  isWashing.value = true;
  lastPosition.value = { x, y };
}

function updateWashing(x: number, y: number) {
  const dx = x - lastPosition.value.x;
  const dy = y - lastPosition.value.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  totalDistance.value += distance;
  lastPosition.value = { x, y };

  // 更新進度
  washProgress.value = Math.min(1, totalDistance.value / REQUIRED_DISTANCE);

  // 檢查是否完成
  if (washProgress.value >= 1) {
    completeDish();
  }
}

function stopWashing() {
  isWashing.value = false;
}

async function completeDish() {
  if (dishClean.value) return;

  dishClean.value = true;
  isWashing.value = false;

  // 執行刷盤子邏輯
  const result = gameEconomyStore.washDish(GLOBAL_WALLET_ID);

  if (result.success && result.reward) {
    lastReward.value = result.reward;
    sessionEarnings.value += result.reward;
    showReward.value = true;

    // 保存狀態
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);

    // 發送獎勵事件
    emit("reward", result.reward);

    // 隱藏獎勵動畫
    setTimeout(() => {
      showReward.value = false;
    }, 1500);
  }
}

function resetDish() {
  if (!canWash.value) return;

  dishClean.value = false;
  washProgress.value = 0;
  totalDistance.value = 0;
}

// 點擊乾淨的盤子重置
function handleDishClick() {
  if (dishClean.value && canWash.value) {
    resetDish();
  }
}

// 髒污樣式
function getDirtStyle(index: number) {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  const angle = angles[index - 1] || 0;
  const radius = 25 + (index % 3) * 15;
  const x = 50 + radius * Math.cos((angle * Math.PI) / 180);
  const y = 50 + radius * Math.sin((angle * Math.PI) / 180);
  const size = 8 + (index % 4) * 4;

  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

// 水花樣式
function getWaterDropStyle(index: number) {
  const angle = (index - 1) * 60;
  const delay = index * 0.1;

  return {
    "--angle": `${angle}deg`,
    "--delay": `${delay}s`,
  };
}

// 監聽可見性
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
      // 重置遊戲狀態
      resetDish();
      sessionEarnings.value = 0;
    }
  },
  { immediate: true },
);

// 監聽盤子點擊
watch(dishClean, (clean) => {
  if (clean) {
    // 添加點擊事件監聽
    setTimeout(() => {
      const dish = document.querySelector(".dish");
      if (dish) {
        dish.addEventListener("click", handleDishClick, { once: true });
      }
    }, 100);
  }
});
</script>

<style scoped lang="scss">
.game-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
  padding: 20px;
}

.game-modal {
  background: white;
  border-radius: 24px;
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

// ===== 可滾動內容區 =====
.modal-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

// ===== 頭部 =====
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .game-icon {
    width: 44px;
    height: 44px;
    background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 24px;
      height: 24px;
      color: white;
    }
  }

  .header-info {
    h3 {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      color: #1f2937;
    }

    .subtitle {
      margin: 2px 0 0;
      font-size: 12px;
      color: #9ca3af;
    }
  }

  .close-btn {
    width: 36px;
    height: 36px;
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

// ===== 進度區域 =====
.progress-section {
  padding: 16px 20px;
  background: #f9fafb;

  .progress-info {
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .progress-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #6b7280;
  }

  .progress-bar {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #60a5fa 0%, #3b82f6 100%);
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .efficiency-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-top: 10px;
    padding: 4px 10px;
    background: #fef3c7;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    color: #d97706;
  }
}

// ===== 遊戲區域 =====
.game-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  min-height: 280px;
}

.dish-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  &.disabled {
    opacity: 0.6;
    pointer-events: none;
  }
}

.dish {
  position: relative;
  width: 200px;
  height: 200px;
  cursor: grab;
  user-select: none;
  touch-action: none;

  &:active {
    cursor: grabbing;
  }

  .dish-svg {
    width: 100%;
    height: 100%;

    .dish-outer {
      fill: #f3f4f6;
      stroke: #d1d5db;
      stroke-width: 2;
    }

    .dish-inner {
      fill: #fafafa;
      stroke: #e5e7eb;
      stroke-width: 1;
    }

    .dish-center {
      fill: #f9fafb;
      stroke: #e5e7eb;
      stroke-width: 1;
    }
  }
}

.dirt-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.dirt-spot {
  position: absolute;
  background: #a78b6e;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.6;
}

.progress-ring {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
  pointer-events: none;

  .progress-bg {
    fill: none;
    stroke: #e5e7eb;
    stroke-width: 4;
  }

  .progress-value {
    fill: none;
    stroke: #3b82f6;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 597; // 2 * PI * 95
    transition: stroke-dashoffset 0.1s ease;
  }
}

.water-effects {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.water-drop {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #60a5fa;
  border-radius: 50%;
  opacity: 0.7;
  animation: waterSplash 0.6s ease-out infinite;
  animation-delay: var(--delay);
  transform-origin: center;

  @keyframes waterSplash {
    0% {
      transform: translate(-50%, -50%) scale(0);
      opacity: 0.7;
    }
    100% {
      transform: translate(-50%, -50%)
        translateX(calc(cos(var(--angle)) * 60px))
        translateY(calc(sin(var(--angle)) * 60px)) scale(1);
      opacity: 0;
    }
  }
}

.dish-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: #6b7280;
  padding: 8px 16px;
  background: #f3f4f6;
  border-radius: 20px;
}

.dish-container.clean .dish-hint {
  background: #dcfce7;
  color: #16a34a;
}

.dish-container.disabled .dish-hint {
  background: #fee2e2;
  color: #dc2626;
}

// ===== 獎勵彈出 =====
.reward-popup {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10;
}

.reward-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 32px;
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  border-radius: 20px;
  box-shadow: 0 10px 40px rgba(217, 119, 6, 0.3);

  .reward-amount {
    font-size: 32px;
    font-weight: 700;
    color: #d97706;
  }

  .reward-label {
    font-size: 14px;
    color: #92400e;
  }
}

.reward-enter-active {
  animation: rewardPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.reward-leave-active {
  animation: rewardFade 0.3s ease-out;
}

@keyframes rewardPop {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.5);
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@keyframes rewardFade {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -70%) scale(0.8);
  }
}

// ===== 統計區域 =====
.stats-section {
  display: flex;
  justify-content: space-around;
  padding: 16px 20px;
  background: #f9fafb;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: #374151;
  }

  .stat-label {
    font-size: 12px;
    color: #9ca3af;
  }

  &.highlight .stat-value {
    color: #d97706;
  }
}

// ===== 動畫 =====
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.25s;

  .game-modal {
    transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .game-modal {
    transform: scale(0.9);
  }
}

// ===== 響應式 =====
@media (max-width: 480px) {
  .game-overlay {
    padding: 0;
    align-items: flex-end;
  }

  .game-modal {
    max-width: 100%;
    max-height: 85vh;
    border-radius: 24px 24px 0 0;
  }

  .dish {
    width: 180px;
    height: 180px;
  }
}
</style>
