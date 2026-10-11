<script setup lang="ts">
// Y2K 版型：果凍泡泡 App 圖標。點擊由宿主處理（導航），這裡不 emit。
import { computed } from "vue";
import type { ThemedAppProps } from "../types";

const props = defineProps<ThemedAppProps>();

// 代表色沒設定時用預設的天藍色；--y2ka-accent 供泡泡漸層與 color-mix 使用
const bubbleStyle = computed(() => ({
  "--y2ka-accent": props.accent || "#3FB4E0",
}));
// 使用者設定的文字色只套在標籤上
const labelStyle = computed(() => (props.color ? { color: props.color } : undefined));
</script>

<template>
  <div class="y2ka">
    <span class="y2ka-bubble" :style="bubbleStyle">
      <img v-if="customImageUrl" :src="customImageUrl" alt="" class="y2ka-img" />
      <component :is="icon" v-else :size="24" :stroke-width="2" class="y2ka-icon" aria-hidden="true" />
    </span>
    <span class="y2ka-label" :style="labelStyle">{{ label }}</span>
  </div>
</template>

<style lang="scss" scoped>
// 80×80 的方格，尺寸以 cqmin 為基準（格子是正方形）
.y2ka {
  container-type: size;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  // cq 單位不能用在宣告 container-type 的元素自己身上（會退回視窗單位、把標籤擠扁）
  gap: 3px;
  font-family: "Noto Sans TC", sans-serif;
}

// 果凍泡泡：左上白色高光 + accent 由上亮到下的漸層 + 內陰影與外影
.y2ka-bubble {
  position: relative;
  flex: 0 0 auto;
  width: 70cqmin;
  height: 70cqmin;
  box-sizing: border-box;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.85);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 32% 24%, #FFFFFF 0px, #FFFFFF 6.25cqmin, #FFFFFF00 18.75cqmin),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--y2ka-accent) 45%, white) 0%,
      var(--y2ka-accent) 100%
    );
  box-shadow:
    inset 0 -6px 10px rgba(0, 40, 100, 0.25),
    0 6px 12px -6px rgba(40, 80, 160, 0.6);
  color: #FFFFFF;
}

.y2ka-icon {
  width: 30cqmin;
  height: 30cqmin;
  color: #FFFFFF;
}

// 自訂圖片蓋滿泡泡（高光仍在圖片之下被蓋住，符合果凍圖示的實心感）
.y2ka-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

// 標籤：粗體、白色文字陰影
.y2ka-label {
  flex-shrink: 0;
  max-width: 100%;
  font-size: 15cqmin;
  line-height: 1.2;
  font-weight: 700;
  color: #2D1B4E;
  text-shadow: 0 1px 0 #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
