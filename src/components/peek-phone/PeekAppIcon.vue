<script setup lang="ts">
/** 角色手機桌面上的一個 App：白底圖示＋未讀數＋生成狀態 */
import { Loader2 } from "lucide-vue-next";
import { computed } from "vue";
import type { HomeApp } from "./peekPhoneView";

const props = defineProps<{ app: HomeApp; showLabel?: boolean }>();
const emit = defineEmits<{ open: [] }>();

const ariaLabel = computed(() => {
  const { label, badge, status } = props.app;
  if (status === "loading") return `${label}，載入中`;
  if (status === "error") return `${label}，讀取失敗`;
  return badge > 0 ? `${label}，${badge} 則` : label;
});
</script>

<template>
  <button type="button" class="peek-app" :aria-label="ariaLabel" @click="emit('open')">
    <span class="peek-app-icon">
      <component :is="props.app.icon" :size="26" :stroke-width="1.6" aria-hidden="true" />
      <span v-if="props.app.status === 'done' && props.app.badge > 0" class="peek-app-badge">
        {{ props.app.badge > 99 ? "99+" : props.app.badge }}
      </span>
      <span v-else-if="props.app.status === 'loading'" class="peek-app-state">
        <Loader2 :size="11" class="peek-app-spin" aria-hidden="true" />
      </span>
      <span v-else-if="props.app.status === 'error'" class="peek-app-state is-error" aria-hidden="true">!</span>
    </span>
    <span v-if="props.showLabel" class="peek-app-label">{{ props.app.label }}</span>
  </button>
</template>

<style scoped lang="scss">
.peek-app {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-width: 56px;
  padding: 0;
  border: none;
  background: none;
  color: var(--p-on-wall);
  font-family: inherit;
  cursor: pointer;

  &:active .peek-app-icon {
    transform: scale(0.94);
  }
}

.peek-app-icon {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: var(--p-app-icon);
  color: var(--p-app-glyph);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s;
}

.peek-app-badge {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  box-sizing: border-box;
  border-radius: 10px;
  background: var(--p-badge);
  color: #ffffff;
  font-family: var(--p-num);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.peek-app-state {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #121214;
  color: #ffffff;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;

  &.is-error {
    background: var(--p-badge);
  }
}

.peek-app-spin {
  animation: peek-app-spin 1s linear infinite;
}

.peek-app-label {
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

@keyframes peek-app-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
