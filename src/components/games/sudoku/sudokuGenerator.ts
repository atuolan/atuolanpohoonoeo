import type { SudokuPuzzle, Difficulty } from './sudokuTypes'
import { DIFFICULTY_CONFIG } from './sudokuTypes'

function createEmptyGrid(): number[][] {
  return Array(9).fill(0).map(() => Array(9).fill(0))
}

function cloneGrid(grid: number[][]): number[][] {
  return grid.map(row => [...row])
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let x = 0; x < 9; x++) { if (grid[row][x] === num) return false }
  for (let x = 0; x < 9; x++) { if (grid[x][col] === num) return false }
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (grid[boxRow + i][boxCol + j] === num) return false
    }
  }
  return true
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]]
  }
}

function fillGrid(grid: number[][]): boolean {
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      if (grid[row][col] === 0) {
        const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9]
        shuffleArray(numbers)
        for (const num of numbers) {
          if (isValid(grid, row, col, num)) {
            grid[row][col] = num
            if (fillGrid(grid)) return true
            grid[row][col] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

function generateSolution(): number[][] {
  const grid = createEmptyGrid()
  fillGrid(grid)
  return grid
}

function createPuzzle(solution: number[][], difficulty: Difficulty): number[][] {
  const puzzle = cloneGrid(solution)
  const config = DIFFICULTY_CONFIG[difficulty]
  const totalCells = 81
  const minCells = config.minCells
  const maxCells = config.maxCells
  const targetCells = Math.floor(Math.random() * (maxCells - minCells + 1)) + minCells
  const cellsToRemove = totalCells - targetCells

  const positions: Array<[number, number]> = []
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) { positions.push([i, j]) }
  }
  shuffleArray(positions)

  let removed = 0
  for (const [row, col] of positions) {
    if (removed >= cellsToRemove) break
    puzzle[row][col] = 0
    removed++
  }
  return puzzle
}


export function generateSudoku(difficulty: Difficulty): SudokuPuzzle {
  const solution = generateSolution()
  const puzzle = createPuzzle(solution, difficulty)
  return { puzzle, solution, difficulty }
}

export function verifySolution(playerGrid: number[][], solution: number[][]): boolean {
  for (let i = 0; i < 9; i++) {
    for (let j = 0; j < 9; j++) {
      if (playerGrid[i][j] !== 0 && playerGrid[i][j] !== solution[i][j]) return false
    }
  }
  return true
}

export function checkCell(row: number, col: number, value: number, solution: number[][]): boolean {
  return value === solution[row][col]
}

export function getHint(row: number, col: number, solution: number[][]): number {
  return solution[row][col]
}

export function findConflicts(grid: number[][]): Set<string> {
  const conflicts = new Set<string>()
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 9; col++) {
      const value = grid[row][col]
      if (value === 0) continue
      grid[row][col] = 0
      if (!isValid(grid, row, col, value)) conflicts.add(`${row}-${col}`)
      grid[row][col] = value
    }
  }
  return conflicts
}