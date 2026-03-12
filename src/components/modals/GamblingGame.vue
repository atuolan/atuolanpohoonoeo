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
                  <rect x="2" y="2" width="20" height="20" rx="2" />
                  <circle cx="8" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="8" r="1.5" fill="currentColor" />
                  <circle cx="8" cy="16" r="1.5" fill="currentColor" />
                  <circle cx="16" cy="16" r="1.5" fill="currentColor" />
                  <circle cx="12" cy="12" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <div class="header-info">
                <h3>猜大小</h3>
                <p class="subtitle">擲骰子，猜大小，贏雙倍</p>
              </div>
            </div>
            <button class="close-btn" @click="handleClose">
              <X :size="20" />
            </button>
          </div>

          <!-- 可滾動內容區 -->
          <div class="modal-body">
            <!-- 餘額和次數 -->
            <div class="status-section">
              <div class="status-item">
                <Coins :size="18" />
                <span class="label">餘額</span>
                <span class="value">{{ balance.toLocaleString() }}</span>
              </div>
              <div class="status-item">
                <Target :size="18" />
                <span class="label">今日</span>
                <span class="value"
                  >{{ gamblingStats.todayGambles }} / {{ dailyLimit }}</span
                >
              </div>
            </div>

            <!-- 遊戲區域 -->
            <div class="game-area">
              <!-- 骰子 -->
              <div
                class="dice-container"
                :class="{ rolling: isRolling, result: showResult }"
              >
                <div class="dice" :class="`dice-${displayDiceValue}`">
                  <div class="dice-face front">
                    <template
                      v-for="i in getDiceDots(displayDiceValue)"
                      :key="i"
                    >
                      <div class="dot" />
                    </template>
                  </div>
                </div>
              </div>

              <!-- 結果顯示 -->
              <transition name="result">
                <div
                  v-if="showResult"
                  class="result-display"
                  :class="{ win: lastResult?.won, lose: !lastResult?.won }"
                >
                  <div class="result-text">
                    <template v-if="lastResult?.won">
                      <TrendingUp :size="24" />
                      <span>贏了！</span>
                    </template>
                    <template v-else>
                      <TrendingDown :size="24" />
                      <span>輸了...</span>
                    </template>
                  </div>
                  <div
                    class="result-amount"
                    :class="{ positive: lastResult?.won }"
                  >
                    {{ lastResult?.won ? "+" : "" }}{{ lastResult?.netAmount }}
                  </div>
                </div>
              </transition>

              <!-- 規則說明 -->
              <div class="rules-hint">
                <span>1-3 為小，4-6 為大</span>
              </div>
            </div>

            <!-- 下注區域 -->
            <div class="betting-section">
              <!-- 下注金額 -->
              <div class="bet-amount-section">
                <label>下注金額</label>
                <div class="bet-input-wrapper">
                  <button
                    class="adjust-btn"
                    @click="adjustBet(-10)"
                    :disabled="betAmount <= minBet"
                  >
                    <Minus :size="18" />
                  </button>
                  <div class="bet-display">
                    <Coins :size="18" />
                    <input
                      v-model.number="betAmount"
                      type="number"
                      :min="minBet"
                      :max="Math.min(maxBet, balance)"
                      class="bet-input"
                    />
                  </div>
                  <button
                    class="adjust-btn"
                    @click="adjustBet(10)"
                    :disabled="betAmount >= Math.min(maxBet, balance)"
                  >
                    <Plus :size="18" />
                  </button>
                </div>
                <div class="bet-range">
                  下注範圍：{{ minBet }} - {{ maxBet }}
                </div>
              </div>

              <!-- 快速下注 -->
              <div class="quick-bets">
                <button
                  v-for="amount in quickBetAmounts"
                  :key="amount"
                  class="quick-bet-btn"
                  :disabled="amount > balance"
                  @click="betAmount = Math.min(amount, balance)"
                >
                  {{ amount }}
                </button>
                <button
                  class="quick-bet-btn all-in"
                  :disabled="balance <= 0"
                  @click="betAmount = Math.min(maxBet, balance)"
                >
                  最大
                </button>
              </div>

              <!-- 選擇大小 -->
              <div class="choice-section">
                <button
                  class="choice-btn small"
                  :class="{ selected: selectedChoice === 'small' }"
                  :disabled="!canGamble || isRolling"
                  @click="selectAndGamble('small')"
                >
                  <div class="choice-label">小</div>
                  <div class="choice-range">1-3</div>
                </button>
                <button
                  class="choice-btn big"
                  :class="{ selected: selectedChoice === 'big' }"
                  :disabled="!canGamble || isRolling"
                  @click="selectAndGamble('big')"
                >
                  <div class="choice-label">大</div>
                  <div class="choice-range">4-6</div>
                </button>
              </div>

              <!-- 錯誤提示 -->
              <div v-if="errorMessage" class="error-message">
                <AlertCircle :size="16" />
                <span>{{ errorMessage }}</span>
              </div>
            </div>

            <!-- 統計區域 -->
            <div class="stats-section">
              <div class="stat-item">
                <div class="stat-value win">{{ gamblingStats.totalWins }}</div>
                <div class="stat-label">勝場</div>
              </div>
              <div class="stat-item">
                <div class="stat-value lose">
                  {{ gamblingStats.totalLosses }}
                </div>
                <div class="stat-label">敗場</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ winRate }}%</div>
                <div class="stat-label">勝率</div>
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
import {
  useGameEconomyStore,
  type GambleChoice,
  type GambleResult,
} from "@/stores/gameEconomy";
import {
  AlertCircle,
  Coins,
  Minus,
  Plus,
  Target,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  visible: boolean;
  chatId?: string;
}>();

const emit = defineEmits<{
  close: [];
  result: [result: GambleResult];
}>();

// Store
const gameEconomyStore = useGameEconomyStore();

// 全局錢包 ID
const GLOBAL_WALLET_ID = "global";

// 遊戲狀態
const isRolling = ref(false);
const showResult = ref(false);
const displayDiceValue = ref(1);
const selectedChoice = ref<GambleChoice | null>(null);
const lastResult = ref<GambleResult | null>(null);
const errorMessage = ref("");
const betAmount = ref(10);

// 配置
const quickBetAmounts = [10, 50, 100, 500];

// 計算屬性
const balance = computed(() => {
  return gameEconomyStore.getBalance(GLOBAL_WALLET_ID);
});

const gamblingStats = computed(() => {
  return gameEconomyStore.getGamblingStats(GLOBAL_WALLET_ID);
});

const gamblingConfig = computed(() => {
  return gameEconomyStore.getGamblingConfig();
});

const dailyLimit = computed(() => gamblingConfig.value.DAILY_LIMIT);
const minBet = computed(() => gamblingConfig.value.MIN_BET);
const maxBet = computed(() => gamblingConfig.value.MAX_BET);

const canGamble = computed(() => {
  return (
    gameEconomyStore.canGamble(GLOBAL_WALLET_ID) &&
    balance.value >= betAmount.value &&
    betAmount.value >= minBet.value &&
    betAmount.value <= maxBet.value
  );
});

const winRate = computed(() => {
  const total = gamblingStats.value.totalWins + gamblingStats.value.totalLosses;
  if (total === 0) return 0;
  return Math.round((gamblingStats.value.totalWins / total) * 100);
});

// 方法
function handleClose() {
  emit("close");
}

function adjustBet(delta: number) {
  const newAmount = betAmount.value + delta;
  if (
    newAmount >= minBet.value &&
    newAmount <= Math.min(maxBet.value, balance.value)
  ) {
    betAmount.value = newAmount;
  }
}

function getDiceDots(value: number): number[] {
  return Array.from({ length: value }, (_, i) => i + 1);
}

async function selectAndGamble(choice: GambleChoice) {
  if (!canGamble.value || isRolling.value) return;

  selectedChoice.value = choice;
  errorMessage.value = "";
  showResult.value = false;
  isRolling.value = true;

  // 骰子滾動動畫
  let rollCount = 0;
  const rollInterval = setInterval(() => {
    displayDiceValue.value = Math.floor(Math.random() * 6) + 1;
    rollCount++;
    if (rollCount >= 15) {
      clearInterval(rollInterval);

      // 執行賭博邏輯
      executeGamble(choice);
    }
  }, 100);
}

async function executeGamble(choice: GambleChoice) {
  const result = gameEconomyStore.gamble(
    GLOBAL_WALLET_ID,
    betAmount.value,
    choice,
  );

  if (result.success) {
    // 顯示最終骰子值
    displayDiceValue.value = result.diceValue!;
    lastResult.value = result;

    // 保存狀態
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);

    // 顯示結果
    setTimeout(() => {
      isRolling.value = false;
      showResult.value = true;

      // 發送事件
      emit("result", result);

      // 3 秒後隱藏結果
      setTimeout(() => {
        showResult.value = false;
        selectedChoice.value = null;
      }, 3000);
    }, 300);
  } else {
    isRolling.value = false;

    // 顯示錯誤
    switch (result.error) {
      case "insufficient_funds":
        errorMessage.value = "餘額不足";
        break;
      case "daily_limit_reached":
        errorMessage.value = "今日次數已用完，明天再來吧";
        break;
      case "invalid_bet":
        errorMessage.value = `下注金額需在 ${minBet.value}-${maxBet.value} 之間`;
        break;
      default:
        errorMessage.value = "發生錯誤，請重試";
    }
  }
}

// 監聽可見性
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
      // 重置狀態
      isRolling.value = false;
      showResult.value = false;
      selectedChoice.value = null;
      lastResult.value = null;
      errorMessage.value = "";
      displayDiceValue.value = 1;
      betAmount.value = Math.min(10, balance.value);
    }
  },
  { immediate: true },
);

// 監聽餘額變化，確保下注金額不超過餘額
watch(balance, (newBalance) => {
  if (betAmount.value > newBalance) {
    betAmount.value = Math.max(
      minBet.value,
      Math.min(newBalance, maxBet.value),
    );
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
    background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%);
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

// ===== 狀態區域 =====
.status-section {
  display: flex;
  justify-content: space-around;
  padding: 12px 20px;
  background: #f9fafb;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #6b7280;

  .label {
    font-size: 13px;
  }

  .value {
    font-size: 15px;
    font-weight: 600;
    color: #374151;
  }
}

// ===== 遊戲區域 =====
.game-area {
  padding: 24px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  background: linear-gradient(180deg, #fdf2f8 0%, #fce7f3 100%);
}

.dice-container {
  width: 100px;
  height: 100px;
  perspective: 600px;

  &.rolling .dice {
    animation: rollDice 0.1s linear infinite;
  }

  &.result .dice {
    animation: diceResult 0.3s ease-out;
  }
}

.dice {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
  transition: transform 0.3s;
}

.dice-face {
  position: absolute;
  width: 100%;
  height: 100%;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  padding: 16px;
  gap: 8px;
}

.dot {
  width: 16px;
  height: 16px;
  background: #1f2937;
  border-radius: 50%;
}

// 骰子點數佈局
.dice-1 .dice-face {
  .dot {
    margin: auto;
  }
}

.dice-2 .dice-face {
  justify-content: space-between;
  .dot:first-child {
    align-self: flex-start;
  }
  .dot:last-child {
    align-self: flex-end;
  }
}

.dice-3 .dice-face {
  justify-content: space-between;
  .dot:first-child {
    align-self: flex-start;
  }
  .dot:nth-child(2) {
    align-self: center;
  }
  .dot:last-child {
    align-self: flex-end;
  }
}

.dice-4 .dice-face {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  place-items: center;
}

.dice-5 .dice-face {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  place-items: center;
  .dot:nth-child(1) {
    grid-area: 1 / 1;
  }
  .dot:nth-child(2) {
    grid-area: 1 / 3;
  }
  .dot:nth-child(3) {
    grid-area: 2 / 2;
  }
  .dot:nth-child(4) {
    grid-area: 3 / 1;
  }
  .dot:nth-child(5) {
    grid-area: 3 / 3;
  }
}

.dice-6 .dice-face {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  place-items: center;
}

@keyframes rollDice {
  0% {
    transform: rotateX(0deg) rotateY(0deg);
  }
  25% {
    transform: rotateX(90deg) rotateY(90deg);
  }
  50% {
    transform: rotateX(180deg) rotateY(180deg);
  }
  75% {
    transform: rotateX(270deg) rotateY(270deg);
  }
  100% {
    transform: rotateX(360deg) rotateY(360deg);
  }
}

@keyframes diceResult {
  0% {
    transform: scale(1.2);
  }
  50% {
    transform: scale(0.9);
  }
  100% {
    transform: scale(1);
  }
}

.result-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 24px;
  border-radius: 16px;
  animation: resultPop 0.3s ease-out;

  &.win {
    background: #dcfce7;
    color: #16a34a;
  }

  &.lose {
    background: #fee2e2;
    color: #dc2626;
  }

  .result-text {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
  }

  .result-amount {
    font-size: 24px;
    font-weight: 700;

    &.positive {
      color: #16a34a;
    }
  }
}

@keyframes resultPop {
  0% {
    opacity: 0;
    transform: scale(0.8);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.result-enter-active {
  animation: resultPop 0.3s ease-out;
}

.result-leave-active {
  animation: resultFade 0.2s ease-in;
}

@keyframes resultFade {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.rules-hint {
  font-size: 13px;
  color: #9ca3af;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
}

// ===== 下注區域 =====
.betting-section {
  padding: 16px 20px;
}

.bet-amount-section {
  margin-bottom: 12px;

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #6b7280;
    margin-bottom: 8px;
  }

  .bet-input-wrapper {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .adjust-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: #f3f4f6;
    border-radius: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #374151;
    transition: all 0.2s;

    &:active:not(:disabled) {
      background: #e5e7eb;
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }

  .bet-display {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    background: #f9fafb;
    border: 2px solid #e5e7eb;
    border-radius: 12px;

    .bet-input {
      width: 80px;
      border: none;
      background: none;
      font-size: 20px;
      font-weight: 600;
      color: #374151;
      text-align: center;
      outline: none;

      &::-webkit-inner-spin-button,
      &::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
    }
  }

  .bet-range {
    text-align: center;
    font-size: 11px;
    color: #9ca3af;
    margin-top: 6px;
  }
}

.quick-bets {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.quick-bet-btn {
  flex: 1;
  min-width: 60px;
  padding: 8px 12px;
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  cursor: pointer;
  transition: all 0.2s;

  &:active:not(:disabled) {
    background: #e5e7eb;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.all-in {
    background: #fef3c7;
    border-color: #fcd34d;
    color: #d97706;
  }
}

.choice-section {
  display: flex;
  gap: 12px;
}

.choice-btn {
  flex: 1;
  padding: 16px;
  border: 2px solid #e5e7eb;
  border-radius: 16px;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .choice-label {
    font-size: 24px;
    font-weight: 700;
  }

  .choice-range {
    font-size: 13px;
    color: #9ca3af;
  }

  &.small {
    .choice-label {
      color: #3b82f6;
    }

    &.selected,
    &:active:not(:disabled) {
      background: #eff6ff;
      border-color: #3b82f6;
    }
  }

  &.big {
    .choice-label {
      color: #ef4444;
    }

    &.selected,
    &:active:not(:disabled) {
      background: #fef2f2;
      border-color: #ef4444;
    }
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.error-message {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  padding: 10px;
  background: #fee2e2;
  border-radius: 10px;
  font-size: 13px;
  color: #dc2626;
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

    &.win {
      color: #16a34a;
    }
    &.lose {
      color: #dc2626;
    }
  }

  .stat-label {
    font-size: 12px;
    color: #9ca3af;
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
    max-height: 90vh;
    border-radius: 24px 24px 0 0;
  }

  .dice-container {
    width: 80px;
    height: 80px;
  }

  .dot {
    width: 12px;
    height: 12px;
  }
}
</style>
