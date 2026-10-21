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
  description?: string;
  layout?: "grid" | "list";
  when?: string;
}

const props = withDefaults(defineProps<CharacterCardProps>(), {
  nickname: "",
  creator: "",
  tags: () => [],
  lorebookCount: 0,
  isSelected: false,
  showAvatar: true,
  description: "",
  layout: "grid",
  when: "",
});

// Emits
const emit = defineEmits<{
  (e: "click", id: string): void;
  (e: "chat", id: string): void;
  (e: "multiChar", id: string): void;
  (e: "more", id: string): void;
  (e: "longpress", id: string): void;
}>();

// 圖片載入錯誤標記
const imageError = ref(false);

// 顯示名稱（優先暱稱）
const displayName = computed(() => props.nickname || props.name);

// 封面／頭像顯示的第一個字
const initial = computed(() => displayName.value.charAt(0));

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
  // 暱稱跟本名一樣（或沒設暱稱）時標題已經是本名，不用再寫一次
  if (props.nickname && props.name && props.nickname !== props.name) {
    parts.push(props.name);
  }
  if (props.creator) {
    parts.push(props.creator);
  }
  return parts.join(" · ");
});

// 卡片副標：優先用 subtitle，其次取前三個標籤
const metaLine = computed(() => {
  if (subtitle.value) return subtitle.value;
  if (props.tags.length > 0) {
    const base = props.tags.slice(0, 3).join(" · ");
    return props.tags.length > 3 ? `${base} +${props.tags.length - 3}` : base;
  }
  return "尚未加標籤";
});

// 長按處理
let longPressTimer: number | null = null;

function onTouchStart() {
  longPressTimer = window.setTimeout(() => {
    emit("more", props.id);
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

function handleMore(e: Event) {
  e.stopPropagation();
  emit("more", props.id);
}

// 圖片載入錯誤處理
function handleImageError() {
  imageError.value = true;
}

// 右鍵選單（電腦端）
function onContextMenu(e: MouseEvent) {
  e.preventDefault();
  emit("more", props.id);
}
</script>

<template>
  <div
    class="character-card"
    :class="[
      layout === 'list' ? 'layout-list' : 'layout-grid',
      { selected: isSelected },
    ]"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
    @touchcancel="onTouchEnd"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- ===== 格狀 ===== -->
    <template v-if="layout === 'grid'">
      <div class="card-cover" @click="handleClick">
        <img
          v-if="showAvatar"
          :src="displayAvatar"
          :alt="displayName"
          loading="lazy"
          @error="handleImageError"
        />
        <span v-else class="cover-initial">{{ initial }}</span>

        <span class="cover-gradient" aria-hidden="true"></span>

        <span v-if="when" class="cover-when">{{ when }}</span>

        <span v-if="lorebookCount > 0" class="lorebook-badge">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path>
            <path d="M5 17a3 3 0 0 1 3-3h11"></path>
          </svg>
          世界書
        </span>
      </div>

      <div class="card-name-row" @click="handleClick">
        <div class="name-text">
          <span class="card-name">{{ displayName }}</span>
          <span class="card-meta">{{ metaLine }}</span>
        </div>
        <button
          type="button"
          class="more-btn"
          aria-label="更多操作"
          @click="handleMore"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.8"></circle>
            <circle cx="12" cy="12" r="1.8"></circle>
            <circle cx="19" cy="12" r="1.8"></circle>
          </svg>
        </button>
      </div>

      <div class="card-actions">
        <button type="button" class="action-btn chat-btn" @click="handleChat">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M4 5h16v11H9l-5 4z"></path>
          </svg>
          聊天
        </button>
        <button type="button" class="action-btn multi-btn" @click="handleMultiChar">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="8" r="3"></circle>
            <path d="M3 19a6 6 0 0 1 12 0"></path>
            <path d="M16 5a3 3 0 0 1 0 6M18 19a6 6 0 0 0-2-4.5"></path>
          </svg>
          群聊
        </button>
      </div>
    </template>

    <!-- ===== 清單 ===== -->
    <template v-else>
      <div class="list-main" @click="handleClick">
        <div v-if="showAvatar" class="list-avatar">
          <img
            :src="displayAvatar"
            :alt="displayName"
            loading="lazy"
            @error="handleImageError"
          />
        </div>

        <div class="list-info">
          <span class="card-name">{{ displayName }}</span>
          <span class="card-meta">{{ metaLine }}</span>
          <span v-if="when || lorebookCount > 0" class="list-facts">
            <span v-if="when">{{ when }}</span>
            <span v-if="lorebookCount > 0">{{ when ? "· " : "" }}綁定世界書</span>
          </span>
          <span v-if="description" class="list-desc">{{ description }}</span>
        </div>
      </div>

      <button type="button" class="list-chat-btn" aria-label="聊天" @click="handleChat">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5h16v11H9l-5 4z"></path>
        </svg>
      </button>

      <button
        type="button"
        class="more-btn more-btn--vertical"
        aria-label="更多操作"
        @click="handleMore"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.8"></circle>
          <circle cx="12" cy="12" r="1.8"></circle>
          <circle cx="12" cy="19" r="1.8"></circle>
        </svg>
      </button>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.character-card {
  box-sizing: border-box;
  position: relative;

  &.selected {
    box-shadow: 0 0 0 2px var(--color-primary);
  }

  // ===== 格狀 =====
  &.layout-grid {
    display: flex;
    flex-direction: column;
    border-radius: 18px;
    background: var(--color-surface);
    overflow: hidden;
  }

  // ===== 清單 =====
  &.layout-list {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 6px 8px 12px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }
}

// ===== 格狀：封面 =====
.card-cover {
  position: relative;
  height: 196px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--color-primary-light);
  cursor: pointer;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.cover-initial {
  font-size: 72px;
  font-weight: 900;
  color: var(--color-primary);
  line-height: 1;
  opacity: 0.92;
}

.cover-gradient {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 60px;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0), rgba(0, 0, 0, 0.28));
  pointer-events: none;
}

.cover-when {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.9);
  pointer-events: none;
}

.lorebook-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  color: #19171c;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 4px;
  pointer-events: none;

  svg {
    width: 12px;
    height: 12px;
  }
}

// ===== 名稱列 =====
.card-name-row {
  display: flex;
  align-items: flex-start;
  gap: 2px;
  padding: 10px 6px 4px 12px;
  cursor: pointer;
}

.name-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
}

.card-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.more-btn {
  flex: none;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 18px;
    height: 18px;
  }

  &:active {
    transform: scale(0.97);
  }

  &.more-btn--vertical {
    width: 36px;
    height: 44px;
    border-radius: 0;
  }
}

// ===== 格狀：按鈕 =====
.card-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding: 6px 10px 10px;
}

.action-btn {
  height: 40px;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;

  svg {
    width: 15px;
    height: 15px;
  }

  &:active {
    transform: scale(0.97);
  }

  &.chat-btn {
    background: var(--color-text);
    color: var(--color-surface);
  }

  &.multi-btn {
    background: var(--color-background);
    color: var(--color-text);
  }
}

// ===== 清單 =====
.list-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.list-avatar {
  flex: none;
  width: 52px;
  height: 64px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-primary-light);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.list-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.list-facts {
  font-size: 11px;
  color: var(--color-text-secondary);
  display: flex;
  gap: 8px;
}

.list-desc {
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.list-chat-btn {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: var(--color-text);
  color: var(--color-surface);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 18px;
    height: 18px;
  }

  &:active {
    transform: scale(0.97);
  }
}
</style>
