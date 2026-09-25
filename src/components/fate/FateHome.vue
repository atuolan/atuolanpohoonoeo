<script setup lang="ts">
/** 占卜首頁：2×2 方格＋最近 3 筆紀錄 */
import {
  HISTORY_KIND_MARK,
  formatWhen,
  useCombinedHistory,
  type HistoryItem,
} from "@/components/fate/useCombinedHistory";
import { deckOrder, decks } from "@/data/decks";
import type { DeckId } from "@/types/divination";
import { computed } from "vue";

const emit = defineEmits<{
  openDeck: [id: DeckId];
  openAstro: [];
  openItem: [item: HistoryItem];
  openHistory: [];
}>();

const RECENT_COUNT = 3;

const { items } = useCombinedHistory();
const recent = computed(() => items.value.slice(0, RECENT_COUNT));

const deckTiles = deckOrder.map((id) => decks[id]);
</script>

<template>
  <div class="fate-home">
    <header class="fate-home__hero">
      <div class="fate-home__ornament">✦　✦　✦</div>
      <h2 class="fate-home__title">命運之門</h2>
      <p class="fate-home__subtitle">此刻，你想問什麼？</p>
    </header>

    <div class="fate-home__grid">
      <button
        v-for="deck in deckTiles"
        :key="deck.id"
        type="button"
        class="fate-home__tile"
        @click="emit('openDeck', deck.id)"
      >
        <span class="fate-home__thumb"><img :src="deck.thumbnail" alt="" /></span>
        <span class="fate-home__tile-text">
          <b>{{ deck.label }}</b>
          <small>{{ deck.tagline.replace("・", "\n") }}</small>
        </span>
      </button>
      <button type="button" class="fate-home__tile" @click="emit('openAstro')">
        <span class="fate-home__thumb fate-home__thumb--icon">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
            <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <span class="fate-home__tile-text">
          <b>占星骰子</b>
          <small>{{ "三顆骰\n快速解答" }}</small>
        </span>
      </button>
    </div>

    <section class="fate-home__recent">
      <div class="fate-home__section-head">
        <h3>最近的占卜</h3>
        <button v-if="items.length > 0" type="button" class="fate-link" @click="emit('openHistory')">
          全部 ›
        </button>
      </div>
      <p v-if="recent.length === 0" class="fate-home__empty">還沒有占卜紀錄</p>
      <ul v-else class="fate-home__list">
        <li v-for="item in recent" :key="item.kind + item.id">
          <button type="button" class="fate-home__item" @click="emit('openItem', item)">
            <span class="fate-home__mark">{{ HISTORY_KIND_MARK[item.kind] }}</span>
            <span class="fate-home__item-text">
              <span class="fate-home__item-q">{{ item.question || "未記錄問題" }}</span>
              <small>{{ item.summary }}・{{ formatWhen(item.createdAt) }}</small>
            </span>
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped lang="scss">
.fate-home {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px 16px calc(20px + var(--safe-bottom, 0px));

  &__hero {
    text-align: center;
    margin: 18px 0 22px;
  }

  &__ornament {
    font-size: 11px;
    color: var(--f-accent);
    opacity: 0.8;
  }

  &__title {
    margin: 6px 0 4px;
    font-family: var(--f-font-head);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: 0.3em;
    color: var(--f-ink);
  }

  &__subtitle {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.2em;
    color: var(--f-ink-2);
  }

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  &__tile {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 10px;
    text-align: left;
    color: inherit;
    background: var(--f-panel);
    border: 1px solid var(--f-line);
    border-radius: var(--f-radius);
    cursor: pointer;
    transition:
      border-color 0.2s,
      transform 0.2s;

    &:active {
      transform: scale(0.98);
    }

    @media (hover: hover) {
      &:hover {
        border-color: var(--f-accent);
      }
    }
  }

  &__thumb {
    width: 38px;
    height: 63px;
    flex-shrink: 0;
    border-radius: var(--f-radius);
    overflow: hidden;
    box-shadow: var(--f-card-shadow);

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    &--icon {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--f-accent);
      background: var(--f-accent-soft);
    }
  }

  &__tile-text {
    min-width: 0;

    b {
      display: block;
      font-family: var(--f-font-head);
      font-size: 16px;
      font-weight: 700;
      color: var(--f-ink);
    }

    small {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      line-height: 1.5;
      white-space: pre-line;
      color: var(--f-ink-2);
    }
  }

  &__recent {
    margin-top: 24px;
  }

  &__section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;

    h3 {
      margin: 0;
      font-family: var(--f-font-head);
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.14em;
      color: var(--f-accent);
    }
  }

  &__empty {
    margin: 16px 0;
    text-align: center;
    font-size: 13px;
    color: var(--f-ink-2);
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;

    li + li {
      border-top: 1px solid var(--f-line);
    }
  }

  &__item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 0;
    text-align: left;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  &__mark {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--f-font-head);
    font-size: 13px;
    color: var(--f-accent);
    border: 1px solid var(--f-line-strong);
    border-radius: 50%;
  }

  &__item-text {
    flex: 1;
    min-width: 0;

    small {
      display: block;
      margin-top: 2px;
      font-size: 11px;
      color: var(--f-ink-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  &__item-q {
    display: block;
    font-size: 14px;
    color: var(--f-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
</style>
