<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Plus, Calendar, Utensils, Trash2, ChevronLeft, ChevronRight, Coffee, Sun, Moon, Cookie } from 'lucide-vue-next'
import { useFitnessStore } from '@/stores/fitness'
import type { MealLog, Meal, MealType, FoodItem } from '@/types/fitness'
import dayjs from 'dayjs'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const fitnessStore = useFitnessStore()

// 當前選擇的日期
const selectedDate = ref(dayjs().format('YYYY-MM-DD'))

// 是否顯示新增表單
const showAddForm = ref(false)
const addingMealType = ref<MealType>('breakfast')

// 新增食物
const newFood = ref({
  name: '',
  portion: '',
  calories: 0,
})

// 當日飲食記錄
const todayMealLog = computed(() => {
  return fitnessStore.mealLogs.find(log => log.date === selectedDate.value)
})

// 各餐點資料
const getMealByType = (type: MealType): Meal | undefined => {
  return todayMealLog.value?.meals.find(m => m.type === type)
}

// 餐點類型配置
const mealTypes: { type: MealType; label: string; icon: typeof Coffee }[] = [
  { type: 'breakfast', label: '早餐', icon: Coffee },
  { type: 'lunch', label: '午餐', icon: Sun },
  { type: 'dinner', label: '晚餐', icon: Moon },
  { type: 'snack', label: '點心', icon: Cookie },
]

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

// 開啟新增表單
function openAddForm(type: MealType) {
  addingMealType.value = type
  showAddForm.value = true
  newFood.value = { name: '', portion: '', calories: 0 }
}

// 新增食物
async function addFood() {
  if (!newFood.value.name.trim()) return
  
  const food: FoodItem = {
    name: newFood.value.name,
    portion: newFood.value.portion || undefined,
    calories: newFood.value.calories || undefined,
  }
  
  await fitnessStore.addFoodToMeal(selectedDate.value, addingMealType.value, food)
  
  showAddForm.value = false
  newFood.value = { name: '', portion: '', calories: 0 }
}

// 刪除食物
async function removeFood(mealType: MealType, foodIndex: number) {
  await fitnessStore.removeFoodFromMeal(selectedDate.value, mealType, foodIndex)
}

// 計算總熱量
const totalCalories = computed(() => {
  if (!todayMealLog.value) return 0
  return todayMealLog.value.meals.reduce((sum, meal) => {
    return sum + meal.foods.reduce((mealSum, food) => mealSum + (food.calories || 0), 0)
  }, 0)
})

// 常見食物快速選擇
const quickFoods = [
  { name: '白飯', calories: 200 },
  { name: '麵包', calories: 150 },
  { name: '雞胸肉', calories: 165 },
  { name: '雞蛋', calories: 70 },
  { name: '牛奶', calories: 120 },
  { name: '沙拉', calories: 50 },
  { name: '水果', calories: 60 },
  { name: '咖啡', calories: 5 },
]

onMounted(() => {
  fitnessStore.loadFromDB()
})
</script>

<template>
  <div class="meal-log">
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

    <!-- 總熱量 -->
    <div v-if="totalCalories > 0" class="total-calories">
      今日攝取：<strong>{{ totalCalories }}</strong> 大卡
    </div>

    <!-- 各餐記錄 -->
    <div class="meals-list">
      <div v-for="{ type, label, icon } in mealTypes" :key="type" class="meal-card">
        <div class="meal-header">
          <div class="meal-title">
            <component :is="icon" :size="20" stroke-width="2.5" />
            <span>{{ label }}</span>
          </div>
          <button class="add-food-btn" @click="openAddForm(type)">
            <Plus :size="18" stroke-width="2.5" />
          </button>
        </div>
        
        <div class="food-list">
          <template v-if="getMealByType(type)?.foods.length">
            <div 
              v-for="(food, index) in getMealByType(type)?.foods" 
              :key="index"
              class="food-item"
            >
              <div class="food-info">
                <span class="food-name">{{ food.name }}</span>
                <span v-if="food.portion" class="food-portion">{{ food.portion }}</span>
              </div>
              <div class="food-actions">
                <span v-if="food.calories" class="food-calories">{{ food.calories }} kcal</span>
                <button class="delete-btn" @click="removeFood(type, index)">
                  <Trash2 :size="16" stroke-width="2.5" />
                </button>
              </div>
            </div>
          </template>
          <div v-else class="empty-meal">
            尚未記錄
          </div>
        </div>
      </div>
    </div>

    <!-- 新增食物表單 -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showAddForm" class="modal-overlay" @click.self="showAddForm = false">
          <div class="add-form">
            <h3>新增{{ mealTypes.find(m => m.type === addingMealType)?.label }}</h3>
            
            <!-- 快速選擇 -->
            <div class="quick-foods">
              <button
                v-for="food in quickFoods"
                :key="food.name"
                class="quick-food-btn"
                :class="{ active: newFood.name === food.name }"
                @click="newFood.name = food.name; newFood.calories = food.calories"
              >
                {{ food.name }}
              </button>
            </div>

            <input
              v-model="newFood.name"
              type="text"
              placeholder="食物名稱"
              class="input-field"
            />
            
            <input
              v-model="newFood.portion"
              type="text"
              placeholder="份量（選填，如：一碗、100g）"
              class="input-field"
            />
            
            <div class="calories-input">
              <label>熱量（選填）</label>
              <input v-model.number="newFood.calories" type="number" min="0" placeholder="0" />
              <span>大卡</span>
            </div>

            <div class="form-actions">
              <button class="cancel-btn" @click="showAddForm = false">取消</button>
              <button class="confirm-btn" :disabled="!newFood.name" @click="addFood">
                新增
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

.meal-log {
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

.total-calories {
  text-align: center;
  padding: 16px;
  background: #ffedd5;
  border: 3px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
  border-radius: 20px;
  font-size: 16px;
  font-weight: 800;
  color: $text-main;
  
  strong {
    color: $orange-accent;
    font-size: 24px;
    font-weight: 900;
  }
}

.meals-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.meal-card {
  background: $card-bg;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 16px 20px;
}

.meal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.meal-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 900;
  font-size: 18px;
  color: $text-main;
}

.add-food-btn {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: #ffedd5;
  color: $orange-accent;
  border: 2px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 2px 0 $frame-border;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.food-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.food-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  background: #fff;
  border: 2px solid $frame-border;
  border-radius: 16px;
  box-shadow: inset 2px 2px 0 rgba(0,0,0,0.02);
}

.food-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.food-name {
  font-size: 16px;
  font-weight: 800;
  color: $text-main;
}

.food-portion {
  font-size: 13px;
  font-weight: 700;
  color: $text-sec;
}

.food-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.food-calories {
  font-size: 15px;
  color: $orange-accent;
  font-weight: 900;
}

.delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 10px;
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

.empty-meal {
  font-size: 14px;
  font-weight: 800;
  color: $text-sec;
  padding: 12px;
  text-align: center;
  background: #f1f5f9;
  border-radius: 12px;
  border: 2px dashed $text-sec;
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
    margin-bottom: 20px;
    color: $text-main;
  }
}

.quick-foods {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
}

.quick-food-btn {
  padding: 8px 14px;
  background: #f1f5f9;
  border-radius: 14px;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
  font-size: 14px;
  font-weight: 800;
  color: $text-main;
  transition: transform 0.1s, box-shadow 0.1s;
  
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
  
  &.active {
    background: $orange-accent;
    color: white;
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

.calories-input {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  
  label {
    font-size: 16px;
    font-weight: 800;
    color: $text-main;
  }
  
  input {
    width: 100px;
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
  
  span {
    font-size: 15px;
    font-weight: 800;
    color: $text-sec;
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
    background: $orange-accent;
    color: white;
    
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }
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
