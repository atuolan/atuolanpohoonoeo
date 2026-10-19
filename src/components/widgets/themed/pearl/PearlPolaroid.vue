<script setup lang="ts">
// 珍珠畫廊的拍立得：金框油畫。沒照片時是夜空藍的畫布，有照片時照片填滿畫作區
import { ImagePlus, X } from "lucide-vue-next";
import type { ThemedPolaroidProps } from "../types";

const props = defineProps<ThemedPolaroidProps>();
const emit = defineEmits<{
  pick: [];
  clear: [];
  "update:caption": [value: string];
}>();
</script>

<template>
  <div class="pearl-polaroid">
    <!-- 金色畫框 -->
    <div class="pearl-polaroid__frame">
      <!-- 畫布卡紙（內陰影） -->
      <div class="pearl-polaroid__paper">
        <div class="pearl-polaroid__canvas">
          <button
            type="button"
            class="pearl-polaroid__pick"
            :aria-label="props.imageUrl ? '更換照片' : '上傳照片'"
            @click="emit('pick')"
          >
            <img
              v-if="props.imageUrl"
              :src="props.imageUrl"
              alt=""
              class="pearl-polaroid__image"
              draggable="false"
            />
            <span v-else class="pearl-polaroid__empty">
              <ImagePlus class="pearl-polaroid__empty-icon" :stroke-width="1.7" />
              <span class="pearl-polaroid__empty-text">點擊上傳照片</span>
            </span>
          </button>

          <button
            v-if="props.imageUrl"
            type="button"
            class="pearl-polaroid__clear"
            aria-label="清除照片"
            @click.stop="emit('clear')"
          >
            <X :size="14" :stroke-width="2" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 根元素填滿格子；容器單位用來縮放圖示
.pearl-polaroid {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  container-type: size;

  // 金框：外層金色漸層，外投影
  &__frame {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    padding: 5%;
    display: flex;
    flex-direction: column;
    background: linear-gradient(135deg, #e8cf8e 0%, #b8913f 40%, #e2c67e 65%, #8e6a28 100%);
    box-shadow: inset 0 0 0 1px #fff3d088, 0 20px 30px -14px #000000dd;
  }

  // 卡紙：米白底 + 內陰影
  &__paper {
    flex: 1;
    min-height: 0;
    box-sizing: border-box;
    padding: 6%;
    display: flex;
    flex-direction: column;
    background: #f3eee2;
    box-shadow: inset 0 2px 6px #00000033;
  }

  // 畫作區，填滿剩餘空間
  &__canvas {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  // 整個畫作區都可點，icon-only 清除鈕另外處理
  &__pick {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(60% 40% at 70% 30%, #e9c46a55 0%, #e9c46a00 70%),
      linear-gradient(160deg, #3e6fb8 0%, #2f4e8c 55%, #1e2a4a 100%);
    color: #f3eee2;
    cursor: pointer;
  }

  &__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  // 圖示隨格子寬度縮放，最大 28px
  &__empty-icon {
    width: min(14cqw, 28px);
    height: min(14cqw, 28px);
  }

  &__empty-text {
    font-family: "Noto Serif TC", serif;
    font-size: 12px;
    letter-spacing: 0.1em;
  }

  // 清除鈕：深紫半透明圓鈕，觸控區 32px
  &__clear {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: #2b2840cc;
    color: #f3eee2;
    cursor: pointer;
    // 手機上不常駐（會擋住照片），點照片就能換；有滑鼠的裝置滑過照片才出現
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s;

    @media (hover: hover) and (pointer: fine) {
      .pearl-polaroid__canvas:hover & {
        opacity: 1;
        pointer-events: auto;
      }
    }

    &:focus-visible {
      opacity: 1;
      pointer-events: auto;
    }
  }
}
</style>
