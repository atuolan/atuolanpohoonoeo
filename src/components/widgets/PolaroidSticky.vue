<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { ImagePlus, RotateCcw } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    imageUrl?: string;
    caption?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const imageUrl = ref(props.data?.imageUrl || "");
const caption = ref(props.data?.caption || "");
const fileInput = ref<HTMLInputElement | null>(null);

// 監聽數據變化並保存到 store
watch(
  [imageUrl, caption],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      imageUrl: imageUrl.value,
      caption: caption.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

// 觸發文件選擇
function triggerFileSelect() {
  fileInput.value?.click();
}

// 處理文件選擇
function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    // 驗證是圖片
    if (!file.type.startsWith("image/")) {
      alert("請選擇圖片文件");
      return;
    }

    // 讀取並轉換為 base64
    const reader = new FileReader();
    reader.onload = (event) => {
      imageUrl.value = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
}

// 清除照片
function clearImage() {
  imageUrl.value = "";
  if (fileInput.value) {
    fileInput.value.value = "";
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

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "pop";
});
</script>

<template>
  <div
    class="polaroid-sticky"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <!-- 隱藏的文件輸入 -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden-input"
      @change="handleFileSelect"
    />

    <!-- 照片區域 -->
    <div class="photo-area" @click="triggerFileSelect">
      <img v-if="imageUrl" :src="imageUrl" alt="Polaroid" class="photo" />
      <div v-else class="placeholder">
        <ImagePlus :size="32" :stroke-width="1.5" />
        <span>點擊上傳照片</span>
      </div>

      <!-- 重新選擇按鈕 -->
      <button v-if="imageUrl" class="change-btn" @click.stop="clearImage">
        <RotateCcw :size="14" :stroke-width="2" />
      </button>
    </div>

    <!-- 文字區域 -->
    <div class="caption-area">
      <input
        v-model="caption"
        type="text"
        class="caption-input"
        placeholder="寫點什麼..."
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.hidden-input {
  display: none;
}

.polaroid-sticky {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: white;

  // 共用部分
  .photo-area {
    flex: 1;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;

    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  // Classic 傳統樣式
  &.classic {
    padding: 10px;
    padding-bottom: 16px;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
    transform: rotate(-1deg);
    border: none;

    .photo-area {
      background: #1f2937;
      border-radius: 2px;
      border: none;
      box-shadow: none;

      &:hover .change-btn {
        opacity: 1;
        transform: none;
      }

      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: #6b7280;
        transition: color 0.2s;

        span {
          font-size: 11px;
          font-weight: normal;
        }

        &:hover {
          color: #9ca3af;
          transform: none;
        }
      }

      .change-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border: none;
        box-shadow: none;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s;
        transform: none;

        &:hover {
          background: rgba(0, 0, 0, 0.8);
          transform: none !important;
          box-shadow: none;
        }
        
        &:active {
          transform: none !important;
          box-shadow: none;
        }
      }
    }

    .caption-area {
      padding-top: 10px;

      .caption-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 12px;
        font-weight: normal;
        color: #374151;
        text-align: center;
        font-family: "Comic Sans MS", cursive, sans-serif;

        &::placeholder {
          color: #9ca3af;
          font-weight: normal;
          font-style: normal;
        }

        &:focus {
          outline: none;
          background: transparent;
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    padding: 12px;
    padding-bottom: 8px;
    border-radius: 8px;
    border: 3px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    transform: rotate(-2deg);
    transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
    
    &:hover {
      transform: rotate(0deg) translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
      &:hover {
        box-shadow: 5px 5px 0px rgba(0, 0, 0, 0.9);
      }
    }

    .photo-area {
      flex: 3;
      min-height: 0;
      background: #1a1a1a;
      border-radius: 4px;
      border: 2px solid #1a1a1a;
      box-shadow: inset 0px 0px 10px rgba(0,0,0,0.5);

      &:hover .change-btn {
        opacity: 1;
        transform: scale(1);
      }

      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        color: #fdfaf6;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        span {
          font-size: 13px;
          font-weight: 800;
        }

        &:hover {
          transform: scale(1.05);
          color: #38bdf8;
        }
      }

      .change-btn {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #ffb4b4;
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
        color: #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transform: scale(0.8);
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &:hover {
          background: #ef4444;
          transform: translate(-1px, -1px) scale(1.05) !important;
          box-shadow: 3px 3px 0px #1a1a1a;
        }
        
        &:active {
          transform: scale(0.95) !important;
          box-shadow: 0px 0px 0px #1a1a1a;
        }
      }
    }

    .caption-area {
      padding-top: 2px;
      flex: 0 0 auto;

      .caption-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 13px;
        font-weight: 800;
        color: #1a1a1a;
        text-align: center;
        font-family: inherit;

        &::placeholder {
          color: rgba(26,26,26,0.3);
          font-weight: 700;
          font-style: italic;
        }

        &:focus {
          outline: none;
          background: rgba(0,0,0,0.05);
          border-radius: 4px;
        }
      }
    }
  }

  // 平面風
  &.flat {
    padding: 16px;
    padding-bottom: 24px;
    background: #FFF0F5;
    border-radius: 32px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    
    .tape { display: none; }

    .photo-area {
      background: #332650;
      border-radius: 16px;
      overflow: hidden;

      &:hover .change-btn { opacity: 1; transform: scale(1); }

      .placeholder {
        display: flex; flex-direction: column; align-items: center; gap: 8px; color: white;
        span { font-size: 14px; font-weight: 800; }
      }

      .change-btn {
        position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border-radius: 50%;
        background: #FCD24B; border: 3px solid #332650; color: #332650; display: flex; align-items: center; justify-content: center; opacity: 0; transition: transform 0.2s;
        &:hover { transform: scale(1.1) !important; }
      }
    }

    .caption-area {
      padding-top: 16px;
      .caption-input {
        width: 100%; border: none; background: transparent; font-size: 16px; font-weight: 800; color: #332650; text-align: center;
        &:focus { outline: none; }
      }
    }
  }

  // 插圖風
  &.illustration {
    padding: 34px 12px 16px;
    background: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    position: relative;

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat; z-index: 2;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1); z-index: 2;
    }
    .tape { display: none; }

    .photo-area {
      background: white; border: 2px solid #1a1a1a; border-radius: 2px;
      &:hover .change-btn { opacity: 1; }
      .placeholder {
        display: flex; flex-direction: column; align-items: center; gap: 8px; color: #1a1a1a;
        span { font-size: 13px; font-weight: bold; }
      }
      .change-btn {
        position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 4px;
        background: #B0D0DB; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; color: #1a1a1a; display: flex; align-items: center; justify-content: center; opacity: 0;
        &:active { transform: translate(2px, 2px) !important; box-shadow: 0px 0px 0px #1a1a1a; }
      }
    }

    .caption-area {
      padding-top: 12px;
      .caption-input {
        width: 100%; border: none; background: white; border: 2px solid #1a1a1a; padding: 4px; font-size: 14px; font-weight: bold; color: #1a1a1a; text-align: center; box-shadow: inset 1px 1px 2px rgba(0,0,0,0.1);
        &:focus { outline: none; }
      }
    }
  }

  // 像素風
  &.pixel {
    padding: 34px 12px 16px;
    background: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;
    
    &::before {
      content: 'POLAROID.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5; z-index: 2;
    }
    .tape { display: none; }

    .photo-area {
      background: #F8C6DB; border: 2px dashed #F4A2C5; border-radius: 2px;
      &:hover .change-btn { opacity: 1; }
      .placeholder {
        display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; text-shadow: 1px 1px 0 #EAA3C5;
        span { font-size: 13px; font-weight: bold; }
      }
      .change-btn {
        position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 4px;
        background: #93E2B6; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; color: white; display: flex; align-items: center; justify-content: center; opacity: 0;
        &:active { transform: translate(2px, 2px) !important; box-shadow: none; }
      }
    }

    .caption-area {
      padding-top: 12px;
      .caption-input {
        width: 100%; border: 2px solid #EAA3C5; background: white; padding: 4px; font-size: 14px; font-weight: bold; color: #d06d9a; text-align: center; font-family: inherit;
        &:focus { outline: none; }
      }
    }
  }
}
</style>
