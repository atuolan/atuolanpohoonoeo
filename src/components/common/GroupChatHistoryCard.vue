<script setup lang="ts">
import { computed } from "vue";
import type { ChatHistoryRecordData } from "@/types/chat";

const props = defineProps<{
  record: ChatHistoryRecordData;
}>();

const emit = defineEmits<{
  (e: "view"): void;
}>();

// 顯示前 3 條預覽
const previewMessages = computed(() => props.record.messages.slice(0, 3));

// 參與者頭像（依出現順序，最多 3 位）
const participants = computed(() => {
  const names: string[] = [];
  for (const msg of props.record.messages) {
    if (!names.includes(msg.senderName)) names.push(msg.senderName);
    if (names.length >= 3) break;
  }
  return names.map((name) => ({
    name,
    avatar: props.record.senderAvatars?.[name] || "",
  }));
});

// 格式化內容（截斷過長文字）
function formatContent(content: string): string {
  const oneLine = content.replace(/\s+/g, " ");
  return oneLine.length > 40 ? `${oneLine.slice(0, 38)}…` : oneLine;
}
</script>

<template>
  <div class="chat-record-card" @click="emit('view')">
    <div class="card-header">
      <div v-if="participants.length > 0" class="avatar-stack">
        <span
          v-for="(p, idx) in participants"
          :key="p.name"
          class="stack-avatar"
          :style="{ zIndex: participants.length - idx }"
        >
          <img v-if="p.avatar" :src="p.avatar" :alt="p.name" />
          <span v-else>{{ p.name.charAt(0) }}</span>
        </span>
      </div>
      <div class="card-heading">
        <span class="card-label">聊天記錄</span>
        <span class="card-title">{{ record.groupName }}</span>
      </div>
    </div>

    <div class="card-preview">
      <div v-for="(msg, idx) in previewMessages" :key="idx" class="preview-line">
        <span class="preview-sender">{{ msg.senderName }}：</span>
        <span class="preview-content">{{ formatContent(msg.content) }}</span>
      </div>
    </div>

    <div class="card-footer">
      <span>共 {{ record.messages.length }} 條</span>
      <span class="view-hint">查看 ›</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-record-card {
  position: relative;
  isolation: isolate;
  width: 260px;
  max-width: 100%;
  margin: 0 6px 8px 0;
  padding: 12px 14px 10px;
  background: var(--color-surface, #fff);
  color: var(--color-text, #333);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  cursor: pointer;
  text-align: left;
  transition: transform 0.2s ease;

  // 後面疊兩層紙，表示這是一疊訊息
  &::before,
  &::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
    border-radius: 14px;
  }

  &::before {
    transform: translate(4px, 4px) rotate(1.2deg);
    filter: brightness(0.97);
  }

  &::after {
    transform: translate(7px, 8px) rotate(2.4deg);
    filter: brightness(0.93);
    z-index: -2;
  }

  &:hover {
    transform: translateY(-2px);
  }

  &:active {
    transform: translateY(0);
  }
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.avatar-stack {
  display: flex;
  flex-shrink: 0;
}

.stack-avatar {
  position: relative;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  border: 2px solid var(--color-surface, #fff);
  background: var(--color-primary-light, #eee);
  color: var(--color-primary, #888);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;

  & + & {
    margin-left: -9px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.card-heading {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card-label {
  font-size: 11px;
  color: var(--color-primary, #888);
  font-weight: 600;
  letter-spacing: 0.05em;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-preview {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 0;
  border-top: 1px dashed var(--color-border, rgba(0, 0, 0, 0.1));
  border-bottom: 1px dashed var(--color-border, rgba(0, 0, 0, 0.1));
}

.preview-line {
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--color-text-secondary, #666);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-sender {
  color: var(--color-text, #333);
  font-weight: 500;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  padding-top: 8px;
  font-size: 12px;
  color: var(--color-text-secondary, #888);

  .view-hint {
    color: var(--color-primary, #888);
    font-weight: 500;
  }
}
</style>
