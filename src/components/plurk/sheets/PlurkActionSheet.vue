<script setup lang="ts">
/** 共用底部動作選單：一列一個動作，點下去 emit select（要不要關閉由父層決定） */
import type { PlurkAction } from "@/components/plurk/types";
import { X } from "lucide-vue-next";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    actions: PlurkAction[];
  }>(),
  {
    title: "更多動作",
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", id: string): void;
}>();

function pick(action: PlurkAction) {
  if (action.disabled) return;
  emit("select", action.id);
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
        class="plurk-action-sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="props.title"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">{{ props.title }}</span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div v-if="props.actions.length === 0" class="sheet-empty">目前沒有可以做的動作</div>

        <div v-else class="action-list">
          <button
            v-for="action in props.actions"
            :key="action.id"
            type="button"
            class="action-row"
            :class="{ 'is-danger': action.danger, 'is-disabled': action.disabled }"
            :disabled="action.disabled"
            @click="pick(action)"
          >
            {{ action.label }}
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

.plurk-action-sheet {
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.sheet-empty {
  padding: 20px 0 24px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
  text-align: center;
}

.action-list {
  display: flex;
  flex-direction: column;
  padding-bottom: 4px;
}

.action-row {
  display: flex;
  align-items: center;
  width: 100%;
  min-height: 52px;
  padding: 12px 2px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  font-family: inherit;
  font-size: 15px;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--color-surface-hover);
  }

  &.is-danger {
    color: var(--color-error);
  }

  &.is-disabled {
    color: var(--color-text-muted);
    opacity: 0.55;
    cursor: default;
  }

  &.is-disabled:active {
    background: none;
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
