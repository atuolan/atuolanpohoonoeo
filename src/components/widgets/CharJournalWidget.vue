<script setup lang="ts">
import { computed } from "vue";
import { useCanvasStore } from "@/stores/canvas";
import { useWidgetCharacter } from "@/composables/useWidgetCharacter";
import { useCharJournal, type JournalView } from "@/composables/useCharJournal";
import type { WidgetCustomStyle } from "@/types";

const props = defineProps<{
  widgetId: string;
  data?: {
    characterId?: string;
    layout?: string; // "journal"
    customStyle?: WidgetCustomStyle;
  };
}>();

const emit = defineEmits<{
  (
    e: "navigate",
    payload: string | { type: string; characterId?: string; chatId?: string },
  ): void;
}>();

const canvasStore = useCanvasStore();
const dataRef = computed(() => props.data);
// 沒綁角色時跟最近聊天的角色，預設佈局放的組件才不會是一塊空白
const { character, characterId, displayName, chatId } = useWidgetCharacter(
  dataRef,
  { fallbackToRecent: true },
);
const { journal, isLoaded } = useCharJournal(characterId, chatId);

const isEditMode = computed(() => canvasStore.isEditMode);

const MOOD_STICKERS: Record<NonNullable<JournalView["mood"]>, string> = {
  happy: "😊",
  neutral: "😐",
  sad: "😢",
  angry: "😠",
  excited: "🤩",
};
const moodSticker = computed(() =>
  journal.value?.mood ? MOOD_STICKERS[journal.value.mood] : "",
);

const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const cs = props.data?.customStyle;
  if (cs?.backgroundGradient) style.background = cs.backgroundGradient;
  else if (cs?.backgroundColor) style.background = cs.backgroundColor;
  const color = cs?.textColor || cs?.foregroundColor;
  if (color) style.color = color;
  return style;
});

function handleClick() {
  if (isEditMode.value) return;
  if (!character.value) {
    emit("navigate", { type: "chat" });
  } else if (journal.value?.source === "diary") {
    emit("navigate", {
      type: "chat",
      characterId: character.value.id,
      chatId: chatId.value || undefined,
    });
  } else {
    // 手帳來自頭盔TA，或還沒有內容：都帶去頭盔TA
    emit("navigate", "peek-phone");
  }
}
</script>

<template>
  <div class="char-journal-widget" :style="containerStyle" @click="handleClick">
    <span class="tape" aria-hidden="true"></span>

    <div v-if="!character" class="empty-hint">
      <span class="emoji">📔</span>
      <span class="hint-text">還沒有聊天，去找角色聊聊吧</span>
    </div>

    <template v-else-if="journal">
      <span v-if="moodSticker" class="mood-sticker">{{ moodSticker }}</span>

      <header class="meta">
        <span class="date">{{ journal.dateLabel }}</span>
        <span v-if="journal.weather" class="weather">· {{ journal.weather }}</span>
        <span class="owner">{{ displayName }} 的手帳</span>
      </header>

      <p
        v-if="journal.content"
        class="content"
        :class="{ 'is-long': journal.schedule.length === 0 }"
      >
        {{ journal.content }}
      </p>

      <ul v-if="journal.schedule.length" class="schedule">
        <li
          v-for="item in journal.schedule"
          :key="item.id"
          :class="{ done: item.done }"
        >
          <span class="time">{{ item.time }}</span>
          <span class="title">{{ item.title }}</span>
        </li>
      </ul>
    </template>

    <div v-else-if="isLoaded" class="empty-hint">
      <span class="emoji">📔</span>
      <span class="hint-text">{{ displayName }} 還沒寫手帳 · 去頭盔TA 看看</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 橫線間距：內文行高與紙紋對齊，字像寫在線上
$line: 22px;

.char-journal-widget {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-radius: 18px;
  background: #fffdf9;
  color: #5b4636;
  padding: 14px 16px 12px;
  box-sizing: border-box;
  cursor: pointer;
  overflow: hidden;
  position: relative;
}

// 左上角一小段紙膠帶
.tape {
  position: absolute;
  top: -3px;
  left: 22px;
  width: 52px;
  height: 14px;
  background: repeating-linear-gradient(
    45deg,
    rgba(232, 180, 160, 0.55) 0 6px,
    rgba(232, 180, 160, 0.4) 6px 12px
  );
  transform: rotate(-4deg);
  border-radius: 2px;
  pointer-events: none;
}

// 心情貼紙：歪歪地貼在右上角
.mood-sticker {
  position: absolute;
  top: 8px;
  right: 12px;
  font-size: 24px;
  line-height: 1;
  transform: rotate(10deg);
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.12));
  pointer-events: none;
}

.meta {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-right: 34px; // 留給心情貼紙
  min-width: 0;
  white-space: nowrap;

  .date {
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.5px;
  }

  .weather {
    font-size: 12px;
    opacity: 0.7;
  }

  .owner {
    margin-left: auto;
    font-size: 11px;
    opacity: 0.55;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.content {
  margin: 0;
  font-size: 12.5px;
  line-height: $line;
  height: $line * 2;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent $line - 1px,
    color-mix(in srgb, currentColor 14%, transparent) $line - 1px,
    color-mix(in srgb, currentColor 14%, transparent) $line
  );

  &.is-long {
    height: $line * 3;
    -webkit-line-clamp: 3;
    line-clamp: 3;
  }
}

.schedule {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  gap: 10px;
  min-width: 0;
  font-size: 11px;

  li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    white-space: nowrap;

    &.done .title {
      text-decoration: line-through;
      opacity: 0.5;
    }
  }

  .time {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 8px;
    background: color-mix(in srgb, currentColor 10%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.empty-hint {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0.7;

  .emoji {
    font-size: 22px;
  }

  .hint-text {
    font-size: 12px;
  }
}
</style>
