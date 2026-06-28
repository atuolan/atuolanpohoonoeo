<script setup lang="ts">
import { useLorebooksStore } from "@/stores/lorebooks";
import type { WidgetCustomStyle } from "@/types";
import { Book, BookOpen, MoreHorizontal } from "lucide-vue-next";
import { computed, onMounted } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
  };
}>();

const lorebooksStore = useLorebooksStore();

// 預設書籍顏色
const bookColors = [
  "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%)",
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
];

// 從 store 獲取實際世界書，最多顯示 7 本
const books = computed(() => {
  return lorebooksStore.lorebooks.slice(0, 7).map((lorebook, index) => ({
    id: lorebook.id,
    title: lorebook.name,
    shortTitle: lorebook.name.length > 4 ? lorebook.name.substring(0, 4) + '...' : lorebook.name,
    cover: bookColors[index % bookColors.length],
    entryCount: lorebook.entries.length,
  }));
});

const currentBook = computed(() => books.value[0] || null);

// 獲取當前佈局風格，默認為 'shelf'
const currentLayout = computed(
  () => props.data?.customStyle?.layout || "shelf",
);

// 自定義樣式
const containerStyle = computed(() => {
  const style = props.data?.customStyle;
  if (!style) return {};

  if (style.layout === "pearl") {
    return {};
  }

  const result: Record<string, string> = {};
  if (style.backgroundGradient) {
    result.background = style.backgroundGradient;
  } else if (style.backgroundColor) {
    result.background = style.backgroundColor;
  }
  if (style.borderColor) {
    result.borderColor = style.borderColor;
    result.borderWidth = `${style.borderWidth || 2}px`;
    result.borderStyle = "solid";
  }
  return result;
});

const textStyle = computed(() => {
  const style = props.data?.customStyle;
  if (style?.layout === "pearl") return {};
  if (style?.textColor) return { color: style.textColor };
  if (style?.foregroundColor) return { color: style.foregroundColor };
  return {};
});

// 載入世界書
onMounted(() => {
  if (lorebooksStore.lorebooks.length === 0) {
    lorebooksStore.loadLorebooks();
  }
});
</script>

<template>
  <div
    class="world-book-container"
    :style="containerStyle"
    :class="currentLayout"
  >
    <!-- 風格 1: Shelf (書架模式 - 預設) -->
    <template v-if="currentLayout === 'shelf'">
      <div class="shelf-header">
        <span class="shelf-title" :style="textStyle">我的世界書</span>
        <button class="more-btn"><MoreHorizontal :size="16" /></button>
      </div>
      <div class="bookshelf">
        <template v-if="books.length > 0">
          <div
            v-for="book in books"
            :key="book.id"
            class="book-spine"
            :style="{ background: book.cover }"
          >
            <span class="book-spine-title">{{ book.shortTitle }}</span>
          </div>
        </template>
        <div v-else class="empty-shelf">
          <Book :size="24" />
          <span>尚無世界書</span>
        </div>
      </div>
      <div class="shelf-wood"></div>
    </template>

    <!-- 風格 2: Featured (精選模式) -->
    <template v-else-if="currentLayout === 'featured'">
      <div class="featured-content">
        <template v-if="currentBook">
          <div class="book-cover-3d" :style="{ background: currentBook.cover }">
            <div class="book-binding"></div>
            <div class="book-face">
              <BookOpen :size="32" color="white" style="opacity: 0.8" />
              <span class="cover-title">{{ currentBook.title }}</span>
            </div>
          </div>
          <div class="book-info">
            <span class="info-label" :style="textStyle">世界書</span>
            <span class="info-title" :style="textStyle">{{
              currentBook.title
            }}</span>
            <div class="entry-count">
              <Book :size="12" />
              <span>{{ currentBook.entryCount }} 條目</span>
            </div>
          </div>
        </template>
        <div v-else class="empty-featured">
          <Book :size="32" />
          <span>尚無世界書</span>
        </div>
      </div>
    </template>

    <!-- 風格 3: Icon (圖標模式 - 仿 App) -->
    <template v-else-if="currentLayout === 'icon'">
      <div class="icon-layout">
        <div class="app-icon-bg">
          <Book :size="28" color="white" />
        </div>
        <span class="app-label" :style="textStyle">世界書</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.world-book-container {
  width: 100%;
  height: 100%;
  background-color: white;
  border: 2px solid #1a1a1a;
  border-radius: 16px;
  box-shadow: 3px 3px 0px #1a1a1a;
  color: #1a1a1a;
  overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  
  &:hover {
    transform: translate(-1px, -1px);
    box-shadow: 4px 4px 0px #1a1a1a;
  }

  &.has-custom-bg {
    box-shadow: 3px 3px 0px rgba(0, 0, 0, 0.8);
  }

  // Shelf 樣式
  &.shelf {
    padding: 16px;
    display: flex;
    flex-direction: column;
    background-color: rgba(252, 231, 243, 0.5); // 改為半透明，讓自訂背景更好透出

    .shelf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;

      .shelf-title {
        font-size: 16px;
        font-weight: 900;
        color: #1a1a1a;
        background: white;
        padding: 4px 12px;
        border-radius: 12px;
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
      }

      .more-btn {
        opacity: 1;
        background: white;
        border-radius: 8px;
        border: 2px solid #1a1a1a;
        box-shadow: 2px 2px 0px #1a1a1a;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        
        &:hover {
          transform: translate(-1px, -1px);
          box-shadow: 3px 3px 0px #1a1a1a;
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px #1a1a1a;
        }
      }
    }

    .bookshelf {
      flex: 1;
      display: flex;
      align-items: flex-end;
      gap: 6px;
      padding-bottom: 4px;
      overflow-x: auto;
      
      &::-webkit-scrollbar {
        height: 6px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: #1a1a1a;
        border-radius: 3px;
      }

      .book-spine {
        width: 28px;
        height: 85%;
        border-radius: 4px 4px 2px 2px;
        border: 2px solid #1a1a1a;
        position: relative;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        box-shadow:
          2px 2px 0px #1a1a1a,
          inset 2px 0 0 rgba(255, 255, 255, 0.25),
          inset -2px 0 0 rgba(0, 0, 0, 0.15);
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;
        overflow: hidden;

        &::before {
          content: '';
          position: absolute;
          top: 6px;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(255, 255, 255, 0.6);
          box-shadow: 0 4px 0 rgba(255, 255, 255, 0.6);
        }

        &::after {
          content: '';
          position: absolute;
          bottom: 8px;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(255, 255, 255, 0.6);
        }

        &:hover {
          transform: translateY(-10px) rotate(-2deg);
          box-shadow:
            4px 6px 0px rgba(26, 26, 26, 0.8),
            inset 2px 0 0 rgba(255, 255, 255, 0.25),
            inset -2px 0 0 rgba(0, 0, 0, 0.15);
        }

        &:nth-child(even) {
          height: 90%;
        }
        &:nth-child(3n) {
          height: 80%;
        }

        .book-spine-title {
          writing-mode: vertical-rl;
          font-size: 11px;
          font-weight: 800;
          color: white;
          text-shadow: 1px 1px 0px #1a1a1a, -1px -1px 0px #1a1a1a, 1px -1px 0px #1a1a1a, -1px 1px 0px #1a1a1a;
          letter-spacing: 2px;
          white-space: nowrap;
          overflow: hidden;
          max-height: 90%;
          text-overflow: ellipsis;
        }
      }

      .empty-shelf {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 100%;
        gap: 6px;
        opacity: 0.6;
        color: #1a1a1a;

        span {
          font-size: 13px;
          font-weight: 700;
        }
      }
    }

    .shelf-wood {
      height: 14px;
      background: linear-gradient(to bottom, #fcd34d 0%, #d97706 100%);
      border: 2px solid #1a1a1a;
      border-radius: 4px;
      margin-top: -2px;
      z-index: 10;
      position: relative;
      box-shadow:
        0px 4px 0px rgba(0,0,0,0.15),
        inset 0 2px 0 rgba(255,255,255,0.4);
      
      &::before {
        content: '';
        position: absolute;
        top: -5px;
        left: -2px;
        right: -2px;
        height: 4px;
        background: #fde68a;
        border: 2px solid #1a1a1a;
        border-bottom: none;
        border-radius: 4px 4px 0 0;
        z-index: -1;
      }
    }
  }

  // Featured 樣式
  &.featured {
    padding: 16px;
    background-color: #fdfbfb;
    background-image: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%);
    display: flex;
    align-items: center;
    gap: 16px;

    .featured-content {
      display: flex;
      align-items: center;
      gap: 16px;
      width: 100%;
    }

    .book-cover-3d {
      width: 60px;
      height: 80px;
      border-radius: 4px 8px 8px 4px;
      box-shadow:
        4px 4px 12px rgba(0, 0, 0, 0.15),
        inset 2px 0 4px rgba(255, 255, 255, 0.3);
      position: relative;
      transform: perspective(500px) rotateY(-15deg);
      transition: transform 0.3s;
      flex-shrink: 0;

      &:hover {
        transform: perspective(500px) rotateY(0deg) scale(1.05);
      }

      .book-binding {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 6px;
        background: rgba(0, 0, 0, 0.1);
        border-radius: 4px 0 0 4px;
      }

      .book-face {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 4px;
        text-align: center;

        .cover-title {
          font-size: 8px;
          color: white;
          font-weight: 700;
          margin-top: 4px;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
          line-height: 1.2;
        }
      }
    }

    .book-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;

      .info-label {
        font-size: 10px;
        opacity: 0.6;
        margin-bottom: 2px;
      }

      .info-title {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 8px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .entry-count {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        opacity: 0.6;
      }
    }

    .empty-featured {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      gap: 8px;
      opacity: 0.5;

      span {
        font-size: 12px;
      }
    }
  }

  // 珍珠畫廊風
  &.pearl {
    background: linear-gradient(155deg, #3E3A58 0%, #332D4B 100%);
    border: 2px solid #FFCE05;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(51, 45, 75, 0.45), inset 0 0 0 1px rgba(255, 206, 5, 0.18);
    padding: 16px;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 10px;
      right: 12px;
      width: 7px;
      height: 7px;
      background: radial-gradient(circle, rgba(255, 206, 5, 0.95) 0%, transparent 70%);
      box-shadow:
        0 0 6px 2px rgba(255, 206, 5, 0.5),
        -45px 25px 0 -2px rgba(71, 131, 222, 0.85),
        -45px 25px 6px 0 rgba(71, 131, 222, 0.4),
        18px 38px 0 -3px rgba(255, 198, 174, 0.75),
        18px 38px 5px -1px rgba(255, 198, 174, 0.35);
      border-radius: 50%;
      z-index: 0;
      pointer-events: none;
    }

    .shelf-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;

      .shelf-title {
        font-family: Georgia, 'Times New Roman', serif;
        font-style: italic;
        color: #F8F6F0;
        font-size: 16px;
        background: transparent;
        border: none;
        box-shadow: none;
        padding: 0;
      }

      .more-btn {
        background: transparent;
        border: none;
        color: #F8F6F0;
        &:hover {
          color: #FFCE05;
        }
      }
    }

    .bookshelf {
      flex: 1;
      display: flex;
      gap: 6px;
      padding-bottom: 4px;
      overflow-x: auto;
      align-items: flex-end;
      position: relative;
      z-index: 1;

      &::-webkit-scrollbar {
        height: 4px;
      }
      &::-webkit-scrollbar-thumb {
        background: rgba(255, 206, 5, 0.3);
        border-radius: 4px;
      }

      .book-spine {
        width: 24px;
        height: 80%;
        border-radius: 2px 2px 0 0;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: inset -2px 0 4px rgba(0, 0, 0, 0.2);
        writing-mode: vertical-rl;
        text-orientation: mixed;
        border: 1px solid rgba(255, 206, 5, 0.3);
        border-bottom: none;

        .book-spine-title {
          font-family: Georgia, serif;
          font-size: 10px;
          color: #F8F6F0;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
          white-space: nowrap;
        }
      }

      .empty-shelf {
        width: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 6px;
        color: #D4C8B0;
        opacity: 0.8;

        span {
          font-family: Georgia, serif;
          font-style: italic;
          font-size: 13px;
        }
      }
    }

    .shelf-wood {
      height: 6px;
      background: rgba(71, 131, 222, 0.3);
      border-radius: 3px;
      margin-top: 0;
      position: relative;
      z-index: 1;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 206, 5, 0.2);

      &::before {
        display: none;
      }
    }
  }

  // Icon 樣式
  &.icon {
    background: transparent;
    box-shadow: none;
    border: none;
    backdrop-filter: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;

    .icon-layout {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
    }

    .app-icon-bg {
      width: 100%;
      aspect-ratio: 1;
      max-width: 64px;
      background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(67, 233, 123, 0.3);
      transition: transform 0.2s;

      &:hover {
        transform: scale(1.05);
      }
    }

    .app-label {
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      text-shadow: 0 1px 2px rgba(255, 255, 255, 0.8);
    }
  }
}
</style>
