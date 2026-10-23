<script setup lang="ts">
// 聊天裡的噗文分享卡片
import { MessageSquare } from "lucide-vue-next";
import { computed } from "vue";
import type { PlurkShareSnapshot } from "@/types/chat";

interface Props {
  share: PlurkShareSnapshot;
  /** 是否為接收方（AI 角色側） */
  isReceiver?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  isReceiver: false,
});

const emit = defineEmits<{
  (e: "open"): void;
}>();

// 範圍小標；all 不顯示
const audienceLabel = computed(() => {
  switch (props.share.audience) {
    case "square":
      return "廣場";
    case "anon":
      return "偷偷說";
    case "private":
      return "私噗";
    case "friends":
      return "好友限定";
    default:
      return "";
  }
});

const isAnon = computed(() => props.share.authorKind === "anon");

// 回應卡片的作者（有 comment 就是回應者）
const isComment = computed(() => !!props.share.comment);

const avatarUrl = computed(() => {
  if (isAnon.value) return "";
  return isComment.value ? props.share.comment?.avatar ?? "" : props.share.authorAvatar ?? "";
});

const displayName = computed(() => {
  if (isComment.value) return props.share.comment?.name ?? "";
  return props.share.authorName;
});

// 沒有頭像時的圓形文字：偷偷說顯示「?」，其餘取名字第一個字
const avatarFallback = computed(() => {
  if (isAnon.value) return "?";
  const name = displayName.value.trim();
  return name ? name.slice(0, 1) : "?";
});

const qualifier = computed(() => {
  if (isComment.value) return props.share.comment?.qualifier ?? "";
  return props.share.qualifier ?? "";
});

// 回應卡片頂部：原噗文字前 30 字
const originPreview = computed(() => {
  const text = props.share.text.trim();
  if (!text) return props.share.imageCount > 0 ? "[圖片]" : "";
  return text.length > 30 ? `${text.slice(0, 30)}…` : text;
});

const bodyText = computed(() => {
  if (isComment.value) return props.share.comment?.text ?? "";
  return props.share.text;
});
</script>

<template>
  <button
    type="button"
    class="plurk-share-card"
    :class="{ receiver: isReceiver }"
    @click="emit('open')"
  >
    <!-- 單則回應 -->
    <template v-if="share.comment">
      <div class="plurk-share-context">
        回應 {{ share.authorName }} 的噗：{{ originPreview }}
      </div>
      <div class="plurk-share-author">
        <span class="plurk-avatar">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" loading="lazy" />
          <span v-else class="plurk-avatar-fallback">{{ avatarFallback }}</span>
        </span>
        <span class="plurk-name">{{ displayName }}</span>
        <span v-if="qualifier" class="plurk-qualifier">{{ qualifier }}</span>
      </div>
      <div v-if="bodyText" class="plurk-share-text">{{ bodyText }}</div>
    </template>

    <!-- 整則噗 -->
    <template v-else>
      <div class="plurk-share-top">
        <span class="plurk-brand">噗浪</span>
        <span v-if="audienceLabel" class="plurk-audience">{{ audienceLabel }}</span>
      </div>
      <div class="plurk-share-author">
        <span class="plurk-avatar">
          <img v-if="avatarUrl" :src="avatarUrl" alt="" loading="lazy" />
          <span v-else class="plurk-avatar-fallback">{{ avatarFallback }}</span>
        </span>
        <span class="plurk-name">{{ displayName }}</span>
        <span v-if="qualifier" class="plurk-qualifier">{{ qualifier }}</span>
      </div>
      <div class="plurk-share-body">
        <div v-if="bodyText" class="plurk-share-text">{{ bodyText }}</div>
        <img
          v-if="share.imageUrl"
          :src="share.imageUrl"
          alt=""
          loading="lazy"
          class="plurk-share-thumb"
        />
      </div>
      <div v-if="!share.imageUrl && share.imageCount > 0" class="plurk-share-photos">
        📷 {{ share.imageCount }} 張圖
      </div>
      <div class="plurk-share-footer">
        <MessageSquare :size="12" />
        <span>{{ share.responseCount }} 則回應</span>
      </div>
    </template>
  </button>
</template>

<style lang="scss" scoped>
.plurk-share-card {
  display: block;
  width: 250px;
  max-width: 100%;
  min-width: 0;
  padding: 8px 10px;
  text-align: left;
  font: inherit;
  background: #f8f8f8;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  color: var(--color-text, #1a1a1a);
  cursor: pointer;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;

  &.receiver {
    background: #f0f7ff;
    border-color: rgba(0, 100, 255, 0.08);
  }
}

body.is-night-mode .plurk-share-card {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.1);
  color: var(--color-text, #e8e8ef);

  &.receiver {
    background: rgba(80, 130, 255, 0.14);
    border-color: rgba(120, 160, 255, 0.2);
  }
}

.plurk-share-top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.plurk-brand {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--color-text-muted, #999);
}

.plurk-audience {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-muted, #999);
}

body.is-night-mode .plurk-share-card .plurk-audience {
  background: rgba(255, 255, 255, 0.08);
}

.plurk-share-context {
  font-size: 10px;
  line-height: 1.4;
  color: var(--color-text-muted, #999);
  margin-bottom: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plurk-share-author {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.plurk-avatar {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  background: #b8b8c2;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.plurk-avatar-fallback {
  font-size: 12px;
  line-height: 1;
  color: #fff;
}

.plurk-name {
  font-size: 12px;
  font-weight: 600;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plurk-qualifier {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--color-text-secondary, #666);
}

body.is-night-mode .plurk-share-card .plurk-qualifier {
  background: rgba(255, 255, 255, 0.08);
}

.plurk-share-body {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 6px;
}

.plurk-share-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary, #555);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

body.is-night-mode .plurk-share-card .plurk-share-text {
  color: var(--color-text-secondary, #b9b9c8);
}

.plurk-share-thumb {
  flex-shrink: 0;
  width: 64px;
  height: 64px;
  border-radius: 8px;
  object-fit: cover;
  display: block;
}

.plurk-share-photos {
  margin-top: 4px;
  font-size: 10px;
  color: var(--color-text-muted, #999);
}

.plurk-share-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 10px;
  color: var(--color-text-muted, #999);
}
</style>
