<script setup lang="ts">
// 極簡黑白音樂：設計稿照片右邊那一欄。上方是「正在播放」小標、歌名、歌手；
// 底部是 1px 黑框圓形播放鈕，旁邊一條細進度線與襯線的時間。
import { computed } from "vue";
import { Pause, Play } from "lucide-vue-next";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedMusicProps } from "../types";

const props = defineProps<ThemedMusicProps>();
const emit = defineEmits<{
  toggle: [];
  prev: [];
  next: [];
  open: [];
}>();

useOnDemandFont(
  "aguaphone-mono-font",
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
  computed(() => true),
);

/** 秒數轉成 m:ss */
function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const currentText = computed(() => formatTime(props.currentTime));
const durationText = computed(() => formatTime(props.duration));
const percent = computed(() => Math.min(100, Math.max(0, props.progress)));
</script>

<template>
  <div class="mono-music" :style="color ? { color } : undefined">
    <div class="mono-music__info">
      <span class="mono-music__label">正在播放</span>
      <span class="mono-music__title">{{ title }}</span>
      <span class="mono-music__artist">{{ artist }}</span>
    </div>

    <div class="mono-music__controls">
      <button
        type="button"
        class="mono-music__play"
        :aria-label="isPlaying ? '暫停' : '播放'"
        @click.stop="emit('toggle')"
      >
        <Pause v-if="isPlaying" :size="14" :stroke-width="1.5" fill="currentColor" aria-hidden="true" />
        <Play v-else class="mono-music__play-icon" :size="14" :stroke-width="1.5" fill="currentColor" aria-hidden="true" />
      </button>

      <div class="mono-music__progress">
        <div class="mono-music__track">
          <div class="mono-music__fill" :style="{ width: `${percent}%` }"></div>
        </div>
        <div class="mono-music__times">
          <span>{{ currentText }}</span>
          <span>{{ durationText }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 沒有卡片底色、陰影、圓角；顏色繼承 color，沒設定就是油墨黑
.mono-music {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  color: #1c1c1a;
  font-family: "Noto Sans TC", sans-serif;

  &__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__label {
    font-size: clamp(9px, 8cqh, 11px);
    letter-spacing: 0.3em;
    color: #5e5d58;
    line-height: 1.4;
    white-space: nowrap;
  }

  &__title {
    margin-top: 2px;
    font-family: "Noto Serif TC", serif;
    font-size: clamp(13px, 13cqh, 21px);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__artist {
    font-size: clamp(10px, 9cqh, 13px);
    color: #5e5d58;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__controls {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  // 1px 黑框圓鈕；尺寸跟著格子高度走，最小 34px、最大 44px（設計稿尺寸）
  &__play {
    width: clamp(34px, 34cqh, 44px);
    height: clamp(34px, 34cqh, 44px);
    flex-shrink: 0;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: none;
    color: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  // 三角形視覺上偏左，往右補 2px 讓它看起來置中
  &__play-icon {
    margin-left: 2px;
  }

  &__progress {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  // 底線 1px 細線，已播放的部分疊一條 2px 黑線
  &__track {
    position: relative;
    height: 1px;
    background: #1c1c1a33;
  }

  &__fill {
    position: absolute;
    left: 0;
    top: -0.5px;
    height: 2px;
    background: currentColor;
  }

  &__times {
    display: flex;
    justify-content: space-between;
    font-family: "Instrument Serif", "Noto Serif TC", serif;
    font-size: clamp(10px, 8.5cqh, 13px);
    color: #5e5d58;
    line-height: 1;
  }
}
</style>
