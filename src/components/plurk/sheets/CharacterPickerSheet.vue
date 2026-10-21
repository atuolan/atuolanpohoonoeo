<script setup lang="ts">
/** 角色選擇面板：多選時底部「確定（N）」，單選時點了直接 confirm([id]) */
import { computed, ref, watch } from "vue";
import { Check, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { PickerCharacter } from "@/components/plurk/types";

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    characters: PickerCharacter[];
    modelValue: string[];
    multiple?: boolean;
    confirmText?: string;
  }>(),
  {
    multiple: false,
    confirmText: undefined,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", ids: string[]): void;
}>();

const selected = ref<string[]>([]);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = [...props.modelValue];
    }
  },
  { immediate: true },
);

const confirmLabel = computed(() => {
  const base = props.confirmText ?? "確定";
  return props.multiple ? `${base}（${selected.value.length}）` : base;
});

const canConfirm = computed(() => selected.value.length > 0);

function isOn(id: string): boolean {
  return selected.value.includes(id);
}

function pick(character: PickerCharacter) {
  if (character.disabled) return;
  if (!props.multiple) {
    emit("confirm", [character.id]);
    return;
  }
  selected.value = isOn(character.id)
    ? selected.value.filter((id) => id !== character.id)
    : [...selected.value, character.id];
}

function confirmPick() {
  if (!canConfirm.value) return;
  emit("confirm", [...selected.value]);
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
        class="plurk-character-sheet"
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

        <div v-if="props.characters.length === 0" class="sheet-empty">沒有可以選的角色</div>

        <ul v-else class="char-list">
          <li v-for="character in props.characters" :key="character.id">
            <button
              type="button"
              class="char-row"
              :class="{ 'is-on': isOn(character.id), 'is-disabled': character.disabled }"
              :aria-pressed="isOn(character.id)"
              :disabled="character.disabled"
              @click="pick(character)"
            >
              <PlurkAvatar :src="character.avatar" :name="character.name" :size="36" />
              <span class="char-text">
                <span class="char-name">{{ character.name }}</span>
                <span v-if="character.note" class="char-note">{{ character.note }}</span>
              </span>
              <span class="char-check" :class="{ 'is-on': isOn(character.id) }" aria-hidden="true">
                <Check :size="14" />
              </span>
            </button>
          </li>
        </ul>

        <div v-if="props.multiple" class="sheet-foot">
          <button
            type="button"
            class="confirm-btn"
            :disabled="!canConfirm"
            @click="confirmPick"
          >
            {{ confirmLabel }}
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

.plurk-character-sheet {
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

.char-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0 0 4px;
  list-style: none;
}

.char-row {
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

  &.is-disabled {
    opacity: 0.5;
    cursor: default;
  }

  &.is-disabled:active {
    background: none;
  }
}

li:last-child .char-row {
  border-bottom: none;
}

.char-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.35;
}

.char-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-note {
  font-size: 11px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-check {
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

.sheet-foot {
  padding: 10px 0 2px;
}

.confirm-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  border: none;
  border-radius: 23px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    background: var(--color-surface-hover);
    color: var(--color-text-muted);
    cursor: default;
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
