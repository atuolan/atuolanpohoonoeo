<script setup lang="ts">
/**
 * 發噗面板：身分、發語詞、內容（@ 建議／媒體）、預覽、可見範圍與回應設定
 * state 由外層建立並以 reactive 物件傳入，這裡直接改它的欄位
 */
import { computed, nextTick, ref, watch } from "vue";
import { AtSign, Globe, ImagePlus, Lock, Smile, Users, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import { plurkPlainText } from "@/utils/plurkContent";
import {
  FREESTYLE,
  PLURK_QUALIFIERS,
  getQualifierColor,
  normalizeQualifier,
} from "@/utils/plurkQualifiers";
import type {
  ComposeState,
  MentionCandidate,
  PersonaOption,
  PickerCharacter,
} from "@/components/plurk/types";

const props = withDefaults(
  defineProps<{
    open: boolean;
    state: ComposeState;
    canPost: boolean;
    personas: PersonaOption[];
    currentPersonaId: string | null;
    /** 私噗可選的角色（全部角色） */
    viewerCandidates: PickerCharacter[];
    /** 「我指定」可選的角色（看得到的） */
    responderCandidates: PickerCharacter[];
    mentionCandidates: MentionCandidate[];
    posting: boolean;
  }>(),
  {
    canPost: false,
    personas: () => [],
    currentPersonaId: null,
    viewerCandidates: () => [],
    responderCandidates: () => [],
    mentionCandidates: () => [],
    posting: false,
  },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "submit"): void;
  (e: "switchPersona", id: string): void;
  (e: "addFiles", files: FileList): void;
  (e: "removeMedia", index: number): void;
  (e: "openSticker"): void;
  (e: "editPrivateTo"): void;
  (e: "editResponders"): void;
}>();

const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const savedSelection = ref<{ start: number; end: number } | null>(null);

/* ---------- 人設 ---------- */
const currentPersona = computed(
  () => props.personas.find((persona) => persona.id === props.currentPersonaId) ?? null,
);
const previewPersonaName = computed(() => currentPersona.value?.name ?? "我");

/* ---------- 發語詞 ---------- */
const currentQualifier = computed(() => normalizeQualifier(props.state.qualifier));
const isFreestyle = computed(() => currentQualifier.value === FREESTYLE);

function accentOf(label: string): string {
  return getQualifierColor(label) ?? "var(--color-text-secondary)";
}

function pickQualifier(label: string) {
  props.state.qualifier = label;
}

/* ---------- 內文與 @ 建議 ---------- */
const charCount = computed(() => props.state.content.length);
const countClass = computed(() => ({
  "is-warn": charCount.value > 340 && charCount.value <= 360,
  "is-over": charCount.value > 360,
}));

const mentionQuery = ref<string | null>(null);
const mentionStart = ref(0);
let blurTimer: number | null = null;

const mentionOptions = computed(() => {
  if (mentionQuery.value === null) return [];
  const query = mentionQuery.value.toLowerCase();
  return props.mentionCandidates
    .filter(
      (candidate) =>
        !query ||
        candidate.name.toLowerCase().includes(query) ||
        candidate.id.toLowerCase().includes(query),
    )
    .slice(0, 6);
});

function updateMentionQuery(el: HTMLTextAreaElement) {
  const caret = el.selectionStart ?? el.value.length;
  const match = el.value.slice(0, caret).match(/@([^\s@]*)$/);
  if (!match) {
    mentionQuery.value = null;
    return;
  }
  mentionStart.value = caret - match[0].length;
  mentionQuery.value = match[1];
}

function rememberCaret(el: HTMLTextAreaElement) {
  savedSelection.value = {
    start: el.selectionStart ?? el.value.length,
    end: el.selectionEnd ?? el.value.length,
  };
}

function onContentInput(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  props.state.content = el.value;
  rememberCaret(el);
  updateMentionQuery(el);
}

function onContentSelect(event: Event) {
  const el = event.target as HTMLTextAreaElement;
  rememberCaret(el);
  updateMentionQuery(el);
}

function clearBlurTimer() {
  if (blurTimer !== null) {
    window.clearTimeout(blurTimer);
    blurTimer = null;
  }
}

function onContentBlur(event: Event) {
  rememberCaret(event.target as HTMLTextAreaElement);
  clearBlurTimer();
  blurTimer = window.setTimeout(() => {
    mentionQuery.value = null;
    blurTimer = null;
  }, 120);
}

function pickMention(candidate: MentionCandidate) {
  clearBlurTimer();
  const el = textareaRef.value;
  const text = props.state.content;
  const end = el?.selectionStart ?? text.length;
  const next = `${text.slice(0, mentionStart.value)}@${candidate.name} ${text.slice(end)}`;
  const caret = mentionStart.value + candidate.name.length + 2;
  mentionQuery.value = null;
  props.state.content = next;
  nextTick(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
    rememberCaret(el);
  });
}

function insertText(text: string) {
  clearBlurTimer();
  const el = textareaRef.value;
  const content = props.state.content;
  const active = !!el && document.activeElement === el;
  const fallbackEnd = content.length;
  const start = active
    ? (el.selectionStart ?? fallbackEnd)
    : (savedSelection.value?.start ?? fallbackEnd);
  const end = active
    ? (el.selectionEnd ?? start)
    : (savedSelection.value?.end ?? start);
  const next = content.slice(0, start) + text + content.slice(end);
  const caret = start + text.length;
  mentionQuery.value = null;
  props.state.content = next;
  nextTick(() => {
    if (!el) return;
    el.focus();
    el.setSelectionRange(caret, caret);
    rememberCaret(el);
  });
}

function insertAtSign() {
  insertText("@");
  nextTick(() => {
    if (textareaRef.value) updateMentionQuery(textareaRef.value);
  });
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    emit("addFiles", input.files);
  }
  // 等外層同步讀完 FileList 再清空，才能重選同一個檔案
  window.setTimeout(() => {
    input.value = "";
  }, 0);
}

watch(
  () => props.state.content,
  (text) => {
    if (mentionQuery.value === null) return;
    const ch = text.charAt(mentionStart.value);
    if (ch !== "@") mentionQuery.value = null;
  },
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      clearBlurTimer();
      mentionQuery.value = null;
    }
  },
);

/* ---------- 預覽 ---------- */
const previewText = computed(() => plurkPlainText(props.state.content, 30) || "開始說點什麼…");

/* ---------- 誰看得到 ---------- */
const audiences: Array<{ id: "all" | "friends" | "private"; label: string; sub: string }> = [
  { id: "all", label: "全員", sub: "所有好友的河道" },
  { id: "friends", label: "好友", sub: "只出現在好友河道" },
  { id: "private", label: "私噗", sub: "只給選定的人" },
];

const privateCount = computed(() => props.state.privateTo.length);

function pickAudience(id: "all" | "friends" | "private") {
  props.state.audience = id;
}

function audienceSub(id: "all" | "friends" | "private"): string {
  if (id === "private" && props.state.audience === "private") {
    return `給 ${privateCount.value} 人 · 修改`;
  }
  return audiences.find((audience) => audience.id === id)?.sub ?? "";
}

/* ---------- 誰會來回應 ---------- */
const replyPolicies = [
  { id: "ai", label: "讓 AI 挑" },
  { id: "pick", label: "我指定" },
  { id: "none", label: "不要回應" },
] as const;

const replyHint = computed(() => {
  if (props.state.replyPolicy === "pick") return "只有選到的角色會回應";
  if (props.state.replyPolicy === "none") return "這則噗不會有 AI 回應";
  return "角色和路人都可能來";
});

function pickReplyPolicy(id: "ai" | "pick" | "none") {
  props.state.replyPolicy = id;
}

const selectedResponders = computed(() => {
  const selected = new Set(props.state.replyPickIds);
  return props.responderCandidates.filter((character) => selected.has(character.id));
});

/* ---------- 開關 ---------- */
const passerbyOn = computed(
  () => props.state.audience === "all" && props.state.allowPasserby,
);
const passerbyDisabled = computed(() => props.state.audience !== "all");

function togglePasserby() {
  if (passerbyDisabled.value) return;
  props.state.allowPasserby = !props.state.allowPasserby;
}

function toggleSlowReplies() {
  props.state.slowReplies = !props.state.slowReplies;
}

defineExpose({ insertText });
</script>

<template>
  <Teleport to="body">
    <Transition name="compose-dim-fade">
      <div v-if="props.open" class="plurk-dim" @click="emit('close')"></div>
    </Transition>

    <Transition name="compose-sheet-rise">
      <section
        v-if="props.open"
        class="compose-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="發噗"
      >
        <span class="sheet-handle" aria-hidden="true"></span>

        <header class="sheet-head">
          <button type="button" class="cancel-btn" @click="emit('close')">取消</button>
          <span class="sheet-title">發噗</span>
          <button
            type="button"
            class="send-btn"
            :disabled="!props.canPost || props.posting"
            @click="emit('submit')"
          >
            發出
          </button>
        </header>

        <div v-if="props.personas.length" class="persona-row">
          <span class="persona-label">以</span>
          <button
            v-for="persona in props.personas"
            :key="persona.id"
            type="button"
            class="persona-chip"
            :class="{ 'is-on': persona.id === props.currentPersonaId }"
            :aria-pressed="persona.id === props.currentPersonaId"
            :aria-label="`以${persona.name}的身分發噗`"
            @click="emit('switchPersona', persona.id)"
          >
            <PlurkAvatar :src="persona.avatar" :name="persona.name" :size="28" />
            <span class="persona-name">{{ persona.name }}</span>
          </button>
          <span class="persona-label">的身分</span>
        </div>

        <div class="qual-row" role="group" aria-label="選擇發語詞">
          <button
            type="button"
            class="qual-btn qual-btn--free"
            :class="{ 'is-on': isFreestyle }"
            :aria-pressed="isFreestyle"
            style="--q-color: var(--color-text)"
            @click="pickQualifier(FREESTYLE)"
          >
            <span class="qual-pill">自由發揮</span>
          </button>
          <button
            v-for="qualifier in PLURK_QUALIFIERS"
            :key="qualifier.label"
            type="button"
            class="qual-btn"
            :class="{ 'is-on': currentQualifier === qualifier.label }"
            :aria-pressed="currentQualifier === qualifier.label"
            :style="{ '--q-color': accentOf(qualifier.label) }"
            @click="pickQualifier(qualifier.label)"
          >
            <span class="qual-pill">{{ qualifier.label }}</span>
          </button>
        </div>

        <div class="composer">
          <label class="sr-only" for="plurk-compose-content">噗文內容</label>
          <div class="textarea-wrap">
            <textarea
              id="plurk-compose-content"
              ref="textareaRef"
              class="compose-textarea"
              :value="props.state.content"
              maxlength="360"
              placeholder="你在做什麼？"
              rows="4"
              @input="onContentInput"
              @select="onContentSelect"
              @click="onContentSelect"
              @keyup="onContentSelect"
              @blur="onContentBlur"
            ></textarea>

            <div v-if="mentionOptions.length" class="mention-pop" role="listbox" aria-label="標記角色">
              <button
                v-for="candidate in mentionOptions"
                :key="candidate.id"
                type="button"
                class="mention-item"
                role="option"
                :aria-selected="false"
                @click="pickMention(candidate)"
              >
                <PlurkAvatar :src="candidate.avatar" :name="candidate.name" :size="24" />
                <span class="mention-name">{{ candidate.name }}</span>
              </button>
            </div>
          </div>

          <div class="composer-tools">
            <button
              type="button"
              class="tool-btn"
              aria-label="加入圖片或影片"
              @click="openFilePicker"
            >
              <ImagePlus :size="20" aria-hidden="true" />
            </button>
            <button type="button" class="tool-btn" aria-label="插入 @ 標記" @click="insertAtSign">
              <AtSign :size="20" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="tool-btn"
              aria-label="加入貼圖"
              @click="emit('openSticker')"
            >
              <Smile :size="20" aria-hidden="true" />
            </button>
            <span class="char-count" :class="countClass">{{ charCount }}/360</span>
          </div>

          <div v-if="props.state.media.length" class="media-grid">
            <div v-for="(item, index) in props.state.media" :key="`${item.url}-${index}`" class="media-cell">
              <video
                v-if="item.type === 'video'"
                :src="item.url"
                muted
                playsinline
                preload="metadata"
              ></video>
              <img v-else :src="item.url" alt="" loading="lazy" />
              <button
                type="button"
                class="media-remove"
                :aria-label="`移除第 ${index + 1} 個媒體`"
                @click="emit('removeMedia', index)"
              >
                <X :size="14" aria-hidden="true" />
              </button>
            </div>
          </div>

          <input
            ref="fileInputRef"
            type="file"
            accept="image/*,video/*"
            multiple
            class="file-input"
            tabindex="-1"
            aria-hidden="true"
            @change="onFilesPicked"
          />
        </div>

        <div class="preview-row">
          <span class="preview-label">預覽</span>
          <span class="preview-pill">
            <PlurkAvatar
              :src="currentPersona?.avatar"
              :name="previewPersonaName"
              :size="26"
            />
            <QualifierChip :qualifier="props.state.qualifier" size="sm" />
            <span class="preview-text">{{ previewText }}</span>
          </span>
        </div>

        <div class="section">
          <span class="section-title">誰看得到</span>
          <div class="audience-grid">
            <div
              v-for="audience in audiences"
              :key="audience.id"
              class="aud-card"
              :class="{ 'is-on': props.state.audience === audience.id }"
            >
              <button
                type="button"
                class="aud-hit"
                :aria-pressed="props.state.audience === audience.id"
                :aria-label="`${audience.label}，${audienceSub(audience.id)}`"
                @click="pickAudience(audience.id)"
              ></button>
              <Globe v-if="audience.id === 'all'" :size="20" class="aud-icon" aria-hidden="true" />
              <Users
                v-else-if="audience.id === 'friends'"
                :size="20"
                class="aud-icon"
                aria-hidden="true"
              />
              <Lock v-else :size="20" class="aud-icon" aria-hidden="true" />
              <span class="aud-text">
                <span class="aud-label">{{ audience.label }}</span>
                <button
                  v-if="audience.id === 'private' && props.state.audience === 'private'"
                  type="button"
                  class="aud-sub aud-sub--action"
                  @click="emit('editPrivateTo')"
                >
                  {{ audienceSub(audience.id) }}
                </button>
                <span v-else class="aud-sub">{{ audienceSub(audience.id) }}</span>
              </span>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-head">
            <span class="section-title">誰會來回應</span>
            <span class="section-hint">{{ replyHint }}</span>
          </div>
          <div class="reply-seg" role="group" aria-label="誰會來回應">
            <button
              v-for="policy in replyPolicies"
              :key="policy.id"
              type="button"
              class="reply-seg-btn"
              :class="{ 'is-on': props.state.replyPolicy === policy.id }"
              :aria-pressed="props.state.replyPolicy === policy.id"
              @click="pickReplyPolicy(policy.id)"
            >
              {{ policy.label }}
            </button>
          </div>

          <div v-if="props.state.replyPolicy === 'pick'" class="pick-area">
            <div class="pick-chips">
              <span
                v-for="character in selectedResponders"
                :key="character.id"
                class="pick-chip"
              >
                <PlurkAvatar :src="character.avatar" :name="character.name" :size="26" />
                <span class="pick-name">{{ character.name }}</span>
              </span>
              <span v-if="!selectedResponders.length" class="pick-empty">尚未選擇角色</span>
            </div>
            <button type="button" class="pick-edit-btn" @click="emit('editResponders')">
              選擇角色
            </button>
          </div>
        </div>

        <div class="switch-row">
          <span class="switch-text">
            <span class="switch-label">讓路人也來回應</span>
            <span class="switch-sub">只在全員時有效</span>
          </span>
          <button
            type="button"
            class="switch-btn"
            :class="{ 'is-on': passerbyOn }"
            role="switch"
            :aria-checked="passerbyOn"
            aria-label="讓路人也來回應"
            :disabled="passerbyDisabled"
            @click="togglePasserby"
          >
            <span class="switch-knob"></span>
          </button>
        </div>

        <div class="switch-row">
          <span class="switch-text">
            <span class="switch-label">像真人一樣慢慢回</span>
            <span class="switch-sub">回應會在 3–20 分鐘內陸續出現</span>
          </span>
          <button
            type="button"
            class="switch-btn"
            :class="{ 'is-on': props.state.slowReplies }"
            role="switch"
            :aria-checked="props.state.slowReplies"
            aria-label="像真人一樣慢慢回"
            @click="toggleSlowReplies"
          >
            <span class="switch-knob"></span>
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-dim {
  @include plurk-dim;
}

.compose-sheet {
  position: fixed;
  z-index: 1201;
  top: 44px;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-sizing: border-box;
  padding: 6px 20px calc(20px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  border-radius: 26px 26px 0 0;
  background: var(--color-surface);
  color: var(--color-text);
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.compose-sheet > * {
  flex-shrink: 0;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
}

.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 44px;
}

.cancel-btn {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}

.sheet-title {
  font-size: 16px;
  font-weight: 700;
}

.send-btn {
  position: relative;
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 18px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -4px;
  }

  &:disabled {
    background: var(--color-surface-hover);
    color: var(--color-text-muted);
    cursor: default;
  }
}

/* ---------- 人設 ---------- */
.persona-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.persona-label {
  line-height: 1.4;
}

.persona-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 12px 0 6px;
  border: 1px solid var(--color-border);
  border-radius: 22px;
  background: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  opacity: 0.7;
  cursor: pointer;

  &.is-on {
    border: 2px solid var(--color-text);
    background: var(--color-surface-hover);
    font-weight: 700;
    opacity: 1;
  }
}

.persona-name {
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 發語詞 ---------- */
.qual-row {
  display: flex;
  gap: 6px;
  margin: 0 -20px;
  padding: 0 20px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.qual-btn {
  display: flex;
  align-items: center;
  height: 44px;
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: none;
  font-family: inherit;
  cursor: pointer;

  &:focus-visible .qual-pill {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.qual-pill {
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 12px;
  box-sizing: border-box;
  border: 1.5px solid var(--q-color);
  border-radius: 10px;
  color: var(--q-color);
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}

.qual-btn.is-on .qual-pill {
  border-color: var(--q-color);
  background: var(--q-color);
  color: #ffffff;
}

.qual-btn--free.is-on .qual-pill {
  color: var(--color-background);
}

/* ---------- 內文 ---------- */
.composer {
  position: relative;
  display: flex;
  flex-direction: column;
}

.textarea-wrap {
  position: relative;
}

.compose-textarea {
  display: block;
  width: 100%;
  height: 96px;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.6;
  resize: none;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px rgba(var(--color-primary-rgb), 0.15);
  }
}

.mention-pop {
  position: absolute;
  z-index: 4;
  top: calc(100% + 4px);
  left: 8px;
  right: 8px;
  max-height: 220px;
  padding: 4px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  box-shadow: 0 10px 24px var(--color-border);
  overflow-y: auto;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px;
  box-sizing: border-box;
  border: none;
  border-radius: 10px;
  background: none;
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover,
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

.composer-tools {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-top: 4px;
}

.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.char-count {
  margin-left: auto;
  padding-right: 2px;
  font-size: 12px;
  color: var(--color-text-secondary);

  &.is-warn {
    color: #c08a1e;
  }

  &.is-over {
    color: var(--color-error);
  }
}

.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 8px;
  padding-top: 8px;
}

.media-cell {
  position: relative;
  height: 76px;
  border-radius: 12px;
  overflow: hidden;
  background: var(--color-surface-hover);

  img,
  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.media-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-text);
  color: var(--color-background);
  font-family: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -8px;
  }
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ---------- 預覽 ---------- */
.preview-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preview-label {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.preview-pill {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 36px;
  padding: 0 12px 0 5px;
  box-sizing: border-box;
  border-radius: 18px;
  background: var(--color-surface-hover);
  white-space: nowrap;

  :deep(.qualifier-chip) {
    margin-right: 0;
  }
}

.preview-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
}

/* ---------- 區塊 ---------- */
.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.section-title {
  font-size: 13px;
  font-weight: 700;
}

.section-hint {
  font-size: 11px;
  color: var(--color-text-secondary);
}

/* ---------- 誰看得到 ---------- */
.audience-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.aud-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 8px 12px;
  box-sizing: border-box;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: var(--color-surface);
  text-align: left;

  &.is-on {
    border: 2px solid var(--color-text);
    background: var(--color-surface-hover);
  }
}

.aud-hit {
  position: absolute;
  z-index: 0;
  inset: 0;
  padding: 0;
  border: none;
  border-radius: 13px;
  background: none;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }
}

.aud-icon {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  color: var(--color-text-secondary);
  pointer-events: none;
}

.aud-card.is-on .aud-icon {
  color: var(--color-text);
}

.aud-text {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.3;
  pointer-events: none;
}

.aud-label {
  font-size: 14px;
  font-weight: 700;
}

.aud-sub {
  font-size: 11px;
  color: var(--color-text-secondary);
}

.aud-sub--action {
  position: relative;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 11px;
  line-height: 1.3;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  pointer-events: auto;
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -15px -6px;
  }
}

/* ---------- 誰會來回應 ---------- */
.reply-seg {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  padding: 3px;
  border-radius: 12px;
  background: var(--color-surface-hover);
}

.reply-seg-btn {
  height: 44px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--color-text);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;

  &.is-on {
    background: var(--color-surface);
    font-weight: 700;
    box-shadow: 0 1px 4px var(--color-border);
  }
}

.pick-area {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.pick-chips {
  display: flex;
  flex: 1;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.pick-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 44px;
  padding: 0 12px 0 5px;
  border: 1.5px solid var(--color-text);
  border-radius: 22px;
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
}

.pick-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pick-empty {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.pick-edit-btn {
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 22px;
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

/* ---------- 開關列 ---------- */
.switch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  border-top: 1px solid var(--color-border);
}

.switch-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  line-height: 1.4;
}

.switch-label {
  font-size: 14px;
  font-weight: 700;
}

.switch-sub {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.switch-btn {
  position: relative;
  flex-shrink: 0;
  width: 52px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 16px;
  background: var(--color-border);
  cursor: pointer;

  &::after {
    content: "";
    position: absolute;
    inset: -6px;
  }

  &.is-on {
    background: var(--color-primary);
  }

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.switch-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 26px;
  height: 26px;
  border-radius: 13px;
  background: #ffffff;
  box-shadow: 0 1px 3px var(--color-border);
  transition: transform 0.16s ease;
}

.switch-btn.is-on .switch-knob {
  transform: translateX(20px);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

/* ---------- 夜晚：未選發語詞的文字改用一般文字色 ---------- */
body.is-night-mode .qual-btn:not(.is-on) .qual-pill {
  color: var(--color-text);
}

/* ---------- 動畫 ---------- */
.compose-dim-fade-enter-active,
.compose-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.compose-dim-fade-enter-from,
.compose-dim-fade-leave-to {
  opacity: 0;
}

.compose-sheet-rise-enter-active,
.compose-sheet-rise-leave-active {
  transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}

.compose-sheet-rise-enter-from,
.compose-sheet-rise-leave-to {
  transform: translateY(100%);
}
</style>
