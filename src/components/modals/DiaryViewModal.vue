<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container diary-modal">
      <div class="modal-header">
        <div class="header-left">
          <div class="diary-icon-wrapper">
            <svg
              class="diary-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
              />
            </svg>
          </div>
          <div class="header-info">
            <h2>{{ charName }} 的日記</h2>
            <p class="diary-date">{{ formatDate(diaryData.createdAt) }}</p>
          </div>
        </div>
        <div class="header-actions">
          <button
            class="favorite-btn"
            :class="{ active: diaryData.isFavorite }"
            @click="toggleFavorite"
            :title="diaryData.isFavorite ? '取消收藏' : '收藏日記'"
          >
            <svg
              v-if="diaryData.isFavorite"
              class="icon"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
            <svg
              v-else
              class="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              />
            </svg>
          </button>
          <button class="close-btn" @click="$emit('close')" title="關閉">
            <svg
              class="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div class="modal-body">
        <div class="diary-section">
          <div class="section-header">
            <svg
              class="section-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 19l7-7 3 3-7 7-3-3z" />
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
              <path d="M2 2l7.586 7.586" />
              <circle cx="11" cy="11" r="2" />
            </svg>
            <h3>{{ charName }} 對 {{ userName }} 的想法</h3>
          </div>
          <div class="diary-content">{{ diaryData.content }}</div>
          <div class="diary-meta">
            <span>
              <svg
                class="meta-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {{ formatDateFull(diaryData.createdAt) }}
            </span>
            <span>
              <svg
                class="meta-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {{ formatTimeFull(diaryData.createdAt) }}
            </span>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-secondary" @click="exportDiary">
          <svg
            class="icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          導出日記
        </button>
        <button class="btn-primary" @click="$emit('close')">關閉</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DiaryData } from "@/types/diary";

const props = defineProps<{
  diaryData: DiaryData;
  charName: string;
  userName?: string;
}>();

const emit = defineEmits<{
  close: [];
  "toggle-favorite": [];
}>();

function toggleFavorite() {
  emit("toggle-favorite");
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateFull(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTimeFull(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function exportDiary() {
  const text = `【${props.charName} 的日記】
時間：${formatDate(props.diaryData.createdAt)}

${props.diaryData.content}

---
${props.charName} 對 ${props.userName || "user"} 的想法
基於最近 ${props.diaryData.messageCount} 條對話生成
`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${props.charName}_日記_${new Date(props.diaryData.createdAt).toLocaleDateString()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.diary-modal {
  width: 100%;
  max-width: 600px;
  max-height: calc(90vh - env(safe-area-inset-top) - var(--safe-bottom, 0px));
  background: var(--color-surface, white);
  border-radius: 20px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-surface, white);

  .header-left {
    display: flex;
    align-items: center;
    gap: 14px;
    flex: 1;

    .diary-icon-wrapper {
      width: 44px;
      height: 44px;
      background: var(--color-primary, #7dd3a8);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      .diary-icon {
        width: 24px;
        height: 24px;
        color: white;
      }
    }

    .header-info {
      flex: 1;
      min-width: 0;
      h2 {
        margin: 0 0 2px;
        font-size: 18px;
        font-weight: 600;
        color: var(--color-text, #1f2937);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .diary-date {
        margin: 0;
        font-size: 12px;
        color: var(--color-text-secondary, #6b7280);
      }
    }
  }

  .header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;

    .favorite-btn,
    .close-btn {
      width: 36px;
      height: 36px;
      padding: 0;
      background: var(--color-background, rgba(0, 0, 0, 0.04));
      border: none;
      border-radius: 10px;
      color: var(--color-text-secondary, #6b7280);
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      .icon {
        width: 18px;
        height: 18px;
      }
      &:hover {
        background: rgba(0, 0, 0, 0.08);
        transform: scale(1.05);
      }
      &:active {
        transform: scale(0.95);
      }
    }

    .favorite-btn.active {
      background: #ffd700;
      color: white;
      &:hover {
        background: #ffc700;
      }
    }
    .close-btn:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  background: var(--color-background, #f9fafb);
}

.diary-section {
  padding: 20px;
  background: var(--color-surface, white);
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);

  .section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    .section-icon {
      width: 20px;
      height: 20px;
      color: var(--color-primary, #7dd3a8);
      flex-shrink: 0;
    }
    h3 {
      margin: 0;
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text, #374151);
    }
  }

  .diary-content {
    font-size: 15px;
    line-height: 1.8;
    color: var(--color-text, #1f2937);
    white-space: pre-wrap;
    font-family:
      -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei",
      sans-serif;
    margin-bottom: 16px;
    padding: 16px;
    background: var(
      --color-background,
      linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)
    );
    border-radius: 12px;
    border-left: 3px solid var(--color-primary, #7dd3a8);
  }

  .diary-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--color-text-muted, #9ca3af);
    padding-top: 12px;
    border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.06));
    span {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meta-icon {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }
  }
}

.modal-footer {
  padding: 16px 24px;
  padding-bottom: max(16px, var(--safe-bottom, 0px));
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--color-surface, white);

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    .icon {
      width: 16px;
      height: 16px;
    }
    &:active {
      transform: scale(0.98);
    }
  }

  .btn-secondary {
    background: var(--color-background, rgba(0, 0, 0, 0.04));
    color: var(--color-text, #374151);
    &:hover {
      background: rgba(0, 0, 0, 0.08);
    }
  }
  .btn-primary {
    background: var(--color-primary, #7dd3a8);
    color: white;
    &:hover {
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }
}

.modal-body::-webkit-scrollbar {
  width: 6px;
}
.modal-body::-webkit-scrollbar-track {
  background: transparent;
}
.modal-body::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  &:hover {
    background: rgba(0, 0, 0, 0.3);
  }
}

@media (max-width: 480px) {
  .modal-overlay {
    padding: 0;
    align-items: flex-end;
  }
  .diary-modal {
    max-height: calc(85vh - env(safe-area-inset-top) - var(--safe-bottom, 0px));
    border-radius: 20px 20px 0 0;
  }
  .modal-header {
    padding: 16px 20px;
    .header-left {
      .diary-icon-wrapper {
        width: 40px;
        height: 40px;
        .diary-icon {
          width: 22px;
          height: 22px;
        }
      }
      .header-info {
        h2 {
          font-size: 16px;
        }
        .diary-date {
          font-size: 11px;
        }
      }
    }
  }
  .modal-body {
    padding: 20px 16px;
  }
  .diary-section {
    padding: 16px;
    .diary-content {
      font-size: 14px;
      line-height: 1.7;
      padding: 14px;
    }
  }
  .modal-footer {
    padding: 14px 16px;
    button {
      padding: 9px 16px;
      font-size: 13px;
    }
  }
}
</style>
