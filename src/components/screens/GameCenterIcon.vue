<template>
  <span
    class="game-center-icon"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.26)}px`,
      background: BG[game],
    }"
    aria-hidden="true"
  >
    <svg v-if="game === 'fishing'" viewBox="0 0 60 60">
      <path d="M30 13Q40 4 54 6" stroke="#1F1F23" stroke-width="1.2" fill="none" />
      <path d="M8 42Q15 39 22 42T36 42T50 42" stroke="#6F93BE" stroke-width="2" fill="none" stroke-linecap="round" />
      <ellipse cx="30" cy="36" rx="15" ry="3.5" fill="none" stroke="#9DB6D4" stroke-width="1.5" />
      <path d="M30 13V20" stroke="#1F1F23" stroke-width="2" stroke-linecap="round" />
      <path d="M23 27a7 7 0 0 1 14 0Z" fill="#E5533D" stroke="#1F1F23" stroke-width="2" stroke-linejoin="round" />
      <path d="M23 27a7 7 0 0 0 14 0Z" fill="#FFFFFF" stroke="#1F1F23" stroke-width="2" stroke-linejoin="round" />
    </svg>

    <svg v-else-if="game === 'dishwashing'" viewBox="0 0 60 60">
      <circle cx="30" cy="35" r="15" fill="#FFFFFF" stroke="#1F1F23" stroke-width="2" />
      <circle cx="30" cy="35" r="9" fill="none" stroke="#9DBFA8" stroke-width="1.6" />
      <circle cx="16" cy="17" r="4.5" fill="#FFFFFF" stroke="#6BA382" stroke-width="1.6" />
      <circle cx="26" cy="10" r="2.5" fill="#FFFFFF" stroke="#6BA382" stroke-width="1.4" />
      <circle cx="43" cy="14" r="3.5" fill="#FFFFFF" stroke="#6BA382" stroke-width="1.5" />
      <path d="M50 25l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z" fill="#6BA382" />
    </svg>

    <svg v-else-if="game === 'gambling'" viewBox="0 0 60 60">
      <g transform="rotate(-12 23 34)">
        <rect x="13" y="24" width="20" height="20" rx="5" fill="#FFFFFF" stroke="#1F1F23" stroke-width="2" />
        <circle cx="18.5" cy="29.5" r="1.8" fill="#1F1F23" />
        <circle cx="23" cy="34" r="1.8" fill="#1F1F23" />
        <circle cx="27.5" cy="38.5" r="1.8" fill="#1F1F23" />
      </g>
      <g transform="rotate(14 39 23)">
        <rect x="30" y="14" width="18" height="18" rx="4.5" fill="#D9536B" stroke="#1F1F23" stroke-width="2" />
        <circle cx="35" cy="19" r="1.6" fill="#FFFFFF" />
        <circle cx="43" cy="19" r="1.6" fill="#FFFFFF" />
        <circle cx="35" cy="27" r="1.6" fill="#FFFFFF" />
        <circle cx="43" cy="27" r="1.6" fill="#FFFFFF" />
      </g>
    </svg>

    <svg v-else-if="game === 'merit'" viewBox="0 0 60 60">
      <circle cx="11" cy="15" r="2" fill="#6E4A2A" />
      <circle cx="15" cy="11.5" r="2" fill="#6E4A2A" />
      <circle cx="19.5" cy="9.5" r="2" fill="#6E4A2A" />
      <circle cx="24.5" cy="9" r="2" fill="#6E4A2A" />
      <ellipse cx="30" cy="38" rx="16" ry="12" fill="#C98B4E" stroke="#1F1F23" stroke-width="2" />
      <path d="M17 39Q30 46 43 39" stroke="#1F1F23" stroke-width="2" fill="none" stroke-linecap="round" />
      <circle cx="23" cy="33" r="1.6" fill="#1F1F23" />
      <path d="M40 22L51 11" stroke="#8A5A33" stroke-width="3" stroke-linecap="round" />
      <circle cx="38" cy="24" r="4.5" fill="#8A5A33" stroke="#1F1F23" stroke-width="1.6" />
      <path d="M46 28l4 1M45 32l4 2" stroke="#1F1F23" stroke-width="1.3" stroke-linecap="round" />
    </svg>

    <svg v-else-if="game === '2048'" viewBox="0 0 60 60">
      <rect x="10" y="10" width="19" height="19" rx="4.5" fill="#FFFFFF" />
      <text x="19.5" y="23.5" text-anchor="middle" font-size="11" font-weight="700" fill="#1F1F23">2</text>
      <rect x="31" y="10" width="19" height="19" rx="4.5" fill="#F7D88A" />
      <text x="40.5" y="23.5" text-anchor="middle" font-size="11" font-weight="700" fill="#1F1F23">0</text>
      <rect x="10" y="31" width="19" height="19" rx="4.5" fill="#F2B45A" />
      <text x="19.5" y="44.5" text-anchor="middle" font-size="11" font-weight="700" fill="#1F1F23">4</text>
      <rect x="31" y="31" width="19" height="19" rx="4.5" fill="#D9702A" />
      <text x="40.5" y="44.5" text-anchor="middle" font-size="11" font-weight="700" fill="#FFFFFF">8</text>
    </svg>

    <svg v-else-if="game === 'snake'" viewBox="0 0 60 60">
      <rect x="11" y="38" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="19" y="38" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="27" y="38" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="27" y="30" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="27" y="22" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="35" y="22" width="7" height="7" rx="1.5" fill="#5E9E5E" />
      <rect x="43" y="22" width="7" height="7" rx="1.5" fill="#2F6B3A" />
      <circle cx="47.5" cy="24.5" r="1.2" fill="#FFFFFF" />
      <circle cx="46" cy="42" r="4" fill="#E5533D" />
      <path d="M46 38l1-3" stroke="#1F1F23" stroke-width="1.4" stroke-linecap="round" />
    </svg>

    <svg v-else-if="game === 'food-roulette'" viewBox="0 0 60 60">
      <circle cx="30" cy="34" r="18" fill="#FFFFFF" />
      <path d="M30 34V16A18 18 0 0 1 48 34Z" fill="#F2A65A" />
      <path d="M30 34V52A18 18 0 0 1 12 34Z" fill="#F2A65A" />
      <circle cx="30" cy="34" r="18" fill="none" stroke="#1F1F23" stroke-width="2" />
      <path d="M30 16V52M12 34H48" stroke="#1F1F23" stroke-width="1.2" />
      <circle cx="30" cy="34" r="3" fill="#1F1F23" />
      <path d="M26 6H34L30 13Z" fill="#D9536B" stroke="#1F1F23" stroke-width="1.6" stroke-linejoin="round" />
    </svg>

    <svg v-else-if="game === 'sudoku'" viewBox="0 0 60 60">
      <rect x="12" y="12" width="36" height="36" rx="4" fill="#FFFFFF" stroke="#1F1F23" stroke-width="2" />
      <path d="M24 12V48M36 12V48M12 24H48M12 36H48" stroke="#8C86C2" stroke-width="1.2" />
      <text x="18" y="21.5" text-anchor="middle" font-size="9" font-weight="700" fill="#1F1F23">5</text>
      <text x="30" y="21.5" text-anchor="middle" font-size="9" font-weight="700" fill="#5B52B5">1</text>
      <text x="42" y="33.5" text-anchor="middle" font-size="9" font-weight="700" fill="#1F1F23">3</text>
      <text x="30" y="45.5" text-anchor="middle" font-size="9" font-weight="700" fill="#5B52B5">9</text>
      <text x="18" y="45.5" text-anchor="middle" font-size="9" font-weight="700" fill="#1F1F23">7</text>
    </svg>

    <svg v-else-if="game === 'tetris'" viewBox="0 0 60 60">
      <g stroke="#1F1F23" stroke-width="1.2">
        <rect x="23" y="9" width="8" height="8" rx="1.5" fill="#5B8DD6" />
        <rect x="31" y="9" width="8" height="8" rx="1.5" fill="#5B8DD6" />
        <rect x="15" y="17" width="8" height="8" rx="1.5" fill="#5B8DD6" />
        <rect x="23" y="17" width="8" height="8" rx="1.5" fill="#5B8DD6" />
        <rect x="11" y="34" width="8" height="8" rx="1.5" fill="#8E6BB8" />
        <rect x="19" y="34" width="8" height="8" rx="1.5" fill="#8E6BB8" />
        <rect x="11" y="42" width="8" height="8" rx="1.5" fill="#8E6BB8" />
        <rect x="43" y="34" width="8" height="8" rx="1.5" fill="#E8913A" />
        <rect x="19" y="42" width="8" height="8" rx="1.5" fill="#E8913A" />
        <rect x="27" y="42" width="8" height="8" rx="1.5" fill="#E8913A" />
        <rect x="35" y="42" width="8" height="8" rx="1.5" fill="#E8913A" />
        <rect x="43" y="42" width="8" height="8" rx="1.5" fill="#E8913A" />
      </g>
    </svg>

    <svg v-else-if="game === 'pacman'" viewBox="0 0 60 60">
      <path
        d="M10 12H26M34 12H50V28M10 12V48H26M34 48H50V36M20 22V38H40V22"
        stroke="#3D4F8C"
        stroke-width="3"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <g fill="#D9922A">
        <circle cx="22" cy="17" r="1.7" />
        <circle cx="30" cy="17" r="1.7" />
        <circle cx="38" cy="17" r="1.7" />
        <circle cx="15" cy="26" r="1.7" />
        <circle cx="15" cy="34" r="1.7" />
        <circle cx="30" cy="43" r="1.7" />
        <circle cx="38" cy="43" r="1.7" />
        <circle cx="45" cy="22" r="1.7" />
        <circle cx="45" cy="43" r="3" />
      </g>
    </svg>
  </span>
</template>

<script setup lang="ts">
export type GameCenterGameId =
  | "fishing"
  | "dishwashing"
  | "gambling"
  | "merit"
  | "2048"
  | "snake"
  | "food-roulette"
  | "sudoku"
  | "tetris"
  | "pacman";

withDefaults(
  defineProps<{
    game: GameCenterGameId;
    size?: number;
  }>(),
  { size: 56 },
);

const BG: Record<GameCenterGameId, string> = {
  fishing: "#DCE7F2",
  dishwashing: "#E3EFE6",
  gambling: "#F4E0E3",
  merit: "#EFE4D3",
  "2048": "#F3E9C6",
  snake: "#DDEBD9",
  "food-roulette": "#F6DFCF",
  sudoku: "#E2E0F2",
  tetris: "#E6E3EC",
  pacman: "#DCE0EA",
};
</script>

<style scoped lang="scss">
.game-center-icon {
  display: inline-flex;
  flex-shrink: 0;
  overflow: hidden;

  svg {
    width: 100%;
    height: 100%;
    font-family: "Outfit", system-ui, sans-serif;
  }
}
</style>
