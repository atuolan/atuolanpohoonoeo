<template>
  <div class="tetris-high-scores">
    <div class="high-scores-content">
      <div class="header">
        <h2>高分榜</h2>
        <button class="close-btn" @click="$emit('close')">
          <X :size="20" />
        </button>
      </div>

      <div class="filters">
        <button
          v-for="diff in difficultyOptions"
          :key="diff.value"
          class="filter-btn"
          :class="{ active: filterDifficulty === diff.value }"
          @click="filterDifficulty = diff.value"
        >
          {{ diff.label }}
        </button>
      </div>

      <div v-if="filteredScores.length > 0" class="scores-list">
        <div v-for="(score, index) in filteredScores" :key="score.id" class="score-item" :class="getRankClass(index)">
          <div class="rank">
            <span v-if="index < 3" class="rank-medal">
              <Medal :size="36" />
            </span>
            <span v-else class="rank-number">{{ index + 1 }}</span>
          </div>
          <div class="score-info">
            <div class="score-main">
              <span class="score-value">{{ score.score.toLocaleString() }}</span>
              <span class="difficulty-badge" :class="`difficulty-${score.difficulty}`">
                {{ score.difficultyLabel }}
              </span>
            </div>
            <div class="score-details">
              <span class="detail-item"><Layers :size="16" /> 等级 {{ score.level }}</span>
              <span class="detail-item"><TrendingUp :size="16" /> {{ score.lines }} 行</span>
              <span class="detail-item"><Flame :size="16" /> 连击 {{ score.maxCombo }}</span>
              <span class="detail-item"><Clock :size="16" /> {{ formatPlayTime(score.playTime) }}</span>
            </div>
            <div class="score-date">{{ formatTimestamp(score.timestamp) }}</div>
          </div>
          <button class="delete-btn" @click="handleDelete(score.id)">
            <Trash2 :size="20" />
          </button>
        </div>
      </div>

      <div v-else class="empty-state">
        <Trophy :size="80" />
        <p>暂无高分记录</p>
        <p class="empty-hint">{{ emptyHint }}</p>
      </div>

      <div class="actions">
        <button v-if="filteredScores.length > 0" class="clear-btn" @click="handleClearAll">
          <Trash2 :size="20" />
          清空记录
        </button>
        <button class="back-btn" @click="$emit('close')">
          <ArrowLeft :size="20" />
          返回
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeft, Clock, Flame, Layers, Medal, Trash2, TrendingUp, Trophy, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { clearHighScores, deleteHighScore, formatPlayTime, formatTimestamp, getHighScores } from './tetrisSaveManager'
import type { HighScore } from './tetrisSaveManager'
import type { DifficultyLevel } from './tetrisTypes'

defineEmits<{ close: [] }>()

const scores = ref<HighScore[]>(getHighScores())
const filterDifficulty = ref<DifficultyLevel | 'all'>('all')

const difficultyOptions = [
  { value: 'all' as const, label: '全部' },
  { value: 'easy' as const, label: '简单' },
  { value: 'normal' as const, label: '正常' },
  { value: 'hard' as const, label: '困难' },
  { value: 'expert' as const, label: '专家' },
]

const filteredScores = computed(() => {
  if (filterDifficulty.value === 'all') return scores.value
  return scores.value.filter(s => s.difficulty === filterDifficulty.value)
})

const emptyHint = computed(() => {
  if (filterDifficulty.value === 'all') return '开始游戏创建你的第一个记录吧！'
  const label = difficultyOptions.find(d => d.value === filterDifficulty.value)?.label
  return `暂无${label}难度的记录`
})

const getRankClass = (index: number): string => {
  if (index === 0) return 'rank-1'
  if (index === 1) return 'rank-2'
  if (index === 2) return 'rank-3'
  return ''
}

const handleDelete = (id: string) => {
  if (confirm('确定要删除这条记录吗？')) {
    if (deleteHighScore(id)) scores.value = getHighScores()
  }
}

const handleClearAll = () => {
  if (confirm('确定要清空所有高分记录吗？此操作无法撤销！')) {
    if (clearHighScores()) scores.value = []
  }
}
</script>

<style scoped lang="scss">
.tetris-high-scores {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 200;
}

.high-scores-content {
  background: white;
  border-radius: 20px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 2px solid #f3f4f6;
  h2 { margin: 0; font-size: 24px; color: #1f2937; }
  .close-btn {
    width: 36px; height: 36px; border: none; background: #f3f4f6; border-radius: 50%;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    svg { color: #6b7280; }
    &:active { transform: scale(0.95); }
  }
}

.filters {
  display: flex; gap: 8px; padding: 16px 24px; border-bottom: 1px solid #f3f4f6; overflow-x: auto;
  .filter-btn {
    padding: 8px 16px; border: 2px solid #e5e7eb; background: white; border-radius: 12px;
    font-size: 14px; font-weight: 600; color: #6b7280; cursor: pointer; white-space: nowrap;
    &.active { background: var(--theme-primary, #10b981); border-color: var(--theme-primary, #10b981); color: white; }
  }
}

.scores-list {
  flex: 1; overflow-y: auto; padding: 16px 24px; display: flex; flex-direction: column; gap: 12px;
}

.score-item {
  display: flex; align-items: center; gap: 16px; padding: 16px; background: #f9fafb;
  border-radius: 12px; border: 2px solid transparent;
  &.rank-1 { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-color: #f59e0b; }
  &.rank-2 { background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%); border-color: #9ca3af; }
  &.rank-3 { background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); border-color: #f97316; }
  .rank {
    flex-shrink: 0; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;
    .rank-number { font-size: 24px; font-weight: 900; color: #6b7280; }
  }
  .score-info {
    flex: 1; min-width: 0;
    .score-main {
      display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
      .score-value { font-size: 24px; font-weight: 900; color: #1f2937; }
      .difficulty-badge {
        padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; color: white;
        &.difficulty-easy { background: #10b981; }
        &.difficulty-normal { background: #3b82f6; }
        &.difficulty-hard { background: #f59e0b; }
        &.difficulty-expert { background: #ef4444; }
      }
    }
    .score-details {
      display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 4px;
      .detail-item {
        display: flex; align-items: center; gap: 4px; font-size: 13px; color: #6b7280;
        svg { color: var(--theme-primary, #10b981); }
      }
    }
    .score-date { font-size: 12px; color: #9ca3af; }
  }
  .delete-btn {
    flex-shrink: 0; width: 36px; height: 36px; border: none; background: #fee2e2; border-radius: 8px;
    cursor: pointer; display: flex; align-items: center; justify-content: center; opacity: 0;
    svg { color: #ef4444; }
    &:active { transform: scale(0.95); }
  }
  &:hover .delete-btn { opacity: 1; }
}

.rank-1 .rank-medal svg { color: #f59e0b; }
.rank-2 .rank-medal svg { color: #9ca3af; }
.rank-3 .rank-medal svg { color: #f97316; }

.empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 24px; color: #9ca3af;
  svg { opacity: 0.5; margin-bottom: 16px; }
  p { margin: 8px 0; font-size: 16px; &.empty-hint { font-size: 14px; color: #d1d5db; } }
}

.actions {
  display: flex; gap: 12px; padding: 24px; border-top: 2px solid #f3f4f6;
  button {
    flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
    padding: 12px 24px; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer;
    &:active { transform: scale(0.98); }
  }
  .clear-btn { background: #fee2e2; color: #dc2626; }
  .back-btn { background: #f3f4f6; color: #374151; }
}
</style>
