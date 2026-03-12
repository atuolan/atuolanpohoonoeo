<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
  rows?: number;
  label?: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const expanded = ref(false);
const expandedContent = ref("");
const expandedTextarea = ref<HTMLTextAreaElement | null>(null);

function openExpand() {
  expandedContent.value = props.modelValue;
  expanded.value = true;
  nextTick(() => {
    expandedTextarea.value?.focus();
  });
}

function saveExpand() {
  emit("update:modelValue", expandedContent.value);
  expanded.value = false;
}

function cancelExpand() {
  expanded.value = false;
}

// 同步外部變更
watch(
  () => props.modelValue,
  (val) => {
    if (expanded.value) expandedContent.value = val;
  },
);
</script>

<template>
  <div class="expandable-textarea">
    <div class="textarea-wrapper">
      <textarea
        :value="modelValue"
        @input="
          emit(
            'update:modelValue',
            ($event.target as HTMLTextAreaElement).value,
          )
        "
        class="soft-input textarea"
        :rows="rows || 4"
        :placeholder="placeholder"
      ></textarea>
      <button
        class="expand-btn"
        type="button"
        @click="openExpand"
        title="展開編輯"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
          />
        </svg>
      </button>
    </div>

    <Teleport to="body">
      <Transition name="expand-fade">
        <div v-if="expanded" class="expand-overlay" @click.self="cancelExpand">
          <div class="expand-container">
            <div class="expand-header">
              <span class="expand-title">{{ label || "編輯" }}</span>
              <button class="expand-close" @click="cancelExpand">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <textarea
              ref="expandedTextarea"
              v-model="expandedContent"
              class="expand-textarea"
              :placeholder="placeholder"
            ></textarea>
            <div class="expand-footer">
              <button class="btn-cancel" @click="cancelExpand">取消</button>
              <button class="btn-save" @click="saveExpand">儲存</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.expandable-textarea {
  position: relative;
  width: 100%;
}

.textarea-wrapper {
  position: relative;

  textarea {
    width: 100%;
    padding-right: 36px;
  }

  .expand-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    padding: 4px;
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition:
      opacity 0.15s,
      background 0.15s;

    svg {
      width: 16px;
      height: 16px;
      color: var(--color-text-secondary, #6b7280);
    }

    &:hover {
      opacity: 1;
      background: var(--color-background, #f3f4f6);
    }
  }
}

.expand-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(12px, env(safe-area-inset-top))
    max(12px, env(safe-area-inset-right)) max(12px, var(--safe-bottom, 0px))
    max(12px, env(safe-area-inset-left));
}

.expand-container {
  background: var(--color-surface, white);
  border-radius: 16px;
  width: 100%;
  max-width: 700px;
  height: 100%;
  max-height: calc(
    100dvh - max(24px, env(safe-area-inset-top)) - max(
        24px,
        var(--safe-bottom, 0px)
      )
  );
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;

  .expand-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
  }

  .expand-close {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    color: var(--color-text-muted, #9ca3af);
    border-radius: 50%;
    transition: all 0.15s;

    svg {
      width: 22px;
      height: 22px;
    }

    &:hover {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text, #374151);
    }
  }
}

.expand-textarea {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: none;
  resize: none;
  font-size: 15px;
  line-height: 1.7;
  font-family: inherit;
  background: var(--color-surface, white);
  color: var(--color-text, #1f2937);
  user-select: text;
  -webkit-user-select: text;
  touch-action: manipulation;

  &:focus {
    outline: none;
  }

  &::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }
}

.expand-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;

  .btn-cancel,
  .btn-save {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-cancel {
    background: var(--color-background, #f3f4f6);
    color: var(--color-text-secondary, #6b7280);
  }

  .btn-save {
    background: var(--color-primary, #7dd3a8);
    color: white;
  }
}

.expand-fade-enter-active,
.expand-fade-leave-active {
  transition: opacity 0.2s ease;
}
.expand-fade-enter-from,
.expand-fade-leave-to {
  opacity: 0;
}
</style>
