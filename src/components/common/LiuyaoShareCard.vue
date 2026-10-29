<script setup lang="ts">
/** 聊天裡的六爻卦象卡片：小卦畫＋本卦→變卦＋問題 */
import type { LiuyaoShareSnapshot } from "@/types/liuyao";
import { POSITION_NAME } from "@/utils/liuyao/prompt";
import { computed } from "vue";

const props = defineProps<{ share: LiuyaoShareSnapshot }>();
const emit = defineEmits<{ (e: "open"): void }>();

/** 上爻在上 */
const rows = computed(() =>
  [...props.share.values].reverse().map((v) => ({ yang: v === 7 || v === 9, moving: v === 6 || v === 9 })),
);

const movingText = computed(() => {
  const ps = props.share.movingPositions;
  if (ps.length === 0) return "六爻安靜";
  return `${ps.map((p) => POSITION_NAME[p - 1]).join("、")}動`;
});
</script>

<template>
  <button type="button" class="liuyao-share-card" @click="emit('open')">
    <span class="liuyao-share-glyph" aria-hidden="true">
      <span v-for="(r, i) in rows" :key="i" class="liuyao-share-line" :class="{ yin: !r.yang, moving: r.moving }">
        <i /><i v-if="!r.yang" />
      </span>
    </span>
    <span class="liuyao-share-body">
      <span class="liuyao-share-brand">六爻{{ share.readerName ? `・${share.readerName}解` : "" }}</span>
      <span class="liuyao-share-hex">
        {{ share.originalName }}<template v-if="share.changedName"> → {{ share.changedName }}</template>
      </span>
      <span v-if="share.question" class="liuyao-share-q">{{ share.question }}</span>
      <span class="liuyao-share-moving">{{ movingText }}</span>
    </span>
  </button>
</template>

<style lang="scss" scoped>
.liuyao-share-card {
  display: flex;
  gap: 10px;
  align-items: center;
  width: 240px;
  max-width: 100%;
  min-width: 0;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
  color: #3a2c1e;
  background: #f6eedb;
  border: 1px solid rgba(58, 44, 30, 0.18);
  border-radius: 10px;
  cursor: pointer;
}

body.is-night-mode .liuyao-share-card {
  color: #efe6d2;
  background: #161a2c;
  border-color: rgba(216, 180, 106, 0.3);
}

.liuyao-share-glyph {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: none;
  width: 34px;
}

.liuyao-share-line {
  display: flex;
  gap: 6px;
  height: 4px;

  i {
    flex: 1;
    background: currentColor;
    border-radius: 1px;
    opacity: 0.85;
  }

  &.moving i {
    background: #8e3b2e;
    opacity: 1;
  }
}

body.is-night-mode .liuyao-share-line.moving i {
  background: #d8b46a;
}

.liuyao-share-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.liuyao-share-brand {
  font-size: 10px;
  letter-spacing: 0.08em;
  opacity: 0.6;
}

.liuyao-share-hex {
  font-family: "Noto Serif TC", "Songti TC", serif;
  font-size: 15px;
  font-weight: 600;
}

.liuyao-share-q {
  overflow: hidden;
  font-size: 12px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.liuyao-share-moving {
  font-size: 11px;
  opacity: 0.6;
}
</style>
