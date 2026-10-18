<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import { useCharactersStore } from "@/stores/characters";
import {
  addMoodPost,
  loadNoteBoard,
  NOTE_BOARD_CHANGED_EVENT,
  unreadCharNotes,
  type BoardCharNote,
  type MoodKey,
} from "@/services/noteBoard";
import type { WidgetCustomStyle } from "@/types";
import { daysAgo } from "@/utils/noteTime";
import { Check, Frown, Heart, Meh, Smile, Sparkles, StickyNote } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    content?: string;
    mood?: MoodKey;
    color?: string;
    moodChosen?: boolean; // user 點過心情按鈕（預設亮著的「開心」不算）
    postedText?: string; // 上次按確定送出的文字
    postedMood?: MoodKey | null; // 上次送出時點過的心情
    postedAt?: number; // 上次送出的時間
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", page: string): void;
}>();

const canvasStore = useCanvasStore();
const isEditMode = computed(() => canvasStore.isEditMode);

// 便籤顏色選項
const colors = [
  "#fef3c7", // 黃
  "#fce7f3", // 粉
  "#dbeafe", // 藍
  "#d1fae5", // 綠
  "#ede9fe", // 紫
];

const content = ref(props.data?.content || "");
const mood = ref<MoodKey>(props.data?.mood || "happy");
const selectedColor = ref(props.data?.color || colors[0]);
const moodChosen = ref(props.data?.moodChosen === true);
const postedText = ref(props.data?.postedText);
const postedMood = ref<MoodKey | null>(props.data?.postedMood ?? null);
const postedAt = ref(props.data?.postedAt);

function persist() {
  canvasStore.updateWidgetData(props.widgetId, {
    content: content.value,
    mood: mood.value,
    color: selectedColor.value,
    moodChosen: moodChosen.value,
    postedText: postedText.value,
    postedMood: postedMood.value,
    postedAt: postedAt.value,
    customStyle: props.data?.customStyle,
  });
}

// 監聽數據變化並保存到 store（草稿也留著，按確定才送出）
watch([content, mood, moodChosen, selectedColor], persist);

const moodIcons = {
  happy: Smile,
  sad: Frown,
  neutral: Meh,
  love: Heart,
  excited: Sparkles,
};

function pickMood(key: MoodKey) {
  mood.value = key;
  moodChosen.value = true;
}

const currentMoodIcon = computed(() => moodIcons[mood.value]);

// ===== 按確定送出心情（送出的才會釘上留言板、帶給 char） =====
const posting = ref(false);
const chosenMood = computed<MoodKey | null>(() => (moodChosen.value ? mood.value : null));

// 有沒送出的修改：有字，而且文字或心情跟上次送出的不同
const hasUnsentChanges = computed(() => {
  const text = content.value.trim();
  if (!text) return false;
  return text !== postedText.value || chosenMood.value !== postedMood.value;
});

const postedLabel = computed(() => {
  if (!postedAt.value) return "";
  const date = new Date(postedAt.value);
  if (daysAgo(postedAt.value) === 0) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  return `${date.getMonth() + 1}/${date.getDate()}`;
});

async function submitMood() {
  if (isEditMode.value || posting.value || !hasUnsentChanges.value) return;
  posting.value = true;
  const text = content.value.trim();
  const moodToSend = chosenMood.value;
  try {
    const post = await addMoodPost({ text, ...(moodToSend ? { mood: moodToSend } : {}) });
    postedText.value = text;
    postedMood.value = moodToSend;
    postedAt.value = post.createdAt;
    persist();
  } catch (error) {
    console.error("[MoodDiarySticky] 送出心情失敗:", error);
  } finally {
    posting.value = false;
  }
}

// ===== 便簽留言板：有沒看過的紙條時斜釘一張小紙條 =====
const charactersStore = useCharactersStore();
if (charactersStore.characters.length === 0 && !charactersStore.isLoading) {
  void charactersStore.loadCharacters();
}

const boardHasItems = ref(false);
const unreadNotes = ref<BoardCharNote[]>([]);
// 正在打字時把小紙條藏起來，不擋字
const writing = ref(false);

const latestUnread = computed(() => unreadNotes.value[0] ?? null);
const moreUnread = computed(() => Math.max(0, unreadNotes.value.length - 1));
const unreadCharacter = computed(() => {
  const note = latestUnread.value;
  return note ? charactersStore.characters.find((c) => c.id === note.characterId) ?? null : null;
});
const unreadAuthorName = computed(
  () =>
    unreadCharacter.value?.nickname ||
    unreadCharacter.value?.data?.name ||
    latestUnread.value?.characterName ||
    "",
);
const unreadAuthorAvatar = computed(() => unreadCharacter.value?.avatar || "");

async function refreshBoard() {
  try {
    const data = await loadNoteBoard();
    boardHasItems.value = data.posts.length > 0 || data.notes.length > 0;
    unreadNotes.value = unreadCharNotes(data);
  } catch (error) {
    console.warn("[MoodDiarySticky] 讀取留言板失敗:", error);
    boardHasItems.value = false;
    unreadNotes.value = [];
  }
}

function handleBoardChanged() {
  void refreshBoard();
}

onMounted(() => {
  void refreshBoard();
  window.addEventListener(NOTE_BOARD_CHANGED_EVENT, handleBoardChanged);
});

onUnmounted(() => {
  window.removeEventListener(NOTE_BOARD_CHANGED_EVENT, handleBoardChanged);
});

function openBoard() {
  if (isEditMode.value) return;
  emit("navigate", "note-board");
}

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  // 珍珠／線描風格由 SCSS 完整控制配色，不套用 inline 背景
  if (customStyle?.layout === "pearl" || customStyle?.layout === "lineart") {
    return style;
  }

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.background = customStyle.backgroundColor;
  } else {
    // 使用預設選擇的顏色
    style.background = selectedColor.value;
  }

  if (customStyle?.borderColor) {
    style.borderColor = customStyle.borderColor;
    style.borderWidth = `${customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const textStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  // 珍珠／線描風格文字色由 SCSS 控制，不套用 inline 文字色
  if (customStyle?.layout === "pearl" || customStyle?.layout === "lineart") {
    return style;
  }

  if (customStyle?.textColor) {
    style.color = customStyle.textColor;
  } else if (customStyle?.foregroundColor) {
    style.color = customStyle.foregroundColor;
  }

  return style;
});

const hasCustomBackground = computed(() => {
  return !!(
    props.data?.customStyle?.backgroundColor ||
    props.data?.customStyle?.backgroundGradient
  );
});

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "classic";
});
</script>

<template>
  <div
    class="mood-diary-sticky"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <div class="sticky-header" :style="textStyle">
      <component
        :is="currentMoodIcon"
        :size="20"
        :stroke-width="2"
        class="mood-icon"
      />
      <div class="header-right">
        <button
          v-if="boardHasItems"
          type="button"
          class="board-btn"
          aria-label="打開便簽留言板"
          @click.stop="openBoard"
        >
          <StickyNote :size="14" :stroke-width="2" />
        </button>
        <button
          v-if="hasUnsentChanges"
          type="button"
          class="post-btn"
          :disabled="posting"
          @click.stop="submitMood"
        >
          <Check :size="12" :stroke-width="2.5" />
          確定
        </button>
        <span v-else-if="postedAt" class="date posted">
          <Check :size="12" :stroke-width="2.5" />
          {{ postedLabel }}<span class="posted-suffix">已送出</span>
        </span>
        <span v-else class="date">{{ new Date().toLocaleDateString("zh-TW") }}</span>
      </div>
    </div>

    <textarea
      v-model="content"
      class="diary-content"
      :style="textStyle"
      placeholder="寫下今天的心情..."
      @focus="writing = true"
      @blur="writing = false"
    ></textarea>

    <div class="sticky-footer">
      <div class="mood-selector">
        <button
          v-for="(icon, key) in moodIcons"
          :key="key"
          :class="['mood-btn', { active: mood === key }]"
          @click="pickMood(key as MoodKey)"
        >
          <component :is="icon" :size="14" :stroke-width="2" />
        </button>
      </div>
    </div>

    <!-- 有沒看過的紙條：斜釘一張小紙條，點了進留言板 -->
    <button
      v-if="latestUnread && !writing"
      type="button"
      class="mini-note"
      :aria-label="`${unreadAuthorName}留了紙條，打開便簽留言板`"
      @click.stop="openBoard"
    >
      <span class="mini-note-pin" aria-hidden="true"></span>
      <span v-if="moreUnread > 0" class="mini-note-badge">+{{ moreUnread }}</span>
      <span class="mini-note-author">
        <img v-if="unreadAuthorAvatar" :src="unreadAuthorAvatar" alt="" class="mini-note-avatar" />
        <span v-else class="mini-note-avatar mini-note-avatar-fallback">{{ unreadAuthorName.charAt(0) }}</span>
        <span class="mini-note-name">{{ unreadAuthorName }}</span>
      </span>
      <span class="mini-note-text">{{ latestUnread.text }}</span>
    </button>

    <!-- 裝飾膠帶 -->
    <div class="tape"></div>
  </div>
</template>

<style lang="scss" scoped>
.mood-diary-sticky {
  width: 100%;
  height: 100%;
  padding: 16px;
  padding-top: 24px;
  display: flex;
  flex-direction: column;
  position: relative;
  // 讓便利貼那面依組件實際寬度切換窄版（預設大小只有 160px 寬）
  container-type: inline-size;

  // ===== 確定／已送出、留言板圖示、小紙條（顏色跟著版型的文字色） =====
  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .board-btn {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid currentColor;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    opacity: 0.75;
    cursor: pointer;

    &:hover {
      opacity: 1;
    }
  }

  .post-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 24px;
    padding: 0 10px;
    border: none;
    border-radius: 999px;
    background: var(--note-ink, #374151);
    color: var(--note-on-ink, #ffffff);
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }

  .posted {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    white-space: nowrap;
  }

  .posted-suffix {
    margin-left: 3px;
  }

  // 小紙條：牛皮紙＋銅色圖釘，釘在輸入框右下（短日記時那裡通常是空的）
  .mini-note {
    position: absolute;
    right: 10px;
    bottom: var(--mini-note-bottom, 54px);
    z-index: 3;
    width: min(60%, 128px);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 9px 9px;
    border: none;
    border-radius: 2px;
    background: #ede4d6;
    color: #5a4038;
    box-shadow: 2px 4px 10px rgba(60, 40, 30, 0.25);
    transform: rotate(5deg);
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    animation: mini-note-in 0.35s ease-out;
  }

  .mini-note-pin {
    position: absolute;
    top: -6px;
    left: 50%;
    width: 12px;
    height: 12px;
    margin-left: -6px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #e9a27c, #b8653f 60%, #8f4b2c);
    box-shadow: 1px 2px 3px rgba(0, 0, 0, 0.3);
  }

  .mini-note-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    min-width: 20px;
    height: 20px;
    box-sizing: border-box;
    padding: 0 5px;
    border-radius: 10px;
    background: #b8653f;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mini-note-author {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: 11px;
    font-weight: 700;
  }

  .mini-note-avatar {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .mini-note-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #d8c8b4;
    font-size: 9px;
  }

  .mini-note-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mini-note-text {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-family: "LXGW WenKai TC", "Huninn", serif;
    font-size: 13px;
    line-height: 1.35;
    word-break: break-word;
  }

  @keyframes mini-note-in {
    from {
      opacity: 0;
      transform: rotate(5deg) translateY(-6px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: rotate(5deg);
    }
  }

  // 窄版（預設 160px 寬）：「已送出」只留時間和勾、小紙條縮小
  @container (max-width: 139px) {
    .posted-suffix {
      display: none;
    }

    .post-btn {
      padding: 0 8px;
    }

    // 只留名字和一行字，壓在輸入框最下面，短日記的字不會被蓋到
    .mini-note {
      right: 6px;
      bottom: calc(var(--mini-note-bottom, 54px) - 6px);
      width: 58%;
      padding: 10px 7px 6px;
      gap: 2px;
    }

    .mini-note-avatar {
      display: none;
    }

    .mini-note-author {
      font-size: 10px;
    }

    .mini-note-text {
      -webkit-line-clamp: 1;
      font-size: 11px;
    }

    .mini-note-badge {
      top: -7px;
      right: -4px;
      min-width: 18px;
      height: 18px;
      font-size: 10px;
    }
  }

  // Classic 傳統樣式
  &.classic {
    color: #374151;
    --note-ink: #374151;
    --mini-note-bottom: 50px;
    border-radius: 4px;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1), inset 0 0 40px rgba(255, 255, 255, 0.3);
    font-family: "Comic Sans MS", cursive, sans-serif;
    
    .tape {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 60px;
      height: 20px;
      background: rgba(255, 255, 255, 0.7);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      z-index: 2;
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: rgba(0, 0, 0, 0.6);
      }

      .date {
        font-size: 12px;
        color: rgba(0, 0, 0, 0.5);
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.6;
      color: #374151;
      font-family: inherit;
      z-index: 1;

      &::placeholder {
        color: rgba(0, 0, 0, 0.3);
      }

      &:focus {
        outline: none;
      }
    }

    .sticky-footer {
      margin-top: 8px;
      z-index: 1;
    }

    .mood-selector {
      display: flex;
      gap: 4px;

      .mood-btn {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(0, 0, 0, 0.4);
        background: transparent;
        transition: all 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.4);
        }

        &.active {
          color: rgba(0, 0, 0, 0.8);
          background: rgba(255, 255, 255, 0.8);
          transform: scale(1.1);
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    color: #1a1a1a;
    --note-ink: #1a1a1a;
    --mini-note-bottom: 54px;
    border-radius: 16px;
    border: 2px solid #1a1a1a;
    box-shadow: 3px 3px 0px #1a1a1a;
    font-family: inherit;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    
    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.8);
    }
    
    .tape {
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 70px;
      height: 24px;
      background: #fcfcfc;
      border: 2px solid #1a1a1a;
      border-radius: 0px;
      box-shadow: 2px 2px 0px #1a1a1a;
      z-index: 2;
      
      &::after {
        content: '';
        position: absolute;
        top: 2px;
        bottom: 2px;
        left: 4px;
        right: 4px;
        border: 1px dashed rgba(26, 26, 26, 0.3);
      }
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: #1a1a1a;
        filter: drop-shadow(1px 1px 0px rgba(255,255,255,0.5));
      }

      .date {
        font-size: 11px;
        font-weight: 800;
        color: #1a1a1a;
        background: rgba(255, 255, 255, 0.6);
        padding: 2px 8px;
        border-radius: 8px;
        border: 1.5px solid #1a1a1a;
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.6;
      color: #1a1a1a;
      font-family: inherit;
      z-index: 1;

      &::placeholder {
        color: rgba(26, 26, 26, 0.4);
        font-style: italic;
      }

      &:focus {
        outline: none;
      }
      
      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: #1a1a1a;
        border-radius: 3px;
      }
    }

    .sticky-footer {
      margin-top: 8px;
      z-index: 1;
    }

    .mood-selector {
      display: flex;
      gap: 6px;

      .mood-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: rgba(26, 26, 26, 0.6);
        background: rgba(255, 255, 255, 0.5);
        border: 2px solid transparent;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &:hover {
          background: rgba(255, 255, 255, 0.9);
          transform: scale(1.1);
          border-color: rgba(26, 26, 26, 0.2);
        }

        &.active {
          color: #1a1a1a;
          background: #ffeb3b;
          border: 2px solid #1a1a1a;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: scale(1.1);
        }
      }
    }
  }

  // 平面風
  &.flat {
    color: #332650;
    --note-ink: #332650;
    --mini-note-bottom: 72px;
    background-color: #fef08a; // Warm yellow
    border-radius: 24px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    padding: 24px;
    
    .tape { display: none; } // Flat design avoids realistic tape

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
      .mood-icon {
        color: #332650;
        width: clamp(20px, 5vw, 24px);
        height: clamp(20px, 5vw, 24px);
      }
      .date {
        font-size: clamp(12px, 3vw, 14px);
        font-weight: 800;
        color: #332650;
      }
    }

    .diary-content {
      flex: 1; width: 100%; border: none; background: transparent; resize: none;
      font-size: clamp(13px, 3.2vw, 15px);
      font-weight: 700;
      color: #332650;
      line-height: 1.6;
      min-height: 0;
      &::placeholder { color: rgba(51, 38, 80, 0.4); }
      &:focus { outline: none; }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 8px; justify-content: flex-end;
      .mood-btn {
        width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: white; border: 3px solid #332650; color: #332650; transition: transform 0.2s;
        &:hover { transform: scale(1.1); }
        &.active { background: #A7F3D0; box-shadow: 0 4px 0px #332650; transform: translateY(-4px); }
      }
    }
  }

  // 插圖風
  &.illustration {
    color: #1a1a1a;
    --note-ink: #1a1a1a;
    --mini-note-bottom: 58px;
    background-color: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    padding: 34px 16px 16px;
    position: relative;

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1);
    }
    .tape { display: none; }

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      .mood-icon {
        color: #1a1a1a;
        width: clamp(18px, 5vw, 22px);
        height: clamp(18px, 5vw, 22px);
      }
      .date {
        font-size: clamp(11px, 2.8vw, 13px);
        font-weight: 800;
        color: #1a1a1a;
        background: white;
        padding: 2px clamp(4px, 1.5vw, 8px);
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
      }
    }

    .diary-content {
      flex: 1; width: 100%; border: 2px solid #1a1a1a; background: white; resize: none;
      font-size: clamp(12px, 3vw, 14px);
      font-weight: 700;
      color: #1a1a1a;
      line-height: 1.6;
      padding: clamp(4px, 1.5vw, 8px);
      min-height: 0;
      &:focus { outline: none; }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 6px;
      .mood-btn {
        width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
        background: white; border: 2px solid #1a1a1a; color: #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; transition: all 0.1s;
        &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; }
        &.active { background: #B0D0DB; }
      }
    }
  }

  // 像素風
  &.pixel {
    color: #d06d9a;
    --note-ink: #d06d9a;
    --mini-note-bottom: 58px;
    background-color: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    padding: 34px 16px 16px;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'MOOD.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5;
    }
    .tape { display: none; }

    .sticky-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
      .mood-icon {
        color: #d06d9a;
        width: clamp(18px, 5vw, 22px);
        height: clamp(18px, 5vw, 22px);
      }
      .date {
        font-size: clamp(12px, 3vw, 14px);
        font-weight: bold;
        color: #d06d9a;
      }
    }

    .diary-content {
      flex: 1; width: 100%; border: 2px dashed #EAA3C5; background: white; resize: none;
      font-size: clamp(12px, 3vw, 14px);
      font-weight: 600;
      color: #d06d9a;
      line-height: 1.6;
      padding: clamp(4px, 1.5vw, 8px);
      font-family: inherit;
      min-height: 0;
      &:focus { outline: none; border-style: solid; box-shadow: inset 1px 1px 3px rgba(0,0,0,0.05); }
    }

    .sticky-footer { margin-top: 12px; }

    .mood-selector {
      display: flex; gap: 6px; justify-content: flex-end;
      .mood-btn {
        width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
        background: white; border: 2px solid #EAA3C5; color: #F4A2C5; box-shadow: 2px 2px 0px #F5C6DA; transition: all 0.1s;
        &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #F5C6DA; }
        &.active { background: #93E2B6; color: white; border-color: #93E2B6; }
      }
    }
  }

  // 珍珠畫廊風（維梅爾《戴珍珠耳環的少女》幾何拼貼）- 優化版
  &.pearl {
    color: #F8F6F0;
    --note-ink: #FFCE05;
    --note-on-ink: #332D4B;
    --mini-note-bottom: 64px;
    background: linear-gradient(155deg, #3E3A58 0%, #332D4B 100%);
    border: 2.5px solid #FFCE05;
    border-radius: 12px;
    box-shadow:
      0 8px 24px rgba(51, 45, 75, 0.45),
      0 2px 8px rgba(255, 206, 5, 0.15),
      inset 0 0 0 1px rgba(255, 206, 5, 0.18);
    position: relative;
    overflow: hidden;

    // 右上角發光星點裝飾
    &::before {
      content: '';
      position: absolute;
      top: 12px;
      right: 14px;
      width: 8px;
      height: 8px;
      background: radial-gradient(circle, rgba(255, 206, 5, 0.95) 0%, transparent 70%);
      box-shadow:
        0 0 8px 2px rgba(255, 206, 5, 0.6),
        -48px 28px 0 -2px rgba(71, 131, 222, 0.9),
        -48px 28px 8px 0 rgba(71, 131, 222, 0.45),
        20px 42px 0 -3px rgba(255, 198, 174, 0.8),
        20px 42px 6px -1px rgba(255, 198, 174, 0.4);
      border-radius: 50%;
      z-index: 0;
      pointer-events: none;
    }

    // 左下角幾何裝飾
    &::after {
      content: '';
      position: absolute;
      bottom: 14px;
      left: 12px;
      width: 28px;
      height: 28px;
      background: linear-gradient(45deg, rgba(71, 131, 222, 0.15) 0%, transparent 100%);
      border-left: 1.5px solid rgba(71, 131, 222, 0.3);
      border-bottom: 1.5px solid rgba(71, 131, 222, 0.3);
      z-index: 0;
      pointer-events: none;
    }

    .sticky-header {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      flex-shrink: 0;
      gap: 8px;

      .mood-icon {
        color: #FFCE05;
        filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.4));
        flex-shrink: 0;
        width: clamp(20px, 5vw, 24px);
        height: clamp(20px, 5vw, 24px);
      }

      .date {
        font-family: Georgia, 'Noto Serif TC', serif;
        font-style: italic;
        font-size: clamp(11px, 2.8vw, 13px);
        font-weight: 600;
        color: rgba(212, 200, 176, 0.9);
        letter-spacing: 0.3px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .diary-content {
      position: relative;
      z-index: 1;
      flex: 1;
      width: 100%;
      border: none;
      resize: none;
      font-family: Georgia, 'Noto Serif TC', serif;
      font-style: italic;
      font-size: clamp(12px, 3vw, 14px);
      line-height: 1.55;
      color: #F8F6F0;
      background: transparent;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
      letter-spacing: 0.2px;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      word-wrap: break-word;

      &::placeholder {
        color: rgba(248, 246, 240, 0.5);
        font-style: italic;
      }

      &::-webkit-scrollbar {
        width: 5px;
      }
      &::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.1);
        border-radius: 3px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 206, 5, 0.35);
        border-radius: 3px;

        &:hover {
          background: rgba(255, 206, 5, 0.5);
        }
      }
    }

    .sticky-footer {
      margin-top: 14px;
    }

    .mood-selector {
      position: relative;
      z-index: 1;
      display: flex;
      gap: 8px;
      justify-content: flex-end;

      .mood-btn {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(71, 131, 222, 0.2);
        border: 1.5px solid rgba(71, 131, 222, 0.5);
        color: rgba(123, 173, 238, 0.9);
        transition: all 0.2s ease;
        cursor: pointer;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);

        &:hover {
          border-color: rgba(255, 206, 5, 0.7);
          color: #FFCE05;
          background: rgba(71, 131, 222, 0.25);
          transform: translateY(-1px);
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        }

        &.active {
          background: #FFCE05;
          border-color: #FFCE05;
          color: #332D4B;
          box-shadow:
            0 2px 6px rgba(255, 206, 5, 0.4),
            0 0 8px rgba(255, 206, 5, 0.3);
          transform: scale(1.05);
        }

        &:active {
          transform: scale(0.95);
        }
      }
    }
  }

  // 線描插畫風（純白底 + 黑細線手繪 + 零彩色）
  &.lineart {
    color: #1a1a1a;
    --note-ink: #1a1a1a;
    --mini-note-bottom: 58px;
    background: #ffffff;
    border: 1.5px solid #1a1a1a;
    border-radius: 14px;
    box-shadow: none;
    font-family: "Noto Serif TC", serif;

    .tape {
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%) rotate(-3deg);
      width: 56px;
      height: 16px;
      background: #ffffff;
      border: 1.5px solid #1a1a1a;
      box-shadow: none;
      z-index: 2;
    }

    .sticky-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      z-index: 1;

      .mood-icon {
        color: #1a1a1a;
      }

      .date {
        font-size: 12px;
        color: #1a1a1a;
      }
    }

    .diary-content {
      flex: 1;
      width: 100%;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.7;
      color: #1a1a1a;

      &::placeholder {
        color: rgba(26, 26, 26, 0.35);
      }
      &:focus {
        outline: none;
      }
    }

    .sticky-footer {
      margin-top: 12px;
    }

    .mood-selector {
      display: flex;
      gap: 6px;
      justify-content: flex-end;

      .mood-btn {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #ffffff;
        border: 1.5px solid #1a1a1a;
        color: #1a1a1a;
        transition: all 0.15s;

        &.active {
          background: #1a1a1a;
          color: #ffffff;
        }
      }
    }
  }
}
</style>
