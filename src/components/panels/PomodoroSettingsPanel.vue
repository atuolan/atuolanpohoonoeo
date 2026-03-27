<script setup lang="ts">
import { useCharactersStore } from '@/stores/characters'
import { usePomodoroStore } from '@/stores/pomodoro'
import { useUserStore } from '@/stores/user'
import { X } from 'lucide-vue-next'
import { ref } from 'vue'

const emit = defineEmits<{ close: [] }>()

const pomodoroStore = usePomodoroStore()
const charactersStore = useCharactersStore()
const userStore = useUserStore()

const task = pomodoroStore.activeTask
if (!task) {
  emit('close')
}

// 本地表單狀態
const boundCharId = ref(task?.settings.boundCharId ?? null)
const userPersonaId = ref(task?.settings.userPersonaId ?? null)
const encouragementMin = ref(task?.settings.encouragementIntervalMin ?? 25)
const pokeLimit = ref(task?.settings.pokeLimit ?? 5)
const focusBackground = ref(task?.settings.focusBackground ?? '')
const timerColor = ref(task?.settings.timerColor ?? '')
const textColor = ref(task?.settings.textColor ?? '')
const buttonColor = ref(task?.settings.buttonColor ?? '')

function handleBgUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    focusBackground.value = reader.result as string
  }
  reader.readAsDataURL(file)
}

function clearBg() {
  focusBackground.value = ''
}

function save() {
  if (!task) return
  pomodoroStore.updateTaskSettings(task.id, {
    boundCharId: boundCharId.value,
    userPersonaId: userPersonaId.value,
    encouragementIntervalMin: encouragementMin.value,
    pokeLimit: pokeLimit.value,
    focusBackground: focusBackground.value,
    timerColor: timerColor.value,
    textColor: textColor.value,
    buttonColor: buttonColor.value,
  })
  emit('close')
}
</script>

<template>
  <div class="panel-overlay" @click.self="emit('close')">
    <div class="panel">
      <div class="panel-header">
        <h3>專注設定</h3>
        <button class="close-btn" @click="emit('close')">
          <X :size="20" />
        </button>
      </div>

      <div class="panel-body">
        <div class="form-group">
          <label>綁定角色</label>
          <select v-model="boundCharId" class="form-input">
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

        <div class="form-group">
          <label>使用者身分</label>
          <select v-model="userPersonaId" class="form-input">
            <option :value="null">預設（{{ userStore.currentName }}）</option>
            <option
              v-for="persona in userStore.personas"
              :key="persona.id"
              :value="persona.id"
            >
              {{ persona.name }}
            </option>
          </select>
          <p class="hint">AI 角色會用這個身分的名字和描述來稱呼你</p>
        </div>

        <div class="form-group">
          <label>AI 鼓勵間隔（分鐘）</label>
          <input
            v-model.number="encouragementMin"
            type="number"
            min="1"
            max="120"
            class="form-input"
          />
          <p class="hint">每隔多少分鐘 AI 角色會自動發送鼓勵訊息</p>
        </div>

        <div class="form-group">
          <label>戳頭像次數上限</label>
          <input
            v-model.number="pokeLimit"
            type="number"
            min="1"
            max="50"
            class="form-input"
          />
          <p class="hint">超過上限後不再呼叫 AI 回覆</p>
        </div>

        <div class="form-group">
          <label>專注背景圖</label>
          <div class="bg-preview-row">
            <div
              class="bg-preview"
              :style="focusBackground ? { backgroundImage: `url(${focusBackground})` } : {}"
            >
              <span v-if="!focusBackground" class="bg-placeholder">預設</span>
            </div>
            <div class="bg-actions">
              <label class="btn-upload">
                上傳圖片
                <input type="file" accept="image/*" hidden @change="handleBgUpload" />
              </label>
              <button v-if="focusBackground" class="btn-clear" @click="clearBg">清除</button>
            </div>
          </div>
          <p class="hint">不設定則使用預設背景</p>
        </div>

        <div class="form-group">
          <label>顏色自訂</label>
          <div class="color-row">
            <div class="color-item">
              <span>計時器</span>
              <input type="color" v-model="timerColor" class="color-input" />
              <button v-if="timerColor" class="color-clear" @click="timerColor = ''">✕</button>
            </div>
            <div class="color-item">
              <span>文字</span>
              <input type="color" v-model="textColor" class="color-input" />
              <button v-if="textColor" class="color-clear" @click="textColor = ''">✕</button>
            </div>
            <div class="color-item">
              <span>按鈕</span>
              <input type="color" v-model="buttonColor" class="color-input" />
              <button v-if="buttonColor" class="color-clear" @click="buttonColor = ''">✕</button>
            </div>
          </div>
          <p class="hint">不設定則跟隨主題色，點 ✕ 可重置</p>
        </div>
      </div>

      <div class="panel-footer">
        <button class="btn-save" @click="save">儲存</button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.panel {
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.1);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border, #eee);

  h3 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text, #333);
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-muted, #999);
    padding: 4px;
    cursor: pointer;
    display: flex;
    border-radius: 50%;
    &:hover { background: var(--color-surface-hover, #f5f5f5); }
  }
}

.panel-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-group {
  margin-bottom: 20px;

  label {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
    margin-bottom: 6px;
  }

  .hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--color-text-muted, #aaa);
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
}

.panel-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #eee);

  .btn-save {
    width: 100%;
    padding: 12px;
    background: var(--color-primary, #6366f1);
    color: #fff;
    border: none;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s;
    &:hover { opacity: 0.9; }
  }
}

.bg-preview-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bg-preview {
  width: 64px;
  height: 64px;
  border-radius: 10px;
  background: var(--color-surface-hover, #f0f0f0);
  background-size: cover;
  background-position: center;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--color-border, #e0e0e0);

  .bg-placeholder {
    font-size: 11px;
    color: var(--color-text-muted, #aaa);
  }
}

.bg-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .btn-upload, .btn-clear {
    padding: 6px 12px;
    border-radius: 8px;
    font-size: 12px;
    cursor: pointer;
    text-align: center;
  }

  .btn-upload {
    background: var(--color-primary, #6366f1);
    color: #fff;
    border: none;
  }

  .btn-clear {
    background: none;
    border: 1px solid var(--color-border, #ddd);
    color: var(--color-text-secondary, #888);
  }
}

.color-row {
  display: flex;
  gap: 16px;
}

.color-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  position: relative;

  span {
    font-size: 11px;
    color: var(--color-text-secondary, #888);
  }

  .color-input {
    width: 36px;
    height: 36px;
    border: 2px solid var(--color-border, #ddd);
    border-radius: 8px;
    padding: 2px;
    cursor: pointer;
    background: none;

    &::-webkit-color-swatch-wrapper { padding: 0; }
    &::-webkit-color-swatch { border: none; border-radius: 5px; }
  }

  .color-clear {
    position: absolute;
    top: 14px;
    right: -6px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--color-error, #ef4444);
    color: #fff;
    border: none;
    font-size: 9px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }
}
</style>
