<script setup lang="ts">
interface GroupChatHistoryMessage {
  senderName: string;
  content: string;
  timestamp: number;
  isUser: boolean;
}

interface Props {
  groupName: string;
  messages: GroupChatHistoryMessage[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// 格式化時間
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
</script>

<template>
  <Teleport to="body">
    <div class="gchat-history-modal-overlay" @click.self="emit('close')">
      <div class="gchat-history-modal-content">
        <!-- Status Bar (Decorational) -->
        <div class="gchat-history-status-bar">
          <span class="status-time">9:41</span>
          <div class="status-icons">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="12" y1="20" x2="12" y2="4"></line>
              <line x1="6" y1="20" x2="6" y2="14"></line>
              <line x1="18" y1="20" x2="18" y2="10"></line>
            </svg>
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="1" y="6" width="18" height="12" rx="2" ry="2"></rect>
              <line x1="23" y1="13" x2="23" y2="11"></line>
            </svg>
          </div>
        </div>

        <!-- Header -->
        <div class="gchat-history-modal-header">
          <button class="gchat-history-close-btn" @click="emit('close')">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div class="gchat-history-title-group">
            <h2 class="gchat-history-modal-title">HISTORY</h2>
            <span class="gchat-history-modal-subtitle">{{ groupName }}</span>
          </div>
          <button class="gchat-history-share-btn">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
          </button>
        </div>

        <!-- Card Wrapper -->
        <div class="gchat-history-card-wrapper">
          <div class="gchat-history-date-pill">
            <span class="dot"></span>
            <span>MESSAGES</span>
          </div>

          <div class="gchat-history-messages-container">
            <div v-if="messages.length === 0" class="gchat-history-empty">
              沒有聊天記錄
            </div>
            <div
              v-else
              v-for="(msg, idx) in messages"
              :key="idx"
              class="gchat-history-message"
              :class="{ 'is-user': msg.isUser }"
            >
              <div class="gchat-history-message-header">
                <span class="gchat-history-message-sender">{{
                  msg.senderName
                }}</span>
                <span class="gchat-history-message-time">{{
                  formatTime(msg.timestamp)
                }}</span>
              </div>
              <div class="gchat-history-message-content">{{ msg.content }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap");

.gchat-history-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: env(safe-area-inset-top, 24px) 16px var(--safe-bottom, 24px);
  font-family: "Outfit", sans-serif;
  box-sizing: border-box;
}

.gchat-history-modal-content {
  background: #cbb5e2; /* Lavender from image */
  border: 2px solid #2d2d2d;
  border-radius: 32px;
  width: 100%;
  max-width: 420px;
  height: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  position: relative;
}

.gchat-history-status-bar {
  display: flex;
  justify-content: space-between;
  padding: 16px 28px 8px;
  font-weight: 700;
  font-size: 14px;
  color: #2d2d2d;
  align-items: center;

  .status-icons {
    display: flex;
    align-items: center;
    gap: 6px;

    svg {
      width: 18px;
      height: 18px;
    }
  }
}

.gchat-history-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px 24px;
  flex-shrink: 0;
  color: #2d2d2d;
}

.gchat-history-close-btn {
  background: #ffd166;
  border: 2px solid #2d2d2d;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  color: #2d2d2d;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  padding: 0;
  box-shadow: 2px 2px 0 #2d2d2d;

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 3px 3px 0 #2d2d2d;
  }
  &:active {
    transform: translateY(0);
    box-shadow: 0 0 0 #2d2d2d;
  }
}

.gchat-history-title-group {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gchat-history-modal-title {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  letter-spacing: 0.5px;
  color: #2d2d2d;
  text-transform: uppercase;
}
.gchat-history-modal-subtitle {
  font-size: 12px;
  font-weight: 700;
  opacity: 0.8;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 2px;
}

.gchat-history-share-btn {
  background: transparent;
  border: none;
  color: #2d2d2d;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s;

  svg {
    width: 26px;
    height: 26px;
  }

  &:hover {
    opacity: 0.6;
  }
}

.gchat-history-card-wrapper {
  flex: 1;
  background: #fffbf1; /* Cream white */
  border-top: 2px solid #2d2d2d;
  border-radius: 36px 36px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.gchat-history-date-pill {
  align-self: center;
  background: #ffffff;
  border: 2px solid #2d2d2d;
  border-radius: 20px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 700;
  color: #2d2d2d;
  margin-top: 20px;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.5px;
  box-shadow: 2px 2px 0 rgba(45, 45, 45, 0.1);

  .dot {
    width: 10px;
    height: 10px;
    background: #cbb5e2;
    border-radius: 50%;
    border: 2px solid #2d2d2d;
  }
}

.gchat-history-messages-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 24px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Custom Scrollbar */
.gchat-history-messages-container::-webkit-scrollbar {
  width: 6px;
}
.gchat-history-messages-container::-webkit-scrollbar-track {
  background: transparent;
}
.gchat-history-messages-container::-webkit-scrollbar-thumb {
  background: rgba(45, 45, 45, 0.2);
  border-radius: 10px;
}

.gchat-history-empty {
  text-align: center;
  color: #2d2d2d;
  opacity: 0.6;
  font-weight: 600;
  margin-top: 40px;
}

.gchat-history-message {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px;
  background: #ffffff;
  border: 2px solid #2d2d2d;
  border-radius: 24px;
  position: relative;
  box-shadow: 2px 2px 0 rgba(45, 45, 45, 0.05); /* Subtle depth */

  &::before {
    content: "";
    position: absolute;
    top: 18px;
    left: 18px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #a8d5ba; /* Mint green dot */
    border: 2px solid #2d2d2d;
  }

  &.is-user {
    background: #f4a698; /* Salmon pink back */
    &::before {
      background: #ffffff; /* White dot inside pink */
    }
  }
}

.gchat-history-message-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 2px dashed rgba(45, 45, 45, 0.2);
  padding-bottom: 12px;
  padding-left: 20px; /* Space for the dot */
}
.gchat-history-message.is-user .gchat-history-message-header {
  border-bottom-color: rgba(45, 45, 45, 0.4);
}

.gchat-history-message-sender {
  font-size: 15px;
  font-weight: 800;
  color: #2d2d2d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.gchat-history-message-time {
  font-size: 13px;
  font-weight: 700;
  color: #2d2d2d;
  opacity: 0.6;
}
.gchat-history-message.is-user .gchat-history-message-time {
  opacity: 0.8;
}

.gchat-history-message-content {
  font-size: 16px;
  font-weight: 600;
  color: #2d2d2d;
  line-height: 1.5;
  word-wrap: break-word;
  padding-top: 4px;
}

/* Removed nav pill styles */
</style>
