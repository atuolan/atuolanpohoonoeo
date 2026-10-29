<template>
  <div class="game-sudoku">
    <!-- 1. 頂欄 -->
    <header class="topbar">
      <button
        type="button"
        class="round-btn"
        aria-label="返回"
        @click="$emit('close')"
      >
        <ChevronLeft />
      </button>
      <h1 class="topbar-title">數獨</h1>
      <button
        type="button"
        class="round-btn"
        :aria-label="isPaused ? '繼續' : '暫停'"
        @click="togglePause"
      >
        <Play v-if="isPaused" />
        <Pause v-else />
      </button>
    </header>

    <!-- 2. 資訊列 -->
    <div class="info-bar">
      <button
        type="button"
        class="difficulty-pill"
        @click="showDifficultyMenu = true"
      >
        <span>{{ difficultyText }}</span>
        <ChevronDown class="pill-arrow" />
      </button>

      <div class="error-info">
        錯誤 <b :class="{ 'has-error': errorCount > 0 }">{{ errorCount }}</b> / {{ maxErrors }}
      </div>

      <div class="time-info">
        <span v-if="currentBestTime > 0" class="best-time-label">
          最佳 {{ formatTime(currentBestTime) }}
        </span>
        <span class="current-time">{{ formattedTime }}</span>
      </div>
    </div>

    <!-- 8. 存檔管理彈窗 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="showSaveMenu"
          class="dialog-overlay save-menu-overlay"
          @click="showSaveMenu = false"
        >
          <div class="dialog-card save-menu" @click.stop>
            <h3 class="dialog-title">存檔管理</h3>
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
                  <button type="button" class="btn-load" @click="loadSavedGame">
                    <Download :size="16" /> 讀取
                  </button>
                  <button type="button" class="btn-delete" @click="deleteSavedGame">
                    <Trash2 :size="16" /> 刪除
                  </button>
                </div>
              </div>
              <div v-else class="save-slot empty"><p>暫無存檔</p></div>
            </div>
            <div class="save-actions">
              <button
                type="button"
                class="btn-save-current"
                :disabled="isGameWon || isGameOver || !gameStarted"
                @click="saveCurrentGame"
              >
                <Save :size="18" /> 保存當前遊戲
              </button>
              <button
                type="button"
                class="dialog-btn-outline"
                @click="showSaveMenu = false"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 7. 選擇難度選單 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="showDifficultyMenu"
          class="dialog-overlay difficulty-overlay"
          @click="showDifficultyMenu = false"
        >
          <div class="dialog-card difficulty-menu" @click.stop>
            <h3 class="dialog-title">選擇難度</h3>
            <div class="difficulty-list">
              <button
                type="button"
                class="diff-card-btn"
                @click="startNewGame('easy')"
              >
                <div class="diff-card-info">
                  <span class="diff-card-name">簡單</span>
                  <span class="diff-card-sub">30-35個空格</span>
                </div>
                <ChevronRight class="diff-card-arrow" />
              </button>
              <button
                type="button"
                class="diff-card-btn"
                @click="startNewGame('medium')"
              >
                <div class="diff-card-info">
                  <span class="diff-card-name">中等</span>
                  <span class="diff-card-sub">40-45個空格</span>
                </div>
                <ChevronRight class="diff-card-arrow" />
              </button>
              <button
                type="button"
                class="diff-card-btn"
                @click="startNewGame('hard')"
              >
                <div class="diff-card-info">
                  <span class="diff-card-name">困難</span>
                  <span class="diff-card-sub">50-55個空格</span>
                </div>
                <ChevronRight class="diff-card-arrow" />
              </button>
            </div>
            <button
              type="button"
              class="dialog-btn-outline"
              @click="showDifficultyMenu = false"
            >
              取消
            </button>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 3. 棋盤容器 -->
    <div class="board-container">
      <div class="sudoku-board" role="grid" aria-label="數獨棋盤">
        <div
          v-for="(row, rowIndex) in board"
          :key="`row-${rowIndex}`"
          class="sudoku-row"
          role="row"
        >
          <button
            v-for="(cell, colIndex) in row"
            :key="`cell-${rowIndex}-${colIndex}`"
            type="button"
            class="sudoku-cell"
            :class="{
              initial: cell.isInitial,
              selected:
                selectedCell?.row === rowIndex &&
                selectedCell?.col === colIndex,
              highlighted: isHighlighted(rowIndex, colIndex),
              'same-number':
                selectedNumber && cell.value === selectedNumber,
              error: cell.hasError,
              completed: cell.value && !cell.hasError,
              'just-filled': cell.justFilled,
              'correct-feedback': cell.correctFeedback,
            }"
            :aria-label="
              cell.value
                ? `第 ${rowIndex + 1} 列第 ${colIndex + 1} 行，${cell.value}`
                : `第 ${rowIndex + 1} 列第 ${colIndex + 1} 行，空白`
            "
            @click="selectCell(rowIndex, colIndex)"
          >
            <span v-if="cell.value" class="cell-value">{{ cell.value }}</span>
            <span v-else-if="cell.notes.length > 0" class="cell-notes">
              <span
                v-for="note in 9"
                :key="note"
                class="note"
                :class="{ active: cell.notes.includes(note) }"
              >
                {{ cell.notes.includes(note) ? note : "" }}
              </span>
            </span>
          </button>
        </div>
      </div>

      <!-- 6. 暫停遮罩（蓋在棋盤上） -->
      <transition name="fade">
        <div v-if="isPaused" class="pause-scrim">
          <h2 class="pause-title">暫停中</h2>
          <div class="pause-time">{{ formattedTime }}</div>
          <div class="pause-actions">
            <button
              type="button"
              class="pill-resume"
              @click="togglePause"
            >
              繼續
            </button>
            <button
              type="button"
              class="pill-restart"
              @click="restartGame"
            >
              重新開始
            </button>
            <button
              type="button"
              class="pill-save"
              @click="showSaveMenu = true"
            >
              <Save :size="14" /> 存檔管理
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- 4. 工具列 -->
    <div class="toolbar">
      <button
        type="button"
        class="tool-btn"
        :disabled="undoStack.length === 0 || isPaused || isGameOver"
        @click="undo"
      >
        <Undo2 class="tool-icon" />
        <span class="tool-label">復原</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="!selectedCell || isPaused || isGameOver"
        @click="eraseCell"
      >
        <Eraser class="tool-icon" />
        <span class="tool-label">擦除</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="hintsLeft <= 0 || !selectedCell || isPaused || isGameOver"
        @click="useHint"
      >
        <div class="hint-icon-wrap">
          <Lightbulb class="tool-icon" />
          <span v-if="hintsLeft > 0" class="hint-badge">{{ hintsLeft }}</span>
        </div>
        <span class="tool-label">提示</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        :disabled="isPaused || isGameOver"
        @click="checkBoard"
      >
        <CheckCircle class="tool-icon" />
        <span class="tool-label">檢查</span>
      </button>
    </div>

    <!-- 5. 數字盤 -->
    <div class="numpad">
      <button
        v-for="num in 9"
        :key="num"
        type="button"
        class="numpad-btn"
        :class="{
          selected: selectedNumber === num,
          completed: remainingCounts[num] === 0,
        }"
        :aria-label="`填入 ${num}`"
        :disabled="isPaused || isGameOver"
        @click="inputNumber(num)"
      >
        <span class="num-digit">{{ num }}</span>
        <span class="num-remain">
          {{ remainingCounts[num] === 0 ? "完成" : remainingCounts[num] }}
        </span>
      </button>

      <button
        type="button"
        class="note-btn"
        :class="{ active: isNoteMode }"
        :aria-pressed="isNoteMode"
        @click="toggleNoteMode"
      >
        <Pencil class="note-icon" />
        <span class="note-label">筆記</span>
      </button>
    </div>

    <!-- 9. 遊戲勝利 -->
    <Teleport to="body">
      <transition name="fade">
        <div
          v-if="isGameWon"
          class="dialog-overlay game-over-overlay"
          @click.self="isGameWon = false"
        >
          <div class="dialog-card game-over-content win">
            <button
              type="button"
              class="close-x"
              aria-label="關閉"
              @click="isGameWon = false"
            >
              <X :size="20" />
            </button>
            <div class="game-over-icon"><Trophy :size="56" /></div>
            <h2 class="dialog-title">恭喜完成！</h2>
            <div v-if="isNewRecord" class="new-record-badge">
              <Trophy :size="18" /><span>新紀錄！</span>
            </div>
            <div class="game-stats">
              <div class="stat">
                <span class="stat-label">用時</span>
                <span
                  class="stat-value"
                  :class="{ 'new-record': isNewRecord }"
                >{{ formattedTime }}</span>
              </div>
              <div v-if="previousBestTime > 0" class="stat">
                <span class="stat-label">最佳記錄</span>
                <span class="stat-value">{{ formatTime(previousBestTime) }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">難度</span>
                <span class="stat-value">{{ difficultyText }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">錯誤</span>
                <span class="stat-value">{{ errorCount }}</span>
              </div>
            </div>
            <div class="game-over-actions">
              <button type="button" class="dialog-btn-outline" @click="shareScore">
                <Share2 :size="16" /> 分享成績
              </button>
              <button
                type="button"
                class="dialog-btn-dark"
                @click="startNewGame(currentDifficulty)"
              >
                再來一局
              </button>
              <button
                type="button"
                class="dialog-btn-outline"
                @click="
                  isGameWon = false;
                  showDifficultyMenu = true;
                "
              >
                改變難度
              </button>
              <button
                type="button"
                class="dialog-btn-outline"
                @click="$emit('close')"
              >
                退出遊戲
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 10. 遊戲失敗 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="isGameOver" class="dialog-overlay game-over-overlay">
          <div class="dialog-card game-over-content lose">
            <h2 class="dialog-title">遊戲結束</h2>
            <p class="game-over-message">錯誤次數過多（{{ maxErrors }}次）</p>
            <div class="game-stats">
              <div class="stat">
                <span class="stat-label">用時</span>
                <span class="stat-value">{{ formattedTime }}</span>
              </div>
              <div class="stat">
                <span class="stat-label">難度</span>
                <span class="stat-value">{{ difficultyText }}</span>
              </div>
            </div>
            <div class="game-over-actions">
              <button
                type="button"
                class="dialog-btn-dark"
                @click="startNewGame(currentDifficulty)"
              >
                重新挑戰
              </button>
              <button
                type="button"
                class="dialog-btn-outline"
                @click="showDifficultyMenu = true"
              >
                改變難度
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import type { GameScoreData, SudokuMetadata } from "@/types";
import {
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Download,
    Eraser,
    Lightbulb,
    Pause,
    Pencil,
    Play,
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

const remainingCounts = computed(() => {
  const counts: Record<number, number> = {
    1: 9, 2: 9, 3: 9, 4: 9, 5: 9, 6: 9, 7: 9, 8: 9, 9: 9,
  };
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board.value[r]?.[c]?.value;
      if (v && v >= 1 && v <= 9) {
        counts[v] = Math.max(0, counts[v] - 1);
      }
    }
  }
  return counts;
});

const clearNotesForNumber = (targetRow: number, targetCol: number, num: number) => {
  const boxStartRow = Math.floor(targetRow / 3) * 3;
  const boxStartCol = Math.floor(targetCol / 3) * 3;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (r === targetRow && c === targetCol) continue;
      const inSameRow = r === targetRow;
      const inSameCol = c === targetCol;
      const inSameBox =
        r >= boxStartRow && r < boxStartRow + 3 &&
        c >= boxStartCol && c < boxStartCol + 3;
      if (inSameRow || inSameCol || inSameBox) {
        const cell = board.value[r][c];
        const idx = cell.notes.indexOf(num);
        if (idx > -1) {
          cell.notes.splice(idx, 1);
        }
      }
    }
  }
};

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
  if (!gameStarted.value || isPaused.value || isGameOver.value) return;
  const cell = board.value[row][col];
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
  if (!gameStarted.value || !selectedCell.value || isPaused.value || isGameOver.value) return;
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
    autoSaveGame();
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
        autoSaveGame();
        return;
      }
    } else {
      cell.hasError = false;
      cell.correctFeedback = true;
      setTimeout(() => {
        cell.correctFeedback = false;
      }, 300);
      clearNotesForNumber(row, col, num);
    }
    autoSaveGame();
    checkIfGameWon();
  }
};

const eraseCell = () => {
  if (!gameStarted.value || !selectedCell.value || isPaused.value || isGameOver.value) return;
  const { row, col } = selectedCell.value;
  const cell = board.value[row][col];
  if (cell.isInitial) return;
  saveToUndoStack();
  cell.value = 0;
  cell.notes = [];
  cell.hasError = false;
  selectedNumber.value = null;
  autoSaveGame();
};

const toggleNoteMode = () => {
  isNoteMode.value = !isNoteMode.value;
};

const useHint = () => {
  if (
    !gameStarted.value ||
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
  clearNotesForNumber(row, col, cell.value);
  autoSaveGame();
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
  if (errorFound) alert("發現錯誤！已用紅色標記衝突的格子");
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
        ? "目前沒有發現錯誤，繼續加油！"
        : "恭喜完成！所有數字都正確！",
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
    board.value = gs.board;
    solution.value = gs.solution;
    currentDifficulty.value = gs.difficulty;
    errorCount.value = gs.errorCount ?? 0;
    hintsLeft.value = gs.hintsLeft ?? 5;
    elapsedTime.value = gs.elapsedTime ?? 0;
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
    errorCount.value = d.errorCount ?? 0;
    hintsLeft.value = d.hintsLeft ?? 5;
    elapsedTime.value = d.elapsedTime ?? 0;
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

const handleVisibilityChange = () => {
  if (document.hidden) {
    if (gameStarted.value && !isPaused.value && !isGameWon.value && !isGameOver.value) {
      togglePause();
    }
    autoSaveGame();
  }
};

onMounted(() => {
  loadBestTimes();
  checkSavedGame();
  if (!loadAutoSave()) showDifficultyMenu.value = true;
  const autoSaveInterval = setInterval(autoSaveGame, 30000);
  window.addEventListener("beforeunload", autoSaveGame);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  onUnmounted(() => {
    clearInterval(autoSaveInterval);
    window.removeEventListener("beforeunload", autoSaveGame);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
  });
});
onUnmounted(() => {
  stopTimer();
  autoSaveGame();
});
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.game-sudoku {
  @include gs.screen;
  --sd-accent: #5b52b5;
  --sd-line: #3b3570;
  --sd-error: #b4233f;

  gap: 14px;
  background: color-mix(in srgb, var(--sd-accent) 6%, var(--g-bg));
}

/* 1. 頂欄 */
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

/* 2. 資訊列 */
.info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  font-size: 13px;
  color: var(--g-text);
  flex-shrink: 0;

  .difficulty-pill {
    height: 28px;
    padding: 0 10px;
    border-radius: 14px;
    background: var(--g-surface);
    border: none;
    font-weight: 700;
    color: var(--g-text);
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;

    .pill-arrow {
      width: 10px;
      height: 10px;
    }
  }

  .error-info {
    font-size: 13px;
    b {
      font-family: var(--g-num);
      font-weight: 700;
      &.has-error {
        color: var(--sd-error);
      }
    }
  }

  .time-info {
    display: inline-flex;
    align-items: baseline;
    gap: 4px;

    .best-time-label {
      font-size: 11px;
      color: var(--g-text-2);
    }
    .current-time {
      font-family: var(--g-num);
      font-size: 15px;
      font-weight: 600;
    }
  }
}
/* 3. 棋盤容器與棋盤 */
.board-container {
  position: relative;
  width: min(calc(100vw - 40px), calc(100dvh - 430px), 345px);
  aspect-ratio: 1;
  align-self: center;
  border: 2px solid var(--sd-line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--g-surface);
}

.sudoku-board {
  display: grid;
  grid-template-rows: repeat(9, 1fr);
  width: 100%;
  height: 100%;
}

.sudoku-row {
  display: grid;
  grid-template-columns: repeat(9, 1fr);
  width: 100%;
  height: 100%;
}

.sudoku-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  border-right: 1px solid color-mix(in srgb, var(--sd-accent) 25%, var(--g-surface));
  border-bottom: 1px solid color-mix(in srgb, var(--sd-accent) 25%, var(--g-surface));
  cursor: pointer;
  outline: none;
  font-family: inherit;
  transition: transform 0.1s, background-color 0.15s;

  /* 底色優先序（後面蓋前面） */
  background: var(--g-surface);

  &.highlighted {
    background: color-mix(in srgb, var(--sd-accent) 10%, var(--g-surface));
  }

  &.same-number {
    background: color-mix(in srgb, var(--sd-accent) 22%, var(--g-surface));
  }

  &.error {
    background: color-mix(in srgb, var(--sd-error) 14%, var(--g-surface));
    .cell-value {
      color: var(--sd-error) !important;
    }
  }

  &.selected {
    background: var(--sd-accent) !important;
    .cell-value {
      color: #fff !important;
    }
  }

  /* 3x3 宮粗線：第 3、6 欄右邊，第 3、6 列下面 */
  &:nth-child(3),
  &:nth-child(6) {
    border-right: 3px solid var(--sd-line);
  }
  &:nth-child(9) {
    border-right: none;
  }

  .cell-value {
    font-family: var(--g-num);
    font-size: clamp(16px, 5vw, 20px);
    line-height: 1;
    color: var(--sd-accent);
    font-weight: 500;
  }

  &.initial .cell-value {
    color: var(--g-text);
    font-weight: 600;
  }

  &.just-filled {
    animation: cellPop 0.15s ease-out;
  }
  &.correct-feedback {
    animation: cellCorrect 0.25s ease-out;
  }

  .cell-notes {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    width: 100%;
    height: 100%;
    padding: 1px;
    box-sizing: border-box;

    .note {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      line-height: 1;
      color: transparent;
      &.active {
        color: var(--g-text-2);
      }
    }
  }
}

.sudoku-row:nth-child(3) .sudoku-cell,
.sudoku-row:nth-child(6) .sudoku-cell {
  border-bottom: 3px solid var(--sd-line);
}
.sudoku-row:nth-child(9) .sudoku-cell {
  border-bottom: none;
}

@keyframes cellPop {
  0% { transform: scale(0.9); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes cellCorrect {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

/* 6. 暫停遮罩（棋盤內） */
.pause-scrim {
  @include gs.board-scrim($radius: 10px);
  background: var(--g-surface);

  .pause-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--g-text);
  }

  .pause-time {
    font-family: var(--g-num);
    font-size: 13px;
    color: var(--g-text-2);
    margin-bottom: 8px;
  }

  .pause-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 200px;

    .pill-resume {
      @include gs.pill-dark(44px);
      width: 100%;
    }

    .pill-restart,
    .pill-save {
      @include gs.pill-outline(44px);
      width: 100%;
    }
  }
}

/* 4. 工具列 */
.toolbar {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  flex-shrink: 0;

  .tool-btn {
    height: 56px;
    background: transparent;
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    color: var(--g-text);
    cursor: pointer;
    transition: transform 0.15s, opacity 0.15s;

    .tool-icon {
      width: 22px;
      height: 22px;
    }

    .tool-label {
      font-size: 12px;
      line-height: 1;
    }

    .hint-icon-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      .hint-badge {
        position: absolute;
        top: -6px;
        right: -8px;
        width: 18px;
        height: 18px;
        border-radius: 9px;
        background: var(--sd-accent);
        color: #fff;
        font-family: var(--g-num);
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
    }

    &:active:not(:disabled) {
      transform: scale(0.95);
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
}

/* 5. 數字盤 */
.numpad {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
  flex-shrink: 0;

  .numpad-btn {
    height: 56px;
    border-radius: 14px;
    background: var(--g-surface);
    border: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    cursor: pointer;
    transition: transform 0.15s, opacity 0.15s;

    .num-digit {
      font-family: var(--g-num);
      font-size: 24px;
      font-weight: 600;
      color: var(--sd-accent);
      line-height: 1.1;
    }

    .num-remain {
      font-size: 10px;
      color: var(--g-text-2);
      line-height: 1;
    }

    &.selected {
      outline: 2px solid var(--sd-accent);
      outline-offset: -2px;
    }

    &.completed {
      opacity: 0.5;
      .num-digit {
        color: var(--g-text-2);
      }
    }

    &:active:not(:disabled) {
      transform: scale(0.95);
    }

    &:disabled {
      cursor: default;
    }
  }

  .note-btn {
    height: 56px;
    border-radius: 14px;
    background: var(--g-surface);
    border: 1px dashed var(--g-border);
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: var(--g-text);
    cursor: pointer;
    transition: transform 0.15s, background-color 0.15s;

    .note-icon {
      width: 18px;
      height: 18px;
    }

    .note-label {
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
    }

    &.active {
      background: var(--sd-accent);
      color: #fff;
      border: none;
    }

    &:active {
      transform: scale(0.95);
    }
  }
}
/* 7. 彈窗樣式 (Teleport to body) */
.dialog-overlay {
  @include gs.vars;
  --sd-accent: #5b52b5;
  --sd-line: #3b3570;
  --sd-error: #b4233f;

  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  box-sizing: border-box;
}

.dialog-card {
  background: var(--g-surface);
  border: 1px solid var(--g-border);
  border-radius: 22px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.16);
  color: var(--g-text);
  box-sizing: border-box;
  text-align: center;
  position: relative;

  .dialog-title {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 700;
    color: var(--g-text);
  }

  .dialog-btn-dark {
    @include gs.pill-dark(44px);
    width: 100%;
  }

  .dialog-btn-outline {
    @include gs.pill-outline(44px);
    width: 100%;
  }
}

/* 難度選擇列表 */
.difficulty-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 16px;

  .diff-card-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border: 1px solid var(--g-border);
    border-radius: 14px;
    background: var(--g-surface);
    color: var(--g-text);
    cursor: pointer;
    text-align: left;
    transition: transform 0.15s, border-color 0.15s;

    .diff-card-info {
      display: flex;
      flex-direction: column;
      gap: 2px;

      .diff-card-name {
        font-size: 16px;
        font-weight: 700;
      }
      .diff-card-sub {
        font-size: 12px;
        color: var(--g-text-2);
      }
    }

    .diff-card-arrow {
      width: 18px;
      height: 18px;
      color: var(--g-text-2);
    }

    &:active {
      transform: scale(0.98);
      border-color: var(--sd-accent);
    }
  }
}

/* 存檔彈窗 */
.save-slots {
  margin-bottom: 16px;

  .save-slot {
    padding: 14px;
    border: 1px solid var(--g-border);
    border-radius: 14px;
    background: var(--g-muted);
    text-align: left;

    &.empty {
      text-align: center;
      padding: 24px 14px;
      color: var(--g-text-2);
      p { margin: 0; font-size: 14px; }
    }

    .slot-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;

      .slot-title {
        font-weight: 700;
        font-size: 14px;
      }
      .slot-difficulty {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
        background: var(--g-surface);
        border: 1px solid var(--g-border);
      }
    }

    .slot-info {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      color: var(--g-text-2);
      margin-bottom: 10px;
    }

    .slot-actions {
      display: flex;
      gap: 8px;

      button {
        @include gs.pill(34px);
        flex: 1;
        font-size: 12px;
      }
      .btn-load {
        background: var(--sd-accent);
        color: #fff;
        border: none;
      }
      .btn-delete {
        background: var(--g-surface);
        border: 1px solid var(--sd-error);
        color: var(--sd-error);
      }
    }
  }
}

.save-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .btn-save-current {
    @include gs.pill-dark(44px);
    width: 100%;
  }
}

/* 結束彈窗 (勝利 / 失敗) */
.game-over-content {
  .close-x {
    position: absolute;
    top: 14px;
    right: 14px;
    width: 32px;
    height: 32px;
    border-radius: 16px;
    background: var(--g-muted);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--g-text-2);
  }

  .game-over-icon {
    color: var(--sd-accent);
    margin-bottom: 10px;
  }

  .new-record-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 14px;
    background: var(--sd-accent);
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    margin-bottom: 14px;
  }

  .game-over-message {
    margin: -8px 0 16px;
    font-size: 13px;
    color: var(--g-text-2);
  }

  .game-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 18px;
    text-align: left;

    .stat {
      background: var(--g-muted);
      border-radius: 12px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;

      .stat-label {
        font-size: 11px;
        color: var(--g-text-2);
      }
      .stat-value {
        font-family: var(--g-num);
        font-size: 16px;
        font-weight: 700;
        color: var(--g-text);
        &.new-record {
          color: var(--sd-accent);
        }
      }
    }
  }

  .game-over-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
