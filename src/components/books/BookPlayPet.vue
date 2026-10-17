<script setup lang="ts">
/**
 * 08 讀書靈獸：讀越多長越大（魚卵 → 小鯤 → 大鯤 → 大鵬）
 * 經驗值全部從閱讀紀錄算，不花 AI
 */
import BookPlayShell from "@/components/books/BookPlayShell.vue";
import { PET_STAGES, petLine, petState, petXp } from "@/services/bookPlay";
import { useBooksStore } from "@/stores/books";
import { dateKey, mergeDailySeconds, readingStreak } from "@/utils/bookReading";
import { computed, onMounted } from "vue";

const emit = defineEmits<{ close: [] }>();
const booksStore = useBooksStore();

onMounted(() => {
  booksStore.loadBooks();
  booksStore.loadReaderPrefs();
});

const records = computed(() => Object.values(booksStore.progressByBook));
const daily = computed(() => mergeDailySeconds(records.value.map((r) => r.dailySeconds)));
const today = dateKey(Date.now());

const totals = computed(() => {
  const highlights = records.value.flatMap((r) => r.highlights ?? []);
  return {
    totalMinutes: Object.values(daily.value).reduce((a, b) => a + b, 0) / 60,
    highlights: highlights.length,
    notes: highlights.filter((h) => h.note?.trim()).length,
  };
});

const state = computed(() => petState(petXp(totals.value)));
const todayMinutes = computed(() => Math.floor((daily.value[today] ?? 0) / 60));
const streak = computed(() => readingStreak(daily.value, today));
const line = computed(() =>
  petLine(state.value, {
    minutes: todayMinutes.value,
    goal: booksStore.readerPrefs.dailyGoalMinutes,
    streak: streak.value,
  }),
);
</script>

<template>
  <BookPlayShell title="讀書靈獸" :subtitle="`連讀 ${streak} 天`" @close="emit('close')">
    <div class="pet-wrap">
      <div class="pet-head">
        <span class="pet-name">{{ state.stage.name }}</span>
        <span class="pet-level">Lv.{{ state.level }}</span>
      </div>

      <div class="pet-stage">
        <div class="pet-bubble" aria-live="polite">{{ line }}</div>
        <div class="pet-pond" aria-hidden="true" />
        <svg
          class="pet-svg"
          :class="`stage-${state.stageIndex}`"
          viewBox="0 0 200 160"
          role="img"
          :aria-label="`你的讀書靈獸：${state.stage.name}`"
        >
          <!-- 魚卵 -->
          <g v-if="state.stageIndex === 0">
            <circle cx="100" cy="90" r="34" class="pet-body" />
            <circle cx="100" cy="90" r="34" class="pet-shine" />
            <circle cx="108" cy="84" r="9" class="pet-core" />
          </g>
          <!-- 小鯤、大鯤 -->
          <g v-else-if="state.stageIndex <= 2" :transform="state.stageIndex === 2 ? 'translate(-20 -12) scale(1.2)' : ''">
            <path d="M48 92 L22 70 L26 92 L22 114 Z" class="pet-fin" />
            <ellipse cx="96" cy="92" rx="54" ry="38" class="pet-body" />
            <path v-if="state.stageIndex === 2" d="M86 58 Q100 34 116 58 Z" class="pet-fin" />
            <path d="M84 120 Q96 134 108 120 Z" class="pet-fin" />
            <ellipse cx="96" cy="100" rx="38" ry="18" class="pet-belly" />
            <circle cx="124" cy="84" r="8" class="pet-eye" />
            <circle cx="126" cy="82" r="3" class="pet-glint" />
            <path d="M138 98 Q144 102 138 106" class="pet-mouth" />
          </g>
          <!-- 大鵬 -->
          <g v-else>
            <path d="M100 86 Q50 30 8 46 Q46 62 64 96 Z" class="pet-fin" />
            <path d="M100 86 Q150 30 192 46 Q154 62 136 96 Z" class="pet-fin" />
            <ellipse cx="100" cy="98" rx="40" ry="30" class="pet-body" />
            <path d="M84 124 L100 150 L116 124 Z" class="pet-fin" />
            <circle cx="116" cy="88" r="7" class="pet-eye" />
            <circle cx="118" cy="86" r="2.5" class="pet-glint" />
            <path d="M136 96 L150 100 L136 104 Z" class="pet-beak" />
          </g>
        </svg>
      </div>

      <section class="pet-card">
        <div class="pet-row">
          <span>進化能量</span>
          <span v-if="state.next">{{ state.xp }} / {{ state.next.minXp }}</span>
          <span v-else>已經是最終型態</span>
        </div>
        <div class="pet-track">
          <div class="pet-fill" :style="{ width: `${Math.round(state.progress * 100)}%` }" />
        </div>
        <ol class="pet-path">
          <li
            v-for="(s, i) in PET_STAGES"
            :key="s.name"
            :class="{ done: i <= state.stageIndex, current: i === state.stageIndex }"
          >
            <span class="pet-dot">{{ i <= state.stageIndex ? "✓" : "?" }}</span>
            <span>{{ i <= state.stageIndex ? s.name : "？？" }}</span>
          </li>
        </ol>
      </section>

      <section class="pet-stats">
        <div><strong>{{ Math.floor(totals.totalMinutes) }}</strong><span>分鐘</span></div>
        <div><strong>{{ totals.highlights }}</strong><span>劃線</span></div>
        <div><strong>{{ totals.notes }}</strong><span>筆記</span></div>
      </section>

      <p class="pet-hint">讀一分鐘 +1、劃線 +3、寫筆記再 +5</p>
      <button class="pet-feed" @click="emit('close')">去讀書餵牠</button>
    </div>
  </BookPlayShell>
</template>

<style scoped lang="scss">
.pet-wrap {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 20px 0;
}

.pet-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.pet-name {
  font-family: "Noto Serif TC", serif;
  font-size: 26px;
  font-weight: 700;
}

.pet-level {
  padding: 2px 10px;
  border-radius: 12px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-size: 13px;
  font-weight: 700;
}

.pet-stage {
  position: relative;
  height: 250px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  flex-shrink: 0;
}

.pet-bubble {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  max-width: 86%;
  padding: 10px 16px;
  border-radius: 18px;
  background: var(--pl-raise);
  font-size: 14px;
  line-height: 1.5;
  text-align: center;

  &::after {
    content: "";
    position: absolute;
    left: 50%;
    bottom: -8px;
    transform: translateX(-50%);
    border: 8px solid transparent;
    border-bottom: none;
    border-top-color: var(--pl-raise);
  }
}

.pet-pond {
  position: absolute;
  bottom: 6px;
  width: 78%;
  height: 46px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--pl-accent) 22%, transparent);
}

.pet-svg {
  position: relative;
  width: 220px;
  height: 176px;
  animation: pet-bob 2.6s ease-in-out infinite;

  .pet-body {
    fill: color-mix(in srgb, var(--pl-accent) 70%, #ffffff);
  }

  .pet-shine {
    fill: none;
    stroke: color-mix(in srgb, var(--pl-accent) 40%, #ffffff);
    stroke-width: 4;
  }

  .pet-core {
    fill: color-mix(in srgb, var(--pl-accent) 60%, var(--pl-text));
  }

  .pet-fin,
  .pet-beak {
    fill: color-mix(in srgb, var(--pl-accent) 85%, var(--pl-text));
  }

  .pet-belly {
    fill: color-mix(in srgb, #ffffff 55%, transparent);
  }

  .pet-eye {
    fill: var(--pl-text);
  }

  .pet-glint {
    fill: #fff;
  }

  .pet-mouth {
    fill: none;
    stroke: var(--pl-text);
    stroke-width: 2.5;
    stroke-linecap: round;
  }
}

@keyframes pet-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pet-svg {
    animation: none;
  }
}

.pet-card {
  padding: 16px;
  border-radius: 22px;
  background: var(--pl-raise);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pet-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;

  span:last-child {
    color: var(--pl-sub);
    font-variant-numeric: tabular-nums;
  }
}

.pet-track {
  height: 8px;
  border-radius: 4px;
  background: var(--pl-line);
  overflow: hidden;
}

.pet-fill {
  height: 100%;
  border-radius: 4px;
  background: var(--pl-accent);
  transition: width 0.5s;
}

.pet-path {
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--pl-sub);

    &.done {
      color: var(--pl-text);
    }

    &.current {
      font-weight: 700;
    }
  }
}

.pet-dot {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 15px;
  border: 1.5px dashed var(--pl-line);
  font-size: 12px;

  .done & {
    border: none;
    background: var(--pl-accent);
    color: var(--pl-on-accent);
  }
}

.pet-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  div {
    padding: 12px 0;
    border-radius: 16px;
    border: 1px solid var(--pl-line);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  strong {
    font-size: 20px;
    font-variant-numeric: tabular-nums;
  }

  span {
    font-size: 12px;
    color: var(--pl-sub);
  }
}

.pet-hint {
  margin: 0;
  font-size: 12px;
  color: var(--pl-sub);
  text-align: center;
}

.pet-feed {
  height: 50px;
  border: none;
  border-radius: 25px;
  background: var(--pl-accent);
  color: var(--pl-on-accent);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
</style>
