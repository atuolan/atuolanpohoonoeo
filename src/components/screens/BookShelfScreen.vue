<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import { useUserStore } from "@/stores/user";
import type { BookMeta, CompanionChatState } from "@/types/book";
import type { StoredCharacter } from "@/types/character";
import { bookPercentFromLengths } from "@/utils/bookReading";
import { ArrowLeft, BookOpen, ChevronDown, Plus, Trash2, User, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const emit = defineEmits<{
  back: [];
  openBook: [book: BookMeta];
}>();

const booksStore = useBooksStore();
const userStore = useUserStore();
const charsStore = useCharactersStore();
const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const showPersonaPicker = ref(false);
const isManaging = ref(false);

onMounted(async () => {
  await Promise.all([
    booksStore.loadBooks(),
    userStore.isLoaded ? null : userStore.loadUserData(),
    charsStore.characters.length === 0 ? charsStore.loadCharacters() : null,
  ]);
});

// ===== 問候 =====
const WEEKDAYS = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
const now = new Date();
const dateLine = `${WEEKDAYS[now.getDay()]} · ${now.getMonth() + 1}月${now.getDate()}日`;
const greeting = (() => {
  const h = now.getHours();
  if (h < 5) return "夜深了";
  if (h < 11) return "早安";
  if (h < 14) return "午安";
  if (h < 18) return "午後好";
  return "晚安";
})();

// ===== 書與進度 =====
function lastReadAt(book: BookMeta): number {
  return booksStore.progressByBook[book.id]?.lastReadAt ?? 0;
}

const sortedBooks = computed(() =>
  [...booksStore.books].sort(
    (a, b) => lastReadAt(b) - lastReadAt(a) || b.createdAt - a.createdAt,
  ),
);

/** 沒讀過回傳 null */
function percentOf(book: BookMeta): number | null {
  const p = booksStore.progressByBook[book.id];
  if (!p) return null;
  return p.percent ?? bookPercentFromLengths(book.chapterLengths, p.chapterIndex, p.charOffset ?? 0);
}

function progressLabel(book: BookMeta): string {
  const pct = percentOf(book);
  if (pct === null) return "未開始";
  if (pct >= 100) return "讀完了";
  return `已讀 ${pct}%`;
}

const heroBook = computed(() => sortedBooks.value.find((b) => booksStore.progressByBook[b.id]));
const heroPercent = computed(() => (heroBook.value ? percentOf(heroBook.value) ?? 0 : 0));
const heroChapterTitle = computed(() => {
  const book = heroBook.value;
  if (!book) return "";
  const index = booksStore.progressByBook[book.id]?.chapterIndex ?? 0;
  return book.chapterTitles[index] ?? "";
});

const subtitle = computed(() => {
  if (heroBook.value) return `接著讀《${heroBook.value.title}》吧`;
  if (booksStore.books.length > 0) return "今天想讀哪一本？";
  return "先放一本書進來吧";
});

// 這本書有沒有角色在陪讀（伴讀存檔還在就是還沒結束）
const heroCompanion = ref<StoredCharacter | null>(null);
watch(
  () => heroBook.value?.id,
  async (bookId) => {
    heroCompanion.value = null;
    if (!bookId) return;
    try {
      const saved = await db.get<CompanionChatState>(
        DB_STORES.APP_SETTINGS,
        `companion-chat-${bookId}`,
      );
      heroCompanion.value = saved
        ? charsStore.getCharacterById(saved.characterId) ?? null
        : null;
    } catch {
      heroCompanion.value = null;
    }
  },
  { immediate: true },
);
const heroCompanionName = computed(
  () => heroCompanion.value?.nickname || heroCompanion.value?.data.name || "",
);

// ===== 沒有封面時的書脊 =====
function hashHue(text: string): number {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

function spineStyle(book: BookMeta) {
  const hue = hashHue(book.title);
  return {
    background: `hsl(${hue} 30% 80%)`,
    color: `hsl(${hue} 35% 20%)`,
  };
}

// ===== 匯入 =====
function triggerImport() {
  fileInput.value?.click();
}

async function importFiles(files: FileList | File[]) {
  for (const file of Array.from(files)) {
    await booksStore.importFile(file);
  }
}

async function handleFileChange(e: Event) {
  const files = (e.target as HTMLInputElement).files;
  if (files?.length) await importFiles(files);
  if (fileInput.value) fileInput.value.value = "";
}

function handleDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes("Files")) isDragging.value = true;
}

function handleDragLeave(e: DragEvent) {
  if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
    isDragging.value = false;
  }
}

async function handleDrop(e: DragEvent) {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files?.length) await importFiles(files);
}

// 錯誤提示幾秒後自己消失
let errorTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => booksStore.importError,
  (err) => {
    if (errorTimer) clearTimeout(errorTimer);
    if (err) errorTimer = setTimeout(() => (booksStore.importError = null), 6000);
  },
);
onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer);
});

// ===== 書格點擊 =====
async function handleTile(book: BookMeta) {
  if (!isManaging.value) {
    emit("openBook", book);
    return;
  }
  if (confirm(`確定要刪除《${book.title}》嗎？閱讀進度也會一起刪掉。`)) {
    await booksStore.deleteBook(book.id);
    if (booksStore.books.length === 0) isManaging.value = false;
  }
}

function handleSelectPersona(personaId: string) {
  userStore.switchPersona(personaId);
  showPersonaPicker.value = false;
}
</script>

<template>
  <div
    class="bookshelf-screen"
    @dragover.prevent="handleDragOver"
    @dragleave="handleDragLeave"
    @drop.prevent="handleDrop"
  >
    <header class="bs-topbar">
      <button class="bs-icon-btn" aria-label="返回" @click="emit('back')">
        <ArrowLeft :size="22" />
      </button>
      <div class="bs-persona">
        <button
          class="bs-persona-btn"
          :aria-expanded="showPersonaPicker"
          aria-label="切換使用者身分"
          @click="showPersonaPicker = !showPersonaPicker"
        >
          <span class="bs-persona-avatar">
            <img v-if="userStore.currentAvatar" :src="userStore.currentAvatar" alt="" />
            <User v-else :size="16" />
          </span>
          <span class="bs-persona-name">{{ userStore.currentName }}</span>
          <ChevronDown :size="14" />
        </button>
        <Transition name="bs-fade">
          <div v-if="showPersonaPicker" class="bs-persona-menu">
            <button
              v-for="p in userStore.personas"
              :key="p.id"
              class="bs-persona-item"
              :class="{ active: userStore.currentPersonaId === p.id }"
              @click="handleSelectPersona(p.id)"
            >
              <span class="bs-persona-avatar">
                <img v-if="p.avatar" :src="p.avatar" alt="" />
                <User v-else :size="14" />
              </span>
              <span class="bs-persona-item-name">{{ p.name }}</span>
            </button>
          </div>
        </Transition>
      </div>
    </header>
    <div v-if="showPersonaPicker" class="bs-menu-backdrop" @click="showPersonaPicker = false" />

    <input
      ref="fileInput"
      type="file"
      accept=".txt,.epub,.pdf"
      multiple
      hidden
      @change="handleFileChange"
    />

    <div class="bs-scroll">
      <div class="bs-inner">
        <div class="bs-greeting">
          <span class="bs-date">{{ dateLine }}</span>
          <h1>{{ greeting }}，<br />{{ subtitle }}</h1>
        </div>

        <Transition name="bs-fade">
          <div v-if="booksStore.importError" class="bs-error" role="alert">
            <span>{{ booksStore.importError }}</span>
            <button class="bs-icon-btn small" aria-label="關閉" @click="booksStore.importError = null">
              <X :size="16" />
            </button>
          </div>
        </Transition>

        <!-- 正在讀 -->
        <section v-if="heroBook" class="bs-hero" aria-label="正在讀">
          <div class="bs-hero-top">
            <div class="bs-hero-cover">
              <img v-if="heroBook.cover" :src="heroBook.cover" alt="" />
              <span v-else class="bs-spine vertical" :style="spineStyle(heroBook)">
                {{ heroBook.title.slice(0, 8) }}
              </span>
            </div>
            <div class="bs-hero-info">
              <span class="bs-eyebrow">正在讀</span>
              <span class="bs-hero-title">{{ heroBook.title }}</span>
              <span v-if="heroBook.author" class="bs-hero-author">{{ heroBook.author }}</span>
              <div class="bs-hero-progress">
                <div class="bs-track">
                  <div class="bs-fill" :style="{ width: `${heroPercent}%` }" />
                </div>
                <span>{{ heroPercent }}%</span>
              </div>
            </div>
          </div>

          <div v-if="heroChapterTitle || heroCompanion" class="bs-hero-note">
            <span class="bs-note-avatar" aria-hidden="true">
              <img v-if="heroCompanion?.avatar" :src="heroCompanion.avatar" alt="" />
              <template v-else-if="heroCompanion">{{ heroCompanionName.slice(0, 1) }}</template>
            </span>
            <p>
              <template v-if="heroChapterTitle">上次停在「{{ heroChapterTitle }}」。</template>
              <template v-if="heroCompanion">{{ heroCompanionName }} 還在陪你讀這本。</template>
            </p>
          </div>

          <button class="bs-primary" @click="emit('openBook', heroBook)">繼續閱讀</button>
        </section>

        <!-- 空書架 -->
        <section v-if="booksStore.books.length === 0 && !booksStore.isLoading" class="bs-empty">
          <BookOpen :size="40" class="bs-empty-icon" />
          <p class="bs-empty-title">書架還是空的</p>
          <p class="bs-empty-hint">匯入 TXT、EPUB 或 PDF，<br />也可以直接把檔案拖進來</p>
          <button class="bs-primary" @click="triggerImport">選擇檔案</button>
        </section>

        <!-- 書架 -->
        <section v-else class="bs-shelf" aria-label="書架">
          <div class="bs-shelf-head">
            <h2>書架</h2>
            <span class="bs-count">{{ booksStore.books.length }} 本</span>
            <button
              v-if="booksStore.books.length > 0"
              class="bs-text-btn"
              :class="{ on: isManaging }"
              @click="isManaging = !isManaging"
            >
              {{ isManaging ? "完成" : "管理" }}
            </button>
          </div>
          <p v-if="isManaging" class="bs-manage-hint">點一本書把它刪掉</p>

          <div class="bs-grid">
            <button
              v-for="book in sortedBooks"
              :key="book.id"
              class="bs-tile"
              :class="{ managing: isManaging }"
              :aria-label="isManaging ? `刪除《${book.title}》` : `打開《${book.title}》`"
              @click="handleTile(book)"
            >
              <span class="bs-tile-cover">
                <img v-if="book.cover" :src="book.cover" alt="" />
                <span v-else class="bs-spine" :style="spineStyle(book)">
                  <span class="bs-spine-text">{{ book.title }}</span>
                </span>
                <span class="bs-format">{{ book.format.toUpperCase() }}</span>
                <span v-if="isManaging" class="bs-tile-delete" aria-hidden="true">
                  <Trash2 :size="14" />
                </span>
              </span>
              <span class="bs-tile-title">{{ book.title }}</span>
              <span class="bs-tile-meta">{{ progressLabel(book) }}</span>
            </button>

            <button
              v-if="!isManaging"
              class="bs-tile bs-import"
              :disabled="booksStore.isLoading"
              @click="triggerImport"
            >
              <span class="bs-tile-cover bs-import-cover">
                <span v-if="booksStore.isLoading" class="bs-spinner" aria-hidden="true" />
                <Plus v-else :size="24" />
              </span>
              <span class="bs-tile-title">{{ booksStore.isLoading ? "解析中…" : "匯入書籍" }}</span>
              <span class="bs-tile-meta">TXT・EPUB・PDF</span>
            </button>
          </div>
        </section>
      </div>
    </div>

    <Transition name="bs-fade">
      <div v-if="isDragging" class="bs-drop" aria-hidden="true">
        <Plus :size="28" />
        <span>放開就匯入</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.bookshelf-screen {
  --bs-bg: var(--color-background, #fff5f8);
  --bs-card: var(--color-surface, #ffffff);
  --bs-text: var(--color-text, #2d3748);
  --bs-sub: var(--color-text-secondary, #6b7280);
  --bs-line: color-mix(in srgb, var(--color-border, #e5e7eb) 80%, transparent);
  --bs-accent: var(--color-primary, #7dd3a8);
  --bs-on-accent: var(--color-on-primary-contrast, color-mix(in srgb, var(--bs-accent) 22%, #0b1f16));
  --bs-hero: color-mix(in srgb, var(--bs-accent) 16%, var(--bs-card));
  --bs-raise: color-mix(in srgb, var(--bs-text) 5%, var(--bs-card));

  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bs-bg);
  color: var(--bs-text);
}

button {
  font-family: inherit;
}

.bs-icon-btn {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 22px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: var(--bs-raise);
  }

  &.small {
    width: 32px;
    height: 32px;
  }
}

// ===== 頂欄 =====
.bs-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px 0 6px;
  padding-top: max(6px, var(--safe-top, 0px));
  flex-shrink: 0;
  position: relative;
  z-index: 31;
}

.bs-persona {
  position: relative;
}

.bs-persona-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 40px;
  padding: 0 10px 0 4px;
  border: 1px solid var(--bs-line);
  border-radius: 20px;
  background: var(--bs-card);
  color: inherit;
  font-size: 13px;
  cursor: pointer;
}

.bs-persona-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bs-raise);
  color: var(--bs-sub);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bs-persona-name {
  max-width: 96px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bs-persona-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px;
  border-radius: 18px;
  background: var(--bs-card);
  border: 1px solid var(--bs-line);
  box-shadow: 0 12px 30px color-mix(in srgb, var(--bs-text) 16%, transparent);
}

.bs-persona-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 44px;
  padding: 6px 10px 6px 6px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bs-raise);
  }

  &.active {
    background: var(--bs-hero);
    font-weight: 700;
  }
}

.bs-persona-item-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bs-menu-backdrop {
  position: absolute;
  inset: 0;
  z-index: 30;
}

// ===== 內容 =====
.bs-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: max(24px, var(--safe-bottom, 0px));
}

// 大螢幕上置中，不要拉成一整條
.bs-inner {
  max-width: 720px;
  margin: 0 auto;
}

.bs-topbar {
  width: 100%;
  max-width: 744px;
  margin: 0 auto;
  box-sizing: border-box;
}

.bs-greeting {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 24px 4px;

  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.bs-date {
  font-size: 13px;
  letter-spacing: 0.04em;
  color: var(--bs-sub);
}

.bs-error {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 6px 6px 6px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--color-error, #e53e3e) 12%, var(--bs-card));
  color: var(--color-error, #e53e3e);
  font-size: 13px;

  span {
    flex: 1;
  }
}

// 正在讀
.bs-hero {
  margin: 16px 16px 0;
  padding: 20px;
  border-radius: 28px;
  background: var(--bs-hero);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.bs-hero-top {
  display: flex;
  gap: 16px;
  align-items: center;
}

.bs-hero-cover {
  width: 64px;
  height: 88px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 6px 14px color-mix(in srgb, var(--bs-text) 18%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bs-spine {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: flex-end;
  padding: 10px;
  font-family: "Noto Serif TC", serif;
  font-weight: 700;
  font-size: 15px;
  line-height: 1.3;
  overflow: hidden;
  overflow-wrap: anywhere;

  &.vertical {
    writing-mode: vertical-rl;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
    letter-spacing: 0.15em;
  }
}

.bs-hero-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bs-eyebrow {
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--bs-sub);
}

.bs-hero-title {
  font-family: "Noto Serif TC", serif;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.bs-hero-author {
  font-size: 12px;
  color: var(--bs-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bs-hero-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--bs-sub);
  font-variant-numeric: tabular-nums;
}

.bs-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: color-mix(in srgb, var(--bs-text) 10%, transparent);
  overflow: hidden;
}

.bs-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--bs-accent);
}

.bs-hero-note {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 18px;
  background: var(--bs-card);

  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
  }
}

.bs-note-avatar {
  width: 22px;
  height: 22px;
  margin-top: 1px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--bs-accent);
  color: var(--bs-on-accent);
  font-size: 11px;
  font-weight: 700;
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--bs-accent) 22%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bs-primary {
  height: 50px;
  border: none;
  border-radius: 25px;
  background: var(--bs-accent);
  color: var(--bs-on-accent);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

// 空書架
.bs-empty {
  margin: 20px 16px 0;
  padding: 36px 24px 24px;
  border-radius: 28px;
  border: 1.5px dashed var(--bs-line);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  .bs-primary {
    align-self: stretch;
    margin-top: 20px;
  }
}

.bs-empty-icon {
  color: var(--bs-sub);
}

.bs-empty-title {
  margin: 12px 0 0;
  font-size: 17px;
  font-weight: 700;
}

.bs-empty-hint {
  margin: 6px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--bs-sub);
}

// 書架
.bs-shelf {
  margin-top: 24px;
  padding: 0 16px;
}

.bs-shelf-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 0 8px;

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
}

.bs-count {
  flex: 1;
  font-size: 13px;
  color: var(--bs-sub);
}

.bs-text-btn {
  height: 36px;
  padding: 0 12px;
  border: none;
  border-radius: 18px;
  background: transparent;
  color: var(--bs-sub);
  font-size: 14px;
  cursor: pointer;

  &.on {
    background: var(--bs-text);
    color: var(--bs-card);
    font-weight: 700;
  }
}

.bs-manage-hint {
  margin: 2px 8px 0;
  font-size: 12px;
  color: var(--color-error, #e53e3e);
}

.bs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 18px 12px;
  margin-top: 12px;
}

.bs-tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  &.managing .bs-tile-cover {
    animation: bs-jiggle 0.3s ease-in-out infinite alternate;
  }
}

@keyframes bs-jiggle {
  from {
    transform: rotate(-1deg);
  }
  to {
    transform: rotate(1deg);
  }
}

.bs-tile-cover {
  position: relative;
  aspect-ratio: 96 / 132;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 4px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--bs-text) 12%, transparent);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.bs-spine-text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .bs-tile.managing .bs-tile-cover {
    animation: none;
  }
}

.bs-format {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: color-mix(in srgb, #000 45%, transparent);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.bs-tile-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--color-error, #e53e3e);
  color: #fff;
}

.bs-tile-title {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bs-tile-meta {
  font-size: 12px;
  color: var(--bs-sub);
}

.bs-import-cover {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  box-sizing: border-box;
  border: 1.5px dashed color-mix(in srgb, var(--bs-text) 25%, transparent);
  box-shadow: none;
  color: var(--bs-sub);
  font-size: 12px;
}

.bs-spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2.5px solid color-mix(in srgb, var(--bs-text) 15%, transparent);
  border-top-color: var(--bs-accent);
  animation: bs-spin 0.8s linear infinite;
}

@keyframes bs-spin {
  to {
    transform: rotate(360deg);
  }
}

.bs-drop {
  position: absolute;
  inset: 10px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 28px;
  border: 2px dashed var(--bs-accent);
  background: color-mix(in srgb, var(--bs-accent) 12%, var(--bs-bg));
  font-size: 15px;
  font-weight: 700;
  pointer-events: none;
}

.bs-fade-enter-active,
.bs-fade-leave-active {
  transition: opacity 0.15s;
}
.bs-fade-enter-from,
.bs-fade-leave-to {
  opacity: 0;
}
</style>
