<script setup lang="ts">
// 線描版型音樂：歪框長條，左側歪圓播放鈕與歌名，右側手繪波形依播放進度把前段畫成墨線、後段淡灰
import { computed } from "vue";
import { Pause, Play } from "lucide-vue-next";
import type { ThemedMusicProps } from "../types";

const props = defineProps<ThemedMusicProps>();
defineEmits<{
  toggle: [];
  prev: [];
  next: [];
  open: [];
}>();

// 波形條（viewBox 110×36，中線 y=18）：x 由 3 起每 6 一條，值為半長（照設計稿）
const BAR_HALF = [0, 5, 10, 4, 7, 3, 12, 6, 2, 9, 5, 1, 8, 4, 11, 3, 6, 1];
const bars = BAR_HALF.map((half, i) => ({ x: 3 + i * 6, y1: 18 - half, y2: 18 + half }));

const playedCount = computed(() => {
  const p = Math.min(100, Math.max(0, props.progress || 0));
  return Math.round((p / 100) * bars.length);
});

// 秒 → m:ss；非有限數字（尚未載入）當作 0:00
function fmt(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const subtitle = computed(() => [props.artist, fmt(props.duration)].filter(Boolean).join("・"));
</script>

<template>
  <div class="sk-music" :style="color ? { '--sk-fg': color } : undefined">
    <button
      type="button"
      class="sk-music__play"
      :aria-label="isPlaying ? '暫停' : '播放'"
      @click.stop="$emit('toggle')"
    >
      <Pause v-if="isPlaying" :size="16" :stroke-width="1.6" aria-hidden="true" />
      <Play v-else :size="16" :stroke-width="1.6" class="sk-music__play-icon" aria-hidden="true" />
    </button>

    <div class="sk-music__meta">
      <span class="sk-music__title">{{ title }}</span>
      <span class="sk-music__sub">{{ subtitle }}</span>
    </div>

    <svg class="sk-music__wave" viewBox="0 0 110 36" aria-hidden="true">
      <line
        v-for="(b, i) in bars"
        :key="i"
        :x1="b.x"
        :x2="b.x"
        :y1="b.y1"
        :y2="b.y2"
        :stroke="i < playedCount ? '#1A1A1A' : '#BBBBBB'"
      />
    </svg>
  </div>
</template>

<style lang="scss" scoped>
$ink: #1a1a1a;
$sub: #555555;

// 歪框長條的不規則圓角（設計稿 T5 的音樂列）
$bar-radius: 15px 225px 15px 255px / 255px 15px 225px 15px;

.sk-music {
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  // 子元件的 cqh / cqw 以格子大小為準，也讓下方 @container 生效
  container-type: size;
  display: flex;
  // 寬格子一行放得下不會換行；方格時歌名換到第二行（見下方 @container）
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 12px;
  padding: 0 16px 0 12px;
  border: 1.6px solid $ink;
  border-radius: $bar-radius;
  background: #ffffff;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--sk-fg, #{$ink});

  // 歪圓播放鈕：約 46px，格子矮時縮，但不低於 32px
  &__play {
    --pb: min(46px, max(32px, 72cqh));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--pb);
    height: var(--pb);
    padding: 0;
    margin: 0;
    border: 1.6px solid $ink;
    border-radius: 50% 46% 52% 48% / 48% 52% 46% 50%;
    background: #ffffff;
    color: $ink;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  // 播放三角形視覺上偏右，補 2px 讓重心置中（設計稿 margin-left: 2px）
  &__play-icon {
    margin-left: 2px;
  }

  // 歌名與歌手・總長度；寬度吃剩餘空間，超長就截斷
  &__meta {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    white-space: nowrap;
  }

  &__title {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: clamp(12px, 22cqh, 15px);
    color: var(--sk-fg, #{$ink});
  }

  &__sub {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: clamp(10px, 18cqh, 12px);
    color: $sub;
  }

  &__wave {
    flex-shrink: 0;
    display: block;
    width: min(110px, 30cqw);
    height: auto;
    aspect-ratio: 110 / 36;
    overflow: visible;

    line {
      stroke-width: 1.6;
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
  }
}

// 格子窄時隱藏波形，只留播放鈕與歌名
@container (max-width: 260px) {
  .sk-music__wave {
    display: none;
  }
}

// 接近正方形的格子：播放鈕在上、歌名與歌手換到下一行，避免截成「平凡的…」
@container (aspect-ratio < 2.2) {
  .sk-music__meta {
    order: 3;
    flex-basis: 100%;
  }
}
</style>
