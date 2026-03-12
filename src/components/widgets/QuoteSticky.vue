<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { Quote } from "lucide-vue-next";
import { computed, nextTick, ref, watch } from "vue";

const props = defineProps<{
  widgetId: string;
  data?: {
    quote?: string;
    author?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const quote = ref(props.data?.quote || "早餐其實挺好但就是太早了");
const author = ref(props.data?.author || "毛不易");
const textareaRef = ref<HTMLTextAreaElement | null>(null);

// 監聽數據變化並保存到 store
watch(
  [quote, author],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      quote: quote.value,
      author: author.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

// 自動調整文字區域高度
function autoResize() {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = "auto";
      textareaRef.value.style.height = textareaRef.value.scrollHeight + "px";
    }
  });
}

// 監聽內容變化
watch(quote, autoResize);

// 初始調整
watch(
  textareaRef,
  (el) => {
    if (el) autoResize();
  },
  { immediate: true },
);

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
    class="quote-sticky"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <Quote
      :size="24"
      :stroke-width="1.5"
      class="quote-icon"
      :style="textStyle"
    />

    <textarea
      ref="textareaRef"
      v-model="quote"
      class="quote-text"
      :style="textStyle"
      placeholder="寫下一句話..."
      @input="autoResize"
    ></textarea>

    <div class="quote-author" :style="textStyle">
      <span class="dash">—</span>
      <input
        v-model="author"
        class="author-input"
        :style="textStyle"
        placeholder="作者"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.quote-sticky {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  // Classic 傳統樣式
  &.classic {
    padding: 16px;
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    border-radius: var(--radius-lg);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);

    .quote-icon {
      color: rgba(255, 255, 255, 0.8);
      margin-bottom: 8px;
    }

    .quote-text {
      flex: 1;
      width: 100%;
      min-height: 40px;
      border: none;
      background: transparent;
      resize: none;
      font-size: 14px;
      line-height: 1.6;
      color: #312e81;
      overflow-y: auto;
      font-family: "Noto Serif TC", serif;

      &::placeholder {
        color: rgba(49, 46, 129, 0.4);
      }
      &:focus {
        outline: none;
      }
    }

    .quote-author {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      flex-shrink: 0;
      justify-content: flex-end;

      .dash {
        color: #4f46e5;
        font-weight: 500;
        font-size: 14px;
      }

      .author-input {
        width: 100%;
        max-width: 100px;
        border: none;
        background: transparent;
        font-size: 12px;
        color: #4f46e5;
        text-align: right;

        &::placeholder {
          color: rgba(79, 70, 229, 0.5);
        }
        &:focus {
          outline: none;
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    padding: 20px 16px 16px;
    background: #c4b5fd;
    border-radius: 16px;
    border: 3px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
    }

    .quote-icon {
      color: #1a1a1a;
      margin-bottom: 8px;
      flex-shrink: 0;
      filter: drop-shadow(2px 2px 0px rgba(255, 255, 255, 0.5));
    }

    .quote-text {
      flex: 1;
      width: 100%;
      min-height: 40px;
      border: none;
      background: transparent;
      resize: none;
      font-size: 15px;
      font-weight: 700;
      line-height: 1.6;
      color: #1a1a1a;
      overflow-y: auto;
      font-family: inherit;

      &::placeholder {
        color: rgba(26, 26, 26, 0.4);
      }

      &:focus {
        outline: none;
      }

      &::-webkit-scrollbar {
        width: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: #1a1a1a;
        border-radius: 3px;
      }
    }

    .quote-author {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      flex-shrink: 0;
      justify-content: flex-end;
      background: #fdfaf6;
      padding: 4px 10px;
      border-radius: 12px;
      border: 2px solid #1a1a1a;
      box-shadow: 2px 2px 0px #1a1a1a;
      align-self: flex-end;

      .dash {
        color: #1a1a1a;
        font-weight: 800;
        font-size: 14px;
      }

      .author-input {
        width: 100%;
        min-width: 40px;
        max-width: 100px;
        border: none;
        background: transparent;
        font-size: 13px;
        font-weight: 800;
        color: #1a1a1a;
        text-align: right;

        &::placeholder {
          color: rgba(26, 26, 26, 0.5);
        }
        
        &:focus {
          outline: none;
        }
      }
    }
  }

  // 平面風
  &.flat {
    padding: 24px;
    background: #FFF0F5;
    border-radius: 32px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    
    .quote-icon {
      color: #FCD24B;
      margin-bottom: 8px;
    }

    .quote-text {
      flex: 1;
      width: 100%;
      min-height: 40px;
      border: none;
      background: transparent;
      resize: none;
      font-size: 16px;
      line-height: 1.6;
      color: #332650;
      font-weight: 800;
      overflow-y: auto;
      
      &:focus { outline: none; }
    }

    .quote-author {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 12px;
      justify-content: flex-end;
      background: #FCD24B;
      padding: 6px 14px;
      border-radius: 9999px;
      border: 3px solid #332650;
      box-shadow: 0 4px 0px #332650;
      align-self: flex-end;

      .dash { color: #332650; font-weight: 800; font-size: 14px; }
      .author-input {
        width: 100%; max-width: 100px; border: none; background: transparent; font-size: 13px; font-weight: 800; color: #332650; text-align: right;
        &:focus { outline: none; }
      }
    }
  }

  // 插圖風
  &.illustration {
    padding: 34px 16px 16px;
    background: #F6F3EB;
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 22px;
      border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB;
      background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px);
      background-size: 100% 12px;
      background-position: center 5px;
      background-repeat: no-repeat;
    }

    &::after {
      content: '';
      position: absolute;
      top: 5px; left: 8px;
      width: 12px; height: 12px;
      border: 2px solid #1a1a1a;
      background: white;
      box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1);
    }

    .quote-icon {
      color: #1a1a1a; margin-bottom: 8px;
    }

    .quote-text {
      flex: 1; width: 100%; border: none; background: transparent; resize: none; font-size: 15px; font-weight: 700; color: #1a1a1a; line-height: 1.6;
      &:focus { outline: none; }
    }

    .quote-author {
      display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; justify-content: flex-end; align-self: flex-end;
      .dash { color: #1a1a1a; font-weight: 800; font-size: 14px; }
      .author-input {
        width: 100%; max-width: 100px; border: none; background: transparent; font-size: 13px; font-weight: 800; color: #1a1a1a; text-align: right;
        border-bottom: 2px solid #1a1a1a; padding-bottom: 2px;
        &:focus { outline: none; }
      }
    }
  }

  // 像素風
  &.pixel {
    padding: 34px 16px 16px;
    background: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'QUOTE.SYS';
      position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5;
    }

    .quote-icon {
      color: #d06d9a; margin-bottom: 8px;
    }

    .quote-text {
      flex: 1; width: 100%; border: none; background: white; border: 2px dashed #EAA3C5; padding: 12px; font-family: inherit; resize: none; font-size: 15px; font-weight: 700; color: #d06d9a; line-height: 1.6;
      &:focus { outline: none; border-style: solid; box-shadow: inset 1px 1px 3px rgba(0,0,0,0.05); }
    }

    .quote-author {
      display: inline-flex; align-items: center; gap: 4px; margin-top: 12px; justify-content: flex-end; background: #93E2B6; padding: 4px 10px; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; align-self: flex-end;
      .dash { color: white; font-weight: bold; font-size: 14px; }
      .author-input {
        width: 100%; max-width: 100px; border: none; background: transparent; font-size: 13px; font-weight: bold; color: white; text-align: right; font-family: inherit;
        &:focus { outline: none; }
        &::placeholder { color: rgba(255,255,255,0.7); }
      }
    }
  }
}
</style>
