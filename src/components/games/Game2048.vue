<template>
  <div class="game-2048">
    <div class="header">
      <button class="back-btn" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">2048</h1>
      <div class="header-actions">
        <button class="icon-btn" title="存檔管理" @click="showSaveMenu = !showSaveMenu">
          <Save class="icon" />
        </button>
        <button class="restart-btn" @click="restartGame">
          <RotateCcw class="icon" />
        </button>
      </div>
    </div>

    <!-- 存档菜单 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="showSaveMenu" class="save-menu-overlay" @click="showSaveMenu = false">
          <div class="save-menu" @click.stop>
            <h3>存檔管理</h3>
            <div class="save-slots">
              <div v-if="hasSavedGame" class="save-slot filled">
                <div class="slot-header">
                  <span class="slot-title">固定存檔</span>
                  <span class="slot-score">分數: {{ savedGameScore }}</span>
                </div>
                <div class="slot-time">{{ formatSaveTime(savedGameTime) }}</div>
                <div class="slot-actions">
                  <button class="btn-load" @click="loadSavedGame"><Download :size="16" /> 讀取</button>
                  <button class="btn-delete" @click="deleteSavedGame"><Trash2 :size="16" /> 刪除</button>
                </div>
              </div>
              <div v-else class="save-slot empty">
                <p>暫無存檔</p>
              </div>
            </div>
            <div class="save-actions">
              <button class="btn-save-current" :disabled="isGameOver" @click="saveCurrentGame">
                <Save :size="18" /> 保存當前遊戲
              </button>
              <button class="btn-close" @click="showSaveMenu = false">關閉</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <div class="game-container">
      <div class="score-container">
        <div class="score-box"><div class="score-label">分數</div><div class="score-value">{{ score }}</div></div>
        <div class="score-box best"><div class="score-label">最高</div><div class="score-value">{{ bestScore }}</div></div>
      </div>

      <div ref="gridContainerRef" class="grid-container" :style="gridContainerStyle">
        <div class="grid-background"><div v-for="i in 16" :key="i" class="grid-cell"></div></div>
        <div class="grid-tiles">
          <div v-for="tile in tiles" :key="tile.id" class="tile" :class="[`tile-${tile.value}`]" :style="getTileStyle(tile)">
            {{ tile.value }}
          </div>
        </div>
      </div>
      <div class="controls-hint"><p>滑動或使用方向鍵移動方塊</p></div>
    </div>

    <!-- 游戏结束 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="isGameOver" class="game-over-overlay">
          <div class="game-over-card">
            <Frown :size="64" style="color: #9ca3af" />
            <h2>遊戲結束</h2>
            <div class="final-score"><span class="label">最終分數</span><span class="value">{{ score }}</span></div>
            <div v-if="score === bestScore && score > 0" class="new-record"><Trophy :size="18" /> 新紀錄！</div>
            <div class="button-group">
              <button class="share-btn" @click="shareScore"><Share2 :size="18" /> 分享成績</button>
              <button class="restart-game-btn" @click="restartGame"><RotateCcw :size="18" /> 重新開始</button>
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

    <!-- 胜利 -->
    <Teleport to="body">
      <transition name="fade">
        <div v-if="hasWon && !continueAfterWin" class="game-over-overlay">
          <div class="game-over-card win">
            <Trophy :size="64" style="color: #edc22e" />
            <h2>恭喜獲勝！</h2>
            <div class="final-score"><span class="label">達成 2048</span><span class="value">{{ score }}</span></div>
            <div class="button-group">
              <button class="continue-btn" @click="continueGame">繼續遊戲</button>
              <button class="restart-game-btn" @click="restartGame">重新開始</button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Download, Frown, RotateCcw, Save, Share2, Trash2, Trophy } from 'lucide-vue-next'
import { ref, computed, onMounted, onUnmounted } from 'vue'
import GameScoreShareModal from '@/components/modals/GameScoreShareModal.vue'

const emit = defineEmits<{ close: []; shareToChat: [characterId: string, message: string] }>()

interface Tile { id: string; value: number; row: number; col: number }

const grid = ref<number[][]>([[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]])
const tiles = ref<Tile[]>([])
const score = ref(0)
const bestScore = ref(0)
const isGameOver = ref(false)
const hasWon = ref(false)
const continueAfterWin = ref(false)
const showSaveMenu = ref(false)
const hasSavedGame = ref(false)
const savedGameScore = ref(0)
const savedGameTime = ref(0)
const gridContainerRef = ref<HTMLElement | null>(null)
const showSharePicker = ref(false)
let touchStartX = 0
let touchStartY = 0

// Responsive grid sizing
const gridPadding = 10
const gridGap = 10
const maxGridSize = 330
const gridSize = ref(maxGridSize)

function calcGridSize() {
  // Use available width minus some padding, capped at maxGridSize
  // Also consider available height to avoid vertical overflow
  const vw = window.innerWidth
  const vh = window.innerHeight
  const widthBased = Math.min(vw - 40, maxGridSize) // 20px padding each side
  // header ~73px, score ~80px, hint ~40px, paddings ~60px
  const heightBased = vh - 280
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

function initGame() {
  grid.value = [[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]
  tiles.value = []; score.value = 0; isGameOver.value = false; hasWon.value = false; continueAfterWin.value = false
  addRandomTile(); addRandomTile(); updateTiles()
}

function restartGame() { clearGameState(); initGame() }
function continueGame() { continueAfterWin.value = true }

function addRandomTile() {
  const emptyCells: { row: number; col: number }[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (grid.value[r][c] === 0) emptyCells.push({ row: r, col: c })
  if (emptyCells.length > 0) {
    const { row, col } = emptyCells[Math.floor(Math.random() * emptyCells.length)]
    grid.value[row][col] = Math.random() < 0.9 ? 2 : 4
  }
}

function updateTiles() {
  const newTiles: Tile[] = []
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++)
    if (grid.value[r][c] !== 0) newTiles.push({ id: `${r}-${c}`, value: grid.value[r][c], row: r, col: c })
  tiles.value = newTiles
}

function move(direction: 'up' | 'down' | 'left' | 'right') {
  if (isGameOver.value) return
  const oldGrid = JSON.stringify(grid.value)
  switch (direction) { case 'left': moveLeft(); break; case 'right': moveRight(); break; case 'up': moveUp(); break; case 'down': moveDown(); break }
  if (oldGrid !== JSON.stringify(grid.value)) { addRandomTile(); updateTiles(); checkGameState(); saveGameState() }
}

function moveLeft() { for (let r = 0; r < 4; r++) { const line = grid.value[r].filter(v => v !== 0); const merged: number[] = []; for (let i = 0; i < line.length; i++) { if (i < line.length - 1 && line[i] === line[i + 1]) { merged.push(line[i] * 2); score.value += line[i] * 2; i++ } else merged.push(line[i]) } while (merged.length < 4) merged.push(0); grid.value[r] = merged } }
function moveRight() { for (let r = 0; r < 4; r++) { const line = grid.value[r].filter(v => v !== 0); const merged: number[] = []; for (let i = line.length - 1; i >= 0; i--) { if (i > 0 && line[i] === line[i - 1]) { merged.unshift(line[i] * 2); score.value += line[i] * 2; i-- } else merged.unshift(line[i]) } while (merged.length < 4) merged.unshift(0); grid.value[r] = merged } }
function moveUp() { for (let c = 0; c < 4; c++) { const line = [0,1,2,3].map(r => grid.value[r][c]).filter(v => v !== 0); const merged: number[] = []; for (let i = 0; i < line.length; i++) { if (i < line.length - 1 && line[i] === line[i + 1]) { merged.push(line[i] * 2); score.value += line[i] * 2; i++ } else merged.push(line[i]) } while (merged.length < 4) merged.push(0); for (let r = 0; r < 4; r++) grid.value[r][c] = merged[r] } }
function moveDown() { for (let c = 0; c < 4; c++) { const line = [0,1,2,3].map(r => grid.value[r][c]).filter(v => v !== 0); const merged: number[] = []; for (let i = line.length - 1; i >= 0; i--) { if (i > 0 && line[i] === line[i - 1]) { merged.unshift(line[i] * 2); score.value += line[i] * 2; i-- } else merged.unshift(line[i]) } while (merged.length < 4) merged.unshift(0); for (let r = 0; r < 4; r++) grid.value[r][c] = merged[r] } }

function checkGameState() {
  if (!hasWon.value) { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (grid.value[r][c] === 2048) { hasWon.value = true; return } }
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (grid.value[r][c] === 0) return
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { if (c < 3 && grid.value[r][c + 1] === grid.value[r][c]) return; if (r < 3 && grid.value[r + 1][c] === grid.value[r][c]) return }
  isGameOver.value = true
  if (score.value > bestScore.value) { bestScore.value = score.value; saveBestScore() }
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
  // Reduce font for large numbers
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
    const map: Record<string, 'up'|'down'|'left'|'right'> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }
    move(map[e.key])
  }
}

function handleTouchStart(e: TouchEvent) { touchStartX = e.touches[0].clientX; touchStartY = e.touches[0].clientY }
function handleTouchEnd(e: TouchEvent) {
  const dx = e.changedTouches[0].clientX - touchStartX; const dy = e.changedTouches[0].clientY - touchStartY
  if (Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dx) > 30) move(dx > 0 ? 'right' : 'left') }
  else { if (Math.abs(dy) > 30) move(dy > 0 ? 'down' : 'up') }
}

function loadBestScore() { const s = localStorage.getItem('2048-best-score'); if (s) bestScore.value = parseInt(s, 10) }
function saveBestScore() { localStorage.setItem('2048-best-score', bestScore.value.toString()) }
function saveGameState() { localStorage.setItem('2048-game-state', JSON.stringify({ grid: grid.value, score: score.value, hasWon: hasWon.value, continueAfterWin: continueAfterWin.value, timestamp: Date.now() })) }
function loadGameState(): boolean {
  const s = localStorage.getItem('2048-game-state'); if (!s) return false
  try { const gs = JSON.parse(s); if ((Date.now() - gs.timestamp) / 3600000 > 24) return false; grid.value = gs.grid; score.value = gs.score; hasWon.value = gs.hasWon || false; continueAfterWin.value = gs.continueAfterWin || false; updateTiles(); return true } catch { return false }
}
function clearGameState() { localStorage.removeItem('2048-game-state') }

function checkSavedGame() {
  const s = localStorage.getItem('2048-saved-game'); if (!s) { hasSavedGame.value = false; return }
  try { const d = JSON.parse(s); hasSavedGame.value = true; savedGameScore.value = d.score || 0; savedGameTime.value = d.timestamp || 0 } catch { hasSavedGame.value = false }
}
function saveCurrentGame() {
  if (isGameOver.value) return
  if (hasSavedGame.value && !confirm(`已有存檔（分數: ${savedGameScore.value}）\n確定要覆蓋嗎？`)) return
  localStorage.setItem('2048-saved-game', JSON.stringify({ grid: grid.value, score: score.value, hasWon: hasWon.value, continueAfterWin: continueAfterWin.value, timestamp: Date.now() }))
  checkSavedGame(); showSaveMenu.value = false
}
function loadSavedGame() {
  const s = localStorage.getItem('2048-saved-game'); if (!s) return
  try { const d = JSON.parse(s); grid.value = d.grid; score.value = d.score; hasWon.value = d.hasWon || false; continueAfterWin.value = d.continueAfterWin || false; isGameOver.value = false; updateTiles(); showSaveMenu.value = false } catch { /* ignore */ }
}
function deleteSavedGame() { if (confirm('確定要刪除存檔嗎？')) { localStorage.removeItem('2048-saved-game'); hasSavedGame.value = false } }
function formatSaveTime(ts: number): string {
  if (!ts) return ''; const diff = Date.now() - ts; const h = Math.floor(diff / 3600000); const d = Math.floor(h / 24)
  if (h < 1) return `${Math.floor(diff / 60000)} 分鐘前`; if (h < 24) return `${h} 小時前`; if (d < 7) return `${d} 天前`
  return new Date(ts).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  calcGridSize()
  loadBestScore(); checkSavedGame()
  if (!loadGameState()) initGame()
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('resize', calcGridSize)
  const gc = gridContainerRef.value
  if (gc) { gc.addEventListener('touchstart', handleTouchStart as any); gc.addEventListener('touchend', handleTouchEnd as any) }
})
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('resize', calcGridSize)
  const gc = gridContainerRef.value
  if (gc) { gc.removeEventListener('touchstart', handleTouchStart as any); gc.removeEventListener('touchend', handleTouchEnd as any) }
})
</script>


<style scoped lang="scss">
.game-2048 {
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

  .back-btn,
  .restart-btn {
    width: 40px;
    height: 40px;
    min-height: 44px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;

    .icon {
      width: 20px;
      height: 20px;
      color: #6b7280;
    }

    &:active {
      transform: scale(0.95);
      background: #e5e7eb;
    }
  }

  .title {
    font-size: 24px;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .icon-btn {
    width: 40px;
    height: 40px;
    min-height: 44px;
    border: none;
    background: #f3f4f6;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;

    .icon {
      width: 20px;
      height: 20px;
      color: #6b7280;
    }

    &:active {
      transform: scale(0.95);
      background: #e5e7eb;
    }
  }
}

.save-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
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
    margin: 0 0 20px 0;
    font-size: 20px;
    font-weight: 600;
    color: #1f2937;
    text-align: center;
  }
}

.save-slots {
  margin-bottom: 20px;
}

.save-slot {
  background: #f9fafb;
  border: 2px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;

  &.filled {
    border-color: #10b981;
    background: #ecfdf5;
  }

  &.empty {
    text-align: center;
    padding: 32px 16px;

    p {
      margin: 0;
      color: #9ca3af;
      font-size: 14px;
    }
  }
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .slot-title {
    font-weight: 600;
    color: #065f46;
    font-size: 15px;
  }

  .slot-score {
    font-weight: 600;
    color: #10b981;
    font-size: 16px;
  }
}

.slot-time {
  font-size: 13px;
  color: #6b7280;
  margin-bottom: 12px;
}

.slot-actions {
  display: flex;
  gap: 8px;

  button {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-load {
    background: #10b981;
    color: white;

    &:active {
      transform: scale(0.97);
      background: #059669;
    }
  }

  .btn-delete {
    background: #ef4444;
    color: white;

    &:active {
      transform: scale(0.97);
      background: #dc2626;
    }
  }
}

.save-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;

  button {
    padding: 12px 20px;
    border: none;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-save-current {
    background: #3b82f6;
    color: white;

    &:disabled {
      background: #d1d5db;
      cursor: not-allowed;
      opacity: 0.6;
    }

    &:not(:disabled):active {
      transform: scale(0.98);
    }
  }

  .btn-close {
    background: #f3f4f6;
    color: #6b7280;

    &:active {
      transform: scale(0.98);
      background: #e5e7eb;
    }
  }
}

.game-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
}

.score-container {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;

  .score-box {
    background: white;
    padding: 12px 20px;
    border-radius: 8px;
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    min-width: 80px;

    &.best {
      background: var(--color-primary, #7dd3a8);

      .score-label,
      .score-value {
        color: white;
      }
    }

    .score-label {
      font-size: 12px;
      color: #9ca3af;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .score-value {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
    }
  }
}

.grid-container {
  position: relative;
  background: #bbada0;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 20px;
  touch-action: none;
  user-select: none;
  flex-shrink: 0;
}

.grid-background {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 10px;

  .grid-cell {
    background: rgba(238, 228, 218, 0.35);
    border-radius: 4px;
  }
}

.grid-tiles {
  position: absolute;
  top: 10px;
  left: 10px;
  right: 10px;
  bottom: 10px;
}

.tile {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  border-radius: 4px;
  transition: transform 0.15s ease;

  &.tile-2 { background: #eee4da; color: #776e65; }
  &.tile-4 { background: #ede0c8; color: #776e65; }
  &.tile-8 { background: #f2b179; color: #f9f6f2; }
  &.tile-16 { background: #f59563; color: #f9f6f2; }
  &.tile-32 { background: #f67c5f; color: #f9f6f2; }
  &.tile-64 { background: #f65e3b; color: #f9f6f2; }
  &.tile-128 { background: #edcf72; color: #f9f6f2; }
  &.tile-256 { background: #edcc61; color: #f9f6f2; }
  &.tile-512 { background: #edc850; color: #f9f6f2; }
  &.tile-1024 { background: #edc53f; color: #f9f6f2; }
  &.tile-2048 { background: #edc22e; color: #f9f6f2; box-shadow: 0 0 20px rgba(237, 194, 46, 0.5); }
  &.tile-4096, &.tile-8192 { background: #3c3a32; color: #f9f6f2; }
}

.controls-hint {
  text-align: center;
  color: #9ca3af;
  font-size: 14px;
  p { margin: 0; }
}

.game-over-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
}

.game-over-card {
  background: white;
  border-radius: 20px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  min-width: 280px;
  max-width: 90%;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;

  h2 {
    margin: 16px 0 20px;
    font-size: 24px;
    color: #1f2937;
    font-weight: 700;
  }

  .final-score {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 16px 0;

    .label { font-size: 14px; color: #6b7280; }
    .value { font-size: 36px; font-weight: 700; color: var(--color-primary, #7dd3a8); }
  }

  .new-record {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    background: #fef3c7;
    color: #92400e;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    margin: 16px 0;
  }

  .button-group {
    display: flex;
    gap: 12px;
    margin-top: 20px;
  }

  .continue-btn,
  .restart-game-btn,
  .share-btn {
    flex: 1;
    min-height: 44px;
    padding: 12px 24px;
    border: none;
    font-size: 16px;
    font-weight: 600;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .continue-btn {
    background: #f3f4f6;
    color: #1f2937;
    &:active { transform: scale(0.98); background: #e5e7eb; }
  }

  .share-btn {
    background: #3b82f6;
    color: white;
    &:active { transform: scale(0.98); background: #2563eb; }
  }

  .restart-game-btn {
    background: var(--color-primary, #7dd3a8);
    color: white;
    &:active { transform: scale(0.98); }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}


</style>
