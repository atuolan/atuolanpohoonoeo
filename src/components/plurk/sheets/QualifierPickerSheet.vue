<script setup lang="ts">
/** 發語詞選擇面板：第一格「自由發揮」，其餘 18 個用發語詞色塊樣式 */
import { computed } from "vue";
import { Sparkles, X } from "lucide-vue-next";
import {
  FREESTYLE,
  PLURK_QUALIFIERS,
  getQualifierColor,
  normalizeQualifier,
} from "@/utils/plurkQualifiers";

const props = defineProps<{
  open: boolean;
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "update:modelValue", q: string): void;
}>();

const current = computed(() => normalizeQualifier(props.modelValue));
const isFreestyle = computed(() => current.value === FREESTYLE);

function accentOf(label: string): string {
  return getQualifierColor(label) ?? "var(--color-text-secondary)";
}

function pick(label: string) {
  emit("update:modelValue", label);
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="plurk-dim-fade">
      <div v-if="props.open" class="plurk-dim" @click="emit('close')"></div>
    </Transition>
    <Transition name="plurk-sheet-slide">
      <section
        v-if="props.open"
        class="plurk-qualifier-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="選發語詞"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">選發語詞</span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div class="qualifier-grid" role="group" aria-label="發語詞">
          <button
            type="button"
            class="qual-btn qual-btn--free"
            :class="{ 'is-on': isFreestyle }"
            :aria-pressed="isFreestyle"
            @click="pick(FREESTYLE)"
          >
            <Sparkles :size="14" />
            <span>自由發揮</span>
          </button>

          <button
            v-for="q in PLURK_QUALIFIERS"
            :key="q.label"
            type="button"
            class="qual-btn"
            :class="{ 'is-on': current === q.label }"
            :aria-pressed="current === q.label"
            :style="
              current === q.label
                ? { background: accentOf(q.label), borderColor: accentOf(q.label) }
                : { borderColor: accentOf(q.label), color: accentOf(q.label) }
            "
            @click="pick(q.label)"
          >
            {{ q.label }}
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-dim {
  @include plurk-dim;
}

.plurk-qualifier-sheet {
  @include plurk-sheet;

  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
  flex-shrink: 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding-top: 4px;
}

.sheet-title {
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.head-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -10px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.qualifier-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 4px 0 10px;
}

.qual-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-height: 44px;
  padding: 0 8px;
  border: 1.5px solid transparent;
  border-radius: 12px;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;
  transition:
    background 0.14s ease,
    color 0.14s ease;

  &:active {
    background: var(--color-surface-hover);
  }

  &.is-on {
    color: var(--color-on-primary-contrast);
  }

  &.is-on:active {
    opacity: 0.92;
  }
}

.qual-btn--free {
  border-style: dashed;
  border-color: var(--color-border);
  color: var(--color-text-secondary);
  font-weight: 400;

  &.is-on {
    border-style: solid;
    border-color: var(--color-text);
    background: var(--color-surface-hover);
    color: var(--color-text);
    font-weight: 700;
  }
}

.plurk-dim-fade-enter-active,
.plurk-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.plurk-dim-fade-enter-from,
.plurk-dim-fade-leave-to {
  opacity: 0;
}

.plurk-sheet-slide-enter-active,
.plurk-sheet-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}

.plurk-sheet-slide-enter-from,
.plurk-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
