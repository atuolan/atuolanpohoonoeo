<script setup lang="ts">
import { ref, computed } from 'vue'

// Props
const props = withDefaults(defineProps<{
  modelValue: string[]
  placeholder?: string
  maxTags?: number
  suggestions?: string[]
}>(), {
  placeholder: '新增標籤...',
  maxTags: 20,
  suggestions: () => []
})

// Emits
const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

// 新標籤輸入
const newTag = ref('')

// 是否聚焦
const isFocused = ref(false)

// 顯示建議
const showSuggestions = computed(() => {
  if (!isFocused.value || !newTag.value.trim()) return false
  return filteredSuggestions.value.length > 0
})

// 過濾建議
const filteredSuggestions = computed(() => {
  const input = newTag.value.toLowerCase().trim()
  if (!input) return []
  
  return props.suggestions
    .filter(s => 
      s.toLowerCase().includes(input) && 
      !props.modelValue.includes(s)
    )
    .slice(0, 5)
})

// 是否已達上限
const isAtLimit = computed(() => props.modelValue.length >= props.maxTags)

// 新增標籤
function addTag(tag?: string) {
  const tagToAdd = (tag || newTag.value).trim()
  
  if (!tagToAdd) return
  if (props.modelValue.includes(tagToAdd)) {
    newTag.value = ''
    return
  }
  if (isAtLimit.value) {
    alert(`最多只能新增 ${props.maxTags} 個標籤`)
    return
  }
  
  emit('update:modelValue', [...props.modelValue, tagToAdd])
  newTag.value = ''
}

// 移除標籤
function removeTag(tag: string) {
  emit('update:modelValue', props.modelValue.filter(t => t !== tag))
}

// 處理按鍵
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    addTag()
  } else if (event.key === 'Backspace' && !newTag.value && props.modelValue.length > 0) {
    // 退格刪除最後一個標籤
    removeTag(props.modelValue[props.modelValue.length - 1])
  }
}

// 選擇建議
function selectSuggestion(suggestion: string) {
  addTag(suggestion)
}

// 處理聚焦
function handleFocus() {
  isFocused.value = true
}

// 處理失焦
function handleBlur() {
  // 延遲關閉以允許點擊建議
  setTimeout(() => {
    isFocused.value = false
  }, 200)
}
</script>

<template>
  <div class="tag-input-container" :class="{ focused: isFocused, 'at-limit': isAtLimit }">
    <!-- 已有標籤 -->
    <span 
      v-for="tag in modelValue" 
      :key="tag" 
      class="soft-tag editable"
    >
      {{ tag }}
      <button class="tag-remove" @click="removeTag(tag)" type="button">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </button>
    </span>
    
    <!-- 輸入區域 -->
    <div class="input-wrapper" v-if="!isAtLimit">
      <input 
        v-model="newTag"
        type="text"
        class="tag-input"
        :placeholder="modelValue.length === 0 ? placeholder : ''"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      />
      <button 
        v-if="newTag.trim()" 
        class="tag-add-btn"
        type="button"
        @click="addTag()"
      >
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </svg>
      </button>
    </div>
    
    <!-- 達到上限提示 -->
    <span v-else class="limit-hint">已達上限</span>
    
    <!-- 建議列表 -->
    <Transition name="fade">
      <div v-if="showSuggestions" class="suggestions-dropdown">
        <button 
          v-for="suggestion in filteredSuggestions"
          :key="suggestion"
          class="suggestion-item"
          type="button"
          @mousedown.prevent="selectSuggestion(suggestion)"
        >
          {{ suggestion }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.tag-input-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  min-height: 48px;
  position: relative;
  transition: all var(--transition-fast);
  
  &.focused {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }
  
  &.at-limit {
    background: var(--color-background);
  }
}

.soft-tag.editable {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px 5px 12px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-full);
  font-size: 13px;
  font-weight: 500;
  
  .tag-remove {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: inherit;
    opacity: 0.6;
    transition: all var(--transition-fast);
    padding: 0;
    
    svg {
      width: 12px;
      height: 12px;
    }
    
    &:hover {
      opacity: 1;
      background: rgba(0, 0, 0, 0.1);
    }
  }
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 100px;
}

.tag-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--color-text);
  outline: none;
  min-width: 60px;
  padding: 4px 0;
  
  &::placeholder {
    color: var(--color-text-muted);
  }
}

.tag-add-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: transform var(--transition-fast);
  flex-shrink: 0;
  padding: 0;
  
  svg {
    width: 14px;
    height: 14px;
    color: white;
  }
  
  &:hover {
    transform: scale(1.1);
  }
}

.limit-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  padding: 4px 0;
}

.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  z-index: 100;
}

.suggestion-item {
  width: 100%;
  padding: 12px 16px;
  text-align: left;
  background: transparent;
  border: none;
  font-size: 14px;
  color: var(--color-text);
  cursor: pointer;
  transition: background var(--transition-fast);
  
  &:hover {
    background: var(--color-background);
  }
  
  &:not(:last-child) {
    border-bottom: 1px solid var(--color-border);
  }
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
