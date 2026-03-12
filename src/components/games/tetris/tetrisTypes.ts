/**
 * 俄罗斯方块 - TypeScript 类型定义
 *
 * 定义游戏中所有使用的数据结构和类型
 */

// ==================== 基础类型 ====================

/**
 * 方块类型
 * I: 直线型
 * O: 正方形
 * T: T字型
 * L: L字型
 * J: J字型（L的镜像）
 * S: S字型
 * Z: Z字型（S的镜像）
 */
export type PieceType = 'I' | 'O' | 'T' | 'L' | 'J' | 'S' | 'Z';

/**
 * 旋转状态 (0-3)
 * 0: 初始状态
 * 1: 顺时针旋转90度
 * 2: 顺时针旋转180度
 * 3: 顺时针旋转270度
 */
export type RotationState = 0 | 1 | 2 | 3;

/**
 * 移动方向
 */
export type Direction = 'left' | 'right' | 'down';

/**
 * 游戏状态
 */
export type GameStatus = 'idle' | 'playing' | 'paused' | 'gameOver';

/**
 * 清除类型
 */
export type ClearType = 'single' | 'double' | 'triple' | 'tetris';

/**
 * 难度等级
 */
export type DifficultyLevel = 'easy' | 'normal' | 'hard' | 'expert';

// ==================== 数据结构 ====================

/**
 * 方块实例
 * 表示一个正在游戏中的方块
 */
export interface Piece {
  /** 方块类型 */
  type: PieceType;

  /** 当前X坐标（网格列，0-9） */
  x: number;

  /** 当前Y坐标（网格行，0-19） */
  y: number;

  /** 当前旋转状态 */
  rotation: RotationState;

  /** 方块颜色 */
  color: string;

  /** 当前形状矩阵（4x4） */
  shape: number[][];
}

/**
 * 方块形状定义
 * 定义某个方块类型的所有旋转状态
 */
export interface PieceShape {
  /** 所有旋转状态的形状矩阵 */
  rotations: number[][][];

  /** 方块颜色 */
  color: string;

  /** 方块名称 */
  name: string;
}

/**
 * 网格单元格
 * 0: 空单元格
 * 1-7: 不同类型方块的颜色ID
 */
export type GridCell = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * 游戏网格（20行 × 10列）
 */
export type GameGrid = GridCell[][];

/**
 * 游戏统计数据
 */
export interface GameStats {
  /** 当前分数 */
  score: number;

  /** 当前等级 */
  level: number;

  /** 已消除的行数 */
  lines: number;

  /** 游戏时长（秒） */
  playTime: number;

  /** 单次消除1行的次数 */
  singles: number;

  /** 单次消除2行的次数 */
  doubles: number;

  /** 单次消除3行的次数 */
  triples: number;

  /** 单次消除4行的次数（Tetris） */
  tetrises: number;
}

/**
 * 完整的游戏状态
 */
export interface GameState {
  /** 游戏网格 */
  grid: GameGrid;

  /** 当前正在下落的方块 */
  currentPiece: Piece | null;

  /** 下一个方块 */
  nextPiece: Piece | null;

  /** 暂存的方块 */
  holdPiece: Piece | null;

  /** 是否可以使用Hold功能（每次锁定后重置） */
  canHold: boolean;

  /** 游戏状态 */
  status: GameStatus;

  /** 游戏统计 */
  stats: GameStats;

  /** 当前难度 */
  difficulty: DifficultyLevel;

  /** 是否启用幽灵方块 */
  ghostEnabled: boolean;
}

/**
 * 难度配置
 */
export interface DifficultyConfig {
  /** 难度标识 */
  name: DifficultyLevel;

  /** 显示标签 */
  label: string;

  /** 起始等级 */
  startLevel: number;

  /** 初始下落速度（毫秒） */
  startSpeed: number;

  /** 每升一级的加速（毫秒） */
  speedIncrease: number;

  /** 最快速度限制（毫秒） */
  minSpeed: number;

  /** 分数倍率 */
  scoreMultiplier: number;

  /** 是否显示幽灵方块 */
  ghostEnabled: boolean;

  /** 是否允许使用Hold功能 */
  holdEnabled: boolean;

  /** 描述 */
  description: string;
}

/**
 * 游戏存档
 */
export interface GameSave {
  /** 游戏状态 */
  state: GameState;

  /** 保存时间 */
  savedAt: number;

  /** 保存版本 */
  version: string;
}

/**
 * 高分记录
 */
export interface HighScore {
  /** 记录ID */
  id: string;

  /** 分数 */
  score: number;

  /** 等级 */
  level: number;

  /** 消除行数 */
  lines: number;

  /** 难度 */
  difficulty: DifficultyLevel;

  /** 达成时间 */
  achievedAt: number;

  /** 游戏时长（秒） */
  playTime: number;
}

/**
 * 墙踢偏移数据
 * 用于SRS旋转系统
 */
export interface WallKickOffset {
  /** X轴偏移 */
  x: number;

  /** Y轴偏移 */
  y: number;
}

/**
 * 触摸控制状态
 */
export interface TouchState {
  /** 起始X坐标 */
  startX: number;

  /** 起始Y坐标 */
  startY: number;

  /** 起始时间 */
  startTime: number;

  /** 是否正在拖动 */
  isDragging: boolean;

  /** 上次移动时间 */
  lastMoveTime: number;
}

/**
 * 位置坐标
 */
export interface Position {
  /** X坐标 */
  x: number;

  /** Y坐标 */
  y: number;
}

/**
 * 游戏统计数据
 */
export interface TetrisStatistics {
  /** 总分 */
  score: number;

  /** 等级 */
  level: number;

  /** 消除总行数 */
  lines: number;

  /** 当前连击数 */
  combo: number;

  /** 最高连击数 */
  maxCombo: number;

  /** 是否处于 Back-to-Back 状态 */
  isBackToBack: boolean;

  /** Back-to-Back 连续次数 */
  backToBackCount: number;

  /** 各类型消除次数统计 */
  clears: {
    single: number;
    double: number;
    triple: number;
    tetris: number;
  };

  /** 已放置的方块总数 */
  totalPieces: number;

  /** 游戏时长（毫秒） */
  playTime: number;

  /** 游戏开始时间 */
  startTime: number;
}
