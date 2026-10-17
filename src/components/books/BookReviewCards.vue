<script setup lang="ts">
/**
 * 06 回顧卡：一張一張翻，自評後排下次複習時間
 * 自評直接寫進那本書的閱讀紀錄；items 在打開時拍下來，寫入不會讓卡片跳動
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { agoLabel, intervalLabel, nextInterval, nextReview, type ReviewItem } from "@/services/bookReview";
import { useBooksStore } from "@/stores/books";
import type { BookReviewCard, ReviewGrade } from "@/types/book";
import { computed, ref } from "vue";

const props = defineProps<{
  items: ReviewItem[];
  /** chapter：剛讀完一章出的卡；review：到期複習 */
  mode: "chapter" | "review";
  /** 大標題，例如「「逍遙遊」讀完了」 */
  heading: string;
  /** 能不能跳回原文（只有在閱讀器裡才行） */
  canJump?: boolean;
}>();

const emit = defineEmits<{ close: []; jump: [item: ReviewItem] }>();

const booksStore = useBooksStore();
const queue = ref<ReviewItem[]>([...props.items]);
const index = ref(0);
const flipped = ref(false);
const tally = ref<Record<ReviewGrade, number>>({ fuzzy: 0, remember: 0, easy: 0 });
/** 這輪自評後最近的下次間隔（天） */
const nextDays = ref<number | null>(null);

const total = computed(() => queue.value.length);
const current = computed(() => queue.value[index.value]);
const finished = computed(() => index.value >= total.value);
/** 卡疊後面還有幾張（最多畫兩層） */
const behind = computed(() => Math.min(2, total.value - index.value - 1));

const SOURCE_LABELS: Record<BookReviewCard["source"], string> = {
  highlight: "來自你的劃線",
  summary: "來自摘要",
  lens: "來自觀點鏡頭",
};

const GRADES: Array<{ id: ReviewGrade; label: string }> = [
  { id: "fuzzy", label: "模糊" },
  { id: "remember", label: "記得" },
  { id: "easy", label: "很熟" },
];

function nextLabel(grade: ReviewGrade): string {
  return intervalLabel(nextInterval(current.value?.card.intervalDays ?? 0, grade));
}

async function grade(g: ReviewGrade) {
  const item = current.value;
  if (!item) return;
  const now = Date.now();
  const updated = nextReview(item.card, g, now);
  tally.value[g]++;
  nextDays.value = Math.min(nextDays.value ?? Infinity, updated.intervalDays);
  flipped.value = false;
  index.value++;
  await booksStore.patchProgress(item.bookId, (p) => ({
    cards: (p?.cards ?? []).map((c) => (c.id === updated.id ? updated : c)),
  }));
}

/** 「你昨天」「你在 3 天前」 */
function notedWhen(at: number): string {
  const ago = agoLabel(at, Date.now());
  return /\d/.test(ago) ? `你在 ${ago}` : `你${ago}`;
}

const nextDueText = computed(() => (nextDays.value === null ? "" : intervalLabel(nextDays.value)));

const subtitle = computed(() =>
  props.mode === "review" ? "隔幾天考一次，記得更久" : current.value?.bookTitle ?? "",
);
</script>

<template>
  <BookPlayShell :title="mode === 'chapter' ? '回顧卡' : '今天的複習'" :subtitle="subtitle" @close="emit('close')">
    <div class="rv-wrap">
      <template v-if="!finished && current">
        <div class="rv-intro">
          <h3 class="rv-heading">{{ heading }}</h3>
          <p class="rv-sub">
            {{ mode === "chapter" ? `${total} 張卡，把這章留在腦裡` : `${total} 張卡，翻開前先想一想` }}
          </p>
        </div>

        <div
          class="rv-progress"
          role="progressbar"
          :aria-valuenow="index"
          aria-valuemin="0"
          :aria-valuemax="total"
          :aria-label="`第 ${index + 1} 張，共 ${total} 張`"
        >
          <span
            v-for="i in total"
            :key="i"
            class="rv-seg"
            :class="{ done: i - 1 < index, current: i - 1 === index }"
          />
        </div>

        <div class="rv-stack" :class="`behind-${behind}`">
          <article :key="current.card.id" class="rv-card" aria-live="polite">
            <div class="rv-card-meta">
              <span>記憶卡 {{ index + 1 }}/{{ total }}</span>
              <span>{{ SOURCE_LABELS[current.card.source] }}</span>
            </div>
            <p v-if="mode === 'review'" class="rv-card-book">《{{ current.bookTitle }}》· {{ current.chapterTitle }}</p>
            <p class="rv-question">{{ current.card.question }}</p>
            <div v-if="flipped" class="rv-answer">
              <p>{{ current.card.answer }}</p>
              <p v-if="current.note" class="rv-note">
                {{ notedWhen(current.note.at) }}劃了這句，並寫下：「{{ current.note.text }}」
              </p>
            </div>
            <button v-if="canJump" class="rv-jump" @click="emit('jump', current)">跳回原文</button>
          </article>
        </div>

        <div class="rv-actions">
          <button v-if="!flipped" class="rv-flip" @click="flipped = true">先想一想，再翻開</button>
          <div v-else class="rv-grades" role="group" aria-label="你記得多少">
            <button v-for="g in GRADES" :key="g.id" class="rv-grade" :class="g.id" @click="grade(g.id)">
              <span class="rv-grade-label">{{ g.label }}</span>
              <span class="rv-grade-next">{{ nextLabel(g.id) }}</span>
            </button>
          </div>
        </div>
      </template>

      <div v-else class="rv-done">
        <p class="rv-done-title">{{ mode === "chapter" ? "這章收進腦裡了" : "今天的複習做完了" }}</p>
        <p class="rv-done-tally">模糊 {{ tally.fuzzy }} · 記得 {{ tally.remember }} · 很熟 {{ tally.easy }}</p>
        <p v-if="nextDueText" class="rv-done-next">下一次複習：{{ nextDueText }}</p>
        <button class="rv-primary" @click="emit('close')">{{ canJump ? "回到書裡" : "完成" }}</button>
      </div>
    </div>
  </BookPlayShell>
</template>

<style scoped lang="scss">
.rv-wrap {
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 20px 0;
}

.rv-intro {
  flex-shrink: 0;
}

.rv-heading {
  margin: 0;
  font-family: "Noto Serif TC", serif;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rv-sub {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--pl-sub);
}

.rv-progress {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
}

.rv-seg {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--pl-line);

  &.done {
    background: var(--pl-accent);
  }

  &.current {
    background: color-mix(in srgb, var(--pl-accent) 50%, var(--pl-line));
  }
}

// 卡疊：後面兩層用陰影般的卡邊表示還有幾張
.rv-stack {
  position: relative;
  // 卡片跟著內容長高，太長才在卡片裡捲
  flex: 0 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;

  &.behind-1 {
    padding-bottom: 8px;
  }

  &.behind-2 {
    padding-bottom: 16px;
  }

  &.behind-1::before,
  &.behind-2::before,
  &.behind-2::after {
    content: "";
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 8px;
    height: 40px;
    border-radius: 0 0 24px 24px;
    background: var(--pl-raise);
    border: 1px solid var(--pl-line);
    border-top: none;
  }

  &.behind-1::before {
    bottom: 0;
  }

  &.behind-2::after {
    left: 28px;
    right: 28px;
    bottom: 0;
  }
}

.rv-card {
  position: relative;
  z-index: 1;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px 16px;
  border: 1px solid var(--pl-line);
  border-radius: 24px;
  background: color-mix(in srgb, var(--pl-text) 3%, var(--rd-bg, var(--color-background, #fff)));
  box-shadow: 0 8px 24px color-mix(in srgb, #000 8%, transparent);
  animation: rv-in 0.25s ease-out;
}

@keyframes rv-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

.rv-card-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--pl-sub);
}

.rv-card-book {
  margin: -4px 0 0;
  font-size: 12px;
  color: var(--pl-sub);
}

.rv-question {
  margin: 4px 0 0;
  font-family: "Noto Serif TC", serif;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.6;
}

.rv-answer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px dashed var(--pl-line);

  p {
    margin: 0;
    font-size: 16px;
    line-height: 1.75;
  }

  .rv-note {
    padding-left: 10px;
    border-left: 3px solid var(--pl-accent);
    font-size: 14px;
    color: var(--pl-sub);
  }
}

.rv-jump {
  align-self: flex-start;
  margin-top: 4px;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--pl-line);
  border-radius: 18px;
  background: transparent;
  color: var(--pl-sub);
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--pl-raise);
  }
}

.rv-actions {
  flex-shrink: 0;
  // 手機放在底部好按；寬螢幕緊貼卡片下方
  margin-top: auto;
  padding-bottom: 4px;

  @media (min-width: 600px) {
    margin-top: 4px;
  }
}

.rv-flip,
.rv-primary {
  width: 100%;
  height: 56px;
  border: none;
  border-radius: 28px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.rv-grades {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.rv-grade {
  height: 64px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 1px solid var(--pl-line);
  border-radius: 20px;
  background: var(--pl-raise);
  color: var(--pl-text);
  cursor: pointer;

  &.remember {
    background: color-mix(in srgb, var(--pl-accent) 22%, transparent);
    border-color: transparent;
  }

  &.easy {
    background: var(--pl-accent);
    border-color: transparent;
    color: var(--pl-on-accent);

    .rv-grade-next {
      color: inherit;
      opacity: 0.75;
    }
  }
}

.rv-grade-label {
  font-size: 16px;
  font-weight: 700;
}

.rv-grade-next {
  font-size: 12px;
  color: var(--pl-sub);
}

.rv-done {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-bottom: 40px;
  text-align: center;

  p {
    margin: 0;
  }

  .rv-primary {
    max-width: 320px;
    margin-top: 20px;
  }
}

.rv-done-title {
  font-family: "Noto Serif TC", serif;
  font-size: 22px;
  font-weight: 700;
}

.rv-done-tally,
.rv-done-next {
  font-size: 14px;
  color: var(--pl-sub);
}
</style>
