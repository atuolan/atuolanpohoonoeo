<script setup lang="ts">
import CompanionChatPanel from "@/components/common/CompanionChatPanel.vue";
import { useCompanionChat } from "@/composables/useCompanionChat";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useUserStore } from "@/stores/user";
import type { ReaderBackground, ReaderPrefs, StoredBook } from "@/types/book";
import {
  bookPercent,
  offsetForPage,
  pageForOffset,
  remainingMinutes,
  splitParagraphs,
  type PageProbe,
} from "@/utils/bookReading";
import { ArrowLeft, List, Minus, Plus, Users, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, onUnmounted, ref, toRef, watch } from "vue";

const props = defineProps<{
  book: StoredBook;
}>();

const emit = defineEmits<{
  back: [];
}>();

const booksStore = useBooksStore();
const charsStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();
const userStore = useUserStore();

const COLUMN_GAP = 48;
const SWIPE_THRESHOLD = 50;

const BACKGROUNDS: Record<
  ReaderBackground,
  { bg: string; text: string; label: string; dark?: boolean }
> = {
  sepia: { bg: "#fdf6e3", text: "#3c3836", label: "護眼" },
  white: { bg: "#ffffff", text: "#222222", label: "白底" },
  night: { bg: "#1a1a2e", text: "#e0e0e0", label: "夜間", dark: true },
  green: { bg: "#e8f5e9", text: "#2e4a2e", label: "綠底" },
};
const BACKGROUND_KEYS = Object.keys(BACKGROUNDS) as ReaderBackground[];

const FONT_FAMILIES: Record<ReaderPrefs["fontFamily"], string> = {
  serif: "'Noto Serif TC', 'Source Han Serif TC', 'Songti TC', serif",
  sans: "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif",
};

// ===== 閱讀設定 =====
const prefs = computed(() => booksStore.readerPrefs);
const palette = computed(() => BACKGROUNDS[prefs.value.background] ?? BACKGROUNDS.sepia);

const paletteVars = computed(() => {
  const { bg, text, dark } = palette.value;
  return {
    "--rd-bg": bg,
    "--rd-text": text,
    "--rd-sub": `color-mix(in srgb, ${text} 58%, ${bg})`,
    "--rd-line": `color-mix(in srgb, ${text} 12%, ${bg})`,
    "--rd-raise": `color-mix(in srgb, ${text} 6%, ${bg})`,
    "--rd-sheet": `color-mix(in srgb, ${text} 3%, ${bg})`,
    // 亮底用深色膠囊；夜間改用稍亮的暗色，避免一條刺眼的白條
    "--rd-pill-bg": dark ? `color-mix(in srgb, ${text} 14%, ${bg})` : text,
    "--rd-pill-text": dark ? text : bg,
  };
});

function changeFontSize(delta: number) {
  const next = Math.min(28, Math.max(12, prefs.value.fontSize + delta));
  booksStore.setReaderPrefs({ fontSize: next });
}

function changeLineHeight(delta: number) {
  const next = Math.min(2.6, Math.max(1.4, +(prefs.value.lineHeight + delta).toFixed(1)));
  booksStore.setReaderPrefs({ lineHeight: next });
}

// ===== 閱讀位置 =====
const chapterIndex = ref(0);
const page = ref(0);
const totalPages = ref(1);
/** 目前這一頁頂端的章內字元位置（存檔與換字級時用它對位） */
const anchorOffset = ref(0);
const innerWidth = ref(0);
const isReady = ref(false);

const containerEl = ref<HTMLElement | null>(null);
const contentEl = ref<HTMLElement | null>(null);

const pageWidth = computed(() => innerWidth.value + COLUMN_GAP);
const lastChapterIndex = computed(() => props.book.chapters.length - 1);
const currentChapter = computed(() => props.book.chapters[chapterIndex.value]);
const paragraphs = computed(() => splitParagraphs(currentChapter.value?.content ?? ""));

const percent = computed(() =>
  bookPercent(props.book.chapters, chapterIndex.value, anchorOffset.value),
);

const remainingText = computed(() => {
  const minutes = remainingMinutes(currentChapter.value?.content.length ?? 0, anchorOffset.value);
  return minutes <= 0 ? "本章讀完了" : `剩 ${minutes} 分鐘`;
});

const isFirstPage = computed(() => chapterIndex.value === 0 && page.value === 0);
const isLastPage = computed(
  () => chapterIndex.value >= lastChapterIndex.value && page.value >= totalPages.value - 1,
);

// 版面計算排隊執行，避免翻章、換字級、視窗縮放同時量測
let layoutQueue: Promise<void> = Promise.resolve();
function run(task: () => Promise<void> | void): Promise<void> {
  layoutQueue = layoutQueue.then(task).catch((e) => console.warn("[Reader] 版面計算失敗:", e));
  return layoutQueue;
}

/** 量測每段開頭／結尾落在第幾頁 */
function makeProbe(): PageProbe | null {
  const content = contentEl.value;
  if (!content || pageWidth.value <= COLUMN_GAP) return null;
  const paraEls = content.querySelectorAll<HTMLElement>(".rd-para");
  const originX = content.getBoundingClientRect().left;
  const pw = pageWidth.value;
  const pageAt = (x: number) => Math.max(0, Math.floor((x - originX + 1) / pw));
  return {
    startPage: (i) => pageAt(paraEls[i].getBoundingClientRect().left),
    endPage: (i) => {
      const end = paraEls[i].querySelector(".rd-end");
      return pageAt((end ?? paraEls[i]).getBoundingClientRect().left);
    },
  };
}

async function layout() {
  await nextTick();
  const container = containerEl.value;
  const content = contentEl.value;
  if (!container || !content) return;
  const style = getComputedStyle(container);
  const width =
    container.clientWidth -
    (parseFloat(style.paddingLeft) || 0) -
    (parseFloat(style.paddingRight) || 0);
  if (width <= 0) return;
  if (width !== innerWidth.value) {
    innerWidth.value = width;
    await nextTick();
  }
  totalPages.value = Math.max(
    1,
    Math.round((content.scrollWidth + COLUMN_GAP) / pageWidth.value),
  );
}

function clampPage(p: number) {
  return Math.min(Math.max(p, 0), totalPages.value - 1);
}

function applyPageOffset(animate: boolean) {
  const content = contentEl.value;
  if (!content) return;
  content.style.transition = animate ? "transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)" : "none";
  content.style.transform = `translateX(-${page.value * pageWidth.value}px)`;
}

function updateAnchor() {
  const probe = makeProbe();
  anchorOffset.value = probe ? offsetForPage(paragraphs.value, page.value, probe) : 0;
  scheduleSave();
}

type ChapterTarget = "start" | "end" | { offset: number };

async function openChapter(index: number, target: ChapterTarget) {
  chapterIndex.value = Math.min(Math.max(index, 0), lastChapterIndex.value);
  await layout();
  let p = 0;
  if (target === "end") {
    p = totalPages.value - 1;
  } else if (typeof target === "object") {
    const probe = makeProbe();
    p = probe ? pageForOffset(paragraphs.value, target.offset, probe) : 0;
  }
  page.value = clampPage(p);
  applyPageOffset(false);
  updateAnchor();
}

/** 換字級、縮放視窗後重新排版，停在原本讀到的那一段 */
async function relayoutKeepingPosition() {
  const keep = anchorOffset.value;
  await layout();
  const probe = makeProbe();
  page.value = clampPage(probe ? pageForOffset(paragraphs.value, keep, probe) : 0);
  applyPageOffset(false);
}

function turnBy(delta: 1 | -1) {
  return run(async () => {
    const target = page.value + delta;
    if (target < 0) {
      if (chapterIndex.value === 0) return applyPageOffset(true);
      await openChapter(chapterIndex.value - 1, "end");
    } else if (target >= totalPages.value) {
      if (chapterIndex.value >= lastChapterIndex.value) return applyPageOffset(true);
      await openChapter(chapterIndex.value + 1, "start");
    } else {
      page.value = target;
      applyPageOffset(true);
      updateAnchor();
    }
    notifyCompanionPageTurn();
  });
}

function jumpToChapter(index: number) {
  closeSheet();
  run(async () => {
    await openChapter(index, "start");
    notifyCompanionPageTurn();
  });
}

// ===== 存進度 =====
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  booksStore.saveProgress({
    bookId: props.book.id,
    chapterIndex: chapterIndex.value,
    scrollPosition: page.value,
    charOffset: anchorOffset.value,
    percent: percent.value,
    lastReadAt: Date.now(),
  });
}

function scheduleSave() {
  if (!isReady.value) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

// ===== 手勢與按鍵 =====
let swipeStartX = 0;
let swipeStartY = 0;
let swipeDeltaX = 0;
let isSwiping = false;
let suppressClick = false;

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeDeltaX = 0;
  isSwiping = false;
}

function onTouchMove(e: TouchEvent) {
  const touch = e.touches[0];
  const dx = touch.clientX - swipeStartX;
  const dy = touch.clientY - swipeStartY;
  if (!isSwiping && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
    isSwiping = true;
  }
  if (!isSwiping || !contentEl.value) return;
  e.preventDefault();
  swipeDeltaX = dx;
  // 頭尾兩頁拉不動，給一點阻力
  const atEdge = (dx > 0 && isFirstPage.value) || (dx < 0 && isLastPage.value);
  const follow = atEdge ? dx * 0.2 : dx;
  contentEl.value.style.transition = "none";
  contentEl.value.style.transform = `translateX(${-page.value * pageWidth.value + follow}px)`;
}

function onTouchEnd() {
  if (!isSwiping) return;
  isSwiping = false;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 350);
  if (swipeDeltaX < -SWIPE_THRESHOLD) turnBy(1);
  else if (swipeDeltaX > SWIPE_THRESHOLD) turnBy(-1);
  else applyPageOffset(true);
}

// 點左三分之一上一頁、右三分之一下一頁
function handleTapNavigation(e: MouseEvent) {
  if (suppressClick || !containerEl.value) return;
  if (window.getSelection()?.toString()) return;
  const rect = containerEl.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x < rect.width / 3) turnBy(-1);
  else if (x > (rect.width * 2) / 3) turnBy(1);
}

function handleKeydown(e: KeyboardEvent) {
  if (sheet.value) {
    if (e.key === "Escape") closeSheet();
    return;
  }
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
    return;
  }
  if (e.key === "ArrowLeft" || e.key === "PageUp") turnBy(-1);
  else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
    e.preventDefault();
    turnBy(1);
  }
}

// ===== 抽屜 =====
type SheetKind = "toc" | "settings" | "companion" | "picker";
const sheet = ref<SheetKind | null>(null);
const tocListEl = ref<HTMLElement | null>(null);

const SHEET_LABELS: Record<SheetKind, string> = {
  toc: "目錄",
  settings: "排版設定",
  companion: "伴讀聊天",
  picker: "選擇伴讀角色",
};

function openSheet(kind: SheetKind) {
  sheet.value = kind;
  if (kind === "toc") {
    nextTick(() => {
      tocListEl.value
        ?.querySelector<HTMLElement>(".rd-toc-item.active")
        ?.scrollIntoView({ block: "center" });
    });
  }
}

function closeSheet() {
  sheet.value = null;
}

// ===== 伴讀 =====
/** 給伴讀角色看的內容：本章讀到目前這頁結尾為止的最後一段，不含還沒讀的部分 */
function readingWindow(): string {
  const chapter = currentChapter.value;
  if (!chapter) return "";
  const probe = makeProbe();
  const end =
    probe && page.value + 1 < totalPages.value
      ? offsetForPage(paragraphs.value, page.value + 1, probe)
      : chapter.content.length;
  const start = Math.max(0, end - 3000);
  const text = chapter.content.slice(start, end).trim();
  return `【${chapter.title}】\n${start > 0 ? "……" : ""}${text}`;
}

const companion = useCompanionChat({
  book: toRef(props, "book"),
  currentChapterIndex: chapterIndex,
  getReadingWindow: readingWindow,
});

const companionCharacter = computed(() =>
  companion.selectedCharacterId.value
    ? charsStore.getCharacterById(companion.selectedCharacterId.value)
    : undefined,
);
const companionName = computed(
  () => companionCharacter.value?.nickname || companionCharacter.value?.data.name || "",
);
const companionAvatar = computed(() => companionCharacter.value?.avatar || "");

const aiBarText = computed(() => {
  if (!companion.isActive.value) return "找個角色陪你讀…";
  if (companion.isGenerating.value) return `${companionName.value} 正在想…`;
  if (companion.hasUnread.value) return `${companionName.value} 跟你說了話`;
  return `問${companionName.value}這一頁…`;
});

function openCompanion() {
  openSheet(companion.isActive.value ? "companion" : "picker");
}

function notifyCompanionPageTurn() {
  if (companion.isActive.value && companion.onPageTurn(chapterIndex.value)) {
    companion.triggerAutoResponse();
  }
}

function selectCompanionCharacter(characterId: string) {
  companion.startCompanion(characterId);
  openSheet("companion");
}

async function stopCompanion() {
  closeSheet();
  await companion.stopCompanion();
}

// 抽屜開關＝伴讀面板展開狀態（決定新訊息算不算未讀）
watch(sheet, (kind) => {
  if (companion.isActive.value) companion.setPanelExpanded(kind === "companion");
});

// ===== 生命週期 =====
let resizeObserver: ResizeObserver | null = null;
let resizeFrame = 0;

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);

  await Promise.all([
    booksStore.loadReaderPrefs(),
    charsStore.characters.length === 0 ? charsStore.loadCharacters() : null,
    lorebooksStore.lorebooks.length === 0 ? lorebooksStore.loadLorebooks() : null,
    userStore.isLoaded ? null : userStore.loadUserData(),
  ]);

  const saved = await booksStore.getProgress(props.book.id);
  await run(async () => {
    const index = Math.min(saved?.chapterIndex ?? 0, lastChapterIndex.value);
    if (saved?.charOffset !== undefined) {
      await openChapter(index, { offset: saved.charOffset });
    } else {
      await openChapter(index, "start");
      // 舊進度只存了頁碼
      if (saved?.scrollPosition) {
        page.value = clampPage(saved.scrollPosition);
        applyPageOffset(false);
        updateAnchor();
      }
    }
    isReady.value = true;
  });

  if (containerEl.value) {
    resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => run(relayoutKeepingPosition));
    });
    resizeObserver.observe(containerEl.value);
  }
  // 網路字型載入後字寬會變
  document.fonts?.ready.then(() => run(relayoutKeepingPosition));

  await companion.restoreState();
  if (companion.isActive.value) companion.setPanelExpanded(false);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (isReady.value) saveNow();
  resizeObserver?.disconnect();
  cancelAnimationFrame(resizeFrame);
  companion.endSession();
});

watch(
  () => [prefs.value.fontSize, prefs.value.lineHeight, prefs.value.fontFamily],
  () => run(relayoutKeepingPosition),
);
</script>

<template>
  <div class="reader-screen" :style="paletteVars">
    <header class="rd-header">
      <button class="rd-icon-btn" aria-label="返回書架" @click="emit('back')">
        <ArrowLeft :size="22" />
      </button>
      <div class="rd-heading">
        <span class="rd-book-title">{{ book.title }}</span>
        <span class="rd-chapter-line">
          <span class="rd-chapter-name">{{ currentChapter?.title }}</span>
          <span class="rd-remaining">· {{ remainingText }}</span>
        </span>
      </div>
      <button class="rd-icon-btn rd-aa" aria-label="排版設定" @click="openSheet('settings')">
        Aa
      </button>
      <button class="rd-icon-btn" aria-label="目錄" @click="openSheet('toc')">
        <List :size="22" />
      </button>
    </header>

    <div
      ref="containerEl"
      class="rd-page"
      :class="{ ready: isReady }"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
      @click="handleTapNavigation"
    >
      <div
        ref="contentEl"
        class="rd-columns"
        :style="{
          fontSize: `${prefs.fontSize}px`,
          lineHeight: prefs.lineHeight,
          fontFamily: FONT_FAMILIES[prefs.fontFamily],
          columnWidth: innerWidth > 0 ? `${innerWidth}px` : undefined,
        }"
      >
        <h2 class="rd-chapter-heading">{{ currentChapter?.title }}</h2>
        <p
          v-for="(para, i) in paragraphs"
          :key="`${chapterIndex}-${i}`"
          class="rd-para"
        >{{ para.text }}<span class="rd-end" /></p>
      </div>
    </div>

    <footer class="rd-footer">
      <div class="rd-progress" aria-label="閱讀進度">
        <span>{{ percent }}%</span>
        <div class="rd-track">
          <div class="rd-fill" :style="{ width: `${percent}%` }" />
        </div>
        <span>{{ page + 1 }} / {{ totalPages }}</span>
      </div>
      <button class="rd-ai-bar" @click="openCompanion">
        <span
          class="rd-ai-avatar"
          :class="{ thinking: companion.isGenerating.value }"
          aria-hidden="true"
        >
          <img v-if="companionAvatar" :src="companionAvatar" alt="" />
          <Users v-else :size="18" />
          <span v-if="companion.hasUnread.value" class="rd-ai-unread" />
        </span>
        <span class="rd-ai-text">{{ aiBarText }}</span>
      </button>
    </footer>

    <Transition name="rd-fade">
      <div v-if="sheet" class="rd-backdrop" @click="closeSheet" />
    </Transition>

    <Transition name="rd-sheet">
      <section
        v-if="sheet"
        class="rd-sheet"
        :class="`is-${sheet}`"
        role="dialog"
        :aria-label="SHEET_LABELS[sheet]"
      >
        <div class="rd-grabber" aria-hidden="true" />

        <!-- 目錄 -->
        <template v-if="sheet === 'toc'">
          <div class="rd-sheet-head">
            <h3>目錄</h3>
            <span class="rd-sheet-meta">共 {{ book.chapters.length }} 章</span>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <div ref="tocListEl" class="rd-toc">
            <button
              v-for="(ch, i) in book.chapters"
              :key="ch.id"
              class="rd-toc-item"
              :class="{ active: i === chapterIndex }"
              :aria-current="i === chapterIndex ? 'true' : undefined"
              @click="jumpToChapter(i)"
            >
              <span class="rd-toc-no">{{ i + 1 }}</span>
              <span class="rd-toc-title">{{ ch.title }}</span>
            </button>
          </div>
        </template>

        <!-- 排版 -->
        <template v-else-if="sheet === 'settings'">
          <div class="rd-sheet-head">
            <h3>排版</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <div class="rd-settings">
            <div class="rd-setting">
              <span class="rd-setting-label">字級</span>
              <div class="rd-stepper">
                <button aria-label="縮小字級" :disabled="prefs.fontSize <= 12" @click="changeFontSize(-1)">
                  <span class="rd-step-a small">A</span>
                </button>
                <span class="rd-step-value">{{ prefs.fontSize }}</span>
                <button aria-label="放大字級" :disabled="prefs.fontSize >= 28" @click="changeFontSize(1)">
                  <span class="rd-step-a">A</span>
                </button>
              </div>
            </div>
            <div class="rd-setting">
              <span class="rd-setting-label">行距</span>
              <div class="rd-stepper">
                <button aria-label="縮小行距" :disabled="prefs.lineHeight <= 1.4" @click="changeLineHeight(-0.1)">
                  <Minus :size="16" />
                </button>
                <span class="rd-step-value">{{ prefs.lineHeight.toFixed(1) }}</span>
                <button aria-label="加大行距" :disabled="prefs.lineHeight >= 2.6" @click="changeLineHeight(0.1)">
                  <Plus :size="16" />
                </button>
              </div>
            </div>
            <div class="rd-setting">
              <span class="rd-setting-label">字體</span>
              <div class="rd-segment" role="radiogroup" aria-label="字體">
                <button
                  role="radio"
                  :aria-checked="prefs.fontFamily === 'serif'"
                  :class="{ active: prefs.fontFamily === 'serif' }"
                  :style="{ fontFamily: FONT_FAMILIES.serif }"
                  @click="booksStore.setReaderPrefs({ fontFamily: 'serif' })"
                >
                  明體
                </button>
                <button
                  role="radio"
                  :aria-checked="prefs.fontFamily === 'sans'"
                  :class="{ active: prefs.fontFamily === 'sans' }"
                  :style="{ fontFamily: FONT_FAMILIES.sans }"
                  @click="booksStore.setReaderPrefs({ fontFamily: 'sans' })"
                >
                  黑體
                </button>
              </div>
            </div>
            <div class="rd-setting stacked">
              <span class="rd-setting-label">背景</span>
              <div class="rd-swatches" role="radiogroup" aria-label="背景">
                <button
                  v-for="key in BACKGROUND_KEYS"
                  :key="key"
                  role="radio"
                  class="rd-swatch"
                  :aria-checked="prefs.background === key"
                  :class="{ active: prefs.background === key }"
                  @click="booksStore.setReaderPrefs({ background: key })"
                >
                  <span
                    class="rd-swatch-chip"
                    :style="{ background: BACKGROUNDS[key].bg, color: BACKGROUNDS[key].text }"
                  >文</span>
                  <span class="rd-swatch-label">{{ BACKGROUNDS[key].label }}</span>
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- 伴讀聊天 -->
        <CompanionChatPanel
          v-else-if="sheet === 'companion'"
          :character-name="companionName"
          :character-avatar="companionAvatar"
          :book-title="book.title"
          :messages="companion.messages.value"
          :is-generating="companion.isGenerating.value"
          :trigger-frequency="companion.triggerFrequency.value"
          @close="closeSheet"
          @stop="stopCompanion"
          @send="companion.sendMessage"
          @update:trigger-frequency="companion.setTriggerFrequency"
        />

        <!-- 選伴讀角色 -->
        <template v-else-if="sheet === 'picker'">
          <div class="rd-sheet-head">
            <h3>找個角色陪你讀</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <p class="rd-sheet-hint">角色會跟著你翻頁聊剛讀到的內容，結束後對話會存進你們的私聊。</p>
          <div class="rd-picker">
            <p v-if="charsStore.characters.length === 0" class="rd-picker-empty">
              還沒有角色，先去匯入一張角色卡吧
            </p>
            <button
              v-for="char in charsStore.characters"
              :key="char.id"
              class="rd-picker-item"
              @click="selectCompanionCharacter(char.id)"
            >
              <span class="rd-picker-avatar">
                <img v-if="char.avatar" :src="char.avatar" alt="" />
                <span v-else>{{ (char.nickname || char.data.name).slice(0, 1) }}</span>
              </span>
              <span class="rd-picker-info">
                <span class="rd-picker-name">{{ char.nickname || char.data.name }}</span>
                <span v-if="char.data.description" class="rd-picker-desc">{{ char.data.description }}</span>
              </span>
            </button>
          </div>
        </template>
      </section>
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.reader-screen {
  --rd-accent: var(--color-primary, #7dd3a8);
  --rd-on-accent: color-mix(in srgb, var(--rd-accent) 22%, #0b1f16);
  --rd-accent-soft: color-mix(in srgb, var(--rd-accent) 24%, var(--rd-bg));

  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: var(--rd-bg);
  color: var(--rd-text);
  transition:
    background 0.3s,
    color 0.3s;
}

button {
  font-family: inherit;
}

.rd-icon-btn {
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
    background: var(--rd-raise);
  }
}

// 大螢幕上限制一行的長度，太長的行很難讀
.rd-header,
.rd-page,
.rd-footer {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  box-sizing: border-box;
}

// ===== 頂欄 =====
.rd-header {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 6px 4px;
  padding-top: max(6px, var(--safe-top, 0px));
  flex-shrink: 0;
  z-index: 2;
}

.rd-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 0 4px;
}

.rd-book-title {
  max-width: 100%;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rd-chapter-line {
  display: flex;
  max-width: 100%;
  gap: 4px;
  font-size: 11px;
  color: var(--rd-sub);
}

.rd-chapter-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rd-remaining {
  flex-shrink: 0;
  white-space: nowrap;
}

.rd-aa {
  font-family: "Noto Serif TC", serif;
  font-size: 17px;
  font-weight: 700;
}

// ===== 內文 =====
.rd-page {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  padding: 18px 28px 12px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 0.2s;

  &.ready {
    opacity: 1;
  }
}

.rd-columns {
  height: 100%;
  box-sizing: border-box;
  column-fill: auto;
  column-gap: 48px;
  letter-spacing: 0.04em;
  will-change: transform;
}

.rd-chapter-heading {
  margin: 0.4em 0 1.4em;
  font-size: 1.25em;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  letter-spacing: 0.08em;
}

.rd-para {
  margin: 0 0 0.9em;
  text-indent: 2em;
  text-align: justify;
  overflow-wrap: anywhere;
  orphans: 2;
  widows: 2;
}

// ===== 底部 =====
.rd-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 16px 14px;
  padding-bottom: max(14px, var(--safe-bottom, 0px));
}

.rd-progress {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--rd-sub);
  font-variant-numeric: tabular-nums;
}

.rd-track {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: var(--rd-line);
  overflow: hidden;
}

.rd-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--rd-text);
  transition: width 0.3s;
}

.rd-ai-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 56px;
  padding: 0 18px 0 6px;
  border: none;
  border-radius: 28px;
  background: var(--rd-pill-bg);
  color: var(--rd-pill-text);
  text-align: left;
  cursor: pointer;
  box-shadow: 0 10px 24px color-mix(in srgb, #000 16%, transparent);
}

.rd-ai-avatar {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  background: var(--rd-accent);
  color: var(--rd-on-accent);

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  &.thinking::after {
    content: "";
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid var(--rd-accent);
    animation: rd-pulse 1.4s ease-out infinite;
  }
}

.rd-ai-unread {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--color-error, #e53e3e);
  box-shadow: 0 0 0 2px var(--rd-pill-bg);
}

@keyframes rd-pulse {
  from {
    opacity: 0.9;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(1.35);
  }
}

.rd-ai-text {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  opacity: 0.78;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ===== 抽屜 =====
.rd-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: color-mix(in srgb, #000 32%, transparent);
}

.rd-sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 21;
  display: flex;
  flex-direction: column;
  max-width: 640px;
  margin: 0 auto;
  max-height: calc(100% - 56px);
  padding: 8px 0 max(14px, var(--safe-bottom, 0px));
  border-radius: 28px 28px 0 0;
  background: var(--rd-sheet);
  color: var(--rd-text);
  box-shadow: 0 -12px 32px color-mix(in srgb, #000 18%, transparent);
  box-sizing: border-box;

  &.is-companion {
    height: 78%;
  }

  &.is-toc,
  &.is-picker {
    max-height: 70%;
  }
}

.rd-grabber {
  width: 40px;
  height: 5px;
  margin: 0 auto 8px;
  border-radius: 3px;
  background: var(--rd-line);
  flex-shrink: 0;
}

.rd-sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px 6px 20px;
  flex-shrink: 0;

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 700;
  }
}

.rd-sheet-meta {
  flex: 1;
  font-size: 12px;
  color: var(--rd-sub);
}

.rd-sheet-head h3 + .rd-icon-btn {
  margin-left: auto;
}

.rd-sheet-hint {
  margin: 0 20px 10px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--rd-sub);
}

.rd-sheet-enter-active,
.rd-sheet-leave-active {
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.rd-sheet-enter-from,
.rd-sheet-leave-to {
  transform: translateY(100%);
}

.rd-fade-enter-active,
.rd-fade-leave-active {
  transition: opacity 0.2s;
}
.rd-fade-enter-from,
.rd-fade-leave-to {
  opacity: 0;
}

// 目錄
.rd-toc {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px;
  overscroll-behavior: contain;
}

.rd-toc-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 48px;
  padding: 8px 12px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--rd-raise);
  }

  &.active {
    background: var(--rd-accent-soft);
    font-weight: 700;

    .rd-toc-no {
      background: var(--rd-accent);
      color: var(--rd-on-accent);
    }
  }
}

.rd-toc-no {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--rd-raise);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.rd-toc-title {
  min-width: 0;
  font-size: 15px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

// 排版
.rd-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 20px 6px;
}

.rd-setting {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;

  &.stacked {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding-top: 6px;
  }
}

.rd-setting-label {
  font-size: 14px;
  font-weight: 500;
}

.rd-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 24px;
  background: var(--rd-raise);

  button {
    width: 44px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: inherit;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: var(--rd-line);
    }

    &:disabled {
      opacity: 0.35;
      cursor: default;
    }
  }
}

.rd-step-a {
  font-family: "Noto Serif TC", serif;
  font-size: 19px;
  font-weight: 700;

  &.small {
    font-size: 13px;
  }
}

.rd-step-value {
  min-width: 36px;
  text-align: center;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.rd-segment {
  display: flex;
  padding: 3px;
  border-radius: 24px;
  background: var(--rd-raise);

  button {
    min-width: 64px;
    height: 40px;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: var(--rd-sub);
    font-size: 15px;
    cursor: pointer;

    &.active {
      background: var(--rd-text);
      color: var(--rd-bg);
      font-weight: 700;
    }
  }
}

.rd-swatches {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.rd-swatch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 6px 0;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &.active .rd-swatch-chip {
    box-shadow:
      0 0 0 2px var(--rd-sheet),
      0 0 0 4px var(--rd-accent);
  }
}

.rd-swatch-chip {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 24px;
  border: 1px solid var(--rd-line);
  font-family: "Noto Serif TC", serif;
  font-size: 17px;
  font-weight: 700;
}

.rd-swatch-label {
  font-size: 12px;
  color: var(--rd-sub);

  .active & {
    color: var(--rd-text);
    font-weight: 700;
  }
}

// 選角色
.rd-picker {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 12px;
  overscroll-behavior: contain;
}

.rd-picker-empty {
  margin: 32px 0;
  text-align: center;
  font-size: 14px;
  color: var(--rd-sub);
}

.rd-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 64px;
  padding: 8px 12px;
  border: none;
  border-radius: 16px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--rd-raise);
  }
}

.rd-picker-avatar {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  overflow: hidden;
  background: var(--rd-accent);
  color: var(--rd-on-accent);
  font-weight: 700;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.rd-picker-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rd-picker-name {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rd-picker-desc {
  font-size: 12px;
  color: var(--rd-sub);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
