<script setup lang="ts">
/** 牌陣縮圖：用小矩形點出牌位，萬能牌陣以三張預覽 */
import type { DeckSpread } from "@/types/divination";
import { buildFlexiblePositions } from "@/utils/divination/flexibleSpread";
import { computed } from "vue";

const props = defineProps<{ spread: DeckSpread; active?: boolean }>();

const PAD = 14;

const dots = computed(() => {
  const coords = (props.spread.flexible ? buildFlexiblePositions(3) : props.spread.positions).map(
    (p) => p.coords,
  );
  const xs = coords.map((c) => c.x);
  const ys = coords.map((c) => c.y);
  const norm = (v: number, min: number, max: number) =>
    max === min ? 50 : PAD + ((v - min) / (max - min)) * (100 - PAD * 2);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  return coords.map((c, i) => ({
    key: i,
    style: {
      left: `${norm(c.x, minX, maxX)}%`,
      top: `${norm(c.y, minY, maxY)}%`,
      transform: `translate(-50%, -50%)${c.rotate ? ` rotate(${c.rotate}deg)` : ""}`,
    },
  }));
});
</script>

<template>
  <div class="spread-mini" :class="{ 'is-active': active, 'is-flexible': spread.flexible }" aria-hidden="true">
    <i v-for="d in dots" :key="d.key" :style="d.style" />
    <span v-if="spread.flexible" class="spread-mini__plus">±</span>
  </div>
</template>

<style scoped lang="scss">
.spread-mini {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;

  i {
    position: absolute;
    width: 6px;
    height: 10px;
    border-radius: 1px;
    background: var(--f-ink-2);
    opacity: 0.8;
  }

  &.is-active i {
    background: var(--f-accent);
    opacity: 1;
  }

  &__plus {
    position: absolute;
    right: -2px;
    bottom: -4px;
    font-size: 11px;
    color: var(--f-accent);
  }
}
</style>
