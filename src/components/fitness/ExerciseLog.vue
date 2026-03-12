<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Calendar, Dumbbell, Clock, Trash2, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useFitnessStore } from '@/stores/fitness'
import { allPresetExercises } from '@/data/exercises'
import type { WorkoutLog, Exercise, ExerciseType, WorkoutMood } from '@/types/fitness'
import dayjs from 'dayjs'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const fitnessStore = useFitnessStore()

// 當前選擇的日期
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))

// 是否顯示新增表單
const showAddForm = ref(false)

// 新增表單資料
const newExercise = ref({
  name: '',
  type: 'strength' as ExerciseType,
  sets: 3,
  reps: 10,
  weight: 0,
  duration: 0,
})

// 當日訓練記錄
const todayLog = computed(() => {
  return fitnessStore.workoutLogs.find(log => log.date === selectedDate.value)
})

// 當日運動列表
const exercises = computed(() => todayLog.value?.exercises || [])

// 切換日期
function changeDate(delta: number) {
  selectedDate.value = dayjs(selectedDate.value).add(delta, 'day').format('YYYY-MM-DD')
}

// 格式化日期顯示
const displayDate = computed(() => {
  const date = dayjs(selectedDate.value)
  const today = dayjs()
  
  if (date.isSame(today, 'day')) return '今天'
  if (date.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  if (date.isSame(today.add(1, 'day'), 'day')) return '明天'
  
  return date.format('M月D日 ddd')
})

// 新增運動
async function addExercise() {
  if (!newExercise.value.name.trim()) return
  
  const exercise: Exercise = {
    id: `ex-${Date.now()}`,
    name: newExercise.value.name,
    type: newExercise.value.type,
  }
  
  if (newExercise.value.type === 'strength') {
    exercise.sets = Array(newExercise.value.sets).fill(null).map(() => ({
      reps: newExercise.value.reps,
      weight: newExercise.value.weight || undefined,
      completed: true,
    }))
  } else if (newExercise.value.type === 'cardio') {
    exercise.duration = newExercise.value.duration
  }
  
  if (todayLog.value) {
    // 更新現有記錄
    todayLog.value.exercises.push(exercise)
    await fitnessStore.updateWorkoutLog(todayLog.value.id, {
      exercises: todayLog.value.exercises,
    })
  } else {
    // 新建記錄
    await fitnessStore.addWorkoutLog({
      date: selectedDate.value,
      exercises: [exercise],
      totalDuration: 0,
    })
  }
  
  // 重置表單
  newExercise.value = {
    name: '',
    type: 'strength',
    sets: 3,
    reps: 10,
    weight: 0,
    duration: 0,
  }
  showAddForm.value = false
}

// 刪除運動
async function removeExercise(exerciseId: string) {
  if (!todayLog.value) return
  
  const updatedExercises = todayLog.value.exercises.filter(e => e.id !== exerciseId)
  await fitnessStore.updateWorkoutLog(todayLog.value.id, {
    exercises: updatedExercises,
  })
}

// 選擇預設運動
function selectPreset(preset: { name: string; type: ExerciseType }) {
  newExercise.value.name = preset.name
  newExercise.value.type = preset.type
}

// 心情選項
const moodOptions: { value: WorkoutMood; label: string; emoji: string }[] = [
  { value: 'great', label: '超棒', emoji: '💪' },
  { value: 'good', label: '不錯', emoji: '😊' },
  { value: 'tired', label: '疲憊', emoji: '😓' },
  { value: 'struggling', label: '掙扎', emoji: '😵' },
]

onMounted(() => {
  fitnessStore.loadFromDB()
})
</script>

<template>
  <div class="exercise-log">
    <!-- 日期選擇 -->
    <div class="date-selector">
      <button class="nav-btn" @click="changeDate(-1)">
        <ChevronLeft :size="24" stroke-width="3" />
      </button>
      <div class="date-display">
        <Calendar :size="20" stroke-width="2.5" />
        <span>{{ displayDate }}</span>
      </div>
      <button class="nav-btn" @click="changeDate(1)">
        <ChevronRight :size="24" stroke-width="3" />
      </button>
    </div>

    <!-- 運動列表 -->
    <div class="exercise-list">
      <div v-if="exercises.length === 0" class="empty-state">
        <Dumbbell :size="48" stroke-width="2.5" />
        <p>這天還沒有訓練記錄</p>
      </div>

      <div v-for="ex in exercises" :key="ex.id" class="exercise-item">
        <div class="exercise-header">
          <span class="exercise-name">{{ ex.name }}</span>
          <button class="delete-btn" @click="removeExercise(ex.id)">
            <Trash2 :size="18" stroke-width="2.5" />
          </button>
        </div>
        
        <div class="exercise-details">
          <template v-if="ex.type === 'strength' && ex.sets">
            <span class="detail-tag">
              {{ ex.sets.length }} 組 × {{ ex.sets[0]?.reps || 0 }} 下
            </span>
            <span v-if="ex.sets[0]?.weight" class="detail-tag">
              {{ ex.sets[0].weight }} kg
            </span>
          </template>
          <template v-else-if="ex.type === 'cardio'">
            <span v-if="ex.duration" class="detail-tag">
              <Clock :size="14" stroke-width="2.5" />
              {{ ex.duration }} 分鐘
            </span>
            <span v-if="ex.distance" class="detail-tag">
              {{ ex.distance }} km
            </span>
          </template>
        </div>
      </div>
    </div>

    <!-- 新增按鈕 -->
    <button v-if="!showAddForm" class="add-btn" @click="showAddForm = true">
      <Plus :size="24" stroke-width="3" />
      <span>新增運動</span>
    </button>

    <!-- 新增表單 -->
    <div v-if="showAddForm" class="add-form">
      <h3>新增運動</h3>
      
      <!-- 快速選擇 -->
      <div class="preset-list">
        <button
          v-for="preset in allPresetExercises.slice(0, 8)"
          :key="preset.name"
          class="preset-btn"
          :class="{ active: newExercise.name === preset.name }"
          @click="selectPreset(preset)"
        >
          {{ preset.name }}
        </button>
      </div>

      <!-- 自訂名稱 -->
      <input
        v-model="newExercise.name"
        type="text"
        placeholder="運動名稱"
        class="input-field"
      />

      <!-- 類型選擇 -->
      <div class="type-selector">
        <button
          :class="{ active: newExercise.type === 'strength' }"
          @click="newExercise.type = 'strength'"
        >
          力量
        </button>
        <button
          :class="{ active: newExercise.type === 'cardio' }"
          @click="newExercise.type = 'cardio'"
        >
          有氧
        </button>
      </div>

      <!-- 力量訓練設定 -->
      <div v-if="newExercise.type === 'strength'" class="strength-settings">
        <div class="setting-row">
          <label>組數</label>
          <div class="number-control">
            <button @click="newExercise.sets = Math.max(1, newExercise.sets - 1)">-</button>
            <span>{{ newExercise.sets }}</span>
            <button @click="newExercise.sets++">+</button>
          </div>
        </div>
        <div class="setting-row">
          <label>每組次數</label>
          <div class="number-control">
            <button @click="newExercise.reps = Math.max(1, newExercise.reps - 1)">-</button>
            <span>{{ newExercise.reps }}</span>
            <button @click="newExercise.reps++">+</button>
          </div>
        </div>
        <div class="setting-row">
          <label>重量 (kg)</label>
          <input v-model.number="newExercise.weight" type="number" min="0" step="0.5" />
        </div>
      </div>

      <!-- 有氧設定 -->
      <div v-if="newExercise.type === 'cardio'" class="cardio-settings">
        <div class="setting-row">
          <label>時長 (分鐘)</label>
          <input v-model.number="newExercise.duration" type="number" min="0" />
        </div>
      </div>

      <!-- 按鈕 -->
      <div class="form-actions">
        <button class="cancel-btn" @click="showAddForm = false">取消</button>
        <button class="confirm-btn" :disabled="!newExercise.name" @click="addExercise">
          新增
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$text-main: #1a1a1a;
$text-sec: #6b7280;
$accent-color: #fb923c;
$card-bg: #ffffff;
$green-accent: #7dd3a8;
$orange-accent: #f97316;
$red-accent: #ef4444;

.exercise-log {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.date-selector {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 8px;
  
  .nav-btn {
    width: 44px;
    height: 44px;
    border-radius: 20px;
    border: 3px solid $frame-border;
    background: $card-bg;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $text-main;
    box-shadow: 3px 3px 0 $frame-border;
    transition: transform 0.1s, box-shadow 0.1s;
    
    &:active {
      transform: translate(3px, 3px);
      box-shadow: 0 0 0 $frame-border;
    }
  }
  
  .date-display {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 900;
    color: $text-main;
    background: $card-bg;
    border: 3px solid $frame-border;
    box-shadow: 3px 3px 0 $frame-border;
    border-radius: 20px;
    padding: 10px;
  }
}

.exercise-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: $text-sec;
  background: $card-bg;
  border: 3px dashed $text-sec;
  border-radius: 32px;
  padding: 40px;
  margin: 12px;
  
  p {
    font-size: 16px;
    font-weight: 800;
  }
}

.exercise-item {
  background: $card-bg;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 16px 20px;
  
  .exercise-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .exercise-name {
    font-weight: 900;
    font-size: 18px;
    color: $text-main;
  }
  
  .delete-btn {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: $red-accent;
    border: 2px solid $frame-border;
    background: #fef2f2;
    box-shadow: 2px 2px 0 $frame-border;
    transition: transform 0.1s, box-shadow 0.1s;
    
    &:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 $frame-border;
    }
  }
  
  .exercise-details {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  
  .detail-tag {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: #f0fdf4;
    color: #16a34a;
    border: 2px solid $frame-border;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 800;
  }
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px;
  background: $green-accent;
  color: $text-main;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  border-radius: 20px;
  font-weight: 900;
  font-size: 18px;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(4px, 4px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.add-form {
  background: $card-bg;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 20px;
  
  h3 {
    font-size: 18px;
    font-weight: 900;
    margin-bottom: 16px;
    color: $text-main;
  }
}

.preset-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
}

.preset-btn {
  padding: 8px 14px;
  background: #f1f5f9;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  color: $text-main;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
  
  &.active {
    background: $green-accent;
  }
}

.input-field {
  width: 100%;
  padding: 14px 16px;
  background: #fff;
  border: 2px solid $frame-border;
  border-radius: 16px;
  font-size: 16px;
  font-weight: 700;
  color: $text-main;
  margin-bottom: 16px;
  box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);

  &::placeholder {
    color: $text-sec;
    font-weight: 600;
  }
}

.type-selector {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  
  button {
    flex: 1;
    padding: 12px;
    background: #f1f5f9;
    border: 2px solid $frame-border;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 800;
    color: $text-main;
    box-shadow: 2px 2px 0 $frame-border;
    transition: transform 0.1s, box-shadow 0.1s;
    
    &:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 $frame-border;
    }
    
    &.active {
      background: $accent-color;
      color: #fff;
    }
  }
}

.strength-settings, .cardio-settings {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  
  label {
    font-size: 16px;
    font-weight: 800;
    color: $text-main;
  }
  
  input[type="number"] {
    width: 90px;
    padding: 10px 12px;
    background: #fff;
    border: 2px solid $frame-border;
    border-radius: 12px;
    font-weight: 800;
    font-size: 16px;
    text-align: center;
    color: $text-main;
    box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);
  }
}

.number-control {
  display: flex;
  align-items: center;
  background: #fff;
  border: 2px solid $frame-border;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);
  
  button {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 900;
    color: $text-main;
    background: #f1f5f9;
    
    &:hover, &:active {
      background: #e2e8f0;
    }
    
    &:first-child {
      border-right: 2px solid $frame-border;
    }
    
    &:last-child {
      border-left: 2px solid $frame-border;
    }
  }
  
  span {
    width: 48px;
    text-align: center;
    font-weight: 900;
    font-size: 16px;
  }
}

.form-actions {
  display: flex;
  gap: 16px;
  
  button {
    flex: 1;
    padding: 14px;
    border-radius: 20px;
    font-weight: 900;
    font-size: 16px;
    border: 3px solid $frame-border;
    box-shadow: 3px 3px 0 $frame-border;
    transition: transform 0.1s, box-shadow 0.1s;
    
    &:active:not(:disabled) {
      transform: translate(3px, 3px);
      box-shadow: 0 0 0 $frame-border;
    }
  }
  
  .cancel-btn {
    background: #f1f5f9;
    color: $text-main;
  }
  
  .confirm-btn {
    background: $green-accent;
    color: $text-main;
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }
  }
}
</style>
