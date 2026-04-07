<script setup lang="ts">
import { Music, Play, Pause } from "lucide-vue-next";
import { useMusicStore } from "@/stores";
import { computed, ref } from "vue";

interface Props {
  name: string;
  artist: string;
  album?: string;
  cover?: string;
  lyrics?: string;
  /** 是否為接收方（AI 角色側） */
  isReceiver?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  album: "",
  cover: "",
  lyrics: "",
  isReceiver: false,
});

const musicStore = useMusicStore();

// 判斷當前是否正在播放這首歌
const isCurrentlyPlaying = computed(() => {
  if (!musicStore.currentTrack) return false;
  return (
    musicStore.currentTrack.name === props.name &&
    musicStore.currentTrack.artist === props.artist &&
    musicStore.isPlaying
  );
});

// 展開歌詞
const showLyrics = ref(false);

// 截取歌詞預覽（前 4 行）
const lyricsPreview = computed(() => {
  if (!props.lyrics) return "";
  const lines = props.lyrics
    .split("\n")
    .map((l) => l.replace(/\[\d+:\d+[\.:]\d+\]/g, "").trim())
    .filter((l) => l.length > 0);
  return lines.slice(0, 4).join("\n");
});

const hasLyrics = computed(() => !!props.lyrics && props.lyrics.trim().length > 0);

function toggleLyrics() {
  if (hasLyrics.value) {
    showLyrics.value = !showLyrics.value;
  }
}
</script>

<template>
  <div class="music-share-card" :class="{ receiver: isReceiver }">
    <!-- 封面 + 信息 -->
    <div class="music-share-header">
      <div class="music-cover">
        <img v-if="cover" :src="cover" alt="cover" class="cover-img" />
        <div v-else class="cover-placeholder">
          <Music :size="24" />
        </div>
        <div class="play-overlay">
          <component :is="isCurrentlyPlaying ? Pause : Play" :size="16" />
        </div>
      </div>
      <div class="music-info">
        <div class="music-name">{{ name }}</div>
        <div class="music-artist">{{ artist }}</div>
        <div v-if="album" class="music-album">{{ album }}</div>
      </div>
    </div>

    <!-- 歌詞預覽 -->
    <div v-if="hasLyrics" class="music-lyrics-section" @click="toggleLyrics">
      <div class="lyrics-label">
        <span>歌詞</span>
        <span class="lyrics-toggle">{{ showLyrics ? "收起" : "展開" }}</span>
      </div>
      <div class="lyrics-content" :class="{ expanded: showLyrics }">
        <pre class="lyrics-text">{{ showLyrics ? lyrics : lyricsPreview }}</pre>
      </div>
    </div>

    <!-- 底部標籤 -->
    <div class="music-share-footer">
      <Music :size="12" />
      <span>音樂分享</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.music-share-card {
  width: 220px;
  background: #f8f8f8;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.06);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  &.receiver {
    background: #f0f7ff;
    border-color: rgba(0, 100, 255, 0.08);
  }
}

.music-share-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
}

.music-cover {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  background: #e0e0e0;

  .cover-img {
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
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #fff;
  }

  .play-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    opacity: 0;
    transition: opacity 0.2s;
  }

  &:hover .play-overlay {
    opacity: 1;
  }
}

.music-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.music-name {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-artist {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-album {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.music-lyrics-section {
  padding: 0 12px 8px;
  cursor: pointer;

  .lyrics-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #999;
    margin-bottom: 4px;

    .lyrics-toggle {
      color: #667eea;
      font-size: 11px;
    }
  }

  .lyrics-content {
    max-height: 72px;
    overflow: hidden;
    transition: max-height 0.3s ease;

    &.expanded {
      max-height: 300px;
      overflow-y: auto;
    }
  }

  .lyrics-text {
    font-size: 11px;
    color: #555;
    line-height: 1.6;
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: inherit;
  }
}

.music-share-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.03);
  border-top: 1px solid rgba(0, 0, 0, 0.04);
  font-size: 11px;
  color: #999;
}
</style>
