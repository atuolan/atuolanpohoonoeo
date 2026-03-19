<script setup lang="ts">
/**
 * 占星骰子面板
 * 動畫邏輯完全複製 astro-dice-demo.html：
 * 骰子永遠在 DOM（display:none），結果出來後用 setTimeout 依序顯示並套用動態 @keyframes
 */
import { useAstroDiceStore } from "@/stores/astroDice";
import { marked } from "marked";
import { computed, nextTick, onMounted, ref, watch } from "vue";

const emit = defineEmits<{ back: [] }>();
const store = useAstroDiceStore();

// ===== 解讀 HTML =====
const interpretationHtml = computed(() => {
  if (!store.interpretation) return "";
  const raw = store.isInterpreting ? store.interpretation + "▌" : store.interpretation;
  return marked.parse(raw, { async: false }) as string;
});

// ===== 玻璃面板顯示狀態 =====
const notesVisible = ref(false);

// ===== 背景漸層 =====
const bgGrad = ref("linear-gradient(135deg, rgba(30, 20, 50, 0.4), rgba(50, 30, 10, 0.4))");
function randomizeBg() {
  const hue1 = Math.floor(Math.random() * 360);
  const hue2 = (hue1 + 40 + Math.floor(Math.random() * 60)) % 360;
  bgGrad.value = `linear-gradient(135deg, hsla(${hue1}, 80%, 20%, 0.6), hsla(${hue2}, 80%, 15%, 0.6))`;
}

// ===== 圖片映射 =====
const planetImageMap: Record<string, number> = {
  sun: 1, moon: 2, mercury: 3, venus: 4, mars: 5, jupiter: 6, saturn: 7,
  uranus: 8, neptune: 9, pluto: 10, northNode: 11, southNode: 12, lilith: 13, purpleQi: 14,
};
const signImageMap: Record<string, number> = {
  aries: 1, taurus: 2, gemini: 3, cancer: 4, leo: 5, virgo: 6,
  libra: 7, scorpio: 8, sagittarius: 9, capricorn: 10, aquarius: 11, pisces: 12,
};

function getDieImage(i: number) {
  if (!store.result) return "";
  if (i === 0) return `/img/xingxing${planetImageMap[store.result.planet.id] || 1}.png`;
  if (i === 1) return `/img/xingzuo${signImageMap[store.result.sign.id] || 1}.png`;
  return `/img/gong${store.result.house.number}.png`;
}

// ===== 骰子 DOM refs =====
const dieP = ref<HTMLElement | null>(null);
const dieH = ref<HTMLElement | null>(null);
const dieS = ref<HTMLElement | null>(null);

// ===== 落點座標（三角陣型） =====
const POSITIONS = [
  { left: "42%", top: "48%" },
  { left: "56%", top: "60%" },
  { left: "60%", top: "45%" },
];

// ===== 完全複製 demo 的動畫觸發邏輯 =====
function triggerDiceAnimation() {
  const dies = [dieP.value, dieH.value, dieS.value];

  // 1. 全部隱藏、清除舊動畫
  dies.forEach((el) => {
    if (!el) return;
    el.style.display = "none";
    el.style.animation = "none";
  });

  // 2. 打亂落點
  const spots = [...POSITIONS].sort(() => Math.random() - 0.5);

  // 3. 動態注入 @keyframes（終點座標寫進 keyframe 裡）
  const old = document.getElementById("astro-die-anims");
  if (old) old.remove();
  const makeKf = (name: string, tLeft: string, tTop: string) => `
    @keyframes ${name} {
      0%   { left:50%; top:-15%; transform:translate(-50%,-50%) scale(0.6) rotate(0deg); opacity:0; }
      40%  { left:50%; top:40%;  transform:translate(-50%,-50%) scale(1.1) rotate(180deg); opacity:1; }
      100% { left:${tLeft}; top:${tTop}; transform:translate(-50%,-50%) scale(1) rotate(360deg); opacity:1; }
    }
  `;
  const style = document.createElement("style");
  style.id = "astro-die-anims";
  style.innerHTML =
    makeKf("astroDieP", spots[0].left, spots[0].top) +
    makeKf("astroDieH", spots[1].left, spots[1].top) +
    makeKf("astroDieS", spots[2].left, spots[2].top);
  document.head.appendChild(style);

  // 4. 依序 setTimeout 設 display:block 再套動畫（與 demo 完全相同）
  const anims = ["astroDieP", "astroDieH", "astroDieS"];
  // 同時更新圖片 src
  const imgs = [
    store.result ? getDieImage(0) : "",
    store.result ? getDieImage(1) : "",
    store.result ? getDieImage(2) : "",
  ];
  dies.forEach((el, i) => {
    setTimeout(() => {
      if (!el) return;
      const img = el.querySelector("img");
      if (img && imgs[i]) img.src = imgs[i];
      el.style.display = "block";
      el.style.animation = `${anims[i]} 1.2s cubic-bezier(0.25,1,0.5,1) forwards`;
    }, i * 100);
  });
}

// ===== 返回邏輯 =====
function handleBack() {
  if (store.phase === "question") { emit("back"); return; }
  store.reset();
}

// ===== 隱藏散落骰子 =====
function hideDice() {
  [dieP.value, dieH.value, dieS.value].forEach((el) => {
    if (!el) return;
    el.style.display = "none";
    el.style.animation = "none";
  });
}

// ===== 開始擲骰 =====
async function handleStartRoll() {
  if (!store.question.trim()) return;
  notesVisible.value = false;
  hideDice();
  randomizeBg();
  store.goToPhase("roll");
  await store.rollDice();
}

// ===== 結果出來後觸發動畫 =====
watch(() => store.phase, async (p) => {
  if (p === "result") {
    notesVisible.value = false;
    await nextTick(); // 等 Vue 渲染出骰子 DOM
    triggerDiceAnimation();
    // 移除自動顯示面板，讓使用者手動點擊
  } else {
    notesVisible.value = false;
  }
});

// ===== 重新擲骰 =====
function handleReroll() {
  notesVisible.value = false;
  hideDice(); // 隱藏上一輪散落骰子，避免與搖骰動畫重疊
  randomizeBg();
  store.goToPhase("roll");
  store.rollDice();
}

onMounted(() => {
  if (!store.isHistoryLoaded) store.loadHistory();
});
</script>

<template>
  <div class="astro-dice">
    <!-- ===== 提問階段 ===== -->
    <div v-if="store.phase === 'question'" class="astro-phase astro-phase--question">
      <div class="astro-intro">
        <div class="astro-intro__icon">🎲</div>
        <h2 class="astro-intro__title">占星骰子</h2>
        <p class="astro-intro__desc">
          擲出三顆骰子：行星、星座、宮位<br />
          適合問「方向性問題」，不適合「是非題」和「時間題」
        </p>
      </div>
      <div class="astro-tips">
        <div class="astro-tips__good">
          <h4>✓ 這樣問比較好</h4>
          <ul>
            <li>「這段感情接下來會怎麼發展？」</li>
            <li>「他對這段關係的真實態度是？」</li>
            <li>「我在工作上該留意什麼？」</li>
          </ul>
        </div>
        <div class="astro-tips__bad">
          <h4>✗ 這樣問不太行</h4>
          <ul>
            <li>「他到底愛不愛我？」→ 是非題</li>
            <li>「我幾歲會結婚？」→ 時間題</li>
            <li>「A 還是 B？」→ 要分開問</li>
          </ul>
        </div>
      </div>
      <section class="astro-question-section">
        <h3 class="astro-label">你的問題</h3>
        <textarea
          v-model="store.question"
          class="astro-question-input"
          placeholder="集中精神，讓問題在心中浮現…"
          spellcheck="false"
        />
      </section>
      <div class="astro-actions">
        <button class="astro-btn astro-btn--ghost" @click="handleBack">返回</button>
        <button class="astro-btn astro-btn--primary" :disabled="!store.question.trim()" @click="handleStartRoll">
          擲骰子
        </button>
      </div>
    </div>

    <!-- ===== 擲骰 + 結果階段（全屏沉浸式） ===== -->
    <div
      v-if="store.phase === 'roll' || store.phase === 'result'"
      class="astro-stage"
      :style="{ '--bg-grad': bgGrad }"
    >
      <div class="astro-stage__question">{{ store.question }}</div>

      <!-- roll 階段：骰子在背景靜默抽取，畫面只顯示提示文字 -->
      <p v-if="store.phase === 'roll'" class="astro-stage__hint">集中精神，默念你的問題…</p>

      <!-- 結果階段：三顆骰子用 v-show 保持在 DOM，由 JS 控制 display + animation -->
      <div ref="dieP" class="astro-scattered-die" style="display:none" @click="notesVisible = true">
        <img :src="getDieImage(0)" class="astro-die-img" />
      </div>
      <div ref="dieH" class="astro-scattered-die" style="display:none" @click="notesVisible = true">
        <img :src="getDieImage(1)" class="astro-die-img" />
      </div>
      <div ref="dieS" class="astro-scattered-die" style="display:none" @click="notesVisible = true">
        <img :src="getDieImage(2)" class="astro-die-img" />
      </div>

      <!-- 玻璃面板 -->
      <div v-if="store.phase === 'result'" class="astro-notes-panel" :class="{ 'is-visible': notesVisible }">
          <div class="astro-notes-content">
            <div class="astro-note-item">
              <span class="astro-note-item__symbol">{{ store.result?.planet.symbol }}</span>
              <div>
                <div class="astro-note-item__name">{{ store.result?.planet.nameCn }}</div>
                <div class="astro-note-item__desc">{{ store.result?.planet.keywords.join("、") }}</div>
              </div>
            </div>
            <div class="astro-note-item">
              <span class="astro-note-item__symbol">{{ store.result?.sign.symbol }}</span>
              <div>
                <div class="astro-note-item__name">{{ store.result?.sign.nameCn }}</div>
                <div class="astro-note-item__desc">{{ store.result?.sign.keywords.join("、") }}</div>
              </div>
            </div>
            <div class="astro-note-item">
              <span class="astro-note-item__symbol">{{ store.result?.house.romanNumeral }}</span>
              <div>
                <div class="astro-note-item__name">{{ store.result?.house.nameCn }}</div>
                <div class="astro-note-item__desc">{{ store.result?.house.keywords.join("、") }}</div>
              </div>
            </div>
          </div>
          <div class="astro-notes-actions">
            <button class="astro-notes-reroll" @click="handleReroll">↺ 重新擲骰</button>
            <button
              class="astro-btn astro-btn--primary astro-btn--sm"
              :disabled="store.isInterpreting"
              @click="store.startInterpretation()"
            >
              請求解讀
            </button>
          </div>
        </div>

        <p v-if="store.phase === 'result' && !notesVisible" class="astro-stage__tap-hint" @click="notesVisible = true">
          點擊骰子查看結果
        </p>
    </div>

    <!-- ===== 解讀階段 ===== -->
    <div v-if="store.phase === 'interpret'" class="astro-phase astro-phase--interpret">
      <div class="astro-mini-result">
        <span>{{ store.result?.planet.symbol }} {{ store.result?.planet.nameCn }}</span>
        <span class="astro-mini-sep">+</span>
        <span>{{ store.result?.sign.symbol }} {{ store.result?.sign.nameCn }}</span>
        <span class="astro-mini-sep">+</span>
        <span>{{ store.result?.house.romanNumeral }} {{ store.result?.house.nameCn }}</span>
      </div>
      <div class="astro-interpretation">
        <h3 class="astro-interpretation__title">✦ 骰子解讀 ✦</h3>
        <div v-if="store.interpretError" class="astro-interpretation__error">
          <p>⚠️ {{ store.interpretError }}</p>
          <p class="astro-interpretation__error-hint">請檢查 API 設定後重試。</p>
        </div>
        <div v-else-if="interpretationHtml" class="astro-interpretation__content" v-html="interpretationHtml" />
        <div v-else-if="store.isInterpreting" class="astro-interpretation__loading">
          <div class="astro-interpretation__loading-icon">🔮</div>
          <p>正在解讀...</p>
        </div>
      </div>
      <div v-if="!store.isInterpreting" class="astro-actions">
        <button class="astro-btn astro-btn--ghost" @click="store.startInterpretation()">重新解讀</button>
        <button class="astro-btn astro-btn--primary" @click="store.reset()">開始新的占卜</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$surface: rgba(22, 24, 38, 0.6);
$surface-h: rgba(30, 34, 54, 0.8);
$border-m: rgba(255, 255, 255, 0.15);
$text-1: #e2e4f0;
$text-2: #b0b5cc;
$text-3: #7b82a3;
$text-m: #4e5573;
$accent: #f28b82;
$accent-l: #ffdfa3;
$r-md: 12px;
$r-lg: 16px;

.astro-dice {
  width: 100%;
  max-width: 600px;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 0 16px;
  overflow-y: auto;
  &:has(.astro-stage) {
    padding: 0;
    max-width: none;
    overflow: hidden;
  }
}

.astro-phase { animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); flex: 1; display: flex; flex-direction: column; min-height: 0; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

.astro-intro {
  text-align: center; margin-bottom: 24px;
  &__icon  { font-size: 48px; margin-bottom: 12px; }
  &__title { font-size: 24px; font-weight: 700; color: $text-1; margin-bottom: 8px; }
  &__desc  { font-size: 14px; color: $text-3; line-height: 1.6; }
}

.astro-tips {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; font-size: 13px;
  h4 { font-size: 13px; font-weight: 600; margin-bottom: 8px; }
  ul { margin: 0; padding-left: 16px; li { margin-bottom: 4px; line-height: 1.5; } }
  &__good { background: rgba(134,239,172,0.1); border: 1px solid rgba(134,239,172,0.3); border-radius: $r-md; padding: 12px; h4 { color: #86efac; } color: $text-2; }
  &__bad  { background: rgba(252,165,165,0.1); border: 1px solid rgba(252,165,165,0.3); border-radius: $r-md; padding: 12px; h4 { color: #fca5a5; } color: $text-2; }
}

.astro-question-section { margin-bottom: 24px; }
.astro-label { font-size: 13px; font-weight: 600; color: $text-2; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; }
.astro-question-input {
  width: 100%; min-height: 100px; padding: 14px 16px;
  background: $surface; border: 1px solid $border-m; border-radius: $r-lg;
  color: $text-1; font-size: 15px; resize: none; line-height: 1.7; font-family: inherit; box-sizing: border-box;
  &::placeholder { color: $text-m; }
  &:focus { outline: none; border-color: $accent; }
}

.astro-actions { display: flex; gap: 12px; justify-content: center; margin-top: 24px; }
.astro-btn {
  padding: 12px 28px; border-radius: $r-md; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none;
  &--sm { padding: 10px 20px; font-size: 14px; }
  &--primary {
    background: linear-gradient(135deg, $accent, #c084fc); color: #fff;
    &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(242,139,130,0.4); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }
  &--ghost {
    background: transparent; border: 1px solid $border-m; color: $text-2;
    &:hover { background: $surface-h; color: $text-1; }
  }
}

// ===== 全屏舞台 =====
.astro-stage {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: #000;
  z-index: 0;

  &::after {
    content: ''; position: absolute; inset: 0;
    background: url('/img/new_bg.jpg') center center / cover no-repeat;
    opacity: 0.5; z-index: 1; pointer-events: none;
  }
  &::before {
    content: ''; position: absolute; inset: 0;
    background: var(--bg-grad, linear-gradient(135deg, rgba(30,20,50,0.4), rgba(50,30,10,0.4)));
    mix-blend-mode: color; z-index: 2; pointer-events: none; transition: background 1.5s ease-in-out;
  }

  &__question {
    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    z-index: 10; font-size: 13px; color: rgba(255,255,255,0.7);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60%;
  }
  &__hint {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 10; font-size: 13px; color: rgba(255,255,255,0.6); white-space: nowrap;
    animation: pulse 2s infinite;
  }
  &__tap-hint {
    position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
    z-index: 10; font-size: 13px; color: rgba(255,255,255,0.7); white-space: nowrap;
    cursor: pointer; animation: pulse 2s infinite;
    &:hover { color: #fff; }
  }
}

// ===== 散落骰子（JS 控制 display + animation） =====
.astro-scattered-die {
  position: absolute;
  width: 90px;
  z-index: 15;
  // display:none 由 JS 控制，這裡不設初始位置
  filter: drop-shadow(0 4px 12px rgba(255,255,255,0.4));
  cursor: pointer;
  .astro-die-img { width: 100%; height: auto; pointer-events: none; transition: filter 0.2s; }
  &:hover .astro-die-img { filter: drop-shadow(0 6px 24px rgba(255,220,160,0.8)); }
}

// ===== 玻璃面板 =====
.astro-notes-panel {
  position: absolute; bottom: 20px; left: 16px; right: 16px;
  max-width: 480px; margin: 0 auto;
  background: rgba(30, 20, 50, 0.4); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 12px; padding: 20px 18px 16px;
  z-index: 30; box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  opacity: 0; transform: translateY(24px); pointer-events: none;
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
  &.is-visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
}
.astro-notes-content {
  display: flex; flex-direction: column; gap: 12px; max-height: 36vh; overflow-y: auto; padding-right: 4px;
  &::-webkit-scrollbar { width: 3px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
}
.astro-note-item {
  display: flex; align-items: flex-start; gap: 10px;
  &__symbol { font-size: 22px; line-height: 1.2; flex-shrink: 0; width: 32px; text-align: center; color: #fff; }
  &__name   { font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.95); margin-bottom: 2px; }
  &__desc   { font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.5; }
}
.astro-notes-actions {
  display: flex; align-items: center; justify-content: space-between;
  margin-top: 14px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.15);
}
.astro-notes-reroll {
  font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.5); background: transparent; border: none; cursor: pointer; padding: 6px 0; transition: color 0.2s;
  &:hover { color: #fff; }
}

// ===== 解讀階段 =====
.astro-mini-result {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px;
  padding: 12px; background: $surface; border-radius: $r-md; margin-bottom: 20px; font-size: 14px; color: $text-2;
}
.astro-mini-sep { color: $text-m; }
.astro-interpretation {
  background: $surface; border-radius: $r-lg; padding: 20px; flex: 1; min-height: 0; overflow-y: auto;
  &__title { text-align: center; font-size: 16px; font-weight: 600; color: $accent-l; margin-bottom: 16px; }
  &__content { color: $text-1; font-size: 15px; line-height: 1.8; :deep(p) { margin-bottom: 12px; } :deep(strong) { color: $accent-l; } }
  &__loading { text-align: center; padding: 40px 0; color: $text-3; &-icon { font-size: 32px; margin-bottom: 12px; animation: pulse 1.5s infinite; } }
  &__error { text-align: center; color: #fca5a5; &-hint { font-size: 13px; color: $text-3; margin-top: 8px; } }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
</style>
