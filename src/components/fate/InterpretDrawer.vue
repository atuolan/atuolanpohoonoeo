<script setup lang="ts">
/**
 * 解讀抽屜：牌陣不動，解讀從底部升起
 * 三段高度：peek（只露把手）／half／full，可點把手或上下拖曳切換
 */
import type { DrawerSnap } from "@/types/divination";
import { computed, ref } from "vue";

const props = defineProps<{
  html: string;
  loading: boolean;
  error: string | null;
  snap: DrawerSnap;
}>();

const emit = defineEmits<{
  "update:snap": [snap: DrawerSnap];
  retry: [];
  newReading: [];
}>();

const PEEK_PX = 60;
const SNAP_RATIO: Record<DrawerSnap, number> = { peek: 0, half: 0.55, full: 1 };

const root = ref<HTMLElement | null>(null);
const dragHeight = ref<number | null>(null);
let startY = 0;
let startHeight = 0;
let moved = 0;

function parentHeight() {
  return root.value?.parentElement?.clientHeight ?? window.innerHeight;
}

function heightOf(snap: DrawerSnap) {
  return snap === "peek" ? PEEK_PX : parentHeight() * SNAP_RATIO[snap];
}

const style = computed(() => {
  if (dragHeight.value !== null) return { height: `${dragHeight.value}px`, transition: "none" };
  return { height: props.snap === "peek" ? `${PEEK_PX}px` : `${SNAP_RATIO[props.snap] * 100}%` };
});

const NEXT_ON_TAP: Record<DrawerSnap, DrawerSnap> = { peek: "half", half: "full", full: "half" };

function onGrabDown(e: PointerEvent) {
  startY = e.clientY;
  startHeight = root.value?.getBoundingClientRect().height ?? heightOf(props.snap);
  moved = 0;
  window.addEventListener("pointermove", onGrabMove);
  window.addEventListener("pointerup", onGrabUp);
  window.addEventListener("pointercancel", onGrabUp);
}

function onGrabMove(e: PointerEvent) {
  const dy = startY - e.clientY;
  moved = Math.max(moved, Math.abs(dy));
  if (moved < 6) return;
  dragHeight.value = Math.min(parentHeight(), Math.max(PEEK_PX, startHeight + dy));
}

function onGrabUp() {
  window.removeEventListener("pointermove", onGrabMove);
  window.removeEventListener("pointerup", onGrabUp);
  window.removeEventListener("pointercancel", onGrabUp);
  if (dragHeight.value === null) {
    emit("update:snap", NEXT_ON_TAP[props.snap]);
    return;
  }
  const h = dragHeight.value;
  const nearest = (["peek", "half", "full"] as DrawerSnap[]).reduce((best, s) =>
    Math.abs(heightOf(s) - h) < Math.abs(heightOf(best) - h) ? s : best,
  );
  dragHeight.value = null;
  emit("update:snap", nearest);
}
</script>

<template>
  <section ref="root" class="interpret-drawer" :class="`is-${snap}`" :style="style" aria-label="解讀">
    <header
      class="interpret-drawer__grab"
      role="button"
      tabindex="0"
      :aria-label="snap === 'full' ? '縮小解讀' : '展開解讀'"
      @pointerdown="onGrabDown"
      @keydown.enter.prevent="emit('update:snap', NEXT_ON_TAP[snap])"
    >
      <span class="interpret-drawer__handle" />
      <span class="interpret-drawer__title">神　諭</span>
      <span v-if="loading" class="interpret-drawer__status">解讀中…</span>
    </header>

    <div class="interpret-drawer__body">
      <div v-if="error" class="interpret-drawer__error">
        <p>{{ error }}</p>
        <p class="interpret-drawer__error-hint">請檢查 API 設定後重試。</p>
      </div>
      <div v-else-if="html" class="fate-markdown" v-html="html" />
      <p v-else-if="loading" class="interpret-drawer__waiting">正在聆聽牌的訊息…</p>
    </div>

    <footer v-if="!loading" class="interpret-drawer__actions">
      <button type="button" class="fate-btn" @click="emit('retry')">
        {{ error ? "重試" : "重新解讀" }}
      </button>
      <button type="button" class="fate-btn fate-btn--primary" @click="emit('newReading')">
        新的占卜
      </button>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.interpret-drawer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: var(--f-panel-solid);
  border-top: 1px solid var(--f-line-strong);
  border-radius: 18px 18px 0 0;
  box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.35);
  transition: height 0.35s cubic-bezier(0.22, 1, 0.36, 1);
  overflow: hidden;

  &.is-full {
    border-radius: 0;
  }

  &__grab {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 16px 6px;
    cursor: grab;
    touch-action: none;
    user-select: none;
    position: relative;
  }

  &__handle {
    width: 36px;
    height: 4px;
    border-radius: 4px;
    background: var(--f-line-strong);
    margin-bottom: 6px;
  }

  &__title {
    font-family: var(--f-font-head);
    font-size: 15px;
    letter-spacing: 0.3em;
    color: var(--f-accent);
  }

  &__status {
    position: absolute;
    right: 16px;
    bottom: 8px;
    font-size: 11px;
    color: var(--f-ink-2);
    animation: pulse-text 1.6s ease-in-out infinite;
  }

  &__body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 6px 20px 16px;
  }

  &.is-peek &__body,
  &.is-peek &__actions {
    display: none;
  }

  &__waiting {
    margin: 24px 0;
    text-align: center;
    font-size: 13px;
    color: var(--f-ink-2);
    animation: pulse-text 1.6s ease-in-out infinite;
  }

  &__error {
    margin: 12px 0;
    padding: 14px;
    text-align: center;
    color: var(--f-danger);
    border: 1px solid var(--f-danger);
    border-radius: var(--f-radius);

    p {
      margin: 0;
    }
  }

  &__error-hint {
    margin-top: 6px !important;
    font-size: 12px;
    color: var(--f-ink-2);
  }

  &__actions {
    flex-shrink: 0;
    display: flex;
    gap: 10px;
    padding: 10px 16px calc(12px + var(--safe-bottom, 0px));
    border-top: 1px solid var(--f-line);
  }
}

@keyframes pulse-text {
  0%,
  100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}
</style>
