<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from 'vue'
import { Dumbbell, Pause, Play, RotateCcw, SkipForward, MessageCircle } from 'lucide-vue-next'
import { useFitnessStore } from '@/stores/fitness'
import { useCharactersStore } from '@/stores/characters'
import { useSettingsStore } from '@/stores/settings'
import { getRandomFitnessMessage } from '@/data/fitnessPrompts'
import { OpenAICompatibleClient } from '@/api/OpenAICompatible'
import type { CharacterFitnessConfig } from '@/types/fitness'

// 單項運動設定
interface ExerciseSetup {
  id: string
  name: string
  type: string
  sets: number
  workTime: number
  restTime: number
}

// 訓練計畫
interface WorkoutPlan {
  exercises: ExerciseSetup[]
  enableAI: boolean
}

const props = defineProps<{
  partnerId?: string
  plan?: WorkoutPlan
}>()

const emit = defineEmits<{
  (e: 'complete', data: { duration: number; exercises: ExerciseSetup[] }): void
  (e: 'back'): void
}>()

const fitnessStore = useFitnessStore()
const charactersStore = useCharactersStore()
const settingsStore = useSettingsStore()

// 計時器狀態
type Phase = 'idle' | 'working' | 'resting' | 'exercise-complete' | 'all-complete'
const phase = ref<Phase>('idle')
const timeLeft = ref(0)
const isRunning = ref(false)
const currentExerciseIndex = ref(0)
const currentSet = ref(1)

// AI 回應
const aiMessage = ref('')
const isLoadingAI = ref(false)

// 計時器 interval
let intervalId: number | null = null

// 角色訊息（本地）
const characterMessage = ref('')
const partnerConfig = ref<CharacterFitnessConfig | null>(null)

// 取得夥伴角色
const partner = computed(() => {
  if (!props.partnerId) return null
  return charactersStore.characters.find(c => c.id === props.partnerId)
})

// 當前運動
const currentExercise = computed(() => {
  if (!props.plan || props.plan.exercises.length === 0) return null
  return props.plan.exercises[currentExerciseIndex.value]
})

// 總運動數
const totalExercises = computed(() => props.plan?.exercises.length || 0)

// 取得夥伴設定
watch(() => props.partnerId, (id) => {
  if (id) {
    partnerConfig.value = fitnessStore.getCharacterFitnessConfig(id) || null
  } else {
    partnerConfig.value = null
  }
}, { immediate: true })

// 格式化時間
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

// 進度百分比
const progress = computed(() => {
  if (!currentExercise.value || phase.value === 'idle' || phase.value === 'all-complete') return 0
  
  const total = phase.value === 'working' 
    ? currentExercise.value.workTime 
    : currentExercise.value.restTime
  
  return ((total - timeLeft.value) / total) * 100
})

// 顯示本地角色訊息
function showLocalMessage(type: 'start' | 'rest' | 'setComplete' | 'workoutComplete') {
  const style = partnerConfig.value?.style || 'gentle'
  characterMessage.value = getRandomFitnessMessage(type, style)
}

// 調用 AI 生成鼓勵訊息
async function fetchAIEncouragement() {
  if (!props.plan?.enableAI || !partner.value || !currentExercise.value) return
  
  isLoadingAI.value = true
  aiMessage.value = ''
  
  try {
    const exercise = currentExercise.value
    const userMessage = `（我正在做${exercise.name}，這是第 ${currentSet.value}/${exercise.sets} 組，請用簡短的一兩句話鼓勵我完成這組訓練！）`
    
    // 取得 API 設定
    const currentProfile = settingsStore.currentProfile
    if (!currentProfile || !settingsStore.hasValidConfig) {
      console.warn('[Fitness] 沒有可用的 API 設定')
      showLocalMessage('start')
      return
    }
    
    // 建立 API 客戶端
    const client = new OpenAICompatibleClient({
      provider: currentProfile.api.provider,
      endpoint: currentProfile.api.endpoint,
      apiKey: currentProfile.api.apiKey,
      model: currentProfile.api.model,
    })
    
    // 建立簡單的訊息
    const messages = [
      {
        role: 'system' as const,
        content: `你是 ${partner.value.nickname || partner.value.data?.name}，正在陪伴用戶健身訓練。用你的性格特點給予簡短的鼓勵，不要太長，1-2句話即可。`,
      },
      {
        role: 'user' as const,
        content: userMessage,
      },
    ]
    
    // 調用 API
    const result = await client.generate({
      messages,
      settings: {
        maxContextLength: 2000,
        maxResponseLength: 100,
        temperature: 0.8,
        topP: 1,
        topK: 0,
        frequencyPenalty: 0,
        presencePenalty: 0,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      apiSettings: {
        provider: currentProfile.api.provider,
        endpoint: currentProfile.api.endpoint,
        apiKey: currentProfile.api.apiKey,
        model: currentProfile.api.model,
      },
    })
    
    if (result.content) {
      aiMessage.value = result.content
    } else {
      showLocalMessage('start')
    }
  } catch (error) {
    console.error('[Fitness] AI 鼓勵生成失敗:', error)
    showLocalMessage('start')
  } finally {
    isLoadingAI.value = false
  }
}

// 開始訓練
function startWorkout() {
  if (!currentExercise.value) return
  
  currentExerciseIndex.value = 0
  currentSet.value = 1
  startSet()
}

// 開始一組
function startSet() {
  if (!currentExercise.value) return
  
  phase.value = 'working'
  timeLeft.value = currentExercise.value.workTime
  isRunning.value = true
  
  // 顯示訊息
  if (props.plan?.enableAI) {
    fetchAIEncouragement()
  } else {
    showLocalMessage('start')
  }
  
  startInterval()
}

// 開始計時
function startInterval() {
  if (intervalId) clearInterval(intervalId)
  
  intervalId = window.setInterval(() => {
    if (!isRunning.value) return
    
    if (timeLeft.value > 0) {
      timeLeft.value--
    } else {
      handleTimeUp()
    }
  }, 1000)
}

// 時間到
function handleTimeUp() {
  if (!currentExercise.value) return
  
  if (phase.value === 'working') {
    // 完成一組
    if (currentSet.value >= currentExercise.value.sets) {
      // 這個運動的所有組數完成
      handleExerciseComplete()
    } else {
      // 進入休息
      phase.value = 'resting'
      timeLeft.value = currentExercise.value.restTime
      showLocalMessage('rest')
    }
  } else if (phase.value === 'resting') {
    // 休息結束，開始下一組
    currentSet.value++
    startSet()
  }
}

// 完成一個運動
function handleExerciseComplete() {
  if (currentExerciseIndex.value >= totalExercises.value - 1) {
    // 所有運動完成
    handleAllComplete()
  } else {
    // 顯示運動完成提示，準備下一個
    phase.value = 'exercise-complete'
    isRunning.value = false
    stopInterval()
    showLocalMessage('setComplete')
  }
}

// 進入下一個運動
function nextExercise() {
  currentExerciseIndex.value++
  currentSet.value = 1
  startSet()
}

// 所有訓練完成
function handleAllComplete() {
  phase.value = 'all-complete'
  isRunning.value = false
  stopInterval()
  showLocalMessage('workoutComplete')
  
  if (props.plan) {
    emit('complete', {
      duration: calculateTotalDuration(),
      exercises: props.plan.exercises,
    })
  }
}

// 計算總時長
function calculateTotalDuration(): number {
  if (!props.plan) return 0
  let total = 0
  for (const ex of props.plan.exercises) {
    total += ex.sets * ex.workTime + (ex.sets - 1) * ex.restTime
  }
  return total
}

function stopInterval() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// 暫停/繼續
function togglePause() {
  isRunning.value = !isRunning.value
}

// 跳過當前
function skip() {
  if (phase.value === 'working') {
    handleTimeUp()
  } else if (phase.value === 'resting') {
    currentSet.value++
    startSet()
  }
}

// 重置
function reset() {
  stopInterval()
  phase.value = 'idle'
  timeLeft.value = 0
  currentExerciseIndex.value = 0
  currentSet.value = 1
  isRunning.value = false
  characterMessage.value = ''
  aiMessage.value = ''
}

onUnmounted(() => {
  stopInterval()
})
</script>

<template>
  <div class="workout-timer">
    <!-- 夥伴區域 -->
    <div v-if="partner" class="partner-section">
      <div class="partner-avatar">
        <img v-if="partner.avatar" :src="partner.avatar" :alt="partner.nickname" />
        <Dumbbell v-else :size="32" stroke-width="2.5" />
      </div>
      <div class="partner-info">
        <span class="partner-name">{{ partner.nickname || partner.data?.name }}</span>
        <span class="partner-role">
          {{ partnerConfig?.role === 'coach' ? '教練' : 
             partnerConfig?.role === 'cheerleader' ? '啦啦隊' : '訓練夥伴' }}
        </span>
      </div>
    </div>

    <!-- AI/角色訊息 -->
    <div v-if="aiMessage || characterMessage" class="character-message">
      <MessageCircle v-if="aiMessage" :size="16" stroke-width="2.5" class="ai-icon" />
      <p>「{{ aiMessage || characterMessage }}」</p>
    </div>
    
    <div v-if="isLoadingAI" class="loading-message">
      <span class="loading-dots">思考中...</span>
    </div>

    <!-- 當前運動資訊 -->
    <div v-if="currentExercise && phase !== 'idle'" class="current-exercise">
      <span class="exercise-progress">{{ currentExerciseIndex + 1 }} / {{ totalExercises }}</span>
      <span class="exercise-name">{{ currentExercise.name }}</span>
    </div>

    <!-- 計時器主體 -->
    <div class="timer-main">
      <!-- 狀態指示 -->
      <div 
        class="phase-indicator" 
        :class="{ 
          working: phase === 'working',
          resting: phase === 'resting',
          completed: phase === 'all-complete' || phase === 'exercise-complete'
        }"
      >
        <Dumbbell :size="16" stroke-width="2.5" />
        <span>
          {{ phase === 'idle' ? '準備開始' :
             phase === 'working' ? '訓練中' :
             phase === 'resting' ? '休息中' :
             phase === 'exercise-complete' ? '運動完成' : '全部完成！' }}
        </span>
      </div>

      <!-- 圓形進度 -->
      <div class="timer-circle">
        <svg class="progress-ring" viewBox="0 0 120 120">
          <circle 
            class="progress-bg" 
            cx="60" cy="60" r="52"
            fill="none"
            stroke-width="8"
          />
          <circle 
            class="progress-bar" 
            :class="{ resting: phase === 'resting' }"
            cx="60" cy="60" r="52"
            fill="none"
            stroke-width="8"
            :stroke-dasharray="326.7"
            :stroke-dashoffset="326.7 - (326.7 * progress / 100)"
          />
        </svg>
        <div class="timer-display">
          <span class="time">{{ formatTime(timeLeft) }}</span>
          <span v-if="currentExercise && phase !== 'idle'" class="sets">
            第 {{ currentSet }} / {{ currentExercise.sets }} 組
          </span>
        </div>
      </div>

      <!-- 控制按鈕 -->
      <div class="controls">
        <template v-if="phase === 'idle'">
          <button class="start-btn" @click="startWorkout">
            <Play :size="24" stroke-width="2.5" />
            <span>開始訓練</span>
          </button>
        </template>
        
        <template v-else-if="phase === 'exercise-complete'">
          <button class="start-btn" @click="nextExercise">
            <SkipForward :size="24" stroke-width="2.5" />
            <span>下一個運動</span>
          </button>
        </template>
        
        <template v-else-if="phase !== 'all-complete'">
          <button class="control-btn reset" @click="reset">
            <RotateCcw :size="20" stroke-width="2.5" />
          </button>
          <button 
            class="control-btn play" 
            :class="{ pause: isRunning }"
            @click="togglePause"
          >
            <Pause v-if="isRunning" :size="28" stroke-width="2.5" />
            <Play v-else :size="28" stroke-width="2.5" />
          </button>
          <button class="control-btn skip" @click="skip">
            <SkipForward :size="20" stroke-width="2.5" />
          </button>
        </template>
        
        <template v-else>
          <button class="start-btn" @click="emit('back')">
            <RotateCcw :size="24" stroke-width="2.5" />
            <span>返回</span>
          </button>
        </template>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$text-main: #1a1a1a;
$text-sec: #6b7280;
$accent-color: #fb923c;
$card-bg: #ffffff;
$green-accent: #7dd3a8;
$orange-accent: #f97316;
$red-accent: #ef4444;

.workout-timer {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.partner-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: $card-bg;
  border-radius: 20px;
  border: 3px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
}

.partner-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  background: #f0fdf4;
  border: 3px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $green-accent;
  flex-shrink: 0;
  
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.partner-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.partner-name {
  font-weight: 900;
  font-size: 18px;
  color: $text-main;
}

.partner-role {
  font-size: 14px;
  font-weight: 800;
  color: $text-sec;
}

.character-message {
  padding: 16px 20px;
  background: $card-bg;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  position: relative;
  
  &::before {
    content: '';
    position: absolute;
    top: -12px;
    left: 40px;
    border-width: 0 12px 12px 12px;
    border-style: solid;
    border-color: transparent transparent $frame-border transparent;
  }
  &::after {
    content: '';
    position: absolute;
    top: -6px;
    left: 43px;
    border-width: 0 9px 9px 9px;
    border-style: solid;
    border-color: transparent transparent $card-bg transparent;
  }
  
  .ai-icon {
    color: $accent-color;
    flex-shrink: 0;
    margin-top: 2px;
  }
  
  p {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: $text-main;
    line-height: 1.5;
  }
}

.loading-message {
  padding: 16px;
  text-align: center;
  background: $card-bg;
  border-radius: 20px;
  border: 3px dashed $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  
  .loading-dots {
    color: $text-main;
    font-weight: 800;
    font-size: 15px;
  }
}

.current-exercise {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px;
  
  .exercise-progress {
    font-size: 14px;
    font-weight: 900;
    padding: 6px 12px;
    background: $card-bg;
    border: 2px solid $frame-border;
    box-shadow: 2px 2px 0 $frame-border;
    border-radius: 12px;
    color: $text-main;
  }
  
  .exercise-name {
    font-size: 20px;
    font-weight: 900;
    color: $text-main;
  }
}

.timer-main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  background: $card-bg;
  border-radius: 32px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 32px 20px;
  margin-top: 8px;
}

.phase-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: #f1f5f9;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
  color: $text-main;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 800;
  
  &.working {
    background: #ffedd5;
    color: $orange-accent;
  }
  
  &.resting {
    background: #f0fdf4;
    color: #16a34a;
  }
  
  &.completed {
    background: #dbeafe;
    color: #2563eb;
  }
}

.timer-circle {
  position: relative;
  width: 200px;
  height: 200px;
  
  .progress-ring {
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }
  
  .progress-bg {
    stroke: rgba(0, 0, 0, 0.05);
  }
  
  .progress-bar {
    stroke: $red-accent;
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
    
    &.resting {
      stroke: #22c55e;
    }
  }
  
  .timer-display {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: transparent;
    border-radius: 50%;
    
    .time {
      font-size: 48px;
      font-weight: 900;
      color: $text-main;
      font-variant-numeric: tabular-nums;
      text-shadow: 2px 2px 0 #fff;
    }
    
    .sets {
      font-size: 15px;
      font-weight: 800;
      color: $text-sec;
      margin-top: 4px;
      background: $card-bg;
      padding: 4px 12px;
      border: 2px solid $frame-border;
      border-radius: 12px;
      box-shadow: 2px 2px 0 $frame-border;
    }
  }
}

.controls {
  display: flex;
  align-items: center;
  gap: 20px;
}

.start-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 32px;
  background: $accent-color;
  color: white;
  border-radius: 24px;
  border: 3px solid $frame-border;
  box-shadow: 4px 4px 0 $frame-border;
  font-weight: 900;
  font-size: 18px;
  transition: transform 0.1s, box-shadow 0.1s;
  cursor: pointer;
  
  &:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.control-btn {
  border-radius: 50%;
  border: 3px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s, box-shadow 0.1s;
  cursor: pointer;
  
  &:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 $frame-border;
  }
  
  &.reset, &.skip {
    width: 56px;
    height: 56px;
    background: $card-bg;
    color: $text-main;
  }
  
  &.play {
    width: 72px;
    height: 72px;
    background: $red-accent;
    color: white;
    box-shadow: 4px 4px 0 $frame-border;
    
    &:active {
      transform: translate(4px, 4px);
      box-shadow: 0 0 0 $frame-border;
    }
    
    &.pause {
      background: #e2e8f0;
      color: $text-main;
    }
  }
}
</style>
