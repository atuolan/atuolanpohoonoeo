<template>
  <div class="game-pacman">
    <div class="header">
      <button class="back-btn" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">吃豆人</h1>
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
        <div class="score-box">
          <div class="score-label">關卡</div>
          <div class="score-value">{{ level }}</div>
        </div>
        <div class="score-box">
          <div class="score-label">命</div>
          <div class="score-value">{{ '●'.repeat(Math.max(lives, 0)) || '0' }}</div>
        </div>
      </div>

      <div class="board-wrapper">
        <canvas
          ref="canvasRef"
          class="game-canvas"
          :width="canvasW"
          :height="canvasH"
          @touchstart.passive="handleTouchStart"
          @touchend.passive="handleTouchEnd"
        ></canvas>
      </div>

      <div class="dpad">
        <button
          class="dpad-btn up"
          @pointerdown.prevent="setDir(3)"
        >▲</button>
        <button
          class="dpad-btn left"
          @pointerdown.prevent="setDir(2)"
        >◀</button>
        <button
          class="dpad-btn right"
          @pointerdown.prevent="setDir(0)"
        >▶</button>
        <button
          class="dpad-btn down"
          @pointerdown.prevent="setDir(1)"
        >▼</button>
      </div>

      <div class="controls-hint">
        <p>方向鍵 / WASD 控制；空白鍵暫停；滑動轉向</p>
      </div>

      <div v-if="isReady" class="start-overlay">
        <div class="start-card">
          <div class="pac-icon">●</div>
          <h2>吃豆人</h2>
          <p>吃光所有豆子，小心幽靈！</p>
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
        <div v-if="isGameOver || isWin" class="game-over-overlay">
          <div class="game-over-card">
            <div class="game-over-icon">
              <Trophy v-if="isWin" :size="80" style="color: #ffd166" />
              <Skull v-else :size="80" />
            </div>
            <h2>{{ isWin ? '通關！' : '遊戲結束' }}</h2>
            <div class="final-score">
              <span class="label">最終分數</span>
              <span class="value">{{ score }}</span>
            </div>
            <div v-if="score === bestScore && score > 0" class="new-record">
              <Trophy :size="24" /> 新紀錄！
            </div>
            <div class="game-over-buttons">
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
import {
    ArrowLeft,
    ChevronLeft,
    Pause,
    Play,
    RotateCcw,
    Skull,
    Trophy,
} from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
    MAP_HEIGHT,
    MAP_WIDTH,
    PacmanGame,
    PacmanState,
    type Dir,
} from './pacman/PacmanGame';

const emit = defineEmits<{ close: [] }>();

const CELL = 22;
const canvasW = MAP_WIDTH * CELL;
const canvasH = MAP_HEIGHT * CELL;

let game: PacmanGame | null = null;
let rafId: number | null = null;
let lastTickAt = 0;
const TICK_MS = 16; // 60 FPS 節流（對應原版 index.js 的 16ms 限頻）
const canvasRef = ref<HTMLCanvasElement | null>(null);
const score = ref(0);
const bestScore = ref(0);
const lives = ref(3);
const level = ref(1);
const stateRef = ref<PacmanState>(PacmanState.READY);

const isReady = computed(() => stateRef.value === PacmanState.READY);
const isPaused = computed(() => stateRef.value === PacmanState.PAUSED);
const isGameOver = computed(() => stateRef.value === PacmanState.GAME_OVER);
const isWin = computed(() => stateRef.value === PacmanState.WIN);

let touchStartX = 0;
let touchStartY = 0;

function syncState() {
  if (!game) return;
  score.value = game.score;
  lives.value = game.lives;
  level.value = game.level;
  stateRef.value = game.state;
  if (game.score > bestScore.value) {
    bestScore.value = game.score;
    saveBestScore();
  }
}

function loop() {
  if (!game) return;
  const now = performance.now();
  if (now - lastTickAt >= TICK_MS) {
    lastTickAt = now;
    game.step();
    draw();
    syncState();
  }
  rafId = requestAnimationFrame(loop);
}

function startGame() {
  if (!game) return;
  game.start();
  syncState();
}
function togglePause() {
  if (!game) return;
  game.togglePause();
  syncState();
}
function restartGame() {
  if (!game) return;
  game.reset(true);
  game.start();
  syncState();
}
function setDir(d: Dir) {
  if (!game) return;
  game.setDir(d);
}

function handleKeyDown(e: KeyboardEvent) {
  if (!game) return;
  switch (e.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      setDir(3);
      e.preventDefault();
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      setDir(1);
      e.preventDefault();
      break;
    case 'ArrowLeft':
    case 'a':
    case 'A':
      setDir(2);
      e.preventDefault();
      break;
    case 'ArrowRight':
    case 'd':
    case 'D':
      setDir(0);
      e.preventDefault();
      break;
    case ' ':
      togglePause();
      e.preventDefault();
      break;
  }
}

function handleTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}
function handleTouchEnd(e: TouchEvent) {
  if (!game) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = e.changedTouches[0].clientY - touchStartY;
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
  if (Math.abs(dx) > Math.abs(dy)) setDir(dx > 0 ? 0 : 2);
  else setDir(dy > 0 ? 1 : 3);
}

// ====== Rendering ======
function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !game) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 牆
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const v = game.map[y][x];
      if (v === 1) {
        ctx.fillStyle = '#1a1aff';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.fillStyle = '#3636ff';
        ctx.fillRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4);
      } else if (v === 0) {
        ctx.fillStyle = '#ffd9a8';
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (v === 3) {
        // 能量豆閃爍
        const blink = Math.floor(game.tick / 10) % 2 === 0;
        ctx.fillStyle = blink ? '#ffec5e' : '#ffaa00';
        const cx = x * CELL + CELL / 2;
        const cy = y * CELL + CELL / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Pacman
  const p = game.pacman;
  const pcx = p.cx * CELL + CELL / 2;
  const pcy = p.cy * CELL + CELL / 2;
  const radius = CELL / 2 - 2;
  const mouth = Math.abs(Math.sin((p.mouthFrame / 16) * Math.PI)) * 0.4 + 0.05;
  const rotByDir: Record<Dir, number> = { 0: 0, 1: Math.PI / 2, 2: Math.PI, 3: -Math.PI / 2 };
  ctx.save();
  ctx.translate(pcx, pcy);
  ctx.rotate(rotByDir[p.dir]);
  ctx.fillStyle = '#ffe600';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, radius, mouth * Math.PI, (2 - mouth) * Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Ghosts
  for (const g of game.ghosts) {
    const gx = g.cx * CELL + CELL / 2;
    const gy = g.cy * CELL + CELL / 2;
    const gr = CELL / 2 - 2;
    let color = g.color;
    if (g.eaten) color = '#444';
    else if (g.frightened) {
      const ending = game.frightenedTicks < 90 && Math.floor(game.tick / 8) % 2 === 0;
      color = ending ? '#ffffff' : '#2222ff';
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(gx, gy - 2, gr, Math.PI, 0);
    ctx.lineTo(gx + gr, gy + gr - 2);
    // 鬚邊
    const waves = 3;
    for (let i = 0; i < waves; i++) {
      const x1 = gx + gr - ((i * 2 + 1) * gr) / waves;
      const x2 = gx + gr - ((i * 2 + 2) * gr) / waves;
      ctx.lineTo(x1, gy + gr - 6);
      ctx.lineTo(x2, gy + gr - 2);
    }
    ctx.closePath();
    ctx.fill();
    // 眼
    if (!g.eaten || true) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gx - gr / 3, gy - gr / 3, 3, 0, Math.PI * 2);
      ctx.arc(gx + gr / 3, gy - gr / 3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(gx - gr / 3, gy - gr / 3, 1.4, 0, Math.PI * 2);
      ctx.arc(gx + gr / 3, gy - gr / 3, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (stateRef.value === PacmanState.PAUSED) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暫停', canvasW / 2, canvasH / 2);
  }
}

function loadBestScore() {
  const s = localStorage.getItem('pacman_best_score');
  if (s) bestScore.value = parseInt(s, 10) || 0;
}
function saveBestScore() {
  localStorage.setItem('pacman_best_score', bestScore.value.toString());
}

onMounted(() => {
  game = new PacmanGame();
  loadBestScore();
  syncState();
  window.addEventListener('keydown', handleKeyDown);
  rafId = requestAnimationFrame(loop);
});
onUnmounted(() => {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  if (game) game.destroy();
  game = null;
  window.removeEventListener('keydown', handleKeyDown);
});
</script>

<style scoped lang="scss">
.game-pacman {
  position: fixed;
  inset: 0;
  background: #000;
  color: #fff;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  user-select: none;
}

.header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #0a0a1a;
  border-bottom: 1px solid #1a1a3a;
  gap: 8px;

  .back-btn,
  .icon-btn {
    background: transparent;
    border: none;
    color: #ffe600;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover { background: rgba(255, 230, 0, 0.1); }
    &.active { background: rgba(255, 230, 0, 0.2); }
    .icon { width: 22px; height: 22px; }
  }
  .title {
    flex: 1;
    text-align: center;
    font-size: 18px;
    font-weight: bold;
    margin: 0;
  }
  .header-actions { display: flex; gap: 4px; }
}

.game-container {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 12px calc(env(safe-area-inset-bottom, 0px) + 12px);
  gap: 8px;
  overflow: hidden;
}

.score-container {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: center;
  width: 100%;

  .score-box {
    background: #111133;
    border: 1px solid #2a2a5a;
    border-radius: 8px;
    padding: 4px 10px;
    min-width: 50px;
    text-align: center;

    .score-label { font-size: 10px; color: #8a8aff; line-height: 1.2; }
    .score-value { font-size: 14px; font-weight: bold; color: #ffe600; line-height: 1.2; }
    &.best .score-value { color: #ffaa00; }
  }
}

.board-wrapper {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}
.game-canvas {
  background: #000;
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  image-rendering: pixelated;
  border: 2px solid #1a1aff;
  border-radius: 4px;
  touch-action: none;
  // 用 aspect-ratio 讓瀏覽器在 width/height 都受限時保比例
  aspect-ratio: 19 / 21;
}

.dpad {
  display: grid;
  grid-template-areas:
    '.    up    .'
    'left .  right'
    '.   down   .';
  gap: 8px;
  flex-shrink: 0;

  .dpad-btn {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: #1a1a3a;
    border: 2px solid #3a3a7a;
    color: #ffe600;
    font-size: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    &:active { background: #2a2a5a; transform: scale(0.95); }
    &.up { grid-area: up; }
    &.down { grid-area: down; }
    &.left { grid-area: left; }
    &.right { grid-area: right; }
  }
}

.controls-hint {
  color: #8a8aff;
  font-size: 11px;
  text-align: center;
  flex-shrink: 0;
  p { margin: 0; }
}

// 小螢幕：D-pad 更大，隱藏文字提示
@media (max-width: 480px) {
  .header { padding: 8px 12px; .title { font-size: 16px; } }
  .controls-hint { display: none; }
  .dpad {
    gap: 10px;
    .dpad-btn { width: 64px; height: 64px; font-size: 24px; }
  }
}

// 矮螢幕（橫向手機/小直立）：縮小 D-pad 避免擠壓
@media (max-height: 640px) {
  .dpad .dpad-btn { width: 48px; height: 48px; font-size: 18px; }
  .score-container .score-box { padding: 3px 8px; .score-value { font-size: 12px; } }
}

@media (hover: hover) and (pointer: fine) {
  .dpad {
    gap: 6px;
    .dpad-btn { width: 42px; height: 42px; font-size: 16px; }
  }
}

.start-overlay,
.game-over-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}
.start-card,
.game-over-card {
  background: #111133;
  border: 2px solid #ffe600;
  border-radius: 16px;
  padding: 28px 32px;
  text-align: center;
  max-width: 320px;

  h2 { margin: 12px 0; color: #ffe600; }
  p { color: #8a8aff; margin: 4px 0 20px; }
  .pac-icon { font-size: 60px; color: #ffe600; }
  .game-over-icon { margin-bottom: 8px; color: #ff5050; }
  .final-score {
    display: flex;
    justify-content: space-between;
    background: #0a0a1a;
    padding: 10px 14px;
    border-radius: 8px;
    margin-bottom: 12px;
    .label { color: #8a8aff; }
    .value { color: #ffe600; font-weight: bold; }
  }
  .new-record {
    color: #ffaa00;
    margin-bottom: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
  }
}
.start-btn,
.back-to-center-btn,
.game-over-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  margin: 4px;
}
.start-btn {
  background: #ffe600;
  color: #000;
  width: 100%;
}
.back-to-center-btn {
  background: transparent;
  color: #8a8aff;
  border: 1px solid #3a3a7a;
  width: 100%;
}
.game-over-buttons { display: flex; flex-direction: column; gap: 8px; }
.game-over-buttons-row { display: flex; gap: 8px; }
.game-over-btn {
  flex: 1;
  &.primary { background: #ffe600; color: #000; }
  &.secondary { background: #2a2a5a; color: #fff; }
}

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }
</style>
