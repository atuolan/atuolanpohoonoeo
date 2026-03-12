<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="visible" class="share-overlay" @click="$emit('close')">
        <div class="share-modal" @click.stop>
          <h3>選擇分享對象</h3>
          <div v-if="characters.length === 0" class="empty-hint">
            <p>還沒有角色，先去建立一個吧</p>
          </div>
          <div v-else class="character-list">
            <div
              v-for="char in characters"
              :key="char.id"
              class="character-item"
              @click="$emit('select', char.id)"
            >
              <img
                v-if="char.avatar"
                :src="char.avatar"
                :alt="char.nickname || char.data.name"
                class="char-avatar"
              />
              <div v-else class="char-avatar placeholder">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z" />
                </svg>
              </div>
              <span class="char-name">{{ char.nickname || char.data.name }}</span>
            </div>
          </div>
          <button class="btn-cancel" @click="$emit('close')">取消</button>
        </div>
      </div>
    </transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCharactersStore } from '@/stores/characters'

defineProps<{ visible: boolean }>()
defineEmits<{ close: []; select: [characterId: string] }>()

const charactersStore = useCharactersStore()
const characters = computed(() => charactersStore.characters)
</script>

<style scoped lang="scss">
.share-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10001;
  padding: 20px;
}

.share-modal {
  background: white;
  border-radius: 20px;
  padding: 24px;
  max-width: 360px;
  width: 100%;
  max-height: calc(100dvh - 80px);
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);

  h3 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
    text-align: center;
  }
}

.empty-hint {
  text-align: center;
  padding: 24px 0;
  color: #9ca3af;
  font-size: 14px;
  p { margin: 0; }
}

.character-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.character-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.15s;

  &:active {
    background: #f3f4f6;
    transform: scale(0.98);
  }
}

.char-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;

  &.placeholder {
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    svg { width: 24px; height: 24px; color: #9ca3af; }
  }
}

.char-name {
  font-size: 15px;
  font-weight: 500;
  color: #1f2937;
}

.btn-cancel {
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: #f3f4f6;
  color: #6b7280;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;

  &:active {
    background: #e5e7eb;
    transform: scale(0.98);
  }
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
