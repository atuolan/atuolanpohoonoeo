// src/components/games/tetris/useTetrisGame.ts

/**
 * 🎮 俄罗斯方块 - 游戏核心逻辑 Composable
 *
 * 第四阶段：基础移动控制
 * 第五阶段：自动下落与方块锁定
 * - 游戏状态管理
 * - 键盘控制
 * - 触摸控制
 * - 方块移动和旋转
 * - 自动下落定时器
 * - 消行检测
 * - 分数和等级系统
 */

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { canMove, canRotate, checkCollision, getGhostPiece, isAtBottom } from './tetrisCollision';
import {
  ALL_PIECE_TYPES,
  BACK_TO_BACK_MULTIPLIER,
  COMBO_BONUS_SCORE,
  DEFAULT_DIFFICULTY,
  GRID_HEIGHT,
  GRID_WIDTH,
  HARD_DROP_SCORE,
  LINE_CLEAR_SCORES,
  LINES_PER_LEVEL,
  LOCK_DELAY,
  PIECE_COLOR_IDS,
  PIECE_SHAPES,
  SOFT_DROP_SCORE,
  SPAWN_X,
  SPAWN_Y,
} from './tetrisConstants';
import { addHighScore, deleteSave, hasSave, loadGame, saveGame } from './tetrisSaveManager';
import type { ClearType, DifficultyConfig, GameGrid, Piece, PieceType, TetrisStatistics } from './tetrisTypes';
import { useTetrisAudio } from './useTetrisAudio';

export function useTetrisGame() {
  // ==================== 音效系统 ====================
  const audio = useTetrisAudio();

  // ==================== 难度配置 ====================
  const currentDifficulty = ref<DifficultyConfig>(DEFAULT_DIFFICULTY);

  // ==================== 游戏状态 ====================
  const grid = ref<GameGrid>(createEmptyGrid());
  const currentPiece = ref<Piece | null>(null);
  const nextPiece = ref<Piece | null>(null);
  const holdPiece = ref<Piece | null>(null); // Hold 暂存的方块
  const canHold = ref(true); // 是否可以使用 Hold（每次锁定后重置为 true）
  const score = ref(0);
  const level = ref(1);
  const lines = ref(0);
  const isPlaying = ref(false);
  const isPaused = ref(false);
  const isGameOver = ref(false);

  // ==================== 统计数据 ====================
  const statistics = ref<TetrisStatistics>({
    score: 0,
    level: 1,
    lines: 0,
    combo: 0,
    maxCombo: 0,
    isBackToBack: false,
    backToBackCount: 0,
    clears: {
      single: 0,
      double: 0,
      triple: 0,
      tetris: 0,
    },
    totalPieces: 0,
    playTime: 0,
    startTime: 0,
  });

  // 上次消行的类型（用于判断 Back-to-Back）
  const lastClearType = ref<ClearType | null>(null);

  // 消行动画状态
  const clearingLines = ref<number[]>([]); // 正在消除的行号

  // ==================== 定时器 ====================
  let dropTimer: number | null = null;
  const dropInterval = ref(1000); // 初始下落间隔（毫秒）
  let lockTimer: number | null = null; // 锁定延迟计时器

  /**
   * 计算当前等级的下落速度（根据难度配置）
   */
  function calculateDropSpeed(): number {
    const { startSpeed, speedIncrease, minSpeed } = currentDifficulty.value;
    return Math.max(minSpeed, startSpeed - (level.value - 1) * speedIncrease);
  }

  // ==================== 辅助函数 ====================

  /**
   * 创建空网格
   */
  function createEmptyGrid(): GameGrid {
    return Array(GRID_HEIGHT)
      .fill(0)
      .map(() => Array(GRID_WIDTH).fill(0));
  }

  /**
   * 随机生成方块类型
   */
  function randomPieceType(): PieceType {
    return ALL_PIECE_TYPES[Math.floor(Math.random() * ALL_PIECE_TYPES.length)];
  }

  /**
   * 创建新方块
   */
  function createPiece(type: PieceType): Piece {
    const shapeData = PIECE_SHAPES[type];
    return {
      type,
      x: SPAWN_X,
      y: SPAWN_Y,
      rotation: 0,
      color: shapeData.color,
      shape: shapeData.rotations[0],
    };
  }

  /**
   * 生成下一个方块
   */
  function spawnNextPiece(): void {
    // 如果有 nextPiece，基于它创建新的 currentPiece
    if (nextPiece.value) {
      // ✅ 创建新对象，避免直接赋值导致引用问题
      currentPiece.value = {
        type: nextPiece.value.type,
        x: SPAWN_X,
        y: SPAWN_Y,
        rotation: 0, // 重置旋转状态
        color: nextPiece.value.color,
        shape: PIECE_SHAPES[nextPiece.value.type].rotations[0], // 重置为初始形状
      };
    } else {
      // 游戏刚开始，创建第一个方块
      currentPiece.value = createPiece(randomPieceType());
    }

    // 生成新的 nextPiece
    nextPiece.value = createPiece(randomPieceType());

    // 检测游戏是否结束（新方块刚生成就碰撞）
    if (currentPiece.value && checkCollision(currentPiece.value, grid.value)) {
      gameOver();
    }
  }

  /**
   * 检测并清除完整的行
   * @returns 清除的行数
   */
  function clearLines(): number {
    let linesCleared = 0;
    const newGrid: GameGrid = [];

    // 从底部向上检查每一行
    for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
      const row = grid.value[y];
      const isComplete = row.every(cell => cell !== 0);

      if (!isComplete) {
        // 保留未完成的行
        newGrid.unshift(row);
      } else {
        // 完整的行被清除
        linesCleared++;
      }
    }

    // 在顶部添加新的空行
    while (newGrid.length < GRID_HEIGHT) {
      newGrid.unshift(Array(GRID_WIDTH).fill(0));
    }

    grid.value = newGrid;
    return linesCleared;
  }

  /**
   * 更新分数和等级
   * @param linesCleared 清除的行数
   */
  function updateScore(linesCleared: number): void {
    if (linesCleared === 0) {
      // 没有消行，连击中断
      statistics.value.combo = 0;
      lastClearType.value = null;
      return;
    }

    // 播放消行音效
    if (linesCleared === 4) {
      audio.playTetris(); // Tetris 特殊音效
    } else {
      audio.playClear(linesCleared);
    }

    // 确定清除类型
    const clearType: ClearType =
      linesCleared === 1 ? 'single' : linesCleared === 2 ? 'double' : linesCleared === 3 ? 'triple' : 'tetris';

    // 更新清除次数统计
    statistics.value.clears[clearType]++;

    // 基础分数
    const baseScore = LINE_CLEAR_SCORES[linesCleared] || 0;
    const levelMultiplier = level.value;

    // ✨ Back-to-Back 检测（Triple 和 Tetris 都可以触发）
    let backToBackBonus = 0;
    const isSpecialClear = clearType === 'triple' || clearType === 'tetris';

    if (isSpecialClear) {
      // Triple 或 Tetris
      if (lastClearType.value === 'triple' || lastClearType.value === 'tetris') {
        // 连续特殊消行（Triple → Triple, Triple → Tetris, Tetris → Triple, Tetris → Tetris）
        statistics.value.isBackToBack = true;
        statistics.value.backToBackCount++;
        backToBackBonus = Math.floor(baseScore * (BACK_TO_BACK_MULTIPLIER - 1));
      } else {
        // 第一次特殊消行，重置 B2B 计数
        statistics.value.isBackToBack = false;
        statistics.value.backToBackCount = 0;
      }
    } else {
      // Single 或 Double 消行，中断 B2B
      statistics.value.isBackToBack = false;
      statistics.value.backToBackCount = 0;
    }

    // ✨ Combo 连击奖励
    statistics.value.combo++;
    const comboBonus = statistics.value.combo > 1 ? (statistics.value.combo - 1) * COMBO_BONUS_SCORE : 0;

    // 播放连击音效
    if (statistics.value.combo > 1) {
      audio.playCombo(statistics.value.combo);
    }

    // 更新最高连击
    if (statistics.value.combo > statistics.value.maxCombo) {
      statistics.value.maxCombo = statistics.value.combo;
    }

    // 计算总分（应用难度倍率）
    const totalScore = Math.floor(
      ((baseScore + backToBackBonus) * levelMultiplier + comboBonus) * currentDifficulty.value.scoreMultiplier,
    );
    score.value += totalScore;
    statistics.value.score = score.value;

    // 更新总消除行数
    lines.value += linesCleared;
    statistics.value.lines = lines.value;

    // 记录本次清除类型
    lastClearType.value = clearType;

    // 检查是否升级
    const newLevel = Math.floor(lines.value / LINES_PER_LEVEL) + 1;
    if (newLevel > level.value) {
      level.value = newLevel;
      statistics.value.level = level.value;
      audio.playLevelUp(); // 播放升级音效
      // 更新下落速度
      dropInterval.value = calculateDropSpeed();
      restartDropTimer();
    }
  }

  /**
   * 将当前方块固定到网格
   */
  function lockPiece(): void {
    if (!currentPiece.value) return;

    audio.playLock(); // 播放锁定音效

    const piece = currentPiece.value;
    const shape = piece.shape;

    // 将方块的每个单元格写入网格
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        if (shape[row][col]) {
          const gridX = piece.x + col;
          const gridY = piece.y + row;

          // 只写入在网格范围内的单元格
          if (gridY >= 0 && gridY < GRID_HEIGHT && gridX >= 0 && gridX < GRID_WIDTH) {
            grid.value[gridY][gridX] = PIECE_COLOR_IDS[piece.type];
          }
        }
      }
    }

    // ✨ 统计：增加已放置的方块数
    statistics.value.totalPieces++;

    // ✨ 重置 Hold 权限（方块锁定后可以再次使用 Hold）
    canHold.value = true;

    // 检测并清除完整的行
    const linesCleared = clearLines();

    // 更新分数和等级
    updateScore(linesCleared);

    // 生成下一个方块
    spawnNextPiece();
  }

  // ==================== 移动控制 ====================

  /**
   * 向左移动
   */
  function moveLeft(): boolean {
    if (!currentPiece.value || !isPlaying.value || isPaused.value) return false;

    if (canMove(currentPiece.value, grid.value, -1, 0)) {
      currentPiece.value.x -= 1;
      audio.playMove();
      // 如果成功移动且不在底部，取消锁定延迟
      if (!isAtBottom(currentPiece.value, grid.value)) {
        cancelLockDelay();
      }
      return true;
    }
    return false;
  }

  /**
   * 向右移动
   */
  function moveRight(): boolean {
    if (!currentPiece.value || !isPlaying.value || isPaused.value) return false;

    if (canMove(currentPiece.value, grid.value, 1, 0)) {
      currentPiece.value.x += 1;
      audio.playMove();
      // 如果成功移动且不在底部，取消锁定延迟
      if (!isAtBottom(currentPiece.value, grid.value)) {
        cancelLockDelay();
      }
      return true;
    }
    return false;
  }

  /**
   * 取消锁定延迟
   */
  function cancelLockDelay(): void {
    if (lockTimer !== null) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
  }

  /**
   * 启动锁定延迟
   */
  function startLockDelay(): void {
    cancelLockDelay();
    lockTimer = window.setTimeout(() => {
      lockPiece();
      lockTimer = null;
    }, LOCK_DELAY);
  }

  /**
   * 向下移动（软降）
   */
  function moveDown(): boolean {
    if (!currentPiece.value || !isPlaying.value || isPaused.value) return false;

    if (canMove(currentPiece.value, grid.value, 0, 1)) {
      currentPiece.value.y += 1;
      // 软降加分
      score.value += SOFT_DROP_SCORE;
      // audio.playSoftDrop(); // 已取消下落音效
      // 取消锁定延迟（方块还在移动）
      cancelLockDelay();
      return true;
    } else {
      // 无法继续下落，启动锁定延迟
      if (lockTimer === null) {
        startLockDelay();
      }
      return false;
    }
  }

  /**
   * 旋转方块（顺时针）
   */
  function rotate(): boolean {
    if (!currentPiece.value || !isPlaying.value || isPaused.value) return false;

    const piece = currentPiece.value;
    const newRotation = ((piece.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    const newShape = PIECE_SHAPES[piece.type].rotations[newRotation];

    // 简单旋转检测（不使用 SRS 墙踢）
    if (canRotate(piece, grid.value, newRotation, newShape)) {
      currentPiece.value.rotation = newRotation;
      currentPiece.value.shape = newShape;
      // audio.playRotate(); // 已取消旋转音效
      // 如果成功旋转且不在底部，取消锁定延迟
      if (!isAtBottom(currentPiece.value, grid.value)) {
        cancelLockDelay();
      }
      return true;
    }

    // TODO: 实现 SRS 墙踢（可选优化）
    return false;
  }

  /**
   * 硬降（直接降到底部）
   */
  function hardDrop(): void {
    if (!currentPiece.value || !isPlaying.value || isPaused.value) return;

    let dropDistance = 0;
    // 不断向下移动直到碰撞
    while (canMove(currentPiece.value, grid.value, 0, 1)) {
      currentPiece.value.y += 1;
      dropDistance++;
    }

    // 硬降加分（每格 2 分）
    score.value += dropDistance * HARD_DROP_SCORE;

    audio.playHardDrop();

    // 取消锁定延迟并立即锁定
    cancelLockDelay();
    lockPiece();
  }

  /**
   * Hold 功能 - 暂存当前方块
   * 规则：每次锁定方块后，才能再次使用 Hold
   */
  function holdCurrentPiece(): void {
    // 检查是否可以使用 Hold
    if (!currentPiece.value || !isPlaying.value || isPaused.value || !canHold.value) {
      return;
    }

    audio.playHold();

    if (!holdPiece.value) {
      // Hold 槽为空，直接暂存当前方块
      holdPiece.value = {
        type: currentPiece.value.type,
        x: SPAWN_X,
        y: SPAWN_Y,
        rotation: 0,
        color: currentPiece.value.color,
        shape: PIECE_SHAPES[currentPiece.value.type].rotations[0],
      };

      // 生成新的当前方块
      spawnNextPiece();
    } else {
      // Hold 槽有方块，交换
      const heldType = holdPiece.value.type;
      const heldColor = holdPiece.value.color;

      // 将当前方块存入 Hold
      holdPiece.value = {
        type: currentPiece.value.type,
        x: SPAWN_X,
        y: SPAWN_Y,
        rotation: 0,
        color: currentPiece.value.color,
        shape: PIECE_SHAPES[currentPiece.value.type].rotations[0],
      };

      // 将 Hold 中的方块作为当前方块
      currentPiece.value = {
        type: heldType,
        x: SPAWN_X,
        y: SPAWN_Y,
        rotation: 0,
        color: heldColor,
        shape: PIECE_SHAPES[heldType].rotations[0],
      };

      // 检测游戏是否结束
      if (checkCollision(currentPiece.value, grid.value)) {
        gameOver();
        return;
      }
    }

    // 标记为已使用 Hold（直到下次锁定方块）
    canHold.value = false;
  }

  // ==================== 定时器管理 ====================

  /**
   * 启动下落定时器
   */
  function startDropTimer(): void {
    stopDropTimer();
    dropTimer = window.setInterval(() => {
      if (!isPaused.value && isPlaying.value) {
        moveDown();
      }
    }, dropInterval.value);
  }

  /**
   * 停止下落定时器
   */
  function stopDropTimer(): void {
    if (dropTimer !== null) {
      clearInterval(dropTimer);
      dropTimer = null;
    }
    // 同时清理锁定延迟
    cancelLockDelay();
  }

  /**
   * 重启下落定时器（用于速度变化）
   */
  function restartDropTimer(): void {
    if (isPlaying.value) {
      startDropTimer();
    }
  }

  // ==================== 游戏控制 ====================

  /**
   * 开始新游戏
   */
  /**
   * 开始游戏（可选择难度配置）
   */
  function startGame(difficulty?: DifficultyConfig): void {
    // 应用难度配置
    if (difficulty) {
      currentDifficulty.value = difficulty;
    }

    // 重置状态
    grid.value = createEmptyGrid();
    score.value = 0;
    level.value = currentDifficulty.value.startLevel; // 使用难度配置的起始等级
    lines.value = 0;
    isPlaying.value = true;
    isPaused.value = false;
    isGameOver.value = false;
    holdPiece.value = null; // 清空 Hold 槽
    canHold.value = true; // 重置 Hold 权限

    // ✨ 重置统计数据
    statistics.value = {
      score: 0,
      level: currentDifficulty.value.startLevel,
      lines: 0,
      combo: 0,
      maxCombo: 0,
      isBackToBack: false,
      backToBackCount: 0,
      clears: {
        single: 0,
        double: 0,
        triple: 0,
        tetris: 0,
      },
      totalPieces: 0,
      playTime: 0,
      startTime: Date.now(),
    };
    lastClearType.value = null;

    // 计算初始下落速度（根据难度配置）
    dropInterval.value = calculateDropSpeed();

    // 生成初始方块
    nextPiece.value = null;
    spawnNextPiece();

    // 启动自动下落
    startDropTimer();
  }

  /**
   * 暂停/继续游戏
   */
  function togglePause(): void {
    if (!isPlaying.value || isGameOver.value) return;

    const wasPaused = isPaused.value;
    isPaused.value = !isPaused.value;

    if (isPaused.value) {
      // 暂停时取消锁定延迟
      cancelLockDelay();
    } else if (wasPaused) {
      // 如果从暂停状态恢复，重启定时器以立即生效
      startDropTimer();
    }
  }

  /**
   * 游戏结束
   */
  function gameOver(): void {
    isPlaying.value = false;
    isGameOver.value = true;
    stopDropTimer();

    audio.playGameOver(); // 播放游戏结束音效

    // 计算游戏时长
    const playTime = Math.floor((Date.now() - statistics.value.startTime) / 1000);
    statistics.value.playTime = playTime;

    // 保存到高分榜
    addHighScore({
      score: score.value,
      level: level.value,
      lines: lines.value,
      maxCombo: statistics.value.maxCombo,
      difficulty: currentDifficulty.value.name,
      difficultyLabel: currentDifficulty.value.label,
      playTime,
      statistics: statistics.value,
    });

    // 清除自动存档
    deleteSave();
  }

  /**
   * 重新开始
   */
  function restart(): void {
    stopDropTimer();
    startGame();
  }

  // ==================== 键盘控制 ====================

  /**
   * 键盘事件处理
   */
  function handleKeyDown(event: KeyboardEvent): void {
    if (!isPlaying.value || isGameOver.value) return;

    // 暂停时只允许继续游戏
    if (isPaused.value && event.key !== 'Escape') return;

    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        moveLeft();
        break;
      case 'ArrowRight':
        event.preventDefault();
        moveRight();
        break;
      case 'ArrowDown':
        event.preventDefault();
        moveDown();
        break;
      case 'ArrowUp':
      case 'x':
      case 'X':
        event.preventDefault();
        rotate();
        break;
      case ' ':
        event.preventDefault();
        hardDrop();
        break;
      case 'c':
      case 'C':
      case 'Shift':
        event.preventDefault();
        holdCurrentPiece();
        break;
      case 'Escape':
        event.preventDefault();
        togglePause();
        break;
    }
  }

  // ==================== 自动保存 ====================

  /**
   * 自动保存游戏状态（暂停时触发）
   */
  watch(isPaused, paused => {
    if (paused && isPlaying.value && !isGameOver.value) {
      // 暂停时自动保存
      saveGame({
        difficulty: currentDifficulty.value,
        grid: grid.value,
        currentPiece: currentPiece.value,
        nextPiece: nextPiece.value,
        holdPiece: holdPiece.value,
        canHold: canHold.value,
        score: score.value,
        level: level.value,
        lines: lines.value,
        dropInterval: dropInterval.value,
        statistics: statistics.value,
      });
    }
  });

  /**
   * 加载已保存的游戏
   */
  function loadSavedGame(): boolean {
    const save = loadGame();
    if (!save) return false;

    try {
      // 恢复游戏状态
      currentDifficulty.value = save.difficulty;
      grid.value = save.grid;
      currentPiece.value = save.currentPiece;
      nextPiece.value = save.nextPiece;
      holdPiece.value = save.holdPiece;
      canHold.value = save.canHold;
      score.value = save.score;
      level.value = save.level;
      lines.value = save.lines;
      dropInterval.value = save.dropInterval;
      statistics.value = save.statistics;

      // 设置游戏状态
      isPlaying.value = true;
      isPaused.value = true; // 加载后暂停
      isGameOver.value = false;

      return true;
    } catch (error) {
      console.error('加载存档失败:', error);
      return false;
    }
  }

  // ==================== 生命周期 ====================

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
    stopDropTimer(); // 清理定时器

    // 退出时如果游戏正在进行且未结束，自动保存
    if (isPlaying.value && !isGameOver.value) {
      saveGame({
        difficulty: currentDifficulty.value,
        grid: grid.value,
        currentPiece: currentPiece.value,
        nextPiece: nextPiece.value,
        holdPiece: holdPiece.value,
        canHold: canHold.value,
        score: score.value,
        level: level.value,
        lines: lines.value,
        dropInterval: dropInterval.value,
        statistics: statistics.value,
      });
    }
  });

  // ==================== 暴露接口 ====================

  return {
    // 状态
    grid,
    currentPiece,
    nextPiece,
    holdPiece,
    canHold,
    score,
    level,
    lines,
    isPlaying,
    isPaused,
    isGameOver,
    dropInterval, // 当前下落间隔

    // ✨ 难度配置
    currentDifficulty,
    ghostEnabled: computed(() => currentDifficulty.value.ghostEnabled),
    holdEnabled: computed(() => currentDifficulty.value.holdEnabled),

    // ✨ 统计数据
    statistics,
    combo: computed(() => statistics.value.combo),
    maxCombo: computed(() => statistics.value.maxCombo),
    isBackToBack: computed(() => statistics.value.isBackToBack),
    backToBackCount: computed(() => statistics.value.backToBackCount),

    // ✨ 音效系统
    audio,
    clearingLines, // 消行动画状态

    // 移动控制
    moveLeft,
    moveRight,
    moveDown,
    rotate,
    hardDrop,
    holdCurrentPiece,

    // 游戏控制
    startGame,
    togglePause,
    restart,

    // 存档管理
    loadSavedGame,
    hasSavedGame: hasSave,

    // 辅助计算
    isAtBottom: computed(() => {
      if (!currentPiece.value) return false;
      return isAtBottom(currentPiece.value, grid.value);
    }),

    // 幽灵方块（下落预览）
    ghostPiece: computed(() => {
      if (!currentPiece.value) return null;
      return getGhostPiece(currentPiece.value, grid.value);
    }),
  };
}
