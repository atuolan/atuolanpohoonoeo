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
  selecting?: boolean
  boundNames?: string[]  // 綁定這本書的角色顯示名稱
}

const props = withDefaults(defineProps<LorebookCardProps>(), {
  description: '',
  recursiveEnabled: false,
  maxRecursionSteps: 10,
  keywords: () => [],
  updatedAt: 0,
  isSelected: false,
  selecting: false,
  boundNames: () => []
})

// Emits
const emit = defineEmits<{
  (e: 'click', id: string): void
  (e: 'more', id: string): void
  (e: 'toggleSelect', id: string): void
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
  if (props.selecting) {
    emit('toggleSelect', props.id)
    return
  }
  emit('click', props.id)
}

function handleMore(e: Event) {
  e.stopPropagation()
  emit('more', props.id)
}
</script>

<template>
  <div
    class="lorebook-card"
    :class="{ 'is-selected': selecting && isSelected }"
    @click="handleClick"
  >
    <!-- 第一列：選取方塊／書本圖示、書名與資訊、更多操作 -->
    <div class="card-header">
      <button
        v-if="selecting"
        type="button"
        role="checkbox"
        class="select-box"
        :class="{ 'is-checked': isSelected }"
        :aria-checked="isSelected"
        :aria-label="'選取 ' + name"
        @click.stop="emit('toggleSelect', id)"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12l5 5 9-10"></path>
        </svg>
      </button>
      <span v-else class="book-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"></path>
          <path d="M5 17a3 3 0 0 1 3-3h11"></path>
        </svg>
      </span>

      <div class="header-content">
        <div class="card-title">{{ name }}</div>
        <div class="card-meta">
          <span>{{ entryCount }} 條目</span>
          <span class="meta-dot" aria-hidden="true">·</span>
          <span :class="{ 'recursion-on': recursiveEnabled }">
            遞迴 {{ recursiveEnabled ? '開' : '關' }}
          </span>
        </div>
      </div>

      <button
        v-if="!selecting"
        type="button"
        class="more-btn"
        :aria-label="name + ' 的更多操作'"
        @click="handleMore"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.8"></circle>
          <circle cx="12" cy="12" r="1.8"></circle>
          <circle cx="19" cy="12" r="1.8"></circle>
        </svg>
      </button>
    </div>

    <!-- 關鍵詞列 -->
    <div v-if="keywords.length > 0" class="keyword-row">
      <span
        v-for="(keyword, index) in keywords.slice(0, 5)"
        :key="index"
        class="keyword-tag"
      >
        {{ keyword }}
      </span>
      <span v-if="keywords.length > 5" class="keyword-more">
        +{{ keywords.length - 5 }}
      </span>
    </div>

    <!-- 描述 -->
    <div v-if="description" class="card-description">
      {{ description }}
    </div>

    <!-- 底部列 -->
    <div class="card-footer">
      <span v-if="boundNames.length > 0" class="bound">
        <span class="bound-avatar" aria-hidden="true">{{ boundNames[0].charAt(0) }}</span>
        <span class="bound-text">綁定 {{ boundNames.join('、') }}</span>
      </span>
      <span v-else class="unbound">尚未綁定角色</span>
      <span class="footer-time">{{ formattedTime }}</span>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.lorebook-card {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  border-radius: 18px;
  background: var(--color-surface);
  cursor: pointer;

  &.is-selected {
    box-shadow: 0 0 0 2px var(--color-primary);
  }
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 6px 0 14px;
}

.select-box {
  flex: none;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 14px;
  background: var(--color-surface);
  color: var(--color-on-primary-contrast);
  box-shadow: inset 0 0 0 2px var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);

  svg {
    width: 20px;
    height: 20px;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  &.is-checked {
    background: var(--color-primary);
    box-shadow: none;

    svg {
      opacity: 1;
    }
  }

  &:active {
    transform: scale(0.97);
  }
}

.book-icon {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 22px;
    height: 22px;
  }
}

.header-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
}

.card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--color-text-secondary);

  .meta-dot {
    color: var(--color-text-secondary);
  }

  .recursion-on {
    color: var(--color-success);
    font-weight: 700;
  }
}

.more-btn {
  flex: none;
  width: 40px;
  height: 40px;
  padding: 0;
  border: none;
  border-radius: 20px;
  background: transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast);

  svg {
    width: 18px;
    height: 18px;
  }

  &:active {
    transform: scale(0.97);
  }
}

.keyword-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 10px 14px 0 70px;
}

.keyword-tag {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 9px;
  border-radius: 12px;
  background: var(--color-background);
  font-size: 12px;
  color: var(--color-text);
}

.keyword-more {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.card-description {
  padding: 8px 14px 0 70px;
  font-size: 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-footer {
  margin: 12px 14px 0 70px;
  padding: 10px 0 12px;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: 8px;
}

.bound {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.bound-avatar {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--color-text);
  color: var(--color-surface);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bound-text {
  font-size: 12px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.unbound {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.footer-time {
  flex: none;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
