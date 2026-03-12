<template>
  <div class="tetris-game-test">
    <!-- 难度选择菜单 -->
    <TetrisStartMenu
      v-if="showStartMenu && !showHighScoresPanel"
      @start="handleStartWithDifficulty"
      @continue="handleContinue"
      @show-high-scores="handleShowHighScores"
      @close="$emit('close')"
    />

    <!-- 高分榜 -->
    <TetrisHighScores
      v-else-if="showHighScoresPanel"
      @close="showHighScoresPanel = false"
    />

    <!-- 游戏界面 -->
    <template v-else-if="!showStartMenu && !showHighScoresPanel">
      <button class="close-btn" @click="$emit('close')">
        <X :size="20" />
      </button>

      <div class="test-header">
        <h2>俄罗斯方块</h2>
        <p class="subtitle">{{ difficultyLabel }}</p>
      </div>

      <div class="game-container" :class="{ 'desktop-mode': isDesktop }">
        <!-- === PC 桌面佈局 === -->
        <template v-if="isDesktop">
          <!-- 左側：方向鍵 + HOLD 預覽 -->
          <div class="desktop-side desktop-left">
            <div v-if="holdEnabled" class="desktop-preview-item">
              <h4>HOLD</h4>
              <div class="preview-box">
                <div
                  v-if="holdPiece"
                  class="preview-grid"
                  :style="{ '--preview-size': '12px' }"
                >
                  <div
                    v-for="(row, y) in holdPiece.shape"
                    :key="'hold-row-' + y"
                    class="preview-row"
                  >
                    <div
                      v-for="(cell, x) in row"
                      :key="'hold-cell-' + x"
                      class="preview-cell"
                      :class="{ disabled: !canHold }"
                      :style="{
                        backgroundColor: cell ? holdPiece.color : 'transparent',
                        opacity: canHold ? 1 : 0.3,
                      }"
                    ></div>
                  </div>
                </div>
                <div v-else class="empty-preview">-</div>
              </div>
              <div
                v-if="holdPiece"
                class="hold-status"
                :class="{ disabled: !canHold }"
              >
                {{ canHold ? "OK" : "NO" }}
              </div>
            </div>

            <div class="desktop-controls">
              <div class="move-buttons-vertical">
                <button
                  class="move-btn"
                  :disabled="!canControl"
                  @click="handleMoveLeft"
                >
                  <ChevronLeft :size="36" />
                </button>
                <button
                  class="move-btn"
                  :disabled="!canControl"
                  @click="handleMoveRight"
                >
                  <ChevronRight :size="36" />
                </button>
              </div>
              <button
                class="move-btn move-down-btn"
                :disabled="!canControl"
                @click="handleMoveDown"
              >
                <ChevronDown :size="36" />
              </button>
            </div>
          </div>

          <!-- 中間：遊戲棋盤 -->
          <div class="desktop-center">
            <div class="screen-container">
              <div class="screen-area">
                <TetrisBoard
                  :grid="grid"
                  :current-piece="currentPiece"
                  :ghost-piece="ghostEnabled ? ghostPiece : null"
                  :cell-size="dynamicCellSize"
                />
              </div>
            </div>

            <!-- 系統按鈕 -->
            <div class="center-buttons">
              <button v-if="!isPlaying" class="start-btn" @click="startGame">
                START
              </button>
              <button
                v-else-if="!isPaused"
                class="pause-btn-small"
                @click="togglePause"
              >
                PAUSE
              </button>
              <button v-else class="pause-btn-small" @click="togglePause">
                RESUME
              </button>
              <button v-if="isPlaying" class="select-btn" @click="restart">
                RESET
              </button>
              <button
                class="audio-toggle-btn"
                :class="{ 'audio-disabled': !audio.settings.value.enabled }"
                @click="audio.toggleAudio"
              >
                <component
                  :is="audio.settings.value.enabled ? Volume2Icon : VolumeXIcon"
                  :size="18"
                />
              </button>
            </div>
          </div>

          <!-- 右側：動作鍵 + NEXT 預覽 + 統計 -->
          <div class="desktop-side desktop-right">
            <div class="desktop-preview-item">
              <h4>NEXT</h4>
              <div class="preview-box">
                <div
                  v-if="nextPiece"
                  class="preview-grid"
                  :style="{ '--preview-size': '12px' }"
                >
                  <div
                    v-for="(row, y) in nextPiece.shape"
                    :key="'preview-row-' + y"
                    class="preview-row"
                  >
                    <div
                      v-for="(cell, x) in row"
                      :key="'preview-cell-' + x"
                      class="preview-cell"
                      :style="{
                        backgroundColor: cell ? nextPiece.color : 'transparent',
                      }"
                    ></div>
                  </div>
                </div>
                <div v-else class="empty-preview">-</div>
              </div>
            </div>

            <div class="desktop-controls">
              <div class="diamond-buttons desktop-diamond">
                <button
                  class="diamond-btn diamond-up"
                  :disabled="!canControl"
                  @click="handleRotate"
                >
                  <RotateCw :size="20" />
                </button>
                <button
                  v-if="holdEnabled"
                  class="diamond-btn diamond-left"
                  :disabled="!canControl || !canHold"
                  @click="handleHold"
                >
                  <span class="btn-label">B</span>
                </button>
                <div class="diamond-center"></div>
                <button
                  class="diamond-btn diamond-right"
                  :disabled="!canControl"
                  @click="handleHardDrop"
                >
                  <span class="btn-label">A</span>
                </button>
                <button
                  class="diamond-btn diamond-down"
                  :disabled="!canControl"
                  @click="handleMoveDown"
                >
                  <ChevronDown :size="20" />
                </button>
              </div>
            </div>

            <!-- PC 端統計面板（常駐顯示） -->
            <div v-if="isPlaying && !isGameOver" class="desktop-stats">
              <TetrisStats
                :score="score"
                :level="level"
                :lines="lines"
                :combo="combo"
                :max-combo="maxCombo"
                :is-back-to-back="isBackToBack"
                :back-to-back-count="backToBackCount"
                :statistics="statistics"
              />
            </div>
          </div>
        </template>

        <!-- === 手機掌機佈局 === -->
        <div v-else class="handheld-console">
          <!-- 棋盤區域：HOLD + Board + NEXT 水平排列 -->
          <div class="board-row">
            <!-- 左側 HOLD 預覽 -->
            <div class="side-preview">
              <template v-if="holdEnabled">
                <h4>HOLD</h4>
                <div class="preview-box">
                  <div
                    v-if="holdPiece"
                    class="preview-grid"
                    :style="{ '--preview-size': '10px' }"
                  >
                    <div
                      v-for="(row, y) in holdPiece.shape"
                      :key="'hold-row-' + y"
                      class="preview-row"
                    >
                      <div
                        v-for="(cell, x) in row"
                        :key="'hold-cell-' + x"
                        class="preview-cell"
                        :class="{ disabled: !canHold }"
                        :style="{
                          backgroundColor: cell
                            ? holdPiece.color
                            : 'transparent',
                          opacity: canHold ? 1 : 0.3,
                        }"
                      ></div>
                    </div>
                  </div>
                  <div v-else class="empty-preview">-</div>
                </div>
                <div
                  v-if="holdPiece"
                  class="hold-status"
                  :class="{ disabled: !canHold }"
                >
                  {{ canHold ? "OK" : "NO" }}
                </div>
              </template>
            </div>

            <!-- 中間棋盤 -->
            <div class="screen-container" ref="screenContainerRef">
              <div class="screen-area">
                <TetrisBoard
                  :grid="grid"
                  :current-piece="currentPiece"
                  :ghost-piece="ghostEnabled ? ghostPiece : null"
                  :cell-size="dynamicCellSize"
                />
              </div>
            </div>

            <!-- 右側 NEXT 預覽 -->
            <div class="side-preview">
              <h4>NEXT</h4>
              <div class="preview-box">
                <div
                  v-if="nextPiece"
                  class="preview-grid"
                  :style="{ '--preview-size': '10px' }"
                >
                  <div
                    v-for="(row, y) in nextPiece.shape"
                    :key="'preview-row-' + y"
                    class="preview-row"
                  >
                    <div
                      v-for="(cell, x) in row"
                      :key="'preview-cell-' + x"
                      class="preview-cell"
                      :style="{
                        backgroundColor: cell ? nextPiece.color : 'transparent',
                      }"
                    ></div>
                  </div>
                </div>
                <div v-else class="empty-preview">-</div>
              </div>
            </div>
          </div>

          <!-- 控制器区域 -->
          <div class="controller-area" :class="{ 'left-handed': isLeftHanded }">
            <div class="move-buttons">
              <button
                class="move-btn move-left"
                :disabled="!canControl"
                @touchstart.prevent="handleTouchStart(handleMoveLeft)"
                @touchend.prevent="handleTouchEnd"
                @touchcancel.prevent="handleTouchEnd"
                @click="handleMoveLeft"
              >
                <ChevronLeft :size="42" />
              </button>
              <button
                class="move-btn move-right"
                :disabled="!canControl"
                @touchstart.prevent="handleTouchStart(handleMoveRight)"
                @touchend.prevent="handleTouchEnd"
                @touchcancel.prevent="handleTouchEnd"
                @click="handleMoveRight"
              >
                <ChevronRight :size="42" />
              </button>
            </div>

            <div class="diamond-buttons">
              <button
                class="diamond-btn diamond-up"
                :disabled="!canControl"
                @touchstart.prevent="handleRotate"
                @click="handleRotate"
              >
                <RotateCw :size="20" />
              </button>
              <button
                v-if="!isLeftHanded && holdEnabled"
                class="diamond-btn diamond-left"
                :disabled="!canControl || !canHold"
                @touchstart.prevent="handleHold"
                @click="handleHold"
              >
                <span class="btn-label">B</span>
              </button>
              <button
                v-else-if="isLeftHanded"
                class="diamond-btn diamond-left"
                :disabled="!canControl"
                @touchstart.prevent="handleHardDrop"
                @click="handleHardDrop"
              >
                <span class="btn-label">A</span>
              </button>
              <div class="diamond-center"></div>
              <button
                v-if="!isLeftHanded"
                class="diamond-btn diamond-right"
                :disabled="!canControl"
                @touchstart.prevent="handleHardDrop"
                @click="handleHardDrop"
              >
                <span class="btn-label">A</span>
              </button>
              <button
                v-else-if="isLeftHanded && holdEnabled"
                class="diamond-btn diamond-right"
                :disabled="!canControl || !canHold"
                @touchstart.prevent="handleHold"
                @click="handleHold"
              >
                <span class="btn-label">B</span>
              </button>
              <button
                class="diamond-btn diamond-down"
                :disabled="!canControl"
                @touchstart.prevent="handleTouchStart(handleMoveDown)"
                @touchend.prevent="handleTouchEnd"
                @touchcancel.prevent="handleTouchEnd"
                @click="handleMoveDown"
              >
                <ChevronDown :size="20" />
              </button>
            </div>
          </div>

          <!-- 系统按钮 -->
          <div class="center-buttons">
            <button v-if="!isPlaying" class="start-btn" @click="startGame">
              START
            </button>
            <button
              v-else-if="!isPaused"
              class="pause-btn-small"
              @click="togglePause"
            >
              PAUSE
            </button>
            <button v-else class="pause-btn-small" @click="togglePause">
              RESUME
            </button>
            <button v-if="isPlaying" class="select-btn" @click="restart">
              RESET
            </button>
            <button class="hand-switch-btn" @click="toggleHandMode">
              <Hand :size="18" />
            </button>
            <button
              class="audio-toggle-btn"
              :class="{ 'audio-disabled': !audio.settings.value.enabled }"
              @click="audio.toggleAudio"
            >
              <component
                :is="audio.settings.value.enabled ? Volume2Icon : VolumeXIcon"
                :size="18"
              />
            </button>
          </div>

          <!-- 浮动统计徽章 -->
          <div v-if="isPlaying && !isGameOver" class="floating-stats-wrapper">
            <div
              class="floating-stats-badge"
              @click="showStatsPanel = !showStatsPanel"
            >
              <BarChart3 :size="14" />
              <span class="badge-score">{{ score.toLocaleString() }}</span>
              <span class="badge-sep">|</span>
              <span class="badge-info">Lv.{{ level }}</span>
              <span class="badge-sep">|</span>
              <span class="badge-info">{{ lines }}行</span>
              <ChevronUp v-if="showStatsPanel" :size="14" />
              <ChevronDown v-else :size="14" />
            </div>

            <!-- 统计迷你浮窗 -->
            <Transition name="stats-slide">
              <div v-if="showStatsPanel" class="stats-mini-panel" @click.stop>
                <TetrisStats
                  :score="score"
                  :level="level"
                  :lines="lines"
                  :combo="combo"
                  :max-combo="maxCombo"
                  :is-back-to-back="isBackToBack"
                  :back-to-back-count="backToBackCount"
                  :statistics="statistics"
                />
                <button class="stats-close-btn" @click="showStatsPanel = false">
                  <X :size="14" />
                </button>
              </div>
            </Transition>
          </div>

          <!-- 游戏结束弹窗 -->
          <div v-if="isGameOver" class="game-over-overlay">
            <TetrisGameOver
              :score="score"
              :level="level"
              :lines="lines"
              :max-combo="maxCombo"
              :total-pieces="statistics.totalPieces"
              :clears="statistics.clears"
              :is-new-record="isNewRecord"
              @restart="restart"
              @close="emit('close')"
              @share="shareScore"
            />
          </div>

          <!-- 暂停提示 -->
          <div
            v-if="isPaused && !isGameOver"
            class="pause-overlay"
            @click="togglePause"
          >
            <div class="pause-message">
              <PauseCircle :size="64" />
              <h2>游戏已暂停</h2>
              <p>点击任意处或按 Esc 继续</p>
              <div class="pause-stats">
                <div class="pause-stat">
                  <span class="label">分数</span
                  ><span class="value">{{ score.toLocaleString() }}</span>
                </div>
                <div class="pause-stat">
                  <span class="label">等级</span
                  ><span class="value">{{ level }}</span>
                </div>
                <div class="pause-stat">
                  <span class="label">消行</span
                  ><span class="value">{{ lines }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PC 端遊戲結束 / 暫停覆蓋層 -->
        <template v-if="isDesktop">
          <div v-if="isGameOver" class="desktop-overlay">
            <TetrisGameOver
              :score="score"
              :level="level"
              :lines="lines"
              :max-combo="maxCombo"
              :total-pieces="statistics.totalPieces"
              :clears="statistics.clears"
              :is-new-record="isNewRecord"
              @restart="restart"
              @close="emit('close')"
              @share="shareScore"
            />
          </div>
          <div
            v-if="isPaused && !isGameOver"
            class="desktop-overlay"
            @click="togglePause"
          >
            <div class="pause-message">
              <PauseCircle :size="64" />
              <h2>游戏已暂停</h2>
              <p>点击任意处或按 Esc 继续</p>
              <div class="pause-stats">
                <div class="pause-stat">
                  <span class="label">分数</span
                  ><span class="value">{{ score.toLocaleString() }}</span>
                </div>
                <div class="pause-stat">
                  <span class="label">等级</span
                  ><span class="value">{{ level }}</span>
                </div>
                <div class="pause-stat">
                  <span class="label">消行</span
                  ><span class="value">{{ lines }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import type { GameScoreData, TetrisMetadata } from "@/types";
import {
    BarChart3,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Hand,
    PauseCircle,
    RotateCw,
    Volume2 as Volume2Icon,
    VolumeX as VolumeXIcon,
    X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import TetrisBoard from "./TetrisBoard.vue";
import TetrisGameOver from "./TetrisGameOver.vue";
import TetrisHighScores from "./TetrisHighScores.vue";
import TetrisStartMenu from "./TetrisStartMenu.vue";
import TetrisStats from "./TetrisStats.vue";
import { DIFFICULTY_CONFIGS, GRID_HEIGHT, GRID_WIDTH } from "./tetrisConstants";
import { getHighScoreByDifficulty, getHighScores } from "./tetrisSaveManager";
import type { DifficultyLevel } from "./tetrisTypes";
import { useTetrisGame } from "./useTetrisGame";

const emit = defineEmits<{
  close: [];
  shareScore: [scoreData: GameScoreData];
}>();

// 左右手模式
const HAND_MODE_KEY = "tetris-hand-mode";
const isLeftHanded = ref(false);

// 動態計算 cellSize 以適配視窗
const screenContainerRef = ref<HTMLElement | null>(null);
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);

// PC 模式判斷：寬度 >= 768px
const isDesktop = computed(() => viewportWidth.value >= 768);

const dynamicCellSize = computed(() => {
  const vw = viewportWidth.value;
  const vh = viewportHeight.value;
  if (isDesktop.value) {
    // PC 模式：棋盤可以更大，扣除 header + padding
    const availableHeight = vh - 120;
    const computedSize = Math.floor(
      Math.max(availableHeight, 300) / GRID_HEIGHT,
    );
    return Math.max(16, Math.min(36, computedSize));
  }
  // 手機模式：同時考慮寬度和高度，取較小值
  // 寬度：扣除兩側 preview(~50px*2) + gaps + padding
  const availableWidth = vw - 140;
  const cellFromWidth = Math.floor(availableWidth / GRID_WIDTH);
  // 高度：扣除 header(~60px) + controller(~140px) + buttons(~50px) + stats(~40px) + gaps+padding(~80px)
  const availableHeight = vh - 370;
  const cellFromHeight = Math.floor(
    Math.max(availableHeight, 100) / GRID_HEIGHT,
  );
  // 取寬高中較小的，確保棋盤不溢出
  const computedSize = Math.min(cellFromWidth, cellFromHeight);
  return Math.max(12, Math.min(28, computedSize));
});

const handleResize = () => {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
};

onMounted(async () => {
  window.addEventListener("resize", handleResize);
  handleResize();
  try {
    const record = await db.get<{ value: boolean }>(
      DB_STORES.SETTINGS,
      HAND_MODE_KEY,
    );
    if (record && typeof record.value === "boolean") {
      isLeftHanded.value = record.value;
    } else {
      const saved = localStorage.getItem(HAND_MODE_KEY);
      if (saved !== null) {
        isLeftHanded.value = saved === "true";
        await db.put(
          DB_STORES.SETTINGS,
          { value: isLeftHanded.value },
          HAND_MODE_KEY,
        );
        localStorage.removeItem(HAND_MODE_KEY);
      }
    }
  } catch (_e) {
    /* ignore */
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);
});

watch(isLeftHanded, async (newValue) => {
  try {
    await db.put(DB_STORES.SETTINGS, { value: newValue }, HAND_MODE_KEY);
  } catch (_e) {
    /* ignore */
  }
});

const toggleHandMode = () => {
  isLeftHanded.value = !isLeftHanded.value;
  vibrate(20);
};

const {
  grid,
  currentPiece,
  nextPiece,
  holdPiece,
  canHold,
  ghostPiece,
  score,
  level,
  lines,
  isPlaying,
  isPaused,
  isGameOver,
  currentDifficulty,
  ghostEnabled,
  holdEnabled,
  statistics,
  combo,
  maxCombo,
  isBackToBack,
  backToBackCount,
  audio,
  moveLeft,
  moveRight,
  moveDown,
  rotate,
  hardDrop,
  holdCurrentPiece,
  startGame,
  togglePause,
  restart,
  loadSavedGame,
  hasSavedGame,
} = useTetrisGame();

const showStartMenu = ref(!isPlaying.value);
const showHighScoresPanel = ref(false);
const showStatsPanel = ref(false);

watch(isPlaying, (playing) => {
  if (playing) showStartMenu.value = false;
  else if (!isGameOver.value) showStartMenu.value = true;
});

const handleStartWithDifficulty = (difficulty: DifficultyLevel) => {
  const config = DIFFICULTY_CONFIGS[difficulty];
  startGame(config);
  showStartMenu.value = false;
};

const handleContinue = () => {
  if (loadSavedGame()) showStartMenu.value = false;
};
const handleShowHighScores = () => {
  showHighScoresPanel.value = true;
};

const isNewRecord = computed(() => {
  if (!isGameOver.value) return false;
  const scores = getHighScores();
  if (scores.length < 10) return true;
  return score.value > scores[scores.length - 1].score;
});

const shareScore = () => {
  const metadata: TetrisMetadata = {
    type: "tetris",
    linesCleared: lines.value,
    level: level.value,
  };
  const highScore = getHighScoreByDifficulty(currentDifficulty.value.name);
  const scoreData: GameScoreData = {
    gameId: "tetris",
    gameName: "俄羅斯方塊",
    gameIcon: "mdi:gamepad-square",
    score: score.value,
    bestScore: highScore?.score ?? score.value,
    isNewRecord: isNewRecord.value,
    timestamp: Date.now(),
    metadata,
  };
  emit("shareScore", scoreData);
};

const difficultyLabel = computed(
  () =>
    `难度: ${currentDifficulty.value.label} (×${currentDifficulty.value.scoreMultiplier})`,
);
const canControl = computed(
  () => isPlaying.value && !isPaused.value && !isGameOver.value,
);

const vibrate = (duration: number = 10) => {
  if ("vibrate" in navigator) navigator.vibrate(duration);
};

let touchTimer: number | null = null;
let touchAction: (() => void) | null = null;

const handleTouchStart = (action: () => void) => {
  action();
  vibrate(10);
  touchTimer = window.setTimeout(() => {
    touchAction = action;
    touchTimer = window.setInterval(() => {
      if (touchAction) touchAction();
    }, 100);
  }, 300);
};

const handleTouchEnd = () => {
  if (touchTimer !== null) {
    clearTimeout(touchTimer);
    clearInterval(touchTimer);
    touchTimer = null;
  }
  touchAction = null;
};

const handleMoveLeft = () => {
  moveLeft();
  vibrate(10);
};
const handleMoveRight = () => {
  moveRight();
  vibrate(10);
};
const handleMoveDown = () => {
  moveDown();
  vibrate(10);
};
const handleRotate = () => {
  rotate();
  vibrate(15);
};
const handleHardDrop = () => {
  hardDrop();
  vibrate(30);
};
const handleHold = () => {
  holdCurrentPiece();
  vibrate(20);
};
</script>

<style scoped lang="scss">
/* === 樣式已重構，支援 PC 桌面 + 手機掌機雙佈局 === */
.tetris-game-test {
  position: fixed;
  inset: 0;
  background: #fafafa;
  color: #1f2937;
  box-sizing: border-box;
  padding: 12px;
  padding-top: max(12px, env(safe-area-inset-top));
  padding-right: max(12px, env(safe-area-inset-right));
  padding-bottom: max(12px, var(--safe-bottom, 0px));
  padding-left: max(12px, env(safe-area-inset-left));
  overflow: hidden;
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  will-change: transform;
  backface-visibility: hidden;

  .close-btn {
    position: fixed;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    width: clamp(36px, 8vw, 40px);
    height: clamp(36px, 8vw, 40px);
    border: none;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #333;
    cursor: pointer;
    z-index: 10;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    &:active {
      transform: scale(0.95);
    }
  }

  .test-header {
    text-align: center;
    flex-shrink: 0;
    padding-bottom: clamp(4px, 1vh, 12px);
    h2 {
      font-size: clamp(18px, 4vw, 26px);
      margin: 0 0 2px 0;
    }
    .subtitle {
      font-size: clamp(12px, 2.5vw, 15px);
      opacity: 0.8;
      margin: 0;
    }
  }

  // ========== PC 桌面佈局 ==========
  .game-container.desktop-mode {
    position: relative;
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 24px;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 16px;
    box-sizing: border-box;

    .preview-box {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 4px;
      background: #1a1a1a;
      border-radius: 6px;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
      min-height: 40px;
      width: 100%;
      max-width: 64px;
    }
    .preview-grid {
      display: inline-grid;
      grid-template-columns: repeat(4, 1fr);
      grid-template-rows: repeat(4, 1fr);
      gap: 1px;
      width: 100%;
      max-width: calc(var(--preview-size) * 4 + 3px);
      aspect-ratio: 1 / 1;
      .preview-row {
        display: contents;
      }
      .preview-cell {
        width: 100%;
        aspect-ratio: 1 / 1;
        border-radius: 1px;
        &.disabled {
          opacity: 0.3;
        }
      }
    }
    .empty-preview {
      font-size: 14px;
      color: #555;
      font-weight: bold;
    }

    .desktop-side {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      width: 200px;
      flex-shrink: 0;
    }

    .desktop-preview-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      background: rgba(0, 0, 0, 0.06);
      border-radius: 12px;
      padding: 12px 16px;
      h4 {
        margin: 0;
        font-size: 11px;
        font-weight: 700;
        color: #95a5a6;
        letter-spacing: 1px;
        text-transform: uppercase;
        font-family: monospace;
      }
      .hold-status {
        margin-top: 2px;
        font-size: 10px;
        font-weight: 700;
        color: #2ecc71;
        font-family: monospace;
        text-transform: uppercase;
        &.disabled {
          color: #e74c3c;
        }
      }
    }

    .desktop-controls {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .move-buttons-vertical {
      display: flex;
      gap: 10px;
      .move-btn {
        width: 70px;
        height: 70px;
      }
    }
    .move-down-btn {
      width: 70px;
      height: 50px;
    }
    .move-btn {
      border: none;
      cursor: pointer;
      background: linear-gradient(145deg, #34495e, #2c3e50);
      border-radius: 12px;
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      color: #95a5a6;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.1s;
      &:active:not(:disabled) {
        background: linear-gradient(145deg, #2c3e50, #1a252f);
        transform: scale(0.95);
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      svg {
        pointer-events: none;
      }
    }

    .desktop-diamond {
      flex: none;
      width: 130px;
      height: 130px;
      max-width: none;
      min-width: auto;
      margin-right: 0;
    }

    .diamond-buttons {
      position: relative;
      aspect-ratio: 1 / 1;
      background: #2c3e50;
      border-radius: 12px;
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .diamond-btn {
      position: absolute;
      width: 33%;
      height: 33%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      font-weight: 900;
      font-size: 16px;
      transition: all 0.1s;
      z-index: 2;
      &:active:not(:disabled) {
        transform: scale(0.95);
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .btn-label,
      svg {
        pointer-events: none;
      }
    }
    .diamond-up {
      top: 0;
      left: 33.5%;
      background: linear-gradient(145deg, #3498db, #2980b9);
      color: white;
      border-radius: 8px 8px 0 0;
    }
    .diamond-down {
      bottom: 0;
      left: 33.5%;
      background: linear-gradient(145deg, #9b59b6, #8e44ad);
      color: white;
      border-radius: 0 0 8px 8px;
    }
    .diamond-left {
      left: 0;
      top: 33.5%;
      background: linear-gradient(145deg, #f39c12, #e67e22);
      color: white;
      border-radius: 8px 0 0 8px;
    }
    .diamond-right {
      right: 0;
      top: 33.5%;
      background: linear-gradient(145deg, #e74c3c, #c0392b);
      color: white;
      border-radius: 0 8px 8px 0;
    }
    .diamond-center {
      position: absolute;
      width: 28%;
      height: 28%;
      background: #1a252f;
      border-radius: 50%;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1;
      pointer-events: none;
    }

    .desktop-center {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      max-width: 400px;
      .screen-container {
        background: #2c3e50;
        padding: 10px;
        border-radius: 16px;
        box-shadow:
          inset 0 4px 8px rgba(0, 0, 0, 0.4),
          0 2px 4px rgba(0, 0, 0, 0.2);
        width: 100%;
        box-sizing: border-box;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .screen-area {
        background: #1a1a1a;
        padding: 8px;
        border-radius: 12px;
        box-shadow:
          inset 0 4px 8px rgba(0, 0, 0, 0.6),
          0 2px 4px rgba(0, 0, 0, 0.2);
        border: 2px solid #333;
        flex: 1;
        min-height: 0;
        min-width: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        :deep(.tetris-board-container) {
          width: 100%;
          height: 100%;
        }
      }
      .center-buttons {
        button {
          font-size: 13px;
          min-width: 80px;
        }
        .audio-toggle-btn {
          min-width: 50px;
        }
      }
    }

    .desktop-right .desktop-stats {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      width: 100%;
      :deep(.tetris-stats) {
        min-width: unset;
        font-size: 13px;
      }
    }

    .center-buttons {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      padding: 8px 0;
      box-sizing: border-box;
      flex-wrap: wrap;
      flex-shrink: 0;
      button {
        padding: 8px 18px;
        background: linear-gradient(145deg, #7f8c8d, #95a5a6);
        border: none;
        border-radius: 10px;
        color: #2c3e50;
        font-size: 13px;
        font-weight: 900;
        letter-spacing: 0.5px;
        min-width: 80px;
        white-space: nowrap;
        cursor: pointer;
        box-shadow:
          0 3px 6px rgba(0, 0, 0, 0.3),
          inset 0 1px 2px rgba(255, 255, 255, 0.3);
        transition: all 0.1s;
        font-family: monospace;
        &:active {
          background: linear-gradient(145deg, #95a5a6, #7f8c8d);
          transform: translateY(2px);
        }
      }
      .audio-toggle-btn {
        background: linear-gradient(145deg, #3498db, #2980b9);
        color: white;
        min-width: 50px;
        padding: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        svg {
          pointer-events: none;
        }
        &:active {
          background: linear-gradient(145deg, #2980b9, #1f5f8b);
          transform: scale(0.95);
        }
        &.audio-disabled {
          background: linear-gradient(145deg, #95a5a6, #7f8c8d);
          opacity: 0.7;
        }
      }
    }

    .desktop-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(5px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 50;
      border-radius: 12px;
      animation: fadeIn 0.2s ease-out;
      cursor: pointer;
      padding: 20px;
    }
  }

  // ========== 手機掌機佈局 ==========
  .game-container:not(.desktop-mode) {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: stretch;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 100%;
    padding: 0 clamp(4px, 1vw, 12px);
    box-sizing: border-box;
    overflow: hidden;

    .handheld-console {
      position: relative;
      background: linear-gradient(to bottom, #e8e8e8 0%, #c8c8c8 100%);
      border-radius: 20px;
      padding: clamp(8px, 1.5vh, 14px);
      box-shadow:
        0 8px 24px rgba(0, 0, 0, 0.3),
        inset 0 2px 4px rgba(255, 255, 255, 0.4);
      border: 3px solid #999;
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 1vh, 10px);
      width: 100%;
      max-width: 600px;
      box-sizing: border-box;
      font-size: clamp(12px, 1.2vw, 14px);
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      user-select: none;
      // 填滿可用空間，讓內部元素自適應分配
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    .preview-bar {
      display: none; // 已移除，改用 board-row 佈局
    }

    // 棋盤區域：HOLD + Board + NEXT 水平排列
    .board-row {
      display: flex;
      align-items: flex-start;
      gap: clamp(2px, 0.5vw, 6px);
      // 佔據剩餘空間但不讓子元素溢出
      flex: 1;
      min-height: 0;
      width: 100%;
      overflow: hidden;
    }

    .side-preview {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding-top: clamp(4px, 1vh, 8px);
      gap: 3px;
      width: clamp(36px, 10vw, 50px);
      flex-shrink: 0;
      min-height: 0;
      h4 {
        margin: 0;
        font-size: 7px;
        font-weight: 700;
        color: #95a5a6;
        letter-spacing: 1px;
        text-transform: uppercase;
        font-family: monospace;
      }
      .preview-box {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 3px;
        background: #1a1a1a;
        border-radius: 4px;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
        min-height: 30px;
        width: 100%;
        max-width: 46px;
      }
      .preview-grid {
        display: inline-grid;
        grid-template-columns: repeat(4, 1fr);
        grid-template-rows: repeat(4, 1fr);
        gap: 1px;
        width: 100%;
        max-width: calc(var(--preview-size) * 4 + 3px);
        aspect-ratio: 1 / 1;
        .preview-row {
          display: contents;
        }
        .preview-cell {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 1px;
          &.disabled {
            opacity: 0.3;
          }
        }
      }
      .empty-preview {
        font-size: 12px;
        color: #555;
        font-weight: bold;
      }
      .hold-status {
        margin-top: 1px;
        font-size: 6px;
        font-weight: 700;
        color: #2ecc71;
        font-family: monospace;
        text-transform: uppercase;
        &.disabled {
          color: #e74c3c;
        }
      }
    }

    .preview-item {
      display: none; // 已移除
    }

    .preview-placeholder {
      display: none;
    }

    .screen-container {
      background: #2c3e50;
      padding: clamp(4px, 0.8vh, 8px);
      border-radius: 12px;
      box-shadow:
        inset 0 4px 8px rgba(0, 0, 0, 0.4),
        0 2px 4px rgba(0, 0, 0, 0.2);
      box-sizing: border-box;
      flex: 1;
      min-width: 0;
      // 關鍵：限制最大高度為 board-row 的高度，防止溢出
      max-height: 100%;
      // 用 aspect-ratio 讓高度跟隨寬度，緊貼棋盤
      aspect-ratio: 10 / 22;
      align-self: center;
    }

    .screen-area {
      background: #1a1a1a;
      padding: clamp(3px, 0.6vh, 8px);
      border-radius: 10px;
      box-shadow:
        inset 0 4px 8px rgba(0, 0, 0, 0.6),
        0 2px 4px rgba(0, 0, 0, 0.2);
      border: 2px solid #333;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      align-items: center;
      :deep(.tetris-board-container) {
        width: 100%;
        height: 100%;
      }
    }

    .controller-area {
      display: flex;
      justify-content: space-around;
      align-items: center;
      width: 100%;
      min-height: clamp(90px, 16vh, 140px);
      padding: clamp(4px, 1vh, 8px) 2%;
      gap: clamp(8px, 2vw, 20px);
      box-sizing: border-box;
      flex-wrap: nowrap;
      transition: all 0.3s ease;
      flex-shrink: 0;
      &.left-handed {
        flex-direction: row-reverse;
      }
    }

    .move-buttons {
      flex: 1 1 0;
      display: flex;
      flex-direction: row;
      gap: clamp(6px, 1.5vw, 10px);
      align-items: center;
      justify-content: center;
      max-width: 50%;
      padding: 0 clamp(4px, 1vw, 8px);
    }

    .move-btn {
      flex: 1;
      max-width: clamp(70px, 13vw, 100px);
      height: clamp(80px, 14vh, 130px);
      border: none;
      cursor: pointer;
      background: linear-gradient(145deg, #34495e, #2c3e50);
      border-radius: clamp(8px, 2vw, 12px);
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      color: #95a5a6;
      display: flex;
      justify-content: center;
      align-items: center;
      transition: all 0.1s;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      &:active:not(:disabled) {
        background: linear-gradient(145deg, #2c3e50, #1a252f);
        transform: scale(0.95);
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      svg {
        pointer-events: none;
      }
    }

    .center-buttons {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: clamp(6px, 1.5vw, 12px);
      width: 100%;
      padding: clamp(4px, 1vh, 8px) 0;
      box-sizing: border-box;
      flex-wrap: wrap;
      flex-shrink: 0;
      button {
        padding: clamp(5px, 1vh, 8px) clamp(12px, 3vw, 20px);
        background: linear-gradient(145deg, #7f8c8d, #95a5a6);
        border: none;
        border-radius: clamp(8px, 2vw, 12px);
        color: #2c3e50;
        font-size: clamp(10px, 2.2vw, 13px);
        font-weight: 900;
        letter-spacing: 0.5px;
        min-width: clamp(60px, 16vw, 90px);
        white-space: nowrap;
        cursor: pointer;
        box-shadow:
          0 3px 6px rgba(0, 0, 0, 0.3),
          inset 0 1px 2px rgba(255, 255, 255, 0.3);
        transition: all 0.1s;
        font-family: monospace;
        &:active {
          background: linear-gradient(145deg, #95a5a6, #7f8c8d);
          transform: translateY(2px);
        }
      }
      .hand-switch-btn,
      .audio-toggle-btn {
        background: linear-gradient(145deg, #3498db, #2980b9);
        color: white;
        min-width: clamp(40px, 10vw, 60px);
        padding: clamp(5px, 1vh, 8px);
        display: flex;
        align-items: center;
        justify-content: center;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        svg {
          pointer-events: none;
        }
        &:active {
          background: linear-gradient(145deg, #2980b9, #1f5f8b);
          transform: scale(0.95);
        }
      }
      .audio-toggle-btn.audio-disabled {
        background: linear-gradient(145deg, #95a5a6, #7f8c8d);
        opacity: 0.7;
      }
    }

    .diamond-buttons {
      flex: 0 0 auto;
      position: relative;
      width: clamp(85px, 22vw, 130px);
      height: clamp(85px, 22vw, 130px);
      aspect-ratio: 1 / 1;
      background: #2c3e50;
      border-radius: 12px;
      box-shadow:
        0 4px 8px rgba(0, 0, 0, 0.3),
        inset 0 -2px 4px rgba(0, 0, 0, 0.2);
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .diamond-btn {
      position: absolute;
      width: 33%;
      height: 33%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: monospace;
      font-weight: 900;
      font-size: clamp(14px, 3.5vw, 18px);
      transition: all 0.1s;
      z-index: 2;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      &:active:not(:disabled) {
        transform: scale(0.95);
      }
      &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .btn-label,
      svg {
        pointer-events: none;
      }
    }

    .diamond-up {
      top: 0;
      left: 33.5%;
      background: linear-gradient(145deg, #3498db, #2980b9);
      color: white;
      border-radius: 8px 8px 0 0;
    }
    .diamond-down {
      bottom: 0;
      left: 33.5%;
      background: linear-gradient(145deg, #9b59b6, #8e44ad);
      color: white;
      border-radius: 0 0 8px 8px;
    }
    .diamond-left {
      left: 0;
      top: 33.5%;
      color: white;
      border-radius: 8px 0 0 8px;
    }
    .diamond-right {
      right: 0;
      top: 33.5%;
      color: white;
      border-radius: 0 8px 8px 0;
    }

    .controller-area:not(.left-handed) {
      .diamond-left {
        background: linear-gradient(145deg, #f39c12, #e67e22);
      }
      .diamond-right {
        background: linear-gradient(145deg, #e74c3c, #c0392b);
      }
    }
    .controller-area.left-handed {
      .diamond-left {
        background: linear-gradient(145deg, #e74c3c, #c0392b);
      }
      .diamond-right {
        background: linear-gradient(145deg, #f39c12, #e67e22);
      }
    }

    .diamond-center {
      position: absolute;
      width: 28%;
      height: 28%;
      background: #1a252f;
      border-radius: 50%;
      box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.5);
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1;
      pointer-events: none;
    }

    // 浮动统计区域
    .floating-stats-wrapper {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      flex-shrink: 0;
      z-index: 40;
    }

    .floating-stats-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      border-radius: 20px;
      cursor: pointer;
      color: white;
      font-size: 12px;
      font-family: monospace;
      font-weight: 600;
      user-select: none;
      transition: all 0.2s ease;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
      svg {
        opacity: 0.8;
        flex-shrink: 0;
      }
      .badge-score {
        color: #10b981;
        font-size: 13px;
      }
      .badge-sep {
        opacity: 0.3;
      }
      .badge-info {
        opacity: 0.85;
      }
      &:active {
        transform: scale(0.95);
        background: rgba(0, 0, 0, 0.85);
      }
    }

    // 统计迷你浮窗
    .stats-mini-panel {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      width: 240px;
      max-height: 50vh;
      overflow-y: auto;
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
      z-index: 41;

      :deep(.tetris-stats) {
        min-width: unset;
        padding: 12px;
        font-size: 12px;
        border-radius: 14px;

        .stats-title {
          font-size: 13px;
          margin-bottom: 8px;
        }
        .stats-main {
          gap: 6px;
          margin-bottom: 8px;
          .stat-item {
            padding: 5px 8px;
            .stat-label {
              font-size: 11px;
            }
            .stat-value {
              font-size: 15px;
            }
          }
        }
        .stats-detail {
          margin-bottom: 8px;
          .detail-item {
            font-size: 11px;
          }
        }
        .clear-stats {
          padding-top: 8px;
          .clear-title {
            font-size: 12px;
            margin-bottom: 6px;
          }
          .clear-grid {
            gap: 5px;
            .clear-item {
              padding: 5px;
              .clear-type {
                font-size: 10px;
              }
              .clear-count {
                font-size: 13px;
              }
            }
          }
        }
      }

      .stats-close-btn {
        position: absolute;
        top: 6px;
        right: 6px;
        width: 22px;
        height: 22px;
        border: none;
        background: rgba(0, 0, 0, 0.08);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #9ca3af;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        &:active {
          background: rgba(0, 0, 0, 0.15);
        }
      }
    }

    // 统计面板动画
    .stats-slide-enter-active {
      transition: all 0.25s ease-out;
    }
    .stats-slide-leave-active {
      transition: all 0.2s ease-in;
    }
    .stats-slide-enter-from {
      opacity: 0;
      transform: translateX(-50%) translateY(8px) scale(0.95);
    }
    .stats-slide-leave-to {
      opacity: 0;
      transform: translateX(-50%) translateY(8px) scale(0.95);
    }
  }

  .pause-overlay,
  .game-over-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
    border-radius: 20px;
    animation: fadeIn 0.2s ease-out;
  }

  .pause-overlay,
  .desktop-overlay {
    cursor: pointer;
    padding: 20px;
    .pause-message {
      background: white;
      border-radius: 20px;
      padding: 24px 20px;
      text-align: center;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
      svg {
        color: var(--theme-primary, #10b981);
        margin-bottom: 8px;
      }
      h2 {
        margin: 0 0 6px 0;
        font-size: 22px;
        color: #1f2937;
      }
      p {
        margin: 0 0 16px 0;
        color: #6b7280;
        font-size: 13px;
      }
      .pause-stats {
        display: flex;
        gap: 16px;
        justify-content: center;
        .pause-stat {
          display: flex;
          flex-direction: column;
          gap: 4px;
          .label {
            font-size: 12px;
            color: #9ca3af;
          }
          .value {
            font-size: 18px;
            font-weight: 600;
            color: var(--theme-primary, #10b981);
          }
        }
      }
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
}
</style>
