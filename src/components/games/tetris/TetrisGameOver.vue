<template>
  <div class="game-over" @click.self="$emit('close')">
    <div class="card">
      <h2 class="title">遊戲結束</h2>

      <div class="score-block">
        <p class="score-label">最終分數</p>
        <p class="score-value">{{ score.toLocaleString() }}</p>
        <div v-if="isNewRecord" class="record-badge">
          <Trophy :size="12" />
          新紀錄！
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat">
          <span class="stat-label">等級</span>
          <span class="stat-value">{{ level }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">消除行數</span>
          <span class="stat-value">{{ lines }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">最高連擊</span>
          <span class="stat-value">{{ maxCombo }}</span>
        </div>
        <div class="stat">
          <span class="stat-label">方塊數</span>
          <span class="stat-value">{{ totalPieces }}</span>
        </div>
      </div>

      <div class="clear-stats">
        <h3>消行統計</h3>
        <div class="clear-bar">
          <span class="clear-label">單行</span>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: getBarWidth(clears.single) }"></div>
          </div>
          <span class="clear-count">{{ clears.single }}</span>
        </div>
        <div class="clear-bar">
          <span class="clear-label">雙行</span>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: getBarWidth(clears.double) }"></div>
          </div>
          <span class="clear-count">{{ clears.double }}</span>
        </div>
        <div class="clear-bar">
          <span class="clear-label">三行</span>
          <div class="bar-track">
            <div class="bar-fill" :style="{ width: getBarWidth(clears.triple) }"></div>
          </div>
          <span class="clear-count">{{ clears.triple }}</span>
        </div>
        <div class="clear-bar">
          <span class="clear-label">四行</span>
          <div class="bar-track">
            <div class="bar-fill tetris" :style="{ width: getBarWidth(clears.tetris) }"></div>
          </div>
          <span class="clear-count">{{ clears.tetris }}</span>
        </div>
      </div>

      <button class="btn-share" @click="$emit('share')">分享成績</button>
      <div class="actions">
        <button class="btn-restart" @click="$emit('restart')">再來一局</button>
        <button class="btn-close" @click="$emit('close')">返回</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Trophy } from 'lucide-vue-next'

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
@use "@/components/games/gameShell" as gs;

.game-over {
  @include gs.vars;
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-radius: 22px;
  background: rgba(18, 18, 20, 0.42);
  z-index: 50;
}

.card {
  width: 100%;
  max-width: 360px;
  max-height: 85vh;
  overflow-y: auto;
  box-sizing: border-box;
  background: var(--g-surface);
  border-radius: 22px;
  padding: 24px 20px;
  color: var(--g-text);
  animation: slideUp 0.2s ease-out;
}

.title {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  color: var(--g-text);
}

.score-block {
  text-align: center;
  margin-bottom: 16px;

  .score-label {
    margin: 0;
    font-size: 12px;
    color: var(--g-text-2);
  }

  .score-value {
    margin: 2px 0 0;
    font-family: var(--g-num);
    font-size: 40px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
    color: var(--g-text);
  }

  .record-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 10px;
    margin-top: 8px;
    border-radius: 12px;
    background: #fff3da;
    color: #8a5a00;
    font-size: 12px;
    font-weight: 700;
  }
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-bottom: 16px;

  @media (max-width: 360px) {
    grid-template-columns: repeat(2, 1fr);
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 10px 6px;
    background: var(--g-muted);
    border-radius: 14px;
    min-width: 0;
  }

  .stat-label {
    font-size: 11px;
    color: var(--g-text-2);
    white-space: nowrap;
  }

  .stat-value {
    font-family: var(--g-num);
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
    color: var(--g-text);
  }
}

.clear-stats {
  margin-bottom: 18px;

  h3 {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--g-text-2);
  }

  .clear-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  .clear-label {
    width: 34px;
    flex-shrink: 0;
    font-size: 11px;
    color: var(--g-text-2);
  }

  .bar-track {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: var(--g-muted);
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 3px;
    background: var(--g-text);
    transition: width 0.2s ease-out;

    &.tetris {
      background: #5b52b5;
    }
  }

  .clear-count {
    width: 24px;
    flex-shrink: 0;
    text-align: right;
    font-family: var(--g-num);
    font-size: 12px;
    font-weight: 700;
    color: var(--g-text);
  }
}

.btn-share {
  @include gs.pill-outline(44px);
  width: 100%;
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;

  .btn-restart {
    @include gs.pill-dark(44px);
    flex: 1;
  }

  .btn-close {
    padding: 0 12px;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 13px;
    color: var(--g-text-2);
    cursor: pointer;
    white-space: nowrap;

    &:active {
      opacity: 0.6;
    }
  }
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>
