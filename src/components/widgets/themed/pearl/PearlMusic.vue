<script setup lang="ts">
// 珍珠畫廊的音樂：語音導覽機。左耳機開音樂 App，右邊金色圓鈕播放 / 暫停
import { Headphones, Pause, Play } from "lucide-vue-next";
import type { ThemedMusicProps } from "../types";

const props = defineProps<ThemedMusicProps>();
const emit = defineEmits<{
  toggle: [];
  prev: [];
  next: [];
  open: [];
}>();

// 進度線限制在 0–100
const progressWidth = () => `${Math.min(100, Math.max(0, props.progress))}%`;
</script>

<template>
  <div class="pearl-music">
    <button
      type="button"
      class="pearl-music__headset"
      aria-label="打開音樂 App"
      @click.stop="emit('open')"
    >
      <Headphones class="pearl-music__headset-icon" :stroke-width="1.7" />
    </button>

    <div class="pearl-music__body">
      <span class="pearl-music__tag">語音導覽</span>
      <span class="pearl-music__title" :style="props.color ? { color: props.color } : undefined">
        {{ props.title }}
        <span v-if="props.artist" class="pearl-music__artist">— {{ props.artist }}</span>
      </span>
      <div class="pearl-music__track">
        <div class="pearl-music__fill" :style="{ width: progressWidth() }" />
      </div>
    </div>

    <button
      type="button"
      class="pearl-music__play"
      :aria-label="props.isPlaying ? '暫停' : '播放'"
      @click.stop="emit('toggle')"
    >
      <Pause v-if="props.isPlaying" class="pearl-music__play-icon" fill="currentColor" stroke-width="0" />
      <Play v-else class="pearl-music__play-icon pearl-music__play-icon--play" fill="currentColor" stroke-width="0" />
    </button>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子；按鈕與圖示大小以容器單位縮放（格子高 64px 時即為設計尺寸）
.pearl-music {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  // 寬格子一行放得下不會換行；方格時文字區換到第二行（見下方 @container）
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 12px;
  padding: 0 10px 0 12px;
  border-radius: 14px;
  background: #1f1c30;
  border: 1px solid #c9a45c55;
  color: #f3eee2;
  font-family: "Noto Serif TC", serif;

  // 金線圓圈裝耳機圖示
  &__headset {
    width: min(58cqh, 42px);
    height: min(58cqh, 42px);
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid #c9a45c;
    color: #e8cf8e;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  &__headset-icon {
    width: min(30cqh, 20px);
    height: min(30cqh, 20px);
  }

  // 中間文字區，超出截斷
  &__body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  &__tag {
    font-size: 10px;
    letter-spacing: 0.3em;
    color: #e8cf8e;
  }

  &__title {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__artist {
    font-size: 12px;
    color: #b9b2cc;
  }

  // 2px 進度線：底線淡、填色金
  &__track {
    height: 2px;
    background: #f3eee22e;
  }

  &__fill {
    height: 2px;
    background: #e8cf8e;
  }

  // 金色漸層圓鈕，圖示為深紫
  &__play {
    width: min(66cqh, 44px);
    height: min(66cqh, 44px);
    flex-shrink: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #e8cf8e 0%, #b8913f 60%, #9c7630 100%);
    color: #2b2840;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  &__play-icon {
    width: min(33cqh, 22px);
    height: min(33cqh, 22px);
  }

  // 播放三角形看起來偏左，往右微移視覺置中
  &__play-icon--play {
    margin-left: 2px;
  }
}

// 接近正方形的格子（例如沒有套用主題擺位、仍在 10×10）：
// 上排耳機 + 播放鈕，下排「語音導覽」、歌名與進度，避免文字被擠成直排
@container (aspect-ratio < 2.2) {
  .pearl-music__headset {
    width: 42px;
    height: 42px;
  }

  .pearl-music__headset-icon {
    width: 20px;
    height: 20px;
  }

  .pearl-music__play {
    margin-left: auto;
  }

  .pearl-music__body {
    order: 3;
    flex-basis: 100%;
  }

  .pearl-music__tag {
    white-space: nowrap;
  }
}
</style>
