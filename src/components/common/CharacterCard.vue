<script setup lang="ts">
import { computed, ref } from "vue";

// Props 定義
interface CharacterCardProps {
  id: string;
  name: string;
  nickname?: string;
  avatar: string;
  creator?: string;
  tags?: string[];
  lorebookCount?: number;
  isSelected?: boolean;
  showAvatar?: boolean;
}

const props = withDefaults(defineProps<CharacterCardProps>(), {
  nickname: "",
  creator: "",
  tags: () => [],
  lorebookCount: 0,
  isSelected: false,
  showAvatar: true,
});

// Emits
const emit = defineEmits<{
  (e: "click", id: string): void;
  (e: "chat", id: string): void;
  (e: "multiChar", id: string): void;
  (e: "delete", id: string): void;
  (e: "longpress", id: string): void;
}>();

// 圖片載入錯誤標記
const imageError = ref(false);

// 顯示名稱（優先暱稱）
const displayName = computed(() => props.nickname || props.name);

// 實際顯示的頭像（如果載入失敗則使用預設）
const displayAvatar = computed(() => {
  if (imageError.value || !props.avatar) {
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${props.id}`;
  }
  return props.avatar;
});

// 副標題
const subtitle = computed(() => {
  const parts: string[] = [];
  if (props.nickname && props.name) {
    parts.push(props.name);
  }
  if (props.creator) {
    parts.push(props.creator);
  }
  return parts.join(" · ");
});

// 長按處理
let longPressTimer: number | null = null;

function onTouchStart() {
  longPressTimer = window.setTimeout(() => {
    emit("longpress", props.id);
    longPressTimer = null;
  }, 500);
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleClick() {
  emit("click", props.id);
}

function handleChat(e: Event) {
  e.stopPropagation();
  emit("chat", props.id);
}

function handleMultiChar(e: Event) {
  e.stopPropagation();
  emit("multiChar", props.id);
}

function handleDelete(e: Event) {
  e.stopPropagation();
  emit("delete", props.id);
}

// 圖片載入錯誤處理
function handleImageError() {
  imageError.value = true;
}

// 右鍵選單（電腦端）
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit("longpress", props.id);
}
</script>

<template>
  <div
    class="character-card soft-card"
    :class="{ selected: isSelected }"
    @click="handleClick"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- 頭像區域 -->
    <div v-if="showAvatar" class="card-avatar">
      <img
        :src="displayAvatar"
        :alt="displayName"
        loading="lazy"
        @error="handleImageError"
      />

      <!-- 世界書數量標記 -->
      <div v-if="lorebookCount > 0" class="lorebook-badge">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
          />
        </svg>
        <span>{{ lorebookCount }}</span>
      </div>
    </div>

    <!-- 資訊區域 -->
    <div class="card-content">
      <div class="card-title">{{ displayName }}</div>
      <div v-if="subtitle" class="card-subtitle">{{ subtitle }}</div>

      <!-- 標籤 -->
      <div v-if="tags.length > 0" class="card-tags">
        <span
          v-for="(tag, index) in tags.slice(0, 3)"
          :key="index"
          class="soft-tag"
          :class="{ secondary: index === 1, success: index === 2 }"
        >
          {{ tag }}
        </span>
        <span v-if="tags.length > 3" class="soft-tag more"
          >+{{ tags.length - 3 }}</span
        >
      </div>
    </div>

    <!-- 操作按鈕 -->
    <div class="card-actions">
      <button class="action-btn chat" title="開始聊天" @click="handleChat">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"
          />
        </svg>
      </button>
      <button
        class="action-btn multi-char"
        title="多人卡模式"
        @click="handleMultiChar"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
          />
        </svg>
      </button>
      <button class="action-btn delete" title="刪除" @click="handleDelete">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.character-card {
  display: flex;
  flex-direction: column;
  // 不設置 height: 100%，讓卡片由內容決定高度

  &.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }
}

.card-avatar {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 4;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  background: var(--color-background);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--transition-normal);
  }

  .character-card:hover & img {
    transform: scale(1.05);
  }
}

.lorebook-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);

  svg {
    width: 14px;
    height: 14px;
  }
}

.card-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto; // 推到底部

  .soft-tag {
    font-size: 11px;
    padding: 2px 8px;

    &.more {
      background: var(--color-background);
      color: var(--color-text-muted);
    }
  }
}

.card-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
  flex-shrink: 0; // 防止按鈕被壓縮
}

.action-btn {
  flex: 1;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  background: var(--color-background);
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &:active {
    transform: scale(0.95);
  }

  &.chat:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &.multi-char:hover {
    background: rgba(137, 207, 240, 0.15);
    color: #89cff0;
  }

  &.delete:hover {
    background: rgba(255, 123, 123, 0.15);
    color: var(--color-error);
  }
}
</style>
