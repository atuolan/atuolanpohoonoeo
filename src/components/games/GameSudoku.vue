<template>
  <div class="game-sudoku">
    <div class="header">
      <button class="back-btn" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">數獨</h1>
      <div class="header-actions">
        <button
          class="icon-btn"
          title="存檔管理"
          @click="showSaveMenu = !showSaveMenu"
        >
          <Save class="icon" />
        </button>
        <button
          class="icon-btn"
          title="新遊戲"
          @click="showDifficultyMenu = true"
        >
          <PlusCircle class="icon" />
        </button>
        <button class="icon-btn" title="暫停" @click="togglePause">
          <Play v-if="isPaused" class="icon" />
          <Pause v-else class="icon" />
        </button>
        <button class="icon-btn" title="重新開始" @click="restartGame">
          <RotateCcw class="icon" />
        </button>
      </div>
    </div>

    <!-- 存档管理菜单 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="showSaveMenu"
          class="save-menu-overlay"
          @click="showSaveMenu = false"
        >
          <div class="save-menu" @click.stop>
            <h3>存檔管理</h3>
            <div class="save-slots">
              <div v-if="hasSavedGame" class="save-slot filled">
                <div class="slot-header">
                  <span class="slot-title">固定存檔</span>
                  <span class="slot-difficulty" :class="savedGameDifficulty">{{
                    savedGameDifficultyText
                  }}</span>
                </div>
                <div class="slot-info">
                  <span>時間: {{ formatSaveTime(savedGameTime) }}</span>
                  <span>進度: {{ savedGameProgress }}%</span>
                </div>
                <div class="slot-actions">
                  <button class="btn-load" @click="loadSavedGame">
                    <Download :size="16" /> 讀取
                  </button>
                  <button class="btn-delete" @click="deleteSavedGame">
                    <Trash2 :size="16" /> 刪除
                  </button>
                </div>
              </div>
              <div v-else class="save-slot empty"><p>暫無存檔</p></div>
            </div>
            <div class="save-actions">
              <button
                class="btn-save-current"
                :disabled="isGameWon || isGameOver || !gameStarted"
                @click="saveCurrentGame"
              >
                <Save :size="20" /> 保存當前遊戲
              </button>
              <button class="btn-close" @click="showSaveMenu = false">
                關閉
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 难度选择菜单 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="showDifficultyMenu"
          class="difficulty-overlay"
          @click="showDifficultyMenu = false"
        >
          <div class="difficulty-menu" @click.stop>
            <h3>選擇難度</h3>
            <div class="difficulty-options">
              <button class="difficulty-btn easy" @click="startNewGame('easy')">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="currentColor"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path
                    d="M8 14s1.5 2 4 2 4-2 4-2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <circle cx="9" cy="9" r="1.5" />
                  <circle cx="15" cy="9" r="1.5" />
                </svg>
                <span>簡單</span><small>30-35個空格</small>
              </button>
              <button
                class="difficulty-btn medium"
                @click="startNewGame('medium')"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="currentColor"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <line
                    x1="8"
                    y1="14"
                    x2="16"
                    y2="14"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <circle cx="9" cy="9" r="1.5" />
                  <circle cx="15" cy="9" r="1.5" />
                </svg>
                <span>中等</span><small>40-45個空格</small>
              </button>
              <button class="difficulty-btn hard" @click="startNewGame('hard')">
                <svg
                  viewBox="0 0 24 24"
                  width="40"
                  height="40"
                  fill="currentColor"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  />
                  <path
                    d="M8 16s1.5-2 4-2 4 2 4 2"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <circle cx="9" cy="9" r="1.5" />
                  <circle cx="15" cy="9" r="1.5" />
                </svg>
                <span>困難</span><small>50-55個空格</small>
              </button>
            </div>
            <button class="btn-close" @click="showDifficultyMenu = false">
              取消
            </button>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 游戏主体 -->
    <div class="game-container">
      <div class="game-info">
        <div class="info-item">
          <Clock :size="16" /><span class="info-value">{{
            formattedTime
          }}</span>
        </div>
        <div class="info-item">
          <AlertCircle :size="16" /><span class="info-value"
            >錯誤: {{ errorCount }}/{{ maxErrors }}</span
          >
        </div>
        <div class="info-item">
          <Lightbulb :size="16" /><span class="info-value"
            >提示: {{ hintsLeft }}/5</span
          >
        </div>
        <div class="info-item best-time" v-if="currentBestTime > 0">
          <Trophy :size="16" /><span class="info-value"
            >最佳: {{ formatTime(currentBestTime) }}</span
          >
        </div>
        <div class="info-item difficulty-badge" :class="currentDifficulty">
          <span>{{ difficultyText }}</span>
        </div>
      </div>

      <div class="game-wrapper">
        <div class="sudoku-board">
          <div
            v-for="(row, rowIndex) in board"
            :key="`row-${rowIndex}`"
            class="sudoku-row"
          >
            <div
              v-for="(cell, colIndex) in row"
              :key="`cell-${rowIndex}-${colIndex}`"
              class="sudoku-cell"
              :class="{
                initial: cell.isInitial,
                selected:
                  selectedCell?.row === rowIndex &&
                  selectedCell?.col === colIndex,
                highlighted: isHighlighted(rowIndex, colIndex),
                error: cell.hasError,
                'same-number': selectedNumber && cell.value === selectedNumber,
                completed: cell.value && !cell.hasError,
                'just-filled': cell.justFilled,
                'correct-feedback': cell.correctFeedback,
              }"
              @click="selectCell(rowIndex, colIndex)"
            >
              <div v-if="cell.value" class="cell-value">{{ cell.value }}</div>
              <div v-else-if="cell.notes.length > 0" class="cell-notes">
                <span
                  v-for="note in 9"
                  :key="note"
                  class="note"
                  :class="{ active: cell.notes.includes(note) }"
                  >{{ cell.notes.includes(note) ? note : "" }}</span
                >
              </div>
            </div>
          </div>
        </div>

        <div class="control-panel">
          <div class="controls">
            <button
              class="control-btn"
              :class="{ active: isNoteMode }"
              @click="toggleNoteMode"
            >
              <Pencil :size="20" /><span>筆記</span>
            </button>
            <button
              class="control-btn"
              @click="useHint"
              :disabled="
                hintsLeft <= 0 || !selectedCell || isPaused || isGameOver
              "
            >
              <Lightbulb :size="20" /><span>提示</span>
            </button>
            <button
              class="control-btn"
              @click="checkBoard"
              :disabled="isPaused || isGameOver"
            >
              <CheckCircle :size="20" /><span>檢查</span>
            </button>
            <button
              class="control-btn"
              @click="undo"
              :disabled="undoStack.length === 0 || isPaused || isGameOver"
            >
              <Undo2 :size="20" /><span>撤銷</span>
            </button>
          </div>
          <div class="number-pad">
            <button
              v-for="num in 9"
              :key="num"
              class="number-btn"
              :class="{ selected: selectedNumber === num }"
              @click="inputNumber(num)"
              :disabled="!selectedCell || isPaused || isGameOver"
            >
              <span class="number">{{ num }}</span>
            </button>
            <button
              class="number-btn erase"
              @click="eraseCell"
              :disabled="!selectedCell || isPaused || isGameOver"
            >
              <Eraser :size="20" /><span>清除</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 游戏胜利 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="isGameWon"
          class="game-over-overlay"
          @click.self="isGameWon = false"
        >
          <div class="game-over-content win">
            <button
              class="close-x"
              @click="isGameWon = false"
              aria-label="關閉"
            >
              <X :size="20" />
            </button>
            <div class="game-over-icon"><Trophy :size="64" /></div>
            <h2>恭喜完成！</h2>
            <div v-if="isNewRecord" class="new-record-badge">
              <Trophy :size="24" /><span>新紀錄！</span>
            </div>
            <div class="game-stats">
              <div class="stat">
                <span class="stat-label">用時</span
                ><span
                  class="stat-value"
                  :class="{ 'new-record': isNewRecord }"
                  >{{ formattedTime }}</span
                >
              </div>
              <div class="stat" v-if="previousBestTime > 0">
                <span class="stat-label">最佳記錄</span
                ><span class="stat-value">{{
                  formatTime(previousBestTime)
                }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">難度</span
                ><span class="stat-value">{{ difficultyText }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">錯誤</span
                ><span class="stat-value">{{ errorCount }}</span>
              </div>
            </div>
            <div class="game-over-actions">
              <button class="btn-share" @click="shareScore">
                <Share2 :size="18" /> 分享成績
              </button>
              <button
                class="btn-primary"
                @click="startNewGame(currentDifficulty)"
              >
                再來一局
              </button>
              <button
                class="btn-secondary"
                @click="
                  isGameWon = false;
                  showDifficultyMenu = true;
                "
              >
                改變難度
              </button>
              <button class="btn-secondary" @click="$emit('close')">
                退出遊戲
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 游戏失败 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="isGameOver" class="game-over-overlay">
          <div class="game-over-content lose">
            <div class="game-over-icon lose">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="#ef4444">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                />
                <path
                  d="M8 16s1.5-2 4-2 4 2 4 2"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <circle cx="9" cy="9" r="1.5" />
                <circle cx="15" cy="9" r="1.5" />
              </svg>
            </div>
            <h2>遊戲結束</h2>
            <p class="game-over-message">錯誤次數過多（{{ maxErrors }}次）</p>
            <div class="game-stats">
              <div class="stat">
                <span class="stat-label">用時</span
                ><span class="stat-value">{{ formattedTime }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">難度</span
                ><span class="stat-value">{{ difficultyText }}</span>
              </div>
            </div>
            <div class="game-over-actions">
              <button
                class="btn-primary"
                @click="startNewGame(currentDifficulty)"
              >
                重新挑戰
              </button>
              <button class="btn-secondary" @click="showDifficultyMenu = true">
                改變難度
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 暂停遮罩 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="isPaused" class="pause-overlay" @click="togglePause">
          <div class="pause-content">
            <PauseCircle :size="80" />
            <p>遊戲已暫停</p>
            <small>點擊任意處繼續</small>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { GameScoreData, SudokuMetadata } from "@/types";
import {
    AlertCircle,
    CheckCircle,
    ChevronLeft,
    Clock,
    Download,
    Eraser,
    Lightbulb,
    Pause,
    PauseCircle,
    Pencil,
    Play,
    PlusCircle,
    RotateCcw,
    Save,
    Share2,
    Trash2,
    Trophy,
    Undo2,
    X,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import {
    checkCell,
    findConflicts,
    generateSudoku,
    getHint,
} from "./sudoku/sudokuGenerator";

const emit = defineEmits<{
  close: [];
  shareScore: [scoreData: GameScoreData];
}>();

interface Cell {
  value: number;
  isInitial: boolean;
  hasError: boolean;
  notes: number[];
  justFilled?: boolean;
  correctFeedback?: boolean;
}
interface SelectedCell {
  row: number;
  col: number;
}

const createEmptyBoard = (): Cell[][] =>
  Array(9)
    .fill(null)
    .map(() =>
      Array(9)
        .fill(null)
        .map(() => ({
          value: 0,
          isInitial: false,
          hasError: false,
          notes: [],
        })),
    );

const board = ref<Cell[][]>(createEmptyBoard());
const solution = ref<number[][]>([]);
const selectedCell = ref<SelectedCell | null>(null);
const selectedNumber = ref<number | null>(null);
const isNoteMode = ref(false);
const currentDifficulty = ref<"easy" | "medium" | "hard">("easy");
const errorCount = ref(0);
const hintsLeft = ref(5);
const isPaused = ref(false);
const isGameWon = ref(false);
const isGameOver = ref(false);
const showDifficultyMenu = ref(true);
const showSaveMenu = ref(false);
const undoStack = ref<any[]>([]);
const gameStarted = ref(false);
const isNewRecord = ref(false);
const previousBestTime = ref(0);
const hasSavedGame = ref(false);
const savedGameTime = ref(0);
const savedGameDifficulty = ref<"easy" | "medium" | "hard">("easy");
const savedGameProgress = ref(0);
const bestTimes = ref<{ easy: number; medium: number; hard: number }>({
  easy: 0,
  medium: 0,
  hard: 0,
});
const elapsedTime = ref(0);
let timerInterval: number | null = null;

const formattedTime = computed(() => {
  const m = Math.floor(elapsedTime.value / 60);
  const s = elapsedTime.value % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
});
const difficultyText = computed(
  () =>
    ({ easy: "簡單", medium: "中等", hard: "困難" })[currentDifficulty.value],
);
const maxErrors = computed(
  () => ({ easy: 5, medium: 10, hard: 10 })[currentDifficulty.value],
);
const savedGameDifficultyText = computed(
  () =>
    ({ easy: "簡單", medium: "中等", hard: "困難" })[savedGameDifficulty.value],
);
const currentBestTime = computed(
  () => bestTimes.value[currentDifficulty.value],
);

const startNewGame = (difficulty: "easy" | "medium" | "hard") => {
  currentDifficulty.value = difficulty;
  errorCount.value = 0;
  hintsLeft.value = 5;
  elapsedTime.value = 0;
  isGameWon.value = false;
  isGameOver.value = false;
  isPaused.value = false;
  selectedCell.value = null;
  selectedNumber.value = null;
  undoStack.value = [];
  showDifficultyMenu.value = false;
  gameStarted.value = true;
  const sudoku = generateSudoku(difficulty);
  solution.value = sudoku.solution;
  board.value = sudoku.puzzle.map((row) =>
    row.map((value) => ({
      value,
      isInitial: value !== 0,
      hasError: false,
      notes: [],
    })),
  );
  startTimer();
  clearAutoSave();
};

const restartGame = () => {
  if (confirm("確定要重新開始嗎？當前進度將會丟失。"))
    startNewGame(currentDifficulty.value);
};

const selectCell = (row: number, col: number) => {
  if (isPaused.value || isGameOver.value) return;
  const cell = board.value[row][col];
  if (cell.isInitial) return;
  selectedCell.value = { row, col };
  selectedNumber.value = cell.value || null;
};

const isHighlighted = (row: number, col: number): boolean => {
  if (!selectedCell.value) return false;
  const { row: sr, col: sc } = selectedCell.value;
  if (row === sr || col === sc) return true;
  return (
    Math.floor(sr / 3) === Math.floor(row / 3) &&
    Math.floor(sc / 3) === Math.floor(col / 3)
  );
};

const inputNumber = (num: number) => {
  if (!selectedCell.value || isPaused.value || isGameOver.value) return;
  const { row, col } = selectedCell.value;
  const cell = board.value[row][col];
  if (cell.isInitial) return;
  saveToUndoStack();
  if (isNoteMode.value) {
    const idx = cell.notes.indexOf(num);
    if (idx > -1) cell.notes.splice(idx, 1);
    else {
      cell.notes.push(num);
      cell.notes.sort((a, b) => a - b);
    }
  } else {
    cell.value = num;
    cell.notes = [];
    selectedNumber.value = num;
    cell.justFilled = true;
    setTimeout(() => {
      cell.justFilled = false;
    }, 150);
    const isCorrect = checkCell(row, col, num, solution.value);
    if (!isCorrect) {
      cell.hasError = true;
      errorCount.value++;
      if (errorCount.value >= maxErrors.value) {
        isGameOver.value = true;
        stopTimer();
        return;
      }
    } else {
      cell.hasError = false;
      cell.correctFeedback = true;
      setTimeout(() => {
        cell.correctFeedback = false;
      }, 300);
    }
    checkIfGameWon();
  }
};

const eraseCell = () => {
  if (!selectedCell.value || isPaused.value || isGameOver.value) return;
  const { row, col } = selectedCell.value;
  const cell = board.value[row][col];
  if (cell.isInitial) return;
  saveToUndoStack();
  cell.value = 0;
  cell.notes = [];
  cell.hasError = false;
  selectedNumber.value = null;
};

const toggleNoteMode = () => {
  isNoteMode.value = !isNoteMode.value;
};

const useHint = () => {
  if (
    !selectedCell.value ||
    hintsLeft.value <= 0 ||
    isPaused.value ||
    isGameOver.value
  )
    return;
  const { row, col } = selectedCell.value;
  const cell = board.value[row][col];
  if (cell.isInitial) return;
  saveToUndoStack();
  cell.value = getHint(row, col, solution.value);
  cell.notes = [];
  cell.hasError = false;
  selectedNumber.value = cell.value;
  cell.justFilled = true;
  cell.correctFeedback = true;
  setTimeout(() => {
    cell.justFilled = false;
    cell.correctFeedback = false;
  }, 300);
  hintsLeft.value--;
  checkIfGameWon();
};

const checkBoard = () => {
  if (isPaused.value || isGameOver.value) return;
  const currentGrid = board.value.map((row) => row.map((cell) => cell.value));
  const conflicts = findConflicts(currentGrid);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++)
      if (!board.value[i][j].isInitial) board.value[i][j].hasError = false;
  let errorFound = false;
  for (const key of conflicts) {
    const [r, c] = key.split("-").map(Number);
    if (!board.value[r][c].isInitial) {
      board.value[r][c].hasError = true;
      errorFound = true;
    }
  }
  if (errorFound) alert("❌ 發現錯誤！已用紅色標記衝突的格子");
  else {
    let empty = false;
    for (let i = 0; i < 9 && !empty; i++)
      for (let j = 0; j < 9; j++)
        if (board.value[i][j].value === 0) {
          empty = true;
          break;
        }
    alert(
      empty
        ? "✅ 目前沒有發現錯誤，繼續加油！"
        : "🎉 恭喜完成！所有數字都正確！",
    );
  }
};

const undo = () => {
  if (undoStack.value.length === 0 || isPaused.value || isGameOver.value)
    return;
  board.value = undoStack.value.pop();
};
const saveToUndoStack = () => {
  undoStack.value.push(
    board.value.map((row) =>
      row.map((cell) => ({ ...cell, notes: [...cell.notes] })),
    ),
  );
  if (undoStack.value.length > 20) undoStack.value.shift();
};

const checkIfGameWon = () => {
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 9; j++) if (board.value[i][j].value === 0) return;
  let allCorrect = true;
  for (let i = 0; i < 9 && allCorrect; i++)
    for (let j = 0; j < 9; j++)
      if (board.value[i][j].value !== solution.value[i][j]) {
        allCorrect = false;
        break;
      }
  if (allCorrect) {
    isGameWon.value = true;
    stopTimer();
    checkAndUpdateBestTime();
  }
};

const checkAndUpdateBestTime = () => {
  const ct = elapsedTime.value;
  const d = currentDifficulty.value;
  const old = bestTimes.value[d];
  previousBestTime.value = old;
  if (old === 0 || ct < old) {
    bestTimes.value[d] = ct;
    isNewRecord.value = true;
    saveBestTimes();
  } else isNewRecord.value = false;
};

const shareScore = () => {
  const metadata: SudokuMetadata = {
    type: "sudoku",
    completionTime: elapsedTime.value,
    difficulty: currentDifficulty.value,
  };
  const dm: Record<string, number> = { easy: 1, medium: 0.8, hard: 0.6 };
  const baseScore = Math.max(
    0,
    Math.floor(10000 - elapsedTime.value * dm[currentDifficulty.value]),
  );
  emit("shareScore", {
    gameId: "sudoku",
    gameName: "數獨",
    gameIcon: "mdi:grid",
    score: baseScore,
    bestScore:
      currentBestTime.value > 0
        ? Math.max(
            0,
            Math.floor(
              10000 - currentBestTime.value * dm[currentDifficulty.value],
            ),
          )
        : baseScore,
    isNewRecord: isNewRecord.value,
    timestamp: Date.now(),
    metadata,
  });
};

const togglePause = () => {
  isPaused.value = !isPaused.value;
  if (isPaused.value) stopTimer();
  else startTimer();
};
const startTimer = () => {
  if (timerInterval !== null) return;
  timerInterval = window.setInterval(() => {
    if (!isPaused.value && !isGameWon.value && !isGameOver.value)
      elapsedTime.value++;
  }, 1000);
};
const stopTimer = () => {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
};
const loadBestTimes = () => {
  const s = localStorage.getItem("sudoku-best-times");
  if (s)
    try {
      const t = JSON.parse(s);
      bestTimes.value = {
        easy: t.easy || 0,
        medium: t.medium || 0,
        hard: t.hard || 0,
      };
    } catch {
      /* ignore */
    }
};
const saveBestTimes = () => {
  localStorage.setItem("sudoku-best-times", JSON.stringify(bestTimes.value));
};
const formatTime = (seconds: number): string => {
  if (seconds === 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const autoSaveGame = () => {
  if (isGameWon.value || isGameOver.value || !gameStarted.value) return;
  localStorage.setItem(
    "sudoku-auto-save",
    JSON.stringify({
      board: board.value,
      solution: solution.value,
      difficulty: currentDifficulty.value,
      errorCount: errorCount.value,
      hintsLeft: hintsLeft.value,
      elapsedTime: elapsedTime.value,
      timestamp: Date.now(),
    }),
  );
};
const clearAutoSave = () => {
  localStorage.removeItem("sudoku-auto-save");
};
const loadAutoSave = (): boolean => {
  const s = localStorage.getItem("sudoku-auto-save");
  if (!s) return false;
  try {
    const gs = JSON.parse(s);
    if (Date.now() - (gs.timestamp || 0) > 86400000) {
      clearAutoSave();
      return false;
    }
    board.value = gs.board;
    solution.value = gs.solution;
    currentDifficulty.value = gs.difficulty;
    errorCount.value = gs.errorCount || 0;
    hintsLeft.value = gs.hintsLeft || 5;
    elapsedTime.value = gs.elapsedTime || 0;
    gameStarted.value = true;
    showDifficultyMenu.value = false;
    startTimer();
    return true;
  } catch {
    clearAutoSave();
    return false;
  }
};

const checkSavedGame = () => {
  const s = localStorage.getItem("sudoku-saved-game");
  if (!s) {
    hasSavedGame.value = false;
    return;
  }
  try {
    const d = JSON.parse(s);
    hasSavedGame.value = true;
    savedGameTime.value = d.timestamp || 0;
    savedGameDifficulty.value = d.difficulty || "easy";
    let filled = 0,
      total = 0;
    for (let i = 0; i < 9; i++)
      for (let j = 0; j < 9; j++)
        if (!d.board[i][j].isInitial) {
          total++;
          if (d.board[i][j].value !== 0) filled++;
        }
    savedGameProgress.value =
      total > 0 ? Math.round((filled / total) * 100) : 0;
  } catch {
    hasSavedGame.value = false;
  }
};

const saveCurrentGame = () => {
  if (isGameWon.value || isGameOver.value || !gameStarted.value) return;
  if (
    hasSavedGame.value &&
    !confirm(
      `已有存檔（${savedGameDifficultyText.value}，進度 ${savedGameProgress.value}%）\n確定要覆蓋嗎？`,
    )
  )
    return;
  localStorage.setItem(
    "sudoku-saved-game",
    JSON.stringify({
      board: board.value,
      solution: solution.value,
      difficulty: currentDifficulty.value,
      errorCount: errorCount.value,
      hintsLeft: hintsLeft.value,
      elapsedTime: elapsedTime.value,
      timestamp: Date.now(),
    }),
  );
  checkSavedGame();
  showSaveMenu.value = false;
};

const loadSavedGame = () => {
  const s = localStorage.getItem("sudoku-saved-game");
  if (!s) return;
  if (
    gameStarted.value &&
    !isGameWon.value &&
    !isGameOver.value &&
    !confirm("讀取存檔將會覆蓋當前遊戲進度，確定要繼續嗎？")
  )
    return;
  try {
    const d = JSON.parse(s);
    board.value = d.board;
    solution.value = d.solution;
    currentDifficulty.value = d.difficulty;
    errorCount.value = d.errorCount || 0;
    hintsLeft.value = d.hintsLeft || 5;
    elapsedTime.value = d.elapsedTime || 0;
    isGameWon.value = false;
    isGameOver.value = false;
    isPaused.value = false;
    gameStarted.value = true;
    showDifficultyMenu.value = false;
    stopTimer();
    startTimer();
    showSaveMenu.value = false;
  } catch {
    /* ignore */
  }
};

const deleteSavedGame = () => {
  if (confirm("確定要刪除存檔嗎？")) {
    localStorage.removeItem("sudoku-saved-game");
    hasSavedGame.value = false;
  }
};

const formatSaveTime = (ts: number): string => {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (h < 1) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (h < 24) return `${h} 小時前`;
  if (d < 7) return `${d} 天前`;
  return new Date(ts).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

onMounted(() => {
  loadBestTimes();
  checkSavedGame();
  if (!loadAutoSave()) showDifficultyMenu.value = true;
  const autoSaveInterval = setInterval(autoSaveGame, 30000);
  window.addEventListener("beforeunload", autoSaveGame);
  onUnmounted(() => {
    clearInterval(autoSaveInterval);
    window.removeEventListener("beforeunload", autoSaveGame);
  });
});
onUnmounted(() => {
  stopTimer();
  autoSaveGame();
});
</script>

<style scoped lang="scss">
.game-sudoku {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  padding-top: max(16px, env(safe-area-inset-top));
  background: white;
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  z-index: 10;

  .back-btn,
  .icon-btn {
    width: 40px;
    height: 40px;
    min-height: 44px;
    background: #f3f4f6;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    .icon {
      width: 20px;
      height: 20px;
      color: #6b7280;
    }
    &:active {
      background: #e5e7eb;
      transform: scale(0.95);
    }
  }
  .title {
    flex: 1;
    text-align: center;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }
  .header-actions {
    display: flex;
    gap: 8px;
  }
}

.game-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 16px;
  overflow-y: auto;
  gap: 12px;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.game-wrapper {
  display: contents;
}
.control-panel {
  display: contents;
}

.game-info {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);

  .info-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #6b7280;
    .info-value {
      font-weight: 600;
      color: #1f2937;
    }
    &.best-time svg {
      color: #fbbf24;
    }
    &.difficulty-badge {
      grid-column: 1 / -1;
      justify-content: center;
      padding: 6px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 12px;
      &.easy {
        background: #d1fae5;
        color: #065f46;
      }
      &.medium {
        background: #fed7aa;
        color: #92400e;
      }
      &.hard {
        background: #fecaca;
        color: #991b1b;
      }
    }
  }
}

.sudoku-board {
  background: white;
  border-radius: 12px;
  padding: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  aspect-ratio: 1;
  width: 100%;
  max-width: min(calc(100vw - 32px), 500px);
  margin: 0 auto;
}

.sudoku-row {
  display: flex;
}

.sudoku-cell {
  aspect-ratio: 1;
  flex: 1;
  border: 1px solid #e2e8f0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  background: white;
  user-select: none;

  &:nth-child(3n) {
    border-right: 2px solid #4a5568;
  }
  &:nth-child(1),
  &:nth-child(4),
  &:nth-child(7) {
    border-left: 2px solid #4a5568;
  }

  .cell-value {
    font-size: clamp(14px, 3.5vw, 20px);
    font-weight: 700;
    color: #1f2937;
  }
  &.initial .cell-value {
    color: #1a202c;
    font-weight: 900;
  }
  &.selected {
    background: var(--color-primary, #7dd3a8) !important;
    .cell-value {
      color: white;
    }
    .cell-notes .note {
      color: rgba(255, 255, 255, 0.5);
      &.active {
        color: white;
      }
    }
  }
  &.highlighted {
    background: #edf2f7;
  }
  &.error {
    background: #feb2b2;
    animation: shakeError 0.2s ease;
    .cell-value {
      color: #c53030;
    }
  }
  &.same-number {
    background: #bee3f8;
  }
  &.just-filled .cell-value {
    animation: popIn 0.15s ease;
  }
  &.correct-feedback::after {
    content: "";
    position: absolute;
    inset: 0;
    background: #10b981;
    opacity: 0;
    animation: correctFlash 0.3s ease;
    pointer-events: none;
    border-radius: 2px;
  }
  &:active {
    transform: scale(0.95);
  }

  .cell-notes {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 1px;
    padding: 2px;
    .note {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: clamp(8px, 1.5vw, 10px);
      color: #718096;
      font-weight: 600;
      &.active {
        color: var(--color-primary, #7dd3a8);
      }
    }
  }
}

.sudoku-row {
  &:nth-child(3n) .sudoku-cell {
    border-bottom: 2px solid #4a5568;
  }
  &:nth-child(1) .sudoku-cell,
  &:nth-child(4) .sudoku-cell,
  &:nth-child(7) .sudoku-cell {
    border-top: 2px solid #4a5568;
  }
}

@keyframes popIn {
  0% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}
@keyframes shakeError {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
@keyframes correctFlash {
  0% {
    opacity: 0.3;
  }
  100% {
    opacity: 0;
  }
}

.controls {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;

  .control-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 8px 6px;
    min-height: 44px;
    background: white;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 600;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2s;
    &:active:not(:disabled) {
      transform: scale(0.95);
      background: #f9fafb;
    }
    &.active {
      background: var(--color-primary, #7dd3a8);
      border-color: var(--color-primary, #7dd3a8);
      color: white;
      svg {
        color: white;
      }
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.number-pad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 6px;
  padding-bottom: var(--safe-bottom, 0px);

  .number-btn {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-height: 44px;
    background: white;
    border: 1.5px solid #e5e7eb;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    .number {
      font-size: clamp(18px, 4.5vw, 24px);
      font-weight: 700;
      color: #1f2937;
    }
    &:active:not(:disabled) {
      transform: scale(0.95);
      background: #f9fafb;
    }
    &.selected {
      background: var(--color-primary, #7dd3a8);
      border-color: var(--color-primary, #7dd3a8);
      .number {
        color: white;
      }
    }
    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    &.erase {
      grid-column: span 1;
      background: #ef4444;
      border-color: #ef4444;
      color: white;
      span:last-child {
        font-size: 11px;
        font-weight: 600;
      }
      &:active:not(:disabled) {
        background: #dc2626;
        transform: scale(0.95);
      }
    }
  }
}

.save-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.save-menu {
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  h3 {
    margin: 0 0 20px;
    font-size: 24px;
    text-align: center;
    color: #2d3748;
  }

  .save-slot {
    padding: 16px;
    border-radius: 12px;
    border: 2px solid #e2e8f0;
    &.filled {
      background: #f7fafc;
      .slot-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        .slot-title {
          font-weight: 600;
          color: #2d3748;
        }
        .slot-difficulty {
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          &.easy {
            background: #d1fae5;
            color: #065f46;
          }
          &.medium {
            background: #fed7aa;
            color: #92400e;
          }
          &.hard {
            background: #fecaca;
            color: #991b1b;
          }
        }
      }
      .slot-info {
        display: flex;
        gap: 16px;
        margin-bottom: 12px;
        font-size: 13px;
        color: #6b7280;
      }
      .slot-actions {
        display: flex;
        gap: 8px;
        button {
          flex: 1;
          padding: 8px;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          transition: all 0.2s;
          &.btn-load {
            background: var(--color-primary, #7dd3a8);
            color: white;
            &:active {
              opacity: 0.9;
            }
          }
          &.btn-delete {
            background: #fee2e2;
            color: #991b1b;
            &:active {
              background: #fecaca;
            }
          }
        }
      }
    }
    &.empty {
      background: #f9fafb;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 16px;
      p {
        margin: 0;
        color: #9ca3af;
        font-size: 14px;
      }
    }
  }

  .save-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 20px;
    .btn-save-current {
      width: 100%;
      padding: 14px;
      background: var(--color-primary, #7dd3a8);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
    .btn-close {
      width: 100%;
      padding: 14px;
      background: #e2e8f0;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      color: #4a5568;
      cursor: pointer;
      &:active {
        background: #cbd5e0;
      }
    }
  }
}

.difficulty-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.difficulty-menu {
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 400px;
  width: 100%;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  h3 {
    margin: 0 0 20px;
    font-size: 24px;
    text-align: center;
    color: #2d3748;
  }
  .difficulty-options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 20px;
  }
  .difficulty-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px;
    border: 3px solid #e2e8f0;
    border-radius: 16px;
    background: white;
    cursor: pointer;
    transition: all 0.3s;
    span:nth-child(2) {
      font-size: 18px;
      font-weight: 700;
    }
    small {
      font-size: 12px;
      color: #718096;
    }
    &:active {
      transform: scale(0.97);
    }
    &.easy:active {
      border-color: #10b981;
      background: #d1fae5;
    }
    &.medium:active {
      border-color: #f59e0b;
      background: #fed7aa;
    }
    &.hard:active {
      border-color: #ef4444;
      background: #fecaca;
    }
  }
  .btn-close {
    width: 100%;
    padding: 14px;
    background: #e2e8f0;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    color: #4a5568;
    cursor: pointer;
    &:active {
      background: #cbd5e0;
    }
  }
}

.game-over-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}

.game-over-content {
  background: white;
  border-radius: 24px;
  padding: 32px;
  max-width: 400px;
  width: 100%;
  text-align: center;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  position: relative;

  .close-x {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 18px;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #6b7280;
    &:active {
      background: #e5e7eb;
    }
  }

  .game-over-icon {
    color: #fbbf24;
    &.lose {
      color: #ef4444;
    }
  }
  .new-record-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 24px;
    background: #fbbf24;
    color: white;
    border-radius: 12px;
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 16px;
  }
  .game-over-message {
    font-size: 16px;
    color: #6b7280;
    margin: 0 0 16px;
  }
  h2 {
    margin: 16px 0;
    font-size: 28px;
    color: #2d3748;
  }

  .game-stats {
    display: flex;
    justify-content: space-around;
    margin: 24px 0;
    padding: 20px;
    background: #f7fafc;
    border-radius: 16px;
    .stat {
      display: flex;
      flex-direction: column;
      gap: 8px;
      .stat-label {
        font-size: 12px;
        color: #718096;
      }
      .stat-value {
        font-size: 18px;
        font-weight: 700;
        color: #2d3748;
        &.new-record {
          color: #f59e0b;
          font-size: 20px;
        }
      }
    }
  }

  .game-over-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    button {
      padding: 14px;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      &.btn-primary {
        background: var(--color-primary, #7dd3a8);
        color: white;
        &:active {
          opacity: 0.9;
        }
      }
      &.btn-secondary {
        background: #e2e8f0;
        color: #4a5568;
        &:active {
          background: #cbd5e0;
        }
      }
      &.btn-share {
        background: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        &:active {
          background: #2563eb;
        }
      }
    }
  }
}

.pause-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  cursor: pointer;
}

.pause-content {
  text-align: center;
  color: white;
  p {
    font-size: 24px;
    font-weight: 700;
    margin: 16px 0 8px;
  }
  small {
    font-size: 14px;
    opacity: 0.7;
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
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (min-width: 769px) {
  .game-container {
    max-width: 900px;
    padding: 20px;
  }
  .game-wrapper {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    justify-content: center;
  }
  .sudoku-board {
    flex: 0 0 auto;
    width: 440px;
    height: 440px;
    max-width: none;
    padding: 10px;
  }
  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 0 0 auto;
    width: 300px;
  }
  .controls {
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    .control-btn {
      padding: 12px 10px;
      font-size: 13px;
    }
  }
  .number-pad {
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    .number-btn {
      .number {
        font-size: 26px;
      }
    }
    .erase {
      grid-column: span 3;
      aspect-ratio: auto;
    }
  }
}

@media (max-width: 768px) {
  .game-info {
    gap: 6px;
    padding: 10px;
    .info-item {
      font-size: 12px;
      gap: 4px;
    }
  }
  .sudoku-board {
    padding: 6px;
  }
  .controls {
    gap: 5px;
    .control-btn {
      padding: 6px 4px;
      font-size: 10px;
    }
  }
  .number-pad {
    gap: 5px;
  }
}
</style>
