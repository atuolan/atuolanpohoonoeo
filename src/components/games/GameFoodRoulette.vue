<template>
  <div class="food-roulette">
    <header class="header">
      <button class="round-btn" type="button" aria-label="返回" @click="$emit('close')">
        <ChevronLeft class="icon" />
      </button>
      <span class="header-title">轉轉飯堂</span>
      <button class="round-btn" type="button" aria-label="編輯選項" :disabled="isSpinning" @click="openSettings">
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
          {{ budget.label }}
        </button>
        <button type="button" class="chip chip-ghost" :disabled="isSpinning" @click="openSettings">
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
            :style="{
              transform: `rotate(${rotation}deg)`,
              transitionDuration: `${SPIN_MS}ms`,
              background: wheelGradient,
            }"
            @transitionend="onWheelTransitionEnd"
          >
            <span
              v-for="(item, index) in wheelItems"
              :key="itemKey(item)"
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
          :disabled="isSpinning || wheelItems.length === 0"
          @click="spin"
        >
          轉
        </button>
        <button
          v-if="hasMoreThanWheel"
          class="round-btn shuffle-btn"
          type="button"
          aria-label="換一批"
          :disabled="isSpinning"
          @click="reshuffle"
        >
          <Shuffle class="icon icon-sm" />
        </button>
      </div>

      <!-- 結果 -->
      <section v-if="wheelItems.length === 0" class="result-card">
        <span class="result-label">沒有符合的選項</span>
        <span class="result-name">換個條件試試</span>
        <span class="result-detail">目前的預算和菜系篩不出任何東西</span>
        <div class="result-actions single">
          <button class="btn btn-dark" type="button" @click="loosenFilters">放寬條件</button>
        </div>
      </section>

      <section v-else class="result-card" aria-live="polite">
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
          <template v-else-if="hasMoreThanWheel">
            從 {{ currentItems.length }} 個選項裡挑了 {{ wheelItems.length }} 個，按右下角可以換一批
          </template>
          <template v-else>轉盤上有 {{ wheelItems.length }} 個選項</template>
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
                  :class="{ active: draftBudget === budget.value }"
                  :aria-pressed="draftBudget === budget.value"
                  @click="draftBudget = budget.value"
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
                  :class="{ active: draftCuisines.includes(cuisine) }"
                  :aria-pressed="draftCuisines.includes(cuisine)"
                  @click="toggleCuisine(cuisine)"
                >
                  {{ cuisine }}
                </button>
              </div>
            </div>
            <div class="setting-section">
              <h4>自己加</h4>
              <p class="setting-hint">自己加的不分預算，歸在「自訂」菜系</p>
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
              <RefreshCw class="icon icon-xs" /> 還原預設
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
            <button v-if="history.length > 0" class="clear-history" type="button" @click="clearHistory">
              清除紀錄
            </button>
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
    Shuffle,
    X,
} from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const emit = defineEmits<{ close: [] }>();

type Budget = "cheap" | "medium" | "expensive";
/** 自訂選項沒有預算，任何預算都會出現 */
type ItemBudget = Budget | "any";
type BudgetFilter = Budget | "all";

interface FoodItem {
  name: string;
  cuisine: string;
  budget: ItemBudget;
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

const STORAGE_KEY = "food-roulette-data";
const CUSTOM_CUISINE = "自訂";

const defaultFoodItems: FoodItem[] = [
  { name: "滷肉飯", cuisine: "台式", budget: "cheap" },
  { name: "牛肉麵", cuisine: "台式", budget: "medium" },
  { name: "便當", cuisine: "台式", budget: "cheap" },
  { name: "水餃", cuisine: "台式", budget: "cheap" },
  { name: "鹹酥雞", cuisine: "台式", budget: "cheap" },
  { name: "雞排", cuisine: "台式", budget: "cheap" },
  { name: "蚵仔煎", cuisine: "台式", budget: "cheap" },
  { name: "臭豆腐", cuisine: "台式", budget: "cheap" },
  { name: "小火鍋", cuisine: "台式", budget: "medium" },
  { name: "熱炒", cuisine: "台式", budget: "medium" },
  { name: "川菜", cuisine: "中式", budget: "medium" },
  { name: "港式燒臘", cuisine: "中式", budget: "medium" },
  { name: "小籠包", cuisine: "中式", budget: "medium" },
  { name: "麻辣燙", cuisine: "中式", budget: "cheap" },
  { name: "酸菜魚", cuisine: "中式", budget: "medium" },
  { name: "拉麵", cuisine: "日式", budget: "medium" },
  { name: "丼飯", cuisine: "日式", budget: "medium" },
  { name: "咖哩飯", cuisine: "日式", budget: "medium" },
  { name: "壽司", cuisine: "日式", budget: "expensive" },
  { name: "燒肉", cuisine: "日式", budget: "expensive" },
  { name: "韓式炸雞", cuisine: "韓式", budget: "medium" },
  { name: "石鍋拌飯", cuisine: "韓式", budget: "medium" },
  { name: "部隊鍋", cuisine: "韓式", budget: "medium" },
  { name: "韓式烤肉", cuisine: "韓式", budget: "expensive" },
  { name: "義大利麵", cuisine: "西式", budget: "medium" },
  { name: "披薩", cuisine: "西式", budget: "medium" },
  { name: "早午餐", cuisine: "西式", budget: "medium" },
  { name: "牛排", cuisine: "西式", budget: "expensive" },
  { name: "泰式料理", cuisine: "東南亞", budget: "medium" },
  { name: "越南河粉", cuisine: "東南亞", budget: "medium" },
  { name: "印度咖哩", cuisine: "東南亞", budget: "medium" },
  { name: "麥當勞", cuisine: "速食", budget: "cheap" },
  { name: "肯德基", cuisine: "速食", budget: "cheap" },
  { name: "摩斯漢堡", cuisine: "速食", budget: "cheap" },
  { name: "潛艇堡", cuisine: "速食", budget: "cheap" },
];

const budgetOptions: { label: string; value: BudgetFilter }[] = [
  { label: "不限預算", value: "all" },
  { label: "便宜", value: "cheap" },
  { label: "中等", value: "medium" },
  { label: "吃好一點", value: "expensive" },
];
const cuisineOptions = [
  "台式",
  "中式",
  "日式",
  "韓式",
  "西式",
  "東南亞",
  "速食",
  CUSTOM_CUISINE,
];

/** 轉盤上最多放幾格，選項更多時每批抽這麼多 */
const WHEEL_SIZE = 10;
/** 幾天內吃過的，抽一批時排到後面 */
const RECENT_DAYS = 3;
/** 轉動時間（毫秒），CSS transition 也用這個值 */
const SPIN_MS = 3200;
const MAX_HISTORY = 100;

const isSpinning = ref(false);
const rotation = ref(0);
/** 有結果但還沒按「就吃這個」 */
const showResult = ref(false);
const showSettings = ref(false);
const showHistory = ref(false);
const selectedItem = ref<FoodItem | null>(null);
const selectedBudget = ref<BudgetFilter>("all");
const selectedCuisines = ref<string[]>([...cuisineOptions]);
const customItems = ref<FoodItem[]>([]);
const customInput = ref("");
const history = ref<HistoryRecord[]>([]);
/** 目前轉盤上的這一批 */
const wheelItems = ref<FoodItem[]>([]);

// 設定面板裡的草稿，按「保存」才生效
const draftBudget = ref<BudgetFilter>("all");
const draftCuisines = ref<string[]>([]);

let pendingIndex = -1;
let spinFallbackTimer: ReturnType<typeof setTimeout> | null = null;

/** 符合目前預算＋菜系的所有選項 */
const currentItems = computed(() =>
  [...defaultFoodItems, ...customItems.value].filter(
    (i) =>
      selectedCuisines.value.includes(i.cuisine) &&
      (selectedBudget.value === "all" ||
        i.budget === "any" ||
        i.budget === selectedBudget.value),
  ),
);

const itemKey = (i: FoodItem) => `${i.cuisine}:${i.name}`;

const hasMoreThanWheel = computed(
  () => currentItems.value.length > wheelItems.value.length,
);

// ===== 轉盤外觀 =====

const SLICE_COLORS = ["#F6D8C1", "#FFFFFF"];
const SLICE_COLORS_ODD = ["#F6D8C1", "#FFFFFF", "#FBE7D6"];

/** 每一格的角度；第 i 格的中心在 i * sliceAngle（從正上方順時針算） */
const sliceAngle = computed(() => 360 / Math.max(wheelItems.value.length, 1));

const wheelGradient = computed(() => {
  const n = wheelItems.value.length;
  if (n <= 1) return SLICE_COLORS[0];
  const colors = n % 2 === 0 ? SLICE_COLORS : SLICE_COLORS_ODD;
  const a = sliceAngle.value;
  const stops = wheelItems.value.map((_, i) => {
    const c = colors[i % colors.length];
    return `${c} ${i * a}deg ${(i + 1) * a}deg`;
  });
  return `conic-gradient(from ${-a / 2}deg, ${stops.join(", ")})`;
});

/** 格子少時橫排，格子多時改直排（沿半徑） */
const isVerticalLabel = computed(() => wheelItems.value.length > 8);

/** 直排時一個字一行，太長就截斷 */
const VERTICAL_MAX_CHARS = 5;
const verticalChars = (name: string) => {
  const chars = Array.from(name);
  return chars.length > VERTICAL_MAX_CHARS
    ? [...chars.slice(0, VERTICAL_MAX_CHARS - 1), "⋮"]
    : chars;
};

const labelFontSize = computed(() => (wheelItems.value.length <= 8 ? 14 : 13));

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
  return budget ? `${item.cuisine} · ${budget.label}` : item.cuisine;
};

// ===== 抽一批放上轉盤 =====

const shuffle = <T,>(list: T[]): T[] => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const recentlyEaten = () => {
  const since = Date.now() - RECENT_DAYS * 86400000;
  return new Set(
    history.value.filter((r) => r.timestamp >= since).map((r) => r.name),
  );
};

/** 選項不多就全放；太多就抽 WHEEL_SIZE 個，最近吃過的排後面 */
const refreshWheel = () => {
  const pool = currentItems.value;
  if (pool.length <= WHEEL_SIZE) {
    wheelItems.value = [...pool];
    return;
  }
  const recent = recentlyEaten();
  const fresh = shuffle(pool.filter((i) => !recent.has(i.name)));
  const eaten = shuffle(pool.filter((i) => recent.has(i.name)));
  wheelItems.value = [...fresh, ...eaten].slice(0, WHEEL_SIZE);
};

watch(currentItems, () => {
  if (!isSpinning.value) refreshWheel();
});

const reshuffle = () => {
  if (isSpinning.value) return;
  refreshWheel();
  showResult.value = false;
  selectedItem.value = null;
};

// ===== 轉動 =====

/** 先決定停在哪一格，再算出讓那一格停在指針正下方的角度 */
const spin = () => {
  const n = wheelItems.value.length;
  if (isSpinning.value || n === 0) return;

  // 再轉一次時避開剛剛那一格
  const candidates = wheelItems.value
    .map((item, i) => ({ item, i }))
    .filter(
      ({ item }) =>
        n === 1 ||
        !selectedItem.value ||
        itemKey(item) !== itemKey(selectedItem.value),
    );
  const pick = candidates[Math.floor(Math.random() * candidates.length)].i;

  const a = sliceAngle.value;
  const current = ((rotation.value % 360) + 360) % 360;
  const target = (((-pick * a) % 360) + 360) % 360;
  const jitter = (Math.random() - 0.5) * a * 0.6;
  const delta = ((target - current + 360) % 360) + jitter;

  pendingIndex = pick;
  showResult.value = false;
  isSpinning.value = true;
  rotation.value += 360 * 5 + delta;

  // transitionend 沒觸發時（分頁在背景等）的保險
  if (spinFallbackTimer) clearTimeout(spinFallbackTimer);
  spinFallbackTimer = setTimeout(finishSpin, SPIN_MS + 400);
};

const onWheelTransitionEnd = (e: TransitionEvent) => {
  if (e.target === e.currentTarget && e.propertyName === "transform") {
    finishSpin();
  }
};

const finishSpin = () => {
  if (!isSpinning.value) return;
  if (spinFallbackTimer) {
    clearTimeout(spinFallbackTimer);
    spinFallbackTimer = null;
  }
  selectedItem.value = wheelItems.value[pendingIndex] ?? null;
  isSpinning.value = false;
  showResult.value = !!selectedItem.value;
  // 轉動中被擋下的篩選變化，這時補上
  const valid = new Set(currentItems.value.map(itemKey));
  if (
    wheelItems.value.length === 0 ||
    wheelItems.value.some((i) => !valid.has(itemKey(i)))
  ) {
    refreshWheel();
  }
};

const confirmResult = () => {
  if (!selectedItem.value) return;
  history.value.unshift({
    name: selectedItem.value.name,
    timestamp: Date.now(),
  });
  if (history.value.length > MAX_HISTORY)
    history.value = history.value.slice(0, MAX_HISTORY);
  saveData();
  showResult.value = false;
};

// ===== 篩選與設定 =====

const pickBudget = (value: BudgetFilter) => {
  if (isSpinning.value) return;
  selectedBudget.value = value;
  saveData();
};

const loosenFilters = () => {
  selectedBudget.value = "all";
  selectedCuisines.value = [...cuisineOptions];
  saveData();
};

const openSettings = () => {
  if (isSpinning.value) return;
  draftBudget.value = selectedBudget.value;
  draftCuisines.value = [...selectedCuisines.value];
  showSettings.value = true;
};

const toggleCuisine = (cuisine: string) => {
  const idx = draftCuisines.value.indexOf(cuisine);
  if (idx > -1) {
    if (draftCuisines.value.length > 1) draftCuisines.value.splice(idx, 1);
  } else draftCuisines.value.push(cuisine);
};

const addCustomItem = () => {
  const name = customInput.value.trim();
  if (!name) return;
  customInput.value = "";
  if (customItems.value.some((i) => i.name === name)) return;
  customItems.value.push({ name, cuisine: CUSTOM_CUISINE, budget: "any" });
  saveData();
};
const removeCustomItem = (index: number) => {
  customItems.value.splice(index, 1);
  saveData();
};

/** 只把草稿的預算和菜系還原，自訂選項和紀錄都留著 */
const resetSettings = () => {
  draftBudget.value = "all";
  draftCuisines.value = [...cuisineOptions];
};
const saveSettings = () => {
  selectedBudget.value = draftBudget.value;
  selectedCuisines.value = [...draftCuisines.value];
  saveData();
  showSettings.value = false;
};

const clearHistory = () => {
  if (!confirm("確定要清除所有吃過的紀錄嗎？")) return;
  history.value = [];
  saveData();
};

const formatTime = (timestamp: number) => {
  const d = new Date(timestamp);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const days = Math.ceil((startOfToday - timestamp) / 86400000);
  if (timestamp >= startOfToday) return `今天 ${hm}`;
  if (days === 1) return `昨天 ${hm}`;
  return `${days} 天前`;
};

// ===== 存檔 =====

const saveData = () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        customItems: customItems.value,
        selectedBudget: selectedBudget.value,
        selectedCuisines: selectedCuisines.value,
        history: history.value,
      } as SaveData),
    );
  } catch {
    /* ignore */
  }
};

/** 讀檔，順便把舊版（簡體菜系、自訂選項固定「中等」）轉成新格式 */
const loadData = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const data: Partial<SaveData> = JSON.parse(saved);
    customItems.value = (data.customItems || [])
      .filter((i) => i && typeof i.name === "string" && i.name.trim())
      .map((i) => ({ name: i.name.trim(), cuisine: CUSTOM_CUISINE, budget: "any" }));
    const budget = data.selectedBudget as BudgetFilter;
    selectedBudget.value = budgetOptions.some((b) => b.value === budget)
      ? budget
      : "all";
    const cuisines = (data.selectedCuisines || []).filter((c) =>
      cuisineOptions.includes(c),
    );
    selectedCuisines.value = cuisines.length > 0 ? cuisines : [...cuisineOptions];
    history.value = Array.isArray(data.history) ? data.history : [];
  } catch {
    /* ignore */
  }
};

onMounted(() => {
  loadData();
  refreshWheel();
});

onBeforeUnmount(() => {
  if (spinFallbackTimer) clearTimeout(spinFallbackTimer);
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

  &:active:not(:disabled) {
    transform: scale(0.94);
  }

  &:disabled {
    opacity: 0.5;
  }
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px 0;
  padding-top: max(12px, var(--safe-area-inset-top, env(safe-area-inset-top)));
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
  padding-bottom: max(24px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
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
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.15, 0.85, 0.2, 1);
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

.shuffle-btn {
  position: absolute;
  right: -6px;
  bottom: -6px;
  z-index: 2;
  box-shadow: 0 4px 12px rgba(120, 70, 30, 0.16);

  &:disabled {
    opacity: 0.5;
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
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));
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

.setting-hint {
  margin: -4px 0 10px;
  font-size: 12px;
  color: var(--fr-text-2);
}

.clear-history {
  display: block;
  min-height: 44px;
  margin: 12px auto 0;
  padding: 0 16px;
  border: none;
  background: none;
  color: #b3261e;
  font-size: 14px;
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
