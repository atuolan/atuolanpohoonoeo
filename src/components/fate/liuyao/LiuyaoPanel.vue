<script setup lang="ts">
/**
 * 六爻主面板：問事 → 搖卦 → 卦盤＋解讀
 */
import { buzz, isShakeMaybeSupported, markShakeUnsupported, useShake } from "@/composables/useShake";
import { useCharactersStore } from "@/stores/characters";
import { useLiuyaoStore } from "@/stores/liuyao";
import type {
  CastMethod,
  CoinThrow,
  LiuyaoShareSnapshot,
  QuestionCategory,
  YaoValue,
} from "@/types/liuyao";
import { throwCoins } from "@/utils/liuyao/coins";
import { CATEGORY_LABEL, POSITION_NAME } from "@/utils/liuyao/prompt";
import { buildLiuyaoShareSnapshot } from "@/utils/liuyao/share";
import CoinTray from "@/components/fate/liuyao/CoinTray.vue";
import LiuyaoBoard from "@/components/fate/liuyao/LiuyaoBoard.vue";
import LiuyaoShareSheet from "@/components/fate/liuyao/LiuyaoShareSheet.vue";
import { marked } from "marked";
import { computed, onBeforeUnmount, ref, watch } from "vue";

const emit = defineEmits<{
  (
    e: "shareToChat",
    payload: { chatId: string; characterId: string; snapshot: LiuyaoShareSnapshot; text: string },
  ): void;
}>();

const store = useLiuyaoStore();
const charactersStore = useCharactersStore();

const CATEGORY_KEYS: QuestionCategory[] = [
  "love",
  "career",
  "wealth",
  "exam",
  "health",
  "seek",
  "travel",
  "other",
];

const METHODS: { value: CastMethod; label: string }[] = [
  { value: "auto", label: "自動" },
  { value: "manual", label: "手動" },
  { value: "shake", label: "搖一搖" },
  { value: "input", label: "輸入卦" },
];

const YAO_OPTIONS: { value: YaoValue; label: string }[] = [
  { value: 7, label: "少陽 ━━━" },
  { value: 8, label: "少陰 ━ ━" },
  { value: 9, label: "老陽 ○" },
  { value: 6, label: "老陰 ×" },
];

const shakeSupported = ref(isShakeMaybeSupported());
const visibleMethods = computed(() => METHODS.filter((m) => m.value !== "shake" || shakeSupported.value));

// ===== 面板區域狀態 =====
const trayState = ref<"idle" | "shaking" | "landed">("idle");
const justLanded = ref<number | null>(null);
const autoRunning = ref(false);
const shakeFallback = ref(false);
const shareOpen = ref(false);

let autoToken = 0;
const timers = new Set<number>();

function later(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    timers.delete(id);
    fn();
  }, ms) as unknown as number;
  timers.add(id);
  return id;
}

function clearTimers() {
  for (const id of timers) clearTimeout(id);
  timers.clear();
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    later(resolve, ms);
  });
}

// ===== 解卦者 =====
const characters = computed(() => charactersStore.characters);

const readerName = computed(() => {
  const id = store.readerCharacterId;
  if (!id) return "占卜師";
  const c = charactersStore.characters.find((item) => item.id === id);
  return c?.nickname || c?.data?.name || "角色";
});

function pickReader(id: string | null) {
  store.readerCharacterId = id;
}

// ===== 問事 =====
function toggleCategory(key: QuestionCategory) {
  store.category = store.category === key ? null : key;
}

const castTimeInput = computed({
  get: () => toLocalInput(store.castTime),
  set: (v: string) => {
    const t = new Date(v).getTime();
    if (!Number.isNaN(t)) store.castTime = t;
  },
});

function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const canStart = computed(() => store.question.trim().length > 0);

async function onStart() {
  if (!canStart.value) return;
  if (store.method === "shake") {
    const result = await shake.start();
    if (result !== "ok") {
      markShakeUnsupported();
      shakeSupported.value = false;
      store.method = "manual";
      shakeFallback.value = true;
      later(() => {
        shakeFallback.value = false;
      }, 3000);
    }
  }
  store.startCast();
}

// ===== 搖卦 =====
const shake = useShake({
  onShakeStart: () => {
    if (store.phase !== "cast" || store.method !== "shake") return;
    trayState.value = "shaking";
  },
  onShakeEnd: () => {
    if (store.phase !== "cast" || store.method !== "shake") return;
    castOnce();
  },
});

const lastCoins = computed(() => {
  const list = store.throws;
  if (list.length === 0) return null;
  return list[list.length - 1].coins;
});

const trayDisabled = computed(() => {
  if (store.throws.length >= 6) return true;
  if (autoRunning.value) return true;
  return false;
});

const trayHint = computed(() => {
  if (store.method === "manual") return "按住搖動，放開擲出";
  if (store.method === "shake") return "搖一搖手機，停下就落地（也可以按住）";
  return "按下方按鈕自動搖六次";
});

function castOnce() {
  if (store.throws.length >= 6) {
    trayState.value = "idle";
    return;
  }
  const t: CoinThrow = throwCoins();
  store.addThrow(t);
  justLanded.value = store.throws.length - 1;
  trayState.value = "landed";
  buzz(25);
}

function onPressStart() {
  if (trayDisabled.value) return;
  trayState.value = "shaking";
}

function onPressEnd() {
  if (trayDisabled.value) return;
  castOnce();
}

async function runAuto() {
  if (autoRunning.value || store.throws.length >= 6) return;
  const token = ++autoToken;
  autoRunning.value = true;
  while (token === autoToken && store.throws.length < 6) {
    trayState.value = "shaking";
    await sleep(500);
    if (token !== autoToken) return;
    castOnce();
    await sleep(450);
    if (token !== autoToken) return;
  }
  if (token === autoToken) {
    autoRunning.value = false;
    trayState.value = "landed";
  }
}

function skipAuto() {
  autoToken += 1;
  autoRunning.value = false;
  while (store.throws.length < 6) castOnce();
  trayState.value = "landed";
}

const hasThrows = computed(() => store.throws.length > 0);

function restart() {
  if (!hasThrows.value) return;
  if (!confirm("重新搖這一卦？")) return;
  autoToken += 1;
  autoRunning.value = false;
  justLanded.value = null;
  store.restartCast();
  trayState.value = "idle";
}

// 六爻顯示（上爻→初爻）
const castRows = computed(() => {
  const rows: { index: number; item: CoinThrow | null }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    rows.push({ index: i, item: store.throws[i] ?? null });
  }
  return rows;
});

function isYang(v: YaoValue): boolean {
  return v === 7 || v === 9;
}

function isMoving(v: YaoValue): boolean {
  return v === 6 || v === 9;
}

function yaoLabel(v: YaoValue): string {
  if (v === 9) return "○ 老陽";
  if (v === 7) return "少陽";
  if (v === 8) return "少陰";
  return "× 老陰";
}

// ===== 輸入卦 =====
const inputRows = computed(() => {
  const rows: { index: number; value: YaoValue | null }[] = [];
  for (let i = 5; i >= 0; i -= 1) {
    rows.push({ index: i, value: store.inputValues[i] ?? null });
  }
  return rows;
});

function setYao(index: number, v: YaoValue) {
  store.setInputValue(index, v);
}

// ===== 自動排盤 =====
watch(
  () => store.isComplete,
  (done) => {
    if (!done) return;
    if (store.phase !== "cast" || store.method === "input") return;
    later(() => {
      if (store.phase === "cast") void store.buildChart();
    }, 600);
  },
);

// ===== 進出階段 =====
watch(
  () => store.phase,
  (phase) => {
    if (phase === "cast") {
      trayState.value = "idle";
      justLanded.value = null;
      autoRunning.value = false;
      return;
    }
    autoToken += 1;
    autoRunning.value = false;
    clearTimers();
    if (shake.active.value) shake.stop();
  },
);

function handleBack(): boolean {
  if (store.phase === "cast") {
    autoToken += 1;
    autoRunning.value = false;
    clearTimers();
    if (shake.active.value) shake.stop();
    store.phase = "ask";
    return true;
  }
  return false;
}

defineExpose({ handleBack });

onBeforeUnmount(() => {
  autoToken += 1;
  clearTimers();
  shake.stop();
});

// ===== 卦盤＋解讀 =====
const interpretationHtml = computed(() => {
  if (!store.interpretation) return "";
  return marked.parse(store.interpretation, { async: false }) as string;
});

const hasInterpretation = computed(() => store.interpretation.trim().length > 0);
const busy = computed(() => store.isInterpreting);

const interpretLabel = computed(() => {
  if (store.readerCharacterId) return `請 ${readerName.value} 解卦`;
  return "解卦";
});

const shareLabel = computed(() => {
  if (store.readerCharacterId) return `傳給 ${readerName.value}`;
  return "傳給…";
});

function openShare() {
  shareOpen.value = true;
}

function onShareConfirm(payload: { chatId: string; characterId: string; text: string }) {
  const reading = store.readings.find((r) => r.id === store.currentReadingId);
  const chart = store.chart;
  if (!reading || !chart) {
    shareOpen.value = false;
    return;
  }
  const snapshot = buildLiuyaoShareSnapshot(reading, chart);
  emit("shareToChat", { ...payload, snapshot });
  shareOpen.value = false;
}
</script>

<template>
  <div class="liuyao-panel">
    <div class="ly-inner">
      <p v-if="shakeFallback" class="ly-note">這台裝置不能用搖一搖，已改成手動搖卦</p>

      <!-- ===== 問事 ===== -->
      <div v-if="store.phase === 'ask'" class="ly-ask">
        <p class="ly-lead">一事一占，問得越具體越準</p>

        <textarea
          v-model="store.question"
          class="ly-question"
          rows="3"
          maxlength="200"
          placeholder="此刻，你想問什麼？"
          aria-label="你想問什麼"
        ></textarea>

        <section class="ly-block">
          <h3 class="ly-title">問事類別</h3>
          <div class="ly-chips">
            <button
              v-for="key in CATEGORY_KEYS"
              :key="key"
              type="button"
              class="ly-chip"
              :class="{ 'is-on': store.category === key }"
              :aria-pressed="store.category === key"
              @click="toggleCategory(key)"
            >
              {{ CATEGORY_LABEL[key] }}
            </button>
          </div>
        </section>

        <section class="ly-block">
          <h3 class="ly-title">誰來解卦</h3>
          <div class="ly-readers">
            <button
              type="button"
              class="ly-reader"
              :class="{ 'is-on': store.readerCharacterId === null }"
              @click="pickReader(null)"
            >
              <span class="ly-reader__avatar ly-reader__avatar--icon">卜</span>
              <span class="ly-reader__name">占卜師</span>
            </button>
            <button
              v-for="c in characters"
              :key="c.id"
              type="button"
              class="ly-reader"
              :class="{ 'is-on': store.readerCharacterId === c.id }"
              @click="pickReader(c.id)"
            >
              <img
                v-if="c.avatar"
                class="ly-reader__avatar"
                :src="c.avatar"
                :alt="c.nickname"
              />
              <span v-else class="ly-reader__avatar ly-reader__avatar--fallback">
                {{ (c.nickname || c.data?.name || "角").charAt(0) }}
              </span>
              <span class="ly-reader__name">{{ c.nickname || c.data?.name }}</span>
            </button>
          </div>
        </section>

        <section class="ly-block">
          <h3 class="ly-title">起卦方式</h3>
          <div class="ly-methods">
            <button
              v-for="m in visibleMethods"
              :key="m.value"
              type="button"
              class="ly-method"
              :class="{ 'is-on': store.method === m.value }"
              :aria-pressed="store.method === m.value"
              @click="store.method = m.value"
            >
              {{ m.label }}
            </button>
          </div>

          <div v-if="store.method === 'input'" class="ly-time">
            <span class="ly-time__label">起卦時間</span>
            <input v-model="castTimeInput" class="ly-time__input" type="datetime-local" aria-label="起卦時間" />
          </div>
        </section>

        <div class="ly-actions">
          <button type="button" class="fate-btn fate-btn--primary" :disabled="!canStart" @click="onStart">
            開始
          </button>
        </div>
      </div>

      <!-- ===== 搖卦 ===== -->
      <div v-else-if="store.phase === 'cast'" class="ly-cast">
        <p class="ly-cast__question">{{ store.question }}</p>

        <template v-if="store.method !== 'input'">
          <CoinTray
            :state="trayState"
            :coins="lastCoins"
            :hint="trayHint"
            :disabled="trayDisabled"
            @press-start="onPressStart"
            @press-end="onPressEnd"
          />

          <div v-if="store.method === 'auto'" class="ly-auto">
            <button
              v-if="!autoRunning && store.throws.length < 6"
              type="button"
              class="fate-btn fate-btn--primary"
              @click="runAuto"
            >
              搖卦
            </button>
            <button v-else-if="autoRunning" type="button" class="fate-link" @click="skipAuto">
              跳過動畫
            </button>
          </div>

          <div class="ly-lines">
            <div
              v-for="row in castRows"
              :key="row.index"
              class="ly-line"
              :class="{ 'is-empty': !row.item, 'is-new': justLanded === row.index }"
            >
              <span class="ly-line__name">{{ POSITION_NAME[row.index] }}</span>
              <span class="ly-line__draw">
                <template v-if="row.item">
                  <span class="ly-bar" :class="{ 'is-moving': isMoving(row.item.value) }"></span>
                  <span
                    v-if="!isYang(row.item.value)"
                    class="ly-bar"
                    :class="{ 'is-moving': isMoving(row.item.value) }"
                  ></span>
                </template>
                <span v-else class="ly-bar ly-bar--placeholder"></span>
              </span>
              <span class="ly-line__label">{{ row.item ? yaoLabel(row.item.value) : "" }}</span>
            </div>
          </div>

          <div class="ly-cast__foot">
            <button type="button" class="fate-link" :disabled="!hasThrows" @click="restart">重來</button>
            <span class="ly-cast__count">第 {{ store.throws.length }}／6 擲</span>
          </div>
        </template>

        <div v-else class="ly-input">
          <div v-for="row in inputRows" :key="row.index" class="ly-input__row">
            <span class="ly-input__name">{{ POSITION_NAME[row.index] }}</span>
            <div class="ly-input__opts">
              <button
                v-for="opt in YAO_OPTIONS"
                :key="opt.value"
                type="button"
                class="ly-opt"
                :class="{ 'is-on': row.value === opt.value }"
                :aria-pressed="row.value === opt.value"
                @click="setYao(row.index, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="ly-actions">
            <button
              type="button"
              class="fate-btn fate-btn--primary"
              :disabled="!store.isComplete"
              @click="store.buildChart()"
            >
              排盤
            </button>
          </div>
        </div>
      </div>

      <!-- ===== 卦盤 ===== -->
      <div v-else-if="store.phase === 'board' && store.chart" class="ly-board">
        <LiuyaoBoard
          :chart="store.chart"
          :facts="store.facts"
          :original-text="store.originalText"
          :changed-text="store.changedText"
        />

        <section class="ly-block">
          <div class="ly-block__head">
            <h3 class="ly-title">解讀</h3>
            <span class="ly-block__by">{{ readerName }}</span>
          </div>

          <div v-if="interpretationHtml" class="ly-interp">
            <div class="fate-markdown" v-html="interpretationHtml"></div>
            <span v-if="store.isInterpreting" class="ly-cursor">▍</span>
          </div>
          <p v-else-if="store.isInterpreting" class="ly-pending">正在解卦…</p>

          <div v-if="store.interpretError" class="ly-error">
            <p class="ly-error__text">{{ store.interpretError }}</p>
            <button type="button" class="fate-link" @click="store.startInterpretation()">重試</button>
          </div>

          <div class="ly-actions">
            <button
              v-if="!hasInterpretation"
              type="button"
              class="fate-btn fate-btn--primary"
              :disabled="busy"
              @click="store.startInterpretation()"
            >
              {{ interpretLabel }}
            </button>
            <template v-else>
              <button type="button" class="fate-btn" :disabled="busy" @click="store.startInterpretation()">
                重新解讀
              </button>
              <button type="button" class="fate-btn fate-btn--primary" :disabled="busy" @click="openShare">
                {{ shareLabel }}
              </button>
            </template>
          </div>

          <div class="ly-actions ly-actions--sub">
            <button type="button" class="fate-link" :disabled="busy" @click="store.reset()">重新起卦</button>
          </div>
        </section>
      </div>
    </div>

    <LiuyaoShareSheet
      :open="shareOpen"
      :prefer-character-id="store.readerCharacterId"
      @close="shareOpen = false"
      @confirm="onShareConfirm"
    />
  </div>
</template>

<style scoped lang="scss">
.liuyao-panel {
  width: 100%;
  padding: 16px;
  box-sizing: border-box;
  font-family: var(--f-font-body);
  color: var(--f-ink);
  overflow-x: hidden;
}

.ly-inner {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.ly-ask,
.ly-cast,
.ly-board {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.ly-lead {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--f-ink-2);
}

.ly-title {
  margin: 0;
  font-family: var(--f-font-head);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.1em;
  color: var(--f-ink-2);
}

.ly-note {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--f-danger);
  background: var(--f-accent-soft);
  border-left: 2px solid var(--f-danger);
  border-radius: var(--f-radius);
}

.ly-question {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-family: var(--f-font-body);
  font-size: 15px;
  line-height: 1.6;
  color: var(--f-ink);
  background: var(--f-panel);
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  outline: none;
  resize: vertical;

  &::placeholder {
    color: var(--f-ink-2);
    opacity: 0.8;
  }

  &:focus {
    border-color: var(--f-line-strong);
  }
}

.ly-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.ly-block__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.ly-block__by {
  font-size: 11px;
  color: var(--f-ink-2);
  opacity: 0.85;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 類別晶片 ===== */
.ly-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ly-chip {
  padding: 6px 12px;
  font-family: var(--f-font-body);
  font-size: 12px;
  color: var(--f-ink-2);
  background: none;
  border: 1px solid var(--f-line);
  border-radius: 999px;
  cursor: pointer;

  &.is-on {
    color: var(--f-accent);
    border-color: var(--f-accent);
    background: var(--f-accent-soft);
  }
}

/* ===== 解卦者 ===== */
.ly-readers {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 2px;
  -webkit-overflow-scrolling: touch;
}

.ly-reader {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  width: 52px;
  padding: 4px 2px;
  font-family: var(--f-font-body);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--f-radius);
  cursor: pointer;

  &.is-on {
    border-color: var(--f-accent);
    background: var(--f-accent-soft);
  }
}

.ly-reader__avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--f-font-head);
  font-size: 15px;
  color: var(--f-accent);
  background: var(--f-accent-soft);
  border: 1px solid var(--f-line);
  box-sizing: border-box;

  &--icon {
    font-size: 17px;
  }
}

.ly-reader__name {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
  font-size: 11px;
  line-height: 1.2;
  color: var(--f-ink-2);
}

/* ===== 起卦方式 ===== */
.ly-methods {
  display: flex;
  gap: 8px;
}

.ly-method {
  flex: 1 1 0;
  min-width: 0;
  padding: 9px 4px;
  font-family: var(--f-font-head);
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--f-ink-2);
  background: none;
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  cursor: pointer;
  white-space: nowrap;

  &.is-on {
    color: var(--f-accent);
    border-color: var(--f-accent);
    background: var(--f-accent-soft);
  }
}

.ly-time {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ly-time__label {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--f-ink-2);
}

.ly-time__input {
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  box-sizing: border-box;
  font-family: var(--f-font-body);
  font-size: 13px;
  color: var(--f-ink);
  background: var(--f-panel);
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  outline: none;
}

/* ===== 按鈕列 ===== */
.ly-actions {
  display: flex;
  gap: 10px;
}

.ly-actions--sub {
  justify-content: center;
  margin-top: -6px;
}

/* ===== 搖卦 ===== */
.ly-cast__question {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 1.4;
  color: var(--f-ink-2);
  opacity: 0.85;
}

.ly-auto {
  display: flex;
  justify-content: center;
}

.ly-auto .fate-btn {
  flex: 0 1 220px;
}

.ly-lines {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 0 0;
  border-top: 1px solid var(--f-line);
}

.ly-line {
  display: flex;
  align-items: center;
  gap: 10px;

  &.is-empty {
    opacity: 0.35;
  }
}

.ly-line__name {
  flex: 0 0 auto;
  width: 30px;
  font-size: 11px;
  color: var(--f-ink-2);
}

.ly-line__draw {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  width: 120px;
  height: 9px;
  transform-origin: center;
}

.ly-line.is-new .ly-line__draw {
  animation: ly-line-open 0.35s ease-out;
}

.ly-bar {
  flex: 1 1 0;
  height: 9px;
  background: var(--f-ink);
  border-radius: 1px;

  &.is-moving {
    background: var(--f-accent);
  }

  &--placeholder {
    background: none;
    border: 1px dashed var(--f-line);
    box-sizing: border-box;
  }
}

.ly-line__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--f-ink-2);
}

.ly-cast__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ly-cast__count {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--f-ink-2);
}

@keyframes ly-line-open {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

/* ===== 輸入卦 ===== */
.ly-input {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ly-input__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ly-input__name {
  flex: 0 0 auto;
  width: 30px;
  font-size: 11px;
  color: var(--f-ink-2);
}

.ly-input__opts {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  gap: 5px;
}

.ly-opt {
  flex: 1 1 0;
  min-width: 0;
  padding: 7px 2px;
  font-family: var(--f-font-body);
  font-size: 11px;
  color: var(--f-ink-2);
  background: none;
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.is-on {
    color: var(--f-accent);
    border-color: var(--f-accent);
    background: var(--f-accent-soft);
  }
}

/* ===== 解讀 ===== */
.ly-interp {
  position: relative;
}

.ly-cursor {
  display: inline-block;
  font-size: 14px;
  color: var(--f-accent);
  animation: ly-blink 1s steps(2, start) infinite;
}

@keyframes ly-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

.ly-pending {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.06em;
  color: var(--f-ink-2);
}

.ly-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.ly-error__text {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--f-danger);
  overflow-wrap: anywhere;
}
</style>
