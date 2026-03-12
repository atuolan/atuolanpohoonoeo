<script setup lang="ts">
import { ref, computed } from 'vue'

// Props
const props = defineProps<{
  id: string
  name: string
  keys: string[]
  content: string
  enabled: boolean
  priority: number
  expanded?: boolean
}>()

// Emits
const emit = defineEmits<{
  (e: 'toggle-enabled', id: string): void
  (e: 'toggle-expand', id: string): void
  (e: 'update:name', value: string): void
  (e: 'update:keys', value: string[]): void
  (e: 'update:content', value: string): void
  (e: 'update:priority', value: number): void
  (e: 'delete', id: string): void
}>()

// 本地狀態
const localName = ref(props.name)
const localKeys = ref(props.keys.join(', '))
const localContent = ref(props.content)
const localPriority = ref(props.priority)

// 關鍵詞預覽
const keysPreview = computed(() => {
  return props.keys.length > 0 ? props.keys.join(', ') : '無關鍵詞'
})

// 切換啟用
function toggleEnabled() {
  emit('toggle-enabled', props.id)
}

// 切換展開
function toggleExpand() {
  emit('toggle-expand', props.id)
}

// 更新名稱
function updateName() {
  emit('update:name', localName.value)
}

// 更新關鍵詞
function updateKeys() {
  const keys = localKeys.value.split(',').map(k => k.trim()).filter(k => k)
  emit('update:keys', keys)
}

// 更新內容
function updateContent() {
  emit('update:content', localContent.value)
}

// 更新優先度
function updatePriority() {
  emit('update:priority', localPriority.value)
}

// 刪除
function handleDelete() {
  if (confirm('確定要刪除這個條目嗎？')) {
    emit('delete', props.id)
  }
}
</script>

<template>
  <div 
    class="entry-card"
    :class="{ expanded, disabled: !enabled }"
  >
    <!-- 條目標題列 -->
    <div class="entry-header" @click="toggleExpand">
      <button 
        class="entry-toggle"
        :class="{ enabled }"
        @click.stop="toggleEnabled"
      >
        <svg v-if="enabled" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      </button>
      
      <div class="entry-info">
        <span class="entry-name">{{ name }}</span>
        <span class="entry-keys">{{ keysPreview }}</span>
      </div>
      
      <div class="entry-priority">
        <span class="priority-badge">{{ priority }}</span>
      </div>
      
      <svg class="entry-chevron" :class="{ open: expanded }" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
      </svg>
    </div>
    
    <!-- 條目內容（展開時顯示） -->
    <Transition name="slide">
      <div v-if="expanded" class="entry-content">
        <div class="form-group">
          <label class="form-label">條目名稱</label>
          <input 
            v-model="localName"
            @blur="updateName"
            @keyup.enter="updateName"
            type="text"
            class="soft-input"
            placeholder="條目名稱"
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">關鍵詞（逗號分隔）</label>
          <input 
            v-model="localKeys"
            @blur="updateKeys"
            @keyup.enter="updateKeys"
            type="text"
            class="soft-input"
            placeholder="關鍵詞1, 關鍵詞2, ..."
          />
        </div>
        
        <div class="form-group">
          <label class="form-label">內容</label>
          <textarea 
            v-model="localContent"
            @blur="updateContent"
            class="soft-input textarea"
            placeholder="當觸發關鍵詞時，這段內容將被插入對話中..."
            rows="4"
          ></textarea>
        </div>
        
        <div class="form-group">
          <label class="form-label">優先度 ({{ localPriority }})</label>
          <input 
            type="range" 
            v-model.number="localPriority"
            @change="updatePriority"
            min="0"
            max="100"
            class="range-slider full"
          />
          <p class="form-hint">優先度越高，在多個條目同時觸發時越優先顯示</p>
        </div>
        
        <div class="entry-actions">
          <button class="delete-entry-btn" @click="handleDelete">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
            刪除條目
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.entry-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: all var(--transition-fast);
  
  &.disabled {
    opacity: 0.6;
  }
  
  &.expanded {
    box-shadow: var(--shadow-md);
  }
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background var(--transition-fast);
  
  &:hover {
    background: var(--color-background);
  }
}

.entry-toggle {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-border);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  
  svg {
    width: 16px;
    height: 16px;
    color: white;
  }
  
  &.enabled {
    background: var(--color-success, #5DD3B3);
  }
}

.entry-info {
  flex: 1;
  min-width: 0;
  
  .entry-name {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--color-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .entry-keys {
    display: block;
    font-size: 12px;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.entry-priority {
  flex-shrink: 0;
}

.priority-badge {
  display: inline-block;
  padding: 2px 8px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 600;
}

.entry-chevron {
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
  
  &.open {
    transform: rotate(180deg);
  }
}

.entry-content {
  padding: 0 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--color-border);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.form-hint {
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.soft-input {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background);
  font-size: 15px;
  color: var(--color-text);
  transition: all var(--transition-fast);
  
  &:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }
  
  &::placeholder {
    color: var(--color-text-muted);
  }
  
  &.textarea {
    resize: vertical;
    min-height: 80px;
    line-height: 1.5;
  }
}

.range-slider {
  width: 100%;
  height: 6px;
  appearance: none;
  background: var(--color-border);
  border-radius: 3px;
  outline: none;
  
  &::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: var(--color-primary);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }
}

.entry-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 8px;
}

.delete-entry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--color-error);
  border-radius: var(--radius-md);
  color: var(--color-error);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--transition-fast);
  
  svg {
    width: 16px;
    height: 16px;
  }
  
  &:hover {
    background: rgba(255, 123, 123, 0.1);
  }
}

// 動畫
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
}
</style>
