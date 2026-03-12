<template>
  <div class="tetris-start-menu">
    <div class="menu-content">
      <h1 class="game-title">俄罗斯方块</h1>
      <p class="game-subtitle">TETRIS</p>

      <div class="difficulty-selection">
        <h2>选择难度</h2>
        <div class="difficulty-cards">
          <div
            v-for="difficulty in difficulties"
            :key="difficulty.name"
            class="difficulty-card"
            :class="{ selected: selectedDifficulty === difficulty.name }"
            @click="selectDifficulty(difficulty.name)"
          >
            <div class="card-header">
              <h3>{{ difficulty.label }}</h3>
              <span class="multiplier">×{{ difficulty.scoreMultiplier }}</span>
            </div>
            <div class="card-body">
              <p class="description">{{ difficulty.description }}</p>
              <div class="stats">
                <div class="stat-item">
                  <Gauge :size="16" />
                  <span>起始速度: {{ difficulty.startSpeed }}ms</span>
                </div>
                <div class="stat-item">
                  <Trophy :size="16" />
                  <span>起始等级: {{ difficulty.startLevel }}</span>
                </div>
                <div class="stat-item">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    width="16"
                    height="16"
                  >
                    <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
                    <path d="M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
                  </svg>
                  <span :class="{ disabled: !difficulty.ghostEnabled }"
                    >幽灵方块:
                    {{ difficulty.ghostEnabled ? "开启" : "关闭" }}</span
                  >
                </div>
                <div class="stat-item">
                  <Hand :size="16" />
                  <span :class="{ disabled: !difficulty.holdEnabled }"
                    >Hold功能:
                    {{ difficulty.holdEnabled ? "开启" : "关闭" }}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button
          v-if="hasSavedGame"
          class="continue-btn"
          @click="$emit('continue')"
        >
          <PlayCircle :size="18" />
          继续游戏
        </button>
        <button class="start-btn" @click="handleStart">
          <Play :size="18" />
          开始游戏
        </button>
        <button class="high-scores-btn" @click="$emit('showHighScores')">
          <Trophy :size="18" />
          高分榜
        </button>
        <button class="back-btn" @click="$emit('close')">
          <ArrowLeft :size="18" />
          返回
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
    ArrowLeft,
    Gauge,
    Hand,
    Play,
    PlayCircle,
    Trophy,
} from "lucide-vue-next";
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
.tetris-start-menu {
  position: fixed;
  inset: 0;
  background: #fafafa;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  overflow-y: auto;
  overflow-x: hidden;
  animation: fadeIn 0.2s ease-out;
  min-height: 100vh;
  min-height: 100dvh;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}

.menu-content {
  width: 100%;
  max-width: 800px;
  display: flex;
  flex-direction: column;
  gap: clamp(16px, 4vw, 32px);
  animation: slideUp 0.2s ease-out;
  margin: auto;
}

.game-title {
  font-size: clamp(32px, 8vw, 48px);
  font-weight: 900;
  text-align: center;
  margin: 0;
  color: #1f2937;
}

.game-subtitle {
  font-size: clamp(14px, 3.5vw, 20px);
  text-align: center;
  margin: -16px 0 0 0;
  color: #6b7280;
  font-weight: 600;
  letter-spacing: clamp(2px, 0.5vw, 4px);
}

.difficulty-selection {
  h2 {
    font-size: clamp(18px, 4vw, 24px);
    margin: 0 0 clamp(12px, 3vw, 20px) 0;
    text-align: center;
    color: #374151;
  }
}

.difficulty-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: clamp(12px, 2vw, 16px);
}

.difficulty-card {
  background: white;
  border-radius: clamp(12px, 2vw, 16px);
  padding: clamp(16px, 3vw, 20px);
  cursor: pointer;
  transition: all 0.2s;
  border: 3px solid transparent;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
  }
  &.selected {
    border-color: var(--theme-primary, #10b981);
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: clamp(8px, 2vw, 12px);
    padding-bottom: clamp(8px, 2vw, 12px);
    border-bottom: 2px solid #f3f4f6;
    h3 {
      margin: 0;
      font-size: clamp(16px, 3.5vw, 20px);
      color: #1f2937;
    }
    .multiplier {
      font-size: clamp(14px, 3vw, 18px);
      font-weight: 700;
      color: var(--theme-primary, #10b981);
      background: #f0fdf4;
      padding: clamp(3px, 1vw, 4px) clamp(8px, 2vw, 12px);
      border-radius: clamp(6px, 1.5vw, 8px);
    }
  }
  .card-body {
    .description {
      margin: 0 0 clamp(12px, 2.5vw, 16px) 0;
      color: #6b7280;
      font-size: clamp(12px, 2.5vw, 14px);
      line-height: 1.5;
    }
    .stats {
      display: flex;
      flex-direction: column;
      gap: clamp(6px, 1.5vw, 8px);
    }
    .stat-item {
      display: flex;
      align-items: center;
      gap: clamp(6px, 1.5vw, 8px);
      font-size: clamp(11px, 2.3vw, 13px);
      color: #4b5563;
      svg {
        color: var(--theme-primary, #10b981);
        flex-shrink: 0;
      }
      .disabled {
        color: #9ca3af;
        text-decoration: line-through;
      }
    }
  }
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: clamp(8px, 2vw, 12px);
  justify-content: center;
  button {
    flex: 1 1 auto;
    min-width: clamp(120px, 30vw, 140px);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(6px, 1.5vw, 8px);
    padding: clamp(12px, 2.5vw, 14px) clamp(16px, 4vw, 24px);
    border: none;
    border-radius: clamp(8px, 2vw, 12px);
    font-size: clamp(14px, 3vw, 16px);
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    &:active {
      transform: translateY(2px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }
  .continue-btn {
    background: #3b82f6;
    color: white;
  }
  .start-btn {
    background: var(--theme-primary, #10b981);
    color: white;
  }
  .high-scores-btn {
    background: #f59e0b;
    color: white;
  }
  .back-btn {
    background: #e5e7eb;
    color: #374151;
  }
}

@media (max-width: 768px) {
  .difficulty-cards {
    grid-template-columns: 1fr;
  }
  .actions button {
    min-width: 100%;
    max-width: 100%;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
