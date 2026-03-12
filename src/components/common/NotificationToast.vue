<script setup lang="ts">
/**
 * 通知 Toast 組件
 * 顯示系統通知的浮動提示
 */
import { useNotificationStore } from "@/stores/notification";
import type { NotificationItem, NotificationType } from "@/types/notification";

const emit = defineEmits<{
  navigate: [page: string, data?: Record<string, any>];
}>();

const notificationStore = useNotificationStore();

// 通知圖標映射
const typeIcons: Record<NotificationType, string> = {
  qzone_post:
    "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  qzone_comment:
    "M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z",
  chat_message:
    "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z",
  chat_summary:
    "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  diary_entry:
    "M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
  fishing_stamina:
    "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  fishing_daily:
    "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  gift_received:
    "M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z",
  incoming_call:
    "M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z",
  system:
    "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
};

// 通知顏色映射
const typeColors: Record<NotificationType, string> = {
  qzone_post: "#7dd3a8",
  qzone_comment: "#7dd3a8",
  chat_message: "#89CFF0",
  chat_summary: "#89CFF0",
  diary_entry: "#f5a9b8",
  fishing_stamina: "#FFB347",
  fishing_daily: "#FFB347",
  gift_received: "#f5a9b8",
  incoming_call: "#7dd3a8",
  system: "#a0aec0",
};

// 獲取圖標路徑
function getIconPath(type: NotificationType): string {
  return typeIcons[type] || typeIcons.system;
}

// 獲取顏色
function getColor(type: NotificationType): string {
  return typeColors[type] || typeColors.system;
}

// 處理點擊
function handleClick(notification: NotificationItem) {
  notificationStore.markAsRead(notification.id);
  notificationStore.dismissToast(notification.id);

  if (notification.navigateTo) {
    emit("navigate", notification.navigateTo, {
      chatId: notification.chatId,
      characterId: notification.characterId,
    });
  }
}

// 關閉通知
function handleDismiss(id: string) {
  notificationStore.dismissToast(id);
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="notification-container">
      <div
        v-for="notification in notificationStore.visibleToasts"
        :key="notification.id"
        class="notification-toast"
        :style="{ '--accent-color': getColor(notification.type) }"
        @click="handleClick(notification)"
      >
        <!-- 圖標 -->
        <div class="toast-icon">
          <svg
            v-if="notification.characterAvatar"
            class="avatar"
            viewBox="0 0 40 40"
          >
            <clipPath id="avatar-clip">
              <circle cx="20" cy="20" r="18" />
            </clipPath>
            <image
              :href="notification.characterAvatar"
              x="2"
              y="2"
              width="36"
              height="36"
              clip-path="url(#avatar-clip)"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="currentColor">
            <path :d="getIconPath(notification.type)" />
          </svg>
        </div>

        <!-- 內容 -->
        <div class="toast-content">
          <div class="toast-title">{{ notification.title }}</div>
          <div class="toast-message">{{ notification.message }}</div>
        </div>

        <!-- 關閉按鈕 -->
        <button
          class="toast-close"
          @click.stop="handleDismiss(notification.id)"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>

        <!-- 進度條 -->
        <div class="toast-progress" />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style lang="scss" scoped>
.notification-container {
  position: fixed;
  top: max(16px, env(safe-area-inset-top, 0px));
  right: max(16px, env(safe-area-inset-right, 0px));
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
  max-width: calc(100vw - 32px);
}

.notification-toast {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  border-left: 3px solid var(--accent-color, #7dd3a8);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  pointer-events: auto;
  min-width: 280px;
  max-width: 360px;
  position: relative;
  overflow: hidden;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;

  &:hover {
    transform: translateX(-4px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
  }

  &:active {
    transform: scale(0.98);
  }
}

.toast-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-color, #7dd3a8);

  svg {
    width: 24px;
    height: 24px;

    &.avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
    }
  }
}

.toast-content {
  flex: 1;
  min-width: 0;
}

.toast-title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-message {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition:
    color 0.2s ease,
    background 0.2s ease;

  &:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.1);
  }

  svg {
    width: 16px;
    height: 16px;
  }
}

.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--accent-color, #7dd3a8);
  animation: progress 4s linear forwards;
}

@keyframes progress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}

// 過渡動畫
.toast-enter-active {
  animation: toast-in 0.3s ease-out;
}

.toast-leave-active {
  animation: toast-out 0.2s ease-in forwards;
}

.toast-move {
  transition: transform 0.3s ease;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}

// 響應式
@media (max-width: 480px) {
  .notification-container {
    top: max(8px, env(safe-area-inset-top, 0px));
    right: max(8px, env(safe-area-inset-right, 0px));
    left: max(8px, env(safe-area-inset-left, 0px));
    max-width: none;
  }

  .notification-toast {
    min-width: 0;
    max-width: none;
  }
}
</style>
