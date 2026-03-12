<script setup lang="ts">
import { computed } from "vue";

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
  (e: "view"): void;
}>();

// 顯示前 3 條預覽
const previewMessages = computed(() => props.messages.slice(0, 3));

// 格式化內容（截斷過長文字）
function formatContent(content: string): string {
  if (content.length > 50) {
    return content.slice(0, 47) + "...";
  }
  return content;
}
</script>

<template>
  <div class="group-chat-history-card" @click="emit('view')">
    <div class="card-header">
      <svg viewBox="0 0 24 24" fill="currentColor" class="card-icon">
        <path
          d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
        />
      </svg>
      <span class="card-title">{{ groupName }}的聊天記錄</span>
    </div>

    <div class="card-preview">
      <div
        v-for="(msg, idx) in previewMessages"
        :key="idx"
        class="preview-message"
      >
        <span class="preview-sender">{{ msg.senderName }}:</span>
        <span class="preview-content">{{ formatContent(msg.content) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <span class="view-hint">查看 {{ messages.length }} 條轉發消息</span>
      <svg viewBox="0 0 24 24" fill="currentColor" class="arrow-icon">
        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
      </svg>
    </div>
  </div>
</template>

<style scoped lang="scss">
.group-chat-history-card {
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
  margin-bottom: 8px;
}

.card-icon {
  width: 18px;
  height: 18px;
  opacity: 0.7;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
}

.card-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
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
