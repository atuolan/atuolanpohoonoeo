<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

interface PhoneCallMessage {
  role: "user" | "ai";
  content: string;
  tone?: string;
  audioUrl?: string;
  timestamp: number;
}

interface Props {
  characterName: string;
  characterAvatar?: string;
  startedAt: number;
  endedAt: number;
  messages: PhoneCallMessage[];
}

const props = defineProps<Props>();

const expanded = ref(false);

// 通話時長
const duration = computed(() => {
  const seconds = Math.max(0, Math.floor((props.endedAt - props.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
});

// 是否有任何語音可回放
const hasVoice = computed(() => props.messages.some((m) => !!m.audioUrl));

// 預覽（收合時顯示前 3 條）
const previewMessages = computed(() => props.messages.slice(0, 3));
const displayMessages = computed(() =>
  expanded.value ? props.messages : previewMessages.value
);

function formatContent(content: string): string {
  if (!expanded.value && content.length > 40) {
    return content.slice(0, 37) + "...";
  }
  return content;
}

// ===== 語音回放 =====
let audio: HTMLAudioElement | null = null;
const playingIndex = ref<number | null>(null);

function stopAudio() {
  if (audio) {
    audio.pause();
    audio.src = "";
    audio = null;
  }
  playingIndex.value = null;
}

function playMessage(idx: number, url?: string) {
  if (!url) return;
  // 點擊正在播放的語音 → 停止
  if (playingIndex.value === idx) {
    stopAudio();
    return;
  }
  stopAudio();
  const el = new Audio(url);
  audio = el;
  playingIndex.value = idx;
  el.onended = () => {
    if (playingIndex.value === idx) stopAudio();
  };
  el.onerror = () => {
    if (playingIndex.value === idx) stopAudio();
  };
  void el.play().catch(() => {
    if (playingIndex.value === idx) stopAudio();
  });
}

function toggleExpand() {
  expanded.value = !expanded.value;
  if (!expanded.value) stopAudio();
}

onUnmounted(() => {
  stopAudio();
});
</script>

<template>
  <div class="phone-call-history-card">
    <div class="card-header">
      <svg viewBox="0 0 24 24" fill="currentColor" class="card-icon">
        <path
          d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
        />
      </svg>
      <div class="header-info">
        <span class="card-title">與 {{ characterName }} 的通話</span>
        <span class="call-duration">時長 {{ duration }}</span>
      </div>
      <div class="header-avatar">
        <img v-if="characterAvatar" :src="characterAvatar" :alt="characterName" />
        <div v-else class="avatar-placeholder">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
        </div>
      </div>
    </div>

    <!-- 通話內容 -->
    <div class="card-body">
      <div
        v-for="(msg, idx) in displayMessages"
        :key="idx"
        class="call-line"
        :class="{ 'is-user': msg.role === 'user' }"
      >
        <span class="line-sender">{{ msg.role === "user" ? "你" : characterName }}:</span>
        <span class="line-content">{{ formatContent(msg.content) }}</span>
        <button
          v-if="msg.audioUrl"
          class="voice-btn"
          :class="{ playing: playingIndex === idx }"
          type="button"
          :title="playingIndex === idx ? '停止' : '播放語音'"
          @click.stop="playMessage(idx, msg.audioUrl)"
        >
          <svg v-if="playingIndex === idx" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h4v12H6zm8 0h4v12h-4z" />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
      <div v-if="displayMessages.length === 0" class="empty-body">通話已結束</div>
    </div>

    <div class="card-footer" @click="toggleExpand">
      <span class="view-hint">
        {{ expanded ? "收起" : `查看 ${messages.length} 條通話記錄` }}
        <template v-if="hasVoice"> · 點擊 ▶ 回放語音</template>
      </span>
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        class="arrow-icon"
        :class="{ expanded }"
      >
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
.phone-call-history-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px;
  max-width: 320px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.card-icon {
  width: 20px;
  height: 20px;
  opacity: 0.7;
  flex-shrink: 0;
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.call-duration {
  font-size: 11px;
  opacity: 0.6;
}

.header-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 18px;
      height: 18px;
      opacity: 0.5;
    }
  }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  min-height: 60px;
}

.call-line {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.85;

  &.is-user {
    opacity: 0.7;
  }
}

.line-sender {
  font-weight: 500;
  flex-shrink: 0;
}

.line-content {
  flex: 1;
  min-width: 0;
  word-break: break-word;
}

.voice-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.2s ease;

  svg {
    width: 12px;
    height: 12px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  &.playing {
    background: rgba(80, 170, 255, 0.4);
  }
}

.empty-body {
  font-size: 12px;
  opacity: 0.5;
  text-align: center;
  padding: 8px 0;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.view-hint {
  font-size: 12px;
  opacity: 0.6;
}

.arrow-icon {
  width: 16px;
  height: 16px;
  opacity: 0.5;
  transition: transform 0.2s ease;

  &.expanded {
    transform: rotate(90deg);
  }
}
</style>
