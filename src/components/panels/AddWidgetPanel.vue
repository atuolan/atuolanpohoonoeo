<script setup lang="ts">
import { useCanvasStore } from "@/stores";
import type { WidgetType } from "@/types";
import {
    Activity,
    BatteryMedium,
    Book,
    BookOpen,
    Calendar,
    CalendarClock,
    Camera,
    Check,
    CheckSquare,
    Clock,
    Cloud,
    Disc3,
    Dumbbell,
    Gamepad2,
    Gauge,
    Globe,
    HardHat,
    Heart,
    Image,
    LayoutGrid,
    Link2,
    // 新增組件圖標
    ListTodo,
    MessageCircle,
    Music,
    PawPrint,
    Quote,
    Scissors,
    Settings,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    Smile,
    Sparkles,
    Square,
    Sticker,
    Timer,
    Type,
    User,
    UserCircle,
    Wallet,
    X,
} from "lucide-vue-next";
import { computed, ref } from "vue";

const emit = defineEmits<{
  close: [];
}>();

const canvasStore = useCanvasStore();

// 組件分類
const categories = [
  { id: "core", label: "核心" },
  { id: "app", label: "APP" },
  { id: "sticky", label: "便利貼" },
  { id: "decoration", label: "裝飾" },
  { id: "character", label: "角色" },
];

const activeCategory = ref("core");

// 組件定義
interface WidgetDef {
  id: string; // 新增唯一標識
  type: WidgetType;
  name: string;
  icon: any;
  category: string;
  defaultWidth: number;
  defaultHeight: number;
  gradient: string;
  data?: any;
}

const widgetDefs: WidgetDef[] = [
  // 核心組件
  {
    id: "core-clock",
    type: "clock",
    name: "時鐘",
    icon: Clock,
    category: "core",
    defaultWidth: 14,
    defaultHeight: 7,
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  {
    id: "core-weather",
    type: "weather",
    name: "天氣",
    icon: Cloud,
    category: "core",
    defaultWidth: 10,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  },
  {
    id: "core-calendar",
    type: "calendar",
    name: "日曆",
    icon: Calendar,
    category: "core",
    defaultWidth: 14,
    defaultHeight: 16,
    gradient: "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
  },
  {
    id: "core-music",
    type: "music",
    name: "音樂",
    icon: Disc3,
    category: "core",
    defaultWidth: 14,
    defaultHeight: 6,
    gradient: "linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%)",
  },
  {
    id: "core-habit",
    type: "habit-tracker",
    name: "習慣",
    icon: ListTodo,
    category: "core",
    defaultWidth: 12,
    defaultHeight: 14,
    gradient: "linear-gradient(135deg, #22c55e 0%, #84cc16 100%)",
  },
  {
    id: "core-focus",
    type: "focus-timer",
    name: "專注",
    icon: Timer,
    category: "core",
    defaultWidth: 10,
    defaultHeight: 14,
    gradient: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
  },
  {
    id: "core-book",
    type: "world-book",
    name: "世界書",
    icon: Book,
    category: "core",
    defaultWidth: 14,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #fff9f0 0%, #fff 100%)",
  },
  {
    id: "core-phone",
    type: "char-phone",
    name: "角色手機",
    icon: Smartphone,
    category: "core",
    defaultWidth: 10,
    defaultHeight: 16,
    gradient: "linear-gradient(135deg, #e0e7ff 0%, #e0e7ff 100%)",
  },

  // 便利貼
  {
    id: "sticky-mood",
    type: "mood-diary",
    name: "心情日記",
    icon: Smile,
    category: "sticky",
    defaultWidth: 10,
    defaultHeight: 12,
    gradient: "linear-gradient(135deg, #fef3c7 0%, #fce7f3 100%)",
  },
  {
    id: "sticky-polaroid",
    type: "polaroid",
    name: "拍立得",
    icon: Image,
    category: "sticky",
    defaultWidth: 10,
    defaultHeight: 14,
    gradient: "linear-gradient(135deg, #f5f5f5 0%, #e0e0e0 100%)",
  },
  {
    id: "sticky-todo",
    type: "todo",
    name: "待辦事項",
    icon: CheckSquare,
    category: "sticky",
    defaultWidth: 10,
    defaultHeight: 12,
    gradient: "linear-gradient(135deg, #fef9c3 0%, #fef08a 100%)",
  },
  {
    id: "sticky-quote",
    type: "quote",
    name: "語錄",
    icon: Quote,
    category: "sticky",
    defaultWidth: 12,
    defaultHeight: 10,
    gradient: "linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%)",
  },
  {
    id: "sticky-countdown",
    type: "countdown",
    name: "倒數日",
    icon: CalendarClock,
    category: "sticky",
    defaultWidth: 8,
    defaultHeight: 10,
    gradient: "linear-gradient(135deg, #ddd6fe 0%, #c4b5fd 100%)",
  },
  {
    id: "sticky-bookmark",
    type: "bookmark",
    name: "書籤",
    icon: Link2,
    category: "sticky",
    defaultWidth: 8,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)",
  },

  // APP (流體按鈕)
  {
    id: "app-msg",
    type: "fluid-button",
    name: "訊息",
    icon: MessageCircle,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "1", label: "訊息" },
  },
  {
    id: "app-settings",
    type: "fluid-button",
    name: "設置",
    icon: Settings,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "2", label: "設置" },
  },
  {
    id: "app-space",
    type: "fluid-button",
    name: "空間",
    icon: Sparkles,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "3", label: "空間" },
  },
  {
    id: "app-music",
    type: "fluid-button",
    name: "音樂",
    icon: Music,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "4", label: "音樂" },
  },

  // 新增 APP
  {
    id: "app-fitness",
    type: "fluid-button",
    name: "健身",
    icon: Dumbbell,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "1", label: "健身" },
  },
  {
    id: "app-wallet",
    type: "fluid-button",
    name: "錢包",
    icon: Wallet,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "2", label: "錢包" },
  },
  {
    id: "app-gallery",
    type: "fluid-button",
    name: "相冊",
    icon: LayoutGrid,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "3", label: "相冊" },
  },
  {
    id: "app-browser",
    type: "fluid-button",
    name: "收藏",
    icon: Globe,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "4", label: "收藏" },
  },
  {
    id: "app-games",
    type: "fluid-button",
    name: "遊戲",
    icon: Gamepad2,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "1", label: "遊戲" },
  },
  {
    id: "app-delivery",
    type: "fluid-button",
    name: "外賣",
    icon: ShoppingBag,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "2", label: "外賣" },
  },
  {
    id: "app-shop",
    type: "fluid-button",
    name: "購物",
    icon: ShoppingCart,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "3", label: "購物" },
  },
  {
    id: "app-world",
    type: "fluid-button",
    name: "世界書",
    icon: Book,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "4", label: "世界書" },
  },
  {
    id: "app-character",
    type: "fluid-button",
    name: "角色",
    icon: UserCircle,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "1", label: "角色" },
  },
  {
    id: "app-user",
    type: "fluid-button",
    name: "使用者",
    icon: User,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "2", label: "使用者" },
  },
  {
    id: "app-peek",
    type: "fluid-button",
    name: "頭盔TA",
    icon: HardHat,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "3", label: "頭盔TA" },
  },
  {
    id: "app-reading",
    type: "fluid-button",
    name: "閱讀",
    icon: BookOpen,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)",
    data: { type: "4", label: "閱讀" },
  },
  {
    id: "app-bookshelf",
    type: "fluid-button",
    name: "書架",
    icon: Book,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)",
    data: { type: "5", label: "書架" },
  },
  {
    id: "app-fate",
    type: "fluid-button",
    name: "占卜",
    icon: Sparkles,
    category: "app",
    defaultWidth: 4,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #1a0b2e 0%, #4c1d95 100%)",
    data: { type: "1", label: "占卜" },
  },

  // 裝飾性組件
  {
    id: "decoration-progress-ring",
    type: "progress-ring",
    name: "活動環",
    icon: Activity,
    category: "decoration",
    defaultWidth: 14,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)",
    data: {
      layout: "activity",
      rings: [
        { label: "活動", value: 80, color: "#ff375f" },
        { label: "運動", value: 55, color: "#a3e635" },
        { label: "站立", value: 92, color: "#22d3ee" },
      ],
    },
  },
  {
    id: "decoration-color-block",
    type: "color-block",
    name: "漸層色塊",
    icon: Square,
    category: "decoration",
    defaultWidth: 8,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #ff9a9e 0%, #fbc2eb 100%)",
    data: { gradientId: "sunset", finish: "glossy" },
  },
  {
    id: "decoration-text-banner",
    type: "text-banner",
    name: "文字橫幅",
    icon: Type,
    category: "decoration",
    defaultWidth: 16,
    defaultHeight: 5,
    gradient: "linear-gradient(135deg, #f7f3ec 0%, #ebedee 100%)",
    data: { text: "Hello :)", layout: "magazine", align: "center" },
  },
  {
    id: "decoration-washi-tape",
    type: "washi-tape",
    name: "紙膠帶",
    icon: Scissors,
    category: "decoration",
    defaultWidth: 16,
    defaultHeight: 4,
    gradient: "linear-gradient(135deg, #ffd6e0 0%, #bfe3ff 100%)",
    data: { pattern: "stripe", rotation: -4 },
  },
  {
    id: "decoration-photo-frame",
    type: "photo-frame",
    name: "相框",
    icon: Camera,
    category: "decoration",
    defaultWidth: 10,
    defaultHeight: 12,
    gradient: "linear-gradient(135deg, #ffffff 0%, #f3f4f6 100%)",
    data: { frameStyle: "polaroid", caption: "" },
  },
  {
    id: "decoration-sticker",
    type: "sticker",
    name: "貼圖",
    icon: Sticker,
    category: "decoration",
    defaultWidth: 8,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)",
    data: { stickerUrl: "", rotation: 0 },
  },
  {
    id: "decoration-battery-ring",
    type: "battery-ring",
    name: "電量環",
    icon: BatteryMedium,
    category: "decoration",
    defaultWidth: 8,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #1c1c1e 0%, #2c2c2e 100%)",
    data: { percent: 72, label: "電量", layout: "ring" },
  },

  // 角色綁定組件
  {
    id: "character-relationship-counter",
    type: "relationship-counter",
    name: "紀念日",
    icon: Heart,
    category: "character",
    defaultWidth: 10,
    defaultHeight: 10,
    gradient: "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)",
    data: { layout: "days" },
  },
  {
    id: "character-affinity-meter",
    type: "affinity-meter",
    name: "好感度",
    icon: Gauge,
    category: "character",
    defaultWidth: 10,
    defaultHeight: 10,
    gradient: "linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)",
    data: { layout: "ring" },
  },
  {
    id: "character-recent-chat",
    type: "recent-chat",
    name: "最近聊天",
    icon: MessageCircle,
    category: "character",
    defaultWidth: 14,
    defaultHeight: 8,
    gradient: "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
    data: { layout: "bubble" },
  },
  {
    id: "character-char-status",
    type: "char-status",
    name: "角色狀態",
    icon: UserCircle,
    category: "character",
    defaultWidth: 12,
    defaultHeight: 14,
    gradient: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
    data: { layout: "card" },
  },
  {
    id: "character-companion-pet",
    type: "companion-pet",
    name: "養成寵物",
    icon: PawPrint,
    category: "character",
    defaultWidth: 10,
    defaultHeight: 12,
    gradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    data: { layout: "pet" },
  },
];

// 過濾組件
const filteredWidgets = computed(() =>
  widgetDefs.filter((w) => w.category === activeCategory.value),
);

function selectCategory(id: string) {
  activeCategory.value = id;
}

// 判斷某個組件定義是否已在畫布上
function isWidgetAdded(def: WidgetDef): boolean {
  if (def.type === "fluid-button") {
    return canvasStore.widgets.some(
      (w) => w.type === "fluid-button" && w.data?.label === def.data?.label,
    );
  }
  return canvasStore.widgets.some((w) => w.type === def.type);
}

// 已添加至桌面的組件
const addedFilteredWidgets = computed(() =>
  filteredWidgets.value.filter((w) => isWidgetAdded(w)),
);

// 未添加至桌面的組件
const notAddedFilteredWidgets = computed(() =>
  filteredWidgets.value.filter((w) => !isWidgetAdded(w)),
);

// 添加組件
function addWidget(def: WidgetDef) {
  // 計算新組件位置（在當前視窗中心）
  const viewportCenterX = canvasStore.scrollX + window.innerWidth / 2;
  const x =
    Math.round(viewportCenterX / canvasStore.gridSize) -
    Math.floor(def.defaultWidth / 2);
  const y =
    Math.round((window.innerHeight - 80) / 2 / canvasStore.gridSize) -
    Math.floor(def.defaultHeight / 2);

  canvasStore.addWidget({
    type: def.type,
    x: Math.max(0, x),
    y: Math.max(0, y),
    width: def.defaultWidth,
    height: def.defaultHeight,
    data: def.data || {},
  });

  emit("close");
}
</script>

<template>
  <div class="add-widget-panel">
    <div class="panel-backdrop" @click="emit('close')"></div>

    <div class="panel-content">
      <!-- 標題 -->
      <div class="panel-header">
        <h3>新增組件</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" :stroke-width="2" />
        </button>
      </div>

      <!-- 分類標籤 -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.id"
          :class="['tab', { active: activeCategory === cat.id }]"
          @click="selectCategory(cat.id)"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- 組件滾動區域 -->
      <div class="widgets-scroll-area">
        <!-- 桌面已有 -->
        <template v-if="addedFilteredWidgets.length > 0">
          <div class="section-header">
            <span class="section-dot section-dot--added"></span>
            桌面已有
          </div>
          <div class="widgets-grid">
            <div
              v-for="widget in addedFilteredWidgets"
              :key="widget.id"
              class="widget-card is-added"
              @click="addWidget(widget)"
            >
              <div class="widget-icon-wrap">
                <div class="widget-icon" :style="{ background: widget.gradient }">
                  <component :is="widget.icon" :size="28" :stroke-width="1.5" />
                </div>
                <div class="added-badge">
                  <Check :size="9" :stroke-width="3" />
                </div>
              </div>
              <span class="widget-name">{{ widget.name }}</span>
            </div>
          </div>
        </template>

        <!-- 可添加 -->
        <template v-if="notAddedFilteredWidgets.length > 0">
          <div class="section-header" :class="{ 'section-header--mt': addedFilteredWidgets.length > 0 }">
            <span class="section-dot section-dot--new"></span>
            可添加
          </div>
          <div class="widgets-grid">
            <div
              v-for="widget in notAddedFilteredWidgets"
              :key="widget.id"
              class="widget-card"
              @click="addWidget(widget)"
            >
              <div class="widget-icon" :style="{ background: widget.gradient }">
                <component :is="widget.icon" :size="28" :stroke-width="1.5" />
              </div>
              <span class="widget-name">{{ widget.name }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.add-widget-panel {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.panel-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(4px);
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.panel-content {
  position: relative;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  border-radius: 24px 24px 0 0;
  padding: 20px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: slideUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;

  h3 {
    font-size: 18px;
    font-weight: 700;
    color: #1f2937;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #f3f4f6;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
      color: #374151;
    }
  }
}

.category-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  flex-shrink: 0;

  .tab {
    padding: 8px 20px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    color: #6b7280;
    background: #f3f4f6;
    transition: all 0.2s;

    &:hover {
      background: #e5e7eb;
    }

    &.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
  }
}

.widgets-scroll-area {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: 20px;
  padding-right: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: #9ca3af;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 12px;

  &--mt {
    margin-top: 20px;
  }
}

.section-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &--added {
    background: #22c55e;
  }

  &--new {
    background: #a5b4fc;
  }
}

.widgets-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 4px;
}

.widget-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: rgba(99, 102, 241, 0.05);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }

  &.is-added {
    opacity: 0.6;

    &:hover {
      opacity: 0.85;
    }
  }

  .widget-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .widget-icon-wrap {
    position: relative;
    width: 56px;
    height: 56px;

    .widget-icon {
      width: 100%;
      height: 100%;
    }

    .added-badge {
      position: absolute;
      bottom: -3px;
      right: -3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #22c55e;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    }
  }

  .widget-name {
    font-size: 12px;
    color: #374151;
    font-weight: 500;
  }
}
</style>
