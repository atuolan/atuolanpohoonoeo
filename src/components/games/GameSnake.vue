<template>
  <div class="game-snake">
    <div class="header">
      <button class="back-btn" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">貪吃蛇</h1>
      <div class="header-actions">
        <button
          class="icon-btn"
          :class="{ active: isPaused }"
          @click="togglePause"
        >
          <Play v-if="isPaused" class="icon" />
          <Pause v-else class="icon" />
        </button>
        <button class="icon-btn" @click="restartGame">
          <RotateCcw class="icon" />
        </button>
      </div>
    </div>

    <div class="game-container">
      <div class="score-container">
        <div class="score-box">
          <div class="score-label">分數</div>
          <div class="score-value">{{ score }}</div>
        </div>
        <div class="score-box best">
          <div class="score-label">最高</div>
          <div class="score-value">{{ bestScore }}</div>
        </div>
        <div class="score-box grid-info" :class="{ expanded: gridSize >= 20 }">
          <div class="score-label">網格</div>
          <div class="score-value">{{ gridSize }}×{{ gridSize }}</div>
        </div>
      </div>

      <div class="game-board-wrapper">
        <div
          class="game-board"
          ref="gameBoard"
          @touchstart="handleTouchStart"
          @touchend="handleTouchEnd"
          @click="handleClick"
        >
          <div class="grid-background">
            <div v-for="row in gridSize" :key="`row-${row}`" class="grid-row">
              <div
                v-for="col in gridSize"
                :key="`cell-${row}-${col}`"
                class="grid-cell"
              ></div>
            </div>
          </div>
          <div class="snake-layer">
            <div
              v-for="(segment, index) in snake"
              :key="`snake-${index}`"
              class="snake-segment"
              :class="getSnakeSegmentClass(index)"
              :style="getPositionStyle(segment)"
            >
              <div class="pixel-inner"></div>
            </div>
          </div>
          <div class="food-layer">
            <div
              v-for="(foodItem, index) in foods"
              :key="`food-${index}`"
              class="food"
              :style="getPositionStyle(foodItem)"
            >
              <div class="food-inner"></div>
              <div class="food-glow"></div>
            </div>
          </div>
          <div class="enemy-layer">
            <template v-for="enemy in enemies" :key="`enemy-${enemy.id}`">
              <div
                v-for="(segment, index) in enemy.body"
                v-show="enemy.alive"
                :key="`enemy-${enemy.id}-${index}`"
                class="enemy-segment"
                :class="getEnemySegmentClass(Number(index), enemy.body.length)"
                :style="getPositionStyle(segment)"
              >
                <div class="enemy-pixel"></div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <div class="controls-hint"><p>滑動或點擊方向 | 方向鍵/WASD</p></div>

      <div v-if="!isStarted && !isGameOver" class="start-overlay">
        <div class="start-card">
          <div class="snake-icon">🐍</div>
          <h2>貪吃蛇</h2>
          <p>準備好開始了嗎？</p>
          <button class="start-btn" @click="startGame">
            <Play :size="20" /> 開始遊戲
          </button>
          <button class="back-to-center-btn" @click="emit('close')">
            <ArrowLeft :size="16" /> 返回遊戲中心
          </button>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <transition name="fade">
        <div v-if="isGameOver" class="game-over-overlay">
          <div class="game-over-card">
            <div class="game-over-icon"><Skull :size="80" /></div>
            <h2>遊戲結束</h2>
            <div class="final-score">
              <span class="label">最終分數</span
              ><span class="value">{{ score }}</span>
            </div>
            <div v-if="score === bestScore && score > 0" class="new-record">
              <Trophy :size="24" /> 新紀錄！
            </div>
            <div class="game-over-buttons">
              <button class="game-over-btn share" @click="shareScore">
                <Share2 :size="18" /> 分享成績
              </button>
              <div class="game-over-buttons-row">
                <button class="game-over-btn secondary" @click="emit('close')">
                  <ArrowLeft :size="18" /> 返回
                </button>
                <button class="game-over-btn primary" @click="restartGame">
                  <RotateCcw :size="18" /> 重新開始
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { GameScoreData, SnakeMetadata } from "@/types";
import {
    ArrowLeft,
    ChevronLeft,
    Pause,
    Play,
    RotateCcw,
    Share2,
    Skull,
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
const gameState = ref<GameState>(GameState.READY);
const gridSize = ref(15);
const gameBoard = ref<HTMLElement | null>(null);
let touchStartX = 0;
let touchStartY = 0;

const isStarted = computed(() => gameState.value !== GameState.READY);
const isPaused = computed(() => gameState.value === GameState.PAUSED);
const isGameOver = computed(() => gameState.value === GameState.GAME_OVER);

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
}

function gameLoop() {
  updateGameState();
  if (score.value > bestScore.value) {
    bestScore.value = score.value;
    saveBestScore();
  }
  if (gameState.value === GameState.PLAYING) requestAnimationFrame(gameLoop);
}

function startGame() {
  if (!game) return;
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

function getSnakeSegmentClass(index: number): string {
  if (index === 0) return "head";
  if (index === snake.value.length - 1) return "tail";
  return "body";
}
function getEnemySegmentClass(index: number, length: number): string {
  if (index === 0) return "enemy-head";
  if (index === length - 1) return "enemy-tail";
  return "enemy-body";
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
}
function handleTouchEnd(event: TouchEvent) {
  if (!game || !isStarted.value) return;
  const dx = event.changedTouches[0].clientX - touchStartX;
  const dy = event.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
    handleClick(event);
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    game.changeDirection(dx > 0 ? Direction.RIGHT : Direction.LEFT);
  } else {
    game.changeDirection(dy > 0 ? Direction.DOWN : Direction.UP);
  }
  event.preventDefault();
}

function handleClick(event: TouchEvent | MouseEvent) {
  if (!game || !isStarted.value || snake.value.length === 0) return;
  const board = gameBoard.value;
  if (!board) return;
  let clientX: number, clientY: number;
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
    game.changeDirection(deltaX > 0 ? Direction.RIGHT : Direction.LEFT);
  } else {
    game.changeDirection(deltaY > 0 ? Direction.DOWN : Direction.UP);
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
    isNewRecord: score.value === bestScore.value && score.value > 0,
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
});
onUnmounted(() => {
  if (game) game.destroy();
  window.removeEventListener("keydown", handleKeyDown);
});
</script>

<style scoped lang="scss">
.game-snake {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px;
  padding-top: max(16px, env(safe-area-inset-top));
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  z-index: 10;

  .back-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    .icon {
      width: 20px;
      height: 20px;
      color: #fff;
    }
    &:active {
      transform: scale(0.95);
      background: rgba(255, 255, 255, 0.2);
    }
  }

  .title {
    flex: 1;
    text-align: center;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;

    .icon-btn {
      width: 40px;
      height: 40px;
      border: none;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s;
      .icon {
        width: 20px;
        height: 20px;
        color: #fff;
      }
      &:active {
        transform: scale(0.95);
      }
      &.active {
        background: #22c55e;
      }
    }
  }
}

.game-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  overflow: auto;
  position: relative;
}

.score-container {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;

  .score-box {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 12px 24px;
    text-align: center;
    border: 1px solid rgba(255, 255, 255, 0.2);

    .score-label {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 4px;
    }
    .score-value {
      font-size: 24px;
      font-weight: 700;
      color: #fff;
      font-family: "Courier New", monospace;
    }

    &.best {
      background: rgba(252, 211, 77, 0.2);
      border-color: rgba(252, 211, 77, 0.3);
      .score-value {
        color: #fcd34d;
      }
    }

    &.grid-info {
      transition: all 0.3s ease;
      &.expanded {
        background: rgba(34, 197, 94, 0.3);
        border-color: rgba(74, 222, 128, 0.4);
        .score-value {
          color: #4ade80;
        }
      }
    }
  }
}

.game-board-wrapper {
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1;
  margin: 0 auto;
}

.game-board {
  width: 100%;
  height: 100%;
  background: #1a1a1a;
  border-radius: 8px;
  position: relative;
  overflow: hidden;
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.1),
    inset 0 0 0 2px rgba(255, 255, 255, 0.05);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  cursor: pointer;
}

.grid-background {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  .grid-row {
    flex: 1;
    display: flex;
    .grid-cell {
      flex: 1;
      border: 0.5px solid rgba(255, 255, 255, 0.05);
    }
  }
}

.snake-layer,
.food-layer,
.enemy-layer {
  position: absolute;
  inset: 0;
}
.snake-layer {
  z-index: 2;
}
.food-layer {
  z-index: 1;
}
.enemy-layer {
  z-index: 3;
}

.snake-segment {
  position: absolute;
  transition: all 0.1s ease-out;
  .pixel-inner {
    width: 100%;
    height: 100%;
    border-radius: 2px;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
  }
  &.head .pixel-inner {
    background: #4ade80;
    box-shadow:
      inset 0 0 10px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(74, 222, 128, 0.5);
  }
  &.body .pixel-inner {
    background: #22c55e;
  }
  &.tail .pixel-inner {
    background: #16a34a;
  }
}

.food {
  position: absolute;
  animation: foodPulse 1s ease-in-out infinite;
  .food-inner {
    width: 100%;
    height: 100%;
    background: #ef4444;
    border-radius: 50%;
    box-shadow:
      inset 0 0 10px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(239, 68, 68, 0.5);
  }
  .food-glow {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 150%;
    height: 150%;
    background: radial-gradient(
      circle,
      rgba(239, 68, 68, 0.3),
      transparent 70%
    );
    transform: translate(-50%, -50%);
  }
}

@keyframes foodPulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

.enemy-segment {
  position: absolute;
  transition: all 0.1s ease-out;
  .enemy-pixel {
    width: 100%;
    height: 100%;
    border-radius: 2px;
    box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.3);
  }
  &.enemy-head .enemy-pixel {
    background: #9d4edd;
    box-shadow:
      inset 0 0 10px rgba(0, 0, 0, 0.3),
      0 0 15px rgba(157, 78, 221, 0.5);
  }
  &.enemy-body .enemy-pixel {
    background: #7b2cbf;
  }
  &.enemy-tail .enemy-pixel {
    background: #5a189a;
  }
}

.controls-hint {
  margin-top: 20px;
  text-align: center;
  p {
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    margin: 0;
  }
}

.start-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.start-card {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  max-width: 300px;

  .snake-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }
  h2 {
    color: #fff;
    font-size: 28px;
    margin: 0 0 12px 0;
  }
  p {
    color: rgba(255, 255, 255, 0.7);
    font-size: 16px;
    margin: 0 0 24px 0;
  }

  .start-btn {
    padding: 14px 32px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    &:active {
      transform: scale(0.95);
    }
  }

  .back-to-center-btn {
    margin-top: 12px;
    padding: 12px 24px;
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
    border: 2px solid rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    &:active {
      transform: scale(0.95);
    }
  }
}

.game-over-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.game-over-card {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  padding: 40px;
  text-align: center;
  max-width: 320px;
  width: 100%;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;

  .game-over-icon {
    margin-bottom: 20px;
    color: #ef4444;
    filter: drop-shadow(0 0 20px rgba(239, 68, 68, 0.5));
  }
  h2 {
    color: #fff;
    font-size: 32px;
    margin: 0 0 20px 0;
  }

  .final-score {
    background: rgba(0, 0, 0, 0.3);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 16px;
    .label {
      display: block;
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      margin-bottom: 8px;
    }
    .value {
      display: block;
      color: #fff;
      font-size: 48px;
      font-weight: 700;
      font-family: "Courier New", monospace;
    }
  }

  .new-record {
    color: #fcd34d;
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .game-over-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 8px;
  }
  .game-over-buttons-row {
    display: flex;
    gap: 12px;
  }

  .game-over-btn {
    flex: 1;
    padding: 14px 24px;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;

    &.primary {
      background: var(--color-primary, #7dd3a8);
      color: white;
    }
    &.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: white;
      border: 2px solid rgba(255, 255, 255, 0.3);
    }
    &.share {
      background: #3b82f6;
      color: white;
    }
    &:active {
      transform: scale(0.95);
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
