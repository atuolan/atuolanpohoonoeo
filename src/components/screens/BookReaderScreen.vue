<script setup lang="ts">
import BookPlayDuel from "@/components/books/BookPlayDuel.vue";
import BookPlayPet from "@/components/books/BookPlayPet.vue";
import BookPlaySummon from "@/components/books/BookPlaySummon.vue";
import BookPlayWhatIf from "@/components/books/BookPlayWhatIf.vue";
import BookReviewCards from "@/components/books/BookReviewCards.vue";
import CompanionChatPanel from "@/components/common/CompanionChatPanel.vue";
import { useCompanionChat } from "@/composables/useCompanionChat";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useUserStore } from "@/stores/user";
import {
  AUTO_SUMMARY_MAX_CALLS,
  AUTO_SUMMARY_MAX_FAILURES,
  charsBetween,
  comparePos,
  fromGlobal,
  lastSummaryEnd,
  rangeLabel,
  readingSummariesText,
  shouldAutoSummarize,
  sortSummaries,
  splitRange,
  summarizeRange,
  toGlobal,
} from "@/services/bookSummary";
import {
  chapterCardMaterial,
  dueCards,
  generateChapterCards,
  hasCardMaterial,
  newCard,
  type ReviewItem,
} from "@/services/bookReview";
import {
  askLens,
  lensById,
  lensContext,
  LENSES,
  type LensId,
  type LensInput,
  type LensTurn,
} from "@/services/bookLens";
import type {
  BookHighlight,
  BookPosition,
  BookReviewCard,
  BookSummary,
  ReaderBackground,
  ReaderPrefs,
  StoredBook,
} from "@/types/book";
import {
  addDailySeconds,
  addHighlight,
  bookPercent,
  dateKey,
  offsetForPage,
  pageForOffset,
  paragraphSegments,
  remainingMinutes,
  splitParagraphs,
  type PageProbe,
} from "@/utils/bookReading";
import {
  ArrowLeft,
  Copy,
  Highlighter,
  Layers,
  List,
  MessageCircle,
  Minus,
  NotebookPen,
  Pencil,
  Plus,
  ScrollText,
  Send,
  Sparkles,
  Telescope,
  Swords,
  Trash2,
  Users,
  WandSparkles,
  X,
  Egg,
} from "lucide-vue-next";
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
      // 已經是全書最後一頁：沒翻動，不算頁
      if (chapterIndex.value >= lastChapterIndex.value) {
        promptChapterCards(chapterIndex.value);
        return applyPageOffset(true);
      }
      const finished = chapterIndex.value;
      await openChapter(finished + 1, "start");
      promptChapterCards(finished);
    } else {
      page.value = target;
      applyPageOffset(true);
      updateAnchor();
    }
    if (delta === 1) onForwardPage();
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
    pagesSinceSummary: pagesSinceSummary.value,
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
/** 這次手勢是在拖選取範圍的把手，不要當成翻頁 */
let isAdjustingSelection = false;

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0];
  swipeStartX = touch.clientX;
  swipeStartY = touch.clientY;
  swipeDeltaX = 0;
  isSwiping = false;
  isAdjustingSelection = !!selection.value || window.getSelection()?.isCollapsed === false;
}

function onTouchMove(e: TouchEvent) {
  if (isAdjustingSelection) return;
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
  if (reviewItems.value) {
    if (e.key === "Escape") closeReview();
    return;
  }
  if (playMode.value) {
    if (e.key === "Escape") closePlay();
    return;
  }
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
type SheetKind = "toc" | "settings" | "companion" | "picker" | "highlight" | "play" | "summary" | "lens";
const sheet = ref<SheetKind | null>(null);
const tocListEl = ref<HTMLElement | null>(null);
const tocTab = ref<"chapters" | "notes" | "summaries">("chapters");

const SHEET_LABELS: Record<SheetKind, string> = {
  toc: "目錄與筆記",
  settings: "排版設定",
  companion: "伴讀聊天",
  picker: "選擇伴讀角色",
  highlight: "劃線與筆記",
  play: "好玩模式",
  summary: "總結這幾頁",
  lens: "換個鏡頭看",
};

// ===== 好玩模式 =====
type PlayMode = "summon" | "pet" | "duel" | "whatif";
const playMode = ref<PlayMode | null>(null);
/** 打開時當下讀到的內容（給 AI 用，避免劇透） */
const playReadingText = ref("");
const playPosition = ref({ chapterIndex: 0, charOffset: 0 });

const PLAY_MODES: Array<{ id: PlayMode; title: string; desc: string }> = [
  { id: "summon", title: "召喚作者", desc: "請作者本人出來聊這本書，還能叫人來抬槓" },
  { id: "pet", title: "讀書靈獸", desc: "讀越多牠長越大，從魚卵一路長成大鵬" },
  { id: "duel", title: "擂台", desc: "跟你的角色比答題，只考讀過的部分" },
  { id: "whatif", title: "平行宇宙", desc: "如果劇情換個方向？AI 用原著筆調寫下去" },
];

function openPlay(mode: PlayMode) {
  playReadingText.value = readingWindow();
  playPosition.value = { chapterIndex: chapterIndex.value, charOffset: anchorOffset.value };
  closeSheet();
  playMode.value = mode;
}

function closePlay() {
  playMode.value = null;
}

function openSheet(kind: SheetKind) {
  sheet.value = kind;
  if (kind === "toc" && tocTab.value === "chapters") {
    nextTick(() => {
      tocListEl.value
        ?.querySelector<HTMLElement>(".rd-toc-item.active")
        ?.scrollIntoView({ block: "center" });
    });
  }
}

function closeSheet() {
  sheet.value = null;
  companionDraft.value = "";
  editingSummaryId.value = null;
  // 觀點鏡頭的問答只留在這次打開期間
  lensQuote.value = null;
  lensTurns.value = {};
}

// ===== 小提示 =====
const toast = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(message: string) {
  toast.value = message;
  if (toastTimer) clearTimeout(toastTimer);
  // 長的提示（錯誤原因）多留一下
  toastTimer = setTimeout(() => (toast.value = ""), message.length > 14 ? 3200 : 1600);
}

// ===== 伴讀 =====
/** 目前這頁結尾的章內字元位置（已讀與未讀的分界） */
function pageEndOffset(): number {
  const chapter = currentChapter.value;
  if (!chapter) return 0;
  const probe = makeProbe();
  return probe && page.value + 1 < totalPages.value
    ? offsetForPage(paragraphs.value, page.value + 1, probe)
    : chapter.content.length;
}

/** 給伴讀角色看的內容：本章讀到目前這頁結尾為止的最後一段，不含還沒讀的部分 */
function readingWindow(): string {
  const chapter = currentChapter.value;
  if (!chapter) return "";
  const end = pageEndOffset();
  const start = Math.max(0, end - 3000);
  const text = chapter.content.slice(start, end).trim();
  return `【${chapter.title}】\n${start > 0 ? "……" : ""}${text}`;
}

const companion = useCompanionChat({
  book: toRef(props, "book"),
  currentChapterIndex: chapterIndex,
  getReadingWindow: readingWindow,
  getReadingSummaries: () => readingSummariesText(props.book.chapters, summaries.value, currentEnd(), 5),
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

/** 從劃線「問角色」時預先放進輸入框的引文 */
const companionDraft = ref("");

function askCompanionAbout(text: string) {
  const quote = text.length > 120 ? `${text.slice(0, 120)}…` : text;
  companionDraft.value = `「${quote}」`;
  openCompanion();
}

// ===== 劃線與筆記 =====
const highlights = computed(() => booksStore.progressByBook[props.book.id]?.highlights ?? []);
const chapterHighlights = computed(() => {
  const id = currentChapter.value?.id;
  return highlights.value.filter((h) => h.chapterId === id);
});
const segmentsByPara = computed(() =>
  paragraphs.value.map((p) => paragraphSegments(p.start, p.length, chapterHighlights.value)),
);
const notedIds = computed(
  () => new Set(chapterHighlights.value.filter((h) => h.note?.trim()).map((h) => h.id)),
);

function chapterIndexOf(h: BookHighlight): number {
  const i = props.book.chapters.findIndex((c) => c.id === h.chapterId);
  return i >= 0 ? i : Math.min(h.chapterIndex, lastChapterIndex.value);
}

/** 筆記列表：依章節、位置排序 */
const sortedHighlights = computed(() =>
  highlights.value
    .map((h) => ({ h, chapter: chapterIndexOf(h) }))
    .sort((a, b) => a.chapter - b.chapter || a.h.start - b.h.start),
);

interface SelectionInfo {
  start: number;
  end: number;
  text: string;
}
const selection = ref<SelectionInfo | null>(null);

/** 選取端點換算成章內字元位置；不在段落裡回傳 null */
function chapterOffsetAt(node: Node, offset: number): number | null {
  const host = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  const el = host?.closest<HTMLElement>(".rd-para");
  if (!el || !contentEl.value?.contains(el)) return null;
  const para = paragraphs.value[Number(el.dataset.i)];
  if (!para) return null;
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(node, offset);
  return para.start + Math.min(range.toString().length, para.length);
}

function readSelection() {
  const sel = window.getSelection();
  const chapter = currentChapter.value;
  if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !contentEl.value || !chapter) {
    selection.value = null;
    return;
  }
  const range = sel.getRangeAt(0);
  if (!contentEl.value.contains(range.commonAncestorContainer)) {
    selection.value = null;
    return;
  }
  // 從章名開始選時，起點算第一段開頭
  const start = chapterOffsetAt(range.startContainer, range.startOffset) ?? paragraphs.value[0]?.start;
  const end = chapterOffsetAt(range.endContainer, range.endOffset);
  if (start === undefined || end === null || end <= start) {
    selection.value = null;
    return;
  }
  const text = chapter.content.slice(start, end).trim();
  selection.value = text ? { start, end, text } : null;
}

let selectionFrame = 0;
function onSelectionChange() {
  cancelAnimationFrame(selectionFrame);
  selectionFrame = requestAnimationFrame(readSelection);
}

function clearSelection() {
  window.getSelection()?.removeAllRanges();
  selection.value = null;
}

/** 把目前選取存成劃線，回傳（可能和舊劃線合併後的）劃線 id */
async function saveSelectionAsHighlight(): Promise<string | null> {
  const sel = selection.value;
  const chapter = currentChapter.value;
  if (!sel || !chapter) return null;
  const now = Date.now();
  const incoming: BookHighlight = {
    id: crypto.randomUUID(),
    chapterId: chapter.id,
    chapterIndex: chapterIndex.value,
    start: sel.start,
    end: sel.end,
    text: sel.text,
    createdAt: now,
    updatedAt: now,
  };
  let resultId = incoming.id;
  clearSelection();
  await booksStore.patchProgress(props.book.id, (current) => {
    const next = addHighlight(current?.highlights ?? [], incoming, (s, e) =>
      chapter.content.slice(s, e).trim(),
    );
    resultId =
      next.find((h) => h.chapterId === chapter.id && h.start <= sel.start && h.end >= sel.end)?.id ??
      incoming.id;
    return { highlights: next };
  });
  return resultId;
}

async function actHighlight() {
  if (await saveSelectionAsHighlight()) showToast("已劃線");
}

async function actNote() {
  const id = await saveSelectionAsHighlight();
  if (id) openHighlight(id);
}

function actAsk() {
  const text = selection.value?.text;
  clearSelection();
  if (text) askCompanionAbout(text);
}

async function actCopy() {
  const text = selection.value?.text;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    showToast("已複製");
  } catch {
    showToast("這個瀏覽器不讓複製");
  }
  clearSelection();
}

// 點劃線打開它的筆記
const activeHighlightId = ref<string | null>(null);
const activeHighlight = computed(() =>
  highlights.value.find((h) => h.id === activeHighlightId.value),
);
const noteDraft = ref("");

function openHighlight(id: string) {
  activeHighlightId.value = id;
  noteDraft.value = highlights.value.find((h) => h.id === id)?.note ?? "";
  openSheet("highlight");
}

async function saveNote() {
  const id = activeHighlightId.value;
  const note = noteDraft.value.trim();
  closeSheet();
  await booksStore.patchProgress(props.book.id, (current) => ({
    highlights: (current?.highlights ?? []).map((h) =>
      h.id === id ? { ...h, note: note || undefined, updatedAt: Date.now() } : h,
    ),
  }));
  showToast(note ? "筆記已儲存" : "已儲存");
}

async function deleteActiveHighlight() {
  const id = activeHighlightId.value;
  closeSheet();
  await booksStore.patchProgress(props.book.id, (current) => ({
    highlights: (current?.highlights ?? []).filter((h) => h.id !== id),
  }));
  showToast("已刪除劃線");
}

function jumpToHighlight(h: BookHighlight) {
  closeSheet();
  run(() => openChapter(chapterIndexOf(h), { offset: h.start }));
}

// ===== 分段摘要 =====
const summaries = computed(() => booksStore.progressByBook[props.book.id]?.summaries ?? []);
const sortedSummaryList = computed(() => sortSummaries(summaries.value));
const autoSummaryPaused = computed(
  () => (booksStore.progressByBook[props.book.id]?.autoSummaryFailures ?? 0) >= AUTO_SUMMARY_MAX_FAILURES,
);
/** 上次摘要後往後翻了幾頁（存檔時一起存） */
const pagesSinceSummary = ref(0);
const summaryRunning = ref(false);
const summaryProgress = ref({ done: 0, total: 0 });

type SummaryRangeKind = "sinceLast" | "chapter" | "recent";
const summaryRangeKind = ref<SummaryRangeKind>("sinceLast");
const summaryRecentPages = ref(10);
/** 打開範圍抽屜時目前這頁的結尾（範圍一律到這裡為止，不能選還沒讀的地方） */
const summaryEnd = ref<BookPosition>({ chapterIndex: 0, charOffset: 0 });
/** 打開抽屜時量好的本章每頁開頭，給「最近 N 頁」用 */
const summaryPages = ref({ page: 0, pageTops: [] as number[], charsPerPage: 1 });

function currentEnd(): BookPosition {
  return { chapterIndex: chapterIndex.value, charOffset: pageEndOffset() };
}

/** 從上次摘要結尾接著總結；沒有摘要（或摘要都在後面）就從本章開頭 */
function defaultSummaryStart(end: BookPosition): BookPosition {
  const last = lastSummaryEnd(summaries.value);
  if (last && comparePos(last, end) < 0) return last;
  return { chapterIndex: end.chapterIndex, charOffset: 0 };
}

const hasEarlierSummary = computed(() => {
  const last = lastSummaryEnd(summaries.value);
  return !!last && comparePos(last, summaryEnd.value) < 0;
});

const summaryFrom = computed<BookPosition>(() => {
  const end = summaryEnd.value;
  if (summaryRangeKind.value === "chapter") return { chapterIndex: end.chapterIndex, charOffset: 0 };
  if (summaryRangeKind.value === "recent") {
    // 本章裡的頁用量到的位置；往前超出本章時用本章每頁平均字數估
    const { page: p, pageTops, charsPerPage } = summaryPages.value;
    const first = p - summaryRecentPages.value + 1;
    if (first >= 0) return { chapterIndex: end.chapterIndex, charOffset: pageTops[first] ?? 0 };
    const chapterStart = toGlobal(props.book.chapters, { chapterIndex: end.chapterIndex, charOffset: 0 });
    return fromGlobal(props.book.chapters, Math.max(0, chapterStart + first * charsPerPage));
  }
  return defaultSummaryStart(end);
});

const summaryChars = computed(() => charsBetween(props.book.chapters, summaryFrom.value, summaryEnd.value));
const summaryCalls = computed(
  () => splitRange(props.book.chapters, summaryFrom.value, summaryEnd.value).length,
);
const summaryRangeText = computed(() =>
  rangeLabel({ from: summaryFrom.value, to: summaryEnd.value }, props.book.chapters),
);

function openSummaryRange() {
  const probe = makeProbe();
  summaryEnd.value = currentEnd();
  summaryPages.value = {
    page: page.value,
    pageTops: Array.from({ length: page.value + 1 }, (_, i) =>
      probe ? offsetForPage(paragraphs.value, i, probe) : 0,
    ),
    charsPerPage: Math.max(1, Math.round((currentChapter.value?.content.length ?? 0) / totalPages.value)),
  };
  summaryRangeKind.value = "sinceLast";
  openSheet("summary");
}

const SUMMARY_EVERY_OPTIONS: ReaderPrefs["summaryEveryPages"][] = [0, 10, 20, 50];

const summaryButtonText = computed(() => {
  if (summaryRunning.value) {
    const { done, total } = summaryProgress.value;
    return total > 1 ? `總結中 ${done + 1}/${total}…` : "總結中…";
  }
  if (summaryChars.value <= 0) return "這段已經總結過了";
  return summaryCalls.value > 1 ? `總結（分 ${summaryCalls.value} 次）` : "總結";
});

function changeRecentPages(delta: number) {
  summaryRecentPages.value = Math.min(200, Math.max(5, summaryRecentPages.value + delta));
}

/** 總結一段範圍，每完成一則就存起來；回傳做好幾則 */
async function runSummary(from: BookPosition, to: BookPosition, auto: boolean): Promise<number> {
  summaryRunning.value = true;
  summaryProgress.value = { done: 0, total: splitRange(props.book.chapters, from, to).length };
  try {
    const made = await summarizeRange({
      bookTitle: props.book.title,
      author: props.book.author,
      chapters: props.book.chapters,
      from,
      to,
      existing: summaries.value,
      auto,
      maxCalls: auto ? AUTO_SUMMARY_MAX_CALLS : undefined,
      onEach: async (summary, done, total) => {
        summaryProgress.value = { done, total };
        await booksStore.patchProgress(props.book.id, (current) => ({
          summaries: [...(current?.summaries ?? []), summary],
        }));
      },
    });
    pagesSinceSummary.value = 0;
    await booksStore.patchProgress(props.book.id, { pagesSinceSummary: 0, autoSummaryFailures: 0 });
    return made.length;
  } finally {
    summaryRunning.value = false;
  }
}

async function startManualSummary() {
  if (summaryRunning.value || summaryChars.value <= 0) return;
  const from = summaryFrom.value;
  const to = summaryEnd.value;
  closeSheet();
  showToast("開始總結…");
  try {
    const count = await runSummary(from, to, false);
    showToast(count > 1 ? `總結好了，存成 ${count} 則` : "總結好了");
  } catch (e) {
    showToast(e instanceof Error ? e.message : "總結失敗");
  }
}

/**
 * 自動摘要的起點：接著上次摘要；還沒有摘要時往回推「翻過的頁數」，
 * 用本章每頁平均字數估（從上一章翻過來的也算進去）
 */
function autoSummaryStart(to: BookPosition): BookPosition {
  const last = lastSummaryEnd(summaries.value);
  if (last && comparePos(last, to) < 0) return last;
  const charsPerPage = (currentChapter.value?.content.length ?? 0) / Math.max(totalPages.value, 1);
  const back = Math.round(pagesSinceSummary.value * charsPerPage);
  return fromGlobal(props.book.chapters, Math.max(0, toGlobal(props.book.chapters, to) - back));
}

/** 往後翻了一頁：自動摘要計數，到了就在背景總結 */
function onForwardPage() {
  const every = prefs.value.summaryEveryPages;
  if (!every) return;
  pagesSinceSummary.value++;
  const failures = booksStore.progressByBook[props.book.id]?.autoSummaryFailures ?? 0;
  if (summaryRunning.value || !shouldAutoSummarize(pagesSinceSummary.value, every, failures)) return;
  const to = currentEnd();
  const from = autoSummaryStart(to);
  if (charsBetween(props.book.chapters, from, to) <= 0) {
    pagesSinceSummary.value = 0;
    return;
  }
  runAutoSummary(from, to, failures);
}

async function runAutoSummary(from: BookPosition, to: BookPosition, failures: number) {
  try {
    await runSummary(from, to, true);
    showToast("已總結到這裡");
  } catch (e) {
    // 計數不歸零，下次翻頁再試
    const next = failures + 1;
    await booksStore.patchProgress(props.book.id, { autoSummaryFailures: next });
    const reason = e instanceof Error ? e.message : "";
    showToast(
      next >= AUTO_SUMMARY_MAX_FAILURES
        ? "自動摘要連續失敗，先暫停；手動總結一次就會恢復"
        : `自動摘要失敗${reason ? `：${reason}` : ""}，下一頁再試`,
    );
  }
}

// 摘要列表：跳回、編輯、刪除
const editingSummaryId = ref<string | null>(null);
const summaryDraft = ref({ title: "", content: "" });

function jumpToSummary(s: BookSummary) {
  closeSheet();
  run(() => openChapter(s.from.chapterIndex, { offset: s.from.charOffset }));
}

function editSummary(s: BookSummary) {
  editingSummaryId.value = s.id;
  summaryDraft.value = { title: s.title, content: s.content };
}

async function saveSummaryEdit() {
  const id = editingSummaryId.value;
  const title = summaryDraft.value.title.trim();
  const content = summaryDraft.value.content.trim();
  editingSummaryId.value = null;
  if (!id || !content) return;
  await booksStore.patchProgress(props.book.id, (current) => ({
    summaries: (current?.summaries ?? []).map((s) =>
      s.id === id ? { ...s, title: title || s.title, content, updatedAt: Date.now() } : s,
    ),
  }));
  showToast("摘要已儲存");
}

async function deleteSummary(s: BookSummary) {
  if (!window.confirm(`刪除「${s.title}」這則摘要？`)) return;
  await booksStore.patchProgress(props.book.id, (current) => ({
    summaries: (current?.summaries ?? []).filter((x) => x.id !== s.id),
  }));
  showToast("已刪除摘要");
}

// ===== 回顧卡 =====
const cards = computed(() => booksStore.progressByBook[props.book.id]?.cards ?? []);
const dueCount = computed(() => dueCards(cards.value, Date.now()).length);
const reviewItems = ref<ReviewItem[] | null>(null);
const reviewMode = ref<"chapter" | "review">("chapter");
const reviewHeading = ref("");
/** 剛讀完、可以出卡的章 */
const chapterEndPrompt = ref<number | null>(null);
/** 這次打開書時按過「不用了」的章，不再問 */
const dismissedChapterPrompts = new Set<number>();
const cardBusy = ref(false);

function chapterMaterial(index: number, readEnd?: number) {
  const chapter = props.book.chapters[index];
  const list = highlights.value.filter((h) => chapterIndexOf(h) === index);
  return chapterCardMaterial(chapter, index, list, summaries.value, readEnd);
}

function chapterTitleText(index: number): string {
  return props.book.chapters[index]?.title || `第 ${index + 1} 章`;
}

function toReviewItem(card: BookReviewCard): ReviewItem {
  const h = card.highlightId ? highlights.value.find((x) => x.id === card.highlightId) : undefined;
  return {
    bookId: props.book.id,
    bookTitle: props.book.title,
    chapterTitle: chapterTitleText(card.chapterIndex),
    card,
    note: h?.note?.trim() ? { text: h.note.trim(), at: h.createdAt } : undefined,
  };
}

function openReview(list: BookReviewCard[], mode: "chapter" | "review", heading: string) {
  closeSheet();
  reviewMode.value = mode;
  reviewHeading.value = heading;
  reviewItems.value = list.map(toReviewItem);
}

function closeReview() {
  reviewItems.value = null;
}

function jumpFromReview(item: ReviewItem) {
  closeReview();
  run(() => openChapter(item.card.chapterIndex, { offset: item.card.charOffset }));
}

/** 翻過章尾：這章還沒出過卡、又有劃線或摘要，就在頂部問一聲 */
function promptChapterCards(finished: number) {
  const carded = booksStore.progressByBook[props.book.id]?.cardedChapters ?? [];
  if (carded.includes(finished) || dismissedChapterPrompts.has(finished)) return;
  if (!hasCardMaterial(chapterMaterial(finished))) return;
  chapterEndPrompt.value = finished;
}

function dismissChapterPrompt() {
  if (chapterEndPrompt.value !== null) dismissedChapterPrompts.add(chapterEndPrompt.value);
  chapterEndPrompt.value = null;
}

// 跳到別的章就收起提示
watch(chapterIndex, (i) => {
  const p = chapterEndPrompt.value;
  if (p !== null && i !== p && i !== p + 1) chapterEndPrompt.value = null;
});

/** 為一章出卡；這章還沒有材料時，先問要不要總結這章 */
async function makeChapterCards(index: number) {
  if (cardBusy.value) return;
  const chapter = props.book.chapters[index];
  if (!chapter) return;
  const isCurrent = index === chapterIndex.value;
  const readEnd = isCurrent ? pageEndOffset() : undefined;
  const finishedChapter = readEnd === undefined || readEnd >= chapter.content.length;

  cardBusy.value = true;
  try {
    let material = chapterMaterial(index, readEnd);
    if (!hasCardMaterial(material)) {
      if (!window.confirm("這章還沒有劃線或摘要，要先總結這章嗎？")) return;
      showToast("先總結這章…");
      const to = isCurrent ? currentEnd() : { chapterIndex: index, charOffset: chapter.content.length };
      await runSummary({ chapterIndex: index, charOffset: 0 }, to, false);
      material = chapterMaterial(index, readEnd);
    }
    showToast("出卡中…");
    const made = await generateChapterCards({
      bookTitle: props.book.title,
      author: props.book.author,
      chapterTitle: chapter.title,
      chapterIndex: index,
      material,
    });
    await booksStore.patchProgress(props.book.id, (current) => ({
      cards: [...(current?.cards ?? []), ...made],
      cardedChapters: [...new Set([...(current?.cardedChapters ?? []), index])],
    }));
    chapterEndPrompt.value = null;
    toast.value = "";
    openReview(made, "chapter", `「${chapter.title}」${finishedChapter ? "讀完了" : "讀到這裡"}`);
  } catch (e) {
    showToast(e instanceof Error ? e.message : "出卡失敗");
  } finally {
    cardBusy.value = false;
  }
}

/** 複習這本書：先複習到期的；沒有到期的就全部再看一次 */
function reviewBookCards() {
  const due = dueCards(cards.value, Date.now());
  if (due.length) {
    openReview(due, "review", `今天要複習 ${due.length} 張`);
  } else {
    const all = [...cards.value].sort((a, b) => a.dueAt - b.dueAt);
    openReview(all, "review", "沒有到期的卡，全部再看一次");
  }
}

// ===== 觀點鏡頭 =====
interface LensQuote {
  chapterIndex: number;
  start: number;
  end: number;
  text: string;
  /** 第幾段（1 起算） */
  paraNo: number;
  /** 從已有的劃線打開時的劃線 id */
  highlightId?: string;
}
const lensQuote = ref<LensQuote | null>(null);
const activeLens = ref<LensId | null>(null);
/** 這次打開抽屜期間，每個鏡頭的問答（關掉就丟） */
const lensTurns = ref<Partial<Record<LensId, LensTurn[]>>>({});
/** 正在等回答的鏡頭（換鏡頭不用等上一個） */
const lensLoadingSet = ref<Set<LensId>>(new Set());
const lensLoading = computed(() => !!activeLens.value && lensLoadingSet.value.has(activeLens.value));
const lensError = ref("");
const lensDraft = ref("");
const lensListEl = ref<HTMLElement | null>(null);

const currentLensTurns = computed(() => (activeLens.value ? lensTurns.value[activeLens.value] ?? [] : []));
const lastLensTurn = computed(() => currentLensTurns.value[currentLensTurns.value.length - 1]);

function paraNumberAt(index: number, offset: number): number {
  const paras = index === chapterIndex.value ? paragraphs.value : splitParagraphs(props.book.chapters[index]?.content ?? "");
  let n = 0;
  for (let i = 0; i < paras.length && paras[i].start <= offset; i++) n = i + 1;
  return Math.max(n, 1);
}

function openLens(quote: Omit<LensQuote, "paraNo">) {
  lensQuote.value = { ...quote, paraNo: paraNumberAt(quote.chapterIndex, quote.start) };
  activeLens.value = null;
  lensTurns.value = {};
  lensError.value = "";
  lensDraft.value = "";
  openSheet("lens");
}

function actLens() {
  const sel = selection.value;
  if (!sel) return;
  clearSelection();
  openLens({ chapterIndex: chapterIndex.value, start: sel.start, end: sel.end, text: sel.text });
}

function lensFromHighlight(h: BookHighlight) {
  openLens({ chapterIndex: chapterIndexOf(h), start: h.start, end: h.end, text: h.text, highlightId: h.id });
}

function lensInput(lens: LensId): LensInput | null {
  const q = lensQuote.value;
  const chapter = q ? props.book.chapters[q.chapterIndex] : undefined;
  if (!q || !chapter) return null;
  // 引文在目前這章就只給到這頁結尾；在讀過的前幾章就給到章尾
  const readEnd = q.chapterIndex === chapterIndex.value ? Math.max(pageEndOffset(), q.end) : chapter.content.length;
  return {
    bookTitle: props.book.title,
    author: props.book.author,
    chapterTitle: chapter.title,
    quote: q.text,
    ...lensContext(chapter.content, q.start, q.end, readEnd),
    summaries: readingSummariesText(props.book.chapters, summaries.value, { chapterIndex: q.chapterIndex, charOffset: readEnd }, 3),
    lens,
  };
}

function scrollLensToEnd() {
  nextTick(() => lensListEl.value?.scrollTo({ top: lensListEl.value.scrollHeight, behavior: "smooth" }));
}

/** 換鏡頭：同一個鏡頭這次打開時問過就直接顯示，不重打 */
async function pickLens(lens: LensId) {
  activeLens.value = lens;
  lensError.value = "";
  if (lensTurns.value[lens]?.length) return;
  await askCurrentLens();
}

function setLensLoading(lens: LensId, on: boolean) {
  const next = new Set(lensLoadingSet.value);
  if (on) next.add(lens);
  else next.delete(lens);
  lensLoadingSet.value = next;
}

async function askCurrentLens(question?: string) {
  const lens = activeLens.value;
  const quote = lensQuote.value;
  const input = lens ? lensInput(lens) : null;
  if (!lens || !input || lensLoadingSet.value.has(lens)) return;
  setLensLoading(lens, true);
  lensError.value = "";
  if (question) lensDraft.value = "";
  scrollLensToEnd();
  try {
    const turn = await askLens(input, lensTurns.value[lens] ?? [], question);
    // 等回答時抽屜已經關掉或換了引文，就丟掉
    if (lensQuote.value !== quote) return;
    lensTurns.value = { ...lensTurns.value, [lens]: [...(lensTurns.value[lens] ?? []), turn] };
    if (activeLens.value === lens) scrollLensToEnd();
  } catch (e) {
    if (lensQuote.value !== quote || activeLens.value !== lens) return;
    if (question) lensDraft.value = question;
    lensError.value = e instanceof Error ? e.message : "沒有回應，再試一次";
  } finally {
    setLensLoading(lens, false);
  }
}

function sendLensDraft() {
  const q = lensDraft.value.trim();
  if (q) askCurrentLens(q);
}

function askCompanionLens() {
  const text = lensQuote.value?.text;
  if (text) askCompanionAbout(text);
}

/** 存成記憶卡，三天後考 */
async function saveLensCard() {
  const q = lensQuote.value;
  const turn = lastLensTurn.value;
  if (!q || !turn || !activeLens.value) return;
  const quote = q.text.length > 40 ? `${q.text.slice(0, 40)}…` : q.text;
  const card = newCard(
    {
      source: "lens",
      highlightId: q.highlightId,
      chapterIndex: q.chapterIndex,
      charOffset: q.start,
      question: `「${quote}」${turn.question ?? lensById(activeLens.value).cardQuestion}`,
      answer: turn.answer,
    },
    Date.now(),
    3,
  );
  await booksStore.patchProgress(props.book.id, (current) => ({ cards: [...(current?.cards ?? []), card] }));
  showToast("存好了，三天後考你");
}

/** 把目前的回答接到這段的劃線筆記（沒有劃線就先劃） */
async function saveLensNote() {
  const q = lensQuote.value;
  const turn = lastLensTurn.value;
  const chapter = q ? props.book.chapters[q.chapterIndex] : undefined;
  if (!q || !turn || !chapter || !activeLens.value) return;
  const line = `【${lensById(activeLens.value).label}】${turn.answer}`;
  const now = Date.now();
  await booksStore.patchProgress(props.book.id, (current) => {
    const existing = current?.highlights ?? [];
    const target = existing.find((h) => h.id === q.highlightId) ??
      existing.find((h) => h.chapterId === chapter.id && h.start <= q.start && h.end >= q.end);
    if (target) {
      return {
        highlights: existing.map((h) =>
          h.id === target.id ? { ...h, note: h.note?.trim() ? `${h.note}\n${line}` : line, updatedAt: now } : h,
        ),
      };
    }
    const incoming: BookHighlight = {
      id: crypto.randomUUID(),
      chapterId: chapter.id,
      chapterIndex: q.chapterIndex,
      start: q.start,
      end: q.end,
      text: q.text,
      note: line,
      createdAt: now,
      updatedAt: now,
    };
    return { highlights: addHighlight(existing, incoming, (s, e) => chapter.content.slice(s, e).trim()) };
  });
  showToast("已存進筆記");
}

// ===== 閱讀時數 =====
// 畫面看得到、而且最近 3 分鐘內有翻頁或碰螢幕才算在讀，避免開著書走開也一直計時
const ACTIVE_WINDOW_MS = 3 * 60_000;
const TICK_MS = 15_000;
let lastActivityAt = Date.now();
let pendingSeconds = 0;
let tickTimer: ReturnType<typeof setInterval> | null = null;

function markActive() {
  lastActivityAt = Date.now();
}

function flushReadingTime() {
  if (pendingSeconds <= 0) return;
  const seconds = pendingSeconds;
  pendingSeconds = 0;
  const day = dateKey(Date.now());
  booksStore.patchProgress(props.book.id, (current) => ({
    dailySeconds: addDailySeconds(current?.dailySeconds, day, seconds),
  }));
}

function tickReadingTime() {
  if (!isReady.value || document.visibilityState !== "visible") return;
  if (Date.now() - lastActivityAt > ACTIVE_WINDOW_MS) return;
  pendingSeconds += TICK_MS / 1000;
  if (pendingSeconds >= 60) flushReadingTime();
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") flushReadingTime();
  else markActive();
}

// ===== 生命週期 =====
let resizeObserver: ResizeObserver | null = null;
let resizeFrame = 0;

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("pointerdown", markActive, { passive: true });
  window.addEventListener("keydown", markActive);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("selectionchange", onSelectionChange);
  tickTimer = setInterval(tickReadingTime, TICK_MS);

  await Promise.all([
    booksStore.loadReaderPrefs(),
    charsStore.characters.length === 0 ? charsStore.loadCharacters() : null,
    lorebooksStore.lorebooks.length === 0 ? lorebooksStore.loadLorebooks() : null,
    userStore.isLoaded ? null : userStore.loadUserData(),
  ]);

  const saved = await booksStore.getProgress(props.book.id);
  pagesSinceSummary.value = saved?.pagesSinceSummary ?? 0;
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
  window.removeEventListener("pointerdown", markActive);
  window.removeEventListener("keydown", markActive);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("selectionchange", onSelectionChange);
  cancelAnimationFrame(selectionFrame);
  if (toastTimer) clearTimeout(toastTimer);
  if (tickTimer) clearInterval(tickTimer);
  flushReadingTime();
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
      <button class="rd-icon-btn" aria-label="好玩模式" @click="openSheet('play')">
        <Sparkles :size="21" />
      </button>
      <button class="rd-icon-btn rd-aa" aria-label="排版設定" @click="openSheet('settings')">
        Aa
      </button>
      <button class="rd-icon-btn" aria-label="目錄" @click="openSheet('toc')">
        <List :size="22" />
      </button>
    </header>

    <Transition name="rd-fade">
      <div v-if="chapterEndPrompt !== null" class="rd-chapter-prompt" role="status">
        <span class="rd-chapter-prompt-text">
          <span class="rd-chapter-prompt-title">「{{ chapterTitleText(chapterEndPrompt) }}」讀完了</span>
          <span>做幾張卡，把這章留在腦裡？</span>
        </span>
        <button class="rd-chapter-prompt-go" :disabled="cardBusy" @click="makeChapterCards(chapterEndPrompt)">
          {{ cardBusy ? "出卡中…" : "出卡" }}
        </button>
        <button class="rd-icon-btn" aria-label="不用了" @click="dismissChapterPrompt">
          <X :size="18" />
        </button>
      </div>
    </Transition>

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
        <!-- 段落內不能有空白文字節點，否則選取換算的字元位置會偏掉 -->
        <p
          v-for="(para, i) in paragraphs"
          :key="`${chapterIndex}-${i}`"
          class="rd-para"
          :data-i="i"
        ><template v-for="seg in segmentsByPara[i]" :key="seg.from"><mark v-if="seg.highlightId" class="rd-hl" :class="{ noted: notedIds.has(seg.highlightId) }" @click.stop="openHighlight(seg.highlightId)">{{ para.text.slice(seg.from, seg.to) }}</mark><template v-else>{{ para.text.slice(seg.from, seg.to) }}</template></template><span class="rd-end" /></p>
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
      <!-- 選取文字時，底部膠囊換成選取動作（不跟手機原生的選取選單搶位置） -->
      <div v-if="selection && !sheet" class="rd-select-bar" role="toolbar" aria-label="選取的文字">
        <button @mousedown.prevent @click="actHighlight">
          <Highlighter :size="18" /><span>劃線</span>
        </button>
        <button @mousedown.prevent @click="actNote">
          <NotebookPen :size="18" /><span>筆記</span>
        </button>
        <button @mousedown.prevent @click="actLens">
          <Telescope :size="18" /><span>看法</span>
        </button>
        <button @mousedown.prevent @click="actAsk">
          <MessageCircle :size="18" /><span>問角色</span>
        </button>
        <button @mousedown.prevent @click="actCopy">
          <Copy :size="18" /><span>複製</span>
        </button>
      </div>
      <button v-else class="rd-ai-bar" @click="openCompanion">
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
            <div class="rd-tabs" role="tablist">
              <button
                role="tab"
                :aria-selected="tocTab === 'chapters'"
                :class="{ active: tocTab === 'chapters' }"
                @click="tocTab = 'chapters'"
              >
                目錄<span>{{ book.chapters.length }}</span>
              </button>
              <button
                role="tab"
                :aria-selected="tocTab === 'notes'"
                :class="{ active: tocTab === 'notes' }"
                @click="tocTab = 'notes'"
              >
                筆記<span>{{ highlights.length }}</span>
              </button>
              <button
                role="tab"
                :aria-selected="tocTab === 'summaries'"
                :class="{ active: tocTab === 'summaries' }"
                @click="tocTab = 'summaries'"
              >
                摘要<span>{{ summaries.length }}</span>
              </button>
            </div>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <div v-if="tocTab === 'notes'" class="rd-toc">
            <div class="rd-card-entry">
              <button class="rd-sum-new" :disabled="cards.length === 0" @click="reviewBookCards">
                <Layers :size="18" />複習這本書的卡
                <span v-if="dueCount" class="rd-due-badge">{{ dueCount }} 張到期</span>
                <span v-else-if="cards.length" class="rd-card-count">{{ cards.length }} 張</span>
              </button>
              <button class="rd-sum-new" :disabled="cardBusy" @click="makeChapterCards(chapterIndex)">
                <WandSparkles :size="18" />{{ cardBusy ? "出卡中…" : "為這章出卡" }}
              </button>
            </div>
            <p v-if="sortedHighlights.length === 0" class="rd-picker-empty">
              選一段文字就能劃線或寫筆記
            </p>
            <button
              v-for="{ h, chapter } in sortedHighlights"
              :key="h.id"
              class="rd-note-item"
              @click="jumpToHighlight(h)"
            >
              <span class="rd-note-chapter">{{ book.chapters[chapter]?.title }}</span>
              <span class="rd-note-quote">{{ h.text }}</span>
              <span v-if="h.note" class="rd-note-text">{{ h.note }}</span>
            </button>
          </div>
          <div v-else-if="tocTab === 'summaries'" class="rd-toc">
            <button class="rd-sum-new" :disabled="summaryRunning" @click="openSummaryRange">
              <ScrollText :size="18" />{{ summaryRunning ? "總結中…" : "總結這幾頁" }}
            </button>
            <p v-if="sortedSummaryList.length === 0" class="rd-picker-empty">
              還沒有摘要。讀一段之後按上面的按鈕，<br />或在排版設定開「自動摘要」。
            </p>
            <article v-for="s in sortedSummaryList" :key="s.id" class="rd-sum-item">
              <template v-if="editingSummaryId === s.id">
                <input v-model="summaryDraft.title" class="rd-sum-title-field" aria-label="摘要標題" />
                <textarea v-model="summaryDraft.content" class="rd-note-field" rows="6" aria-label="摘要內容" />
                <div class="rd-hl-actions">
                  <button class="rd-ghost-btn" @click="editingSummaryId = null">取消</button>
                  <button class="rd-solid-btn" :disabled="!summaryDraft.content.trim()" @click="saveSummaryEdit">
                    儲存
                  </button>
                </div>
              </template>
              <template v-else>
                <div class="rd-sum-head">
                  <button class="rd-sum-title" @click="jumpToSummary(s)">{{ s.title }}</button>
                  <button class="rd-icon-btn" aria-label="編輯摘要" @click="editSummary(s)">
                    <Pencil :size="16" />
                  </button>
                  <button class="rd-icon-btn" aria-label="刪除摘要" @click="deleteSummary(s)">
                    <Trash2 :size="16" />
                  </button>
                </div>
                <span class="rd-note-chapter">
                  {{ rangeLabel(s, book.chapters) }}<template v-if="s.auto"> · 自動</template>
                </span>
                <p class="rd-sum-content">{{ s.content }}</p>
              </template>
            </article>
          </div>
          <div v-else ref="tocListEl" class="rd-toc">
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
            <div class="rd-setting stacked">
              <span class="rd-setting-label">自動摘要</span>
              <div class="rd-segment fill" role="radiogroup" aria-label="每讀幾頁自動總結一次">
                <button
                  v-for="n in SUMMARY_EVERY_OPTIONS"
                  :key="n"
                  role="radio"
                  :aria-checked="prefs.summaryEveryPages === n"
                  :class="{ active: prefs.summaryEveryPages === n }"
                  @click="booksStore.setReaderPrefs({ summaryEveryPages: n })"
                >
                  {{ n ? `${n} 頁` : "關" }}
                </button>
              </div>
              <span class="rd-setting-note" :class="{ warn: autoSummaryPaused && prefs.summaryEveryPages }">
                {{
                  autoSummaryPaused && prefs.summaryEveryPages
                    ? "連續失敗 3 次，先暫停了；手動總結一次就會恢復。"
                    : "每往後讀幾頁，就在背景總結一次，會用到「總結」的 API。"
                }}
              </span>
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
          :draft="companionDraft"
          :error="companion.errorMessage.value"
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

        <!-- 好玩模式 -->
        <template v-else-if="sheet === 'play'">
          <div class="rd-sheet-head">
            <h3>好玩模式</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <p class="rd-sheet-hint">都只會用到你讀到這裡為止的內容，不會劇透。</p>
          <div class="rd-play-list">
            <button class="rd-play-item" @click="openSummaryRange">
              <span class="rd-play-icon" aria-hidden="true"><ScrollText :size="20" /></span>
              <span class="rd-play-text">
                <span class="rd-play-title">總結這幾頁</span>
                <span class="rd-play-desc">選一段讀過的範圍，AI 幫你整理重點，存在目錄的「摘要」</span>
              </span>
            </button>
            <button v-for="m in PLAY_MODES" :key="m.id" class="rd-play-item" @click="openPlay(m.id)">
              <span class="rd-play-icon" aria-hidden="true">
                <MessageCircle v-if="m.id === 'summon'" :size="20" />
                <Egg v-else-if="m.id === 'pet'" :size="20" />
                <Swords v-else-if="m.id === 'duel'" :size="20" />
                <WandSparkles v-else :size="20" />
              </span>
              <span class="rd-play-text">
                <span class="rd-play-title">{{ m.title }}</span>
                <span class="rd-play-desc">{{ m.desc }}</span>
              </span>
            </button>
          </div>
        </template>

        <!-- 總結範圍 -->
        <template v-else-if="sheet === 'summary'">
          <div class="rd-sheet-head">
            <h3>總結這幾頁</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <p class="rd-sheet-hint">範圍一律到你現在這頁為止。會把範圍裡的原文完整送給 AI，不裁切。</p>
          <div class="rd-sum-range" role="radiogroup" aria-label="總結範圍">
            <button
              role="radio"
              class="rd-sum-option"
              :aria-checked="summaryRangeKind === 'sinceLast'"
              :class="{ active: summaryRangeKind === 'sinceLast' }"
              @click="summaryRangeKind = 'sinceLast'"
            >
              <span class="rd-sum-dot" aria-hidden="true" />
              {{ hasEarlierSummary ? "從上次摘要到這裡" : "從本章開頭到這裡" }}
            </button>
            <button
              v-if="hasEarlierSummary"
              role="radio"
              class="rd-sum-option"
              :aria-checked="summaryRangeKind === 'chapter'"
              :class="{ active: summaryRangeKind === 'chapter' }"
              @click="summaryRangeKind = 'chapter'"
            >
              <span class="rd-sum-dot" aria-hidden="true" />本章開頭到這裡
            </button>
            <div class="rd-sum-option-row" :class="{ active: summaryRangeKind === 'recent' }">
              <button
                role="radio"
                class="rd-sum-option"
                :aria-checked="summaryRangeKind === 'recent'"
                :class="{ active: summaryRangeKind === 'recent' }"
                @click="summaryRangeKind = 'recent'"
              >
                <span class="rd-sum-dot" aria-hidden="true" />最近 {{ summaryRecentPages }} 頁
              </button>
              <div class="rd-stepper">
                <button
                  aria-label="少 5 頁"
                  :disabled="summaryRecentPages <= 5"
                  @click="summaryRangeKind = 'recent'; changeRecentPages(-5)"
                >
                  <Minus :size="16" />
                </button>
                <button
                  aria-label="多 5 頁"
                  :disabled="summaryRecentPages >= 200"
                  @click="summaryRangeKind = 'recent'; changeRecentPages(5)"
                >
                  <Plus :size="16" />
                </button>
              </div>
            </div>
          </div>
          <div class="rd-sum-meta" aria-live="polite">
            <span>{{ summaryRangeText }}</span>
            <span>
              會送 {{ summaryChars.toLocaleString() }} 字<template v-if="summaryCalls > 1">，每 2 萬字一次，分成 {{ summaryCalls }} 次</template>
            </span>
          </div>
          <div class="rd-hl-actions rd-sum-actions">
            <button
              class="rd-solid-btn"
              :disabled="summaryRunning || summaryChars <= 0"
              @click="startManualSummary"
            >
              {{ summaryButtonText }}
            </button>
          </div>
        </template>

        <!-- 觀點鏡頭 -->
        <template v-else-if="sheet === 'lens' && lensQuote">
          <div class="rd-sheet-head">
            <h3>換個鏡頭看</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <div ref="lensListEl" class="rd-lens-body">
            <blockquote class="rd-hl-quote">{{ lensQuote.text }}</blockquote>
            <div class="rd-lens-chips" role="group" aria-label="鏡頭">
              <button
                v-for="l in LENSES"
                :key="l.id"
                class="rd-lens-chip"
                :aria-pressed="activeLens === l.id"
                :class="{ active: activeLens === l.id }"
                @click="pickLens(l.id)"
              >
                {{ l.label }}
              </button>
              <button v-if="companion.isActive.value" class="rd-lens-chip" @click="askCompanionLens">
                <span v-if="companionAvatar" class="rd-lens-chip-avatar"><img :src="companionAvatar" alt="" /></span>
                {{ companionName }} 怎麼看
              </button>
            </div>

            <p v-if="!activeLens" class="rd-sheet-hint rd-lens-empty">選一個鏡頭，用不同角度讀這段。</p>
            <template v-else>
              <section v-for="(turn, i) in currentLensTurns" :key="i" class="rd-lens-turn">
                <p v-if="turn.question" class="rd-lens-question">{{ turn.question }}</p>
                <h4 v-else class="rd-lens-title">{{ lensById(activeLens).label }}</h4>
                <p class="rd-lens-answer">{{ turn.answer }}</p>
              </section>
              <p v-if="lensLoading" class="rd-lens-loading">想一想…</p>
              <p v-if="lensError" class="rd-lens-error">
                {{ lensError }}
                <button class="rd-link-btn" @click="askCurrentLens()">再試一次</button>
              </p>
              <span v-if="lastLensTurn" class="rd-lens-pos">{{ book.chapters[lensQuote.chapterIndex]?.title }} · 第 {{ lensQuote.paraNo }} 段</span>
              <div v-if="lastLensTurn && !lensLoading" class="rd-lens-suggest">
                <button v-if="lastLensTurn.followUp" class="rd-lens-suggest-btn" @click="askCurrentLens(lastLensTurn.followUp)">
                  {{ lastLensTurn.followUp }}
                </button>
                <button class="rd-lens-suggest-btn" @click="saveLensCard">
                  <Layers :size="15" />存成記憶卡，三天後考我
                </button>
                <button class="rd-lens-suggest-btn" @click="saveLensNote">
                  <NotebookPen :size="15" />存進筆記
                </button>
              </div>
            </template>
          </div>
          <form v-if="activeLens && lastLensTurn" class="rd-lens-input" @submit.prevent="sendLensDraft">
            <input
              v-model="lensDraft"
              class="rd-lens-field"
              :placeholder="`接著問「${lensById(activeLens).label}」…`"
              aria-label="追問"
              enterkeyhint="send"
            />
            <button class="rd-lens-send" type="submit" :disabled="!lensDraft.trim() || lensLoading" aria-label="送出">
              <Send :size="18" />
            </button>
          </form>
        </template>

        <!-- 劃線與筆記 -->
        <template v-else-if="sheet === 'highlight' && activeHighlight">
          <div class="rd-sheet-head">
            <h3>劃線</h3>
            <button class="rd-icon-btn" aria-label="關閉" @click="closeSheet">
              <X :size="20" />
            </button>
          </div>
          <div class="rd-hl-sheet">
            <blockquote class="rd-hl-quote">{{ activeHighlight.text }}</blockquote>
            <label for="rd-note-field" class="rd-setting-label">筆記</label>
            <textarea
              id="rd-note-field"
              v-model="noteDraft"
              class="rd-note-field"
              rows="4"
              placeholder="寫下你的想法…"
            />
            <div class="rd-hl-actions">
              <button class="rd-ghost-btn danger" @click="deleteActiveHighlight">
                <Trash2 :size="16" />刪除劃線
              </button>
              <button class="rd-ghost-btn" @click="lensFromHighlight(activeHighlight)">
                <Telescope :size="16" />看法
              </button>
              <button class="rd-ghost-btn" @click="askCompanionAbout(activeHighlight.text)">
                <MessageCircle :size="16" />問角色
              </button>
              <button class="rd-solid-btn" @click="saveNote">儲存</button>
            </div>
          </div>
        </template>
      </section>
    </Transition>

    <Transition name="rd-fade">
      <div v-if="toast" class="rd-toast" role="status">{{ toast }}</div>
    </Transition>

    <Transition name="rd-fade">
      <BookReviewCards
        v-if="reviewItems"
        :items="reviewItems"
        :mode="reviewMode"
        :heading="reviewHeading"
        can-jump
        @close="closeReview"
        @jump="jumpFromReview"
      />
    </Transition>

    <Transition name="rd-fade">
      <BookPlaySummon
        v-if="playMode === 'summon'"
        :book="book"
        :reading-text="playReadingText"
        :user-name="userStore.currentName || '我'"
        @close="closePlay"
      />
      <BookPlayPet v-else-if="playMode === 'pet'" @close="closePlay" />
      <BookPlayDuel
        v-else-if="playMode === 'duel'"
        :book="book"
        :reading-text="playReadingText"
        :user-name="userStore.currentName || '我'"
        @close="closePlay"
      />
      <BookPlayWhatIf
        v-else-if="playMode === 'whatif'"
        :book="book"
        :reading-text="playReadingText"
        :chapter-index="playPosition.chapterIndex"
        :char-offset="playPosition.charOffset"
        @close="closePlay"
      />
    </Transition>
  </div>
</template>

<style scoped lang="scss">
.reader-screen {
  --rd-accent: var(--color-primary, #7dd3a8);
  --rd-on-accent: var(--color-on-primary-contrast, color-mix(in srgb, var(--rd-accent) 22%, #0b1f16));
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
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rd-setting-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--rd-sub);

  &.warn {
    color: var(--color-error, #e53e3e);
  }
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

  &.fill button {
    flex: 1;
    min-width: 0;
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

// ===== 劃線 =====
.rd-hl {
  color: inherit;
  background: linear-gradient(
    transparent 55%,
    color-mix(in srgb, var(--rd-accent) 45%, transparent) 55%
  );
  border-radius: 2px;
  cursor: pointer;

  // 有筆記的劃線在開頭左上標一個點；絕對定位，不佔寬度、不影響分頁
  &.noted {
    position: relative;
  }

  &.noted::after {
    content: "";
    position: absolute;
    left: -0.2em;
    top: -0.05em;
    width: 0.32em;
    height: 0.32em;
    border-radius: 50%;
    background: var(--rd-accent);
    pointer-events: none;
  }
}

.rd-select-bar {
  display: flex;
  align-items: center;
  height: 56px;
  padding: 0 6px;
  border-radius: 28px;
  background: var(--rd-pill-bg);
  color: var(--rd-pill-text);
  box-shadow: 0 10px 24px color-mix(in srgb, #000 16%, transparent);

  button {
    flex: 1;
    height: 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    border: none;
    border-radius: 24px;
    background: transparent;
    color: inherit;
    font-size: 11px;
    cursor: pointer;

    &:hover {
      background: color-mix(in srgb, var(--rd-pill-text) 12%, transparent);
    }
  }
}

.rd-tabs {
  flex: 1;
  display: flex;
  gap: 4px;

  button {
    height: 40px;
    padding: 0 14px;
    border: none;
    border-radius: 20px;
    background: transparent;
    color: var(--rd-sub);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;

    span {
      margin-left: 6px;
      font-size: 12px;
      font-weight: 500;
    }

    &.active {
      background: var(--rd-raise);
      color: var(--rd-text);
    }
  }
}

.rd-sheet-head .rd-tabs {
  margin-left: -12px;
}

.rd-note-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px;
  border: none;
  border-bottom: 1px solid var(--rd-line);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--rd-raise);
  }
}

.rd-note-chapter {
  font-size: 12px;
  color: var(--rd-sub);
}

.rd-note-quote {
  padding-left: 10px;
  border-left: 3px solid var(--rd-accent);
  font-family: "Noto Serif TC", serif;
  font-size: 15px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.rd-note-text {
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.rd-hl-sheet {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0 20px 4px;
  min-height: 0;
  overflow-y: auto;
}

.rd-hl-quote {
  margin: 0;
  padding: 2px 0 2px 12px;
  border-left: 3px solid var(--rd-accent);
  font-family: "Noto Serif TC", serif;
  font-size: 16px;
  line-height: 1.7;
  max-height: 9em;
  overflow-y: auto;
}

.rd-note-field {
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid var(--rd-line);
  border-radius: 16px;
  background: var(--rd-bg);
  color: var(--rd-text);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.6;
  resize: none;
  outline: none;

  &:focus {
    border-color: var(--rd-accent);
  }
}

.rd-hl-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.rd-ghost-btn,
.rd-solid-btn {
  height: 44px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border-radius: 22px;
  font-size: 14px;
  cursor: pointer;
}

.rd-ghost-btn {
  border: 1px solid var(--rd-line);
  background: transparent;
  color: var(--rd-text);

  &.danger {
    color: var(--color-error, #e53e3e);
  }
}

.rd-solid-btn {
  margin-left: auto;
  border: none;
  background: var(--rd-accent);
  color: var(--rd-on-accent);
  font-weight: 700;
}

.rd-toast {
  // 放在頂欄下方：抽屜最高只到這裡，不會被蓋住也不會擋到抽屜內容
  position: absolute;
  left: 50%;
  top: calc(60px + var(--safe-top, 0px));
  transform: translateX(-50%);
  z-index: 30;
  padding: 10px 18px;
  border-radius: 20px;
  background: var(--rd-pill-bg);
  color: var(--rd-pill-text);
  font-size: 14px;
  pointer-events: none;
}

// ===== 分段摘要 =====
.rd-sum-new {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  margin: 2px 0 8px;
  border: 1px dashed var(--rd-line);
  border-radius: 16px;
  background: transparent;
  color: var(--rd-text);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--rd-raise);
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.rd-sum-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 4px 12px 12px;
  border-bottom: 1px solid var(--rd-line);
}

.rd-sum-head {
  display: flex;
  align-items: center;
  gap: 2px;

  .rd-icon-btn {
    width: 40px;
    height: 40px;
    color: var(--rd-sub);
  }
}

.rd-sum-title {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 0;
  border: none;
  background: transparent;
  color: inherit;
  font-family: "Noto Serif TC", serif;
  font-size: 16px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
}

.rd-sum-content {
  margin: 4px 8px 0 0;
  font-size: 14px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.rd-sum-title-field {
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  padding: 0 14px;
  border: 1px solid var(--rd-line);
  border-radius: 14px;
  background: var(--rd-bg);
  color: var(--rd-text);
  font-family: inherit;
  font-size: 16px;
  font-weight: 700;
  outline: none;

  &:focus {
    border-color: var(--rd-accent);
  }
}

.rd-sum-item .rd-note-field {
  margin-top: 4px;
}

.rd-sum-item .rd-hl-actions {
  margin: 6px 8px 0 0;
}

.rd-sum-range {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 16px;
}

.rd-sum-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 16px;
  background: var(--rd-raise);

  &.active {
    background: var(--rd-accent-soft);
  }

  .rd-sum-option,
  .rd-sum-option.active {
    flex: 1;
    background: transparent;
  }

  .rd-stepper {
    margin-right: 6px;
    background: var(--rd-sheet);
  }
}

.rd-sum-option {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 0 14px;
  border: none;
  border-radius: 16px;
  background: var(--rd-raise);
  color: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;

  &.active {
    background: var(--rd-accent-soft);
    font-weight: 700;
  }
}

.rd-sum-dot {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  box-sizing: border-box;
  border: 2px solid var(--rd-sub);
  border-radius: 50%;

  .active > & {
    border: 6px solid var(--rd-accent);
  }
}

.rd-sum-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 14px 20px 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--rd-sub);

  span:first-child {
    color: var(--rd-text);
    font-weight: 600;
  }
}

.rd-sum-actions {
  padding: 12px 20px 4px;

  .rd-solid-btn {
    flex: 1;
    justify-content: center;
    margin-left: 0;
  }
}

.rd-solid-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

// ===== 回顧卡 =====
.rd-chapter-prompt {
  // 疊在內文上方，不改變內文高度（改了會重新分頁）
  position: absolute;
  left: 50%;
  top: calc(58px + var(--safe-top, 0px));
  transform: translateX(-50%);
  z-index: 5;
  width: calc(100% - 24px);
  max-width: 520px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px 6px 16px;
  border-radius: 24px;
  background: var(--rd-pill-bg);
  color: var(--rd-pill-text);
  box-shadow: 0 8px 20px color-mix(in srgb, #000 16%, transparent);

  .rd-icon-btn:hover {
    background: color-mix(in srgb, var(--rd-pill-text) 12%, transparent);
  }
}

.rd-chapter-prompt-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  font-size: 12px;
  line-height: 1.45;
  opacity: 0.85;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.rd-chapter-prompt-title {
  font-size: 14px;
  font-weight: 700;
}

.rd-chapter-prompt-go {
  flex-shrink: 0;
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: 18px;
  background: var(--rd-accent);
  color: var(--rd-on-accent);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
  }
}

.rd-card-entry {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  .rd-sum-new {
    flex-wrap: wrap;
    gap: 4px 6px;
    height: auto;
    min-height: 52px;
    padding: 6px 8px;
    font-size: 14px;
  }
}

.rd-due-badge,
.rd-card-count {
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}

.rd-due-badge {
  background: var(--rd-accent);
  color: var(--rd-on-accent);
}

.rd-card-count {
  background: var(--rd-raise);
  color: var(--rd-sub);
}

// ===== 觀點鏡頭 =====
.rd-sheet.is-lens {
  height: 78%;
}

.rd-lens-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0 20px 8px;

  .rd-hl-quote {
    flex-shrink: 0;
    max-height: 6.8em;
  }
}

.rd-lens-chips {
  // 追問多了往下捲時，鏡頭按鈕留在上面，隨時可以換
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 -20px;
  padding: 4px 20px 8px;
  background: var(--rd-sheet);
}

.rd-lens-chip {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  border: 1px solid var(--rd-line);
  border-radius: 20px;
  background: transparent;
  color: var(--rd-text);
  font-size: 14px;
  cursor: pointer;

  &:hover {
    background: var(--rd-raise);
  }

  &.active {
    border-color: transparent;
    background: var(--rd-text);
    color: var(--rd-bg);
    font-weight: 700;
  }
}

.rd-lens-chip-avatar {
  width: 22px;
  height: 22px;
  margin-left: -8px;
  border-radius: 50%;
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.rd-lens-empty {
  margin: 8px 0 0;
}

.rd-lens-turn {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rd-lens-title {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--rd-sub);
  letter-spacing: 0.06em;
}

.rd-lens-question {
  align-self: flex-end;
  max-width: 85%;
  margin: 4px 0 0;
  padding: 8px 14px;
  border-radius: 18px 18px 4px 18px;
  background: var(--rd-accent-soft);
  font-size: 14px;
  line-height: 1.6;
}

.rd-lens-answer {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.rd-lens-loading {
  margin: 0;
  font-size: 14px;
  color: var(--rd-sub);
  animation: rd-blink 1.2s ease-in-out infinite;
}

@keyframes rd-blink {
  50% {
    opacity: 0.4;
  }
}

.rd-lens-error {
  margin: 0;
  font-size: 14px;
  color: var(--color-error, #e53e3e);
}

.rd-link-btn {
  margin-left: 6px;
  padding: 0;
  border: none;
  background: none;
  color: var(--rd-text);
  font-size: 14px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.rd-lens-pos {
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--rd-raise);
  font-size: 12px;
  color: var(--rd-sub);
}

.rd-lens-suggest {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rd-lens-suggest-btn {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border: 1px dashed var(--rd-line);
  border-radius: 20px;
  background: transparent;
  color: var(--rd-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--rd-raise);
  }
}

.rd-lens-input {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  padding: 8px 16px 0;
  border-top: 1px solid var(--rd-line);
}

.rd-lens-field {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--rd-line);
  border-radius: 22px;
  background: var(--rd-bg);
  color: var(--rd-text);
  font-family: inherit;
  font-size: 16px;
  outline: none;

  &:focus {
    border-color: var(--rd-accent);
  }
}

.rd-lens-send {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 22px;
  background: var(--rd-accent);
  color: var(--rd-on-accent);
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

// ===== 好玩模式清單 =====
.rd-play-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 16px 4px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.rd-play-item {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: 72px;
  padding: 10px 14px;
  border: none;
  border-radius: 20px;
  background: var(--rd-raise);
  color: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--rd-line);
  }
}

.rd-play-icon {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 22px;
  background: var(--rd-accent);
  color: var(--rd-on-accent);
}

.rd-play-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rd-play-title {
  font-size: 16px;
  font-weight: 700;
}

.rd-play-desc {
  font-size: 13px;
  line-height: 1.5;
  color: var(--rd-sub);
}
</style>
