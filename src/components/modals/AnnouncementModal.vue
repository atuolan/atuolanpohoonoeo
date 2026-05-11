<script setup lang="ts">
import type { Announcement } from "@/services/AnnouncementService";
import { Megaphone, AlertTriangle, Info, X, ExternalLink } from "lucide-vue-next";
import { marked } from "marked";
import { computed } from "vue";

const props = defineProps<{
  announcement: Announcement;
  /** 第幾則 / 共幾則（>1 才顯示） */
  index?: number;
  total?: number;
}>();

const emit = defineEmits<{
  ack: [id: string];
}>();

marked.setOptions({ breaks: true, gfm: true });

const level = computed(() => props.announcement.level || "info");

const renderedBody = computed(() => {
  try {
    return marked.parse(props.announcement.body) as string;
  } catch {
    return props.announcement.body;
  }
});

const levelLabel = computed(() => {
  switch (level.value) {
    case "critical":
      return "重要更新";
    case "important":
      return "公告";
    default:
      return "通知";
  }
});

function handleAck() {
  emit("ack", props.announcement.id);
}

function handleAction() {
  if (props.announcement.actionUrl) {
    window.open(props.announcement.actionUrl, "_blank", "noopener,noreferrer");
  }
}
</script>

<template>
  <div class="ann-overlay" @click.self="handleAck">
    <div class="ann-window" :class="`level-${level}`">
      <button class="close-btn" @click="handleAck" aria-label="關閉並標記為已讀">
        <X :size="18" />
      </button>

      <header class="ann-header">
        <div class="ann-icon">
          <AlertTriangle v-if="level === 'critical'" :size="22" />
          <Megaphone v-else-if="level === 'important'" :size="22" />
          <Info v-else :size="22" />
        </div>
        <div class="ann-meta">
          <div class="ann-level">
            {{ levelLabel }}
            <span v-if="total && total > 1" class="ann-counter">
              {{ index }} / {{ total }}
            </span>
          </div>
          <h2 class="ann-title">{{ announcement.title }}</h2>
          <div v-if="announcement.date" class="ann-date">{{ announcement.date }}</div>
        </div>
      </header>

      <img
        v-if="announcement.imageUrl"
        :src="announcement.imageUrl"
        :alt="announcement.title"
        class="ann-cover"
        loading="lazy"
      />

      <div class="ann-body markdown-body" v-html="renderedBody" />

      <footer class="ann-actions">
        <button
          v-if="announcement.actionUrl"
          class="btn-secondary"
          @click="handleAction"
        >
          {{ announcement.actionLabel || "查看詳情" }}
          <ExternalLink :size="14" />
        </button>
        <button class="btn-primary" @click="handleAck">我已知曉</button>
      </footer>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ann-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(6px);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.ann-window {
  background: var(--bg-color, #fff);
  color: var(--text-color, #222);
  border-radius: 18px;
  width: 100%;
  max-width: 420px;
  max-height: 85vh;
  overflow-y: auto;
  position: relative;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(0, 0, 0, 0.08);

  &.level-important {
    border-color: #f59e0b;
    box-shadow: 0 18px 50px rgba(245, 158, 11, 0.22);
  }

  &.level-critical {
    border-color: #ef4444;
    box-shadow: 0 18px 50px rgba(239, 68, 68, 0.28);
  }
}

.close-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.04);
  border: none;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
  z-index: 2;

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.08);
  }
}

.ann-header {
  display: flex;
  gap: 12px;
  padding: 20px 44px 12px 20px;
  align-items: flex-start;
}

.ann-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(59, 130, 246, 0.12);
  color: #3b82f6;

  .level-important & {
    background: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .level-critical & {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
}

.ann-meta {
  flex: 1;
  min-width: 0;
}

.ann-level {
  font-size: 11px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  opacity: 0.65;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ann-counter {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  padding: 1px 8px;
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
}

.ann-title {
  font-size: 18px;
  font-weight: 700;
  margin: 4px 0 2px;
  line-height: 1.3;
  word-break: break-word;
}

.ann-date {
  font-size: 12px;
  opacity: 0.55;
}

.ann-cover {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
  margin: 4px 0 0;
}

.ann-body {
  padding: 14px 20px 4px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;

  :deep(p) {
    margin: 0 0 10px;
  }

  :deep(p:last-child) {
    margin-bottom: 0;
  }

  :deep(strong),
  :deep(b) {
    font-weight: 700;
  }

  :deep(em),
  :deep(i) {
    font-style: italic;
  }

  :deep(img) {
    max-width: 100%;
    border-radius: 8px;
    display: block;
    margin: 8px 0;
  }

  :deep(a) {
    color: #3b82f6;
    text-decoration: underline;
  }

  :deep(code) {
    background: rgba(0, 0, 0, 0.06);
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 0.9em;
  }

  :deep(pre) {
    background: rgba(0, 0, 0, 0.06);
    padding: 10px;
    border-radius: 8px;
    overflow-x: auto;
    font-size: 0.85em;
  }

  :deep(ul),
  :deep(ol) {
    padding-left: 22px;
    margin: 0 0 10px;
  }

  :deep(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.15);
    padding-left: 10px;
    margin: 0 0 10px;
    opacity: 0.8;
  }
}

.ann-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px 18px;

  button {
    flex: 1;
    padding: 10px 14px;
    border-radius: 10px;
    border: none;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-secondary {
    background: transparent;
    color: inherit;
    border: 1px solid rgba(0, 0, 0, 0.15);

    &:hover {
      background: rgba(0, 0, 0, 0.04);
    }
  }

  .btn-primary {
    background: #3b82f6;
    color: #fff;

    &:hover {
      opacity: 0.92;
    }

    .level-important & {
      background: #f59e0b;
    }

    .level-critical & {
      background: #ef4444;
    }
  }
}
</style>
