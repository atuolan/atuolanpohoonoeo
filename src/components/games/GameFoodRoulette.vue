<template>
  <div class="food-roulette">
    <div class="header">
      <button class="back-btn" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">轉轉飯堂</h1>
      <button class="settings-btn" @click="showSettings = true">
        <Settings class="icon" />
      </button>
    </div>

    <div class="content">
      <div class="roulette-container">
        <div class="pointer"><div class="pointer-arrow"></div></div>
        <div
          class="roulette-wheel"
          :style="{ transform: `rotate(${rotation}deg)` }"
        >
          <div
            v-for="(item, index) in currentItems"
            :key="index"
            class="roulette-item"
            :style="getItemStyle(index)"
          >
            <span class="item-text">{{ item.name }}</span>
          </div>
        </div>
        <div class="center-circle">
          <UtensilsCrossed class="center-icon" />
        </div>
      </div>

      <button class="start-btn" @click="spin" :disabled="isSpinning">
        <RotateCw :size="24" />
        {{ isSpinning ? "轉動中..." : "開始轉動" }}
      </button>

      <div class="bottom-actions">
        <button class="action-btn" @click="showHistory = true">
          <History :size="24" /><span>歷史</span>
        </button>
        <button class="action-btn" @click="showSettings = true">
          <Settings :size="24" /><span>設置</span>
        </button>
      </div>
    </div>

    <!-- 结果弹窗 -->
    <transition name="fade">
      <div v-if="showResult" class="result-overlay" @click="confirmResult">
        <div class="result-content" @click.stop>
          <div class="result-icon">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="#f59e0b">
              <path
                d="M1 22c0 .54.45 1 1 1h13c.56 0 1-.46 1-1H1M8.5 15c4.15 0 7.5-3.35 7.5-7.5S12.65 0 8.5 0 1 3.35 1 7.5 4.35 15 8.5 15m4.79-11.34 2.38-2.38a.996.996 0 1 1 1.41 1.41l-2.38 2.38c-.39.39-1.02.39-1.41 0a.996.996 0 0 1 0-1.41M18 7.5c0 .55.45 1 1 1h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1"
              />
            </svg>
          </div>
          <h2>今天吃</h2>
          <div class="result-name">{{ selectedItem?.name }}</div>
          <p class="result-hint">點擊確定保存到歷史</p>
          <button class="confirm-btn" @click="confirmResult">
            <Check :size="20" /> 確定
          </button>
        </div>
      </div>
    </transition>

    <!-- 设置弹窗 -->
    <transition name="slide-up">
      <div
        v-if="showSettings"
        class="settings-overlay"
        @click="showSettings = false"
      >
        <div class="settings-content" @click.stop>
          <div class="settings-header">
            <h3>設置</h3>
            <button class="close-btn" @click="showSettings = false">
              <X :size="20" />
            </button>
          </div>
          <div class="settings-body">
            <div class="setting-section">
              <h4>預算範圍</h4>
              <div class="budget-options">
                <button
                  v-for="budget in budgetOptions"
                  :key="budget.value"
                  :class="[
                    'budget-btn',
                    { active: selectedBudget === budget.value },
                  ]"
                  @click="selectedBudget = budget.value"
                >
                  {{ budget.label }}
                </button>
              </div>
            </div>
            <div class="setting-section">
              <h4>菜系選擇</h4>
              <div class="cuisine-options">
                <button
                  v-for="cuisine in cuisineOptions"
                  :key="cuisine"
                  :class="[
                    'cuisine-btn',
                    { active: selectedCuisines.includes(cuisine) },
                  ]"
                  @click="toggleCuisine(cuisine)"
                >
                  {{ cuisine }}
                </button>
              </div>
            </div>
            <div class="setting-section">
              <h4>自定義選項</h4>
              <div class="custom-input">
                <input
                  v-model="customInput"
                  type="text"
                  placeholder="輸入餐廳或菜品名稱"
                  @keyup.enter="addCustomItem"
                />
                <button class="add-btn" @click="addCustomItem">
                  <Plus :size="24" />
                </button>
              </div>
              <div class="custom-list">
                <div
                  v-for="(item, index) in customItems"
                  :key="index"
                  class="custom-item"
                >
                  <span>{{ item.name }}</span>
                  <button class="remove-btn" @click="removeCustomItem(index)">
                    <X :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div class="settings-footer">
            <button class="reset-btn" @click="resetSettings">
              <RefreshCw :size="20" /> 重置設置
            </button>
            <button class="save-btn" @click="saveSettings">
              <Check :size="20" /> 保存設置
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 历史记录弹窗 -->
    <transition name="slide-up">
      <div
        v-if="showHistory"
        class="history-overlay"
        @click="showHistory = false"
      >
        <div class="history-content" @click.stop>
          <div class="history-header">
            <h3>歷史記錄</h3>
            <button class="close-btn" @click="showHistory = false">
              <X :size="20" />
            </button>
          </div>
          <div class="history-body">
            <div v-if="history.length === 0" class="empty-state">
              <svg viewBox="0 0 24 24" width="64" height="64" fill="#9ca3af">
                <path
                  d="M1 22c0 .54.45 1 1 1h13c.56 0 1-.46 1-1H1M8.5 15c4.15 0 7.5-3.35 7.5-7.5S12.65 0 8.5 0 1 3.35 1 7.5 4.35 15 8.5 15m4.79-11.34 2.38-2.38a.996.996 0 1 1 1.41 1.41l-2.38 2.38c-.39.39-1.02.39-1.41 0a.996.996 0 0 1 0-1.41M18 7.5c0 .55.45 1 1 1h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1"
                />
                <line
                  x1="4"
                  y1="4"
                  x2="20"
                  y2="20"
                  stroke="#9ca3af"
                  stroke-width="2"
                />
              </svg>
              <p>還沒有記錄呢</p>
            </div>
            <div
              v-for="(record, index) in history"
              :key="index"
              class="history-item"
            >
              <div class="history-info">
                <div class="food-name">{{ record.name }}</div>
                <div class="history-time">
                  {{ formatTime(record.timestamp) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import {
    Check,
    ChevronLeft,
    History,
    Plus,
    RefreshCw,
    RotateCw,
    Settings,
    UtensilsCrossed,
    X,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{ close: [] }>();

interface FoodItem {
  name: string;
  cuisine: string;
  budget: string;
}
interface HistoryRecord {
  name: string;
  timestamp: number;
}
interface SaveData {
  customItems: FoodItem[];
  selectedBudget: string;
  selectedCuisines: string[];
  history: HistoryRecord[];
}

const defaultFoodItems: FoodItem[] = [
  { name: "川菜", cuisine: "中餐", budget: "medium" },
  { name: "粤菜", cuisine: "中餐", budget: "medium" },
  { name: "湘菜", cuisine: "中餐", budget: "medium" },
  { name: "东北菜", cuisine: "中餐", budget: "medium" },
  { name: "火锅", cuisine: "中餐", budget: "medium" },
  { name: "牛排", cuisine: "西餐", budget: "expensive" },
  { name: "意大利面", cuisine: "西餐", budget: "medium" },
  { name: "汉堡", cuisine: "西餐", budget: "cheap" },
  { name: "披萨", cuisine: "西餐", budget: "medium" },
  { name: "寿司", cuisine: "日料", budget: "expensive" },
  { name: "拉面", cuisine: "日料", budget: "medium" },
  { name: "烤肉", cuisine: "日料", budget: "expensive" },
  { name: "丼饭", cuisine: "日料", budget: "medium" },
  { name: "韩式烤肉", cuisine: "韩餐", budget: "expensive" },
  { name: "石锅拌饭", cuisine: "韩餐", budget: "medium" },
  { name: "炸鸡", cuisine: "韩餐", budget: "cheap" },
  { name: "部队锅", cuisine: "韩餐", budget: "medium" },
  { name: "泰式料理", cuisine: "东南亚", budget: "medium" },
  { name: "越南河粉", cuisine: "东南亚", budget: "cheap" },
  { name: "麦当劳", cuisine: "快餐", budget: "cheap" },
  { name: "肯德基", cuisine: "快餐", budget: "cheap" },
  { name: "赛百味", cuisine: "快餐", budget: "cheap" },
  { name: "煎饼果子", cuisine: "小吃", budget: "cheap" },
  { name: "麻辣烫", cuisine: "小吃", budget: "cheap" },
  { name: "烤串", cuisine: "小吃", budget: "cheap" },
];

const budgetOptions = [
  { label: "不限", value: "all" },
  { label: "便宜 (<30元)", value: "cheap" },
  { label: "中等 (30-80元)", value: "medium" },
  { label: "贵 (>80元)", value: "expensive" },
];
const cuisineOptions = [
  "中餐",
  "西餐",
  "日料",
  "韩餐",
  "东南亚",
  "快餐",
  "小吃",
  "自定义",
];

const isSpinning = ref(false);
const rotation = ref(0);
const showResult = ref(false);
const showSettings = ref(false);
const showHistory = ref(false);
const selectedItem = ref<FoodItem | null>(null);
const selectedBudget = ref("all");
const selectedCuisines = ref<string[]>([...cuisineOptions]);
const customItems = ref<FoodItem[]>([]);
const customInput = ref("");
const history = ref<HistoryRecord[]>([]);

const currentItems = computed(() => {
  let items = [...defaultFoodItems, ...customItems.value];
  if (selectedBudget.value !== "all")
    items = items.filter((i) => i.budget === selectedBudget.value);
  items = items.filter((i) => selectedCuisines.value.includes(i.cuisine));
  return items.length === 0 ? [defaultFoodItems[0]] : items;
});

const getItemStyle = (index: number) => {
  const total = currentItems.value.length;
  const angle = (360 / total) * index;
  const radius = 110;
  const radian = (angle * Math.PI) / 180;
  return {
    transform: `translate(${Math.sin(radian) * radius}px, ${-Math.cos(radian) * radius}px) rotate(${angle}deg)`,
  };
};

const spin = () => {
  if (isSpinning.value) return;
  isSpinning.value = true;
  const totalRotation =
    rotation.value + 360 * 5 + Math.floor(Math.random() * 360);
  rotation.value = totalRotation;
  setTimeout(() => {
    const normalizedAngle = totalRotation % 360;
    const itemAngle = 360 / currentItems.value.length;
    const selectedIndex =
      Math.floor((360 - normalizedAngle + itemAngle / 2) / itemAngle) %
      currentItems.value.length;
    selectedItem.value = currentItems.value[selectedIndex];
    isSpinning.value = false;
    showResult.value = true;
  }, 2000);
};

const confirmResult = () => {
  if (selectedItem.value) {
    history.value.unshift({
      name: selectedItem.value.name,
      timestamp: Date.now(),
    });
    if (history.value.length > 100) history.value = history.value.slice(0, 100);
    saveData();
  }
  showResult.value = false;
};

const toggleCuisine = (cuisine: string) => {
  const idx = selectedCuisines.value.indexOf(cuisine);
  if (idx > -1) {
    if (selectedCuisines.value.length > 1)
      selectedCuisines.value.splice(idx, 1);
  } else selectedCuisines.value.push(cuisine);
};

const addCustomItem = () => {
  if (customInput.value.trim()) {
    customItems.value.push({
      name: customInput.value.trim(),
      cuisine: "自定义",
      budget: "medium",
    });
    customInput.value = "";
    saveData();
  }
};
const removeCustomItem = (index: number) => {
  customItems.value.splice(index, 1);
  saveData();
};
const resetSettings = () => {
  localStorage.removeItem("food-roulette-data");
  selectedBudget.value = "all";
  selectedCuisines.value = [...cuisineOptions];
  customItems.value = [];
  history.value = [];
  showSettings.value = false;
};
const saveSettings = () => {
  saveData();
  showSettings.value = false;
};
const formatTime = (timestamp: number) => {
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  return `${days}天前`;
};
const saveData = () => {
  localStorage.setItem(
    "food-roulette-data",
    JSON.stringify({
      customItems: customItems.value,
      selectedBudget: selectedBudget.value,
      selectedCuisines: selectedCuisines.value,
      history: history.value,
    } as SaveData),
  );
};
const loadData = () => {
  const saved = localStorage.getItem("food-roulette-data");
  if (!saved) return;
  try {
    const data: SaveData = JSON.parse(saved);
    customItems.value = data.customItems || [];
    selectedBudget.value = data.selectedBudget || "all";
    selectedCuisines.value = data.selectedCuisines || [...cuisineOptions];
    history.value = data.history || [];
  } catch {
    /* ignore */
  }
};
onMounted(() => {
  loadData();
});
</script>

<style scoped lang="scss">
.food-roulette {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #fafafa;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 100;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, env(safe-area-inset-top));
  background: white;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;

  .back-btn,
  .settings-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    .icon {
      width: 20px;
      height: 20px;
      color: #374151;
    }
    &:active {
      transform: scale(0.95);
      background: #e5e7eb;
    }
  }

  .title {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
  }
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  gap: 24px;
  overflow-y: auto;
}

.roulette-container {
  position: relative;
  width: 280px;
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pointer {
  position: absolute;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  .pointer-arrow {
    width: 0;
    height: 0;
    border-left: 12px solid transparent;
    border-right: 12px solid transparent;
    border-top: 24px solid #ef4444;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  }
}

.roulette-wheel {
  position: absolute;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  transition: transform 2s cubic-bezier(0.25, 0.1, 0.25, 1);
  transform-origin: center center;
}

.roulette-item {
  position: absolute;
  top: 50%;
  left: 50%;
  pointer-events: none;
  .item-text {
    position: absolute;
    top: 0;
    left: 0;
    padding: 6px 10px;
    background: #d4a5a5;
    color: white;
    font-size: 13px;
    font-weight: 500;
    border-radius: 8px;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
    pointer-events: auto;
    transform: translate(-50%, -50%);
  }
}

.center-circle {
  position: absolute;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #ffa200;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 5;
  .center-icon {
    width: 36px;
    height: 36px;
    color: white;
  }
}

.start-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 48px;
  background: #d4a5a5;
  color: white;
  font-size: 18px;
  font-weight: 700;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(212, 165, 165, 0.4);
  transition: all 0.2s;
  &:active:not(:disabled) {
    transform: scale(0.95);
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.bottom-actions {
  display: flex;
  gap: 16px;
  .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 12px 24px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--color-primary, #7dd3a8);
    span:last-child {
      font-size: 12px;
      color: #6b7280;
    }
    &:active {
      transform: scale(0.95);
      background: #f9fafb;
    }
  }
}

.result-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.result-content {
  background: white;
  border-radius: 24px;
  padding: 32px;
  max-width: 320px;
  width: 100%;
  max-height: calc(100vh - 40px);
  max-height: calc(100dvh - 40px);
  overflow-y: auto;
  text-align: center;
  h2 {
    font-size: 24px;
    margin: 16px 0;
    color: #1f2937;
  }
  .result-name {
    font-size: 32px;
    font-weight: 700;
    color: var(--color-primary, #7dd3a8);
    margin: 16px 0;
  }
  .result-hint {
    font-size: 14px;
    color: #6b7280;
    margin: 8px 0 24px;
  }
  .confirm-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    font-size: 16px;
    font-weight: 600;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    &:active {
      transform: scale(0.95);
    }
  }
}

.settings-overlay,
.history-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
}

.settings-content,
.history-content {
  background: white;
  border-radius: 24px 24px 0 0;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  max-height: 80dvh;
  display: flex;
  flex-direction: column;

  .settings-header,
  .history-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    border-bottom: 1px solid #e5e7eb;
    h3 {
      font-size: 18px;
      font-weight: 700;
      margin: 0;
    }
    .close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: none;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
  }

  .settings-body,
  .history-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    padding-bottom: max(20px, calc(20px + var(--safe-bottom, 0px)));
  }

  .settings-footer {
    padding: 16px 20px;
    padding-bottom: max(16px, calc(16px + var(--safe-bottom, 0px)));
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 12px;

    .reset-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px;
      background: white;
      border: 2px solid #e5e7eb;
      color: #6b7280;
      font-size: 16px;
      font-weight: 600;
      border-radius: 12px;
      cursor: pointer;
      min-width: 120px;
      &:active {
        background: #f9fafb;
      }
    }
    .save-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px;
      background: var(--color-primary, #7dd3a8);
      color: white;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 12px;
      cursor: pointer;
    }
  }
}

.setting-section {
  margin-bottom: 24px;
  h4 {
    font-size: 14px;
    font-weight: 600;
    color: #6b7280;
    margin: 0 0 12px;
  }
  .budget-options,
  .cuisine-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .budget-btn,
  .cuisine-btn {
    padding: 8px 16px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 20px;
    font-size: 14px;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s;
    &.active {
      border-color: var(--color-primary, #7dd3a8);
      background: var(--color-primary, #7dd3a8);
      color: white;
    }
  }
  .custom-input {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    input {
      flex: 1;
      padding: 10px 14px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      font-size: 14px;
      &:focus {
        outline: none;
        border-color: var(--color-primary, #7dd3a8);
      }
    }
    .add-btn {
      width: 44px;
      height: 44px;
      background: var(--color-primary, #7dd3a8);
      border: none;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: white;
    }
  }
  .custom-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .custom-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #f9fafb;
    border-radius: 12px;
    .remove-btn {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: #ef4444;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: white;
    }
  }
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #9ca3af;
  p {
    font-size: 14px;
    margin: 12px 0 0;
  }
}

.history-item {
  padding: 16px;
  background: #f9fafb;
  border-radius: 12px;
  margin-bottom: 12px;
  .food-name {
    font-size: 16px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 4px;
  }
  .history-time {
    font-size: 12px;
    color: #9ca3af;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
