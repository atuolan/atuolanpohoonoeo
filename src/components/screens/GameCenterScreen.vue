<template>
  <div class="game-center-screen">
    <!-- 頂部導航欄 -->
    <div class="header">
      <button class="back-btn" @click="goBack">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">遊戲天堂</h1>
      <div class="spacer"></div>
    </div>

    <!-- 遊戲列表 -->
    <div class="games-container">
      <div class="games-grid">
        <!-- 釣魚遊戲 -->
        <div class="game-card" @click="openGame('fishing')">
          <div class="game-icon fishing">
            <Fish class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">釣魚</h3>
            <p class="game-desc">休閒釣魚小遊戲</p>
            <span class="game-category">休閒</span>
          </div>
        </div>

        <!-- 洗碗遊戲 -->
        <div class="game-card" @click="openGame('dishwashing')">
          <div class="game-icon dishwashing">
            <Sparkles class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">洗碗</h3>
            <p class="game-desc">幫忙洗碗賺金幣</p>
            <span class="game-category">休閒</span>
          </div>
        </div>

        <!-- 賭博遊戲 -->
        <div class="game-card" @click="openGame('gambling')">
          <div class="game-icon gambling">
            <Dices class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">骰子</h3>
            <p class="game-desc">試試你的運氣</p>
            <span class="game-category">博弈</span>
          </div>
        </div>

        <!-- 修行系統 -->
        <div class="game-card" @click="openGame('merit')">
          <div class="game-icon merit">
            <svg viewBox="0 0 24 24" fill="currentColor" class="icon">
              <ellipse cx="12" cy="14" rx="9" ry="7" />
              <ellipse cx="12" cy="8" rx="3" ry="2" />
              <circle cx="12" cy="6" r="1.5" />
            </svg>
          </div>
          <div class="game-info">
            <h3 class="game-name">修行</h3>
            <p class="game-desc">敲木魚、盤佛珠</p>
            <span class="game-category">佛系</span>
          </div>
        </div>

        <!-- 2048 -->
        <div class="game-card" @click="openGame('2048')">
          <div class="game-icon game-2048">
            <Grid3x3 class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">2048</h3>
            <p class="game-desc">數字合併挑戰</p>
            <span class="game-category">益智</span>
          </div>
        </div>

        <!-- 貪吃蛇 -->
        <div class="game-card" @click="openGame('snake')">
          <div class="game-icon game-snake">
            <Joystick class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">貪吃蛇</h3>
            <p class="game-desc">經典貪吃蛇遊戲</p>
            <span class="game-category">經典</span>
          </div>
        </div>

        <!-- 轉轉飯堂 -->
        <div class="game-card" @click="openGame('food-roulette')">
          <div class="game-icon game-food">
            <UtensilsCrossed class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">轉轉飯堂</h3>
            <p class="game-desc">今天吃什麼？</p>
            <span class="game-category">生活</span>
          </div>
        </div>

        <!-- 數獨 -->
        <div class="game-card" @click="openGame('sudoku')">
          <div class="game-icon game-sudoku">
            <Hash class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">數獨</h3>
            <p class="game-desc">邏輯數字填充</p>
            <span class="game-category">益智</span>
          </div>
        </div>

        <!-- 俄羅斯方塊 -->
        <div class="game-card" @click="openGame('tetris')">
          <div class="game-icon game-tetris">
            <Blocks class="icon" />
          </div>
          <div class="game-info">
            <h3 class="game-name">俄羅斯方塊</h3>
            <p class="game-desc">經典方塊消除</p>
            <span class="game-category">經典</span>
          </div>
        </div>
      </div>
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
  </div>
</template>

<script setup lang="ts">
import Game2048 from "@/components/games/Game2048.vue";
import GameFoodRoulette from "@/components/games/GameFoodRoulette.vue";
import GameSnake from "@/components/games/GameSnake.vue";
import GameSudoku from "@/components/games/GameSudoku.vue";
import TetrisGameTest from "@/components/games/tetris/TetrisGameTest.vue";
import DishWashingGame from "@/components/modals/DishWashingGame.vue";
import FishingGame from "@/components/modals/FishingGame.vue";
import GamblingGame from "@/components/modals/GamblingGame.vue";
import MeritHub from "@/components/modals/MeritHub.vue";
import {
    Blocks,
    ChevronLeft,
    Dices,
    Fish,
    Grid3x3,
    Hash,
    Joystick,
    Sparkles,
    UtensilsCrossed,
} from "lucide-vue-next";
import { ref } from "vue";

const emit = defineEmits<{
  back: [];
  shareToChat: [characterId: string, message: string];
}>();

const currentGame = ref<string | null>(null);

function goBack() {
  emit("back");
}

function openGame(gameId: string) {
  currentGame.value = gameId;
}

function closeGame() {
  currentGame.value = null;
}

function handleShareToChat(characterId: string, message: string) {
  currentGame.value = null;
  emit("shareToChat", characterId, message);
}
</script>

<style scoped lang="scss">
.game-center-screen {
  width: 100%;
  height: 100vh;
  height: 100dvh;
  background: var(--color-background, #fafafa);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: var(--color-surface, white);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);

  .back-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: var(--color-background, #f3f4f6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;

    .icon {
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary, #6b7280);
    }

    &:active {
      transform: scale(0.95);
      background: var(--color-border, #e5e7eb);
    }
  }

  .title {
    flex: 1;
    text-align: center;
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    margin: 0;
  }

  .spacer {
    width: 40px;
  }
}

.games-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  padding-bottom: max(20px, var(--safe-bottom, 0px));
}

.games-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.game-card {
  background: var(--color-surface, white);
  border-radius: 16px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

  &:active {
    transform: scale(0.98);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .game-icon {
    width: 56px;
    height: 56px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;

    .icon {
      width: 28px;
      height: 28px;
      color: white;
    }

    &.fishing {
      background: #60a5fa;
    }

    &.dishwashing {
      background: #34d399;
    }

    &.gambling {
      background: #f472b6;
    }

    &.merit {
      background: #d97706;
    }

    &.game-2048 {
      background: #edc22e;
    }

    &.game-snake {
      background: #22c55e;
    }

    &.game-food {
      background: #f97316;
    }

    &.game-sudoku {
      background: #6366f1;
    }

    &.game-tetris {
      background: #ec4899;
    }
  }

  .game-info {
    width: 100%;

    .game-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--color-text, #1f2937);
      margin: 0 0 4px 0;
    }

    .game-desc {
      font-size: 12px;
      color: var(--color-text-secondary, #6b7280);
      margin: 0 0 8px 0;
      line-height: 1.4;
    }

    .game-category {
      display: inline-block;
      padding: 4px 10px;
      background: var(--color-background, #f3f4f6);
      color: var(--color-text-secondary, #6b7280);
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
    }
  }
}
</style>
