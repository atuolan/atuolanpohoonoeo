<script setup lang="ts">
/**
 * 牌陣：依可用寬高自動縮放牌的大小，保證不超框、不疊牌
 * mode：pick＝抽牌中（顯示空位）／reveal＝翻牌中／static＝全部翻開（歷史詳情）
 */
import type { DeckSpread, DrawnCard } from "@/types/divination";
import { fitSpreadLayout } from "@/utils/divination/fitSpreadLayout";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const LABEL_H = 14;

const props = withDefaults(
  defineProps<{
    spread: DeckSpread;
    drawn: DrawnCard[];
    revealed: Set<number>;
    cardBack: string;
    mode: "pick" | "reveal" | "static";
    selected?: number | null;
  }>(),
  { selected: null },
);

const emit = defineEmits<{ select: [index: number] }>();

const root = ref<HTMLElement | null>(null);
const size = ref({ width: 0, height: 0 });
let observer: ResizeObserver | null = null;

onMounted(() => {
  if (!root.value) return;
  observer = new ResizeObserver(([entry]) => {
    const { width, height } = entry.contentRect;
    size.value = { width, height };
  });
  observer.observe(root.value);
});

onBeforeUnmount(() => observer?.disconnect());

const layout = computed(() => {
  if (size.value.width <= 0 || size.value.height <= 0) return null;
  return fitSpreadLayout(
    props.spread.positions.map((p) => p.coords),
    size.value,
    { labelH: LABEL_H },
  );
});

const slots = computed(() => {
  const l = layout.value;
  if (!l) return [];
  return props.spread.positions.map((position, i) => {
    const s = l.slots[i];
    const sideways = Math.abs(s.rotate % 180) === 90;
    const fw = sideways ? l.cardH : l.cardW;
    const fh = (sideways ? l.cardW : l.cardH) + LABEL_H;
    const drawn = props.drawn[i] ?? null;
    const isRevealed = props.mode === "static" || props.revealed.has(i);
    return {
      i,
      position,
      drawn,
      isRevealed,
      sideways,
      boxStyle: {
        left: `${s.left - fw / 2}px`,
        top: `${s.top - fh / 2}px`,
        width: `${fw}px`,
        height: `${fh}px`,
      },
      cardStyle: {
        width: `${l.cardW}px`,
        height: `${l.cardH}px`,
        transform: s.rotate ? `rotate(${s.rotate}deg)` : undefined,
      },
    };
  });
});

const nextEmpty = computed(() => (props.mode === "pick" ? props.drawn.length : -1));

function onSlotClick(i: number) {
  if (!props.drawn[i] || props.mode === "pick") return;
  emit("select", i);
}
</script>

<template>
  <div ref="root" class="spread-board">
    <div
      v-for="slot in slots"
      :key="slot.position.id"
      class="spread-board__slot"
      :class="{ 'is-sideways': slot.sideways }"
      :style="slot.boxStyle"
    >
      <div class="spread-board__card-area">
        <!-- 空位 -->
        <div
          v-if="!slot.drawn"
          class="spread-board__empty"
          :class="{ 'is-next': slot.i === nextEmpty }"
          :style="slot.cardStyle"
        >
          {{ slot.i + 1 }}
        </div>

        <!-- 已抽到的牌 -->
        <button
          v-else
          type="button"
          class="spread-board__card"
          :class="{
            'is-flipped': slot.isRevealed,
            'is-selected': selected === slot.i,
            'is-waiting': mode === 'reveal' && !slot.isRevealed,
            'is-landing': mode === 'pick',
          }"
          :style="slot.cardStyle"
          :aria-label="`${slot.position.name}${slot.isRevealed ? '：' + slot.drawn.card.name : '（未翻開）'}`"
          @click="onSlotClick(slot.i)"
        >
          <span class="spread-board__inner">
            <span class="spread-board__face spread-board__face--back">
              <img :src="cardBack" alt="" draggable="false" />
            </span>
            <span
              class="spread-board__face spread-board__face--front"
              :class="{ 'is-reversed': slot.drawn.reversed }"
            >
              <img :src="slot.drawn.card.image" :alt="slot.drawn.card.name" draggable="false" />
            </span>
          </span>
        </button>
      </div>

      <div v-if="!slot.sideways" class="spread-board__label">{{ slot.position.name }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.spread-board {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;

  &__slot {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    transition:
      left 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      top 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      width 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      height 0.45s cubic-bezier(0.22, 1, 0.36, 1);

    &.is-sideways {
      z-index: 2;
    }
  }

  &__card-area {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__label {
    height: 14px;
    line-height: 14px;
    max-width: 120%;
    font-family: var(--f-font-head);
    font-size: 10px;
    letter-spacing: 0.04em;
    color: var(--f-ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  &__empty {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--f-line-strong);
    border-radius: var(--f-radius);
    font-family: var(--f-font-head);
    font-size: 12px;
    color: var(--f-line-strong);
    transition:
      box-shadow 0.3s,
      border-color 0.3s;

    &.is-next {
      border-style: solid;
      border-color: var(--f-accent);
      color: var(--f-accent);
      box-shadow: 0 0 14px var(--f-accent-soft);
      animation: slot-breathe 1.8s ease-in-out infinite;
    }
  }

  &__card {
    flex-shrink: 0;
    padding: 0;
    border: none;
    background: none;
    perspective: 800px;
    cursor: pointer;
    transition:
      width 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      height 0.45s cubic-bezier(0.22, 1, 0.36, 1);

    &.is-landing {
      cursor: default;
      animation: card-land 0.5s cubic-bezier(0.22, 1, 0.36, 1);
    }

    &.is-waiting .spread-board__face--back {
      animation: card-wait 2.4s ease-in-out infinite;
    }

    &.is-selected .spread-board__face {
      box-shadow: var(--f-card-glow);
    }
  }

  &__inner {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);

    .is-flipped & {
      transform: rotateY(180deg);
    }
  }

  &__face {
    position: absolute;
    inset: 0;
    border-radius: var(--f-radius);
    overflow: hidden;
    backface-visibility: hidden;
    box-shadow: var(--f-card-shadow);
    transition: box-shadow 0.25s;

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      user-select: none;
    }

    &--back img {
      filter: var(--f-card-back-filter);
    }

    &--front {
      transform: rotateY(180deg);

      &.is-reversed img {
        transform: rotate(180deg);
      }
    }
  }
}

@keyframes slot-breathe {
  0%,
  100% {
    box-shadow: 0 0 6px var(--f-accent-soft);
  }
  50% {
    box-shadow: 0 0 18px var(--f-accent-soft);
  }
}

@keyframes card-land {
  from {
    opacity: 0;
    transform: translateY(80px) scale(0.7);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes card-wait {
  0%,
  100% {
    box-shadow: var(--f-card-shadow);
  }
  50% {
    box-shadow: var(--f-card-glow);
  }
}
</style>
