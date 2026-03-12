<template>
  <Teleport to="body">
    <div class="modal-overlay" @click.self="close">
      <div class="proactive-settings-modal">
        <div class="modal-header">
          <h2>主動發訊息設置</h2>
          <button class="close-btn" @click="close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="modal-body">
          <!-- 主開關 -->
          <div class="setting-item">
            <div class="setting-label">
              <i class="fas fa-bell"></i>
              <span>啟用主動發訊息</span>
            </div>
            <label class="switch">
              <input
                type="checkbox"
                v-model="localEnabled"
                @change="handleToggle"
              />
              <span class="slider"></span>
            </label>
          </div>

          <div v-if="localEnabled" class="settings-content">
            <!-- 時間間隔 -->
            <div class="setting-section">
              <h3>發送間隔</h3>

              <!-- 預設選項 -->
              <div class="interval-presets">
                <button
                  v-for="preset in intervalPresets"
                  :key="preset.value"
                  :class="[
                    'preset-btn',
                    { active: settings?.intervalMinutes === preset.value },
                  ]"
                  @click="setInterval(preset.value)"
                >
                  {{ preset.label }}
                </button>
              </div>

              <!-- 自定義輸入 -->
              <div class="custom-interval">
                <label>自定義間隔（分鐘）</label>
                <input
                  type="number"
                  v-model.number="customInterval"
                  min="1"
                  @change="handleCustomInterval"
                  placeholder="輸入分鐘數"
                />
              </div>

              <div class="interval-display">
                當前間隔：{{ formatInterval(settings?.intervalMinutes || 180) }}
              </div>
            </div>

            <!-- 夜間免打擾 -->
            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">
                  <i class="fas fa-moon"></i>
                  <span>夜間免打擾</span>
                </div>
                <label class="switch">
                  <input
                    type="checkbox"
                    v-model="dndEnabled"
                    @change="handleDndToggle"
                  />
                  <span class="slider"></span>
                </label>
              </div>

              <div v-if="dndEnabled" class="time-range">
                <div class="time-input">
                  <label>開始時間</label>
                  <input
                    type="time"
                    v-model="dndStart"
                    @change="handleDndTimeChange"
                  />
                </div>
                <div class="time-separator">-</div>
                <div class="time-input">
                  <label>結束時間</label>
                  <input
                    type="time"
                    v-model="dndEnd"
                    @change="handleDndTimeChange"
                  />
                </div>
              </div>
            </div>

            <!-- 通知設置 -->
            <div class="setting-section">
              <div class="setting-item">
                <div class="setting-label">
                  <i class="fas fa-comment-dots"></i>
                  <span>顯示通知</span>
                </div>
                <label class="switch">
                  <input
                    type="checkbox"
                    v-model="showNotification"
                    @change="handleNotificationToggle"
                  />
                  <span class="slider"></span>
                </label>
              </div>
              <p class="setting-hint">收到主動訊息時顯示系統通知</p>
            </div>

            <!-- 預覽資訊 -->
            <div class="setting-section preview-section">
              <h3>預覽</h3>
              <div class="preview-info">
                <div class="preview-item">
                  <i class="fas fa-clock"></i>
                  <span>下次發送：{{ nextTimeText }}</span>
                </div>
                <div class="preview-item">
                  <i class="fas fa-info-circle"></i>
                  <span>{{ getStatusText() }}</span>
                </div>
              </div>
            </div>

            <!-- 測試按鈕 -->
            <div class="setting-section">
              <button class="test-btn" @click="handleTest" :disabled="testing">
                <i class="fas fa-paper-plane"></i>
                {{ testing ? "發送中..." : "立即測試" }}
              </button>
              <p class="setting-hint">立即觸發一次主動發訊息（用於測試）</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useProactiveMessage } from "@/composables/useProactiveMessage";
import { ref, watch } from "vue";

interface Props {
  characterId: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  close: [];
}>();

const {
  settings,
  intervalPresets,
  nextTimeText,
  isEnabled,
  toggleEnabled,
  setInterval,
  setDoNotDisturb,
  setShowNotification,
  triggerNow,
  formatInterval,
} = useProactiveMessage(props.characterId);

// 本地狀態
const localEnabled = ref(isEnabled.value);
const customInterval = ref<number>();
const dndEnabled = ref(settings.value?.doNotDisturbEnabled || false);
const dndStart = ref(settings.value?.doNotDisturbStart || "22:00");
const dndEnd = ref(settings.value?.doNotDisturbEnd || "08:00");
const showNotification = ref(settings.value?.showNotification ?? true);
const testing = ref(false);

// 監聽設置變化
watch(
  () => settings.value,
  (newSettings) => {
    if (newSettings) {
      localEnabled.value = newSettings.enabled;
      dndEnabled.value = newSettings.doNotDisturbEnabled;
      dndStart.value = newSettings.doNotDisturbStart;
      dndEnd.value = newSettings.doNotDisturbEnd;
      showNotification.value = newSettings.showNotification;
    }
  },
  { deep: true },
);

const handleToggle = () => {
  toggleEnabled();
};

const handleCustomInterval = () => {
  if (customInterval.value && customInterval.value > 0) {
    setInterval(customInterval.value);
  }
};

const handleDndToggle = () => {
  setDoNotDisturb(dndEnabled.value, dndStart.value, dndEnd.value);
};

const handleDndTimeChange = () => {
  setDoNotDisturb(dndEnabled.value, dndStart.value, dndEnd.value);
};

const handleNotificationToggle = () => {
  setShowNotification(showNotification.value);
};

const handleTest = async () => {
  testing.value = true;
  try {
    await triggerNow();
    alert("測試訊息已發送！請查看聊天列表。");
  } catch (error) {
    console.error("測試失敗:", error);
    alert("測試失敗，請查看控制台");
  } finally {
    testing.value = false;
  }
};

const getStatusText = () => {
  if (!settings.value?.enabled) return "未啟用";
  if (dndEnabled.value) {
    return `夜間免打擾：${dndStart.value} - ${dndEnd.value}`;
  }
  return "正常運作中";
};

const close = () => {
  emit("close");
};
</script>

<style scoped lang="scss">
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: env(safe-area-inset-top, 20px) 20px var(--safe-bottom, 20px);
}

.proactive-settings-modal {
  background: var(--bg-primary, #fff);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: calc(
    100dvh - env(safe-area-inset-top, 0px) - var(--safe-bottom, 0px) - 40px
  );
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary, #333);
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 20px;
    color: var(--text-secondary, #666);
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    transition: all 0.2s;

    &:hover {
      background: var(--bg-hover, #f5f5f5);
      color: var(--text-primary, #333);
    }
  }
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;

  .setting-label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    color: var(--text-primary, #333);

    i {
      color: var(--primary-color, #007aff);
      width: 20px;
    }
  }
}

.setting-section {
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color, #e0e0e0);

  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary, #333);
  }
}

.settings-content {
  margin-top: 16px;
}

.interval-presets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 8px;
  margin-bottom: 16px;

  .preset-btn {
    padding: 10px 16px;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #333);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--bg-hover, #e8e8e8);
    }

    &.active {
      background: var(--primary-color, #007aff);
      color: white;
      border-color: var(--primary-color, #007aff);
    }
  }
}

.custom-interval {
  display: flex;
  flex-direction: column;
  gap: 8px;

  label {
    font-size: 14px;
    color: var(--text-secondary, #666);
  }

  input {
    padding: 10px 12px;
    border: 1px solid var(--border-color, #e0e0e0);
    border-radius: 8px;
    font-size: 14px;
    background: var(--bg-secondary, #f5f5f5);
    color: var(--text-primary, #333);

    &:focus {
      outline: none;
      border-color: var(--primary-color, #007aff);
    }
  }
}

.interval-display {
  margin-top: 12px;
  padding: 10px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary, #666);
  text-align: center;
}

.time-range {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;

  .time-input {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;

    label {
      font-size: 13px;
      color: var(--text-secondary, #666);
    }

    input {
      padding: 10px 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      font-size: 14px;
      background: var(--bg-secondary, #f5f5f5);
      color: var(--text-primary, #333);

      &:focus {
        outline: none;
        border-color: var(--primary-color, #007aff);
      }
    }
  }

  .time-separator {
    margin-top: 24px;
    font-size: 16px;
    color: var(--text-secondary, #666);
  }
}

.setting-hint {
  margin: 8px 0 0 0;
  font-size: 13px;
  color: var(--text-secondary, #999);
}

.preview-section {
  background: var(--bg-secondary, #f5f5f5);
  padding: 16px;
  border-radius: 12px;
  border: none;

  .preview-info {
    display: flex;
    flex-direction: column;
    gap: 12px;

    .preview-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--text-primary, #333);

      i {
        color: var(--primary-color, #007aff);
        width: 20px;
      }
    }
  }
}

.test-btn {
  width: 100%;
  padding: 12px;
  background: var(--primary-color, #007aff);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    opacity: 0.9;
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* Switch 開關樣式 */
.switch {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 28px;

  input {
    opacity: 0;
    width: 0;
    height: 0;

    &:checked + .slider {
      background-color: var(--primary-color, #007aff);

      &:before {
        transform: translateX(20px);
      }
    }
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.3s;
    border-radius: 28px;

    &:before {
      position: absolute;
      content: "";
      height: 20px;
      width: 20px;
      left: 4px;
      bottom: 4px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }
}
</style>
