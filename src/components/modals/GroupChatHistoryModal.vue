<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import type { ChatHistoryRecordData, ChatHistoryRecordItem } from "@/types/chat";

const props = defineProps<{
  record: ChatHistoryRecordData;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

function dayKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDay(timestamp: number): string {
  const d = new Date(timestamp);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 只有貼圖、沒有文字的訊息不畫氣泡底色 */
function isMediaOnly(msg: ChatHistoryRecordItem): boolean {
  return !!msg.parts?.length && msg.parts.every((p) => p.type !== "text");
}

// 依日期分隔，同一人連續發言時只在第一條顯示頭像與名字
const rows = computed(() =>
  props.record.messages.map((msg, idx) => {
    const prev = props.record.messages[idx - 1];
    const showDate = !prev || dayKey(prev.timestamp) !== dayKey(msg.timestamp);
    return {
      msg,
      showDate,
      showSender: showDate || !prev || prev.senderName !== msg.senderName,
      avatar: props.record.senderAvatars?.[msg.senderName] || "",
    };
  }),
);

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));
</script>

<template>
  <Teleport to="body">
    <div class="record-viewer-overlay" @click.self="emit('close')">
      <div class="record-viewer">
        <header class="viewer-header">
          <button class="back-btn" aria-label="返回" @click="emit('close')">
            <ChevronLeft :size="22" :stroke-width="2" />
          </button>
          <div class="viewer-title">
            <span class="title-text">{{ record.groupName }}的聊天記錄</span>
            <span class="title-sub">{{ record.messages.length }} 條訊息</span>
          </div>
        </header>

        <div class="viewer-body">
          <div v-if="record.messages.length === 0" class="viewer-empty">沒有聊天記錄</div>
          <template v-for="(row, idx) in rows" :key="idx">
            <div v-if="row.showDate" class="date-divider">
              <span>{{ formatDay(row.msg.timestamp) }}</span>
            </div>
            <div
              class="record-row"
              :class="{ 'is-user': row.msg.isUser, continued: !row.showSender }"
            >
              <div class="row-avatar">
                <template v-if="row.showSender">
                  <img v-if="row.avatar" :src="row.avatar" :alt="row.msg.senderName" />
                  <span v-else>{{ row.msg.senderName.charAt(0) }}</span>
                </template>
              </div>
              <div class="row-main">
                <div v-if="row.showSender" class="row-meta">
                  <span class="row-name">{{ row.msg.senderName }}</span>
                  <span class="row-time">{{ formatTime(row.msg.timestamp) }}</span>
                </div>
                <div class="row-bubble" :class="{ 'media-only': isMediaOnly(row.msg) }">
                  <template v-if="row.msg.parts?.length">
                    <template v-for="(part, pIdx) in row.msg.parts" :key="pIdx">
                      <span v-if="part.type === 'text'" class="part-text">{{ part.text }}</span>
                      <img
                        v-else-if="part.url"
                        :src="part.url"
                        :alt="part.name || (part.type === 'sticker' ? '貼圖' : '圖片')"
                        :class="part.type === 'sticker' ? 'part-sticker' : 'part-image'"
                        loading="lazy"
                      />
                      <span v-else class="part-text">[{{ part.name || "貼圖" }}]</span>
                    </template>
                  </template>
                  <span v-else class="part-text">{{ row.msg.content }}</span>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.record-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(12px + var(--safe-top, 0px)) 12px 12px;
  background: rgba(0, 0, 0, 0.45);
}

.record-viewer {
  width: min(440px, 100%);
  height: min(86dvh, 760px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-background, #f6f6f6);
  color: var(--color-text, #333);
  border-radius: 18px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}

.viewer-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px 10px 6px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  flex-shrink: 0;

  .back-btn {
    display: flex;
    padding: 6px;
    border-radius: 10px;
    color: var(--color-text, #333);

    &:hover {
      background: var(--color-background, #f2f2f2);
    }
  }
}

.viewer-title {
  display: flex;
  flex-direction: column;
  min-width: 0;

  .title-text {
    font-size: 15px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .title-sub {
    font-size: 12px;
    color: var(--color-text-secondary, #888);
  }
}

.viewer-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px 14px 20px;
  display: flex;
  flex-direction: column;
}

.viewer-empty {
  margin: auto;
  font-size: 13px;
  color: var(--color-text-secondary, #888);
}

.date-divider {
  display: flex;
  justify-content: center;
  margin: 14px 0 6px;

  span {
    padding: 3px 10px;
    font-size: 11px;
    border-radius: 999px;
    color: var(--color-text-secondary, #888);
    background: var(--color-surface, #fff);
  }
}

.record-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;

  &.continued {
    margin-top: 4px;
  }

  &.is-user {
    flex-direction: row-reverse;

    .row-main {
      align-items: flex-end;
    }

    .row-meta {
      flex-direction: row-reverse;
    }

    .row-bubble {
      background: var(--bubble-user-bg, var(--color-primary, #ff85a2));
      color: var(--bubble-user-text, #fff);
      border-radius: 16px 16px 6px 16px;
    }
  }
}

.row-avatar {
  flex-shrink: 0;
  width: 34px;
  height: 34px;

  img,
  span {
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  img {
    object-fit: cover;
    display: block;
  }

  span {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 600;
    background: var(--color-primary-light, #eee);
    color: var(--color-primary, #888);
  }
}

.row-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  min-width: 0;
  max-width: calc(100% - 84px);
}

.row-meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 4px;

  .row-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary, #666);
  }

  .row-time {
    font-size: 10.5px;
    color: var(--color-text-secondary, #999);
    opacity: 0.8;
  }
}

.row-bubble {
  padding: 8px 12px;
  font-size: 14px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--bubble-ai-bg, var(--color-surface, #fff));
  color: var(--bubble-ai-content, var(--color-text, #333));
  border-radius: 16px 16px 16px 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);

  &.media-only {
    padding: 0;
    background: transparent !important;
    box-shadow: none;
  }
}

.part-sticker {
  display: block;
  max-width: 120px;
  max-height: 120px;
  object-fit: contain;
}

.part-image {
  display: block;
  max-width: 200px;
  max-height: 240px;
  border-radius: 10px;
  object-fit: cover;
}
</style>
