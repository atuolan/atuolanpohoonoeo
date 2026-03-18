<script setup lang="ts">
/**
 * 雷諾曼牌面板
 * 流程：提問 → 選牌陣 → 洗牌 → 選牌（網格） → 結果 → AI 解讀
 */
import { lenormandSpreads } from "@/data/lenormandSpreads";
import { useLenormandStore } from "@/stores/lenormand";
import type { LenormandSpread } from "@/types/lenormand";
import { marked } from "marked";
import { computed, onMounted } from "vue";

const emit = defineEmits<{ back: [] }>();
const store = useLenormandStore();

const interpretationHtml = computed(() => {
  if (!store.interpretation) return "";
  const raw = store.isInterpreting
    ? store.interpretation + "▌"
    : store.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function handleBack() {
  if (store.phase === "question") {
    emit("back");
    return;
  }
  if (store.phase === "spread") {
    store.goToPhase("question");
    return;
  }
  if (store.phase === "shuffle") {
    store.goToPhase("spread");
    return;
  }
  if (store.phase === "pick") {
    store.goToPhase("shuffle");
    return;
  }
  if (store.phase === "result") {
    store.goToPhase("pick");
    return;
  }
  store.reset();
}

function handleSelectSpread(s: LenormandSpread) {
  store.selectSpread(s);
  store.goToPhase("shuffle");
}

onMounted(() => {
  if (!store.isHistoryLoaded) store.loadHistory();
});
</script>

<template>
  <div class="leno">
    <!-- 提問階段 -->
    <div v-if="store.phase === 'question'" class="leno-phase">
      <div class="leno-intro">
        <div class="leno-intro__icon">🃏</div>
        <h2 class="leno-intro__title">雷諾曼牌</h2>
        <p class="leno-intro__desc">
          36 張符號牌，解讀具體而實際<br />
          適合日常問題、感情、工作、財務
        </p>
      </div>

      <section class="leno-section">
        <h3 class="leno-label">你的問題</h3>
        <textarea
          v-model="store.question"
          class="leno-input"
          placeholder="集中精神，讓問題在心中浮現…"
          spellcheck="false"
        />
      </section>

      <div class="leno-actions">
        <button class="leno-btn leno-btn--ghost" @click="handleBack">
          返回
        </button>
        <button
          class="leno-btn leno-btn--primary"
          :disabled="!store.question.trim()"
          @click="store.goToPhase('spread')"
        >
          選擇牌陣
        </button>
      </div>
    </div>

    <!-- 選牌陣階段 -->
    <div v-if="store.phase === 'spread'" class="leno-phase">
      <h2 class="leno-phase__title">選擇牌陣</h2>
      <p class="leno-phase__subtitle">{{ store.question }}</p>

      <div class="leno-spread-list">
        <button
          v-for="s in lenormandSpreads"
          :key="s.id"
          class="leno-spread-item"
          :class="{ 'leno-spread-item--active': store.spread.id === s.id }"
          @click="handleSelectSpread(s)"
        >
          <div class="leno-spread-item__header">
            <span class="leno-spread-item__count"
              >{{ s.positions.length }} 張</span
            >
            <span class="leno-spread-item__name">{{ s.nameCn }}</span>
          </div>
          <p class="leno-spread-item__desc">{{ s.description }}</p>
          <div class="leno-spread-item__positions">
            <span
              v-for="pos in s.positions"
              :key="pos.id"
              class="leno-spread-item__pos"
              >{{ pos.nameCn }}</span
            >
          </div>
        </button>
      </div>

      <div class="leno-actions">
        <button class="leno-btn leno-btn--ghost" @click="handleBack">
          返回
        </button>
      </div>
    </div>

    <!-- 洗牌階段 -->
    <div v-if="store.phase === 'shuffle'" class="leno-phase">
      <h2 class="leno-phase__title">洗牌</h2>
      <p class="leno-phase__subtitle">集中精神，默念你的問題</p>

      <div
        class="leno-deck"
        :class="{ 'leno-deck--shuffling': store.isShuffling }"
        @click="store.shuffleDeck()"
      >
        <div
          v-for="i in 6"
          :key="i"
          class="leno-deck__card"
          :style="{ '--i': i - 1 }"
        >
          <span class="leno-deck__card-symbol">🃏</span>
        </div>
      </div>

      <div class="leno-shuffle-count">
        <span v-if="store.shuffleCount === 0">點擊牌堆開始洗牌</span>
        <span v-else>已洗 {{ store.shuffleCount }} 次</span>
      </div>

      <div class="leno-actions">
        <button class="leno-btn leno-btn--ghost" @click="handleBack">
          返回
        </button>
        <button
          class="leno-btn leno-btn--primary"
          :disabled="store.shuffleCount === 0 || store.isShuffling"
          @click="store.confirmShuffle()"
        >
          確認，開始選牌
        </button>
      </div>
    </div>

    <!-- 選牌階段（網格） -->
    <div v-if="store.phase === 'pick'" class="leno-phase">
      <div class="leno-pick-slots">
        <div
          v-for="(pos, idx) in store.spread.positions"
          :key="pos.id"
          class="leno-pick-slot"
          :class="{ 'leno-pick-slot--filled': idx < store.pickedCount }"
        >
          <span class="leno-pick-slot__label">{{ pos.nameCn }}</span>
          <span v-if="idx < store.pickedCount" class="leno-pick-slot__card">
            {{ store.drawnCards[idx]?.card.symbol }}
          </span>
          <span v-else class="leno-pick-slot__empty">?</span>
        </div>
      </div>

      <p class="leno-pick-hint">
        憑直覺選出 {{ store.requiredPicks }} 張牌（{{ store.pickedCount }} /
        {{ store.requiredPicks }}）
      </p>

      <div class="leno-grid">
        <button
          v-for="(card, index) in store.shuffledDeck"
          :key="index"
          class="leno-grid__card"
          :class="{ 'leno-grid__card--picked': store.pickedIndices.has(index) }"
          :disabled="
            store.pickedIndices.has(index) ||
            store.pickedCount >= store.requiredPicks
          "
          @click="store.pickCard(index)"
        >
          <!-- 背面：未選中顯示牌背 -->
          <div v-if="!store.pickedIndices.has(index)" class="leno-grid__back" />
          <span v-else class="leno-grid__check">✓</span>
        </button>
      </div>
    </div>

    <!-- 結果階段 -->
    <div v-if="store.phase === 'result'" class="leno-phase">
      <h2 class="leno-phase__title">{{ store.spread.nameCn }}</h2>
      <p class="leno-phase__subtitle">{{ store.question }}</p>

      <!-- 九宮格佈局 -->
      <div
        v-if="store.spread.id === 'nine-card'"
        class="leno-result-grid leno-result-grid--3x3"
      >
        <div
          v-for="drawn in store.drawnCards"
          :key="drawn.position.id"
          class="leno-result-card"
        >
          <span class="leno-result-card__pos">{{ drawn.position.nameCn }}</span>
          <img :src="drawn.card.image" :alt="drawn.card.nameCn" class="leno-result-card__img" />
          <span class="leno-result-card__name">{{ drawn.card.nameCn }}</span>
          <span class="leno-result-card__num">{{ drawn.card.number }}</span>
        </div>
      </div>

      <!-- 其他牌陣線性佈局 -->
      <div v-else class="leno-result-row">
        <div
          v-for="(drawn, idx) in store.drawnCards"
          :key="drawn.position.id"
          class="leno-result-card"
        >
          <span class="leno-result-card__pos">{{ drawn.position.nameCn }}</span>
          <img :src="drawn.card.image" :alt="drawn.card.nameCn" class="leno-result-card__img" />
          <span class="leno-result-card__name">{{ drawn.card.nameCn }}</span>
          <span class="leno-result-card__num">{{ drawn.card.number }}</span>
          <span
            v-if="idx < store.drawnCards.length - 1"
            class="leno-result-plus"
            >+</span
          >
        </div>
      </div>

      <!-- 關鍵詞 -->
      <div class="leno-keywords">
        <div
          v-for="drawn in store.drawnCards"
          :key="drawn.position.id"
          class="leno-keyword-row"
        >
          <span class="leno-keyword-label"
            >{{ drawn.card.symbol }} {{ drawn.card.nameCn }}：</span
          >
          <span class="leno-keyword-tags">{{
            drawn.card.keywords.join("、")
          }}</span>
        </div>
      </div>

      <div class="leno-actions">
        <button class="leno-btn leno-btn--ghost" @click="store.reset()">
          重新開始
        </button>
        <button
          class="leno-btn leno-btn--primary"
          :disabled="store.isInterpreting"
          @click="store.startInterpretation()"
        >
          請求解讀
        </button>
      </div>
    </div>

    <!-- 解讀階段 -->
    <div v-if="store.phase === 'interpret'" class="leno-phase">
      <div class="leno-mini-result">
        <span
          v-for="(drawn, idx) in store.drawnCards"
          :key="drawn.position.id"
          class="leno-mini-card"
        >
          <img :src="drawn.card.image" :alt="drawn.card.nameCn" class="leno-mini-card__img" />
          <span v-if="idx < store.drawnCards.length - 1" class="leno-mini-plus"
            >+</span
          >
        </span>
      </div>

      <div class="leno-interpretation">
        <h3 class="leno-interpretation__title">✦ 牌義解讀 ✦</h3>
        <div v-if="store.interpretError" class="leno-interpretation__error">
          <p>⚠️ {{ store.interpretError }}</p>
          <p class="leno-interpretation__error-hint">請檢查 API 設定後重試。</p>
        </div>
        <div
          v-else-if="interpretationHtml"
          class="leno-interpretation__content"
          v-html="interpretationHtml"
        />
        <div
          v-else-if="store.isInterpreting"
          class="leno-interpretation__loading"
        >
          <div class="leno-interpretation__loading-icon">🔮</div>
          <p>正在解讀...</p>
        </div>
      </div>

      <div v-if="!store.isInterpreting" class="leno-actions">
        <button
          class="leno-btn leno-btn--ghost"
          @click="store.startInterpretation()"
        >
          重新解讀
        </button>
        <button class="leno-btn leno-btn--primary" @click="store.reset()">
          開始新的占卜
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$surface: rgba(22, 24, 38, 0.6);
$surface-h: rgba(30, 34, 54, 0.8);
$border-l: rgba(255, 255, 255, 0.08);
$border-m: rgba(255, 255, 255, 0.15);
$text-1: #e2e4f0;
$text-2: #b0b5cc;
$text-3: #7b82a3;
$text-m: #4e5573;
$accent: #f28b82;
$accent-l: #ffdfa3;
$r-sm: 8px;
$r-md: 12px;
$r-lg: 16px;

.leno {
  width: 100%;
  max-width: 600px;
  padding: 0 16px;
}

.leno-phase {
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
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

// ===== 介紹 =====
.leno-intro {
  text-align: center;
  margin-bottom: 24px;
  &__icon {
    font-size: 48px;
    margin-bottom: 12px;
  }
  &__title {
    font-size: 24px;
    font-weight: 700;
    color: $text-1;
    margin-bottom: 8px;
  }
  &__desc {
    font-size: 14px;
    color: $text-3;
    line-height: 1.6;
  }
}

// ===== 輸入 =====
.leno-section {
  margin-bottom: 24px;
}
.leno-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}
.leno-input {
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
  font-family: inherit;
  box-sizing: border-box;
  &::placeholder {
    color: $text-m;
  }
  &:focus {
    outline: none;
    border-color: $accent;
  }
}

// ===== 按鈕 =====
.leno-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}
.leno-btn {
  padding: 12px 28px;
  border-radius: $r-md;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  &--primary {
    background: linear-gradient(135deg, #a78bfa, #c084fc);
    color: #fff;
    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(167, 139, 250, 0.4);
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
  &--ghost {
    background: transparent;
    border: 1px solid $border-m;
    color: $text-2;
    &:hover {
      background: $surface-h;
      color: $text-1;
    }
  }
}

// ===== 牌陣選擇 =====
.leno-spread-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 8px;
}
.leno-spread-item {
  background: $surface;
  border: 1px solid $border-l;
  border-radius: $r-lg;
  padding: 16px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  &:hover {
    border-color: rgba(167, 139, 250, 0.4);
    background: $surface-h;
  }
  &--active {
    border-color: rgba(167, 139, 250, 0.6);
    background: rgba(167, 139, 250, 0.1);
  }
  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }
  &__count {
    background: rgba(167, 139, 250, 0.2);
    color: #a78bfa;
    padding: 2px 8px;
    border-radius: 100px;
    font-size: 12px;
    font-weight: 600;
  }
  &__name {
    font-size: 16px;
    font-weight: 600;
    color: $text-1;
  }
  &__desc {
    font-size: 13px;
    color: $text-3;
    margin-bottom: 8px;
    line-height: 1.5;
  }
  &__positions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  &__pos {
    font-size: 11px;
    color: $text-3;
    background: rgba(255, 255, 255, 0.05);
    padding: 2px 6px;
    border-radius: 4px;
  }
}

// ===== 牌堆 =====
.leno-deck {
  position: relative;
  width: 80px;
  height: 110px;
  margin: 40px auto;
  cursor: pointer;
  &__card {
    position: absolute;
    width: 80px;
    height: 110px;
    background: linear-gradient(
      135deg,
      rgba(40, 32, 60, 0.9),
      rgba(22, 24, 38, 0.85)
    );
    border: 1.5px solid rgba(167, 139, 250, 0.4);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    transform: translateX(calc(var(--i) * -2px))
      translateY(calc(var(--i) * -2px));
    transition: transform 0.3s;
    &-symbol {
      pointer-events: none;
    }
  }
  &--shuffling .leno-deck__card {
    animation: cardShuffle 0.6s ease-in-out;
  }
}

@keyframes cardShuffle {
  0%,
  100% {
    transform: translateX(calc(var(--i) * -2px))
      translateY(calc(var(--i) * -2px));
  }
  50% {
    transform: translateX(calc(var(--i) * -2px + 20px))
      translateY(calc(var(--i) * -2px - 10px)) rotate(5deg);
  }
}

.leno-shuffle-count {
  text-align: center;
  font-size: 14px;
  color: $text-3;
  margin-bottom: 8px;
}

// ===== 選牌槽 =====
.leno-pick-slots {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 16px;
}
.leno-pick-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  background: $surface;
  border: 1px solid $border-l;
  border-radius: $r-md;
  min-width: 60px;
  &--filled {
    border-color: rgba(167, 139, 250, 0.5);
    background: rgba(167, 139, 250, 0.1);
  }
  &__label {
    font-size: 11px;
    color: $text-3;
  }
  &__card {
    font-size: 20px;
  }
  &__empty {
    font-size: 16px;
    color: $text-m;
  }
}

.leno-pick-hint {
  text-align: center;
  font-size: 13px;
  color: $text-3;
  margin-bottom: 16px;
}

// ===== 選牌網格 =====
.leno-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
  margin-bottom: 8px;
  &__card {
    aspect-ratio: 2/3;
    background: linear-gradient(
      135deg,
      rgba(40, 32, 60, 0.9),
      rgba(22, 24, 38, 0.85)
    );
    border: 1px solid rgba(167, 139, 250, 0.3);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.2s;
    overflow: hidden;
    padding: 0;
    &:hover:not(:disabled):not(.leno-grid__card--picked) {
      border-color: rgba(167, 139, 250, 0.7);
      transform: translateY(-2px);
    }
    &--picked {
      background: rgba(167, 139, 250, 0.2);
      border-color: rgba(167, 139, 250, 0.6);
      color: #a78bfa;
      cursor: default;
    }
    &:disabled:not(.leno-grid__card--picked) {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
  &__back {
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #2a1f4a, #1a1828);
    border-radius: 5px;
    background-image: repeating-linear-gradient(
      45deg,
      rgba(167, 139, 250, 0.05) 0px,
      rgba(167, 139, 250, 0.05) 1px,
      transparent 1px,
      transparent 8px
    );
  }
  &__check {
    font-size: 14px;
    color: #a78bfa;
  }
}

// ===== 結果 =====
.leno-result-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin: 20px 0;
}
.leno-result-grid--3x3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin: 20px 0;
}
.leno-result-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background: $surface-h;
  border: 1px solid $border-m;
  border-radius: $r-md;
  &__pos {
    font-size: 11px;
    color: $text-3;
  }
  &__img {
    width: 60px;
    height: 90px;
    object-fit: cover;
    border-radius: 4px;
    display: block;
  }
  &__name {
    font-size: 13px;
    font-weight: 600;
    color: $text-1;
  }
  &__num {
    font-size: 11px;
    color: $text-m;
  }
}
.leno-result-plus {
  font-size: 20px;
  color: $text-3;
  align-self: center;
}

// ===== 關鍵詞 =====
.leno-keywords {
  background: $surface;
  border-radius: $r-md;
  padding: 16px;
  margin-bottom: 8px;
}
.leno-keyword-row {
  font-size: 13px;
  line-height: 1.6;
  margin-bottom: 6px;
  &:last-child {
    margin-bottom: 0;
  }
}
.leno-keyword-label {
  color: #a78bfa;
  font-weight: 600;
}
.leno-keyword-tags {
  color: $text-2;
}

// ===== 迷你結果 =====
.leno-mini-result {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px;
  background: $surface;
  border-radius: $r-md;
  margin-bottom: 20px;
}
.leno-mini-card {
  display: flex;
  align-items: center;
  gap: 6px;
  &__img {
    width: 36px;
    height: 54px;
    object-fit: cover;
    border-radius: 3px;
    display: block;
  }
}
.leno-mini-plus {
  font-size: 14px;
  color: $text-3;
  margin: 0 2px;
}

// ===== 解讀 =====
.leno-interpretation {
  background: $surface;
  border-radius: $r-lg;
  padding: 20px;
  min-height: 200px;
  &__title {
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: #a78bfa;
    margin-bottom: 16px;
  }
  &__content {
    color: $text-1;
    font-size: 15px;
    line-height: 1.8;
    :deep(p) {
      margin-bottom: 12px;
    }
    :deep(strong) {
      color: #a78bfa;
    }
  }
  &__loading {
    text-align: center;
    padding: 40px 0;
    color: $text-3;
    &-icon {
      font-size: 32px;
      margin-bottom: 12px;
      animation: pulse 1.5s infinite;
    }
  }
  &__error {
    text-align: center;
    color: #fca5a5;
    &-hint {
      font-size: 13px;
      color: $text-3;
      margin-top: 8px;
    }
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
