<script setup lang="ts">
import { usePomodoroStore } from '@/stores/pomodoro'
import { Award, Forward, X } from 'lucide-vue-next'
import { computed } from 'vue'

const emit = defineEmits<{
  close: []
  forwardToChat: [summary: string]
}>()

const pomodoroStore = usePomodoroStore()

const taskName = computed(() => pomodoroStore.activeTask?.name || '未知任務')
const totalMinutes = computed(() => pomodoroStore.elapsedMinutes)
const pokes = computed(() => pomodoroStore.pokeCount)

function handleForward() {
  const summary = `[專注記錄] 任務：${taskName.value}，時長：${totalMinutes.value} 分鐘，互動次數：${pokes.value} 次。`
  emit('forwardToChat', summary)
}

function handleClose() {
  pomodoroStore.giveUp()
  emit('close')
}
</script>

<template>
  <div class="cert-overlay" @click.self="handleClose">
    <div class="cert-window">
      <button class="close-btn" @click="handleClose">
        <X :size="20" />
      </button>

      <div class="cert-icon">
        <Award :size="40" />
      </div>

      <h2 class="cert-title">專注完成！</h2>

      <div class="cert-content">
        <div class="cert-row">
          <span class="label">任務</span>
          <span class="value">{{ taskName }}</span>
        </div>
        <div class="cert-row">
          <span class="label">時長</span>
          <span class="value highlight">{{ totalMinutes }} 分鐘</span>
        </div>
        <div class="cert-row">
          <span class="label">互動次數</span>
          <span class="value">{{ pokes }} 次</span>
        </div>
      </div>

      <div class="cert-actions">
        <button class="btn-forward" @click="handleForward">
          <Forward :size="16" /> 轉發到聊天
        </button>
        <button class="btn-done" @click="handleClose">
          完成
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.cert-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.cert-window {
  background: linear-gradient(135deg, #fefce8, #fef3c7);
  border: 2px solid #fbbf24;
  border-radius: 20px;
  padding: 28px 24px;
  width: 100%;
  max-width: 320px;
  text-align: center;
  position: relative;
  box-shadow: 0 20px 50px rgba(251, 191, 36, 0.2);
}

.close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: #92400e;
  opacity: 0.5;
  cursor: pointer;
  padding: 4px;
  &:hover { opacity: 1; }
}

.cert-icon {
  color: #f59e0b;
  margin-bottom: 12px;
}

.cert-title {
  font-size: 22px;
  font-weight: 700;
  color: #92400e;
  margin: 0 0 20px;
}

.cert-content {
  background: rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}

.cert-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;

  & + & { border-top: 1px solid rgba(0, 0, 0, 0.06); }

  .label {
    font-size: 14px;
    color: #78716c;
  }

  .value {
    font-size: 14px;
    font-weight: 500;
    color: #44403c;

    &.highlight {
      color: #f59e0b;
      font-weight: 700;
      font-size: 16px;
    }
  }
}

.cert-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;

  button {
    width: 100%;
    padding: 10px;
    border-radius: 12px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-forward {
    background: #fff;
    color: #92400e;
    border: 1px solid #fbbf24;
    &:hover { background: #fffbeb; }
  }

  .btn-done {
    background: #f59e0b;
    color: #fff;
    &:hover { opacity: 0.9; }
  }
}
</style>
