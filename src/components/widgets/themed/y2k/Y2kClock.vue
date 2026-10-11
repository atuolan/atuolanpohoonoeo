<script setup lang="ts">
// Y2K 版型：MP3 隨身聽時鐘。這是唯一直接讀寫 music store 的版型（見 themed/types.ts 的例外說明）。
import { computed } from "vue";
import { Pause, Play, SkipBack, SkipForward } from "lucide-vue-next";
import { useMusicStore } from "@/stores";
import { useOnDemandFont } from "@/composables/useOnDemandFont";
import type { ThemedClockProps } from "../types";

const props = defineProps<ThemedClockProps>();

// 使用全局音樂 store，播放控制直接呼叫 store 方法（沒歌時由 store 自己處理）
const musicStore = useMusicStore();

// 液晶螢幕專用的點陣字體，只有這個版型用到，按需載入
useOnDemandFont(
  "aguaphone-y2k-font",
  "https://fonts.googleapis.com/css2?family=DotGothic16&display=swap",
  computed(() => true),
);

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const SEGMENTS = 12;

const pad = (n: number) => String(n).padStart(2, "0");
const hh = computed(() => pad(props.now.getHours()));
const mm = computed(() => pad(props.now.getMinutes()));
const ss = computed(() => pad(props.now.getSeconds()));
const dateText = computed(
  () =>
    `${pad(props.now.getMonth() + 1)}/${pad(props.now.getDate())} ${WEEKDAYS[props.now.getDay()]}`,
);

const track = computed(() => musicStore.currentTrack);
const nowPlayingText = computed(() => {
  const t = track.value;
  if (!t) return "沒有播放中的歌曲";
  return t.artist ? `${t.name}・${t.artist}` : t.name;
});

// 分段進度：亮起的格數 = 已播比例 × 12；沒歌時全暗
const litSegments = computed(() => {
  const d = musicStore.duration;
  if (!track.value || !d) return 0;
  return Math.min(SEGMENTS, Math.floor((musicStore.currentTime / d) * SEGMENTS));
});

// 使用者設定的文字色只套在液晶上（轉盤保持設計稿的銀色）
const screenStyle = computed(() => (props.color ? { color: props.color } : undefined));
</script>

<template>
  <div class="y2kc">
    <div class="y2kc-body">
      <div class="y2kc-screen" :style="screenStyle">
        <div class="y2kc-top">
          <span class="y2kc-date">{{ showDate ? dateText : "" }}</span>
          <span class="y2kc-battery" aria-hidden="true">
            <span class="y2kc-cells"><i /><i /><i /></span>
            <span class="y2kc-nub" />
          </span>
        </div>

        <div class="y2kc-time">
          {{ hh }}:{{ mm }}<span v-if="showSeconds" class="y2kc-sec">:{{ ss }}</span>
        </div>

        <div class="y2kc-bottom">
          <div class="y2kc-song" :class="{ 'is-empty': !track }">
            <template v-if="track">♫ </template>{{ nowPlayingText }}
          </div>
          <div class="y2kc-segs" aria-hidden="true">
            <span
              v-for="i in SEGMENTS"
              :key="i"
              class="y2kc-seg"
              :class="{ 'is-on': i <= litSegments }"
            />
          </div>
        </div>
      </div>

      <!-- 圓形觸控轉盤：所有按鈕 @click.stop，避免觸發整塊時鐘的點擊 -->
      <div class="y2kc-wheel">
        <span class="y2kc-menu">MENU</span>
        <button
          type="button"
          class="y2kc-btn y2kc-prev"
          aria-label="上一首"
          @click.stop="musicStore.prev()"
        >
          <SkipBack fill="currentColor" :stroke-width="1.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="y2kc-btn y2kc-next"
          aria-label="下一首"
          @click.stop="musicStore.next()"
        >
          <SkipForward fill="currentColor" :stroke-width="1.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="y2kc-btn y2kc-center"
          :aria-label="musicStore.isPlaying ? '暫停' : '播放'"
          @click.stop="musicStore.togglePlay()"
        >
          <Pause v-if="musicStore.isPlaying" fill="currentColor" :stroke-width="1.5" aria-hidden="true" />
          <Play v-else fill="currentColor" :stroke-width="1.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 尺寸全部以根元素高度（cqh）為基準：設計稿是 144px 高的格子，換算成 1cqh = 1.44px 的比例。
.y2kc {
  container-type: size;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  font-family: "DotGothic16", monospace;
}

// 銀色機身
.y2kc-body {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  padding: 9cqh 9.7cqh 9cqh 9cqh;
  border-radius: 22cqh;
  border: 1px solid #FFFFFF;
  background: linear-gradient(180deg, #FBFBFF 0%, #DCDEEA 55%, #C3C6D6 100%);
  box-shadow:
    inset 0 2px 0 #FFFFFF,
    inset 0 -4px 8px rgba(80, 70, 130, 0.25),
    0 16px 28px -16px rgba(60, 40, 120, 0.65);
  display: flex;
  align-items: center;
  gap: 8.3cqh;
}

// 液晶螢幕：上排日期 + 電池，中間大字時間，下排歌名與分段進度
.y2kc-screen {
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
  box-sizing: border-box;
  padding: 6.25cqh 8.3cqh;
  border-radius: 11cqh;
  border: 1px solid #8DA877;
  background: linear-gradient(180deg, #CFE6B6 0%, #AFCF93 100%);
  box-shadow: inset 0 2px 6px rgba(30, 50, 20, 0.4);
  color: #223018;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.y2kc-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 8.33cqh;
  line-height: 1;
  white-space: nowrap;
}

.y2kc-battery {
  display: flex;
  align-items: center;
  gap: 2px;
}

// 電池外框 18×9px，三格電量
.y2kc-cells {
  width: 12.5cqh;
  height: 6.25cqh;
  box-sizing: border-box;
  border: 1.5px solid currentColor;
  padding: 1px;
  display: flex;
  gap: 1px;

  i {
    flex: 1 1 0;
    background: currentColor;
  }
}

.y2kc-nub {
  width: 2px;
  height: 4px;
  background: currentColor;
}

.y2kc-time {
  font-size: 33.3cqh;
  line-height: 1;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.y2kc-sec {
  font-size: 0.5em;
  margin-left: 2px;
}

.y2kc-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.y2kc-song {
  font-size: 8.33cqh;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.is-empty {
    opacity: 0.7;
  }
}

// 12 格進度條，寬度撐滿螢幕；暗格用文字色的 20% 透明
.y2kc-segs {
  display: flex;
  gap: 2px;
  height: 3cqh;
}

.y2kc-seg {
  flex: 1 1 0;
  height: 100%;
  background: color-mix(in srgb, currentColor 20%, transparent);

  &.is-on {
    background: currentColor;
  }
}

// 轉盤：直徑 75cqh，四周按鈕各約 41%，觸控目標約 44px
.y2kc-wheel {
  position: relative;
  flex: 0 0 auto;
  width: 75cqh;
  height: 75cqh;
  box-sizing: border-box;
  border-radius: 50%;
  background: linear-gradient(180deg, #F7F7FC 0%, #D3D5E2 100%);
  box-shadow:
    inset 0 2px 0 #FFFFFF,
    inset 0 -3px 6px rgba(80, 70, 130, 0.25),
    0 2px 4px rgba(60, 40, 120, 0.25);
  color: #5A5378;
}

.y2kc-menu {
  position: absolute;
  top: 8%;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 6.25cqh;
  line-height: 1;
  font-weight: 700;
  letter-spacing: 0.12em;
  pointer-events: none;
}

.y2kc-btn {
  position: absolute;
  width: 41%;
  height: 41%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
  border-radius: 50%;

  svg {
    width: 9cqh;
    height: 9cqh;
  }
}

.y2kc-prev {
  left: 2%;
  top: 30%;
}

.y2kc-next {
  right: 2%;
  top: 30%;
}

// 中央按鈕：凹陷的白色圓鈕，顯示目前狀態（播放 / 暫停）
.y2kc-center {
  left: 29.6%;
  top: 29.6%;
  background: linear-gradient(180deg, #E9EAF2 0%, #FFFFFF 100%);
  box-shadow: inset 0 1px 3px rgba(80, 70, 130, 0.35);

  svg {
    width: 10cqh;
    height: 10cqh;
  }
}
</style>
