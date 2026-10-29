<template>
  <div class="game-pacman">
    <!-- 1. 頂欄 -->
    <div class="topbar">
      <button
        class="round-btn"
        aria-label="返回"
        @click="$emit('close')"
      >
        <ChevronLeft />
      </button>
      <h1 class="title">吃豆人</h1>
      <button
        class="round-btn"
        :aria-label="isPaused ? '繼續' : '暫停'"
        :disabled="isReady || isGameOver || isWin"
        @click="togglePause"
      >
        <Play v-if="isPaused" />
        <Pause v-else />
      </button>
    </div>

    <!-- 2. 數據列 -->
    <div class="stats-row">
      <div class="stat-col">
        <span class="label">分數</span>
        <span class="value">{{ score.toLocaleString() }}</span>
      </div>
      <div class="stat-col">
        <span class="label">最高</span>
        <span class="value">{{ bestScore.toLocaleString() }}</span>
      </div>
      <div class="stat-col level-col">
        <span class="level-text">第 {{ level }} 關</span>
      </div>
      <div class="stat-col lives-col" :aria-label="'剩餘 ' + Math.max(lives, 0) + ' 條命'">
        <div class="lives-icons">
          <svg
            v-for="i in Math.max(lives, 0)"
            :key="i"
            class="life-icon"
            viewBox="0 0 26 26"
          >
            <path d="M13 9V4" stroke="#3F7A47" stroke-width="1.8" stroke-linecap="round" />
            <path d="M13 5Q8 2 7 6Q11 7 13 5Z" fill="#6FBF73" />
            <path d="M13 5Q18 2 19 6Q15 7 13 5Z" fill="#6FBF73" />
            <circle cx="13" cy="16" r="8.5" fill="#F3E3B5" stroke="#121214" stroke-width="1.4" />
          </svg>
        </div>
      </div>
    </div>

    <!-- 3. 棋盤外框與遮罩 -->
    <div class="board-wrapper">
      <canvas ref="canvasRef" class="board-canvas"></canvas>

      <!-- READY 遮罩 -->
      <div v-if="isReady" class="scrim-overlay">
        <h2 class="scrim-title-ready">吃豆人</h2>
        <p class="scrim-desc">吃光豆子，別被灰塵怪碰到</p>
        <button class="pill-dark-btn" @click="startGame">
          <Play /> 開始遊戲
        </button>
      </div>

      <!-- 暫停遮罩 -->
      <div v-if="isPaused" class="scrim-overlay">
        <h2 class="scrim-title-ready">暫停中</h2>
        <div class="scrim-actions">
          <button class="pill-outline-btn" @click="restartGame">
            重新開始
          </button>
          <button class="pill-dark-btn" @click="togglePause">
            繼續
          </button>
        </div>
      </div>

      <!-- GAME_OVER / WIN 遮罩 -->
      <div v-if="isGameOver || isWin" class="scrim-overlay">
        <h2 class="scrim-title-end">{{ isWin ? '全部通關！' : '被抓到了' }}</h2>
        <div class="scrim-score-box">
          <span class="label">最終分數</span>
          <span class="num">{{ score.toLocaleString() }}</span>
        </div>
        <div v-if="score > startBest" class="new-record-tag">
          <Trophy /> 新紀錄！
        </div>
        <div class="scrim-actions">
          <button class="pill-outline-btn" @click="$emit('close')">
            返回
          </button>
          <button class="pill-dark-btn" @click="restartGame">
            再來一局
          </button>
        </div>
      </div>
    </div>

    <!-- 4. 操作區 -->
    <div class="controls-area">
      <div class="dpad-grid">
        <span class="dpad-empty"></span>
        <button
          class="dpad-btn"
          :class="{ active: curDir === 3 }"
          aria-label="上"
          @pointerdown.prevent="setDir(3)"
        >
          <ChevronUp />
        </button>
        <span class="dpad-empty"></span>

        <button
          class="dpad-btn"
          :class="{ active: curDir === 2 }"
          aria-label="左"
          @pointerdown.prevent="setDir(2)"
        >
          <ChevronLeft />
        </button>
        <span class="dpad-empty"></span>
        <button
          class="dpad-btn"
          :class="{ active: curDir === 0 }"
          aria-label="右"
          @pointerdown.prevent="setDir(0)"
        >
          <ChevronRight />
        </button>

        <span class="dpad-empty"></span>
        <button
          class="dpad-btn"
          :class="{ active: curDir === 1 }"
          aria-label="下"
          @pointerdown.prevent="setDir(1)"
        >
          <ChevronDown />
        </button>
        <span class="dpad-empty"></span>
      </div>

      <div class="game-instruction">
        <p><b>豆芽</b> 要吃光迷宮裡的豆子</p>
        <p>吃到大豆子後，<b>灰塵怪</b> 會變弱一陣子，可以反過來吃掉牠們</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Pause,
  Play,
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
const TICK_MS = 16;
let resizeObserver: ResizeObserver | null = null;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const score = ref(0);
const bestScore = ref(0);
const startBest = ref(0);
const lives = ref(3);
const level = ref(1);
const stateRef = ref<PacmanState>(PacmanState.READY);
const curDir = ref<Dir>(0);

const isReady = computed(() => stateRef.value === PacmanState.READY);
const isPaused = computed(() => stateRef.value === PacmanState.PAUSED);
const isGameOver = computed(() => stateRef.value === PacmanState.GAME_OVER);
const isWin = computed(() => stateRef.value === PacmanState.WIN);

let touchStartX = 0;
let touchStartY = 0;

// 灰塵怪 SVG 路徑 Path2D
const dustStarPath = new Path2D(
  'M13 2l2.4 4.2 4.6-1.4-1 4.7 4.2 2.5-4.2 2.5 1 4.7-4.6-1.4L13 24l-2.4-4.2-4.6 1.4 1-4.7L2.8 14 7 11.5 6 6.8l4.6 1.4z'
);

function syncState() {
  if (!game) return;
  score.value = game.score;
  lives.value = game.lives;
  level.value = game.level;
  stateRef.value = game.state;
  curDir.value = game.pacman.dir;

  if (game.score > bestScore.value) {
    bestScore.value = game.score;
    saveBestScore();
  }
}

function resizeCanvas() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const clientWidth = canvas.clientWidth;
  if (!clientWidth) return;
  canvas.width = Math.round(clientWidth * dpr);
  canvas.height = Math.round((clientWidth * 21) / 19 * dpr);
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
  startBest.value = bestScore.value;
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
  startBest.value = bestScore.value;
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
      if (!isReady.value && !isGameOver.value && !isWin.value) {
        togglePause();
        e.preventDefault();
      }
      break;
  }
}

function handleVisibilityChange() {
  if (document.hidden && game && game.state === PacmanState.PLAYING) {
    togglePause();
  }
}

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }
}

function handleTouchMove(e: TouchEvent) {
  if (!game || e.touches.length === 0) return;
  e.preventDefault();
  const curX = e.touches[0].clientX;
  const curY = e.touches[0].clientY;
  const dx = curX - touchStartX;
  const dy = curY - touchStartY;
  if (Math.abs(dx) >= 18 || Math.abs(dy) >= 18) {
    if (Math.abs(dx) > Math.abs(dy)) {
      setDir(dx > 0 ? 0 : 2);
    } else {
      setDir(dy > 0 ? 1 : 3);
    }
    touchStartX = curX;
    touchStartY = curY;
  }
}

// ====== Rendering ======
function draw() {
  const canvas = canvasRef.value;
  if (!canvas || !game) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const isNight = document.body.classList.contains('is-night-mode');
  const colors = isNight
    ? {
        bg: '#0C1020',
        wall: '#2E3D73',
        dot: '#E8C25A',
        glow: 'rgba(232, 194, 90, 0.25)',
      }
    : {
        bg: '#FFFFFF',
        wall: '#C3CBE6',
        dot: '#C9761A',
        glow: 'rgba(201, 118, 26, 0.18)',
      };

  ctx.setTransform(canvas.width / canvasW, 0, 0, canvas.height / canvasH, 0, 0);

  // 底色
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 迷宮與豆子
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      const v = game.map[y][x];
      const cx = x * CELL + CELL / 2;
      const cy = y * CELL + CELL / 2;

      if (v === 1) {
        // 牆：每格內縮 2px 的圓角方塊
        ctx.fillStyle = colors.wall;
        ctx.beginPath();
        ctx.roundRect(x * CELL + 2, y * CELL + 2, CELL - 4, CELL - 4, CELL * 0.27);
        ctx.fill();
      } else if (v === 0) {
        // 小豆：半徑 CELL*0.12 的圓
        ctx.fillStyle = colors.dot;
        ctx.beginPath();
        ctx.arc(cx, cy, CELL * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (v === 3) {
        // 大豆：半徑 CELL*0.27 的圓，外圍再畫一圈 3px 光暈；光暈透明度隨 game.tick 變化
        const r = CELL * 0.27;
        const alphaPhase = 0.5 + 0.5 * Math.sin((game.tick / 10) * Math.PI);
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * alphaPhase;
        ctx.fillStyle = colors.glow;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = colors.dot;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 豆芽（主角）
  const p = game.pacman;
  const pcx = p.cx * CELL + CELL / 2;
  const pcy = p.cy * CELL + CELL / 2;
  const scale = CELL / 26;

  // 眼睛與嘴巴位移（右 +x、左 −x、上 −y、下 +y 各 1.5 單位）
  let shiftX = 0;
  let shiftY = 0;
  if (p.dir === 0) shiftX = 1.5;
  else if (p.dir === 2) shiftX = -1.5;
  else if (p.dir === 3) shiftY = -1.5;
  else if (p.dir === 1) shiftY = 1.5;

  ctx.save();
  ctx.translate(pcx, pcy);
  ctx.scale(scale, scale);

  const isDying = game.state === ('dying' as any) || game.state === PacmanState.DYING;
  if (isDying) {
    const dyingAlpha = Math.max(0, 1 - (game.tick % 60) / 60);
    ctx.globalAlpha = dyingAlpha;
    ctx.scale(dyingAlpha, dyingAlpha);
  }

  // 以 (13, 13) 為中心對齊格心
  ctx.translate(-13, -13);

  // 1. 莖
  ctx.strokeStyle = '#3F7A47';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(13, 9);
  ctx.lineTo(13, 4);
  ctx.stroke();

  // 2. 兩片葉子
  ctx.fillStyle = '#6FBF73';
  ctx.beginPath();
  ctx.moveTo(13, 5);
  ctx.quadraticCurveTo(8, 2, 7, 6);
  ctx.quadraticCurveTo(11, 7, 13, 5);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(13, 5);
  ctx.quadraticCurveTo(18, 2, 19, 6);
  ctx.quadraticCurveTo(15, 7, 13, 5);
  ctx.closePath();
  ctx.fill();

  // 3. 身體圓
  ctx.fillStyle = '#F3E3B5';
  ctx.strokeStyle = '#121214';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(13, 16, 8.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 4. 兩隻眼睛
  ctx.fillStyle = '#121214';
  ctx.beginPath();
  ctx.arc(11 + shiftX, 15.5 + shiftY, 1.3, 0, Math.PI * 2);
  ctx.arc(16 + shiftX, 15.5 + shiftY, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // 5. 嘴巴（依 p.mouthFrame 切換微笑弧線與張開小圓 r1.6）
  const isMouthOpen = p.mouthFrame >= 8;
  if (isMouthOpen) {
    ctx.beginPath();
    ctx.arc(13.5 + shiftX, 19 + shiftY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = '#121214';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(11.5 + shiftX, 19 + shiftY);
    ctx.quadraticCurveTo(13.5 + shiftX, 20.5 + shiftY, 15.5 + shiftX, 19 + shiftY);
    ctx.stroke();
  }

  ctx.restore();

  // 灰塵怪（敵人）
  const ghostColors = ['#E86F6F', '#8EA6F0', '#E8A65A', '#B79BC9'];
  for (let idx = 0; idx < game.ghosts.length; idx++) {
    const g = game.ghosts[idx];
    const gx = g.cx * CELL + CELL / 2;
    const gy = g.cy * CELL + CELL / 2;

    ctx.save();
    ctx.translate(gx, gy);

    // 每 20 tick 輕微旋轉 ±6 度
    const rotPhase = Math.floor(game.tick / 20) % 2 === 0 ? 1 : -1;
    ctx.rotate((rotPhase * 6 * Math.PI) / 180);

    ctx.scale(scale, scale);
    ctx.translate(-13, -13);

    // 身體繪製（若未被吃）
    if (!g.eaten) {
      let bodyFill = ghostColors[idx % 4];
      if (g.frightened) {
        if (game.frightenedTicks < 90 && Math.floor(game.tick / 8) % 2 === 0) {
          bodyFill = '#FFFFFF';
        } else {
          bodyFill = '#9FB4E8';
        }
      }
      ctx.fillStyle = bodyFill;
      ctx.fill(dustStarPath);
    }

    // 眼睛位移偏 0.8
    let eyeOffsetX = 0;
    let eyeOffsetY = 0;
    if (g.dir === 0) eyeOffsetX = 0.8;
    else if (g.dir === 2) eyeOffsetX = -0.8;
    else if (g.dir === 3) eyeOffsetY = -0.8;
    else if (g.dir === 1) eyeOffsetY = 0.8;

    if (g.frightened && !g.eaten) {
      // 變弱時眼睛為兩條短橫線
      ctx.strokeStyle = '#121214';
      ctx.lineWidth = 1.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(9, 13);
      ctx.lineTo(12, 13);
      ctx.moveTo(14, 13);
      ctx.lineTo(17, 13);
      ctx.stroke();
    } else {
      // 正常眼白與瞳孔（被吃掉時也只畫眼睛）
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(10.5, 12.5, 2.6, 0, Math.PI * 2);
      ctx.arc(15.5, 12.5, 2.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#121214';
      ctx.beginPath();
      ctx.arc(11 + eyeOffsetX, 13 + eyeOffsetY, 1.2, 0, Math.PI * 2);
      ctx.arc(16 + eyeOffsetX, 13 + eyeOffsetY, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function loadBestScore() {
  const s = localStorage.getItem('pacman_best_score');
  if (s) {
    bestScore.value = parseInt(s, 10) || 0;
  }
}

function saveBestScore() {
  localStorage.setItem('pacman_best_score', bestScore.value.toString());
}

onMounted(() => {
  game = new PacmanGame();
  loadBestScore();
  syncState();

  const canvas = canvasRef.value;
  if (canvas) {
    resizeCanvas();
    resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(canvas);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  }

  window.addEventListener('keydown', handleKeyDown);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  rafId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  if (game) {
    game.destroy();
    game = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  const canvas = canvasRef.value;
  if (canvas) {
    canvas.removeEventListener('touchstart', handleTouchStart);
    canvas.removeEventListener('touchmove', handleTouchMove);
  }
  window.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.game-pacman {
  @include gs.screen;
  gap: 12px;
  background: color-mix(in srgb, #4f68c8 7%, var(--g-bg));
  --pm-accent: #4f68c8;
}

body.is-night-mode .game-pacman {
  background: #12172b;
  --g-surface: rgba(255, 255, 255, 0.1);
  --g-text: #e8ecf7;
  --g-text-2: #a9b3d1;
}

// 1. 頂欄
.topbar {
  @include gs.topbar;

  .round-btn {
    @include gs.round-btn;
  }

  .title {
    @include gs.title;
    font-family: inherit;
    font-size: 17px;
  }
}

// 2. 數據列
.stats-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  height: 40px;
  flex-shrink: 0;
  box-sizing: border-box;

  .stat-col {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;

    .label {
      font-size: 11px;
      color: var(--g-text-2);
      line-height: 1.2;
    }

    .value {
      font-family: var(--g-num);
      font-size: 22px;
      font-weight: 700;
      color: var(--g-text);
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
  }

  .level-col {
    .level-text {
      font-size: 18px;
      font-weight: 700;
      color: var(--g-text);
      line-height: 1.2;
    }
  }

  .lives-col {
    .lives-icons {
      display: flex;
      align-items: center;
      gap: 2px;
      height: 24px;

      .life-icon {
        width: 22px;
        height: 22px;
      }
    }
  }
}

// 3. 棋盤
.board-wrapper {
  padding: 6px;
  border-radius: 20px;
  background: #ffffff;
  align-self: center;
  position: relative;
  box-sizing: border-box;
  width: min(calc(100vw - 40px), calc((100dvh - 400px) * 19 / 21 + 12px), 390px);
  flex-shrink: 0;

  .board-canvas {
    width: 100%;
    display: block;
    aspect-ratio: 19 / 21;
    touch-action: none;
  }
}

body.is-night-mode .board-wrapper {
  background: #0c1020;
}

// 棋盤遮罩
.scrim-overlay {
  @include gs.board-scrim(20px);

  .scrim-title-ready {
    font-size: 24px;
    font-weight: 700;
    color: var(--g-text);
    margin: 0;
  }

  .scrim-desc {
    font-size: 14px;
    color: var(--g-text-2);
    margin: 4px 0 16px;
  }

  .scrim-title-end {
    font-size: 28px;
    font-weight: 700;
    color: var(--g-text);
    margin: 0 0 4px;
  }

  .scrim-score-box {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;

    .label {
      font-size: 14px;
      color: var(--g-text-2);
    }

    .num {
      font-family: var(--g-num);
      font-size: 32px;
      font-weight: 700;
      color: var(--g-text);
      font-variant-numeric: tabular-nums;
    }
  }

  .new-record-tag {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: #8a5a00;
    font-weight: 700;
    margin-bottom: 8px;

    svg {
      width: 16px;
      height: 16px;
    }
  }

  .scrim-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 8px;
  }
}

body.is-night-mode .scrim-overlay {
  background: rgba(18, 23, 43, 0.88);
}

.pill-dark-btn {
  @include gs.pill-dark(44px);
}

.pill-outline-btn {
  @include gs.pill-outline(44px);
}

// 4. 操作區
.controls-area {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 390px;
  align-self: center;

  .dpad-grid {
    display: grid;
    grid-template-columns: repeat(3, 52px);
    grid-template-rows: repeat(3, 52px);
    gap: 4px;
    flex-shrink: 0;

    .dpad-empty {
      width: 52px;
      height: 52px;
    }

    .dpad-btn {
      width: 52px;
      height: 52px;
      border-radius: 16px;
      border: none;
      background: var(--g-surface);
      color: var(--g-text);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      cursor: pointer;
      touch-action: manipulation;
      transition: background-color 0.12s, color 0.12s, transform 0.1s;

      svg {
        width: 20px;
        height: 20px;
      }

      &.active {
        background: var(--pm-accent);
        color: #ffffff;
      }

      &:active {
        transform: scale(0.94);
      }
    }
  }

  .game-instruction {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--g-text-2);

    p {
      margin: 0;
    }

    b {
      color: var(--g-text);
    }
  }
}
</style>
