<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { X, Check, Dumbbell, User, Loader2 } from 'lucide-vue-next'
import { useCharactersStore } from '@/stores/characters'
import { useFitnessStore } from '@/stores/fitness'
import type { CharacterFitnessConfig } from '@/types/fitness'

const props = defineProps<{
  visible: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', characterId: string): void
}>()

const charactersStore = useCharactersStore()
const fitnessStore = useFitnessStore()

// 載入狀態
const isLoading = ref(false)

// 當前選中的角色 ID
const selectedId = ref<string | null>(fitnessStore.settings.defaultPartnerId || null)

// 角色風格設定
const selectedRole = ref<'coach' | 'partner' | 'cheerleader'>('partner')
const selectedStyle = ref<'strict' | 'gentle' | 'playful'>('gentle')

// 所有角色列表
const characters = computed(() => charactersStore.characters)

// 當彈窗顯示時，確保角色已載入
watch(() => props.visible, async (visible) => {
  if (visible && characters.value.length === 0) {
    isLoading.value = true
    try {
      await charactersStore.loadCharacters()
    } finally {
      isLoading.value = false
    }
  }
}, { immediate: true })

// 當選中角色變化時，載入其健身設定
watch(selectedId, (id) => {
  if (id) {
    const config = fitnessStore.getCharacterFitnessConfig(id)
    if (config) {
      selectedRole.value = config.role
      selectedStyle.value = config.style
    } else {
      // 預設值
      selectedRole.value = 'partner'
      selectedStyle.value = 'gentle'
    }
  }
})

// 確認選擇
function confirmSelect() {
  if (!selectedId.value) return
  
  // 儲存角色的健身設定
  const config: CharacterFitnessConfig = {
    enabled: true,
    role: selectedRole.value,
    style: selectedStyle.value,
  }
  fitnessStore.setCharacterFitnessConfig(selectedId.value, config)
  
  // 設為預設夥伴
  fitnessStore.updateSettings({ defaultPartnerId: selectedId.value })
  
  emit('select', selectedId.value)
  emit('close')
}

// 角色類型標籤
const roleLabels = {
  coach: '教練',
  partner: '夥伴',
  cheerleader: '啦啦隊',
}

// 風格標籤
const styleLabels = {
  strict: '嚴格',
  gentle: '溫柔',
  playful: '俏皮',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="emit('close')">
        <div class="modal-container">
          <!-- 標題 -->
          <header class="modal-header">
            <h2>
              <Dumbbell :size="20" />
              選擇訓練夥伴
            </h2>
            <button class="close-btn" @click="emit('close')">
              <X :size="20" />
            </button>
          </header>

          <!-- 角色列表 -->
          <div class="character-list">
            <!-- 載入中 -->
            <div v-if="isLoading" class="loading-state">
              <Loader2 :size="24" class="spin" />
              <p>載入角色中...</p>
            </div>

            <template v-else>
              <div
                v-for="char in characters"
                :key="char.id"
                class="character-item"
                :class="{ selected: selectedId === char.id }"
                @click="selectedId = char.id"
              >
                <div class="avatar">
                  <img v-if="char.avatar" :src="char.avatar" :alt="char.nickname" />
                  <User v-else :size="24" />
                </div>
                <div class="info">
                  <span class="name">{{ char.nickname || char.data?.name }}</span>
                </div>
                <div v-if="selectedId === char.id" class="check-icon">
                  <Check :size="18" />
                </div>
              </div>

              <div v-if="characters.length === 0" class="empty-state">
                <User :size="32" />
                <p>還沒有角色</p>
                <p class="hint">請先在角色庫中創建角色</p>
              </div>
            </template>
          </div>

          <!-- 夥伴設定（選中角色後顯示） -->
          <div v-if="selectedId" class="partner-settings">
            <h3>夥伴設定</h3>
            
            <div class="setting-group">
              <label>角色類型</label>
              <div class="option-buttons">
                <button
                  v-for="(label, key) in roleLabels"
                  :key="key"
                  class="option-btn"
                  :class="{ active: selectedRole === key }"
                  @click="selectedRole = key as 'coach' | 'partner' | 'cheerleader'"
                >
                  {{ label }}
                </button>
              </div>
            </div>

            <div class="setting-group">
              <label>互動風格</label>
              <div class="option-buttons">
                <button
                  v-for="(label, key) in styleLabels"
                  :key="key"
                  class="option-btn"
                  :class="{ active: selectedStyle === key }"
                  @click="selectedStyle = key as 'strict' | 'gentle' | 'playful'"
                >
                  {{ label }}
                </button>
              </div>
            </div>
          </div>

          <!-- 底部按鈕 -->
          <footer class="modal-footer">
            <button class="cancel-btn" @click="emit('close')">取消</button>
            <button 
              class="confirm-btn" 
              :disabled="!selectedId"
              @click="confirmSelect"
            >
              確認選擇
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  background: var(--color-surface, #fff);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 17px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
  }
  
  .close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    color: var(--color-text-secondary, #6b7280);
    
    &:hover {
      background: rgba(0, 0, 0, 0.05);
    }
  }
}

.character-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  border: 2px solid transparent;
  
  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  
  &.selected {
    background: rgba(125, 211, 168, 0.1);
    border-color: #7dd3a8;
  }
  
  .avatar {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    overflow: hidden;
    background: rgba(125, 211, 168, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #7dd3a8;
    flex-shrink: 0;
    
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  
  .info {
    flex: 1;
    min-width: 0;
    
    .name {
      font-weight: 500;
      color: var(--color-text, #1f2937);
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  
  .check-icon {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #7dd3a8;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary, #9ca3af);
  
  p {
    margin-top: 12px;
    font-size: 14px;
  }
  
  .hint {
    margin-top: 4px;
    font-size: 12px;
    opacity: 0.7;
  }
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  color: var(--color-text-secondary, #9ca3af);
  
  .spin {
    animation: spin 1s linear infinite;
  }
  
  p {
    margin-top: 12px;
    font-size: 14px;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.partner-settings {
  padding: 16px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  background: rgba(0, 0, 0, 0.02);
  
  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
    margin-bottom: 12px;
  }
}

.setting-group {
  margin-bottom: 12px;
  
  &:last-child {
    margin-bottom: 0;
  }
  
  label {
    display: block;
    font-size: 12px;
    color: var(--color-text-secondary, #6b7280);
    margin-bottom: 8px;
  }
}

.option-buttons {
  display: flex;
  gap: 8px;
}

.option-btn {
  flex: 1;
  padding: 8px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-size: 13px;
  color: var(--color-text, #1f2937);
  transition: all 0.2s;
  
  &:hover {
    border-color: rgba(0, 0, 0, 0.2);
  }
  
  &.active {
    background: #7dd3a8;
    border-color: #7dd3a8;
    color: white;
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.cancel-btn {
  flex: 1;
  padding: 12px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #1f2937);
  
  &:hover {
    background: rgba(0, 0, 0, 0.08);
  }
}

.confirm-btn {
  flex: 1;
  padding: 12px;
  background: #7dd3a8;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: white;
  
  &:hover:not(:disabled) {
    background: #6bc498;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
  
  .modal-container {
    transition: transform 0.2s ease;
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  
  .modal-container {
    transform: scale(0.95);
  }
}
</style>
