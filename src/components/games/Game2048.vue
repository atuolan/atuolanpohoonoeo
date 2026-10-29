<template>
  <div ref="rootRef" class="game-2048">
    <!-- 1. 頂欄 -->
    <header class="topbar">
      <button class="round-btn" aria-label="返回" @click="$emit('close')">
        <ChevronLeft />
      </button>
      <h1 class="title">2048</h1>
      <button class="round-btn" aria-label="存檔管理" @click="showSaveMenu = !showSaveMenu">
        <Save />
      </button>
    </header>

    <!-- 2. 分數列 -->
    <div class="score-row">
      <div class="stat-card">
        <span class="stat-label">分數</span>
        <span class="stat-value">{{ score.toLocaleString() }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">最高</span>
        <span class="stat-value">{{ bestScore.toLocaleString() }}</span>
      </div>
    </div>

    <!-- 3. 工具列 -->
    <div class="toolbar">
      <div class="toolbar-hint">
        {{ hasWon && continueAfterWin ? '已拼出 2048，繼續往上' : '合成出 2048 就贏了' }}
      </div>
      <div class="toolbar-actions">
        <button
          class="pill-outline"
          :disabled="history.length === 0 || undoLeft <= 0"
          @click="undo"
        >
          <Undo2 />
          <span>復原 · {{ undoLeft }}</span>
        </button>
        <button class="pill-dark" @click="confirmRestart">
          新遊戲
        </button>
      </div>
    </div>

    <!-- 4. 棋盤 & 6. 遮罩 -->
    <div class="board-wrapper">
      <div ref="gridContainerRef" class="board" :style="gridContainerStyle">
        <div class="grid-background">
          <div v-for="i in 16" :key="i" class="grid-cell"></div>
        </div>
        <div class="grid-tiles">
          <div
            v-for="tile in tiles"
            :key="tile.id"
            class="tile"
            :class="[`tile-${tile.value >= 2048 ? '2048' : tile.value}`]"
            :style="getTileStyle(tile)"
          >
            <span class="tile-inner">{{ tile.value }}</span>
          </div>
        </div>

        <!-- 勝利遮罩 -->
        <div v-if="hasWon && !continueAfterWin" class="board-scrim">
          <div class="win-title">2048！</div>
          <div class="win-subtitle">你拼出來了</div>
          <div class="scrim-actions">
            <button class="scrim-pill-outline" @click="continueGame">繼續挑戰</button>
            <button class="scrim-pill-dark" @click="restartGame">新遊戲</button>
          </div>
        </div>

        <!-- 遊戲結束遮罩 -->
        <div v-if="isGameOver" class="board-scrim">
          <div class="over-title">沒有空格了</div>
          <div class="over-score-row">
            <span class="over-label">最終分數</span>
            <span class="over-score">{{ score.toLocaleString() }}</span>
          </div>
          <div v-if="isNewRecord" class="new-record-badge">
            <Trophy :size="16" />
            <span>新紀錄！</span>
          </div>
          <div class="scrim-actions">
            <button class="scrim-pill-outline" @click="shareScore">
              <Share2 :size="14" />
              <span>分享成績</span>
            </button>
            <button class="scrim-pill-dark" @click="restartGame">再來一局</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 5. 提示列 -->
    <div class="hint-row">
      <svg
        class="hint-icon"
        viewBox="0 0 44 44"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M22 6v8M18 10l4-4 4 4M22 38v-8M18 34l4 4 4-4M6 22h8M10 18l-4 4 4 4M38 22h-8M34 18l4 4-4 4" />
      </svg>
      <span>上下左右滑動，相同數字會合在一起</span>
    </div>

    <!-- 7. 存檔管理彈窗 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showSaveMenu" class="save-menu-overlay" @click="showSaveMenu = false">
          <div class="save-menu" @click.stop>
            <h3>存檔管理</h3>
            <div class="save-slots">
              <div v-if="hasSavedGame" class="save-slot filled">
                <div class="slot-header">
                  <span class="slot-title">固定存檔</span>
                  <span class="slot-score">分數: {{ savedGameScore.toLocaleString() }}</span>
                </div>
                <div class="slot-time">{{ formatSaveTime(savedGameTime) }}</div>
                <div class="slot-actions">
                  <button class="slot-btn slot-btn-load" @click="loadSavedGame">
                    <Download :size="16" />
                    <span>讀取</span>
                  </button>
                  <button class="slot-btn slot-btn-delete" @click="deleteSavedGame">
                    <Trash2 :size="16" />
                    <span>刪除</span>
                  </button>
                </div>
              </div>
              <div v-else class="save-slot empty">
                <p>暫無存檔</p>
              </div>
            </div>
            <div class="save-actions">
              <button class="menu-pill-dark" :disabled="isGameOver" @click="saveCurrentGame">
                <Save :size="16" />
                <span>保存當前遊戲</span>
              </button>
              <button class="menu-pill-outline" @click="showSaveMenu = false">關閉</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- 角色選擇器 -->
    <GameScoreShareModal
      :visible="showSharePicker"
      @close="showSharePicker = false"
      @select="handleShareToCharacter"
    />
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Download, Save, Share2, Trash2, Trophy, Undo2 } from 'lucide-vue-next'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import GameScoreShareModal from '@/components/modals/GameScoreShareModal.vue'

const emit = defineEmits<{ close: []; shareToChat: [characterId: string, message: string] }>()

interface Tile { id: string; value: number; row: number; col: number }
interface HistoryEntry { grid: number[][]; score: number }

const rootRef = ref<HTMLElement | null>(null)
const gridContainerRef = ref<HTMLElement | null>(null)

const grid = ref<number[][]>([[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]])
const tiles = ref<Tile[]>([])
const score = ref(0)
const bestScore = ref(0)
const startBest = ref(0)
const isGameOver = ref(false)
const hasWon = ref(false)
const continueAfterWin = ref(false)
const history = ref<HistoryEntry[]>([])
const undoLeft = ref(2)

const showSaveMenu = ref(false)
const hasSavedGame = ref(false)
const savedGameScore = ref(0)
const savedGameTime = ref(0)
const showSharePicker = ref(false)

let touchStartX = 0
let touchStartY = 0

// Responsive grid sizing
const gridPadding = 10
const gridGap = 10
const maxGridSize = 350
const gridSize = ref(maxGridSize)

function calcGridSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const widthBased = Math.min(vw - 40, maxGridSize)
  const heightBased = vh - 340
  gridSize.value = Math.max(200, Math.min(widthBased, heightBased, maxGridSize))
}

const innerSize = computed(() => gridSize.value - gridPadding * 2)
const tileSize = computed(() => (innerSize.value - gridGap * 3) / 4)
const tileFontSize = computed(() => {
  const s = tileSize.value
  if (s >= 65) return 32
  if (s >= 50) return 26
  if (s >= 40) return 22
  return 18
})

const gridContainerStyle = computed(() => ({
  width: `${gridSize.value}px`,
  height: `${gridSize.value}px`,
}))

const isNewRecord = computed(() => isGameOver.value && score.value > startBest.value)

function cloneGrid(src: number[][]): number[][] {
  return src.map(row => [...row])
}

function initGame() {
  grid.value = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
  tiles.value = []
  score.value = 0
  isGameOver.value = false
  hasWon.value = false
  continueAfterWin.value = false
  history.value = []
  undoLeft.value = 2
  startBest.value = bestScore.value
  addRandomTile()
  addRandomTile()
  updateTiles()
}

function restartGame() {
  clearGameState()
  initGame()
}

function confirmRestart() {
  if (score.value > 0 && !isGameOver.value) {
    if (!confirm('確定要放棄這局，重新開始嗎？')) return
  }
  restartGame()
}

function continueGame() {
  continueAfterWin.value = true
}

function addRandomTile() {
  const emptyCells: { row: number; col: number }[] = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid.value[r][c] === 0) emptyCells.push({ row: r, col: c })
    }
  }
  if (emptyCells.length > 0) {
    const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    grid.value[row][col] = Math.random() < 0.9 ? 2 : 4
  }
}

function updateTiles() {
  const newTiles: Tile[] = []
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid.value[r][c] !== 0) {
        newTiles.push({ id: `${r}-${c}`, value: grid.value[r][c], row: r, col: c })
      }
    }
  }
  tiles.value = newTiles
}

function move(direction: 'up' | 'down' | 'left' | 'right') {
  if (isGameOver.value) return

  const prevGrid = cloneGrid(grid.value)
  const prevScore = score.value

  switch (direction) {
    case 'left': moveLeft(); break
    case 'right': moveRight(); break
    case 'up': moveUp(); break
    case 'down': moveDown(); break
  }

  const hasChanged = JSON.stringify(prevGrid) !== JSON.stringify(grid.value)
  if (hasChanged) {
    history.value.push({ grid: prevGrid, score: prevScore })
    if (history.value.length > 2) {
      history.value.shift()
    }

    if (score.value > bestScore.value) {
      bestScore.value = score.value
      saveBestScore()
    }

    addRandomTile()
    updateTiles()
    checkGameState()
    saveGameState()
  }
}

function undo() {
  if (history.value.length === 0 || undoLeft.value <= 0) return
  const prev = history.value.pop()
  if (!prev) return
  grid.value = cloneGrid(prev.grid)
  score.value = prev.score
  undoLeft.value--
  isGameOver.value = false
  updateTiles()
  saveGameState()
}

function moveLeft() {
  for (let r = 0; r < 4; r++) {
    const line = grid.value[r].filter(v => v !== 0)
    const merged: number[] = []
    for (let i = 0; i < line.length; i++) {
      if (i < line.length - 1 && line[i] === line[i + 1]) {
        merged.push(line[i] * 2)
        score.value += line[i] * 2
        i++
      } else merged.push(line[i])
    }
    while (merged.length < 4) merged.push(0)
    grid.value[r] = merged
  }
}

function moveRight() {
  for (let r = 0; r < 4; r++) {
    const line = grid.value[r].filter(v => v !== 0)
    const merged: number[] = []
    for (let i = line.length - 1; i >= 0; i--) {
      if (i > 0 && line[i] === line[i - 1]) {
        merged.unshift(line[i] * 2)
        score.value += line[i] * 2
        i--
      } else merged.unshift(line[i])
    }
    while (merged.length < 4) merged.unshift(0)
    grid.value[r] = merged
  }
}

function moveUp() {
  for (let c = 0; c < 4; c++) {
    const line = [0,1,2,3].map(r => grid.value[r][c]).filter(v => v !== 0)
    const merged: number[] = []
    for (let i = 0; i < line.length; i++) {
      if (i < line.length - 1 && line[i] === line[i + 1]) {
        merged.push(line[i] * 2)
        score.value += line[i] * 2
        i++
      } else merged.push(line[i])
    }
    while (merged.length < 4) merged.push(0)
    for (let r = 0; r < 4; r++) grid.value[r][c] = merged[r]
  }
}

function moveDown() {
  for (let c = 0; c < 4; c++) {
    const line = [0,1,2,3].map(r => grid.value[r][c]).filter(v => v !== 0)
    const merged: number[] = []
    for (let i = line.length - 1; i >= 0; i--) {
      if (i > 0 && line[i] === line[i - 1]) {
        merged.unshift(line[i] * 2)
        score.value += line[i] * 2
        i--
      } else merged.unshift(line[i])
    }
    while (merged.length < 4) merged.unshift(0)
    for (let r = 0; r < 4; r++) grid.value[r][c] = merged[r]
  }
}

function checkGameState() {
  if (!hasWon.value) {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid.value[r][c] === 2048) {
          hasWon.value = true
          return
        }
      }
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (grid.value[r][c] === 0) return
    }
  }
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (c < 3 && grid.value[r][c + 1] === grid.value[r][c]) return
      if (r < 3 && grid.value[r + 1][c] === grid.value[r][c]) return
    }
  }
  isGameOver.value = true
  if (score.value > bestScore.value) {
    bestScore.value = score.value
    saveBestScore()
  }
}

function shareScore() {
  showSharePicker.value = true
}

function handleShareToCharacter(characterId: string) {
  showSharePicker.value = false
  const message = `<game>2048|${score.value}</game>`
  emit('shareToChat', characterId, message)
}

function getTileStyle(tile: Tile) {
  const size = tileSize.value
  const step = size + gridGap
  const fs = tileFontSize.value
  let adjustedFs = fs
  if (tile.value >= 1024) adjustedFs = Math.max(14, fs - 8)
  else if (tile.value >= 128) adjustedFs = Math.max(16, fs - 4)
  return {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${adjustedFs}px`,
    transform: `translate(${tile.col * step}px, ${tile.row * step}px)`,
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
    e.preventDefault()
    const map: Record<string, 'up'|'down'|'left'|'right'> = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    move(map[e.key])
  }
}

function handleTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}

function handleTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX
  const dy = e.changedTouches[0].clientY - touchStartY
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) > 30) move(dx > 0 ? 'right' : 'left')
  } else {
    if (Math.abs(dy) > 30) move(dy > 0 ? 'down' : 'up')
  }
}

function loadBestScore() {
  const s = localStorage.getItem('2048-best-score')
  if (s) bestScore.value = parseInt(s, 10)
}

function saveBestScore() {
  localStorage.setItem('2048-best-score', bestScore.value.toString())
}

function saveGameState() {
  localStorage.setItem(
    '2048-game-state',
    JSON.stringify({
      grid: grid.value,
      score: score.value,
      hasWon: hasWon.value,
      continueAfterWin: continueAfterWin.value,
      undoLeft: undoLeft.value,
      timestamp: Date.now(),
    })
  )
}

function loadGameState(): boolean {
  const s = localStorage.getItem('2048-game-state')
  if (!s) return false
  try {
    const gs = JSON.parse(s)
    grid.value = gs.grid
    score.value = gs.score
    hasWon.value = gs.hasWon || false
    continueAfterWin.value = gs.continueAfterWin || false
    undoLeft.value = typeof gs.undoLeft === 'number' ? gs.undoLeft : 2
    history.value = []
    startBest.value = bestScore.value
    updateTiles()
    return true
  } catch {
    return false
  }
}

function clearGameState() {
  localStorage.removeItem('2048-game-state')
}

function checkSavedGame() {
  const s = localStorage.getItem('2048-saved-game')
  if (!s) {
    hasSavedGame.value = false
    return
  }
  try {
    const d = JSON.parse(s)
    hasSavedGame.value = true
    savedGameScore.value = d.score || 0
    savedGameTime.value = d.timestamp || 0
  } catch {
    hasSavedGame.value = false
  }
}

function saveCurrentGame() {
  if (isGameOver.value) return
  if (hasSavedGame.value && !confirm(`已有存檔（分數: ${savedGameScore.value}）\n確定要覆蓋嗎？`)) return
  localStorage.setItem(
    '2048-saved-game',
    JSON.stringify({
      grid: grid.value,
      score: score.value,
      hasWon: hasWon.value,
      continueAfterWin: continueAfterWin.value,
      undoLeft: undoLeft.value,
      timestamp: Date.now(),
    })
  )
  checkSavedGame()
  showSaveMenu.value = false
}

function loadSavedGame() {
  const s = localStorage.getItem('2048-saved-game')
  if (!s) return
  try {
    const d = JSON.parse(s)
    grid.value = d.grid
    score.value = d.score
    hasWon.value = d.hasWon || false
    continueAfterWin.value = d.continueAfterWin || false
    undoLeft.value = typeof d.undoLeft === 'number' ? d.undoLeft : 2
    history.value = []
    startBest.value = bestScore.value
    isGameOver.value = false
    updateTiles()
    showSaveMenu.value = false
  } catch {
    // ignore
  }
}

function deleteSavedGame() {
  if (confirm('確定要刪除存檔嗎？')) {
    localStorage.removeItem('2048-saved-game')
    hasSavedGame.value = false
  }
}

function formatSaveTime(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  if (h < 1) return `${Math.floor(diff / 60000)} 分鐘前`
  if (h < 24) return `${h} 小時前`
  if (d < 7) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

onMounted(() => {
  calcGridSize()
  loadBestScore()
  checkSavedGame()
  if (!loadGameState()) initGame()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', calcGridSize)
  const rootEl = rootRef.value
  if (rootEl) {
    rootEl.addEventListener('touchstart', handleTouchStart as any)
    rootEl.addEventListener('touchend', handleTouchEnd as any)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', calcGridSize)
  const rootEl = rootRef.value
  if (rootEl) {
    rootEl.removeEventListener('touchstart', handleTouchStart as any)
    rootEl.removeEventListener('touchend', handleTouchEnd as any)
  }
})
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.game-2048 {
  @include gs.screen;
  touch-action: none;
}

// 1. 頂欄
.topbar {
  @include gs.topbar;
}

.title {
  @include gs.title;
}

.round-btn {
  @include gs.round-btn;
}

// 2. 分數列
.score-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.stat-card {
  @include gs.stat-card;
}

.stat-label {
  @include gs.stat-label;
}

.stat-value {
  @include gs.stat-value;
}

// 3. 工具列
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.toolbar-hint {
  font-size: 13px;
  color: var(--g-text-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pill-outline {
  @include gs.pill-outline(36px);
}

.pill-dark {
  @include gs.pill-dark(36px);
}

// 4. 棋盤外框
.board-wrapper {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.board {
  position: relative;
  background: #E7DFC9;
  border-radius: 22px;
  padding: 10px;
  box-sizing: border-box;
  touch-action: none;
  user-select: none;
}

.grid-background {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 10px;
  width: 100%;
  height: 100%;
}

.grid-cell {
  background: #F1EBDA;
  border-radius: 14px;
}

body.is-night-mode .board {
  background: #3a342b;
}

body.is-night-mode .grid-cell {
  background: #4a4337;
}

.grid-tiles {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
  pointer-events: none;
}

.tile {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 14px;
  box-shadow: 0 3px 0 rgba(0, 0, 0, 0.08);
  font-family: var(--g-num);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease-in-out;
  user-select: none;

  .tile-inner {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    animation: tile-appear 0.15s ease-out;
  }
}

@keyframes tile-appear {
  from {
    transform: scale(0.6);
    opacity: 0.5;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

// 方塊顏色
.tile-2 {
  background: #FFFFFF;
  color: #121214;
}
.tile-4 {
  background: #FBF1D3;
  color: #121214;
}
.tile-8 {
  background: #F7D88A;
  color: #121214;
}
.tile-16 {
  background: #F2B45A;
  color: #121214;
}
.tile-32 {
  background: #EB8F45;
  color: #121214;
}
.tile-64 {
  background: #D9702A;
  color: #121214;
}
.tile-128 {
  background: #C2552A;
  color: #FFFFFF;
}
.tile-256 {
  background: #A34528;
  color: #FFFFFF;
}
.tile-512 {
  background: #7E3A26;
  color: #FFFFFF;
}
.tile-1024 {
  background: #4E2A1E;
  color: #FFFFFF;
}
.tile-2048 {
  background: #121214;
  color: #FFFFFF;
}

// 5. 提示列
.hint-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 13px;
  color: var(--g-text-2);
  text-align: center;
  user-select: none;
}

.hint-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

// 6. 遮罩（勝利與結束）
.board-scrim {
  @include gs.board-scrim(22px);
  pointer-events: auto;
}

.win-title {
  font-family: var(--g-num);
  font-size: 56px;
  font-weight: 700;
  line-height: 1;
  color: var(--g-text);
}

.win-subtitle {
  font-size: 15px;
  color: var(--g-text-2);
}

.over-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--g-text);
}

.over-score-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.over-label {
  font-size: 13px;
  color: var(--g-text-2);
}

.over-score {
  font-family: var(--g-num);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--g-text);
}

.new-record-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 700;
  color: #8A5A00;
}

.scrim-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}

.scrim-pill-outline {
  @include gs.pill-outline(44px);
}

.scrim-pill-dark {
  @include gs.pill-dark(44px);
}

// 7. 存檔管理彈窗
.save-menu-overlay {
  @include gs.vars;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  box-sizing: border-box;
}

.save-menu {
  background: var(--g-surface);
  border-radius: 20px;
  padding: 20px;
  width: 100%;
  max-width: 320px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
  color: var(--g-text);

  h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 700;
    text-align: center;
    color: var(--g-text);
  }
}

.save-slots {
  margin-bottom: 16px;
}

.save-slot {
  background: var(--g-bg);
  border: 1px solid var(--g-border);
  border-radius: 14px;
  padding: 12px;

  &.empty {
    text-align: center;
    padding: 24px;
    color: var(--g-text-2);
    font-size: 14px;

    p {
      margin: 0;
    }
  }

  &.filled {
    .slot-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
      font-size: 14px;

      .slot-title {
        font-weight: 700;
        color: var(--g-text);
      }

      .slot-score {
        font-family: var(--g-num);
        color: var(--g-text-2);
      }
    }

    .slot-time {
      font-size: 12px;
      color: var(--g-text-2);
      margin-bottom: 10px;
    }

    .slot-actions {
      display: flex;
      gap: 8px;
    }
  }
}

.slot-btn {
  flex: 1;
  height: 34px;
  border-radius: 17px;
  border: 1px solid var(--g-border);
  background: var(--g-surface);
  color: var(--g-text);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.15s, opacity 0.15s;

  &:active {
    transform: scale(0.96);
  }
}

.slot-btn-delete {
  color: #dc2626;
  border-color: color-mix(in srgb, #dc2626 25%, var(--g-border));
}

.save-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-pill-dark {
  @include gs.pill-dark(44px);
  width: 100%;
}

.menu-pill-outline {
  @include gs.pill-outline(44px);
  width: 100%;
}

// Fade transition
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
