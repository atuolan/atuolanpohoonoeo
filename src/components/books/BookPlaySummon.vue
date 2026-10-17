<script setup lang="ts">
/**
 * 07 召喚作者：跟這本書的作者聊天，可以切原味／白話，也可以再叫一位客人來抬槓
 * 對話存在該書的閱讀紀錄裡
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { askAI } from "@/services/BookAIService";
import { buildSummonPrompt, type SummonMessage, type SummonStyle } from "@/services/bookPlay";
import { useBooksStore } from "@/stores/books";
import type { StoredBook } from "@/types/book";
import { ArrowUp, UserPlus, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref } from "vue";

const props = defineProps<{
  book: StoredBook;
  readingText: string;
  userName: string;
}>();
const emit = defineEmits<{ close: [] }>();

const booksStore = useBooksStore();
const saved = computed(() => booksStore.progressByBook[props.book.id]?.play?.summon);

const author = ref(saved.value?.author || props.book.author || "");
const authorDraft = ref(author.value);
const style = ref<SummonStyle>(saved.value?.style ?? "modern");
const guest = ref(saved.value?.guest ?? "");
const messages = ref<SummonMessage[]>(saved.value?.messages ? [...saved.value.messages] : []);
const input = ref("");
const guestDraft = ref("");
const showGuestInput = ref(false);
const isThinking = ref("");
const error = ref("");
const listEl = ref<HTMLElement | null>(null);

function scrollToBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
  });
}
onMounted(scrollToBottom);

function persist() {
  return booksStore.patchProgress(props.book.id, (current) => ({
    play: {
      ...current?.play,
      summon: {
        author: author.value,
        style: style.value,
        guest: guest.value || undefined,
        messages: messages.value.slice(-60),
      },
    },
  }));
}

function confirmAuthor() {
  const name = authorDraft.value.trim();
  if (!name) return;
  author.value = name;
  persist();
}

async function speak(speaker: "author" | "guest") {
  isThinking.value = speaker === "author" ? author.value : guest.value;
  scrollToBottom();
  const content = await askAI(
    buildSummonPrompt({
      bookTitle: props.book.title,
      author: author.value,
      readingText: props.readingText,
      style: style.value,
      history: messages.value,
      userName: props.userName,
      speaker,
      guest: guest.value || undefined,
    }),
    { task: "chat", temperature: 0.9 },
  );
  messages.value.push({
    role: speaker,
    name: speaker === "author" ? author.value : guest.value,
    content,
    timestamp: Date.now(),
  });
  scrollToBottom();
}

async function run(task: () => Promise<void>) {
  if (isThinking.value) return;
  error.value = "";
  try {
    await task();
  } catch (e: any) {
    error.value = e?.message || "沒有回應";
  } finally {
    isThinking.value = "";
    await persist();
  }
}

function send() {
  const text = input.value.trim();
  if (!text || isThinking.value) return;
  input.value = "";
  messages.value.push({ role: "user", name: props.userName, content: text, timestamp: Date.now() });
  scrollToBottom();
  run(async () => {
    await speak("author");
    if (guest.value) await speak("guest");
  });
}

function summonGuest() {
  const name = guestDraft.value.trim();
  if (!name) return;
  guest.value = name;
  guestDraft.value = "";
  showGuestInput.value = false;
  run(() => speak("guest"));
}

function dismissGuest() {
  guest.value = "";
  persist();
}

function setStyle(next: SummonStyle) {
  style.value = next;
  persist();
}

function clearChat() {
  if (!confirm(`清空和 ${author.value} 的對話？`)) return;
  messages.value = [];
  persist();
}

function openingLine() {
  run(() => speak("author"));
}

const initial = (name: string) => name.slice(0, 1) || "？";
</script>

<template>
  <BookPlayShell
    title="召喚作者"
    :subtitle="author ? `${author}${guest ? ` ・ ${guest}` : ''}` : book.title"
    @close="emit('close')"
  >
    <template v-if="author" #actions>
      <div class="sm-style" role="radiogroup" aria-label="說話風格">
        <button
          role="radio"
          :aria-checked="style === 'original'"
          :class="{ active: style === 'original' }"
          @click="setStyle('original')"
        >
          原味
        </button>
        <button
          role="radio"
          :aria-checked="style === 'modern'"
          :class="{ active: style === 'modern' }"
          @click="setStyle('modern')"
        >
          白話
        </button>
      </div>
    </template>

    <!-- 還不知道作者是誰 -->
    <div v-if="!author" class="sm-setup">
      <p class="sm-setup-title">要召喚誰？</p>
      <p class="sm-setup-hint">這本書沒有寫作者，告訴我是誰，我就請他出來聊聊。</p>
      <input
        v-model="authorDraft"
        class="sm-field"
        placeholder="例如：莊子、村上春樹"
        @keydown.enter="confirmAuthor"
      />
      <button class="sm-primary" :disabled="!authorDraft.trim()" @click="confirmAuthor">召喚</button>
    </div>

    <template v-else>
      <div ref="listEl" class="sm-list">
        <div class="sm-origin">從《{{ book.title }}》讀到的地方召喚 {{ author }}</div>

        <div v-if="messages.length === 0 && !isThinking" class="sm-empty">
          <p>{{ author }} 已經來了</p>
          <button class="sm-ghost" @click="openingLine">請他先開口</button>
        </div>

        <div
          v-for="(m, i) in messages"
          :key="i"
          class="sm-row"
          :class="`is-${m.role}`"
        >
          <span v-if="m.role !== 'user'" class="sm-avatar" aria-hidden="true">{{ initial(m.name) }}</span>
          <div class="sm-bubble">
            <span v-if="m.role === 'guest'" class="sm-guest-tag">{{ m.name }} 闖進來了</span>
            <span :class="{ classical: style === 'original' && m.role !== 'user' }">{{ m.content }}</span>
          </div>
        </div>

        <div v-if="isThinking" class="sm-row is-author">
          <span class="sm-avatar" aria-hidden="true">{{ initial(isThinking) }}</span>
          <div class="sm-bubble sm-typing">{{ isThinking }} 在想…</div>
        </div>
        <p v-if="error" class="sm-error" role="alert">{{ error }}</p>
      </div>

      <div class="sm-tools">
        <button v-if="!guest && !showGuestInput" class="sm-chip" @click="showGuestInput = true">
          <UserPlus :size="15" />叫一位客人來吵架
        </button>
        <div v-else-if="showGuestInput" class="sm-guest-input">
          <input
            v-model="guestDraft"
            class="sm-field small"
            placeholder="誰？例如：惠施、尼采"
            @keydown.enter="summonGuest"
          />
          <button class="sm-chip" :disabled="!guestDraft.trim()" @click="summonGuest">叫來</button>
          <button class="sm-chip" aria-label="取消" @click="showGuestInput = false"><X :size="15" /></button>
        </div>
        <button v-else class="sm-chip" @click="dismissGuest">請 {{ guest }} 離開</button>
        <button v-if="messages.length" class="sm-chip subtle" @click="clearChat">清空</button>
      </div>

      <div class="sm-input">
        <label for="sm-input-field" class="sr-only">對 {{ author }} 說</label>
        <input
          id="sm-input-field"
          v-model="input"
          :placeholder="`對 ${author} 說…`"
          :disabled="!!isThinking"
          enterkeyhint="send"
          @keydown.enter="send"
        />
        <button class="sm-send" aria-label="送出" :disabled="!input.trim() || !!isThinking" @click="send">
          <ArrowUp :size="18" />
        </button>
      </div>
    </template>
  </BookPlayShell>
</template>

<style scoped lang="scss">
button {
  font-family: inherit;
}

.sm-style {
  display: flex;
  padding: 3px;
  border-radius: 20px;
  background: var(--pl-raise);

  button {
    height: 34px;
    padding: 0 12px;
    border: none;
    border-radius: 17px;
    background: transparent;
    color: var(--pl-sub);
    font-size: 13px;
    cursor: pointer;

    &.active {
      background: var(--pl-text);
      color: var(--rd-bg, #fff);
      font-weight: 700;
    }
  }
}

.sm-setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px 20px;
}

.sm-setup-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.sm-setup-hint {
  margin: 0;
  font-size: 14px;
  color: var(--pl-sub);
  line-height: 1.6;
}

.sm-field {
  height: 48px;
  padding: 0 16px;
  border: 1px solid var(--pl-line);
  border-radius: 24px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 16px;
  outline: none;

  &:focus {
    border-color: var(--pl-accent);
  }

  &.small {
    flex: 1;
    min-width: 0;
    height: 38px;
    font-size: 15px;
  }
}

.sm-primary {
  height: 48px;
  border: none;
  border-radius: 24px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
  }
}

.sm-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overscroll-behavior: contain;
}

.sm-origin {
  align-self: center;
  padding: 4px 12px;
  border-radius: 12px;
  background: var(--pl-raise);
  font-size: 12px;
  color: var(--pl-sub);
}

.sm-empty {
  margin: auto;
  text-align: center;

  p {
    margin: 0 0 12px;
    font-size: 15px;
  }
}

.sm-ghost,
.sm-chip {
  height: 38px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  border: 1px solid var(--pl-line);
  border-radius: 19px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;

  &:disabled {
    opacity: 0.5;
  }

  &.subtle {
    color: var(--pl-sub);
  }
}

.sm-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;

  &.is-user {
    justify-content: flex-end;
  }
}

.sm-avatar {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--pl-text);
  color: var(--rd-bg, #fff);
  font-family: "Noto Serif TC", serif;
  font-weight: 700;

  .is-guest & {
    background: var(--pl-accent);
    color: var(--pl-on-accent);
  }
}

.sm-bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 18px;
  font-size: 15px;
  line-height: 1.65;
  white-space: pre-wrap;
  word-break: break-word;
  display: flex;
  flex-direction: column;
  gap: 4px;

  .is-author &,
  .is-guest & {
    background: var(--pl-raise);
    border-top-left-radius: 6px;
  }

  .is-guest & {
    background: color-mix(in srgb, var(--pl-accent) 16%, transparent);
  }

  .is-user & {
    background: color-mix(in srgb, var(--pl-accent) 28%, transparent);
    border-top-right-radius: 6px;
  }

  .classical {
    font-family: "Noto Serif TC", serif;
  }
}

.sm-guest-tag {
  font-size: 12px;
  font-weight: 700;
  color: var(--pl-sub);
}

.sm-typing {
  color: var(--pl-sub);
}

.sm-error {
  align-self: center;
  margin: 0;
  padding: 8px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error, #e53e3e) 12%, transparent);
  color: var(--color-error, #e53e3e);
  font-size: 13px;
}

.sm-tools {
  display: flex;
  gap: 8px;
  padding: 0 16px 8px;
  overflow-x: auto;
  flex-shrink: 0;
}

.sm-guest-input {
  flex: 1;
  display: flex;
  gap: 6px;
}

.sm-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 12px;
  padding: 5px 5px 5px 18px;
  border-radius: 27px;
  background: var(--pl-raise);
  flex-shrink: 0;

  input {
    flex: 1;
    min-width: 0;
    height: 44px;
    border: none;
    background: transparent;
    color: inherit;
    font-family: inherit;
    font-size: 16px;
    outline: none;
  }
}

.sm-send {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
