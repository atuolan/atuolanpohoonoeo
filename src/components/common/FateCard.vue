<script setup lang="ts">
/**
 * 塔羅牌卡片組件
 * 支援 3D 翻牌動畫、正逆位顯示
 */
import type { FateCard } from '@/types/fate'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{
  card: FateCard
  isReversed?: boolean
  isRevealed?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  isReversed: false,
  isRevealed: false,
  size: 'md',
})

const emit = defineEmits<{
  click: []
}>()

const imageError = ref(false)

// 花色符號
const suitSymbol = computed(() => {
  switch (props.card.suit) {
    case 'wands': return '🪄'
    case 'cups': return '🏆'
    case 'swords': return '⚔️'
    case 'pentacles': return '⭐'
    default: return '✦'
  }
})

// 尺寸 class
const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'fate-card--sm'
    case 'lg': return 'fate-card--lg'
    default: return 'fate-card--md'
  }
})
</script>

<template>
  <div
    :class="['fate-card', sizeClass]"
    @click="emit('click')"
  >
    <div :class="['fate-card__inner', { 'fate-card__inner--revealed': isRevealed }]">
      <!-- 牌背 -->
      <div class="fate-card__back">
        <div class="fate-card__back-border" />
        <div class="fate-card__back-symbol">✦</div>
        <div class="fate-card__back-corner fate-card__back-corner--tl">✨</div>
        <div class="fate-card__back-corner fate-card__back-corner--br">✨</div>
      </div>

      <!-- 牌面 -->
      <div
        :class="['fate-card__face', { 'fate-card__face--reversed': isReversed && isRevealed }]"
      >
        <!-- 有圖片時顯示圖片 -->
        <template v-if="card.image && !imageError">
          <img
            :src="card.image"
            :alt="card.nameCn"
            class="fate-card__face-img"
            @error="imageError = true"
          />
          <div class="fate-card__face-overlay" />
          <div class="fate-card__face-name-overlay">{{ card.nameCn }}</div>
        </template>
        <!-- 無圖片時的 fallback -->
        <div v-else class="fate-card__face-content">
          <div class="fate-card__face-symbol">
            {{ card.type === 'major' ? '★' : suitSymbol }}
          </div>
          <div class="fate-card__face-name-cn">{{ card.nameCn }}</div>
          <div class="fate-card__face-name-en">{{ card.name }}</div>
        </div>
      </div>
    </div>

    <!-- 正逆位標籤 -->
    <div v-if="isRevealed" class="fate-card__label">
      <span v-if="isReversed" class="fate-card__label--reversed">
        ↓ 逆位
      </span>
      <span v-else class="fate-card__label--upright">
        ↑ 正位
      </span>
    </div>
  </div>
</template>

<style scoped lang="scss">
$card-bg: #2C2438;
$card-bg-alt: #362D46;
$card-face-bg: #F8F6F2;
$card-face-bg-alt: #F0EDE6;
$accent: #C77B3C;
$accent-light: #E8A86D;
$accent-symbol: rgba(232, 168, 109, 0.7);
$text-dark: #1A1A2E;
$text-secondary: #5A5A72;

.fate-card {
  position: relative;
  cursor: pointer;
  perspective: 1000px;

  &--sm {
    width: 60px;
    height: 100px;
  }
  &--md {
    width: 100px;
    height: 166px;
  }
  &--lg {
    width: 140px;
    height: 233px;
  }

  &__inner {
    position: relative;
    width: 100%;
    height: 100%;
    transition: transform 0.7s cubic-bezier(0.16, 1, 0.3, 1);
    transform-style: preserve-3d;

    &--revealed {
      transform: rotateY(180deg);
    }
  }

  &__back,
  &__face {
    position: absolute;
    inset: 0;
    backface-visibility: hidden;
    border-radius: 10px;
    overflow: hidden;
    border: 2px solid rgba(199, 123, 60, 0.4);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  // 牌背
  &__back {
    background: linear-gradient(135deg, $card-bg, $card-bg-alt);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__back-border {
    position: absolute;
    inset: 6px;
    border: 1px solid rgba(199, 123, 60, 0.25);
    border-radius: 6px;
  }
  &__back-symbol {
    font-size: 2em;
    color: $accent-symbol;
    filter: drop-shadow(0 0 8px rgba(199, 123, 60, 0.35));
  }
  &__back-corner {
    position: absolute;
    color: rgba(199, 123, 60, 0.2);
    font-size: 0.8em;
    &--tl { top: 8px; left: 8px; }
    &--br { bottom: 8px; right: 8px; }
  }

  // 牌面
  &__face {
    transform: rotateY(180deg);
    background: linear-gradient(160deg, $card-face-bg, $card-face-bg-alt);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid rgba(199, 123, 60, 0.3);

    &--reversed {
      .fate-card__face-content,
      .fate-card__face-img,
      .fate-card__face-overlay,
      .fate-card__face-name-overlay {
        transform: rotate(180deg);
      }
    }
  }
  &__face-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }
  &__face-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.45) 0%, transparent 45%);
    pointer-events: none;
    transition: transform 0.3s ease;
  }
  &__face-name-overlay {
    position: absolute;
    bottom: 6px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 0.7em;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    letter-spacing: 0.1em;
    transition: transform 0.3s ease;
  }
  &__face-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    text-align: center;
    transition: transform 0.3s ease;
  }
  &__face-symbol {
    font-size: 1.8em;
    color: $accent;
    filter: drop-shadow(0 0 6px rgba(199, 123, 60, 0.35));
  }
  &__face-name-cn {
    font-size: 0.85em;
    font-weight: 700;
    color: $text-dark;
    letter-spacing: 0.08em;
  }
  &__face-name-en {
    font-size: 0.6em;
    color: $text-secondary;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  // 正逆位標籤
  &__label {
    position: absolute;
    bottom: -24px;
    left: 50%;
    transform: translateX(-50%);
    white-space: nowrap;
    font-size: 0.7em;
    padding: 2px 10px;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    font-weight: 500;

    &--reversed {
      color: #E85D5D;
      border: 1px solid rgba(232, 93, 93, 0.2);
    }
    &--upright {
      color: #34B87C;
      border: 1px solid rgba(52, 184, 124, 0.2);
    }
  }

  // sm 尺寸調整
  &--sm &__back-symbol { font-size: 1.2em; }
  &--sm &__back-border { inset: 3px; }
  &--sm &__back-corner { display: none; }
  &--sm &__face-symbol { font-size: 1.2em; }
  &--sm &__face-name-cn { font-size: 0.65em; }
  &--sm &__face-name-en { display: none; }
  &--sm &__label { display: none; }

  // lg 尺寸調整
  &--lg &__back-symbol { font-size: 3em; }
  &--lg &__face-symbol { font-size: 2.5em; }
  &--lg &__face-name-cn { font-size: 1.1em; }
  &--lg &__face-name-en { font-size: 0.75em; }
}
</style>
