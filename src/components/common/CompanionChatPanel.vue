<script setup lang="ts">
/**
 * 伴讀聊天面板
 * 放在閱讀器的底部抽屜裡，顏色跟著閱讀背景（--rd-*）走
 */

import type { CompanionMessage } from "@/types/book";
import { ArrowUp, ChevronDown, Settings2 } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";

interface Props {
  characterName: string;
  characterAvatar?: string;
  bookTitle: string;
  messages: CompanionMessage[];
  isGenerating: boolean;
  triggerFrequency: number;
  /** 預先放進輸入框的文字（從劃線「問角色」帶過來的引文） */
  draft?: string;
  /** 上一次沒回應的原因 */
  error?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "stop"): void;
  (e: "send", content: string): void;
  (e: "update:triggerFrequency", value: number): void;
}>();

const inputText = ref("");
const showSettings = ref(false);
const messageListRef = ref<HTMLElement | null>(null);

const FREQUENCY_OPTIONS = [1, 3, 5, 10];

interface Bubble {
  key: string;
  role: "user" | "assistant";
  text: string;
  /** 同一則訊息的第一個氣泡才顯示頭像與時間 */
  first: boolean;
  time: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

// 角色回覆是一行一句的聊天格式，拆成一個個氣泡
const bubbles = computed<Bubble[]>(() =>
  props.messages.flatMap((m) => {
    const lines =
      m.role === "assistant"
        ? m.content.split("\n").map((l) => l.trim()).filter(Boolean)
        : [m.content];
    return lines.map((text, i) => ({
      key: `${m.id}-${i}`,
      role: m.role,
      text,
      first: i === 0,
      time: formatTime(m.timestamp),
    }));
  }),
);

const avatarInitial = computed(() => props.characterName.slice(0, 1) || "書");

function handleSend() {
  const text = inputText.value.trim();
  if (!text || props.isGenerating) return;
  emit("send", text);
  inputText.value = "";
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    handleSend();
  }
}

function selectFrequency(n: number) {
  emit("update:triggerFrequency", n);
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
}

const inputEl = ref<HTMLInputElement | null>(null);

watch(() => bubbles.value.length, scrollToBottom);
watch(() => props.isGenerating, scrollToBottom);
watch(
  () => props.draft,
  (draft) => {
    if (!draft) return;
    inputText.value = draft;
    nextTick(() => {
      inputEl.value?.focus();
      inputEl.value?.setSelectionRange(draft.length, draft.length);
    });
  },
  { immediate: true },
);
onMounted(scrollToBottom);
</script>

<template>
  <div class="cc-panel">
    <header class="cc-header">
      <span class="cc-avatar" aria-hidden="true">
        <img v-if="characterAvatar" :src="characterAvatar" alt="" />
        <span v-else>{{ avatarInitial }}</span>
      </span>
      <div class="cc-title">
        <span class="cc-name">{{ characterName }}</span>
        <span class="cc-book">陪你讀《{{ bookTitle }}》</span>
      </div>
      <button
        class="cc-icon-btn"
        :class="{ on: showSettings }"
        aria-label="伴讀設定"
        :aria-expanded="showSettings"
        @click="showSettings = !showSettings"
      >
        <Settings2 :size="18" />
      </button>
      <button class="cc-icon-btn" aria-label="收起伴讀" @click="emit('close')">
        <ChevronDown :size="20" />
      </button>
    </header>

    <Transition name="cc-fold">
      <div v-if="showSettings" class="cc-settings">
        <div class="cc-setting-row">
          <span class="cc-setting-label">翻幾頁說一次話</span>
          <div class="cc-segment" role="radiogroup" aria-label="翻頁觸發頻率">
            <button
              v-for="n in FREQUENCY_OPTIONS"
              :key="n"
              role="radio"
              :aria-checked="triggerFrequency === n"
              :class="{ active: triggerFrequency === n }"
              @click="selectFrequency(n)"
            >
              {{ n }}
            </button>
          </div>
        </div>
        <button class="cc-stop" @click="emit('stop')">結束伴讀</button>
        <p class="cc-setting-hint">結束後，這次的對話會存成一張共讀卡放進你們的私聊。</p>
      </div>
    </Transition>

    <div ref="messageListRef" class="cc-list">
      <div v-if="bubbles.length === 0 && !isGenerating" class="cc-empty">
        <p>{{ characterName }} 已經坐到你旁邊了</p>
        <p class="sub">每翻 {{ triggerFrequency }} 頁會聊聊剛讀到的內容，也可以直接問</p>
      </div>

      <div
        v-for="b in bubbles"
        :key="b.key"
        class="cc-row"
        :class="[b.role === 'user' ? 'is-user' : 'is-ai', { 'is-first': b.first }]"
      >
        <span v-if="b.role === 'assistant'" class="cc-row-avatar" aria-hidden="true">
          <template v-if="b.first">
            <img v-if="characterAvatar" :src="characterAvatar" alt="" />
            <span v-else>{{ avatarInitial }}</span>
          </template>
        </span>
        <div class="cc-bubble">{{ b.text }}</div>
      </div>

      <div v-if="isGenerating" class="cc-row is-ai is-first">
        <span class="cc-row-avatar" aria-hidden="true">
          <img v-if="characterAvatar" :src="characterAvatar" alt="" />
          <span v-else>{{ avatarInitial }}</span>
        </span>
        <div class="cc-bubble cc-typing" aria-label="正在輸入">
          <i /><i /><i />
        </div>
      </div>

      <p v-if="error && !isGenerating" class="cc-error" role="alert">
        {{ characterName }} 沒有回應：{{ error }}
      </p>
    </div>

    <div class="cc-input">
      <label for="cc-input-field" class="sr-only">對{{ characterName }}說</label>
      <input
        id="cc-input-field"
        ref="inputEl"
        v-model="inputText"
        type="text"
        :placeholder="`問${characterName}這一段…`"
        :disabled="isGenerating"
        enterkeyhint="send"
        @keydown="handleKeydown"
      />
      <button
        class="cc-send"
        aria-label="送出"
        :disabled="!inputText.trim() || isGenerating"
        @click="handleSend"
      >
        <ArrowUp :size="18" />
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cc-panel {
  --cc-text: var(--rd-text, var(--color-text, #2d3748));
  --cc-sub: var(--rd-sub, var(--color-text-secondary, #6b7280));
  --cc-raise: var(--rd-raise, var(--color-surface-hover, #f3f4f6));
  --cc-line: var(--rd-line, var(--color-border, #e5e7eb));
  --cc-accent: var(--rd-accent, var(--color-primary, #7dd3a8));
  --cc-on-accent: var(--rd-on-accent, #0b1f16);
  --cc-accent-soft: var(--rd-accent-soft, rgba(125, 211, 168, 0.2));

  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  color: var(--cc-text);
}

.cc-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 10px 16px;
  flex-shrink: 0;
}

.cc-avatar,
.cc-row-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.cc-avatar {
  width: 36px;
  height: 36px;
  background: var(--cc-accent);
  color: var(--cc-on-accent);
  font-size: 14px;
}

.cc-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cc-name {
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc-book {
  font-size: 12px;
  color: var(--cc-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cc-icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: var(--cc-sub);
  cursor: pointer;

  &.on,
  &:hover {
    background: var(--cc-raise);
    color: var(--cc-text);
  }
}

// ===== 設定 =====
.cc-settings {
  margin: 0 16px 10px;
  padding: 14px;
  border-radius: 18px;
  background: var(--cc-raise);
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.cc-setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cc-setting-label {
  font-size: 13px;
  font-weight: 500;
}

.cc-segment {
  display: flex;
  padding: 3px;
  border-radius: 18px;
  background: var(--cc-line);

  button {
    min-width: 40px;
    height: 32px;
    border: none;
    border-radius: 16px;
    background: transparent;
    color: var(--cc-sub);
    font-size: 13px;
    cursor: pointer;

    &.active {
      background: var(--cc-accent);
      color: var(--cc-on-accent);
      font-weight: 700;
    }
  }
}

.cc-stop {
  height: 40px;
  border-radius: 20px;
  border: 1px solid color-mix(in srgb, var(--color-error, #c2413b) 45%, transparent);
  background: transparent;
  color: var(--color-error, #c2413b);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

.cc-setting-hint {
  margin: -4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--cc-sub);
}

.cc-fold-enter-active,
.cc-fold-leave-active {
  transition:
    opacity 0.18s,
    transform 0.18s;
}
.cc-fold-enter-from,
.cc-fold-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// ===== 訊息 =====
.cc-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overscroll-behavior: contain;
}

.cc-empty {
  margin: auto;
  text-align: center;
  padding: 24px 12px;

  p {
    margin: 0;
    font-size: 15px;
    font-weight: 500;
  }

  .sub {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 400;
    line-height: 1.6;
    color: var(--cc-sub);
  }
}

.cc-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;

  &.is-first {
    margin-top: 8px;
  }

  &.is-user {
    justify-content: flex-end;
  }
}

.cc-row-avatar {
  width: 28px;
  height: 28px;
  align-self: flex-start;
  font-size: 12px;

  &:not(:empty) {
    background: var(--cc-accent);
    color: var(--cc-on-accent);
  }
}

.cc-bubble {
  max-width: 78%;
  padding: 9px 13px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;

  .is-ai & {
    background: var(--cc-raise);
    border-top-left-radius: 6px;
  }

  .is-user & {
    background: var(--cc-accent-soft);
    border-top-right-radius: 6px;
  }
}

.cc-typing {
  display: flex;
  gap: 4px;
  padding: 14px 16px;

  i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cc-sub);
    animation: cc-dot 1.2s infinite ease-in-out;

    &:nth-child(2) {
      animation-delay: 0.15s;
    }
    &:nth-child(3) {
      animation-delay: 0.3s;
    }
  }
}

@keyframes cc-dot {
  0%,
  80%,
  100% {
    opacity: 0.3;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-3px);
  }
}

.cc-error {
  margin: 10px auto 0;
  padding: 8px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error, #e53e3e) 12%, transparent);
  color: var(--color-error, #e53e3e);
  font-size: 13px;
  line-height: 1.5;
  text-align: center;
}

// ===== 輸入 =====
.cc-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 12px 0;
  padding: 5px 5px 5px 18px;
  border-radius: 27px;
  background: var(--cc-raise);
  flex-shrink: 0;

  input {
    flex: 1;
    min-width: 0;
    height: 44px;
    border: none;
    background: transparent;
    color: var(--cc-text);
    font-family: inherit;
    font-size: 16px;
    outline: none;

    &::placeholder {
      color: var(--cc-sub);
    }
  }
}

.cc-send {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cc-accent);
  color: var(--cc-on-accent);
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
</style>
