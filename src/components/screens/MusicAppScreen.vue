<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore, useMusicStore } from "@/stores";
import type { Chat } from "@/types/chat";
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
    Share2,
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
  shareToChat: [payload: { chatId: string; characterId: string }];
}>();

const musicStore = useMusicStore();
const charactersStore = useCharactersStore();

// 本地狀態
const searchInput = ref("");
const showPlaylist = ref(false);
const showSharePicker = ref(false);
const shareChatList = ref<Chat[]>([]);
const isLoadingChats = ref(false);

// 取得角色顯示資訊
function getChatCharacterName(chat: Chat): string {
  if (chat.isGroupChat && chat.groupMetadata) {
    return chat.groupMetadata.groupName;
  }
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.nickname || char?.data?.name || (chat as any).characterName || "未知角色";
}

function getChatCharacterAvatar(chat: Chat): string {
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.avatar || "";
}

function getChatPreview(chat: Chat): string {
  if (chat.lastMessagePreview) return chat.lastMessagePreview;
  if (chat.messages?.length) {
    const last = chat.messages[chat.messages.length - 1];
    return last?.content?.slice(0, 40) || "";
  }
  return "";
}

function formatChatTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "剛剛";
  if (diff < hour) return `${Math.floor(diff / minute)} 分鐘前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小時前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  const d = new Date(timestamp);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

async function openSharePicker() {
  if (!currentTrack.value) return;
  showSharePicker.value = true;
  isLoadingChats.value = true;
  try {
    await db.init();
    const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
    shareChatList.value = allChats
      .filter((c) => c.messages?.length > 0 || c.lastMessagePreview)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.error("[MusicApp] 載入聊天列表失敗:", e);
    shareChatList.value = [];
  } finally {
    isLoadingChats.value = false;
  }
}

function selectShareTarget(chatId: string, characterId: string) {
  showSharePicker.value = false;
  emit("shareToChat", { chatId, characterId });
}

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
          <div class="progress-bar" @click="handleProgressClick">
            <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
          </div>
          <div class="time-row">
            <span class="time">{{ formatTime(currentTime) }}</span>
            <span class="time">{{ formatTime(duration) }}</span>
          </div>
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

        <!-- 分享按鈕 -->
        <button
          class="share-btn"
          @click="openSharePicker"
          title="分享給角色"
        >
          <Share2 :size="20" stroke-width="2.5" />
          <span>分享給角色</span>
        </button>

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

    <!-- 聊天列表選擇器 -->
    <Transition name="fade">
      <div v-if="showSharePicker" class="share-picker-overlay" @click.self="showSharePicker = false">
        <div class="share-picker-modal">
          <div class="picker-header">
            <h3>分享到哪個聊天？</h3>
            <button class="close-btn" @click="showSharePicker = false">
              <X :size="22" stroke-width="2.5" />
            </button>
          </div>
          <div class="picker-track-info" v-if="currentTrack">
            <span class="picker-track-name">{{ currentTrack.name }}</span>
            <span class="picker-track-artist">{{ currentTrack.artist }}</span>
          </div>
          <div v-if="isLoadingChats" class="picker-empty">
            <p>載入中...</p>
          </div>
          <div v-else-if="shareChatList.length === 0" class="picker-empty">
            <p>沒有可用的聊天</p>
          </div>
          <div v-else class="picker-list">
            <button
              v-for="chat in shareChatList"
              :key="chat.id"
              class="picker-item"
              @click="selectShareTarget(chat.id, chat.characterId)"
            >
              <img
                v-if="getChatCharacterAvatar(chat)"
                :src="getChatCharacterAvatar(chat)"
                class="picker-avatar"
                alt=""
                @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
              />
              <div v-else class="picker-avatar placeholder">
                {{ getChatCharacterName(chat).charAt(0) }}
              </div>
              <div class="picker-chat-info">
                <span class="picker-name">{{ getChatCharacterName(chat) }}</span>
                <span class="picker-chat-preview">{{ getChatPreview(chat) }}</span>
              </div>
              <span class="picker-time">{{ formatChatTime(chat.updatedAt) }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
$bg: #191919;
$surface: #232323;
$surface-2: #2c2c2c;
$text: #f0f0f0;
$text-muted: rgba(240, 240, 240, 0.4);
$border: rgba(255, 255, 255, 0.1);
$active: rgba(255, 255, 255, 0.06);

// ── Base ─────────────────────────────────────────────────
.music-app-screen {
  width: 100%;
  height: 100%;
  background: $bg;
  color: $text;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
}

// ── Header ───────────────────────────────────────────────
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  padding-top: max(20px, var(--safe-top, 0px));

  .back-btn,
  .playlist-btn {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: $text;
    border: 1px solid $border;
    transition: background 0.15s;
    position: relative;
    cursor: pointer;

    &:active {
      background: $active;
    }

    .badge {
      position: absolute;
      top: -3px;
      right: -3px;
      background: $text;
      color: $bg;
      font-size: 10px;
      font-weight: 700;
      min-width: 17px;
      height: 17px;
      padding: 0 3px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .title {
    font-size: 13px;
    font-weight: 500;
    color: $text-muted;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
}

// ── Search ───────────────────────────────────────────────
.search-section {
  display: flex;
  gap: 10px;
  padding: 4px 20px 16px;

  .search-bar {
    flex: 1;
    display: flex;
    align-items: center;
    background: $surface;
    border-radius: 10px;
    border: 1px solid $border;
    padding: 0 14px;

    .search-icon {
      color: $text-muted;
      flex-shrink: 0;
    }

    input {
      flex: 1;
      background: none;
      border: none;
      color: $text;
      padding: 11px 10px;
      font-size: 14px;
      font-family: inherit;

      &::placeholder {
        color: $text-muted;
      }

      &:focus {
        outline: none;
      }
    }

    .clear-btn {
      color: $text-muted;
      padding: 4px;
      background: transparent;
      border: none;
      cursor: pointer;
      transition: color 0.15s;

      &:hover {
        color: $text;
      }
    }
  }

  .search-btn {
    padding: 0 18px;
    background: $text;
    border: none;
    border-radius: 10px;
    color: $bg;
    font-weight: 600;
    font-size: 14px;
    font-family: inherit;
    white-space: nowrap;
    cursor: pointer;
    transition: opacity 0.15s;

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    &:active:not(:disabled) {
      opacity: 0.75;
    }
  }
}

// ── Main Content ─────────────────────────────────────────
.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 24px;

  &::-webkit-scrollbar { width: 2px; }
  &::-webkit-scrollbar-track { background: transparent; }
  &::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.12); border-radius: 1px; }
}

// ── Now Playing ──────────────────────────────────────────
.now-playing {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 8px 16px;
  margin-bottom: 16px;

  .album-cover {
    width: 120px;
    height: 120px;
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.18);
    margin-bottom: 14px;
    background: $surface;

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .cover-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $text-muted;
    }

    &.spinning {
      animation: breathe 3s ease-in-out infinite;
    }
  }

  .track-info {
    text-align: center;
    margin-bottom: 12px;
    width: 100%;
    padding: 0 8px;

    .track-name {
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 4px;
      color: $text;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .track-artist {
      font-size: 12px;
      font-weight: 400;
      color: $text-muted;
    }
  }

  .progress-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;

    .progress-bar {
      width: 100%;
      height: 2px;
      background: rgba(255, 255, 255, 0.12);
      border-radius: 1px;
      cursor: pointer;
      position: relative;

      .progress-fill {
        height: 100%;
        background: $text;
        border-radius: 1px;
        position: relative;
        transition: width 0.1s linear;

        &::after {
          content: "";
          position: absolute;
          right: -5px;
          top: 50%;
          transform: translateY(-50%);
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: $text;
        }
      }
    }

    .time-row {
      display: flex;
      justify-content: space-between;
    }

    .time {
      font-size: 11px;
      font-weight: 400;
      color: $text-muted;
      letter-spacing: 0.03em;
    }
  }

  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    width: 100%;

    .control-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: transparent;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      color: $text-muted;
      transition: color 0.15s, transform 0.1s;
      cursor: pointer;

      &:active {
        transform: scale(0.88);
        color: $text;
      }

      &.mode,
      &.volume {
        &:hover {
          color: $text;
        }
      }
    }

    .play-btn {
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: transparent;
      border: 1.5px solid rgba(255, 255, 255, 0.65);
      display: flex;
      align-items: center;
      justify-content: center;
      color: $text;
      cursor: pointer;
      transition: border-color 0.15s, transform 0.1s, background 0.15s;

      &:active {
        transform: scale(0.92);
        background: $active;
      }
    }
  }

  .share-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 20px;
    padding: 8px 18px;
    background: transparent;
    color: $text-muted;
    border: 1px solid $border;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 400;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &:hover {
      color: $text;
      border-color: rgba(255, 255, 255, 0.25);
    }
  }

  .volume-slider {
    width: 72%;
    margin-top: 20px;
    display: flex;
    align-items: center;

    input[type="range"] {
      width: 100%;
      height: 2px;
      appearance: none;
      -webkit-appearance: none;
      background: rgba(255, 255, 255, 0.12);
      border: none;
      border-radius: 1px;
      cursor: pointer;

      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: $text;
        border: none;
        cursor: pointer;
      }
    }
  }
}

@keyframes breathe {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
  50% { box-shadow: 0 0 24px 4px rgba(255, 255, 255, 0.05); }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// ── Search Results ───────────────────────────────────────
.search-results {
  .results-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding: 0 2px;

    h3 {
      font-size: 11px;
      font-weight: 500;
      color: $text-muted;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .play-all-btn {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 7px 14px;
      background: $surface;
      border: 1px solid $border;
      border-radius: 20px;
      color: $text;
      font-size: 13px;
      font-weight: 400;
      font-family: inherit;
      cursor: pointer;
      transition: background 0.15s;

      &:active {
        background: $surface-2;
      }
    }
  }

  .track-list {
    display: flex;
    flex-direction: column;
  }

  .track-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 11px 8px;
    border-bottom: 1px solid $border;
    cursor: pointer;
    transition: background 0.15s;
    border-radius: 6px;

    &:last-child {
      border-bottom: none;
    }

    &:active {
      background: $active;
    }

    &.active {
      .track-index { color: $text; }
      .track-details .name { color: $text; }
    }

    .track-index {
      width: 20px;
      text-align: center;
      font-size: 12px;
      color: $text-muted;
    }

    .track-cover {
      width: 42px;
      height: 42px;
      border-radius: 5px;
      object-fit: cover;
      border: 1px solid $border;
      flex-shrink: 0;

      &.placeholder {
        background: $surface;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $text-muted;
      }
    }

    .track-details {
      flex: 1;
      min-width: 0;

      .name {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 14px;
        font-weight: 400;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: $text;

        .online-badge {
          flex-shrink: 0;
          font-size: 10px;
          padding: 1px 7px;
          background: rgba(255, 255, 255, 0.07);
          color: $text-muted;
          border: 1px solid $border;
          border-radius: 10px;
        }
      }

      .artist {
        display: block;
        font-size: 12px;
        color: $text-muted;
        margin-top: 3px;
      }
    }

    .add-btn {
      color: $text-muted;
      padding: 8px;
      background: transparent;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      transition: color 0.15s;
      flex-shrink: 0;

      &:hover { color: $text; }
      &.in-playlist { color: $text; }
    }
  }
}

// ── States ───────────────────────────────────────────────
.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: $text-muted;
  margin-top: 20px;

  p {
    margin-top: 14px;
    font-size: 13px;
    font-weight: 400;
  }
}

.loading-state {
  .spinner {
    width: 32px;
    height: 32px;
    border: 1.5px solid rgba(255, 255, 255, 0.08);
    border-top-color: $text-muted;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

// ── Playlist Panel ───────────────────────────────────────
.playlist-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 290px;
  max-width: 85%;
  height: 100%;
  background: $surface;
  border-left: 1px solid $border;
  display: flex;
  flex-direction: column;
  z-index: 100;

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid $border;

    h3 {
      font-size: 11px;
      font-weight: 500;
      color: $text-muted;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }

    .close-btn {
      color: $text-muted;
      background: transparent;
      border-radius: 50%;
      border: none;
      padding: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: color 0.15s;

      &:hover { color: $text; }
    }
  }

  .empty-playlist {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $text-muted;

    p {
      margin-top: 12px;
      font-size: 13px;
    }
  }

  .playlist-tracks {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;

    &::-webkit-scrollbar { width: 2px; }
    &::-webkit-scrollbar-track { background: transparent; }
    &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); }
  }

  .playlist-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    cursor: pointer;
    transition: background 0.15s;

    &:hover { background: $active; }

    &.active {
      .item-info .name {
        color: $text;
        font-weight: 500;
      }
    }

    .item-cover {
      width: 38px;
      height: 38px;
      border-radius: 4px;
      object-fit: cover;
      border: 1px solid $border;
      flex-shrink: 0;

      &.placeholder {
        background: $surface-2;
        display: flex;
        align-items: center;
        justify-content: center;
        color: $text-muted;
      }
    }

    .item-info {
      flex: 1;
      min-width: 0;

      .name {
        display: block;
        font-size: 13px;
        font-weight: 400;
        color: $text;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .artist {
        display: block;
        font-size: 11px;
        color: $text-muted;
        margin-top: 2px;
      }
    }

    .remove-btn {
      color: $text-muted;
      padding: 6px;
      background: transparent;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.15s;

      &:hover { color: $text; }
    }
  }

  .clear-all-btn {
    margin: 14px 16px;
    padding: 11px;
    background: transparent;
    border: 1px solid $border;
    border-radius: 8px;
    font-size: 12px;
    color: $text-muted;
    font-family: inherit;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &:hover {
      color: $text;
      border-color: rgba(255, 255, 255, 0.25);
    }
  }
}

// ── Transitions ──────────────────────────────────────────
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.slide-enter-from,
.slide-leave-to {
  transform: translateX(100%);
}

// ── Toast ────────────────────────────────────────────────
.play-error-toast {
  position: absolute;
  top: 80px;
  left: 20px;
  right: 20px;
  z-index: 200;
  cursor: pointer;

  .toast-content {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: $surface-2;
    border: 1px solid $border;
    border-radius: 12px;
  }

  .toast-icon {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(239, 68, 68, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #ef4444;
  }

  .toast-text {
    flex: 1;
    min-width: 0;

    .toast-title {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: $text;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .toast-msg {
      display: block;
      font-size: 12px;
      color: rgba(239, 68, 68, 0.8);
      margin-top: 2px;
    }
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}

// ── Share Picker ─────────────────────────────────────────
.share-picker-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 24px;
}

.share-picker-modal {
  width: 100%;
  max-width: 340px;
  max-height: 70vh;
  background: $surface;
  border: 1px solid $border;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
    border-bottom: 1px solid $border;

    h3 {
      font-size: 14px;
      font-weight: 500;
      color: $text;
    }

    .close-btn {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: transparent;
      color: $text-muted;
      border: none;
      cursor: pointer;
      transition: color 0.15s;

      &:hover { color: $text; }
    }
  }

  .picker-track-info {
    padding: 10px 18px;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid $border;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .picker-track-name {
      font-size: 13px;
      font-weight: 500;
      color: $text;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .picker-track-artist {
      font-size: 11px;
      color: $text-muted;
    }
  }

  .picker-empty {
    padding: 40px 20px;
    text-align: center;
    color: $text-muted;
    font-size: 13px;
  }

  .picker-list {
    overflow-y: auto;
    padding: 4px 0;

    .picker-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 10px 18px;
      background: transparent;
      border: none;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;

      &:hover { background: $active; }
      &:active { background: rgba(255, 255, 255, 0.07); }

      .picker-avatar {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        object-fit: cover;
        border: 1px solid $border;
        flex-shrink: 0;

        &.placeholder {
          display: flex;
          align-items: center;
          justify-content: center;
          background: $surface-2;
          color: $text-muted;
          font-size: 15px;
          font-weight: 500;
        }
      }

      .picker-chat-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        text-align: left;

        .picker-name {
          font-size: 13px;
          font-weight: 500;
          color: $text;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .picker-chat-preview {
          font-size: 11px;
          color: $text-muted;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 2px;
        }
      }

      .picker-time {
        flex-shrink: 0;
        font-size: 10px;
        color: $text-muted;
        align-self: flex-start;
        margin-top: 2px;
      }
    }
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
