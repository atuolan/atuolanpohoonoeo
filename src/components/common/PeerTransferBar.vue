<script setup lang="ts">
/**
 * 裝置互傳的全域進度條：任何頁面最上方一條細線＋一小段文字，傳完自動消失。
 * 手機切出 App 可能讓連線中斷，看得到進度比較不會不小心切走。
 */
import { usePeerTransferStatus } from "@/composables/usePeerTransferStatus";

const { current } = usePeerTransferStatus();
</script>

<template>
  <Teleport to="body">
    <Transition name="peer-bar">
      <div v-if="current" class="peer-bar" role="status" aria-live="polite">
        <div class="peer-bar__track">
          <div
            v-if="current.percent !== null"
            class="peer-bar__fill"
            :style="{ width: current.percent + '%' }"
          />
          <div v-else class="peer-bar__fill peer-bar__fill--indeterminate" />
        </div>
        <span class="peer-bar__text">{{ current.text }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.peer-bar {
  position: fixed;
  top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  left: 0;
  right: 0;
  z-index: 99998;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.peer-bar__track {
  position: relative;
  width: 100%;
  height: 3px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.08);
}

.peer-bar__fill {
  height: 100%;
  background: linear-gradient(90deg, #22c55e, #4ade80);
  border-radius: 0 2px 2px 0;
  transition: width 0.3s ease;
}

.peer-bar__fill--indeterminate {
  position: absolute;
  width: 30%;
  animation: peer-bar-slide 1.2s ease-in-out infinite;
}

@keyframes peer-bar-slide {
  from {
    left: -30%;
  }
  to {
    left: 100%;
  }
}

.peer-bar__text {
  margin-top: 4px;
  max-width: calc(100% - 32px);
  padding: 4px 12px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 11px;
  white-space: nowrap;
  text-overflow: ellipsis;
  border-radius: 10px;
}

.peer-bar-enter-active,
.peer-bar-leave-active {
  transition: opacity 0.2s ease;
}

.peer-bar-enter-from,
.peer-bar-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .peer-bar__fill--indeterminate {
    left: 0;
    width: 100%;
    opacity: 0.5;
    animation: none;
  }
}
</style>
