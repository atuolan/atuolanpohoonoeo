<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    text?: string;
    // 風格：手寫便條 / 霓虹標語 / 雜誌大字 / 緞帶橫幅
    layout?: "marker" | "neon" | "magazine" | "ribbon";
    align?: "left" | "center" | "right";
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const text = ref(props.data?.text || "Hello :)");
const isEditing = ref(false);
const textareaRef = ref<HTMLTextAreaElement | null>(null);

const currentLayout = computed(() => props.data?.layout || "magazine");
const align = computed(() => props.data?.align || "center");

watch(
  text,
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      text: text.value,
      layout: props.data?.layout,
      align: props.data?.align,
      customStyle: props.data?.customStyle,
    });
  },
);

function startEdit() {
  if (canvasStore.isEditMode) return;
  isEditing.value = true;
  nextTick(() => textareaRef.value?.focus());
}

function stopEdit() {
  isEditing.value = false;
}

const bannerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;

  if (cs?.backgroundGradient) {
    style.background = cs.backgroundGradient;
  } else if (cs?.backgroundColor) {
    style.background = cs.backgroundColor;
  }

  if (cs?.borderColor) {
    style.borderColor = cs.borderColor;
    style.borderWidth = `${cs.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const textStyle = computed(() => {
  const style: Record<string, string> = { textAlign: align.value };
  const cs = props.data?.customStyle;
  if (cs?.textColor) {
    style.color = cs.textColor;
  } else if (cs?.foregroundColor) {
    style.color = cs.foregroundColor;
  }
  return style;
});
</script>

<template>
  <div
    class="text-banner-widget"
    :class="[`layout-${currentLayout}`]"
    :style="bannerStyle"
    @dblclick="startEdit"
  >
    <textarea
      v-if="isEditing"
      ref="textareaRef"
      v-model="text"
      class="banner-input"
      :style="textStyle"
      @blur="stopEdit"
      @keydown.enter.exact.prevent="stopEdit"
    ></textarea>
    <span v-else class="banner-text" :style="textStyle">{{ text }}</span>
  </div>
</template>

<style lang="scss" scoped>
.text-banner-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  box-sizing: border-box;
  overflow: hidden;
}

.banner-text {
  width: 100%;
  word-break: break-word;
  white-space: pre-wrap;
  line-height: 1.2;
}

.banner-input {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  resize: none;
  font: inherit;
  color: inherit;
  text-align: inherit;
}

// 雜誌大字：粗體無襯線、緊湊字距
.layout-magazine {
  background: #f7f3ec;
  border-radius: 12px;
  .banner-text,
  .banner-input {
    font-family: "Arial Black", "Helvetica Neue", sans-serif;
    font-weight: 900;
    font-size: clamp(20px, 9cqw, 56px);
    letter-spacing: -0.02em;
    color: #1a1a1a;
    text-transform: uppercase;
  }
}

// 手寫便條：圓潤手寫感、紙張底
.layout-marker {
  background: #fffdf5;
  border-radius: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  .banner-text,
  .banner-input {
    font-family: "Comic Sans MS", "Segoe Print", cursive;
    font-weight: 700;
    font-size: clamp(16px, 7cqw, 40px);
    color: #4a4a4a;
  }
}

// 霓虹標語：深底 + 發光描邊
.layout-neon {
  background: #14141f;
  border-radius: 12px;
  .banner-text,
  .banner-input {
    font-family: "Helvetica Neue", sans-serif;
    font-weight: 800;
    font-size: clamp(18px, 8cqw, 48px);
    color: #fff;
    text-shadow:
      0 0 4px #ff4ecd,
      0 0 12px #ff4ecd,
      0 0 24px #c724ff;
  }
}

// 緞帶橫幅：斜切緞帶造型
.layout-ribbon {
  background: linear-gradient(135deg, #ff7b7b 0%, #ff5e62 100%);
  clip-path: polygon(0 0, 100% 0, 100% 70%, 50% 100%, 0 70%);
  border-radius: 6px;
  .banner-text,
  .banner-input {
    font-family: "Georgia", serif;
    font-weight: 700;
    font-size: clamp(16px, 7cqw, 38px);
    color: #fff;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  }
}
</style>
