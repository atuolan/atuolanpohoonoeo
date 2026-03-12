<script setup lang="ts">
import { useCanvasStore } from "@/stores/canvas";
import type { WidgetCustomStyle } from "@/types";
import { Check, Plus } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

const props = defineProps<{
  widgetId: string;
  data?: {
    items?: TodoItem[];
    title?: string;
    customStyle?: WidgetCustomStyle;
  };
}>();

const canvasStore = useCanvasStore();

const title = ref(props.data?.title || "待辦事項");
const items = ref<TodoItem[]>(
  props.data?.items || [
    { id: "1", text: "完成作業", done: false },
    { id: "2", text: "買牛奶", done: true },
  ],
);
const newItemText = ref("");

// 監聽數據變化並保存到 store
watch(
  [title, items],
  () => {
    canvasStore.updateWidgetData(props.widgetId, {
      title: title.value,
      items: items.value,
      customStyle: props.data?.customStyle,
    });
  },
  { deep: true },
);

function addItem() {
  if (!newItemText.value.trim()) return;
  items.value.push({
    id: Date.now().toString(),
    text: newItemText.value.trim(),
    done: false,
  });
  newItemText.value = "";
}

function toggleItem(id: string) {
  const item = items.value.find((i) => i.id === id);
  if (item) {
    item.done = !item.done;
  }
}

function removeItem(id: string) {
  items.value = items.value.filter((i) => i.id !== id);
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
    class="todo-sticky"
    :class="[currentLayout, { 'has-custom-bg': hasCustomBackground }]"
    :style="containerStyle"
  >
    <!-- 標題 -->
    <div class="sticky-header">
      <input v-model="title" class="title-input" :style="textStyle" />
    </div>

    <!-- 待辦列表 -->
    <div class="todo-list">
      <div
        v-for="item in items"
        :key="item.id"
        class="todo-item"
        :class="{ done: item.done }"
      >
        <button class="check-btn" @click="toggleItem(item.id)">
          <Check v-if="item.done" :size="12" :stroke-width="3" />
        </button>
        <span class="item-text">{{ item.text }}</span>
        <button class="remove-btn" @click="removeItem(item.id)">×</button>
      </div>
    </div>

    <!-- 新增輸入 -->
    <div class="add-item">
      <input
        v-model="newItemText"
        type="text"
        placeholder="新增項目..."
        @keyup.enter="addItem"
      />
      <button class="add-btn" @click="addItem">
        <Plus :size="14" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.todo-sticky {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  container-type: size;
  overflow: hidden;

  // Classic 傳統樣式
  &.classic {
    padding: 12px;
    background: linear-gradient(135deg, #fef9c3 0%, #fef08a 100%);
    border-radius: 4px;
    box-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1), inset 0 0 30px rgba(255, 255, 255, 0.5);

    .sticky-header {
      margin-bottom: 8px;
      flex-shrink: 0;

      .title-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 14px;
        font-weight: bold;
        color: #374151;
        border-bottom: 1px solid rgba(0, 0, 0, 0.1);
        padding-bottom: 4px;

        &:focus {
          outline: none;
          border-bottom-color: rgba(0, 0, 0, 0.3);
        }
      }
    }

    .todo-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 0;
      padding-right: 4px;
    }

    .todo-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      transition: background-color 0.2s;
      border-radius: 4px;

      &:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .check-btn {
        width: 18px;
        height: 18px;
        min-width: 18px;
        border-radius: 50%;
        border: 2px solid rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        transition: all 0.2s;
        flex-shrink: 0;

        &:hover {
          border-color: rgba(0, 0, 0, 0.5);
        }
      }

      .item-text {
        flex: 1;
        font-size: 13px;
        color: #374151;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: opacity 0.2s;
      }

      .remove-btn {
        opacity: 0;
        color: rgba(0, 0, 0, 0.3);
        transition: opacity 0.2s;
        padding: 0 4px;
        flex-shrink: 0;
        background: none;
        border: none;

        &:hover {
          color: #ef4444;
        }
      }

      &:hover .remove-btn {
        opacity: 1;
      }

      &.done {
        .check-btn {
          background: #4ade80;
          border-color: #4ade80;
          color: white;
        }

        .item-text {
          text-decoration: line-through;
          opacity: 0.5;
        }
      }
    }

    .add-item {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed rgba(0, 0, 0, 0.1);
      flex-shrink: 0;

      input {
        flex: 1;
        min-width: 0;
        border: none;
        background: rgba(255, 255, 255, 0.5);
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;

        &:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.8);
        }
      }

      .add-btn {
        width: 24px;
        height: 24px;
        min-width: 24px;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.1);
        color: #374151;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s;
        flex-shrink: 0;
        border: none;

        &:hover {
          background: rgba(0, 0, 0, 0.2);
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    padding: 16px;
    background: #fef08a;
    border: 3px solid #1a1a1a;
    border-radius: 16px;
    box-shadow: 4px 4px 0px #1a1a1a;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    
    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.has-custom-bg {
      box-shadow: 4px 4px 0px rgba(0, 0, 0, 0.8);
    }

    .sticky-header {
      margin-bottom: 12px;
      flex-shrink: 0;

      .title-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 16px;
        font-weight: 900;
        color: #1a1a1a;
        padding-bottom: 4px;
        border-bottom: 3px solid #1a1a1a;

        &:focus {
          outline: none;
          background: rgba(255, 255, 255, 0.4);
        }
      }
    }

    .todo-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-height: 0;
      padding-right: 4px;

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

    .todo-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px;
      background: white;
      border: 2px solid #1a1a1a;
      border-radius: 8px;
      box-shadow: 2px 2px 0px #1a1a1a;
      flex-shrink: 0;
      transition: transform 0.1s;

      &:hover {
        transform: translateX(2px);
      }

      .check-btn {
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 4px;
        border: 2px solid #1a1a1a;
        background: #fdfaf6;
        display: flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        flex-shrink: 0;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &:hover {
          transform: scale(1.1);
        }
      }

      .item-text {
        flex: 1;
        font-size: 14px;
        font-weight: 700;
        color: #1a1a1a;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        transition: opacity 0.2s;
      }

      .remove-btn {
        opacity: 0;
        color: #1a1a1a;
        font-size: 18px;
        font-weight: 900;
        transition: opacity 0.2s, transform 0.2s;
        flex-shrink: 0;
        background: #ffb4b4;
        border: 2px solid #1a1a1a;
        border-radius: 5px;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 1px 1px 0px #1a1a1a;
        
        &:hover {
          transform: scale(1.1);
          background: #ef4444;
        }
      }

      &:hover .remove-btn {
        opacity: 1;
      }

      &.done {
        background: #f0f0f0;
        box-shadow: 1px 1px 0px #1a1a1a;
        transform: translate(1px, 1px);
        
        .check-btn {
          background: #a3ffac;
          color: #1a1a1a;
        }

        .item-text {
          text-decoration: line-through;
          text-decoration-thickness: 2px;
          opacity: 0.5;
        }
      }
    }

    .add-item {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 3px dashed #1a1a1a;
      flex-shrink: 0;

      input {
        flex: 1;
        min-width: 0;
        border: 2px solid #1a1a1a;
        background: white;
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 13px;
        font-weight: 700;
        color: #1a1a1a;

        &::placeholder {
          color: rgba(26,26,26,0.4);
        }

        &:focus {
          outline: none;
          box-shadow: 2px 2px 0px #1a1a1a;
          transform: translate(-1px, -1px);
        }
      }

      .add-btn {
        width: 32px;
        height: 32px;
        min-width: 32px;
        border-radius: 8px;
        background: #38bdf8;
        color: #1a1a1a;
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        
        &:hover {
          transform: scale(1.1) translate(-1px, -1px);
          box-shadow: 3px 3px 0px #1a1a1a;
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px #1a1a1a;
        }
      }
    }
  }

  // 平面風 (Flat / Illustration)
  &.flat {
    padding: 16px;
    background: #FFF0F5;
    border: 3px solid #332650;
    border-radius: 24px;
    box-shadow: 0 6px 0px #332650;

    .sticky-header {
      margin-bottom: 12px;
      flex-shrink: 0;

      .title-input {
        width: 100%;
        border: none;
        background: transparent;
        font-size: 16px;
        font-weight: 800;
        color: #332650;
        padding-bottom: 4px;

        &:focus {
          outline: none;
        }
      }
    }

    .todo-list {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .todo-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: white;
      border: 3px solid #332650;
      border-radius: 9999px; // Pill shape
      flex-shrink: 0;

      .check-btn {
        width: 20px;
        height: 20px;
        min-width: 20px;
        border-radius: 50%;
        border: 2px solid #332650;
        background: white;
        display: flex;
        align-items: center;
        justify-content: center;
        color: transparent;
        flex-shrink: 0;
        transition: transform 0.2s;

        &:hover {
          transform: scale(1.1);
        }
      }

      .item-text {
        flex: 1;
        font-size: 14px;
        font-weight: 700;
        color: #332650;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .remove-btn {
        opacity: 0;
        color: #332650;
        background: none;
        border: none;
        font-weight: 900;
        font-size: 18px;
        padding: 0;
        margin: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
        &:hover { color: #f43f5e; }
      }

      &:hover .remove-btn {
        opacity: 1;
      }

      &.done {
        .check-btn {
          background: #332650;
          color: white;
        }
        .item-text {
          text-decoration: line-through;
          opacity: 0.5;
        }
      }
    }

    .add-item {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      flex-shrink: 0;

      input {
        flex: 1;
        min-width: 0;
        border: 3px solid #332650;
        background: white;
        border-radius: 9999px;
        padding: 6px 12px;
        font-size: 13px;
        font-weight: 700;
        color: #332650;

        &:focus {
          outline: none;
          background: #fdfdfd;
        }
      }

      .add-btn {
        width: 36px;
        height: 36px;
        min-width: 36px;
        border-radius: 50%;
        background: #FCD24B;
        color: #332650;
        border: 3px solid #332650;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: transform 0.2s, background 0.2s;
        
        &:hover {
          background: #fde047;
          transform: scale(1.05);
        }
        &:active {
          transform: scale(0.95);
        }
      }
    }
  }

  // 插圖風 (Retro Mac / PC Window)
  &.illustration {
    padding: 34px 12px 12px;
    background: #F6F3EB;
    border: 2px solid #1a1a1a;
    border-radius: 6px;
    box-shadow: 4px 4px 0px #1a1a1a;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 22px;
      border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB;
      background-image: repeating-linear-gradient(
        to bottom,
        transparent, transparent 2px,
        #1a1a1a 2px, #1a1a1a 3px
      );
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

    .sticky-header {
      margin-bottom: 8px;
      .title-input {
        width: 100%;
        border: 2px solid #1a1a1a;
        background: white;
        font-size: 14px;
        font-family: inherit;
        font-weight: bold;
        color: #1a1a1a;
        padding: 4px 8px;
        position: relative;
        z-index: 1;
        box-shadow: 2px 2px 0px rgba(0,0,0,0.1);

        &:focus {
          outline: none;
        }
      }
    }

    .todo-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .todo-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      background: #B0D0DB; 
      border: 2px solid #1a1a1a;
      flex-shrink: 0;
      box-shadow: 2px 2px 0px #1a1a1a;
      
      &:nth-child(even) {
        background: #FBC9CB;
      }

      .check-btn {
        width: 16px; height: 16px; min-width: 16px;
        border: 2px solid #1a1a1a;
        background: white;
        display: flex; align-items: center; justify-content: center;
        color: transparent;
      }

      .item-text {
        flex: 1;
        font-size: 13px; font-weight: 600; color: #1a1a1a;
      }

      .remove-btn {
        opacity: 0; color: #1a1a1a; background: none; border: 1px solid transparent; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;
        &:hover { border: 1px dashed #1a1a1a; }
      }
      &:hover .remove-btn { opacity: 1; }

      &.done {
        .check-btn { color: #1a1a1a; }
        .item-text { text-decoration: line-through; opacity: 0.6; }
      }
    }

    .add-item {
      display: flex; gap: 6px; margin-top: 8px;
      input {
        flex: 1; padding: 4px 8px; border: 2px solid #1a1a1a; background: white; font-size: 13px;
        font-weight: 600; box-shadow: inset 1px 1px 3px rgba(0,0,0,0.1);
        &:focus { outline: none; }
      }
      .add-btn {
        width: 28px; height: 28px; border: 2px solid #1a1a1a; background: #fff; display: flex; align-items: center; justify-content: center;
        box-shadow: 2px 2px 0px #1a1a1a;
        &:hover { background: #E8F4F8; }
        &:active { box-shadow: 0px 0px 0px #1a1a1a; transform: translate(2px, 2px); }
      }
    }
  }

  // 像素風 (Pixel Art)
  &.pixel {
    padding: 30px 12px 12px;
    background: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px),
                      linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    border: 4px solid #F4A2C5;
    border-radius: 8px;
    box-shadow: 4px 4px 0px #F5C6DA;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;
    position: relative;

    &::before {
      content: 'TODO.EXE';
      position: absolute;
      top: -4px; right: -4px; left: -4px;
      height: 24px;
      background: #F4A2C5;
      color: white;
      font-size: 12px;
      line-height: 24px;
      padding-left: 8px;
      font-weight: bold;
      border: 4px solid #F4A2C5;
    }

    .sticky-header .title-input {
      width: 100%; border: none; background: white; border: 2px dashed #EAA3C5; padding: 4px; font-family: inherit; font-size: 16px; font-weight: bold; align-self: center; margin-bottom: 8px; color: #d06d9a;
      &:focus { outline: none; border-style: solid; }
    }

    .todo-list {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
    }

    .todo-item {
      display: flex; align-items: center; gap: 8px; padding: 6px; background: white;
      border: 2px solid #EAA3C5; border-radius: 4px; box-shadow: 2px 2px 0px #F5C6DA;
      
      .check-btn {
        width: 16px; height: 16px; min-width: 16px; border: 2px solid #EAA3C5; background: #FFF1F5; display: flex; align-items: center; justify-content: center; color: transparent;
      }
      .item-text { flex: 1; font-size: 14px; color: #d06d9a; font-weight: 600; }
      .remove-btn {
        opacity: 0; background: none; border: none; color: #F4A2C5; font-size: 14px; width: 20px; height: 20px;
        &:hover { color: #f43f5e; }
      }
      &:hover .remove-btn { opacity: 1; }

      &.done {
        .check-btn { background: #A7F3D0; color: #10B981; }
        .item-text { text-decoration: line-through; opacity: 0.5; }
      }
    }

    .add-item {
      display: flex; gap: 6px; margin-top: 8px;
      input {
        flex: 1; border: 2px solid #EAA3C5; background: white; padding: 6px; font-family: inherit; color: #d06d9a;
        &:focus { outline: none; }
      }
      .add-btn {
        width: 30px; height: 30px; border: 2px solid #EAA3C5; background: #93E2B6; color: white; display: flex; align-items: center; justify-content: center;
        box-shadow: 2px 2px 0px #F5C6DA;
        &:active { box-shadow: none; transform: translate(2px, 2px); }
      }
    }
  }
}

// 小尺寸響應式調整
@container (max-height: 150px) {
  .sticky-header {
    margin-bottom: 4px;

    .title-input {
      font-size: 12px;
    }
  }

  .todo-list {
    gap: 2px;
  }

  .todo-item {
    padding: 2px 0;
    gap: 4px;

    .check-btn {
      width: 14px;
      height: 14px;
      min-width: 14px;
    }

    .item-text {
      font-size: 10px;
    }
  }

  .add-item {
    margin-top: 4px;
    padding-top: 4px;
    gap: 4px;

    input {
      padding: 4px 6px;
      font-size: 10px;
    }

    .add-btn {
      width: 22px;
      height: 22px;
      min-width: 22px;
    }
  }
}

@container (max-width: 140px) {
  .sticky-header .title-input {
    font-size: 11px;
  }

  .todo-item {
    gap: 4px;

    .check-btn {
      width: 14px;
      height: 14px;
      min-width: 14px;
    }

    .item-text {
      font-size: 10px;
    }

    .remove-btn {
      display: none;
    }
  }

  .add-item {
    .add-btn {
      width: 24px;
      height: 24px;
      min-width: 24px;
    }
  }
}

// 極小尺寸：隱藏新增區域，只顯示列表
@container (max-height: 100px) {
  .add-item {
    display: none;
  }
}
</style>
