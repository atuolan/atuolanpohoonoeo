<script setup lang="ts">
import { computed } from "vue";

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

interface Props {
  groupName: string;
  participants: Participant[];
  messages: GroupCallMessage[];
  startedAt: number;
  endedAt: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "view"): void;
}>();

// 顯示前 3 條預覽（排除系統訊息）
const previewMessages = computed(() => {
  return props.messages
    .filter((msg) => msg.type !== "system")
    .slice(0, 3);
});

// 計算通話時長
const duration = computed(() => {
  const seconds = Math.floor((props.endedAt - props.startedAt) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
});

// 格式化內容（截斷過長文字）
function formatContent(content: string): string {
  if (content.length > 40) {
    return content.slice(0, 37) + "...";
  }
  return content;
}
</script>

<template>
  <div class="group-call-history-card" @click="emit('view')">
    <div class="card-header">
      <svg viewBox="0 0 24 24" fill="currentColor" class="card-icon">
        <path
          d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"
        />
      </svg>
      <div class="header-info">
        <span class="card-title">{{ groupName }}的群通話</span>
        <span class="call-duration">時長 {{ duration }}</span>
      </div>
    </div>

    <!-- 參與者頭像列表 -->
    <div class="participants-row">
      <div
        v-for="participant in participants.slice(0, 4)"
        :key="participant.characterId"
        class="participant-avatar"
      >
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
      <span v-if="participants.length > 4" class="more-count">
        +{{ participants.length - 4 }}
      </span>
    </div>

    <!-- 通話內容預覽 -->
    <div class="card-preview">
      <div
        v-for="(msg, idx) in previewMessages"
        :key="idx"
        class="preview-message"
      >
        <span v-if="msg.type !== 'user'" class="preview-sender">
          {{ msg.senderName }}:
        </span>
        <span v-else class="preview-sender">你:</span>
        <span class="preview-content">{{ formatContent(msg.content) }}</span>
      </div>
      <div v-if="previewMessages.length === 0" class="empty-preview">
        通話已結束
      </div>
    </div>

    <div class="card-footer">
      <span class="view-hint">查看 {{ messages.length }} 條通話記錄</span>
      <svg viewBox="0 0 24 24" fill="currentColor" class="arrow-icon">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
.group-call-history-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  max-width: 320px;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
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

.participants-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 0 4px;
}

.participant-avatar {
  width: 28px;
  height: 28px;
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
      width: 16px;
      height: 16px;
      opacity: 0.5;
    }
  }
}

.more-count {
  font-size: 11px;
  opacity: 0.6;
  margin-left: 2px;
}

.card-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  min-height: 60px;
}

.preview-message {
  font-size: 13px;
  line-height: 1.4;
  opacity: 0.8;
}

.preview-sender {
  font-weight: 500;
  margin-right: 4px;
}

.preview-content {
  opacity: 0.9;
}

.empty-preview {
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
</style>
