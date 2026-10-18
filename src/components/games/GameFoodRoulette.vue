<template>
  <div class="food-roulette">
    <header class="header">
      <button class="round-btn" type="button" aria-label="返回" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <span class="header-title">轉轉飯堂</span>
      <button class="round-btn" type="button" aria-label="編輯選項" @click="showSettings = true">
        <Pencil class="icon icon-sm" />
      </button>
    </header>

    <div class="content">
      <div class="intro">
        <h1 class="title">今天吃什麼？</h1>
        <p class="subtitle">不用想了，交給轉盤決定</p>
      </div>

      <div class="chips" role="group" aria-label="預算">
        <button
          v-for="budget in budgetOptions"
          :key="budget.value"
          type="button"
          class="chip"
          :class="{ active: selectedBudget === budget.value }"
          :aria-pressed="selectedBudget === budget.value"
          :disabled="isSpinning"
          @click="pickBudget(budget.value)"
        >
          {{ budget.short }}
        </button>
        <button type="button" class="chip chip-ghost" :disabled="isSpinning" @click="showSettings = true">
          {{ cuisineChipLabel }}
          <ChevronDown class="chip-icon" />
        </button>
      </div>

      <!-- 轉盤 -->
      <div class="wheel-wrap">
        <svg class="pointer" viewBox="0 0 28 30" aria-hidden="true">
          <path d="M2 2h24L14 28z" fill="#121214" stroke="#FFFFFF" stroke-width="2.5" stroke-linejoin="round" />
        </svg>
        <div class="wheel-rim">
          <div
            class="wheel"
            :style="{ transform: `rotate(${rotation}deg)`, background: wheelGradient }"
          >
            <span
              v-for="(item, index) in currentItems"
              :key="`${item.name}-${index}`"
              class="slice-label"
              :style="{ transform: `rotate(${sliceAngle * index}deg)` }"
            >
              <span v-if="isVerticalLabel" class="slice-text vertical" :style="{ fontSize: `${labelFontSize}px` }">
                <span v-for="(ch, ci) in verticalChars(item.name)" :key="ci">{{ ch }}</span>
              </span>
              <span v-else class="slice-text" :style="{ fontSize: `${labelFontSize}px` }">
                {{ item.name }}
              </span>
            </span>
          </div>
        </div>
        <button
          class="spin-btn"
          type="button"
          aria-label="轉動轉盤"
          :disabled="isSpinning"
          @click="spin"
        >
          轉
        </button>
      </div>

      <!-- 結果 -->
      <section class="result-card" aria-live="polite">
        <span class="result-label">
          <template v-if="isSpinning">轉呀轉……</template>
          <template v-else-if="showResult">今天就吃</template>
          <template v-else-if="selectedItem">
            <Check class="result-check" />已記下，好好吃飯
          </template>
          <template v-else>還沒決定</template>
        </span>
        <span class="result-name">
          {{ isSpinning ? "……" : selectedItem ? selectedItem.name : "轉一下看看" }}
        </span>
        <span class="result-detail">
          <template v-if="isSpinning">等它停下來</template>
          <template v-else-if="selectedItem">{{ describeItem(selectedItem) }}</template>
          <template v-else>轉盤上有 {{ currentItems.length }} 個選項</template>
        </span>

        <div v-if="showResult && !isSpinning" class="result-actions">
          <button class="btn btn-outline" type="button" @click="spin">再轉一次</button>
          <button class="btn btn-dark" type="button" @click="confirmResult">就吃這個</button>
        </div>
        <div v-else class="result-actions single">
          <button class="btn btn-dark" type="button" :disabled="isSpinning" @click="spin">
            {{ selectedItem ? "再轉一次" : "開始轉" }}
          </button>
        </div>
      </section>

      <button v-if="history.length > 0" class="history-link" type="button" @click="showHistory = true">
        <History class="history-link-icon" />
        <span class="history-link-text">最近吃過：{{ recentHistoryNames }}</span>
        <ChevronRight class="history-link-icon" />
      </button>
    </div>

    <!-- 設定 -->
    <transition name="sheet">
      <div v-if="showSettings" class="sheet-overlay" @click="showSettings = false">
        <div class="sheet" role="dialog" aria-label="編輯選項" @click.stop>
          <span class="sheet-grabber" aria-hidden="true"></span>
          <div class="sheet-header">
            <h3>編輯選項</h3>
            <button class="round-btn small" type="button" aria-label="關閉" @click="showSettings = false">
              <X class="icon icon-sm" />
            </button>
          </div>
          <div class="sheet-body">
            <div class="setting-section">
              <h4>預算</h4>
              <div class="option-grid">
                <button
                  v-for="budget in budgetOptions"
                  :key="budget.value"
                  type="button"
                  class="chip"
                  :class="{ active: selectedBudget === budget.value }"
                  :aria-pressed="selectedBudget === budget.value"
                  @click="selectedBudget = budget.value"
                >
                  {{ budget.label }}
                </button>
              </div>
            </div>
            <div class="setting-section">
              <h4>菜系</h4>
              <div class="option-grid">
                <button
                  v-for="cuisine in cuisineOptions"
                  :key="cuisine"
                  type="button"
                  class="chip"
                  :class="{ active: selectedCuisines.includes(cuisine) }"
                  :aria-pressed="selectedCuisines.includes(cuisine)"
                  @click="toggleCuisine(cuisine)"
                >
                  {{ cuisine }}
                </button>
              </div>
            </div>
            <div class="setting-section">
              <h4>自己加</h4>
              <div class="custom-input">
                <input
                  v-model="customInput"
                  type="text"
                  aria-label="餐廳或菜名"
                  placeholder="輸入餐廳或菜名"
                  @keyup.enter="addCustomItem"
                />
                <button class="add-btn" type="button" aria-label="加入" @click="addCustomItem">
                  <Plus class="icon" />
                </button>
              </div>
              <ul v-if="customItems.length > 0" class="custom-list">
                <li v-for="(item, index) in customItems" :key="index" class="custom-item">
                  <span>{{ item.name }}</span>
                  <button class="remove-btn" type="button" :aria-label="`移除 ${item.name}`" @click="removeCustomItem(index)">
                    <X class="icon icon-xs" />
                  </button>
                </li>
              </ul>
            </div>
          </div>
          <div class="sheet-footer">
            <button class="btn btn-outline" type="button" @click="resetSettings">
              <RefreshCw class="icon icon-xs" /> 重置
            </button>
            <button class="btn btn-dark" type="button" @click="saveSettings">
              <Check class="icon icon-xs" /> 保存
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- 歷史 -->
    <transition name="sheet">
      <div v-if="showHistory" class="sheet-overlay" @click="showHistory = false">
        <div class="sheet" role="dialog" aria-label="吃過的紀錄" @click.stop>
          <span class="sheet-grabber" aria-hidden="true"></span>
          <div class="sheet-header">
            <h3>吃過的紀錄</h3>
            <button class="round-btn small" type="button" aria-label="關閉" @click="showHistory = false">
              <X class="icon icon-sm" />
            </button>
          </div>
          <div class="sheet-body">
            <p v-if="history.length === 0" class="empty-state">還沒有紀錄，轉一次試試</p>
            <ul v-else class="history-list">
              <li v-for="(record, index) in history" :key="index" class="history-item">
                <span class="food-name">{{ record.name }}</span>
                <span class="history-time">{{ formatTime(record.timestamp) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import {
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    History,
    Pencil,
    Plus,
    RefreshCw,
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
  { label: "不限", short: "不限預算", value: "all" },
  { label: "便宜 (<30元)", short: "便宜", value: "cheap" },
  { label: "中等 (30-80元)", short: "中等", value: "medium" },
  { label: "貴 (>80元)", short: "吃好一點", value: "expensive" },
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

// ===== 轉盤外觀 =====

const SLICE_COLORS = ["#F6D8C1", "#FFFFFF"];
const SLICE_COLORS_ODD = ["#F6D8C1", "#FFFFFF", "#FBE7D6"];

/** 每一格的角度；第 i 格的中心在 i * sliceAngle（從正上方順時針算） */
const sliceAngle = computed(() => 360 / currentItems.value.length);

const wheelGradient = computed(() => {
  const n = currentItems.value.length;
  if (n <= 1) return SLICE_COLORS[0];
  const colors = n % 2 === 0 ? SLICE_COLORS : SLICE_COLORS_ODD;
  const a = sliceAngle.value;
  const stops = currentItems.value.map((_, i) => {
    const c = colors[i % colors.length];
    return `${c} ${i * a}deg ${(i + 1) * a}deg`;
  });
  return `conic-gradient(from ${-a / 2}deg, ${stops.join(", ")})`;
});

/** 格子少時橫排，格子多時改直排（沿半徑） */
const isVerticalLabel = computed(() => currentItems.value.length > 8);

/** 直排時一個字一行，太長就截斷 */
const VERTICAL_MAX_CHARS = 5;
const verticalChars = (name: string) => {
  const chars = Array.from(name);
  return chars.length > VERTICAL_MAX_CHARS
    ? [...chars.slice(0, VERTICAL_MAX_CHARS - 1), "⋮"]
    : chars;
};

const labelFontSize = computed(() => {
  const n = currentItems.value.length;
  if (n <= 8) return 14;
  if (n <= 16) return 13;
  if (n <= 24) return 12;
  return 11;
});

const cuisineChipLabel = computed(() =>
  selectedCuisines.value.length >= cuisineOptions.length
    ? "全部菜系"
    : `${selectedCuisines.value.length} 種菜系`,
);

const recentHistoryNames = computed(() =>
  history.value
    .slice(0, 3)
    .map((r) => r.name)
    .join("、"),
);

const describeItem = (item: FoodItem) => {
  const budget = budgetOptions.find((b) => b.value === item.budget);
  return budget && budget.value !== "all"
    ? `${item.cuisine} · ${budget.label}`
    : item.cuisine;
};

const pickBudget = (value: string) => {
  selectedBudget.value = value;
  saveData();
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
  --fr-bg: #fbf1ea;
  --fr-surface: #ffffff;
  --fr-text: #121214;
  --fr-text-2: #5e5e64;
  --fr-line: #e9d8cb;
  --fr-accent: #c8551f;

  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--fr-bg);
  color: var(--fr-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    cursor: default;
  }
}

.icon {
  width: 20px;
  height: 20px;
}

.icon-sm {
  width: 18px;
  height: 18px;
}

.icon-xs {
  width: 16px;
  height: 16px;
}

.round-btn {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  background: var(--fr-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: transform 0.15s;

  &.small {
    width: 36px;
    height: 36px;
    background: var(--fr-bg);
  }

  &:active {
    transform: scale(0.94);
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 0;
  padding-top: max(12px, env(safe-area-inset-top));
  flex-shrink: 0;

  .header-title {
    font-size: 17px;
    font-weight: 700;
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 14px 20px;
  padding-bottom: max(24px, env(safe-area-inset-bottom));
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.intro {
  .title {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.25;
  }

  .subtitle {
    margin: 2px 0 0;
    font-size: 13px;
    color: var(--fr-text-2);
  }
}

/* ===== 篩選 chips ===== */
.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -20px;
  padding: 0 20px 2px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex-shrink: 0;
  height: 34px;
  padding: 0 12px;
  border-radius: 17px;
  border: 1px solid var(--fr-line);
  background: var(--fr-surface);
  font-size: 13px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  transition:
    background 0.15s,
    color 0.15s;

  &.active {
    border-color: var(--fr-text);
    background: var(--fr-text);
    color: #ffffff;
  }

  &:disabled {
    opacity: 0.5;
  }
}

.chip-icon {
  width: 14px;
  height: 14px;
}

/* ===== 轉盤 ===== */
.wheel-wrap {
  position: relative;
  align-self: center;
  width: min(300px, calc(100vw - 56px));
  aspect-ratio: 1;
  margin-top: 14px;
  flex-shrink: 0;
}

.pointer {
  position: absolute;
  top: -14px;
  left: 50%;
  width: 28px;
  height: 30px;
  margin-left: -14px;
  z-index: 2;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.18));
}

.wheel-rim {
  position: absolute;
  inset: 0;
  box-sizing: border-box;
  border-radius: 50%;
  background: var(--fr-surface);
  padding: 8px;
  box-shadow: 0 14px 30px rgba(120, 70, 30, 0.16);
}

.wheel {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  transition: transform 2s cubic-bezier(0.15, 0.85, 0.2, 1);
  will-change: transform;
}

.slice-label {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.slice-text {
  position: absolute;
  left: 50%;
  top: 13%;
  max-width: 34%;
  transform: translateX(-50%);
  font-weight: 700;
  line-height: 1.2;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.vertical {
    top: 5%;
    max-width: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.1;
  }
}

.spin-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 84px;
  height: 84px;
  margin: -42px 0 0 -42px;
  box-sizing: border-box;
  border-radius: 50%;
  border: 6px solid #ffffff;
  background: var(--fr-accent);
  color: #ffffff;
  font-size: 24px;
  font-weight: 700;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  transition: transform 0.15s;
  z-index: 2;

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  &:disabled {
    background: #d98a63;
  }
}

/* ===== 結果卡 ===== */
.result-card {
  background: var(--fr-surface);
  border-radius: 22px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.result-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--fr-text-2);
}

.result-check {
  width: 14px;
  height: 14px;
  color: var(--fr-accent);
}

.result-name {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  word-break: break-all;
}

.result-detail {
  font-size: 13px;
  color: #3a3a40;
}

.result-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;

  &.single {
    grid-template-columns: 1fr;
  }
}

.btn {
  height: 48px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.15s;

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.btn-outline {
  border: 1px solid var(--fr-line);
  background: var(--fr-surface);
}

.btn-dark {
  border: none;
  background: var(--fr-text);
  color: #ffffff;
}

.history-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 4px;
  border: none;
  background: none;
  color: var(--fr-text-2);
  font-size: 13px;
  text-align: left;
}

.history-link-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-link-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

/* ===== 底部面板 ===== */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 110;
  background: rgba(18, 18, 20, 0.42);
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 82vh;
  background: var(--fr-surface);
  border-radius: 28px 28px 0 0;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);
}

.sheet-grabber {
  align-self: center;
  width: 36px;
  height: 5px;
  margin-top: 10px;
  border-radius: 3px;
  background: #d6d5d0;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 20px 4px;

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }
}

.sheet-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 20px 16px;
}

.sheet-footer {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid #f0efeb;
}

.setting-section {
  margin-bottom: 20px;

  h4 {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 700;
  }
}

.option-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-input {
  display: flex;
  gap: 8px;

  input {
    flex: 1;
    min-width: 0;
    height: 44px;
    padding: 0 14px;
    border: 1px solid var(--fr-line);
    border-radius: 22px;
    background: var(--fr-bg);
    color: var(--fr-text);
    font: inherit;
    font-size: 15px;
    outline: none;

    &:focus {
      border-color: var(--fr-accent);
    }
  }

  .add-btn {
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: var(--fr-text);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.custom-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.custom-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 34px;
  padding: 0 4px 0 12px;
  border-radius: 17px;
  background: var(--fr-bg);
  font-size: 13px;

  .remove-btn {
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--fr-text-2);
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.empty-state {
  margin: 32px 0;
  text-align: center;
  font-size: 14px;
  color: var(--fr-text-2);
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  border-bottom: 1px solid #f0efeb;

  .food-name {
    font-size: 15px;
    font-weight: 500;
  }

  .history-time {
    font-size: 12px;
    color: var(--fr-text-2);
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: background 0.25s;

  .sheet {
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}

.sheet-enter-from,
.sheet-leave-to {
  background: rgba(18, 18, 20, 0);

  .sheet {
    transform: translateY(100%);
  }
}
</style>
