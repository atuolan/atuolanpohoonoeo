<script setup lang="ts">
/**
 * OraclePanel — 神諭卡占卜面板
 * 流程：提問+選牌陣 → 洗牌 → 選牌（網格） → 翻牌揭示 → AI 解讀
 * 風格統一塔羅/雷諾曼
 */
import SpreadLayoutView from '@/components/fate/SpreadLayoutView.vue'
import { ORACLE_SPREADS } from '@/data/oracleSpreads'
import { useOracleStore } from '@/stores/oracle'
import { computed, onMounted, ref } from 'vue'
import { marked } from 'marked'

const store = useOracleStore()

// ── 洗牌動畫 ─────────────────────────────────────────────
const isShuffling = ref(false)
const shuffleCount = ref(0)

async function handleShuffle() {
  if (isShuffling.value) return
  isShuffling.value = true
  store.shuffleDeck()
  shuffleCount.value++
  await new Promise(r => setTimeout(r, 1200))
  isShuffling.value = false
}

// ── 牌陣篩選 ─────────────────────────────────────────────
const spreadFilterCount = ref(-1)
const expandedSpreadId = ref<string | null>(null)

const spreadCountOptions = computed(() => {
  const counts = [...new Set(ORACLE_SPREADS.map(s => s.cardCount))].sort((a, b) => a - b)
  return counts
})

const filteredSpreads = computed(() => {
  if (spreadFilterCount.value === -1) return ORACLE_SPREADS
  return ORACLE_SPREADS.filter(s => s.cardCount === spreadFilterCount.value)
})

function selectSpread(s: typeof ORACLE_SPREADS[0]) {
  store.selectSpread(s)
  expandedSpreadId.value = expandedSpreadId.value === s.id ? null : s.id
}

// ── 翻牌 ─────────────────────────────────────────────────
function handleRevealCard(index: number) {
  if (index === store.revealedCount) {
    store.revealNextCard()
  }
}

const currentRevealCard = computed(() => {
  if (store.revealedCount === 0) return null
  return store.drawnCards[store.revealedCount - 1]
})

// ── 解讀 ─────────────────────────────────────────────────
const interpretationHtml = computed(() => {
  if (!store.interpretation) return ''
  const raw = store.isInterpreting
    ? store.interpretation + '▌'
    : store.interpretation
  return marked.parse(raw, { async: false }) as string
})

// ── 歷史 ─────────────────────────────────────────────────
const showHistory = ref(false)
const expandedReadingId = ref<string | null>(null)

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── 返回邏輯 ─────────────────────────────────────────────
function handleBack() {
  if (showHistory.value) {
    showHistory.value = false
    return
  }
  if (store.phase === 'setup') {
    store.goToPhase('home')
    return
  }
  if (store.phase === 'shuffle') {
    store.goToPhase('setup')
    shuffleCount.value = 0
    return
  }
  if (store.phase === 'pick') {
    store.goToPhase('shuffle')
    return
  }
  // reveal / interpret → 重置
  store.reset()
}

onMounted(() => {
  if (!store.isHistoryLoaded) store.loadHistory()
})
</script>

<template>
  <div class="orc">
    <!-- ══ 首頁 ══ -->
    <div v-if="store.phase === 'home' && !showHistory" class="orc-phase">
      <div class="orc-intro">
        <div class="orc-intro__icon">🌙</div>
        <h2 class="orc-intro__title">神諭卡</h2>
        <p class="orc-intro__desc">
          讓宇宙的訊息引領你<br />
          適合靈性指引、自我探索、日常啟示
        </p>
      </div>
      <div class="orc-actions">
        <button class="orc-btn orc-btn--primary" @click="store.goToPhase('setup')">
          ✨ 開始占卜
        </button>
        <button class="orc-btn orc-btn--ghost" @click="showHistory = true">
          📜 歷史記錄
        </button>
      </div>
    </div>

    <!-- ══ 歷史記錄 ══ -->
    <div v-if="showHistory" class="orc-phase">
      <div class="orc-history__header">
        <h2>占卜歷史</h2>
        <button v-if="store.readings.length > 0" class="orc-btn orc-btn--text orc-btn--danger" @click="store.clearHistory()">
          清空
        </button>
      </div>
      <div v-if="store.readings.length === 0" class="orc-history__empty">
        <div class="orc-history__empty-icon">🌙</div>
        <p>尚無占卜記錄</p>
      </div>
      <div v-else class="orc-history__list">
        <div
          v-for="reading in store.readings"
          :key="reading.id"
          class="orc-history__item"
          @click="expandedReadingId = expandedReadingId === reading.id ? null : reading.id"
        >
          <div class="orc-history__item-meta">
            <span class="orc-history__item-spread">{{ reading.spread.name }}</span>
            <span class="orc-history__item-date">{{ formatTime(reading.createdAt) }}</span>
          </div>
          <div class="orc-history__item-question">{{ reading.question || '（無問題）' }}</div>
          <div v-if="expandedReadingId === reading.id && reading.interpretation" class="orc-history__item-content">
            {{ reading.interpretation.substring(0, 200) }}...
          </div>
          <div class="orc-history__item-footer">
            <span class="orc-history__item-hint">點擊展開 →</span>
            <button class="orc-btn orc-btn--text orc-btn--danger" @click.stop="store.deleteReading(reading.id)">
              刪除
            </button>
          </div>
        </div>
      </div>
      <div class="orc-actions">
        <button class="orc-btn orc-btn--ghost" @click="showHistory = false">返回</button>
      </div>
    </div>

    <!-- ══ 提問 + 選牌陣（合併） ══ -->
    <div v-if="store.phase === 'setup'" class="orc-phase">
      <section class="orc-section">
        <h3 class="orc-label">你的問題</h3>
        <textarea
          v-model="store.question"
          class="orc-input"
          placeholder="集中精神，讓問題在心中浮現…"
          spellcheck="false"
        />
      </section>

      <section class="orc-section">
        <h3 class="orc-label">選擇牌陣</h3>
        <div class="orc-filter">
          <button
            :class="['orc-filter__tab', { 'orc-filter__tab--active': spreadFilterCount === -1 }]"
            @click="spreadFilterCount = -1"
          >全部</button>
          <button
            v-for="count in spreadCountOptions"
            :key="count"
            :class="['orc-filter__tab', { 'orc-filter__tab--active': spreadFilterCount === count }]"
            @click="spreadFilterCount = count"
          >{{ count }}張</button>
        </div>
        <div class="orc-spread-list">
          <div
            v-for="s in filteredSpreads"
            :key="s.id"
            :class="['orc-spread-item', { 'orc-spread-item--active': store.spread.id === s.id }]"
            @click="selectSpread(s)"
          >
            <div class="orc-spread-item__left">
              <span class="orc-spread-item__count">{{ s.cardCount }}</span>
            </div>
            <div class="orc-spread-item__body">
              <div class="orc-spread-item__name">{{ s.name }}</div>
              <div class="orc-spread-item__subtitle">{{ s.subtitle }}</div>
              <div v-if="expandedSpreadId === s.id" class="orc-spread-item__desc">
                {{ s.description }}
              </div>
            </div>
            <div class="orc-spread-item__tags">
              <span v-for="tag in s.tags.slice(0, 2)" :key="tag" class="orc-tag">{{ tag }}</span>
            </div>
          </div>
        </div>
      </section>

      <div class="orc-actions">
        <button class="orc-btn orc-btn--ghost" @click="handleBack">返回</button>
        <button
          class="orc-btn orc-btn--primary"
          :disabled="!store.question.trim()"
          @click="store.confirmSetup(); shuffleCount = 0"
        >開始占卜</button>
      </div>
    </div>

    <!-- ══ 洗牌 ══ -->
    <div v-if="store.phase === 'shuffle'" class="orc-phase orc-phase--center">
      <h2 class="orc-phase__title">靜心洗牌</h2>
      <p class="orc-phase__subtitle">
        閉上眼睛，深呼吸，默念你的問題<br />
        <span class="orc-hint">點擊牌堆洗牌</span>
      </p>

      <div class="orc-deck" :class="{ 'orc-deck--shuffling': isShuffling }" @click="handleShuffle">
        <div v-for="i in 10" :key="i" class="orc-deck__card" :style="{ '--i': i - 1 }">
          <span class="orc-deck__card-symbol">✦</span>
        </div>
      </div>

      <div class="orc-shuffle-count">
        <span v-if="shuffleCount === 0">點擊牌堆開始洗牌</span>
        <span v-else>已洗 {{ shuffleCount }} 次</span>
      </div>

      <div class="orc-actions">
        <button class="orc-btn orc-btn--ghost" @click="handleBack">返回</button>
        <button
          class="orc-btn orc-btn--primary"
          :disabled="shuffleCount === 0 || isShuffling"
          @click="store.confirmShuffle()"
        >確認，開始選牌</button>
      </div>
    </div>

    <!-- ══ 選牌（網格） ══ -->
    <div v-if="store.phase === 'pick'" class="orc-phase">
      <div class="orc-pick-slots">
        <div
          v-for="(pos, idx) in store.spread.positions"
          :key="pos.id"
          class="orc-pick-slot"
          :class="{ 'orc-pick-slot--filled': idx < store.pickedCount }"
        >
          <span class="orc-pick-slot__label">{{ pos.name }}</span>
          <span v-if="idx < store.pickedCount" class="orc-pick-slot__card">
            {{ store.drawnCards[idx]?.card.symbol }}
          </span>
          <span v-else class="orc-pick-slot__empty">?</span>
        </div>
      </div>

      <p class="orc-pick-hint">
        憑直覺選出 {{ store.requiredPicks }} 張牌（{{ store.pickedCount }} / {{ store.requiredPicks }}）
      </p>

      <div class="orc-grid">
        <button
          v-for="(_card, index) in store.shuffledDeck.slice(0, 21)"
          :key="index"
          class="orc-grid__card"
          :class="{ 'orc-grid__card--picked': store.pickedIndices.has(index) }"
          :disabled="store.pickedIndices.has(index) || store.pickedCount >= store.requiredPicks"
          @click="store.pickCard(index)"
        >
          <div v-if="!store.pickedIndices.has(index)" class="orc-grid__back" />
          <span v-else class="orc-grid__check">✓</span>
        </button>
      </div>
    </div>

    <!-- ══ 翻牌揭示 ══ -->
    <div v-if="store.phase === 'reveal'" class="orc-phase">
      <h2 class="orc-phase__title">
        {{ store.allRevealed ? '神諭揭曉' : '點擊翻開牌面' }}
      </h2>
      <p class="orc-phase__subtitle">{{ store.spread.name }} · {{ store.question }}</p>

      <SpreadLayoutView
        :spread="store.spread"
        :drawn-cards="store.drawnCards"
        :revealed-count="store.revealedCount"
        @reveal-card="handleRevealCard"
      />

      <!-- 當前翻開的牌詳情 -->
      <div v-if="currentRevealCard" class="orc-reveal-detail">
        <img
          v-if="currentRevealCard.card.image && !currentRevealCard.card.image.endsWith('.svg')"
          :src="currentRevealCard.card.image"
          :alt="currentRevealCard.card.name"
          class="orc-reveal-detail__img"
        />
        <div v-else class="orc-reveal-detail__symbol" :style="{ color: currentRevealCard.card.color }">
          {{ currentRevealCard.card.symbol }}
        </div>
        <div class="orc-reveal-detail__name">{{ currentRevealCard.card.name }}</div>
        <div class="orc-reveal-detail__position">{{ currentRevealCard.position.name }}</div>
        <p class="orc-reveal-detail__message">「{{ currentRevealCard.card.message }}」</p>
        <div class="orc-reveal-detail__keywords">
          <span v-for="kw in currentRevealCard.card.keywords" :key="kw" class="orc-tag">{{ kw }}</span>
        </div>
      </div>

      <div class="orc-actions">
        <button
          v-if="!store.allRevealed"
          class="orc-btn orc-btn--ghost"
          @click="store.revealAllCards()"
        >全部翻開</button>
        <template v-if="store.allRevealed">
          <button class="orc-btn orc-btn--ghost" @click="store.reset()">重新開始</button>
          <button
            class="orc-btn orc-btn--primary"
            :disabled="store.isInterpreting"
            @click="store.startInterpretation()"
          >{{ store.isInterpreting ? '正在聆聽神諭...' : '請求神諭' }}</button>
        </template>
      </div>
    </div>

    <!-- ══ AI 解讀 ══ -->
    <div v-if="store.phase === 'interpret'" class="orc-phase">
      <div class="orc-mini-cards">
        <span
          v-for="drawn in store.drawnCards"
          :key="drawn.position.id"
          class="orc-mini-card"
          :style="{ color: drawn.card.color }"
        >{{ drawn.card.symbol }}</span>
      </div>

      <div class="orc-interpretation">
        <h3 class="orc-interpretation__title">✦ 神諭降臨 ✦</h3>
        <div v-if="store.interpretError" class="orc-interpretation__error">
          <p>⚠️ {{ store.interpretError }}</p>
          <p class="orc-interpretation__error-hint">請檢查 API 設定後重試。</p>
        </div>
        <div v-else-if="interpretationHtml" class="orc-interpretation__content" v-html="interpretationHtml" />
        <div v-else-if="store.isInterpreting" class="orc-interpretation__loading">
          <div class="orc-interpretation__loading-icon">🔮</div>
          <p>正在通靈...</p>
        </div>
      </div>

      <div v-if="!store.isInterpreting" class="orc-actions">
        <button class="orc-btn orc-btn--ghost" @click="store.startInterpretation()">重新解讀</button>
        <button class="orc-btn orc-btn--primary" @click="store.reset()">開始新的占卜</button>
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
$accent: #c77dff;
$accent-s: rgba(199, 125, 255, 0.12);
$accent-b: rgba(199, 125, 255, 0.25);
$card-bg: rgba(22, 24, 38, 0.8);
$card-bg2: rgba(32, 35, 54, 0.9);
$card-border: rgba(199, 125, 255, 0.4);
$card-sym: rgba(200, 170, 255, 0.85);
$r-sm: 8px;
$r-md: 12px;
$r-lg: 16px;

.orc {
  width: 100%;
  max-width: 600px;
  padding: 0 16px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 24px;
}

.orc-phase {
  animation: orcFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  &--center { display: flex; flex-direction: column; align-items: center; }
  &__title {
    font-size: 22px; font-weight: 700; color: $text-1;
    margin-bottom: 8px; text-align: center;
  }
  &__subtitle {
    font-size: 14px; color: $text-3; margin-bottom: 20px;
    text-align: center; line-height: 1.6;
  }
}

@keyframes orcFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

// ── 介紹 ──
.orc-intro {
  text-align: center; margin-bottom: 24px;
  &__icon { font-size: 48px; margin-bottom: 12px; animation: moonFloat 4s ease-in-out infinite; }
  &__title { font-size: 24px; font-weight: 700; color: $accent; margin-bottom: 8px; }
  &__desc { font-size: 14px; color: $text-3; line-height: 1.6; }
}
@keyframes moonFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

// ── 輸入 ──
.orc-section { margin-bottom: 24px; }
.orc-label {
  font-size: 13px; font-weight: 600; color: $text-2;
  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px;
}
.orc-input {
  width: 100%; min-height: 100px; padding: 14px 16px;
  background: $surface; border: 1px solid $border-m; border-radius: $r-lg;
  color: $text-1; font-size: 15px; resize: none; line-height: 1.7;
  font-family: inherit; box-sizing: border-box;
  &::placeholder { color: $text-m; }
  &:focus { outline: none; border-color: $accent; }
}

// ── 篩選 ──
.orc-filter {
  display: flex; gap: 6px; margin-bottom: 12px; flex-wrap: wrap;
  &__tab {
    padding: 4px 12px; border-radius: 100px; font-size: 12px;
    background: $surface; border: 1px solid $border-l; color: $text-3;
    cursor: pointer; transition: all 0.2s;
    &--active { background: $accent-s; border-color: $accent; color: $accent; }
    &:hover:not(&--active) { border-color: $border-m; }
  }
}

// ── 牌陣列表 ──
.orc-spread-list { display: flex; flex-direction: column; gap: 8px; }
.orc-spread-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px; background: $surface; border: 1px solid $border-l;
  border-radius: $r-md; cursor: pointer; transition: all 0.2s;
  &:hover { border-color: rgba(199, 125, 255, 0.3); background: $surface-h; }
  &--active { border-color: $accent; background: $accent-s; }
  &__left { flex-shrink: 0; }
  &__count {
    display: flex; align-items: center; justify-content: center;
    width: 32px; height: 32px; border-radius: 50%;
    background: $accent-s; color: $accent; font-size: 14px; font-weight: 700;
  }
  &__body { flex: 1; min-width: 0; }
  &__name { font-size: 15px; font-weight: 600; color: $text-1; }
  &__subtitle { font-size: 12px; color: $text-3; margin-top: 2px; }
  &__desc { font-size: 12px; color: $text-3; margin-top: 6px; line-height: 1.5; }
  &__tags { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }
}
.orc-tag {
  font-size: 10px; padding: 2px 6px; border-radius: 100px;
  background: $accent-s; color: rgba(200, 170, 255, 0.7);
  border: 1px solid rgba(199, 125, 255, 0.2);
}

// ── 按鈕 ──
.orc-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }
.orc-btn {
  padding: 12px 28px; border-radius: $r-md; font-size: 15px;
  font-weight: 600; cursor: pointer; transition: all 0.2s; border: none;
  &--primary {
    background: linear-gradient(135deg, #7b2ff7, #c77dff); color: #fff;
    &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(123, 47, 247, 0.4); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
  &--ghost {
    background: transparent; border: 1px solid $border-m; color: $text-2;
    &:hover { background: $surface-h; color: $text-1; }
  }
  &--text {
    background: none; border: none; color: $text-3; padding: 4px 8px; font-size: 12px;
    &:hover { color: $accent; }
  }
  &--danger:hover { color: #ff8080 !important; }
}

.orc-hint {
  font-size: 11px; color: $text-m;
  animation: fadeInOut 4s ease-in-out infinite;
}
@keyframes fadeInOut {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

// ── 牌堆（riffle shuffle） ──
.orc-deck {
  position: relative; width: 80px; height: 120px;
  margin: 32px auto; cursor: pointer; perspective: 800px;
  &__card {
    position: absolute; width: 60px; height: 88px; border-radius: $r-sm;
    background: linear-gradient(135deg, rgba(103, 58, 183, 0.7), rgba(63, 81, 181, 0.7));
    border: 1.5px solid $card-border; display: flex;
    align-items: center; justify-content: center;
    top: calc(var(--i) * 1.2px); left: calc(10px + var(--i) * 0.8px);
    z-index: calc(10 - var(--i)); transition: all 0.3s;
    backface-visibility: hidden;
  }
  &__card-symbol { font-size: 18px; color: $card-sym; pointer-events: none; }
  &--shuffling .orc-deck__card {
    animation: orcRiffle 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
    --side: 1;
    &:nth-child(odd) { --side: -1; }
    animation-delay: calc(var(--i) * 0.02s);
  }
}
@keyframes orcRiffle {
  0% { transform: translate(0, 0) rotate(0deg); z-index: calc(10 - var(--i)); }
  20% { transform: translate(calc(var(--side) * 44px), calc(var(--i) * -1.5px)) rotate(calc(var(--side) * 3deg)); }
  45% { transform: translate(calc(var(--side) * 22px), calc(-16px - var(--i) * 3px)) rotate(calc(var(--side) * -2deg)); z-index: calc(var(--i) + 5); }
  70% { transform: translate(calc(var(--side) * 3px), calc(-4px + var(--i) * 0.8px)) rotate(calc(var(--side) * -0.5deg)); z-index: calc(10 - var(--i)); }
  100% { transform: translate(0, 0) rotate(0deg); z-index: calc(10 - var(--i)); }
}

.orc-shuffle-count {
  text-align: center; font-size: 14px; color: $text-3; margin-bottom: 8px;
}

// ── 選牌槽 ──
.orc-pick-slots {
  display: flex; flex-wrap: wrap; gap: 8px;
  justify-content: center; margin-bottom: 16px;
}
.orc-pick-slot {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 8px 12px; background: $surface; border: 1px solid $border-l;
  border-radius: $r-md; min-width: 60px;
  &--filled { border-color: $accent; background: $accent-s; }
  &__label { font-size: 10px; color: $text-3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px; }
  &__card { font-size: 20px; }
  &__empty { font-size: 16px; color: $text-m; }
}
.orc-pick-hint {
  text-align: center; font-size: 13px; color: $text-3; margin-bottom: 16px;
}

// ── 選牌網格 ──
.orc-grid {
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-bottom: 8px;
  &__card {
    aspect-ratio: 2/3;
    background: linear-gradient(135deg, rgba(103, 58, 183, 0.6), rgba(63, 81, 181, 0.6));
    border: 1px solid rgba(200, 170, 255, 0.25); border-radius: 6px;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: all 0.2s; overflow: hidden; padding: 0;
    &:hover:not(:disabled):not(.orc-grid__card--picked) {
      border-color: $accent; transform: translateY(-2px);
    }
    &--picked {
      background: $accent-s; border-color: $accent; color: $accent; cursor: default;
    }
    &:disabled:not(.orc-grid__card--picked) { opacity: 0.4; cursor: not-allowed; }
  }
  &__back {
    width: 100%; height: 100%; border-radius: 5px;
    background: linear-gradient(135deg, #2a1f4a, #1a1828);
    background-image: repeating-linear-gradient(
      45deg, rgba(199, 125, 255, 0.05) 0px, rgba(199, 125, 255, 0.05) 1px,
      transparent 1px, transparent 8px
    );
  }
  &__check { font-size: 14px; color: $accent; }
}

// ── 翻牌詳情 ──
.orc-reveal-detail {
  margin-top: 16px; padding: 16px; text-align: center;
  background: rgba(199, 125, 255, 0.07); border: 1px solid rgba(199, 125, 255, 0.25);
  border-radius: $r-lg;
  &__symbol { font-size: 32px; margin-bottom: 4px; }
  &__img {
    width: 80px; height: 120px; object-fit: cover;
    border-radius: 8px; margin: 0 auto 8px; display: block;
  }
  &__name { font-size: 18px; font-weight: 700; color: $accent; }
  &__position { font-size: 12px; color: $text-3; margin-bottom: 8px; }
  &__message { font-size: 14px; font-style: italic; color: rgba(230, 220, 255, 0.9); line-height: 1.6; margin: 0 0 8px; }
  &__keywords { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; }
}

// ── 迷你卡 ──
.orc-mini-cards {
  display: flex; flex-wrap: wrap; justify-content: center;
  gap: 8px; margin-bottom: 20px; font-size: 28px;
}

// ── 解讀 ──
.orc-interpretation {
  width: 100%; background: $surface; border: 1px solid $border-l;
  border-radius: $r-lg; padding: 20px; min-height: 200px;
  &__title { text-align: center; font-size: 16px; font-weight: 600; color: $accent; margin-bottom: 16px; }
  &__content {
    color: $text-1; font-size: 15px; line-height: 1.8;
    :deep(p) { margin-bottom: 12px; }
    :deep(strong) { color: $accent; }
  }
  &__loading {
    text-align: center; padding: 40px 0; color: $text-3;
    &-icon { font-size: 32px; margin-bottom: 12px; animation: pulse 1.5s infinite; }
  }
  &__error {
    text-align: center; color: #fca5a5;
    &-hint { font-size: 13px; color: $text-3; margin-top: 8px; }
  }
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

// ── 歷史 ──
.orc-history {
  &__header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 16px;
    h2 { font-size: 20px; font-weight: 700; color: $text-1; margin: 0; }
  }
  &__empty {
    text-align: center; padding: 40px 0; color: $text-3;
    &-icon { font-size: 40px; margin-bottom: 12px; }
  }
  &__list { display: flex; flex-direction: column; gap: 8px; }
  &__item {
    background: $surface; border: 1px solid $border-l; border-radius: $r-md;
    padding: 12px; cursor: pointer; transition: border-color 0.2s;
    &:hover { border-color: rgba(199, 125, 255, 0.3); }
  }
  &__item-meta {
    display: flex; justify-content: space-between; font-size: 11px; color: $text-m; margin-bottom: 4px;
  }
  &__item-spread { color: $accent; font-weight: 600; }
  &__item-question { font-size: 13px; color: $text-2; margin-bottom: 4px; }
  &__item-content {
    font-size: 12px; color: $text-3; line-height: 1.6;
    padding: 8px; background: rgba(0, 0, 0, 0.2); border-radius: $r-sm; margin: 6px 0;
  }
  &__item-footer { display: flex; justify-content: space-between; align-items: center; }
  &__item-hint { font-size: 11px; color: $text-m; }
}
</style>
