<script setup lang="ts">
/** 占卜歷史：列表（可依類型篩選）＋單筆詳情（牌陣、牌義、解讀、重新解讀） */
import CardDetailSheet from "@/components/fate/CardDetailSheet.vue";
import SpreadBoard from "@/components/fate/SpreadBoard.vue";
import {
  HISTORY_KIND_LABEL,
  HISTORY_KIND_MARK,
  formatWhen,
  useCombinedHistory,
  type HistoryItem,
  type HistoryKind,
} from "@/components/fate/useCombinedHistory";
import { decks } from "@/data/decks";
import { useDivinationStore } from "@/stores/divination";
import { marked } from "marked";
import { computed, ref } from "vue";

const props = defineProps<{ initialItem?: HistoryItem | null }>();
const emit = defineEmits<{ reinterpreted: [] }>();

const store = useDivinationStore();
const { items, remove, clearAll } = useCombinedHistory();

const FILTERS: ("all" | HistoryKind)[] = ["all", "tarot", "lenormand", "oracle", "astro"];
const filter = ref<"all" | HistoryKind>("all");
const filtered = computed(() =>
  filter.value === "all" ? items.value : items.value.filter((i) => i.kind === filter.value),
);

const detail = ref<HistoryItem | null>(props.initialItem ?? null);
/** 從首頁直接點進詳情時，返回要回首頁而不是列表 */
const openedDirectly = ref(Boolean(props.initialItem));
const selectedIndex = ref<number | null>(null);

const detailHtml = computed(() =>
  detail.value?.interpretation
    ? (marked.parse(detail.value.interpretation, { async: false }) as string)
    : "",
);

const detailDeck = computed(() =>
  detail.value?.record ? decks[detail.value.record.deckId] : null,
);

const allRevealed = computed(
  () => new Set(detail.value?.record?.drawn.map((_, i) => i) ?? []),
);

function openDetail(item: HistoryItem) {
  detail.value = item;
  openedDirectly.value = false;
}

async function onDelete(item: HistoryItem) {
  if (!confirm("確定要刪除這筆紀錄嗎？")) return;
  await remove(item);
  if (detail.value?.id === item.id) detail.value = null;
}

async function onClearAll() {
  if (!confirm("確定要清空所有占卜紀錄嗎？此操作無法復原。")) return;
  await clearAll();
}

async function onReinterpret() {
  const record = detail.value?.record;
  if (!record) return;
  emit("reinterpreted");
  await store.reinterpret(record);
}

function handleBack(): boolean {
  if (selectedIndex.value !== null) {
    selectedIndex.value = null;
    return true;
  }
  if (detail.value && !openedDirectly.value) {
    detail.value = null;
    return true;
  }
  return false;
}

defineExpose({ handleBack });
</script>

<template>
  <div class="reading-history">
    <!-- 詳情 -->
    <div v-if="detail" class="reading-history__detail">
      <div class="reading-history__detail-head">
        <span class="reading-history__mark">{{ HISTORY_KIND_MARK[detail.kind] }}</span>
        <span>
          {{ HISTORY_KIND_LABEL[detail.kind] }}
          <template v-if="detail.record">・{{ detail.record.spread.name }}</template>
          ・{{ formatWhen(detail.createdAt) }}
        </span>
      </div>
      <h3 class="reading-history__question">「{{ detail.question || "未記錄問題" }}」</h3>

      <div v-if="detail.record && detailDeck" class="reading-history__board">
        <SpreadBoard
          :spread="detail.record.spread"
          :drawn="detail.record.drawn"
          :revealed="allRevealed"
          :card-back="detailDeck.cardBack"
          mode="static"
          :selected="selectedIndex"
          @select="selectedIndex = $event"
        />
      </div>
      <p v-if="detail.record" class="reading-history__tip">點牌可看牌義</p>

      <div v-if="detail.astro" class="reading-history__dice">
        <span>{{ detail.astro.result.planet.symbol }} {{ detail.astro.result.planet.nameCn }}</span>
        <span>{{ detail.astro.result.sign.symbol }} {{ detail.astro.result.sign.nameCn }}</span>
        <span>{{ detail.astro.result.house.romanNumeral }} {{ detail.astro.result.house.nameCn }}</span>
      </div>

      <div class="reading-history__interp">
        <div v-if="detailHtml" class="fate-markdown" v-html="detailHtml" />
        <p v-else class="reading-history__empty">沒有解讀紀錄</p>
      </div>

      <div class="reading-history__actions">
        <button type="button" class="fate-btn" @click="onDelete(detail)">刪除</button>
        <button v-if="detail.record" type="button" class="fate-btn fate-btn--primary" @click="onReinterpret">
          重新解讀
        </button>
      </div>

      <CardDetailSheet
        :drawn="selectedIndex !== null && detail.record ? (detail.record.drawn[selectedIndex] ?? null) : null"
        :has-reversed="detailDeck?.hasReversed ?? false"
        @close="selectedIndex = null"
      />
    </div>

    <!-- 列表 -->
    <template v-else>
      <div class="reading-history__filters" role="tablist">
        <button
          v-for="f in FILTERS"
          :key="f"
          type="button"
          role="tab"
          class="reading-history__chip"
          :class="{ 'is-on': filter === f }"
          :aria-selected="filter === f"
          @click="filter = f"
        >
          {{ f === "all" ? "全部" : HISTORY_KIND_LABEL[f] }}
        </button>
      </div>

      <div class="reading-history__scroll">
        <p v-if="filtered.length === 0" class="reading-history__empty">還沒有占卜紀錄</p>
        <ul v-else class="reading-history__list">
          <li v-for="item in filtered" :key="item.kind + item.id" class="reading-history__row">
            <button type="button" class="reading-history__item" @click="openDetail(item)">
              <span class="reading-history__mark">{{ HISTORY_KIND_MARK[item.kind] }}</span>
              <span class="reading-history__item-text">
                <span class="reading-history__item-q">{{ item.question || "未記錄問題" }}</span>
                <small>{{ item.summary }}</small>
                <small>{{ formatWhen(item.createdAt) }}</small>
              </span>
            </button>
            <button type="button" class="fate-link reading-history__delete" @click="onDelete(item)">刪除</button>
          </li>
        </ul>
        <button
          v-if="items.length > 0"
          type="button"
          class="fate-link reading-history__clear"
          @click="onClearAll"
        >
          清空全部紀錄
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.reading-history {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &__filters {
    flex-shrink: 0;
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 10px 16px 8px;
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

  &__scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 16px calc(20px + var(--safe-bottom, 0px));
  }

  &__list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;

    & + & {
      border-top: 1px solid var(--f-line);
    }
  }

  &__item {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 0;
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
    display: inline-flex;
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

  &__delete {
    flex-shrink: 0;
    color: var(--f-danger);
  }

  &__clear {
    display: block;
    margin: 20px auto 0;
    color: var(--f-danger);
  }

  &__empty {
    margin: 32px 0;
    text-align: center;
    font-size: 13px;
    color: var(--f-ink-2);
  }

  &__detail {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px 16px calc(20px + var(--safe-bottom, 0px));
  }

  &__detail-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--f-ink-2);
  }

  &__question {
    margin: 10px 0 6px;
    font-family: var(--f-font-head);
    font-size: 17px;
    line-height: 1.5;
    color: var(--f-ink);
  }

  &__board {
    height: min(46vh, 380px);
    display: flex;
    margin: 8px 0 0;
  }

  &__tip {
    margin: 4px 0 0;
    text-align: center;
    font-size: 11px;
    color: var(--f-ink-2);
  }

  &__dice {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0;

    span {
      padding: 6px 12px;
      font-size: 14px;
      color: var(--f-ink);
      border: 1px solid var(--f-line-strong);
      border-radius: var(--f-radius);
    }
  }

  &__interp {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--f-line);
  }

  &__actions {
    display: flex;
    gap: 10px;
    margin-top: 18px;
  }
}
</style>
