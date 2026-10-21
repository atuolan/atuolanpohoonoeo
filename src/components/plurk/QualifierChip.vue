<script setup lang="ts">
/** 噗浪發語詞色塊：說、想、覺得……沒有發語詞就不渲染 */
import { computed } from "vue";
import { getQualifierColor, normalizeQualifier } from "@/utils/plurkQualifiers";

const props = defineProps<{
  qualifier?: string | null;
  size?: "sm" | "md";
}>();

const color = computed(() => getQualifierColor(props.qualifier));
const label = computed(() => normalizeQualifier(props.qualifier));
</script>

<template>
  <span
    v-if="color"
    class="qualifier-chip"
    :class="`qualifier-chip--${props.size ?? 'md'}`"
    :style="{ background: color }"
    >{{ label }}</span
  >
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.qualifier-chip {
  display: inline-block;
  vertical-align: 1px;
  margin-right: 6px;
  border-radius: 6px;
  color: #ffffff;
  font-weight: 700;
  white-space: nowrap;
}

.qualifier-chip--md {
  font-size: 12px;
  line-height: 20px;
  padding: 0 7px;
}

.qualifier-chip--sm {
  font-size: 11px;
  line-height: 18px;
  padding: 0 6px;
}
</style>
