<script setup lang="ts">
/**
 * 寫／改禮物日記的彈窗：一張紙頁感的卡，日期＋內文
 */
import { computed, ref } from "vue";

const props = defineProps<{
  title: string;
  hint?: string;
  initialDate?: string;
  initialContent?: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  save: [{ date: string; content: string }];
  cancel: [];
}>();

function todayString(): string {
  const now = new Date();
  const pad = (value: number) => (value < 10 ? `0${value}` : String(value));
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const date = ref(props.initialDate || todayString());
const content = ref(props.initialContent || "");

const canSave = computed(() => content.value.trim().length > 0 && !props.saving);

function submit(): void {
  if (!canSave.value) return;
  emit("save", { date: date.value || todayString(), content: content.value.trim() });
}
</script>

<template>
  <Teleport to="body">
    <div class="diary-editor-overlay" @click.self="emit('cancel')">
      <div class="diary-editor" @click.stop>
        <h2 class="editor-title">{{ title }}</h2>
        <p v-if="hint" class="editor-hint">靈感：{{ hint }}</p>

        <input v-model="date" type="date" class="editor-date" />

        <textarea
          v-model="content"
          class="editor-textarea"
          maxlength="2000"
          placeholder="寫下那天的事…"
        ></textarea>

        <div class="editor-actions">
          <button type="button" class="btn-cancel" :disabled="saving" @click="emit('cancel')">
            取消
          </button>
          <button type="button" class="btn-save" :disabled="!canSave" @click="submit">
            {{ saving ? "存檔中…" : "存起來" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.diary-editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}

.diary-editor {
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 22px 18px 18px;
  border-radius: 18px;
  background: var(--color-surface, #fff);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #eee);
    border-radius: 2px;
  }
}

.editor-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.editor-hint {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-secondary, #666);
  opacity: 0.85;
}

.editor-date {
  display: block;
  width: 100%;
  box-sizing: border-box;
  margin-top: 14px;
  padding: 8px 10px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 10px;
  font-size: 13px;
  color: var(--color-text, #333);
  background: var(--color-background, #f8f9fa);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.editor-textarea {
  display: block;
  width: 100%;
  box-sizing: border-box;
  min-height: 220px;
  margin-top: 10px;
  padding: 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 12px;
  font-family: inherit;
  font-size: 13px;
  line-height: 1.8;
  color: var(--color-text, #333);
  background: var(--color-background, #f8f9fa);
  resize: vertical;
  outline: none;

  &::placeholder {
    color: var(--color-text-secondary, #999);
    opacity: 0.7;
  }

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}

.btn-cancel,
.btn-save {
  padding: 8px 16px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:active {
    transform: scale(0.97);
  }
}

.btn-cancel {
  border: 1px solid var(--color-border, #ddd);
  background: transparent;
  color: var(--color-text-secondary, #666);
}

.btn-save {
  border: none;
  background: var(--color-primary, #7dd3a8);
  color: var(--color-on-primary-contrast, #fff);

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

body.is-night-mode {
  .diary-editor {
    background: #2a2622;
    color: #f0e6d8;
  }

  .editor-title {
    color: #f0e6d8;
  }

  .editor-hint {
    color: #b9ac9c;
  }

  .editor-date,
  .editor-textarea {
    border-color: rgba(240, 230, 216, 0.25);
    background: #3a3530;
    color: #f0e6d8;
  }

  .btn-cancel {
    border-color: rgba(240, 230, 216, 0.25);
    color: #d6c8b6;
  }

  .btn-save {
    color: var(--color-on-primary-contrast, #fff);
  }
}
</style>
