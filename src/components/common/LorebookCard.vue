<script setup lang="ts">
import { computed } from 'vue'

// Props 定義
interface LorebookCardProps {
  id: string
  name: string
  description?: string
  entryCount: number
  recursiveEnabled?: boolean
  maxRecursionSteps?: number
  keywords?: string[]  // 預覽關鍵詞
  updatedAt?: number
  isSelected?: boolean
}

const props = withDefaults(defineProps<LorebookCardProps>(), {
  description: '',
  recursiveEnabled: false,
  maxRecursionSteps: 10,
  keywords: () => [],
  updatedAt: 0,
  isSelected: false
})

// Emits
const emit = defineEmits<{
  (e: 'click', id: string): void
  (e: 'delete', id: string): void
}>()

// 格式化時間
const formattedTime = computed(() => {
  if (!props.updatedAt) return '未知'
  
  const now = Date.now()
  const diff = now - props.updatedAt
  
  if (diff < 60000) return '剛剛'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  
  return new Date(props.updatedAt).toLocaleDateString('zh-TW')
})

function handleClick() {
  emit('click', props.id)
}

function handleDelete(e: Event) {
  e.stopPropagation()
  emit('delete', props.id)
}
</script>

<template>
  <div 
    class="lorebook-card soft-card"
    :class="{ selected: isSelected }"
    @click="handleClick"
  >
    <!-- 標題列 -->
    <div class="card-header">
      <div class="header-icon">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
        </svg>
      </div>
      <div class="header-content">
        <div class="card-title">{{ name }}</div>
        <div class="card-meta">
          <span class="meta-item">{{ entryCount }} 條目</span>
          <span class="meta-dot">·</span>
          <span class="meta-item" :class="{ active: recursiveEnabled }">
            遞迴: {{ recursiveEnabled ? '開啟' : '關閉' }}
          </span>
        </div>
      </div>
      <button class="delete-btn" title="刪除" @click="handleDelete">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </div>
    
    <!-- 關鍵詞預覽 -->
    <div v-if="keywords.length > 0" class="keywords-preview">
      <span 
        v-for="(keyword, index) in keywords.slice(0, 5)" 
        :key="index" 
        class="keyword-tag"
      >
        {{ keyword }}
      </span>
      <span v-if="keywords.length > 5" class="keyword-tag more">
        +{{ keywords.length - 5 }}
      </span>
    </div>
    
    <!-- 描述（如果有） -->
    <div v-if="description" class="card-description">
      {{ description }}
    </div>
    
    <!-- 底部資訊 -->
    <div class="card-footer">
      <div class="footer-item">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
        </svg>
        <span>{{ formattedTime }}</span>
      </div>
      <div v-if="recursiveEnabled" class="footer-item">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
        </svg>
        <span>深度 {{ maxRecursionSteps }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lorebook-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  flex-shrink: 0;
  
  &.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 2px var(--color-primary-light);
  }
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 12px;
}

.header-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  border-radius: var(--radius-md);
  flex-shrink: 0;
  
  svg {
    width: 22px;
    height: 22px;
    color: white;
  }
}

.header-content {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  
  .meta-dot {
    color: var(--color-text-muted);
  }
  
  .meta-item.active {
    color: var(--color-success);
  }
}

.delete-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: var(--radius-md);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  
  svg {
    width: 18px;
    height: 18px;
  }
  
  &:hover {
    background: rgba(255, 123, 123, 0.15);
    color: var(--color-error);
  }
  
  &:active {
    transform: scale(0.95);
  }
}

.keywords-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.keyword-tag {
  display: inline-flex;
  padding: 4px 10px;
  background: var(--color-background);
  border-radius: var(--radius-full);
  font-size: 12px;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  
  &.more {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-color: transparent;
  }
}

.card-description {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--color-border);
}

.footer-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-muted);
  
  svg {
    width: 14px;
    height: 14px;
  }
}
</style>
