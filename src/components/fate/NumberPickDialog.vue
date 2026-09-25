<script setup lang="ts">
/** 報數字：心中默想幾個數字，對應洗好的牌堆中的第幾張 */
import { nextTick, ref, watch } from "vue";

const props = defineProps<{ open: boolean; count: number; max: number; error: string | null }>();
const emit = defineEmits<{ close: []; submit: [input: string] }>();

const input = ref("");
const field = ref<HTMLInputElement | null>(null);

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    input.value = "";
    await nextTick();
    field.value?.focus();
  },
);
</script>

<template>
  <Transition name="dialog">
    <div v-if="open" class="number-pick" @click.self="emit('close')">
      <form class="number-pick__panel" @submit.prevent="emit('submit', input)">
        <h3 class="number-pick__title">報數字</h3>
        <p class="number-pick__desc">
          心中默想 {{ count }} 個 1～{{ max }} 之間的數字，數字代表洗好的牌堆中的第幾張。
        </p>
        <input
          ref="field"
          v-model="input"
          class="number-pick__input"
          inputmode="numeric"
          autocomplete="off"
          :placeholder="count === 1 ? '例如：7' : '例如：3, 17, 42'"
        />
        <p class="number-pick__hint">可用逗號或空白分隔，也可以寫範圍（例如 1-3）</p>
        <p v-if="error" class="number-pick__error" role="alert">{{ error }}</p>
        <div class="number-pick__actions">
          <button type="button" class="fate-btn" @click="emit('close')">取消</button>
          <button type="submit" class="fate-btn fate-btn--primary" :disabled="!input.trim()">確定</button>
        </div>
      </form>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.number-pick {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--f-scrim);

  &__panel {
    width: 100%;
    max-width: 340px;
    padding: 20px;
    background: var(--f-panel-solid);
    border: 1px solid var(--f-line-strong);
    border-radius: 8px;
  }

  &__title {
    margin: 0 0 6px;
    font-family: var(--f-font-head);
    font-size: 17px;
    color: var(--f-accent);
    letter-spacing: 0.1em;
  }

  &__desc {
    margin: 0 0 14px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--f-ink-2);
  }

  &__input {
    width: 100%;
    padding: 10px 12px;
    font-size: 16px;
    color: var(--f-ink);
    background: var(--f-panel);
    border: 1px solid var(--f-line-strong);
    border-radius: var(--f-radius);
    outline: none;

    &:focus {
      border-color: var(--f-accent);
    }
  }

  &__hint {
    margin: 6px 0 0;
    font-size: 11px;
    color: var(--f-ink-2);
  }

  &__error {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--f-danger);
  }

  &__actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
