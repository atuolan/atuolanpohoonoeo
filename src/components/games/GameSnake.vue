<template>
  <div class="game-snake">
    <!-- 1. 頂欄 -->
    <header class="topbar">
      <button class="round-btn" aria-label="返回" @click="$emit('close')">
        <ChevronLeft />
      </button>
      <h1 class="topbar-title">貪吃蛇</h1>
      <button
        class="round-btn"
        :aria-label="isPaused ? '繼續' : '暫停'"
        :disabled="!isStarted || isGameOver"
        @click="togglePause"
      >
        <Play v-if="isPaused" />
        <Pause v-else />
      </button>
    </header>

    <!-- 2. 數據卡 -->
    <div class="stat-card">
      <div class="stat-col">
        <span class="stat-label">分數</span>
        <span class="stat-num">{{ score }}</span>
      </div>
      <div class="stat-col center-col">
        <span class="stat-label">長度</span>
        <span class="stat-num">{{ snake.length }}</span>
      </div>
      <div class="stat-col">
        <span class="stat-label">最高</span>
        <span class="stat-num">{{ bestScore }}</span>
      </div>
    </div>

    <!-- 3. 棋盤與遮罩 -->
    <div class="game-board-wrapper">
      <div
        class="game-board"
        ref="gameBoard"
        @touchstart="handleTouchStart"
        @touchend="handleTouchEnd"
        @mousedown="handleClick"
      >
        <div class="grid-background">
          <div v-for="row in gridSize" :key="`row-${row}`" class="grid-row">
            <div
              v-for="col in gridSize"
              :key="`cell-${row}-${col}`"
              class="grid-cell"
              :class="{ odd: (row + col) % 2 === 1, even: (row + col) % 2 === 0 }"
            ></div>
          </div>
        </div>

        <div class="snake-layer">
          <div
            v-for="(segment, index) in snake"
            :key="`snake-${index}`"
            class="snake-segment"
            :class="{ head: index === 0, body: index > 0 }"
            :style="[
              getPositionStyle(segment),
              index === 0 ? { transform: `rotate(${headRotation}deg)` } : {},
            ]"
          >
            <template v-if="index === 0">
              <span class="eye eye-top"><span class="pupil"></span></span>
              <span class="eye eye-bottom"><span class="pupil"></span></span>
            </template>
          </div>
        </div>

        <div class="food-layer">
          <div
            v-for="(foodItem, index) in foods"
            :key="`food-${index}`"
            class="food-item"
            :style="getPositionStyle(foodItem)"
          >
            <div class="food-apple">
              <span class="apple-leaf"></span>
            </div>
          </div>
        </div>

        <div class="enemy-layer">
          <template v-for="enemy in enemies" :key="`enemy-${enemy.id}`">
            <template v-if="enemy.alive">
              <div
                v-for="(segment, index) in enemy.body"
                :key="`enemy-${enemy.id}-${index}`"
                class="enemy-segment"
                :class="{ head: index === 0 }"
                :style="getPositionStyle(segment)"
              ></div>
            </template>
          </template>
        </div>
      </div>

      <!-- 遮罩：還沒開始 -->
      <div v-if="!isStarted && !isGameOver" class="board-scrim">
        <h2 class="scrim-title-lg">貪吃蛇</h2>
        <p class="scrim-desc">吃蘋果變長，別撞牆也別咬到自己</p>
        <button class="btn-pill-dark" @click="startGame">
          <Play /> 開始遊戲
        </button>
      </div>

      <!-- 遮罩：暫停中 -->
      <div v-if="isPaused" class="board-scrim">
        <h2 class="scrim-title-lg">暫停中</h2>
        <div class="scrim-btn-row">
          <button class="btn-pill-outline" @click="restartGame">重新開始</button>
          <button class="btn-pill-dark" @click="togglePause">繼續</button>
        </div>
      </div>

      <!-- 遮罩：遊戲結束 -->
      <div v-if="isGameOver" class="board-scrim">
        <h2 class="scrim-title-xl">撞到了</h2>
        <div class="final-score-block">
          <span class="final-label">最終分數</span>
          <span class="final-value">{{ score }}</span>
        </div>
        <div v-if="score > startBest" class="new-record-badge">
          <Trophy /> 新紀錄！
        </div>
        <div class="scrim-btn-row">
          <button class="btn-pill-outline" @click="shareScore">
            <Share2 /> 分享成績
          </button>
          <button class="btn-pill-dark" @click="restartGame">再來一局</button>
        </div>
      </div>
    </div>

    <!-- 4. 方向鍵 -->
    <div class="dpad">
      <span></span>
      <button
        type="button"
        class="dpad-btn"
        :class="{ active: headDir === Direction.UP }"
        aria-label="上"
        @pointerdown.prevent="turn(Direction.UP)"
      >
        <ChevronUp :size="22" :stroke-width="2.4" />
      </button>
      <span></span>

      <button
        type="button"
        class="dpad-btn"
        :class="{ active: headDir === Direction.LEFT }"
        aria-label="左"
        @pointerdown.prevent="turn(Direction.LEFT)"
      >
        <ChevronLeft :size="22" :stroke-width="2.4" />
      </button>
      <span class="dpad-center"></span>
      <button
        type="button"
        class="dpad-btn"
        :class="{ active: headDir === Direction.RIGHT }"
        aria-label="右"
        @pointerdown.prevent="turn(Direction.RIGHT)"
      >
        <ChevronRight :size="22" :stroke-width="2.4" />
      </button>

      <span></span>
      <button
        type="button"
        class="dpad-btn"
        :class="{ active: headDir === Direction.DOWN }"
        aria-label="下"
        @pointerdown.prevent="turn(Direction.DOWN)"
      >
        <ChevronDown :size="22" :stroke-width="2.4" />
      </button>
      <span></span>
    </div>

    <!-- 5. 底部提示 -->
    <p class="bottom-hint">
      <template v-if="gridSize <= 15">
        再吃 {{ Math.max(0, 10 - foodCount) }} 顆地圖會變大・也可以在棋盤上滑動
      </template>
      <template v-else>
        地圖變大了：別撞到紅蛇，用身體擋住牠
      </template>
    </p>
  </div>
</template>

<script setup lang="ts">
import type { GameScoreData, SnakeMetadata } from "@/types";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
  Share2,
  Trophy,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { SnakeGame } from "./snake/SnakeGame";
import { Direction, GameState, type Position } from "./snake/types";

const emit = defineEmits<{
  close: [];
  shareScore: [scoreData: GameScoreData];
}>();

let game: SnakeGame | null = null;
const snake = ref<Position[]>([]);
const foods = ref<Position[]>([]);
const enemies = ref<any[]>([]);
const score = ref(0);
const bestScore = ref(0);
const startBest = ref(0);
const gameState = ref<GameState>(GameState.READY);
const gridSize = ref(15);
const foodCount = ref(0);
const headDir = ref<Direction>(Direction.RIGHT);
const gameBoard = ref<HTMLElement | null>(null);

let touchStartX = 0;
let touchStartY = 0;
let hasTurnedInSwipe = false;

const isStarted = computed(() => gameState.value !== GameState.READY);
const isPaused = computed(() => gameState.value === GameState.PAUSED);
const isGameOver = computed(() => gameState.value === GameState.GAME_OVER);

const headRotation = computed(() => {
  switch (headDir.value) {
    case Direction.UP:
      return 270;
    case Direction.DOWN:
      return 90;
    case Direction.LEFT:
      return 180;
    case Direction.RIGHT:
    default:
      return 0;
  }
});

function initGame() {
  game = new SnakeGame();
  updateGameState();
  loadBestScore();
}

function updateGameState() {
  if (!game) return;
  snake.value = [...game.snake];
  foods.value = [...game.foods];
  enemies.value = [...game.enemies];
  score.value = game.score;
  gameState.value = game.state;
  gridSize.value = game.gridSize;
  foodCount.value = game.foodCount;
  headDir.value = game.direction;
}

function gameLoop() {
  updateGameState();
  if (score.value > bestScore.value) {
    bestScore.value = score.value;
    saveBestScore();
  }
  if (gameState.value === GameState.PLAYING) {
    requestAnimationFrame(gameLoop);
  }
}

function startGame() {
  if (!game) return;
  loadBestScore();
  startBest.value = bestScore.value;
  game.start();
  gameState.value = game.state;
  gameLoop();
}

function togglePause() {
  if (!game) return;
  if (gameState.value === GameState.PLAYING) {
    game.pause();
  } else if (gameState.value === GameState.PAUSED) {
    game.resume();
    gameLoop();
  }
  gameState.value = game.state;
}

function restartGame() {
  if (!game) return;
  game.reset();
  updateGameState();
  startGame();
}

function turn(dir: Direction) {
  if (!game || gameState.value !== GameState.PLAYING) return;
  game.changeDirection(dir);
}

function getPositionStyle(pos: Position) {
  const cellSize = 100 / gridSize.value;
  return {
    left: `${pos.x * cellSize}%`,
    top: `${pos.y * cellSize}%`,
    width: `${cellSize}%`,
    height: `${cellSize}%`,
  };
}

function handleKeyDown(event: KeyboardEvent) {
  if (!game || gameState.value !== GameState.PLAYING) return;
  let changed = false;
  switch (event.key) {
    case "ArrowUp":
    case "w":
    case "W":
      changed = game.changeDirection(Direction.UP);
      break;
    case "ArrowDown":
    case "s":
    case "S":
      changed = game.changeDirection(Direction.DOWN);
      break;
    case "ArrowLeft":
    case "a":
    case "A":
      changed = game.changeDirection(Direction.LEFT);
      break;
    case "ArrowRight":
    case "d":
    case "D":
      changed = game.changeDirection(Direction.RIGHT);
      break;
  }
  if (changed) event.preventDefault();
}

function handleTouchStart(event: TouchEvent) {
  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
  hasTurnedInSwipe = false;
}

function handleTouchMove(event: TouchEvent) {
  event.preventDefault();
  if (!game || gameState.value !== GameState.PLAYING) return;
  const currentX = event.touches[0].clientX;
  const currentY = event.touches[0].clientY;
  const dx = currentX - touchStartX;
  const dy = currentY - touchStartY;
  const threshold = 24;

  if (Math.abs(dx) >= threshold || Math.abs(dy) >= threshold) {
    if (Math.abs(dx) > Math.abs(dy)) {
      turn(dx > 0 ? Direction.RIGHT : Direction.LEFT);
    } else {
      turn(dy > 0 ? Direction.DOWN : Direction.UP);
    }
    touchStartX = currentX;
    touchStartY = currentY;
    hasTurnedInSwipe = true;
  }
}

function handleTouchEnd(event: TouchEvent) {
  if (!game || !isStarted.value) return;
  if (!hasTurnedInSwipe) {
    handleClick(event);
  }
}

function handleClick(event: TouchEvent | MouseEvent) {
  if (!game || gameState.value !== GameState.PLAYING || snake.value.length === 0) return;
  const board = gameBoard.value;
  if (!board) return;
  let clientX: number;
  let clientY: number;
  if (event instanceof TouchEvent) {
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }
  const rect = board.getBoundingClientRect();
  const cellSize = rect.width / gridSize.value;
  const gridX = Math.floor((clientX - rect.left) / cellSize);
  const gridY = Math.floor((clientY - rect.top) / cellSize);
  const head = snake.value[0];
  const deltaX = gridX - head.x;
  const deltaY = gridY - head.y;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    turn(deltaX > 0 ? Direction.RIGHT : Direction.LEFT);
  } else {
    turn(deltaY > 0 ? Direction.DOWN : Direction.UP);
  }
}

function handleVisibilityChange() {
  if (document.hidden && game && gameState.value === GameState.PLAYING) {
    game.pause();
    gameState.value = game.state;
  }
}

function shareScore() {
  const metadata: SnakeMetadata = {
    type: "snake",
    snakeLength: snake.value.length,
  };
  emit("shareScore", {
    gameId: "snake",
    gameName: "貪吃蛇",
    gameIcon: "mdi:snake",
    score: score.value,
    bestScore: bestScore.value,
    isNewRecord: score.value > startBest.value,
    timestamp: Date.now(),
    metadata,
  });
}

function loadBestScore() {
  const s = localStorage.getItem("snake_best_score");
  if (s) bestScore.value = parseInt(s, 10);
}

function saveBestScore() {
  localStorage.setItem("snake_best_score", bestScore.value.toString());
}

onMounted(() => {
  initGame();
  window.addEventListener("keydown", handleKeyDown);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  if (gameBoard.value) {
    gameBoard.value.addEventListener("touchmove", handleTouchMove, {
      passive: false,
    });
  }
});

onUnmounted(() => {
  if (game) game.destroy();
  window.removeEventListener("keydown", handleKeyDown);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  if (gameBoard.value) {
    gameBoard.value.removeEventListener("touchmove", handleTouchMove);
  }
});
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.game-snake {
  @include gs.screen;
  gap: 14px;
  background: color-mix(in srgb, #3f7a47 8%, var(--g-bg));
  --snake: #3f7a47;
  --enemy: #b4334e;
  --apple: #e5533d;
}

// 1. 頂欄
.topbar {
  @include gs.topbar;

  .round-btn {
    @include gs.round-btn;
  }

  .topbar-title {
    @include gs.title;
    font-family: inherit;
    font-size: 17px;
  }
}

// 2. 數據卡
.stat-card {
  background: var(--g-surface);
  border-radius: 18px;
  padding: 10px 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  align-items: center;

  .stat-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    &.center-col {
      border-left: 1px solid var(--g-border);
      border-right: 1px solid var(--g-border);
    }
  }

  .stat-label {
    font-size: 11px;
    color: var(--g-text-2);
  }

  .stat-num {
    font-family: var(--g-num);
    font-size: 22px;
    font-weight: 700;
    line-height: 1.1;
    color: var(--g-text);
  }
}

// 3. 棋盤與遮罩
.game-board-wrapper {
  position: relative;
  background: var(--g-surface);
  border-radius: 22px;
  padding: 10px;
  width: min(calc(100vw - 40px), calc(100dvh - 500px), 350px);
  height: min(calc(100vw - 40px), calc(100dvh - 500px), 350px);
  aspect-ratio: 1;
  align-self: center;
  box-sizing: border-box;

  .game-board {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    overflow: hidden;
    touch-action: none;
  }

  .grid-background {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;

    .grid-row {
      flex: 1;
      display: flex;
    }

    .grid-cell {
      flex: 1;

      &.odd {
        background: color-mix(in srgb, var(--snake) 12%, var(--g-surface));
      }
      &.even {
        background: color-mix(in srgb, var(--snake) 5%, var(--g-surface));
      }
    }
  }

  .snake-layer,
  .food-layer,
  .enemy-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .snake-segment {
    position: absolute;
    box-sizing: border-box;
    padding: 2px;
    transition: transform 0.08s ease;

    &.body {
      &::before {
        content: "";
        display: block;
        width: 100%;
        height: 100%;
        border-radius: 6px;
        background: var(--snake);
      }
    }

    &.head {
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      align-items: flex-end;
      padding-right: 3px;
      border-radius: 9px;
      background: var(--snake);
      box-sizing: border-box;
      transform-origin: center center;

      .eye {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: center;

        .pupil {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background: #000000;
        }
      }
    }
  }

  .food-item {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;

    .food-apple {
      position: relative;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: var(--apple);

      .apple-leaf {
        position: absolute;
        top: -3px;
        right: 0px;
        width: 6px;
        height: 4px;
        border-radius: 4px 0;
        background: #3f7a47;
      }
    }
  }

  .enemy-segment {
    position: absolute;
    box-sizing: border-box;
    padding: 2px;

    &::before {
      content: "";
      display: block;
      width: 100%;
      height: 100%;
      border-radius: 6px;
      background: var(--enemy);
    }

    &.head::before {
      border-radius: 9px;
    }
  }
}

// 遮罩樣式
.board-scrim {
  @include gs.board-scrim;

  .scrim-title-lg {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--g-text);
  }

  .scrim-title-xl {
    margin: 0;
    font-size: 28px;
    font-weight: 700;
    color: var(--g-text);
  }

  .scrim-desc {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--g-text-2);
  }

  .final-score-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin: 4px 0;

    .final-label {
      font-size: 13px;
      color: var(--g-text-2);
    }

    .final-value {
      font-family: var(--g-num);
      font-size: 32px;
      font-weight: 700;
      color: var(--g-text);
      line-height: 1.1;
    }
  }

  .new-record-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: #8a5a00;
    margin-bottom: 4px;

    svg {
      width: 16px;
      height: 16px;
    }
  }

  .scrim-btn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
  }

  .btn-pill-dark {
    @include gs.pill-dark(44px);
  }

  .btn-pill-outline {
    @include gs.pill-outline(44px);
  }
}

// 4. 方向鍵
.dpad {
  display: grid;
  grid-template-columns: repeat(3, clamp(48px, 7.5dvh, 64px));
  grid-template-rows: repeat(3, clamp(48px, 7.5dvh, 64px));
  gap: 6px;
  justify-content: center;
  align-items: center;
  align-self: center;

  .dpad-btn {
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: 20px;
    background: var(--g-surface);
    color: var(--g-text);
    box-shadow: 0 3px 0 color-mix(in srgb, var(--snake) 22%, var(--g-bg));
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 0.1s;

    &:active {
      transform: translateY(2px);
      box-shadow: 0 1px 0 color-mix(in srgb, var(--snake) 22%, var(--g-bg));
    }

    &.active {
      background: var(--snake);
      color: #ffffff;
      box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2);
    }
  }

  .dpad-center {
    width: 100%;
    height: 100%;
    border-radius: 20px;
    background: var(--snake);
    opacity: 0.15;
  }
}

// 5. 提示
.bottom-hint {
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--g-text-2);
}
</style>
