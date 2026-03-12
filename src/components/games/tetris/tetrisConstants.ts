/**
 * 俄罗斯方块 - 常量定义
 *
 * 包含所有游戏常量：方块形状、颜色、难度配置等
 */

import type { DifficultyConfig, DifficultyLevel, GridCell, PieceShape, PieceType } from './tetrisTypes';

// ==================== 游戏配置 ====================

/** 游戏网格宽度（列数） */
export const GRID_WIDTH = 10;

/** 游戏网格高度（行数） */
export const GRID_HEIGHT = 20;

/** 方块矩阵大小（4x4） */
export const PIECE_SIZE = 4;

/** 初始生成位置X */
export const SPAWN_X = 3;

/** 初始生成位置Y（从网格上方开始，-1 表示在第 0 行上方 1 格） */
export const SPAWN_Y = -1;

/** 锁定延迟时间（毫秒）- 方块到达底部后的缓冲时间 */
export const LOCK_DELAY = 100;

/** 游戏版本 */
export const GAME_VERSION = '1.0.0';

/** 最大高分记录数 */
export const MAX_HIGH_SCORES = 5;

// ==================== 方块颜色 ====================

/**
 * 方块颜色映射
 * 使用现代俄罗斯方块标准配色
 */
export const PIECE_COLORS: Record<PieceType, string> = {
  I: '#00f0f0', // 青色 (Cyan)
  O: '#f0f000', // 黄色 (Yellow)
  T: '#a000f0', // 紫色 (Purple)
  L: '#f07000', // 橙色 (Orange)
  J: '#0000f0', // 蓝色 (Blue)
  S: '#00f000', // 绿色 (Green)
  Z: '#f00000', // 红色 (Red)
};

/**
 * 方块颜色ID映射
 * 用于网格存储
 */
export const PIECE_COLOR_IDS: Record<PieceType, GridCell> = {
  I: 1,
  O: 2,
  T: 3,
  L: 4,
  J: 5,
  S: 6,
  Z: 7,
};

// ==================== 方块形状定义 ====================

/**
 * I型方块 - 直线型
 *
 * 旋转状态:
 * 0:  ....    1:  ..#.    2:  ....    3:  .#..
 *     ####        ..#.        ....        .#..
 *     ....        ..#.        ####        .#..
 *     ....        ..#.        ....        .#..
 */
const I_SHAPE: number[][][] = [
  // 旋转状态 0 (水平)
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1 (垂直)
  [
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 1, 0],
  ],
  // 旋转状态 2 (水平)
  [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3 (垂直)
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
  ],
];

/**
 * O型方块 - 正方形
 *
 * 所有旋转状态相同:
 *     .##.
 *     .##.
 *     ....
 *     ....
 */
const O_SHAPE: number[][][] = [
  // 所有旋转状态相同
  [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [0, 1, 1, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * T型方块
 *
 * 旋转状态:
 * 0:  .#..    1:  .#..    2:  ....    3:  .#..
 *     ###.        .##.        ###.        ##..
 *     ....        .#..        .#..        .#..
 *     ....        ....        ....        ....
 */
const T_SHAPE: number[][][] = [
  // 旋转状态 0
  [
    [0, 1, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1
  [
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 2
  [
    [0, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3
  [
    [0, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * L型方块
 *
 * 旋转状态:
 * 0:  ..#.    1:  .#..    2:  ....    3:  ##..
 *     ###.        .#..        ###.        .#..
 *     ....        .##.        #...        .#..
 *     ....        ....        ....        ....
 */
const L_SHAPE: number[][][] = [
  // 旋转状态 0
  [
    [0, 0, 1, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 2
  [
    [0, 0, 0, 0],
    [1, 1, 1, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3
  [
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * J型方块 (L的镜像)
 *
 * 旋转状态:
 * 0:  #...    1:  .##.    2:  ....    3:  .#..
 *     ###.        .#..        ###.        .#..
 *     ....        .#..        ..#.        ##..
 *     ....        ....        ....        ....
 */
const J_SHAPE: number[][][] = [
  // 旋转状态 0
  [
    [1, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1
  [
    [0, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 2
  [
    [0, 0, 0, 0],
    [1, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3
  [
    [0, 1, 0, 0],
    [0, 1, 0, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * S型方块
 *
 * 旋转状态:
 * 0:  .##.    1:  .#..    2:  ....    3:  #...
 *     ##..        .##.        .##.        ##..
 *     ....        ..#.        ##..        .#..
 *     ....        ....        ....        ....
 */
const S_SHAPE: number[][][] = [
  // 旋转状态 0
  [
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1
  [
    [0, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 2
  [
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [1, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3
  [
    [1, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * Z型方块 (S的镜像)
 *
 * 旋转状态:
 * 0:  ##..    1:  ..#.    2:  ....    3:  .#..
 *     .##.        .##.        ##..        ##..
 *     ....        .#..        .##.        #...
 *     ....        ....        ....        ....
 */
const Z_SHAPE: number[][][] = [
  // 旋转状态 0
  [
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 1
  [
    [0, 0, 1, 0],
    [0, 1, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 2
  [
    [0, 0, 0, 0],
    [1, 1, 0, 0],
    [0, 1, 1, 0],
    [0, 0, 0, 0],
  ],
  // 旋转状态 3
  [
    [0, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 0],
    [0, 0, 0, 0],
  ],
];

/**
 * 所有方块形状的集合
 */
export const PIECE_SHAPES: Record<PieceType, PieceShape> = {
  I: {
    rotations: I_SHAPE,
    color: PIECE_COLORS.I,
    name: 'I型',
  },
  O: {
    rotations: O_SHAPE,
    color: PIECE_COLORS.O,
    name: 'O型',
  },
  T: {
    rotations: T_SHAPE,
    color: PIECE_COLORS.T,
    name: 'T型',
  },
  L: {
    rotations: L_SHAPE,
    color: PIECE_COLORS.L,
    name: 'L型',
  },
  J: {
    rotations: J_SHAPE,
    color: PIECE_COLORS.J,
    name: 'J型',
  },
  S: {
    rotations: S_SHAPE,
    color: PIECE_COLORS.S,
    name: 'S型',
  },
  Z: {
    rotations: Z_SHAPE,
    color: PIECE_COLORS.Z,
    name: 'Z型',
  },
};

/**
 * 所有方块类型数组
 */
export const ALL_PIECE_TYPES: PieceType[] = ['I', 'O', 'T', 'L', 'J', 'S', 'Z'];

// ==================== 计分系统 ====================

/**
 * 消行分数表
 * 索引对应消除的行数（0-4）
 */
export const LINE_CLEAR_SCORES = [
  0, // 0 行
  100, // 1 行 (Single)
  300, // 2 行 (Double)
  500, // 3 行 (Triple)
  800, // 4 行 (Tetris)
];

/**
 * 软降分数（每格）
 */
export const SOFT_DROP_SCORE = 1;

/**
 * 硬降分数（每格）
 */
export const HARD_DROP_SCORE = 2;

/**
 * 升级所需行数
 */
export const LINES_PER_LEVEL = 10;

/**
 * Combo 连击奖励分数（每次连击额外加分）
 */
export const COMBO_BONUS_SCORE = 50;

/**
 * Back-to-Back 奖励倍数（连续 Tetris 时）
 */
export const BACK_TO_BACK_MULTIPLIER = 1.5;

// ==================== 难度配置 ====================

/**
 * 所有难度配置
 */
export const DIFFICULTIES: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    name: 'easy',
    label: '簡單',
    startLevel: 1,
    startSpeed: 1200, // 0.5倍速 = 间隔时间 × 2
    speedIncrease: 60,
    minSpeed: 300,
    scoreMultiplier: 0.5,
    ghostEnabled: true,
    holdEnabled: true,
    description: '適合新手，速度較慢，有幽靈提示',
  },
  normal: {
    name: 'normal',
    label: '正常',
    startLevel: 1,
    startSpeed: 750, // 0.8倍速 = 间隔时间 × 1.25
    speedIncrease: 38,
    minSpeed: 188,
    scoreMultiplier: 0.8,
    ghostEnabled: true,
    holdEnabled: true,
    description: '標準難度，平衡的遊戲體驗',
  },
  hard: {
    name: 'hard',
    label: '困難',
    startLevel: 5,
    startSpeed: 600, // 1.0倍速 = 基准速度
    speedIncrease: 30,
    minSpeed: 150,
    scoreMultiplier: 1.0,
    ghostEnabled: false,
    holdEnabled: true,
    description: '高速挑戰，無幽靈提示',
  },
  expert: {
    name: 'expert',
    label: '專家',
    startLevel: 10,
    startSpeed: 462, // 1.3倍速 = 间隔时间 / 1.3 ≈ × 0.77
    speedIncrease: 23,
    minSpeed: 115,
    scoreMultiplier: 1.3,
    ghostEnabled: false,
    holdEnabled: false,
    description: '極限難度，無輔助功能',
  },
};

// ==================== SRS 墙踢数据 ====================

/**
 * SRS墙踢偏移测试表
 * 用于JLSTZ方块的旋转墙踢
 *
 * 格式: [旋转前状态][旋转后状态] = [[x1, y1], [x2, y2], ...]
 */
export const SRS_WALL_KICKS: Record<string, number[][]> = {
  // 0 → 1 (0° → 90°)
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  // 1 → 0 (90° → 0°)
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  // 1 → 2 (90° → 180°)
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  // 2 → 1 (180° → 90°)
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  // 2 → 3 (180° → 270°)
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  // 3 → 2 (270° → 180°)
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  // 3 → 0 (270° → 0°)
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  // 0 → 3 (0° → 270°)
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};

/**
 * I方块的特殊墙踢偏移测试表
 */
export const SRS_WALL_KICKS_I: Record<string, number[][]> = {
  // 0 → 1
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  // 1 → 0
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  // 1 → 2
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  // 2 → 1
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  // 2 → 3
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  // 3 → 2
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  // 3 → 0
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  // 0 → 3
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

// ==================== 难度配置 ====================

/** 难度配置映射 */
export const DIFFICULTY_CONFIGS: Record<string, DifficultyConfig> = {
  easy: {
    name: 'easy',
    label: '简单',
    startLevel: 1,
    startSpeed: 1200, // 0.5倍速 = 间隔时间 × 2
    speedIncrease: 60,
    minSpeed: 300,
    scoreMultiplier: 0.5,
    ghostEnabled: true,
    holdEnabled: true,
    description: '适合新手，速度较慢，有辅助功能',
  },
  normal: {
    name: 'normal',
    label: '正常',
    startLevel: 1,
    startSpeed: 750, // 0.8倍速 = 间隔时间 × 1.25
    speedIncrease: 38,
    minSpeed: 188,
    scoreMultiplier: 0.8,
    ghostEnabled: true,
    holdEnabled: true,
    description: '标准游戏体验',
  },
  hard: {
    name: 'hard',
    label: '困难',
    startLevel: 5,
    startSpeed: 600, // 1.0倍速 = 基准速度
    speedIncrease: 30,
    minSpeed: 150,
    scoreMultiplier: 1.0,
    ghostEnabled: true,
    holdEnabled: false,
    description: '更快的速度，禁用Hold功能',
  },
  expert: {
    name: 'expert',
    label: '专家',
    startLevel: 10,
    startSpeed: 462, // 1.3倍速 = 间隔时间 / 1.3 ≈ × 0.77
    speedIncrease: 23,
    minSpeed: 115,
    scoreMultiplier: 1.3,
    ghostEnabled: false,
    holdEnabled: false,
    description: '极限挑战，禁用所有辅助功能',
  },
};

/** 默认难度 */
export const DEFAULT_DIFFICULTY: DifficultyConfig = DIFFICULTY_CONFIGS.normal;

// ==================== 存储键名 ====================

/** 自动保存键名 */
export const SAVE_KEY_AUTO = 'tetris-auto-save';

/** 高分榜键名 */
export const SAVE_KEY_HIGH_SCORES = 'tetris-high-scores';

/** 设置键名 */
export const SAVE_KEY_SETTINGS = 'tetris-settings';
