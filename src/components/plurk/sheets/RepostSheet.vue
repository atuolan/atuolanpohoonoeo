<script setup lang="ts">
/** 轉噗面板：原噗預覽 + 可選的一句話（200 字） */
import { computed, ref, watch } from "vue";
import { Repeat2, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";

const MAX_COMMENT = 200;

const props = withDefaults(
  defineProps<{
    open: boolean;
    preview: {
      authorName: string;
      authorAvatar?: string;
      qualifier?: string;
      text: string;
    } | null;
  }>(),
  { preview: null },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", comment: string): void;
}>();

const comment = ref("");

watch(
  () => props.open,
  (open) => {
    if (open) comment.value = "";
  },
);

const count = computed(() => comment.value.length);
const canConfirm = computed(() => count.value <= MAX_COMMENT);

function confirm() {
  if (!canConfirm.value) return;
  emit("confirm", comment.value.trim());
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
        class="repost-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="轉噗"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">
            <Repeat2 :size="17" class="sheet-title-icon" />
            轉噗
          </span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div v-if="props.preview" class="preview">
          <div class="preview-head">
            <PlurkAvatar
              :src="props.preview.authorAvatar"
              :name="props.preview.authorName"
              :size="34"
            />
            <span class="preview-name">{{ props.preview.authorName }}</span>
            <QualifierChip :qualifier="props.preview.qualifier" size="sm" />
          </div>
          <p class="preview-text">{{ props.preview.text }}</p>
        </div>

        <div class="compose">
          <textarea
            v-model="comment"
            class="compose-input"
            :maxlength="MAX_COMMENT"
            placeholder="說點什麼…（可選）"
            aria-label="轉噗的一句話"
            rows="3"
          ></textarea>
          <div class="compose-count" :class="{ 'is-over': !canConfirm }">
            {{ count }}/{{ MAX_COMMENT }}
          </div>
        </div>

        <div class="sheet-actions">
          <button type="button" class="btn btn--ghost" @click="emit('close')">取消</button>
          <button
            type="button"
            class="btn btn--primary"
            :disabled="!canConfirm"
            @click="confirm"
          >
            確認轉噗
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

.repost-sheet {
  @include plurk-sheet;

  display: flex;
  flex-direction: column;
  gap: 10px;
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
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.sheet-title-icon {
  color: var(--color-primary);
}

.head-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
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

.preview {
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-background);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.preview-text {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.compose {
  position: relative;
}

.compose-input {
  width: 100%;
  box-sizing: border-box;
  min-height: 96px;
  padding: 12px 14px 26px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  line-height: 1.6;
  resize: none;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.compose-count {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-size: 12px;
  color: var(--color-text-muted);

  &.is-over {
    color: var(--color-error);
  }
}

.sheet-actions {
  display: flex;
  gap: 10px;
  padding: 2px 0 4px;
}

.btn {
  flex: 1;
  min-height: $plurk-touch;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:active {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.btn--ghost {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
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
