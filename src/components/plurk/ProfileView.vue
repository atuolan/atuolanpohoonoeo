<script setup lang="ts">
/**
 * 角色個人頁：頂欄、封面、頭像與好友狀態、數字卡、「他和你」、印象、PEEK、分頁與清單
 * 只吃 props 與 emits，資料與儲存都交給外殼
 */
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  MessageCircle,
  Smartphone,
  Sparkles,
  UserCheck,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import type { ProfileData } from "@/components/plurk/types";

type ProfileTabKey = "posts" | "responses" | "private";

const props = withDefaults(
  defineProps<{
    profile: ProfileData;
    impressionsBusy: boolean;
  }>(),
  {
    impressionsBusy: false,
  },
);

const emit = defineEmits<{
  back: [];
  openChat: [];
  openPeek: [];
  openPost: [postId: string];
  summarize: [];
}>();

const activeTab = ref<ProfileTabKey>("posts");

/* ---------- 數字卡 ---------- */
const statItems = computed(() => {
  const stats = props.profile.stats ?? { posts: 0, responses: 0, friends: 0, karma: 0 };
  return [
    { key: "posts", label: "噗", value: Number(stats.posts ?? 0).toLocaleString("en-US") },
    { key: "responses", label: "回應", value: Number(stats.responses ?? 0).toLocaleString("en-US") },
    { key: "friends", label: "好友", value: Number(stats.friends ?? 0).toLocaleString("en-US") },
    { key: "karma", label: "卡馬", value: Number(stats.karma ?? 0).toFixed(1) },
  ];
});

/* ---------- 24 小時長條 ---------- */
const hourValues = computed<number[]>(() => {
  const raw = Array.isArray(props.profile.hours) ? props.profile.hours : [];
  return Array.from({ length: 24 }, (_, index) => {
    const value = Number(raw[index]);
    return Number.isFinite(value) && value > 0 ? value : 0;
  });
});

/** 連續 3 小時（可跨 24→0）加總最大的起點；全 0 時 null */
const peakStart = computed<number | null>(() => {
  const hours = hourValues.value;
  const total = hours.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  let bestStart = 0;
  let bestSum = -1;
  for (let start = 0; start < 24; start += 1) {
    const sum = hours[start] + hours[(start + 1) % 24] + hours[(start + 2) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }
  return bestSum > 0 ? bestStart : null;
});

const peakHours = computed<Set<number>>(() => {
  const start = peakStart.value;
  if (start === null) return new Set<number>();
  return new Set<number>([start, (start + 1) % 24, (start + 2) % 24]);
});

const bars = computed(() => {
  const hours = hourValues.value;
  const max = hours.reduce((best, value) => Math.max(best, value), 0);
  return hours.map((value, hour) => ({
    hour,
    height: max > 0 ? Math.max(2, Math.round((value / max) * 40)) : 2,
    peak: peakHours.value.has(hour),
  }));
});

const barsLabel = computed(() =>
  props.profile.peakText
    ? `他在一天中出現的時段，${props.profile.peakText}最多`
    : "他在一天中出現的時段",
);

/* ---------- 印象 ---------- */
const impressionList = computed<string[]>(() =>
  Array.isArray(props.profile.impressions) ? props.profile.impressions : [],
);
const showImpressions = computed(() => impressionList.value.length > 0);
const showSummarize = computed(() => props.profile.impressions === null);

/* ---------- 分頁 ---------- */
const tabs = computed<Array<{ id: ProfileTabKey; label: string }>>(() => [
  { id: "posts", label: "噗" },
  { id: "responses", label: "回應" },
  {
    id: "private",
    label: props.profile.privateCount > 0 ? `私噗 ${props.profile.privateCount}` : "私噗",
  },
]);

const rows = computed(() =>
  activeTab.value === "responses" ? (props.profile.responses ?? []) : (props.profile.posts ?? []),
);

const emptyText = computed(() =>
  activeTab.value === "responses" ? "還沒有回應" : "還沒有噗",
);
</script>

<template>
  <div class="profile-view">
    <header class="pv-topbar">
      <div class="pv-topbar-row">
        <button type="button" class="pv-back" aria-label="返回" @click="emit('back')">
          <ChevronLeft :size="22" :stroke-width="2" aria-hidden="true" />
        </button>
        <h1 class="pv-title">{{ props.profile.name }}的個人頁</h1>
        <span class="pv-topbar-spacer" aria-hidden="true"></span>
      </div>
    </header>

    <div class="pv-cover" :style="{ '--pv-cover': props.profile.coverColor }" aria-hidden="true">
      <svg class="pv-cover-waves" viewBox="0 0 390 110" preserveAspectRatio="none">
        <path d="M0 74q30-20 60 0t60 0 60 0 60 0 60 0 60 0 60 0" />
        <path d="M0 96q30-20 60 0t60 0 60 0 60 0 60 0 60 0 60 0" />
      </svg>
    </div>

    <div class="pv-body">
      <div class="pv-head-row">
        <span class="pv-avatar-ring">
          <PlurkAvatar
            :src="props.profile.avatar"
            :name="props.profile.name"
            :size="84"
            :color="props.profile.coverColor"
          />
        </span>

        <div class="pv-head-actions">
          <button type="button" class="pv-btn pv-btn--primary" @click="emit('openChat')">
            <MessageCircle :size="15" :stroke-width="2" aria-hidden="true" />
            私訊
          </button>
          <span
            class="pv-status"
            :class="{ 'pv-status--on': props.profile.isFriend }"
            :aria-label="props.profile.isFriend ? '已是好友' : '還不是好友'"
          >
            <UserCheck
              v-if="props.profile.isFriend"
              :size="15"
              :stroke-width="2"
              aria-hidden="true"
            />
            {{ props.profile.isFriend ? "已是好友" : "還不是好友" }}
          </span>
        </div>
      </div>

      <div class="pv-name-block">
        <h2 class="pv-name">{{ props.profile.name }}</h2>
        <span class="pv-meta">{{ props.profile.handle }} · {{ props.profile.joinedText }}</span>
      </div>

      <p v-if="props.profile.bio" class="pv-bio">{{ props.profile.bio }}</p>

      <div class="pv-stat-card">
        <div v-for="item in statItems" :key="item.key" class="pv-stat-cell">
          <span class="pv-stat-value">{{ item.value }}</span>
          <span class="pv-stat-label">{{ item.label }}</span>
        </div>
      </div>

      <section class="pv-together">
        <div class="pv-together-head">
          <span class="pv-together-title">他和你</span>
          <span class="pv-together-count">互動 {{ props.profile.interactions }} 次</span>
        </div>

        <div class="pv-bars" role="img" :aria-label="barsLabel">
          <span
            v-for="bar in bars"
            :key="bar.hour"
            class="pv-bar"
            :class="{ 'pv-bar--peak': bar.peak }"
            :style="{ height: `${bar.height}px` }"
          ></span>
        </div>
        <div class="pv-ticks" aria-hidden="true">
          <span>0</span>
          <span>6</span>
          <span>12</span>
          <span>18</span>
          <span>24</span>
        </div>

        <p v-if="props.profile.peakText" class="pv-peak">
          最常在 <b>{{ props.profile.peakText }}</b>
        </p>
        <p v-if="props.profile.avgReplyText" class="pv-avg">{{ props.profile.avgReplyText }}</p>

        <div v-if="showImpressions" class="pv-impressions">
          <span v-for="(tag, index) in impressionList" :key="tag + '-' + index" class="pv-tag">
            {{ tag }}
          </span>
        </div>

        <button
          v-else-if="showSummarize"
          type="button"
          class="pv-summarize"
          :disabled="props.impressionsBusy"
          @click="emit('summarize')"
        >
          <template v-if="props.impressionsBusy">
            <Loader2 :size="14" class="spin" aria-hidden="true" />
            整理中…
          </template>
          <template v-else>
            <Sparkles :size="14" :stroke-width="2" aria-hidden="true" />
            整理印象
          </template>
        </button>
      </section>

      <button v-if="props.profile.canPeek" type="button" class="pv-peek" @click="emit('openPeek')">
        <Smartphone :size="18" :stroke-width="2" aria-hidden="true" />
        <span class="pv-peek-label">偷看他的手機</span>
        <ChevronRight :size="16" :stroke-width="2" class="pv-peek-chevron" aria-hidden="true" />
      </button>

      <div class="pv-tabs" role="tablist" aria-label="內容分類">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          role="tab"
          class="pv-tab"
          :class="{ 'pv-tab--on': item.id === activeTab }"
          :aria-selected="item.id === activeTab"
          @click="activeTab = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <div v-if="activeTab === 'private'" class="pv-locked">
        <Lock :size="22" :stroke-width="1.8" aria-hidden="true" />
        <span v-if="props.profile.privateCount > 0">
          他有 {{ props.profile.privateCount }} 則私噗沒給你看
        </span>
        <span v-else>他沒有藏起來的私噗</span>
      </div>

      <div v-else-if="rows.length" class="pv-list">
        <button
          v-for="(row, index) in rows"
          :key="row.postId + '-' + index"
          type="button"
          class="pv-row"
          @click="emit('openPost', row.postId)"
        >
          <span class="pv-row-text">
            <QualifierChip :qualifier="row.qualifier" size="sm" />{{ row.text }}
          </span>
          <span class="pv-row-meta">{{ row.meta }}</span>
        </button>
      </div>

      <div v-else class="pv-empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.profile-view {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  background: var(--color-background);
  color: var(--color-text);
}

/* ---------- 頂欄 ---------- */
.pv-topbar {
  position: sticky;
  top: 0;
  z-index: 5;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  background: var(--color-background);
}

.pv-topbar-row {
  display: grid;
  grid-template-columns: $plurk-touch minmax(0, 1fr) $plurk-touch;
  align-items: center;
  height: 44px;
}

.pv-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pv-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pv-topbar-spacer {
  display: block;
}

/* ---------- 封面 ---------- */
.pv-cover {
  position: relative;
  height: 110px;
  background: linear-gradient(
    135deg,
    var(--pv-cover),
    color-mix(in srgb, var(--pv-cover) 55%, var(--color-background))
  );
  overflow: hidden;
}

.pv-cover-waves {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke: var(--color-on-primary-contrast);
  stroke-width: 2;
  opacity: 0.18;
}

/* ---------- 主體 ---------- */
.pv-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px calc(40px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
}

.pv-head-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: -42px;
}

.pv-avatar-ring {
  display: flex;
  flex: 0 0 auto;
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--color-background);
}

.pv-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 4px;
}

.pv-btn,
.pv-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.pv-btn--primary {
  border: none;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--color-primary-light);
  }
}

.pv-status {
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text-secondary);
}

.pv-status--on {
  border-color: transparent;
  background: var(--color-text);
  color: var(--color-background);
}

.pv-name-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pv-name {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.pv-meta {
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.pv-bio {
  margin: 0;
  font-size: 15px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}

/* ---------- 數字卡 ---------- */
.pv-stat-card {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  padding: 12px 0;
  border-radius: $plurk-radius-card;
  background: var(--color-surface);
}

.pv-stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.pv-stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.pv-stat-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* ---------- 他和你 ---------- */
.pv-together {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: $plurk-radius-card;
  background: var(--color-surface);
}

.pv-together-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.pv-together-title {
  font-size: 16px;
  font-weight: 700;
}

.pv-together-count {
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.pv-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 40px;
}

.pv-bar {
  flex: 1 1 0;
  min-width: 0;
  border-radius: 2px;
  background: var(--color-border);
}

.pv-bar--peak {
  background: var(--color-primary);
}

.pv-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.pv-peak,
.pv-avg {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.pv-peak b {
  font-weight: 700;
}

.pv-avg {
  color: var(--color-text-secondary);
}

.pv-impressions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pv-tag {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  background: var(--color-surface-hover);
  font-size: 13px;
  white-space: nowrap;
}

.pv-summarize {
  position: relative;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 17px;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &::after {
    content: "";
    position: absolute;
    inset: -5px 0;
  }

  &:disabled {
    color: var(--color-text-secondary);
    cursor: default;
  }
}

.spin {
  animation: pv-spin 0.9s linear infinite;
}

@keyframes pv-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ---------- PEEK ---------- */
.pv-peek {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border: 1.5px dashed #c08a1e;
  border-radius: 14px;
  background: #fff5e0;
  color: #7a4e00;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    opacity: 0.88;
  }
}

.pv-peek-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

.pv-peek-chevron {
  flex: 0 0 auto;
  opacity: 0.75;
}

/* ---------- 分頁 ---------- */
.pv-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--color-border);
}

.pv-tab {
  height: $plurk-touch;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 14px;
  font-weight: 400;
  cursor: pointer;
  box-shadow: inset 0 -2px 0 transparent;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--color-surface-hover);
  }
}

.pv-tab--on {
  color: var(--color-text);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--color-text);
}

/* ---------- 清單 ---------- */
.pv-list {
  display: flex;
  flex-direction: column;
}

.pv-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 10px 0;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--color-surface-hover);
  }
}

.pv-row-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.pv-row-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pv-empty {
  padding: 32px 0;
  color: var(--color-text-muted);
  font-size: 13px;
  text-align: center;
}

/* ---------- 私噗 ---------- */
.pv-locked {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 16px 0;
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

/* ---------- 夜晚 ---------- */
body.is-night-mode .pv-peek {
  border-color: rgba(240, 196, 106, 0.5);
  background: rgba(240, 196, 106, 0.08);
  color: #f0c46a;
}

@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
</style>
