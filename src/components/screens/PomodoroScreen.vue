<script setup lang="ts">
import { useCharactersStore } from '@/stores/characters'
import { usePomodoroStore } from '@/stores/pomodoro'
import { createDefaultTaskSettings } from '@/types/pomodoro'
import { ChevronLeft, Clock, Plus, Timer, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'

const emit = defineEmits<{
  back: []
  startFocus: [taskId: string]
}>()

const pomodoroStore = usePomodoroStore()
const charactersStore = useCharactersStore()

// 新增任務表單
const showCreateModal = ref(false)
const newTaskName = ref('')
const newTaskMode = ref<'countdown' | 'stopwatch'>('countdown')
const newTaskDuration = ref(25)
const newTaskCharId = ref<string | null>(null)
const customDuration = ref(false)
const customDurationValue = ref(30)

const durationOptions = [15, 25, 45, 60]

function openCreateModal() {
  newTaskName.value = ''
  newTaskMode.value = 'countdown'
  newTaskDuration.value = 25
  newTaskCharId.value = null
  customDuration.value = false
  customDurationValue.value = 30
  showCreateModal.value = true
}

function createTask() {
  const name = newTaskName.value.trim()
  if (!name) return

  const duration = newTaskMode.value === 'countdown'
    ? (customDuration.value ? customDurationValue.value : newTaskDuration.value)
    : 0

  pomodoroStore.addTask(name, newTaskMode.value, duration, {
    ...createDefaultTaskSettings(),
    boundCharId: newTaskCharId.value,
  })

  showCreateModal.value = false
}

function deleteTask(id: string) {
  if (confirm('確定要刪除這個任務嗎？')) {
    pomodoroStore.removeTask(id)
  }
}

function startFocus(taskId: string) {
  emit('startFocus', taskId)
}

function getCharName(charId: string | null): string {
  if (!charId) return '未綁定'
  const char = charactersStore.characters.find(c => c.id === charId)
  return char ? (char.nickname || char.data.name) : '未知角色'
}
</script>

<template>
  <div class="pomodoro-screen">
    <!-- 頂部導航 -->
    <div class="header">
      <button class="back-btn" @click="emit('back')">
        <ChevronLeft class="icon" />
      </button>
      <h1 class="title">專注計時</h1>
      <button class="add-btn" @click="openCreateModal">
        <Plus class="icon" />
      </button>
    </div>

    <!-- 任務列表 -->
    <div class="content">
      <div v-if="pomodoroStore.tasks.length === 0" class="empty-state">
        <Timer class="empty-icon" :size="48" />
        <p>還沒有任務</p>
        <p class="sub">點擊右上角 + 建立一個吧</p>
      </div>

      <div v-else class="task-list">
        <div
          v-for="task in pomodoroStore.tasks"
          :key="task.id"
          class="task-card"
        >
          <div class="task-info" @click="startFocus(task.id)">
            <h3 class="task-name">{{ task.name }}</h3>
            <div class="task-meta">
              <span class="mode-badge">
                {{ task.mode === 'countdown' ? '倒計時' : '正計時' }}
              </span>
              <span v-if="task.mode === 'countdown'" class="duration">
                {{ task.durationMinutes }} 分鐘
              </span>
              <span class="char-name">{{ getCharName(task.settings.boundCharId) }}</span>
            </div>
          </div>
          <div class="task-actions">
            <button class="start-btn" @click="startFocus(task.id)">開始</button>
            <button class="delete-btn" @click.stop="deleteTask(task.id)">
              <Trash2 :size="16" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增任務 Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="modal-overlay" @click.self="showCreateModal = false">
        <div class="modal-window">
          <h2 class="modal-title">新增專注任務</h2>

          <div class="form-group">
            <label>任務名稱</label>
            <input
              v-model="newTaskName"
              type="text"
              placeholder="例如：寫報告、讀書..."
              class="form-input"
              @keyup.enter="createTask"
            />
          </div>

          <div class="form-group">
            <label>計時模式</label>
            <div class="mode-pills">
              <button
                :class="['pill', { active: newTaskMode === 'countdown' }]"
                @click="newTaskMode = 'countdown'"
              >
                <Clock :size="16" /> 倒計時
              </button>
              <button
                :class="['pill', { active: newTaskMode === 'stopwatch' }]"
                @click="newTaskMode = 'stopwatch'"
              >
                <Timer :size="16" /> 正計時
              </button>
            </div>
          </div>

          <div v-if="newTaskMode === 'countdown'" class="form-group">
            <label>時長</label>
            <div class="duration-pills">
              <button
                v-for="d in durationOptions"
                :key="d"
                :class="['pill', { active: !customDuration && newTaskDuration === d }]"
                @click="customDuration = false; newTaskDuration = d"
              >
                {{ d }} 分鐘
              </button>
              <button
                :class="['pill', { active: customDuration }]"
                @click="customDuration = true"
              >
                自訂
              </button>
            </div>
            <input
              v-if="customDuration"
              v-model.number="customDurationValue"
              type="number"
              min="1"
              max="480"
              placeholder="分鐘數"
              class="form-input custom-duration-input"
            />
          </div>

          <div class="form-group">
            <label>綁定角色（可選）</label>
            <select v-model="newTaskCharId" class="form-input">
              <option :value="null">不綁定</option>
              <option
                v-for="char in charactersStore.characters"
                :key="char.id"
                :value="char.id"
              >
                {{ char.nickname || char.data.name }}
              </option>
            </select>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="showCreateModal = false">取消</button>
            <button class="btn-confirm" :disabled="!newTaskName.trim()" @click="createTask">
              建立
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.pomodoro-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #fff);
  color: var(--color-text, #333);
}

.header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  gap: 12px;
  border-bottom: 1px solid var(--color-border, #f0f0f0);

  .back-btn, .add-btn {
    background: none;
    border: none;
    color: var(--color-text, #333);
    padding: 6px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    &:hover { background: var(--color-surface-hover, #f5f5f5); }
    .icon { width: 22px; height: 22px; }
  }

  .title {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 60%;
  color: var(--color-text-muted, #999);
  gap: 8px;

  .empty-icon { opacity: 0.3; }
  p { margin: 0; font-size: 15px; }
  .sub { font-size: 13px; opacity: 0.7; }
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.task-card {
  display: flex;
  align-items: center;
  background: var(--color-surface, #f9f9f9);
  border: 1px solid var(--color-border, #eee);
  border-radius: 14px;
  padding: 14px 16px;
  gap: 12px;
  transition: transform 0.15s, box-shadow 0.15s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px var(--color-shadow, rgba(0, 0, 0, 0.06));
  }

  .task-info {
    flex: 1;
    cursor: pointer;
    min-width: 0;
  }

  .task-name {
    font-size: 15px;
    font-weight: 500;
    margin: 0 0 6px;
    color: var(--color-text, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--color-text-secondary, #888);
  }

  .mode-badge {
    background: var(--color-primary, #6366f1);
    color: #fff;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
  }

  .task-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .start-btn {
    background: var(--color-primary, #6366f1);
    color: #fff;
    border: none;
    border-radius: 20px;
    padding: 6px 16px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
    &:hover { opacity: 0.85; }
  }

  .delete-btn {
    background: none;
    border: none;
    color: var(--color-text-muted, #999);
    padding: 6px;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    &:hover { color: var(--color-error, #ef4444); background: rgba(239, 68, 68, 0.08); }
  }
}

// Modal
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-window {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #eee);
  border-radius: 18px;
  padding: 24px;
  width: 100%;
  max-width: 360px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px;
  color: var(--color-text, #333);
}

.form-group {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #666);
    margin-bottom: 6px;
  }
}

.form-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 10px;
  font-size: 14px;
  background: var(--color-background, #f9f9f9);
  color: var(--color-text, #333);
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus { border-color: var(--color-primary, #6366f1); }
  &::placeholder { color: var(--color-text-muted, #aaa); }
}

.custom-duration-input {
  margin-top: 8px;
}

.mode-pills, .duration-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  border: 1px solid var(--color-border, #e0e0e0);
  border-radius: 20px;
  background: transparent;
  color: var(--color-text, #555);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;

  &.active {
    background: var(--color-primary, #6366f1);
    color: #fff;
    border-color: var(--color-primary, #6366f1);
  }
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;

  .btn-cancel, .btn-confirm {
    flex: 1;
    padding: 10px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    border: none;
  }

  .btn-cancel {
    background: var(--color-surface-hover, #f0f0f0);
    color: var(--color-text, #666);
  }

  .btn-confirm {
    background: var(--color-primary, #6366f1);
    color: #fff;
    &:disabled { opacity: 0.4; cursor: not-allowed; }
  }
}
</style>
