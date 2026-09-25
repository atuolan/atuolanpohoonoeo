<script setup lang="ts">
/** 牌義卡：點已翻開的牌時從底部彈出 */
import type { DrawnCard } from "@/types/divination";
import { computed } from "vue";

const props = defineProps<{ drawn: DrawnCard | null; hasReversed: boolean }>();
const emit = defineEmits<{ close: [] }>();

const content = computed(() => {
  const d = props.drawn;
  if (!d) return null;
  const reversed = props.hasReversed && d.reversed;
  return {
    reversed,
    keywords: (reversed ? d.card.keywords.reversed : null) ?? d.card.keywords.upright,
    meaning: (reversed ? d.card.meaning.reversed : null) ?? d.card.meaning.upright,
  };
});
</script>

<template>
  <Transition name="sheet">
    <div v-if="drawn && content" class="card-sheet" @click.self="emit('close')">
      <section class="card-sheet__panel" role="dialog" :aria-label="drawn.card.name">
        <div class="card-sheet__grab" />
        <div class="card-sheet__scroll">
          <div class="card-sheet__head">
            <div class="card-sheet__img" :class="{ 'is-reversed': content.reversed }">
              <img :src="drawn.card.image" :alt="drawn.card.name" />
            </div>
            <div class="card-sheet__title">
              <div class="card-sheet__pos">{{ drawn.position.name }}</div>
              <h3 class="card-sheet__name">{{ drawn.card.name }}</h3>
              <div v-if="drawn.card.subName" class="card-sheet__sub">{{ drawn.card.subName }}</div>
              <span
                v-if="hasReversed"
                class="card-sheet__badge"
                :class="content.reversed ? 'is-reversed' : 'is-upright'"
              >
                {{ content.reversed ? "逆位" : "正位" }}
              </span>
              <p class="card-sheet__pos-desc">{{ drawn.position.description }}</p>
            </div>
          </div>

          <div v-if="content.keywords.length" class="card-sheet__chips">
            <span v-for="k in content.keywords" :key="k" class="card-sheet__chip">{{ k }}</span>
          </div>

          <p class="card-sheet__meaning">{{ content.meaning }}</p>

          <div v-for="e in drawn.card.extra ?? []" :key="e.label" class="card-sheet__extra">
            <h4>{{ e.label }}</h4>
            <p>{{ e.text }}</p>
          </div>
        </div>
        <button type="button" class="fate-btn card-sheet__close" @click="emit('close')">關閉</button>
      </section>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
.card-sheet {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: flex-end;
  background: var(--f-scrim);

  &__panel {
    width: 100%;
    max-height: 70%;
    display: flex;
    flex-direction: column;
    background: var(--f-panel-solid);
    border-top: 1px solid var(--f-line-strong);
    border-radius: 16px 16px 0 0;
    padding: 8px 18px calc(12px + var(--safe-bottom, 0px));
    box-shadow: 0 -10px 30px rgba(0, 0, 0, 0.35);
  }

  &__grab {
    width: 36px;
    height: 4px;
    border-radius: 4px;
    background: var(--f-line-strong);
    margin: 0 auto 10px;
    flex-shrink: 0;
  }

  &__scroll {
    overflow-y: auto;
    overscroll-behavior: contain;
    min-height: 0;
  }

  &__head {
    display: flex;
    gap: 14px;
    align-items: flex-start;
  }

  &__img {
    width: 84px;
    flex-shrink: 0;
    border-radius: var(--f-radius);
    overflow: hidden;
    box-shadow: var(--f-card-shadow);

    img {
      display: block;
      width: 100%;
      aspect-ratio: 3 / 5;
      object-fit: cover;
    }

    &.is-reversed img {
      transform: rotate(180deg);
    }
  }

  &__title {
    min-width: 0;
  }

  &__pos {
    font-family: var(--f-font-head);
    font-size: 11px;
    letter-spacing: 0.12em;
    color: var(--f-accent);
  }

  &__name {
    margin: 2px 0 0;
    font-family: var(--f-font-head);
    font-size: 20px;
    font-weight: 700;
    color: var(--f-ink);
  }

  &__sub {
    font-size: 12px;
    color: var(--f-ink-2);
  }

  &__badge {
    display: inline-block;
    margin-top: 6px;
    padding: 1px 8px;
    font-size: 11px;
    border: 1px solid currentColor;
    border-radius: var(--f-radius);

    &.is-upright {
      color: var(--f-upright);
    }

    &.is-reversed {
      color: var(--f-reversed);
    }
  }

  &__pos-desc {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--f-ink-2);
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 14px 0 10px;
  }

  &__chip {
    padding: 2px 9px;
    font-size: 12px;
    color: var(--f-ink);
    border: 1px solid var(--f-line);
    border-radius: var(--f-radius);
  }

  &__meaning {
    margin: 0;
    font-size: 14px;
    line-height: 1.8;
    color: var(--f-ink);
  }

  &__extra {
    margin-top: 12px;

    h4 {
      margin: 0 0 2px;
      font-family: var(--f-font-head);
      font-size: 13px;
      color: var(--f-accent);
    }

    p {
      margin: 0;
      font-size: 13px;
      line-height: 1.75;
      color: var(--f-ink-2);
    }
  }

  &__close {
    flex: none;
    margin-top: 12px;
  }
}

.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.25s;

  .card-sheet__panel {
    transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;

  .card-sheet__panel {
    transform: translateY(100%);
  }
}
</style>
