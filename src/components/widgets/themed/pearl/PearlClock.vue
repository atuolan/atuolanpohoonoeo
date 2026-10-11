<script setup lang="ts">
// 珍珠畫廊的時鐘：黃銅名牌，時間用 Cormorant Garamond 大字，日期月與日改用中文數字
import { computed } from "vue";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedClockProps } from "../types";

const props = defineProps<ThemedClockProps>();

// 只有真的用到珍珠時鐘才載入數字字體
useOnDemandFont(
  "aguaphone-pearl-font",
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&display=swap",
  computed(() => true),
);

const DIGITS = ["〇", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/** 1–99 轉中文數字（十、十一、二十三…） */
function toZh(n: number): string {
  if (n < 10) return DIGITS[n];
  if (n < 20) return "十" + (n % 10 ? DIGITS[n % 10] : "");
  if (n < 100) return DIGITS[Math.floor(n / 10)] + "十" + (n % 10 ? DIGITS[n % 10] : "");
  return String(n);
}

const timeText = computed(() => {
  const h = String(props.now.getHours()).padStart(2, "0");
  const m = String(props.now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
});

const dateText = computed(() => {
  const month = toZh(props.now.getMonth() + 1);
  const day = toZh(props.now.getDate());
  const week = WEEKDAYS[props.now.getDay()];
  return `${month}月${day}日・星期${week}`;
});
</script>

<template>
  <div class="pearl-clock" :style="color ? { color } : undefined">
    <div class="pearl-clock__plate">
      <span class="pearl-clock__screw pearl-clock__screw--tl" />
      <span class="pearl-clock__screw pearl-clock__screw--tr" />
      <span class="pearl-clock__screw pearl-clock__screw--bl" />
      <span class="pearl-clock__screw pearl-clock__screw--br" />
      <div class="pearl-clock__time">{{ timeText }}</div>
      <div v-if="showDate" class="pearl-clock__date">{{ dateText }}</div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子，並以容器單位讓字級跟著格子縮放
.pearl-clock {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  color: #3a2c10;
  font-family: "Noto Serif TC", serif;

  // 黃銅名牌底：金色漸層 + 頂緣高光
  &__plate {
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border-radius: 4px;
    background: linear-gradient(135deg, #e8cf8e 0%, #b8913f 45%, #e2c67e 70%, #9c7630 100%);
    box-shadow: inset 0 1px 0 #fff6d9, 0 12px 22px -10px #000000cc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  // 四角螺絲
  &__screw {
    position: absolute;
    width: 5px;
    height: 5px;
    border-radius: 3px;
    background: #7e5e22;

    &--tl { left: 7px; top: 7px; }
    &--tr { right: 7px; top: 7px; }
    &--bl { left: 7px; bottom: 7px; }
    &--br { right: 7px; bottom: 7px; }
  }

  // 大字時間，依格子高度與寬度取較小者
  &__time {
    font-family: "Cormorant Garamond", "Noto Serif TC", serif;
    font-weight: 600;
    font-size: min(56cqh, 26cqw);
    line-height: 1;
    font-variant-numeric: lining-nums tabular-nums;
  }

  &__date {
    margin-top: 2px;
    font-size: min(12cqh, 5cqw);
    letter-spacing: 0.3em;
    white-space: nowrap;
  }
}
</style>
