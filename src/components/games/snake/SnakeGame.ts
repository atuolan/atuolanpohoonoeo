/**
 * 貪食蛇遊戲 - 核心邏輯類
 * 功能：15x15時3個食物點，20x20時2個會移動的敵人
 */

import {
  Direction,
  GameState,
  type Position,
  type GameSaveData,
  type GameConfig,
  type Enemy,
} from './types'
import {
  GAME_CONFIG,
  INITIAL_DIRECTION,
  OPPOSITE_DIRECTION,
  DIRECTION_VECTOR,
} from './constants'

export class SnakeGame {
  private config: GameConfig
  public state: GameState
  public snake: Position[]
  public foods: Position[]
  public enemies: Enemy[]
  public direction: Direction
  public nextDirection: Direction
  public score: number
  public speed: number
  public gridSize: number
  public foodCount: number

  private lastEnemyMoveTime: number = 0
  private enemyMoveInterval: number = 500
  private nextEnemyId: number = 0
  private gameLoopId: number | null = null
  private lastMoveTime: number = 0

  private readonly INITIAL_GRID_SIZE = 15
  private readonly EXPANDED_GRID_SIZE = 20
  private readonly EXPAND_THRESHOLD = 10
  private readonly INITIAL_FOOD_COUNT = 3
  private readonly ENEMY_COUNT = 2

  constructor(config: GameConfig = GAME_CONFIG) {
    this.config = config
    this.state = GameState.READY
    this.gridSize = this.INITIAL_GRID_SIZE
    this.foodCount = 0
    this.snake = this.getInitialSnake()
    this.direction = INITIAL_DIRECTION
    this.nextDirection = INITIAL_DIRECTION
    this.score = 0
    this.speed = config.initialSpeed
    this.foods = []
    this.enemies = []
    this.initializeFoodsAndEnemies()
  }

  private initializeFoodsAndEnemies(): void {
    if (this.gridSize === this.INITIAL_GRID_SIZE) {
      this.foods = []
      for (let i = 0; i < this.INITIAL_FOOD_COUNT; i++) {
        this.foods.push(this.generateSingleFood())
      }
      this.enemies = []
    } else {
      this.foods = []
      this.enemies = []
      for (let i = 0; i < this.ENEMY_COUNT; i++) {
        this.enemies.push(this.createEnemy())
      }
    }
  }

  private createEnemy(): Enemy {
    const headPos = this.generateSingleFood()
    const directions = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT]
    const randomDirection = directions[Math.floor(Math.random() * directions.length)]
    const body: Position[] = [headPos]
    const reverseVector = DIRECTION_VECTOR[OPPOSITE_DIRECTION[randomDirection]]

    for (let i = 1; i < 3; i++) {
      const segment = {
        x: headPos.x + reverseVector.x * i,
        y: headPos.y + reverseVector.y * i,
      }
      if (segment.x >= 0 && segment.x < this.gridSize &&
          segment.y >= 0 && segment.y < this.gridSize) {
        body.push(segment)
      }
    }

    return { id: this.nextEnemyId++, body, direction: randomDirection, alive: true }
  }

  private generateSingleFood(): Position {
    let newFood: Position
    let attempts = 0
    do {
      newFood = {
        x: Math.floor(Math.random() * this.gridSize),
        y: Math.floor(Math.random() * this.gridSize),
      }
      attempts++
      if (attempts >= 100) break
    } while (this.isPositionOccupied(newFood))
    return newFood
  }

  private isPositionOccupied(pos: Position): boolean {
    if (this.snake.some(s => s.x === pos.x && s.y === pos.y)) return true
    if (this.foods.some(f => f.x === pos.x && f.y === pos.y)) return true
    if (this.enemies.some(e => e.alive && e.body.some(b => b.x === pos.x && b.y === pos.y))) return true
    return false
  }

  private getInitialSnake(): Position[] {
    const center = Math.floor(this.gridSize / 2)
    return [
      { x: center, y: center },
      { x: center, y: center + 1 },
      { x: center, y: center + 2 },
    ]
  }


  public start(): void {
    if (this.state === GameState.READY || this.state === GameState.GAME_OVER) {
      this.reset()
    }
    this.state = GameState.PLAYING
    this.lastMoveTime = Date.now()
    this.lastEnemyMoveTime = Date.now()
    this.startGameLoop()
  }

  public pause(): void {
    if (this.state === GameState.PLAYING) {
      this.state = GameState.PAUSED
      this.stopGameLoop()
    }
  }

  public resume(): void {
    if (this.state === GameState.PAUSED) {
      this.state = GameState.PLAYING
      this.lastMoveTime = Date.now()
      this.lastEnemyMoveTime = Date.now()
      this.startGameLoop()
    }
  }

  public reset(): void {
    this.gridSize = this.INITIAL_GRID_SIZE
    this.foodCount = 0
    this.snake = this.getInitialSnake()
    this.direction = INITIAL_DIRECTION
    this.nextDirection = INITIAL_DIRECTION
    this.score = 0
    this.speed = this.config.initialSpeed
    this.foods = []
    this.enemies = []
    this.nextEnemyId = 0
    this.initializeFoodsAndEnemies()
    this.state = GameState.READY
    this.stopGameLoop()
  }

  public changeDirection(newDirection: Direction): boolean {
    if (OPPOSITE_DIRECTION[this.direction] === newDirection) return false
    if (OPPOSITE_DIRECTION[this.nextDirection] === newDirection) return false
    this.nextDirection = newDirection
    return true
  }

  private move(): boolean {
    this.direction = this.nextDirection
    const head = this.snake[0]
    const vector = DIRECTION_VECTOR[this.direction]
    const newHead: Position = { x: head.x + vector.x, y: head.y + vector.y }

    if (this.checkWallCollision(newHead)) { this.gameOver(); return false }
    if (this.checkSelfCollision(newHead)) { this.gameOver(); return false }

    for (const enemy of this.enemies) {
      if (!enemy.alive) continue
      if (enemy.body.some(part => part.x === newHead.x && part.y === newHead.y)) {
        this.gameOver(); return false
      }
    }

    this.snake.unshift(newHead)
    const eatenFoodIndex = this.foods.findIndex(f => f.x === newHead.x && f.y === newHead.y)
    if (eatenFoodIndex !== -1) {
      this.eatFood(eatenFoodIndex)
    } else {
      this.snake.pop()
    }
    this.checkSnakeBodyHitEnemy()
    return true
  }

  private eatFood(foodIndex: number): void {
    this.foods.splice(foodIndex, 1)
    this.score += 10
    this.foodCount++
    if (this.foodCount === this.EXPAND_THRESHOLD && this.gridSize === this.INITIAL_GRID_SIZE) {
      this.expandGrid()
    } else if (this.gridSize === this.INITIAL_GRID_SIZE) {
      this.foods.push(this.generateSingleFood())
    }
  }

  private expandGrid(): void {
    this.gridSize = this.EXPANDED_GRID_SIZE
    this.foods = []
    this.enemies = []
    for (let i = 0; i < this.ENEMY_COUNT; i++) {
      this.enemies.push(this.createEnemy())
    }
  }

  private checkSnakeBodyHitEnemy(): void {
    for (let i = 1; i < this.snake.length; i++) {
      const segment = this.snake[i]
      this.enemies.forEach(enemy => {
        if (!enemy.alive) return
        if (enemy.body.some(part => part.x === segment.x && part.y === segment.y)) {
          enemy.alive = false
          enemy.body.forEach(part => { this.foods.push({ ...part }) })
          this.spawnNewEnemy()
        }
      })
    }
  }

  private spawnNewEnemy(): void {
    if (this.gridSize === this.EXPANDED_GRID_SIZE) {
      this.enemies.push(this.createEnemy())
    }
  }

  private cleanDeadEnemies(): void {
    this.enemies = this.enemies.filter(e => e.alive)
  }

  private moveEnemies(): void {
    this.enemies.forEach(enemy => {
      if (!enemy.alive) return
      const head = enemy.body[0]
      const currentVector = DIRECTION_VECTOR[enemy.direction]
      const nextPos = { x: head.x + currentVector.x, y: head.y + currentVector.y }
      const willHitWall = this.checkWallCollision(nextPos)
      const willHitSelf = enemy.body.some(part => part.x === nextPos.x && part.y === nextPos.y)

      if (willHitWall || willHitSelf) {
        const safeDir = this.findSafeDirection(enemy)
        if (safeDir) enemy.direction = safeDir
        else {
          const dirs = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT]
          enemy.direction = dirs[Math.floor(Math.random() * dirs.length)]
        }
      } else if (Math.random() < 0.15) {
        const safeDir = this.findSafeDirection(enemy)
        if (safeDir && OPPOSITE_DIRECTION[enemy.direction] !== safeDir) enemy.direction = safeDir
      }

      const vector = DIRECTION_VECTOR[enemy.direction]
      const newHead: Position = { x: head.x + vector.x, y: head.y + vector.y }
      if (this.checkWallCollision(newHead) || enemy.body.some(part => part.x === newHead.x && part.y === newHead.y)) return

      if (this.snake.some(part => part.x === newHead.x && part.y === newHead.y)) {
        enemy.alive = false
        enemy.body.forEach(part => { this.foods.push({ ...part }) })
        this.spawnNewEnemy()
        return
      }

      enemy.body.unshift(newHead)
      enemy.body.pop()
    })
    this.checkEnemyCollisions()
  }

  private findSafeDirection(enemy: Enemy): Direction | null {
    const head = enemy.body[0]
    const directions = [Direction.UP, Direction.DOWN, Direction.LEFT, Direction.RIGHT]
    const safe: Direction[] = []
    for (const dir of directions) {
      if (OPPOSITE_DIRECTION[enemy.direction] === dir) continue
      const v = DIRECTION_VECTOR[dir]
      const test = { x: head.x + v.x, y: head.y + v.y }
      if (!this.checkWallCollision(test) && !enemy.body.some(p => p.x === test.x && p.y === test.y)) {
        safe.push(dir)
      }
    }
    return safe.length > 0 ? safe[Math.floor(Math.random() * safe.length)] : null
  }

  private checkEnemyCollisions(): void {
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i]
      if (!e1.alive) continue
      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j]
        if (!e2.alive) continue
        const h1 = e1.body[0], h2 = e2.body[0]
        if (h1.x === h2.x && h1.y === h2.y) {
          const dead = Math.random() < 0.5 ? e1 : e2
          dead.alive = false
          dead.body.forEach(p => this.foods.push({ ...p }))
          this.spawnNewEnemy()
        }
        if (e2.body.some(p => p.x === h1.x && p.y === h1.y)) {
          e1.alive = false; e1.body.forEach(p => this.foods.push({ ...p })); this.spawnNewEnemy()
        }
        if (e1.body.some(p => p.x === h2.x && p.y === h2.y)) {
          e2.alive = false; e2.body.forEach(p => this.foods.push({ ...p })); this.spawnNewEnemy()
        }
      }
    }
  }

  private checkWallCollision(pos: Position): boolean {
    return pos.x < 0 || pos.x >= this.gridSize || pos.y < 0 || pos.y >= this.gridSize
  }

  private checkSelfCollision(pos: Position): boolean {
    return this.snake.slice(0, -1).some(s => s.x === pos.x && s.y === pos.y)
  }

  private gameOver(): void {
    this.state = GameState.GAME_OVER
    this.stopGameLoop()
  }

  private startGameLoop(): void {
    if (this.gameLoopId !== null) return
    const loop = () => {
      if (this.state !== GameState.PLAYING) { this.stopGameLoop(); return }
      const now = Date.now()
      if (now - this.lastMoveTime >= this.speed) { this.move(); this.lastMoveTime = now }
      if (this.gridSize === this.EXPANDED_GRID_SIZE && now - this.lastEnemyMoveTime >= this.enemyMoveInterval) {
        this.moveEnemies(); this.lastEnemyMoveTime = now; this.cleanDeadEnemies()
      }
      this.gameLoopId = requestAnimationFrame(loop)
    }
    this.gameLoopId = requestAnimationFrame(loop)
  }

  private stopGameLoop(): void {
    if (this.gameLoopId !== null) { cancelAnimationFrame(this.gameLoopId); this.gameLoopId = null }
  }

  public getSaveData(): GameSaveData {
    return {
      snake: [...this.snake], food: this.foods.length > 0 ? this.foods : [],
      direction: this.direction, score: this.score, speed: this.speed,
      timestamp: Date.now(), gridSize: this.gridSize, foodCount: this.foodCount,
      enemies: this.enemies.map(e => ({ ...e, body: e.body.map(b => ({ ...b })) })),
    }
  }

  public loadSaveData(data: GameSaveData): void {
    this.snake = [...data.snake]
    this.foods = Array.isArray(data.food) ? data.food : [data.food]
    this.direction = data.direction; this.nextDirection = data.direction
    this.score = data.score; this.speed = data.speed
    this.gridSize = data.gridSize || this.INITIAL_GRID_SIZE
    this.foodCount = data.foodCount || 0; this.enemies = data.enemies || []
    this.state = GameState.PAUSED
  }

  public destroy(): void { this.stopGameLoop() }
}