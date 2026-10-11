<script setup lang="ts">
// 線描版型時鐘：左側手繪圓錶盤、右側 HH:MM 與手繪波浪底線，不畫外框
// 時針 = (h%12)*30 + m*0.5 度、分針 = m*6 度，與設計稿同一公式
import { computed } from "vue";
import type { ThemedClockProps } from "../types";

const props = defineProps<ThemedClockProps>();

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

const hh = computed(() => String(props.now.getHours()).padStart(2, "0"));
const mm = computed(() => String(props.now.getMinutes()).padStart(2, "0"));
const dateText = computed(
  () => `${props.now.getMonth() + 1}月${props.now.getDate()}日　星期${WEEK[props.now.getDay()]}`,
);
const hourDeg = computed(() => (props.now.getHours() % 12) * 30 + props.now.getMinutes() * 0.5);
const minuteDeg = computed(() => props.now.getMinutes() * 6);
</script>

<template>
  <div class="sk-clock" :style="color ? { '--sk-fg': color } : undefined">
    <div class="sk-clock__dial" aria-hidden="true">
      <span class="sk-clock__tick sk-clock__tick--t"></span>
      <span class="sk-clock__tick sk-clock__tick--r"></span>
      <span class="sk-clock__tick sk-clock__tick--b"></span>
      <span class="sk-clock__tick sk-clock__tick--l"></span>
      <span class="sk-clock__hand sk-clock__hand--h" :style="{ transform: `rotate(${hourDeg}deg)` }"></span>
      <span class="sk-clock__hand sk-clock__hand--m" :style="{ transform: `rotate(${minuteDeg}deg)` }"></span>
      <span class="sk-clock__pivot"></span>
    </div>

    <div class="sk-clock__text">
      <span class="sk-clock__time">{{ hh }}:{{ mm }}</span>
      <!-- 波形寬度跟著時間字寬（2.6em，與設計稿 58px 字配 150px 波浪同比例） -->
      <svg class="sk-clock__wave" viewBox="0 0 150 10" aria-hidden="true">
        <path d="M2 6 C 14 1, 22 9, 36 5 S 60 1, 74 6 S 100 9, 114 4 S 138 2, 148 6" />
      </svg>
      <span v-if="showDate" class="sk-clock__date">{{ dateText }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 墨線色與次要字色照設計稿定稿；零彩色、零陰影
$ink: #1a1a1a;
$sub: #555555;

.sk-clock {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // 讓子元件的 cqh / cqw 以格子大小為準
  container-type: size;
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 4px;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--sk-fg, #{$ink});

  // 錶盤：直徑隨格子高度縮放，寬度太窄時改隨寬度
  &__dial {
    --d: min(92cqh, 38cqw);
    position: relative;
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--d);
    height: var(--d);
    border: 1.6px solid $ink;
    border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%;
  }

  // 四個短刻度線（12 / 3 / 6 / 9 點）
  &__tick {
    position: absolute;
    background: $ink;

    &--t,
    &--b {
      left: 50%;
      width: 1.6px;
      height: 8.3%;
      margin-left: -0.8px;
    }

    &--t {
      top: 5.5%;
    }

    &--b {
      bottom: 5.5%;
    }

    &--l,
    &--r {
      top: 50%;
      height: 1.6px;
      width: 8.3%;
      margin-top: -0.8px;
    }

    &--l {
      left: 5.5%;
    }

    &--r {
      right: 5.5%;
    }
  }

  // 指針以錶盤中心為轉軸：底端貼齊中心，再旋轉
  &__hand {
    position: absolute;
    left: 50%;
    bottom: 50%;
    background: $ink;
    border-radius: 2px;
    transform-origin: 50% 100%;

    &--h {
      width: 2.4px;
      height: 25%;
      margin-left: -1.2px;
    }

    &--m {
      width: 1.6px;
      height: 35%;
      margin-left: -0.8px;
    }
  }

  // 中心空心小圓
  &__pivot {
    position: absolute;
    left: 50%;
    top: 50%;
    box-sizing: border-box;
    width: 7px;
    height: 7px;
    margin: -3.5px 0 0 -3.5px;
    border: 1.6px solid $ink;
    border-radius: 50%;
    background: #ffffff;
  }

  // 右側文字區：字級由格子高度決定，--t 為時間字級
  &__text {
    --t: min(50cqh, 15cqw);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }

  &__time {
    font-size: var(--t);
    line-height: 1.07;
    white-space: nowrap;
    color: var(--sk-fg, #{$ink});
  }

  &__wave {
    display: block;
    width: calc(var(--t) * 2.6);
    height: auto;
    aspect-ratio: 15 / 1;
    overflow: visible;
    fill: none;
    stroke: $ink;
    stroke-width: 1.6;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }

  &__date {
    margin-top: 4px;
    font-size: calc(var(--t) * 0.26);
    letter-spacing: 0.06em;
    white-space: nowrap;
    color: $sub;
  }
}
</style>
