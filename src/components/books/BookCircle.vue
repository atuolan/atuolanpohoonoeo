<script setup lang="ts">
/**
 * 05 共讀圈：你和 1–4 個聊天角色在段落上留邊註，AI 主持整理爭議
 * 所有動作走 useReadingCircle（閱讀器也用同一份），這裡只負責畫面
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { characterName, type CircleAnchor, type ReadingCircleApi } from "@/composables/useReadingCircle";
import { HOST_ID, HOST_NAME, lastNoteBy, MAX_MEMBERS, notesByParagraph, SYNC_EVERY_OPTIONS, USER_ID } from "@/services/bookCircle";
import { useCharactersStore } from "@/stores/characters";
import { useUserStore } from "@/stores/user";
import type { CircleNote, StoredBook } from "@/types/book";
import { Check, Send, Settings2, Sparkles, ThumbsUp, Trash2, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";

const props = defineProps<{
  book: StoredBook;
  api: ReadingCircleApi;
  /** 新邊註預設掛的段落（目前這頁最後一段，或選取的那段） */
  anchor: CircleAnchor | null;
  /** 打開時捲到哪段（paraKey） */
  focusKey?: string;
}>();

const emit = defineEmits<{ close: []; jump: [chapterIndex: number, offset: number] }>();

const charsStore = useCharactersStore();
const userStore = useUserStore();
const circle = computed(() => props.api.circle.value);
const members = computed(() => props.api.memberChars.value);
const busy = computed(() => props.api.busy.value);
const groups = computed(() => notesByParagraph(circle.value?.notes ?? []));

// ===== 建立／設定 =====
const setupName = ref(`${props.book.title}小組`);
const setupIds = ref<string[]>([]);
const showSettings = ref(false);

function toggleSetupMember(id: string) {
  const list = setupIds.value;
  if (list.includes(id)) setupIds.value = list.filter((x) => x !== id);
  else if (list.length < MAX_MEMBERS) setupIds.value = [...list, id];
}

async function create() {
  if (setupIds.value.length === 0) return;
  await props.api.createCircle(setupName.value, setupIds.value);
}

function openSettings() {
  setupName.value = circle.value?.name ?? setupName.value;
  setupIds.value = [...(circle.value?.memberIds ?? [])];
  showSettings.value = true;
}

async function saveSettings() {
  if (setupIds.value.length === 0) return;
  await props.api.updateCircle({ name: setupName.value.trim() || circle.value?.name, memberIds: setupIds.value });
  showSettings.value = false;
}

// ===== 成員列 =====
function avatarOf(id: string): string {
  if (id === USER_ID) return userStore.currentAvatar;
  return charsStore.getCharacterById(id)?.avatar ?? "";
}

function nameOf(note: CircleNote): string {
  if (note.authorId === USER_ID) return props.api.userName.value;
  if (note.authorId === HOST_ID) return HOST_NAME;
  return characterName(charsStore.getCharacterById(note.authorId)) || note.authorName;
}

function memberWhere(id: string): string {
  const last = lastNoteBy(circle.value?.notes ?? [], id);
  return last ? `第 ${last.chapterIndex + 1} 章` : "還沒留言";
}

function timeAgo(ts: number): string {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} 小時前`;
  const days = Math.round(hours / 24);
  return days === 1 ? "昨天" : `${days} 天前`;
}

// ===== 討論摘要 =====
const summary = computed(() => circle.value?.summary);
const stanceTotal = computed(() => summary.value?.stances.reduce((n, s) => n + Math.max(s.memberIds.length, 0), 0) ?? 0);

function stanceNames(ids: string[]): string {
  return ids
    .map((id) => (id === USER_ID ? props.api.userName.value : characterName(charsStore.getCharacterById(id))))
    .filter(Boolean)
    .join("、");
}

function stanceRatio(n: number): number {
  return stanceTotal.value ? Math.round((n / stanceTotal.value) * 100) : 0;
}

// ===== 輸入 =====
const draft = ref("");
const replyTo = ref<CircleNote | null>(null);
const listEl = ref<HTMLElement | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

const inputAnchor = computed<CircleAnchor | null>(() =>
  replyTo.value
    ? { chapterIndex: replyTo.value.chapterIndex, paraStart: replyTo.value.paraStart, quote: replyTo.value.quote }
    : props.anchor,
);

function shortQuote(text: string, n = 18): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

function startReply(note: CircleNote) {
  replyTo.value = note;
  nextTick(() => inputEl.value?.focus());
}

async function send() {
  const anchor = inputAnchor.value;
  const text = draft.value.trim();
  if (!anchor || !text || busy.value) return;
  draft.value = "";
  const parent = replyTo.value?.id;
  replyTo.value = null;
  const pending = props.api.postUserNote(anchor, text, parent);
  await nextTick();
  scrollToGroup(`${anchor.chapterIndex}:${anchor.paraStart}`);
  await pending;
}

async function deleteNote(note: CircleNote) {
  if (window.confirm("刪除這則邊註（連同底下的回覆）？")) await props.api.deleteNote(note.id);
}

function scrollToGroup(key: string) {
  nextTick(() => {
    const el = listEl.value?.querySelector<HTMLElement>(`[data-key="${key}"]`);
    el?.scrollIntoView({ block: "start", behavior: "smooth" });
  });
}

onMounted(() => {
  if (props.focusKey) scrollToGroup(props.focusKey);
});

watch(
  () => circle.value?.memberIds.length,
  (n) => {
    if (!n) showSettings.value = false;
  },
);
</script>

<template>
  <BookPlayShell
    :title="circle ? circle.name : '共讀圈'"
    :subtitle="circle ? `${members.length} 個角色＋AI 主持` : '找幾個角色一起讀這本書'"
    @close="emit('close')"
  >
    <template v-if="circle" #actions>
      <button
        class="ci-sync"
        :aria-pressed="circle.syncReading"
        :class="{ on: circle.syncReading }"
        @click="api.updateCircle({ syncReading: !circle.syncReading })"
      >
        <span class="ci-switch" aria-hidden="true" />同步讀
      </button>
      <button class="ci-icon-btn" aria-label="共讀圈設定" @click="openSettings">
        <Settings2 :size="20" />
      </button>
    </template>

    <!-- 建立／設定 -->
    <div v-if="!circle || showSettings" class="ci-setup">
      <label class="ci-label" for="ci-name">圈名</label>
      <input id="ci-name" v-model="setupName" class="ci-field" maxlength="24" />
      <span class="ci-label">一起讀的角色（{{ setupIds.length }}/{{ MAX_MEMBERS }}）</span>
      <p v-if="charsStore.characters.length === 0" class="ci-hint">還沒有角色，先去匯入一張角色卡吧</p>
      <div class="ci-pick-grid">
        <button
          v-for="c in charsStore.characters"
          :key="c.id"
          class="ci-pick"
          :class="{ on: setupIds.includes(c.id) }"
          :aria-pressed="setupIds.includes(c.id)"
          :disabled="!setupIds.includes(c.id) && setupIds.length >= MAX_MEMBERS"
          @click="toggleSetupMember(c.id)"
        >
          <span class="ci-avatar lg">
            <img v-if="c.avatar" :src="c.avatar" alt="" />
            <template v-else>{{ characterName(c).slice(0, 1) }}</template>
            <span v-if="setupIds.includes(c.id)" class="ci-check"><Check :size="14" /></span>
          </span>
          <span class="ci-pick-name">{{ characterName(c) }}</span>
        </button>
      </div>
      <template v-if="circle">
        <span class="ci-label">同步讀：每翻幾頁留一則</span>
        <div class="ci-segment" role="radiogroup" aria-label="同步讀頻率">
          <button
            v-for="n in SYNC_EVERY_OPTIONS"
            :key="n"
            role="radio"
            :aria-checked="circle.syncEvery === n"
            :class="{ active: circle.syncEvery === n }"
            @click="api.updateCircle({ syncEvery: n })"
          >
            {{ n }} 頁
          </button>
        </div>
      </template>
      <p class="ci-hint">角色只會讀到你讀到的地方。留邊註時挑 1–2 個角色回，一次呼叫。</p>
      <div class="ci-setup-actions">
        <button v-if="circle" class="ci-ghost" @click="showSettings = false">取消</button>
        <button class="ci-primary" :disabled="setupIds.length === 0" @click="circle ? saveSettings() : create()">
          {{ circle ? "儲存" : "開始共讀" }}
        </button>
      </div>
    </div>

    <template v-else>
      <div ref="listEl" class="ci-scroll">
        <!-- 成員 -->
        <div class="ci-members" aria-label="成員">
          <div v-for="m in members" :key="m.id" class="ci-member">
            <span class="ci-avatar">
              <img v-if="m.avatar" :src="m.avatar" alt="" />
              <template v-else>{{ characterName(m).slice(0, 1) }}</template>
            </span>
            <span class="ci-member-name">{{ characterName(m) }}</span>
            <span class="ci-member-where">{{ memberWhere(m.id) }}</span>
          </div>
          <div class="ci-member">
            <span class="ci-avatar host"><Sparkles :size="18" /></span>
            <span class="ci-member-name">{{ HOST_NAME }}</span>
            <span class="ci-member-where">主持</span>
          </div>
        </div>

        <!-- 討論摘要 -->
        <section class="ci-summary" aria-label="AI 討論摘要">
          <span class="ci-eyebrow"><Sparkles :size="14" />AI 討論摘要</span>
          <template v-if="summary">
            <p v-if="summary.quote" class="ci-summary-quote">「{{ summary.quote }}」</p>
            <div v-for="(s, i) in summary.stances" :key="i" class="ci-stance">
              <div class="ci-stance-head">
                <span class="ci-stance-claim">{{ s.claim }}</span>
                <span class="ci-stance-pct">{{ stanceRatio(s.memberIds.length) }}%</span>
              </div>
              <div class="ci-bar" :class="`s${i}`"><span :style="{ width: `${stanceRatio(s.memberIds.length)}%` }" /></div>
              <span class="ci-stance-who">{{ stanceNames(s.memberIds) || "還沒人站這邊" }}</span>
            </div>
          </template>
          <p v-else class="ci-hint">留言多了，主持會把大家的看法分成兩派。</p>
          <div class="ci-summary-actions">
            <button class="ci-ghost sm" :disabled="!!busy || !circle.notes.length" @click="api.refreshSummary()">
              {{ summary ? "重新整理" : "現在整理" }}
            </button>
            <button class="ci-ghost sm" :disabled="!!busy || !anchor" @click="anchor && api.askDebate(anchor)">
              讓 AI 丟出下一個爭議問題
            </button>
          </div>
        </section>

        <p v-if="busy" class="ci-busy" role="status">{{ busy }}</p>
        <p v-if="api.error.value" class="ci-error" role="alert">{{ api.error.value }}</p>

        <!-- 邊註串 -->
        <p v-if="groups.length === 0" class="ci-empty">
          還沒有邊註。<br />在下面寫下你對這段的想法，角色們會接著聊。
        </p>
        <section v-for="g in groups" :key="g.key" class="ci-group" :data-key="g.key">
          <button class="ci-group-quote" @click="emit('jump', g.chapterIndex, g.paraStart)">
            <span class="ci-group-where">{{ book.chapters[g.chapterIndex]?.title }}</span>
            <span class="ci-group-text">{{ g.quote }}</span>
          </button>
          <div v-for="t in g.threads" :key="t.note.id" class="ci-thread">
            <article v-for="n in [t.note, ...t.replies]" :key="n.id" class="ci-note" :class="{ reply: n !== t.note, host: n.authorId === HOST_ID }">
              <span class="ci-avatar sm" :class="{ host: n.authorId === HOST_ID }">
                <Sparkles v-if="n.authorId === HOST_ID" :size="14" />
                <img v-else-if="avatarOf(n.authorId)" :src="avatarOf(n.authorId)" alt="" />
                <template v-else>{{ nameOf(n).slice(0, 1) }}</template>
              </span>
              <div class="ci-note-body">
                <div class="ci-note-head">
                  <span class="ci-note-name">{{ nameOf(n) }}</span>
                  <span class="ci-note-time">{{ timeAgo(n.createdAt) }}</span>
                </div>
                <p class="ci-note-text">{{ n.content }}</p>
                <div class="ci-note-actions">
                  <button
                    :aria-pressed="n.agreeIds.includes(USER_ID)"
                    :class="{ on: n.agreeIds.includes(USER_ID) }"
                    :disabled="n.authorId === USER_ID"
                    @click="api.toggleAgreeNote(n.id)"
                  >
                    <ThumbsUp :size="14" />同意 {{ n.agreeIds.length }}
                  </button>
                  <button @click="startReply(n)">回覆</button>
                  <button :disabled="!!busy" @click="api.hostSupplement(n)">AI 補充</button>
                  <button v-if="n.authorId === USER_ID" aria-label="刪除" @click="deleteNote(n)">
                    <Trash2 :size="14" />
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <form class="ci-input" @submit.prevent="send">
        <div v-if="inputAnchor" class="ci-anchor">
          <template v-if="replyTo">
            回覆 {{ nameOf(replyTo) }}：{{ shortQuote(replyTo.content) }}
            <button type="button" class="ci-anchor-x" aria-label="取消回覆" @click="replyTo = null"><X :size="14" /></button>
          </template>
          <template v-else>掛在：「{{ shortQuote(inputAnchor.quote) }}」</template>
        </div>
        <div class="ci-input-row">
          <input
            ref="inputEl"
            v-model="draft"
            class="ci-field"
            :placeholder="inputAnchor ? '在這段寫下你的邊註…' : '先回到書裡讀一段'"
            :disabled="!inputAnchor"
            aria-label="邊註"
            enterkeyhint="send"
          />
          <button class="ci-send" type="submit" :disabled="!draft.trim() || !!busy || !inputAnchor" aria-label="送出">
            <Send :size="18" />
          </button>
        </div>
      </form>
    </template>
  </BookPlayShell>
</template>

<style scoped lang="scss">
.ci-icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: var(--pl-raise);
  }
}

.ci-sync {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px 0 8px;
  border: 1px solid var(--pl-line);
  border-radius: 18px;
  background: transparent;
  color: var(--pl-sub);
  font-size: 13px;
  white-space: nowrap;
  cursor: pointer;

  &.on {
    color: var(--pl-text);
    font-weight: 700;
  }
}

.ci-switch {
  position: relative;
  width: 28px;
  height: 16px;
  border-radius: 8px;
  background: var(--pl-line);
  transition: background 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--rd-bg, #fff);
    transition: transform 0.2s;
  }

  .on & {
    background: var(--pl-accent);

    &::after {
      transform: translateX(12px);
    }
  }
}

// ===== 共用 =====
.ci-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pl-accent) 30%, var(--pl-raise));
  color: var(--pl-text);
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  &.sm {
    width: 30px;
    height: 30px;
    font-size: 13px;
  }

  &.lg {
    width: 56px;
    height: 56px;
    font-size: 20px;
  }

  &.host {
    background: var(--pl-text);
    color: var(--rd-bg, #fff);
  }
}

.ci-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--pl-sub);
}

.ci-hint {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--pl-sub);
}

.ci-field {
  width: 100%;
  min-width: 0;
  height: 44px;
  box-sizing: border-box;
  padding: 0 16px;
  border: 1px solid var(--pl-line);
  border-radius: 22px;
  background: transparent;
  color: var(--pl-text);
  font-family: inherit;
  font-size: 16px;
  outline: none;

  &:focus {
    border-color: var(--pl-accent);
  }
}

.ci-primary,
.ci-ghost {
  height: 48px;
  padding: 0 20px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.ci-primary {
  flex: 1;
  border: none;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
}

.ci-ghost {
  border: 1px solid var(--pl-line);
  background: transparent;
  color: var(--pl-text);

  &.sm {
    height: 36px;
    padding: 0 14px;
    font-size: 13px;
    font-weight: 500;
  }
}

// ===== 建立 =====
.ci-setup {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 20px 4px;
}

.ci-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
}

.ci-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 4px;
  border: 1px solid transparent;
  border-radius: 18px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &.on {
    border-color: var(--pl-accent);
    background: color-mix(in srgb, var(--pl-accent) 14%, transparent);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.ci-check {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
}

.ci-pick-name {
  max-width: 100%;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-segment {
  display: flex;
  padding: 3px;
  border-radius: 22px;
  background: var(--pl-raise);

  button {
    flex: 1;
    height: 38px;
    border: none;
    border-radius: 19px;
    background: transparent;
    color: var(--pl-sub);
    font-size: 14px;
    cursor: pointer;

    &.active {
      background: var(--pl-text);
      color: var(--rd-bg, #fff);
      font-weight: 700;
    }
  }
}

.ci-setup-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
  padding-top: 8px;
}

// ===== 主畫面 =====
.ci-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 20px 12px;
}

.ci-members {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  padding: 4px 0 12px;
  scrollbar-width: none;
}

.ci-member {
  width: 60px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.ci-member-name {
  max-width: 100%;
  font-size: 12px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ci-member-where {
  font-size: 11px;
  color: var(--pl-sub);
  white-space: nowrap;
}

.ci-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border-radius: 22px;
  background: var(--pl-raise);
}

.ci-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--pl-sub);
}

.ci-summary-quote {
  margin: 0;
  font-family: "Noto Serif TC", serif;
  font-size: 15px;
  line-height: 1.6;
}

.ci-stance {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ci-stance-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
}

.ci-stance-claim {
  font-weight: 700;
}

.ci-stance-pct {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: var(--pl-sub);
}

.ci-bar {
  height: 6px;
  border-radius: 3px;
  background: var(--pl-line);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    border-radius: 3px;
    background: var(--pl-accent);
  }

  &.s1 span {
    background: var(--pl-text);
  }
}

.ci-stance-who {
  font-size: 12px;
  color: var(--pl-sub);
}

.ci-summary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ci-busy {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--pl-sub);
  animation: ci-blink 1.2s ease-in-out infinite;
}

@keyframes ci-blink {
  50% {
    opacity: 0.4;
  }
}

.ci-error {
  margin: 12px 0 0;
  font-size: 13px;
  color: var(--color-error, #e53e3e);
}

.ci-empty {
  margin: 40px 0;
  text-align: center;
  font-size: 14px;
  line-height: 1.7;
  color: var(--pl-sub);
}

.ci-group {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--pl-line);
  scroll-margin-top: 8px;
}

.ci-group-quote {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 0 0 0 12px;
  border: none;
  border-left: 3px solid var(--pl-accent);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ci-group-where {
  font-size: 12px;
  color: var(--pl-sub);
}

.ci-group-text {
  font-family: "Noto Serif TC", serif;
  font-size: 15px;
  line-height: 1.7;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ci-thread {
  margin-top: 12px;
}

.ci-note {
  display: flex;
  gap: 10px;
  padding: 6px 0;

  &.reply {
    margin-left: 40px;
  }
}

.ci-note-body {
  flex: 1;
  min-width: 0;
}

.ci-note-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.ci-note-name {
  font-size: 14px;
  font-weight: 700;
}

.ci-note-time {
  font-size: 11px;
  color: var(--pl-sub);
}

.ci-note-text {
  margin: 2px 0 0;
  font-size: 15px;
  line-height: 1.7;
  white-space: pre-wrap;

  .host & {
    color: var(--pl-sub);
  }
}

.ci-note-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  margin-left: -8px;

  button {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    border: none;
    border-radius: 18px;
    background: transparent;
    color: var(--pl-sub);
    font-size: 12px;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--pl-raise);
    }

    &.on {
      color: var(--pl-text);
      font-weight: 700;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}

.ci-input {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 16px 0;
  border-top: 1px solid var(--pl-line);
}

.ci-anchor {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 0 4px;
  font-size: 12px;
  color: var(--pl-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ci-anchor-x {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.ci-input-row {
  display: flex;
  gap: 8px;
}

.ci-send {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 22px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>
