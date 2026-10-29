<template>
  <div class="tetris-high-scores">
    <header class="topbar">
      <button class="back-btn" aria-label="返回" @click="$emit('close')">
        <ChevronLeft />
      </button>
      <h1 class="page-title">排行榜</h1>
      <span class="topbar-spacer" aria-hidden="true" />
    </header>

    <div class="filters">
      <button
        v-for="diff in difficultyOptions"
        :key="diff.value"
        type="button"
        class="filter-btn"
        :class="{ active: filterDifficulty === diff.value }"
        @click="filterDifficulty = diff.value"
      >
        {{ diff.label }}
      </button>
    </div>

    <div v-if="filteredScores.length > 0" class="scores-list">
      <div
        v-for="(score, index) in filteredScores"
        :key="score.id"
        class="score-item"
        :class="getRankClass(index)"
      >
        <div class="rank">
          <span class="rank-number">{{ index + 1 }}</span>
        </div>
        <div class="score-info">
          <div class="score-main">
            <span class="score-value">{{ score.score.toLocaleString() }}</span>
            <span class="difficulty-badge">{{ score.difficultyLabel }}</span>
          </div>
          <div class="score-details">
            <span class="detail-item"><Layers :size="16" /> 等級 {{ score.level }}</span>
            <span class="detail-item"><TrendingUp :size="16" /> {{ score.lines }} 行</span>
            <span class="detail-item"><Flame :size="16" /> 連擊 {{ score.maxCombo }}</span>
            <span class="detail-item"><Clock :size="16" /> {{ formatPlayTime(score.playTime) }}</span>
          </div>
          <div class="score-date">{{ formatTimestamp(score.timestamp) }}</div>
        </div>
        <button class="delete-btn" aria-label="刪除紀錄" @click="handleDelete(score.id)">
          <Trash2 :size="18" />
        </button>
      </div>
    </div>

    <div v-else class="empty-state">
      <Trophy :size="64" />
      <p>暫無排行榜紀錄</p>
      <p class="empty-hint">{{ emptyHint }}</p>
    </div>

    <div v-if="filteredScores.length > 0" class="actions">
      <button class="clear-btn" @click="handleClearAll">
        <Trash2 :size="16" />
        清空紀錄
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, Clock, Flame, Layers, Trash2, TrendingUp, Trophy } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { clearHighScores, deleteHighScore, formatPlayTime, formatTimestamp, getHighScores } from './tetrisSaveManager'
import type { HighScore } from './tetrisSaveManager'
import type { DifficultyLevel } from './tetrisTypes'

defineEmits<{ close: [] }>()

const scores = ref<HighScore[]>(getHighScores())
const filterDifficulty = ref<DifficultyLevel | 'all'>('all')

const difficultyOptions = [
  { value: 'all' as const, label: '全部' },
  { value: 'easy' as const, label: '簡單' },
  { value: 'normal' as const, label: '正常' },
  { value: 'hard' as const, label: '困難' },
  { value: 'expert' as const, label: '專家' },
]

const filteredScores = computed(() => {
  if (filterDifficulty.value === 'all') return scores.value
  return scores.value.filter(s => s.difficulty === filterDifficulty.value)
})

const emptyHint = computed(() => {
  if (filterDifficulty.value === 'all') return '開始遊戲，建立你的第一筆紀錄吧！'
  const label = difficultyOptions.find(d => d.value === filterDifficulty.value)?.label
  return `暫無${label}難度的紀錄`
})

const getRankClass = (index: number): string => {
  if (index === 0) return 'rank-1'
  if (index === 1) return 'rank-2'
  if (index === 2) return 'rank-3'
  return ''
}

const handleDelete = (id: string) => {
  if (confirm('確定要刪除這筆紀錄嗎？')) {
    if (deleteHighScore(id)) scores.value = getHighScores()
  }
}

const handleClearAll = () => {
  if (confirm('確定要清空所有排行榜紀錄嗎？此操作無法復原！')) {
    if (clearHighScores()) scores.value = []
  }
}
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.tetris-high-scores {
  @include gs.screen;
  z-index: 200;
}

.topbar {
  @include gs.topbar;
}

.back-btn {
  @include gs.round-btn;
}

.topbar-spacer {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.page-title {
  @include gs.title;
}

.filters {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  flex-shrink: 0;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-btn {
  @include gs.pill-outline;
  font-weight: 600;
  color: var(--g-text-2);

  &.active {
    border-color: transparent;
    background: var(--g-text);
    color: var(--g-surface);
  }
}

.scores-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

.score-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--g-surface);
  box-sizing: border-box;
  outline: 1px solid transparent;
  transition: outline-color 0.15s;

  &.rank-1 {
    outline-color: #8a5a00;
  }
}

.rank {
  flex-shrink: 0;
  width: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rank-number {
  font-family: var(--g-num);
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--g-text-2);
}

.rank-1 .rank-number {
  color: #8a5a00;
}

.score-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.score-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.score-value {
  font-family: var(--g-num);
  font-size: 22px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  color: var(--g-text);
}

.difficulty-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 9px;
  border-radius: 11px;
  background: var(--g-muted);
  color: var(--g-text-2);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}

.score-details {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}

.detail-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--g-text-2);

  svg {
    width: 14px;
    height: 14px;
    color: var(--g-text-2);
    opacity: 0.8;
  }
}

.score-date {
  font-family: var(--g-num);
  font-size: 11px;
  color: var(--g-text-2);
  opacity: 0.7;
}

.delete-btn {
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  padding: 0;
  border: none;
  border-radius: 17px;
  background: var(--g-muted);
  color: var(--g-text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.15s;

  svg {
    width: 16px;
    height: 16px;
  }

  &:active {
    transform: scale(0.94);
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-align: center;
  padding: 24px;

  svg {
    color: var(--g-text-2);
    opacity: 0.35;
    margin-bottom: 4px;
  }

  p {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--g-text-2);
  }

  .empty-hint {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.8;
  }
}

.actions {
  flex-shrink: 0;
  display: flex;
  padding-bottom: max(4px, env(safe-area-inset-bottom));
}

.clear-btn {
  @include gs.pill-outline(44px);
  width: 100%;
  color: var(--g-text-2);
  font-weight: 600;
}
</style>
