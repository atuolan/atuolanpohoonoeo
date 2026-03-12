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
    :class="{ 'has-custom-bg': hasCustomBackground }"
    :style="containerStyle"
  >
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
