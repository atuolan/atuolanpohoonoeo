<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Calendar, Scale, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { useFitnessStore } from '@/stores/fitness'
import type { BodyMetrics } from '@/types/fitness'
import dayjs from 'dayjs'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const fitnessStore = useFitnessStore()

// 是否顯示新增表單
const showAddForm = ref(false)

// 新增表單資料
const newMetrics = ref({
  weight: 0,
  bodyFat: 0,
  chest: 0,
  waist: 0,
  hip: 0,
})

// 所有記錄（按日期排序）
const sortedMetrics = computed(() => {
  return [...fitnessStore.bodyMetrics].sort((a, b) => 
    dayjs(b.date).valueOf() - dayjs(a.date).valueOf()
  )
})

// 最新記錄
const latestMetrics = computed(() => sortedMetrics.value[0])

// 上一筆記錄
const previousMetrics = computed(() => sortedMetrics.value[1])

// 計算變化
function getChange(current?: number, previous?: number): { value: number; trend: 'up' | 'down' | 'same' } | null {
  if (current === undefined || previous === undefined) return null
  const diff = Number((current - previous).toFixed(1))
  return {
    value: Math.abs(diff),
    trend: diff > 0 ? 'up' : diff < 0 ? 'down' : 'same',
  }
}

// 體重變化
const weightChange = computed(() => 
  getChange(latestMetrics.value?.weight, previousMetrics.value?.weight)
)

// 新增記錄
async function addMetrics() {
  const metrics: Omit<BodyMetrics, 'id' | 'createdAt'> = {
    date: dayjs().format('YYYY-MM-DD'),
    weight: newMetrics.value.weight || undefined,
    bodyFat: newMetrics.value.bodyFat || undefined,
    chest: newMetrics.value.chest || undefined,
    waist: newMetrics.value.waist || undefined,
    hip: newMetrics.value.hip || undefined,
  }
  
  await fitnessStore.addBodyMetrics(metrics)
  
  showAddForm.value = false
  newMetrics.value = { weight: 0, bodyFat: 0, chest: 0, waist: 0, hip: 0 }
}

// 格式化日期
function formatDate(date: string): string {
  return dayjs(date).format('M/D')
}

// 指標配置
const metricsConfig = [
  { key: 'weight', label: '體重', unit: 'kg', color: '#3b82f6' },
  { key: 'bodyFat', label: '體脂率', unit: '%', color: '#f97316' },
  { key: 'chest', label: '胸圍', unit: 'cm', color: '#ec4899' },
  { key: 'waist', label: '腰圍', unit: 'cm', color: '#8b5cf6' },
  { key: 'hip', label: '臀圍', unit: 'cm', color: '#14b8a6' },
]

onMounted(() => {
  fitnessStore.loadFromDB()
})
</script>

<template>
  <div class="body-metrics">
    <!-- 最新數據卡片 -->
    <div class="latest-card">
      <div class="card-header">
        <h2>最新數據</h2>
        <span v-if="latestMetrics" class="date">{{ formatDate(latestMetrics.date) }}</span>
      </div>
      
      <div v-if="latestMetrics" class="metrics-grid">
        <!-- 體重（主要指標） -->
        <div class="metric-main">
          <Scale :size="32" stroke-width="2.5" />
          <div class="metric-value">
            <span class="value">{{ latestMetrics.weight || '--' }}</span>
            <span class="unit">kg</span>
          </div>
          <div v-if="weightChange" class="metric-change" :class="weightChange.trend">
            <TrendingUp v-if="weightChange.trend === 'up'" :size="16" stroke-width="2.5" />
            <TrendingDown v-else-if="weightChange.trend === 'down'" :size="16" stroke-width="2.5" />
            <Minus v-else :size="16" stroke-width="2.5" />
            <span>{{ weightChange.value }} kg</span>
          </div>
        </div>
        
        <!-- 其他指標 -->
        <div class="metrics-secondary">
          <div v-if="latestMetrics.bodyFat" class="metric-item">
            <span class="label">體脂率</span>
            <span class="value">{{ latestMetrics.bodyFat }}%</span>
          </div>
          <div v-if="latestMetrics.chest" class="metric-item">
            <span class="label">胸圍</span>
            <span class="value">{{ latestMetrics.chest }} cm</span>
          </div>
          <div v-if="latestMetrics.waist" class="metric-item">
            <span class="label">腰圍</span>
            <span class="value">{{ latestMetrics.waist }} cm</span>
          </div>
          <div v-if="latestMetrics.hip" class="metric-item">
            <span class="label">臀圍</span>
            <span class="value">{{ latestMetrics.hip }} cm</span>
          </div>
        </div>
      </div>
      
      <div v-else class="empty-state">
        <Scale :size="48" stroke-width="2.5" />
        <p>尚未記錄身體數據</p>
      </div>
    </div>

    <!-- 歷史記錄 -->
    <div class="history-section">
      <h3>歷史記錄</h3>
      
      <div class="history-list">
        <div v-if="sortedMetrics.length === 0" class="empty-history">
          點擊下方按鈕開始記錄
        </div>
        
        <div v-for="record in sortedMetrics.slice(0, 10)" :key="record.id" class="history-item">
          <span class="history-date">{{ formatDate(record.date) }}</span>
          <div class="history-values">
            <span v-if="record.weight" class="history-value">
              {{ record.weight }} kg
            </span>
            <span v-if="record.bodyFat" class="history-value secondary">
              {{ record.bodyFat }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增按鈕 -->
    <button class="add-btn" @click="showAddForm = true">
      <Plus :size="24" stroke-width="3" />
      <span>記錄數據</span>
    </button>

    <!-- 新增表單 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
          <div class="add-form">
            <h3>記錄身體數據</h3>
            
            <div class="form-grid">
              <div class="form-item main">
                <label>
                  <Scale :size="20" stroke-width="2.5" />
                  體重
                </label>
                <div class="input-group">
                  <input v-model.number="newMetrics.weight" type="number" step="0.1" placeholder="0" />
                  <span>kg</span>
                </div>
              </div>
              
              <div class="form-item">
                <label>體脂率</label>
                <div class="input-group">
                  <input v-model.number="newMetrics.bodyFat" type="number" step="0.1" placeholder="0" />
                  <span>%</span>
                </div>
              </div>
              
              <div class="form-item">
                <label>胸圍</label>
                <div class="input-group">
                  <input v-model.number="newMetrics.chest" type="number" step="0.5" placeholder="0" />
                  <span>cm</span>
                </div>
              </div>
              
              <div class="form-item">
                <label>腰圍</label>
                <div class="input-group">
                  <input v-model.number="newMetrics.waist" type="number" step="0.5" placeholder="0" />
                  <span>cm</span>
                </div>
              </div>
              
              <div class="form-item">
                <label>臀圍</label>
                <div class="input-group">
                  <input v-model.number="newMetrics.hip" type="number" step="0.5" placeholder="0" />
                  <span>cm</span>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button class="cancel-btn" @click="showAddForm = false">取消</button>
              <button class="confirm-btn" @click="addMetrics">
                儲存
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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
$blue-accent: #3b82f6;

.body-metrics {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  height: 100%;
}

.latest-card {
  background: $card-bg;
  border-radius: 24px;
  padding: 20px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  
  h2 {
    font-size: 18px;
    font-weight: 900;
    color: $text-main;
  }
  
  .date {
    font-size: 14px;
    font-weight: 800;
    color: $text-sec;
    background: #f1f5f9;
    padding: 4px 12px;
    border-radius: 12px;
    border: 2px solid $frame-border;
  }
}

.metrics-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.metric-main {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  background: #dbeafe;
  border-radius: 16px;
  color: $blue-accent;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
  
  .metric-value {
    flex: 1;
    display: flex;
    align-items: baseline;
    
    .value {
      font-size: 40px;
      font-weight: 900;
      color: $text-main;
    }
    
    .unit {
      font-size: 16px;
      font-weight: 800;
      color: $text-main;
      margin-left: 6px;
    }
  }
  
  .metric-change {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 900;
    border: 2px solid $frame-border;
    background: $card-bg;
    
    &.up {
      color: $red-accent;
    }
    
    &.down {
      color: #16a34a;
    }
    
    &.same {
      color: $text-sec;
    }
  }
}

.metrics-secondary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.metric-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: #fff;
  border-radius: 14px;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
  
  .label {
    font-size: 14px;
    font-weight: 800;
    color: $text-sec;
  }
  
  .value {
    font-size: 16px;
    font-weight: 900;
    color: $text-main;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  color: $text-sec;
  background: #f1f5f9;
  border-radius: 16px;
  border: 2px dashed $text-sec;
  
  p {
    font-size: 16px;
    font-weight: 800;
  }
}

.history-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  
  h3 {
    font-size: 16px;
    font-weight: 900;
    color: $text-main;
    margin-bottom: 16px;
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.empty-history {
  text-align: center;
  padding: 24px;
  color: $text-sec;
  font-size: 15px;
  font-weight: 800;
  background: $card-bg;
  border-radius: 20px;
  border: 3px dashed $text-sec;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: $card-bg;
  border-radius: 16px;
  border: 3px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.history-date {
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
  background: #f1f5f9;
  padding: 4px 10px;
  border-radius: 10px;
  border: 2px solid $frame-border;
}

.history-values {
  display: flex;
  gap: 16px;
}

.history-value {
  font-size: 16px;
  font-weight: 900;
  color: $blue-accent;
  
  &.secondary {
    color: $orange-accent;
  }
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  background: $blue-accent;
  color: white;
  border-radius: 20px;
  font-weight: 900;
  font-size: 18px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 $frame-border;
  }
}

// Modal
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.add-form {
  width: 100%;
  max-width: 360px;
  background: $card-bg;
  border-radius: 32px;
  border: 3px solid $frame-border;
  box-shadow: 6px 6px 0 $frame-border;
  padding: 24px;
  
  h3 {
    font-size: 20px;
    font-weight: 900;
    margin-bottom: 24px;
    color: $text-main;
    text-align: center;
  }
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.form-item {
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 800;
    color: $text-main;
    margin-bottom: 8px;
  }
  
  &.main {
    label {
      color: $blue-accent;
      font-size: 18px;
    }
    
    .input-group input {
      font-size: 24px;
      font-weight: 900;
    }
  }
}

.input-group {
  display: flex;
  align-items: center;
  gap: 12px;
  
  input {
    flex: 1;
    padding: 12px 16px;
    background: #fff;
    border: 2px solid $frame-border;
    border-radius: 16px;
    font-size: 18px;
    font-weight: 800;
    color: $text-main;
    box-shadow: inset 2px 2px 0 rgba(0,0,0,0.05);

    &::placeholder {
      color: $text-sec;
    }
  }
  
  span {
    font-size: 16px;
    font-weight: 800;
    color: $text-sec;
    min-width: 30px;
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
    
    &:active {
      transform: translate(3px, 3px);
      box-shadow: 0 0 0 $frame-border;
    }
  }
  
  .cancel-btn {
    background: #f1f5f9;
    color: $text-main;
  }
  
  .confirm-btn {
    background: $blue-accent;
    color: white;
  }
}

// 動畫
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s ease;
  .add-form { transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
  .add-form { transform: scale(0.9); }
}
</style>
