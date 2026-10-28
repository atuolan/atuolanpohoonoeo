<script setup lang="ts">
/**
 * 禮物回憶卡詳情
 *
 * 全螢幕遮罩中間一張卡：圖示、名稱、送出／收到資訊、小卡、角色感想、共度日記
 */
import { computed, onMounted, ref, watch } from "vue";
import { X } from "lucide-vue-next";
import GiftDiaryEditor from "@/components/gift/GiftDiaryEditor.vue";
import { GIFT_ITEMS } from "@/data/shopItems";
import { getGiftIcon } from "@/utils/giftIcon";
import type { GiftDiaryEntry, GiftMemory } from "@/services/giftMemories";
import {
  addGiftDiaryEntry,
  canAddEntry,
  deleteGiftDiaryEntry,
  giftHintOf,
  markGiftDiaryRead,
  newEntry,
  recordGiftDiaryEvent,
  soloAuthorOf,
  todayString,
  updateGiftDiaryEntry,
} from "@/services/giftDiary";
import { generateGiftDiary } from "@/services/giftDiaryGeneration";
import { useCharactersStore } from "@/stores/characters";

const props = defineProps<{
  memory: GiftMemory;
  characterName: string;
  characterAvatar?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const current = ref<GiftMemory>(props.memory);

watch(
  () => props.memory,
  (memory) => {
    current.value = memory;
  },
);

const rarity = computed<string>(() => {
  if (!current.value.itemId) return "special";
  return GIFT_ITEMS.find((item) => item.id === current.value.itemId)?.rarity ?? "special";
});

const rarityLabels: Record<string, string> = {
  common: "普通",
  uncommon: "優良",
  rare: "稀有",
  epic: "史詩",
  legendary: "傳說",
  special: "專屬心意",
};

const rarityLabel = computed(() => rarityLabels[rarity.value] || "");

const giftIcon = computed(() => getGiftIcon(current.value.itemId));

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

const sentDate = computed(() => {
  const date = new Date(current.value.sentAt);
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
});

const directionLine = computed(() =>
  current.value.direction === "to-char"
    ? `送給 ${props.characterName}・${sentDate.value}`
    : `${props.characterName} 送的・${sentDate.value}`,
);

// ===== 共度日記 =====

const canWriteTogether = computed(() => canAddEntry(current.value, "together"));
const canWriteSolo = computed(() => canAddEntry(current.value, "solo"));
const soloAuthor = computed(() => soloAuthorOf(current.value));

type EditorMode = "together" | "solo" | "edit";

const editorMode = ref<EditorMode | null>(null);
const editingEntry = ref<GiftDiaryEntry | null>(null);
const saving = ref(false);

const editorTitle = computed(() => {
  if (editorMode.value === "together") return "那天一起用";
  if (editorMode.value === "solo") return "我自己用的時候";
  return "編輯日記";
});

const editorHint = computed(() =>
  editorMode.value === "together" ? giftHintOf(current.value) : "",
);

const editorDate = computed(() =>
  editorMode.value === "edit" && editingEntry.value ? editingEntry.value.date : todayString(),
);

const editorContent = computed(() =>
  editorMode.value === "edit" && editingEntry.value ? editingEntry.value.content : "",
);

/** 生成中的對象："solo" 或某篇日記的 id；同時只跑一個 */
const generating = ref<string | null>(null);
const genError = ref<{ scope: string; text: string } | null>(null);

function applyMemory(updated: GiftMemory | null): void {
  if (updated) current.value = updated;
}

function entryLabel(entry: GiftDiaryEntry): string {
  if (entry.kind === "together") return "那天一起用";
  if (entry.author === "char") return `${props.characterName}自己用的時候`;
  return "我自己用的時候";
}

function formatEntryDate(date: string): string {
  return date ? date.replace(/-/g, "/") : "";
}

async function currentCharacter() {
  const store = useCharactersStore();
  if (!store.characters.length) await store.loadCharacters();
  return store.getCharacterById(current.value.characterId);
}

function openTogetherEditor(): void {
  editingEntry.value = null;
  editorMode.value = "together";
}

function openSoloEditor(): void {
  editingEntry.value = null;
  editorMode.value = "solo";
}

function openEditEditor(entry: GiftDiaryEntry): void {
  editingEntry.value = entry;
  editorMode.value = "edit";
}

function closeEditor(): void {
  editorMode.value = null;
  editingEntry.value = null;
}

async function handleSave(payload: { date: string; content: string }): Promise<void> {
  const mode = editorMode.value;
  if (!mode) return;
  saving.value = true;
  try {
    if (mode === "edit" && editingEntry.value) {
      const updated = await updateGiftDiaryEntry(
        current.value.characterId,
        current.value.id,
        editingEntry.value.id,
        { date: payload.date, content: payload.content },
      );
      applyMemory(updated);
    } else {
      const entry = newEntry({
        kind: mode === "together" ? "together" : "solo",
        author: "user",
        date: payload.date,
        content: payload.content,
      });
      const updated = await addGiftDiaryEntry(current.value.characterId, current.value.id, entry);
      applyMemory(updated);
      await recordGiftDiaryEvent(current.value.characterId, current.value, payload.content, "user");
    }
    closeEditor();
  } catch (error) {
    console.warn("[GiftMemoryCard] 儲存日記失敗", error);
  } finally {
    saving.value = false;
  }
}

async function writeCharSolo(): Promise<void> {
  if (generating.value) return;
  genError.value = null;
  generating.value = "solo";
  try {
    const character = await currentCharacter();
    if (!character) {
      genError.value = { scope: "solo", text: "沒寫成，再試一次" };
      return;
    }
    const output = await generateGiftDiary({
      character,
      memory: current.value,
      mode: "solo",
    });
    if (!output?.diary) {
      genError.value = { scope: "solo", text: "沒寫成，再試一次" };
      return;
    }
    const updated = await addGiftDiaryEntry(
      current.value.characterId,
      current.value.id,
      newEntry({
        kind: "solo",
        author: "char",
        date: todayString(),
        content: output.diary,
      }),
    );
    applyMemory(updated);
    await recordGiftDiaryEvent(
      current.value.characterId,
      current.value,
      output.summary || output.diary,
      "char",
    );
  } catch (error) {
    console.warn("[GiftMemoryCard] 讓他寫日記失敗", error);
    genError.value = { scope: "solo", text: "沒寫成，再試一次" };
  } finally {
    generating.value = null;
  }
}

async function writeMargin(entry: GiftDiaryEntry): Promise<void> {
  if (generating.value) return;
  genError.value = null;
  generating.value = entry.id;
  try {
    const character = await currentCharacter();
    if (!character) {
      genError.value = { scope: entry.id, text: "沒寫成，再試一次" };
      return;
    }
    const output = await generateGiftDiary({
      character,
      memory: current.value,
      mode: "margin",
      entry,
    });
    if (!output?.margin) {
      genError.value = { scope: entry.id, text: "沒寫成，再試一次" };
      return;
    }
    const updated = await updateGiftDiaryEntry(
      current.value.characterId,
      current.value.id,
      entry.id,
      { margin: output.margin },
    );
    applyMemory(updated);
  } catch (error) {
    console.warn("[GiftMemoryCard] 角色批註失敗", error);
    genError.value = { scope: entry.id, text: "沒寫成，再試一次" };
  } finally {
    generating.value = null;
  }
}

async function removeEntry(entry: GiftDiaryEntry): Promise<void> {
  if (!window.confirm("要刪掉這篇日記嗎？")) return;
  try {
    const updated = await deleteGiftDiaryEntry(
      current.value.characterId,
      current.value.id,
      entry.id,
    );
    applyMemory(updated);
  } catch (error) {
    console.warn("[GiftMemoryCard] 刪除日記失敗", error);
  }
}

onMounted(() => {
  if (!current.value.entries.some((entry) => entry.unread)) return;
  const characterId = current.value.characterId;
  const memoryId = current.value.id;
  current.value = {
    ...current.value,
    entries: current.value.entries.map((entry) =>
      entry.unread ? { ...entry, unread: false } : entry,
    ),
  };
  void markGiftDiaryRead(characterId, memoryId);
});
</script>

<template>
  <Teleport to="body">
    <div class="memory-card-overlay" @click.self="emit('close')">
      <div class="memory-card" @click.stop>
        <button class="card-close" type="button" @click="emit('close')">
          <X :size="18" />
        </button>

        <div class="gift-icon" :class="`rarity-${rarity}`">
          <component :is="giftIcon" :size="40" />
        </div>

        <div class="card-heading">
          <h2 class="gift-name">{{ current.name }}</h2>
          <span v-if="current.doll" class="doll-tag">已連結</span>
        </div>
        <span class="rarity-text" :class="`rarity-${rarity}`">{{ rarityLabel }}</span>

        <p class="direction-line">{{ directionLine }}</p>

        <p v-if="current.description" class="gift-description">
          {{ current.description }}
        </p>

        <div v-if="current.cardText" class="card-paper">
          <span class="paper-label">小卡</span>
          <p class="paper-text">{{ current.cardText }}</p>
        </div>

        <blockquote v-if="current.reaction" class="reaction">
          <p class="reaction-text">「{{ current.reaction }}」</p>
          <footer class="reaction-author">— {{ characterName }}</footer>
        </blockquote>

        <section class="diary">
          <h3 class="diary-title">共度日記</h3>

          <div class="diary-actions">
            <button
              type="button"
              class="diary-btn"
              :disabled="!canWriteTogether"
              @click="openTogetherEditor"
            >
              寫那天一起用
            </button>
            <button
              v-if="soloAuthor === 'char'"
              type="button"
              class="diary-btn"
              :disabled="!canWriteSolo || generating !== null"
              @click="writeCharSolo"
            >
              {{ generating === "solo" ? `${characterName}正在寫…` : `讓${characterName}寫自己用的時候` }}
            </button>
            <button
              v-else
              type="button"
              class="diary-btn"
              :disabled="!canWriteSolo"
              @click="openSoloEditor"
            >
              寫我自己用的時候
            </button>
          </div>

          <p v-if="!canWriteTogether || !canWriteSolo" class="diary-used">這份禮物用完了</p>
          <p v-if="genError?.scope === 'solo'" class="diary-error">{{ genError.text }}</p>

          <div v-if="current.entries.length" class="diary-list">
            <article v-for="entry in current.entries" :key="entry.id" class="diary-entry">
              <div class="entry-head">
                <span class="entry-label">
                  {{ entryLabel(entry) }}・{{ formatEntryDate(entry.date) }}
                </span>
                <button
                  v-if="entry.author === 'user'"
                  type="button"
                  class="entry-link"
                  @click="openEditEditor(entry)"
                >
                  編輯
                </button>
              </div>

              <p class="entry-content">{{ entry.content }}</p>

              <p v-if="entry.margin" class="entry-margin">✎ {{ entry.margin }}</p>

              <div class="entry-actions">
                <button
                  v-if="
                    entry.kind === 'together' && entry.author === 'user' && !entry.margin
                  "
                  type="button"
                  class="diary-btn small"
                  :disabled="generating !== null"
                  @click="writeMargin(entry)"
                >
                  {{ generating === entry.id ? `${characterName}在看…` : `給${characterName}看看` }}
                </button>
                <button type="button" class="entry-link" @click="removeEntry(entry)">
                  刪除
                </button>
              </div>

              <p v-if="genError?.scope === entry.id" class="diary-error">{{ genError.text }}</p>
            </article>
          </div>
        </section>
      </div>
    </div>
  </Teleport>

  <GiftDiaryEditor
    v-if="editorMode"
    :title="editorTitle"
    :hint="editorHint"
    :initial-date="editorDate"
    :initial-content="editorContent"
    :saving="saving"
    @save="handleSave"
    @cancel="closeEditor"
  />
</template>

<style lang="scss" scoped>
.memory-card-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
}

.memory-card {
  position: relative;
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px 20px 28px;
  border-radius: 20px;
  background: var(--color-surface, #fff);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--color-border, #eee);
    border-radius: 2px;
  }
}

.card-close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-surface-hover, #f0f0f0);
  color: var(--color-text-secondary, #666);
  cursor: pointer;

  &:active {
    transform: scale(0.94);
  }
}

.gift-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
  margin: 0 auto 14px;
  border-radius: 50%;
  color: var(--color-text, #333);
  background: var(--color-surface-hover, #f0f0f0);

  &.rarity-common {
    background: #f1f2f4;
    color: #6b7280;
  }

  &.rarity-uncommon {
    background: #e3f6ec;
    color: #34a853;
  }

  &.rarity-rare {
    background: #e4eefc;
    color: #3b82f6;
  }

  &.rarity-epic {
    background: #efe8fd;
    color: #8b5cf6;
  }

  &.rarity-legendary {
    background: linear-gradient(135deg, #fdf0c8 0%, #fbdfd4 100%);
    color: #d97706;
  }

  &.rarity-special {
    background: #fdeee2;
    color: #e07a3f;
  }
}

.card-heading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.gift-name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  text-align: center;
  color: var(--color-text, #333);
}

.doll-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-primary, #7dd3a8);
  background: rgba(125, 211, 168, 0.15);
}

.rarity-text {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  text-align: center;
  color: var(--color-text-secondary, #666);

  &.rarity-legendary {
    color: #d97706;
  }

  &.rarity-special {
    color: #e07a3f;
  }
}

.direction-line {
  margin: 6px 0 0;
  font-size: 12px;
  text-align: center;
  color: var(--color-text-secondary, #666);
}

.gift-description {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
  color: var(--color-text-secondary, #666);
}

.card-paper {
  position: relative;
  margin: 18px 2px 0;
  padding: 20px 14px 14px;
  border: 1px dashed var(--color-border, #ddd);
  border-radius: 8px;
  background: #fdf8ee;
  transform: rotate(-1deg);
}

.paper-label {
  position: absolute;
  top: 6px;
  left: 10px;
  font-size: 10px;
  letter-spacing: 1px;
  color: #b09a7c;
}

.paper-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: #5a4a38;
  white-space: pre-wrap;
}

.reaction {
  margin: 18px 0 0;
  padding: 12px 14px;
  border-left: 3px solid var(--color-primary, #7dd3a8);
  border-radius: 0 10px 10px 0;
  background: var(--color-surface-hover, #f7f7f7);
}

.reaction-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #333);
}

.reaction-author {
  margin-top: 6px;
  font-size: 12px;
  text-align: right;
  color: var(--color-text-secondary, #666);
}

.diary {
  margin-top: 20px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border, #eee);
}

.diary-title {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.diary-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.diary-btn {
  padding: 7px 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 14px;
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text, #333);
  background: var(--color-surface, #fff);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover, #f0f0f0);
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &.small {
    padding: 5px 10px;
    font-size: 11px;
  }
}

.diary-used {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--color-text-secondary, #666);
  opacity: 0.75;
}

.diary-error {
  margin: 6px 0 0;
  font-size: 11px;
  color: #ef4444;
}

.diary-list {
  margin-top: 12px;
}

.diary-entry {
  padding: 12px;
  border-radius: 12px;
  background: var(--color-surface-hover, #f7f7f7);

  & + & {
    margin-top: 10px;
  }
}

.entry-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.entry-label {
  font-size: 11px;
  color: var(--color-text-secondary, #666);
}

.entry-content {
  margin: 6px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--color-text, #333);
  white-space: pre-wrap;
}

.entry-margin {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.6;
  text-align: right;
  color: var(--color-primary, #7dd3a8);
  transform: rotate(-1.5deg);
}

.entry-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 8px;
}

.entry-link {
  padding: 0;
  border: none;
  background: none;
  font-size: 11px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;

  &:active {
    opacity: 0.6;
  }
}

body.is-night-mode {
  .gift-icon {
    &.rarity-common {
      background: rgba(255, 255, 255, 0.08);
      color: var(--color-text-secondary, #aaa);
    }

    &.rarity-uncommon {
      background: rgba(52, 211, 153, 0.15);
      color: #6ee7b7;
    }

    &.rarity-rare {
      background: rgba(96, 165, 250, 0.15);
      color: #93c5fd;
    }

    &.rarity-epic {
      background: rgba(167, 139, 250, 0.18);
      color: #c4b5fd;
    }

    &.rarity-legendary {
      background: linear-gradient(135deg, rgba(251, 191, 36, 0.2) 0%, rgba(248, 113, 113, 0.2) 100%);
      color: #fcd34d;
    }

    &.rarity-special {
      background: rgba(255, 183, 77, 0.15);
      color: #ffb74d;
    }
  }

  .card-close {
    background: var(--color-surface-hover, #2a2a3e);
    color: var(--color-text-secondary, #aaa);
  }

  .card-paper {
    border-color: rgba(240, 230, 216, 0.25);
    background: #2a2622;
  }

  .paper-label {
    color: #a8987f;
  }

  .paper-text {
    color: #f0e6d8;
  }

  .rarity-text {
    &.rarity-legendary {
      color: #fcd34d;
    }

    &.rarity-special {
      color: #ffb74d;
    }
  }

  .diary-btn {
    border-color: rgba(240, 230, 216, 0.2);
    background: #2f2b27;
    color: #f0e6d8;
  }

  .entry-margin {
    color: var(--color-primary, #7dd3a8);
  }
}
</style>
