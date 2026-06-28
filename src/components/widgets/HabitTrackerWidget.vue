<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, Flame, Droplets, Book, Dumbbell, Moon } from 'lucide-vue-next'
import type { WidgetCustomStyle } from '@/types'

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle
  }
}>()

// 習慣列表
const habits = ref([
  { id: 1, name: '喝水', icon: Droplets, color: '#3b82f6', completed: false },
  { id: 2, name: '運動', icon: Dumbbell, color: '#ef4444', completed: true },
  { id: 3, name: '閱讀', icon: Book, color: '#8b5cf6', completed: false },
  { id: 4, name: '早睡', icon: Moon, color: '#6366f1', completed: false },
])

const streak = ref(7) // 連續天數

const completedCount = computed(() => habits.value.filter(h => h.completed).length)
const progress = computed(() => (completedCount.value / habits.value.length) * 100)

function toggleHabit(id: number) {
  const habit = habits.value.find(h => h.id === id)
  if (habit) {
    habit.completed = !habit.completed
  }
}

// 當前佈局：list（預設清單）/ ring（圓環）/ heatmap（方格熱力圖）/ streak（連續天數火焰）
const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || 'list'
})

// 圓環幾何
const RING_RADIUS = 42
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const ringDashOffset = computed(
  () => RING_CIRCUMFERENCE * (1 - progress.value / 100),
)

// 熱力圖資料：5 週 x 7 天，依連續天數回填活躍格子，並用確定性偽隨機產生強度
const HEATMAP_WEEKS = 5
const HEATMAP_DAYS = HEATMAP_WEEKS * 7
const heatmapCells = computed(() => {
  const cells: { level: number }[] = []
  const activeFrom = HEATMAP_DAYS - streak.value
  for (let i = 0; i < HEATMAP_DAYS; i++) {
    if (i >= activeFrom) {
      // 連續區間：強度較高（2-4），用確定性公式產生變化
      cells.push({ level: 2 + ((i * 7 + 3) % 3) })
    } else {
      // 連續區間之前：稀疏的歷史紀錄（0-2）
      const pseudo = (i * 13 + 5) % 5
      cells.push({ level: pseudo === 0 ? 1 : pseudo === 3 ? 2 : 0 })
    }
  }
  return cells
})
const heatmapActiveDays = computed(
  () => heatmapCells.value.filter(c => c.level > 0).length,
)

// 自定義樣式
const containerStyle = computed(() => {
  const style = props.data?.customStyle
  if (!style) return {}

  const result: Record<string, string> = {}
  if (style.backgroundGradient) {
    result.background = style.backgroundGradient
  } else if (style.backgroundColor) {
    result.backgroundColor = style.backgroundColor
  }
  if (style.borderColor) {
    result.borderColor = style.borderColor
    result.borderWidth = `${style.borderWidth || 2}px`
    result.borderStyle = 'solid'
  }
  return result
})

const hasCustomBackground = computed(() => {
  const style = props.data?.customStyle
  return !!(style?.backgroundColor || style?.backgroundGradient)
})
</script>

<template>
  <div
    class="habit-tracker"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <!-- 清單模式（預設） -->
    <template v-if="currentLayout === 'list'">
      <!-- 標題和連勝 -->
      <div class="header">
        <span class="title">今日習慣</span>
        <div class="streak">
          <Flame :size="14" />
          <span>{{ streak }}天</span>
        </div>
      </div>

      <!-- 進度條 -->
      <div class="progress-section">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
        </div>
        <span class="progress-text">{{ completedCount }}/{{ habits.length }}</span>
      </div>

      <!-- 習慣列表 -->
      <div class="habits-list">
        <button
          v-for="habit in habits"
          :key="habit.id"
          class="habit-item"
          :class="{ completed: habit.completed }"
          @click="toggleHabit(habit.id)"
        >
          <div class="habit-icon" :style="{ backgroundColor: habit.color + '20', color: habit.color }">
            <component :is="habit.icon" :size="16" />
          </div>
          <span class="habit-name">{{ habit.name }}</span>
          <div class="check-circle" :class="{ checked: habit.completed }">
            <Check v-if="habit.completed" :size="12" />
          </div>
        </button>
      </div>
    </template>

    <!-- 圓環模式 -->
    <template v-else-if="currentLayout === 'ring'">
      <div class="ring-wrap">
        <svg class="ring-svg" viewBox="0 0 100 100">
          <circle
            class="ring-track"
            cx="50"
            cy="50"
            :r="RING_RADIUS"
            fill="none"
          />
          <circle
            class="ring-progress"
            cx="50"
            cy="50"
            :r="RING_RADIUS"
            fill="none"
            stroke-linecap="round"
            :stroke-dasharray="RING_CIRCUMFERENCE"
            :stroke-dashoffset="ringDashOffset"
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div class="ring-center">
          <span class="ring-count">{{ completedCount }}/{{ habits.length }}</span>
          <span class="ring-label">今日習慣</span>
        </div>
      </div>
      <div class="ring-dots">
        <button
          v-for="habit in habits"
          :key="habit.id"
          class="ring-dot"
          :class="{ done: habit.completed }"
          :style="{
            backgroundColor: habit.completed ? habit.color : habit.color + '20',
            color: habit.completed ? '#fff' : habit.color,
          }"
          @click="toggleHabit(habit.id)"
        >
          <component :is="habit.icon" :size="14" />
        </button>
      </div>
    </template>

    <!-- 方格熱力圖模式 -->
    <template v-else-if="currentLayout === 'heatmap'">
      <div class="header">
        <span class="title">習慣熱力圖</span>
        <div class="streak">
          <Flame :size="14" />
          <span>{{ streak }}天</span>
        </div>
      </div>
      <div class="heatmap-grid">
        <span
          v-for="(cell, idx) in heatmapCells"
          :key="idx"
          class="heatmap-cell"
          :class="`level-${cell.level}`"
        ></span>
      </div>
      <div class="heatmap-footer">
        <span>近 {{ HEATMAP_WEEKS }} 週 · {{ heatmapActiveDays }} 天有紀錄</span>
        <div class="heatmap-legend">
          <span class="legend-cell level-0"></span>
          <span class="legend-cell level-1"></span>
          <span class="legend-cell level-2"></span>
          <span class="legend-cell level-3"></span>
          <span class="legend-cell level-4"></span>
        </div>
      </div>
    </template>

    <!-- 連續天數火焰模式 -->
    <template v-else>
      <div class="streak-hero">
        <div class="flame-wrap">
          <Flame class="flame-icon" :size="56" />
        </div>
        <div class="streak-number">{{ streak }}</div>
        <div class="streak-caption">連續達成天數</div>
      </div>
      <div class="streak-dots">
        <button
          v-for="habit in habits"
          :key="habit.id"
          class="streak-dot"
          :class="{ done: habit.completed }"
          :style="{
            backgroundColor: habit.completed ? habit.color : 'transparent',
            borderColor: habit.color,
            color: habit.completed ? '#fff' : habit.color,
          }"
          @click="toggleHabit(habit.id)"
        >
          <component :is="habit.icon" :size="13" />
        </button>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.habit-tracker {
  width: 100%;
  height: 100%;
  background: white;
  border-radius: var(--radius-lg);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  container-type: size;
  overflow: hidden;

  &.has-custom-bg {
    box-shadow: none;
  }

  // 圓環 / 火焰模式置中
  &.ring,
  &.streak {
    justify-content: center;
    align-items: center;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;

  .title {
    font-size: 15px;
    font-weight: 700;
    color: #1f2937;
  }

  .streak {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
    color: #f97316;
    background: #fff7ed;
    padding: 4px 10px;
    border-radius: 12px;
    flex-shrink: 0;
  }
}

.progress-section {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;

  .progress-bar {
    flex: 1;
    height: 6px;
    background: #f3f4f6;
    border-radius: 3px;
    overflow: hidden;

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #22c55e, #84cc16);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
  }

  .progress-text {
    font-size: 12px;
    font-weight: 600;
    color: #6b7280;
    flex-shrink: 0;
  }
}

.habits-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.habit-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.2s;
  flex-shrink: 0;
  position: relative;

  &:hover {
    background: #f1f5f9;
  }

  &.completed {
    .habit-name {
      color: #9ca3af;
      text-decoration: line-through;
    }
  }

  .habit-icon {
    width: 32px;
    height: 32px;
    min-width: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .habit-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .check-circle {
    width: 22px;
    height: 22px;
    min-width: 22px;
    border-radius: 50%;
    border: 2px solid #d1d5db;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    flex-shrink: 0;

    &.checked {
      background: #22c55e;
      border-color: #22c55e;
      color: white;
    }
  }
}

// ===== 圓環模式 =====
.ring-wrap {
  position: relative;
  width: 100%;
  max-width: 130px;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  .ring-svg {
    width: 100%;
    height: 100%;
  }

  .ring-track {
    stroke: #f1f5f9;
    stroke-width: 8;
  }

  .ring-progress {
    stroke: url(#habitRingGradient);
    stroke: #22c55e;
    stroke-width: 8;
    transition: stroke-dashoffset 0.4s ease;
  }

  .ring-center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;

    .ring-count {
      font-size: 24px;
      font-weight: 800;
      color: #1f2937;
      line-height: 1;
    }

    .ring-label {
      font-size: 11px;
      font-weight: 600;
      color: #9ca3af;
    }
  }
}

.ring-dots {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
  flex-shrink: 0;

  .ring-dot {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.1);
    }

    &.done {
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }
  }
}

// ===== 方格熱力圖模式 =====
.heatmap-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 4px;
  min-height: 0;

  .heatmap-cell {
    border-radius: 3px;
    aspect-ratio: 1;
    background: #f1f5f9;
    transition: background 0.2s;

    &.level-0 { background: #f1f5f9; }
    &.level-1 { background: #bbf7d0; }
    &.level-2 { background: #4ade80; }
    &.level-3 { background: #22c55e; }
    &.level-4 { background: #15803d; }
  }
}

.heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;

  .heatmap-legend {
    display: flex;
    gap: 3px;

    .legend-cell {
      width: 10px;
      height: 10px;
      border-radius: 2px;

      &.level-0 { background: #f1f5f9; }
      &.level-1 { background: #bbf7d0; }
      &.level-2 { background: #4ade80; }
      &.level-3 { background: #22c55e; }
      &.level-4 { background: #15803d; }
    }
  }
}

// ===== 連續天數火焰模式 =====
.streak-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  .flame-wrap {
    display: flex;
    align-items: center;
    justify-content: center;

    .flame-icon {
      color: #f97316;
      fill: #fb923c;
      filter: drop-shadow(0 4px 12px rgba(249, 115, 22, 0.4));
      animation: flame-flicker 1.8s ease-in-out infinite;
    }
  }

  .streak-number {
    font-size: 48px;
    font-weight: 900;
    line-height: 1;
    background: linear-gradient(135deg, #f97316, #ef4444);
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .streak-caption {
    font-size: 12px;
    font-weight: 600;
    color: #9ca3af;
  }
}

.streak-dots {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  flex-shrink: 0;

  .streak-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;

    &:hover {
      transform: scale(1.1);
    }
  }
}

@keyframes flame-flicker {
  0%, 100% { transform: scale(1) rotate(-1deg); }
  50% { transform: scale(1.08) rotate(1deg); }
}

// 小尺寸響應式調整
@container (max-height: 200px) {
  .habit-tracker {
    padding: 10px;
    gap: 8px;
  }

  .header {
    .title {
      font-size: 13px;
    }

    .streak {
      padding: 3px 8px;
      font-size: 10px;

      svg {
        width: 12px;
        height: 12px;
      }
    }
  }

  .progress-section {
    gap: 8px;

    .progress-bar {
      height: 4px;
    }

    .progress-text {
      font-size: 10px;
    }
  }

  .habits-list {
    gap: 4px;
  }

  .habit-item {
    padding: 6px 8px;
    gap: 6px;
    border-radius: 8px;

    .habit-icon {
      width: 24px;
      height: 24px;
      min-width: 24px;
      border-radius: 6px;

      svg {
        width: 12px;
        height: 12px;
      }
    }

    .habit-name {
      font-size: 11px;
    }

    .check-circle {
      width: 18px;
      height: 18px;
      min-width: 18px;

      svg {
        width: 10px;
        height: 10px;
      }
    }
  }

  .ring-wrap {
    max-width: 96px;

    .ring-center .ring-count {
      font-size: 18px;
    }
  }

  .streak-hero {
    .flame-icon {
      width: 40px;
      height: 40px;
    }

    .streak-number {
      font-size: 36px;
    }
  }
}

@container (max-width: 150px) {
  .header {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;

    .title {
      font-size: 12px;
    }

    .streak {
      padding: 2px 6px;
      font-size: 9px;
    }
  }

  .habit-item {
    .habit-icon {
      width: 20px;
      height: 20px;
      min-width: 20px;

      svg {
        width: 10px;
        height: 10px;
      }
    }

    .habit-name {
      font-size: 10px;
    }

    .check-circle {
      width: 16px;
      height: 16px;
      min-width: 16px;
    }
  }
}

// 極小尺寸：隱藏進度條
@container (max-height: 150px) {
  .progress-section {
    display: none;
  }

  .habits-list {
    gap: 2px;
  }

  .habit-item {
    padding: 4px 6px;
  }

  .heatmap-footer {
    display: none;
  }
}

// 超小尺寸：只顯示圖標和勾選
@container (max-height: 100px) {
  .header {
    .title {
      font-size: 11px;
    }

    .streak {
      display: none;
    }
  }

  .habits-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: center;
  }

  .habit-item {
    padding: 4px;
    width: auto;

    .habit-name {
      display: none;
    }

    .habit-icon {
      width: 24px;
      height: 24px;
      min-width: 24px;
    }

    .check-circle {
      position: absolute;
      bottom: -2px;
      right: -2px;
      width: 12px;
      height: 12px;
      min-width: 12px;
      border-width: 1px;
    }
  }
}
</style>
