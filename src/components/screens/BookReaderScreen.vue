<script setup lang="ts">
import CompanionChatPanel from "@/components/common/CompanionChatPanel.vue";
import FloatingBubble from "@/components/common/FloatingBubble.vue";
import { useCompanionChat } from "@/composables/useCompanionChat";
import { useBooksStore } from "@/stores/books";
import { useCharactersStore } from "@/stores/characters";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useUserStore } from "@/stores/user";
import type { StoredBook } from "@/types/book";
import {
    ArrowLeft,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    List,
    Settings2,
    Users,
    X,
} from "lucide-vue-next";
import {
    computed,
    nextTick,
    onMounted,
    onUnmounted,
    ref,
    toRef,
    watch,
} from "vue";

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

// 閱讀狀態
const currentChapterIndex = ref(0);
const contentEl = ref<HTMLElement | null>(null);
const containerEl = ref<HTMLElement | null>(null);
const showToc = ref(false);
const showSettings = ref(false);

// 分頁狀態
const currentPage = ref(0);
const totalPages = ref(1);
const containerWidth = ref(0);
let resizeObserver: ResizeObserver | null = null;

// 角色選擇 modal
const showCharacterPicker = ref(false);

// 伴讀聊天
const companion = useCompanionChat({
  book: toRef(props, "book"),
  currentChapterIndex,
});

// 閱讀設定
const fontSize = ref(17);
const lineHeight = ref(1.9);
const bgColor = ref("#fdf6e3");
const textColor = ref("#3c3836");

const BG_PRESETS = [
  { bg: "#fdf6e3", text: "#3c3836", label: "護眼" },
  { bg: "#ffffff", text: "#222222", label: "白底" },
  { bg: "#1a1a2e", text: "#e0e0e0", label: "夜間" },
  { bg: "#e8f5e9", text: "#2e4a2e", label: "綠底" },
];

const currentChapter = computed(
  () => props.book.chapters[currentChapterIndex.value],
);

const progress = computed(() => {
  if (props.book.chapters.length <= 1 && totalPages.value <= 1) return 100;
  // 綜合進度：章節進度 + 頁內進度
  const chapterWeight =
    currentChapterIndex.value / Math.max(props.book.chapters.length - 1, 1);
  const pageWeight =
    totalPages.value > 1 ? currentPage.value / (totalPages.value - 1) : 1;
  const perChapter = 1 / props.book.chapters.length;
  return Math.round((chapterWeight + pageWeight * perChapter) * 100);
});

// 計算總頁數
function recalcPages() {
  nextTick(() => {
    nextTick(() => {
      if (!containerEl.value || !contentEl.value) return;
      // clientWidth 包含 padding，我們需要內容區寬度
      const style = getComputedStyle(containerEl.value);
      const pl = parseFloat(style.paddingLeft) || 0;
      const pr = parseFloat(style.paddingRight) || 0;
      const innerWidth = containerEl.value.clientWidth - pl - pr;
      containerWidth.value = innerWidth;

      // column 佈局後，scrollWidth 會是所有 column 的總寬度
      const scrollW = contentEl.value.scrollWidth;
      if (innerWidth <= 0) return;
      // 每個 column 寬度 = innerWidth，column-gap = 48px
      // 所以每頁佔 innerWidth + 48px（最後一頁不加 gap）
      const pageWidth = innerWidth + 48; // column-gap
      totalPages.value = Math.max(1, Math.round(scrollW / pageWidth));
      // 確保 currentPage 不超出範圍
      if (currentPage.value >= totalPages.value) {
        currentPage.value = totalPages.value - 1;
      }
      // 套用當前頁的偏移
      applyPageOffset();
    });
  });
}

function applyPageOffset(animate = false) {
  if (!contentEl.value) return;
  const pageWidth = containerWidth.value + 48; // column-gap
  const offset = currentPage.value * pageWidth;
  if (animate) {
    contentEl.value.style.transition = "transform 0.25s ease-out";
  } else {
    contentEl.value.style.transition = "none";
  }
  contentEl.value.style.transform = `translateX(-${offset}px)`;
}

// 儲存進度（防抖）
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    booksStore.saveProgress({
      bookId: props.book.id,
      chapterIndex: currentChapterIndex.value,
      scrollPosition: currentPage.value,
      lastReadAt: Date.now(),
    });
  }, 1000);
}

function goToChapter(index: number) {
  if (index < 0 || index >= props.book.chapters.length) return;
  currentChapterIndex.value = index;
  currentPage.value = 0;
  showToc.value = false;
  nextTick(() => recalcPages());
  scheduleSave();

  // 伴讀：翻頁觸發
  if (companion.isActive.value) {
    const triggered = companion.onPageTurn(index);
    if (triggered) {
      companion.triggerAutoResponse();
    }
  }
}

function goToPage(page: number) {
  if (page < 0) {
    // 翻到上一章最後一頁
    if (currentChapterIndex.value > 0) {
      currentChapterIndex.value--;
      currentPage.value = 0;
      nextTick(() => {
        recalcPages();
        nextTick(() => {
          currentPage.value = totalPages.value - 1;
          scheduleSave();
        });
      });
      // 伴讀觸發
      if (companion.isActive.value) {
        const triggered = companion.onPageTurn(currentChapterIndex.value);
        if (triggered) companion.triggerAutoResponse();
      }
    }
    return;
  }
  if (page >= totalPages.value) {
    // 翻到下一章第一頁
    if (currentChapterIndex.value < props.book.chapters.length - 1) {
      currentChapterIndex.value++;
      currentPage.value = 0;
      nextTick(() => recalcPages());
      scheduleSave();
      // 伴讀觸發
      if (companion.isActive.value) {
        const triggered = companion.onPageTurn(currentChapterIndex.value);
        if (triggered) companion.triggerAutoResponse();
      }
    }
    return;
  }
  currentPage.value = page;
  applyPageOffset(true);
  scheduleSave();

  // 伴讀：每翻一頁都計數
  if (companion.isActive.value) {
    const triggered = companion.onPageTurn(currentChapterIndex.value);
    if (triggered) {
      companion.triggerAutoResponse();
    }
  }
}

function prevPage() {
  goToPage(currentPage.value - 1);
}

function nextPage() {
  goToPage(currentPage.value + 1);
}

// ===== 水平滑動翻頁 =====
const swipeStartX = ref(0);
const swipeStartY = ref(0);
const swipeDeltaX = ref(0);
const isSwiping = ref(false);
const isAnimating = ref(false);
const SWIPE_THRESHOLD = 50;

function onTouchStart(e: TouchEvent) {
  if (isAnimating.value) return;
  const touch = e.touches[0];
  swipeStartX.value = touch.clientX;
  swipeStartY.value = touch.clientY;
  swipeDeltaX.value = 0;
  isSwiping.value = false;
}

function onTouchMove(e: TouchEvent) {
  if (isAnimating.value) return;
  const touch = e.touches[0];
  const dx = touch.clientX - swipeStartX.value;
  const dy = touch.clientY - swipeStartY.value;

  if (!isSwiping.value && Math.abs(dx) > 8) {
    if (Math.abs(dx) > Math.abs(dy)) {
      isSwiping.value = true;
    }
  }

  if (isSwiping.value) {
    e.preventDefault();
    swipeDeltaX.value = dx;
    // 即時拖曳回饋
    if (contentEl.value) {
      const pageWidth = containerWidth.value + 48;
      const baseOffset = currentPage.value * pageWidth;
      contentEl.value.style.transition = "none";
      contentEl.value.style.transform = `translateX(-${baseOffset - dx * 0.4}px)`;
    }
  }
}

function onTouchEnd() {
  if (isAnimating.value) return;
  if (!isSwiping.value) {
    swipeDeltaX.value = 0;
    return;
  }

  const canGoNext =
    currentPage.value < totalPages.value - 1 ||
    currentChapterIndex.value < props.book.chapters.length - 1;
  const canGoPrev = currentPage.value > 0 || currentChapterIndex.value > 0;

  if (swipeDeltaX.value < -SWIPE_THRESHOLD && canGoNext) {
    animateSlide("left", () => nextPage());
  } else if (swipeDeltaX.value > SWIPE_THRESHOLD && canGoPrev) {
    animateSlide("right", () => prevPage());
  } else {
    // 回彈到當前頁
    swipeDeltaX.value = 0;
    if (contentEl.value) {
      contentEl.value.style.transition = "transform 0.2s ease-out";
      applyPageOffset(true);
    }
  }
  isSwiping.value = false;
}

function animateSlide(dir: "left" | "right", callback: () => void) {
  if (!contentEl.value) {
    callback();
    return;
  }
  isAnimating.value = true;
  swipeDeltaX.value = 0;

  // 先做一個小位移動畫暗示方向
  const nudge = dir === "left" ? -30 : 30;
  const pageWidth = containerWidth.value + 48;
  const baseOffset = currentPage.value * pageWidth;
  contentEl.value.style.transition = "transform 0.2s ease-out";
  contentEl.value.style.transform = `translateX(-${baseOffset - nudge}px)`;

  setTimeout(() => {
    if (contentEl.value) {
      contentEl.value.style.transition = "none";
    }
    isAnimating.value = false;
    callback();
    // callback 裡的 goToPage 會呼叫 applyPageOffset
  }, 200);
}

// 鍵盤快捷鍵
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowLeft") prevPage();
  else if (e.key === "ArrowRight") nextPage();
  else if (e.key === "Escape") {
    if (showCharacterPicker.value) showCharacterPicker.value = false;
    else if (showToc.value) showToc.value = false;
    else if (showSettings.value) showSettings.value = false;
  }
}

// 點擊左右區域翻頁
function handleTapNavigation(e: MouseEvent) {
  if (isSwiping.value || isAnimating.value) return;
  if (!containerEl.value) return;
  const rect = containerEl.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const third = rect.width / 3;
  if (x < third) {
    prevPage();
  } else if (x > third * 2) {
    nextPage();
  }
}

// 伴讀：選擇角色
function selectCompanionCharacter(characterId: string) {
  companion.startCompanion(characterId);
  showCharacterPicker.value = false;
}

// 伴讀：停止
function stopCompanion() {
  companion.stopCompanion();
}

// 伴讀：發送訊息
function handleCompanionSend(content: string) {
  companion.sendMessage(content);
}

// 伴讀：設定觸發頻率
function handleFrequencyChange(n: number) {
  companion.setTriggerFrequency(n);
}

// 伴讀：縮小面板
function handleMinimize() {
  companion.togglePanel();
}

// 伴讀：展開面板
function handleExpand() {
  companion.togglePanel();
}

// 伴讀：更新氣泡位置
function handleBubblePositionUpdate(pos: { x: number; y: number }) {
  companion.updateBubblePosition(pos.x, pos.y);
}

// 取得角色頭像
const companionAvatarSrc = computed(() => {
  if (!companion.selectedCharacterId.value) return "";
  const char = charsStore.getCharacterById(companion.selectedCharacterId.value);
  return char?.avatar || "";
});

// 取得角色名稱
const companionCharacterName = computed(() => {
  if (!companion.selectedCharacterId.value) return "";
  const char = charsStore.getCharacterById(companion.selectedCharacterId.value);
  return char?.nickname || char?.data.name || "";
});

onMounted(async () => {
  window.addEventListener("keydown", handleKeydown);

  // 監聽容器大小變化，重新計算頁數
  if (containerEl.value) {
    resizeObserver = new ResizeObserver(() => recalcPages());
    resizeObserver.observe(containerEl.value);
  }

  // 載入角色列表
  if (charsStore.characters.length === 0) {
    await charsStore.loadCharacters();
  }

  // 載入世界書
  if (lorebooksStore.lorebooks.length === 0) {
    await lorebooksStore.loadLorebooks();
  }

  // 載入使用者資料
  if (!userStore.isLoaded) {
    await userStore.loadUserData();
  }

  // 恢復上次進度
  const savedProgress = await booksStore.getProgress(props.book.id);
  if (savedProgress) {
    currentChapterIndex.value = savedProgress.chapterIndex;
    await nextTick();
    recalcPages();
    await nextTick();
    currentPage.value = Math.min(
      savedProgress.scrollPosition || 0,
      totalPages.value - 1,
    );
  } else {
    await nextTick();
    recalcPages();
  }

  // 恢復伴讀狀態
  await companion.restoreState();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown);
  if (saveTimer) clearTimeout(saveTimer);
  if (resizeObserver) resizeObserver.disconnect();
  companion.saveState();
});

// 章節切換或字體變更時重新計算頁數
watch([currentChapterIndex, fontSize, lineHeight], () => {
  nextTick(() => recalcPages());
});

function applyPreset(preset: (typeof BG_PRESETS)[0]) {
  bgColor.value = preset.bg;
  textColor.value = preset.text;
}
</script>

<template>
  <div class="reader-screen" :style="{ background: bgColor, color: textColor }">
    <!-- 頂欄 -->
    <div class="reader-header">
      <button class="icon-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <div class="header-center">
        <p class="book-title-small">{{ book.title }}</p>
        <p class="chapter-title-small">{{ currentChapter?.title }}</p>
      </div>
      <button class="icon-btn" @click="showSettings = !showSettings">
        <Settings2 :size="20" />
      </button>
      <button
        class="icon-btn"
        :class="{ active: companion.isActive.value }"
        :title="companion.isActive.value ? '伴讀中' : '開啟伴讀'"
        @click="
          companion.isActive.value
            ? stopCompanion()
            : (showCharacterPicker = true)
        "
      >
        <Users :size="20" />
      </button>
      <button class="icon-btn" @click="showToc = !showToc">
        <List :size="20" />
      </button>
    </div>

    <!-- 閱讀內容（水平分頁） -->
    <div
      ref="containerEl"
      class="reader-page-container"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @click="handleTapNavigation"
    >
      <div
        ref="contentEl"
        class="reader-columns"
        :style="{
          fontSize: `${fontSize}px`,
          lineHeight,
          columnWidth: containerWidth > 0 ? `${containerWidth}px` : undefined,
        }"
      >
        <h2 class="chapter-heading">
          {{ currentChapter?.title }}
        </h2>
        <div class="chapter-body">
          <p
            v-for="(para, i) in currentChapter?.content
              .split('\n')
              .filter((l) => l.trim())"
            :key="i"
            class="paragraph"
          >
            {{ para }}
          </p>
        </div>
      </div>
    </div>

    <!-- 底部導航 -->
    <div class="reader-footer">
      <button
        class="nav-btn"
        :disabled="currentChapterIndex === 0 && currentPage === 0"
        @click="prevPage"
      >
        <ChevronLeft :size="18" />
        上一頁
      </button>

      <div class="progress-info">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${progress}%` }" />
        </div>
        <span class="progress-text">
          第 {{ currentChapterIndex + 1 }} 章 · {{ currentPage + 1 }}/{{
            totalPages
          }}
          頁
        </span>
      </div>

      <button
        class="nav-btn"
        :disabled="
          currentChapterIndex === book.chapters.length - 1 &&
          currentPage >= totalPages - 1
        "
        @click="nextPage"
      >
        下一頁
        <ChevronRight :size="18" />
      </button>
    </div>

    <!-- 目錄側欄 -->
    <Transition name="slide-right">
      <div v-if="showToc" class="toc-panel">
        <div class="toc-header">
          <BookOpen :size="16" />
          <span>目錄</span>
          <button class="icon-btn small" @click="showToc = false">
            <ChevronRight :size="16" />
          </button>
        </div>
        <div class="toc-list">
          <button
            v-for="(chapter, i) in book.chapters"
            :key="chapter.id"
            class="toc-item"
            :class="{ active: i === currentChapterIndex }"
            @click="goToChapter(i)"
          >
            {{ chapter.title }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- 設定面板 -->
    <Transition name="slide-up">
      <div v-if="showSettings" class="settings-panel">
        <div class="settings-row">
          <span class="settings-label">字體大小</span>
          <div class="settings-controls">
            <button
              class="ctrl-btn"
              @click="fontSize = Math.max(12, fontSize - 1)"
            >
              A-
            </button>
            <span class="ctrl-value">{{ fontSize }}px</span>
            <button
              class="ctrl-btn"
              @click="fontSize = Math.min(28, fontSize + 1)"
            >
              A+
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">行距</span>
          <div class="settings-controls">
            <button
              class="ctrl-btn"
              @click="
                lineHeight = Math.max(1.4, +(lineHeight - 0.1).toFixed(1))
              "
            >
              -
            </button>
            <span class="ctrl-value">{{ lineHeight }}</span>
            <button
              class="ctrl-btn"
              @click="
                lineHeight = Math.min(3.0, +(lineHeight + 0.1).toFixed(1))
              "
            >
              +
            </button>
          </div>
        </div>
        <div class="settings-row">
          <span class="settings-label">背景</span>
          <div class="bg-presets">
            <button
              v-for="preset in BG_PRESETS"
              :key="preset.bg"
              class="bg-preset-btn"
              :style="{ background: preset.bg, color: preset.text }"
              :class="{ active: bgColor === preset.bg }"
              @click="applyPreset(preset)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 遮罩 -->
    <div
      v-if="showToc || showSettings"
      class="overlay"
      @click="
        showToc = false;
        showSettings = false;
      "
    />

    <!-- 伴讀聊天面板 -->
    <CompanionChatPanel
      v-if="companion.isActive.value && companion.isPanelExpanded.value"
      :character-name="companionCharacterName"
      :book-title="book.title"
      :messages="companion.messages.value"
      :is-generating="companion.isGenerating.value"
      :trigger-frequency="companion.triggerFrequency.value"
      @minimize="handleMinimize"
      @send="handleCompanionSend"
      @update:trigger-frequency="handleFrequencyChange"
    />

    <!-- 浮動氣泡 -->
    <FloatingBubble
      v-if="companion.isActive.value && !companion.isPanelExpanded.value"
      :avatar-src="companionAvatarSrc"
      :has-unread="companion.hasUnread.value"
      :position="companion.bubblePosition.value"
      @expand="handleExpand"
      @update:position="handleBubblePositionUpdate"
    />

    <!-- 角色選擇 Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showCharacterPicker"
          class="char-picker-overlay"
          @click.self="showCharacterPicker = false"
        >
          <div class="char-picker-modal">
            <div class="char-picker-header">
              <span>選擇伴讀角色</span>
              <button
                class="icon-btn small"
                @click="showCharacterPicker = false"
              >
                <X :size="16" />
              </button>
            </div>
            <div class="char-picker-list">
              <div
                v-if="charsStore.characters.length === 0"
                class="char-picker-empty"
              >
                尚無角色，請先匯入角色卡
              </div>
              <button
                v-for="char in charsStore.characters"
                :key="char.id"
                class="char-picker-item"
                @click="selectCompanionCharacter(char.id)"
              >
                <img
                  v-if="char.avatar"
                  :src="char.avatar"
                  class="char-picker-avatar"
                  alt=""
                />
                <span
                  v-else
                  class="char-picker-avatar char-picker-avatar--placeholder"
                  >👤</span
                >
                <div class="char-picker-info">
                  <span class="char-picker-name">{{
                    char.nickname || char.data.name
                  }}</span>
                  <span v-if="char.data.description" class="char-picker-desc">{{
                    char.data.description
                  }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.reader-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative;
  overflow: hidden;
  transition:
    background 0.3s,
    color 0.3s;
}

.reader-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  padding-top: max(10px, var(--safe-top, 0px));
  background: inherit;
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
  flex-shrink: 0;
  z-index: 10;

  .header-center {
    flex: 1;
    overflow: hidden;
    text-align: center;
  }

  .book-title-small {
    font-size: 12px;
    opacity: 0.6;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chapter-title-small {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0.75;
  transition:
    opacity 0.2s,
    background 0.2s;

  &:hover {
    opacity: 1;
    background: rgba(128, 128, 128, 0.12);
  }

  &.small {
    width: 28px;
    height: 28px;
  }

  &.active {
    opacity: 1;
    color: var(--color-primary, #7dd3a8);
  }
}

.reader-page-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  padding: 20px 24px;
  box-sizing: border-box;
}

.reader-columns {
  height: 100%;
  box-sizing: border-box;
  column-fill: auto;
  column-gap: 48px;
  max-width: none;
  will-change: transform;
  overflow: visible;
}

.chapter-heading {
  font-size: 1.2em;
  font-weight: 700;
  margin: 0 0 24px;
  text-align: center;
  opacity: 0.9;
}

.chapter-body {
  .paragraph {
    margin: 0 0 1em;
    text-indent: 2em;
    word-break: break-all;
    break-inside: avoid-column;
  }
}

.reader-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid rgba(128, 128, 128, 0.15);
  flex-shrink: 0;
  background: inherit;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border: 1px solid rgba(128, 128, 128, 0.25);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.2s;
  flex-shrink: 0;

  &:hover:not(:disabled) {
    background: rgba(128, 128, 128, 0.12);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.progress-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.progress-bar {
  width: 100%;
  height: 3px;
  background: rgba(128, 128, 128, 0.2);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary, #7dd3a8);
  border-radius: 2px;
  transition: width 0.3s;
}

.progress-text {
  font-size: 11px;
  opacity: 0.55;
}

// 目錄側欄
.toc-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 260px;
  height: 100%;
  background: var(--color-surface, #fff);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
  z-index: 20;
  display: flex;
  flex-direction: column;
  color: var(--color-text, #333);
}

.toc-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  font-weight: 600;
  font-size: 14px;
  border-bottom: 1px solid var(--color-border, #e0e0e0);

  span {
    flex: 1;
  }
}

.toc-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.toc-item {
  display: block;
  width: 100%;
  padding: 10px 16px;
  text-align: left;
  background: transparent;
  border: none;
  font-size: 13px;
  color: var(--color-text, #333);
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.05));
  }

  &.active {
    color: var(--color-primary, #7dd3a8);
    font-weight: 600;
    background: rgba(125, 211, 168, 0.1);
  }
}

// 設定面板
.settings-panel {
  position: absolute;
  bottom: 56px;
  left: 50%;
  transform: translateX(-50%);
  width: min(360px, 90vw);
  background: var(--color-surface, #fff);
  border-radius: 14px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.18);
  padding: 16px;
  z-index: 20;
  color: var(--color-text, #333);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-label {
  font-size: 13px;
  width: 60px;
  flex-shrink: 0;
  opacity: 0.7;
}

.settings-controls {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ctrl-btn {
  padding: 4px 10px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: var(--color-hover, rgba(0, 0, 0, 0.05));
  }
}

.ctrl-value {
  font-size: 13px;
  min-width: 40px;
  text-align: center;
}

.bg-presets {
  display: flex;
  gap: 8px;
}

.bg-preset-btn {
  padding: 5px 10px;
  border-radius: 6px;
  border: 2px solid transparent;
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.2s;

  &.active {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.overlay {
  position: absolute;
  inset: 0;
  z-index: 15;
}

// 動畫
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.25s ease;
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 角色選擇 Modal
.char-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.char-picker-modal {
  width: min(340px, 90vw);
  max-height: 70vh;
  background: var(--color-surface, #1e1e2e);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text, #e0e0e0);
}

.char-picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.char-picker-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.char-picker-empty {
  text-align: center;
  padding: 32px 16px;
  opacity: 0.5;
  font-size: 13px;
}

.char-picker-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.char-picker-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;

  &--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    background: rgba(255, 255, 255, 0.08);
  }
}

.char-picker-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.char-picker-name {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.char-picker-desc {
  font-size: 12px;
  opacity: 0.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 2px;
}
</style>
