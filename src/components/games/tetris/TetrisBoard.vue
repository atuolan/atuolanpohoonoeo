<template>
  <div class="tetris-board-container">
    <!-- 游戏板 -->
    <div class="tetris-board" :style="boardStyle">
      <!-- 背景网格 -->
      <div class="grid-background">
        <div v-for="(row, y) in grid" :key="'row-' + y" class="grid-row">
          <div
            v-for="(cell, x) in row"
            :key="'cell-' + x"
            class="grid-cell"
            :class="getCellClass(cell)"
            :style="getCellStyle(cell)"
          >
            <!-- 空单元格显示边框 -->
            <div v-if="cell === 0" class="cell-border"></div>
          </div>
        </div>
      </div>

      <!-- 幽灵方块层（下落预览） -->
      <div v-if="ghostPiece" class="ghost-layer">
        <div
          v-for="(block, index) in getGhostPieceBlocks()"
          :key="'ghost-' + index"
          class="ghost-block"
          :style="getBlockStyle(block.x, block.y, ghostPiece.color)"
        ></div>
      </div>

      <!-- 当前下落方块层 -->
      <div v-if="currentPiece" class="piece-layer">
        <div
          v-for="(block, index) in getCurrentPieceBlocks()"
          :key="'current-' + index"
          class="piece-block"
          :style="getBlockStyle(block.x, block.y, currentPiece.color)"
        ></div>
      </div>
    </div>

    <!-- 调试信息（可选） -->
    <div v-if="showDebug" class="debug-info">
      <div class="debug-row">
        <span class="label">网格大小:</span>
        <span class="value">{{ GRID_WIDTH }} × {{ GRID_HEIGHT }}</span>
      </div>
      <div v-if="currentPiece" class="debug-row">
        <span class="label">当前方块:</span>
        <span class="value">{{ currentPiece.type }} ({{ currentPiece.x }}, {{ currentPiece.y }})</span>
      </div>
      <div v-if="currentPiece" class="debug-row">
        <span class="label">旋转状态:</span>
        <span class="value">{{ currentPiece.rotation }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

// 游戏板样式 - 使用CSS变量实现自适应
const boardStyle = computed(() => ({
  '--cell-size': `${props.cellSize}px`,
  width: '100%',
  maxWidth: `${GRID_WIDTH * props.cellSize}px`,
  aspectRatio: `${GRID_WIDTH} / ${GRID_HEIGHT}`,
}));

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
</script>

<style scoped lang="scss">
.tetris-board-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.tetris-board {
  position: relative;
  background: #1a1a1a;
  // ✅ 使用 box-shadow 替代 border，不占用布局空间
  box-shadow:
    0 0 0 3px #333,
    // 模拟 3px 边框
    0 0 0 5px #000,
    // 外层 2px 黑边
    0 4px 8px rgba(0, 0, 0, 0.3); // 阴影效果
  // 重要：tetris-board 本身作为 grid 容器
  display: grid;
  // 自适应网格布局
  grid-template-columns: repeat(10, 1fr);
  grid-template-rows: repeat(20, 1fr);
  width: 100%;
  box-sizing: border-box;

  .grid-background {
    // 移除 position: absolute 和 display: grid
    // 让它作为 grid 的直接内容
    display: contents;

    .grid-row {
      display: contents;
    }

    .grid-cell {
      position: relative;
      // ✅ 关键：确保边框不会超出单元格
      box-sizing: border-box;
      // 增强网格线条，更清晰
      border: 1px solid rgba(255, 255, 255, 0.08);

      &.empty {
        background: transparent;

        .cell-border {
          position: absolute;
          inset: 0;
          box-sizing: border-box;
          // 轻微内边框
          border: 0.5px solid rgba(255, 255, 255, 0.03);
        }
      }

      &.filled {
        // 扁平风格 - 无渐变
        // 增强边框，让每个方块更清晰
        border: 2px solid rgba(0, 0, 0, 0.5);

        // 轻微内阴影增加质感
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.15),
          inset 2px 2px 4px rgba(255, 255, 255, 0.25),
          inset -2px -2px 4px rgba(0, 0, 0, 0.3);
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
      // 幽灵方块样式：半透明边框
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: transparent;

      // 使用背景色的半透明版本
      opacity: 0.3;

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
      // ✅ 确保边框包含在尺寸内
      box-sizing: border-box;
      // 扁平风格 - 纯色，无渐变
      // 增强边框，与填充方块一致
      border: 2px solid rgba(0, 0, 0, 0.5);

      // 轻微内阴影
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.15),
        inset 2px 2px 4px rgba(255, 255, 255, 0.25),
        inset -2px -2px 4px rgba(0, 0, 0, 0.3);

      // 平滑过渡
      transition:
        left 0.05s ease-out,
        top 0.05s ease-out;
    }
  }
}

// 调试信息
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
