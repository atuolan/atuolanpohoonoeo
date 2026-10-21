<script setup lang="ts">
/**
 * 「我」分頁：封面帶、頭像、名字與切換身分、三格數字、三個分頁、清單、其他設定
 * 只吃 props 與 emits，資料與儲存都交給外殼
 */
import {
  Bookmark,
  ChevronRight,
  MessageSquare,
  PenLine,
  Sparkles,
  Theater,
  UserRound,
} from "lucide-vue-next";
import { computed } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import type { MeListRow } from "@/components/plurk/types";

type MeTabKey = "mine" | "responded" | "bookmarked";

const props = withDefaults(
  defineProps<{
    persona: { name: string; avatar?: string; groupName?: string };
    stats: { posts: number; responses: number; likes: number };
    tab: MeTabKey;
    rows: MeListRow[];
    legacyAvatar: string;
  }>(),
  {
    persona: () => ({ name: "" }),
    stats: () => ({ posts: 0, responses: 0, likes: 0 }),
    tab: "mine",
    rows: () => [],
    legacyAvatar: "",
  },
);

const emit = defineEmits<{
  switchPersona: [];
  "update:tab": [tab: MeTabKey];
  openPost: [postId: string];
  openTheater: [];
  editLegacyAvatar: [];
  openDirector: [];
}>();

const TABS: Array<{ id: MeTabKey; label: string; icon: unknown }> = [
  { id: "mine", label: "我的噗", icon: PenLine },
  { id: "responded", label: "回應過", icon: MessageSquare },
  { id: "bookmarked", label: "收藏", icon: Bookmark },
];

const EMPTY_TEXT: Record<MeTabKey, string> = {
  mine: "還沒發過噗",
  responded: "還沒回應過別人的噗",
  bookmarked: "還沒收藏",
};

const emptyText = computed(() => EMPTY_TEXT[props.tab]);
const emptyIcon = computed(() => TABS.find((t) => t.id === props.tab)?.icon ?? PenLine);
const hasRows = computed(() => props.rows.length > 0);

const statItems = computed(() => [
  { key: "posts", label: "噗", value: props.stats.posts },
  { key: "responses", label: "收到的回應", value: props.stats.responses },
  { key: "likes", label: "收到的喜歡", value: props.stats.likes },
]);

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}
</script>

<template>
  <div class="me-tab">
    <div class="me-scroll">
      <div class="cover" aria-hidden="true">
        <svg class="cover-waves" viewBox="0 0 390 120" preserveAspectRatio="none">
          <path d="M0 78q30-20 60 0t60 0 60 0 60 0 60 0 60 0 60 0" />
          <path d="M0 102q30-20 60 0t60 0 60 0 60 0 60 0 60 0 60 0" />
        </svg>
      </div>

      <div class="me-body">
        <div class="head-row">
          <span class="avatar-ring">
            <PlurkAvatar :src="props.persona.avatar" :name="props.persona.name" :size="84" />
          </span>
          <button type="button" class="persona-btn" @click="emit('switchPersona')">
            <UserRound :size="15" aria-hidden="true" />
            切換身分
          </button>
        </div>

        <div class="name-block">
          <h1 class="name">{{ props.persona.name }}</h1>
          <span v-if="props.persona.groupName" class="group-name">
            {{ props.persona.groupName }}
          </span>
        </div>

        <div class="stat-card">
          <div v-for="item in statItems" :key="item.key" class="stat-cell">
            <span class="stat-value">{{ fmt(item.value) }}</span>
            <span class="stat-label">{{ item.label }}</span>
          </div>
        </div>

        <div class="tab-row" role="tablist" aria-label="我的噗分類">
          <button
            v-for="item in TABS"
            :key="item.id"
            type="button"
            role="tab"
            class="tab-btn"
            :class="{ 'tab-btn--on': item.id === props.tab }"
            :aria-selected="item.id === props.tab"
            @click="emit('update:tab', item.id)"
          >
            {{ item.label }}
          </button>
        </div>

        <div v-if="hasRows" class="post-list">
          <button
            v-for="(row, index) in props.rows"
            :key="row.postId + '-' + index"
            type="button"
            class="post-row"
            @click="emit('openPost', row.postId)"
          >
            <span class="post-text">
              <QualifierChip :qualifier="row.qualifier" size="sm" />{{ row.text }}
            </span>
            <span class="post-meta">{{ row.meta }}</span>
          </button>
        </div>

        <div v-else class="post-empty">
          <component :is="emptyIcon" :size="30" :stroke-width="1.6" aria-hidden="true" />
          <span class="empty-text">{{ emptyText }}</span>
        </div>

        <section class="other-block">
          <span class="other-title">其他</span>
          <div class="other-card">
            <button type="button" class="other-row" @click="emit('openDirector')">
              <Sparkles :size="18" class="row-icon" aria-hidden="true" />
              <span class="row-label">AI 導演與記憶</span>
              <ChevronRight :size="18" class="row-chevron" aria-hidden="true" />
            </button>

            <button type="button" class="other-row" @click="emit('openTheater')">
              <Theater :size="18" class="row-icon" aria-hidden="true" />
              <span class="row-label">小劇場</span>
              <ChevronRight :size="18" class="row-chevron" aria-hidden="true" />
            </button>

            <button type="button" class="other-row" @click="emit('editLegacyAvatar')">
              <UserRound :size="18" class="row-icon" aria-hidden="true" />
              <span class="row-label">舊噗文的頭像</span>
              <img
                v-if="props.legacyAvatar"
                :src="props.legacyAvatar"
                class="legacy-thumb"
                alt=""
                aria-hidden="true"
              />
              <span v-else class="legacy-thumb legacy-thumb--empty" aria-hidden="true"></span>
              <ChevronRight :size="18" class="row-chevron" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.me-tab {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--color-background);
  color: var(--color-text);
}

.me-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  padding-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  padding-bottom: 120px;
}

/* ---------- 封面帶 ---------- */
.cover {
  position: relative;
  width: 100%;
  height: 120px;
  background: linear-gradient(
    160deg,
    rgba(var(--color-primary-rgb), 0.95) 0%,
    rgba(var(--color-primary-rgb), 0.78) 55%,
    rgba(var(--color-primary-rgb), 0.5) 100%
  );
  overflow: hidden;
}

.cover-waves {
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
.me-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 16px;
}

.head-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
  margin-top: -42px;
}

.avatar-ring {
  display: flex;
  flex: 0 0 auto;
  border-radius: 50%;
  box-shadow: 0 0 0 4px var(--color-background);
}

.persona-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: $plurk-touch;
  margin-bottom: 2px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    background: var(--color-surface-hover);
  }
}

.name-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.name {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.group-name {
  font-size: 13px;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

/* ---------- 數字卡 ---------- */
.stat-card {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 12px 0;
  border-radius: 16px;
  background: var(--color-surface);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.stat-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--color-text-secondary);
  text-align: center;
}

/* ---------- 分頁 ---------- */
.tab-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border-bottom: 1px solid var(--color-border);
}

.tab-btn {
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

.tab-btn--on {
  color: var(--color-text);
  font-weight: 700;
  box-shadow: inset 0 -2px 0 var(--color-text);
}

/* ---------- 清單 ---------- */
.post-list {
  display: flex;
  flex-direction: column;
}

.post-row {
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

.post-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.post-meta {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.post-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 0;
  color: var(--color-text-muted);
}

.empty-text {
  font-size: 13px;
}

/* ---------- 其他 ---------- */
.other-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.other-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.other-card {
  border-radius: 18px;
  background: var(--color-surface);
  padding: 0 14px;
}

.other-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 54px;
  padding: 0;
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

.row-icon {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
}

.row-label {
  flex: 1;
  min-width: 0;
  font-size: 14px;
}

.row-chevron {
  flex: 0 0 auto;
  color: var(--color-text-muted);
}

.legacy-thumb {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--color-surface-hover);
}

.legacy-thumb--empty {
  display: block;
}

/* ---------- 夜晚 ---------- */
body.is-night-mode .cover {
  opacity: 0.88;
}
</style>
