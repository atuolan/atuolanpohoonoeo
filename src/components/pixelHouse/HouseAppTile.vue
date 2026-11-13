<script setup lang="ts">
/**
 * 小屋裡 App 的圖示：淡彩的圓角方塊加圓角線條的圖。
 * 下面那一排（md）、「全部 App」和「常用 App」的格子（lg）、「常用 App」的清單（sm）共用。
 * 未讀數之類要疊在角落的東西放 slot。
 */
import { computed, type Component } from "vue";
import { tileColors } from "./houseApps";

const props = withDefaults(defineProps<{ icon: Component; color: string; size?: "lg" | "md" | "sm" }>(), { size: "lg" });

const ICON_PX = { lg: 28, md: 22, sm: 20 };
const style = computed(() => {
  const c = tileColors(props.color);
  return { background: c.bg, color: c.ink, boxShadow: `inset 0 0 0 1.5px ${c.ring}` };
});
</script>

<template>
  <span class="ph-tile" :class="`is-${size}`" :style="style">
    <component :is="icon" :size="ICON_PX[size]" :stroke-width="2.3" fill="currentColor" fill-opacity="0.25" aria-hidden="true" />
    <slot />
  </span>
</template>

<style scoped>
.ph-tile {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 120ms ease;
}

.ph-tile.is-lg {
  width: 56px;
  height: 56px;
  border-radius: 20px;
}

.ph-tile.is-md {
  width: 44px;
  height: 44px;
  border-radius: 16px;
}

.ph-tile.is-sm {
  width: 40px;
  height: 40px;
  border-radius: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .ph-tile {
    transition: none;
  }
}
</style>
