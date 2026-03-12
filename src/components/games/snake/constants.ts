/**
 * 貪食蛇遊戲 - 常量配置
 */

import { Direction, type GameConfig } from './types'

export const GAME_CONFIG: GameConfig = {
  gridSize: 20,
  initialSpeed: 300,
}

export const INITIAL_SNAKE = [
  { x: 10, y: 10 },
  { x: 10, y: 11 },
  { x: 10, y: 12 },
]

export const INITIAL_DIRECTION = Direction.UP

export const KEY_DIRECTION_MAP: Record<string, Direction> = {
  ArrowUp: Direction.UP,
  ArrowDown: Direction.DOWN,
  ArrowLeft: Direction.LEFT,
  ArrowRight: Direction.RIGHT,
  w: Direction.UP,
  s: Direction.DOWN,
  a: Direction.LEFT,
  d: Direction.RIGHT,
}

export const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  [Direction.UP]: Direction.DOWN,
  [Direction.DOWN]: Direction.UP,
  [Direction.LEFT]: Direction.RIGHT,
  [Direction.RIGHT]: Direction.LEFT,
}

export const DIRECTION_VECTOR: Record<Direction, { x: number; y: number }> = {
  [Direction.UP]: { x: 0, y: -1 },
  [Direction.DOWN]: { x: 0, y: 1 },
  [Direction.LEFT]: { x: -1, y: 0 },
  [Direction.RIGHT]: { x: 1, y: 0 },
}

export const STORAGE_KEYS = {
  bestScore: 'snake_best_score',
  savedGame: 'snake_saved_game',
}
