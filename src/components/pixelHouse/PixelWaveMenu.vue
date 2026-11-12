<script setup lang="ts">
/**
 * 右上的像素轉盤按鈕 → 從右邊滑出來的「小屋待辦」，左邊是一道波浪。
 * - 上面：他現在在做什麼、今天在小屋賺了多少花了多少
 * - 中間：現在有什麼要處理（點了跳過去）；沒事就寫「都處理好了」
 * - 下面：擺件商店、換外觀、移動家具
 * - 打開時波浪像果凍一樣晃幾下再停成小小的弧，一列一列跟著滑進來
 * - 往右滑、點暗處、按 Esc 收起來
 * App 都在下面那一排（和「全部 App」），這裡不重複放。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Ledger } from "./houseTodo";
import { dialSvg } from "./pixelArt";

export interface MenuTodo {
  key: string;
  text: string;
  note: string;
  tone: "alert" | "care" | "coin";
  /** 小圖（已經畫好的 SVG 網址） */
  icon: string;
}

const props = defineProps<{
  open: boolean;
  todos: MenuTodo[];
  /** 今天的收支；還在讀或讀不到是 null */
  ledger: Ledger | null;
  /** 他現在在做什麼（一句話） */
  status: string;
}>();
const emit = defineEmits<{
  toggle: [];
  close: [];
  todo: [key: string];
  decor: [];
  wardrobe: [];
  "edit-layout": [];
}>();

const dialImg = dialSvg();
/** 轉盤上的紅點：要趕快處理的和照顧的（有金幣的不算，不然一直有紅點） */
const total = computed(() => props.todos.filter((t) => t.tone !== "coin").length);
const fmt = (n: number) => n.toLocaleString();

function badgeText(n: number): string {
  return n > 99 ? "99+" : String(n);
}

// ===== 波浪 =====
/** 波浪那一條有多寬（px）：面板左邊多出這麼寬，畫成起伏的邊 */
const WAVE_W = 28;
/** 停下來時的起伏、一個波多長 */
const REST_AMP = 4;
const WAVE_LEN = 150;

const panel = ref<HTMLElement | null>(null);
const panelH = ref(600);
const amp = ref(REST_AMP);
const phase = ref(0);
let raf = 0;
let ro: ResizeObserver | null = null;

const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** 左邊的波浪：x = 中線 ± 振幅 × sin(…)，往右填滿到面板 */
const wavePath = computed(() => {
  const h = panelH.value;
  const mid = WAVE_W / 2 + 2;
  const a = Math.min(amp.value, WAVE_W / 2);
  let d = `M ${WAVE_W} 0 L ${(mid + a * Math.sin(phase.value)).toFixed(2)} 0`;
  for (let y = 6; y <= h + 6; y += 6) {
    const x = mid + a * Math.sin((2 * Math.PI * y) / WAVE_LEN + phase.value);
    d += ` L ${x.toFixed(2)} ${Math.min(y, h)}`;
  }
  return d + ` L ${WAVE_W} ${h} Z`;
});

/** 晃一下：振幅從 from 慢慢收回停下來的大小，波一邊往下跑 */
function wobble(from: number, ms: number) {
  cancelAnimationFrame(raf);
  if (reduceMotion) {
    amp.value = REST_AMP;
    return;
  }
  const start = performance.now();
  const phase0 = phase.value;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / ms);
    // 衰減的彈簧：一開始大、來回幾下變小
    const spring = Math.exp(-4.2 * t) * Math.cos(t * Math.PI * 3);
    amp.value = REST_AMP + (from - REST_AMP) * spring;
    phase.value = phase0 + t * Math.PI * 2.2;
    if (t < 1) raf = requestAnimationFrame(step);
    else amp.value = REST_AMP;
  };
  raf = requestAnimationFrame(step);
}

// ===== 往右滑收起來 =====
const dragX = ref(0);
const dragging = ref(false);
let startX = 0;
let startY = 0;
let pid: number | null = null;
let horizontal: boolean | null = null;

function onDown(e: PointerEvent) {
  if (!props.open || (e.pointerType === "mouse" && e.button !== 0)) return;
  pid = e.pointerId;
  startX = e.clientX;
  startY = e.clientY;
  horizontal = null;
}
function onMove(e: PointerEvent) {
  if (e.pointerId !== pid) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  if (horizontal === null && Math.hypot(dx, dy) > 8) {
    horizontal = Math.abs(dx) > Math.abs(dy) && dx > 0;
    if (horizontal) {
      dragging.value = true;
      panel.value?.setPointerCapture?.(e.pointerId);
    }
  }
  if (!horizontal) return;
  dragX.value = Math.max(0, dx);
  // 拉的時候波浪跟著鼓起來
  amp.value = REST_AMP + Math.min(10, dx / 12);
}
function onUp(e: PointerEvent) {
  if (e.pointerId !== pid) return;
  pid = null;
  if (!dragging.value) return;
  dragging.value = false;
  const far = dragX.value > 70;
  dragX.value = 0;
  if (far) emit("close");
  else wobble(amp.value + 6, 700);
}

const panelStyle = computed(() => ({
  transform: props.open ? `translateX(${dragX.value}px)` : "translateX(calc(100% + 34px))",
  transition: dragging.value ? "none" : undefined,
}));

function onKey(e: KeyboardEvent) {
  if (props.open && e.key === "Escape") emit("close");
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void nextTick(() => {
        if (panel.value) panelH.value = panel.value.clientHeight;
        panel.value?.querySelector<HTMLElement>(".pw-row")?.focus({ preventScroll: true });
      });
      wobble(WAVE_W / 2, 1100);
    } else wobble(10, 420);
  },
);

onMounted(() => {
  window.addEventListener("keydown", onKey);
  if (panel.value && typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(() => {
      if (panel.value) panelH.value = panel.value.clientHeight;
    });
    ro.observe(panel.value);
  }
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey);
  cancelAnimationFrame(raf);
  ro?.disconnect();
});

function rowStyle(i: number) {
  // 一列一列滑進來，像波浪推過來
  const delay = props.open ? 90 + i * 38 : 0;
  return { transitionDelay: `${delay}ms` };
}
</script>

<template>
  <div class="pw-root">
    <!-- 暗幕 -->
    <div class="pw-dim" :class="{ 'is-open': open }" aria-hidden="true" @click="emit('close')"></div>

    <nav
      ref="panel"
      class="pw-panel"
      :class="{ 'is-open': open }"
      :style="panelStyle"
      aria-label="小屋待辦"
      :aria-hidden="open ? undefined : 'true'"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <svg class="pw-wave" :width="WAVE_W" :height="panelH" :viewBox="`0 0 ${WAVE_W} ${panelH}`" aria-hidden="true">
        <path :d="wavePath" class="pw-wave-fill" />
      </svg>

      <header class="pw-head">
        <h2>小屋</h2>
        <button class="pw-close" :tabindex="open ? 0 : -1" aria-label="收起選單" @click="emit('close')">×</button>
      </header>

      <div class="pw-body">
        <p class="pw-status" :style="rowStyle(0)">{{ status }}</p>
        <div class="pw-ledger" :style="rowStyle(1)" aria-label="今天在小屋的收支">
          <span>今天</span>
          <template v-if="ledger">
            <span class="pw-earn">賺 {{ fmt(ledger.earn) }}</span>
            <span class="pw-spend">花 {{ fmt(ledger.spend) }}<small v-if="ledger.pets">（寵物 {{ fmt(ledger.pets) }}）</small></span>
          </template>
          <span v-else class="pw-muted">…</span>
        </div>
        <h3 class="pw-sub" :style="rowStyle(2)">要處理的事</h3>
        <button
          v-for="(it, i) in todos"
          :key="it.key"
          class="pw-row"
          :class="`is-${it.tone}`"
          :style="rowStyle(i + 3)"
          :tabindex="open ? 0 : -1"
          @click="emit('todo', it.key)"
        >
          <span class="pw-icon">
            <img :src="it.icon" alt="" />
          </span>
          <span class="pw-text">
            <span class="pw-name">{{ it.text }}</span>
            <span class="pw-note">{{ it.note }}</span>
          </span>
          <span class="pw-go" aria-hidden="true">›</span>
        </button>
        <p v-if="!todos.length" class="pw-empty" :style="rowStyle(3)">都處理好了</p>
        <h3 class="pw-sub" :style="rowStyle(todos.length + 4)">小屋</h3>
        <div class="pw-chips" :style="rowStyle(todos.length + 5)">
          <button class="pw-chip" :tabindex="open ? 0 : -1" @click="emit('decor')">擺件商店</button>
          <button class="pw-chip" :tabindex="open ? 0 : -1" @click="emit('wardrobe')">換外觀</button>
          <button class="pw-chip" :tabindex="open ? 0 : -1" @click="emit('edit-layout')">移動家具</button>
        </div>
      </div>
    </nav>

    <button
      class="pw-btn"
      :aria-label="open ? '收起小屋待辦' : '打開小屋待辦' + (total ? `，${total} 件要處理` : '')"
      :aria-expanded="open ? 'true' : 'false'"
      @click="emit('toggle')"
    >
      <img :src="dialImg" alt="" width="52" height="52" :style="{ transform: `rotate(${open ? 90 : 0}deg)` }" />
      <span v-if="!open && total" class="pw-badge pw-btn-badge" aria-hidden="true">{{ badgeText(total) }}</span>
    </button>
  </div>
</template>

<style scoped>
.pw-root {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.pw-dim {
  position: absolute;
  inset: 0;
  background: rgba(30, 20, 18, 0.38);
  opacity: 0;
  transition: opacity 280ms ease;
  pointer-events: none;
}

.pw-dim.is-open {
  opacity: 1;
  pointer-events: auto;
}

.pw-panel {
  --pw-bg: #fffbf5;
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(76%, 290px);
  display: flex;
  flex-direction: column;
  background: var(--pw-bg);
  color: #3b2a26;
  box-shadow: -10px 0 30px rgba(30, 20, 18, 0.18);
  transition: transform 520ms cubic-bezier(0.22, 1.25, 0.36, 1);
  touch-action: pan-y;
  pointer-events: none;
}

.pw-panel:not(.is-open) {
  transition: transform 300ms cubic-bezier(0.55, 0, 0.9, 0.45);
}

.pw-panel.is-open {
  pointer-events: auto;
}

/* 波浪邊：貼在面板左邊外面，顏色跟面板一樣 */
.pw-wave {
  position: absolute;
  top: 0;
  left: 1px;
  transform: translateX(-100%);
  display: block;
  overflow: visible;
  filter: drop-shadow(-6px 0 10px rgba(30, 20, 18, 0.12));
}

.pw-wave-fill {
  fill: var(--pw-bg);
  stroke: none;
}

.pw-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(var(--ph-top, 12px) + 8px) 14px 6px 12px;
}

.pw-head h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
}

.pw-close {
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: rgba(59, 42, 38, 0.08);
  color: #3b2a26;
  font-family: inherit;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.pw-body {
  flex: 1;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px 10px calc(env(safe-area-inset-bottom, 0px) + 18px) 4px;
  -webkit-overflow-scrolling: touch;
}

.pw-row {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  padding: 6px 8px;
  border: 0;
  border-radius: 14px;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.pw-row.is-alert .pw-icon {
  background: #fbd9d2;
}

.pw-row.is-care .pw-icon {
  background: #f7e8cf;
}

.pw-row.is-coin .pw-icon {
  background: #fff1b8;
}

.pw-row:active,
.pw-row:focus-visible {
  background: rgba(59, 42, 38, 0.07);
  outline: none;
}

/* 一列一列滑進來（收起時一起退出去） */
.pw-row,
.pw-sub,
.pw-chips,
.pw-status,
.pw-ledger,
.pw-empty {
  opacity: 0;
  transform: translateX(46px);
  transition:
    transform 520ms cubic-bezier(0.25, 1.4, 0.4, 1),
    opacity 220ms ease,
    background 120ms ease;
}

.pw-panel.is-open .pw-row,
.pw-panel.is-open .pw-sub,
.pw-panel.is-open .pw-chips,
.pw-panel.is-open .pw-status,
.pw-panel.is-open .pw-ledger,
.pw-panel.is-open .pw-empty {
  opacity: 1;
  transform: none;
}

.pw-icon {
  flex: none;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 3px 8px rgba(30, 20, 18, 0.16);
}

.pw-icon img {
  display: block;
  max-width: 28px;
  max-height: 28px;
  image-rendering: pixelated;
}

.pw-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.pw-name {
  font-size: 15px;
  font-weight: 600;
}

.pw-note {
  font-size: 12px;
  color: rgba(59, 42, 38, 0.6);
}

.pw-go {
  flex: none;
  font-size: 20px;
  color: rgba(59, 42, 38, 0.35);
}

.pw-status {
  margin: 2px 8px 6px;
  font-size: 14px;
  line-height: 20px;
  color: rgba(59, 42, 38, 0.8);
}

.pw-ledger {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin: 0 8px;
  padding: 10px 12px;
  border-radius: 14px;
  background: #f7efe2;
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.pw-ledger > span:first-child,
.pw-muted {
  color: rgba(59, 42, 38, 0.6);
}

.pw-earn {
  font-weight: 700;
  color: #4f8a3a;
}

.pw-spend {
  font-weight: 700;
  color: #b8573f;
}

.pw-spend small {
  font-weight: 500;
  font-size: 12px;
}

.pw-empty {
  margin: 4px 8px;
  padding: 14px 12px;
  border-radius: 14px;
  background: #eef5e6;
  color: #4f6b3f;
  font-size: 14px;
  text-align: center;
}

.pw-sub {
  margin: 14px 8px 8px;
  font-size: 13px;
  font-weight: 700;
  color: rgba(59, 42, 38, 0.6);
}

.pw-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 8px;
}

.pw-chip {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: #f7e8cf;
  color: #3b2a26;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.pw-btn {
  position: absolute;
  right: 10px;
  top: calc(var(--ph-top) - 4px);
  z-index: 1;
  width: 56px;
  height: 56px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 200ms ease;
}

/* 打開時按鈕藏到面板後面（面板有自己的關閉） */
.pw-root:has(.pw-panel.is-open) .pw-btn {
  opacity: 0;
  pointer-events: none;
}

.pw-btn img {
  position: absolute;
  left: 2px;
  top: 2px;
  width: 52px;
  height: 52px;
  image-rendering: pixelated;
  transition: transform 520ms cubic-bezier(0.34, 1.56, 0.64, 1);
  filter: drop-shadow(0 4px 8px rgba(30, 20, 18, 0.3));
}

.pw-badge {
  min-width: 20px;
  height: 20px;
  box-sizing: border-box;
  padding: 0 6px;
  border-radius: 999px;
  background: #e0533f;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 20px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.pw-btn-badge {
  position: absolute;
  left: 38px;
  top: -4px;
  pointer-events: none;
  box-shadow: 0 0 0 2px #fff;
}

@media (prefers-reduced-motion: reduce) {
  .pw-panel,
  .pw-panel:not(.is-open),
  .pw-row,
  .pw-sub,
  .pw-chips {
    transition-duration: 1ms;
  }
}
</style>
