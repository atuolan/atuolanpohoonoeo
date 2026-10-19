<template>
  <div class="game-center-screen">
    <div class="games-scroll">
      <!-- 頂部導航欄 -->
      <header class="header">
        <button class="back-btn" type="button" aria-label="返回" @click="goBack">
          <ChevronLeft class="icon" />
        </button>
      </header>

      <div class="intro">
        <h1 class="title">遊戲天堂</h1>
        <p class="subtitle">{{ GAMES.length }} 款小遊戲 · 聊累了，就來玩一下</p>
      </div>

      <!-- 依時段推薦 -->
      <button
        class="hero"
        type="button"
        :style="{ background: hero.bg }"
        @click="openGame(hero.game)"
      >
        <span class="hero-art">
          <GameCenterIcon :game="hero.game" :size="132" />
        </span>
        <span class="hero-label">
          <component :is="hero.labelIcon" class="hero-label-icon" />
          {{ hero.label }}
        </span>
        <span class="hero-title">
          <template v-for="(line, i) in hero.lines" :key="i">
            <br v-if="i > 0" />{{ line }}
          </template>
        </span>
        <span class="hero-cta" :style="{ color: hero.bg }">
          {{ hero.cta }}
          <ChevronRight class="hero-cta-icon" />
        </span>
      </button>

      <!-- 繼續玩 -->
      <section v-if="recentGames.length > 0" class="section">
        <div class="section-head">
          <h2 class="section-title">繼續玩</h2>
          <span class="section-aside">上次是 {{ lastPlayedLabel }}</span>
        </div>
        <div class="recent-grid">
          <button
            v-for="g in recentGames"
            :key="g.id"
            class="recent-card"
            type="button"
            @click="openGame(g.id)"
          >
            <GameCenterIcon :game="g.id" :size="44" />
            <span class="recent-name">{{ g.title }}</span>
            <span class="recent-meta">{{ statOf(g.id) || g.desc }}</span>
          </button>
        </div>
      </section>

      <!-- 所有遊戲 -->
      <section class="section">
        <div class="section-head">
          <h2 class="section-title">所有遊戲</h2>
          <span class="section-aside">{{ filteredGames.length }} 款</span>
        </div>

        <div class="chips" role="group" aria-label="遊戲分類">
          <button
            v-for="c in categories"
            :key="c.name"
            type="button"
            class="chip"
            :class="{ active: c.name === selectedCategory }"
            :aria-pressed="c.name === selectedCategory"
            @click="selectedCategory = c.name"
          >
            {{ c.name }} {{ c.count }}
          </button>
        </div>

        <ul class="game-list">
          <li v-for="g in filteredGames" :key="g.id">
            <button class="game-row" type="button" @click="openGame(g.id)">
              <GameCenterIcon :game="g.id" :size="56" />
              <span class="game-info">
                <span class="game-name">{{ g.title }}</span>
                <span class="game-desc">{{ g.desc }}</span>
                <span class="game-meta" :class="{ coin: g.coin }">
                  {{ g.coin ? `${g.cat} · 可賺金幣` : g.cat }}
                  <template v-if="statOf(g.id)"> · {{ statOf(g.id) }}</template>
                </span>
              </span>
              <span class="play-pill">開始</span>
            </button>
          </li>
        </ul>
      </section>
    </div>

    <!-- 遊戲模態框（使用 visible prop 的遊戲） -->
    <FishingGame :visible="currentGame === 'fishing'" @close="closeGame" />
    <DishWashingGame
      :visible="currentGame === 'dishwashing'"
      @close="closeGame"
    />
    <GamblingGame :visible="currentGame === 'gambling'" @close="closeGame" />
    <MeritHub :visible="currentGame === 'merit'" @close="closeGame" />

    <!-- 全屏遊戲（使用 close emit 的遊戲） -->
    <Game2048
      v-if="currentGame === '2048'"
      @close="closeGame"
      @share-to-chat="handleShareToChat"
    />
    <GameSnake v-if="currentGame === 'snake'" @close="closeGame" />
    <GameFoodRoulette
      v-if="currentGame === 'food-roulette'"
      @close="closeGame"
    />
    <GameSudoku v-if="currentGame === 'sudoku'" @close="closeGame" />
    <TetrisGameTest v-if="currentGame === 'tetris'" @close="closeGame" />
    <GamePacman v-if="currentGame === 'pacman'" @close="closeGame" />
  </div>
</template>

<script setup lang="ts">
import Game2048 from "@/components/games/Game2048.vue";
import GameFoodRoulette from "@/components/games/GameFoodRoulette.vue";
import GamePacman from "@/components/games/GamePacman.vue";
import GameSnake from "@/components/games/GameSnake.vue";
import GameSudoku from "@/components/games/GameSudoku.vue";
import TetrisGameTest from "@/components/games/tetris/TetrisGameTest.vue";
import {
    getHighScores as getTetrisHighScores,
    hasSave as hasTetrisSave,
} from "@/components/games/tetris/tetrisSaveManager";
import DishWashingGame from "@/components/modals/DishWashingGame.vue";
import FishingGame from "@/components/modals/FishingGame.vue";
import GamblingGame from "@/components/modals/GamblingGame.vue";
import MeritHub from "@/components/modals/MeritHub.vue";
import GameCenterIcon, {
    type GameCenterGameId,
} from "@/components/screens/GameCenterIcon.vue";
import {
    enterGameScreen,
    leaveGameScreen,
} from "@/composables/useGamePlayingDetector";
import { useMeritStore } from "@/stores/merit";
import { ChevronLeft, ChevronRight, Coffee, Moon, Sun, Sunset } from "lucide-vue-next";
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";

interface GameEntry {
  id: GameCenterGameId;
  title: string;
  desc: string;
  cat: string;
  coin?: boolean;
}

const GAMES: GameEntry[] = [
  { id: "fishing", title: "釣魚", desc: "休閒釣魚小遊戲", cat: "休閒" },
  { id: "dishwashing", title: "洗碗", desc: "幫忙洗碗賺金幣", cat: "休閒", coin: true },
  { id: "gambling", title: "骰子", desc: "試試你的運氣", cat: "博弈" },
  { id: "merit", title: "修行", desc: "敲木魚、盤佛珠", cat: "佛系" },
  { id: "2048", title: "2048", desc: "數字合併挑戰", cat: "益智" },
  { id: "snake", title: "貪吃蛇", desc: "經典貪吃蛇遊戲", cat: "經典" },
  { id: "food-roulette", title: "轉轉飯堂", desc: "今天吃什麼？", cat: "生活" },
  { id: "sudoku", title: "數獨", desc: "邏輯數字填充", cat: "益智" },
  { id: "tetris", title: "俄羅斯方塊", desc: "經典方塊消除", cat: "經典" },
  { id: "pacman", title: "吃豆人", desc: "經典街機，閃躲幽靈", cat: "經典" },
];

const CATEGORY_ORDER = ["全部", "休閒", "益智", "經典", "生活", "佛系", "博弈"];

/** 最近玩過的遊戲（只記在遊戲中心這層，不碰各遊戲自己的存檔） */
const RECENT_KEY = "game-center-recent";
const RECENT_LIMIT = 3;

interface RecentRecord {
  id: GameCenterGameId;
  at: number;
}

const emit = defineEmits<{
  back: [];
  shareToChat: [characterId: string, message: string];
}>();

const meritStore = useMeritStore();

const currentGame = ref<string | null>(null);
const selectedCategory = ref("全部");
const recent = ref<RecentRecord[]>(loadRecent());
/** 關掉遊戲後 +1，讓戰績重新從 localStorage 讀 */
const statsVersion = ref(0);

const categories = computed(() =>
  CATEGORY_ORDER.map((name) => ({
    name,
    count:
      name === "全部"
        ? GAMES.length
        : GAMES.filter((g) => g.cat === name).length,
  })).filter((c) => c.count > 0),
);

const filteredGames = computed(() =>
  selectedCategory.value === "全部"
    ? GAMES
    : GAMES.filter((g) => g.cat === selectedCategory.value),
);

const recentGames = computed(() =>
  recent.value
    .map((r) => GAMES.find((g) => g.id === r.id))
    .filter((g): g is GameEntry => !!g),
);

const lastPlayedLabel = computed(() => {
  const at = recent.value[0]?.at;
  if (!at) return "";
  const d = new Date(at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hm;
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
});

interface HeroPick {
  game: GameCenterGameId;
  label: string;
  labelIcon: Component;
  lines: string[];
  cta: string;
  bg: string;
}

/** 依目前時段推薦一款遊戲 */
const hero = computed<HeroPick>(() => {
  const h = new Date().getHours();
  const label = `現在是${periodName(h)} ${h % 12 === 0 ? 12 : h % 12} 點 · 為你推薦`;
  if (h < 5) {
    return { game: "merit", label, labelIcon: Moon, lines: ["睡不著？", "敲一百零八下木魚"], cta: "開始修行", bg: "#2A2520" };
  }
  if (h < 10) {
    return { game: "sudoku", label, labelIcon: Coffee, lines: ["早上腦袋最清楚", "來一盤數獨暖身"], cta: "開始解題", bg: "#2E2B4A" };
  }
  if ((h >= 11 && h < 13) || (h >= 17 && h < 19)) {
    return { game: "food-roulette", label, labelIcon: Sun, lines: ["肚子餓了？", "讓轉盤決定吃什麼"], cta: "轉一下", bg: "#4A2E22" };
  }
  if (h >= 22) {
    return { game: "fishing", label, labelIcon: Moon, lines: ["夜深了", "安安靜靜釣一會魚"], cta: "去釣魚", bg: "#1F2B3A" };
  }
  return { game: "2048", label, labelIcon: Sunset, lines: ["零碎時間", "合一局 2048"], cta: "開始一局", bg: "#3A2F1A" };
});

function periodName(h: number): string {
  if (h < 5) return "凌晨";
  if (h < 11) return "早上";
  if (h < 13) return "中午";
  if (h < 18) return "下午";
  return "晚上";
}

function loadRecent(): RecentRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as RecentRecord[];
    return Array.isArray(list)
      ? list.filter((r) => GAMES.some((g) => g.id === r.id)).slice(0, RECENT_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function recordRecent(id: GameCenterGameId) {
  recent.value = [
    { id, at: Date.now() },
    ...recent.value.filter((r) => r.id !== id),
  ].slice(0, RECENT_LIMIT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.value));
  } catch {
    /* ignore */
  }
}

function readNumber(key: string): number {
  const n = parseInt(localStorage.getItem(key) || "", 10);
  return Number.isFinite(n) ? n : 0;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** 從各遊戲既有的存檔讀出一句戰績（唯讀） */
const stats = computed<Partial<Record<GameCenterGameId, string>>>(() => {
  void statsVersion.value;
  const out: Partial<Record<GameCenterGameId, string>> = {};

  const best2048 = readNumber("2048-best-score");
  if (localStorage.getItem("2048-game-state")) {
    const cur = readJson<{ score?: number }>("2048-game-state")?.score ?? 0;
    out["2048"] = cur > 0 ? `這局 ${cur.toLocaleString()}` : "有一局沒玩完";
  } else if (best2048 > 0) {
    out["2048"] = `最高 ${best2048.toLocaleString()}`;
  }

  const sudoku = readJson<{ timestamp?: number }>("sudoku-auto-save");
  if (sudoku && Date.now() - (sudoku.timestamp || 0) <= 86400000) {
    out.sudoku = "有一盤沒填完";
  }

  const snake = readNumber("snake_best_score");
  if (snake > 0) out.snake = `最高 ${snake.toLocaleString()}`;

  const pacman = readNumber("pacman_best_score");
  if (pacman > 0) out.pacman = `最高 ${pacman.toLocaleString()}`;

  if (hasTetrisSave()) {
    out.tetris = "有一局沒玩完";
  } else {
    const top = getTetrisHighScores()[0]?.score ?? 0;
    if (top > 0) out.tetris = `最高 ${top.toLocaleString()}`;
  }

  const lastMeal = readJson<{ history?: { name: string }[] }>(
    "food-roulette-data",
  )?.history?.[0]?.name;
  if (lastMeal) out["food-roulette"] = `上次轉到 ${lastMeal}`;

  if (meritStore.state.totalEarned > 0) {
    out.merit = `功德 ${meritStore.state.balance.toLocaleString()}`;
  }

  return out;
});

function statOf(id: GameCenterGameId): string {
  return stats.value[id] ?? "";
}

onMounted(() => {
  meritStore.initialize();
});

function goBack() {
  emit("back");
}

function openGame(gameId: GameCenterGameId) {
  // 切換或新進入遊戲畫面：通知 detector
  if (currentGame.value && currentGame.value !== gameId) {
    leaveGameScreen(currentGame.value);
  }
  currentGame.value = gameId;
  enterGameScreen(gameId);
  recordRecent(gameId);
}

function closeGame() {
  if (currentGame.value) {
    leaveGameScreen(currentGame.value);
  }
  currentGame.value = null;
  statsVersion.value++;
}

onBeforeUnmount(() => {
  if (currentGame.value) {
    leaveGameScreen(currentGame.value);
    currentGame.value = null;
  }
});

function handleShareToChat(characterId: string, message: string) {
  currentGame.value = null;
  emit("shareToChat", characterId, message);
}
</script>

<style scoped lang="scss">
.game-center-screen {
  --gc-bg: var(--color-background, #f6f5f2);
  --gc-surface: var(--color-surface, #ffffff);
  --gc-text: var(--color-text, #121214);
  --gc-text-2: var(--color-text-secondary, #5e5e64);
  --gc-border: var(--color-border, #e7e5e0);
  --gc-coin: #8a5a00;

  width: 100%;
  height: 100vh;
  height: 100dvh;
  background: var(--gc-bg);
  color: var(--gc-text);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.games-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0 20px;
  padding-top: max(12px, var(--safe-top, 0px));
  padding-bottom: max(28px, var(--safe-bottom, 0px));
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.back-btn,
.hero,
.recent-card,
.chip,
.game-row {
  font: inherit;
  color: inherit;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.header {
  display: flex;
  align-items: center;
  height: 44px;
  margin-bottom: -10px;

  .back-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--gc-surface);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.15s;

    .icon {
      width: 20px;
      height: 20px;
    }

    &:active {
      transform: scale(0.94);
    }
  }
}

.intro {
  .title {
    margin: 0;
    font-size: 32px;
    font-weight: 700;
    line-height: 1.2;
  }

  .subtitle {
    margin: 4px 0 0;
    font-size: 13px;
    color: var(--gc-text-2);
  }
}

/* ===== 推薦卡 ===== */
.hero {
  position: relative;
  display: block;
  width: 100%;
  min-height: 188px;
  box-sizing: border-box;
  border-radius: 28px;
  padding: 20px;
  color: #ffffff;
  overflow: hidden;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.985);
  }
}

.hero-art {
  position: absolute;
  right: -10px;
  bottom: -14px;
  transform: rotate(-8deg);
  pointer-events: none;
}

.hero-label {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.hero-label-icon {
  width: 13px;
  height: 13px;
}

.hero-title {
  position: relative;
  display: block;
  max-width: 62%;
  margin-top: 10px;
  font-size: 23px;
  font-weight: 700;
  line-height: 1.35;
}

.hero-cta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 40px;
  margin-top: 18px;
  padding: 0 16px 0 18px;
  border-radius: 20px;
  background: #ffffff;
  font-size: 14px;
  font-weight: 700;
}

.hero-cta-icon {
  width: 16px;
  height: 16px;
}

/* ===== 區塊 ===== */
.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}

.section-aside {
  font-size: 13px;
  color: var(--gc-text-2);
}

/* ===== 繼續玩 ===== */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.recent-card {
  min-width: 0;
  background: var(--gc-surface);
  border-radius: 20px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: transform 0.15s;

  &:active {
    transform: scale(0.97);
  }
}

.recent-name {
  margin-top: 6px;
  font-size: 14px;
  font-weight: 700;
}

.recent-meta {
  font-size: 11px;
  color: var(--gc-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 分類 ===== */
.chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  margin: 0 -20px;
  padding: 0 20px 4px;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.chip {
  flex-shrink: 0;
  height: 36px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid var(--gc-border);
  background: var(--gc-surface);
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  transition:
    background 0.15s,
    color 0.15s;

  &.active {
    background: var(--gc-text);
    border-color: var(--gc-text);
    color: var(--gc-surface);
  }
}

/* ===== 遊戲列表 ===== */
.game-list {
  list-style: none;
  margin: 0;
  padding: 0;

  li + li .game-row {
    border-top: 1px solid var(--gc-border);
  }
}

.game-row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 0;

  &:active .play-pill {
    background: var(--gc-text);
    color: var(--gc-surface);
  }
}

.game-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.game-name {
  font-size: 16px;
  font-weight: 700;
}

.game-desc {
  font-size: 13px;
  color: var(--gc-text-2);
}

.game-meta {
  font-size: 11px;
  color: var(--gc-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.coin {
    color: var(--gc-coin);
  }
}

.play-pill {
  flex-shrink: 0;
  height: 32px;
  padding: 0 16px;
  border-radius: 16px;
  background: var(--gc-surface);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  transition:
    background 0.15s,
    color 0.15s;
}
</style>
