<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="merit-screen">
        <!-- 1. 頂欄 -->
        <header class="top-bar">
          <button class="top-round-btn" @click="$emit('close')" aria-label="返回">
            <ChevronLeft :size="20" />
          </button>
          <h1 class="top-title">修行</h1>
          <button
            class="top-round-btn"
            @click="toggleSound"
            :aria-label="soundOn ? '音效：開' : '音效：關'"
          >
            <Volume2 v-if="soundOn" :size="20" />
            <VolumeX v-else :size="20" />
          </button>
        </header>

        <!-- 2. 模式切換 -->
        <div class="mode-switch-wrapper">
          <div class="mode-switch" role="group" aria-label="模式切換">
            <button
              class="mode-btn"
              :class="{ active: mode === 'woodfish' }"
              :aria-pressed="mode === 'woodfish'"
              @click="setMode('woodfish')"
            >
              木魚
            </button>
            <button
              class="mode-btn"
              :class="{ active: mode === 'beads' }"
              :aria-pressed="mode === 'beads'"
              @click="setMode('beads')"
            >
              佛珠
            </button>
          </div>
        </div>

        <!-- 3. 中央互動容器 -->
        <div class="center-interactive">
          <div class="circle-stage">
            <!-- 進度環 SVG -->
            <svg viewBox="0 0 300 300" class="progress-svg" aria-hidden="true">
              <circle
                cx="150"
                cy="150"
                r="138"
                fill="none"
                stroke="#3E362F"
                stroke-width="6"
              />
              <circle
                cx="150"
                cy="150"
                r="138"
                fill="none"
                stroke="var(--zen-gold)"
                stroke-width="6"
                stroke-linecap="round"
                stroke-dasharray="867.08"
                :stroke-dashoffset="ringDashOffset"
                transform="rotate(-90 150 150)"
                class="progress-ring-fg"
              />
            </svg>

            <!-- 飄字層 -->
            <div class="float-container" aria-hidden="true">
              <TransitionGroup name="float-anim">
                <div
                  v-for="word in floatingWords"
                  :key="word.id"
                  class="floating-text"
                  :style="{ left: word.left + '%' }"
                >
                  {{ word.text }}
                </div>
              </TransitionGroup>
            </div>

            <!-- 中間圓形按鈕 -->
            <button
              ref="centerBtnRef"
              class="center-circle-btn"
              :class="{ pressed: isPressed }"
              :aria-label="mode === 'woodfish' ? '敲一下木魚' : '撥一顆佛珠'"
              @click="onCenterClick"
              @mousedown="onMouseDown"
            >
              <!-- 木魚模式內容 -->
              <svg
                v-if="mode === 'woodfish'"
                viewBox="0 0 120 120"
                class="woodfish-svg"
                aria-hidden="true"
              >
                <ellipse cx="58" cy="104" rx="46" ry="8" fill="#7A2E2A" />
                <ellipse
                  cx="58"
                  cy="72"
                  rx="44"
                  ry="31"
                  fill="#C98B4E"
                  stroke="#1F1A16"
                  stroke-width="3"
                />
                <path
                  d="M22 76Q58 94 94 76"
                  stroke="#1F1A16"
                  stroke-width="4"
                  fill="none"
                  stroke-linecap="round"
                />
                <path
                  d="M34 58Q44 48 58 48"
                  stroke="#E3B07A"
                  stroke-width="4"
                  fill="none"
                  stroke-linecap="round"
                />
                <circle cx="38" cy="66" r="3.5" fill="#1F1A16" />
                <g class="mallet" :class="{ strike: isMalletStriking }">
                  <path
                    d="M84 44L110 14"
                    stroke="#8A5A33"
                    stroke-width="7"
                    stroke-linecap="round"
                  />
                  <circle
                    cx="82"
                    cy="46"
                    r="10"
                    fill="#8A5A33"
                    stroke="#1F1A16"
                    stroke-width="2.5"
                  />
                </g>
              </svg>

              <!-- 佛珠模式內容 -->
              <div v-else class="beads-container" aria-hidden="true">
                <div
                  v-for="(bead, idx) in 18"
                  :key="idx"
                  class="bead-dot"
                  :class="{ current: beadIndex === idx }"
                  :style="getBeadStyle(idx)"
                ></div>

                <svg viewBox="0 0 40 70" class="tassel-svg" aria-hidden="true">
                  <circle cx="20" cy="10" r="8" fill="#B4372A" />
                  <path d="M20 18V30M12 30h16l-3 36H15z" fill="#B4372A" />
                  <path
                    d="M16 36v26M20 36v28M24 36v26"
                    stroke="#7A221A"
                    stroke-width="1.2"
                  />
                </svg>
              </div>
            </button>
          </div>
        </div>

        <!-- 4. 今日功德 -->
        <div class="today-section">
          <span class="today-title">今日功德</span>
          <div class="today-count-line">
            <span class="count-num">{{ meritStore.todayCount }}</span>
            <span class="count-target">/ 108</span>
          </div>
          <span class="today-status">
            {{ meritStore.todayCount < 108 ? `還差 ${108 - meritStore.todayCount} 下` : '今日圓滿' }}
          </span>
        </div>

        <!-- 5. 數據卡 -->
        <div class="stats-card">
          <div class="stat-col">
            <span class="stat-label">連續</span>
            <span class="stat-val"><span class="num">{{ meritStore.streakDays }}</span> 天</span>
          </div>
          <div class="stat-col divider">
            <span class="stat-label">本週</span>
            <span class="stat-val"><span class="num">{{ meritStore.weekCount }}</span> 下</span>
          </div>
          <div class="stat-col">
            <span class="stat-label">功德</span>
            <span class="stat-val"><span class="num">{{ meritStore.state.balance }}</span></span>
          </div>
        </div>

        <!-- 6. 功德商店入口 -->
        <button class="shop-open-btn" @click="showShop = true">
          <Store :size="16" />
          <span>功德商店</span>
        </button>

        <!-- 7. 最底靈性提示 -->
        <footer class="bottom-footer">
          {{
            meritStore.todayCount < 108
              ? '敲完這一百零八下，就去睡吧。'
              : '今天的功德夠了，好好休息。'
          }}
        </footer>

        <!-- C. 功德商店抽屜 -->
        <Transition name="drawer-fade">
          <div
            v-if="showShop"
            class="shop-drawer-overlay"
            @click.self="showShop = false"
          >
            <div class="shop-drawer-panel">
              <div class="drawer-handle" />
              <div class="drawer-header">
                <div class="drawer-header-left">
                  <h3 class="drawer-title">功德商店</h3>
                </div>
                <div class="drawer-header-right">
                  <span class="drawer-balance">功德 {{ meritStore.state.balance }}</span>
                  <button class="drawer-close-btn" @click="showShop = false" aria-label="關閉商店">
                    <X :size="18" />
                  </button>
                </div>
              </div>

              <div class="drawer-body">
                <!-- 飄字句子列表 -->
                <section class="shop-group">
                  <div class="group-title">飄字句子</div>
                  <div class="items-list">
                    <div
                      v-for="s in UNLOCKABLE_SENTENCES"
                      :key="s.id"
                      class="white-card sentence-card"
                    >
                      <div class="sentence-meta">
                        <div class="words-line">{{ s.words.join(' ') }}</div>
                        <div class="category-tag">{{ s.category }}</div>
                      </div>
                      <button
                        v-if="!meritStore.isSentenceUnlocked(s.id)"
                        class="dark-capsule-btn"
                        :disabled="meritStore.state.balance < s.price"
                        @click="buySentence(s.id)"
                      >
                        {{ s.price }} 功德
                      </button>
                      <span v-else class="unlocked-badge">已解鎖</span>
                    </div>
                  </div>
                </section>

                <!-- 自訂句子欄位 -->
                <section class="shop-group">
                  <div class="group-title">
                    自訂句子（{{ meritStore.state.customSentences.length }}/{{ meritStore.state.customSlots }}）
                  </div>

                  <div class="items-list">
                    <div
                      v-for="cs in meritStore.state.customSentences"
                      :key="cs.id"
                      class="white-card custom-row"
                    >
                      <span class="custom-text">{{ cs.text }}</span>
                      <button class="delete-icon-btn" @click="deleteCustom(cs.id)" aria-label="刪除自訂句子">
                        <X :size="16" />
                      </button>
                    </div>
                  </div>

                  <div
                    v-if="meritStore.state.customSentences.length < meritStore.state.customSlots"
                    class="white-card add-custom-card"
                  >
                    <input
                      v-model="newCustomText"
                      class="custom-inline-input"
                      placeholder="輸入你的句子..."
                      maxlength="30"
                      @keyup.enter="addCustom"
                    />
                    <button
                      class="dark-capsule-btn small"
                      :disabled="!newCustomText.trim()"
                      @click="addCustom"
                    >
                      新增
                    </button>
                  </div>

                  <button
                    v-if="meritStore.state.customSlots < MAX_CUSTOM_SLOTS"
                    class="unlock-slot-row-btn"
                    :disabled="meritStore.state.balance < CUSTOM_SLOT_PRICE"
                    @click="unlockSlot"
                  >
                    解鎖自訂欄位（{{ CUSTOM_SLOT_PRICE }} 功德）
                  </button>
                  <div v-else class="slot-limit-hint">已達自訂上限</div>
                </section>

                <!-- 句子選擇 -->
                <section class="shop-group">
                  <div class="group-title">當前使用的句子</div>
                  <div class="white-card selector-card">
                    <div class="select-field">
                      <label class="field-label">敲木魚</label>
                      <select
                        class="select-input"
                        :value="meritStore.state.woodfish.selectedSentenceId"
                        @change="onSelectWoodfish"
                      >
                        <option
                          v-for="opt in availableSentenceOptions"
                          :key="'wf-' + opt.id"
                          :value="opt.id"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>

                    <div class="select-field divider-top">
                      <label class="field-label">盤佛珠</label>
                      <select
                        class="select-input"
                        :value="meritStore.state.beads.selectedSentenceId"
                        @change="onSelectBeads"
                      >
                        <option
                          v-for="opt in availableSentenceOptions"
                          :key="'bd-' + opt.id"
                          :value="opt.id"
                        >
                          {{ opt.label }}
                        </option>
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import {
  BEADS_DEFAULT_SENTENCE,
  CUSTOM_SLOT_PRICE,
  getSentenceById,
  MAX_CUSTOM_SLOTS,
  UNLOCKABLE_SENTENCES,
  WOODFISH_DEFAULT_SENTENCE,
} from "@/data/meritSentences";
import { useMeritStore } from "@/stores/merit";
import { ChevronLeft, Store, Volume2, VolumeX, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const meritStore = useMeritStore();

// 音效控制
const soundOn = ref<boolean>(true);
try {
  const cachedSound = localStorage.getItem("merit-sound");
  if (cachedSound !== null) {
    soundOn.value = cachedSound === "true";
  }
} catch {
  // 靜默 fallback
}

function toggleSound() {
  soundOn.value = !soundOn.value;
  try {
    localStorage.setItem("merit-sound", String(soundOn.value));
  } catch {
    // 忽略 localStorage 錯誤
  }
}

// 模式控制
const mode = ref<"woodfish" | "beads">("woodfish");
try {
  const cachedMode = localStorage.getItem("merit-mode");
  if (cachedMode === "woodfish" || cachedMode === "beads") {
    mode.value = cachedMode;
  }
} catch {
  // 忽略
}

function setMode(newMode: "woodfish" | "beads") {
  mode.value = newMode;
  try {
    localStorage.setItem("merit-mode", newMode);
  } catch {
    // 忽略
  }
}

// 畫面與按鈕互動動畫
const centerBtnRef = ref<HTMLButtonElement | null>(null);
const isPressed = ref(false);
const isMalletStriking = ref(false);
const showShop = ref(false);
const newCustomText = ref("");

// 佛珠索引 (0~17)
const beadIndex = ref(0);

// 進度圈 offset: 867.08 × (1 − min(1, 今日次數 / 108))
const ringDashOffset = computed(() => {
  const ratio = Math.min(1, meritStore.todayCount / 108);
  return 867.08 * (1 - ratio);
});

// 佛珠圓周排列計算：18 顆珠子沿半徑 84 圓形排列，容器中心為 (110, 110)
function getBeadStyle(index: number) {
  const angle = (index / 18) * 2 * Math.PI - Math.PI / 2; // 從正上方開始
  const r = 84;
  const x = 110 + r * Math.cos(angle);
  const y = 110 + r * Math.sin(angle);
  const isCur = beadIndex.value === index;
  const size = isCur ? 24 : 18;
  return {
    left: `${x - size / 2}px`,
    top: `${y - size / 2}px`,
    width: `${size}px`,
    height: `${size}px`,
  };
}

// 飄字邏輯
interface FloatingWord {
  id: number;
  text: string;
  left: number;
}
const floatingWords = ref<FloatingWord[]>([]);
let floatSeed = 0;
let wfWordIndex = 0;
let bdWordIndex = 0;

function spawnFloatingText(text: string) {
  floatSeed += 1;
  const id = floatSeed;
  // 隨機 horizontal 分佈在 20% ~ 80%
  const left = Math.round(20 + Math.random() * 60);
  floatingWords.value.push({ id, text, left });
  setTimeout(() => {
    floatingWords.value = floatingWords.value.filter((w) => w.id !== id);
  }, 1000);
}

// Web Audio API
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playWoodfishSound() {
  if (!soundOn.value) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.type = "sine";
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // 靜默
  }
}

function playBeadSound() {
  if (!soundOn.value) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
    osc.type = "triangle";
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  } catch {
    // 靜默
  }
}

// 敲木魚
function tapWoodfishAction() {
  meritStore.tapWoodfish();
  playWoodfishSound();

  // 木槌動畫
  isMalletStriking.value = true;
  setTimeout(() => {
    isMalletStriking.value = false;
  }, 120);

  // 震動反饋
  try {
    navigator.vibrate?.(10);
  } catch {
    // 忽略
  }

  // 飄字
  const words = meritStore.getWoodfishWords();
  if (words.length > 0) {
    const word = words[wfWordIndex % words.length];
    wfWordIndex += 1;
    spawnFloatingText(word);
  }
}

// 撥一顆佛珠
function countOneBeadAction() {
  meritStore.rollBead();
  playBeadSound();

  try {
    navigator.vibrate?.(10);
  } catch {
    // 忽略
  }

  // 飄字
  const words = meritStore.getBeadsWords();
  if (words.length > 0) {
    const word = words[bdWordIndex % words.length];
    bdWordIndex += 1;
    spawnFloatingText(word);
  }

  beadIndex.value = (beadIndex.value + 1) % 18;
  if (beadIndex.value === 0) {
    meritStore.completeBeadRound();
    spawnFloatingText("圓滿 +5");
  }
}

// 點擊事件
function triggerAction() {
  // 按壓回彈動畫
  isPressed.value = true;
  setTimeout(() => {
    isPressed.value = false;
  }, 100);

  if (mode.value === "woodfish") {
    tapWoodfishAction();
  } else {
    countOneBeadAction();
  }
}

function onCenterClick() {
  if (hasMovedDuringDrag) {
    hasMovedDuringDrag = false;
    return;
  }
  triggerAction();
}

// ===== 佛珠拖曳旋轉角度計算 =====
let isDragging = false;
let hasMovedDuringDrag = false;
let lastAngle = 0;
let accumulatedAngle = 0;
let lastTriggerAngle = 0;
const ANGLE_PER_BEAD = 20;

function getAngleFromCenter(x: number, y: number): number {
  if (!centerBtnRef.value) return 0;
  const rect = centerBtnRef.value.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  return Math.atan2(y - cy, x - cx) * (180 / Math.PI);
}

function onDragStart(clientX: number, clientY: number) {
  if (mode.value !== "beads") return;
  isDragging = true;
  hasMovedDuringDrag = false;
  lastAngle = getAngleFromCenter(clientX, clientY);
  accumulatedAngle = 0;
  lastTriggerAngle = 0;
}

function onDragMove(clientX: number, clientY: number) {
  if (!isDragging || mode.value !== "beads") return;
  const curAngle = getAngleFromCenter(clientX, clientY);
  let delta = curAngle - lastAngle;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;

  if (Math.abs(delta) > 1) {
    hasMovedDuringDrag = true;
  }

  accumulatedAngle += delta;
  lastAngle = curAngle;

  const dist = Math.abs(accumulatedAngle - lastTriggerAngle);
  if (dist >= ANGLE_PER_BEAD) {
    const count = Math.floor(dist / ANGLE_PER_BEAD);
    for (let i = 0; i < count; i++) {
      countOneBeadAction();
    }
    lastTriggerAngle +=
      count * ANGLE_PER_BEAD * Math.sign(accumulatedAngle - lastTriggerAngle);
  }
}

function onDragEnd() {
  isDragging = false;
}

// 監聽 Mouse 拖曳
function onMouseDown(e: MouseEvent) {
  if (mode.value !== "beads") return;
  onDragStart(e.clientX, e.clientY);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
}

function onMouseMove(e: MouseEvent) {
  onDragMove(e.clientX, e.clientY);
}

function onMouseUp() {
  onDragEnd();
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);
}

// 監聽 Touch 拖曳（透過 addEventListener 掛在 centerBtnRef 上，passive: false 用於 preventDefault）
function onTouchStartHandler(e: TouchEvent) {
  if (mode.value !== "beads") return;
  if (e.touches.length !== 1) return;
  onDragStart(e.touches[0].clientX, e.touches[0].clientY);
}

function onTouchMoveHandler(e: TouchEvent) {
  if (!isDragging || mode.value !== "beads") return;
  if (e.touches.length !== 1) return;
  e.preventDefault();
  onDragMove(e.touches[0].clientX, e.touches[0].clientY);
}

function onTouchEndHandler() {
  onDragEnd();
}

// ===== 商店資料與操作 =====
const availableSentenceOptions = computed(() => {
  const options: { id: string; label: string }[] = [];
  options.push({
    id: WOODFISH_DEFAULT_SENTENCE.id,
    label: WOODFISH_DEFAULT_SENTENCE.words.join(" "),
  });
  options.push({
    id: BEADS_DEFAULT_SENTENCE.id,
    label: BEADS_DEFAULT_SENTENCE.words.join(" "),
  });

  for (const sid of meritStore.state.unlockedSentences) {
    const s = getSentenceById(sid);
    if (s) options.push({ id: s.id, label: s.words.join(" ") });
  }

  for (const cs of meritStore.state.customSentences) {
    options.push({ id: cs.id, label: cs.text });
  }

  return options;
});

function buySentence(id: string) {
  const result = meritStore.unlockSentence(id);
  if (result.success) meritStore.saveState();
}

function unlockSlot() {
  const result = meritStore.unlockCustomSlot();
  if (result.success) meritStore.saveState();
}

function addCustom() {
  const text = newCustomText.value.trim();
  if (!text) return;
  const result = meritStore.addCustomSentence(text);
  if (result.success) {
    newCustomText.value = "";
    meritStore.saveState();
  }
}

function deleteCustom(id: string) {
  meritStore.removeCustomSentence(id);
  meritStore.saveState();
}

function onSelectWoodfish(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  meritStore.selectWoodfishSentence(val);
  meritStore.saveState();
}

function onSelectBeads(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  meritStore.selectBeadsSentence(val);
  meritStore.saveState();
}

// ===== 存檔與生命週期 =====
let saveIntervalTimer: ReturnType<typeof setInterval> | null = null;

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    meritStore.saveState();
  }
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await meritStore.initialize();
      if (!saveIntervalTimer) {
        saveIntervalTimer = setInterval(() => {
          meritStore.saveState();
        }, 5000);
      }
    } else {
      if (saveIntervalTimer) {
        clearInterval(saveIntervalTimer);
        saveIntervalTimer = null;
      }
      meritStore.saveState();
    }
  },
  { immediate: true },
);

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibilityChange);
  if (centerBtnRef.value) {
    centerBtnRef.value.addEventListener("touchstart", onTouchStartHandler, {
      passive: true,
    });
    centerBtnRef.value.addEventListener("touchmove", onTouchMoveHandler, {
      passive: false,
    });
    centerBtnRef.value.addEventListener("touchend", onTouchEndHandler, {
      passive: true,
    });
    centerBtnRef.value.addEventListener("touchcancel", onTouchEndHandler, {
      passive: true,
    });
  }
});

onUnmounted(() => {
  if (saveIntervalTimer) {
    clearInterval(saveIntervalTimer);
    saveIntervalTimer = null;
  }
  meritStore.saveState();

  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("mouseup", onMouseUp);

  if (centerBtnRef.value) {
    centerBtnRef.value.removeEventListener("touchstart", onTouchStartHandler);
    centerBtnRef.value.removeEventListener("touchmove", onTouchMoveHandler);
    centerBtnRef.value.removeEventListener("touchend", onTouchEndHandler);
    centerBtnRef.value.removeEventListener("touchcancel", onTouchEndHandler);
  }

  if (audioCtx) {
    try {
      audioCtx.close();
    } catch {
      // 忽略
    }
    audioCtx = null;
  }
});
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.merit-screen {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  padding: max(16px, var(--safe-area-inset-top, env(safe-area-inset-top))) 20px
    max(28px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  background: #2a2520;
  color: #ede3d3;
  overflow: hidden;
  user-select: none;
  touch-action: manipulation;

  --zen-panel: #352e28;
  --zen-line: #4a4038;
  --zen-sub: #b9ac9a;
  --zen-gold: #e0a869;
}

/* 1. 頂欄 */
.top-bar {
  align-self: stretch;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 44px;
  flex-shrink: 0;
}

.top-round-btn {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity 0.15s ease;

  &:active {
    opacity: 0.7;
  }
}

.top-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: #ede3d3;
}

/* 2. 模式切換 */
.mode-switch-wrapper {
  display: flex;
  justify-content: center;
}

.mode-switch {
  display: grid;
  grid-template-columns: 96px 96px;
  padding: 3px;
  border-radius: 20px;
  background: var(--zen-panel);
}

.mode-btn {
  height: 36px;
  border-radius: 17px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  background: transparent;
  color: #ede3d3;
  cursor: pointer;
  transition: all 0.2s ease;

  &.active {
    background: #ede3d3;
    color: #2a2520;
  }
}

/* 3. 中央互動容器 */
.center-interactive {
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
}

.circle-stage {
  width: min(300px, 78vw);
  height: min(300px, 78vw);
  position: relative;
}

.progress-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.progress-ring-fg {
  transition: stroke-dashoffset 0.3s ease;
}

/* 飄字區域 */
.float-container {
  position: absolute;
  top: -20px;
  left: 0;
  right: 0;
  height: 50px;
  pointer-events: none;
  overflow: visible;
}

.floating-text {
  position: absolute;
  transform: translateX(-50%);
  font-size: 16px;
  font-weight: 700;
  color: var(--zen-gold);
  white-space: nowrap;
  animation: floatUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes floatUp {
  0% {
    opacity: 1;
    transform: translate(-50%, 0);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -46px);
  }
}

/* 中央按鈕 */
.center-circle-btn {
  position: absolute;
  left: calc(100% * 40 / 300);
  top: calc(100% * 40 / 300);
  width: calc(100% * 220 / 300);
  height: calc(100% * 220 / 300);
  border-radius: 50%;
  background: var(--zen-panel);
  border: none;
  box-shadow: inset 0 -8px 0 rgba(0, 0, 0, 0.18);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: transform 0.1s ease;
  overflow: hidden;

  &.pressed {
    transform: scale(0.96);
  }
}

/* 木魚圖形 */
.woodfish-svg {
  width: calc(100% * 160 / 220);
  height: calc(100% * 160 / 220);
  overflow: visible;

  .mallet {
    transform-origin: 110px 14px;
    transition: transform 0.08s ease;

    &.strike {
      transform: rotate(12deg);
    }
  }
}

/* 佛珠圖形 */
.beads-container {
  position: relative;
  width: 100%;
  height: 100%;
}

.bead-dot {
  position: absolute;
  border-radius: 50%;
  background: #8a5a33;
  box-shadow: inset -3px -3px 0 rgba(0, 0, 0, 0.25);
  transition: all 0.15s ease;

  &.current {
    background: #e8b86a;
  }
}

.tassel-svg {
  position: absolute;
  left: calc(50% - 20px);
  top: calc(50% - 35px);
  width: 40px;
  height: 70px;
}

/* 4. 今日功德 */
.today-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.today-title {
  font-size: 13px;
  color: var(--zen-sub);
}

.today-count-line {
  display: flex;
  align-items: baseline;
  line-height: 1;

  .count-num {
    font-family: var(--g-num, "Outfit", sans-serif);
    font-size: 60px;
    font-weight: 300;
    line-height: 1;
    color: #ede3d3;
  }

  .count-target {
    font-family: var(--g-num, "Outfit", sans-serif);
    font-size: 18px;
    color: var(--zen-sub);
    margin-left: 4px;
  }
}

.today-status {
  font-size: 13px;
  font-weight: 700;
  color: var(--zen-gold);
}

/* 5. 數據卡 */
.stats-card {
  align-self: stretch;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  background: var(--zen-panel);
  border-radius: 18px;
  padding: 12px 0;
}

.stat-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;

  &.divider {
    border-left: 1px solid var(--zen-line);
    border-right: 1px solid var(--zen-line);
  }

  .stat-label {
    font-size: 11px;
    color: var(--zen-sub);
  }

  .stat-val {
    font-size: 16px;
    font-weight: 700;
    color: #ede3d3;

    .num {
      font-family: var(--g-num, "Outfit", sans-serif);
    }
  }
}

/* 6. 功德商店按鈕 */
.shop-open-btn {
  height: 40px;
  padding: 0 16px;
  border-radius: 20px;
  background: transparent;
  border: 1px solid var(--zen-line);
  color: #ede3d3;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:active {
    background: rgba(255, 255, 255, 0.05);
  }
}

/* 7. 最底提示 */
.bottom-footer {
  margin-top: auto;
  font-size: 13px;
  color: var(--zen-sub);
  text-align: center;
}

/* C. 功德商店抽屜 */
.shop-drawer-overlay {
  position: fixed;
  inset: 0;
  z-index: 1010;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.shop-drawer-panel {
  background: #f6f1e8;
  color: #2a2520;
  border-radius: 24px 24px 0 0;
  max-height: 80dvh;
  display: flex;
  flex-direction: column;
  padding: 12px 20px max(24px, var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
  box-sizing: border-box;
}

.drawer-handle {
  width: 36px;
  height: 5px;
  background: #cfc7bc;
  border-radius: 3px;
  margin: 0 auto 12px;
  flex-shrink: 0;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-shrink: 0;

  .drawer-title {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }

  .drawer-header-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .drawer-balance {
    font-size: 14px;
    font-weight: 600;
    color: #7a6e60;
  }

  .drawer-close-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.06);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #2a2520;
    cursor: pointer;

    &:active {
      background: rgba(0, 0, 0, 0.12);
    }
  }
}

.drawer-body {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-bottom: 8px;
}

.shop-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .group-title {
    font-size: 13px;
    font-weight: 700;
    color: #7a6e60;
  }
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.white-card {
  background: #ffffff;
  border-radius: 16px;
  padding: 12px 14px;
  box-sizing: border-box;
}

.sentence-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .sentence-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .words-line {
    font-size: 14px;
    font-weight: 600;
    color: #2a2520;
  }

  .category-tag {
    font-size: 11px;
    color: #8c8273;
  }
}

.dark-capsule-btn {
  height: 36px;
  border-radius: 18px;
  background: #2a2520;
  color: #ffffff;
  border: none;
  padding: 0 16px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.small {
    padding: 0 12px;
    height: 32px;
  }
}

.unlocked-badge {
  font-size: 12px;
  color: #8c8273;
  padding: 4px 8px;
}

.custom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  .custom-text {
    font-size: 14px;
    color: #2a2520;
    word-break: break-all;
  }

  .delete-icon-btn {
    border: none;
    background: transparent;
    color: #8c8273;
    padding: 4px;
    cursor: pointer;

    &:hover {
      color: #b4372a;
    }
  }
}

.add-custom-card {
  display: flex;
  align-items: center;
  gap: 8px;

  .custom-inline-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 14px;
    color: #2a2520;
    outline: none;

    &::placeholder {
      color: #a89f92;
    }
  }
}

.unlock-slot-row-btn {
  width: 100%;
  height: 40px;
  border-radius: 14px;
  border: 1px dashed #b9ac9a;
  background: transparent;
  color: #5c5246;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.slot-limit-hint {
  font-size: 12px;
  color: #8c8273;
  text-align: center;
  padding: 4px 0;
}

.selector-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.select-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  &.divider-top {
    border-top: 1px solid #f0eae1;
    padding-top: 12px;
  }

  .field-label {
    font-size: 14px;
    font-weight: 600;
    color: #2a2520;
  }

  .select-input {
    flex: 1;
    max-width: 220px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid #ddd5c9;
    background: #ffffff;
    padding: 0 8px;
    font-size: 13px;
    color: #2a2520;
    outline: none;
  }
}

/* 動畫 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.drawer-fade-enter-active,
.drawer-fade-leave-active {
  transition: opacity 0.25s ease;

  .shop-drawer-panel {
    transition: transform 0.25s ease;
  }
}

.drawer-fade-enter-from,
.drawer-fade-leave-to {
  opacity: 0;

  .shop-drawer-panel {
    transform: translateY(100%);
  }
}
</style>
