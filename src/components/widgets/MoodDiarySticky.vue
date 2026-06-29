<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { Frown, Heart, Meh, Smile, Sparkles } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    content?: string;
    mood?: "happy" | "sad" | "neutral" | "love" | "excited";
    color?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

// 便籤顏色選項
const colors = [
  "#fef3c7", // 黃
  "#fce7f3", // 粉
  "#dbeafe", // 藍
  "#d1fae5", // 綠
  "#ede9fe", // 紫
];

const content = ref(props.data?.content || "");
const mood = ref(props.data?.mood || "happy");
const selectedColor = ref(props.data?.color || colors[0]);

// 監聽數據變化並保存到 store
watch(
  [content, mood, selectedColor],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      content: content.value,
      mood: mood.value,
      color: selectedColor.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

const moodIcons = {
  happy: Smile,
  sad: Frown,
  neutral: Meh,
  love: Heart,
  excited: Sparkles,
};

const currentMoodIcon = computed(() => moodIcons[mood.value]);

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  // 珍珠／線描風格由 SCSS 完整控制配色，不套用 inline 背景
  if (customStyle?.layout === "pearl" || customStyle?.layout === "lineart") {
    return style;
  }

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.background = customStyle.backgroundColor;
  } else {
    // 使用預設選擇的顏色
    style.background = selectedColor.value;
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

  // 珍珠／線描風格文字色由 SCSS 控制，不套用 inline 文字色
  if (customStyle?.layout === "pearl" || customStyle?.layout === "lineart") {
    return style;
  }

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

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "classic";
});
</script>

<template>
  <div
    class="mood-diary-sticky"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <div class="sticky-header" :style="textStyle">
      <component
        :is="currentMoodIcon"
        :size="20"
        :stroke-width="2"
        class="mood-icon"
      />
      <span class="date">{{ new Date().toLocaleDateString("zh-TW") }}</span>
    </div>

    <textarea
      v-model="content"
      class="diary-content"
      :style="textStyle"
      placeholder="寫下今天的心情..."
    ></textarea>

    <div class="sticky-footer">
      <div class="mood-selector">
        <button
          v-for="(icon, key) in moodIcons"
          :key="key"
          :class="['mood-btn', { active: mood === key }]"
          @click="mood = key as any"
        >
          <component :is="icon" :size="14" :stroke-width="2" />
        </button>
      </div>
    </div>

    <!-- 裝飾膠帶 -->
    <div class="tape"></div>
  </div>
</template>

<style lang="scss" scoped>
.mood-diary-sticky {
  width: 100%;
  height: 100%;
  padding: 16px;
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  
  // Classic 傳統樣式
  &.classic {
    border-radius: 4px;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1), inset 0 0 40px rgba(255, 255, 255, 0.3);
    font-family: "Comic Sans MS", cursive, sans-serif;
    
    .tape {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 60px;
      height: 20px;
      background: rgba(255, 255, 255, 0.7);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      z-index: 2;
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: rgba(0, 0, 0, 0.6);
      }

      .date {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.5);
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
      font-family: inherit;
      z-index: 1;

      &::placeholder {
        color: rgba(0, 0, 0, 0.3);
      }

      &:focus {
        outline: none;
      }
    }

    .sticky-footer {
      margin-top: 8px;
      z-index: 1;
    }

    .mood-selector {
      display: flex;
      gap: 4px;

      .mood-btn {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(0, 0, 0, 0.4);
        background: transparent;
        transition: all 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        &.active {
          color: rgba(0, 0, 0, 0.8);
          background: rgba(255, 255, 255, 0.8);
          transform: scale(1.1);
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    border-radius: 16px;
    border: 2px solid #1a1a1a;
    box-shadow: 3px 3px 0px #1a1a1a;
    font-family: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    
    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.8);
    }
    
    .tape {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 70px;
      height: 24px;
      background: #fcfcfc;
      border: 2px solid #1a1a1a;
      border-radius: 0px;
      box-shadow: 2px 2px 0px #1a1a1a;
      z-index: 2;
      
      &::after {
        content: '';
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: 4px;
        right: 4px;
        border: 1px dashed rgba(26, 26, 26, 0.3);
      }
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: #1a1a1a;
        filter: drop-shadow(1px 1px 0px rgba(255,255,255,0.5));
      }

      .date {
        font-size: 11px;
        font-weight: 800;
        color: #1a1a1a;
        background: rgba(255, 255, 255, 0.6);
        padding: 2px 8px;
        border-radius: 8px;
        border: 1.5px solid #1a1a1a;
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.6;
      color: #1a1a1a;
      font-family: inherit;
      z-index: 1;

      &::placeholder {
        color: rgba(26, 26, 26, 0.4);
        font-style: italic;
      }

      &:focus {
        outline: none;
      }
      
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: #1a1a1a;
        border-radius: 3px;
      }
    }

    .sticky-footer {
      margin-top: 8px;
      z-index: 1;
    }

    .mood-selector {
      display: flex;
      gap: 6px;

      .mood-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(26, 26, 26, 0.6);
        background: rgba(255, 255, 255, 0.5);
        border: 2px solid transparent;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: scale(1.1);
          border-color: rgba(26, 26, 26, 0.2);
        }

        &.active {
          color: #1a1a1a;
          background: #ffeb3b;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: scale(1.1);
        }
      }
    }
  }

  // 平面風
  &.flat {
    background-color: #fef08a; // Warm yellow
    border-radius: 24px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    padding: 24px;
    
    .tape { display: none; } // Flat design avoids realistic tape

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
      .mood-icon { color: #332650; }
      .date { font-size: 14px; font-weight: 800; color: #332650; }
    }

    .diary-content {
      flex: 1; width: 100%; border: none; background: transparent; resize: none;
      font-size: 15px; font-weight: 700; color: #332650; line-height: 1.6;
      &::placeholder { color: rgba(51, 38, 80, 0.4); }
      &:focus { outline: none; }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 8px; justify-content: flex-end;
      .mood-btn {
        width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: white; border: 3px solid #332650; color: #332650; transition: transform 0.2s;
        &:hover { transform: scale(1.1); }
        &.active { background: #A7F3D0; box-shadow: 0 4px 0px #332650; transform: translateY(-4px); }
      }
    }
  }

  // 插圖風
  &.illustration {
    background-color: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding: 34px 16px 16px;
    position: relative;

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1);
    }
    .tape { display: none; }

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      .mood-icon { color: #1a1a1a; }
      .date { font-size: 13px; font-weight: 800; color: #1a1a1a; background: white; padding: 2px 8px; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; }
    }

    .diary-content {
      flex: 1; width: 100%; border: 2px solid #1a1a1a; background: white; resize: none;
      font-size: 14px; font-weight: 700; color: #1a1a1a; line-height: 1.6; padding: 8px;
      &:focus { outline: none; }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 6px;
      .mood-btn {
        width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
        background: white; border: 2px solid #1a1a1a; color: #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; transition: all 0.1s;
        &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; }
        &.active { background: #B0D0DB; }
      }
    }
  }

  // 像素風
  &.pixel {
    background-color: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    padding: 34px 16px 16px;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'MOOD.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5;
    }
    .tape { display: none; }

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      .mood-icon { color: #d06d9a; }
      .date { font-size: 14px; font-weight: bold; color: #d06d9a; }
    }

    .diary-content {
      flex: 1; width: 100%; border: 2px dashed #EAA3C5; background: white; resize: none;
      font-size: 14px; font-weight: 600; color: #d06d9a; line-height: 1.6; padding: 8px; font-family: inherit;
      &:focus { outline: none; border-style: solid; box-shadow: inset 1px 1px 3px rgba(0,0,0,0.05); }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 6px; justify-content: flex-end;
      .mood-btn {
        width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
        background: white; border: 2px solid #EAA3C5; color: #F4A2C5; box-shadow: 2px 2px 0px #F5C6DA; transition: all 0.1s;
        &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #F5C6DA; }
        &.active { background: #93E2B6; color: white; border-color: #93E2B6; }
      }
    }
  }

  // 珍珠畫廊風（維梅爾《戴珍珠耳環的少女》幾何拼貼）
  &.pearl {
    background: linear-gradient(155deg, #3E3A58 0%, #332D4B 100%);
    border: 2px solid #FFCE05;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(51, 45, 75, 0.45), inset 0 0 0 1px rgba(255, 206, 5, 0.18);
    position: relative;
    overflow: hidden;

    // 右上角靜態星光（mustard + 藍色衣領 + 溫暖膚色）
    &::before {
      content: '';
      position: absolute;
      top: 10px;
      right: 12px;
      width: 7px;
      height: 7px;
      background: radial-gradient(circle, rgba(255, 206, 5, 0.95) 0%, transparent 70%);
      box-shadow:
        0 0 6px 2px rgba(255, 206, 5, 0.5),
        -45px 25px 0 -2px rgba(71, 131, 222, 0.85),
        -45px 25px 6px 0 rgba(71, 131, 222, 0.4),
        18px 38px 0 -3px rgba(255, 198, 174, 0.75),
        18px 38px 5px -1px rgba(255, 198, 174, 0.35);
      border-radius: 50%;
      z-index: 0;
      pointer-events: none;
    }

    .sticky-header {
      position: relative;
      z-index: 1;
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
      .mood-icon { color: #FFCE05; }
      .date {
        font-family: Georgia, 'Times New Roman', serif;
        font-style: italic;
        font-size: 13px;
        font-weight: 700;
        color: #D4C8B0;
      }
    }

    .diary-content {
      position: relative;
      z-index: 1;
      flex: 1; width: 100%; border: none; resize: none;
      font-family: Georgia, 'Times New Roman', serif;
      font-style: italic;
      color: #F8F6F0;
      background: transparent;

      &::placeholder {
        color: rgba(248, 246, 240, 0.45);
        font-style: italic;
      }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      position: relative;
      z-index: 1;
      display: flex; gap: 6px; justify-content: flex-end;
      .mood-btn {
        width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: rgba(71, 131, 222, 0.18);
        border: 1.5px solid rgba(71, 131, 222, 0.6);
        color: #7BADEE;
        transition: all 0.2s;
        &:hover { border-color: #FFCE05; color: #FFCE05; }
        &.active { background: #FFCE05; border-color: #FFCE05; color: #332D4B; }
      }
    }
  }

  // 線描插畫風（純白底 + 黑細線手繪 + 零彩色）
  &.lineart {
    background: #ffffff;
    border: 1.5px solid #1a1a1a;
    border-radius: 14px;
    box-shadow: none;
    font-family: "Noto Serif TC", serif;

    .tape {
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 56px;
      height: 16px;
      background: #ffffff;
      border: 1.5px solid #1a1a1a;
      box-shadow: none;
      z-index: 2;
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: #1a1a1a;
      }

      .date {
        font-size: 12px;
        color: #1a1a1a;
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;

      &::placeholder {
        color: rgba(26, 26, 26, 0.35);
      }
      &:focus {
        outline: none;
      }
    }

    .sticky-footer {
      margin-top: 12px;
    }

    .mood-selector {
      display: flex;
      gap: 6px;
      justify-content: flex-end;

      .mood-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1.5px solid #1a1a1a;
        color: #1a1a1a;
        transition: all 0.15s;

        &.active {
          background: #1a1a1a;
          color: #ffffff;
        }
      }
    }
  }
}
</style>
