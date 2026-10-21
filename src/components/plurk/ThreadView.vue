<script setup lang="ts">
/**
 * 回應串畫面：原噗卡 + 回應列表（一次只展開一列）+ 正在輸入 + 底部輸入區
 * 資料都由外面整理好（html 已安全渲染），這顆只負責畫面與事件
 */
import {
  ArrowUp,
  Ban,
  Bell,
  BellOff,
  ChevronLeft,
  EyeOff,
  Loader2,
  MessageSquare,
  RefreshCw,
  Smile,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-vue-next";
import { computed, nextTick, ref } from "vue";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import type { MentionCandidate, ThreadPostData, ThreadQuickAction, ThreadResponseRow } from "@/components/plurk/types";
import { getQualifierColor, normalizeQualifier } from "@/utils/plurkQualifiers";

const props = withDefaults(
  defineProps<{
    post: ThreadPostData;
    responseCount: number;
    participantCount: number;
    rows: ThreadResponseRow[];
    typingNames: string[];
    quickActions: ThreadQuickAction[];
    busy?: boolean;
    replyingToName?: string | null;
    inputAvatar?: string;
    inputName: string;
    /** 目前選的回應發語詞，空字串＝自由發揮 */
    qualifier?: string;
    mentionCandidates?: MentionCandidate[];
    /** 鍵盤彈出時外殼給的高度 */
    height?: string;
    /** 廣場上的噗：標題、「只看角色」、角色小框 */
    squareMode?: boolean;
    /** 廣場：幾位角色參與 */
    characterCount?: number;
    /** 噗主是路人時的好友狀態；null＝不顯示加好友 */
    opFollow?: boolean | null;
    /** 有值時不能回應（例：廣場禁言中），輸入區換成這行字 */
    inputDisabledText?: string;
  }>(),
  {
    busy: false,
    replyingToName: null,
    inputAvatar: undefined,
    qualifier: "",
    mentionCandidates: () => [],
    height: undefined,
    rows: () => [],
    typingNames: () => [],
    quickActions: () => [],
    squareMode: false,
    characterCount: 0,
    opFollow: null,
    inputDisabledText: undefined,
  },
);

const emit = defineEmits<{
  back: [];
  toggleMute: [];
  openProfile: [];
  openImage: [index: number];
  regenerate: [id: string, tone: "again" | "cold" | "warm"];
  reply: [id: string];
  remove: [id: string];
  cancelReply: [];
  quickAction: [action: ThreadQuickAction];
  openPersona: [];
  openQualifier: [];
  openSticker: [];
  send: [content: string];
  toggleFollow: [];
}>();

const rootEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);
const content = ref("");
const cursor = ref(0);
const expandedId = ref<string | null>(null);
const onlyCharacters = ref(false);

const visibleRows = computed(() =>
  props.squareMode && onlyCharacters.value ? props.rows.filter((row) => row.isCharacter) : props.rows,
);
const flashId = ref<string | null>(null);
let flashTimer: ReturnType<typeof setTimeout> | null = null;

const rootStyle = computed(() => (props.height ? { height: props.height } : undefined));

const qualifierLabel = computed(() => normalizeQualifier(props.qualifier));
const qualifierColor = computed(() => getQualifierColor(props.qualifier));

const canSend = computed(() => content.value.trim().length > 0);

/* ---------- 一次只展開一列 ---------- */
function isOpen(row: ThreadResponseRow): boolean {
  return expandedId.value === row.id;
}

function toggleRow(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

/* ---------- 輸入框游標 ---------- */
function syncCursor() {
  const el = inputEl.value;
  cursor.value = el ? (el.selectionStart ?? content.value.length) : content.value.length;
}

/** 游標前緊接著的 `@字串`（不含空白），沒有就 null */
const mentionWord = computed(() => {
  if (!content.value) {
    return null;
  }
  const before = content.value.slice(0, cursor.value);
  const matched = /@([^\s@]*)$/.exec(before);
  return matched ? matched[1] : null;
});

const mentionMatches = computed(() => {
  const word = mentionWord.value;
  if (word === null) {
    return [];
  }
  const needle = word.toLowerCase();
  return props.mentionCandidates
    .filter(
      (item) =>
        !needle ||
        item.name.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle),
    )
    .slice(0, 6);
});

function pickMention(candidate: MentionCandidate) {
  const el = inputEl.value;
  const pos = el ? (el.selectionStart ?? content.value.length) : content.value.length;
  const before = content.value.slice(0, pos);
  const after = content.value.slice(pos);
  const replaced = before.replace(/@([^\s@]*)$/, `@${candidate.name} `);
  content.value = replaced + after;
  const nextPos = replaced.length;
  void nextTick(() => {
    el?.focus();
    el?.setSelectionRange(nextPos, nextPos);
    cursor.value = nextPos;
  });
}

/* ---------- 送出 ---------- */
function submit() {
  if (!canSend.value) {
    return;
  }
  emit("send", content.value.trim());
  content.value = "";
  cursor.value = 0;
  void nextTick(() => {
    inputEl.value?.focus();
  });
}

function onEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) {
    return;
  }
  event.preventDefault();
  submit();
}

/* ---------- 對外 API ---------- */
function insertText(text: string) {
  const el = inputEl.value;
  const start = el ? (el.selectionStart ?? content.value.length) : content.value.length;
  const end = el ? (el.selectionEnd ?? start) : start;
  content.value = content.value.slice(0, start) + text + content.value.slice(end);
  const nextPos = start + text.length;
  void nextTick(() => {
    el?.focus();
    el?.setSelectionRange(nextPos, nextPos);
    cursor.value = nextPos;
  });
}

function scrollToResponse(id: string) {
  const el = document.getElementById(`plurk-resp-${id}`);
  if (!el) {
    return;
  }
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  flashId.value = id;
  if (flashTimer) {
    clearTimeout(flashTimer);
  }
  flashTimer = setTimeout(() => {
    flashId.value = null;
    flashTimer = null;
  }, 1600);
}

function focusInput() {
  inputEl.value?.focus();
}

defineExpose({ insertText, scrollToResponse, focusInput });
</script>

<template>
  <div ref="rootEl" class="thread plurk-rich" :style="rootStyle">
    <!-- 固定頂欄 -->
    <header class="thread-top">
      <button type="button" class="icon-btn back-btn" aria-label="返回河道" @click="emit('back')">
        <ChevronLeft :size="22" aria-hidden="true" />
      </button>
      <div class="top-who">
        <span class="top-title">{{ props.squareMode ? "廣場 · 回應" : "回應串" }}</span>
        <span class="top-sub"
          >{{ props.responseCount }} 則回應 ·
          {{ props.squareMode ? `${props.characterCount} 位角色參與` : `${props.participantCount} 人參與` }}</span
        >
      </div>
      <button
        type="button"
        class="icon-btn mute-btn"
        :aria-label="props.post.muted ? '取消消音' : '消音'"
        :aria-pressed="props.post.muted"
        @click="emit('toggleMute')"
      >
        <BellOff v-if="props.post.muted" :size="21" aria-hidden="true" />
        <Bell v-else :size="21" aria-hidden="true" />
      </button>
    </header>

    <!-- 可捲動區 -->
    <div class="thread-scroll">
      <!-- 原噗 -->
      <article class="post-card">
        <p v-if="props.post.notice" class="post-notice">
          <EyeOff :size="14" aria-hidden="true" />{{ props.post.notice }}
        </p>
        <header class="post-head">
          <button
            type="button"
            class="avatar-btn"
            :aria-label="`${props.post.authorName}的個人頁`"
            @click="emit('openProfile')"
          >
            <PlurkAvatar
              :src="props.post.authorAvatar"
              :name="props.post.authorName"
              :color="props.post.authorColor"
              :size="40"
            />
          </button>
          <div class="post-who">
            <span class="post-name">{{ props.post.authorName }}</span>
            <span class="post-meta">{{ props.post.metaText }}</span>
          </div>
          <button
            v-if="props.opFollow !== null"
            type="button"
            class="follow-btn"
            :class="{ 'follow-btn--on': props.opFollow }"
            :aria-pressed="props.opFollow"
            @click="emit('toggleFollow')"
          >
            <UserCheck v-if="props.opFollow" :size="15" aria-hidden="true" />
            <UserPlus v-else :size="15" aria-hidden="true" />
            {{ props.opFollow ? "已加好友" : "加好友" }}
          </button>
        </header>

        <p class="post-body">
          <QualifierChip :qualifier="props.post.qualifier" size="md" /><span
            class="post-body-text"
            v-html="props.post.html"
          ></span>
        </p>

        <div v-if="props.post.images.length" class="post-images">
          <button
            v-for="(src, i) in props.post.images"
            :key="`post-img-${i}`"
            type="button"
            class="image-btn"
            :aria-label="`看第 ${i + 1} 張圖`"
            @click="emit('openImage', i)"
          >
            <img :src="src" alt="" loading="lazy" />
          </button>
        </div>

        <div class="post-stats">
          <span class="stat">喜歡 <b class="stat-num">{{ props.post.likeCount }}</b></span>
          <span class="stat">轉噗 <b class="stat-num">{{ props.post.repostCount }}</b></span>
        </div>
      </article>

      <div v-if="props.squareMode" class="resp-filter">
        <span class="resp-filter-label">回應</span>
        <button
          type="button"
          class="only-chip"
          :class="{ 'only-chip--on': onlyCharacters }"
          :aria-pressed="onlyCharacters"
          @click="onlyCharacters = !onlyCharacters"
        >
          只看角色
        </button>
      </div>

      <!-- 回應列表 -->
      <div class="resp-list">
        <div
          v-for="row in visibleRows"
          :key="row.id"
          :id="`plurk-resp-${row.id}`"
          class="resp"
          :class="{ 'resp--open': isOpen(row), 'resp--flash': flashId === row.id }"
        >
          <p v-if="row.removedText" class="resp-removed">
            <Trash2 :size="13" aria-hidden="true" />{{ row.removedText }}
          </p>
          <template v-else>
          <button
            type="button"
            class="resp-main"
            :aria-expanded="isOpen(row)"
            @click="toggleRow(row.id)"
          >
            <PlurkAvatar :src="row.authorAvatar" :name="row.authorName" :color="row.avatarColor" :size="32" />
            <span class="resp-body">
              <span class="resp-head">
                <span class="resp-name" :class="{ 'resp-name--me': row.isMe }">{{ row.authorName }}</span>
                <span v-if="props.squareMode && row.isCharacter" class="resp-op">角色</span>
                <span v-if="row.isOp" class="resp-op">噗主</span>
                <span class="resp-time">{{ row.timeText }}</span>
                <Loader2
                  v-if="row.regenerating"
                  :size="13"
                  class="resp-spin"
                  aria-label="重新生成中"
                  role="img"
                />
              </span>
              <span class="resp-text">
                <QualifierChip :qualifier="row.qualifier" size="sm" /><span
                  v-if="row.replyToName"
                  class="resp-mention"
                  >@{{ row.replyToName }}
                </span>
                <span class="resp-html" v-html="row.html"></span>
              </span>
            </span>
          </button>

          <div v-if="isOpen(row)" class="resp-actions">
            <template v-if="row.canRegenerate">
              <button
                type="button"
                class="mini-btn mini-btn--primary"
                :disabled="row.regenerating"
                @click="emit('regenerate', row.id, 'again')"
              >
                <Loader2 v-if="row.regenerating" :size="13" class="resp-spin" aria-hidden="true" />
                <RefreshCw v-else :size="13" aria-hidden="true" />
                重新生成
              </button>
              <button
                type="button"
                class="mini-btn"
                :disabled="row.regenerating"
                @click="emit('regenerate', row.id, 'cold')"
              >
                冷淡一點
              </button>
              <button
                type="button"
                class="mini-btn"
                :disabled="row.regenerating"
                @click="emit('regenerate', row.id, 'warm')"
              >
                溫柔一點
              </button>
            </template>
            <button
              type="button"
              class="mini-btn"
              :aria-label="`回覆 ${row.authorName}`"
              :disabled="row.regenerating"
              @click="emit('reply', row.id)"
            >
              <MessageSquare :size="13" aria-hidden="true" />
              回覆
            </button>
            <button
              type="button"
              class="mini-btn mini-btn--danger"
              :disabled="row.regenerating"
              @click="emit('remove', row.id)"
            >
              <Trash2 :size="13" aria-hidden="true" />
              刪除
            </button>
          </div>
          </template>
        </div>

        <!-- 正在輸入 -->
        <div v-for="name in props.typingNames" :key="`typing-${name}`" class="typing-row">
          <PlurkAvatar :name="name" :size="32" />
          <span class="typing-text">{{ name }} 正在輸入</span>
          <span class="typing-dots" aria-hidden="true">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </span>
        </div>
      </div>
    </div>

    <!-- 底部固定區 -->
    <div class="thread-compose">
      <p v-if="props.inputDisabledText" class="compose-blocked">
        <Ban :size="16" aria-hidden="true" />{{ props.inputDisabledText }}
      </p>
      <template v-else>
      <div v-if="props.quickActions.length" class="quick-row">
        <button
          v-for="action in props.quickActions"
          :key="action.id"
          type="button"
          class="quick-btn"
          :disabled="props.busy"
          @click="emit('quickAction', action)"
        >
          {{ action.label }}
        </button>
      </div>

      <div v-if="props.replyingToName" class="reply-banner">
        <span class="reply-banner-text">回覆 @{{ props.replyingToName }}</span>
        <button
          type="button"
          class="reply-banner-x"
          aria-label="取消回覆"
          @click="emit('cancelReply')"
        >
          <X :size="14" aria-hidden="true" />
        </button>
      </div>

      <div v-if="mentionMatches.length" class="mention-list">
        <button
          v-for="candidate in mentionMatches"
          :key="candidate.id"
          type="button"
          class="mention-item"
          @click="pickMention(candidate)"
        >
          <PlurkAvatar :src="candidate.avatar" :name="candidate.name" :size="24" />
          <span class="mention-name">{{ candidate.name }}</span>
        </button>
      </div>

      <div class="compose-row">
        <button type="button" class="compose-btn persona-btn" aria-label="換身分" @click="emit('openPersona')">
          <PlurkAvatar :src="props.inputAvatar" :name="props.inputName" :size="32" />
        </button>

        <button
          v-if="qualifierColor"
          type="button"
          class="qualifier-btn"
          :style="{ background: qualifierColor }"
          :aria-label="`選發語詞，目前是${qualifierLabel}`"
          @click="emit('openQualifier')"
        >
          {{ qualifierLabel }}
        </button>
        <button
          v-else
          type="button"
          class="qualifier-btn qualifier-btn--free"
          aria-label="選發語詞，目前是自由發揮"
          @click="emit('openQualifier')"
        >
          自由
        </button>

        <input
          ref="inputEl"
          v-model="content"
          class="compose-input"
          type="text"
          maxlength="360"
          aria-label="回應內容"
          placeholder="回應這則噗…"
          @input="syncCursor"
          @click="syncCursor"
          @keyup="syncCursor"
          @keydown.enter="onEnter"
        />

        <button type="button" class="compose-btn sticker-btn" aria-label="貼圖" @click="emit('openSticker')">
          <Smile :size="20" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="send-btn"
          aria-label="送出回應"
          :disabled="!canSend"
          @click="submit"
        >
          <ArrowUp :size="18" aria-hidden="true" />
        </button>
      </div>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.thread {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-background);
  color: var(--color-text);
}

/* ---------- 頂欄 ---------- */
.thread-top {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 16px 8px 8px 4px;
}

.icon-btn {
  width: $plurk-touch;
  height: $plurk-touch;
  flex: 0 0 auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mute-btn {
  margin-right: -4px;
}

.top-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.top-title {
  font-size: 16px;
  font-weight: 700;
}

.top-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 捲動區 ---------- */
.thread-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---------- 原噗卡 ---------- */
.post-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--color-surface);
  border-radius: $plurk-radius-card;
  padding: 14px 16px;
}

.post-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-btn {
  flex: 0 0 auto;
  width: $plurk-touch;
  height: $plurk-touch;
  margin: -2px 0 -2px -2px;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.post-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.35;
}

.post-name {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.post-body {
  margin: 0;
  font-size: 15px;
  line-height: 1.7;
  word-break: break-word;
}

.post-body-text {
  word-break: break-word;
}

.post-images {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}

.post-images .image-btn:only-child {
  grid-column: 1 / -1;
}

.image-btn {
  display: block;
  width: 100%;
  height: 132px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: var(--color-surface-hover);
  overflow: hidden;
  cursor: pointer;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.post-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.stat-num {
  color: var(--color-text);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.post-notice {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.follow-btn {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -6px 0;
  }
}

.follow-btn--on {
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.resp-filter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.resp-filter-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.only-chip {
  position: relative;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 15px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -7px 0;
  }
}

.only-chip--on {
  border-color: var(--color-text);
  background: var(--color-text);
  color: var(--color-background);
}

/* ---------- 回應列表 ---------- */
.resp-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.resp {
  border-radius: 16px;
  background: transparent;
  transition: background 0.15s ease;
}

.resp--open {
  background: var(--color-surface);
}

.resp--flash {
  animation: resp-flash 1.6s ease-out;
}

@keyframes resp-flash {
  0%,
  55% {
    box-shadow: 0 0 0 2px var(--color-primary);
  }
  100% {
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0);
  }
}

.resp-main {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 8px 8px 4px;
  border: none;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.resp-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.resp-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.resp-name {
  font-size: 13px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resp-name--me {
  color: var(--color-success);
}

.resp-removed {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.resp-op {
  flex: 0 0 auto;
  padding: 0 4px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  color: var(--color-text-secondary);
  font-size: 10px;
  line-height: 14px;
  vertical-align: 1px;
}

.resp-time {
  font-size: 11px;
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.resp-spin {
  flex: 0 0 auto;
  color: var(--color-text-secondary);
}

.resp-text {
  font-size: 15px;
  line-height: 1.55;
  word-break: break-word;
}

.resp-mention {
  color: var(--color-primary);
  font-weight: 600;
}

.resp-html {
  word-break: break-word;
}

/* 展開後的小按鈕列 */
.resp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 10px 46px;
}

.mini-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;

  /* 觸控區補到 44px */
  &::after {
    content: "";
    position: absolute;
    inset: -6px -4px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.mini-btn--primary {
  border-color: transparent;
  background: var(--color-text);
  color: var(--color-background);
  font-weight: 700;
}

.mini-btn--danger {
  color: var(--color-error);
}

/* ---------- 正在輸入 ---------- */
.typing-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px 8px 4px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.typing-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.typing-dots {
  display: flex;
  gap: 3px;
}

.typing-dot {
  width: 5px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-text-secondary);
  animation: thDot 1.2s infinite;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
}

@keyframes thDot {
  0%,
  80%,
  100% {
    opacity: 0.25;
  }
  40% {
    opacity: 1;
  }
}

/* ---------- 底部輸入區 ---------- */
.thread-compose {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 12px calc(10px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  background: var(--color-surface);
  border-top: 1px solid var(--color-border);
}

.compose-blocked {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 44px;
  margin: 0;
  color: var(--color-error);
  font-size: 13px;
  font-weight: 600;
}

.quick-row {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.quick-btn {
  position: relative;
  flex: 0 0 auto;
  height: 32px;
  padding: 0 12px;
  border: 1px dashed var(--color-text-secondary);
  border-radius: 16px;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -6px -2px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;

    &::after {
      content: none;
    }
  }
}

.reply-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-primary);
}

.reply-banner-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}

.reply-banner-x {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: none;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* 提及清單 */
.mention-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 208px;
  overflow-y: auto;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-surface);
  box-shadow: $plurk-shadow-float;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: $plurk-touch;
  padding: 0 8px;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.mention-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 輸入列 */
.compose-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.compose-btn {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: none;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  /* 觸控區補到 44px */
  &::after {
    content: "";
    position: absolute;
    inset: -2px;
  }
}

.persona-btn {
  margin-left: -4px;
}

.sticker-btn {
  margin-right: -2px;
}

.qualifier-btn {
  flex: 0 0 auto;
  height: 32px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  color: #ffffff;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.qualifier-btn--free {
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-weight: 500;
}

.compose-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.send-btn {
  position: relative;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -2px;
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;

    &::after {
      content: none;
    }
  }
}
</style>
