<script setup lang="ts">
// 奶油風音樂：膠囊播放條，左邊焦糖唱片（播放時慢慢轉）、中間歌名與進度、右邊播放鈕
import { computed } from "vue";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import { Pause, Play } from "lucide-vue-next";
import type { ThemedMusicProps } from "../types";

const props = defineProps<ThemedMusicProps>();
const emit = defineEmits<{
  toggle: [];
  prev: [];
  next: [];
  open: [];
}>();

useOnDemandFont(
  "aguaphone-cream-font",
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap",
  computed(() => true),
);

// 進度夾在 0–100，避免超出軌道
const pct = computed(() => Math.min(100, Math.max(0, props.progress || 0)));

// 總長度顯示為 m:ss
const durationText = computed(() => {
  const total = Math.max(0, Math.floor(props.duration || 0));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
});

const vars = computed(() => ({
  "--cream-ink": props.color || "#4A3528",
  "--cream-soft": props.color || "#7E6250",
}));
</script>

<template>
  <div class="cream-music" :style="vars">
    <div class="cream-music__bar">
      <button
        type="button"
        class="cream-music__disc"
        :class="{ 'is-playing': isPlaying }"
        aria-label="打開音樂 App"
        @click.stop="emit('open')"
      ></button>

      <div class="cream-music__body">
        <div class="cream-music__meta">
          <span class="cream-music__title">{{ title }}</span>
          <span class="cream-music__artist">{{ artist }}</span>
        </div>
        <div class="cream-music__progress">
          <div class="cream-music__track">
            <div class="cream-music__fill" :style="{ width: `${pct}%` }"></div>
          </div>
          <span class="cream-music__time">{{ durationText }}</span>
        </div>
      </div>

      <button
        type="button"
        class="cream-music__play"
        :aria-label="isPlaying ? '暫停' : '播放'"
        @click.stop="emit('toggle')"
      >
        <Pause v-if="isPlaying" fill="currentColor" stroke="none" aria-hidden="true" />
        <Play v-else fill="currentColor" stroke="none" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$paper: #fffcf6;
$dial: #f5e6cf;
$caramel: #c98a55;
$caramel-light: #e3b07f;
$ink-default: #4a3528;
$soft-default: #7e6250;

// 根元素填滿格子並作為 cq 容器；膠囊內所有尺寸以高度（cqh）為基準
.cream-music {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  font-family: "Huninn", "Noto Sans TC", sans-serif;
  color: var(--cream-ink, #{$ink-default});

  &__bar {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    gap: 16.2cqh;
    padding: 0 14.9cqh;
    border-radius: 999px;
    background: $paper;
    box-shadow: 0 16px 30px -20px rgba(150, 100, 60, 0.55), inset 0 1px 0 #ffffff;
  }

  // 唱片：焦糖放射漸層，中心一圈奶白小孔
  &__disc {
    appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 70.3cqh;
    height: 70.3cqh;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    overflow: hidden;
    background: radial-gradient(circle closest-side, $paper 0 19%, $caramel 21%, $caramel-light 100%);
    box-shadow: 0 6px 12px -8px rgba(150, 100, 60, 0.6);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    // 旋轉時要看得出在轉：加一道半透明的光斑
    animation: cream-music-spin 8s linear infinite;
    animation-play-state: paused;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        rgba(255, 252, 246, 0) 0deg,
        rgba(255, 252, 246, 0.38) 40deg,
        rgba(255, 252, 246, 0) 90deg,
        rgba(255, 252, 246, 0) 200deg,
        rgba(255, 252, 246, 0.22) 240deg,
        rgba(255, 252, 246, 0) 290deg
      );
      pointer-events: none;
    }

    &.is-playing {
      animation-play-state: running;
    }

    &:focus-visible {
      outline: 2px solid $caramel;
      outline-offset: 2px;
    }
  }

  // 文字區佔滿中間剩下的寬度，超過就截斷
  &__body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 8cqh;
  }

  &__meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    white-space: nowrap;
  }

  &__title {
    min-width: 0;
    font-size: clamp(12px, 20.3cqh, 16px);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__artist {
    flex-shrink: 0;
    font-size: clamp(10px, 16.2cqh, 13px);
    color: var(--cream-soft, #{$soft-default});
  }

  &__progress {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-family: "Fraunces", "Noto Serif TC", serif;
    font-size: clamp(10px, 14.9cqh, 12px);
    color: var(--cream-soft, #{$soft-default});
  }

  // 粗 5px 的圓頭進度條
  &__track {
    flex: 1 1 auto;
    height: 5px;
    border-radius: 999px;
    background: $dial;
    overflow: hidden;
  }

  &__fill {
    height: 100%;
    border-radius: 999px;
    background: $caramel;
  }

  &__time {
    flex-shrink: 0;
  }

  // 播放鈕：焦糖圓形，圖示約為按鈕的 35%
  &__play {
    appearance: none;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64.9cqh;
    height: 64.9cqh;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: $caramel;
    color: $paper;
    box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.12);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;

    svg {
      width: 35%;
      height: 35%;
      margin-left: 4%;
    }

    &:focus-visible {
      outline: 2px solid $caramel;
      outline-offset: 2px;
    }
  }
}

// 接近正方形的格子（例如沒有套用主題擺位、仍在 10×10 的位置）：
// 膠囊改成圓角卡，上排唱片 + 播放鈕，下排歌名與進度，避免唱片撐滿、播放鈕溢出
@container (aspect-ratio < 2.2) {
  .cream-music__bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "disc play"
      "body body";
    align-content: space-between;
    align-items: start;
    gap: 8px;
    padding: 14px;
    border-radius: 32px;
  }

  .cream-music__disc {
    grid-area: disc;
    width: min(46cqh, 50cqw);
    height: min(46cqh, 50cqw);
  }

  .cream-music__play {
    grid-area: play;
    width: 44px;
    height: 44px;
  }

  .cream-music__body {
    grid-area: body;
    gap: 6px;
  }

  .cream-music__meta {
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
  }

  .cream-music__title {
    max-width: 100%;
    font-size: 15px;
  }

  .cream-music__artist {
    font-size: 12px;
  }
}

@keyframes cream-music-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cream-music__disc {
    animation: none;
  }
}
</style>
