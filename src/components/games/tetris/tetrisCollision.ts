// src/components/games/tetris/tetrisCollision.ts

/**
 * 🎮 俄罗斯方块 - 碰撞检测系统
 *
 * 第三阶段：实现完整的碰撞检测逻辑
 * - 边界检测
 * - 方块碰撞检测
 * - 旋转碰撞检测
 * - 有效移动验证
 */

import { GRID_HEIGHT, GRID_WIDTH } from './tetrisConstants';
import type { GameGrid, Piece } from './tetrisTypes';

/**
 * 检测方块是否与网格发生碰撞
 * @param piece 要检测的方块
 * @param grid 游戏网格
 * @returns true = 发生碰撞，false = 没有碰撞
 */
export function checkCollision(piece: Piece, grid: GameGrid): boolean {
  const shape = piece.shape;

  // 遍历方块的 4x4 矩阵
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      // 如果这个位置有方块
      if (shape[row][col]) {
        // 计算在游戏板上的实际位置
        const gridX = piece.x + col;
        const gridY = piece.y + row;

        // 检测 1: 左边界
        if (gridX < 0) {
          return true;
        }

        // 检测 2: 右边界
        if (gridX >= GRID_WIDTH) {
          return true;
        }

        // 检测 3: 底部边界
        if (gridY >= GRID_HEIGHT) {
          return true;
        }

        // 检测 4: 顶部边界（方块刚生成时可以在顶部上方）
        // 只有当方块向下移动到网格内时才检测顶部
        if (gridY < 0) {
          continue; // 允许方块在顶部上方
        }

        // 检测 5: 与已固定的方块碰撞
        if (grid[gridY][gridX] !== 0) {
          return true;
        }
      }
    }
  }

  // 没有碰撞
  return false;
}

/**
 * 检测方块是否可以向指定方向移动
 * @param piece 当前方块
 * @param grid 游戏网格
 * @param deltaX X 方向的偏移量（-1=左，1=右，0=不移动）
 * @param deltaY Y 方向的偏移量（1=下，0=不移动）
 * @returns true = 可以移动，false = 不能移动
 */
export function canMove(piece: Piece, grid: GameGrid, deltaX: number, deltaY: number): boolean {
  // 创建一个临时方块，应用移动
  const testPiece: Piece = {
    ...piece,
    x: piece.x + deltaX,
    y: piece.y + deltaY,
  };

  // 检测移动后是否会碰撞
  return !checkCollision(testPiece, grid);
}

/**
 * 检测方块是否可以旋转到指定状态
 * @param piece 当前方块
 * @param grid 游戏网格
 * @param newRotation 新的旋转状态 (0-3)
 * @param newShape 新旋转状态对应的形状矩阵
 * @returns true = 可以旋转，false = 不能旋转
 */
export function canRotate(piece: Piece, grid: GameGrid, newRotation: 0 | 1 | 2 | 3, newShape: number[][]): boolean {
  // 创建一个临时方块，应用旋转
  const testPiece: Piece = {
    ...piece,
    rotation: newRotation,
    shape: newShape,
  };

  // 检测旋转后是否会碰撞
  return !checkCollision(testPiece, grid);
}

/**
 * 尝试使用 SRS (Super Rotation System) 墙踢进行旋转
 * @param piece 当前方块
 * @param grid 游戏网格
 * @param newRotation 新的旋转状态
 * @param newShape 新旋转状态对应的形状矩阵
 * @param wallKicks 墙踢数据（偏移量数组）
 * @returns 如果可以旋转，返回调整后的方块；否则返回 null
 */
export function tryRotateWithWallKick(
  piece: Piece,
  grid: GameGrid,
  newRotation: 0 | 1 | 2 | 3,
  newShape: number[][],
  wallKicks: number[][],
): Piece | null {
  // 尝试每个墙踢偏移量
  for (const [offsetX, offsetY] of wallKicks) {
    const testPiece: Piece = {
      ...piece,
      x: piece.x + offsetX,
      y: piece.y + offsetY,
      rotation: newRotation,
      shape: newShape,
    };

    // 如果这个偏移量不会碰撞，返回调整后的方块
    if (!checkCollision(testPiece, grid)) {
      return testPiece;
    }
  }

  // 所有墙踢尝试都失败
  return null;
}

/**
 * 检测方块是否已经到达底部（下一步会碰撞）
 * @param piece 当前方块
 * @param grid 游戏网格
 * @returns true = 已到底部，false = 还可以下落
 */
export function isAtBottom(piece: Piece, grid: GameGrid): boolean {
  return !canMove(piece, grid, 0, 1);
}

/**
 * 计算方块如果硬降（直接降到底）的 Y 坐标
 * @param piece 当前方块
 * @param grid 游戏网格
 * @returns 硬降后的 Y 坐标
 */
export function getHardDropY(piece: Piece, grid: GameGrid): number {
  let testY = piece.y;

  // 不断向下移动，直到碰撞
  while (canMove({ ...piece, y: testY }, grid, 0, 1)) {
    testY++;
  }

  return testY;
}

/**
 * 获取幽灵方块（显示硬降位置）
 * @param piece 当前方块
 * @param grid 游戏网格
 * @returns 幽灵方块（与当前方块相同，但 Y 坐标是硬降位置）
 */
export function getGhostPiece(piece: Piece, grid: GameGrid): Piece {
  return {
    ...piece,
    y: getHardDropY(piece, grid),
  };
}

/**
 * 检测游戏是否结束（新方块刚生成就碰撞）
 * @param piece 刚生成的方块
 * @param grid 游戏网格
 * @returns true = 游戏结束，false = 可以继续
 */
export function isGameOver(piece: Piece, grid: GameGrid): boolean {
  return checkCollision(piece, grid);
}

/**
 * 获取方块在网格上占据的所有坐标
 * @param piece 方块
 * @returns 坐标数组 [{x, y}, ...]
 */
export function getPieceBlocks(piece: Piece): Array<{ x: number; y: number }> {
  const blocks: Array<{ x: number; y: number }> = [];
  const shape = piece.shape;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      if (shape[row][col]) {
        blocks.push({
          x: piece.x + col,
          y: piece.y + row,
        });
      }
    }
  }

  return blocks;
}

/**
 * 检测指定位置是否在网格范围内
 * @param x X 坐标
 * @param y Y 坐标
 * @returns true = 在范围内，false = 超出范围
 */
export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

/**
 * 检测指定位置是否为空（没有固定的方块）
 * @param x X 坐标
 * @param y Y 坐标
 * @param grid 游戏网格
 * @returns true = 为空，false = 有方块
 */
export function isEmpty(x: number, y: number, grid: GameGrid): boolean {
  if (!isInBounds(x, y)) {
    return false;
  }
  return grid[y][x] === 0;
}
