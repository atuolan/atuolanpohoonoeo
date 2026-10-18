<script setup lang="ts">
/**
 * 便簽留言板
 * user 按確定送出的心情、char 回覆心情與主動寫的紙條，用圖釘釘在同一面牆上（新的在上）。
 * 先只能看；點紙條上的名字進那個角色的聊天。
 */
import {
  loadNoteBoard,
  markNoteBoardSeen,
  NOTE_BOARD_CHANGED_EVENT,
  type BoardCharNote,
  type MoodKey,
  type NoteBoardData,
} from "@/services/noteBoard";
import { MOOD_LABELS } from "@/services/noteBoardPrompt";
import { useCharactersStore } from "@/stores/characters";
import { buildBoardDays, noteTilt } from "@/utils/noteBoardLayout";
import { ChevronLeft, Frown, Heart, Meh, Smile, Sparkles } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{
  (e: "back"): void;
  (e: "open-chat", payload: { characterId: string; chatId: string }): void;
}>();

const charactersStore = useCharactersStore();
if (charactersStore.characters.length === 0 && !charactersStore.isLoading) {
  void charactersStore.loadCharacters();
}

const moodIcons: Record<MoodKey, typeof Smile> = {
  happy: Smile,
  sad: Frown,
  neutral: Meh,
  love: Heart,
  excited: Sparkles,
};

const board = ref<NoteBoardData | null>(null);
// 打開前的已讀時間：比它新的紙條蓋「新」字章
const seenBefore = ref(Number.POSITIVE_INFINITY);
const now = ref(Date.now());

const days = computed(() => (board.value ? buildBoardDays(board.value, now.value) : []));
const newCount = computed(
  () => board.value?.notes.filter((n) => n.createdAt > seenBefore.value).length ?? 0,
);

function isNew(note: BoardCharNote): boolean {
  return note.createdAt > seenBefore.value;
}

function authorOf(note: BoardCharNote) {
  const character = charactersStore.characters.find((c) => c.id === note.characterId);
  return {
    name: character?.nickname || character?.data?.name || note.characterName,
    avatar: character?.avatar || "",
  };
}

function timeOf(timestamp: number): string {
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function tiltStyle(id: string) {
  return { transform: `rotate(${noteTilt(id)}deg)` };
}

function openChat(note: BoardCharNote) {
  emit("open-chat", { characterId: note.characterId, chatId: note.chatId });
}

// 紙條的手寫字體只在留言板用到，進來才載入
const HANDWRITING_FONT_LINK_ID = "note-board-handwriting-font";
function ensureHandwritingFont() {
  if (document.getElementById(HANDWRITING_FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = HANDWRITING_FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC:wght@400;700&display=swap";
  document.head.appendChild(link);
}

async function refresh() {
  try {
    board.value = await loadNoteBoard();
  } catch (error) {
    console.warn("[NoteBoardScreen] 讀取留言板失敗:", error);
    board.value = { posts: [], notes: [], verbalReplies: [], seenAt: 0 };
  }
  now.value = Date.now();
}

async function markSeen() {
  try {
    await markNoteBoardSeen();
  } catch (error) {
    console.warn("[NoteBoardScreen] 記錄已讀失敗:", error);
  }
}

onMounted(async () => {
  ensureHandwritingFont();
  await refresh();
  seenBefore.value = board.value?.seenAt ?? 0;
  await markSeen();
  // 開著的時候有新紙條進來也即時釘上去（離開時再記一次已讀）
  window.addEventListener(NOTE_BOARD_CHANGED_EVENT, refresh);
});

onUnmounted(() => {
  window.removeEventListener(NOTE_BOARD_CHANGED_EVENT, refresh);
  void markSeen();
});
</script>

<template>
  <div class="note-board">
    <header class="note-board__header">
      <button type="button" class="note-board__back" aria-label="返回" @click="emit('back')">
        <ChevronLeft :size="24" :stroke-width="2" />
      </button>
      <h1 class="note-board__title">便簽留言板</h1>
      <span v-if="newCount > 0" class="note-board__count">{{ newCount }} 張新紙條</span>
    </header>

    <div class="note-board__wall">
      <div v-if="board && days.length === 0" class="paper paper--empty">
        <span class="pin" aria-hidden="true"></span>
        <p class="paper__text">還沒有紙條。在主畫面的心情便籤寫下心情、按確定，就會釘在這裡。</p>
      </div>

      <section v-for="day in days" :key="day.key" class="note-board__day">
        <div class="day-tag">{{ day.label }}</div>

        <template v-for="(item, index) in day.items" :key="item.kind === 'post' ? item.post.id : item.note.id">
          <!-- 自己的心情，回覆它的紙條疊在下面 -->
          <div v-if="item.kind === 'post'" class="post-cluster">
            <article class="paper paper--post" :style="tiltStyle(item.post.id)">
              <span class="pin" aria-hidden="true"></span>
              <div class="paper__meta">
                <component
                  :is="moodIcons[item.post.mood ?? 'neutral']"
                  v-if="item.post.mood"
                  :size="16"
                  :stroke-width="2"
                  aria-hidden="true"
                />
                <span>
                  我的心情<template v-if="item.post.mood"> · {{ MOOD_LABELS[item.post.mood] }}</template>
                  · {{ timeOf(item.post.createdAt) }}
                </span>
              </div>
              <p class="paper__text paper__text--post">{{ item.post.text }}</p>
            </article>

            <article
              v-for="(reply, replyIndex) in item.replies"
              :key="reply.id"
              class="paper paper--reply"
              :class="replyIndex % 2 === 0 ? 'is-right' : 'is-left'"
              :style="tiltStyle(reply.id)"
            >
              <span class="pin" aria-hidden="true"></span>
              <span v-if="isNew(reply)" class="new-stamp">新</span>
              <span class="paper__label">回你的心情</span>
              <p class="paper__text">{{ reply.text }}</p>
              <div class="paper__author">
                <img v-if="authorOf(reply).avatar" :src="authorOf(reply).avatar" alt="" class="paper__avatar" />
                <span v-else class="paper__avatar paper__avatar--fallback">{{ authorOf(reply).name.charAt(0) }}</span>
                <button type="button" class="paper__name" @click="openChat(reply)">{{ authorOf(reply).name }}</button>
                <span>· {{ timeOf(reply.createdAt) }}</span>
              </div>
            </article>
          </div>

          <!-- char 主動寫的提醒 -->
          <article
            v-else
            class="paper paper--note"
            :class="index % 2 === 0 ? 'is-right' : 'is-center'"
            :style="tiltStyle(item.note.id)"
          >
            <span class="pin" aria-hidden="true"></span>
            <span v-if="isNew(item.note)" class="new-stamp">新</span>
            <span class="paper__label">提醒</span>
            <p class="paper__text">{{ item.note.text }}</p>
            <div class="paper__author">
              <img v-if="authorOf(item.note).avatar" :src="authorOf(item.note).avatar" alt="" class="paper__avatar" />
              <span v-else class="paper__avatar paper__avatar--fallback">{{ authorOf(item.note).name.charAt(0) }}</span>
              <button type="button" class="paper__name" @click="openChat(item.note)">{{ authorOf(item.note).name }}</button>
              <span>· {{ timeOf(item.note.createdAt) }}</span>
            </div>
          </article>
        </template>
      </section>

      <p v-if="days.length > 0" class="note-board__end">沒有更早的紙條了</p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 固定的紙牆風格：不跟主題變色
.note-board {
  --wall: #e6e2dc;
  --ink: #5a4038;
  --ink-soft: #6f5a4f;
  --paper-post: #f6f1e9;
  --paper-reply: #e9dfcf;
  --paper-reply-alt: #e3d8c6;
  --paper-note: #efe7da;
  --copper: #b8653f;

  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--wall);
  // 窗光斜斜照在牆上，不跟著捲動
  background-image: linear-gradient(
    118deg,
    rgba(255, 255, 255, 0) 22%,
    rgba(255, 255, 255, 0.32) 22%,
    rgba(255, 255, 255, 0.32) 31%,
    rgba(255, 255, 255, 0) 31%,
    rgba(255, 255, 255, 0) 52%,
    rgba(70, 60, 50, 0.05) 52%,
    rgba(70, 60, 50, 0.05) 58%,
    rgba(255, 255, 255, 0) 58%
  );
  color: var(--ink);
  font-family: "Noto Sans TC", sans-serif;
}

.note-board__header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: calc(8px + var(--safe-top, 0px)) 16px 4px 8px;
  flex-shrink: 0;
}

.note-board__back {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--ink);
  cursor: pointer;
}

.note-board__title {
  flex: 1;
  margin: 0;
  font-family: "LXGW WenKai TC", "Huninn", serif;
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
}

.note-board__count {
  font-size: 13px;
  color: var(--ink-soft);
}

.note-board__wall {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  display: flex;
  flex-direction: column;
  padding: 8px 20px calc(40px + var(--safe-bottom, 0px));
}

.note-board__day {
  display: flex;
  flex-direction: column;
}

.day-tag {
  align-self: center;
  margin: 18px 0 24px;
  padding: 4px 18px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transform: rotate(-1.5deg);
  font-size: 13px;
  letter-spacing: 1px;
  color: var(--ink-soft);
}

.post-cluster {
  display: flex;
  flex-direction: column;
  margin-bottom: 30px;
}

.paper {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 24px 18px 14px;
  box-shadow: 2px 6px 14px rgba(60, 40, 30, 0.18);
}

.paper--post {
  z-index: 1;
  align-self: flex-start;
  width: min(80%, 300px);
  padding: 26px 20px 22px;
  background: var(--paper-post);
}

.paper--reply {
  z-index: 2;
  width: min(72%, 260px);
  margin-top: -14px;
  background: var(--paper-reply);

  &.is-right {
    align-self: flex-end;
  }

  &.is-left {
    align-self: flex-start;
    margin-left: 6%;
    background: var(--paper-reply-alt);
  }
}

.paper--note {
  width: min(70%, 250px);
  margin-bottom: 30px;
  background: var(--paper-note);

  &.is-right {
    align-self: flex-end;
  }

  &.is-center {
    align-self: center;
  }
}

.paper--empty {
  align-self: center;
  width: min(80%, 300px);
  margin-top: 48px;
  background: var(--paper-post);
  transform: rotate(-1.5deg);
}

.pin {
  position: absolute;
  top: -8px;
  left: 50%;
  width: 18px;
  height: 18px;
  margin-left: -9px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #e9a27c, var(--copper) 60%, #8f4b2c);
  box-shadow: 1px 2px 3px rgba(0, 0, 0, 0.3);
}

.new-stamp {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--copper);
  color: #ffffff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.paper__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--ink-soft);
}

.paper__label {
  font-size: 12px;
  color: var(--ink-soft);
}

.paper__text {
  margin: 0;
  font-family: "LXGW WenKai TC", "Huninn", serif;
  font-size: 20px;
  line-height: 1.5;
  color: var(--ink);
  white-space: pre-wrap;
  word-break: break-word;
}

.paper__text--post {
  font-size: 24px;
}

.paper__author {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
  color: var(--ink-soft);
}

.paper__avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.paper__avatar--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #d8c8b4;
  color: var(--ink);
  font-size: 12px;
}

.paper__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  // 點擊範圍撐到 44px 高，外觀仍是一行字
  margin: -10px 0;
  padding: 10px 0;
  border: none;
  background: transparent;
  color: var(--ink);
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.note-board__end {
  align-self: center;
  margin: 24px 0 0;
  font-size: 13px;
  color: var(--ink-soft);
}
</style>
