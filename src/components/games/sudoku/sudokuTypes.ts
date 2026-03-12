export type Difficulty = 'easy' | 'medium' | 'hard'

export interface SudokuPuzzle {
  puzzle: number[][]
  solution: number[][]
  difficulty: Difficulty
}

export interface Cell {
  value: number
  isInitial: boolean
  hasError: boolean
  notes: number[]
}

export interface Position {
  row: number
  col: number
}

export const DIFFICULTY_CONFIG = {
  easy: { minCells: 35, maxCells: 40, label: '簡單' },
  medium: { minCells: 28, maxCells: 35, label: '中等' },
  hard: { minCells: 22, maxCells: 28, label: '困難' },
} as const
