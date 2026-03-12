<script setup lang="ts">
import { useMusicStore } from "@/stores";
import type { WidgetCustomStyle } from "@/types";
import {
    AlertTriangle,
    Heart,
    Music,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from "lucide-vue-next";
import { computed, onUnmounted, ref } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  navigate: [page: string];
}>();

// 使用全局音樂 store
const musicStore = useMusicStore();

// 本地模擬數據（當沒有全局播放時使用）
const localSongs = [
  { title: "平凡的一天", artist: "毛不易", duration: 276 },
  { title: "像我這樣的人", artist: "毛不易", duration: 258 },
  { title: "消愁", artist: "毛不易", duration: 285 },
  { title: "借", artist: "毛不易", duration: 267 },
  { title: "盛夏", artist: "毛不易", duration: 243 },
];

const localIndex = ref(0);
const localPlaying = ref(false);
const localTime = ref(0);
const isLiked = ref(false);
let intervalId: number | null = null;

// 判斷是否使用全局播放
const useGlobalPlayer = computed(() => musicStore.currentTrack !== null);

// 當前歌曲信息
const currentSong = computed(() => {
  if (useGlobalPlayer.value && musicStore.currentTrack) {
    return {
      title: musicStore.currentTrack.name,
      artist: musicStore.currentTrack.artist,
      duration: musicStore.duration || 240,
    };
  }
  return localSongs[localIndex.value];
});

// 播放狀態
const isPlaying = computed(() => {
  if (useGlobalPlayer.value) {
    return musicStore.isPlaying;
  }
  return localPlaying.value;
});

// 當前時間
const currentTime = computed(() => {
  if (useGlobalPlayer.value) {
    return musicStore.currentTime;
  }
  return localTime.value;
});

// 進度
const progress = computed(() => {
  const duration = currentSong.value.duration || 1;
  return (currentTime.value / duration) * 100;
});

// 獲取當前佈局風格
const currentLayout = computed(
  () => props.data?.customStyle?.layout || "compact",
);

// 獲取黑膠唱片子風格
const vinylStyle = computed(
  () => props.data?.customStyle?.vinylStyle || "pop",
);

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function togglePlay() {
  if (useGlobalPlayer.value) {
    musicStore.togglePlay();
  } else {
    localPlaying.value = !localPlaying.value;

    if (localPlaying.value) {
      intervalId = window.setInterval(() => {
        if (localTime.value < currentSong.value.duration) {
          localTime.value += 1;
        } else {
          nextSong();
        }
      }, 1000);
    } else if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
}

function prevSong() {
  if (useGlobalPlayer.value) {
    musicStore.prev();
  } else {
    localIndex.value =
      (localIndex.value - 1 + localSongs.length) % localSongs.length;
    localTime.value = 0;
  }
}

function nextSong() {
  if (useGlobalPlayer.value) {
    musicStore.next();
  } else {
    localIndex.value = (localIndex.value + 1) % localSongs.length;
    localTime.value = 0;
  }
}

function toggleLike() {
  isLiked.value = !isLiked.value;
}

// 點擊 vinyl 進入音樂 App
function openMusicApp() {
  emit("navigate", "music");
}

// 自定義樣式
const containerStyle = computed(() => {
  const style = props.data?.customStyle;
  if (!style) return {};

  const result: Record<string, string> = {};
  if (style.backgroundGradient) {
    result.background = style.backgroundGradient;
  } else if (style.backgroundColor) {
    result.background = style.backgroundColor;
  }
  if (style.borderColor) {
    result.borderColor = style.borderColor;
    result.borderWidth = `${style.borderWidth || 2}px`;
    result.borderStyle = "solid";
  }
  return result;
});

const textStyle = computed(() => {
  const style = props.data?.customStyle;
  if (style?.textColor) return { color: style.textColor };
  if (style?.foregroundColor) return { color: style.foregroundColor };
  return {};
});

onUnmounted(() => {
  if (intervalId) clearInterval(intervalId);
});
</script>

<template>
  <div
    class="music-player-container"
    :style="containerStyle"
    :class="currentLayout"
  >
    <!-- 播放錯誤通知 -->
    <Transition name="widget-toast">
      <div
        v-if="musicStore.playError"
        class="widget-error-toast"
        @click="musicStore.dismissPlayError()"
      >
        <AlertTriangle :size="14" />
        <span class="error-text"
          >{{ musicStore.playError.trackName }}：{{
            musicStore.playError.message
          }}</span
        >
      </div>
    </Transition>

    <!-- 風格 1: Compact (橫條簡約) -->
    <template v-if="currentLayout === 'compact'">
      <div class="album-art">
        <div class="album-cover" :class="{ spinning: isPlaying }">
          <Music :size="20" />
        </div>
      </div>

      <div class="player-content">
        <div class="song-header">
          <div class="song-details">
            <div class="song-title" :style="textStyle">
              {{ currentSong.title }}
            </div>
            <div class="song-artist">{{ currentSong.artist }}</div>
          </div>
          <button
            class="like-btn"
            :class="{ liked: isLiked }"
            @click="toggleLike"
          >
            <Heart :size="14" :fill="isLiked ? 'currentColor' : 'none'" />
          </button>
        </div>

        <div class="controls-row">
          <button class="control-btn small" @click="prevSong">
            <SkipBack :size="16" />
          </button>
          <button class="play-btn small" @click="togglePlay">
            <Pause v-if="isPlaying" :size="16" fill="currentColor" />
            <Play
              v-else
              :size="16"
              fill="currentColor"
              style="margin-left: 2px"
            />
          </button>
          <button class="control-btn small" @click="nextSong">
            <SkipForward :size="16" />
          </button>
        </div>

        <div class="progress-container">
          <div class="time-text">{{ formatTime(currentTime) }}</div>
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          <div class="time-text">{{ formatTime(currentSong.duration) }}</div>
        </div>
      </div>
    </template>

    <!-- 風格 2: Classic (經典卡片) -->
    <template v-else-if="currentLayout === 'classic'">
      <div class="classic-layout">
        <div class="classic-cover-wrapper">
          <div class="classic-cover" :class="{ playing: isPlaying }">
            <Music :size="48" />
          </div>
        </div>

        <div class="classic-info">
          <div class="song-title big" :style="textStyle">
            {{ currentSong.title }}
          </div>
          <div class="song-artist">{{ currentSong.artist }}</div>
        </div>

        <div class="classic-progress">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          <div class="time-row">
            <span>{{ formatTime(currentTime) }}</span>
            <span>{{ formatTime(currentSong.duration) }}</span>
          </div>
        </div>

        <div class="classic-controls">
          <button class="control-btn" @click="prevSong">
            <SkipBack :size="24" />
          </button>
          <button class="play-btn big" @click="togglePlay">
            <Pause v-if="isPlaying" :size="28" fill="currentColor" />
            <Play
              v-else
              :size="28"
              fill="currentColor"
              style="margin-left: 4px"
            />
          </button>
          <button class="control-btn" @click="nextSong">
            <SkipForward :size="24" />
          </button>
        </div>

        <button
          class="classic-like"
          :class="{ liked: isLiked }"
          @click="toggleLike"
        >
          <Heart :size="18" :fill="isLiked ? 'currentColor' : 'none'" />
        </button>
      </div>
    </template>

    <!-- 風格 3: Vinyl (黑膠唱片) - 點擊進入音樂 App -->
    <template v-else-if="currentLayout === 'vinyl'">
      <div class="vinyl-layout" :class="vinylStyle" @click="openMusicApp">
        <div class="vinyl-record" :class="{ spinning: isPlaying }">
          <div class="vinyl-grooves"></div>
          <div class="vinyl-label">
            <Music :size="24" color="white" />
          </div>
        </div>

        <!-- 唱臂 -->
        <div class="tonearm" :class="{ active: isPlaying }">
          <div class="arm-base"></div>
          <div class="arm-stick"></div>
          <div class="arm-head"></div>
        </div>

        <div class="vinyl-controls-overlay" @click.stop>
          <div class="vinyl-info">
            <span class="v-title" :style="textStyle">{{
              currentSong.title
            }}</span>
            <span class="v-artist">{{ currentSong.artist }}</span>
          </div>

          <div class="vinyl-buttons">
            <button class="control-btn" @click="prevSong">
              <SkipBack :size="20" />
            </button>
            <button class="play-btn" @click="togglePlay">
              <Pause v-if="isPlaying" :size="20" fill="currentColor" />
              <Play
                v-else
                :size="20"
                fill="currentColor"
                style="margin-left: 3px"
              />
            </button>
            <button class="control-btn" @click="nextSong">
              <SkipForward :size="20" />
            </button>
          </div>
        </div>

        <!-- 點擊提示 -->
        <div class="tap-hint">點擊進入音樂 App</div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.music-player-container {
  width: 100%;
  height: 100%;
  position: relative;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  color: #333;
  overflow: hidden;
  transition: all 0.3s ease;
  container-type: size;

  &.compact {
    padding: min(12px, 8%);
    display: flex;
    align-items: center;
    gap: min(12px, 5%);
  }

  &.classic {
    padding: min(16px, 6%);
    background-color: rgba(255, 255, 255, 0.95);
    background-image: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.95),
      rgba(240, 240, 250, 0.95)
    );
  }

  &.vinyl {
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.like-btn {
  color: #9ca3af;
  transition: all 0.2s;
  padding: 4px;
  &.liked {
    color: #ef4444;
  }
  &:hover {
    transform: scale(1.1);
  }
  &:active {
    transform: scale(0.95);
  }
}

.control-btn {
  color: inherit;
  opacity: 0.7;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    opacity: 1;
    transform: scale(1.1);
  }
  &:active {
    transform: scale(0.95);
  }
}

.play-btn {
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  background: #1f2937;
  &:hover {
    background: #000;
    transform: scale(1.05);
  }
}

// Compact 樣式
.album-art {
  flex-shrink: 0;
  height: 100%;
  aspect-ratio: 1 / 1;

  .album-cover {
    width: 100%;
    height: 100%;
    max-width: 80px;
    max-height: 80px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: min(12px, 15%);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    position: relative;

    svg {
      width: 35%;
      height: 35%;
      min-width: 16px;
      min-height: 16px;
    }

    &::after {
      content: "";
      position: absolute;
      width: 35%;
      height: 35%;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }
    &.spinning {
      border-radius: 50%;
      animation: spin 6s linear infinite;
    }
  }
}

.player-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  min-width: 0;

  .song-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;

    .song-title {
      font-size: clamp(12px, 4cqw, 16px);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .song-artist {
      font-size: clamp(9px, 3cqw, 12px);
      color: inherit;
      opacity: 0.6;
    }

    .like-btn svg {
      width: clamp(12px, 4cqw, 16px);
      height: clamp(12px, 4cqw, 16px);
    }
  }

  .controls-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(8px, 4cqw, 16px);

    .control-btn {
      width: clamp(20px, 8cqw, 32px);
      height: clamp(20px, 8cqw, 32px);

      svg {
        width: 60%;
        height: 60%;
      }
    }

    .play-btn {
      width: clamp(28px, 10cqw, 40px);
      height: clamp(28px, 10cqw, 40px);

      svg {
        width: 50%;
        height: 50%;
      }
    }
  }

  .progress-container {
    display: flex;
    align-items: center;
    gap: clamp(4px, 2cqw, 8px);

    .time-text {
      font-size: clamp(8px, 2.5cqw, 10px);
      opacity: 0.6;
      width: auto;
      flex-shrink: 0;
    }

    .progress-bar {
      flex: 1;
      height: clamp(2px, 1cqw, 4px);
      background: rgba(0, 0, 0, 0.1);
      border-radius: 2px;
      overflow: hidden;

      .progress-fill {
        height: 100%;
        background: currentColor;
        border-radius: 2px;
        transition: width 0.3s linear;
      }
    }
  }
}
</style>

<style lang="scss" scoped>
// Classic 樣式
.classic-layout {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  width: 100%;
  position: relative;
  container-type: size;

  .classic-cover-wrapper {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 0;
    padding: min(8px, 3%);
  }

  .classic-cover {
    height: 100%;
    aspect-ratio: 1 / 1;
    max-width: 90%;
    border-radius: min(16px, 10%);
    background: linear-gradient(135deg, #f6d365 0%, #fda085 100%);
    box-shadow: 0 10px 30px rgba(253, 160, 133, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    transition:
      transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
      box-shadow 0.3s ease;

    svg {
      width: 30%;
      height: 30%;
      min-width: 20px;
      min-height: 20px;
    }

    &.playing {
      transform: scale(1.05);
      box-shadow: 0 15px 40px rgba(253, 160, 133, 0.5);
    }
  }

  .classic-info {
    text-align: center;
    margin-bottom: min(12px, 4%);
    flex-shrink: 0;
    width: 100%;
    padding: 0 5%;

    .song-title {
      font-size: clamp(12px, 6cqh, 20px);
      font-weight: 800;
      margin-bottom: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .song-artist {
      font-size: clamp(10px, 4cqh, 14px);
      opacity: 0.6;
    }
  }

  .classic-progress {
    width: 100%;
    margin-bottom: min(10px, 4%);
    flex-shrink: 0;

    .progress-bar {
      height: clamp(3px, 1.5cqh, 5px);
      background: rgba(0, 0, 0, 0.05);
      border-radius: 3px;
      margin-bottom: min(4px, 2%);
      .progress-fill {
        height: 100%;
        background: #333;
        border-radius: 3px;
        transition: width 0.3s linear;
      }
    }

    .time-row {
      display: flex;
      justify-content: space-between;
      font-size: clamp(8px, 3cqh, 11px);
      opacity: 0.5;
    }
  }

  .classic-controls {
    display: flex;
    align-items: center;
    gap: clamp(12px, 8cqw, 40px);
    margin-bottom: min(4px, 2%);
    flex-shrink: 0;

    .control-btn {
      width: clamp(24px, 8cqh, 36px);
      height: clamp(24px, 8cqh, 36px);

      svg {
        width: 70%;
        height: 70%;
      }
    }

    .play-btn.big {
      width: clamp(40px, 14cqh, 64px);
      height: clamp(40px, 14cqh, 64px);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

      svg {
        width: 50%;
        height: 50%;
      }

      &:hover {
        transform: scale(1.05);
        box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
      }
    }
  }

  .classic-like {
    position: absolute;
    top: 0;
    right: 0;
    padding: min(8px, 3%);
    color: #9ca3af;

    svg {
      width: clamp(14px, 5cqh, 20px);
      height: clamp(14px, 5cqh, 20px);
    }

    &.liked {
      color: #ef4444;
    }
  }
}

// Vinyl 樣式
.vinyl-layout {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  container-type: size;
  cursor: pointer;

  &:hover {
    .tap-hint { opacity: 1; }
  }

  // === 普普風（預設） ===
  &.pop {
    background-color: #fce7f3;
    border: 3px solid #1a1a1a;
    border-radius: 16px;
    box-shadow: 4px 4px 0px #1a1a1a;
    &:hover { transform: translate(-1px, -1px); box-shadow: 5px 5px 0px #1a1a1a; }
    .vinyl-record { box-shadow: 4px 4px 0px rgba(0,0,0,0.5); border: 3px solid #1a1a1a;
      .vinyl-label { background: #fcd34d; border: 3px solid #1a1a1a; svg { color: #1a1a1a; } }
    }
    .tonearm { background: #fdfaf6; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a;
      .arm-base { background: #c4b5fd; border: 3px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; }
    }
    .vinyl-controls-overlay .vinyl-buttons {
      .play-btn { background: #38bdf8; color: #1a1a1a; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a;
        &:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0px #1a1a1a; background: #7dd3fc; }
        &:active { transform: scale(0.95); box-shadow: 0 0 0 #1a1a1a; }
      }
      .control-btn { color: white; background: #1a1a1a; border: 2px solid white; border-radius: 8px; box-shadow: 2px 2px 0px rgba(255,255,255,0.4);
        &:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0px rgba(255,255,255,0.6); }
        &:active { transform: scale(0.95); box-shadow: 0 0 0 transparent; }
      }
    }
    .tap-hint { background: #ffb4b4; color: #1a1a1a; border: 3px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; border-radius: 12px; font-weight: 800; }
  }

  // === 極簡風格 ===
  &.classic {
    background: linear-gradient(135deg, #2c3e50 0%, #000000 100%);
    border-radius: var(--radius-lg, 16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    .vinyl-record { background: #111; box-shadow: 0 0 20px rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1);
      .vinyl-grooves { border-color: rgba(255,255,255,0.08); &::after { border-color: rgba(255,255,255,0.06); } }
      .vinyl-label { background: #e74c3c; border: 2px solid rgba(255,255,255,0.2); svg { color: white; } }
    }
    .tonearm { background: #bbb; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      .arm-base { background: #888; border: 2px solid rgba(255,255,255,0.15); box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    }
    .vinyl-controls-overlay {
      background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
      .vinyl-info .v-title { text-shadow: 0 1px 4px rgba(0,0,0,0.6); }
      .vinyl-buttons {
        .play-btn { background: #e74c3c; color: white; border: none; box-shadow: 0 2px 8px rgba(231,76,60,0.4);
          &:hover { background: #c0392b; transform: scale(1.05); }
          &:active { transform: scale(0.95); }
        }
        .control-btn { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 50%; box-shadow: none;
          &:hover { background: rgba(255,255,255,0.2); transform: scale(1.05); }
          &:active { transform: scale(0.95); }
        }
      }
    }
    .tap-hint { background: rgba(0,0,0,0.7); color: white; border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 4px 12px rgba(0,0,0,0.3); border-radius: 8px; font-weight: 600; }
  }

  // === 平面風格 ===
  &.flat {
    background-color: #FFF0F5;
    border-radius: 32px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    .vinyl-record { box-shadow: 0 4px 0px #332650; border: 3px solid #332650;
      .vinyl-grooves { border-color: rgba(51,38,80,0.15); &::after { border-color: rgba(51,38,80,0.1); } }
      .vinyl-label { background: #FCD24B; border: 3px solid #332650; svg { color: #332650; } }
    }
    .tonearm { background: white; border: 3px solid #332650; box-shadow: 0 4px 0px #332650;
      .arm-base { background: #A7F3D0; border: 3px solid #332650; box-shadow: 0 2px 0px #332650; }
    }
    .vinyl-controls-overlay {
      .vinyl-info { .v-title { text-shadow: 1px 1px 0px #332650; font-weight: 800; } .v-artist { font-weight: 800; } }
      .vinyl-buttons {
        .play-btn { background: #FCD24B; color: #332650; border: 3px solid #332650; box-shadow: 0 4px 0px #332650; border-radius: 50%;
          &:hover { transform: scale(1.05); }
          &:active { transform: translateY(2px); box-shadow: 0 2px 0px #332650; }
        }
        .control-btn { background: white; color: #332650; border: 3px solid #332650; border-radius: 50%; box-shadow: 0 4px 0px #332650;
          &:hover { transform: scale(1.05); }
          &:active { transform: translateY(2px); box-shadow: 0 2px 0px #332650; }
        }
      }
    }
    .tap-hint { background: #FCD24B; color: #332650; border: 3px solid #332650; box-shadow: 0 4px 0px #332650; border-radius: 9999px; font-weight: 800; }
  }

  // === 復古/插圖風格 ===
  &.illustration {
    background-color: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding-top: 22px;
    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a; z-index: 15;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1); z-index: 16;
    }
    .vinyl-record { box-shadow: 2px 2px 0px #1a1a1a; border: 2px solid #1a1a1a;
      .vinyl-grooves { border: 2px dashed rgba(255,255,255,0.15); &::after { border: 1px dashed rgba(255,255,255,0.1); } }
      .vinyl-label { background: #FBC9CB; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; svg { color: #1a1a1a; } }
    }
    .tonearm { background: white; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a;
      .arm-base { background: #B0D0DB; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; }
    }
    .vinyl-controls-overlay {
      .vinyl-info { .v-title { text-shadow: 2px 2px 0px #1a1a1a; font-weight: 900; } .v-artist { font-weight: bold; } }
      .vinyl-buttons {
        .play-btn { background: #B0D0DB; color: #1a1a1a; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; border-radius: 4px;
          &:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #1a1a1a; }
        }
        .control-btn { background: white; color: #1a1a1a; border: 2px solid #1a1a1a; border-radius: 4px; box-shadow: 2px 2px 0px #1a1a1a;
          &:active { transform: translate(2px, 2px); box-shadow: 0 0 0 #1a1a1a; }
        }
      }
    }
    .tap-hint { background: white; color: #1a1a1a; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; border-radius: 4px; font-weight: bold; }
  }

  // === 像素風格 ===
  &.pixel {
    background-color: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    padding-top: 26px;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    &::before {
      content: 'VINYL.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5; z-index: 15;
    }
    .vinyl-record { box-shadow: 2px 2px 0px #F5C6DA; border: 2px solid #EAA3C5;
      .vinyl-grooves { border: 2px dashed rgba(255,255,255,0.15); &::after { border: 1px dashed rgba(255,255,255,0.1); } }
      .vinyl-label { background: #93E2B6; border: 2px solid #EAA3C5; svg { color: white; } }
    }
    .tonearm { background: white; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA;
      .arm-base { background: #FCD24B; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; }
    }
    .vinyl-controls-overlay {
      .vinyl-info { .v-title { text-shadow: 1px 1px 0px rgba(0,0,0,0.5); font-weight: bold; letter-spacing: 1px; } .v-artist { font-weight: bold; } }
      .vinyl-buttons {
        .play-btn { background: #93E2B6; color: white; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; border-radius: 4px;
          &:active { box-shadow: none; transform: translate(2px, 2px); }
        }
        .control-btn { background: white; color: #F4A2C5; border: 2px solid #EAA3C5; border-radius: 4px; box-shadow: 2px 2px 0px #F5C6DA;
          &:active { box-shadow: none; transform: translate(2px, 2px); }
        }
      }
    }
    .tap-hint { background: white; color: #d06d9a; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; border-radius: 4px; font-weight: bold; text-transform: uppercase; }
  }

  .vinyl-record {
    width: min(70%, 70cqh);
    aspect-ratio: 1 / 1;
    max-width: 180px;
    max-height: 180px;
    border-radius: 50%;
    background: #1a1a1a;
    position: absolute;
    top: -10%;
    right: -10%;
    box-shadow: 4px 4px 0px rgba(0,0,0,0.5);
    border: 3px solid #1a1a1a;
    display: flex;
    align-items: center;
    justify-content: center;

    .vinyl-grooves {
      position: absolute;
      inset: 4%;
      border-radius: 50%;
      border: 3px dashed rgba(255, 255, 255, 0.2);
      &::after {
        content: "";
        position: absolute;
        inset: 15%;
        border-radius: 50%;
        border: 2px dashed rgba(255, 255, 255, 0.15);
      }
    }

    .vinyl-label {
      width: 35%;
      height: 35%;
      background: #fcd34d;
      border: 3px solid #1a1a1a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2;

      svg {
        width: 50%;
        height: 50%;
        color: #1a1a1a;
      }
    }

    &.spinning {
      animation: spin 4s linear infinite;
    }
  }

  .tonearm {
    position: absolute;
    top: 5%;
    right: 5%;
    width: clamp(6px, 1.5cqw, 8px);
    height: min(40%, 40cqh);
    max-height: 100px;
    background: #fdfaf6;
    border: 2px solid #1a1a1a;
    transform-origin: top center;
    transform: rotate(-35deg);
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    z-index: 5;
    box-shadow: 2px 2px 0px #1a1a1a;

    &.active {
      transform: rotate(-15deg);
    }

    .arm-base {
      position: absolute;
      top: -30%;
      left: -150%;
      width: clamp(16px, 5cqw, 24px);
      height: clamp(16px, 5cqw, 24px);
      background: #c4b5fd;
      border: 3px solid #1a1a1a;
      box-shadow: 2px 2px 0px #1a1a1a;
      border-radius: 50%;
    }
  }

  .vinyl-controls-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: min(16px, 6%);
    background: linear-gradient(to top, rgba(26, 26, 26, 0.9), transparent);
    z-index: 10;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;

    .vinyl-info {
      margin-bottom: min(12px, 5%);
      color: white;

      .v-title {
        display: block;
        font-size: clamp(14px, 6cqw, 20px);
        font-weight: 900;
        margin-bottom: 2px;
        text-shadow: 2px 2px 0px #1a1a1a;
      }
      .v-artist {
        font-size: clamp(11px, 4cqw, 15px);
        font-weight: 700;
        opacity: 0.9;
      }
    }

    .vinyl-buttons {
      display: flex;
      align-items: center;
      gap: clamp(12px, 5cqw, 24px);

      .play-btn {
        background: #38bdf8;
        color: #1a1a1a;
        width: clamp(34px, 12cqw, 52px);
        height: clamp(34px, 12cqw, 52px);
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        
        &:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px #1a1a1a;
          background: #7dd3fc;
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px #1a1a1a;
        }
        
        svg {
          width: 50%;
          height: 50%;
        }
      }

      .control-btn {
        color: white;
        background: #1a1a1a;
        border: 2px solid white;
        border-radius: 8px;
        box-shadow: 2px 2px 0px rgba(255,255,255,0.4);
        width: clamp(26px, 8cqw, 36px);
        height: clamp(26px, 8cqw, 36px);
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        
        &:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px rgba(255,255,255,0.6);
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px rgba(255,255,255,0.0);
        }

        svg {
          width: 60%;
          height: 60%;
        }
      }
    }
  }

  .tap-hint {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: #ffb4b4;
    color: #1a1a1a;
    font-weight: 800;
    border: 3px solid #1a1a1a;
    padding: 8px 16px;
    border-radius: 12px;
    font-size: 13px;
    box-shadow: 2px 2px 0px #1a1a1a;
    opacity: 0;
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
    z-index: 20;
  }
}

// 播放錯誤 Toast（Widget 內）
.widget-error-toast {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(231, 76, 60, 0.92);
  color: white;
  border-radius: 8px;
  font-size: 11px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(231, 76, 60, 0.3);

  .error-text {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.widget-toast-enter-active,
.widget-toast-leave-active {
  transition: all 0.3s ease;
}

.widget-toast-enter-from,
.widget-toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
