<template>
  <teleport to="body">
    <transition name="slide-up">
      <div v-if="visible" class="dice-screen">
        <div class="topbar">
          <button class="round-btn" @click="handleClose" aria-label="返回">
            <ChevronLeft />
          </button>
          <div class="title">骰子</div>
          <div class="coins-capsule" :aria-label="`金幣 ${balance}`">
            <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
              <circle cx="10" cy="10" r="9" fill="#E8A93A"/><circle cx="10" cy="10" r="6" fill="none" stroke="#FFF1CF" stroke-width="1.5"/><path d="M10 7v6" stroke="#FFF1CF" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <span class="value">{{ balance.toLocaleString() }}</span>
          </div>
        </div>

        <div class="dice-table">
          <div class="dice-cube" :class="{ rolling: isRolling }">
            <div class="grid">
              <div v-for="i in 9" :key="i" class="dot-slot">
                <div v-if="isDotVisible(displayDiceValue, i-1)" class="dot" :style="{ backgroundColor: getDotColor(displayDiceValue, i-1) }"></div>
              </div>
            </div>
          </div>
          <div class="dice-info">
            <div class="label">點數</div>
            <div class="number">{{ displayDiceValue }}</div>
            <div class="verdict">{{ getVerdictText }}</div>
          </div>
        </div>

        <div class="bet-card">
          <div class="bet-header">
            <span class="title">你押</span>
            <span class="hint">小 1–3 · 大 4–6</span>
          </div>
          <div class="choice-group">
            <button class="choice-btn" :class="{ active: selectedChoice === 'small' }" @click="selectedChoice = 'small'" :disabled="isRolling" :aria-pressed="selectedChoice === 'small'">小</button>
            <button class="choice-btn" :class="{ active: selectedChoice === 'big' }" @click="selectedChoice = 'big'" :disabled="isRolling" :aria-pressed="selectedChoice === 'big'">大</button>
          </div>
          <div class="bet-input-row">
            <span>下注</span>
            <div class="input-group">
              <button class="adjust-btn" @click="adjustBet(-10)" :disabled="betAmount <= minBet || isRolling" aria-label="減少下注"><Minus :size="18" /></button>
              <input v-model.number="betAmount" type="number" class="bet-input" />
              <button class="adjust-btn" @click="adjustBet(10)" :disabled="betAmount >= Math.min(maxBet, balance) || isRolling" aria-label="增加下注"><Plus :size="18" /></button>
            </div>
          </div>
          <div class="quick-bets">
            <button v-for="amt in [10, 50, 100, 500]" :key="amt" class="quick-btn" @click="betAmount = Math.min(amt, balance)">{{ amt }}</button>
            <button class="quick-btn" @click="betAmount = Math.min(maxBet, balance)">最大</button>
          </div>
          <div class="limit-info">今日 {{ gamblingStats.todayGambles }} / {{ dailyLimit }} · 下注範圍 {{ minBet }}–{{ maxBet }}</div>
        </div>

        <div class="result-capsule" :class="getResultClass">
          {{ getResultText }}
        </div>

        <button class="roll-btn" :disabled="!canGamble || isRolling || !selectedChoice" @click="roll">
          {{ !selectedChoice ? '先押大或小' : isRolling ? '擲骰中…' : '擲骰子' }}
        </button>

        <div v-if="recentRolls.length > 0" class="recent-rolls">
          <span class="label">最近</span>
          <div class="list">
            <div v-for="(roll, i) in recentRolls" :key="i" class="roll-tag" :class="roll > 3 ? 'big' : 'small'">{{ roll }}</div>
          </div>
        </div>

        <div class="stats-footer">勝 {{ gamblingStats.totalWins }} · 敗 {{ gamblingStats.totalLosses }} · 勝率 {{ winRate }}%</div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { useGameEconomyStore, type GambleChoice, type GambleResult } from "@/stores/gameEconomy";
import { ChevronLeft, Minus, Plus } from "lucide-vue-next";
import { computed, ref, watch, onUnmounted } from "vue";

const props = defineProps<{ visible: boolean; chatId?: string; }>();
const emit = defineEmits<{ close: []; result: [result: GambleResult]; }>();
const gameEconomyStore = useGameEconomyStore();
const GLOBAL_WALLET_ID = "global";

const isRolling = ref(false);
const showResult = ref(false);
const displayDiceValue = ref(1);
const selectedChoice = ref<GambleChoice | null>(null);
const lastResult = ref<GambleResult | null>(null);
const errorMessage = ref("");
const betAmount = ref(10);
const recentRolls = ref<number[]>([]);
let rollInterval: ReturnType<typeof setInterval> | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

try {
  const saved = localStorage.getItem("dice-recent-rolls");
  if (saved) recentRolls.value = JSON.parse(saved);
} catch (e) {}

const balance = computed(() => gameEconomyStore.getBalance(GLOBAL_WALLET_ID));
const gamblingStats = computed(() => gameEconomyStore.getGamblingStats(GLOBAL_WALLET_ID));
const dailyLimit = computed(() => gameEconomyStore.getGamblingConfig().DAILY_LIMIT);
const minBet = computed(() => gameEconomyStore.getGamblingConfig().MIN_BET);
const maxBet = computed(() => gameEconomyStore.getGamblingConfig().MAX_BET);
const canGamble = computed(() => gameEconomyStore.canGamble(GLOBAL_WALLET_ID) && betAmount.value >= minBet.value && betAmount.value <= Math.min(maxBet.value, balance.value));
const winRate = computed(() => {
  const total = gamblingStats.value.totalWins + gamblingStats.value.totalLosses;
  return total === 0 ? 0 : Math.round((gamblingStats.value.totalWins / total) * 100);
});

const getVerdictText = computed(() => {
  if (isRolling.value) return "…";
  if (displayDiceValue.value === 0) return "";
  return displayDiceValue.value > 3 ? "大" : "小";
});

const getResultClass = computed(() => {
  if (errorMessage.value) return "lose";
  if (!showResult.value) return "";
  return lastResult.value?.won ? "win" : "lose";
});

const getResultText = computed(() => {
  if (errorMessage.value) return errorMessage.value;
  if (!showResult.value) return "押大或小，再擲骰子";
  const n = Math.abs(lastResult.value?.netAmount || 0);
  return lastResult.value?.won ? `猜中了！+${n} 金幣` : `沒中，−${n} 金幣`;
});

function isDotVisible(v: number, index: number) {
  const map: Record<number, number[]> = {1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8]};
  return map[v]?.includes(index);
}
function getDotColor(v: number, index: number) {
  return isDotVisible(v, index) && (v === 1 || v === 4) ? "#C2273F" : "#121214";
}

function handleClose() { emit("close"); }
function adjustBet(delta: number) { betAmount.value = Math.max(minBet.value, Math.min(maxBet.value, balance.value, betAmount.value + delta)); }

async function roll() {
  if (!selectedChoice.value || isRolling.value) return;
  errorMessage.value = "";
  showResult.value = false;
  isRolling.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  
  let count = 0;
  rollInterval = setInterval(() => {
    displayDiceValue.value = Math.floor(Math.random() * 6) + 1;
    if (++count >= 15) {
      clearInterval(rollInterval!);
      rollInterval = null;
      executeGamble(selectedChoice.value!);
    }
  }, 100);
}

async function executeGamble(choice: GambleChoice) {
  const res = gameEconomyStore.gamble(GLOBAL_WALLET_ID, betAmount.value, choice);
  if (res.success) {
    displayDiceValue.value = res.diceValue!;
    lastResult.value = res;
    recentRolls.value.unshift(res.diceValue!);
    if (recentRolls.value.length > 8) recentRolls.value.pop();
    try { localStorage.setItem("dice-recent-rolls", JSON.stringify(recentRolls.value)); } catch (e) {}
    await gameEconomyStore.saveState(GLOBAL_WALLET_ID);
    isRolling.value = false;
    showResult.value = true;
    emit("result", res);
    hideTimer = setTimeout(() => { showResult.value = false; }, 3000);
  } else {
    isRolling.value = false;
    switch (res.error) {
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

function stopTimers() {
  if (rollInterval) clearInterval(rollInterval);
  if (hideTimer) clearTimeout(hideTimer);
  rollInterval = null;
  hideTimer = null;
}

watch(
  () => props.visible,
  async (visible) => {
    if (!visible) {
      stopTimers();
      return;
    }
    await gameEconomyStore.loadState(GLOBAL_WALLET_ID);
    isRolling.value = false;
    showResult.value = false;
    lastResult.value = null;
    errorMessage.value = "";
    displayDiceValue.value = recentRolls.value[0] ?? 1;
    betAmount.value = Math.max(minBet.value, Math.min(10, balance.value));
  },
  { immediate: true },
);

// 餘額變少時，下注金額不超過餘額
watch(balance, (newBalance) => {
  if (betAmount.value > newBalance) {
    betAmount.value = Math.max(minBet.value, Math.min(newBalance, maxBet.value));
  }
});

onUnmounted(stopTimers);
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;
.dice-screen {
  @include gs.screen;
  --dc-accent: #B4334E; --dc-felt: #6E2A38; --dc-felt-edge: #5A2230;
  gap: 16px; z-index: 1000; background: color-mix(in srgb, #B4334E 8%, var(--g-bg)); overflow-y: auto;
}
.topbar { @include gs.topbar; }
.round-btn { @include gs.round-btn; }
.title { font-size: 17px; font-weight: 700; }
.coins-capsule {
  display: flex; align-items: center; gap: 6px; height: 36px; padding: 0 12px 0 8px; border-radius: 18px;
  background: var(--g-surface);
  .value { font-family: var(--g-num); font-size: 14px; font-weight: 600; }
}
.dice-table {
  width: 100%; height: clamp(200px, 30dvh, 280px); border-radius: 32px; background: var(--dc-felt);
  box-shadow: inset 0 0 0 8px var(--dc-felt-edge); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 24px;
}
.dice-cube {
  width: 88px; height: 88px; background: white; border-radius: 22px; box-shadow: 0 7px 0 #D9CED1, 0 14px 22px rgba(0,0,0,0.3); transform: rotate(-6deg);
  padding: 14px; box-sizing: border-box; &.rolling { animation: shake 0.2s infinite; }
  .grid { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 3px; }
}
.dot-slot { display: flex; align-items: center; justify-content: center; }
.dot { width: 15px; height: 15px; border-radius: 50%; }
.dice-info { display: flex; align-items: baseline; gap: 10px; color: #fff; .label { font-size: 14px; color: #F1D3D9; } }
.number { font-family: var(--g-num); font-size: 42px; font-weight: 700; line-height: 1; }
.verdict { font-size: 20px; font-weight: 700; }
.bet-card { box-sizing: border-box; background: var(--g-surface); border-radius: 24px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.bet-header { display: flex; justify-content: space-between; font-size: 15px; font-weight: 700; }
.choice-group { display: flex; gap: 8px; }
.choice-btn { flex: 1; height: 52px; color: var(--g-text); font-family: inherit; cursor: pointer; border-radius: 14px; border: 1px solid var(--g-border); font-size: 20px; font-weight: 700; background: color-mix(in srgb, var(--dc-accent) 6%, var(--g-surface)); &.active { background: var(--g-text); color: var(--g-surface); border: 2px solid var(--g-text); } }
.bet-input-row { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
.input-group { display: flex; align-items: center; gap: 8px; }
.adjust-btn { width: 44px; height: 44px; border-radius: 50%; border: none; background: var(--g-muted); color: var(--g-text); cursor: pointer; &:disabled { opacity: 0.4; } display: flex; align-items: center; justify-content: center; }
.bet-input { width: 64px; font-family: var(--g-num); color: var(--g-text); text-align: center; font-size: 20px; font-weight: 600; background: transparent; border: none; }
.quick-bets { display: flex; gap: 6px; }
.quick-btn { flex: 1; height: 30px; border-radius: 15px; background: var(--g-muted); color: var(--g-text); border: none; font-size: 12px; font-family: var(--g-num); cursor: pointer; }
.limit-info { font-size: 11px; color: var(--g-text-2); text-align: center; }
.result-capsule { align-self: center; flex-shrink: 0; height: 32px; display: flex; align-items: center; justify-content: center; padding: 0 14px; border-radius: 16px; font-size: 13px; font-weight: 700; color: var(--g-text-2); &.win { background: #E4F2E8; color: #22663A; } &.lose { background: #F3E1E5; color: #8E1F35; } }
.roll-btn { flex-shrink: 0; font-family: inherit; cursor: pointer; height: 60px; border-radius: 30px; background: var(--dc-accent); color: white; font-size: 18px; font-weight: 700; border: none; width: 100%; &:disabled { opacity: 0.5; } }
.recent-rolls { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--g-text-2); }
.list { display: flex; gap: 4px; }
.roll-tag { font-family: var(--g-num); min-width: 32px; height: 28px; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; &.big { background: var(--dc-accent); color: white; } &.small { background: var(--g-text); color: var(--g-surface); } }
.stats-footer { font-size: 12px; color: var(--g-text-2); text-align: center; }
@keyframes shake { 0%, 100% { transform: rotate(-6deg); } 50% { transform: rotate(-4deg); } }
.slide-up-enter-active, .slide-up-leave-active { transition: 0.25s; }
.slide-up-enter-from, .slide-up-leave-to { transform: translateY(24px); opacity: 0; }
</style>