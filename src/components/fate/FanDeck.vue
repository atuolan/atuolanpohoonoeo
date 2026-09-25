<script setup lang="ts">
/**
 * 扇形牌堆：左右拖曳轉動（含慣性），點一下抽牌
 * 整個區塊 touch-action: none，拖曳時不會帶動頁面
 */
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{
  count: number;
  picked: Set<number>;
  cardBack: string;
  disabled: boolean;
}>();

const emit = defineEmits<{ pick: [index: number] }>();

const ANGLE_STEP = 3.2;
const VISIBLE_ANGLE = 42;
const DRAG_THRESHOLD = 8;

const root = ref<HTMLElement | null>(null);
const height = ref(180);
let observer: ResizeObserver | null = null;

/** 牌的尺寸與扇形半徑隨容器高度調整 */
const cardH = computed(() => Math.round(Math.min(96, Math.max(70, height.value * 0.52))));
const cardW = computed(() => Math.round(cardH.value * 0.6));
const radius = computed(() => cardH.value * 4.2);

const offset = ref(0);
let target = 0;
let velocity = 0;
let pointerDown = false;
let dragging = false;
let startX = 0;
let lastX = 0;
let moved = 0;
let suppressClick = false;
let animId: number | null = null;

const maxOffset = computed(() => (props.count / 2) * ANGLE_STEP);

function angleOf(index: number) {
  return (index - Math.floor(props.count / 2)) * ANGLE_STEP + offset.value;
}

const cards = computed(() =>
  Array.from({ length: props.count }, (_, index) => {
    const angle = angleOf(index);
    const visible = Math.abs(angle) <= VISIBLE_ANGLE;
    const picked = props.picked.has(index);
    return {
      index,
      picked,
      style: {
        width: `${cardW.value}px`,
        height: `${cardH.value}px`,
        marginLeft: `${-cardW.value / 2}px`,
        transformOrigin: `${cardW.value / 2}px ${radius.value}px`,
        transform: `rotate(${angle}deg)`,
        opacity: picked || !visible ? 0 : 1,
        pointerEvents: (visible && !picked ? "auto" : "none") as "auto" | "none",
      },
    };
  }),
);

function clientX(e: PointerEvent) {
  return e.clientX;
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return;
  pointerDown = true;
  dragging = false;
  moved = 0;
  startX = lastX = clientX(e);
  velocity = 0;
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!pointerDown) return;
  const x = clientX(e);
  moved = Math.abs(x - startX);
  if (!dragging && moved > DRAG_THRESHOLD) dragging = true;
  if (!dragging) return;
  velocity = (x - lastX) * 0.15;
  if (Math.abs(target + velocity) > maxOffset.value) velocity *= 0.3;
  target += velocity;
  offset.value = target;
  lastX = x;
}

function onPointerUp() {
  pointerDown = false;
  if (dragging) {
    suppressClick = true;
    requestAnimationFrame(() => (suppressClick = false));
    if (Math.abs(velocity) > 0.1) startInertia();
  }
  dragging = false;
  unbind();
}

function unbind() {
  window.removeEventListener("pointermove", onPointerMove);
  window.removeEventListener("pointerup", onPointerUp);
  window.removeEventListener("pointercancel", onPointerUp);
}

function step() {
  velocity *= 0.85;
  if (Math.abs(velocity) > 0.01) target += velocity;
  const max = maxOffset.value;
  if (target > max) {
    target = max + (target - max) * 0.85;
    velocity *= 0.5;
  } else if (target < -max) {
    target = -max + (target + max) * 0.85;
    velocity *= 0.5;
  }
  const diff = target - offset.value;
  offset.value += diff * 0.18;
  if (Math.abs(velocity) < 0.01 && Math.abs(diff) < 0.1) {
    offset.value = Math.max(-max, Math.min(max, offset.value));
    target = offset.value;
    animId = null;
    return;
  }
  animId = requestAnimationFrame(step);
}

function startInertia() {
  if (animId === null) animId = requestAnimationFrame(step);
}

function onCardClick(index: number) {
  if (suppressClick || props.disabled) return;
  emit("pick", index);
}

onMounted(() => {
  if (!root.value) return;
  observer = new ResizeObserver(([entry]) => {
    if (entry.contentRect.height > 0) height.value = entry.contentRect.height;
  });
  observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (animId !== null) cancelAnimationFrame(animId);
  unbind();
});
</script>

<template>
  <div
    ref="root"
    class="fan-deck"
    :class="{ 'is-disabled': disabled }"
    data-no-swipe-back
    @pointerdown="onPointerDown"
  >
    <button
      v-for="card in cards"
      :key="card.index"
      type="button"
      class="fan-deck__card"
      :style="card.style"
      :tabindex="card.picked ? -1 : 0"
      aria-label="抽這張牌"
      @click="onCardClick(card.index)"
    >
      <img :src="cardBack" alt="" draggable="false" />
    </button>
    <p class="fan-deck__hint">← 拖曳轉動・點一下抽牌 →</p>
  </div>
</template>

<style scoped lang="scss">
.fan-deck {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &.is-disabled {
    pointer-events: none;
    opacity: 0.5;
  }

  &__card {
    position: absolute;
    top: 12px;
    left: 50%;
    padding: 0;
    border: none;
    background: none;
    border-radius: var(--f-radius);
    overflow: hidden;
    box-shadow: var(--f-card-shadow);
    cursor: pointer;
    transition:
      opacity 0.25s,
      box-shadow 0.2s,
      top 0.2s;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: var(--f-card-back-filter);
      pointer-events: none;
    }

    @media (hover: hover) {
      &:hover {
        top: 2px;
        box-shadow: var(--f-card-glow);
      }
    }

    &:focus-visible {
      top: 2px;
      outline: none;
      box-shadow: var(--f-card-glow);
    }
  }

  &__hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 6px;
    margin: 0;
    text-align: center;
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--f-ink-2);
    pointer-events: none;
  }
}
</style>
