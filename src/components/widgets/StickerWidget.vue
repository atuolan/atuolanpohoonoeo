<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import { useStickerStore } from "@/stores/sticker";
import type { WidgetCustomStyle } from "@/types";
import type { StickerItem } from "@/types/sticker";
import { Smile } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    stickerUrl?: string;
    rotation?: number;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();
const stickerStore = useStickerStore();

const showPicker = ref(false);

const stickerUrl = computed(() => props.data?.stickerUrl || "");
const rotation = computed(() => props.data?.rotation ?? 0);
const isEditMode = computed(() => canvasStore.isEditMode);

// 只取「有圖片 URL」的表情分類（排除系統 emoji）
const imageCategories = computed(() => {
  return stickerStore.allCategories
    .map((cat) => ({
      id: cat.id,
      name: cat.name,
      stickers: cat.stickers.filter((s: StickerItem) => !!s.url),
    }))
    .filter((cat) => cat.stickers.length > 0);
});

const imgStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg)`,
}));

function openPicker() {
  if (!isEditMode.value) return;
  // 確保表情已初始化
  if (!stickerStore.initialized) {
    stickerStore.init?.();
  }
  showPicker.value = true;
}

function pickSticker(url: string) {
  canvasStore.updateWidgetData(props.widgetId, {
    ...props.data,
    stickerUrl: url,
  });
  showPicker.value = false;
}
</script>

<template>
  <div class="sticker-widget">
    <div class="sticker-display" @dblclick.stop="openPicker">
      <img
        v-if="stickerUrl"
        :src="stickerUrl"
        alt="sticker"
        class="sticker-img"
        :style="imgStyle"
        draggable="false"
      />
      <div v-else class="sticker-placeholder">
        <Smile :size="30" :stroke-width="1.5" />
        <span v-if="isEditMode">雙擊選貼圖</span>
      </div>
    </div>

    <!-- 貼圖選擇器 -->
    <div v-if="showPicker" class="sticker-picker" @click.stop>
      <div class="picker-header">
        <span>選擇貼圖</span>
        <button class="close-btn" @click="showPicker = false">✕</button>
      </div>
      <div class="picker-body">
        <div v-for="cat in imageCategories" :key="cat.id" class="picker-group">
          <div class="group-name">{{ cat.name }}</div>
          <div class="group-grid">
            <button
              v-for="s in cat.stickers"
              :key="s.id"
              class="picker-cell"
              @click="pickSticker(s.url)"
            >
              <img :src="s.url" :alt="s.name" loading="lazy" />
            </button>
          </div>
        </div>
        <div v-if="imageCategories.length === 0" class="empty-hint">
          尚無可用貼圖
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.sticker-widget {
  width: 100%;
  height: 100%;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sticker-display {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.sticker-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.2));
  transition: transform 0.2s ease;
  user-select: none;
}

.sticker-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #bbb;
  font-size: 11px;
}

.sticker-picker {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 240px;
  max-height: 280px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  z-index: 50;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid #f0f0f0;
  color: #333;
}

.close-btn {
  border: none;
  background: transparent;
  font-size: 14px;
  color: #999;
  cursor: pointer;
}

.picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.picker-group {
  margin-bottom: 10px;
}

.group-name {
  font-size: 11px;
  color: #999;
  margin-bottom: 4px;
}

.group-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.picker-cell {
  aspect-ratio: 1;
  border: none;
  background: #f7f7f7;
  border-radius: 8px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  &:hover {
    background: #ececec;
  }
}

.empty-hint {
  text-align: center;
  color: #bbb;
  font-size: 12px;
  padding: 20px 0;
}
</style>
