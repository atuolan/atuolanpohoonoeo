<script setup lang="ts">
import { ref, computed } from 'vue'
import { X, Plus, Trash2, Dumbbell, Clock, Coffee, Sparkles } from 'lucide-vue-next'
import { allPresetExercises } from '@/data/exercises'
import type { ExerciseType } from '@/types/fitness'

// 單項運動設定
interface ExerciseSetup {
  id: string
  name: string
  type: ExerciseType
  sets: number           // 組數
  workTime: number       // 單組時間（秒）
  restTime: number       // 休息時間（秒）
}

// 訓練計畫
export interface WorkoutPlan {
  exercises: ExerciseSetup[]
  enableAI: boolean      // 是否啟用 AI 陪伴
}

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'start', plan: WorkoutPlan): void
}>()

// 已選擇的運動列表
const selectedExercises = ref<ExerciseSetup[]>([])

// 是否啟用 AI 陪伴
const enableAI = ref(true)

// 顯示運動選擇器
const showExercisePicker = ref(false)

// 搜尋關鍵字
const searchKeyword = ref('')

// 過濾後的運動列表
const filteredExercises = computed(() => {
  if (!searchKeyword.value) return allPresetExercises
  const keyword = searchKeyword.value.toLowerCase()
  return allPresetExercises.filter(e => e.name.toLowerCase().includes(keyword))
})

// 新增運動
function addExercise(preset: { name: string; type: ExerciseType }) {
  const newExercise: ExerciseSetup = {
    id: `ex-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: preset.name,
    type: preset.type,
    sets: 3,
    workTime: 45,
    restTime: 30,
  }
  selectedExercises.value.push(newExercise)
  showExercisePicker.value = false
  searchKeyword.value = ''
}

// 新增自訂運動
function addCustomExercise() {
  if (!searchKeyword.value.trim()) return
  addExercise({ name: searchKeyword.value.trim(), type: 'other' })
}

// 移除運動
function removeExercise(id: string) {
  selectedExercises.value = selectedExercises.value.filter(e => e.id !== id)
}

// 更新運動設定
function updateExercise(id: string, field: keyof ExerciseSetup, value: number) {
  const exercise = selectedExercises.value.find(e => e.id === id)
  if (exercise && typeof value === 'number') {
    (exercise as any)[field] = value
  }
}

// 計算總時長
const totalDuration = computed(() => {
  let total = 0
  for (const ex of selectedExercises.value) {
    // 每個運動：(單組時間 + 休息時間) * 組數 - 最後一組不休息
    total += ex.sets * ex.workTime + (ex.sets - 1) * ex.restTime
  }
  return total
})

// 格式化時間
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins === 0) return `${secs}秒`
  if (secs === 0) return `${mins}分鐘`
  return `${mins}分${secs}秒`
}

// 開始訓練
function startWorkout() {
  if (selectedExercises.value.length === 0) return
  
  emit('start', {
    exercises: selectedExercises.value,
    enableAI: enableAI.value,
  })
  emit('close')
}

// 重置
function reset() {
  selectedExercises.value = []
  enableAI.value = true
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
        <div class="modal-container">
          <!-- 標題 -->
          <header class="modal-header">
            <h2>
              <Dumbbell :size="20" />
              訓練設定
            </h2>
            <button class="close-btn" @click="emit('close')">
              <X :size="20" />
            </button>
          </header>

          <div class="modal-body">
            <!-- 已選運動列表 -->
            <section class="exercise-list">
              <div class="section-header">
                <h3>訓練項目</h3>
                <button class="add-btn" @click="showExercisePicker = true">
                  <Plus :size="16" />
                  新增
                </button>
              </div>

              <div v-if="selectedExercises.length === 0" class="empty-hint">
                點擊「新增」來添加訓練項目
              </div>

              <div v-else class="exercise-items">
                <div 
                  v-for="(ex, index) in selectedExercises" 
                  :key="ex.id"
                  class="exercise-item"
                >
                  <div class="exercise-header">
                    <span class="exercise-index">{{ index + 1 }}</span>
                    <span class="exercise-name">{{ ex.name }}</span>
                    <button class="remove-btn" @click="removeExercise(ex.id)">
                      <Trash2 :size="16" />
                    </button>
                  </div>
                  
                  <div class="exercise-settings">
                    <div class="setting-item">
                      <label>組數</label>
                      <div class="number-input">
                        <button @click="updateExercise(ex.id, 'sets', Math.max(1, ex.sets - 1))">-</button>
                        <span>{{ ex.sets }}</span>
                        <button @click="updateExercise(ex.id, 'sets', ex.sets + 1)">+</button>
                      </div>
                    </div>
                    
                    <div class="setting-item">
                      <label>
                        <Clock :size="12" />
                        單組
                      </label>
                      <div class="number-input">
                        <button @click="updateExercise(ex.id, 'workTime', Math.max(10, ex.workTime - 5))">-</button>
                        <span>{{ ex.workTime }}秒</span>
                        <button @click="updateExercise(ex.id, 'workTime', ex.workTime + 5)">+</button>
                      </div>
                    </div>
                    
                    <div class="setting-item">
                      <label>
                        <Coffee :size="12" />
                        休息
                      </label>
                      <div class="number-input">
                        <button @click="updateExercise(ex.id, 'restTime', Math.max(5, ex.restTime - 5))">-</button>
                        <span>{{ ex.restTime }}秒</span>
                        <button @click="updateExercise(ex.id, 'restTime', ex.restTime + 5)">+</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- AI 陪伴選項 -->
            <section class="ai-option">
              <label class="toggle-label">
                <div class="toggle-info">
                  <Sparkles :size="18" />
                  <div>
                    <span class="toggle-title">AI 陪伴鼓勵</span>
                    <span class="toggle-desc">每組開始時，角色會發送鼓勵訊息</span>
                  </div>
                </div>
                <input 
                  type="checkbox" 
                  v-model="enableAI"
                  class="toggle-input"
                />
                <span class="toggle-switch" />
              </label>
            </section>

            <!-- 總時長預估 -->
            <div v-if="selectedExercises.length > 0" class="duration-estimate">
              預估總時長：<strong>{{ formatDuration(totalDuration) }}</strong>
            </div>
          </div>

          <!-- 底部按鈕 -->
          <footer class="modal-footer">
            <button class="cancel-btn" @click="emit('close')">取消</button>
            <button 
              class="start-btn" 
              :disabled="selectedExercises.length === 0"
              @click="startWorkout"
            >
              開始訓練
            </button>
          </footer>

          <!-- 運動選擇器 -->
          <Transition name="picker">
            <div v-if="showExercisePicker" class="exercise-picker-overlay" @click.self="showExercisePicker = false">
              <div class="exercise-picker">
                <header class="picker-header">
                  <input 
                    v-model="searchKeyword"
                    type="text"
                    placeholder="搜尋或輸入自訂運動..."
                    class="search-input"
                    @keyup.enter="addCustomExercise"
                  />
                  <button class="close-picker" @click="showExercisePicker = false">
                    <X :size="18" />
                  </button>
                </header>
                
                <div class="picker-list">
                  <!-- 自訂運動選項 -->
                  <button 
                    v-if="searchKeyword.trim() && !filteredExercises.some(e => e.name === searchKeyword.trim())"
                    class="picker-item custom"
                    @click="addCustomExercise"
                  >
                    <Plus :size="16" />
                    新增「{{ searchKeyword.trim() }}」
                  </button>
                  
                  <!-- 預設運動列表 -->
                  <button 
                    v-for="preset in filteredExercises"
                    :key="preset.name"
                    class="picker-item"
                    @click="addExercise(preset)"
                  >
                    {{ preset.name }}
                    <span class="type-tag">{{ 
                      preset.type === 'strength' ? '力量' :
                      preset.type === 'cardio' ? '有氧' :
                      preset.type === 'flexibility' ? '柔軟' : '其他'
                    }}</span>
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  background: var(--color-surface, #fff);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
  }
  
  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--color-text-secondary, #6b7280);
    
    &:hover {
      background: rgba(0, 0, 0, 0.05);
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// 運動列表
.exercise-list {
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    
    h3 {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text, #1f2937);
    }
  }
  
  .add-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 12px;
    background: #7dd3a8;
    color: white;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
  }
}

.empty-hint {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #9ca3af);
  font-size: 14px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
}

.exercise-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.exercise-item {
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  padding: 12px;
  
  .exercise-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }
  
  .exercise-index {
    width: 24px;
    height: 24px;
    background: #7dd3a8;
    color: white;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 600;
  }
  
  .exercise-name {
    flex: 1;
    font-weight: 500;
    color: var(--color-text, #1f2937);
  }
  
  .remove-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    color: #ef4444;
    
    &:hover {
      background: rgba(239, 68, 68, 0.1);
    }
  }
}

.exercise-settings {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.setting-item {
  flex: 1;
  min-width: 90px;
  
  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-secondary, #6b7280);
    margin-bottom: 4px;
  }
}

.number-input {
  display: flex;
  align-items: center;
  background: var(--color-surface, #fff);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.1);
  
  button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: var(--color-text-secondary, #6b7280);
    
    &:hover {
      background: rgba(0, 0, 0, 0.05);
    }
  }
  
  span {
    flex: 1;
    text-align: center;
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text, #1f2937);
  }
}

// AI 選項
.ai-option {
  background: rgba(125, 211, 168, 0.1);
  border-radius: 12px;
  padding: 12px;
}

.toggle-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  
  .toggle-info {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #7dd3a8;
    
    > div {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
  }
  
  .toggle-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #1f2937);
  }
  
  .toggle-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #6b7280);
  }
  
  .toggle-input {
    display: none;
  }
  
  .toggle-switch {
    width: 44px;
    height: 24px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 12px;
    position: relative;
    transition: background 0.2s;
    
    &::after {
      content: '';
      position: absolute;
      top: 2px;
      left: 2px;
      width: 20px;
      height: 20px;
      background: white;
      border-radius: 50%;
      transition: transform 0.2s;
    }
  }
  
  .toggle-input:checked + .toggle-switch {
    background: #7dd3a8;
    
    &::after {
      transform: translateX(20px);
    }
  }
}

// 時長預估
.duration-estimate {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary, #6b7280);
  padding: 8px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 8px;
  
  strong {
    color: var(--color-text, #1f2937);
  }
}

// 底部按鈕
.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.cancel-btn {
  flex: 1;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
}

.start-btn {
  flex: 1;
  padding: 12px;
  background: #7dd3a8;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: white;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// 運動選擇器
.exercise-picker-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: flex-end;
  z-index: 10;
}

.exercise-picker {
  width: 100%;
  max-height: 60%;
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
}

.picker-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  
  .search-input {
    flex: 1;
    padding: 10px 14px;
    background: rgba(0, 0, 0, 0.04);
    border-radius: 10px;
    font-size: 14px;
    
    &::placeholder {
      color: var(--color-text-secondary, #9ca3af);
    }
  }
  
  .close-picker {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--color-text-secondary, #6b7280);
  }
}

.picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.picker-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--color-text, #1f2937);
  text-align: left;
  
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  
  &.custom {
    color: #7dd3a8;
    font-weight: 500;
    gap: 8px;
    justify-content: flex-start;
  }
  
  .type-tag {
    font-size: 11px;
    padding: 2px 8px;
    background: rgba(0, 0, 0, 0.06);
    border-radius: 4px;
    color: var(--color-text-secondary, #6b7280);
  }
}

// 動畫
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
  .modal-container { transition: transform 0.2s ease; }
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
  .modal-container { transform: scale(0.95); }
}

.picker-enter-active, .picker-leave-active {
  transition: opacity 0.2s ease;
  .exercise-picker { transition: transform 0.2s ease; }
}
.picker-enter-from, .picker-leave-to {
  opacity: 0;
  .exercise-picker { transform: translateY(100%); }
}
</style>
