/**
 * 俄罗斯方块 - 存档管理器
 *
 * 功能：
 * - 自动保存游戏状态
 * - 加载已保存的游戏
 * - 高分榜管理
 * - 游戏历史记录
 */

import { SAVE_KEY_AUTO, SAVE_KEY_HIGH_SCORES, SAVE_KEY_SETTINGS } from './tetrisConstants';
import type { DifficultyConfig, DifficultyLevel, GameGrid, Piece, TetrisStatistics } from './tetrisTypes';

// ==================== 类型定义 ====================

/**
 * 游戏存档数据
 */
export interface GameSave {
  /** 存档版本 */
  version: string;
  /** 存档时间戳 */
  timestamp: number;
  /** 难度配置 */
  difficulty: DifficultyConfig;
  /** 游戏网格 */
  grid: GameGrid;
  /** 当前方块 */
  currentPiece: Piece | null;
  /** 下一个方块 */
  nextPiece: Piece | null;
  /** Hold方块 */
  holdPiece: Piece | null;
  /** 是否可以使用Hold */
  canHold: boolean;
  /** 分数 */
  score: number;
  /** 等级 */
  level: number;
  /** 已消除行数 */
  lines: number;
  /** 下落间隔 */
  dropInterval: number;
  /** 统计数据 */
  statistics: TetrisStatistics;
}

/**
 * 高分记录
 */
export interface HighScore {
  /** 记录ID */
  id: string;
  /** 玩家分数 */
  score: number;
  /** 等级 */
  level: number;
  /** 已消除行数 */
  lines: number;
  /** 最高连击 */
  maxCombo: number;
  /** 难度 */
  difficulty: DifficultyLevel;
  /** 难度标签 */
  difficultyLabel: string;
  /** 游戏时长（秒） */
  playTime: number;
  /** 创建时间 */
  timestamp: number;
  /** 统计数据 */
  statistics: TetrisStatistics;
}

/**
 * 游戏设置
 */
export interface GameSettings {
  /** 音效开关 */
  soundEnabled: boolean;
  /** 音乐开关 */
  musicEnabled: boolean;
  /** 振动反馈 */
  vibrationEnabled: boolean;
  /** 默认难度 */
  defaultDifficulty: DifficultyLevel;
}

// ==================== 常量 ====================

const SAVE_VERSION = '1.0.0';
const MAX_HIGH_SCORES = 10;

// ==================== 存档管理 ====================

/**
 * 保存游戏状态
 */
export function saveGame(data: Omit<GameSave, 'version' | 'timestamp'>): boolean {
  try {
    const save: GameSave = {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      ...data,
    };
    localStorage.setItem(SAVE_KEY_AUTO, JSON.stringify(save));
    return true;
  } catch (error) {
    console.error('保存游戏失败:', error);
    return false;
  }
}

/**
 * 加载游戏存档
 */
export function loadGame(): GameSave | null {
  try {
    const data = localStorage.getItem(SAVE_KEY_AUTO);
    if (!data) return null;

    const save = JSON.parse(data) as GameSave;
    // 可以在这里添加版本兼容性检查
    return save;
  } catch (error) {
    console.error('加载游戏失败:', error);
    return null;
  }
}

/**
 * 删除游戏存档
 */
export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY_AUTO);
  } catch (error) {
    console.error('删除存档失败:', error);
  }
}

/**
 * 检查是否有存档
 */
export function hasSave(): boolean {
  return localStorage.getItem(SAVE_KEY_AUTO) !== null;
}

// ==================== 高分榜管理 ====================

/**
 * 获取高分榜
 */
export function getHighScores(): HighScore[] {
  try {
    const data = localStorage.getItem(SAVE_KEY_HIGH_SCORES);
    if (!data) return [];

    const scores = JSON.parse(data) as HighScore[];
    // 按分数降序排序
    return scores.sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error('获取高分榜失败:', error);
    return [];
  }
}

/**
 * 添加高分记录
 * @returns 是否是新高分（进入前10名）
 */
export function addHighScore(score: Omit<HighScore, 'id' | 'timestamp'>): { isNewHighScore: boolean; rank: number } {
  try {
    const scores = getHighScores();

    // 创建新记录
    const newScore: HighScore = {
      id: generateId(),
      timestamp: Date.now(),
      ...score,
    };

    // 添加到列表
    scores.push(newScore);

    // 排序并保留前N名
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, MAX_HIGH_SCORES);

    // 保存
    localStorage.setItem(SAVE_KEY_HIGH_SCORES, JSON.stringify(topScores));

    // 检查是否进入高分榜
    const rank = topScores.findIndex(s => s.id === newScore.id);
    return {
      isNewHighScore: rank !== -1,
      rank: rank + 1, // 排名从1开始
    };
  } catch (error) {
    console.error('添加高分记录失败:', error);
    return { isNewHighScore: false, rank: -1 };
  }
}

/**
 * 删除高分记录
 */
export function deleteHighScore(id: string): boolean {
  try {
    const scores = getHighScores().filter(s => s.id !== id);
    localStorage.setItem(SAVE_KEY_HIGH_SCORES, JSON.stringify(scores));
    return true;
  } catch (error) {
    console.error('删除高分记录失败:', error);
    return false;
  }
}

/**
 * 清空高分榜
 */
export function clearHighScores(): boolean {
  try {
    localStorage.removeItem(SAVE_KEY_HIGH_SCORES);
    return true;
  } catch (error) {
    console.error('清空高分榜失败:', error);
    return false;
  }
}

/**
 * 检查是否是新高分
 */
export function isNewHighScore(score: number): boolean {
  const scores = getHighScores();
  if (scores.length < MAX_HIGH_SCORES) return true;
  return score > scores[scores.length - 1].score;
}

/**
 * 获取指定难度的最高分
 */
export function getHighScoreByDifficulty(difficulty: DifficultyLevel): HighScore | null {
  const scores = getHighScores().filter(s => s.difficulty === difficulty);
  return scores.length > 0 ? scores[0] : null;
}

// ==================== 设置管理 ====================

/**
 * 获取游戏设置
 */
export function getSettings(): GameSettings {
  try {
    const data = localStorage.getItem(SAVE_KEY_SETTINGS);
    if (!data) {
      // 返回默认设置
      return {
        soundEnabled: true,
        musicEnabled: true,
        vibrationEnabled: true,
        defaultDifficulty: 'normal',
      };
    }
    return JSON.parse(data) as GameSettings;
  } catch (error) {
    console.error('获取设置失败:', error);
    return {
      soundEnabled: true,
      musicEnabled: true,
      vibrationEnabled: true,
      defaultDifficulty: 'normal',
    };
  }
}

/**
 * 保存游戏设置
 */
export function saveSettings(settings: GameSettings): boolean {
  try {
    localStorage.setItem(SAVE_KEY_SETTINGS, JSON.stringify(settings));
    return true;
  } catch (error) {
    console.error('保存设置失败:', error);
    return false;
  }
}

// ==================== 辅助函数 ====================

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化游戏时长
 */
export function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return '今天';
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }
}
