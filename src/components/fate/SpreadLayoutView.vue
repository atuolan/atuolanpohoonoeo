<script setup lang="ts">
/**
 * SpreadLayoutView — 牌陣佈局視覺元件
 * 使用百分比座標系統定位每張牌，模擬占星喵的牌陣介面
 */
import type { OracleCard, OracleDrawnCard, OracleSpread } from '@/types/oracle'

interface Props {
  spread: OracleSpread
  /** 已抽到的牌（揭示狀態） */
  drawnCards?: OracleDrawnCard[]
  /** 已翻開的牌數量 */
  revealedCount?: number
  /** 是否為選牌模式（顯示洗好的牌堆供點選） */
  pickMode?: boolean
  /** 洗好的牌堆（選牌模式用） */
  shuffledDeck?: OracleCard[]
  /** 已選的牌 index */
  pickedIndices?: Set<number>
  /** 容器寬高比例（預設 3:4） */
  aspectRatio?: string
}

const props = withDefaults(defineProps<Props>(), {
  drawnCards: () => [],
  revealedCount: 0,
  pickMode: false,
  shuffledDeck: () => [],
  pickedIndices: () => new Set(),
  aspectRatio: '3/4',
})

const emit = defineEmits<{
  'pick-card': [deckIndex: number]
  'reveal-card': [positionIndex: number]
}>()

/** 計算牌位的 CSS 定位樣式 */
function positionStyle(x: number, y: number, rotate = 0, scale = 1) {
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`,
  }
}

/** 判斷某個位置的牌是否已翻開 */
function isRevealed(index: number): boolean {
  return index < props.revealedCount
}

/** 取得某個位置的已抽牌 */
function getDrawnCard(index: number): OracleDrawnCard | undefined {
  return props.drawnCards[index]
}
</script>

<template>
  <div
    class="spread-layout"
    :style="{ aspectRatio: props.aspectRatio }"
  >
    <!-- 牌陣背景裝飾 -->
    <div class="spread-layout__bg" />

    <!-- 牌陣位置 -->
    <template v-for="(position, index) in spread.positions" :key="position.id">
      <div
        class="spread-layout__slot"
        :style="positionStyle(
          position.coords.x,
          position.coords.y,
          position.coords.rotate ?? 0,
          position.coords.scale ?? 1,
        )"
        :class="{
          'spread-layout__slot--revealed': isRevealed(index),
          'spread-layout__slot--empty': !isRevealed(index),
        }"
        @click="!pickMode && !isRevealed(index) && emit('reveal-card', index)"
      >
        <!-- 翻開的牌 -->
        <template v-if="isRevealed(index) && getDrawnCard(index)">
          <div class="oracle-card oracle-card--face">
            <!-- 有圖片時顯示圖片 -->
            <img
              v-if="getDrawnCard(index)!.card.image && !getDrawnCard(index)!.card.image.endsWith('.svg')"
              :src="getDrawnCard(index)!.card.image"
              :alt="getDrawnCard(index)!.card.name"
              class="oracle-card__img"
            />
            <!-- 無圖片時顯示 symbol + name -->
            <template v-else>
              <div
                class="oracle-card__symbol"
                :style="{ color: getDrawnCard(index)!.card.color }"
              >
                {{ getDrawnCard(index)!.card.symbol }}
              </div>
              <div class="oracle-card__name">{{ getDrawnCard(index)!.card.name }}</div>
            </template>
          </div>
        </template>

        <!-- 背面未翻牌 -->
        <template v-else>
          <div class="oracle-card oracle-card--back">
            <div class="oracle-card__back-pattern">
              <span>✦</span>
            </div>
          </div>
        </template>

        <!-- 位置標籤 -->
        <div class="spread-layout__slot-label">
          {{ position.name }}
        </div>
      </div>
    </template>

    <!-- 連線裝飾（線性/十字形牌陣） -->
    <svg
      v-if="spread.positions.length > 1 && spread.layoutType !== 'custom'"
      class="spread-layout__lines"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <template v-if="spread.layoutType === 'linear'">
        <line
          v-for="i in spread.positions.length - 1"
          :key="`line-${i}`"
          :x1="spread.positions[i - 1].coords.x"
          :y1="spread.positions[i - 1].coords.y"
          :x2="spread.positions[i].coords.x"
          :y2="spread.positions[i].coords.y"
          stroke="rgba(255,255,255,0.15)"
          stroke-width="0.5"
          stroke-dasharray="2,2"
        />
      </template>
      <template v-else-if="spread.layoutType === 'cross' || spread.layoutType === 'triangle'">
        <line
          v-for="i in spread.positions.length"
          :key="`spoke-${i}`"
          :x1="spread.positions[0].coords.x"
          :y1="spread.positions[0].coords.y"
          :x2="spread.positions[i - 1].coords.x"
          :y2="spread.positions[i - 1].coords.y"
          stroke="rgba(255,255,255,0.1)"
          stroke-width="0.5"
          stroke-dasharray="2,3"
        />
      </template>
    </svg>
  </div>
</template>

<style scoped lang="scss">
.spread-layout {
  position: relative;
  width: 100%;
  overflow: visible;

  &__bg {
    position: absolute;
    inset: 0;
    background: transparent;
    z-index: 0;
  }

  &__lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  &__slot {
    position: absolute;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: transform 0.2s ease;

    &--empty:hover {
      .oracle-card--back {
        box-shadow: 0 0 20px rgba(200, 170, 255, 0.5);
        transform: scale(1.05);
      }
    }

    &--revealed {
      cursor: default;
    }
  }

  &__slot-label {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.6);
    text-align: center;
    white-space: nowrap;
    letter-spacing: 0.5px;
    max-width: 70px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

// ── 神諭牌樣式 ──────────────────────────────────────────────
.oracle-card {
  width: 56px;
  height: 84px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);

  @media (max-width: 480px) {
    width: 44px;
    height: 66px;
  }

  // 翻開的牌
  &--face {
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    padding: 0;
    overflow: hidden;
  }

  // 背面未翻牌
  &--back {
    background: linear-gradient(
      135deg,
      rgba(103, 58, 183, 0.6) 0%,
      rgba(63, 81, 181, 0.6) 100%
    );
    border: 1px solid rgba(200, 170, 255, 0.3);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    transition: box-shadow 0.2s, transform 0.2s;
  }

  &__symbol {
    font-size: 22px;
    line-height: 1;

    @media (max-width: 480px) {
      font-size: 18px;
    }
  }

  &__name {
    font-size: 7px;
    color: rgba(255, 255, 255, 0.85);
    text-align: center;
    line-height: 1.3;
    padding: 0 2px;
    word-break: break-all;
    hyphens: auto;
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 7px;
    display: block;
  }

  &__back-pattern {
    font-size: 20px;
    opacity: 0.5;
    color: rgba(200, 170, 255, 0.8);
  }
}
</style>
