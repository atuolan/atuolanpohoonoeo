<script setup lang="ts">
// Y2K 版型：「我的相片」視窗。照片區點擊 emit pick，清除鈕 emit clear。
import { computed } from "vue";
import { ImagePlus, X } from "lucide-vue-next";
import type { ThemedPolaroidProps } from "../types";

const props = defineProps<ThemedPolaroidProps>();
defineEmits<{
  pick: [];
  clear: [];
  "update:caption": [value: string];
}>();

// 使用者設定的文字色只套在「點擊上傳照片」提示上，標題列維持白字以保持對比
const hintStyle = computed(() => (props.color ? { color: props.color } : undefined));
</script>

<template>
  <div class="y2kp">
    <div class="y2kp-win">
      <div class="y2kp-bar">
        <span class="y2kp-title">我的相片</span>
        <span class="y2kp-dots" aria-hidden="true">
          <i class="is-yellow" />
          <i class="is-green" />
          <i class="is-pink" />
        </span>
      </div>

      <div class="y2kp-stage">
        <button
          type="button"
          class="y2kp-pick"
          :aria-label="imageUrl ? '更換照片' : '上傳照片'"
          @click="$emit('pick')"
        >
          <img v-if="imageUrl" :src="imageUrl" alt="" class="y2kp-img" />
          <template v-else>
            <ImagePlus class="y2kp-plus" aria-hidden="true" />
            <span class="y2kp-hint" :style="hintStyle">點擊上傳照片</span>
          </template>
        </button>
        <button
          v-if="imageUrl"
          type="button"
          class="y2kp-clear"
          aria-label="清除照片"
          @click.stop="$emit('clear')"
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
// 160×160 的方格，尺寸以 cqmin 為基準（格子是正方形）
.y2kp {
  container-type: size;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  font-family: "Noto Sans TC", sans-serif;
}

.y2kp-win {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 7.5cqmin;
  border: 1px solid #FFFFFF;
  background: rgba(255, 255, 255, 0.5);
  box-shadow: 0 12px 24px -14px rgba(60, 40, 120, 0.6);
}

// 標題列：藍紫漸層，26px 高
.y2kp-bar {
  flex: 0 0 auto;
  height: 16.25cqmin;
  padding: 0 5cqmin;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(90deg, #8FB2FF 0%, #C29BFF 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  color: #FFFFFF;
  font-size: 6.9cqmin;
  font-weight: 700;
  text-shadow: 0 1px 1px rgba(60, 40, 120, 0.5);
}

.y2kp-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

// 三顆小圓鈕（裝飾）
.y2kp-dots {
  display: flex;
  gap: 2.5cqmin;
  flex-shrink: 0;

  i {
    display: block;
    width: 5.6cqmin;
    height: 5.6cqmin;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.67);
  }

  .is-yellow { background: #FFD86B; }
  .is-green { background: #7FE3A0; }
  .is-pink { background: #FF8FB8; }
}

.y2kp-stage {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  margin: 3.75cqmin;
  border-radius: 3.75cqmin;
  overflow: hidden;
}

// 棋盤格底：兩層 45 度斜線漸層，16px 方格
.y2kp-pick {
  width: 100%;
  height: 100%;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #6A5A9A;
  background-color: #FFFFFF;
  background-image:
    linear-gradient(45deg, #EFEAFB 25%, transparent 25%, transparent 75%, #EFEAFB 75%),
    linear-gradient(45deg, #EFEAFB 25%, transparent 25%, transparent 75%, #EFEAFB 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}

.y2kp-plus {
  width: 17.5cqmin;
  height: 17.5cqmin;
}

.y2kp-hint {
  font-size: 7.5cqmin;
  font-weight: 500;
  white-space: nowrap;
}

.y2kp-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

// 清除鈕：照片右上角的深紫小圓鈕，直徑約 35px
.y2kp-clear {
  position: absolute;
  top: 4cqmin;
  right: 4cqmin;
  width: 22cqmin;
  height: 22cqmin;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(45, 27, 78, 0.7);
  color: #FFFFFF;
  // 手機上不常駐（會擋住照片），點照片就能換；有滑鼠的裝置滑過照片才出現
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;

  svg {
    width: 12cqmin;
    height: 12cqmin;
  }

  @media (hover: hover) and (pointer: fine) {
    .y2kp-stage:hover & {
      opacity: 1;
      pointer-events: auto;
    }
  }

  &:focus-visible {
    opacity: 1;
    pointer-events: auto;
  }
}
</style>
