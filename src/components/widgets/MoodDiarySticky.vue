<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import { useCharactersStore } from "@/stores/characters";
import {
  CHAR_STICKY_NOTE_ADDED_EVENT,
  loadCharStickyNotes,
  type CharStickyNote,
} from "@/services/charStickyNotes";
import type { WidgetCustomStyle } from "@/types";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Frown,
  Heart,
  Meh,
  Smile,
  Sparkles,
  StickyNote,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    content?: string;
    mood?: "happy" | "sad" | "neutral" | "love" | "excited";
    color?: string;
    updatedAt?: number; // user 最後一次改內容或點心情的時間（帶進線上聊天提示詞用）
    moodChosen?: boolean; // user 點過心情按鈕（預設亮著的「開心」不算）
    noteFace?: "char" | "mine"; // 目前顯示 char 的便利貼還是自己的日記
    seenNoteId?: string; // 已經自動翻過面的最新便利貼
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (e: "navigate", payload: { type: string; characterId?: string; chatId?: string }): void;
}>();

const canvasStore = useCanvasStore();

// 便籤顏色選項
const colors = [
  "#fef3c7", // 黃
  "#fce7f3", // 粉
  "#dbeafe", // 藍
  "#d1fae5", // 綠
  "#ede9fe", // 紫
];

const content = ref(props.data?.content || "");
const mood = ref(props.data?.mood || "happy");
const selectedColor = ref(props.data?.color || colors[0]);
const updatedAt = ref(props.data?.updatedAt);
const moodChosen = ref(props.data?.moodChosen === true);

// ===== char 寫的便利貼 =====
const charactersStore = useCharactersStore();
if (charactersStore.characters.length === 0 && !charactersStore.isLoading) {
  void charactersStore.loadCharacters();
}

const notes = ref<CharStickyNote[]>([]);
const noteFace = ref<"char" | "mine">(props.data?.noteFace ?? "mine");
const seenNoteId = ref(props.data?.seenNoteId);
// 0 是最新一張，往上是更舊的
const noteIndex = ref(0);
const isEditMode = computed(() => canvasStore.isEditMode);

function persist() {
  canvasStore.updateWidgetData(props.widgetId, {
    content: content.value,
    mood: mood.value,
    color: selectedColor.value,
    updatedAt: updatedAt.value,
    moodChosen: moodChosen.value,
    noteFace: noteFace.value,
    seenNoteId: seenNoteId.value,
    customStyle: props.data?.customStyle,
  });
}

const showingNote = computed(() => noteFace.value === "char" && notes.value.length > 0);
const currentNote = computed(
  () => notes.value[Math.min(noteIndex.value, notes.value.length - 1)] ?? null,
);
const noteCharacter = computed(() => {
  const note = currentNote.value;
  return note ? charactersStore.characters.find((c) => c.id === note.characterId) ?? null : null;
});
const noteAuthorName = computed(
  () =>
    noteCharacter.value?.nickname ||
    noteCharacter.value?.data?.name ||
    currentNote.value?.characterName ||
    "",
);
const noteAuthorAvatar = computed(() => noteCharacter.value?.avatar || "");
const noteDate = computed(() => {
  if (!currentNote.value) return "";
  const date = new Date(currentNote.value.createdAt);
  return `${date.getMonth() + 1}/${date.getDate()}`;
});

// 有沒看過的新便利貼就翻到 char 那面
function showLatestIfNew() {
  const latest = notes.value[0];
  if (!latest || latest.id === seenNoteId.value) return;
  seenNoteId.value = latest.id;
  noteFace.value = "char";
  noteIndex.value = 0;
  persist();
}

async function refreshNotes() {
  try {
    notes.value = await loadCharStickyNotes();
  } catch (error) {
    console.warn("[MoodDiarySticky] 讀取便利貼失敗:", error);
    notes.value = [];
  }
  showLatestIfNew();
}

function handleNoteAdded() {
  void refreshNotes();
}

onMounted(() => {
  void refreshNotes();
  window.addEventListener(CHAR_STICKY_NOTE_ADDED_EVENT, handleNoteAdded);
});

onUnmounted(() => {
  window.removeEventListener(CHAR_STICKY_NOTE_ADDED_EVENT, handleNoteAdded);
});

function showMine() {
  if (isEditMode.value) return;
  noteFace.value = "mine";
  persist();
}

function showNotes() {
  if (isEditMode.value) return;
  noteFace.value = "char";
  noteIndex.value = 0;
  persist();
}

function olderNote() {
  if (noteIndex.value < notes.value.length - 1) noteIndex.value++;
}

function newerNote() {
  if (noteIndex.value > 0) noteIndex.value--;
}

function openNoteChat() {
  const note = currentNote.value;
  if (isEditMode.value || !note) return;
  emit("navigate", { type: "chat", characterId: note.characterId, chatId: note.chatId });
}

// 內容或心情變了才算「寫過」，換顏色不算
watch([content, mood, moodChosen], () => {
  updatedAt.value = Date.now();
  persist();
});
watch(selectedColor, persist);

const moodIcons = {
  happy: Smile,
  sad: Frown,
  neutral: Meh,
  love: Heart,
  excited: Sparkles,
};

function pickMood(key: keyof typeof moodIcons) {
  mood.value = key;
  moodChosen.value = true;
}

const currentMoodIcon = computed(() => moodIcons[mood.value]);

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
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground, 'showing-note': showingNote }]"
    :style="containerStyle"
  >
    <!-- char 寫的便利貼 -->
    <template v-if="showingNote && currentNote">
      <div class="sticky-header" :style="textStyle">
        <button type="button" class="note-author" @click.stop="openNoteChat">
          <img v-if="noteAuthorAvatar" :src="noteAuthorAvatar" alt="" class="note-avatar" />
          <span v-else class="note-avatar note-avatar-fallback">{{ noteAuthorName.charAt(0) }}</span>
          <span class="note-author-name">{{ noteAuthorName }}<span class="note-author-suffix">留的</span></span>
        </button>
        <span class="date">{{ noteDate }}</span>
      </div>

      <div class="diary-content note-content" :style="textStyle">{{ currentNote.text }}</div>

      <div class="sticky-footer note-footer" :style="textStyle">
        <div v-if="notes.length > 1" class="note-pager">
          <button
            type="button"
            class="note-nav"
            :disabled="noteIndex >= notes.length - 1"
            aria-label="上一張"
            @click.stop="olderNote"
          >
            <ChevronLeft :size="14" :stroke-width="2" />
          </button>
          <span class="note-count">{{ notes.length - noteIndex }}/{{ notes.length }}</span>
          <button
            type="button"
            class="note-nav"
            :disabled="noteIndex === 0"
            aria-label="下一張"
            @click.stop="newerNote"
          >
            <ChevronRight :size="14" :stroke-width="2" />
          </button>
        </div>
        <button type="button" class="note-flip" aria-label="我的日記" @click.stop="showMine">
          <span class="note-flip-text">我的日記</span>
          <ArrowLeftRight :size="12" :stroke-width="2" />
        </button>
      </div>
    </template>

    <!-- 自己的日記 -->
    <template v-else>
      <div class="sticky-header" :style="textStyle">
        <component
          :is="currentMoodIcon"
          :size="20"
          :stroke-width="2"
          class="mood-icon"
        />
        <div class="header-right">
          <button
            v-if="notes.length > 0"
            type="button"
            class="note-flip note-flip-icon"
            aria-label="看便利貼"
            @click.stop="showNotes"
          >
            <StickyNote :size="14" :stroke-width="2" />
          </button>
          <span class="date">{{ new Date().toLocaleDateString("zh-TW") }}</span>
        </div>
      </div>

      <textarea
        v-model="content"
        class="diary-content"
        :style="textStyle"
        placeholder="寫下今天的心情..."
      ></textarea>

      <div class="sticky-footer">
        <div class="mood-selector">
          <button
            v-for="(icon, key) in moodIcons"
            :key="key"
            :class="['mood-btn', { active: mood === key }]"
            @click="pickMood(key as keyof typeof moodIcons)"
          >
            <component :is="icon" :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>
    </template>

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

  // ===== char 便利貼那面與切換按鈕（顏色跟著版型的文字色） =====
  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .note-author {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .note-avatar {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .note-avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    background: rgba(0, 0, 0, 0.08);
  }

  .note-author-name {
    font-size: 13px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .note-content {
    min-height: 0;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .note-footer {
    // 疊在版型的角落裝飾（如珍珠風左下角的框）上面
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .note-pager {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 11px;
    opacity: 0.75;
  }

  .note-nav {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:disabled {
      opacity: 0.3;
      cursor: default;
    }
  }

  .note-flip {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border: 1px solid currentColor;
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font-size: 11px;
    line-height: 1.2;
    opacity: 0.75;
    cursor: pointer;
    white-space: nowrap;

    &:hover {
      opacity: 1;
    }
  }

  .note-flip-icon {
    margin-left: 0;
    padding: 3px;
  }

  // 窄版：切換按鈕只留圖示、名字不加「留的」、頭像縮小
  @container (max-width: 139px) {
    .note-flip {
      padding: 3px;
    }

    .note-flip-text,
    .note-author-suffix {
      display: none;
    }

    .note-avatar {
      width: 18px;
      height: 18px;
    }

    .note-author {
      gap: 4px;
    }
  }

  // Classic 傳統樣式
  &.classic {
    color: #374151;
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
