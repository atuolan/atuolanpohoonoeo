<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { Image as ImageIcon } from "lucide-vue-next";
import { computed, ref } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    imageUrl?: string;
    frameStyle?: string;
    caption?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();
const fileInput = ref<HTMLInputElement | null>(null);

// 相框風格
const FRAME_STYLES = [
  { id: "polaroid", name: "拍立得" },
  { id: "classic", name: "古典金框" },
  { id: "wood", name: "原木框" },
  { id: "thin", name: "極簡細框" },
  { id: "sticker", name: "貼紙描邊" },
];

const currentFrame = computed(() => props.data?.frameStyle || "polaroid");
const imageUrl = computed(() => props.data?.imageUrl || "");
const caption = computed(() => props.data?.caption || "");
const isEditMode = computed(() => canvasStore.isEditMode);

function triggerUpload() {
  fileInput.value?.click();
}

function onFileChange(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    canvasStore.updateWidgetData(props.widgetId, {
      ...props.data,
      imageUrl: reader.result as string,
    });
  };
  reader.readAsDataURL(file);
  target.value = "";
}

function setFrame(id: string) {
  canvasStore.updateWidgetData(props.widgetId, {
    ...props.data,
    frameStyle: id,
  });
}

function updateCaption(e: Event) {
  const value = (e.target as HTMLElement).innerText;
  canvasStore.updateWidgetData(props.widgetId, {
    ...props.data,
    caption: value,
  });
}
</script>

<template>
  <div class="photo-frame-widget" :class="`frame-${currentFrame}`">
    <div class="frame-inner">
      <div class="photo-area" @dblclick.stop="triggerUpload">
        <img v-if="imageUrl" :src="imageUrl" alt="photo" class="photo-img" />
        <div v-else class="photo-placeholder">
          <ImageIcon :size="28" :stroke-width="1.5" />
          <span>雙擊上傳照片</span>
        </div>
      </div>

      <div
        v-if="currentFrame === 'polaroid'"
        class="caption"
        :contenteditable="isEditMode"
        @blur="updateCaption"
        @click.stop
      >
        {{ caption || (isEditMode ? "" : "") }}
      </div>
    </div>

    <div v-if="isEditMode" class="frame-picker">
      <button
        v-for="f in FRAME_STYLES"
        :key="f.id"
        class="frame-chip"
        :class="{ active: f.id === currentFrame }"
        @click.stop="setFrame(f.id)"
      >
        {{ f.name }}
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="onFileChange"
    />
  </div>
</template>

<style lang="scss" scoped>
.photo-frame-widget {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.frame-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.photo-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  cursor: pointer;
}

.photo-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: #aaa;
  font-size: 11px;
}

.caption {
  text-align: center;
  font-family: "Comic Sans MS", "Marker Felt", cursive;
  font-size: 13px;
  color: #555;
  padding: 6px 4px;
  min-height: 20px;
  outline: none;

  &:empty::before {
    content: "寫點什麼…";
    color: #ccc;
  }
}

/* ===== 拍立得 ===== */
.frame-polaroid .frame-inner {
  background: #fff;
  padding: 8px 8px 0;
  border-radius: 3px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
}

/* ===== 古典金框 ===== */
.frame-classic .frame-inner {
  padding: 10px;
  border-radius: 4px;
  background: linear-gradient(135deg, #d4af37, #b8860b, #f5d76e);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);

  .photo-area {
    border: 2px solid rgba(255, 255, 255, 0.4);
  }
}

/* ===== 原木框 ===== */
.frame-wood .frame-inner {
  padding: 12px;
  border-radius: 4px;
  background: repeating-linear-gradient(
    90deg,
    #b5763f 0 6px,
    #a9692f 6px 12px
  );
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

/* ===== 極簡細框 ===== */
.frame-thin .frame-inner {
  padding: 4px;
  background: #fff;
  border: 1px solid #e2e2e2;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

/* ===== 貼紙描邊 ===== */
.frame-sticker .frame-inner {
  padding: 6px;
  background: #fff;
  border-radius: 14px;
  box-shadow: 0 0 0 4px #fff, 0 4px 12px rgba(0, 0, 0, 0.2);

  .photo-area {
    border-radius: 8px;
  }
}

.frame-picker {
  position: absolute;
  bottom: -34px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  padding: 4px 6px;
  border-radius: 8px;
  z-index: 5;
}

.frame-chip {
  font-size: 10px;
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  border-radius: 6px;
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;

  &.active {
    background: rgba(255, 255, 255, 0.85);
    color: #222;
  }
}

.hidden-input {
  display: none;
}
</style>
