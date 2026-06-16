<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";

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

const showModal = ref(false);

// 通話時長
const duration = computed(() => {
  const seconds = Math.max(0, Math.floor((props.endedAt - props.startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
});

// 是否有任何語音可回放
const hasVoice = computed(() => props.messages.some((m) => !!m.audioUrl));

// 通話起始時間（顯示在卡片上）
const startedTimeLabel = computed(() => {
  const d = new Date(props.startedAt);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
});

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

// ===== 小視窗 =====
function openModal() {
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  stopAudio();
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") closeModal();
}

watch(showModal, (open) => {
  if (open) {
    window.addEventListener("keydown", onKeydown);
  } else {
    window.removeEventListener("keydown", onKeydown);
  }
});

onUnmounted(() => {
  stopAudio();
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <div class="phone-call-history-card" role="button" tabindex="0" @click="openModal" @keydown.enter="openModal">
    <div class="card-header">
      <svg viewBox="0 0 24 24" fill="currentColor" class="card-icon">
        <path
          d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"
        />
      </svg>
      <div class="header-info">
        <span class="card-title">與 {{ characterName }} 的通話</span>
        <span class="call-meta">時長 {{ duration }} · {{ messages.length }} 條記錄</span>
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

    <div class="card-footer">
      <span class="view-hint">
        點擊查看通話記錄
        <template v-if="hasVoice"> · 含語音</template>
      </span>
      <svg viewBox="0 0 24 24" fill="currentColor" class="arrow-icon">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </div>
  </div>

  <!-- 通話記錄小視窗 -->
  <Teleport to="body">
    <Transition name="call-modal-fade">
      <div v-if="showModal" class="call-modal-overlay" @click.self="closeModal">
        <div class="call-modal" @click.stop>
          <div class="modal-header">
            <div class="modal-avatar">
              <img v-if="characterAvatar" :src="characterAvatar" :alt="characterName" />
              <div v-else class="avatar-placeholder">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
              </div>
            </div>
            <div class="modal-title-wrap">
              <span class="modal-title">與 {{ characterName }} 的通話</span>
              <span class="modal-subtitle">{{ startedTimeLabel }} · 時長 {{ duration }}</span>
            </div>
            <button class="modal-close" type="button" title="關閉" @click="closeModal">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div
              v-for="(msg, idx) in messages"
              :key="idx"
              class="bubble-row"
              :class="{ 'is-user': msg.role === 'user' }"
            >
              <!-- AI 頭像（靠左） -->
              <div v-if="msg.role === 'ai'" class="bubble-avatar">
                <img v-if="characterAvatar" :src="characterAvatar" :alt="characterName" />
                <div v-else class="avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                </div>
              </div>

              <div class="bubble-wrap">
                <div class="bubble">
                  <span class="bubble-content">{{ msg.content }}</span>
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
              </div>
            </div>
            <div v-if="messages.length === 0" class="empty-body">通話已結束</div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.phone-call-history-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px;
  max-width: 320px;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
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

.call-meta {
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

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.view-hint {
  font-size: 12px;
  opacity: 0.6;
}

.arrow-icon {
  width: 16px;
  height: 16px;
  opacity: 0.5;
}

/* ===== 小視窗 ===== */
.call-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  backdrop-filter: blur(2px);
}

.call-modal {
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #1e1f24;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: #fff;
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-avatar {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.2);
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
      width: 20px;
      height: 20px;
      opacity: 0.5;
    }
  }
}

.modal-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modal-subtitle {
  font-size: 12px;
  opacity: 0.6;
}

.modal-close {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.2s ease;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.15);
}

.bubble-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;

  // 使用者訊息靠右
  &.is-user {
    flex-direction: row-reverse;
  }
}

.bubble-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.15);
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
      width: 16px;
      height: 16px;
      opacity: 0.5;
    }
  }
}

.bubble-wrap {
  display: flex;
  max-width: 78%;
  min-width: 0;
}

.bubble {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 11px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  background: rgba(255, 255, 255, 0.1);
  border-bottom-left-radius: 4px;

  .is-user & {
    background: rgba(80, 170, 255, 0.32);
    border-bottom-left-radius: 14px;
    border-bottom-right-radius: 4px;
  }
}

.bubble-content {
  min-width: 0;
  word-break: break-word;
  white-space: pre-wrap;
}

.voice-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.18);
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
    background: rgba(255, 255, 255, 0.3);
  }

  &.playing {
    background: rgba(80, 170, 255, 0.55);
  }
}

.empty-body {
  font-size: 13px;
  opacity: 0.5;
  text-align: center;
  padding: 16px 0;
}

/* 過渡動畫 */
.call-modal-fade-enter-active,
.call-modal-fade-leave-active {
  transition: opacity 0.2s ease;
}

.call-modal-fade-enter-from,
.call-modal-fade-leave-to {
  opacity: 0;
}
</style>
