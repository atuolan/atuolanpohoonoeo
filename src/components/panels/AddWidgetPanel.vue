<script setup lang="ts">
import { useCanvasStore } from "@/stores";
import type { WidgetType } from "@/types";
import {
    Book,
    BookOpen,
    Calendar,
    CalendarClock,
    CheckSquare,
    Clock,
    Cloud,
    Disc3,
    Dumbbell,
    Gamepad2,
    Globe,
    HardHat,
    Image,
    LayoutGrid,
    Link2,
    // 新增組件圖標
    ListTodo,
    MessageCircle,
    Music,
    Quote,
    Settings,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    Smile,
    Sparkles,
    Timer,
    User,
    UserCircle,
    Wallet,
    X,
} from "lucide-vue-next";
import { ref } from "vue";

const emit = defineEmits<{
  close: [];
}>();

const canvasStore = useCanvasStore();

// 組件分類
const categories = [
  { id: "core", label: "核心" },
  { id: "app", label: "APP" },
  { id: "sticky", label: "便利貼" },
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
];

// 過濾組件
const filteredWidgets = ref(
  widgetDefs.filter((w) => w.category === activeCategory.value),
);

function selectCategory(id: string) {
  activeCategory.value = id;
  filteredWidgets.value = widgetDefs.filter((w) => w.category === id);
}

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

      <!-- 組件網格 -->
      <div class="widgets-grid">
        <div
          v-for="widget in filteredWidgets"
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

.widgets-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  padding-bottom: 20px;
  padding-right: 4px;
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

  .widget-name {
    font-size: 12px;
    color: #374151;
    font-weight: 500;
  }
}
</style>
