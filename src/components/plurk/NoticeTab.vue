<script setup lang="ts">
/** 通知分頁：標題列＋篩選膠囊＋禁言卡＋回應／讚／系統通知清單 */
import { Ban, Bell, Eye, Megaphone, ShieldAlert } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import type { BanCardData, NoticeListRow } from "@/components/plurk/types";

type NoticeFilter = "all" | "reply" | "like" | "sys";

const props = withDefaults(
  defineProps<{
    rows: NoticeListRow[];
    filter: NoticeFilter;
    filters: Array<{ id: NoticeFilter; label: string; dot?: boolean }>;
    ban: BanCardData | null;
  }>(),
  {
    rows: () => [],
    filters: () => [],
    ban: null,
  },
);

const emit = defineEmits<{
  "update:filter": [filter: NoticeFilter];
  markAllRead: [];
  open: [row: NoticeListRow];
  openPeek: [characterId: string];
  sendAppeal: [reason: string];
}>();

const APPEAL_STAGES = ["已送出", "審核中", "結果"] as const;

const hasRows = computed(() => props.rows.length > 0);
const showBan = computed(() => !!props.ban && (props.filter === "all" || props.filter === "sys"));
const showEmpty = computed(() => !hasRows.value && !showBan.value);

const appealStage = computed(() => props.ban?.appeal?.stage ?? 0);
const appealLabel = computed(
  () => `申訴進度：${APPEAL_STAGES.slice(0, appealStage.value + 1).join("，")}`,
);

const EMPTY_TITLES: Record<NoticeFilter, string> = {
  all: "還沒有新的通知",
  reply: "還沒有新的回應",
  like: "還沒有人按讚",
  sys: "沒有系統通知",
};

const emptyTitle = computed(() => EMPTY_TITLES[props.filter]);

/* ---------- 禁言卡的內部狀態 ---------- */
const showRules = ref(false);
const writing = ref(false);
const appealReason = ref("");

function toggleRules() {
  showRules.value = !showRules.value;
}

function startAppeal() {
  writing.value = true;
  appealReason.value = "";
}

function cancelAppeal() {
  writing.value = false;
  appealReason.value = "";
}

function sendAppeal() {
  const reason = appealReason.value.trim();
  if (!reason) return;
  emit("sendAppeal", reason);
  writing.value = false;
  appealReason.value = "";
}

// 外層把 ban.appeal 帶進來（或換了一張禁言卡）就收起撰寫狀態
watch(
  () => props.ban?.appeal,
  (appeal) => {
    if (appeal) {
      writing.value = false;
      appealReason.value = "";
    }
  },
);

watch(
  () => props.ban,
  () => {
    showRules.value = false;
  },
);
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
            <span v-if="item.dot" class="filter-dot" aria-hidden="true"></span>
          </button>
        </div>
      </header>

      <div class="notice-body">
        <section v-if="showBan && props.ban" class="ban-card" role="region" aria-label="禁言處分">
          <div class="ban-head">
            <Ban class="ban-icon" :size="20" :stroke-width="2.2" aria-hidden="true" />
            <div class="ban-head-text">
              <p class="ban-title">{{ props.ban.title }}</p>
              <p class="ban-by">{{ props.ban.byText }}</p>
            </div>
          </div>

          <dl class="ban-facts">
            <div class="ban-fact">
              <dt>原因</dt>
              <dd>{{ props.ban.reason }}</dd>
            </div>
            <div class="ban-fact">
              <dt>影響</dt>
              <dd>{{ props.ban.impact }}</dd>
            </div>
            <div class="ban-fact">
              <dt>剩餘</dt>
              <dd class="ban-remain">
                <b>{{ props.ban.remainDays }}</b>
                <small>天</small>
                <b>{{ props.ban.remainHours }}</b>
                <small>小時</small>
              </dd>
            </div>
          </dl>

          <div v-if="!props.ban.appeal && !writing" class="ban-idle">
            <div class="ban-actions">
              <button
                type="button"
                class="ban-btn"
                :aria-expanded="showRules"
                @click="toggleRules"
              >
                社區規定
              </button>
              <button type="button" class="ban-btn ban-btn--strong" @click="startAppeal">
                申訴
              </button>
            </div>

            <ul v-if="showRules" class="ban-rules" aria-label="社區規定條列">
              <li v-for="rule in props.ban.rules" :key="rule">{{ rule }}</li>
            </ul>
          </div>

          <div v-else-if="writing" class="ban-write">
            <label class="appeal-label">
              申訴理由
              <textarea
                v-model="appealReason"
                class="appeal-input"
                maxlength="200"
                placeholder="說明你為什麼覺得這個處分不對"
              ></textarea>
            </label>
            <div class="ban-actions">
              <button type="button" class="ban-btn" @click="cancelAppeal">取消</button>
              <button
                type="button"
                class="ban-btn ban-btn--strong"
                :disabled="!appealReason.trim()"
                @click="sendAppeal"
              >
                送出申訴
              </button>
            </div>
          </div>

          <div v-else-if="props.ban.appeal" class="ban-appeal">
            <div class="appeal-track" role="img" :aria-label="appealLabel">
              <template v-for="(stageLabel, index) in APPEAL_STAGES" :key="stageLabel">
                <span
                  v-if="index > 0"
                  class="appeal-line"
                  :class="{ 'appeal-line--done': index <= appealStage }"
                ></span>
                <span
                  class="appeal-dot"
                  :class="{ 'appeal-dot--done': index <= appealStage }"
                ></span>
              </template>
            </div>
            <div class="appeal-labels">
              <span
                v-for="(stageLabel, index) in APPEAL_STAGES"
                :key="stageLabel"
                class="appeal-label-text"
                :class="{ 'appeal-label-text--done': index <= appealStage }"
              >
                {{ stageLabel }}
              </span>
            </div>
            <p class="appeal-note">{{ props.ban.appeal.note }}</p>
            <p v-if="props.ban.appeal.resultText" class="appeal-result">
              {{ props.ban.appeal.resultText }}
            </p>
          </div>
        </section>

        <div v-if="hasRows" class="notice-list">
          <div v-for="row in props.rows" :key="row.id" class="notice-row">
            <button type="button" class="row-main" @click="emit('open', row)">
              <span
                v-if="row.kind === 'system'"
                class="row-sys"
                :class="row.tone === 'neutral' ? 'row-sys--neutral' : 'row-sys--alert'"
              >
                <Megaphone
                  v-if="row.tone === 'neutral'"
                  :size="18"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <ShieldAlert v-else :size="18" :stroke-width="2" aria-hidden="true" />
              </span>
              <PlurkAvatar
                v-else
                class="row-avatar"
                :src="row.avatar"
                :name="row.title"
                :color="row.avatarColor"
                :size="36"
              />

              <span class="row-content">
                <span class="row-text"><b>{{ row.title }}</b> {{ row.text }}</span>
                <span class="row-time">{{ row.timeText }}</span>
              </span>
            </button>

            <button
              v-if="row.peekCharacterId"
              type="button"
              class="peek-btn"
              @click="emit('openPeek', row.peekCharacterId)"
            >
              <Eye :size="13" :stroke-width="2.2" aria-hidden="true" />
              <span>{{ row.peekText }}</span>
            </button>

            <span v-if="row.unread" class="row-dot" aria-label="未讀"></span>
          </div>
        </div>

        <div v-else-if="showEmpty" class="notice-empty">
          <Bell :size="36" :stroke-width="1.5" class="empty-icon" aria-hidden="true" />
          <p class="empty-title">{{ emptyTitle }}</p>
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

.filter-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-error);
}

/* ---------- 禁言卡 ---------- */
.ban-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 1.5px solid #e9b3be;
  border-radius: $plurk-radius-card;
  background: #fbedef;
  padding: 18px;
}

.ban-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.ban-icon {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--color-error);
}

.ban-head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ban-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.ban-by {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-secondary);
}

.ban-facts {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
}

.ban-fact {
  display: flex;
  align-items: baseline;
  gap: 10px;

  dt {
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--color-text-secondary);
  }

  dd {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-size: 14px;
    line-height: 1.55;
    color: var(--color-text);
    overflow-wrap: anywhere;
  }
}

.ban-remain {
  display: flex;
  align-items: baseline;
  gap: 3px;

  b {
    font-size: 28px;
    font-weight: 800;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  small {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text);
  }

  small:first-of-type {
    margin-right: 6px;
  }
}

.ban-idle,
.ban-write,
.ban-appeal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ban-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ban-btn {
  position: relative;
  height: 40px;
  border-radius: 20px;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &::after {
    content: "";
    position: absolute;
    inset: -2px 0;
  }

  &:active {
    background: var(--color-surface-hover);
  }
}

.ban-btn--strong {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-background);
  font-weight: 700;
  -webkit-tap-highlight-color: transparent;

  &:disabled {
    border-color: var(--color-border);
    background: var(--color-surface-hover);
    color: var(--color-text-muted);
    cursor: default;
  }
}

.ban-rules {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 12px 14px 12px 28px;
  border-radius: $plurk-radius-soft;
  background: var(--color-surface);
  color: var(--color-text-secondary);
  font-size: 13px;
  line-height: 1.6;

  li {
    overflow-wrap: anywhere;
  }
}

.appeal-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.appeal-input {
  box-sizing: border-box;
  width: 100%;
  height: 88px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.appeal-track {
  display: flex;
  align-items: center;
  gap: 6px;
}

.appeal-dot {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  box-sizing: border-box;
  border: 2px solid var(--color-border);
  border-radius: 50%;
}

.appeal-dot--done {
  border-color: var(--color-text);

  &::after {
    content: "";
    display: block;
    width: 8px;
    height: 8px;
    margin: 4px;
    border-radius: 50%;
    background: var(--color-text);
  }
}

.appeal-line {
  flex: 1;
  height: 2px;
  border-radius: 1px;
  background: var(--color-border);
}

.appeal-line--done {
  background: var(--color-text);
}

.appeal-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--color-text-muted);
}

.appeal-label-text--done {
  color: var(--color-text);
  font-weight: 700;
}

.appeal-note {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
}

.appeal-result {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.55;
  color: var(--color-text);
  overflow-wrap: anywhere;
}

/* ---------- 清單 ---------- */
.notice-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 120px;
}

.notice-list {
  background: var(--color-surface);
  border-radius: 20px;
  padding: 0 14px;
}

.notice-row {
  position: relative;
  padding: 12px 0;
  border-bottom: 1px solid var(--color-border);

  &:last-child {
    border-bottom: none;
  }
}

.row-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 0 10px 0 0;
  border: none;
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

.row-avatar {
  flex: 0 0 auto;
  margin-top: 1px;
}

.row-sys {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: var(--color-on-primary-contrast);
}

.row-sys--alert {
  background: var(--color-error);
}

.row-sys--neutral {
  background: var(--color-text-secondary);
}

.row-content {
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
  font-size: 12px;
  color: var(--color-text-secondary);
}

.peek-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: calc(100% - 48px);
  height: 30px;
  margin: 2px 0 0 48px;
  padding: 0 10px;
  border: 1px dashed #c08a1e;
  border-radius: 15px;
  background: #fff5e0;
  color: #7a4e00;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &::after {
    content: "";
    position: absolute;
    inset: -7px 0;
  }
}

.row-dot {
  position: absolute;
  top: 18px;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
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

/* ---------- 夜晚 ---------- */
body.is-night-mode .ban-card {
  background: rgba(180, 35, 63, 0.12);
  border-color: #7a2a3c;
}

body.is-night-mode .peek-btn {
  background: rgba(240, 196, 106, 0.08);
  color: #f0c46a;
}
</style>
