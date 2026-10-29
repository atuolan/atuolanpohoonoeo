<script setup lang="ts">
import type { CoinFace } from "@/types/liuyao";
import { ref, watch } from "vue";

interface Props {
  state: "idle" | "shaking" | "landed";
  coins: CoinFace[] | null;
  hint: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
});

const emit = defineEmits<{
  (e: "pressStart"): void;
  (e: "pressEnd"): void;
}>();

const flipKey = ref(0);

watch(
  () => props.coins,
  () => {
    flipKey.value += 1;
  },
  { deep: true },
);

function getCoinFace(index: number): CoinFace {
  if (props.state === "shaking" || !props.coins) {
    return 2;
  }
  return props.coins[index] ?? 2;
}

function onPointerDown(e: PointerEvent) {
  if (props.disabled) return;
  const target = e.currentTarget as HTMLElement | null;
  target?.setPointerCapture?.(e.pointerId);
  emit("pressStart");
}

function onPointerUp(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement | null;
  try {
    target?.releasePointerCapture?.(e.pointerId);
  } catch {}
  emit("pressEnd");
}

function onPointerCancel(e: PointerEvent) {
  const target = e.currentTarget as HTMLElement | null;
  try {
    target?.releasePointerCapture?.(e.pointerId);
  } catch {}
  emit("pressEnd");
}
</script>

<template>
  <div
    class="coin-tray"
    :class="[`coin-tray--${state}`, { 'is-disabled': disabled }]"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <div :key="flipKey" class="coin-tray__coins">
      <div
        v-for="i in 3"
        :key="i"
        class="coin-slot"
        :class="[`coin-slot--${i - 1}`, `coin-slot--${getCoinFace(i - 1) === 3 ? 'back' : 'front'}`]"
      >
        <div class="coin">
          <svg class="coin__svg" viewBox="0 0 100 100" aria-hidden="true">
            <defs>
              <radialGradient :id="`coin-grad-${i}`" cx="35%" cy="30%" r="70%">
                <stop offset="0%" class="coin__stop-a" />
                <stop offset="100%" class="coin__stop-b" />
              </radialGradient>
            </defs>
            <circle class="coin__rim" cx="50" cy="50" r="46" :fill="`url(#coin-grad-${i})`" stroke-width="3" />
            <circle class="coin__ink-line" cx="50" cy="50" r="40" fill="none" stroke-width="1.2" opacity="0.75" />
            <rect class="coin__ink-line" x="39" y="39" width="22" height="22" fill="none" stroke-width="2.5" />
            <g v-if="getCoinFace(i - 1) === 2" class="coin__text">
              <text x="50" y="27" text-anchor="middle">六</text>
              <text x="50" y="80" text-anchor="middle">爻</text>
              <text x="77" y="55" text-anchor="middle">通</text>
              <text x="23" y="55" text-anchor="middle">寶</text>
            </g>
            <g v-else class="coin__pattern">
              <path d="M 27 40 C 24 45, 24 55, 27 60 C 29 55, 29 45, 27 40 Z" opacity="0.85" />
              <path d="M 73 40 C 76 45, 76 55, 73 60 C 71 55, 71 45, 73 40 Z" opacity="0.85" />
            </g>
          </svg>
        </div>
        <div v-if="coins !== null" class="coin-slot__label">
          {{ getCoinFace(i - 1) === 3 ? "背" : "字" }}
        </div>
      </div>
    </div>
    <div class="coin-tray__hint">{{ hint }}</div>
  </div>
</template>

<style scoped lang="scss">
.coin-tray {
  width: 100%;
  height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  touch-action: none;
  user-select: none;
  -webkit-touch-callout: none;
  cursor: pointer;
  transition: transform 0.15s ease-out;

  &:active {
    transform: scale(0.98);
  }

  &.is-disabled {
    cursor: not-allowed;
    pointer-events: none;
    opacity: 0.6;
  }
}

.coin-tray--idle .coin-slot {
  opacity: 0.85;
}

.coin-tray__coins {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.coin-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 72px;
}

.coin {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  perspective: 600px;
}

.coin__svg {
  width: 100%;
  height: 100%;
  display: block;
}

.coin__stop-a {
  stop-color: var(--f-accent);
}

.coin__stop-b {
  stop-color: var(--f-accent);
  stop-opacity: 0.55;
}

.coin__rim,
.coin__ink-line {
  stroke: var(--f-accent-ink);
}

.coin__pattern {
  fill: var(--f-accent-ink);
  stroke: none;
}

.coin__text text {
  font-family: var(--f-font-head);
  font-size: 13px;
  fill: var(--f-accent-ink);
  font-weight: 600;
  dominant-baseline: central;
}

.coin-slot__label {
  margin-top: 6px;
  font-size: 11px;
  color: var(--f-ink-2);
  line-height: 1;
}

.coin-tray__hint {
  font-size: 12px;
  color: var(--f-ink-2);
  line-height: 1.4;
  text-align: center;
}

// 搖晃動畫
.coin-tray--shaking {
  .coin-slot--0 .coin {
    animation: coin-shake-0 0.32s infinite ease-in-out;
  }
  .coin-slot--1 .coin {
    animation: coin-shake-1 0.32s 0.08s infinite ease-in-out;
  }
  .coin-slot--2 .coin {
    animation: coin-shake-2 0.32s 0.16s infinite ease-in-out;
  }
}

@keyframes coin-shake-0 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(-5px, -4px) rotate(-16deg); }
  50% { transform: translate(4px, 3px) rotate(12deg); }
  75% { transform: translate(-3px, 5px) rotate(-10deg); }
}

@keyframes coin-shake-1 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(6px, -3px) rotate(18deg); }
  50% { transform: translate(-4px, 5px) rotate(-14deg); }
  75% { transform: translate(3px, -4px) rotate(8deg); }
}

@keyframes coin-shake-2 {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(-4px, 6px) rotate(-12deg); }
  50% { transform: translate(5px, -5px) rotate(16deg); }
  75% { transform: translate(-5px, -2px) rotate(-18deg); }
}

// 落地翻轉動畫
.coin-tray--landed {
  .coin-slot--0 .coin {
    animation: coin-land 0.55s ease-out 0ms backwards;
  }
  .coin-slot--1 .coin {
    animation: coin-land 0.55s ease-out 80ms backwards;
  }
  .coin-slot--2 .coin {
    animation: coin-land 0.55s ease-out 160ms backwards;
  }
}

@keyframes coin-land {
  0% {
    transform: translateY(-24px) rotateY(720deg);
    opacity: 0.6;
  }
  100% {
    transform: translateY(0) rotateY(0deg);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .coin-tray--shaking .coin-slot .coin,
  .coin-tray--landed .coin-slot .coin {
    animation-duration: 0.01s !important;
    animation-iteration-count: 1 !important;
  }
}
</style>

