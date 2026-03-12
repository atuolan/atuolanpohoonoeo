// ==================== 遊戲成績分享類型 ====================

/** 2048 遊戲元數據 */
export interface Game2048Metadata {
  type: '2048'
  highestTile: number
}

/** 貪吃蛇遊戲元數據 */
export interface SnakeMetadata {
  type: 'snake'
  snakeLength: number
}

/** 數獨遊戲元數據 */
export interface SudokuMetadata {
  type: 'sudoku'
  completionTime: number
  difficulty: 'easy' | 'medium' | 'hard'
}

/** 俄羅斯方塊遊戲元數據 */
export interface TetrisMetadata {
  type: 'tetris'
  linesCleared: number
  level: number
}

/** 遊戲元數據聯合類型 */
export type GameMetadata = Game2048Metadata | SnakeMetadata | SudokuMetadata | TetrisMetadata

/** 遊戲成績數據 */
export interface GameScoreData {
  gameId: string
  gameName: string
  gameIcon: string
  score: number
  bestScore: number
  isNewRecord: boolean
  timestamp: number
  metadata: GameMetadata
}
