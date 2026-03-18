<script setup lang="ts">
/**
 * 占星骰子面板
 * 流程：提問 → 擲骰（動畫） → 結果 → AI 解讀
 */
import { useAstroDiceStore } from "@/stores/astroDice";
import { marked } from "marked";
import { computed, onMounted } from "vue";

const emit = defineEmits<{ back: [] }>();
const store = useAstroDiceStore();

// ===== 解讀 HTML =====
const interpretationHtml = computed(() => {
  if (!store.interpretation) return "";
  const raw = store.isInterpreting
    ? store.interpretation + "▌"
    : store.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

// ===== 格式化時間 =====
function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 返回邏輯 =====
function handleBack() {
  if (store.phase === "question") {
    emit("back");
    return;
  }
  if (store.phase === "roll") {
    store.goToPhase("question");
    return;
  }
  if (store.phase === "result") {
    store.goToPhase("question");
    return;
  }
  store.reset();
}

// ===== 開始擲骰 =====
function handleStartRoll() {
  if (!store.question.trim()) return;
  store.goToPhase("roll");
  store.rollDice();
}

onMounted(() => {
  if (!store.isHistoryLoaded) store.loadHistory();
});
</script>

<template>
  <div class="astro-dice">
    <!-- 提問階段 -->
    <div
      v-if="store.phase === 'question'"
      class="astro-phase astro-phase--question"
    >
      <div class="astro-intro">
        <div class="astro-intro__icon">🎲</div>
        <h2 class="astro-intro__title">占星骰子</h2>
        <p class="astro-intro__desc">
          擲出三顆骰子：行星、星座、宮位<br />
          適合問「方向性問題」，不適合「是非題」和「時間題」
        </p>
      </div>

      <div class="astro-tips">
        <div class="astro-tips__good">
          <h4>✓ 這樣問比較好</h4>
          <ul>
            <li>「這段感情接下來會怎麼發展？」</li>
            <li>「他對這段關係的真實態度是？」</li>
            <li>「我在工作上該留意什麼？」</li>
            <li>「做這個決定對我的影響是？」</li>
          </ul>
        </div>
        <div class="astro-tips__bad">
          <h4>✗ 這樣問不太行</h4>
          <ul>
            <li>「他到底愛不愛我？」→ 是非題</li>
            <li>「我幾歲會結婚？」→ 時間題</li>
            <li>「A 還是 B 比較好？」→ 要分開問</li>
          </ul>
        </div>
      </div>

      <section class="astro-question-section">
        <h3 class="astro-label">你的問題</h3>
        <textarea
          v-model="store.question"
          class="astro-question-input"
          placeholder="集中精神，讓問題在心中浮現…"
          spellcheck="false"
        />
      </section>

      <div class="astro-actions">
        <button class="astro-btn astro-btn--ghost" @click="handleBack">
          返回
        </button>
        <button
          class="astro-btn astro-btn--primary"
          :disabled="!store.question.trim()"
          @click="handleStartRoll"
        >
          擲骰子
        </button>
      </div>
    </div>

    <!-- 擲骰階段 -->
    <div v-if="store.phase === 'roll'" class="astro-phase astro-phase--roll">
      <h2 class="astro-phase__title">擲骰中...</h2>
      <p class="astro-phase__subtitle">集中精神，默念你的問題</p>

      <div class="astro-dice-display">
        <div
          class="astro-die astro-die--planet"
          :class="{ rolling: store.isRolling }"
        >
          <span class="astro-die__symbol">{{
            store.rollingPlanet?.symbol || "?"
          }}</span>
          <span class="astro-die__label">行星</span>
        </div>
        <div
          class="astro-die astro-die--sign"
          :class="{ rolling: store.isRolling }"
        >
          <span class="astro-die__symbol">{{
            store.rollingSign?.symbol || "?"
          }}</span>
          <span class="astro-die__label">星座</span>
        </div>
        <div
          class="astro-die astro-die--house"
          :class="{ rolling: store.isRolling }"
        >
          <span class="astro-die__symbol">{{
            store.rollingHouse?.romanNumeral || "?"
          }}</span>
          <span class="astro-die__label">宮位</span>
        </div>
      </div>
    </div>

    <!-- 結果階段 -->
    <div
      v-if="store.phase === 'result'"
      class="astro-phase astro-phase--result"
    >
      <h2 class="astro-phase__title">骰子結果</h2>
      <p class="astro-phase__subtitle">{{ store.question }}</p>

      <div class="astro-result-display">
        <div class="astro-result-item">
          <span class="astro-result-item__symbol">{{
            store.result?.planet.symbol
          }}</span>
          <span class="astro-result-item__name">{{
            store.result?.planet.nameCn
          }}</span>
          <span class="astro-result-item__type">行星</span>
        </div>
        <span class="astro-result-plus">+</span>
        <div class="astro-result-item">
          <span class="astro-result-item__symbol">{{
            store.result?.sign.symbol
          }}</span>
          <span class="astro-result-item__name">{{
            store.result?.sign.nameCn
          }}</span>
          <span class="astro-result-item__type">星座</span>
        </div>
        <span class="astro-result-plus">+</span>
        <div class="astro-result-item">
          <span class="astro-result-item__symbol">{{
            store.result?.house.romanNumeral
          }}</span>
          <span class="astro-result-item__name">{{
            store.result?.house.nameCn
          }}</span>
          <span class="astro-result-item__type">宮位</span>
        </div>
      </div>

      <div class="astro-result-keywords">
        <div class="astro-keyword-group">
          <span class="astro-keyword-label"
            >{{ store.result?.planet.nameCn }}：</span
          >
          <span class="astro-keyword-tags">{{
            store.result?.planet.keywords.join("、")
          }}</span>
        </div>
        <div class="astro-keyword-group">
          <span class="astro-keyword-label"
            >{{ store.result?.sign.nameCn }}：</span
          >
          <span class="astro-keyword-tags">{{
            store.result?.sign.keywords.join("、")
          }}</span>
        </div>
        <div class="astro-keyword-group">
          <span class="astro-keyword-label"
            >{{ store.result?.house.nameCn }}：</span
          >
          <span class="astro-keyword-tags">{{
            store.result?.house.keywords.join("、")
          }}</span>
        </div>
      </div>

      <div class="astro-actions">
        <button class="astro-btn astro-btn--ghost" @click="store.reset()">
          重新開始
        </button>
        <button
          class="astro-btn astro-btn--primary"
          :disabled="store.isInterpreting"
          @click="store.startInterpretation()"
        >
          請求解讀
        </button>
      </div>
    </div>

    <!-- 解讀階段 -->
    <div
      v-if="store.phase === 'interpret'"
      class="astro-phase astro-phase--interpret"
    >
      <div class="astro-mini-result">
        <span
          >{{ store.result?.planet.symbol }}
          {{ store.result?.planet.nameCn }}</span
        >
        <span>+</span>
        <span
          >{{ store.result?.sign.symbol }} {{ store.result?.sign.nameCn }}</span
        >
        <span>+</span>
        <span
          >{{ store.result?.house.romanNumeral }}
          {{ store.result?.house.nameCn }}</span
        >
      </div>

      <div class="astro-interpretation">
        <h3 class="astro-interpretation__title">✦ 骰子解讀 ✦</h3>
        <div v-if="store.interpretError" class="astro-interpretation__error">
          <p>⚠️ {{ store.interpretError }}</p>
          <p class="astro-interpretation__error-hint">
            請檢查 API 設定後重試。
          </p>
        </div>
        <div
          v-else-if="interpretationHtml"
          class="astro-interpretation__content"
          v-html="interpretationHtml"
        />
        <div
          v-else-if="store.isInterpreting"
          class="astro-interpretation__loading"
        >
          <div class="astro-interpretation__loading-icon">🔮</div>
          <p>正在解讀...</p>
        </div>
      </div>

      <div v-if="!store.isInterpreting" class="astro-actions">
        <button
          class="astro-btn astro-btn--ghost"
          @click="store.startInterpretation()"
        >
          重新解讀
        </button>
        <button class="astro-btn astro-btn--primary" @click="store.reset()">
          開始新的占卜
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$bg-s: #0f111a;
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
$accent-s: rgba(242, 139, 130, 0.12);
$r-sm: 8px;
$r-md: 12px;
$r-lg: 16px;

.astro-dice {
  width: 100%;
  max-width: 600px;
  padding: 0 16px;
}

.astro-phase {
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

// ===== 介紹區 =====
.astro-intro {
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

// ===== 提示區 =====
.astro-tips {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
  font-size: 13px;

  h4 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
  }
  ul {
    margin: 0;
    padding-left: 16px;
    li {
      margin-bottom: 4px;
      line-height: 1.5;
    }
  }
  &__good {
    background: rgba(134, 239, 172, 0.1);
    border: 1px solid rgba(134, 239, 172, 0.3);
    border-radius: $r-md;
    padding: 12px;
    h4 {
      color: #86efac;
    }
    color: $text-2;
  }
  &__bad {
    background: rgba(252, 165, 165, 0.1);
    border: 1px solid rgba(252, 165, 165, 0.3);
    border-radius: $r-md;
    padding: 12px;
    h4 {
      color: #fca5a5;
    }
    color: $text-2;
  }
}

// ===== 問題輸入 =====
.astro-question-section {
  margin-bottom: 24px;
}
.astro-label {
  font-size: 13px;
  font-weight: 600;
  color: $text-2;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 10px;
}
.astro-question-input {
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
.astro-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}
.astro-btn {
  padding: 12px 28px;
  border-radius: $r-md;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  &--primary {
    background: linear-gradient(135deg, $accent, #c084fc);
    color: #fff;
    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(242, 139, 130, 0.4);
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

// ===== 骰子顯示 =====
.astro-dice-display {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin: 40px 0;
}
.astro-die {
  width: 80px;
  height: 80px;
  background: linear-gradient(
    135deg,
    rgba(40, 32, 60, 0.9),
    rgba(22, 24, 38, 0.85)
  );
  border: 2px solid rgba(192, 132, 252, 0.4);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition: all 0.3s;

  &.rolling {
    animation: diceShake 0.1s infinite;
  }

  &__symbol {
    font-size: 32px;
    color: $accent-l;
  }
  &__label {
    font-size: 11px;
    color: $text-3;
  }
}

@keyframes diceShake {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}

// ===== 結果顯示 =====
.astro-result-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin: 24px 0;
  flex-wrap: wrap;
}
.astro-result-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 20px;
  background: $surface-h;
  border: 1px solid $border-m;
  border-radius: $r-lg;

  &__symbol {
    font-size: 36px;
    color: $accent-l;
  }
  &__name {
    font-size: 15px;
    font-weight: 600;
    color: $text-1;
  }
  &__type {
    font-size: 11px;
    color: $text-3;
  }
}
.astro-result-plus {
  font-size: 24px;
  color: $text-3;
}

// ===== 關鍵詞 =====
.astro-result-keywords {
  background: $surface;
  border-radius: $r-md;
  padding: 16px;
  margin-bottom: 16px;
}
.astro-keyword-group {
  margin-bottom: 8px;
  font-size: 13px;
  line-height: 1.6;
  &:last-child {
    margin-bottom: 0;
  }
}
.astro-keyword-label {
  color: $accent-l;
  font-weight: 600;
}
.astro-keyword-tags {
  color: $text-2;
}

// ===== 迷你結果 =====
.astro-mini-result {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: $surface;
  border-radius: $r-md;
  margin-bottom: 20px;
  font-size: 14px;
  color: $text-2;
}

// ===== 解讀區 =====
.astro-interpretation {
  background: $surface;
  border-radius: $r-lg;
  padding: 20px;
  min-height: 200px;

  &__title {
    text-align: center;
    font-size: 16px;
    font-weight: 600;
    color: $accent-l;
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
      color: $accent-l;
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
