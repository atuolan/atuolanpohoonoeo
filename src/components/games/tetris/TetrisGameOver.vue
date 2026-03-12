<template>
  <div class="game-over-content" @click.self="$emit('close')">
    <div class="game-over-modal">
      <div class="game-over-title">
        <Skull :size="36" />
        <h2 class="title-text">游戏结束</h2>
      </div>

      <div class="final-score-section">
        <p class="score-label">最终分数</p>
        <h1 class="score-value">{{ score.toLocaleString() }}</h1>
        <div v-if="isNewRecord" class="new-record-badge">
          <Trophy :size="14" />
          新纪录！
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <ChevronsUp :size="20" />
          <div class="stat-label">等级</div>
          <div class="stat-value">{{ level }}</div>
        </div>
        <div class="stat-card">
          <AlignJustify :size="20" />
          <div class="stat-label">消行</div>
          <div class="stat-value">{{ lines }}</div>
        </div>
        <div class="stat-card">
          <Flame :size="20" />
          <div class="stat-label">最高连击</div>
          <div class="stat-value">{{ maxCombo }}</div>
        </div>
        <div class="stat-card">
          <Box :size="20" />
          <div class="stat-label">方块数</div>
          <div class="stat-value">{{ totalPieces }}</div>
        </div>
      </div>

      <div class="clear-stats-section">
        <h3>消行统计</h3>
        <div class="clear-bars">
          <div class="clear-bar">
            <span class="clear-label">Single</span>
            <div class="bar-container">
              <div class="bar-fill" :style="{ width: getBarWidth(clears.single) }"></div>
            </div>
            <span class="clear-count">{{ clears.single }}</span>
          </div>
          <div class="clear-bar">
            <span class="clear-label">Double</span>
            <div class="bar-container">
              <div class="bar-fill" :style="{ width: getBarWidth(clears.double) }"></div>
            </div>
            <span class="clear-count">{{ clears.double }}</span>
          </div>
          <div class="clear-bar">
            <span class="clear-label">Triple</span>
            <div class="bar-container">
              <div class="bar-fill triple" :style="{ width: getBarWidth(clears.triple) }"></div>
            </div>
            <span class="clear-count">{{ clears.triple }}</span>
          </div>
          <div class="clear-bar">
            <span class="clear-label">Tetris</span>
            <div class="bar-container">
              <div class="bar-fill tetris" :style="{ width: getBarWidth(clears.tetris) }"></div>
            </div>
            <span class="clear-count">{{ clears.tetris }}</span>
          </div>
        </div>
      </div>

      <div class="action-buttons">
        <button class="btn-share" @click="$emit('share')">
          <Share2 :size="16" />
          分享成績
        </button>
      </div>
      <div class="action-buttons">
        <button class="btn-primary" @click="$emit('restart')">
          <RotateCcw :size="16" />
          重新开始
        </button>
        <button class="btn-secondary" @click="$emit('close')">
          <X :size="16" />
          退出
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AlignJustify, Box, ChevronsUp, Flame, RotateCcw, Share2, Skull, Trophy, X } from 'lucide-vue-next'

interface Props {
  score: number
  level: number
  lines: number
  maxCombo: number
  totalPieces: number
  clears: { single: number; double: number; triple: number; tetris: number }
  isNewRecord?: boolean
}

const props = defineProps<Props>()
defineEmits(['restart', 'close', 'share'])

function getBarWidth(count: number): string {
  const maxCount = Math.max(props.clears.single, props.clears.double, props.clears.triple, props.clears.tetris)
  if (maxCount === 0) return '0%'
  return `${(count / maxCount) * 100}%`
}
</script>

<style scoped lang="scss">
.game-over-content {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 12px;
  border-radius: 20px;
  z-index: 50;
}

.game-over-modal {
  background: white;
  border-radius: 16px;
  padding: 16px;
  max-width: 400px;
  width: 100%;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  animation: slideUp 0.2s ease-out;
}

.game-over-title {
  text-align: center;
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  svg { color: #ef4444; }
  .title-text { font-size: 28px; font-weight: bold; color: #1f2937; margin: 0; }
}

.final-score-section {
  text-align: center;
  margin-bottom: 12px;
  padding: 12px;
  background: var(--theme-gradient, #f9fafb);
  border-radius: 10px;
  .score-label { margin: 0 0 6px 0; font-size: 14px; color: #6b7280; }
  .score-value { margin: 0; font-size: 42px; font-weight: bold; color: var(--theme-primary, #10b981); }
  .new-record-badge {
    margin-top: 8px;
    padding: 4px 10px;
    background: var(--theme-primary, #10b981);
    border-radius: 16px;
    color: white;
    font-weight: bold;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 12px;
  .stat-card {
    background: #f9fafb;
    border-radius: 10px;
    padding: 10px;
    text-align: center;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    svg { color: var(--theme-primary, #10b981); }
    .stat-label { font-size: 13px; color: #6b7280; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1f2937; }
  }
}

.clear-stats-section {
  margin-bottom: 12px;
  h3 { font-size: 16px; margin: 0 0 8px 0; color: #1f2937; font-weight: 600; }
  .clear-bars {
    display: flex;
    flex-direction: column;
    gap: 6px;
    .clear-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      .clear-label { width: 50px; font-size: 13px; color: #6b7280; }
      .bar-container {
        flex: 1;
        height: 16px;
        background: #f3f4f6;
        border-radius: 8px;
        overflow: hidden;
        .bar-fill {
          height: 100%;
          background: var(--theme-primary, #10b981);
          border-radius: 8px;
          transition: width 0.2s ease-out;
          &.triple { opacity: 0.8; }
        }
      }
      .clear-count { width: 32px; text-align: right; font-weight: 600; color: #1f2937; font-size: 14px; }
    }
  }
}

.action-buttons {
  display: flex;
  gap: 8px;
  button {
    flex: 1;
    padding: 10px 16px;
    border: none;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    transition: opacity 0.2s;
    &:active { opacity: 0.8; }
  }
  .btn-share { background: #3b82f6; color: white; width: 100%; }
  .btn-primary { background: var(--theme-primary, #10b981); color: white; }
  .btn-secondary { background: #f3f4f6; color: #6b7280; }
}

@keyframes slideUp {
  from { transform: translateY(20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
</style>
