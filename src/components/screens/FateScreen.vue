<script setup lang="ts">
/**
 * 命運占卜主畫面
 * 支援：塔羅牌、占星骰子、雷諾曼牌、神諭卡
 */
import FateCard from "@/components/common/FateCard.vue";
import AstroDicePanel from "@/components/fate/AstroDicePanel.vue";
import LenormandPanel from "@/components/fate/LenormandPanel.vue";
import OraclePanel from "@/components/fate/OraclePanel.vue";
import { fateSpreads } from "@/data/fateSpreads";
import { useAstroDiceStore } from "@/stores/astroDice";
import { useFateStore } from "@/stores/fate";
import { useOracleStore } from "@/stores/oracle";
import type { AstroDiceReading } from "@/types/astroDice";
import type { FateReading, FateSpread } from "@/types/fate";
import { marked } from "marked";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{ back: [] }>();
const fateStore = useFateStore();
const astroDiceStore = useAstroDiceStore();
const oracleStore = useOracleStore();

// ===== 占卜類型選擇 =====
type DivinationType = "home" | "tarot" | "astroDice" | "lenormand" | "oracle";
const currentDivination = ref<DivinationType>("home");

// ===== 牌陣篩選 =====
const spreadFilterCount = ref(-1);
const expandedSpreadId = ref<string | null>(null);

const spreadCountOptions = computed(() => {
  const counts = [...new Set(fateSpreads.map((s) => s.positions.length))].sort(
    (a, b) => a - b,
  );
  return counts;
});

const filteredSpreads = computed(() => {
  if (spreadFilterCount.value === -1) return fateSpreads;
  return fateSpreads.filter(
    (s) => s.positions.length === spreadFilterCount.value,
  );
});

function selectSpread(s: FateSpread) {
  fateStore.spread = s;
  expandedSpreadId.value = expandedSpreadId.value === s.id ? null : s.id;
}

// ===== 歷史記錄 =====
const showHistory = ref(false);

// 展開查看完整解讀
type ExpandedReading =
  | { type: "tarot"; reading: FateReading }
  | { type: "astro"; reading: AstroDiceReading }
  | null;
const expandedReading = ref<ExpandedReading>(null);

const expandedInterpretationHtml = computed(() => {
  if (!expandedReading.value?.reading.interpretation) return "";
  return marked.parse(expandedReading.value.reading.interpretation, {
    async: false,
  }) as string;
});

function openReading(type: "tarot", reading: FateReading): void;
function openReading(type: "astro", reading: AstroDiceReading): void;
function openReading(
  type: "tarot" | "astro",
  reading: FateReading | AstroDiceReading,
) {
  expandedReading.value = { type, reading } as ExpandedReading;
}

function closeExpandedReading() {
  expandedReading.value = null;
}

// 合併兩種歷史，按時間排序
const allReadings = computed(() => {
  const tarot = fateStore.readings.map((r) => ({
    type: "tarot" as const,
    reading: r,
    createdAt: r.createdAt,
  }));
  const astro = astroDiceStore.readings.map((r) => ({
    type: "astro" as const,
    reading: r,
    createdAt: r.createdAt,
  }));
  return [...tarot, ...astro].sort((a, b) => b.createdAt - a.createdAt);
});

// ===== 洗牌邏輯 =====
const isShuffling = ref(false);
const shuffleCount = ref(0);

// 雙擊偵測
let lastTapTime = 0;
const DOUBLE_TAP_MS = 350;

function handleDeckTap() {
  const now = Date.now();
  const isDouble = now - lastTapTime < DOUBLE_TAP_MS;
  lastTapTime = now;

  if (isDouble) {
    // 雙擊：重置洗牌次數並重新洗
    shuffleCount.value = 0;
    triggerShuffle();
  } else {
    triggerShuffle();
  }
}

function triggerShuffle() {
  if (isShuffling.value) return;
  isShuffling.value = true;
  setTimeout(() => {
    fateStore.shuffleOnly();
    shuffleCount.value++;
    isShuffling.value = false;
  }, 1400);
}

function confirmShuffle() {
  fateStore.confirmShuffle();
}

// ===== 扇形選牌拖拽邏輯 =====
const fanOffset = ref(0);
let fanTarget = 0;
let fanVelocity = 0;
let isFanDragging = false;
let lastFanX = 0;
let startFanX = 0;
let startFanY = 0;
let fanAnimId: number | null = null;
let fanPointerDown = false;
let fanDirDetermined = false;
let fanIsHorizontal = false;
const FAN_DIR_THRESHOLD = 8;
const CARD_ANGLE_STEP = 3.2;
const FAN_VISIBLE_ANGLE = 50;

function getFanCardStyle(index: number) {
  const total = fateStore.shuffledDeck.length;
  const centerIdx = Math.floor(total / 2);
  const baseAngle = (index - centerIdx) * CARD_ANGLE_STEP + fanOffset.value;
  const isVisible = Math.abs(baseAngle) <= FAN_VISIBLE_ANGLE;
  const isPicked = fateStore.pickedIndices.has(index);
  return {
    transform: `rotate(${baseAngle}deg)`,
    opacity: isPicked ? 0 : isVisible ? 1 : 0,
    pointerEvents:
      isVisible && !isPicked ? "auto" : ("none" as "auto" | "none"),
    transition: isPicked ? "opacity 0.4s ease, transform 0.4s ease" : "none",
  };
}

function onFanPointerDown(e: MouseEvent | TouchEvent) {
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  startFanX = clientX;
  startFanY = clientY;
  lastFanX = clientX;
  fanVelocity = 0;
  fanPointerDown = true;
  fanDirDetermined = false;
  fanIsHorizontal = false;
  isFanDragging = false;
}

function onFanPointerMove(e: MouseEvent | TouchEvent) {
  if (!fanPointerDown) return;
  const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
  const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
  const dx = clientX - startFanX;
  const dy = clientY - startFanY;
  if (!fanDirDetermined) {
    if (Math.abs(dx) > FAN_DIR_THRESHOLD || Math.abs(dy) > FAN_DIR_THRESHOLD) {
      fanDirDetermined = true;
      fanIsHorizontal = Math.abs(dx) > Math.abs(dy);
      isFanDragging = fanIsHorizontal;
    }
    return;
  }
  if (!fanIsHorizontal || !isFanDragging) return;
  const moveDx = clientX - lastFanX;
  fanVelocity = moveDx * 0.15;
  const total = fateStore.shuffledDeck.length;
  const maxOff = (total / 2) * CARD_ANGLE_STEP;
  const proposed = fanTarget + fanVelocity;
  if (Math.abs(proposed) > maxOff) fanVelocity *= 0.3;
  fanTarget += fanVelocity;
  fanOffset.value = fanTarget;
  lastFanX = clientX;
}

function onFanPointerUp() {
  fanPointerDown = false;
  if (isFanDragging && Math.abs(fanVelocity) > 0.1) startFanAnim();
  isFanDragging = false;
  fanDirDetermined = false;
  fanIsHorizontal = false;
}

function animateFan() {
  if (!isFanDragging && !fanPointerDown) {
    fanVelocity *= 0.85;
    if (Math.abs(fanVelocity) > 0.01) fanTarget += fanVelocity;
    const total = fateStore.shuffledDeck.length;
    const maxOff = (total / 2) * CARD_ANGLE_STEP;
    if (fanTarget > maxOff) {
      fanTarget = maxOff + (fanTarget - maxOff) * 0.85;
      fanVelocity *= 0.5;
    } else if (fanTarget < -maxOff) {
      fanTarget = -maxOff + (fanTarget + maxOff) * 0.85;
      fanVelocity *= 0.5;
    }
    const diff = fanTarget - fanOffset.value;
    fanOffset.value += diff * 0.18;
    if (Math.abs(fanVelocity) < 0.01 && Math.abs(diff) < 0.1) {
      fanOffset.value = Math.max(-maxOff, Math.min(maxOff, fanOffset.value));
      fanTarget = fanOffset.value;
      fanAnimId = null;
      return;
    }
  }
  fanAnimId = requestAnimationFrame(animateFan);
}

function startFanAnim() {
  if (fanAnimId === null) animateFan();
}

function handleCardClick(index: number) {
  if (index === fateStore.revealedCount) fateStore.revealNextCard();
}

// ===== 解讀 =====
const interpretationHtml = computed(() => {
  if (!fateStore.interpretation) return "";
  const raw = fateStore.isInterpreting
    ? fateStore.interpretation + "▌"
    : fateStore.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function handleDeleteReading(type: "tarot" | "astro", id: string) {
  if (confirm("確定要刪除這條記錄嗎？")) {
    if (type === "tarot") fateStore.deleteReading(id);
    else astroDiceStore.deleteReading(id);
  }
}

function handleClearHistory() {
  if (confirm("確定要清空所有歷史記錄嗎？此操作不可撤銷。")) {
    fateStore.clearHistory();
    astroDiceStore.clearHistory();
  }
}

// ===== 返回邏輯 =====
function handleBack() {
  if (expandedReading.value) {
    expandedReading.value = null;
    return;
  }
  if (showHistory.value) {
    showHistory.value = false;
    return;
  }
  // 如果在子占卜類型中，返回首頁
  if (currentDivination.value !== "home") {
    // 塔羅牌的返回邏輯
    if (currentDivination.value === "tarot") {
      if (fateStore.phase === "setup") {
        currentDivination.value = "home";
        fateStore.goToPhase("home");
        return;
      }
      if (fateStore.phase === "shuffle") {
        fateStore.goToPhase("setup");
        shuffleCount.value = 0;
        return;
      }
      if (fateStore.phase === "pick") {
        fateStore.goToPhase("shuffle");
        return;
      }
      if (
        fateStore.phase === "draw" ||
        fateStore.phase === "reveal" ||
        fateStore.phase === "interpret"
      ) {
        fateStore.reset();
        currentDivination.value = "home";
        return;
      }
    }
    // 占星骰子和雷諾曼：返回首頁
    if (currentDivination.value === "astroDice") astroDiceStore.reset();
    // 神諭卡：根據當前階段決定返回邏輯
    if (currentDivination.value === "oracle") {
      if (oracleStore.phase !== "home") {
        oracleStore.reset();
        return;
      }
    }
    currentDivination.value = "home";
    return;
  }
  // 在首頁，返回上一層
  emit("back");
}

// ===== 選擇占卜類型 =====
function selectDivination(type: DivinationType) {
  currentDivination.value = type;
  if (type === "tarot") {
    fateStore.goToPhase("setup");
  }
  if (type === "oracle") {
    oracleStore.goToPhase("home");
  }
}

// ===== 從占星骰子返回 =====
function handleAstroDiceBack() {
  currentDivination.value = "home";
}

// ===== 從雷諾曼牌返回 =====
function handleLenormandBack() {
  currentDivination.value = "home";
}

onMounted(() => {
  if (!fateStore.isHistoryLoaded) fateStore.loadHistory();
  if (!astroDiceStore.isHistoryLoaded) astroDiceStore.loadHistory();
  if (!oracleStore.isHistoryLoaded) oracleStore.loadHistory();
  window.addEventListener("mousemove", onFanPointerMove);
  window.addEventListener("mouseup", onFanPointerUp);
  window.addEventListener("touchmove", onFanPointerMove, { passive: true });
  window.addEventListener("touchend", onFanPointerUp);
});

onUnmounted(() => {
  if (fanAnimId) cancelAnimationFrame(fanAnimId);
  window.removeEventListener("mousemove", onFanPointerMove);
  window.removeEventListener("mouseup", onFanPointerUp);
  window.removeEventListener("touchmove", onFanPointerMove);
  window.removeEventListener("touchend", onFanPointerUp);
});
</script>

<template>
  <div class="fate-screen">
    <!-- 頂部導航 -->
    <header class="fate-header">
      <button class="fate-header__back" @click="handleBack">
        ←
        {{
          expandedReading
            ? "返回"
            : showHistory
              ? "返回"
              : currentDivination === "home"
                ? "返回"
                : "上一步"
        }}
      </button>
      <h1 class="fate-header__title">
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="vertical-align: text-bottom; margin-right: 4px; color: #c084fc"
        >
          <circle cx="12" cy="11" r="8" />
          <path d="M7 21h10" />
          <path d="M4 17h16" />
          <path d="m11 17-2 4" />
          <path d="m13 17 2 4" />
        </svg>
        Fate
      </h1>
      <button class="fate-header__history" @click="showHistory = !showHistory">
        {{ showHistory ? "占卜" : "歷史" }}
      </button>
    </header>

    <!-- 歷史記錄面板 -->
    <div v-if="showHistory" class="fate-history">
      <!-- 展開查看完整解讀 -->
      <div v-if="expandedReading" class="fate-history__detail">
        <div class="fate-history__detail-header">
          <button
            class="fate-history__detail-back"
            @click="closeExpandedReading"
          >
            ← 返回
          </button>
          <span class="fate-history__detail-type">
            {{
              expandedReading.type === "tarot" ? "🃏 塔羅占卜" : "🎲 占星骰子"
            }}
          </span>
        </div>
        <div class="fate-history__detail-question">
          {{ expandedReading.reading.question || "未記錄問題" }}
        </div>

        <!-- 塔羅牌詳情 -->
        <template v-if="expandedReading.type === 'tarot'">
          <div class="fate-history__detail-meta">
            {{ (expandedReading.reading as any).spread.nameCn }} ·
            {{ (expandedReading.reading as any).drawnCards.length }} 張牌
          </div>
          <div class="fate-history__detail-cards">
            <span
              v-for="drawn in (expandedReading.reading as any).drawnCards"
              :key="drawn.position.id"
              class="fate-history__item-card-tag"
            >
              {{ drawn.card.nameCn }}{{ drawn.isReversed ? "(逆)" : "" }}
            </span>
          </div>
        </template>

        <!-- 占星骰子詳情 -->
        <template v-else>
          <div class="fate-history__detail-dice">
            <span class="fate-history__detail-die">
              {{ (expandedReading.reading as any).result.planet.symbol }}
              {{ (expandedReading.reading as any).result.planet.nameCn }}
            </span>
            <span class="fate-history__detail-plus">+</span>
            <span class="fate-history__detail-die">
              {{ (expandedReading.reading as any).result.sign.symbol }}
              {{ (expandedReading.reading as any).result.sign.nameCn }}
            </span>
            <span class="fate-history__detail-plus">+</span>
            <span class="fate-history__detail-die">
              {{ (expandedReading.reading as any).result.house.romanNumeral }}
              {{ (expandedReading.reading as any).result.house.nameCn }}
            </span>
          </div>
        </template>

        <div class="fate-history__detail-interpretation">
          <div
            v-if="expandedInterpretationHtml"
            class="fate-interpretation__content"
            v-html="expandedInterpretationHtml"
          />
          <p v-else class="fate-history__detail-empty">無解讀記錄</p>
        </div>
      </div>

      <!-- 歷史列表 -->
      <template v-else>
        <div class="fate-history__header">
          <h2>占卜歷史</h2>
          <button
            v-if="allReadings.length > 0"
            class="fate-history__clear"
            @click="handleClearHistory"
          >
            清空全部
          </button>
        </div>
        <div v-if="allReadings.length === 0" class="fate-history__empty">
          <div class="fate-history__empty-icon">
            <svg
              viewBox="0 0 24 24"
              width="1em"
              height="1em"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              <circle cx="5" cy="8" r="1" />
              <circle cx="4" cy="15" r="1" />
            </svg>
          </div>
          <p>尚無占卜記錄</p>
        </div>
        <div v-else class="fate-history__list">
          <div
            v-for="item in allReadings"
            :key="item.reading.id"
            class="fate-history__item fate-history__item--clickable"
            @click="item.type === 'tarot' ? openReading('tarot', item.reading as any) : openReading('astro', item.reading as any)"
          >
            <div class="fate-history__item-time">
              <span class="fate-history__item-badge">
                {{ item.type === "tarot" ? "🃏" : "🎲" }}
              </span>
              {{ formatTime(item.reading.createdAt) }}
            </div>
            <div class="fate-history__item-question">
              {{ item.reading.question || "未記錄問題" }}
            </div>

            <!-- 塔羅牌摘要 -->
            <template v-if="item.type === 'tarot'">
              <div class="fate-history__item-meta">
                {{ (item.reading as any).spread.nameCn }} ·
                {{ (item.reading as any).drawnCards.length }} 張牌
              </div>
              <div class="fate-history__item-cards">
                <span
                  v-for="drawn in (item.reading as any).drawnCards"
                  :key="drawn.position.id"
                  class="fate-history__item-card-tag"
                >
                  {{ drawn.card.nameCn }}{{ drawn.isReversed ? "(逆)" : "" }}
                </span>
              </div>
            </template>

            <!-- 占星骰子摘要 -->
            <template v-else>
              <div class="fate-history__item-meta fate-history__item-dice">
                <span
                  >{{ (item.reading as any).result.planet.symbol }}
                  {{ (item.reading as any).result.planet.nameCn }}</span
                >
                <span class="fate-history__item-dice-sep">+</span>
                <span
                  >{{ (item.reading as any).result.sign.symbol }}
                  {{ (item.reading as any).result.sign.nameCn }}</span
                >
                <span class="fate-history__item-dice-sep">+</span>
                <span
                  >{{ (item.reading as any).result.house.romanNumeral }}
                  {{ (item.reading as any).result.house.nameCn }}</span
                >
              </div>
            </template>

            <div
              v-if="item.reading.interpretation"
              class="fate-history__item-preview"
            >
              {{ item.reading.interpretation.substring(0, 80) }}...
            </div>
            <div class="fate-history__item-footer">
              <span class="fate-history__item-hint">點擊查看完整解讀 →</span>
              <button
                class="fate-history__item-delete"
                @click.stop="handleDeleteReading(item.type, item.reading.id)"
              >
                刪除
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 占卜流程 -->
    <div v-else class="fate-content">
      <!-- ══ 入口：選擇占卜類型 ══ -->
      <div
        v-if="currentDivination === 'home'"
        class="fate-phase fate-phase--home"
      >
        <!-- 魔幻相框裝飾 -->
        <div class="fate-home-frame">
          <div class="fate-home-frame__arch"></div>
          <div class="fate-home-frame__moon"></div>

          <div class="fate-home-frame__star fate-home-frame__star--tl">
            <svg class="svg-star" viewBox="0 0 24 24">
              <path
                d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z"
              />
            </svg>
          </div>
          <div class="fate-home-frame__star fate-home-frame__star--tr">
            <svg class="svg-star" viewBox="0 0 24 24">
              <path
                d="M12 0L14.5 9.5L24 12L14.5 14.5L12 24L9.5 14.5L0 12L9.5 9.5Z"
              />
            </svg>
          </div>

          <div class="fate-home-frame__ring fate-home-frame__ring--l"></div>
          <div class="fate-home-frame__ring fate-home-frame__ring--r"></div>
          <div
            class="fate-home-frame__bottom-deco fate-home-frame__bottom-deco--l"
          ></div>
          <div
            class="fate-home-frame__bottom-deco fate-home-frame__bottom-deco--r"
          ></div>
        </div>

        <div class="fate-home__hero">
          <div class="fate-home__orb">
            <svg
              class="fate-home__orb-svg"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="80"
              height="80"
              style="display: block; margin: 0 auto"
            >
              <defs>
                <radialGradient id="orb-grad" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stop-color="#ffdfa3" />
                  <stop offset="40%" stop-color="#f28b82" />
                  <stop offset="80%" stop-color="#c084fc" />
                  <stop offset="100%" stop-color="rgba(192, 132, 252, 0)" />
                </radialGradient>
                <radialGradient id="orb-core" cx="40%" cy="30%" r="40%">
                  <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
                  <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
                </radialGradient>
              </defs>
              <circle cx="50" cy="46" r="36" fill="url(#orb-grad)" />
              <circle cx="50" cy="46" r="36" fill="url(#orb-core)" />
              <path
                d="M24 86 C 36 78, 64 78, 76 86 L 82 94 C 70 98, 30 98, 18 94 Z"
                fill="#282c4a"
                stroke="#c084fc"
                stroke-width="2"
              />
              <path
                d="M30 82 C 40 78, 60 78, 70 82 L 76 86 C 60 88, 40 88, 24 86 Z"
                fill="#1e2236"
              />
              <path
                d="M40 25 L42 32 L49 34 L42 36 L40 43 L38 36 L31 34 L38 32 Z"
                fill="#ffdfa3"
              />
              <path
                d="M60 50 L61 54 L65 55 L61 56 L60 60 L59 56 L55 55 L59 54 Z"
                fill="#ffffff"
              />
              <path
                d="M50 20 L51 22 L53 23 L51 24 L50 26 L49 24 L47 23 L49 22 Z"
                fill="#ffffff"
              />
            </svg>
          </div>
          <h2 class="fate-home__title">命運之門</h2>
          <p class="fate-home__subtitle">選擇你的占卜方式</p>
        </div>
        <div class="fate-orbit-menu">
          <!-- 背景星軌連線 -->
          <svg
            class="fate-orbit-menu__path"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path
              d="M -10 90 Q 50 -20 110 90"
              fill="none"
              stroke="rgba(192, 132, 252, 0.4)"
              stroke-width="1.5"
              stroke-dasharray="4 6"
            />
          </svg>

          <!-- 節點 1: 塔羅 -->
          <button
            class="fate-orbit-node fate-orbit-node--active"
            style="left: 20%; top: 52%"
            @click="selectDivination('tarot')"
          >
            <div class="fate-orbit-node__core">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <circle cx="12" cy="12" r="4" />
                <path d="M12 8v8" />
                <path d="M8 12h8" />
                <path d="m9.17 9.17 5.66 5.66" />
                <path d="m14.83 9.17-5.66 5.66" />
              </svg>
            </div>
            <div class="fate-orbit-node__label">塔羅占卜</div>
          </button>

          <!-- 節點 2: 占星骰子 -->
          <button
            class="fate-orbit-node fate-orbit-node--active"
            style="left: 50%; top: 20%"
            @click="selectDivination('astroDice')"
          >
            <div class="fate-orbit-node__core">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="15.5"
                  cy="8.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="8.5"
                  cy="15.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
                <circle
                  cx="15.5"
                  cy="15.5"
                  r="1.5"
                  fill="currentColor"
                  stroke="none"
                />
              </svg>
            </div>
            <div class="fate-orbit-node__label">占星骰子</div>
          </button>

          <!-- 節點 3: 雷諾曼牌 -->
          <button
            class="fate-orbit-node fate-orbit-node--active"
            style="left: 80%; top: 52%"
            @click="selectDivination('lenormand')"
          >
            <div class="fate-orbit-node__core">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
                <!-- 幸運草 (雷諾曼象徵) -->
                <circle cx="12" cy="9" r="2" />
                <circle cx="9.5" cy="12" r="2" />
                <circle cx="14.5" cy="12" r="2" />
                <circle cx="12" cy="15" r="2" />
                <path d="M12 12v6" />
              </svg>
            </div>
            <div class="fate-orbit-node__label">雷諾曼牌</div>
          </button>

          <!-- 節點 4: 神諭卡 -->
          <button
            class="fate-orbit-node fate-orbit-node--active fate-orbit-node--oracle"
            style="left: 50%; top: 78%"
            @click="selectDivination('oracle')"
          >
            <div class="fate-orbit-node__core">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <!-- 月亮 + 星星 (神諭卡象徵) -->
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                <path d="M19 3v4" />
                <path d="M21 5h-4" />
              </svg>
            </div>
            <div class="fate-orbit-node__label">神諭卡</div>
          </button>
        </div>
      </div>

      <!-- ══ 占星骰子面板 ══ -->
      <AstroDicePanel
        v-if="currentDivination === 'astroDice'"
        @back="handleAstroDiceBack"
      />

      <!-- ══ 雷諾曼牌面板 ══ -->
      <LenormandPanel
        v-if="currentDivination === 'lenormand'"
        @back="handleLenormandBack"
      />

      <!-- ══ 神諭卡面板 ══ -->
      <OraclePanel
        v-if="currentDivination === 'oracle'"
      />

      <!-- ══ 提問 + 選牌陣（合併） ══ -->
      <div
        v-if="currentDivination === 'tarot' && fateStore.phase === 'setup'"
        class="fate-phase fate-phase--setup"
      >
        <section class="fate-setup__section">
          <h3 class="fate-setup__label">你的問題</h3>
          <textarea
            v-model="fateStore.question"
            class="fate-question-input"
            placeholder="集中精神，讓問題在心中浮現…"
            spellcheck="false"
          />
        </section>

        <section class="fate-setup__section">
          <h3 class="fate-setup__label">選擇牌陣</h3>
          <!-- 篩選 tabs -->
          <div class="fate-spread-filter">
            <button
              :class="[
                'fate-spread-filter__tab',
                { 'fate-spread-filter__tab--active': spreadFilterCount === -1 },
              ]"
              @click="spreadFilterCount = -1"
            >
              全部
            </button>
            <button
              v-for="count in spreadCountOptions"
              :key="count"
              :class="[
                'fate-spread-filter__tab',
                {
                  'fate-spread-filter__tab--active':
                    spreadFilterCount === count,
                },
              ]"
              @click="spreadFilterCount = count"
            >
              {{ count }}張
            </button>
          </div>
          <!-- 牌陣列表 -->
          <div class="fate-spread-list">
            <div
              v-for="s in filteredSpreads"
              :key="s.id"
              :class="[
                'fate-spread-item',
                { 'fate-spread-item--active': fateStore.spread.id === s.id },
              ]"
              @click="selectSpread(s)"
            >
              <div class="fate-spread-item__left">
                <div class="fate-spread-item__stars">
                  <span
                    v-for="i in Math.min(s.positions.length, 5)"
                    :key="i"
                    class="fate-spread-item__star"
                    >✦</span
                  >
                  <span
                    v-if="s.positions.length > 5"
                    class="fate-spread-item__star fate-spread-item__star--accent"
                    >✦</span
                  >
                </div>
              </div>
              <div class="fate-spread-item__body">
                <div class="fate-spread-item__name">{{ s.nameCn }}</div>
                <div class="fate-spread-item__count">
                  {{ s.positions.length }} 張牌
                </div>
                <div
                  v-if="expandedSpreadId === s.id"
                  class="fate-spread-item__desc"
                >
                  {{ s.description }}
                </div>
              </div>
              <div class="fate-spread-item__arrow">
                {{ expandedSpreadId === s.id ? "▲" : "▼" }}
              </div>
            </div>
          </div>
        </section>

        <div class="fate-phase__actions">
          <button
            class="fate-btn fate-btn--primary"
            :disabled="!fateStore.question.trim()"
            @click="
              fateStore.goToPhase('shuffle');
              shuffleCount = 0;
            "
          >
            開始占卜
          </button>
        </div>
      </div>

      <!-- ══ 洗牌 ══ -->
      <div
        v-if="currentDivination === 'tarot' && fateStore.phase === 'shuffle'"
        class="fate-phase fate-phase--shuffle"
      >
        <h2 class="fate-phase__title">匯聚你的能量</h2>
        <p class="fate-phase__subtitle">
          集中精神，默念你的問題<br /><span class="fate-shuffle__hint"
            >點擊洗牌 · 雙擊重置</span
          >
        </p>

        <!-- 牌堆動畫 -->
        <div
          :class="['fate-deck', { 'fate-deck--shuffling': isShuffling }]"
          @click="handleDeckTap"
        >
          <div
            v-for="i in 10"
            :key="i"
            class="fate-deck__card"
            :style="{ '--i': i - 1 }"
          >
            <span class="fate-deck__card-symbol">✦</span>
          </div>
        </div>

        <div class="fate-shuffle__count">
          <span v-if="shuffleCount === 0" class="fate-shuffle__count-text"
            >點擊牌堆開始洗牌</span
          >
          <span v-else class="fate-shuffle__count-text"
            >已洗 {{ shuffleCount }} 次</span
          >
        </div>

        <div class="fate-phase__actions">
          <button
            class="fate-btn fate-btn--primary"
            :disabled="shuffleCount === 0 || isShuffling"
            @click="confirmShuffle"
          >
            確認，展開牌堆
          </button>
        </div>
      </div>

      <!-- ══ 選牌（扇形） ══ -->
      <div
        v-if="currentDivination === 'tarot' && fateStore.phase === 'pick'"
        class="fate-phase fate-phase--pick"
      >
        <div class="fate-spread-layout">
          <div
            v-for="(pos, idx) in fateStore.spread.positions"
            :key="pos.id"
            class="fate-spread-layout__position"
            :style="{
              left: `${pos.coords?.x ?? 50}%`,
              top: `${pos.coords?.y ?? 50}%`,
            }"
          >
            <div
              :class="[
                'fate-pick-slots__slot',
                { 'fate-pick-slots__slot--filled': idx < fateStore.pickedCount },
              ]"
            >
              <div class="fate-pick-slots__label">{{ pos.nameCn }}</div>
              <div
                v-if="idx < fateStore.pickedCount"
                class="fate-pick-slots__filled"
              >
                ✦
              </div>
              <div v-else class="fate-pick-slots__empty">?</div>
            </div>
          </div>
        </div>
        <p class="fate-phase__subtitle" style="margin-bottom: 4px">
          憑直覺選出 {{ fateStore.requiredPicks }} 張牌（{{
            fateStore.pickedCount
          }}
          / {{ fateStore.requiredPicks }}）
        </p>
        <p class="fate-pick-hint">← 滑動瀏覽牌堆，點擊抽牌 →</p>
        <div
          class="fate-fan"
          data-no-swipe-back
          @mousedown="onFanPointerDown"
          @touchstart.passive="onFanPointerDown"
        >
          <div class="fate-fan__arc">
            <div
              v-for="(_item, index) in fateStore.shuffledDeck"
              :key="index"
              class="fate-fan__card"
              :style="getFanCardStyle(index)"
              @click.stop="!isFanDragging && fateStore.pickCard(index)"
            >
              <div class="fate-fan__card-inner">
                <div class="fate-fan__card-border" />
                <span class="fate-fan__card-symbol">✦</span>
                <div class="fate-fan__card-corner fate-fan__card-corner--tl">
                  <svg
                    viewBox="0 0 24 24"
                    width="10"
                    height="10"
                    fill="currentColor"
                  >
                    <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z" />
                  </svg>
                </div>
                <div class="fate-fan__card-corner fate-fan__card-corner--br">
                  <svg
                    viewBox="0 0 24 24"
                    width="10"
                    height="10"
                    fill="currentColor"
                  >
                    <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ══ 翻牌 / 全部揭示 ══ -->
      <div
        v-if="
          currentDivination === 'tarot' &&
          (fateStore.phase === 'draw' || fateStore.phase === 'reveal')
        "
        class="fate-phase fate-phase--draw"
      >
        <h2 class="fate-phase__title">
          {{ fateStore.phase === "draw" ? "點擊翻開牌面" : "命運揭曉" }}
        </h2>
        <p class="fate-phase__subtitle">
          {{ fateStore.spread.nameCn }} · {{ fateStore.question }}
        </p>
        <div class="fate-spread-layout">
          <div
            v-for="(drawn, index) in fateStore.drawnCards"
            :key="drawn.position.id"
            class="fate-spread-layout__position"
            :style="{
              left: `${drawn.position.coords?.x ?? 50}%`,
              top: `${drawn.position.coords?.y ?? 50}%`,
            }"
          >
            <div class="fate-cards-area__slot">
              <div class="fate-cards-area__position">
                {{ drawn.position.nameCn }}
              </div>
              <FateCard
                :card="drawn.card"
                :is-reversed="drawn.isReversed"
                :is-revealed="index < fateStore.revealedCount"
                size="md"
                @click="handleCardClick(index)"
              />
            </div>
          </div>
        </div>
        <div class="fate-phase__actions">
          <button
            v-if="
              fateStore.phase === 'draw' &&
              fateStore.revealedCount < fateStore.drawnCards.length
            "
            class="fate-btn fate-btn--ghost"
            @click="fateStore.revealAllCards()"
          >
            全部翻開
          </button>
          <template v-if="fateStore.phase === 'reveal'">
            <button class="fate-btn fate-btn--ghost" @click="fateStore.reset()">
              重新開始
            </button>
            <button
              class="fate-btn fate-btn--primary"
              :disabled="fateStore.isInterpreting"
              @click="fateStore.startInterpretation()"
            >
              {{ fateStore.isInterpreting ? "正在聆聽神諭..." : "請求神諭" }}
            </button>
          </template>
        </div>
      </div>

      <!-- ══ AI 解讀 ══ -->
      <div
        v-if="currentDivination === 'tarot' && fateStore.phase === 'interpret'"
        class="fate-phase fate-phase--interpret"
      >
        <div class="fate-mini-cards">
          <FateCard
            v-for="drawn in fateStore.drawnCards"
            :key="drawn.position.id"
            :card="drawn.card"
            :is-reversed="drawn.isReversed"
            :is-revealed="true"
            size="sm"
          />
        </div>
        <div class="fate-interpretation">
          <h3 class="fate-interpretation__title">✦ 神諭降臨 ✦</h3>
          <div
            v-if="fateStore.interpretError"
            class="fate-interpretation__error"
          >
            <p>⚠️ {{ fateStore.interpretError }}</p>
            <p class="fate-interpretation__error-hint">
              請檢查 API 設定後重試。
            </p>
          </div>
          <div
            v-else-if="interpretationHtml"
            class="fate-interpretation__content"
            v-html="interpretationHtml"
          />
          <div
            v-else-if="fateStore.isInterpreting"
            class="fate-interpretation__loading"
          >
            <div class="fate-interpretation__loading-icon">
              <svg
                viewBox="0 0 24 24"
                width="1em"
                height="1em"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                style="color: #c084fc"
              >
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            <p>正在通靈...</p>
          </div>
        </div>
        <div v-if="!fateStore.isInterpreting" class="fate-phase__actions">
          <button
            class="fate-btn fate-btn--ghost"
            @click="fateStore.startInterpretation()"
          >
            重新解讀
          </button>
          <button class="fate-btn fate-btn--primary" @click="fateStore.reset()">
            開始新的占卜
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$bg-s: #0f111a;
$bg-e: #06070a;
$surface: rgba(22, 24, 38, 0.6);
$surface-h: rgba(30, 34, 54, 0.8);
$surface-a: rgba(40, 44, 74, 0.9);
$border-l: rgba(255, 255, 255, 0.08);
$border-m: rgba(255, 255, 255, 0.15);
$text-1: #e2e4f0;
$text-2: #b0b5cc;
$text-3: #7b82a3;
$text-m: #4e5573;
$accent: #f28b82;
$accent-l: #ffdfa3;
$accent-s: rgba(242, 139, 130, 0.12);
$accent-b: rgba(242, 139, 130, 0.25);
$card-bg: rgba(22, 24, 38, 0.8);
$card-bg2: rgba(32, 35, 54, 0.9);
$card-border: rgba(192, 132, 252, 0.4);
$card-sym: rgba(255, 223, 163, 0.85);

$danger: #f26666;
$danger-s: rgba(242, 102, 102, 0.1);
$danger-b: rgba(242, 102, 102, 0.25);
$blur: blur(16px);
$sh-sm:
  0 2px 4px rgba(0, 0, 0, 0.2),
  0 1px 2px rgba(0, 0, 0, 0.1);
$sh-md:
  0 6px 16px rgba(0, 0, 0, 0.3),
  0 2px 6px rgba(0, 0, 0, 0.15);
$sh-lg:
  0 12px 32px rgba(0, 0, 0, 0.4),
  0 6px 12px rgba(0, 0, 0, 0.2);
$sh-glow: 0 0 24px rgba(242, 139, 130, 0.15);
$r-sm: 8px;
$r-md: 12px;
$r-lg: 16px;
$r-xl: 20px;
$r-pill: 100px;

.fate-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: $bg-e;
  background-image:
    radial-gradient(
      circle at 50% -20%,
      rgba(40, 32, 60, 0.6) 0%,
      rgba(6, 7, 10, 0) 70%
    ),
    radial-gradient(1px 1px at 15% 25%, #fff, transparent),
    radial-gradient(1.5px 1.5px at 75% 15%, #fff, transparent),
    radial-gradient(1px 1px at 60% 80%, rgba(255, 255, 255, 0.8), transparent),
    radial-gradient(2px 2px at 25% 65%, rgba(255, 255, 255, 0.6), transparent),
    radial-gradient(1.5px 1.5px at 85% 55%, #fff, transparent),
    radial-gradient(1px 1px at 45% 45%, rgba(255, 255, 255, 0.7), transparent),
    radial-gradient(1px 1px at 30% 85%, #fff, transparent);
  background-size:
    100% 100%,
    200px 200px,
    250px 250px,
    150px 150px,
    300px 300px,
    180px 180px,
    220px 220px,
    120px 120px;
  color: $text-1;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
}

.fate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  border-bottom: 1px solid $border-l;
  flex-shrink: 0;
  background: rgba(12, 14, 22, 0.6);
  backdrop-filter: $blur;
  &__back,
  &__history {
    background: none;
    border: none;
    color: $text-2;
    font-size: 14px;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: $r-sm;
    transition: all 0.2s;
    &:hover {
      color: $accent;
      background: $accent-s;
    }
  }
  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $text-1;
    letter-spacing: 0.08em;
  }
}

.fate-content {
  flex: 1;
  overflow: hidden;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  // 占星骰子全屏舞台時移除 padding
  &:has(.astro-stage) {
    padding: 0;
  }
}

.fate-phase {
  width: 100%;
  max-width: 600px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  overflow-y: auto;
  animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  &__title {
    font-size: 22px;
    font-weight: 700;
    color: $text-1;
    margin-bottom: 8px;
    text-align: center;
  }
  &__subtitle {
    font-size: 14px;
    color: $text-3;
    margin-bottom: 20px;
    text-align: center;
    line-height: 1.6;
  }
  &__actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
    flex-wrap: wrap;
    justify-content: center;
  }
}

// ══ 入口 ══
.fate-phase--home {
  gap: 32px;
  padding-bottom: 24px;
}

/* ━━ 魔幻相框裝飾 ━━ */
.fate-home-frame {
  position: absolute;
  top: 10px;
  bottom: 0;
  left: 20px;
  right: 20px;
  pointer-events: none;
  z-index: 0;

  &__arch {
    position: absolute;
    inset: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.85);
    border-bottom: none;
    border-radius: 600px 600px 0 0;

    &::before {
      content: "";
      position: absolute;
      inset: -8px;
      border: 1px dashed rgba(255, 255, 255, 0.25);
      border-bottom: none;
      border-radius: 600px 600px 0 0;
    }
  }

  &__moon {
    position: absolute;
    top: -26px;
    left: 50%;
    transform: translateX(-50%) rotate(-30deg);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    box-shadow: inset -9px -10px 0 0 #fff;
  }

  &__star {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    &::before,
    &::after {
      content: "";
      position: absolute;
      background: #fff;
    }
    &::before {
      width: 1px;
      height: 40px;
    }
    &::after {
      width: 40px;
      height: 1px;
    }
    .svg-star {
      position: relative;
      z-index: 1;
      width: 16px;
      height: 16px;
      path {
        fill: #fff;
      }
    }

    &--tl {
      top: 60px;
      left: -20px;
    }
    &--tr {
      top: 110px;
      right: -15px;
      &::before {
        height: 28px;
      }
      &::after {
        width: 28px;
      }
      .svg-star {
        width: 10px;
        height: 10px;
      }
    }
  }

  &__ring {
    position: absolute;
    width: 12px;
    height: 12px;
    border: 1px solid #fff;
    border-radius: 50%;
    top: 55%;
    transform: translateY(-50%);
    &--l {
      left: -6.5px;
    }
    &--r {
      right: -6.5px;
    }
  }

  &__bottom-deco {
    position: absolute;
    bottom: 0;
    width: 6px;
    height: 14px;
    background: #fff;
    clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
    &--l {
      left: -3.5px;
    }
    &--r {
      right: -3.5px;
    }
  }
}

.fate-home__hero {
  text-align: center;
  position: relative;
  z-index: 1;
  padding-top: 56px;
}
.fate-home__orb {
  font-size: 64px;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 16px rgba(192, 132, 252, 0.4));
  position: relative;
  z-index: 1;
}
.fate-home__title {
  font-size: 28px;
  font-weight: 800;
  color: $text-1;
  margin-bottom: 6px;
  letter-spacing: 0.04em;
}
.fate-home__subtitle {
  font-size: 15px;
  color: $text-3;
}
.fate-orbit-menu {
  position: relative;
  width: 100%;
  height: 180px;
  margin-top: 12px;
  z-index: 2;

  &__path {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    path {
      animation: dashScroll 30s linear infinite;
    }
  }
}

@keyframes dashScroll {
  to {
    stroke-dashoffset: -200;
  }
}

.fate-orbit-node {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;

  &__core {
    width: 56px;
    height: 56px;
    border-radius: 18px; /* squircle feel */
    background: rgba(22, 24, 38, 0.85);
    border: 1.5px solid rgba(192, 132, 252, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    color: #ffdfa3;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    position: relative;

    &::before {
      content: "";
      position: absolute;
      inset: -4px;
      border-radius: 22px;
      border: 1px dashed rgba(255, 223, 163, 0);
      transition: all 0.4s ease;
    }
  }

  &__label {
    font-size: 13px;
    color: $text-2;
    font-weight: 600;
    letter-spacing: 0.12em;
    transition:
      color 0.3s,
      transform 0.3s;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
  }

  &__lock {
    position: absolute;
    bottom: -6px;
    right: -6px;
    width: 22px;
    height: 22px;
    background: #161826;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #7b82a3;
    border: 1.5px solid rgba(192, 132, 252, 0.4);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
  }

  &--active {
    .fate-orbit-node__core {
      border-color: rgba(255, 223, 163, 0.5);
      box-shadow:
        0 0 24px rgba(242, 139, 130, 0.25),
        inset 0 0 12px rgba(242, 139, 130, 0.15);
      background: linear-gradient(
        135deg,
        rgba(40, 32, 60, 0.9),
        rgba(22, 24, 38, 0.85)
      );
      color: #fff;
    }
    .fate-orbit-node__label {
      color: #e2e4f0;
    }

    &:hover {
      .fate-orbit-node__core {
        transform: scale(1.15) translateY(-4px);
        border-color: $accent-l;
        box-shadow:
          0 0 36px rgba(242, 139, 130, 0.4),
          inset 0 0 16px rgba(242, 139, 130, 0.2);
        color: #fff;

        &::before {
          border-color: rgba(255, 223, 163, 0.5);
          transform: scale(1.05) rotate(15deg);
        }
      }
      .fate-orbit-node__label {
        color: #ffdfa3;
        transform: translateY(2px);
      }
    }
  }

  &--locked {
    cursor: not-allowed;
    opacity: 0.7;
    .fate-orbit-node__core {
      color: #4e5573;
      border-color: rgba(255, 255, 255, 0.08);
      background: rgba(12, 14, 22, 0.6);
      box-shadow: none;
    }
  }

  // 神諭卡節點 — 月紫色調
  &--oracle {
    &.fate-orbit-node--active {
      .fate-orbit-node__core {
        border-color: rgba(199, 125, 255, 0.5);
        box-shadow:
          0 0 24px rgba(199, 125, 255, 0.3),
          inset 0 0 12px rgba(199, 125, 255, 0.15);
        background: linear-gradient(
          135deg,
          rgba(40, 20, 70, 0.9),
          rgba(22, 14, 48, 0.85)
        );
        color: #c77dff;
      }
      .fate-orbit-node__label {
        color: #c77dff;
      }
      &:hover {
        .fate-orbit-node__core {
          border-color: #c77dff;
          box-shadow:
            0 0 36px rgba(199, 125, 255, 0.5),
            inset 0 0 16px rgba(199, 125, 255, 0.25);
          color: #e0aaff;
        }
        .fate-orbit-node__label {
          color: #e0aaff;
        }
      }
    }
  }
}

// ══ 提問+選牌陣 ══
.fate-phase--setup {
  gap: 0;
  align-items: stretch;

  // 讓「開始占卜」按鈕浮在底部，不用滑到最下面才能點
  .fate-phase__actions {
    position: sticky;
    bottom: 0;
    z-index: 10;
    margin-top: auto;
    padding: 16px 0;
    background: linear-gradient(to top, $bg-e 60%, transparent);
  }
}
.fate-setup__section {
  margin-bottom: 24px;
}
.fate-setup__label {
  font-size: 13px;
  font-weight: 600;
  color: $text-2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}

.fate-question-input {
  width: 100%;
  min-height: 100px;
  padding: 14px 16px;
  background: $surface;
  border: 1px solid $border-m;
  border-radius: $r-lg;
  color: $text-1;
  font-size: 15px;
  resize: none;
  line-height: 1.7;
  box-shadow: $sh-sm;
  transition: all 0.25s;
  font-family: inherit;
  box-sizing: border-box;
  &::placeholder {
    color: $text-m;
  }
  &:focus {
    outline: none;
    border-color: $accent;
    box-shadow:
      $sh-md,
      0 0 0 3px $accent-s;
  }
}

.fate-spread-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  &__tab {
    padding: 4px 12px;
    border-radius: $r-pill;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid $border-m;
    background: $surface;
    color: $text-2;
    transition: all 0.2s;
    font-family: inherit;
    &:hover {
      border-color: $accent-b;
      color: $accent;
      background: $accent-s;
    }
    &--active {
      background: $accent;
      color: #000;
      border-color: $accent;
      box-shadow: 0 2px 8px rgba(242, 139, 130, 0.25);
    }
  }
}

.fate-spread-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fate-spread-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  background: $surface;
  border: 1px solid $border-l;
  border-radius: $r-md;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: $sh-sm;
  &:hover {
    border-color: $border-m;
    background: $surface-h;
  }
  &--active {
    border-color: $accent;
    background: $surface-a;
    box-shadow: $sh-md, $sh-glow;
  }
  &__left {
    flex-shrink: 0;
    padding-top: 2px;
  }
  &__stars {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    max-width: 36px;
  }
  &__star {
    font-size: 10px;
    color: $text-m;
    &--accent {
      color: $accent;
    }
  }
  .fate-spread-item--active &__star {
    color: $accent-l;
  }
  &__body {
    flex: 1;
    min-width: 0;
  }
  &__name {
    font-size: 15px;
    font-weight: 600;
    color: $text-1;
    margin-bottom: 2px;
  }
  &__count {
    font-size: 11px;
    color: $text-3;
    margin-bottom: 4px;
  }
  &__desc {
    font-size: 12px;
    color: $text-2;
    line-height: 1.6;
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid $border-l;
  }
  &__arrow {
    font-size: 10px;
    color: $text-m;
    flex-shrink: 0;
    padding-top: 4px;
  }
}

// ══ 洗牌 ══
.fate-shuffle__hint {
  font-size: 12px;
  color: $text-m;
}
.fate-shuffle__count {
  margin: 16px 0 4px;
  min-height: 24px;
}
.fate-shuffle__count-text {
  font-size: 13px;
  color: $text-3;
}

.fate-deck {
  position: relative;
  width: 100px;
  height: 160px;
  margin: 24px auto;
  cursor: pointer;
  user-select: none;
  perspective: 800px;

  &__card {
    position: absolute;
    width: 90px;
    height: 140px;
    border-radius: $r-sm;
    background: linear-gradient(135deg, $card-bg, $card-bg2);
    border: 2px solid $card-border;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: $sh-md;
    // 靜態堆疊：微微錯開
    top: calc(var(--i) * 1.5px);
    left: calc(var(--i) * 1px);
    z-index: calc(10 - var(--i));
    transition: all 0.3s ease;
    backface-visibility: hidden;
  }
  &__card-symbol {
    font-size: 24px;
    color: $card-sym;
  }

  // ── 洗牌動畫：交錯穿插（riffle shuffle） ──
  &--shuffling .fate-deck__card {
    // 奇數牌往左，偶數牌往右，然後交錯合併
    animation: riffleShuffle 1.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    // 奇偶牌不同方向
    --side: 1;
    &:nth-child(odd) {
      --side: -1;
    }
    // 交錯延遲讓合併更自然
    animation-delay: calc(var(--i) * 0.02s);
  }
}

@keyframes riffleShuffle {
  // 階段 1：分成左右兩疊
  0% {
    transform: translate(0, 0) rotate(0deg);
    z-index: calc(10 - var(--i));
  }
  20% {
    transform: translate(calc(var(--side) * 52px), calc(var(--i) * -2px))
      rotate(calc(var(--side) * 3deg));
  }
  // 階段 2：兩疊牌交錯抬起穿插
  45% {
    transform: translate(calc(var(--side) * 28px), calc(-20px - var(--i) * 4px))
      rotate(calc(var(--side) * -2deg));
    z-index: calc(var(--i) + 5);
  }
  // 階段 3：穿插合併，牌交錯落下
  70% {
    transform: translate(calc(var(--side) * 4px), calc(-6px + var(--i) * 1px))
      rotate(calc(var(--side) * -0.5deg));
    z-index: calc(10 - var(--i));
  }
  // 階段 4：收回成一疊
  100% {
    transform: translate(0, 0) rotate(0deg);
    z-index: calc(10 - var(--i));
  }
}

// ══ 牌陣佈局 ══
.fate-spread-layout {
  position: relative;
  width: 100%;
  max-width: 500px;
  aspect-ratio: 1 / 1;
  margin: 0 auto 24px;
  
  &__position {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 1;
    transition: all 0.5s cubic-bezier(0.25, 0.8, 0.25, 1);
  }
}

.fate-phase--pick .fate-spread-layout {
  width: 100%;
  max-width: 320px;
  height: auto;
  aspect-ratio: 1 / 1;
  margin: 0 auto 12px;
  flex-shrink: 1;

  // 電腦寬螢幕適配：牌陣區域可以更大
  @media (min-width: 768px) {
    max-width: 400px;
  }
}

// ══ 選牌 ══
.fate-pick-slots {
  &__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 48px;
    height: 56px;
    border-radius: $r-sm;
    border: 1.5px dashed $border-m;
    background: $surface;
    justify-content: center;
    transition: all 0.3s;
    &--filled {
      border: 1.5px solid $accent;
      background: $accent-s;
      box-shadow: $sh-sm;
    }
  }
  
  .fate-phase--pick &__slot {
    width: 48px;
    height: 56px;
    border-width: 1.5px;
  }

  &__label {
    font-size: 8px;
    color: $text-m;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 44px;
    text-align: center;
    margin-top: 2px;
  }
  
  .fate-phase--pick &__label {
    transform: scale(0.9);
    max-width: 48px;
  }

  &__filled {
    font-size: 16px;
    color: $accent;
  }
  
  .fate-phase--pick &__filled {
    font-size: 14px;
  }

  &__empty {
    font-size: 14px;
    color: $text-m;
  }
  
  .fate-phase--pick &__empty {
    font-size: 12px;
  }
}

.fate-pick-hint {
  font-size: 11px;
  color: $text-m;
  margin-bottom: 12px;
  animation: fadeInOut 4s ease-in-out infinite;
  flex-shrink: 0;
}

.fate-fan {
  position: relative;
  width: 100%;
  height: 220px;
  overflow: hidden;
  touch-action: pan-y;
  cursor: grab;
  margin-top: auto;
  flex-shrink: 0;

  // 電腦寬螢幕適配：增加牌堆可見高度
  @media (min-width: 768px) {
    height: 300px;
  }

  &:active {
    cursor: grabbing;
  }
  &__arc {
    position: absolute;
    bottom: -380px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 600px;

    // 電腦寬螢幕適配：放大扇形弧度
    @media (min-width: 768px) {
      width: 800px;
      height: 800px;
      bottom: -500px;
    }
  }
  &__card {
    position: absolute;
    top: 0;
    left: 50%;
    margin-left: -28px;
    margin-top: 0;
    transform-origin: 28px 380px;
    width: 56px;
    height: 84px;
    cursor: pointer;
    transition: opacity 0.15s;

    // 電腦寬螢幕適配：牌的旋轉中心跟隨弧度放大
    @media (min-width: 768px) {
      transform-origin: 28px 500px;
    }
    &:hover .fate-fan__card-inner {
      border-color: $accent-l;
      box-shadow: 0 0 16px rgba(192, 132, 252, 0.35);
      transform: scale(1.06);
    }
  }
  &__card-inner {
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(135deg, $card-bg, $card-bg2);
    border: 1.5px solid $card-border;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition:
      border-color 0.2s,
      box-shadow 0.2s,
      transform 0.2s;
    overflow: hidden;
    box-shadow: $sh-sm;
  }
  &__card-border {
    position: absolute;
    inset: 4px;
    border: 1px solid rgba(192, 132, 252, 0.25);
    border-radius: 3px;
  }
  &__card-symbol {
    font-size: 18px;
    color: $card-sym;
    filter: drop-shadow(0 0 6px rgba(255, 223, 163, 0.4));
    z-index: 1;
  }
  &__card-corner {
    position: absolute;
    color: rgba(192, 132, 252, 0.4);
    font-size: 8px;
    &--tl {
      top: 5px;
      left: 5px;
    }
    &--br {
      bottom: 5px;
      right: 5px;
    }
  }
}

// ══ 翻牌 ══
.fate-cards-area {
  &__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  &__position {
    font-size: 11px;
    color: $text-3;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
    background: rgba(12, 14, 22, 0.6);
    padding: 2px 6px;
    border-radius: 4px;
    backdrop-filter: blur(4px);
  }
}

.fate-mini-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

// ══ AI 解讀 ══
.fate-interpretation {
  width: 100%;
  background: $surface;
  border: 1px solid $border-l;
  border-radius: $r-lg;
  padding: 28px 24px;
  min-height: 200px;
  box-shadow: $sh-md;
  &__title {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    color: $accent;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
  }
  &__content {
    color: $text-1;
    font-size: 15px;
    line-height: 1.9;
    :deep(h2) {
      font-size: 18px;
      color: $accent;
      font-weight: 700;
      margin: 24px 0 12px;
    }
    :deep(h3) {
      font-size: 16px;
      font-weight: 700;
      margin: 20px 0 10px;
    }
    :deep(p) {
      margin-bottom: 14px;
      color: $text-2;
    }
    :deep(strong) {
      color: $accent;
      font-weight: 600;
    }
    :deep(ul),
    :deep(ol) {
      padding-left: 20px;
      margin-bottom: 14px;
    }
    :deep(li) {
      margin-bottom: 6px;
      color: $text-2;
    }
    :deep(blockquote) {
      border-left: 3px solid $accent;
      padding: 12px 16px;
      margin: 16px 0;
      color: $text-2;
      background: $accent-s;
      border-radius: 0 $r-sm $r-sm 0;
    }
  }
  &__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 0;
    gap: 16px;
    color: $text-3;
  }
  &__loading-icon {
    font-size: 48px;
    animation: pulse 2s infinite ease-in-out;
  }
  &__error {
    color: $danger;
    text-align: center;
    padding: 24px;
    background: $danger-s;
    border-radius: $r-md;
  }
  &__error-hint {
    font-size: 12px;
    color: $text-3;
    margin-top: 8px;
  }
}

// ══ 按鈕 ══
.fate-btn {
  padding: 10px 28px;
  border-radius: $r-pill;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s;
  border: none;
  letter-spacing: 0.03em;
  font-family: inherit;
  &--primary {
    background: linear-gradient(
      135deg,
      rgba(242, 139, 130, 0.25),
      rgba(192, 132, 252, 0.25)
    );
    border: 1px solid rgba(242, 139, 130, 0.5);
    color: $accent-l;
    box-shadow: 0 0 15px rgba(242, 139, 130, 0.15);
    &:hover:not(:disabled) {
      box-shadow: 0 0 25px rgba(242, 139, 130, 0.3);
      border-color: $accent;
      background: linear-gradient(
        135deg,
        rgba(242, 139, 130, 0.35),
        rgba(192, 132, 252, 0.35)
      );
      transform: translateY(-1px);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
  &--ghost {
    background: $surface;
    color: $text-2;
    border: 1px solid $border-m;
    box-shadow: $sh-sm;
    &:hover {
      color: $accent;
      border-color: $accent-b;
      background: $accent-s;
    }
  }
}

// ══ 歷史記錄 ══
.fate-history {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    h2 {
      font-size: 18px;
      font-weight: 700;
    }
  }
  &__clear {
    background: none;
    border: 1px solid $danger-b;
    color: $danger;
    padding: 6px 14px;
    border-radius: $r-pill;
    font-size: 12px;
    cursor: pointer;
    &:hover {
      background: $danger-s;
    }
  }
  &__empty {
    text-align: center;
    padding: 48px 0;
    color: $text-3;
    &-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
  }
  &__list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  &__item {
    background: $surface;
    border: 1px solid $border-l;
    border-radius: $r-md;
    padding: 16px;
    box-shadow: $sh-sm;
  }
  &__item-time {
    font-size: 11px;
    color: $text-m;
    margin-bottom: 4px;
  }
  &__item-question {
    font-size: 15px;
    font-weight: 600;
    color: $text-1;
    margin-bottom: 4px;
  }
  &__item-meta {
    font-size: 12px;
    color: $text-3;
    margin-bottom: 8px;
  }
  &__item-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 8px;
  }
  &__item-card-tag {
    font-size: 11px;
    padding: 2px 8px;
    background: $accent-s;
    color: $accent;
    border-radius: $r-pill;
  }
  &__item-preview {
    font-size: 12px;
    color: $text-2;
    line-height: 1.5;
    margin-bottom: 8px;
  }
  &__item-delete {
    background: none;
    border: 1px solid $danger-b;
    color: $danger;
    padding: 4px 12px;
    border-radius: $r-pill;
    font-size: 11px;
    cursor: pointer;
    &:hover {
      background: $danger-s;
    }
  }
  &__item--clickable {
    cursor: pointer;
    transition:
      border-color 0.2s,
      background 0.2s;
    &:hover {
      border-color: $border-m;
      background: $surface-h;
    }
  }
  &__item-badge {
    margin-right: 4px;
  }
  &__item-dice {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  &__item-dice-sep {
    color: $text-m;
  }
  &__item-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 8px;
  }
  &__item-hint {
    font-size: 11px;
    color: $text-m;
  }

  // ══ 展開詳情 ══
  &__detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
    animation: fadeIn 0.25s ease;
  }
  &__detail-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  &__detail-back {
    background: none;
    border: 1px solid $border-m;
    color: $text-2;
    padding: 6px 14px;
    border-radius: $r-pill;
    font-size: 13px;
    cursor: pointer;
    &:hover {
      background: $surface-h;
      color: $text-1;
    }
  }
  &__detail-type {
    font-size: 13px;
    color: $text-3;
  }
  &__detail-question {
    font-size: 17px;
    font-weight: 700;
    color: $text-1;
    line-height: 1.5;
  }
  &__detail-meta {
    font-size: 12px;
    color: $text-3;
  }
  &__detail-cards {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  &__detail-dice {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    padding: 12px 16px;
    background: $surface;
    border-radius: $r-md;
  }
  &__detail-die {
    font-size: 15px;
    color: $accent-l;
    font-weight: 600;
  }
  &__detail-plus {
    color: $text-m;
    font-size: 18px;
  }
  &__detail-interpretation {
    background: $surface;
    border-radius: $r-lg;
    padding: 20px;
    .fate-interpretation__content {
      color: $text-1;
      font-size: 15px;
      line-height: 1.8;
      :deep(p) {
        margin-bottom: 12px;
      }
      :deep(strong) {
        color: $accent-l;
      }
    }
  }
  &__detail-empty {
    color: $text-3;
    text-align: center;
    padding: 24px 0;
  }
}

// ══ 動畫 ══
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 0.4;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}
@keyframes fadeInOut {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.7;
  }
}
</style>
