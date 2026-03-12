<template>
  <div class="tetris-stats">
    <h3 class="stats-title">
      <BarChart3 :size="18" />
      统计数据
    </h3>

    <!-- 主要统计 -->
    <div class="stats-main">
      <div class="stat-item">
        <span class="stat-label">分数</span>
        <span class="stat-value highlight">{{ score.toLocaleString() }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">等级</span>
        <span class="stat-value">{{ level }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">消行</span>
        <span class="stat-value">{{ lines }}</span>
      </div>
    </div>

    <!-- Combo 显示 -->
    <div v-if="combo > 0" class="combo-display" :class="{ 'combo-high': combo >= 5 }">
      <Flame :size="18" />
      <span class="combo-label">COMBO</span>
      <span class="combo-value">{{ combo }}</span>
      <span v-if="combo > 1" class="combo-bonus">+{{ (combo - 1) * 50 }} 分</span>
    </div>

    <!-- Back-to-Back 显示 -->
    <div v-if="isBackToBack" class="b2b-display">
      <Zap :size="18" />
      <span class="b2b-label">Back-to-Back</span>
      <span class="b2b-count">×{{ backToBackCount }}</span>
      <span class="b2b-bonus">+50%</span>
    </div>

    <!-- 详细统计 -->
    <div class="stats-detail">
      <div class="detail-item">
        <span class="detail-label">最高连击</span>
        <span class="detail-value">{{ maxCombo }}</span>
      </div>
      <div class="detail-item">
        <span class="detail-label">已放方块</span>
        <span class="detail-value">{{ statistics.totalPieces }}</span>
      </div>
    </div>

    <!-- 消行类型统计 -->
    <div class="clear-stats">
      <h4 class="clear-title">消行统计</h4>
      <div class="clear-grid">
        <div class="clear-item">
          <span class="clear-type">Single</span>
          <span class="clear-count">{{ statistics.clears.single }}</span>
        </div>
        <div class="clear-item">
          <span class="clear-type">Double</span>
          <span class="clear-count">{{ statistics.clears.double }}</span>
        </div>
        <div class="clear-item">
          <span class="clear-type">Triple</span>
          <span class="clear-count">{{ statistics.clears.triple }}</span>
        </div>
        <div class="clear-item tetris">
          <span class="clear-type">Tetris</span>
          <span class="clear-count">{{ statistics.clears.tetris }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { BarChart3, Flame, Zap } from 'lucide-vue-next'
import type { TetrisStatistics } from './tetrisTypes'

interface Props {
  score: number
  level: number
  lines: number
  combo: number
  maxCombo: number
  isBackToBack: boolean
  backToBackCount: number
  statistics: TetrisStatistics
}

defineProps<Props>()
</script>

<style scoped lang="scss">
.tetris-stats {
  background: white;
  border-radius: 12px;
  padding: 16px;
  border: 1px solid #e5e7eb;
  min-width: 200px;
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.stats-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
  text-align: center;
  color: #1f2937;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  svg { color: var(--theme-primary, #10b981); }
}

.stats-main {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
  .stat-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: #f9fafb;
    border-radius: 8px;
    border-left: 3px solid var(--theme-primary, #10b981);
    .stat-label { font-size: 13px; color: #6b7280; }
    .stat-value {
      font-size: 18px; font-weight: 600; color: #1f2937;
      &.highlight { color: var(--theme-primary, #10b981); }
    }
  }
}

.combo-display {
  background: #fef3c7;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  &.combo-high { background: #fee2e2; border-color: #ef4444; }
  svg { color: #f59e0b; }
  .combo-label { font-size: 13px; font-weight: 600; color: #92400e; }
  .combo-value { font-size: 20px; font-weight: bold; color: #f59e0b; }
  .combo-bonus { font-size: 12px; color: #6b7280; margin-left: auto; }
}

.b2b-display {
  background: #dbeafe;
  border: 1px solid #3b82f6;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  svg { color: #3b82f6; }
  .b2b-label { font-size: 13px; font-weight: 600; color: #1e40af; }
  .b2b-count { font-size: 18px; font-weight: bold; color: #3b82f6; }
  .b2b-bonus { font-size: 12px; color: #6b7280; margin-left: auto; }
}

.stats-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
  .detail-item {
    display: flex;
    justify-content: space-between;
    padding: 4px 8px;
    font-size: 12px;
    .detail-label { color: #9ca3af; }
    .detail-value { color: #1f2937; font-weight: 600; }
  }
}

.clear-stats {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
  .clear-title { font-size: 14px; margin: 0 0 10px 0; color: #6b7280; font-weight: 600; }
  .clear-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    .clear-item {
      background: #f9fafb;
      border-radius: 8px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      border: 1px solid #e5e7eb;
      &.tetris {
        background: var(--theme-gradient, #f0fdf4);
        border-color: var(--theme-primary, #10b981);
        .clear-type, .clear-count { color: var(--theme-primary, #10b981); }
      }
      .clear-type { font-size: 11px; color: #6b7280; }
      .clear-count { font-size: 16px; font-weight: 600; color: #1f2937; }
    }
  }
}
</style>
