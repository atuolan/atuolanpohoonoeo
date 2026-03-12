<script setup lang="ts">
import { computed, ref } from "vue";
import GroupCallHistoryCard from "@/components/common/GroupCallHistoryCard.vue";

interface GroupCallMessage {
  type: "voice" | "system" | "user";
  senderName?: string;
  content: string;
  timestamp: number;
}

interface Participant {
  characterId: string;
  name: string;
  avatar?: string;
}

interface GroupCallRecord {
  id: string;
  groupName: string;
  participants: Participant[];
  messages: GroupCallMessage[];
  startedAt: number;
  endedAt: number;
}

interface Props {
  visible: boolean;
  records: GroupCallRecord[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

// 當前查看的詳細記錄 - 如果只有一條記錄，直接顯示詳細視圖
const viewingRecord = ref<GroupCallRecord | null>(
  props.records.length === 1 ? props.records[0] : null
);

// 按時間倒序排列
const sortedRecords = computed(() => {
  return [...props.records].sort((a, b) => b.startedAt - a.startedAt);
});

function viewDetail(record: GroupCallRecord) {
  viewingRecord.value = record;
}

function closeDetail() {
  viewingRecord.value = null;
}

function close() {
  viewingRecord.value = null;
  emit("close");
}

// 格式化時間
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `今天 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isYesterday) {
    return `昨天 ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
  }

  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="visible" class="modal-overlay" @click.self="close">
        <!-- 列表視圖 -->
        <div v-if="!viewingRecord" class="modal-container">
          <div class="modal-header">
            <h2 class="modal-title">群通話記錄</h2>
            <button class="close-btn" @click="close">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <div v-if="sortedRecords.length === 0" class="empty-state">
              <svg viewBox="0 0 24 24" fill="currentColor" class="empty-icon">
                <path
                  d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
                />
              </svg>
              <p class="empty-text">還沒有群通話記錄</p>
            </div>

            <div v-else class="records-list">
              <div
                v-for="record in sortedRecords"
                :key="record.id"
                class="record-item"
              >
                <GroupCallHistoryCard
                  :group-name="record.groupName"
                  :participants="record.participants"
                  :messages="record.messages"
                  :started-at="record.startedAt"
                  :ended-at="record.endedAt"
                  @view="viewDetail(record)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 詳細視圖 -->
        <div v-else class="modal-container detail-view">
          <div class="modal-header">
            <button class="back-btn" @click="closeDetail">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </button>
            <div class="header-info">
              <h2 class="modal-title">{{ viewingRecord.groupName }}</h2>
              <span class="call-time">
                {{ formatTime(viewingRecord.startedAt) }}
              </span>
            </div>
            <button class="close-btn" @click="close">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>

          <div class="modal-body">
            <!-- 參與者列表 -->
            <div class="participants-section">
              <h3 class="section-title">參與者</h3>
              <div class="participants-list">
                <div
                  v-for="participant in viewingRecord.participants"
                  :key="participant.characterId"
                  class="participant-chip"
                >
                  <div class="participant-avatar">
                    <img
                      v-if="participant.avatar"
                      :src="participant.avatar"
                      :alt="participant.name"
                    />
                    <div v-else class="avatar-placeholder">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path
                          d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                        />
                      </svg>
                    </div>
                  </div>
                  <span class="participant-name">{{ participant.name }}</span>
                </div>
              </div>
            </div>

            <!-- 通話記錄 -->
            <div class="messages-section">
              <h3 class="section-title">通話內容</h3>
              <div class="messages-list">
                <div
                  v-for="(message, idx) in viewingRecord.messages"
                  :key="idx"
                  class="message-item"
                  :class="{ system: message.type === 'system' }"
                >
                  <div v-if="message.type === 'system'" class="system-message">
                    {{ message.content }}
                  </div>
                  <div v-else class="chat-message" :class="message.type">
                    <span v-if="message.type !== 'user'" class="sender-name">
                      {{ message.senderName }}
                    </span>
                    <span v-else class="sender-name">你</span>
                    <div class="message-content">{{ message.content }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
}

.modal-container {
  background: var(--modal-bg, rgba(30, 30, 30, 0.95));
  border-radius: 20px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.1);

  &.detail-view {
    max-width: 600px;
  }
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;

  svg {
    width: 20px;
    height: 20px;
    fill: rgba(255, 255, 255, 0.7);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.call-time {
  font-size: 12px;
  opacity: 0.6;
}

.close-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;

  svg {
    width: 20px;
    height: 20px;
    fill: rgba(255, 255, 255, 0.7);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 3px;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  opacity: 0.3;
  margin-bottom: 16px;
}

.empty-text {
  font-size: 14px;
  opacity: 0.5;
  margin: 0;
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.record-item {
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// 詳細視圖樣式
.participants-section,
.messages-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.7;
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.participants-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.participant-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px 6px 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
  }
}

.participant-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
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
      width: 16px;
      height: 16px;
      opacity: 0.5;
    }
  }
}

.participant-name {
  font-size: 13px;
  opacity: 0.9;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.message-item {
  animation: slideIn 0.3s ease;

  &.system {
    display: flex;
    justify-content: center;
  }
}

.system-message {
  font-size: 12px;
  opacity: 0.5;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  text-align: center;
  max-width: 80%;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 85%;

  &.user {
    align-self: flex-end;

    .sender-name {
      text-align: right;
      color: var(--color-primary, #7dd3a8);
    }

    .message-content {
      background: var(--color-primary, #7dd3a8);
      color: white;
      border-radius: 16px 16px 4px 16px;
      align-self: flex-end;
    }
  }

  &.voice {
    align-self: flex-start;

    .sender-name {
      color: var(--color-secondary, #f5a9b8);
    }

    .message-content {
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.95);
      border-radius: 16px 16px 16px 4px;
    }
  }

  .sender-name {
    font-size: 11px;
    font-weight: 600;
    opacity: 0.8;
    padding: 0 4px;
  }

  .message-content {
    padding: 10px 14px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

// 過渡動畫
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;

  .modal-container {
    transition: transform 0.3s ease;
  }
}

.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;

  .modal-container {
    transform: scale(0.95);
  }
}

// 手機版調整
@media (max-width: 480px) {
  .modal-overlay {
    padding: 0;
  }

  .modal-container {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0;
  }
}
</style>
