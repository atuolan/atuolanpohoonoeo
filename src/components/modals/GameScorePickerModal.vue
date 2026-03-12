<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="visible" class="picker-overlay" @click="$emit('close')">
        <div class="picker-modal" @click.stop>
          <h3>選擇遊戲成績</h3>
          <div v-if="records.length === 0" class="empty-hint">
            <p>還沒有任何遊戲紀錄</p>
          </div>
          <div v-else class="record-list">
            <div
              v-for="rec in records"
              :key="rec.gameId"
              class="record-item"
              @click="$emit('select', rec.gameId, rec.label)"
            >
              <div class="rec-icon" :style="{ background: rec.color }">
                <svg viewBox="0 0 24 24" fill="currentColor"><path :d="rec.iconPath" /></svg>
              </div>
              <div class="rec-info">
                <span class="rec-name">{{ rec.gameName }}</span>
                <span class="rec-score">{{ rec.label }}</span>
              </div>
            </div>
          </div>
          <button class="btn-cancel" @click="$emit('close')">取消</button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineProps<{ visible: boolean }>()
defineEmits<{ close: []; select: [gameId: string, label: string] }>()

interface GameRecord {
  gameId: string
  gameName: string
  label: string
  color: string
  iconPath: string
}

const records = computed<GameRecord[]>(() => {
  const list: GameRecord[] = []

  // 2048
  const s2048 = localStorage.getItem('2048-best-score')
  if (s2048 && parseInt(s2048, 10) > 0) {
    list.push({
      gameId: '2048',
      gameName: '2048',
      label: `最高分: ${s2048}`,
      color: '#edc22e',
      iconPath: 'M4 4h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 10h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zM4 16h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4z',
    })
  }

  // 貪吃蛇
  const sSnake = localStorage.getItem('snake_best_score')
  if (sSnake && parseInt(sSnake, 10) > 0) {
    list.push({
      gameId: 'snake',
      gameName: '貪吃蛇',
      label: `最高分: ${sSnake}`,
      color: '#22c55e',
      iconPath: 'M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4c-1.1 0-2 .9-2 2v3.8h1.5c1.38 0 2.5 1.12 2.5 2.5S4.88 15.8 3.5 15.8H2V19c0 1.1.9 2 2 2h3.8v-1.5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5V21H17c1.1 0 2-.9 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
    })
  }

  // 數獨
  const sSudoku = localStorage.getItem('sudoku-best-times')
  if (sSudoku) {
    try {
      const t = JSON.parse(sSudoku)
      const parts: string[] = []
      if (t.easy && t.easy > 0) parts.push(`簡單 ${formatTime(t.easy)}`)
      if (t.medium && t.medium > 0) parts.push(`中等 ${formatTime(t.medium)}`)
      if (t.hard && t.hard > 0) parts.push(`困難 ${formatTime(t.hard)}`)
      if (parts.length > 0) {
        list.push({
          gameId: 'sudoku',
          gameName: '數獨',
          label: parts.join(' / '),
          color: '#6366f1',
          iconPath: 'M5 4v2h14V4H5zm0 10h2v6H5v-6zm4 0h2v6H9v-6zm4 0h2v6h-2v-6zm4 0h2v6h-2v-6zM5 8h2v4H5V8zm4 0h2v4H9V8zm4 0h2v4h-2V8zm4 0h2v4h-2V8z',
        })
      }
    } catch { /* ignore */ }
  }

  // 俄羅斯方塊
  const sTetris = localStorage.getItem('tetris-high-scores')
  if (sTetris) {
    try {
      const scores = JSON.parse(sTetris)
      if (Array.isArray(scores) && scores.length > 0) {
        const best = scores[0]
        list.push({
          gameId: 'tetris',
          gameName: '俄羅斯方塊',
          label: `最高分: ${best.score}`,
          color: '#ec4899',
          iconPath: 'M4 2h4v4H4zm6 0h4v4h-4zM4 8h4v4H4zm6 0h4v4h-4zm6 0h4v4h-4zm-6 6h4v4h-4zm6 0h4v4h-4zm0 6h4v4h-4z',
        })
      }
    } catch { /* ignore */ }
  }

  return list
})

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
</script>

<style scoped lang="scss">
.picker-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.picker-modal {
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  h3 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    text-align: center;
  }
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: #9ca3af;
  font-size: 14px;
  p { margin: 0; }
}

.record-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.record-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid #f0f0f0;

  &:active {
    background: #f3f4f6;
    transform: scale(0.98);
  }
}

.rec-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 22px;
    height: 22px;
    color: white;
  }
}

.rec-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rec-name {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.rec-score {
  font-size: 13px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.btn-cancel {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    background: #e5e7eb;
    transform: scale(0.98);
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
