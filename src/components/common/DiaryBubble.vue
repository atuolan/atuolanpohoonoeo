<template>
  <div class="diary-bubble" :class="{ 'long-pressing': isLongPressing }">
    <!-- 寫作中狀態 -->
    <div v-if="diaryData.status === 'writing'" class="diary-writing">
      <div class="writing-icon-wrapper">
        <svg class="writing-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
          <circle cx="11" cy="11" r="2" />
        </svg>
      </div>
      <div class="writing-text">
        <div class="char-name">{{ charName }}</div>
        <div class="status-text">正在寫日記...</div>
        <div class="time-hint">（{{ charName }}正在深度思考，可能需要 1-3 分鐘）</div>
        <div v-if="isWritingTimeout" class="timeout-hint">生成時間過長，可能已失敗</div>
      </div>
      <div class="writing-actions">
        <div v-if="!isWritingTimeout" class="loading-dots">
          <span></span><span></span><span></span>
        </div>
        <button v-if="isWritingTimeout" class="writing-delete-btn" @click.stop="handleDelete" title="刪除此日記">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- 完成狀態 -->
    <div v-else class="diary-ready">
      <div class="diary-header">
        <div class="diary-icon-wrapper">
          <svg class="diary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
          </svg>
        </div>
        <div class="diary-info">
          <div class="char-name">{{ charName }}</div>
          <div class="status-text">日記寫好了！</div>
        </div>
        <button class="favorite-btn" :class="{ active: diaryData.isFavorite }" @click="toggleFavorite" :title="diaryData.isFavorite ? '取消收藏' : '收藏日記'">
          <svg v-if="diaryData.isFavorite" class="icon" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <svg v-else class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>

      <button class="peek-btn" @click="$emit('view-diary')">
        <svg class="peek-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span class="peek-text">偷偷看看？</span>
      </button>

      <div class="diary-meta">
        <span>
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {{ formatDate(diaryData.createdAt) }}
        </span>
        <span>
          <svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {{ formatTime(diaryData.createdAt) }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { DiaryData } from '@/types/diary'

const props = defineProps<{
  diaryData: DiaryData
  charName: string
}>()

const emit = defineEmits<{
  'view-diary': []
  'toggle-favorite': []
  'delete': []
}>()

const isLongPressing = ref(false)
const WRITING_TIMEOUT = 5 * 60 * 1000 // 5分鐘
const isWritingTimeout = ref(false)
let timeoutCheckTimer: number | null = null

function checkWritingTimeout() {
  if (props.diaryData.status === 'writing') {
    const elapsed = Date.now() - props.diaryData.createdAt
    isWritingTimeout.value = elapsed > WRITING_TIMEOUT
  } else {
    isWritingTimeout.value = false
  }
}

function startTimeoutCheck() {
  if (props.diaryData.status === 'writing') {
    checkWritingTimeout()
    if (!isWritingTimeout.value) {
      const remaining = WRITING_TIMEOUT - (Date.now() - props.diaryData.createdAt)
      if (remaining > 0) {
        timeoutCheckTimer = window.setTimeout(() => checkWritingTimeout(), remaining + 1000)
      }
    }
  }
}

function clearTimeoutCheck() {
  if (timeoutCheckTimer) {
    clearTimeout(timeoutCheckTimer)
    timeoutCheckTimer = null
  }
}

onMounted(() => startTimeoutCheck())
onUnmounted(() => clearTimeoutCheck())

watch(() => props.diaryData.status, (newStatus) => {
  clearTimeoutCheck()
  if (newStatus === 'writing') startTimeoutCheck()
  else isWritingTimeout.value = false
})

function toggleFavorite() { emit('toggle-favorite') }
function handleDelete() { emit('delete') }

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`
}
</script>


<style lang="scss" scoped>
.diary-bubble {
  margin: 16px 0;
  max-width: 100%;
  transition: all 0.2s ease;
  
  &.long-pressing { transform: scale(0.98); opacity: 0.9; }
}

.diary-writing {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: var(--color-surface, rgba(255, 255, 255, 0.95));
  border-radius: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));

  .writing-icon-wrapper {
    width: 32px; height: 32px;
    background: var(--color-primary, #7dd3a8);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    animation: bounce 1.2s ease-in-out infinite;
    .writing-icon { width: 18px; height: 18px; color: white; }
  }

  .writing-text {
    flex: 1;
    .char-name { font-size: 13px; font-weight: 500; color: var(--color-text, #333); margin-bottom: 2px; }
    .status-text { font-size: 12px; color: var(--color-text-secondary, #8a8a8a); }
    .time-hint { font-size: 11px; color: var(--color-text-muted, #999); margin-top: 4px; font-style: italic; }
    .timeout-hint { font-size: 11px; color: #e74c3c; margin-top: 4px; font-weight: 500; }
  }

  .writing-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .loading-dots {
    display: flex; gap: 3px;
    span {
      width: 5px; height: 5px; background: var(--color-text-muted, #999); border-radius: 50%;
      animation: pulse 1.4s ease-in-out infinite;
      &:nth-child(1) { animation-delay: 0s; }
      &:nth-child(2) { animation-delay: 0.2s; }
      &:nth-child(3) { animation-delay: 0.4s; }
    }
  }

  .writing-delete-btn {
    width: 32px; height: 32px; padding: 0; border: none;
    background: rgba(231, 76, 60, 0.1); border-radius: 8px;
    cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; color: #e74c3c;
    svg { width: 16px; height: 16px; }
    &:hover { background: rgba(231, 76, 60, 0.2); transform: scale(1.05); }
  }
}

.diary-ready {
  position: relative;
  padding: 16px;
  background: var(--color-surface, white);
  border-radius: 18px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  &::after {
    content: ''; position: absolute; left: 16px; bottom: -8px;
    width: 0; height: 0;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    border-top: 8px solid var(--color-surface, white);
    filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.05));
  }

  .diary-header {
    display: flex; align-items: center; gap: 10px; margin-bottom: 12px;

    .diary-icon-wrapper {
      width: 36px; height: 36px;
      background: var(--color-primary, #7dd3a8);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      .diary-icon { width: 20px; height: 20px; color: white; }
    }

    .diary-info {
      flex: 1;
      .char-name { font-size: 14px; font-weight: 500; color: var(--color-text, #333); margin-bottom: 2px; }
      .status-text { font-size: 12px; color: var(--color-text-secondary, #8a8a8a); }
    }

    .favorite-btn {
      width: 32px; height: 32px; padding: 0; border: none;
      background: var(--color-background, rgba(0, 0, 0, 0.04));
      border-radius: 8px; cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; justify-content: center;
      color: var(--color-text-muted, #6b7280);
      .icon { width: 16px; height: 16px; }
      &:hover { background: rgba(0, 0, 0, 0.08); transform: scale(1.05); }
      &.active { background: #ffd700; color: white; }
    }
  }

  .peek-btn {
    width: 100%; padding: 10px 16px;
    background: var(--color-primary, #7dd3a8);
    border: none; border-radius: 12px;
    color: white; font-size: 14px; font-weight: 500;
    cursor: pointer; transition: all 0.2s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    box-shadow: 0 2px 6px rgba(125, 211, 168, 0.3);
    &:hover { box-shadow: 0 3px 10px rgba(125, 211, 168, 0.4); transform: translateY(-1px); }
    &:active { transform: scale(0.98) translateY(0); }
    .peek-icon { width: 18px; height: 18px; animation: peek 2s ease-in-out infinite; }
  }

  .diary-meta {
    display: flex; justify-content: space-between; align-items: center;
    margin-top: 10px; padding-top: 10px;
    border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));
    font-size: 11px; color: var(--color-text-muted, #9ca3af);
    span { display: flex; align-items: center; gap: 4px; }
    .meta-icon { width: 14px; height: 14px; flex-shrink: 0; }
  }
}

@keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
@keyframes pulse { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
@keyframes peek { 0%, 100% { transform: scale(1) rotate(0deg); } 25% { transform: scale(1.15) rotate(-8deg); } 50% { transform: scale(1.15) rotate(8deg); } 75% { transform: scale(1.15) rotate(-8deg); } }
</style>
