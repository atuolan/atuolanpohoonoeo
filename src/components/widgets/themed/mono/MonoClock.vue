<script setup lang="ts">
// 極簡黑白・雜誌刊頭：上排刊名與日期夾一條黑線，下方超大襯線數字時間，右側直書中文時間。
// 字級全部跟著格子高度（cqh）走，格子縮放時數字與直書文字都不會爆版。
import { computed } from "vue";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedClockProps } from "../types";

const props = defineProps<ThemedClockProps>();

// Instrument Serif 只給數字與編號用，其餘中文字走全域的 Noto Serif TC
useOnDemandFont(
  "aguaphone-mono-font",
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
  computed(() => true),
);

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

/** 12 小時制的時數中文：一點…十二點，2 點慣寫「兩點」 */
function hourCn(h12: number): string {
  if (h12 === 2) return "兩";
  if (h12 < 10) return DIGITS[h12];
  if (h12 === 10) return "十";
  if (h12 === 11) return "十一";
  return "十二";
}

/** 分鐘中文：0 分寫「整」，1–9 補「零」，其餘照讀（十九分、二十分…） */
function minuteCn(m: number): string {
  if (m === 0) return "整";
  if (m < 10) return `零${DIGITS[m]}分`;
  if (m < 20) return `十${m % 10 ? DIGITS[m % 10] : ""}分`;
  return `${DIGITS[Math.floor(m / 10)]}十${m % 10 ? DIGITS[m % 10] : ""}分`;
}

const hh = computed(() => String(props.now.getHours()).padStart(2, "0"));
const mm = computed(() => String(props.now.getMinutes()).padStart(2, "0"));

const dateText = computed(() => {
  const mo = String(props.now.getMonth() + 1).padStart(2, "0");
  const d = String(props.now.getDate()).padStart(2, "0");
  return `${mo}.${d} — 星期${WEEK[props.now.getDay()]}`;
});

const zhTime = computed(() => {
  const h = props.now.getHours();
  const period = h < 6 ? "凌晨" : h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
  return `${period}${hourCn(h % 12 || 12)}點${minuteCn(props.now.getMinutes())}`;
});
</script>

<template>
  <div class="mono-clock" :style="color ? { color } : undefined">
    <div class="mono-clock__head">
      <span class="mono-clock__brand">203 PHONE</span>
      <span v-if="showDate" class="mono-clock__date">{{ dateText }}</span>
    </div>
    <div class="mono-clock__body">
      <span class="mono-clock__time">{{ hh }}:{{ mm }}</span>
      <span class="mono-clock__zh">{{ zhTime }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 沒有卡片底、陰影、圓角，全部直接印在紙上；顏色繼承 color（使用者設定的文字色），沒設定就是油墨黑
.mono-clock {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  flex-direction: column;
  padding: 10px 12px 8px;
  color: #1c1c1a;
  font-family: "Noto Sans TC", sans-serif;

  &__head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 8px;
    padding-bottom: 4px;
    border-bottom: 1px solid currentColor;
    font-size: clamp(9px, 8cqh, 11px);
    line-height: 1.4;
  }

  &__brand {
    font-weight: 500;
    letter-spacing: 0.28em;
    white-space: nowrap;
  }

  &__date {
    color: #5e5d58;
    letter-spacing: 0.12em;
    white-space: nowrap;
  }

  // 時間區吃掉刊頭以下的剩餘高度；數字高度跟著格子走
  &__body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    padding-top: 4px;
  }

  &__time {
    font-family: "Instrument Serif", "Noto Serif TC", serif;
    font-size: min(60cqh, 30cqw);
    line-height: 0.95;
    letter-spacing: -0.02em;
    white-space: nowrap;
  }

  // 直書中文時間；字級偏小，是為了 9 個字（如「晚上十一點五十九分」）在矮格裡也裝得下
  &__zh {
    font-family: "Noto Serif TC", serif;
    font-size: clamp(8px, 6.2cqh, 13px);
    line-height: 1.6;
    letter-spacing: 0.1em;
    color: #5e5d58;
    writing-mode: vertical-rl;
    white-space: nowrap;
    padding-bottom: 4px;
    max-height: 100%;
  }
}
</style>
