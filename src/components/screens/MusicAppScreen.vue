<script setup lang="ts">
import { useMusicStore } from "@/stores";
import {
    ArrowLeft,
    Heart,
    List,
    ListMusic,
    Pause,
    Play,
    Repeat,
    Repeat1,
    Search,
    Shuffle,
    SkipBack,
    SkipForward,
    Volume2,
    VolumeX,
    X,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{
  back: [];
}>();

const musicStore = useMusicStore();

// 本地狀態
const searchInput = ref("");
const showPlaylist = ref(false);

// 計算屬性
const currentTrack = computed(() => musicStore.currentTrack);
const isPlaying = computed(() => musicStore.isPlaying);
const progress = computed(() => musicStore.progress);
const currentTime = computed(() => musicStore.currentTime);
const duration = computed(() => musicStore.duration);
const volume = computed(() => musicStore.volume);
const playMode = computed(() => musicStore.playMode);
const playlist = computed(() => musicStore.playlist);
const searchResults = computed(() => musicStore.searchResults);
const isSearching = computed(() => musicStore.isSearching);

// 播放模式圖標
const playModeIcon = computed(() => {
  switch (playMode.value) {
    case "single":
      return Repeat1;
    case "random":
      return Shuffle;
    default:
      return Repeat;
  }
});

const playModeLabel = computed(() => {
  switch (playMode.value) {
    case "sequence":
      return "順序播放";
    case "loop":
      return "列表循環";
    case "single":
      return "單曲循環";
    case "random":
      return "隨機播放";
  }
});

// 格式化時間
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// 搜索
async function handleSearch() {
  if (searchInput.value.trim()) {
    await musicStore.search(searchInput.value.trim());
  }
}

// 檢查曲目是否在播放列表中
function isInPlaylist(trackId: string): boolean {
  return playlist.value.some((t) => t.id === trackId);
}

// 切換播放列表收藏
function togglePlaylist(track: any) {
  const idx = playlist.value.findIndex((t) => t.id === track.id);
  if (idx >= 0) {
    musicStore.removeFromPlaylist(idx);
  } else {
    musicStore.addToPlaylist(track);
  }
}

// 播放搜索結果中的曲目
function playTrack(track: any) {
  musicStore.play(track);
}

// 播放全部搜索結果
function playAllResults() {
  if (searchResults.value.length > 0) {
    musicStore.playAll(searchResults.value);
  }
}

// 進度條點擊
function handleProgressClick(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const percent = ((e.clientX - rect.left) / rect.width) * 100;
  musicStore.setProgress(percent);
}

// 音量控制
function handleVolumeChange(e: Event) {
  const target = e.target as HTMLInputElement;
  musicStore.setVolume(parseFloat(target.value));
}

// 切換靜音
function toggleMute() {
  if (volume.value > 0) {
    musicStore.setVolume(0);
  } else {
    musicStore.setVolume(0.8);
  }
}

// 初始化時載入熱門音樂
onMounted(async () => {
  if (searchResults.value.length === 0) {
    // 載入所有本地音樂作為初始列表
    await musicStore.search(""); // 空搜索會返回所有音樂
  }
});
</script>

<template>
  <div class="music-app-screen">
    <!-- 頂部導航 -->
    <header class="app-header">
      <button class="back-btn" @click="emit('back')">
        <ArrowLeft :size="28" stroke-width="3" />
      </button>
      <h1 class="title">音樂</h1>
      <button class="playlist-btn" @click="showPlaylist = !showPlaylist">
        <ListMusic :size="24" stroke-width="2.5" />
        <span v-if="playlist.length > 0" class="badge">{{
          playlist.length
        }}</span>
      </button>
    </header>

    <!-- 播放錯誤通知 -->
    <Transition name="toast">
      <div
        v-if="musicStore.playError"
        class="play-error-toast"
        @click="musicStore.dismissPlayError()"
      >
        <div class="toast-content">
          <span class="toast-icon">
            <X :size="16" stroke-width="3" />
          </span>
          <div class="toast-text">
            <span class="toast-title">{{
              musicStore.playError.trackName
            }}</span>
            <span class="toast-msg">{{ musicStore.playError.message }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 搜索欄 -->
    <div class="search-section">
      <div class="search-bar">
        <Search :size="20" stroke-width="2.5" class="search-icon" />
        <input
          v-model="searchInput"
          type="text"
          placeholder="搜索歌曲、歌手..."
          @keyup.enter="handleSearch"
        />
        <button v-if="searchInput" class="clear-btn" @click="searchInput = ''">
          <X :size="20" stroke-width="2.5" />
        </button>
      </div>
      <button class="search-btn" @click="handleSearch" :disabled="isSearching">
        {{ isSearching ? "搜索中..." : "搜索" }}
      </button>
    </div>

    <!-- 主內容區 -->
    <div class="main-content">
      <!-- 當前播放 -->
      <div v-if="currentTrack" class="now-playing">
        <div class="album-cover" :class="{ spinning: isPlaying }">
          <img v-if="currentTrack.cover" :src="currentTrack.cover" alt="封面" />
          <div v-else class="cover-placeholder">
            <ListMusic :size="64" stroke-width="2" />
          </div>
        </div>

        <div class="track-info">
          <h2 class="track-name">{{ currentTrack.name }}</h2>
          <p class="track-artist">{{ currentTrack.artist }}</p>
        </div>

        <!-- 進度條 -->
        <div class="progress-section">
          <span class="time">{{ formatTime(currentTime) }}</span>
          <div class="progress-bar" @click="handleProgressClick">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          <span class="time">{{ formatTime(duration) }}</span>
        </div>

        <!-- 控制按鈕 -->
        <div class="controls">
          <button
            class="control-btn mode"
            @click="musicStore.togglePlayMode"
            :title="playModeLabel"
          >
            <component :is="playModeIcon" :size="24" stroke-width="2.5" />
          </button>
          <button class="control-btn" @click="musicStore.prev">
            <SkipBack :size="28" stroke-width="2.5" />
          </button>
          <button class="play-btn" @click="musicStore.togglePlay">
            <Pause
              v-if="isPlaying"
              :size="32"
              stroke-width="2.5"
              fill="currentColor"
            />
            <Play
              v-else
              :size="32"
              stroke-width="2.5"
              fill="currentColor"
              style="margin-left: 4px"
            />
          </button>
          <button class="control-btn" @click="musicStore.next">
            <SkipForward :size="28" stroke-width="2.5" />
          </button>
          <button class="control-btn volume" @click="toggleMute">
            <VolumeX v-if="volume === 0" :size="24" stroke-width="2.5" />
            <Volume2 v-else :size="24" stroke-width="2.5" />
          </button>
        </div>

        <!-- 音量滑桿 -->
        <div class="volume-slider">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="volume"
            @input="handleVolumeChange"
          />
        </div>
      </div>

      <!-- 搜索結果 -->
      <div class="search-results" v-if="searchResults.length > 0">
        <div class="results-header">
          <h3>搜索結果</h3>
          <button class="play-all-btn" @click="playAllResults">
            <Play :size="18" stroke-width="2.5" />
            播放全部
          </button>
        </div>

        <div class="track-list">
          <div
            v-for="(track, index) in searchResults"
            :key="track.id"
            class="track-item"
            :class="{ active: currentTrack?.id === track.id }"
            @click="playTrack(track)"
          >
            <span class="track-index">{{ index + 1 }}</span>
            <img
              v-if="track.cover"
              :src="track.cover"
              class="track-cover"
              alt=""
              @error="
                (e: Event) =>
                  ((e.target as HTMLImageElement).style.display = 'none')
              "
            />
            <div v-if="!track.cover" class="track-cover placeholder">
              <ListMusic :size="20" stroke-width="2.5" />
            </div>
            <div class="track-details">
              <span class="name">
                {{ track.name }}
                <span v-if="track.source === 'online'" class="online-badge"
                  >線上</span
                >
              </span>
              <span class="artist">{{ track.artist }}</span>
            </div>
            <button
              class="add-btn"
              :class="{ 'in-playlist': isInPlaylist(track.id) }"
              @click.stop="togglePlaylist(track)"
            >
              <Heart
                :size="20"
                stroke-width="2.5"
                :fill="isInPlaylist(track.id) ? 'currentColor' : 'none'"
              />
            </button>
          </div>
        </div>
      </div>

      <!-- 空狀態 -->
      <div v-else-if="!isSearching && !currentTrack" class="empty-state">
        <ListMusic :size="64" stroke-width="2" />
        <p>搜索你喜歡的音樂</p>
      </div>

      <!-- 搜索中 -->
      <div v-if="isSearching" class="loading-state">
        <div class="spinner"></div>
        <p>搜索中...</p>
      </div>
    </div>

    <!-- 播放列表側邊欄 -->
    <Transition name="slide">
      <div v-if="showPlaylist" class="playlist-panel">
        <div class="panel-header">
          <h3>播放列表</h3>
          <button class="close-btn" @click="showPlaylist = false">
            <X :size="24" stroke-width="2.5" />
          </button>
        </div>

        <div v-if="playlist.length === 0" class="empty-playlist">
          <List :size="48" stroke-width="2" />
          <p>播放列表為空</p>
        </div>

        <div v-else class="playlist-tracks">
          <div
            v-for="(track, index) in playlist"
            :key="track.id"
            class="playlist-item"
            :class="{ active: musicStore.currentIndex === index }"
            @click="musicStore.play(undefined, index)"
          >
            <img
              v-if="track.cover"
              :src="track.cover"
              class="item-cover"
              alt=""
            />
            <div v-else class="item-cover placeholder">
              <ListMusic :size="16" stroke-width="2.5" />
            </div>
            <div class="item-info">
              <span class="name">{{ track.name }}</span>
              <span class="artist">{{ track.artist }}</span>
            </div>
            <button
              class="remove-btn"
              @click.stop="musicStore.removeFromPlaylist(index)"
            >
              <X :size="18" stroke-width="2.5" />
            </button>
          </div>
        </div>

        <button
          v-if="playlist.length > 0"
          class="clear-all-btn"
          @click="musicStore.clearPlaylist"
        >
          清空列表
        </button>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$card-bg: #ffffff;
$text-main: #1a1a1a;
$text-sec: #6b7280;

$blue-accent: #3b82f6;
$red-accent: #ef4444;
$yellow-accent: #facc15;
$purple-accent: #a855f7;
$pink-accent: #ec4899;

.music-app-screen {
  width: 100%;
  height: 100%;
  background-color: $bg-color;
  color: $text-main;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  font-family: "Nunito", sans-serif;
  border-top-left-radius: 40px;
  border-top-right-radius: 40px;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  background: $card-bg;
  border-bottom: 3px solid $frame-border;

  .back-btn,
  .playlist-btn {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $card-bg;
    color: $text-main;
    border: 3px solid $frame-border;
    box-shadow: 3px 3px 0 $frame-border;
    transition:
      transform 0.1s,
      box-shadow 0.1s;
    position: relative;

    &:active {
      transform: translate(3px, 3px);
      box-shadow: 0 0 0 $frame-border;
    }

    .badge {
      position: absolute;
      top: -6px;
      right: -6px;
      background: $red-accent;
      color: white;
      font-size: 11px;
      font-weight: 800;
      min-width: 20px;
      height: 20px;
      padding: 0 4px;
      border-radius: 10px;
      border: 2px solid $frame-border;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .title {
    font-size: 20px;
    font-weight: 900;
    color: $text-main;
  }
}

.search-section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 20px;
  background: $bg-color;

  .search-bar {
    flex: 1 1 200px;
    display: flex;
    align-items: center;
    background: $card-bg;
    border-radius: 16px;
    border: 3px solid $frame-border;
    box-shadow: 4px 4px 0 $frame-border;
    padding: 0 16px;

    .search-icon {
      color: $text-sec;
      flex-shrink: 0;
    }

    input {
      flex: 1;
      background: none;
      border: none;
      color: $text-main;
      padding: 14px 12px;
      font-size: 16px;
      font-weight: 700;
      font-family: inherit;

      &::placeholder {
        color: $text-sec;
        font-weight: 600;
      }

      &:focus {
        outline: none;
      }
    }

    .clear-btn {
      color: $text-main;
      padding: 4px;
      background: transparent;
      border: none;

      &:hover {
        color: $red-accent;
        transform: scale(1.1);
      }
    }
  }

  .search-btn {
    flex: 1 1 auto;
    padding: 12px 20px;
    background: $purple-accent;
    border: 3px solid $frame-border;
    box-shadow: 4px 4px 0 $frame-border;
    border-radius: 16px;
    color: white;
    font-weight: 900;
    font-size: 16px;
    transition:
      transform 0.1s,
      box-shadow 0.1s;

    &:active:not(:disabled) {
      transform: translate(4px, 4px);
      box-shadow: 0 0 0 $frame-border;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      box-shadow: none;
      transform: none;
    }
  }
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.now-playing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 20px;
  margin-bottom: 24px;
  background: $card-bg;
  border-radius: 32px;
  border: 3px solid $frame-border;
  box-shadow: 6px 6px 0 $frame-border;

  .album-cover {
    width: 220px;
    height: 220px;
    border-radius: 50%;
    overflow: hidden;
    border: 4px solid $frame-border;
    box-shadow: 8px 8px 0 rgba(0, 0, 0, 0.1);
    margin-bottom: 24px;
    background: $phone-bg;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-placeholder {
      width: 100%;
      height: 100%;
      background: $blue-accent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      border-radius: 50%;
    }

    &.spinning {
      animation: spin 10s linear infinite;
    }
  }

  .track-info {
    text-align: center;
    margin-bottom: 24px;
    width: 100%;

    .track-name {
      font-size: 24px;
      font-weight: 900;
      margin-bottom: 8px;
      color: $text-main;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-artist {
      font-size: 16px;
      font-weight: 700;
      color: $text-sec;
    }
  }

  .progress-section {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;

    .time {
      font-size: 14px;
      font-weight: 800;
      color: $text-main;
      min-width: 44px;
      text-align: center;
    }

    .progress-bar {
      flex: 1;
      height: 12px;
      background: #e5e7eb;
      border: 2px solid $frame-border;
      border-radius: 6px;
      cursor: pointer;
      position: relative;
      overflow: hidden;

      .progress-fill {
        height: 100%;
        background: $yellow-accent;
        border-right: 2px solid $frame-border;
        transition: width 0.1s linear;
      }
    }
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
    width: 100%;

    .control-btn {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: $bg-color;
      border: 3px solid $frame-border;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $text-main;
      box-shadow: 3px 3px 0 $frame-border;
      transition:
        transform 0.1s,
        box-shadow 0.1s;

      &:active {
        transform: translate(3px, 3px);
        box-shadow: 0 0 0 $frame-border;
      }

      &.mode {
        background: #fee2e2;
        color: $red-accent;
      }
      &.volume {
        background: #dbeafe;
        color: $blue-accent;
      }
    }

    .play-btn {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: $pink-accent;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      border: 3px solid $frame-border;
      box-shadow: 4px 4px 0 $frame-border;
      transition:
        transform 0.1s,
        box-shadow 0.1s;

      &:active {
        transform: translate(4px, 4px);
        box-shadow: 0 0 0 $frame-border;
      }
    }
  }

  .volume-slider {
    width: 80%;
    margin-top: 24px;
    display: flex;
    align-items: center;

    input[type="range"] {
      width: 100%;
      height: 12px;
      appearance: none;
      -webkit-appearance: none;
      background: #e5e7eb;
      border: 2px solid $frame-border;
      border-radius: 6px;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: $blue-accent;
        border: 3px solid $frame-border;
        cursor: pointer;
        box-shadow: 2px 2px 0 $frame-border;
      }
    }
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

.search-results {
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding: 0 8px;

    h3 {
      font-size: 20px;
      font-weight: 900;
      color: $text-main;
    }

    .play-all-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 10px 16px;
      background: $blue-accent;
      border: 3px solid $frame-border;
      border-radius: 12px;
      color: white;
      font-size: 15px;
      font-weight: 900;
      box-shadow: 3px 3px 0 $frame-border;
      transition:
        transform 0.1s,
        box-shadow 0.1s;

      &:active {
        transform: translate(3px, 3px);
        box-shadow: 0 0 0 $frame-border;
      }
    }
  }

  .track-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: $card-bg;
    border: 3px solid $frame-border;
    border-radius: 20px;
    cursor: pointer;
    box-shadow: 4px 4px 0 $frame-border;
    transition:
      transform 0.1s,
      box-shadow 0.1s;

    &:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 $frame-border;
    }

    &.active {
      background: #f0fdf4;
      border-color: #16a34a;
      box-shadow: 4px 4px 0 #16a34a;
    }

    .track-index {
      width: 24px;
      text-align: center;
      font-size: 16px;
      font-weight: 900;
      color: $text-sec;
    }

    .track-cover {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      object-fit: cover;
      border: 2px solid $frame-border;

      &.placeholder {
        background: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $text-sec;
      }
    }

    .track-details {
      flex: 1;
      min-width: 0;

      .name {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 16px;
        font-weight: 900;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: $text-main;

        .online-badge {
          flex-shrink: 0;
          font-size: 12px;
          padding: 2px 8px;
          background: #dbeafe;
          color: $blue-accent;
          border: 2px solid $blue-accent;
          border-radius: 8px;
          font-weight: 800;
        }
      }

      .artist {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: $text-sec;
        margin-top: 4px;
      }
    }

    .add-btn {
      color: $text-sec;
      padding: 10px;
      background: $bg-color;
      border-radius: 12px;
      border: 2px solid $frame-border;
      transition: all 0.1s;

      &:hover {
        background: #fee2e2;
        color: $red-accent;
      }

      &.in-playlist {
        color: $red-accent;
        background: #fee2e2;
      }
    }
  }
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: $text-sec;
  background: $card-bg;
  border: 3px dashed $text-sec;
  border-radius: 32px;
  margin-top: 20px;

  p {
    margin-top: 16px;
    font-size: 18px;
    font-weight: 900;
  }
}

.loading-state {
  .spinner {
    width: 48px;
    height: 48px;
    border: 4px solid #e2e8f0;
    border-top-color: $blue-accent;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

.playlist-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 320px;
  max-width: 85%;
  height: 100%;
  background: $phone-bg;
  border-left: 4px solid $frame-border;
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -8px 0 0 $frame-border;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    background: $card-bg;
    border-bottom: 4px solid $frame-border;

    h3 {
      font-size: 20px;
      font-weight: 900;
      color: $text-main;
    }

    .close-btn {
      color: $text-main;
      background: $bg-color;
      border-radius: 10px;
      border: 2px solid $frame-border;
      padding: 6px;
      box-shadow: 2px 2px 0 $frame-border;
      transition:
        transform 0.1s,
        box-shadow 0.1s;

      &:active {
        transform: translate(2px, 2px);
        box-shadow: 0 0 0 $frame-border;
      }
    }
  }

  .empty-playlist {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $text-sec;

    p {
      margin-top: 16px;
      font-size: 16px;
      font-weight: 800;
    }
  }

  .playlist-tracks {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .playlist-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 16px;
    background: $card-bg;
    border: 3px solid $frame-border;
    box-shadow: 4px 4px 0 $frame-border;
    cursor: pointer;
    transition:
      transform 0.1s,
      box-shadow 0.1s;

    &:active {
      transform: translate(2px, 2px);
      box-shadow: 0 0 0 $frame-border;
    }

    &.active {
      background: #f0fdf4;
      border-color: #16a34a;
      box-shadow: 4px 4px 0 #16a34a;
    }

    .item-cover {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      object-fit: cover;
      border: 2px solid $frame-border;

      &.placeholder {
        background: #f1f5f9;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $text-sec;
      }
    }

    .item-info {
      flex: 1;
      min-width: 0;

      .name {
        display: block;
        font-size: 15px;
        font-weight: 900;
        color: $text-main;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .artist {
        display: block;
        font-size: 13px;
        font-weight: 700;
        color: $text-sec;
        margin-top: 4px;
      }
    }

    .remove-btn {
      color: $red-accent;
      padding: 8px;
      background: #fef2f2;
      border: 2px solid $frame-border;
      border-radius: 8px;

      &:hover {
        background: #fecaca;
      }
    }
  }

  .clear-all-btn {
    margin: 20px;
    padding: 16px;
    background: #fef2f2;
    border: 3px solid $frame-border;
    border-radius: 16px;
    font-size: 16px;
    font-weight: 900;
    color: $red-accent;
    box-shadow: 4px 4px 0 $frame-border;
    transition:
      transform 0.1s,
      box-shadow 0.1s;

    &:active {
      transform: translate(3px, 3px);
      box-shadow: 0 0 0 $frame-border;
    }
  }
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

// 播放錯誤 Toast
.play-error-toast {
  position: absolute;
  top: 90px;
  left: 20px;
  right: 20px;
  z-index: 200;
  cursor: pointer;

  .toast-content {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 20px;
    background: #fef2f2;
    border: 3px solid $frame-border;
    border-radius: 20px;
    box-shadow: 6px 6px 0 $frame-border;
  }

  .toast-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 12px;
    background: $red-accent;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    border: 2px solid $frame-border;
  }

  .toast-text {
    flex: 1;
    min-width: 0;

    .toast-title {
      display: block;
      font-size: 16px;
      font-weight: 900;
      color: $text-main;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toast-msg {
      display: block;
      font-size: 14px;
      font-weight: 700;
      color: $red-accent;
      margin-top: 4px;
    }
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-20px);
}
</style>
