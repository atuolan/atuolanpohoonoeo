<script setup lang="ts">
/**
 * 廣場分頁：頂欄（搜尋）＋分頁列＋發語詞篩選＋廣場噗卡片＋空狀態
 * 浮動發噗鈕與底部分頁列由外殼負責，這顆只回報事件
 */
import {
  ArrowUp,
  Compass,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Search,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import type { SquareCardData } from "@/components/plurk/types";
import type { SquareTab } from "@/utils/plurkSquare";

const props = withDefaults(
  defineProps<{
    cards: SquareCardData[];
    tab: SquareTab;
    tabs: Array<{ id: SquareTab; label: string }>;
    /** 目前發語詞篩選，"" = 全部 */
    qualifier: string;
    filters: Array<{ qualifier: string; label: string }>;
    query: string;
    /** 正在生成路人噗 */
    busy: boolean;
  }>(),
  {
    cards: () => [],
    tabs: () => [],
    qualifier: "",
    filters: () => [],
    query: "",
    busy: false,
  },
);

const emit = defineEmits<{
  "update:tab": [tab: SquareTab];
  "update:qualifier": [qualifier: string];
  "update:query": [query: string];
  open: [id: string];
  fill: [];
}>();

const scrollEl = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const searchMode = ref(false);
const scrolledDown = ref(false);

const queryModel = computed<string>({
  get: () => props.query,
  set: (value) => emit("update:query", value),
});

const hasQuery = computed(() => props.query.trim().length > 0);
const hasCards = computed(() => props.cards.length > 0);
const showBackTop = computed(() => scrolledDown.value);

function openSearch() {
  searchMode.value = true;
}

function cancelSearch() {
  queryModel.value = "";
  searchMode.value = false;
}

function onScroll() {
  const top = scrollEl.value?.scrollTop ?? 0;
  scrolledDown.value = top > 300;
}

function scrollToTop() {
  scrollEl.value?.scrollTo({ top: 0, behavior: "smooth" });
}

watch(searchMode, async (on) => {
  if (!on) return;
  await nextTick();
  searchInput.value?.focus();
});

defineExpose({ scrollToTop });
</script>

<template>
  <div class="square-tab">
    <!-- 頂欄 -->
    <header class="square-topbar">
      <div class="topbar-row">
        <template v-if="!searchMode">
          <h1 class="topbar-title">
            <Compass :size="24" :stroke-width="2.2" class="topbar-compass" aria-hidden="true" />廣場
          </h1>
          <span class="topbar-spacer"></span>
          <button type="button" class="icon-btn" aria-label="搜尋噗文" @click="openSearch">
            <Search :size="21" :stroke-width="1.9" aria-hidden="true" />
          </button>
        </template>

        <template v-else>
          <div class="search-field">
            <Search :size="18" :stroke-width="1.9" class="search-icon" aria-hidden="true" />
            <input
              ref="searchInput"
              v-model="queryModel"
              type="search"
              class="search-input"
              placeholder="搜尋噗文或作者"
              aria-label="搜尋噗文"
              autocomplete="off"
            />
          </div>
          <button type="button" class="cancel-btn" @click="cancelSearch">取消</button>
        </template>
      </div>
    </header>

    <!-- 整頁可捲動內容 -->
    <div ref="scrollEl" class="square-scroll" @scroll.passive="onScroll">
      <!-- 分頁列 -->
      <div v-if="!hasQuery" class="square-tabs" role="tablist" aria-label="廣場分頁">
        <button
          v-for="item in props.tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="square-tab-btn"
          :class="{ 'square-tab-btn--on': item.id === props.tab }"
          :aria-selected="item.id === props.tab"
          @click="emit('update:tab', item.id)"
        >
          {{ item.label }}
        </button>
      </div>

      <!-- 篩選列 -->
      <div
        v-if="!hasQuery"
        class="square-filters"
        role="group"
        aria-label="用動詞篩選"
      >
        <button
          v-for="item in props.filters"
          :key="item.qualifier || 'all'"
          type="button"
          class="filter-pill"
          :class="{ 'filter-pill--on': item.qualifier === props.qualifier }"
          :aria-pressed="item.qualifier === props.qualifier"
          @click="emit('update:qualifier', item.qualifier)"
        >
          <QualifierChip
            v-if="item.qualifier"
            :qualifier="item.qualifier"
            size="sm"
            class="filter-chip"
          />
          <span class="filter-label">{{ item.label }}</span>
        </button>
      </div>

      <div class="square-body">
        <!-- 偷偷說提示 -->
        <p v-if="props.tab === 'anon' && !hasQuery" class="anon-note">
          偷偷說不顯示名字。但角色也會來這裡說心裡話。
        </p>

        <!-- 卡片列表 -->
        <template v-if="hasCards">
          <template v-for="card in props.cards" :key="card.id">
            <!-- 被摺疊 -->
            <button
              v-if="card.foldedReason"
              :id="'square-' + card.id"
              type="button"
              class="folded-card"
              @click="emit('open', card.id)"
            >
              <EyeOff :size="14" :stroke-width="1.9" aria-hidden="true" />
              <span class="folded-text"
                >這則噗已被廣場管理員摺疊（{{ card.foldedReason }}）</span
              >
            </button>

            <!-- 一般卡片 -->
            <button
              v-else
              :id="'square-' + card.id"
              type="button"
              class="square-card"
              @click="emit('open', card.id)"
            >
              <span class="card-head">
                <PlurkAvatar
                  :src="card.authorAvatar"
                  :name="card.authorName"
                  :color="card.avatarColor"
                  :size="40"
                />
                <span class="card-author">
                  <span class="author-name-row">
                    <span class="author-name">{{ card.authorName }}</span>
                    <span v-if="card.isCharacter" class="char-badge">角色</span>
                  </span>
                  <span class="author-meta">{{ card.metaText }}</span>
                </span>
                <span
                  class="reply-bubble"
                  :class="{ 'reply-bubble--fresh': card.fresh }"
                  :aria-label="`${card.replyCount} 則回應`"
                >
                  <MessageSquare :size="13" :stroke-width="2" aria-hidden="true" />
                  <span class="reply-count">{{ card.replyCount }}</span>
                </span>
              </span>

              <span class="card-text">
                <QualifierChip v-if="card.qualifier" :qualifier="card.qualifier" size="sm" />{{
                  card.text
                }}
              </span>

              <span v-if="card.latestReply" class="latest-reply">
                <b>{{ card.latestReply.name }}</b>　{{ card.latestReply.text }}
              </span>

              <span v-if="card.peekHint" class="peek-hint">
                <Eye :size="13" :stroke-width="2.2" aria-hidden="true" />這個語氣，好像在哪見過
              </span>
            </button>
          </template>

          <!-- 再看更多 -->
          <button
            v-if="!hasQuery"
            type="button"
            class="more-btn"
            :disabled="props.busy"
            @click="emit('fill')"
          >
            <template v-if="props.busy">
              <Loader2 :size="16" class="spin" aria-hidden="true" />路人正在趕來…
            </template>
            <template v-else>再看看廣場有什麼新鮮事</template>
          </button>
        </template>

        <!-- 空狀態 -->
        <div v-else class="square-empty">
          <template v-if="hasQuery">
            <p class="empty-title">沒有找到相關的噗</p>
          </template>
          <template v-else>
            <Compass :size="36" :stroke-width="1.6" class="empty-icon" aria-hidden="true" />
            <p class="empty-title">廣場還很安靜</p>
            <button
              type="button"
              class="empty-cta"
              :disabled="props.busy"
              @click="emit('fill')"
            >
              <template v-if="props.busy">
                <Loader2 :size="18" class="spin" aria-hidden="true" />路人正在趕來…
              </template>
              <template v-else>讓廣場熱鬧起來</template>
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 回到頂部 -->
    <button
      v-if="showBackTop"
      type="button"
      class="back-to-top"
      aria-label="回到頂部"
      @click="scrollToTop"
    >
      <ArrowUp :size="20" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.square-tab {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
  background: var(--color-background);
  color: var(--color-text);
}

/* ---------- 頂欄 ---------- */
.square-topbar {
  flex: 0 0 auto;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background);
}

.topbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 8px 0 16px;
}

.icon-btn {
  position: relative;
  flex: 0 0 auto;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.topbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.topbar-compass {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.topbar-spacer {
  flex: 1;
  min-width: 0;
}

/* ---------- 搜尋 ---------- */
.search-field {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 12px;
  border-radius: 18px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.search-icon {
  flex: 0 0 auto;
}

.search-input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &::-webkit-search-cancel-button {
    display: none;
  }
}

.cancel-btn {
  flex: 0 0 auto;
  height: $plurk-touch;
  padding: 0 10px;
  border: none;
  background: none;
  color: var(--color-primary);
  font-family: inherit;
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}

/* ---------- 捲動區 ---------- */
.square-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

/* ---------- 分頁列 ---------- */
.square-tabs {
  display: flex;
  gap: 20px;
  padding: 6px 16px 0;
  border-bottom: 1px solid var(--color-border);
}

.square-tab-btn {
  height: 42px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 15px;
  font-weight: 400;
  cursor: pointer;
  box-shadow: inset 0 -3px 0 transparent;
  -webkit-tap-highlight-color: transparent;
}

.square-tab-btn--on {
  color: var(--color-text);
  font-weight: 700;
  box-shadow: inset 0 -3px 0 var(--color-primary);
}

/* ---------- 篩選 ---------- */
.square-filters {
  display: flex;
  gap: 6px;
  padding: 12px 16px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filter-pill {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 17px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
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

.filter-chip {
  flex: 0 0 auto;
  margin-right: 0;
}

.filter-label {
  min-width: 0;
}

/* ---------- 內容 ---------- */
.square-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px calc(172px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
}

.anon-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

/* ---------- 卡片 ---------- */
.square-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: $plurk-radius-card;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.card-author {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.author-name-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.author-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 700;
}

.char-badge {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 500;
  line-height: 16px;
}

.author-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.reply-bubble {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 34px;
  height: 26px;
  padding: 0 8px;
  border-radius: 13px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-size: 13px;
}

.reply-bubble--fresh {
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
}

.reply-count {
  font-size: 13px;
  line-height: 1;
}

.card-text {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 15px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

.latest-reply {
  display: block;
  padding: 8px 10px;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  b {
    font-weight: 700;
  }
}

.peek-hint {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 5px;
  width: fit-content;
  max-width: 100%;
  padding: 4px 8px;
  border-radius: 8px;
  background: #fff5e0;
  color: #7a4e00;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.5;
}

/* ---------- 摺疊卡 ---------- */
.folded-card {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  border-radius: $plurk-radius-soft;
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.folded-text {
  min-width: 0;
}

/* ---------- 再看更多 ---------- */
.more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    cursor: default;
    opacity: 0.7;
  }
}

/* ---------- 空狀態 ---------- */
.square-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 56px 0 32px;
  color: var(--color-text-secondary);
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

.empty-cta {
  display: flex;
  align-items: center;
  gap: 8px;
  height: $plurk-touch;
  padding: 0 20px;
  border: none;
  border-radius: 22px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.8;
  }
}

/* ---------- 轉圈 ---------- */
.spin {
  animation: square-spin 0.9s linear infinite;
}

@keyframes square-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- 回到頂部 ---------- */
.back-to-top {
  position: absolute;
  right: 16px;
  bottom: 164px;
  z-index: 5;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: $plurk-shadow-float;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

body.is-night-mode .peek-hint {
  background: rgba(240, 196, 106, 0.08);
  color: #f0c46a;
}

body.is-night-mode .back-to-top {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
