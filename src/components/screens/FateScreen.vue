<script setup lang="ts">
/**
 * 命運占卜主畫面（外殼）
 * 塔羅／雷諾曼／神諭卡共用一套流程：首頁 → 設定 → 抽牌＋翻牌 → 解讀
 * 占星骰子沿用自己的面板
 */
import AstroDicePanel from "@/components/fate/AstroDicePanel.vue";
import FateHome from "@/components/fate/FateHome.vue";
import ReadingHistory from "@/components/fate/ReadingHistory.vue";
import ReadingSetup from "@/components/fate/ReadingSetup.vue";
import ReadingTable from "@/components/fate/ReadingTable.vue";
import type { HistoryItem } from "@/components/fate/useCombinedHistory";
import { useFateTheme } from "@/composables/useFateTheme";
import { useAstroDiceStore } from "@/stores/astroDice";
import { useDivinationStore } from "@/stores/divination";
import type { DeckId } from "@/types/divination";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{ back: [] }>();

const store = useDivinationStore();
const astroStore = useAstroDiceStore();
const { mode, isNight, themeClass, cycleMode } = useFateTheme();

type View = "main" | "history" | "astro";
const view = ref<View>("main");
const historyItem = ref<HistoryItem | null>(null);

const tableRef = ref<InstanceType<typeof ReadingTable> | null>(null);
const historyRef = ref<InstanceType<typeof ReadingHistory> | null>(null);

const title = computed(() => {
  if (view.value === "history") return "占卜紀錄";
  if (view.value === "astro") return "占星骰子";
  switch (store.phase) {
    case "setup":
      return `${store.deck.label}占卜`;
    case "table":
    case "interpret":
      return `${store.deck.label}・${store.tableSpread?.name ?? ""}`;
    default:
      return "FATE";
  }
});

const THEME_LABEL = { auto: "日夜：自動（依時間）", day: "日夜：日間", night: "日夜：夜間" } as const;
const themeIcon = computed(() => (mode.value === "auto" ? "◐" : isNight.value ? "☾" : "☀"));

function openDeck(id: DeckId) {
  view.value = "main";
  store.openDeck(id);
}

function openAstro() {
  view.value = "astro";
}

function openHistory(item: HistoryItem | null = null) {
  historyItem.value = item;
  view.value = "history";
}

function toggleHistory() {
  if (view.value === "history") view.value = "main";
  else openHistory();
}

function onReinterpreted() {
  view.value = "main";
}

function handleBack() {
  if (view.value === "history") {
    if (historyRef.value?.handleBack()) return;
    view.value = "main";
    return;
  }
  if (view.value === "astro") {
    astroStore.reset();
    view.value = "main";
    return;
  }
  switch (store.phase) {
    case "table":
    case "interpret":
      if (tableRef.value?.handleBack()) return;
      store.goHome();
      return;
    case "setup":
      store.goHome();
      return;
    default:
      emit("back");
  }
}

onMounted(() => {
  if (!store.isHistoryLoaded) void store.loadHistory();
  if (!astroStore.isHistoryLoaded) void astroStore.loadHistory();
});
</script>

<template>
  <div class="fate-screen" :class="themeClass">
    <header class="fate-screen__header">
      <button type="button" class="fate-screen__icon-btn" aria-label="返回" @click="handleBack">‹ 返回</button>
      <h1 class="fate-screen__title">{{ title }}</h1>
      <div class="fate-screen__header-right">
        <button
          type="button"
          class="fate-screen__icon-btn fate-screen__theme"
          :aria-label="THEME_LABEL[mode]"
          :title="THEME_LABEL[mode]"
          @click="cycleMode"
        >
          {{ themeIcon }}
        </button>
        <button type="button" class="fate-screen__icon-btn" @click="toggleHistory">
          {{ view === "history" ? "占卜" : "紀錄" }}
        </button>
      </div>
    </header>

    <main class="fate-screen__body" :class="{ 'is-astro': view === 'astro' }">
      <ReadingHistory
        v-if="view === 'history'"
        ref="historyRef"
        :initial-item="historyItem"
        @reinterpreted="onReinterpreted"
      />

      <AstroDicePanel v-else-if="view === 'astro'" @back="view = 'main'" />

      <template v-else>
        <FateHome
          v-if="store.phase === 'home'"
          @open-deck="openDeck"
          @open-astro="openAstro"
          @open-item="openHistory"
          @open-history="openHistory()"
        />
        <ReadingSetup v-else-if="store.phase === 'setup'" />
        <ReadingTable v-else ref="tableRef" />
      </template>
    </main>
  </div>
</template>

<style lang="scss">
@use "@/components/fate/fate-theme.scss";
</style>

<style scoped lang="scss">
.fate-screen {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--f-bg);
  background-color: var(--f-bg-flat);
  color: var(--f-ink);
  font-family: var(--f-font-body);
  transition:
    background 0.4s,
    color 0.4s;

  &__header {
    flex-shrink: 0;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    padding-top: max(10px, var(--safe-top, 0px));
    border-bottom: 1px solid var(--f-line);
  }

  &__title {
    margin: 0;
    max-width: 52vw;
    font-family: var(--f-font-head);
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--f-accent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: center;
  }

  &__header-right {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
  }

  &__icon-btn {
    justify-self: start;
    min-width: 36px;
    min-height: 36px;
    padding: 6px 8px;
    font-size: 13px;
    color: var(--f-ink-2);
    background: none;
    border: none;
    border-radius: var(--f-radius);
    cursor: pointer;

    &:active {
      background: var(--f-accent-soft);
    }
  }

  &__theme {
    font-size: 17px;
    color: var(--f-accent);
  }

  &__body {
    position: relative;
    flex: 1;
    min-height: 0;
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;

    &.is-astro {
      max-width: none;
    }
  }
}
</style>
