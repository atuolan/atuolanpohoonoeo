<script setup lang="ts">
/**
 * OraclePanel — 神諭卡占卜主面板
 * 完整的神諭牌占卜流程：意圖設定 → 選牌陣 → 洗牌 → 抽牌 → 翻牌揭示 → AI 解讀
 */
import SpreadLayoutView from '@/components/fate/SpreadLayoutView.vue'
import { ORACLE_SPREADS } from '@/data/oracleSpreads'
import { useOracleStore } from '@/stores/oracle'
import { computed, ref } from 'vue'

const oracleStore = useOracleStore()

// ── 意圖設定 ─────────────────────────────────────────────
const localQuestion = ref('')
const localIntention = ref('')

function handleSetIntention() {
  if (!localQuestion.value.trim()) return
  oracleStore.setIntention(localQuestion.value.trim(), localIntention.value.trim())
}

// ── 牌陣選擇 ─────────────────────────────────────────────
const selectedSpreadId = ref(ORACLE_SPREADS[0].id)

function handleSelectSpread(spreadId: string) {
  const s = ORACLE_SPREADS.find(sp => sp.id === spreadId)
  if (s) {
    selectedSpreadId.value = spreadId
    oracleStore.selectSpread(s)
  }
}

// ── 洗牌 ─────────────────────────────────────────────────
const isShuffling = ref(false)

async function handleShuffle() {
  isShuffling.value = true
  oracleStore.shuffleDeck()
  await new Promise(r => setTimeout(r, 800))
  isShuffling.value = false
}

// ── 選牌展示（扇形牌堆） ──────────────────────────────────
/** 從 shuffledDeck 中取 21 張展示供點選 */
const displayDeck = computed(() => oracleStore.shuffledDeck.slice(0, 21))

// ── 翻牌 ─────────────────────────────────────────────────
function handleRevealCard(index: number) {
  if (index === oracleStore.revealedCount) {
    oracleStore.revealNextCard()
  }
}

// ── 分組顯示已翻牌（逐張展示） ────────────────────────────
const currentRevealCard = computed(() => {
  if (oracleStore.revealedCount === 0) return null
  return oracleStore.drawnCards[oracleStore.revealedCount - 1]
})

// ── 重置 ─────────────────────────────────────────────────
function handleReset() {
  localQuestion.value = ''
  localIntention.value = ''
  selectedSpreadId.value = ORACLE_SPREADS[0].id
  oracleStore.reset()
}

// ── 歷史詳情 ─────────────────────────────────────────────
const showHistory = ref(false)
const expandedReadingId = ref<string | null>(null)

function toggleHistory() {
  showHistory.value = !showHistory.value
  if (showHistory.value && !oracleStore.isHistoryLoaded) {
    oracleStore.loadHistory()
  }
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="oracle-panel">

    <!-- ══════════════════════════════════════════
         首頁
    ══════════════════════════════════════════ -->
    <div v-if="oracleStore.phase === 'home'" class="oracle-home">
      <div class="oracle-home__hero">
        <div class="oracle-home__moon">🌙</div>
        <h2 class="oracle-home__title">神諭卡</h2>
        <p class="oracle-home__subtitle">讓宇宙的訊息引領你</p>
      </div>

      <div class="oracle-home__actions">
        <button class="oracle-btn oracle-btn--primary oracle-btn--large" @click="oracleStore.goToPhase('intention')">
          ✨ 開始占卜
        </button>
        <button class="oracle-btn oracle-btn--ghost" @click="toggleHistory">
          📜 歷史記錄
        </button>
      </div>

      <!-- 歷史記錄列表 -->
      <div v-if="showHistory" class="oracle-history">
        <div class="oracle-history__header">
          <span>歷史記錄</span>
          <button class="oracle-btn oracle-btn--text" @click="showHistory = false">✕</button>
        </div>
        <div v-if="!oracleStore.isHistoryLoaded" class="oracle-history__loading">載入中…</div>
        <div v-else-if="oracleStore.readings.length === 0" class="oracle-history__empty">
          尚無記錄
        </div>
        <div v-else class="oracle-history__list">
          <div
            v-for="reading in oracleStore.readings"
            :key="reading.id"
            class="oracle-history__item"
            @click="expandedReadingId = expandedReadingId === reading.id ? null : reading.id"
          >
            <div class="oracle-history__item-meta">
              <span class="oracle-history__item-spread">{{ reading.spread.name }}</span>
              <span class="oracle-history__item-date">{{ formatDate(reading.createdAt) }}</span>
            </div>
            <div class="oracle-history__item-question">{{ reading.question || '（無問題）' }}</div>
            <div
              v-if="expandedReadingId === reading.id && reading.interpretation"
              class="oracle-history__item-content"
              v-html="reading.interpretation.replace(/\n/g, '<br>')"
            />
            <button
              class="oracle-btn oracle-btn--text oracle-btn--danger"
              @click.stop="oracleStore.deleteReading(reading.id)"
            >
              刪除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         意圖設定
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'intention'" class="oracle-section">
      <div class="oracle-section__header">
        <button class="oracle-back-btn" @click="oracleStore.goToPhase('home')">← 返回</button>
        <h3>設定你的意圖</h3>
      </div>

      <div class="oracle-intention">
        <div class="oracle-intention__cosmic-text">
          🌌 在抽牌之前，先讓心沉靜下來。
        </div>
        <p class="oracle-intention__hint">
          想想此刻你心中最想獲得指引的問題，或你希望從這次占卜中得到什麼。
        </p>

        <div class="oracle-field">
          <label class="oracle-field__label">你的問題或困惑（必填）</label>
          <textarea
            v-model="localQuestion"
            class="oracle-field__textarea"
            placeholder="例如：我最近的感情狀況如何？／我該如何面對這個轉變？"
            rows="3"
          />
        </div>

        <div class="oracle-field">
          <label class="oracle-field__label">你的意圖（選填）</label>
          <input
            v-model="localIntention"
            class="oracle-field__input"
            placeholder="例如：我希望得到關於愛情的清晰指引"
          />
        </div>

        <button
          class="oracle-btn oracle-btn--primary oracle-btn--large"
          :disabled="!localQuestion.trim()"
          @click="handleSetIntention"
        >
          繼續 →
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         選擇牌陣
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'spread'" class="oracle-section">
      <div class="oracle-section__header">
        <button class="oracle-back-btn" @click="oracleStore.goToPhase('intention')">← 返回</button>
        <h3>選擇牌陣</h3>
      </div>

      <div class="oracle-spreads-grid">
        <div
          v-for="sp in ORACLE_SPREADS"
          :key="sp.id"
          class="oracle-spread-card"
          :class="{ 'oracle-spread-card--selected': selectedSpreadId === sp.id }"
          @click="handleSelectSpread(sp.id)"
        >
          <!-- 牌陣縮圖（迷你佈局預覽） -->
          <div
            class="oracle-spread-card__preview"
            :style="{ background: sp.bgGradient || 'linear-gradient(135deg, #1a1a2e, #16213e)' }"
          >
            <div
              v-for="pos in sp.positions"
              :key="pos.id"
              class="oracle-spread-card__dot"
              :style="{
                left: `${pos.coords.x}%`,
                top: `${pos.coords.y}%`,
                transform: 'translate(-50%, -50%)',
              }"
            />
          </div>

          <div class="oracle-spread-card__info">
            <div class="oracle-spread-card__name">{{ sp.name }}</div>
            <div class="oracle-spread-card__subtitle">{{ sp.subtitle }}</div>
            <div class="oracle-spread-card__count">{{ sp.cardCount }} 張牌</div>
          </div>

          <div class="oracle-spread-card__tags">
            <span
              v-for="tag in sp.tags.slice(0, 3)"
              :key="tag"
              class="oracle-tag"
            >{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         洗牌冥想
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'shuffle'" class="oracle-section oracle-section--centered">
      <div class="oracle-section__header">
        <button class="oracle-back-btn" @click="oracleStore.goToPhase('spread')">← 返回</button>
        <h3>靜心洗牌</h3>
      </div>

      <div class="oracle-shuffle">
        <div class="oracle-shuffle__question">
          「{{ oracleStore.question }}」
        </div>

        <div class="oracle-shuffle__cards" :class="{ 'oracle-shuffle__cards--animating': isShuffling }">
          <div
            v-for="i in 7"
            :key="i"
            class="oracle-shuffle__card"
            :style="{ transform: `rotate(${(i - 4) * 8}deg) translateY(${Math.abs(i - 4) * 3}px)` }"
          >
            <span>✦</span>
          </div>
        </div>

        <p class="oracle-shuffle__hint">
          閉上眼睛，深呼吸三次，把你的問題放在心中，感受宇宙的回應。
        </p>

        <div class="oracle-shuffle__actions">
          <button
            class="oracle-btn oracle-btn--secondary"
            :disabled="isShuffling"
            @click="handleShuffle"
          >
            {{ isShuffling ? '洗牌中…' : '🔀 再次洗牌' }}
          </button>
          <button
            class="oracle-btn oracle-btn--primary oracle-btn--large"
            :disabled="isShuffling"
            @click="oracleStore.confirmShuffle()"
          >
            ✨ 我準備好了，開始抽牌
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         抽牌（扇形牌堆選牌）
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'draw'" class="oracle-section oracle-section--centered">
      <div class="oracle-section__header">
        <h3>選擇你的牌</h3>
        <span class="oracle-section__counter">
          {{ oracleStore.pickedCount }} / {{ oracleStore.requiredPicks }}
        </span>
      </div>

      <p class="oracle-draw__hint">
        讓直覺引導你，點選感召你的牌
      </p>

      <!-- 扇形牌堆 -->
      <div class="oracle-draw__fan">
        <div
          v-for="(card, idx) in displayDeck"
          :key="idx"
          class="oracle-draw__fan-card"
          :class="{
            'oracle-draw__fan-card--picked': oracleStore.pickedIndices.has(idx),
            'oracle-draw__fan-card--available': !oracleStore.pickedIndices.has(idx),
          }"
          :style="{
            transform: `rotate(${(idx - 10) * 5}deg) translateY(${-Math.abs(idx - 10) * 2}px)`,
            zIndex: idx === 10 ? 21 : Math.min(idx, 20 - idx) + 1,
          }"
          @click="oracleStore.pickCard(idx)"
        >
          <div class="oracle-draw__fan-card-inner">
            <span v-if="oracleStore.pickedIndices.has(idx)">✓</span>
            <span v-else>✦</span>
          </div>
        </div>
      </div>

      <div v-if="oracleStore.pickedCount >= oracleStore.requiredPicks" class="oracle-draw__done">
        <p>已選好 {{ oracleStore.requiredPicks }} 張牌！</p>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         翻牌揭示
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'reveal'" class="oracle-section">
      <div class="oracle-section__header">
        <h3>揭示你的神諭</h3>
        <span class="oracle-section__counter">
          {{ oracleStore.revealedCount }} / {{ oracleStore.drawnCards.length }}
        </span>
      </div>

      <!-- 牌陣視覺佈局 -->
      <SpreadLayoutView
        :spread="oracleStore.spread"
        :drawn-cards="oracleStore.drawnCards"
        :revealed-count="oracleStore.revealedCount"
        @reveal-card="handleRevealCard"
      />

      <!-- 當前翻開的牌詳情 -->
      <Transition name="card-reveal">
        <div
          v-if="currentRevealCard"
          class="oracle-reveal-detail"
          :style="{ borderColor: currentRevealCard.card.color }"
        >
          <div class="oracle-reveal-detail__symbol" :style="{ color: currentRevealCard.card.color }">
            {{ currentRevealCard.card.symbol }}
          </div>
          <h4 class="oracle-reveal-detail__name">{{ currentRevealCard.card.name }}</h4>
          <p class="oracle-reveal-detail__position">
            位置：{{ currentRevealCard.position.name }}
          </p>
          <p class="oracle-reveal-detail__message">
            「{{ currentRevealCard.card.message }}」
          </p>
          <p class="oracle-reveal-detail__desc">{{ currentRevealCard.card.description }}</p>
          <div class="oracle-reveal-detail__action">
            <span>💡 </span>{{ currentRevealCard.card.action }}
          </div>
          <div class="oracle-reveal-detail__keywords">
            <span
              v-for="kw in currentRevealCard.card.keywords"
              :key="kw"
              class="oracle-tag"
            >{{ kw }}</span>
          </div>
        </div>
      </Transition>

      <!-- 操作按鈕 -->
      <div class="oracle-reveal__actions">
        <button
          v-if="oracleStore.revealedCount < oracleStore.drawnCards.length"
          class="oracle-btn oracle-btn--primary"
          @click="oracleStore.revealNextCard()"
        >
          翻開下一張 ✨
        </button>
        <button
          v-if="oracleStore.revealedCount < oracleStore.drawnCards.length"
          class="oracle-btn oracle-btn--ghost"
          @click="oracleStore.revealAllCards()"
        >
          全部揭示
        </button>
        <button
          v-if="oracleStore.allRevealed"
          class="oracle-btn oracle-btn--primary oracle-btn--large"
          @click="oracleStore.startInterpretation()"
        >
          🔮 請宇宙為我解讀
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════════
         AI 解讀
    ══════════════════════════════════════════ -->
    <div v-else-if="oracleStore.phase === 'interpret'" class="oracle-section">
      <div class="oracle-section__header">
        <h3>🌌 宇宙的訊息</h3>
      </div>

      <!-- 載入動畫 -->
      <div v-if="oracleStore.isInterpreting && !oracleStore.interpretation" class="oracle-interpreting">
        <div class="oracle-interpreting__animation">
          <span v-for="i in 3" :key="i" class="oracle-interpreting__dot" />
        </div>
        <p>宇宙正在整理訊息給你…</p>
      </div>

      <!-- 錯誤 -->
      <div v-if="oracleStore.interpretError" class="oracle-error">
        <p>⚠️ {{ oracleStore.interpretError }}</p>
        <button class="oracle-btn oracle-btn--secondary" @click="oracleStore.startInterpretation()">
          重試
        </button>
      </div>

      <!-- 解讀內容（流式） -->
      <div
        v-if="oracleStore.interpretation"
        class="oracle-interpretation"
        v-html="oracleStore.interpretation.replace(/\n/g, '<br>').replace(/#{1,6}\s(.+)/g, '<strong>$1</strong>')"
      />

      <!-- 完成後操作 -->
      <div v-if="!oracleStore.isInterpreting && oracleStore.interpretation" class="oracle-interpret__actions">
        <button class="oracle-btn oracle-btn--ghost" @click="oracleStore.goToPhase('reveal')">
          ← 回到牌面
        </button>
        <button class="oracle-btn oracle-btn--primary" @click="handleReset">
          🌙 開始新的占卜
        </button>
      </div>
    </div>

  </div>
</template>

<style scoped lang="scss">
// ── 全域變數 ─────────────────────────────────────────────
$oracle-purple: #c77dff;
$oracle-dark: #0d0d1a;
$oracle-card-bg: rgba(255, 255, 255, 0.06);

// ── 面板容器 ─────────────────────────────────────────────
.oracle-panel {
  width: 100%;
  min-height: 400px;
  color: #e8e0ff;
  font-family: inherit;
}

// ── 通用 Section ─────────────────────────────────────────
.oracle-section {
  padding: 0 4px;

  &--centered {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;

    h3 {
      font-size: 18px;
      font-weight: 600;
      color: $oracle-purple;
      margin: 0;
      flex: 1;
    }
  }

  &__counter {
    font-size: 14px;
    color: rgba(200, 170, 255, 0.7);
    background: rgba(200, 170, 255, 0.1);
    padding: 2px 10px;
    border-radius: 20px;
  }
}

.oracle-back-btn {
  background: none;
  border: none;
  color: rgba(200, 170, 255, 0.7);
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 8px;
  transition: color 0.2s;

  &:hover {
    color: $oracle-purple;
  }
}

// ── 首頁 ─────────────────────────────────────────────────
.oracle-home {
  text-align: center;
  padding: 20px 0;

  &__hero {
    margin-bottom: 32px;
  }

  &__moon {
    font-size: 56px;
    margin-bottom: 12px;
    animation: moon-float 4s ease-in-out infinite;
  }

  &__title {
    font-size: 28px;
    font-weight: 700;
    color: $oracle-purple;
    margin: 0 0 8px;
    letter-spacing: 2px;
  }

  &__subtitle {
    font-size: 14px;
    color: rgba(200, 170, 255, 0.6);
    margin: 0;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }
}

@keyframes moon-float {
  0%, 100% { transform: translateY(0) }
  50% { transform: translateY(-8px) }
}

// ── 歷史記錄 ─────────────────────────────────────────────
.oracle-history {
  margin-top: 24px;
  text-align: left;

  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
    color: rgba(200, 170, 255, 0.8);
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(200, 170, 255, 0.15);
  }

  &__loading,
  &__empty {
    text-align: center;
    color: rgba(200, 170, 255, 0.4);
    padding: 20px;
    font-size: 14px;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  &__item {
    background: $oracle-card-bg;
    border: 1px solid rgba(200, 170, 255, 0.15);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: border-color 0.2s;

    &:hover {
      border-color: rgba(200, 170, 255, 0.3);
    }
  }

  &__item-meta {
    display: flex;
    justify-content: space-between;
    font-size: 11px;
    color: rgba(200, 170, 255, 0.5);
    margin-bottom: 4px;
  }

  &__item-spread {
    color: $oracle-purple;
    font-weight: 600;
  }

  &__item-question {
    font-size: 13px;
    color: rgba(230, 220, 255, 0.9);
    margin-bottom: 6px;
  }

  &__item-content {
    font-size: 12px;
    color: rgba(200, 170, 255, 0.7);
    line-height: 1.6;
    max-height: 150px;
    overflow-y: auto;
    margin: 8px 0;
    padding: 8px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
  }
}

// ── 意圖設定 ─────────────────────────────────────────────
.oracle-intention {
  display: flex;
  flex-direction: column;
  gap: 16px;

  &__cosmic-text {
    font-size: 15px;
    color: $oracle-purple;
    text-align: center;
    padding: 12px;
    background: rgba(199, 125, 255, 0.08);
    border-radius: 12px;
    border: 1px solid rgba(199, 125, 255, 0.2);
  }

  &__hint {
    font-size: 13px;
    color: rgba(200, 170, 255, 0.6);
    line-height: 1.6;
    margin: 0;
    text-align: center;
  }
}

// ── 表單欄位 ─────────────────────────────────────────────
.oracle-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  &__label {
    font-size: 13px;
    color: rgba(200, 170, 255, 0.7);
    font-weight: 500;
  }

  &__textarea,
  &__input {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(200, 170, 255, 0.2);
    border-radius: 10px;
    padding: 10px 12px;
    color: #e8e0ff;
    font-size: 14px;
    font-family: inherit;
    resize: none;
    transition: border-color 0.2s;
    width: 100%;
    box-sizing: border-box;

    &::placeholder {
      color: rgba(200, 170, 255, 0.3);
    }

    &:focus {
      outline: none;
      border-color: $oracle-purple;
    }
  }
}

// ── 牌陣選擇 ─────────────────────────────────────────────
.oracle-spreads-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}

.oracle-spread-card {
  background: $oracle-card-bg;
  border: 1px solid rgba(200, 170, 255, 0.15);
  border-radius: 14px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: rgba(200, 170, 255, 0.4);
    transform: translateY(-2px);
  }

  &--selected {
    border-color: $oracle-purple;
    background: rgba(199, 125, 255, 0.12);
    box-shadow: 0 0 20px rgba(199, 125, 255, 0.2);
  }

  &__preview {
    position: relative;
    width: 100%;
    aspect-ratio: 4/3;
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  &__dot {
    position: absolute;
    width: 8px;
    height: 8px;
    background: rgba(255, 255, 255, 0.6);
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.9);
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: $oracle-purple;
    margin-bottom: 2px;
  }

  &__subtitle {
    font-size: 11px;
    color: rgba(200, 170, 255, 0.6);
    margin-bottom: 4px;
  }

  &__count {
    font-size: 12px;
    color: rgba(200, 170, 255, 0.5);
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 6px;
  }
}

// ── 洗牌 ─────────────────────────────────────────────────
.oracle-shuffle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  width: 100%;

  &__question {
    font-size: 15px;
    color: rgba(230, 220, 255, 0.8);
    text-align: center;
    font-style: italic;
    padding: 12px 20px;
    background: rgba(199, 125, 255, 0.08);
    border-radius: 12px;
    border: 1px solid rgba(199, 125, 255, 0.15);
    max-width: 400px;
  }

  &__cards {
    position: relative;
    height: 120px;
    width: 80px;
    transition: filter 0.3s;

    &--animating {
      filter: blur(2px);
    }
  }

  &__card {
    position: absolute;
    width: 52px;
    height: 76px;
    background: linear-gradient(135deg, rgba(103, 58, 183, 0.7), rgba(63, 81, 181, 0.7));
    border: 1px solid rgba(200, 170, 255, 0.3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(200, 170, 255, 0.4);
    font-size: 16px;
    left: 50%;
    top: 50%;
    transform-origin: center bottom;
    margin-left: -26px;
    margin-top: -38px;
  }

  &__hint {
    font-size: 13px;
    color: rgba(200, 170, 255, 0.5);
    text-align: center;
    line-height: 1.6;
    max-width: 320px;
  }

  &__actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    width: 100%;
    max-width: 300px;
  }
}

// ── 抽牌扇形 ─────────────────────────────────────────────
.oracle-draw {
  width: 100%;

  &__hint {
    font-size: 13px;
    color: rgba(200, 170, 255, 0.6);
    text-align: center;
    margin-bottom: 20px;
  }

  &__fan {
    position: relative;
    height: 180px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    margin-bottom: 16px;
  }

  &__fan-card {
    position: absolute;
    width: 48px;
    height: 72px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    transform-origin: center bottom;
    bottom: 0;

    &--available:hover {
      transform: translateY(-15px) !important;
      z-index: 30 !important;

      .oracle-draw__fan-card-inner {
        border-color: $oracle-purple;
        box-shadow: 0 0 15px rgba(199, 125, 255, 0.5);
      }
    }

    &--picked {
      .oracle-draw__fan-card-inner {
        background: rgba(199, 125, 255, 0.4);
        border-color: $oracle-purple;
      }
    }
  }

  &__fan-card-inner {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    background: linear-gradient(135deg, rgba(103, 58, 183, 0.6), rgba(63, 81, 181, 0.6));
    border: 1px solid rgba(200, 170, 255, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(200, 170, 255, 0.5);
    font-size: 14px;
    transition: all 0.2s;
  }

  &__done {
    text-align: center;
    color: $oracle-purple;
    font-size: 15px;
    padding: 8px;
  }
}

// ── 翻牌揭示 ─────────────────────────────────────────────
.oracle-reveal-detail {
  margin-top: 20px;
  padding: 16px;
  background: rgba(199, 125, 255, 0.07);
  border: 1px solid rgba(199, 125, 255, 0.25);
  border-radius: 16px;
  text-align: center;

  &__symbol {
    font-size: 36px;
    margin-bottom: 8px;
  }

  &__name {
    font-size: 20px;
    font-weight: 700;
    color: $oracle-purple;
    margin: 0 0 4px;
  }

  &__position {
    font-size: 12px;
    color: rgba(200, 170, 255, 0.5);
    margin: 0 0 12px;
  }

  &__message {
    font-size: 15px;
    font-style: italic;
    color: rgba(230, 220, 255, 0.9);
    margin: 0 0 12px;
    line-height: 1.6;
  }

  &__desc {
    font-size: 13px;
    color: rgba(200, 170, 255, 0.7);
    line-height: 1.7;
    margin: 0 0 12px;
    text-align: left;
  }

  &__action {
    font-size: 13px;
    color: rgba(230, 220, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
    border-radius: 10px;
    padding: 10px 14px;
    text-align: left;
    margin-bottom: 12px;
    line-height: 1.6;
  }

  &__keywords {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
}

.oracle-reveal__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 16px;
  align-items: center;
}

// ── AI 解讀 ──────────────────────────────────────────────
.oracle-interpreting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 0;
  color: rgba(200, 170, 255, 0.6);
  font-size: 14px;

  &__animation {
    display: flex;
    gap: 8px;
  }

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: $oracle-purple;
    animation: dot-pulse 1.2s ease-in-out infinite;

    &:nth-child(2) { animation-delay: 0.2s }
    &:nth-child(3) { animation-delay: 0.4s }
  }
}

@keyframes dot-pulse {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.3 }
  40% { transform: scale(1); opacity: 1 }
}

.oracle-error {
  background: rgba(255, 80, 80, 0.1);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  color: #ff8080;
  font-size: 14px;
  margin-bottom: 16px;
}

.oracle-interpretation {
  font-size: 14px;
  line-height: 1.8;
  color: rgba(220, 210, 255, 0.9);
  padding: 4px 0;
  max-height: 60vh;
  overflow-y: auto;
}

.oracle-interpret__actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
  flex-wrap: wrap;
  justify-content: center;
}

// ── 按鈕系統 ─────────────────────────────────────────────
.oracle-btn {
  border: none;
  border-radius: 12px;
  padding: 10px 20px;
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s;
  font-weight: 500;

  &--primary {
    background: linear-gradient(135deg, #7b2ff7, #5b2be0);
    color: white;
    box-shadow: 0 4px 15px rgba(123, 47, 247, 0.4);

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(123, 47, 247, 0.5);
    }
  }

  &--secondary {
    background: rgba(199, 125, 255, 0.15);
    color: $oracle-purple;
    border: 1px solid rgba(199, 125, 255, 0.3);

    &:hover:not(:disabled) {
      background: rgba(199, 125, 255, 0.25);
    }
  }

  &--ghost {
    background: transparent;
    color: rgba(200, 170, 255, 0.7);
    border: 1px solid rgba(200, 170, 255, 0.2);

    &:hover:not(:disabled) {
      border-color: $oracle-purple;
      color: $oracle-purple;
    }
  }

  &--text {
    background: none;
    border: none;
    color: rgba(200, 170, 255, 0.5);
    padding: 4px 8px;
    font-size: 12px;

    &:hover { color: $oracle-purple }
  }

  &--danger:hover {
    color: #ff8080 !important;
  }

  &--large {
    padding: 14px 28px;
    font-size: 15px;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

// ── 標籤 ─────────────────────────────────────────────────
.oracle-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 20px;
  background: rgba(199, 125, 255, 0.12);
  color: rgba(200, 170, 255, 0.7);
  border: 1px solid rgba(199, 125, 255, 0.2);
}

// ── 過渡動畫 ─────────────────────────────────────────────
.card-reveal-enter-active {
  animation: card-flip-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.card-reveal-leave-active {
  animation: card-flip-in 0.3s reverse;
}

@keyframes card-flip-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
</style>
