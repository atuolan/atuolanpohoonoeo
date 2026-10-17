<script setup lang="ts">
/**
 * 10 平行宇宙：從讀到的地方岔出三條「如果……」，挑一條讓 AI 用原著筆調寫下去
 * 同一個位置的結果會留著，回來不用重新生成
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { askAI } from "@/services/BookAIService";
import { buildBranchesPrompt, buildBranchStoryPrompt, parseBranches } from "@/services/bookPlay";
import { useBooksStore } from "@/stores/books";
import type { StoredBook } from "@/types/book";
import { RefreshCw, Sparkles } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
  book: StoredBook;
  readingText: string;
  chapterIndex: number;
  charOffset: number;
}>();
const emit = defineEmits<{ close: [] }>();

const booksStore = useBooksStore();
const KEYS = ["A", "B", "C"];

const cached = computed(() => {
  const w = booksStore.progressByBook[props.book.id]?.play?.whatIf;
  return w && w.chapterIndex === props.chapterIndex && w.charOffset === props.charOffset ? w : null;
});

const branches = ref<string[]>(cached.value?.branches ?? []);
const picked = ref<number | null>(cached.value?.picked ?? null);
const story = ref(cached.value?.story ?? "");
const busy = ref<"" | "branches" | "story">("");
const error = ref("");

function persist() {
  return booksStore.patchProgress(props.book.id, (cur) => ({
    play: {
      ...cur?.play,
      whatIf: {
        chapterIndex: props.chapterIndex,
        charOffset: props.charOffset,
        branches: branches.value,
        picked: picked.value ?? undefined,
        story: story.value || undefined,
      },
    },
  }));
}

async function makeBranches() {
  if (busy.value) return;
  busy.value = "branches";
  error.value = "";
  try {
    const list = parseBranches(
      await askAI(buildBranchesPrompt(props.book.title, props.readingText), { task: "chat", temperature: 1 }),
    );
    if (list.length === 0) throw new Error("沒想出來，再試一次");
    branches.value = list.map((b) => b.title);
    picked.value = null;
    story.value = "";
    await persist();
  } catch (e: any) {
    error.value = e?.message || "生成失敗";
  } finally {
    busy.value = "";
  }
}

async function pick(i: number) {
  if (busy.value) return;
  picked.value = i;
  story.value = "";
  busy.value = "story";
  error.value = "";
  try {
    story.value = await askAI(
      buildBranchStoryPrompt(props.book.title, props.readingText, branches.value[i]),
      { task: "chat", temperature: 0.95 },
    );
    await persist();
  } catch (e: any) {
    error.value = e?.message || "生成失敗";
  } finally {
    busy.value = "";
  }
}
</script>

<template>
  <BookPlayShell title="平行宇宙" :subtitle="`從《${book.title}》讀到的地方岔出去`" @close="emit('close')">
    <div class="wi-wrap">
      <div v-if="branches.length === 0" class="wi-start">
        <Sparkles :size="34" class="wi-icon" />
        <p class="wi-title">如果劇情換個方向？</p>
        <p class="wi-hint">我會從你讀到的地方想三個「如果……」，挑一個，就用原著的筆調寫下去。不會透露你還沒讀的部分。</p>
        <button class="wi-primary" :disabled="!!busy" @click="makeBranches">
          {{ busy === "branches" ? "正在想…" : "想三個平行宇宙" }}
        </button>
      </div>

      <template v-else>
        <div class="wi-branches" role="radiogroup" aria-label="平行宇宙分支">
          <button
            v-for="(b, i) in branches"
            :key="i"
            role="radio"
            :aria-checked="picked === i"
            class="wi-branch"
            :class="{ active: picked === i }"
            :disabled="!!busy"
            @click="pick(i)"
          >
            <span class="wi-key">{{ KEYS[i] }}</span>
            <span class="wi-branch-title">{{ b }}</span>
          </button>
        </div>

        <section v-if="busy === 'story' || story" class="wi-story" aria-live="polite">
          <p class="wi-story-label">
            <Sparkles :size="14" />AI 續寫 · 分支 {{ picked !== null ? KEYS[picked] : "" }}
          </p>
          <p v-if="busy === 'story'" class="wi-muted">正在寫…</p>
          <p v-else class="wi-story-text">{{ story }}</p>
        </section>
        <p v-else class="wi-muted center">選一條分支看看會怎樣</p>

        <button class="wi-ghost" :disabled="!!busy" @click="makeBranches">
          <RefreshCw :size="16" />換三個
        </button>
      </template>

      <p v-if="error" class="wi-error" role="alert">{{ error }}</p>
    </div>
  </BookPlayShell>
</template>

<style scoped lang="scss">
button {
  font-family: inherit;
}

.wi-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 16px;
}

.wi-start {
  margin: auto 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 0 8px;
}

.wi-icon {
  color: var(--pl-accent);
}

.wi-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.wi-hint {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--pl-sub);
}

.wi-primary,
.wi-ghost {
  height: 50px;
  padding: 0 24px;
  border-radius: 25px;
  font-size: 15px;
  cursor: pointer;
  flex-shrink: 0;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
}

.wi-primary {
  align-self: stretch;
  border: none;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-weight: 700;
}

.wi-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--pl-line);
  background: transparent;
  color: inherit;
}

.wi-branches {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wi-branch {
  min-height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--pl-line);
  border-radius: 20px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &.active {
    border-color: var(--pl-text);
    background: var(--pl-text);
    color: var(--rd-bg, #fff);

    .wi-key {
      background: var(--pl-accent);
      color: var(--pl-on-accent);
    }
  }
}

.wi-key {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: var(--pl-raise);
  font-size: 13px;
  font-weight: 700;
}

.wi-branch-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}

.wi-story {
  padding: 16px;
  border-radius: 22px;
  background: var(--pl-raise);
}

.wi-story-label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--pl-sub);
}

.wi-story-text {
  margin: 0;
  font-family: "Noto Serif TC", serif;
  font-size: 17px;
  line-height: 1.95;
  white-space: pre-wrap;
}

.wi-muted {
  margin: 0;
  color: var(--pl-sub);
  font-size: 14px;

  &.center {
    text-align: center;
  }
}

.wi-error {
  margin: 0;
  padding: 8px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error, #e53e3e) 12%, transparent);
  color: var(--color-error, #e53e3e);
  font-size: 13px;
}
</style>
