<script setup lang="ts">
/**
 * 河道分頁：頂欄（搜尋／AI 導演／更多）＋時間軸＋篩選＋回應中提示＋噗文卡片
 * 浮動發噗鈕與底部分頁列由外殼負責，這顆只回報事件
 */
import {
  ArrowUp,
  ChevronLeft,
  MoreHorizontal,
  PenLine,
  Search,
  Sparkles,
  Waves,
} from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import PlurkCard from "@/components/plurk/PlurkCard.vue";
import RiverTimeline from "@/components/plurk/RiverTimeline.vue";
import type { PlurkCardData, RiverBubbleData } from "@/components/plurk/types";
import type { RiverFilter, TimelineLayout } from "@/utils/plurkRiver";

const props = withDefaults(
  defineProps<{
    cards: PlurkCardData[];
    layout: TimelineLayout;
    bubbles: Record<string, RiverBubbleData>;
    filter: RiverFilter;
    filters: Array<{ id: RiverFilter; label: string }>;
    query: string;
    /** 「X 正在回應你的噗」 */
    typing: Array<{ postId: string; name: string; avatar?: string }>;
    directorActive: boolean;
    highlightPostId: string | null;
  }>(),
  {
    bubbles: () => ({}),
    query: "",
    typing: () => [],
    directorActive: false,
    highlightPostId: null,
  },
);

const emit = defineEmits<{
  back: [];
  "update:filter": [filter: RiverFilter];
  "update:query": [query: string];
  openDirector: [];
  openMore: [];
  openPost: [id: string];
  openProfile: [id: string];
  like: [id: string];
  repost: [id: string];
  share: [id: string];
  bookmark: [id: string];
  more: [id: string];
  openImage: [id: string, index: number];
  openTheater: [id: string];
  compose: [];
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
const hasBubbles = computed(() => Object.keys(props.bubbles).length > 0);
const showTimeline = computed(() => !hasQuery.value && hasBubbles.value);
const showFilters = computed(() => !hasQuery.value);
const showBackTop = computed(() => scrolledDown.value);

/** 把 highlightPostId 併進卡片資料（PlurkCard 只吃 post） */
const viewCards = computed<PlurkCardData[]>(() =>
  props.cards.map((card) =>
    props.highlightPostId && card.id === props.highlightPostId
      ? { ...card, highlighted: true }
      : card,
  ),
);

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

function scrollToPost(id: string) {
  const el = scrollEl.value;
  if (!el) return;
  const target = Array.from(el.querySelectorAll<HTMLElement>('[id^="plurk-"]')).find(
    (node) => node.id === `plurk-${id}`,
  );
  target?.scrollIntoView({ behavior: "smooth", block: "center" });
}

watch(searchMode, async (on) => {
  if (!on) return;
  await nextTick();
  searchInput.value?.focus();
});

defineExpose({ scrollToTop, scrollToPost });
</script>

<template>
  <div class="river-tab">
    <!-- 頂欄 -->
    <header class="river-topbar">
      <div class="topbar-row">
        <template v-if="!searchMode">
          <button type="button" class="icon-btn" aria-label="返回" @click="emit('back')">
            <ChevronLeft :size="22" aria-hidden="true" />
          </button>
          <h1 class="topbar-title">
            <Waves :size="24" :stroke-width="2.4" class="topbar-wave" aria-hidden="true" />河道
          </h1>
          <span class="topbar-spacer"></span>
          <button type="button" class="icon-btn" aria-label="搜尋噗文" @click="openSearch">
            <Search :size="21" :stroke-width="1.9" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="icon-btn director-btn"
            aria-label="AI 導演"
            @click="emit('openDirector')"
          >
            <Sparkles :size="22" :stroke-width="1.9" aria-hidden="true" />
            <span v-if="props.directorActive" class="director-dot" aria-hidden="true"></span>
          </button>
          <button type="button" class="icon-btn" aria-label="更多" @click="emit('openMore')">
            <MoreHorizontal :size="21" :stroke-width="1.9" aria-hidden="true" />
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
    <div ref="scrollEl" class="river-scroll" @scroll.passive="onScroll">
      <RiverTimeline
        v-if="showTimeline"
        :layout="props.layout"
        :bubbles="props.bubbles"
        @open="emit('openPost', $event)"
      />

      <!-- 篩選列 -->
      <div v-if="showFilters" class="river-filters" role="group" aria-label="篩選">
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

      <div class="river-body">
        <!-- 正在回應你的噗 -->
        <button
          v-for="person in props.typing"
          :key="`typing-${person.postId}`"
          type="button"
          class="typing-pill"
          @click="emit('openPost', person.postId)"
        >
          <PlurkAvatar :src="person.avatar" :name="person.name" :size="24" />
          <span class="typing-text">{{ person.name }} 正在回應你的噗</span>
          <span class="typing-dots" aria-hidden="true">
            <i></i><i></i><i></i>
          </span>
        </button>

        <!-- 卡片列表 -->
        <template v-if="viewCards.length">
          <PlurkCard
            v-for="card in viewCards"
            :id="'plurk-' + card.id"
            :key="card.id"
            :post="card"
            @open="emit('openPost', card.id)"
            @open-profile="emit('openProfile', card.id)"
            @like="emit('like', card.id)"
            @repost="emit('repost', card.id)"
            @share="emit('share', card.id)"
            @bookmark="emit('bookmark', card.id)"
            @more="emit('more', card.id)"
            @open-image="emit('openImage', card.id, $event)"
            @open-theater="emit('openTheater', card.id)"
          />
        </template>

        <!-- 空狀態 -->
        <div v-else class="river-empty">
          <template v-if="hasQuery">
            <Search :size="36" :stroke-width="1.5" class="empty-icon" aria-hidden="true" />
            <p class="empty-title">沒有找到相關的噗</p>
          </template>
          <template v-else>
            <Waves :size="36" :stroke-width="1.6" class="empty-icon" aria-hidden="true" />
            <p class="empty-title">河道還很安靜</p>
            <button type="button" class="empty-cta" @click="emit('compose')">
              <PenLine :size="18" aria-hidden="true" />發第一則噗
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

.river-tab {
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
.river-topbar {
  flex: 0 0 auto;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background);
}

.topbar-row {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 44px;
  padding: 0 8px 0 4px;
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

.topbar-wave {
  flex: 0 0 auto;
  color: var(--color-primary);
}

.topbar-spacer {
  flex: 1;
  min-width: 0;
}

.director-dot {
  position: absolute;
  top: 9px;
  right: 9px;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--color-success);
  box-shadow: 0 0 0 2px var(--color-background);
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
.river-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
}

/* ---------- 篩選 ---------- */
.river-filters {
  display: flex;
  gap: 8px;
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
  height: 34px;
  padding: 0 13px;
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

/* ---------- 內容 ---------- */
.river-body {
  display: flex;
  flex-direction: column;
  gap: $plurk-gap;
  padding: 0 16px calc(172px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
}

.typing-pill {
  position: relative;
  align-self: flex-start;
  max-width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px 0 6px;
  border: none;
  border-radius: 18px;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &::after {
    content: "";
    position: absolute;
    inset: -4px 0;
  }
}

.typing-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.typing-dots {
  flex: 0 0 auto;
  display: flex;
  gap: 3px;

  i {
    width: 5px;
    height: 5px;
    border-radius: 3px;
    background: var(--color-text-secondary);
    animation: river-dot 1.2s infinite;
  }

  i:nth-child(2) {
    animation-delay: 0.2s;
  }

  i:nth-child(3) {
    animation-delay: 0.4s;
  }
}

@keyframes river-dot {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}

/* ---------- 空狀態 ---------- */
.river-empty {
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

body.is-night-mode .back-to-top {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.4);
}

@media (prefers-reduced-motion: reduce) {
  .typing-dots i {
    animation: none;
  }
}
</style>
