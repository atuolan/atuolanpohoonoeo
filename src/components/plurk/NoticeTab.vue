<script setup lang="ts">
/** 通知分頁：標題列＋篩選膠囊＋回應通知清單 */
import { Bell } from "lucide-vue-next";
import { computed } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { NoticeRow } from "@/components/plurk/types";

const props = withDefaults(
  defineProps<{
    rows: NoticeRow[];
    filter: "all" | "reply";
    filters: Array<{ id: "all" | "reply"; label: string }>;
  }>(),
  {
    rows: () => [],
    filters: () => [],
  },
);

const emit = defineEmits<{
  "update:filter": [filter: "all" | "reply"];
  markAllRead: [];
  open: [postId: string, commentId: string];
}>();

const hasRows = computed(() => props.rows.length > 0);
</script>

<template>
  <div class="notice-tab">
    <div class="notice-scroll">
      <header class="notice-head">
        <div class="notice-title-row">
          <h1 class="notice-title">通知</h1>
          <button type="button" class="mark-read" @click="emit('markAllRead')">全部已讀</button>
        </div>

        <div v-if="props.filters.length" class="notice-filters" role="group" aria-label="通知分類">
          <button
            v-for="item in props.filters"
            :key="item.id"
            type="button"
            class="filter-pill"
            :class="{ 'filter-pill--on': item.id === props.filter }"
            :aria-pressed="item.id === props.filter"
            @click="emit('update:filter', item.id)"
          >
            {{ item.label }}
          </button>
        </div>
      </header>

      <div class="notice-body">
        <div v-if="hasRows" class="notice-list">
          <button
            v-for="row in props.rows"
            :key="`${row.postId}-${row.commentId}`"
            type="button"
            class="notice-row"
            @click="emit('open', row.postId, row.commentId)"
          >
            <PlurkAvatar
              class="row-avatar"
              :src="row.authorAvatar"
              :name="row.authorName"
              :size="36"
            />
            <span class="row-main">
              <span class="row-text">
                <b>{{ row.authorName }}</b> 回應了你的噗：「{{ row.text }}」
              </span>
              <span class="row-time">{{ row.timeText }}</span>
            </span>
            <span v-if="row.unread" class="row-dot" aria-label="未讀"></span>
          </button>
        </div>

        <div v-else class="notice-empty">
          <Bell :size="36" :stroke-width="1.5" class="empty-icon" aria-hidden="true" />
          <p class="empty-title">還沒有新的回應</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.notice-tab {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--color-background);
  color: var(--color-text);
}

.notice-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
}

/* ---------- 標題列 ---------- */
.notice-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 16px 0;
}

.notice-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
}

.notice-title {
  margin: 0;
  font-size: 26px;
  font-weight: 900;
  line-height: 1.2;
}

.mark-read {
  height: $plurk-touch;
  padding: 0 2px;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

/* ---------- 篩選 ---------- */
.notice-filters {
  display: flex;
  gap: 8px;
  padding-bottom: 12px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-pill {
  position: relative;
  flex: 0 0 auto;
  height: 34px;
  padding: 0 14px;
  border-radius: 17px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &::after {
    content: "";
    position: absolute;
    inset: -5px 0;
  }
}

.filter-pill--on {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-background);
}

/* ---------- 清單 ---------- */
.notice-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 16px 120px;
}

.notice-list {
  background: var(--color-surface);
  border-radius: 20px;
  padding: 0 14px;
}

.notice-row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 12px 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:last-child {
    border-bottom: none;
  }

  &:active {
    background: var(--color-surface-hover);
  }
}

.row-avatar {
  flex: 0 0 auto;
  margin-top: 1px;
}

.row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.row-text {
  font-size: 14px;
  line-height: 1.55;
  overflow-wrap: anywhere;

  b {
    font-weight: 700;
  }
}

.row-time {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.row-dot {
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-top: 6px;
  border-radius: 4px;
  background: var(--color-primary);
}

/* ---------- 空狀態 ---------- */
.notice-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 0 32px;
}

.empty-icon {
  color: var(--color-text-muted);
}

.empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
</style>
