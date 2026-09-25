<script setup lang="ts">
/**
 * 抽牌頁：上方牌陣、下方扇形牌堆；選滿後牌堆收起，在同一個牌陣上翻牌
 * 解讀時牌陣留在原處，解讀從底部抽屜升起
 * 整頁不捲動
 */
import CardDetailSheet from "@/components/fate/CardDetailSheet.vue";
import FanDeck from "@/components/fate/FanDeck.vue";
import InterpretDrawer from "@/components/fate/InterpretDrawer.vue";
import NumberPickDialog from "@/components/fate/NumberPickDialog.vue";
import SpreadBoard from "@/components/fate/SpreadBoard.vue";
import { useDivinationStore } from "@/stores/divination";
import type { DrawerSnap } from "@/types/divination";
import { marked } from "marked";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const COLLAPSE_DELAY_MS = 600;

const store = useDivinationStore();

const showFan = ref(!store.isPickComplete);
let collapseTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.isPickComplete,
  (complete) => {
    if (collapseTimer) clearTimeout(collapseTimer);
    if (!complete) {
      showFan.value = true;
      return;
    }
    // 停一下讓最後一張落位，再收起牌堆
    collapseTimer = setTimeout(() => (showFan.value = false), COLLAPSE_DELAY_MS);
  },
);

onBeforeUnmount(() => {
  if (collapseTimer) clearTimeout(collapseTimer);
});

const isInterpret = computed(() => store.phase === "interpret");
const boardMode = computed(() => (showFan.value && !isInterpret.value ? "pick" : "reveal"));
const pickedSet = computed(() => new Set(store.picked));

// ===== 牌義卡 =====
const selectedIndex = ref<number | null>(null);
const selectedDrawn = computed(() =>
  selectedIndex.value === null ? null : (store.drawn[selectedIndex.value] ?? null),
);

function onSelect(i: number) {
  if (!store.revealed.has(i)) {
    store.revealCard(i);
    return;
  }
  selectedIndex.value = i;
}

// ===== 報數字 =====
const numberOpen = ref(false);
const numberError = ref<string | null>(null);

function openNumberPick() {
  numberError.value = null;
  numberOpen.value = true;
}

function submitNumbers(input: string) {
  const error = store.pickByNumbers(input);
  numberError.value = error;
  if (!error) numberOpen.value = false;
}

// ===== 解讀 =====
const drawerSnap = ref<DrawerSnap>("half");

watch(isInterpret, (v) => {
  if (v) drawerSnap.value = "half";
});

const interpretationHtml = computed(() => {
  if (!store.interpretation) return "";
  const raw = store.isInterpreting ? `${store.interpretation}▌` : store.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

// ===== 返回鍵 =====
/** 回傳 true 代表已在這頁處理完，外殼不用再導航 */
function handleBack(): boolean {
  if (selectedIndex.value !== null) {
    selectedIndex.value = null;
    return true;
  }
  if (numberOpen.value) {
    numberOpen.value = false;
    return true;
  }
  if (isInterpret.value) {
    if (drawerSnap.value !== "peek") {
      drawerSnap.value = "peek";
      return true;
    }
    return false;
  }
  if (store.revealed.size > 0 && !confirm("要放棄這次的牌嗎？")) return true;
  store.backToSetup();
  return true;
}

defineExpose({ handleBack });
</script>

<template>
  <div class="reading-table" :class="{ 'is-interpret': isInterpret }">
    <p class="reading-table__question">「{{ store.question }}」</p>

    <div class="reading-table__board">
      <SpreadBoard
        v-if="store.tableSpread"
        :spread="store.tableSpread"
        :drawn="store.drawn"
        :revealed="store.revealed"
        :card-back="store.deck.cardBack"
        :mode="boardMode"
        :selected="selectedIndex"
        @select="onSelect"
      />
    </div>

    <!-- 抽牌中 -->
    <div class="reading-table__picker" :class="{ 'is-collapsed': !showFan || isInterpret }">
      <div class="reading-table__status">
        <span>
          已選 <b>{{ store.drawn.length }}</b> / {{ store.requiredPicks }}
        </span>
        <span class="reading-table__tools">
          <button type="button" class="fate-link" :disabled="store.isPickComplete" @click="store.reshuffle()">
            ↻ 洗牌
          </button>
          <button type="button" class="fate-link" :disabled="store.isPickComplete" @click="openNumberPick">
            ⌨ 報數字
          </button>
        </span>
      </div>
      <div class="reading-table__fan">
        <FanDeck
          :count="store.shuffled.length"
          :picked="pickedSet"
          :card-back="store.deck.cardBack"
          :disabled="store.isPickComplete"
          @pick="store.pickCard"
        />
      </div>
    </div>

    <!-- 翻牌中 -->
    <footer v-if="!showFan && !isInterpret" class="reading-table__actions">
      <template v-if="!store.allRevealed">
        <span class="reading-table__hint">點牌翻開，順序不限</span>
        <button type="button" class="fate-btn" @click="store.revealAll()">全部翻開</button>
      </template>
      <template v-else>
        <span class="reading-table__hint">點牌可看牌義</span>
        <button type="button" class="fate-btn fate-btn--primary" @click="store.requestInterpretation()">
          請求解讀
        </button>
      </template>
    </footer>

    <!-- 解讀抽屜佔掉的高度，讓牌陣縮到上方 -->
    <div v-if="isInterpret" class="reading-table__drawer-space" :class="`is-${drawerSnap}`" />

    <InterpretDrawer
      v-if="isInterpret"
      v-model:snap="drawerSnap"
      :html="interpretationHtml"
      :loading="store.isInterpreting"
      :error="store.interpretError"
      @retry="store.requestInterpretation()"
      @new-reading="store.newReading()"
    />

    <CardDetailSheet
      :drawn="selectedDrawn"
      :has-reversed="store.deck.hasReversed"
      @close="selectedIndex = null"
    />

    <NumberPickDialog
      :open="numberOpen"
      :count="store.requiredPicks"
      :max="store.deck.cardCount"
      :error="numberError"
      @close="numberOpen = false"
      @submit="submitNumbers"
    />
  </div>
</template>

<style scoped lang="scss">
.reading-table {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &__question {
    flex-shrink: 0;
    margin: 6px 16px 0;
    text-align: center;
    font-size: 13px;
    color: var(--f-ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__board {
    flex: 1;
    min-height: 0;
    padding: 10px 16px 8px;
    display: flex;
  }

  &__picker {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    height: calc(clamp(150px, 26vh, 200px) + 30px);
    overflow: hidden;
    transition:
      height 0.45s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.3s;

    &.is-collapsed {
      height: 0;
      opacity: 0;
      pointer-events: none;
    }
  }

  &__status {
    flex-shrink: 0;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    font-size: 12px;
    color: var(--f-ink-2);

    b {
      color: var(--f-accent);
      font-weight: 600;
    }
  }

  &__tools {
    display: flex;
    gap: 14px;
  }

  &__fan {
    flex: 1;
    min-height: 0;
  }

  &__actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px calc(12px + var(--safe-bottom, 0px));
    border-top: 1px solid var(--f-line);
    animation: rise 0.4s cubic-bezier(0.22, 1, 0.36, 1);

    .fate-btn {
      flex: 0 0 auto;
      min-width: 132px;
      margin-left: auto;
    }
  }

  &__hint {
    font-size: 12px;
    color: var(--f-ink-2);
  }

  &__drawer-space {
    flex-shrink: 0;
    transition: height 0.35s cubic-bezier(0.22, 1, 0.36, 1);

    &.is-peek {
      height: 60px;
    }

    &.is-half {
      height: 55%;
    }

    &.is-full {
      height: 0;
    }
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}
</style>
