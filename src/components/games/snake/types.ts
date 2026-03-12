/**
 * 貪食蛇遊戲 - 類型定義
 */

export interface Position {
  x: number
  y: number
}

export interface Enemy {
  id: number
  body: Position[]
  direction: Direction
  alive: boolean
}

export enum Direction {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export enum GameState {
  READY = 'READY',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAME_OVER = 'GAME_OVER',
}

export interface GameSaveData {
  snake: Position[]
  food: Position | Position[]
  direction: Direction
  score: number
  speed: number
  timestamp: number
  gridSize?: number
  foodCount?: number
  enemies?: Enemy[]
}

export interface GameConfig {
  gridSize: number
  initialSpeed: number
  speedIncrement?: number
  minSpeed?: number
}
