<script setup lang="ts">
/** 設定頁：問題＋牌陣（附縮圖），萬能牌陣可調張數 */
import SpreadMini from "@/components/fate/SpreadMini.vue";
import { useDivinationStore } from "@/stores/divination";
import type { DeckSpread } from "@/types/divination";
import { computed, ref, watch } from "vue";

const store = useDivinationStore();

const MIN_SPREADS_FOR_FILTER = 6;
const category = ref("全部");
const expandedId = ref<string | null>(null);

const showFilter = computed(() => store.deck.spreads.length >= MIN_SPREADS_FOR_FILTER);

const categories = computed(() => {
  const used = new Set(store.deck.spreads.map((s) => s.category));
  return ["全部", ...store.deck.categories.filter((c) => used.has(c))];
});

const spreads = computed(() =>
  category.value === "全部"
    ? store.deck.spreads
    : store.deck.spreads.filter((s) => s.category === category.value),
);

watch(
  () => store.deckId,
  () => {
    category.value = "全部";
    expandedId.value = null;
  },
);

function countLabel(s: DeckSpread) {
  if (!s.flexible) return `${s.positions.length} 張`;
  return `${s.flexible.min}～${s.flexible.max} 張`;
}

function subtitle(s: DeckSpread) {
  return s.summary || [s.category, ...s.tags.slice(0, 2)].join("・");
}

function onRowClick(s: DeckSpread) {
  if (store.spreadId === s.id) {
    expandedId.value = expandedId.value === s.id ? null : s.id;
    return;
  }
  store.selectSpread(s.id);
  expandedId.value = null;
}

const selected = computed(() => store.deck.spreads.find((s) => s.id === store.spreadId));
const canStart = computed(() => store.question.trim().length > 0);
</script>

<template>
  <div class="reading-setup">
    <div class="reading-setup__scroll">
      <label class="reading-setup__label" for="fate-question">你的問題</label>
      <textarea
        id="fate-question"
        v-model="store.question"
        class="reading-setup__question"
        rows="2"
        placeholder="集中精神，讓問題在心中浮現…"
        spellcheck="false"
      />

      <div class="reading-setup__label">選擇牌陣</div>
      <div v-if="showFilter" class="reading-setup__chips" role="tablist">
        <button
          v-for="c in categories"
          :key="c"
          type="button"
          role="tab"
          class="reading-setup__chip"
          :class="{ 'is-on': category === c }"
          :aria-selected="category === c"
          @click="category = c"
        >
          {{ c }}
        </button>
      </div>

      <ul class="reading-setup__list">
        <li
          v-for="s in spreads"
          :key="s.id"
          class="reading-setup__row"
          :class="{ 'is-on': store.spreadId === s.id }"
        >
          <button type="button" class="reading-setup__row-main" @click="onRowClick(s)">
            <SpreadMini :spread="s" :active="store.spreadId === s.id" />
            <span class="reading-setup__row-text">
              <b>{{ s.name }}</b>
              <small>{{ subtitle(s) }}</small>
            </span>
            <span class="reading-setup__count">{{ countLabel(s) }}</span>
          </button>

          <div v-if="store.spreadId === s.id && s.flexible" class="reading-setup__stepper">
            <span>抽幾張？</span>
            <button
              type="button"
              aria-label="少一張"
              :disabled="store.flexibleCount <= s.flexible.min"
              @click="store.setFlexibleCount(store.flexibleCount - 1)"
            >
              −
            </button>
            <b>{{ store.flexibleCount }} 張</b>
            <button
              type="button"
              aria-label="多一張"
              :disabled="store.flexibleCount >= s.flexible.max"
              @click="store.setFlexibleCount(store.flexibleCount + 1)"
            >
              ＋
            </button>
          </div>

          <p v-if="expandedId === s.id" class="reading-setup__desc">
            {{ s.description }}
            <template v-if="!s.flexible">
              <br />
              <span class="reading-setup__positions">
                {{ s.positions.map((p) => p.name).join("・") }}
              </span>
            </template>
          </p>
        </li>
      </ul>
    </div>

    <footer class="reading-setup__foot">
      <div v-if="selected" class="reading-setup__picked">
        {{ selected.name }}・{{ store.selectedSpread.positions.length }} 張
      </div>
      <button type="button" class="fate-btn fate-btn--primary" :disabled="!canStart" @click="store.startTable()">
        {{ canStart ? "開始抽牌" : "先寫下你的問題" }}
      </button>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.reading-setup {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 16px 12px;
  }

  &__label {
    display: block;
    margin: 12px 0 6px;
    font-family: var(--f-font-head);
    font-size: 12px;
    letter-spacing: 0.14em;
    color: var(--f-accent);
  }

  &__question {
    width: 100%;
    min-height: 64px;
    padding: 10px 12px;
    resize: vertical;
    font: inherit;
    font-size: 15px;
    line-height: 1.6;
    color: var(--f-ink);
    background: var(--f-panel);
    border: 1px solid var(--f-line);
    border-radius: var(--f-radius);
    outline: none;

    &::placeholder {
      color: var(--f-ink-2);
      opacity: 0.8;
    }

    &:focus {
      border-color: var(--f-accent);
    }
  }

  &__chips {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 8px;
    margin-bottom: 2px;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  &__chip {
    flex-shrink: 0;
    padding: 4px 12px;
    font-size: 12px;
    color: var(--f-ink);
    background: none;
    border: 1px solid var(--f-line);
    border-radius: var(--f-radius);
    cursor: pointer;

    &.is-on {
      color: var(--f-accent-ink);
      background: var(--f-accent);
      border-color: var(--f-accent);
    }
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__row {
    border: 1px solid var(--f-line);
    border-radius: var(--f-radius);
    background: var(--f-panel);
    transition: border-color 0.2s;

    &.is-on {
      border-color: var(--f-accent);
      box-shadow: inset 0 0 0 1px var(--f-accent);
    }
  }

  &__row-main {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px 8px 8px;
    text-align: left;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }

  &__row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    b {
      font-family: var(--f-font-head);
      font-size: 15px;
      font-weight: 700;
      color: var(--f-ink);
    }

    small {
      font-size: 12px;
      color: var(--f-ink-2);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  &__count {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--f-ink-2);
  }

  &__stepper {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 12px 10px 64px;
    font-size: 13px;
    color: var(--f-ink-2);

    b {
      min-width: 44px;
      text-align: center;
      font-family: var(--f-font-head);
      font-size: 15px;
      color: var(--f-ink);
    }

    button {
      width: 32px;
      height: 32px;
      font-size: 18px;
      line-height: 1;
      color: var(--f-accent);
      background: none;
      border: 1px solid var(--f-line-strong);
      border-radius: var(--f-radius);
      cursor: pointer;

      &:disabled {
        opacity: 0.35;
        cursor: not-allowed;
      }
    }
  }

  &__desc {
    margin: 0;
    padding: 0 12px 12px 64px;
    font-size: 13px;
    line-height: 1.7;
    color: var(--f-ink-2);
  }

  &__positions {
    display: inline-block;
    margin-top: 4px;
    color: var(--f-ink);
    opacity: 0.8;
  }

  &__foot {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 16px calc(12px + var(--safe-bottom, 0px));
    border-top: 1px solid var(--f-line);
  }

  &__picked {
    text-align: center;
    font-size: 12px;
    color: var(--f-ink-2);
  }
}
</style>
