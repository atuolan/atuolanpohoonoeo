<template>
  <div class="tetris-board-container" ref="containerRef">
    <!-- 遊戲板 -->
    <div class="tetris-board" :style="boardStyle">
      <!-- 背景網格 -->
      <div class="grid-background">
        <div v-for="(row, y) in grid" :key="'row-' + y" class="grid-row">
          <div
            v-for="(cell, x) in row"
            :key="'cell-' + x"
            class="grid-cell"
            :class="getCellClass(cell)"
            :style="getCellStyle(cell)"
          ></div>
        </div>
      </div>

      <!-- 幽靈方塊層（下落預覽） -->
      <div v-if="ghostPiece" class="ghost-layer">
        <div
          v-for="(block, index) in getGhostPieceBlocks()"
          :key="'ghost-' + index"
          class="ghost-block"
          :style="getGhostBlockStyle(block.x, block.y, ghostPiece.color)"
        ></div>
      </div>

      <!-- 目前下落方塊層 -->
      <div v-if="currentPiece" class="piece-layer">
        <div
          v-for="(block, index) in getCurrentPieceBlocks()"
          :key="'current-' + index"
          class="piece-block"
          :style="getBlockStyle(block.x, block.y, currentPiece.color)"
        ></div>
      </div>
    </div>

    <!-- 偵錯資訊（可選） -->
    <div v-if="showDebug" class="debug-info">
      <div class="debug-row">
        <span class="label">網格大小：</span>
        <span class="value">{{ GRID_WIDTH }} × {{ GRID_HEIGHT }}</span>
      </div>
      <div v-if="currentPiece" class="debug-row">
        <span class="label">目前方塊：</span>
        <span class="value">{{ currentPiece.type }} ({{ currentPiece.x }}, {{ currentPiece.y }})</span>
      </div>
      <div v-if="currentPiece" class="debug-row">
        <span class="label">旋轉狀態：</span>
        <span class="value">{{ currentPiece.rotation }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { GameGrid, Piece } from './tetrisTypes';
import { GRID_WIDTH, GRID_HEIGHT, PIECE_COLORS } from './tetrisConstants';

// Props
interface Props {
  /** 游戏网格 */
  grid: GameGrid;

  /** 当前方块 */
  currentPiece?: Piece | null;

  /** 幽灵方块（下落预览） */
  ghostPiece?: Piece | null;

  /** 单元格大小（像素） */
  cellSize?: number;

  /** 是否显示调试信息 */
  showDebug?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentPiece: null,
  ghostPiece: null,
  cellSize: 24,
  showDebug: false,
});

// 通过 ResizeObserver 测量容器尺寸，计算「最大可容纳的 10:20 框」
// 避免 aspect-ratio + width:100% 在高度受限时溢出底部的问题。
const containerRef = ref<HTMLElement | null>(null);
const fittedSize = ref<{ w: number; h: number }>({ w: 0, h: 0 });

// box-shadow 模拟的外框（3px+5px）共 5px，需要在每一边预留空间
const OUTLINE_RESERVE = 6;
function recomputeSize(width: number, height: number) {
  if (width <= 0 || height <= 0) return;
  const availW = Math.max(0, width - OUTLINE_RESERVE * 2);
  const availH = Math.max(0, height - OUTLINE_RESERVE * 2);
  // 以高度为约束算出的最大宽度
  const widthByHeight = (availH * GRID_WIDTH) / GRID_HEIGHT;
  let w: number;
  let h: number;
  if (widthByHeight <= availW) {
    // 高度是限制因素
    w = widthByHeight;
    h = availH;
  } else {
    // 宽度是限制因素
    w = availW;
    h = (availW * GRID_HEIGHT) / GRID_WIDTH;
  }
  fittedSize.value = {
    w: Math.max(0, Math.floor(w)),
    h: Math.max(0, Math.floor(h)),
  };
}

let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  if (!containerRef.value) return;
  const el = containerRef.value;
  recomputeSize(el.clientWidth, el.clientHeight);
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        recomputeSize(cr.width, cr.height);
      }
    });
    resizeObserver.observe(el);
  } else {
    window.addEventListener('resize', onWindowResize);
  }
});

function onWindowResize() {
  if (!containerRef.value) return;
  recomputeSize(containerRef.value.clientWidth, containerRef.value.clientHeight);
}

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', onWindowResize);
});

// 游戏板样式 - 使用 JS 测算出的固定尺寸，确保始终完整可见
const boardStyle = computed(() => {
  const { w, h } = fittedSize.value;
  const fallbackW = GRID_WIDTH * props.cellSize;
  const fallbackH = GRID_HEIGHT * props.cellSize;
  return {
    '--cell-size': `${props.cellSize}px`,
    '--grid-w': String(GRID_WIDTH),
    '--grid-h': String(GRID_HEIGHT),
    width: `${w > 0 ? w : fallbackW}px`,
    height: `${h > 0 ? h : fallbackH}px`,
  };
});

// 获取单元格类名
function getCellClass(cellValue: number): string {
  if (cellValue === 0) {
    return 'empty';
  }
  return `filled filled-${cellValue}`;
}

// 获取单元格样式
function getCellStyle(cellValue: number): Record<string, string> {
  if (cellValue === 0) {
    return {};
  }

  // 根据 cellValue 获取对应的颜色
  const colorMap: Record<number, string> = {
    1: PIECE_COLORS.I, // 青色
    2: PIECE_COLORS.O, // 黄色
    3: PIECE_COLORS.T, // 紫色
    4: PIECE_COLORS.L, // 橙色
    5: PIECE_COLORS.J, // 蓝色
    6: PIECE_COLORS.S, // 绿色
    7: PIECE_COLORS.Z, // 红色
  };

  return {
    backgroundColor: colorMap[cellValue] || '#cccccc',
  };
}

// 获取当前方块的所有块位置
function getCurrentPieceBlocks(): Array<{ x: number; y: number }> {
  if (!props.currentPiece) {
    return [];
  }

  const blocks: Array<{ x: number; y: number }> = [];
  const shape = props.currentPiece.shape;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (shape[row][col]) {
        blocks.push({
          x: props.currentPiece.x + col,
          y: props.currentPiece.y + row,
        });
      }
    }
  }

  return blocks;
}

// 获取幽灵方块的所有块位置
function getGhostPieceBlocks(): Array<{ x: number; y: number }> {
  if (!props.ghostPiece) {
    return [];
  }

  const blocks: Array<{ x: number; y: number }> = [];
  const shape = props.ghostPiece.shape;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (shape[row][col]) {
        blocks.push({
          x: props.ghostPiece.x + col,
          y: props.ghostPiece.y + row,
        });
      }
    }
  }

  return blocks;
}

// 获取方块样式
function getBlockStyle(x: number, y: number, color: string): Record<string, string> {
  // 使用百分比定位，实现自适应
  const leftPercent = (x / GRID_WIDTH) * 100;
  const topPercent = (y / GRID_HEIGHT) * 100;
  const widthPercent = (1 / GRID_WIDTH) * 100;
  const heightPercent = (1 / GRID_HEIGHT) * 100;
  
  return {
    left: `${leftPercent}%`,
    top: `${topPercent}%`,
    width: `${widthPercent}%`,
    height: `${heightPercent}%`,
    backgroundColor: color,
  };
}

// 取得幽靈方塊樣式：透明底 + 方塊顏色的虛線框
function getGhostBlockStyle(x: number, y: number, color: string): Record<string, string> {
  return {
    ...getBlockStyle(x, y, color),
    backgroundColor: 'transparent',
    borderColor: color,
  };
}
</script>

<style scoped lang="scss">
@use "@/components/games/gameShell" as gs;

.tetris-board-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  // 防止 box-shadow 模拟边框在父级 overflow:hidden 时被裁切
  overflow: hidden;
}

.tetris-board {
  position: relative;
  // 棋盤外框：深色底 + 內距 + 圓角
  background: #23222b;
  padding: 6px;
  border-radius: 16px;
  box-sizing: border-box;
  // 重要：tetris-board 本身作為 grid 容器
  display: grid;
  // 格子間距 1px
  gap: 1px;
  // 自適應網格佈局
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(20, 1fr);
  // 尺寸由 JS (ResizeObserver) 計算並以 inline style 寫入，確保 10:20
  // 框完整容納於父容器內。

  .grid-background {
    // 移除 position: absolute 和 display: grid
    // 让它作为 grid 的直接内容
    display: contents;

    .grid-row {
      display: contents;
    }

    .grid-cell {
      position: relative;
      // 空格：深色底 + 圓角，取代舊的格線樣式
      box-sizing: border-box;
      background: #2c2b36;
      border-radius: 4px;

      &.empty {
        background: #2c2b36;
      }

      &.filled {
        border-radius: 4px;
        box-shadow:
          inset 0 -3px 0 rgba(0, 0, 0, 0.18),
          inset 0 2px 0 rgba(255, 255, 255, 0.25);
      }
    }
  }

  .ghost-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1; // 在网格之上，当前方块之下

    .ghost-block {
      position: absolute;
      box-sizing: border-box;
      // 幽靈方塊：透明底 + 方塊顏色的虛線框
      background: transparent;
      border: 2px dashed currentColor;
      border-radius: 4px;

      // 平滑过渡
      transition:
        left 0.05s ease-out,
        top 0.05s ease-out;
    }
  }

  .piece-layer {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 2; // 在幽灵方块之上

    .piece-block {
      position: absolute;
      box-sizing: border-box;
      border-radius: 4px;
      // 立體感：下方暗邊 + 上方亮邊
      box-shadow:
        inset 0 -3px 0 rgba(0, 0, 0, 0.18),
        inset 0 2px 0 rgba(255, 255, 255, 0.25);

      // 平滑过渡
      transition:
        left 0.05s ease-out,
        top 0.05s ease-out;
    }
  }
}

// 偵錯資訊
.debug-info {
  background: rgba(0, 0, 0, 0.8);
  border-radius: 8px;
  padding: 12px;
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #0f0;
  min-width: 240px;

  .debug-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;

    .label {
      color: #888;
    }

    .value {
      color: #0f0;
      font-weight: bold;
    }
  }
}
</style>
