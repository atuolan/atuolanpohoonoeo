<script setup lang="ts">
/**
 * 09 擂台：跟一個聊天角色比答題，題目只出自讀過的部分
 * 對手的作答與台詞由 AI 照角色個性一起產生
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { askAI } from "@/services/BookAIService";
import { buildDuelPrompt, duelScore, parseDuelQuestions, type DuelQuestion } from "@/services/bookPlay";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import type { StoredBook } from "@/types/book";
import type { StoredCharacter } from "@/types/character";
import { computed, onUnmounted, ref } from "vue";

const props = defineProps<{
  book: StoredBook;
  readingText: string;
  userName: string;
}>();
const emit = defineEmits<{ close: [] }>();

const booksStore = useBooksStore();
const charsStore = useCharactersStore();

const QUESTION_SECONDS = 15;
const KEYS = ["A", "B", "C", "D"];

type Phase = "pick" | "loading" | "question" | "result";
const phase = ref<Phase>("pick");
const rival = ref<StoredCharacter | null>(null);
const questions = ref<DuelQuestion[]>([]);
const index = ref(0);
const picked = ref<number | null>(null);
const myScore = ref(0);
const rivalScore = ref(0);
const secondsLeft = ref(QUESTION_SECONDS);
const error = ref("");
const sharedToChat = ref(false);
let timer: ReturnType<typeof setInterval> | null = null;

const rivalName = computed(() => rival.value?.nickname || rival.value?.data.name || "對手");
const current = computed(() => questions.value[index.value]);
const revealed = computed(() => picked.value !== null);
const history = computed(() => booksStore.progressByBook[props.book.id]?.play?.duels ?? []);

function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}
onUnmounted(stopTimer);

function startTimer() {
  stopTimer();
  secondsLeft.value = QUESTION_SECONDS;
  timer = setInterval(() => {
    secondsLeft.value -= 1;
    if (secondsLeft.value <= 0) answer(-1);
  }, 1000);
}

async function start(character: StoredCharacter) {
  rival.value = character;
  phase.value = "loading";
  error.value = "";
  try {
    const text = await askAI(
      buildDuelPrompt(props.book.title, props.readingText, {
        name: character.nickname || character.data.name,
        description: character.data.description,
        personality: character.data.personality,
      }),
      { task: "chat", temperature: 0.8 },
    );
    const qs = parseDuelQuestions(text);
    if (qs.length === 0) throw new Error("題目沒出好，再試一次");
    questions.value = qs;
    index.value = 0;
    myScore.value = 0;
    rivalScore.value = 0;
    picked.value = null;
    sharedToChat.value = false;
    phase.value = "question";
    startTimer();
  } catch (e: any) {
    error.value = e?.message || "出題失敗";
    phase.value = "pick";
  }
}

function answer(choice: number) {
  const q = current.value;
  if (!q || revealed.value) return;
  stopTimer();
  picked.value = choice;
  myScore.value += duelScore(choice === q.answer, secondsLeft.value, QUESTION_SECONDS);
  // 對手的速度算一半時間，答對也拿分
  rivalScore.value += duelScore(q.rivalPick === q.answer, QUESTION_SECONDS / 2, QUESTION_SECONDS);
}

async function next() {
  if (index.value + 1 < questions.value.length) {
    index.value += 1;
    picked.value = null;
    startTimer();
    return;
  }
  phase.value = "result";
  const record = {
    characterId: rival.value!.id,
    characterName: rivalName.value,
    myScore: myScore.value,
    rivalScore: rivalScore.value,
    at: Date.now(),
  };
  await booksStore.patchProgress(props.book.id, (cur) => ({
    play: { ...cur?.play, duels: [record, ...(cur?.play?.duels ?? [])].slice(0, 10) },
  }));
}

const resultText = computed(() => {
  if (myScore.value > rivalScore.value) return `你贏了 ${rivalName.value}！`;
  if (myScore.value < rivalScore.value) return `${rivalName.value} 贏了這一局`;
  return "平手！";
});

function optionClass(i: number) {
  const q = current.value;
  if (!q || !revealed.value) return "";
  if (i === q.answer) return "correct";
  if (i === picked.value) return "wrong";
  return "dim";
}

/** 把戰績傳到跟這個角色的私聊（以你的名義送出一則訊息，角色下次回覆時會看到） */
async function shareToChat() {
  if (!rival.value || sharedToChat.value) return;
  try {
    const { resolvePreferredDirectChat, refreshChatDerivedMetadata } = await import("@/storage/chatStorage");
    const { appendMessages } = await import("@/storage/chatMessageStorage");
    const chat = await resolvePreferredDirectChat(rival.value.id);
    if (!chat) throw new Error(`還沒有跟 ${rivalName.value} 的私聊`);
    const now = Date.now();
    await appendMessages(chat.id, [
      {
        id: `msg_duel_${now}`,
        sender: "user",
        name: props.userName,
        is_user: true,
        content: `📚 我們剛在《${props.book.title}》的擂台比答題：我 ${myScore.value} 分，你 ${rivalScore.value} 分。${myScore.value > rivalScore.value ? "我贏了！" : myScore.value < rivalScore.value ? "這次算你厲害。" : "平手！"}`,
        status: "sent",
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await refreshChatDerivedMetadata(chat.id);
    sharedToChat.value = true;
  } catch (e: any) {
    error.value = e?.message || "傳送失敗";
  }
}

function restart() {
  if (rival.value) start(rival.value);
}

const initial = (name: string) => name.slice(0, 1);
</script>

<template>
  <BookPlayShell
    title="擂台"
    :subtitle="phase === 'question' ? `第 ${index + 1} / ${questions.length} 題` : `《${book.title}》讀到這裡的小測驗`"
    @close="emit('close')"
  >
    <!-- 選對手 -->
    <div v-if="phase === 'pick'" class="dl-pick">
      <p class="dl-lead">選一個角色跟你比答題，題目只會出自你讀過的部分。</p>
      <p v-if="error" class="dl-error" role="alert">{{ error }}</p>
      <p v-if="charsStore.characters.length === 0" class="dl-empty">還沒有角色，先去匯入一張角色卡吧</p>
      <button v-for="c in charsStore.characters" :key="c.id" class="dl-rival" @click="start(c)">
        <span class="dl-avatar">
          <img v-if="c.avatar" :src="c.avatar" alt="" />
          <span v-else>{{ initial(c.nickname || c.data.name) }}</span>
        </span>
        <span class="dl-rival-name">{{ c.nickname || c.data.name }}</span>
        <span class="dl-rival-go">挑戰</span>
      </button>
      <div v-if="history.length" class="dl-history">
        <p class="dl-history-title">最近的戰績</p>
        <div v-for="h in history.slice(0, 5)" :key="h.at" class="dl-history-row">
          <span>vs {{ h.characterName }}</span>
          <span :class="{ win: h.myScore > h.rivalScore }">{{ h.myScore }} : {{ h.rivalScore }}</span>
        </div>
      </div>
    </div>

    <!-- 出題中 -->
    <div v-else-if="phase === 'loading'" class="dl-loading">
      <span class="dl-spinner" aria-hidden="true" />
      <p>{{ rivalName }} 正在翻書出題…</p>
    </div>

    <!-- 作答 -->
    <div v-else-if="phase === 'question' && current" class="dl-play">
      <div class="dl-board">
        <div class="dl-player">
          <span class="dl-avatar me">{{ initial(userName) }}</span>
          <span>你</span>
          <strong>{{ myScore }}</strong>
        </div>
        <div class="dl-timer" :style="{ '--ratio': secondsLeft / QUESTION_SECONDS }" aria-live="polite">
          <span>{{ revealed ? "✓" : secondsLeft }}</span>
        </div>
        <div class="dl-player">
          <span class="dl-avatar">
            <img v-if="rival?.avatar" :src="rival.avatar" alt="" />
            <span v-else>{{ initial(rivalName) }}</span>
            <span class="dl-badge">已答</span>
          </span>
          <span>{{ rivalName }}</span>
          <strong>{{ rivalScore }}</strong>
        </div>
      </div>

      <p class="dl-question">{{ current.question }}</p>

      <div class="dl-options">
        <button
          v-for="(opt, i) in current.options"
          :key="i"
          class="dl-option"
          :class="optionClass(i)"
          :disabled="revealed"
          @click="answer(i)"
        >
          <span class="dl-key">{{ KEYS[i] }}</span>
          <span class="dl-opt-text">{{ opt }}</span>
          <span v-if="revealed && i === current.rivalPick" class="dl-rival-mark">{{ initial(rivalName) }}</span>
        </button>
      </div>

      <div v-if="revealed" class="dl-reveal">
        <p class="dl-rival-line"><strong>{{ rivalName }}：</strong>{{ current.rivalLine }}</p>
        <p v-if="current.explain" class="dl-explain">{{ current.explain }}</p>
        <button class="dl-primary" @click="next">
          {{ index + 1 < questions.length ? "下一題" : "看結果" }}
        </button>
      </div>
    </div>

    <!-- 結果 -->
    <div v-else-if="phase === 'result'" class="dl-result">
      <p class="dl-result-title">{{ resultText }}</p>
      <p class="dl-result-score">{{ myScore }} : {{ rivalScore }}</p>
      <p v-if="error" class="dl-error" role="alert">{{ error }}</p>
      <button class="dl-primary" @click="restart">再來一局</button>
      <button class="dl-ghost" :disabled="sharedToChat" @click="shareToChat">
        {{ sharedToChat ? `已傳給 ${rivalName}` : `把戰績傳給 ${rivalName}` }}
      </button>
      <button class="dl-ghost" @click="phase = 'pick'">換個對手</button>
    </div>
  </BookPlayShell>
</template>

<style scoped lang="scss">
button {
  font-family: inherit;
}

.dl-pick,
.dl-result {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px;
}

.dl-lead {
  margin: 0 4px 8px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--pl-sub);
}

.dl-empty {
  margin: 24px 0;
  text-align: center;
  color: var(--pl-sub);
}

.dl-error {
  margin: 0;
  padding: 8px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error, #e53e3e) 12%, transparent);
  color: var(--color-error, #e53e3e);
  font-size: 13px;
}

.dl-rival {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 8px 12px;
  border: none;
  border-radius: 18px;
  background: var(--pl-raise);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.dl-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  &.me {
    background: var(--pl-text);
    color: var(--rd-bg, #fff);
  }
}

.dl-rival-name {
  flex: 1;
  font-size: 15px;
  font-weight: 600;
}

.dl-rival-go {
  padding: 6px 14px;
  border-radius: 16px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-size: 13px;
  font-weight: 700;
}

.dl-history {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  border: 1px solid var(--pl-line);
}

.dl-history-title {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 700;
}

.dl-history-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  font-size: 13px;
  color: var(--pl-sub);
  font-variant-numeric: tabular-nums;

  .win {
    color: var(--pl-text);
    font-weight: 700;
  }
}

.dl-loading {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  color: var(--pl-sub);
}

.dl-spinner {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: 3px solid var(--pl-line);
  border-top-color: var(--pl-accent);
  animation: dl-spin 0.8s linear infinite;
}

@keyframes dl-spin {
  to {
    transform: rotate(360deg);
  }
}

.dl-play {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 16px;
}

.dl-board {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dl-player {
  width: 96px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 13px;

  strong {
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
}

.dl-badge {
  position: absolute;
  top: -6px;
  right: -14px;
  padding: 1px 6px;
  border-radius: 9px;
  background: var(--pl-text);
  color: var(--rd-bg, #fff);
  font-size: 10px;
}

.dl-timer {
  --ratio: 1;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(var(--pl-accent) calc(var(--ratio) * 360deg), var(--pl-line) 0);

  span {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--rd-bg, #fff);
    font-size: 20px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.dl-question {
  margin: 0;
  font-family: "Noto Serif TC", serif;
  font-size: 20px;
  line-height: 1.6;
  font-weight: 700;
}

.dl-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dl-option {
  position: relative;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 2px;
  padding: 10px 14px;
  border: 1px solid var(--pl-line);
  border-radius: 18px;
  background: var(--pl-raise);
  color: inherit;
  text-align: left;
  cursor: pointer;

  &.correct {
    border-color: var(--pl-accent);
    background: var(--pl-accent);
    color: var(--pl-on-accent);
  }

  &.wrong {
    border-color: var(--color-error, #e53e3e);
    background: color-mix(in srgb, var(--color-error, #e53e3e) 18%, transparent);
  }

  &.dim {
    opacity: 0.5;
  }

  &:disabled {
    cursor: default;
  }
}

.dl-key {
  font-size: 12px;
  opacity: 0.7;
}

.dl-opt-text {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.dl-rival-mark {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--pl-text);
  color: var(--rd-bg, #fff);
  font-size: 11px;
  font-weight: 700;
}

.dl-reveal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dl-rival-line,
.dl-explain {
  margin: 0;
  padding: 12px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.6;
}

.dl-rival-line {
  background: var(--pl-raise);
}

.dl-explain {
  border: 1px solid var(--pl-line);
  color: var(--pl-sub);
}

.dl-primary,
.dl-ghost {
  height: 50px;
  border-radius: 25px;
  font-size: 15px;
  cursor: pointer;
  flex-shrink: 0;
}

.dl-primary {
  border: none;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-weight: 700;
}

.dl-ghost {
  border: 1px solid var(--pl-line);
  background: transparent;
  color: inherit;

  &:disabled {
    opacity: 0.6;
  }
}

.dl-result {
  justify-content: center;
  text-align: center;
}

.dl-result-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
}

.dl-result-score {
  margin: 0 0 12px;
  font-size: 40px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
</style>
