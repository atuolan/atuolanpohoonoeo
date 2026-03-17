<script setup lang="ts">
/**
 * 塔羅占卜主畫面
 * 流程：入口選擇 → 提問+選牌陣（合併） → 洗牌（可多次/雙擊重置） → 選牌（扇形） → 翻牌 → AI 解讀
 */
import FateCard from "@/components/common/FateCard.vue";
import { fateSpreads } from "@/data/fateSpreads";
import { useFateStore } from "@/stores/fate";
import type { FateSpread } from "@/types/fate";
import { marked } from "marked";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{ back: [] }>();
const fateStore = useFateStore();

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
  }, 700);
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

function handleDeleteReading(id: string) {
  if (confirm("確定要刪除這條記錄嗎？")) fateStore.deleteReading(id);
}

function handleClearHistory() {
  if (confirm("確定要清空所有歷史記錄嗎？此操作不可撤銷。"))
    fateStore.clearHistory();
}

// ===== 返回邏輯 =====
function handleBack() {
  if (showHistory.value) {
    showHistory.value = false;
    return;
  }
  if (fateStore.phase === "home") {
    emit("back");
    return;
  }
  if (fateStore.phase === "setup") {
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
  fateStore.reset();
}

onMounted(() => {
  if (!fateStore.isHistoryLoaded) fateStore.loadHistory();
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
          showHistory ? "返回" : fateStore.phase === "home" ? "返回" : "上一步"
        }}
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
      <!-- ══ 入口：選擇占卜類型 ══ -->
      <div
        v-if="fateStore.phase === 'home'"
        class="fate-phase fate-phase--home"
      >
        <div class="fate-home__hero">
          <div class="fate-home__orb">🔮</div>
          <h2 class="fate-home__title">命運之門</h2>
          <p class="fate-home__subtitle">選擇你的占卜方式</p>
        </div>
        <div class="fate-home__cards">
          <button
            class="fate-type-card fate-type-card--active"
            @click="fateStore.goToPhase('setup')"
          >
            <div class="fate-type-card__icon">🃏</div>
            <div class="fate-type-card__name">塔羅牌占卜</div>
            <div class="fate-type-card__desc">78 張塔羅牌，AI 深度解讀</div>
          </button>
          <div class="fate-type-card fate-type-card--locked">
            <div class="fate-type-card__lock">🔒</div>
            <div class="fate-type-card__name">星盤占卜</div>
            <div class="fate-type-card__desc">敬請期待</div>
          </div>
          <div class="fate-type-card fate-type-card--locked">
            <div class="fate-type-card__lock">🔒</div>
            <div class="fate-type-card__name">靈擺占卜</div>
            <div class="fate-type-card__desc">敬請期待</div>
          </div>
        </div>
      </div>

      <!-- ══ 提問 + 選牌陣（合併） ══ -->
      <div
        v-if="fateStore.phase === 'setup'"
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
        v-if="fateStore.phase === 'shuffle'"
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
            v-for="i in 7"
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
        v-if="fateStore.phase === 'pick'"
        class="fate-phase fate-phase--pick"
      >
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
        <p class="fate-phase__subtitle" style="margin-bottom: 4px">
          憑直覺選出 {{ fateStore.requiredPicks }} 張牌（{{
            fateStore.pickedCount
          }}
          / {{ fateStore.requiredPicks }}）
        </p>
        <p class="fate-pick-hint">← 滑動瀏覽牌堆，點擊抽牌 →</p>
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

      <!-- ══ 翻牌 / 全部揭示 ══ -->
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

      <!-- ══ AI 解讀 ══ -->
      <div
        v-if="fateStore.phase === 'interpret'"
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
$bg-s: #f8f6f2;
$bg-e: #f0ede6;
$surface: rgba(255, 255, 255, 0.75);
$surface-h: rgba(255, 255, 255, 0.9);
$surface-a: rgba(255, 255, 255, 0.95);
$border-l: rgba(0, 0, 0, 0.06);
$border-m: rgba(0, 0, 0, 0.1);
$text-1: #1a1a2e;
$text-2: #5a5a72;
$text-3: #8e8e9f;
$text-m: #b0b0be;
$accent: #c77b3c;
$accent-l: #e8a86d;
$accent-s: rgba(199, 123, 60, 0.08);
$accent-b: rgba(199, 123, 60, 0.2);
$card-bg: #2c2438;
$card-bg2: #362d46;
$card-border: rgba(199, 123, 60, 0.45);
$card-sym: rgba(232, 168, 109, 0.7);
$danger: #e85d5d;
$danger-s: rgba(232, 93, 93, 0.08);
$danger-b: rgba(232, 93, 93, 0.2);
$blur: blur(16px);
$sh-sm:
  0 1px 3px rgba(0, 0, 0, 0.04),
  0 1px 2px rgba(0, 0, 0, 0.03);
$sh-md:
  0 4px 12px rgba(0, 0, 0, 0.05),
  0 2px 4px rgba(0, 0, 0, 0.03);
$sh-lg:
  0 8px 24px rgba(0, 0, 0, 0.06),
  0 4px 8px rgba(0, 0, 0, 0.04);
$sh-glow: 0 0 20px rgba(199, 123, 60, 0.12);
$r-sm: 8px;
$r-md: 12px;
$r-lg: 16px;
$r-xl: 20px;
$r-pill: 100px;

.fate-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: linear-gradient(170deg, $bg-s 0%, $bg-e 100%);
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
  background: rgba(255, 255, 255, 0.6);
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
  overflow-y: auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.fate-phase {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;
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
}
.fate-home__hero {
  text-align: center;
}
.fate-home__orb {
  font-size: 64px;
  margin-bottom: 12px;
  filter: drop-shadow(0 4px 16px rgba(199, 123, 60, 0.3));
  animation: float 4s ease-in-out infinite;
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
.fate-home__cards {
  display: flex;
  gap: 12px;
  width: 100%;
}

.fate-type-card {
  flex: 1;
  padding: 20px 12px;
  border-radius: $r-lg;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  border: 1.5px solid $border-l;
  background: $surface;
  box-shadow: $sh-sm;
  transition: all 0.25s;
  &--active {
    cursor: pointer;
    border-color: $accent-b;
    &:hover {
      transform: translateY(-3px);
      box-shadow: $sh-md, $sh-glow;
      border-color: $accent;
    }
  }
  &--locked {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &__icon {
    font-size: 32px;
  }
  &__lock {
    font-size: 24px;
  }
  &__name {
    font-size: 14px;
    font-weight: 600;
    color: $text-1;
  }
  &__desc {
    font-size: 11px;
    color: $text-3;
    line-height: 1.4;
  }
}

// ══ 提問+選牌陣 ══
.fate-phase--setup {
  gap: 0;
  align-items: stretch;
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
      0 0 0 3px rgba(199, 123, 60, 0.08);
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
      color: #fff;
      border-color: $accent;
      box-shadow: 0 2px 8px rgba(199, 123, 60, 0.25);
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
    top: calc(var(--i) * 2px);
    left: calc(var(--i) * 2px);
    z-index: calc(7 - var(--i));
    transition: transform 0.3s ease;
  }
  &__card-symbol {
    font-size: 24px;
    color: $card-sym;
  }

  // 散開動畫
  &--shuffling .fate-deck__card {
    animation: deckSpread 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
    animation-delay: calc(var(--i) * 0.06s);
  }
}

@keyframes deckSpread {
  0% {
    transform: translate(0, 0) rotate(0deg);
  }
  40% {
    transform: translate(calc((var(--i) - 3) * 18px), calc(var(--i) * -8px))
      rotate(calc((var(--i) - 3) * 8deg));
  }
  70% {
    transform: translate(calc((var(--i) - 3) * 12px), calc(var(--i) * -4px))
      rotate(calc((var(--i) - 3) * 4deg));
  }
  100% {
    transform: translate(0, 0) rotate(0deg);
  }
}

// ══ 選牌 ══
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
  &__label {
    font-size: 8px;
    color: $text-m;
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
    color: $text-m;
  }
}

.fate-pick-hint {
  font-size: 11px;
  color: $text-m;
  margin-bottom: 12px;
  animation: fadeInOut 4s ease-in-out infinite;
}

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
    transition: opacity 0.15s;
    &:hover .fate-fan__card-inner {
      border-color: $accent-l;
      box-shadow: 0 0 16px rgba(199, 123, 60, 0.35);
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
    border: 1px solid rgba(199, 123, 60, 0.18);
    border-radius: 3px;
  }
  &__card-symbol {
    font-size: 18px;
    color: $card-sym;
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

// ══ 翻牌 ══
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
    color: $text-3;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-weight: 500;
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
    background: linear-gradient(135deg, $accent, $accent-l);
    color: #fff;
    box-shadow: 0 2px 8px rgba(199, 123, 60, 0.25);
    &:hover:not(:disabled) {
      box-shadow: 0 4px 16px rgba(199, 123, 60, 0.35);
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
