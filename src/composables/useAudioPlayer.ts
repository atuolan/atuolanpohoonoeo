/**
 * useAudioPlayer — 全局音頻播放器 composable
 *
 * 管理語音訊息播放狀態，確保同一時間只播放一個語音。
 * 使用 HTMLAudioElement + blob URL 進行播放。
 */

import { ref } from "vue";

// ===== 純狀態管理邏輯（可測試） =====

/**
 * AudioPlayerState — 播放器的純狀態管理
 * 不依賴瀏覽器 API，可在 Node 環境中測試
 */
export class AudioPlayerState {
  playingMessageId: string | null = null;
  isPlaying = false;
  progress = 0;
  currentTime = 0;
  duration = 0;

  /**
   * 開始播放新消息 — 設定狀態並返回之前播放的 messageId（如果有）
   */
  startPlay(messageId: string): string | null {
    const previous = this.playingMessageId;
    if (previous !== null) {
      this.resetState();
    }
    this.playingMessageId = messageId;
    this.isPlaying = true;
    return previous;
  }

  /** 暫停 */
  pausePlay(): void {
    if (this.isPlaying) {
      this.isPlaying = false;
    }
  }

  /** 恢復播放 */
  resumePlay(): void {
    if (this.playingMessageId !== null && !this.isPlaying) {
      this.isPlaying = true;
    }
  }

  /**
   * 跳轉到指定進度 (0-1)
   * 返回計算出的 currentTime，若無法 seek 返回 null
   */
  seekTo(p: number): number | null {
    if (this.playingMessageId === null || this.duration <= 0) return null;
    const clamped = Math.max(0, Math.min(1, p));
    this.currentTime = clamped * this.duration;
    this.progress = clamped;
    return this.currentTime;
  }

  /** 更新時間（由 timeupdate 事件調用） */
  updateTime(time: number, dur: number): void {
    if (dur > 0 && Number.isFinite(dur)) {
      this.currentTime = time;
      this.duration = dur;
      this.progress = time / dur;
    }
  }

  /** 播放結束 */
  onEnded(): void {
    this.progress = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.playingMessageId = null;
  }

  /** 重置所有狀態 */
  resetState(): void {
    this.playingMessageId = null;
    this.isPlaying = false;
    this.progress = 0;
    this.currentTime = 0;
    this.duration = 0;
  }
}

// ===== Vue composable（使用瀏覽器 API） =====

const playingMessageId = ref<string | null>(null);
const isPlaying = ref(false);
const progress = ref(0);
const currentTime = ref(0);
const duration = ref(0);

let audioEl: HTMLAudioElement | null = null;
let currentBlobUrl: string | null = null;
const state = new AudioPlayerState();

function syncFromState() {
  playingMessageId.value = state.playingMessageId;
  isPlaying.value = state.isPlaying;
  progress.value = state.progress;
  currentTime.value = state.currentTime;
  duration.value = state.duration;
}

function cleanup() {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute("src");
    audioEl.load();
    audioEl = null;
  }
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
}

function play(messageId: string, audioBlob: Blob): void {
  cleanup();
  state.startPlay(messageId);
  syncFromState();

  const blobUrl = URL.createObjectURL(audioBlob);
  currentBlobUrl = blobUrl;

  const el = new Audio(blobUrl);
  audioEl = el;

  el.addEventListener("loadedmetadata", () => {
    state.duration = el.duration;
    duration.value = el.duration;
  });

  el.addEventListener("timeupdate", () => {
    state.updateTime(el.currentTime, el.duration);
    syncFromState();
  });

  el.addEventListener("ended", () => {
    state.onEnded();
    syncFromState();
  });

  el.addEventListener("error", () => {
    cleanup();
    state.resetState();
    syncFromState();
  });

  el.play()
    .then(() => {
      state.isPlaying = true;
      isPlaying.value = true;
    })
    .catch(() => {
      cleanup();
      state.resetState();
      syncFromState();
    });
}

function pause(): void {
  if (audioEl && isPlaying.value) {
    audioEl.pause();
    state.pausePlay();
    syncFromState();
  }
}

function seek(p: number): void {
  if (!audioEl || !Number.isFinite(audioEl.duration)) return;
  const newTime = state.seekTo(p);
  if (newTime !== null) {
    audioEl.currentTime = newTime;
    syncFromState();
  }
}

function stop(): void {
  cleanup();
  state.resetState();
  syncFromState();
}

export function useAudioPlayer() {
  return {
    playingMessageId,
    isPlaying,
    progress,
    currentTime,
    duration,
    play,
    pause,
    seek,
    stop,
  };
}
