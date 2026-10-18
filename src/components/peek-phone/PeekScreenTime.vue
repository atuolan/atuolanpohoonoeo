<script setup lang="ts">
/**
 * 設定 → 螢幕使用時間：每小時長條圖、最常使用的 App、拿起次數
 * 「這份紀錄透露了什麼」是秘密，要按偷看才出現
 */
import type { PeekScreenTime } from "@/types/peekPhone";
import {
  BookOpen,
  Calendar,
  CreditCard,
  Eye,
  Globe,
  Image,
  ListChecks,
  MessageCircle,
  Music,
  Smartphone,
} from "lucide-vue-next";
import { computed } from "vue";

const props = defineProps<{ screenTime?: PeekScreenTime; revealed: boolean }>();
const emit = defineEmits<{ reveal: [] }>();

const APP_ICONS: Record<string, typeof MessageCircle> = {
  訊息: MessageCircle,
  相簿: Image,
  瀏覽器: Globe,
  備忘錄: ListChecks,
  日記: BookOpen,
  錢包: CreditCard,
  行事曆: Calendar,
  音樂: Music,
};

function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

const total = computed(() => (props.screenTime?.hourly ?? []).reduce((a, b) => a + b, 0));

// 用最兇的連續 4 小時當亮色那段（insight 多半在講這段）
const peak = computed(() => {
  const hourly = props.screenTime?.hourly ?? [];
  let best = 0;
  let bestSum = -1;
  for (let i = 0; i + 4 <= hourly.length; i++) {
    const sum = hourly[i] + hourly[i + 1] + hourly[i + 2] + hourly[i + 3];
    if (sum > bestSum) {
      bestSum = sum;
      best = i;
    }
  }
  return { start: best, end: best + 3 };
});

const maxHour = computed(() => Math.max(1, ...(props.screenTime?.hourly ?? [0])));
const bars = computed(() =>
  (props.screenTime?.hourly ?? []).map((m, i) => ({
    key: i,
    height: Math.max(2, Math.round((m / maxHour.value) * 96)),
    peak: i >= peak.value.start && i <= peak.value.end,
  })),
);
// 平均線：一天 24 小時平均每小時幾分鐘
const averageTop = computed(() => 96 - Math.round((total.value / 24 / maxHour.value) * 96));

const topMax = computed(() => Math.max(1, ...(props.screenTime?.topApps ?? []).map((a) => a.minutes)));
</script>

<template>
  <div v-if="!props.screenTime" class="st-empty">
    <p>這支手機還沒有螢幕使用時間</p>
    <p class="st-empty-sub">從窺視選單重新生成「相簿、瀏覽紀錄」就會有</p>
  </div>

  <div v-else class="st">
    <div class="st-card st-today">
      <span class="st-muted">今天</span>
      <span class="st-total">
        <template v-if="Math.floor(total / 60) > 0">
          <span class="st-num">{{ Math.floor(total / 60) }}</span> 小時
        </template>
        <span class="st-num">{{ total % 60 }}</span> 分鐘
      </span>
      <div class="st-chart">
        <div
          class="st-bars"
          role="img"
          :aria-label="`每小時使用時間，${peak.start} 點到 ${peak.end + 1} 點最長`"
        >
          <span
            v-for="b in bars"
            :key="b.key"
            class="st-bar"
            :class="{ 'is-peak': b.peak }"
            :style="{ height: `${b.height}px` }"
          />
        </div>
        <div class="st-avg" :style="{ top: `${averageTop}px` }" aria-hidden="true">
          <span>平均</span>
        </div>
      </div>
      <div class="st-axis" aria-hidden="true">
        <span>0時</span><span>6時</span><span>12時</span><span>18時</span><span>24時</span>
      </div>
    </div>

    <template v-if="props.screenTime.insight">
      <div v-if="props.revealed" class="st-insight" role="status">
        <Eye :size="14" aria-hidden="true" />
        <span>{{ props.screenTime.insight }}</span>
      </div>
      <button v-else type="button" class="st-insight st-insight--btn" @click="emit('reveal')">
        <Eye :size="14" aria-hidden="true" />
        <span>偷看這份紀錄透露了什麼</span>
      </button>
    </template>

    <div v-if="props.screenTime.topApps.length > 0" class="st-card st-top">
      <div class="st-muted st-top-title">最常使用</div>
      <div v-for="app in props.screenTime.topApps" :key="app.name" class="st-top-row">
        <span class="st-top-icon">
          <component :is="APP_ICONS[app.name] ?? Smartphone" :size="18" aria-hidden="true" />
        </span>
        <span class="st-top-main">
          <span class="st-top-name">{{ app.name }}</span>
          <span class="st-top-bar" :style="{ width: `${Math.round((app.minutes / topMax) * 100)}%` }" />
        </span>
        <span class="st-top-min">{{ formatMinutes(app.minutes) }}</span>
      </div>
    </div>

    <div class="st-grid">
      <div class="st-card st-stat">
        <span class="st-muted">拿起手機</span>
        <span class="st-stat-value"><span class="st-num">{{ props.screenTime.pickups }}</span> 次</span>
      </div>
      <div v-if="props.screenTime.firstPickup" class="st-card st-stat">
        <span class="st-muted">第一次拿起</span>
        <span class="st-stat-value st-num">{{ props.screenTime.firstPickup }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.st {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.st-card {
  background: var(--p-dark-card);
  border-radius: 16px;
}

.st-muted {
  font-size: 13px;
  color: var(--p-dark-ink-2);
}

.st-num {
  font-family: var(--p-num);
}

.st-today {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.st-total {
  font-size: 28px;
  font-weight: 700;
}

.st-chart {
  position: relative;
  margin-top: 10px;
}

.st-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 96px;
}

.st-bar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  background: #4a4b52;

  &.is-peak {
    background: #6e8fc7;
  }
}

.st-avg {
  position: absolute;
  left: 0;
  right: 0;
  border-top: 1px dashed #6e6e74;

  span {
    position: absolute;
    right: 0;
    top: -16px;
    font-size: 10px;
    color: var(--p-dark-ink-2);
  }
}

.st-axis {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--p-dark-ink-3);
}

.st-insight {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  max-width: 100%;
  padding: 6px 12px 6px 10px;
  box-sizing: border-box;
  border-radius: 16px;
  border: 1px dashed var(--p-peek);
  background: var(--p-peek-soft);
  color: var(--p-peek);
  font-size: 12px;
  line-height: 1.5;
  text-align: left;

  svg {
    flex-shrink: 0;
  }

  &--btn {
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
  }
}

.st-top {
  padding: 6px 16px;
}

.st-top-title {
  padding: 8px 0 4px;
}

.st-top-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--p-dark-raised);

  &:last-child {
    border-bottom: none;
  }
}

.st-top-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #ffffff;
  color: var(--p-app-glyph);
  display: flex;
  align-items: center;
  justify-content: center;
}

.st-top-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.st-top-name {
  font-size: 15px;
}

.st-top-bar {
  height: 4px;
  border-radius: 2px;
  background: #6e8fc7;
}

.st-top-min {
  width: 86px;
  flex-shrink: 0;
  text-align: right;
  font-size: 13px;
  color: var(--p-dark-ink-2);
}

.st-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.st-stat {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  .st-muted {
    font-size: 12px;
  }
}

.st-stat-value {
  font-size: 20px;
  font-weight: 700;
}

.st-empty {
  margin-top: 48px;
  text-align: center;
  font-size: 14px;
  color: var(--p-dark-ink-2);

  p {
    margin: 0;
  }

  .st-empty-sub {
    margin-top: 4px;
    font-size: 12px;
  }
}
</style>
