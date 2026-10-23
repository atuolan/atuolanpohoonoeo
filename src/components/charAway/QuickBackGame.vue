<template>
  <div class="quick-back-overlay" @click="closeGame">
    <div class="quick-back-card" @click.stop>
      <button class="quick-back-close" type="button" aria-label="關閉" @click="closeGame">×</button>

      <header class="quick-back-head">
        <h2 class="quick-back-title">{{ title }}</h2>
        <p class="quick-back-sub">{{ subtitle }}</p>
      </header>

      <template v-if="!finished">
        <!-- 狂戳 -->
        <div v-if="kind === 'tap'" class="tap-game">
          <div class="tap-avatar-wrap">
            <span
              v-for="toast in toasts"
              :key="toast.id"
              class="tap-toast"
              :style="{ left: toast.x + '%' }"
            >叮咚</span>
            <button
              class="tap-avatar"
              :class="{ 'is-wobble': wobble }"
              type="button"
              :disabled="finished"
              @pointerdown.prevent="onTapAvatar"
            >
              <img v-if="characterAvatar" class="tap-avatar-img" :src="characterAvatar" alt="" />
              <span v-else class="tap-avatar-letter">{{ avatarLetter }}</span>
            </button>
          </div>

          <p class="tap-count">已戳 {{ taps }} / {{ tapTarget }}</p>
          <div class="tap-bar">
            <div class="tap-bar-fill" :style="{ width: timeRatio * 100 + '%' }"></div>
          </div>
          <p class="tap-hint">
            {{ started ? `剩 ${secondsLeft} 秒` : '戳頭像就開始計時' }}
          </p>
        </div>

        <!-- 猜拳 -->
        <div v-else class="rps-game">
          <div class="rps-score">你 {{ playerScore }} : {{ rivalScore }} 他</div>

          <div class="rps-stage">
            <div class="rps-hand">
              <span class="rps-emoji">{{ playerMove ? moveEmoji[playerMove] : '❔' }}</span>
              <span class="rps-hand-label">你</span>
            </div>
            <span class="rps-vs">VS</span>
            <div class="rps-hand">
              <span class="rps-emoji">{{ rivalMove ? moveEmoji[rivalMove] : '❔' }}</span>
              <span class="rps-hand-label">{{ characterName }}</span>
            </div>
          </div>

          <p class="rps-msg">{{ roundMsg || '出一拳吧' }}</p>

          <div class="rps-buttons">
            <button type="button" class="rps-btn" @click="playRps('rock')">✊ 石頭</button>
            <button type="button" class="rps-btn" @click="playRps('scissors')">✌️ 剪刀</button>
            <button type="button" class="rps-btn" @click="playRps('paper')">✋ 布</button>
          </div>
        </div>
      </template>

      <div v-else class="quick-back-result">
        <p class="result-text">
          {{ won ? wonText : '沒催成功…5 分鐘後可以再試' }}
        </p>
        <button class="result-btn" type="button" @click="finishGame">好</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

type RpsMove = 'rock' | 'scissors' | 'paper'

const props = withDefaults(
  defineProps<{
    kind: 'tap' | 'rps'
    /** 暫離／睡覺／忙碌：換標題和結果文字 */
    mode?: 'away' | 'sleep' | 'busy'
    characterName: string
    characterAvatar?: string
    tapTarget?: number
  }>(),
  {
    mode: 'away',
    characterAvatar: '',
    tapTarget: 20,
  },
)

const emit = defineEmits<{
  (e: 'finish', won: boolean): void
  (e: 'close'): void
}>()

const TAP_DURATION = 10000

const finished = ref(false)
const won = ref(false)

// ---- 共用 ----
const title = computed(() =>
  props.mode === 'sleep' ? '起床重睡！' : props.mode === 'busy' ? '偷偷回我！' : '快回來！',
)

const wonText = computed(() =>
  props.mode === 'sleep'
    ? `吵醒${props.characterName}了，他會迷迷糊糊回你一句`
    : props.mode === 'busy'
      ? `${props.characterName}偷偷拿起手機了`
      : `催成功！${props.characterName} 馬上回來`,
)

const subtitle = computed(() =>
  props.kind === 'tap'
    ? `10 秒內戳${props.characterName} ${props.tapTarget} 下`
    : `跟${props.characterName}猜拳，三戰兩勝`,
)

const avatarLetter = computed(() => props.characterName.trim().charAt(0) || '？')

let tapTimer: ReturnType<typeof setTimeout> | null = null
const toastTimers: ReturnType<typeof setTimeout>[] = []

function clearTimers() {
  if (tapTimer) {
    clearInterval(tapTimer)
    clearTimeout(tapTimer)
    tapTimer = null
  }
  while (toastTimers.length) {
    const t = toastTimers.pop()
    if (t) clearTimeout(t)
  }
}

// ---- 狂戳 ----
const taps = ref(0)
const started = ref(false)
const remainMs = ref(TAP_DURATION)
const wobble = ref(false)
const toasts = ref<{ id: number; x: number }[]>([])
let toastSeed = 0
let wobbleTimer: ReturnType<typeof setTimeout> | null = null

const timeRatio = computed(() => (started.value ? remainMs.value / TAP_DURATION : 1))
const secondsLeft = computed(() => Math.max(0, Math.ceil(remainMs.value / 1000)))

function startTapTimer() {
  started.value = true
  const endAt = Date.now() + TAP_DURATION
  remainMs.value = TAP_DURATION
  tapTimer = setInterval(() => {
    const left = endAt - Date.now()
    remainMs.value = left > 0 ? left : 0
    if (left <= 0) {
      clearTimers()
      if (taps.value < props.tapTarget) endGame(false)
    }
  }, 50)
}

function triggerWobble() {
  wobble.value = false
  requestAnimationFrame(() => {
    wobble.value = true
    if (wobbleTimer) clearTimeout(wobbleTimer)
    wobbleTimer = setTimeout(() => {
      wobble.value = false
      wobbleTimer = null
    }, 260)
  })
}

function spawnToast() {
  const id = ++toastSeed
  toasts.value.push({ id, x: 30 + Math.random() * 40 })
  const timer = setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 700)
  toastTimers.push(timer)
}

function onTapAvatar() {
  if (finished.value) return
  if (!started.value) startTapTimer()
  taps.value += 1
  triggerWobble()
  spawnToast()
  if (taps.value >= props.tapTarget) endGame(true)
}

// ---- 猜拳 ----
const moveEmoji: Record<RpsMove, string> = {
  rock: '✊',
  scissors: '✌️',
  paper: '✋',
}

const playerScore = ref(0)
const rivalScore = ref(0)
const playerMove = ref<RpsMove | null>(null)
const rivalMove = ref<RpsMove | null>(null)
const roundMsg = ref('')

const beats: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  scissors: 'paper',
  paper: 'rock',
}

function playRps(move: RpsMove) {
  if (finished.value) return
  const moves: RpsMove[] = ['rock', 'scissors', 'paper']
  const rival = moves[Math.floor(Math.random() * moves.length)] ?? 'rock'

  playerMove.value = move
  rivalMove.value = rival

  if (move === rival) {
    roundMsg.value = '平手，再來！'
  } else if (beats[move] === rival) {
    playerScore.value += 1
    roundMsg.value = '你贏了這局'
  } else {
    rivalScore.value += 1
    roundMsg.value = '他贏了這局'
  }

  if (playerScore.value >= 2) endGame(true)
  else if (rivalScore.value >= 2) endGame(false)
}

// ---- 結束 ----
function endGame(result: boolean) {
  clearTimers()
  won.value = result
  finished.value = true
}

function finishGame() {
  clearTimers()
  emit('finish', won.value)
}

function closeGame() {
  clearTimers()
  emit('close')
}

onBeforeUnmount(() => {
  clearTimers()
  if (wobbleTimer) {
    clearTimeout(wobbleTimer)
    wobbleTimer = null
  }
})
</script>

<style scoped lang="scss">
.quick-back-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 16px;
  background: color-mix(in srgb, var(--color-text) 55%, transparent);
}

.quick-back-card {
  position: relative;
  box-sizing: border-box;
  width: min(320px, 100vw - 32px);
  max-height: calc(100dvh - 32px);
  overflow-y: auto;
  padding: 20px 18px 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  text-align: center;
}

.quick-back-close {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.quick-back-head {
  margin-bottom: 14px;
}

.quick-back-title {
  margin: 0 0 4px;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
}

.quick-back-sub {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text-secondary);
}

/* 狂戳 */
.tap-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.tap-avatar-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 120px;
}

.tap-avatar {
  width: 96px;
  height: 96px;
  padding: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-primary-light);
  border-radius: 50%;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 34px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.tap-avatar:disabled {
  cursor: default;
  opacity: 0.7;
}

.tap-avatar.is-wobble {
  animation: tap-wobble 250ms ease-in-out;
}

.tap-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

@keyframes tap-wobble {
  0% {
    transform: translateX(0) rotate(0deg);
  }
  25% {
    transform: translateX(-6px) rotate(-5deg);
  }
  50% {
    transform: translateX(6px) rotate(5deg);
  }
  75% {
    transform: translateX(-4px) rotate(-3deg);
  }
  100% {
    transform: translateX(0) rotate(0deg);
  }
}

.tap-toast {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  pointer-events: none;
  animation: toast-float 700ms ease-out forwards;
}

@keyframes toast-float {
  0% {
    opacity: 0;
    transform: translate(-50%, 6px) scale(0.9);
  }
  25% {
    opacity: 1;
    transform: translate(-50%, -2px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translate(-50%, -28px) scale(1);
  }
}

.tap-count {
  margin: 0;
  font-size: 14px;
  color: var(--color-text);
}

.tap-bar {
  width: 100%;
  height: 6px;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: var(--color-border);
}

.tap-bar-fill {
  height: 100%;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  transition: width 50ms linear;
}

.tap-hint {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

/* 猜拳 */
.rps-game {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.rps-score {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text-secondary);
}

.rps-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
}

.rps-hand {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.rps-emoji {
  font-size: 40px;
  line-height: 1.1;
}

.rps-hand-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.rps-vs {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-muted);
}

.rps-msg {
  margin: 0;
  min-height: 16px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.rps-buttons {
  display: flex;
  gap: 8px;
  width: 100%;
}

.rps-btn {
  flex: 1 1 0;
  padding: 10px 4px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}

.rps-btn:active {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

/* 結果 */
.quick-back-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding: 8px 0 4px;
}

.result-text {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
}

.result-btn {
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: var(--color-surface);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  touch-action: manipulation;
}
</style>

<style lang="scss">
body.is-night-mode .quick-back-card {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
}

body.is-night-mode .quick-back-overlay {
  background: color-mix(in srgb, black 65%, transparent);
}
</style>
