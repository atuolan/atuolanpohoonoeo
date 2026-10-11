<script setup lang="ts">
// 奶油風時鐘：圓角奶白卡，左邊小錶盤、右邊時段與 Fraunces 大字時間
import { computed } from "vue";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedClockProps } from "../types";

const props = defineProps<ThemedClockProps>();

useOnDemandFont(
  "aguaphone-cream-font",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap",
  computed(() => true),
);

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

const hh = computed(() => String(props.now.getHours()).padStart(2, "0"));
const mm = computed(() => String(props.now.getMinutes()).padStart(2, "0"));

// 0–5 凌晨、6–11 上午、12–17 下午、18–23 晚上
const period = computed(() => {
  const h = props.now.getHours();
  if (h < 6) return "凌晨";
  if (h < 12) return "上午";
  if (h < 18) return "下午";
  return "晚上";
});

const dateText = computed(
  () => `${props.now.getMonth() + 1}月${props.now.getDate()}日・${WEEKDAYS[props.now.getDay()]}`,
);

// 時針會隨分鐘慢慢走：2:19 → 60 + 9.5 = 69.5 度
const hourDeg = computed(() => (props.now.getHours() % 12) * 30 + props.now.getMinutes() * 0.5);
const minuteDeg = computed(() => props.now.getMinutes() * 6);

// 文字色有值才覆蓋預設色；次要字沿用同一個色
const vars = computed(() => ({
  "--cream-ink": props.color || "#4A3528",
  "--cream-soft": props.color || "#7E6250",
}));
</script>

<template>
  <div class="cream-clock" :style="vars">
    <div class="cream-clock__card">
      <div class="cream-clock__dial" aria-hidden="true">
        <span
          v-for="deg in [0, 90, 180, 270]"
          :key="deg"
          class="cream-clock__tick-wrap"
          :style="{ transform: `rotate(${deg}deg)` }"
        >
          <span class="cream-clock__tick" :class="{ 'is-top': deg === 0 }"></span>
        </span>
        <span class="cream-clock__hand cream-clock__hand--hour" :style="{ transform: `rotate(${hourDeg}deg)` }"></span>
        <span class="cream-clock__hand cream-clock__hand--minute" :style="{ transform: `rotate(${minuteDeg}deg)` }"></span>
        <span class="cream-clock__pin-halo"></span>
        <span class="cream-clock__pin"></span>
      </div>

      <div class="cream-clock__text">
        <span class="cream-clock__period">{{ period }}</span>
        <span class="cream-clock__time">{{ hh }}:{{ mm }}</span>
        <span v-if="showDate" class="cream-clock__date">{{ dateText }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 設計稿色票
$paper: #fffcf6;
$ink-default: #4a3528;
$soft-default: #7e6250;
$dial: #f5e6cf;
$caramel: #c98a55;
$caramel-light: #ddbb93;
$shadow: 0 16px 30px -20px rgba(150, 100, 60, 0.55);

// 根元素填滿格子，並作為 cq 單位的容器；卡片與錶盤尺寸都以高度（cqh）為基準縮放
.cream-clock {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--cream-ink, #{$ink-default});

  &__card {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    border-radius: min(36px, 50cqh);
    background: $paper;
    box-shadow: $shadow, inset 0 1px 0 #ffffff;
    padding: 0 6.5cqw 0 3.6cqw;
    display: flex;
    align-items: center;
    gap: 4.5cqw;
    min-width: 0;
  }

  // 錶盤：高度的 82%，寬很窄時改以寬度為上限
  &__dial {
    position: relative;
    flex-shrink: 0;
    width: min(82cqh, 42cqw);
    height: min(82cqh, 42cqw);
    border-radius: 50%;
    background: $dial;
    box-shadow: inset 0 2px 6px rgba(150, 100, 60, 0.18);
  }

  // 四個刻度用旋轉的 wrapper 擺位，點本身固定在上方
  &__tick-wrap {
    position: absolute;
    inset: 0;
  }

  &__tick {
    position: absolute;
    left: 47.2%;
    top: 8.3%;
    width: 5.6%;
    height: 5.6%;
    border-radius: 50%;
    background: $caramel-light;

    &.is-top {
      background: $caramel;
    }
  }

  // 指針以錶盤中心為旋轉點（transform-origin 在底端）
  &__hand {
    position: absolute;
    transform-origin: 50% 100%;
    border-radius: 999px;
    background: var(--cream-ink, #{$ink-default});

    &--hour {
      left: 48.15%;
      top: 24.07%;
      width: 3.7%;
      height: 25.93%;
    }

    &--minute {
      left: 48.6%;
      top: 12.96%;
      width: 2.8%;
      height: 37.04%;
    }
  }

  // 中心點外圈的錶盤色光暈，蓋住指針底端
  &__pin-halo {
    position: absolute;
    left: 38.9%;
    top: 38.9%;
    width: 22.2%;
    height: 22.2%;
    border-radius: 50%;
    background: $dial;
  }

  &__pin {
    position: absolute;
    left: 44.45%;
    top: 44.45%;
    width: 11.1%;
    height: 11.1%;
    border-radius: 50%;
    background: $caramel;
  }

  &__text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__period,
  &__date {
    font-size: clamp(10px, 9.8cqh, 14px);
    line-height: 1.4;
    color: var(--cream-soft, #{$soft-default});
    white-space: nowrap;
  }

  &__period {
    letter-spacing: 0.1em;
  }

  &__date {
    letter-spacing: 0.08em;
  }

  &__time {
    font-family: "Fraunces", "Noto Serif TC", serif;
    font-weight: 600;
    font-size: clamp(22px, 34.8cqh, 56px);
    line-height: 1.09;
    letter-spacing: -0.01em;
    color: var(--cream-ink, #{$ink-default});
    white-space: nowrap;
  }
}
</style>
