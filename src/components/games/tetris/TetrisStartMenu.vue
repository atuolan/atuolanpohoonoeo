<template>
  <div class="tetris-start-menu">
    <header class="topbar">
      <button class="back-btn" aria-label="返回" @click="$emit('close')">
        <ChevronLeft />
      </button>
      <h1 class="page-title">俄羅斯方塊</h1>
      <span class="topbar-spacer" aria-hidden="true" />
    </header>

    <section class="difficulty-selection">
      <h2 class="section-title">選擇難度</h2>
      <div class="difficulty-cards">
        <button
          v-for="difficulty in difficulties"
          :key="difficulty.name"
          type="button"
          class="difficulty-card"
          :class="{ selected: selectedDifficulty === difficulty.name }"
          @click="selectDifficulty(difficulty.name)"
        >
          <div class="card-header">
            <h3 class="difficulty-name">{{ difficulty.label }}</h3>
            <span class="multiplier">×{{ difficulty.scoreMultiplier }}</span>
          </div>
          <p class="description">{{ difficulty.description }}</p>
          <div class="tags">
            <span class="tag">起始速度 {{ difficulty.startSpeed }}ms</span>
            <span class="tag">起始等級 {{ difficulty.startLevel }}</span>
            <span class="tag" :class="{ off: !difficulty.ghostEnabled }">
              幽靈方塊 {{ difficulty.ghostEnabled ? "開" : "關" }}
            </span>
            <span class="tag" :class="{ off: !difficulty.holdEnabled }">
              暫存 {{ difficulty.holdEnabled ? "開" : "關" }}
            </span>
          </div>
        </button>
      </div>
    </section>

    <div class="actions">
      <button
        v-if="hasSavedGame"
        class="continue-btn"
        @click="$emit('continue')"
      >
        <PlayCircle />
        繼續上一局
      </button>
      <button class="start-btn" @click="handleStart">
        <Play />
        開始遊戲
      </button>
      <button class="high-scores-btn" @click="$emit('showHighScores')">
        <Trophy />
        排行榜
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Play, PlayCircle, Trophy } from "lucide-vue-next";
import { ref } from "vue";
import { DIFFICULTY_CONFIGS } from "./tetrisConstants";
import { hasSave } from "./tetrisSaveManager";
import type { DifficultyLevel } from "./tetrisTypes";

const emit = defineEmits<{
  start: [difficulty: DifficultyLevel];
  continue: [];
  showHighScores: [];
  close: [];
}>();

const hasSavedGame = hasSave();
const difficulties = Object.values(DIFFICULTY_CONFIGS);
const selectedDifficulty = ref<DifficultyLevel>("normal");

const selectDifficulty = (difficulty: DifficultyLevel) => {
  selectedDifficulty.value = difficulty;
};

const handleStart = () => {
  emit("start", selectedDifficulty.value);
};
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.tetris-start-menu {
  @include gs.vars;
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  box-sizing: border-box;
  padding: 16px 20px;
  overflow-y: auto;
  background: var(--g-bg);
  color: var(--g-text);
  -webkit-overflow-scrolling: touch;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
  flex-shrink: 0;
}

.back-btn {
  @include gs.round-btn;
}

.topbar-spacer {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.page-title {
  margin: 0;
  font-family: var(--g-num);
  font-size: 17px;
  font-weight: 700;
  color: var(--g-text);
}

.section-title {
  margin: 0 0 10px;
  font-size: 16px;
  font-weight: 700;
  color: var(--g-text);
}

.difficulty-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.difficulty-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: 18px;
  background: var(--g-surface);
  font-family: inherit;
  color: var(--g-text);
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
  outline: 2px solid transparent;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transition: outline-color 0.15s;

  &.selected {
    outline: 2px solid #5b52b5;
  }
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.difficulty-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--g-text);
}

.multiplier {
  font-family: var(--g-num);
  font-size: 13px;
  color: var(--g-text-2);
}

.description {
  margin: 0;
  font-size: 13px;
  color: var(--g-text-2);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 12px;
  background: var(--g-muted);
  font-size: 11px;
  color: var(--g-text-2);
  white-space: nowrap;

  &.off {
    opacity: 0.45;
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  flex-shrink: 0;

  button {
    width: 100%;
  }
}

.continue-btn {
  @include gs.pill-outline(44px);
}

.start-btn {
  @include gs.pill-dark(44px);
}

.high-scores-btn {
  height: 44px;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 13px;
  color: var(--g-text-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;

  svg {
    width: 16px;
    height: 16px;
  }
}
</style>
