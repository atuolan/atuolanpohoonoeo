<script setup lang="ts">
/**
 * 塔羅占卜主畫面
 * 占卜流程：提問 → 選牌陣 → 洗牌 → 翻牌 → AI 解讀
 */
import FateCard from "@/components/common/FateCard.vue";
import { fateSpreads } from "@/data/fateSpreads";
import { useFateStore } from "@/stores/fate";
import type { FateSpread } from "@/types/fate";
import { marked } from "marked";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{
  back: [];
}>();

const fateStore = useFateStore();

// 洗牌動畫
const isShuffling = ref(false);

// 歷史記錄面板
const showHistory = ref(false);

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
const CARD_ANGLE_STEP = 3.2; // 每張牌之間的角度
const FAN_VISIBLE_ANGLE = 50; // 可見範圍角度

/** 計算扇形中每張牌的樣式 */
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

onMounted(() => {
  if (!fateStore.isHistoryLoaded) {
    fateStore.loadHistory();
  }
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

function handleShuffle() {
  isShuffling.value = true;
  setTimeout(() => {
    isShuffling.value = false;
    fateStore.shuffleAndDraw();
  }, 1200);
}

function selectSpread(s: FateSpread) {
  fateStore.spread = s;
}

function handleCardClick(index: number) {
  if (index === fateStore.revealedCount) {
    fateStore.revealNextCard();
  }
}

// 解讀內容渲染為 HTML
const interpretationHtml = computed(() => {
  if (!fateStore.interpretation) return "";
  const raw = fateStore.isInterpreting
    ? fateStore.interpretation + "▌"
    : fateStore.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

// 格式化時間
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function handleDeleteReading(id: string) {
  if (confirm("確定要刪除這條記錄嗎？")) {
    fateStore.deleteReading(id);
  }
}

function handleClearHistory() {
  if (confirm("確定要清空所有歷史記錄嗎？此操作不可撤銷。")) {
    fateStore.clearHistory();
  }
}
</script>

<template>
  <div class="fate-screen">
    <!-- 頂部導航 -->
    <header class="fate-header">
      <button
        class="fate-header__back"
        @click="showHistory ? (showHistory = false) : emit('back')"
      >
        ← {{ showHistory ? "返回占卜" : "返回" }}
      </button>
      <h1 class="fate-header__title">🔮 Fate</h1>
      <button class="fate-header__history" @click="showHistory = !showHistory">
        {{ showHistory ? "占卜" : "歷史" }}
      </button>
    </header>

    <!-- 歷史記錄面板 -->
    <div v-if="showHistory" class="fate-history">
      <div class="fate-history__header">
        <h2>占卜歷史</h2>
        <button
          v-if="fateStore.readings.length > 0"
          class="fate-history__clear"
          @click="handleClearHistory"
        >
          清空全部
        </button>
      </div>

      <div v-if="fateStore.readings.length === 0" class="fate-history__empty">
        <div class="fate-history__empty-icon">🌌</div>
        <p>尚無占卜記錄</p>
      </div>

      <div v-else class="fate-history__list">
        <div
          v-for="reading in fateStore.readings"
          :key="reading.id"
          class="fate-history__item"
        >
          <div class="fate-history__item-time">
            {{ formatTime(reading.createdAt) }}
          </div>
          <div class="fate-history__item-question">
            {{ reading.question || "未記錄問題" }}
          </div>
          <div class="fate-history__item-meta">
            {{ reading.spread.nameCn }} · {{ reading.drawnCards.length }} 張牌
          </div>
          <div class="fate-history__item-cards">
            <span
              v-for="drawn in reading.drawnCards"
              :key="drawn.position.id"
              class="fate-history__item-card-tag"
            >
              {{ drawn.card.nameCn }}{{ drawn.isReversed ? "(逆)" : "" }}
            </span>
          </div>
          <div v-if="reading.interpretation" class="fate-history__item-preview">
            {{ reading.interpretation.substring(0, 100) }}...
          </div>
          <button
            class="fate-history__item-delete"
            @click="handleDeleteReading(reading.id)"
          >
            刪除
          </button>
        </div>
      </div>
    </div>

    <!-- 占卜流程 -->
    <div v-else class="fate-content">
      <!-- 階段：提問 -->
      <div
        v-if="fateStore.phase === 'question'"
        class="fate-phase fate-phase--question"
      >
        <h2 class="fate-phase__title">你尋求什麼？</h2>
        <p class="fate-phase__subtitle">集中精神，讓問題在心中浮現。</p>
        <textarea
          v-model="fateStore.question"
          class="fate-question-input"
          placeholder="例如：我在事業上應該採取什麼行動？"
          spellcheck="false"
        />
        <button
          class="fate-btn fate-btn--primary"
          :disabled="!fateStore.question.trim()"
          @click="fateStore.goToPhase('spread')"
        >
          繼續
        </button>
      </div>

      <!-- 階段：選牌陣 -->
      <div
        v-if="fateStore.phase === 'spread'"
        class="fate-phase fate-phase--spread"
      >
        <h2 class="fate-phase__title">選擇你的牌陣</h2>
        <div class="fate-spread-grid">
          <button
            v-for="s in fateSpreads"
            :key="s.id"
            :class="[
              'fate-spread-card',
              { 'fate-spread-card--active': fateStore.spread.id === s.id },
            ]"
            @click="selectSpread(s)"
          >
            <div class="fate-spread-card__name">{{ s.nameCn }}</div>
            <div class="fate-spread-card__name-en">{{ s.name }}</div>
            <div class="fate-spread-card__desc">{{ s.description }}</div>
            <div class="fate-spread-card__count">
              {{ s.positions.length }} 張牌
            </div>
          </button>
        </div>
        <div class="fate-phase__actions">
          <button
            class="fate-btn fate-btn--ghost"
            @click="fateStore.goToPhase('question')"
          >
            返回
          </button>
          <button
            class="fate-btn fate-btn--primary"
            @click="fateStore.goToPhase('shuffle')"
          >
            確認牌陣
          </button>
        </div>
      </div>

      <!-- 階段：洗牌 -->
      <div
        v-if="fateStore.phase === 'shuffle'"
        class="fate-phase fate-phase--shuffle"
      >
        <h2 class="fate-phase__title">匯聚你的能量</h2>
        <p class="fate-phase__subtitle">在洗牌時，於心中默念你的問題...</p>
        <div class="fate-deck">
          <div
            v-for="i in 5"
            :key="i"
            :class="[
              'fate-deck__card',
              { 'fate-deck__card--shuffling': isShuffling },
            ]"
            :style="{
              top: `${(i - 1) * 2}px`,
              left: `${(i - 1) * 2}px`,
              zIndex: 6 - i,
              animationDelay: `${(i - 1) * 0.1}s`,
            }"
          >
            <span class="fate-deck__card-symbol">✦</span>
          </div>
        </div>
        <button
          class="fate-btn fate-btn--primary"
          :disabled="isShuffling"
          @click="handleShuffle"
        >
          {{ isShuffling ? "洗牌中..." : "洗牌" }}
        </button>
      </div>

      <!-- 階段：選牌（扇形展開） -->
      <div
        v-if="fateStore.phase === 'pick'"
        class="fate-phase fate-phase--pick"
      >
        <!-- 牌位預覽區 -->
        <div class="fate-pick-slots">
          <div
            v-for="(pos, idx) in fateStore.spread.positions"
            :key="pos.id"
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

        <p class="fate-phase__subtitle" style="margin-bottom: 8px">
          憑直覺選出 {{ fateStore.requiredPicks }} 張牌（{{
            fateStore.pickedCount
          }}
          / {{ fateStore.requiredPicks }}）
        </p>
        <p class="fate-pick-hint">← 滑動瀏覽牌堆，點擊抽牌 →</p>

        <!-- 扇形牌堆 -->
        <div
          class="fate-fan"
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
                  ✨
                </div>
                <div class="fate-fan__card-corner fate-fan__card-corner--br">
                  ✨
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 階段：翻牌 / 全部揭示 -->
      <div
        v-if="fateStore.phase === 'draw' || fateStore.phase === 'reveal'"
        class="fate-phase fate-phase--draw"
      >
        <h2 class="fate-phase__title">
          {{ fateStore.phase === "draw" ? "點擊翻開牌面" : "命運揭曉" }}
        </h2>
        <p class="fate-phase__subtitle">
          {{ fateStore.spread.nameCn }} · {{ fateStore.question }}
        </p>

        <div class="fate-cards-area">
          <div
            v-for="(drawn, index) in fateStore.drawnCards"
            :key="drawn.position.id"
            class="fate-cards-area__slot"
          >
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

      <!-- 階段：AI 解讀 -->
      <div
        v-if="fateStore.phase === 'interpret'"
        class="fate-phase fate-phase--interpret"
      >
        <!-- 迷你牌面回顧 -->
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

        <!-- 解讀內容 -->
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
            <div class="fate-interpretation__loading-icon">👁</div>
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
// ========== 設計系統 ==========
$bg-primary: #fafaf8;
$bg-gradient-start: #f8f6f2;
$bg-gradient-end: #f0ede6;
$surface: rgba(255, 255, 255, 0.75);
$surface-hover: rgba(255, 255, 255, 0.9);
$surface-active: rgba(255, 255, 255, 0.95);
$border-light: rgba(0, 0, 0, 0.06);
$border-medium: rgba(0, 0, 0, 0.1);

$text-primary: #1a1a2e;
$text-secondary: #5a5a72;
$text-tertiary: #8e8e9f;
$text-muted: #b0b0be;

$accent: #c77b3c;
$accent-light: #e8a86d;
$accent-subtle: rgba(199, 123, 60, 0.08);
$accent-border: rgba(199, 123, 60, 0.2);

$card-bg: #2c2438;
$card-bg-alt: #362d46;
$card-border: rgba(199, 123, 60, 0.45);
$card-symbol: rgba(232, 168, 109, 0.7);

$danger: #e85d5d;
$danger-subtle: rgba(232, 93, 93, 0.08);
$danger-border: rgba(232, 93, 93, 0.2);

$glass-blur: blur(16px);
$shadow-sm:
  0 1px 3px rgba(0, 0, 0, 0.04),
  0 1px 2px rgba(0, 0, 0, 0.03);
$shadow-md:
  0 4px 12px rgba(0, 0, 0, 0.05),
  0 2px 4px rgba(0, 0, 0, 0.03);
$shadow-lg:
  0 8px 24px rgba(0, 0, 0, 0.06),
  0 4px 8px rgba(0, 0, 0, 0.04);
$shadow-glow: 0 0 20px rgba(199, 123, 60, 0.12);

$radius-sm: 8px;
$radius-md: 12px;
$radius-lg: 16px;
$radius-xl: 20px;
$radius-pill: 100px;

.fate-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(
    170deg,
    $bg-gradient-start 0%,
    $bg-gradient-end 100%
  );
  color: $text-primary;
  overflow: hidden;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans TC", sans-serif;
}

// ========== 頂部導航 ==========
.fate-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  border-bottom: 1px solid $border-light;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: $glass-blur;

  &__back,
  &__history {
    background: none;
    border: none;
    color: $text-secondary;
    font-size: 14px;
    cursor: pointer;
    padding: 6px 12px;
    border-radius: $radius-sm;
    transition: all 0.2s ease;
    &:hover {
      color: $accent;
      background: $accent-subtle;
    }
  }
  &__title {
    font-size: 18px;
    font-weight: 700;
    color: $text-primary;
    letter-spacing: 0.08em;
  }
}

// ========== 主內容區 ==========
.fate-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

// ========== 通用階段 ==========
.fate-phase {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
  animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  &__title {
    font-size: 22px;
    font-weight: 700;
    color: $text-primary;
    margin-bottom: 8px;
    text-align: center;
    letter-spacing: 0.02em;
  }
  &__subtitle {
    font-size: 14px;
    color: $text-tertiary;
    margin-bottom: 24px;
    text-align: center;
    line-height: 1.5;
  }
  &__actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }
}

// ========== 提問輸入 ==========
.fate-question-input {
  width: 100%;
  min-height: 120px;
  padding: 16px 20px;
  background: $surface;
  border: 1px solid $border-medium;
  border-radius: $radius-lg;
  color: $text-primary;
  font-size: 16px;
  resize: none;
  text-align: center;
  line-height: 1.7;
  margin-bottom: 20px;
  box-shadow: $shadow-sm;
  transition: all 0.25s ease;
  font-family: inherit;

  &::placeholder {
    color: $text-muted;
  }
  &:focus {
    outline: none;
    border-color: $accent;
    box-shadow:
      $shadow-md,
      0 0 0 3px rgba(199, 123, 60, 0.08);
  }
}

// ========== 牌陣選擇 ==========
.fate-spread-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  margin-bottom: 8px;
}

.fate-spread-card {
  background: $surface;
  border: 1px solid $border-light;
  border-radius: $radius-md;
  padding: 16px 18px;
  text-align: left;
  cursor: pointer;
  transition: all 0.25s ease;
  color: inherit;
  box-shadow: $shadow-sm;

  &--active {
    border-color: $accent;
    background: $surface-active;
    box-shadow: $shadow-md, $shadow-glow;

    .fate-spread-card__name {
      color: $accent;
    }
  }
  &:not(&--active):hover {
    border-color: $border-medium;
    background: $surface-hover;
    box-shadow: $shadow-md;
    transform: translateY(-1px);
  }
  &__name {
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 2px;
    transition: color 0.2s;
  }
  &__name-en {
    font-size: 11px;
    color: $text-muted;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 8px;
  }
  &__desc {
    font-size: 13px;
    color: $text-secondary;
    margin-bottom: 8px;
    line-height: 1.6;
  }
  &__count {
    display: inline-block;
    font-size: 12px;
    padding: 3px 12px;
    border-radius: $radius-pill;
    background: $accent-subtle;
    color: $accent;
    font-weight: 500;
  }
}

// ========== 洗牌牌堆 ==========
.fate-deck {
  position: relative;
  width: 100px;
  height: 160px;
  margin-bottom: 28px;

  &__card {
    position: absolute;
    width: 90px;
    height: 140px;
    border-radius: $radius-sm;
    background: linear-gradient(135deg, $card-bg, $card-bg-alt);
    border: 2px solid $card-border;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.3s;
    box-shadow: $shadow-md;

    &--shuffling {
      animation: shuffle 0.5s ease-in-out infinite;
    }
  }
  &__card-symbol {
    font-size: 24px;
    color: $card-symbol;
  }
}

// ========== 選牌牌位預覽 ==========
.fate-pick-slots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 12px;

  &__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: 48px;
    height: 56px;
    border-radius: $radius-sm;
    border: 1.5px dashed $border-medium;
    background: $surface;
    justify-content: center;
    transition: all 0.3s ease;

    &--filled {
      border: 1.5px solid $accent;
      background: $accent-subtle;
      box-shadow: $shadow-sm;
    }
  }
  &__label {
    font-size: 8px;
    color: $text-muted;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 44px;
    text-align: center;
  }
  &__filled {
    font-size: 16px;
    color: $accent;
  }
  &__empty {
    font-size: 14px;
    color: $text-muted;
  }
}

.fate-pick-hint {
  font-size: 11px;
  color: $text-muted;
  margin-bottom: 12px;
  animation: fadeInOut 4s ease-in-out infinite;
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

// ========== 扇形牌堆 ==========
.fate-fan {
  position: relative;
  width: 100%;
  height: 320px;
  overflow: hidden;
  touch-action: pan-y;
  cursor: grab;
  margin-top: 12px;

  &:active {
    cursor: grabbing;
  }

  &__arc {
    position: absolute;
    bottom: -320px;
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    height: 600px;
  }

  &__card {
    position: absolute;
    top: 0;
    left: 50%;
    margin-left: -28px;
    margin-top: -20px;
    transform-origin: 28px 320px;
    width: 56px;
    height: 84px;
    cursor: pointer;
    transition: opacity 0.15s ease;

    &:hover {
      .fate-fan__card-inner {
        border-color: $accent-light;
        box-shadow: 0 0 16px rgba(199, 123, 60, 0.35);
        transform: scale(1.06);
      }
    }
  }

  &__card-inner {
    width: 100%;
    height: 100%;
    border-radius: 6px;
    background: linear-gradient(135deg, $card-bg, $card-bg-alt);
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
    box-shadow: $shadow-sm;
  }

  &__card-border {
    position: absolute;
    inset: 4px;
    border: 1px solid rgba(199, 123, 60, 0.18);
    border-radius: 3px;
  }

  &__card-symbol {
    font-size: 18px;
    color: $card-symbol;
    filter: drop-shadow(0 0 6px rgba(199, 123, 60, 0.3));
    z-index: 1;
  }

  &__card-corner {
    position: absolute;
    color: rgba(199, 123, 60, 0.18);
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

// ========== 翻牌區域 ==========
.fate-cards-area {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  padding: 16px 0;
  width: 100%;

  &__slot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  &__position {
    font-size: 11px;
    color: $text-tertiary;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
  }
}

// ========== 迷你牌面回顧 ==========
.fate-mini-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 20px;
}

// ========== AI 解讀 ==========
.fate-interpretation {
  width: 100%;
  max-width: 600px;
  background: $surface;
  border: 1px solid $border-light;
  border-radius: $radius-lg;
  padding: 28px 24px;
  min-height: 200px;
  box-shadow: $shadow-md;

  &__title {
    text-align: center;
    font-size: 20px;
    font-weight: 700;
    color: $accent;
    letter-spacing: 0.1em;
    margin-bottom: 24px;
    position: relative;

    &::after {
      content: "";
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      width: 40px;
      height: 2px;
      background: linear-gradient(to right, transparent, $accent, transparent);
    }
  }

  &__content {
    color: $text-primary;
    font-size: 15px;
    line-height: 1.9;

    :deep(h1),
    :deep(h2),
    :deep(h3) {
      color: $text-primary;
      font-weight: 700;
      margin-top: 24px;
      margin-bottom: 12px;
    }
    :deep(h1) {
      font-size: 20px;
    }
    :deep(h2) {
      font-size: 18px;
      color: $accent;
    }
    :deep(h3) {
      font-size: 16px;
    }
    :deep(p) {
      margin-bottom: 14px;
      color: $text-secondary;
    }
    :deep(strong) {
      color: $accent;
      font-weight: 600;
    }
    :deep(em) {
      color: $text-secondary;
      font-style: italic;
    }
    :deep(ul),
    :deep(ol) {
      padding-left: 20px;
      margin-bottom: 14px;
    }
    :deep(li) {
      margin-bottom: 6px;
      color: $text-secondary;
    }
    :deep(blockquote) {
      border-left: 3px solid $accent;
      padding: 12px 16px;
      margin: 16px 0;
      color: $text-secondary;
      background: $accent-subtle;
      border-radius: 0 $radius-sm $radius-sm 0;
    }
    :deep(hr) {
      border: none;
      border-top: 1px solid $border-light;
      margin: 20px 0;
    }
  }

  &__loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 0;
    gap: 16px;
    color: $text-tertiary;
  }
  &__loading-icon {
    font-size: 48px;
    animation: pulse 2s infinite ease-in-out;
  }

  &__error {
    color: $danger;
    text-align: center;
    padding: 24px;
    background: $danger-subtle;
    border-radius: $radius-md;
  }
  &__error-hint {
    font-size: 12px;
    color: $text-tertiary;
    margin-top: 8px;
  }
}

// ========== 按鈕 ==========
.fate-btn {
  padding: 10px 28px;
  border-radius: $radius-pill;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.25s ease;
  border: none;
  letter-spacing: 0.03em;
  font-family: inherit;

  &--primary {
    background: linear-gradient(135deg, $accent, $accent-light);
    color: #fff;
    border: none;
    box-shadow: 0 2px 8px rgba(199, 123, 60, 0.25);
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(199, 123, 60, 0.35);
      transform: translateY(-1px);
    }
    &:active:not(:disabled) {
      transform: translateY(0);
      box-shadow: 0 1px 4px rgba(199, 123, 60, 0.2);
    }
    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
  &--ghost {
    background: $surface;
    color: $text-secondary;
    border: 1px solid $border-medium;
    box-shadow: $shadow-sm;
    &:hover {
      color: $accent;
      border-color: $accent-border;
      background: $accent-subtle;
    }
  }
}

// ========== 歷史記錄 ==========
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
      font-size: 20px;
      font-weight: 700;
      color: $text-primary;
    }
  }
  &__clear {
    background: none;
    border: 1px solid $danger-border;
    color: $danger;
    padding: 5px 14px;
    border-radius: $radius-sm;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      background: $danger-subtle;
    }
  }
  &__empty {
    text-align: center;
    padding: 60px 0;
    color: $text-muted;
  }
  &__empty-icon {
    font-size: 48px;
    margin-bottom: 12px;
    opacity: 0.4;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  &__item {
    background: $surface;
    border: 1px solid $border-light;
    border-radius: $radius-md;
    padding: 16px;
    position: relative;
    box-shadow: $shadow-sm;
    transition: all 0.2s ease;
    &:hover {
      box-shadow: $shadow-md;
    }
  }
  &__item-time {
    font-size: 12px;
    color: $text-muted;
    margin-bottom: 6px;
  }
  &__item-question {
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 4px;
  }
  &__item-meta {
    font-size: 12px;
    color: $text-tertiary;
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
    border-radius: $radius-sm;
    background: $accent-subtle;
    color: $accent;
    font-weight: 500;
  }
  &__item-preview {
    font-size: 13px;
    color: $text-tertiary;
    line-height: 1.6;
  }
  &__item-delete {
    position: absolute;
    top: 14px;
    right: 14px;
    background: none;
    border: none;
    color: $text-muted;
    font-size: 12px;
    cursor: pointer;
    transition: color 0.2s;
    &:hover {
      color: $danger;
    }
  }
}

// ========== 動畫 ==========
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
@keyframes shuffle {
  0%,
  100% {
    transform: translateX(0) rotate(0deg);
  }
  25% {
    transform: translateX(-20px) rotate(-4deg);
  }
  50% {
    transform: translateX(20px) rotate(4deg);
  }
  75% {
    transform: translateX(-10px) rotate(-2deg);
  }
}
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.96);
  }
}
</style>
