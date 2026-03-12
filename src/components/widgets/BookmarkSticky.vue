<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { Edit3, ExternalLink, Globe } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    title?: string;
    url?: string;
    color?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const title = ref(props.data?.title || "Google");
const url = ref(props.data?.url || "https://google.com");
const isEditing = ref(false);

// 監聽數據變化並保存到 store
watch(
  [title, url],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      title: title.value,
      url: url.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

// 處理網址跳轉
function openLink() {
  if (isEditing.value) return;

  let target = url.value;
  if (!target.startsWith("http")) {
    target = "https://" + target;
  }
  window.open(target, "_blank");
}

// 獲取域名圖標（Favicon API）
function getFavicon(u: string) {
  try {
    const domain = new URL(u.startsWith("http") ? u : `https://${u}`).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

// 自定義樣式計算
const containerStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.backgroundGradient) {
    style.background = customStyle.backgroundGradient;
  } else if (customStyle?.backgroundColor) {
    style.background = customStyle.backgroundColor;
  }

  if (customStyle?.borderColor) {
    style.borderColor = customStyle.borderColor;
    style.borderWidth = `${customStyle.borderWidth || 2}px`;
    style.borderStyle = "solid";
  }

  return style;
});

const textStyle = computed(() => {
  const style: Record<string, string> = {};
  const customStyle = props.data?.customStyle;

  if (customStyle?.textColor) {
    style.color = customStyle.textColor;
  } else if (customStyle?.foregroundColor) {
    style.color = customStyle.foregroundColor;
  }

  return style;
});

const hasCustomBackground = computed(() => {
  return !!(
    props.data?.customStyle?.backgroundColor ||
    props.data?.customStyle?.backgroundGradient
  );
});
</script>

<template>
  <div
    class="bookmark-sticky"
    :class="{ 'has-custom-bg': hasCustomBackground }"
    :style="containerStyle"
  >
    <!-- 編輯模式 -->
    <div v-if="isEditing" class="edit-overlay" @click.self="isEditing = false">
      <div class="edit-form">
        <input v-model="title" placeholder="標題" class="edit-input" />
        <input
          v-model="url"
          placeholder="網址 (google.com)"
          class="edit-input"
        />
        <button @click="isEditing = false" class="save-btn">確定</button>
      </div>
    </div>

    <!-- 顯示模式 -->
    <div class="content" @click="openLink">
      <div class="icon-wrapper">
        <img
          v-if="url"
          :src="getFavicon(url)"
          class="favicon"
          @error="
            (e) => ((e.target as HTMLImageElement).style.display = 'none')
          "
        />
        <Globe v-else :size="24" class="fallback-icon" />
      </div>

      <div class="info" :style="textStyle">
        <span class="title">{{ title }}</span>
        <span class="url">{{ url }}</span>
      </div>

      <button class="edit-btn" @click.stop="isEditing = true">
        <Edit3 :size="12" />
      </button>

      <div class="hover-hint">
        <ExternalLink :size="16" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.bookmark-sticky {
  width: 100%;
  height: 100%;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: var(--radius-lg);
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    border-color: #a5b4fc;

    .hover-hint {
      opacity: 1;
      transform: translateY(0);
    }
  }
}

.content {
  width: 100%;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  position: relative;
}

.icon-wrapper {
  width: 48px;
  height: 48px;
  background: white;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);

  .favicon {
    width: 32px;
    height: 32px;
    object-fit: contain;
  }

  .fallback-icon {
    color: #9ca3af;
  }
}

.info {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;

  .title {
    font-size: 13px;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .url {
    font-size: 10px;
    color: #9ca3af;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    width: 100%;
    opacity: 0.8;
  }
}

.edit-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  opacity: 0;
  transition: opacity 0.2s;

  &:hover {
    background: #e0e7ff;
    color: #4f46e5;
  }
}

.bookmark-sticky:hover .edit-btn {
  opacity: 1;
}

.hover-hint {
  position: absolute;
  bottom: 8px;
  right: 8px;
  color: #a5b4fc;
  opacity: 0;
  transform: translateY(5px);
  transition: all 0.2s;
}

// 編輯表單
.edit-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.98);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-form {
  width: 90%;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .edit-input {
    width: 100%;
    padding: 8px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 12px;

    &:focus {
      outline: none;
      border-color: #6366f1;
    }
  }

  .save-btn {
    padding: 6px;
    background: #6366f1;
    color: white;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
  }
}
</style>
