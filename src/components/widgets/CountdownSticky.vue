<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import dayjs from "dayjs";
import { CalendarClock, PartyPopper } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    title?: string;
    targetDate?: string;
    color?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const title = ref(props.data?.title || "重要日子");
const targetDate = ref(
  props.data?.targetDate || dayjs().add(7, "day").format("YYYY-MM-DD"),
);
const isEditing = ref(false);

// 監聽數據變化並保存到 store
watch(
  [title, targetDate],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      title: title.value,
      targetDate: targetDate.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

// 計算剩餘天數
const daysLeft = computed(() => {
  const target = dayjs(targetDate.value);
  const today = dayjs().startOf("day");
  const diff = target.diff(today, "day");
  return Math.max(0, diff);
});

// 計算顯示顏色
const themeColor = computed(() => {
  if (daysLeft.value === 0) return "#ef4444"; // 紅色
  if (daysLeft.value <= 3) return "#f59e0b"; // 橙色
  return "#6366f1"; // 紫色
});

// 格式化日期顯示
const dateDisplay = computed(() => {
  return dayjs(targetDate.value).format("YYYY/MM/DD");
});

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.backgroundColor = customStyle.backgroundColor;
  }

  if (customStyle?.borderColor) {
    style.borderColor = customStyle.borderColor;
    style.borderWidth = `${customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const textStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.textColor) {
    style.color = customStyle.textColor;
  } else if (customStyle?.foregroundColor) {
    style.color = customStyle.foregroundColor;
  }

  return style;
});

const hasCustomBackground = computed(() => {
  return !!(
    props.data?.customStyle?.backgroundColor ||
    props.data?.customStyle?.backgroundGradient
  );
});

// 使用自定義前景色或主題色
const displayColor = computed(() => {
  if (props.data?.customStyle?.textColor) {
    return props.data.customStyle.textColor;
  }
  if (props.data?.customStyle?.foregroundColor) {
    return props.data.customStyle.foregroundColor;
  }
  return themeColor.value;
});
</script>

<template>
  <div
    class="countdown-sticky"
    :class="{ 'has-custom-bg': hasCustomBackground }"
    :style="{ '--theme-color': displayColor, ...containerStyle }"
  >
    <!-- 編輯模式 -->
    <div v-if="isEditing" class="edit-overlay" @click.self="isEditing = false">
      <div class="edit-form">
        <input v-model="title" placeholder="標題" class="edit-input" />
        <input type="date" v-model="targetDate" class="edit-input" />
        <button @click="isEditing = false" class="save-btn">確定</button>
      </div>
    </div>

    <!-- 顯示模式 -->
    <div class="content" @dblclick="isEditing = true">
      <div class="header">
        <span class="title">{{ title }}</span>
        <button class="edit-trigger" @click="isEditing = true">
          <CalendarClock :size="14" />
        </button>
      </div>

      <div class="counter-body">
        <div v-if="daysLeft > 0" class="days-wrapper">
          <span class="number">{{ daysLeft }}</span>
          <span class="unit">天</span>
        </div>
        <div v-else class="celebration">
          <PartyPopper :size="32" class="party-icon" />
          <span>就是今天!</span>
        </div>
      </div>

      <div class="footer">
        <span class="target-date">{{ dateDisplay }}</span>
      </div>

      <!-- 裝飾性背景圓環 -->
      <div class="bg-circle c1"></div>
      <div class="bg-circle c2"></div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.countdown-sticky {
  width: 100%;
  height: 100%;
  background: white;
  border-radius: var(--radius-lg);
  overflow: hidden;
  position: relative;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  padding: 16px;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;

  .title {
    font-size: 14px;
    font-weight: 600;
    color: #4b5563;
    line-height: 1.4;
  }

  .edit-trigger {
    opacity: 0;
    transition: opacity 0.2s;
    color: #9ca3af;
    padding: 4px;

    &:hover {
      color: var(--theme-color);
    }
  }
}

.countdown-sticky:hover .edit-trigger {
  opacity: 1;
}

.counter-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;

  .days-wrapper {
    display: flex;
    align-items: baseline;
    gap: 4px;

    .number {
      font-size: 42px;
      font-weight: 800;
      color: var(--theme-color);
      line-height: 1;
      letter-spacing: -2px;
      text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.05);
    }

    .unit {
      font-size: 14px;
      color: #6b7280;
      font-weight: 500;
    }
  }

  .celebration {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--theme-color);
    font-weight: 700;
    animation: bounce 1s infinite;

    .party-icon {
      color: #f59e0b;
    }
  }
}

@keyframes bounce {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.footer {
  text-align: center;

  .target-date {
    font-size: 11px;
    color: #9ca3af;
    background: #f3f4f6;
    padding: 2px 8px;
    border-radius: 10px;
  }
}

// 裝飾背景
.bg-circle {
  position: absolute;
  border-radius: 50%;
  filter: blur(20px);
  z-index: 0;
  opacity: 0.4;

  &.c1 {
    width: 60px;
    height: 60px;
    background: var(--theme-color);
    top: -10px;
    right: -10px;
  }

  &.c2 {
    width: 40px;
    height: 40px;
    background: #f472b6;
    bottom: -10px;
    left: -10px;
  }
}

// 編輯表單
.edit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(5px);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-form {
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .edit-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 12px;

    &:focus {
      outline: none;
      border-color: var(--theme-color);
    }
  }

  .save-btn {
    padding: 6px;
    background: var(--theme-color);
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }
}
</style>
