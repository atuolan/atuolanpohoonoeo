<template>
  <div class="diary-view" role="dialog" aria-modal="true">
    <header class="diary-topbar">
      <button class="diary-icon-btn" type="button" aria-label="返回" @click="emit('close')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <h1 class="diary-title">{{ charName }} 的日記本</h1>
      <button class="diary-icon-btn" type="button" aria-label="匯出日記" @click="exportDiary">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      <button
        class="diary-icon-btn diary-fav"
        :class="{ 'is-on': diaryData.isFavorite }"
        type="button"
        :aria-label="diaryData.isFavorite ? '取消收藏' : '收藏日記'"
        :aria-pressed="diaryData.isFavorite ? 'true' : 'false'"
        @click="emit('toggle-favorite')"
      >
        <svg
          viewBox="0 0 24 24"
          :fill="diaryData.isFavorite ? 'currentColor' : 'none'"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
        </svg>
      </button>
    </header>

    <main class="diary-stage">
      <!-- 封面 -->
      <div v-if="showCover" class="diary-cover">
        <div class="diary-cover-book" :class="`paper--${book.paper}`" :style="paperVars">
          <div class="diary-cover-spine" aria-hidden="true"></div>
          <div
            v-if="book.tape !== 'none'"
            class="diary-tape diary-cover-tape"
            :class="`tape--${book.tape}`"
            aria-hidden="true"
          ></div>
          <div class="diary-cover-title">{{ coverTitle }}</div>
          <div v-if="book.coverNote" class="diary-cover-note">{{ book.coverNote }}</div>
          <DiarySticker
            v-if="coverSticker"
            class="diary-cover-sticker"
            :id="coverSticker"
            :size="46"
          />
        </div>
        <div class="diary-cover-foot">
          <p v-if="pageTotal" class="diary-cover-hint">共 {{ pageTotal }} 篇</p>
          <button class="diary-cover-open" type="button" @click="showCover = false">翻開</button>
        </div>
      </div>

      <!-- 內頁 -->
      <div v-else class="diary-page" :class="{ 'diary-page--memo': book.paper === 'memo' }">
        <div class="diary-paper" :class="`paper--${book.paper}`" :style="paperVars">
          <svg
            v-for="layer in grainLayers"
            :key="layer.id"
            class="diary-grain"
            :style="{ opacity: layer.opacity, mixBlendMode: layer.blend }"
            width="100%"
            height="100%"
            aria-hidden="true"
          >
            <filter :id="layer.id">
              <feTurbulence
                :type="layer.type"
                :baseFrequency="layer.baseFrequency"
                :numOctaves="layer.numOctaves"
                :seed="layer.seed"
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" :filter="'url(#' + layer.id + ')'" />
          </svg>

          <div
            v-if="book.tape !== 'none'"
            class="diary-tape"
            :class="`tape--${book.tape}`"
            aria-hidden="true"
          ></div>

          <div v-if="book.paper === 'binder'" class="diary-holes" aria-hidden="true">
            <span></span>
            <span></span>
            <span></span>
          </div>

          <div class="diary-book-page">
            <header class="diary-page-head">
              <div class="diary-page-date">{{ dateLabel }}</div>
              <div v-if="page && (page.weather || page.mood)" class="diary-page-meta">
                <span v-if="page.weather" class="diary-meta-item">
                  {{ weatherLabel }}：{{ page.weather }}
                </span>
                <span v-if="page.mood" class="diary-meta-item">
                  心情：{{ page.mood }}
                </span>
              </div>
            </header>

            <div class="diary-body" :class="{ 'is-scrawl': isScrawlHant }">
              <p v-for="(para, index) in paragraphs" :key="index" class="diary-para">
                <span
                  v-for="(segment, segIndex) in para.segments"
                  :key="segIndex"
                  :class="{
                    'diary-strike': segment.kind === 'strike',
                    'diary-mark': segment.kind === 'mark',
                  }"
                  >{{ segment.text }}</span
                >
                <span
                  v-for="(note, noteIndex) in para.margins"
                  :key="'m' + noteIndex"
                  class="diary-margin"
                  >（{{ note }}）</span
                >
              </p>
            </div>
          </div>

          <DiarySticker
            v-for="(sticker, index) in pageStickers"
            :key="sticker + index"
            class="diary-sticker"
            :class="index === 0 ? 'diary-sticker--right' : 'diary-sticker--left'"
            :id="sticker"
            :size="56"
          />
        </div>
      </div>
    </main>

    <footer class="diary-bottombar">
      <button
        class="diary-nav"
        type="button"
        aria-label="上一篇"
        :disabled="prevDisabled"
        @click="goPrev"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <div v-if="pageTotal" class="diary-pager">{{ pageIndex }} / {{ pageTotal }}</div>
      <button
        class="diary-nav"
        type="button"
        aria-label="下一篇"
        :disabled="nextDisabled"
        @click="goNext"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import type { DiaryData } from "@/types/diary";
import DiarySticker from "@/components/diary/DiarySticker.vue";
import {
  DEFAULT_DIARY_BOOK,
  detectChineseScript,
  diaryFontFamily,
  ensureDiaryFonts,
  resolveInk,
  splitDiaryContent,
  stripDiaryMarkup,
  type DiaryBook,
  type DiaryPaper,
  type DiaryStickerId,
} from "@/utils/diaryStyle";

const props = defineProps<{
  diaryData: DiaryData;
  charName: string;
  userName?: string;
  book?: DiaryBook | null;
  pageIndex?: number;
  pageTotal?: number;
}>();

const emit = defineEmits<{
  close: [];
  "toggle-favorite": [];
  prev: [];
  next: [];
}>();

interface GrainLayer {
  id: string;
  opacity: number;
  blend: "multiply" | "screen";
  type: "fractalNoise" | "turbulence";
  baseFrequency: string;
  numOctaves: number;
  seed?: number;
}

const grainPrefix = `dm-${useId()}`;

/** 紙紋參數照 Options.dc.html；一個紙張可以疊多層 */
const GRAIN_SPECS: Record<DiaryPaper, Omit<GrainLayer, "id">[]> = {
  lined: [
    { opacity: 0.16, blend: "multiply", type: "fractalNoise", baseFrequency: "0.85", numOctaves: 2 },
  ],
  grid: [
    { opacity: 0.12, blend: "multiply", type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2 },
  ],
  dot: [
    { opacity: 0.12, blend: "multiply", type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2 },
  ],
  plain: [
    { opacity: 0.22, blend: "multiply", type: "fractalNoise", baseFrequency: "0.75", numOctaves: 3 },
  ],
  memo: [
    { opacity: 0.14, blend: "multiply", type: "fractalNoise", baseFrequency: "0.85", numOctaves: 2 },
  ],
  letter: [
    { opacity: 0.18, blend: "multiply", type: "fractalNoise", baseFrequency: "0.7", numOctaves: 3 },
  ],
  binder: [
    { opacity: 0.1, blend: "multiply", type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2 },
  ],
  kraft: [
    {
      opacity: 0.35,
      blend: "multiply",
      type: "fractalNoise",
      baseFrequency: "0.02 0.7",
      numOctaves: 3,
    },
    { opacity: 0.2, blend: "multiply", type: "fractalNoise", baseFrequency: "0.9", numOctaves: 2 },
  ],
  watercolor: [
    { opacity: 0.2, blend: "multiply", type: "fractalNoise", baseFrequency: "0.04", numOctaves: 4 },
    { opacity: 0.18, blend: "multiply", type: "fractalNoise", baseFrequency: "0.6", numOctaves: 3 },
  ],
  washi: [
    {
      opacity: 0.28,
      blend: "multiply",
      type: "turbulence",
      baseFrequency: "0.035 0.12",
      numOctaves: 3,
      seed: 4,
    },
  ],
  aged: [
    {
      opacity: 0.3,
      blend: "multiply",
      type: "fractalNoise",
      baseFrequency: "0.025",
      numOctaves: 4,
      seed: 9,
    },
  ],
  black: [
    { opacity: 0.1, blend: "screen", type: "fractalNoise", baseFrequency: "0.8", numOctaves: 2 },
  ],
};

const showCover = ref(false);

const book = computed<DiaryBook>(() => props.book ?? DEFAULT_DIARY_BOOK);
const page = computed(() => props.diaryData.page);
const pageIndex = computed(() => props.pageIndex ?? 1);
const pageTotal = computed(() => props.pageTotal);
const hasBook = computed(() => Boolean(props.book));

const script = computed(() => detectChineseScript(props.diaryData.content));
const fontFamily = computed(() => diaryFontFamily(book.value.hand, script.value));
const ink = computed(() => resolveInk(book.value));
const isScrawlHant = computed(() => book.value.hand === "scrawl" && script.value === "hant");

const paperVars = computed(() => ({
  "--diary-ink": ink.value,
  "--diary-hand": fontFamily.value,
}));

const grainLayers = computed<GrainLayer[]>(() =>
  (GRAIN_SPECS[book.value.paper] ?? GRAIN_SPECS[DEFAULT_DIARY_BOOK.paper]).map((spec, index) => ({
    ...spec,
    id: `${grainPrefix}-grain-${index}`,
  })),
);

const paragraphs = computed(() => splitDiaryContent(props.diaryData.content));

const pageStickers = computed<DiaryStickerId[]>(() => (page.value?.stickers ?? []).slice(0, 2));

const coverSticker = computed(() => book.value.coverSticker);

const coverTitle = computed(() => book.value.cover?.trim() || `${props.charName} 的日記`);

const weatherLabel = computed(() => (script.value === "hans" ? "天气" : "天氣"));

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const dateLabel = computed(() => {
  const date = new Date(props.diaryData.createdAt);
  const monthDay = `${date.getMonth() + 1}月${date.getDate()}日`;
  const weekday = WEEKDAYS[date.getDay()] ?? "";
  return script.value === "hans" ? `${monthDay} 周${weekday}` : `${monthDay} 星期${weekday}`;
});

const prevDisabled = computed(
  () =>
    showCover.value ||
    pageTotal.value === undefined ||
    (pageIndex.value <= 1 && !hasBook.value),
);

const nextDisabled = computed(
  () =>
    pageTotal.value === undefined ||
    (!showCover.value && pageIndex.value >= (pageTotal.value ?? 1)),
);

function goPrev() {
  if (prevDisabled.value) return;
  if (pageIndex.value <= 1 && hasBook.value) {
    showCover.value = true;
    return;
  }
  emit("prev");
}

function goNext() {
  if (nextDisabled.value) return;
  if (showCover.value) {
    showCover.value = false;
    return;
  }
  emit("next");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function exportDiary() {
  const text = `【${props.charName} 的日記】
時間：${formatDateTime(props.diaryData.createdAt)}

${stripDiaryMarkup(props.diaryData.content)}

---
${props.charName} 對 ${props.userName || "user"} 的想法
基於最近 ${props.diaryData.messageCount} 條對話生成
`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${props.charName}_日記_${new Date(props.diaryData.createdAt).toLocaleDateString()}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

watch(
  () => props.diaryData.id,
  () => {
    showCover.value = false;
  },
);

onMounted(() => {
  ensureDiaryFonts();
});
</script>

<style lang="scss" scoped>
.diary-view {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f6f1ea;
  color: #2b2622;
  font-family: system-ui, "PingFang TC", "Noto Sans TC", sans-serif;
}

/* ===== 頂欄 ===== */
.diary-topbar {
  flex-shrink: 0;
  height: 56px;
  margin-top: var(--safe-area-inset-top, env(safe-area-inset-top));
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
}

.diary-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: #2b2622;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diary-icon-btn {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: none;
  color: #2b2622;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  svg {
    width: 22px;
    height: 22px;
  }

  &:active {
    background: rgba(0, 0, 0, 0.06);
  }
}

.diary-fav {
  color: #b8aea4;

  &.is-on {
    color: #d99a00;
  }
}

/* ===== 中間舞台 ===== */
.diary-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 8px 16px 0;
}

.diary-page {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;

  &.diary-page--memo {
    filter: drop-shadow(0 4px 8px rgba(120, 60, 80, 0.18));
  }
}

/* ===== 紙張 ===== */
.diary-paper {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.08),
    0 10px 24px rgba(120, 60, 80, 0.14);
  color: var(--diary-ink, #1d2126);
  font-family: var(--diary-hand, inherit);
}

.paper--lined {
  --diary-rule: #cdd7e3;
  background-color: #fffdf8;
}

.paper--grid {
  background-color: #ffffff;
  background-image:
    linear-gradient(to right, #dfe4ea 1px, transparent 1px),
    linear-gradient(to bottom, #dfe4ea 1px, transparent 1px);
  background-size: 16px 16px;
}

.paper--dot {
  background-color: #fffefa;
  background-image: radial-gradient(circle, #c3c8cf 1px, transparent 1.4px);
  background-size: 16px 16px;
}

.paper--plain {
  background: #fbf8f1;
}

.paper--memo {
  box-shadow: none;
  border-radius: 0;
  --diary-rule: #f6c6d5;
  background-color: #ffeef3;
  background-image: linear-gradient(to bottom, #ffdce7 0, #ffdce7 24px, transparent 24px);
  clip-path: polygon(
    0 0,
    100% 0,
    100% 93%,
    95% 97%,
    90% 93%,
    85% 98%,
    80% 94%,
    75% 98%,
    70% 93%,
    65% 97%,
    60% 94%,
    55% 98%,
    50% 93%,
    45% 97%,
    40% 94%,
    35% 98%,
    30% 93%,
    25% 97%,
    20% 94%,
    15% 98%,
    10% 93%,
    5% 97%,
    0 94%
  );
}

.paper--letter {
  --diary-rule: #e3d6bb;
  background-color: #fbf6ea;
  background-image:
    linear-gradient(
      to right,
      transparent 26px,
      #e7a0a0 26px,
      #e7a0a0 27px,
      transparent 27px,
      transparent 30px,
      #e7a0a0 30px,
      #e7a0a0 31px,
      transparent 31px
    );
}

.paper--binder {
  --diary-rule: #bfd3ea;
  background-color: #ffffff;
  background-image: linear-gradient(
    to right,
    transparent 40px,
    #f0a9a9 40px,
    #f0a9a9 41px,
    transparent 41px
  );
}

.paper--kraft {
  background: #c9a676;
}

.paper--watercolor {
  background-color: #fdfbf6;
  background-image:
    radial-gradient(ellipse at 28% 34%, rgba(150, 195, 230, 0.38), transparent 58%),
    radial-gradient(ellipse at 78% 74%, rgba(245, 180, 195, 0.32), transparent 55%);
}

.paper--washi {
  background: #f4eee1;
}

.paper--aged {
  --diary-rule: rgba(150, 120, 80, 0.3);
  background-color: #ead8b0;
  background-image: radial-gradient(ellipse at center, transparent 50%, rgba(130, 90, 30, 0.32) 100%);
}

.paper--black {
  background: #25272d;
}

// 有橫線的紙：線畫在內頁上、跟著內文捲動，間距等於行高 34px，字才會寫在線上
.paper--lined,
.paper--memo,
.paper--letter,
.paper--binder,
.paper--aged {
  .diary-book-page {
    background-image: linear-gradient(to bottom, transparent 33px, var(--diary-rule) 33px);
    background-size: 100% 34px;
    background-position: 0 26px;
    background-repeat: repeat-y;
    background-attachment: local;
  }
}

// 黑卡紙：黃色螢光筆蓋在金字上看不見，改淡白；頁邊小字調亮
.paper--black {
  .diary-mark {
    background: linear-gradient(transparent 55%, rgba(255, 255, 255, 0.2) 55%);
  }

  .diary-margin {
    color: #c3bdf0;
  }
}

.paper--binder .diary-book-page {
  padding-left: 52px;
}

.paper--letter .diary-book-page {
  padding-left: 42px;
}

.diary-grain {
  position: absolute;
  inset: 0;
  display: block;
  pointer-events: none;
  border-radius: inherit;
}

/* ===== 紙膠帶 ===== */
.diary-tape {
  position: absolute;
  top: -12px;
  left: 50%;
  width: 130px;
  height: 28px;
  transform: translateX(-50%) rotate(-3deg);
  box-shadow: inset 0 0 0 100px rgba(255, 255, 255, 0.08);
  clip-path: polygon(
    2% 0,
    98% 0,
    100% 20%,
    98% 40%,
    100% 60%,
    98% 80%,
    100% 100%,
    2% 100%,
    0 80%,
    2% 60%,
    0 40%,
    2% 20%
  );
  pointer-events: none;
  z-index: 3;
}

.tape--yellow {
  background: rgba(255, 224, 130, 0.85);
}

.tape--mint {
  background: repeating-linear-gradient(
    45deg,
    rgba(150, 215, 195, 0.88) 0,
    rgba(150, 215, 195, 0.88) 7px,
    rgba(220, 244, 236, 0.88) 7px,
    rgba(220, 244, 236, 0.88) 14px
  );
}

.tape--pink-dot {
  background:
    radial-gradient(circle, #ff9fb8 2.2px, transparent 2.7px) 0 0 / 12px 12px,
    rgba(255, 228, 236, 0.9);
}

.tape--blue-check {
  background:
    linear-gradient(rgba(110, 150, 215, 0.35) 50%, transparent 50%) 0 0 / 12px 12px,
    linear-gradient(90deg, rgba(110, 150, 215, 0.35) 50%, transparent 50%) 0 0 / 12px 12px,
    rgba(228, 238, 250, 0.9);
}

.tape--gold-dot {
  background:
    radial-gradient(circle, #d9a53a 1.6px, transparent 2.1px) 0 0 / 10px 10px,
    radial-gradient(circle, #d9a53a 1px, transparent 1.4px) 5px 5px / 10px 10px,
    rgba(250, 240, 218, 0.92);
}

.tape--kraft {
  background:
    repeating-linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.05) 0,
      rgba(0, 0, 0, 0.05) 1px,
      transparent 1px,
      transparent 4px
    ),
    #c9a676;
}

/* ===== 活頁紙的孔 ===== */
.diary-holes {
  position: absolute;
  top: 26px;
  left: 12px;
  display: flex;
  flex-direction: column;
  gap: 43px;
  pointer-events: none;
  z-index: 2;

  span {
    width: 14px;
    height: 14px;
    border-radius: 7px;
    background: #faf8f5;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
  }
}

/* ===== 內頁 ===== */
.diary-book-page {
  position: relative;
  flex: 1;
  min-height: 0;
  padding: 26px 26px 90px;
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: inherit;
  -webkit-overflow-scrolling: touch;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.14);
    border-radius: 2px;
  }
}

.diary-page-head {
  margin-bottom: 0;
}

.diary-page-date {
  height: 34px;
  font-size: 20px;
  line-height: 34px;
}

.diary-page-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  min-height: 34px;
  font-size: 15px;
  line-height: 34px;
  opacity: 0.82;
}

.diary-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;

  svg {
    flex-shrink: 0;
  }
}

.diary-body {
  margin-top: 0;
  font-size: 19px;
  line-height: 34px;
  word-break: break-word;

  // 繁體潦草沒有行書字型：每個字斜寫（整塊 skew 會讓第一行看起來縮排）
  &.is-scrawl {
    font-style: oblique 10deg;
  }
}

.diary-para {
  margin: 0;
  white-space: pre-wrap;
}

.diary-strike {
  text-decoration: line-through;
  text-decoration-thickness: 2px;
  text-decoration-color: currentColor;
  opacity: 0.75;
}

.diary-mark {
  background: linear-gradient(transparent 45%, rgba(255, 214, 102, 0.75) 45%);
  padding: 0 2px;
}

.diary-margin {
  // 頁邊小字：段落下方靠右、可換行，最長 20 字也不會超出紙張
  display: block;
  width: fit-content;
  max-width: 72%;
  margin: 0 4px 0 auto;
  font-size: 14px;
  line-height: 34px;
  color: #6f6a9e;
  text-align: right;
  transform: rotate(4deg);
  transform-origin: right center;
}

.diary-sticker {
  position: absolute;
  z-index: 4;
  pointer-events: none;
}

.diary-sticker--right {
  right: 16px;
  bottom: 32px;
  transform: rotate(10deg);
}

.diary-sticker--left {
  left: 24px;
  bottom: 32px;
  transform: rotate(-8deg);
}

/* ===== 封面 ===== */
.diary-cover {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-bottom: 8px;
}

.diary-cover-book {
  position: relative;
  width: min(280px, 100%);
  height: min(400px, 62vh);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 64px 28px 28px;
  box-sizing: border-box;
  border-radius: 6px 16px 16px 6px;
  box-shadow:
    0 1px 0 rgba(0, 0, 0, 0.08),
    0 14px 30px rgba(120, 60, 80, 0.18);
  color: var(--diary-ink, #1d2126);
  font-family: var(--diary-hand, inherit);
}

.diary-cover-spine {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 18px;
  border-radius: 6px 0 0 6px;
  background: rgba(0, 0, 0, 0.09);
  z-index: 1;
}

.paper--black .diary-cover-spine {
  background: rgba(255, 255, 255, 0.12);
}

.diary-cover-tape {
  top: -12px;
  left: 54px;
  width: 92px;
  height: 26px;
  transform: rotate(-6deg);
}

.diary-cover-title {
  position: relative;
  z-index: 2;
  max-width: 100%;
  font-size: clamp(24px, 7vw, 38px);
  line-height: 1.2;
  text-align: center;
  word-break: break-word;
  transform: rotate(-4deg);
}

.diary-cover-note {
  position: relative;
  z-index: 2;
  margin-top: 18px;
  font-size: 17px;
  line-height: 1.6;
  text-align: center;
  white-space: pre-wrap;
  opacity: 0.78;
}

.diary-cover-sticker {
  position: absolute;
  right: 18px;
  bottom: 22px;
  transform: rotate(14deg);
  z-index: 2;
}

.diary-cover-foot {
  width: min(280px, 100%);
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

.diary-cover-hint {
  margin: 0;
  font-size: 13px;
  color: #6b625a;
}

.diary-cover-open {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 24px;
  background: #b0336b;
  color: #ffffff;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:active {
    transform: scale(0.99);
  }
}

/* ===== 底欄 ===== */
.diary-bottombar {
  flex-shrink: 0;
  box-sizing: border-box;
  height: 92px;
  padding-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}

.diary-nav {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid #ddd2c6;
  border-radius: 22px;
  background: #ffffff;
  color: #2b2622;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  svg {
    width: 20px;
    height: 20px;
  }

  &:disabled {
    color: #b8aea4;
    cursor: default;
  }

  &:active:not(:disabled) {
    background: #f4efe8;
  }
}

.diary-pager {
  min-width: 60px;
  text-align: center;
  font-size: 14px;
  color: #6b625a;
}

@media (max-height: 640px) {
  .diary-cover-book {
    height: min(340px, 58vh);
    padding-top: 48px;
  }

  .diary-cover-title {
    font-size: clamp(22px, 6vw, 32px);
  }
}
</style>

<style lang="scss">
// 夜晚模式：紙張保留原本的樣子只調暗一點，四周和按鈕換深色
body.is-night-mode .diary-view {
  background: #1d1b19;
  color: #e8e2da;
}

body.is-night-mode .diary-paper,
body.is-night-mode .diary-cover-book {
  filter: brightness(0.86);
}

body.is-night-mode .diary-title,
body.is-night-mode .diary-icon-btn {
  color: #e8e2da;
}

body.is-night-mode .diary-pager,
body.is-night-mode .diary-cover-hint {
  color: #a9a196;
}

body.is-night-mode .diary-nav {
  background: #2c2926;
  border-color: #45403a;
  color: #e8e2da;

  &:disabled {
    color: #5e5850;
  }
}
</style>
