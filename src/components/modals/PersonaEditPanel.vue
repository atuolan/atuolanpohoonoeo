<script setup lang="ts">
import ExpandableTextarea from "@/components/common/ExpandableTextarea.vue";
import { ref, watch } from "vue";

interface PersonaEditProps {
  visible: boolean;
  personaName: string;
  personaAvatar: string;
  description: string;
  secrets: string;
  powerDynamic: string;
  characterName: string;
}

const props = withDefaults(defineProps<PersonaEditProps>(), {
  visible: false,
  personaName: "",
  personaAvatar: "",
  description: "",
  secrets: "",
  powerDynamic: "",
  characterName: "",
});

const emit = defineEmits<{
  (e: "close"): void;
  (
    e: "save",
    data: { description: string; secrets: string; powerDynamic: string },
  ): void;
}>();

// 本地編輯狀態
const localDescription = ref("");
const localSecrets = ref("");
const localPowerDynamic = ref("");

// 當前編輯的 tab
const activeTab = ref<"description" | "secrets" | "power">("description");

// 監聽 props 變化，同步到本地狀態
watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      localDescription.value = props.description;
      localSecrets.value = props.secrets;
      localPowerDynamic.value = props.powerDynamic;
    }
  },
  { immediate: true },
);

// 保存
function handleSave() {
  emit("save", {
    description: localDescription.value,
    secrets: localSecrets.value,
    powerDynamic: localPowerDynamic.value,
  });
}

// 關閉
function handleClose() {
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-up">
      <div
        v-if="visible"
        class="persona-edit-overlay"
        @click.self="handleClose"
      >
        <div class="persona-edit-panel">
          <!-- 標題欄 -->
          <header class="panel-header">
            <div class="header-left">
              <div class="persona-avatar-small">
                <img
                  v-if="personaAvatar"
                  :src="personaAvatar"
                  :alt="personaName"
                />
                <svg v-else viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                  />
                </svg>
              </div>
              <div class="header-info">
                <h3 class="panel-title">{{ personaName }}</h3>
                <p class="panel-subtitle">與 {{ characterName }} 的對話設定</p>
              </div>
            </div>
            <button class="close-btn" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </header>

          <!-- Tab 切換 -->
          <div class="tab-bar">
            <button
              class="tab-item"
              :class="{ active: activeTab === 'description' }"
              @click="activeTab = 'description'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
              </svg>
              <span>自我介紹</span>
            </button>
            <button
              class="tab-item"
              :class="{ active: activeTab === 'secrets' }"
              @click="activeTab = 'secrets'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                />
              </svg>
              <span>秘密</span>
            </button>
            <button
              class="tab-item"
              :class="{ active: activeTab === 'power' }"
              @click="activeTab = 'power'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                />
              </svg>
              <span>權力天平</span>
            </button>
          </div>

          <!-- 內容區 -->
          <div class="panel-content">
            <!-- 自我介紹 Tab -->
            <div v-show="activeTab === 'description'" class="tab-content">
              <div class="field-group">
                <label class="field-label">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                    />
                  </svg>
                  自我介紹
                  <span class="sync-badge">全局同步</span>
                </label>
                <p class="field-hint">
                  這是你向 AI 角色介紹自己的內容，修改後會同步到所有聊天。
                </p>
                <ExpandableTextarea
                  v-model="localDescription"
                  placeholder="介紹一下你自己..."
                  :rows="6"
                  label="自我介紹"
                />
              </div>
            </div>

            <!-- 秘密 Tab -->
            <div v-show="activeTab === 'secrets'" class="tab-content">
              <div class="field-group">
                <label class="field-label">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                    />
                  </svg>
                  你的秘密
                  <span class="local-badge">僅此聊天</span>
                </label>
                <p class="field-hint">
                  只有當你主動說出來時，{{ characterName }}
                  才會知道這些秘密。這些設定只在當前聊天有效。
                </p>
                <ExpandableTextarea
                  v-model="localSecrets"
                  placeholder="你有什麼不想讓對方知道的秘密？"
                  :rows="6"
                  label="你的秘密"
                />
              </div>
            </div>

            <!-- 權力天平 Tab -->
            <div v-show="activeTab === 'power'" class="tab-content">
              <div class="field-group">
                <label class="field-label">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"
                    />
                  </svg>
                  與 {{ characterName }} 的權力關係
                  <span class="local-badge">僅此聊天</span>
                </label>
                <p class="field-hint">
                  描述你和
                  {{ characterName }}
                  之間的權力動態，這會影響對話的態度和互動方式。這些設定只在當前聊天有效。
                </p>
                <ExpandableTextarea
                  v-model="localPowerDynamic"
                  placeholder="例如：我是他的上司 / 我們是平等的朋友 / 他是我的導師..."
                  :rows="6"
                  label="權力關係"
                />
              </div>
            </div>
          </div>

          <!-- 底部操作 -->
          <footer class="panel-footer">
            <button class="cancel-btn" @click="handleClose">取消</button>
            <button class="save-btn" @click="handleSave">保存</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.persona-edit-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.persona-edit-panel {
  width: 100%;
  max-width: 500px;
  max-height: 85vh;
  background: var(--color-surface);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.persona-avatar-small {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--color-background);
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-text-muted);
  }
}

.header-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.panel-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

.close-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-surface-hover);
  }
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid var(--color-border);
  padding: 0 12px;
}

.tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    color: var(--color-text);
  }

  &.active {
    color: var(--color-primary);
    border-bottom-color: var(--color-primary);
  }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);

  svg {
    width: 18px;
    height: 18px;
    color: var(--color-text-secondary);
  }
}

.sync-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 500;
}

.local-badge {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 179, 71, 0.2);
  color: #e69500;
  font-weight: 500;
}

.field-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.5;
}

.field-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text);
  font-size: 14px;
  line-height: 1.6;
  resize: vertical;
  min-height: 120px;
  font-family: inherit;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.panel-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border);
}

.cancel-btn,
.save-btn {
  flex: 1;
  padding: 12px;
  border-radius: var(--radius-lg);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.cancel-btn {
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-surface-hover);
  }
}

.save-btn {
  background: var(--color-primary);
  border: none;
  color: white;

  &:hover {
    filter: brightness(1.1);
  }
}

// 動畫
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;

  .persona-edit-panel {
    transform: translateY(100%);
  }
}

.slide-up-enter-to,
.slide-up-leave-from {
  opacity: 1;

  .persona-edit-panel {
    transform: translateY(0);
  }
}
</style>
