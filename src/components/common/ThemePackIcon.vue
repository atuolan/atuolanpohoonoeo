<script setup lang="ts">
/**
 * 主題包圖示組件
 * 根據 icon id 渲染對應的 SVG 圖示（取代原本的 emoji）。
 * 每個圖示皆為單色路徑、可用 CSS 控制 stroke / fill。
 */
import type { ThemePackIconId } from "@/styles/theme-packs";

interface Props {
  icon: ThemePackIconId | string;
  size?: number;
}

withDefaults(defineProps<Props>(), {
  size: 30,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    class="theme-pack-icon"
    aria-hidden="true"
  >
    <!-- 奶油風：布丁 -->
    <g v-if="icon === 'cream'">
      <path
        d="M9 12 Q9 8 16 8 Q23 8 23 12 L24 13 Q24 14 23 14 H9 Q8 14 8 13 Z"
        fill="currentColor"
        opacity="0.55"
      />
      <path
        d="M9 14 L10 23 Q10 25 12 25 H20 Q22 25 22 23 L23 14 Z"
        fill="currentColor"
      />
      <path
        d="M14 17 Q16 15 18 17"
        stroke="white"
        stroke-width="1.2"
        stroke-linecap="round"
        opacity="0.7"
      />
    </g>

    <!-- Y2K：光碟 -->
    <g v-if="icon === 'y2k'">
      <circle cx="16" cy="16" r="11" fill="currentColor" opacity="0.25" />
      <circle cx="16" cy="16" r="11" stroke="currentColor" stroke-width="1.6" />
      <circle cx="16" cy="16" r="7" stroke="currentColor" stroke-width="1" opacity="0.6" />
      <circle cx="16" cy="16" r="3" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="white" />
    </g>

    <!-- 賽博霓虹：城市天際線 -->
    <g v-if="icon === 'cyber'">
      <path
        d="M5 24 V14 H8 V10 H11 V16 H14 V8 H18 V12 H22 V18 H25 V24 Z"
        fill="currentColor"
      />
      <circle cx="10" cy="13" r="0.8" fill="white" opacity="0.9" />
      <circle cx="16" cy="11" r="0.8" fill="white" opacity="0.9" />
      <circle cx="20" cy="15" r="0.8" fill="white" opacity="0.9" />
      <path d="M5 26 H27" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
    </g>

    <!-- 可愛手帳：蝴蝶結 -->
    <g v-if="icon === 'journal'">
      <path
        d="M16 16 L8 11 Q6 10 6 13 V19 Q6 22 8 21 Z"
        fill="currentColor"
        opacity="0.75"
      />
      <path
        d="M16 16 L24 11 Q26 10 26 13 V19 Q26 22 24 21 Z"
        fill="currentColor"
        opacity="0.75"
      />
      <circle cx="16" cy="16" r="2.4" fill="currentColor" />
      <path
        d="M16 18 Q15 24 13 26 M16 18 Q17 24 19 26"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
        opacity="0.75"
      />
    </g>

    <!-- 極簡黑白：方塊組合 -->
    <g v-if="icon === 'mono'">
      <rect x="6" y="6" width="9" height="9" fill="currentColor" />
      <rect
        x="17"
        y="6"
        width="9"
        height="9"
        stroke="currentColor"
        stroke-width="1.6"
        fill="none"
      />
      <rect
        x="6"
        y="17"
        width="9"
        height="9"
        stroke="currentColor"
        stroke-width="1.6"
        fill="none"
      />
      <rect x="17" y="17" width="9" height="9" fill="currentColor" opacity="0.55" />
    </g>

    <!-- 自訂主題包：調色盤 -->
    <g v-if="icon === 'custom'">
      <path
        d="M16 5 C9.4 5 5 9.4 5 15 c0 5 4 8 7 8 c1.5 0 2-1 2-2 c0-1.5 1-2 2.5-2 H21 c3 0 5-2 5-5 C26 9 21 5 16 5 Z"
        fill="currentColor"
        opacity="0.85"
      />
      <circle cx="10" cy="13" r="1.5" fill="white" />
      <circle cx="14" cy="9" r="1.5" fill="white" />
      <circle cx="20" cy="9" r="1.5" fill="white" />
      <circle cx="22" cy="14" r="1.5" fill="white" />
    </g>

    <!-- 日落：太陽 + 海平面 -->
    <g v-if="icon === 'sunset'">
      <circle cx="16" cy="15" r="6" fill="currentColor" opacity="0.85" />
      <path
        d="M4 22 H28 M6 25 H26 M8 28 H24"
        stroke="currentColor"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </g>

    <!-- 海洋：波浪 -->
    <g v-if="icon === 'ocean'">
      <path
        d="M4 12 Q8 9 12 12 T20 12 T28 12"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
      />
      <path
        d="M4 17 Q8 14 12 17 T20 17 T28 17"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
        opacity="0.7"
      />
      <path
        d="M4 22 Q8 19 12 22 T20 22 T28 22"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        fill="none"
        opacity="0.45"
      />
    </g>

    <!-- 森林：樹木 -->
    <g v-if="icon === 'forest'">
      <path d="M16 4 L10 14 H13 L8 22 H14 V27 H18 V22 H24 L19 14 H22 Z" fill="currentColor" />
    </g>

    <!-- 櫻花：花瓣 -->
    <g v-if="icon === 'sakura'">
      <g fill="currentColor">
        <ellipse cx="16" cy="8" rx="3" ry="4.5" />
        <ellipse cx="22.5" cy="13" rx="3" ry="4.5" transform="rotate(72 22.5 13)" />
        <ellipse cx="20" cy="21" rx="3" ry="4.5" transform="rotate(144 20 21)" />
        <ellipse cx="12" cy="21" rx="3" ry="4.5" transform="rotate(216 12 21)" />
        <ellipse cx="9.5" cy="13" rx="3" ry="4.5" transform="rotate(288 9.5 13)" />
      </g>
      <circle cx="16" cy="16" r="1.8" fill="white" opacity="0.9" />
    </g>

    <!-- 珍珠畫廊：珍珠耳環 + 幾何拼貼 -->
    <g v-if="icon === 'pearl'">
      <!-- 幾何色塊拼貼 -->
      <path d="M6 6 L14 6 L10 14 Z" fill="currentColor" opacity="0.45" />
      <rect x="15" y="6" width="8" height="8" fill="currentColor" opacity="0.35" />
      <circle cx="10" cy="22" r="5" fill="currentColor" opacity="0.25" />
      <!-- 珍珠耳環（發光珍珠 + 細金線） -->
      <path
        d="M20 14 L20 18"
        stroke="currentColor"
        stroke-width="0.8"
        stroke-linecap="round"
        opacity="0.75"
      />
      <circle cx="20" cy="20" r="3.2" fill="currentColor" />
      <circle cx="19" cy="19" r="1" fill="white" opacity="0.85" />
    </g>

    <!-- 兜底：圓圈 -->
    <circle
      v-if="
        !['cream', 'y2k', 'cyber', 'journal', 'mono', 'pearl', 'custom', 'sunset', 'ocean', 'forest', 'sakura'].includes(
          icon,
        )
      "
      cx="16"
      cy="16"
      r="10"
      fill="currentColor"
      opacity="0.6"
    />
  </svg>
</template>

<style scoped lang="scss">
.theme-pack-icon {
  display: block;
  // 預設顏色由父層 color 控制（會繼承 currentColor）
  color: white;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}
</style>
