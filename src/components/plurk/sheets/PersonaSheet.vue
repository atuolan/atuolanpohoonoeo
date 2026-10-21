<script setup lang="ts">
/** 換身分面板：列出所有身分，最下面（showAnonymous 時）多一列匿名噗友開關 */
import { Check, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { PersonaOption } from "@/components/plurk/types";

const props = withDefaults(
  defineProps<{
    open: boolean;
    personas: PersonaOption[];
    currentId: string | null;
    showAnonymous?: boolean;
    anonymous?: boolean;
  }>(),
  {
    showAnonymous: false,
    anonymous: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "select", id: string): void;
  (e: "update:anonymous", v: boolean): void;
}>();

function pick(persona: PersonaOption) {
  emit("select", persona.id);
}

function toggleAnonymous() {
  emit("update:anonymous", !props.anonymous);
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
        class="plurk-persona-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="換身分"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">換身分</span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div v-if="props.personas.length === 0 && !props.showAnonymous" class="sheet-empty">
          目前沒有其他身分
        </div>

        <ul v-if="props.personas.length > 0" class="persona-list">
          <li v-for="persona in props.personas" :key="persona.id">
            <button
              type="button"
              class="persona-row"
              :class="{ 'is-on': persona.id === props.currentId }"
              :aria-pressed="persona.id === props.currentId"
              @click="pick(persona)"
            >
              <PlurkAvatar :src="persona.avatar" :name="persona.name" :size="36" />
              <span class="persona-text">
                <span class="persona-name">{{ persona.name }}</span>
                <span v-if="persona.groupName" class="persona-group">{{ persona.groupName }}</span>
              </span>
              <span
                class="persona-check"
                :class="{ 'is-on': persona.id === props.currentId }"
                aria-hidden="true"
              >
                <Check :size="14" />
              </span>
            </button>
          </li>
        </ul>

        <div v-if="props.showAnonymous" class="anon-row">
          <span class="anon-text">
            <span class="anon-name">匿名噗友</span>
            <span class="anon-note">不掛任何身分發言</span>
          </span>
          <button
            type="button"
            role="switch"
            class="anon-switch"
            :class="{ 'is-on': props.anonymous }"
            :aria-checked="props.anonymous"
            aria-label="匿名噗友"
            @click="toggleAnonymous"
          >
            <span class="anon-knob" aria-hidden="true"></span>
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

.plurk-persona-sheet {
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

.sheet-empty {
  padding: 20px 0 24px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--color-text-muted);
  text-align: center;
}

.persona-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
}

.persona-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 8px 2px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }

  &.is-on {
    background: var(--color-surface-hover);
  }
}

li:last-child .persona-row {
  border-bottom: none;
}

.persona-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.persona-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.persona-group {
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.persona-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 11px;
  border: 1.5px solid var(--color-border);
  color: transparent;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    color 0.14s ease;

  &.is-on {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: var(--color-on-primary-contrast);
  }
}

.anon-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  margin-top: 4px;
  padding: 8px 2px;
  border-top: 1px solid var(--color-border);
}

.anon-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.anon-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.anon-note {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.anon-switch {
  position: relative;
  width: 52px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: var(--color-border);
  cursor: pointer;
  transition: background 0.18s ease;

  &.is-on {
    background: var(--color-primary);
  }
}

.anon-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background: var(--color-on-primary-contrast);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: left 0.18s ease;
}

.anon-switch.is-on .anon-knob {
  left: 23px;
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
