<script setup lang="ts">
/**
 * 設定列：左邊標題（可加說明），右邊值 / 控制項 / 箭頭。
 * clickable 時是 button，否則是 div（裡面可以放開關等控制項）。
 */
import { ChevronDown, ChevronRight, ChevronUp, ChevronsUpDown } from "lucide-vue-next";
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    label?: string;
    description?: string;
    value?: string;
    chevron?: "right" | "updown" | "down" | "up" | "none";
    clickable?: boolean;
    disabled?: boolean;
    tone?: "default" | "accent" | "danger" | "warn";
    indent?: boolean;
    tiled?: boolean;
  }>(),
  {
    chevron: "none",
    clickable: false,
    disabled: false,
    tone: "default",
    indent: false,
    tiled: false,
  },
);

defineEmits<{ (e: "click", event: MouseEvent): void }>();

const chevronIcon = computed(
  () =>
    ({
      right: ChevronRight,
      updown: ChevronsUpDown,
      down: ChevronDown,
      up: ChevronUp,
      none: null,
    })[props.chevron],
);
</script>

<template>
  <component
    :is="clickable ? 'button' : 'div'"
    :type="clickable ? 'button' : undefined"
    class="st-row"
    :class="{
      'st-row--accent': tone === 'accent',
      'st-row--danger': tone === 'danger',
      'st-row--warn': tone === 'warn',
      'st-row--indent': indent,
      'st-row--tiled': tiled,
    }"
    :disabled="clickable ? disabled : undefined"
    @click="$emit('click', $event)"
  >
    <slot name="icon" />
    <span class="st-row__main">
      <span class="st-row__label"><slot name="label">{{ label }}</slot></span>
      <span v-if="description || $slots.description" class="st-row__desc">
        <slot name="description">{{ description }}</slot>
      </span>
    </span>
    <span v-if="value || $slots.value" class="st-row__value">
      <slot name="value">{{ value }}</slot>
    </span>
    <slot name="control" />
    <component :is="chevronIcon" v-if="chevronIcon" class="st-row__chevron" aria-hidden="true" />
  </component>
</template>
