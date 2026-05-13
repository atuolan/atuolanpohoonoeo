/**
 * Pacman 核心遊戲邏輯
 * 參考 https://github.com/mumuy/pacman (MIT License, HaoLe Zheng)
 * 重寫為 TypeScript，整合到 aguaphone Vue App。
 */

export type Dir = 0 | 1 | 2 | 3; // 0:右 1:下 2:左 3:上

export interface Cell {
  x: number;
  y: number;
}

export enum PacmanState {
  READY = 'ready',
  PLAYING = 'playing',
  PAUSED = 'paused',
  DYING = 'dying',
  LEVEL_CLEAR = 'level_clear',
  GAME_OVER = 'game_over',
  WIN = 'win',
}

export interface GhostInfo {
  id: number;
  color: string;
  cx: number; // 連續座標（單位：格）
  cy: number;
  dir: Dir;
  frightened: boolean;
  eaten: boolean; // 被吃後返家中
  releaseDelay: number; // 剩餘多少 tick 才從鬼屋出來
  speed: number;
  // 上次規劃路徑時所在的格座標，避免在同格內反覆規劃
  lastCellX: number;
  lastCellY: number;
}

export interface PacmanInfo {
  cx: number;
  cy: number;
  dir: Dir;
  nextDir: Dir;
  mouthFrame: number;
}

// 地圖編碼：
// 1 = 牆
// 0 = 走道(含豆子)
// 2 = 走道(無豆子)
// 3 = 能量豆
//
// 程式生成的格狀迷宮，避免手寫排版錯誤。
export const MAP_WIDTH = 19;
export const MAP_HEIGHT = 21;
const CORRIDOR_ROWS = new Set([1, 4, 7, 10, 13, 16, 19]);
const CORRIDOR_COLS = new Set([1, 4, 9, 14, 17]);

export const GHOST_COLORS = ['#ff3a3a', '#ffb1ff', '#00ffff', '#ffb14a'];

const DIR_DX: Record<Dir, number> = { 0: 1, 1: 0, 2: -1, 3: 0 };
const DIR_DY: Record<Dir, number> = { 0: 0, 1: 1, 2: 0, 3: -1 };

function cloneMap(src: number[][]): number[][] {
  return src.map((row) => row.slice());
}

function parseMap(): number[][] {
  const map: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      const isBorder =
        x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1;
      if (isBorder) row.push(1);
      else if (CORRIDOR_ROWS.has(y) || CORRIDOR_COLS.has(x)) row.push(0);
      else row.push(1);
    }
    map.push(row);
  }
  // 隧道：左右兩側中央留洞
  map[10][0] = 2;
  map[10][MAP_WIDTH - 1] = 2;
  // 四個能量豆
  map[1][1] = 3;
  map[1][MAP_WIDTH - 2] = 3;
  map[MAP_HEIGHT - 2][1] = 3;
  map[MAP_HEIGHT - 2][MAP_WIDTH - 2] = 3;
  return map;
}

/** BFS 尋路：從 start 到 end，回傳第一步要到的鄰格（不含 start）。 */
function bfsNextStep(
  map: number[][],
  start: Cell,
  end: Cell,
  allowDoor: boolean,
  forbiddenDir?: Dir,
): Cell | null {
  const h = map.length;
  const w = map[0].length;
  const isWalkable = (x: number, y: number) => {
    if (y < 0 || y >= h) return false;
    // 隧道：水平方向 x 環繞
    const v = map[y][(x + w) % w];
    if (v === 1) return false;
    if (v === 4 && !allowDoor) return false;
    return true;
  };
  if (!isWalkable(end.x, end.y)) return null;
  const prev: (Cell | null)[][] = Array.from({ length: h }, () =>
    Array(w).fill(null),
  );
  const visited: boolean[][] = Array.from({ length: h }, () =>
    Array(w).fill(false),
  );
  const sx = (start.x + w) % w;
  visited[start.y][sx] = true;
  const queue: Cell[] = [{ x: sx, y: start.y }];
  let found = false;
  // 第一步限制反向
  const firstStepBlocked: Dir | undefined = forbiddenDir;
  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.x === (end.x + w) % w && cur.y === end.y) {
      found = true;
      break;
    }
    const isFirstStep = cur.x === sx && cur.y === start.y;
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) {
      if (isFirstStep && firstStepBlocked === d) continue;
      const nx = (cur.x + DIR_DX[d] + w) % w;
      const ny = cur.y + DIR_DY[d];
      if (!isWalkable(nx, ny)) continue;
      if (visited[ny][nx]) continue;
      visited[ny][nx] = true;
      prev[ny][nx] = cur;
      queue.push({ x: nx, y: ny });
    }
  }
  if (!found) return null;
  let cur: Cell = { x: (end.x + w) % w, y: end.y };
  while (prev[cur.y][cur.x]) {
    const p = prev[cur.y][cur.x]!;
    if (p.x === sx && p.y === start.y) return cur;
    cur = p;
  }
  return null;
}

export class PacmanGame {
  map: number[][] = parseMap();
  initialMap: number[][] = parseMap();
  state: PacmanState = PacmanState.READY;
  score = 0;
  lives = 3;
  level = 1;
  pelletsRemaining = 0;

  pacman: PacmanInfo = {
    cx: 9,
    cy: 13,
    dir: 2,
    nextDir: 2,
    mouthFrame: 0,
  };

  ghosts: GhostInfo[] = [];

  frightenedTicks = 0; // 剩餘嚇人模式 tick 數
  diedAtTick = 0;
  tick = 0;

  // 每幀位移（單位：格/tick），ghosts 用 speed 控制
  // 對應原版 (cell=20px, speed=2px/frame) => 0.1 格/tick
  private pacmanSpeed = 0.1;

  constructor() {
    this.reset(true);
  }

  reset(full = true): void {
    this.map = cloneMap(this.initialMap);
    this.pelletsRemaining = 0;
    for (let y = 0; y < MAP_HEIGHT; y++) {
      for (let x = 0; x < MAP_WIDTH; x++) {
        const v = this.map[y][x];
        if (v === 0 || v === 3) this.pelletsRemaining++;
      }
    }
    this.pacman = { cx: 9, cy: 13, dir: 2, nextDir: 2, mouthFrame: 0 };
    this.ghosts = [
      this.makeGhost(0, 9, 7, 0),
      this.makeGhost(1, 4, 10, 60),
      this.makeGhost(2, 14, 10, 120),
      this.makeGhost(3, 9, 10, 180),
    ];
    this.frightenedTicks = 0;
    this.tick = 0;
    if (full) {
      this.state = PacmanState.READY;
      this.score = 0;
      this.lives = 3;
      this.level = 1;
    }
  }

  private makeGhost(id: number, x: number, y: number, delay: number): GhostInfo {
    return {
      id,
      color: GHOST_COLORS[id],
      cx: x,
      cy: y,
      dir: 3,
      frightened: false,
      eaten: false,
      releaseDelay: delay,
      speed: 0.05 + this.level * 0.003,
      lastCellX: -1,
      lastCellY: -1,
    };
  }

  start(): void {
    if (this.state === PacmanState.READY || this.state === PacmanState.GAME_OVER) {
      this.reset(this.state === PacmanState.GAME_OVER);
      this.state = PacmanState.PLAYING;
    } else if (this.state === PacmanState.PAUSED) {
      this.state = PacmanState.PLAYING;
    }
  }

  pause(): void {
    if (this.state === PacmanState.PLAYING) this.state = PacmanState.PAUSED;
  }

  resume(): void {
    if (this.state === PacmanState.PAUSED) this.state = PacmanState.PLAYING;
  }

  togglePause(): void {
    if (this.state === PacmanState.PLAYING) this.pause();
    else if (this.state === PacmanState.PAUSED) this.resume();
  }

  setDir(d: Dir): void {
    this.pacman.nextDir = d;
  }

  /** 對一個格座標四捨五入到整數，並判斷是否接近格中心 */
  private nearCenter(c: number): boolean {
    // 閾值需 >= 單幀最大位移，否則高速時會「錯過」格中心導致無法轉向
    return Math.abs(c - Math.round(c)) < 0.12;
  }

  private isWall(x: number, y: number, allowDoor: boolean): boolean {
    if (y < 0 || y >= MAP_HEIGHT) return true;
    const xx = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    const v = this.map[y][xx];
    if (v === 1) return true;
    if (v === 4 && !allowDoor) return true;
    return false;
  }

  step(): void {
    if (this.state !== PacmanState.PLAYING) {
      // DYING 動畫期間繼續推進，方便外部重生
      if (this.state === PacmanState.DYING) {
        if (this.tick - this.diedAtTick > 60) {
          if (this.lives <= 0) {
            this.state = PacmanState.GAME_OVER;
          } else {
            this.respawn();
            this.state = PacmanState.PLAYING;
          }
        }
        this.tick++;
      }
      return;
    }
    this.tick++;
    this.movePacman();
    this.eatPellet();
    this.moveGhosts();
    this.handleCollisions();

    if (this.frightenedTicks > 0) {
      this.frightenedTicks--;
      if (this.frightenedTicks === 0) {
        this.ghosts.forEach((g) => {
          if (!g.eaten) g.frightened = false;
        });
      }
    }

    if (this.pelletsRemaining <= 0) {
      this.level++;
      if (this.level > 5) {
        this.state = PacmanState.WIN;
      } else {
        this.reset(false);
        this.state = PacmanState.PLAYING;
      }
    }
  }

  private movePacman(): void {
    const p = this.pacman;
    p.mouthFrame = (p.mouthFrame + 1) % 16;

    // 嘗試轉向（在格中心附近）
    if (p.nextDir !== p.dir && this.nearCenter(p.cx) && this.nearCenter(p.cy)) {
      const rx = Math.round(p.cx);
      const ry = Math.round(p.cy);
      const nx = rx + DIR_DX[p.nextDir];
      const ny = ry + DIR_DY[p.nextDir];
      if (!this.isWall(nx, ny, false)) {
        p.dir = p.nextDir;
        p.cx = rx;
        p.cy = ry;
      }
    }
    // 前進
    const dx = DIR_DX[p.dir] * this.pacmanSpeed;
    const dy = DIR_DY[p.dir] * this.pacmanSpeed;
    const newX = p.cx + dx;
    const newY = p.cy + dy;
    // 邊界（隧道）
    let testX = newX;
    if (p.dir === 0 || p.dir === 2) {
      // 朝向格中線移動，檢查下一格是否為牆
      const aheadX = p.dir === 0 ? Math.floor(newX + 0.5) : Math.ceil(newX - 0.5);
      const ry = Math.round(p.cy);
      const wrappedAhead = ((aheadX % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
      if (this.isWall(wrappedAhead, ry, false)) {
        // 卡在格中心
        p.cx = Math.round(p.cx);
      } else {
        p.cx = newX;
      }
      // 隧道環繞
      if (p.cx < -0.5) p.cx += MAP_WIDTH;
      if (p.cx > MAP_WIDTH - 0.5) p.cx -= MAP_WIDTH;
      // y 拉回格中心
      p.cy = Math.round(p.cy);
      void testX;
    } else {
      const aheadY = p.dir === 1 ? Math.floor(newY + 0.5) : Math.ceil(newY - 0.5);
      const rx = Math.round(p.cx);
      if (this.isWall(rx, aheadY, false)) {
        p.cy = Math.round(p.cy);
      } else {
        p.cy = newY;
      }
      p.cx = Math.round(p.cx);
    }
  }

  private eatPellet(): void {
    const x = Math.round(this.pacman.cx);
    const y = Math.round(this.pacman.cy);
    if (!this.nearCenter(this.pacman.cx) || !this.nearCenter(this.pacman.cy))
      return;
    if (y < 0 || y >= MAP_HEIGHT) return;
    const xx = ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    const v = this.map[y][xx];
    if (v === 0) {
      this.map[y][xx] = 2;
      this.score += 10;
      this.pelletsRemaining--;
    } else if (v === 3) {
      this.map[y][xx] = 2;
      this.score += 50;
      this.pelletsRemaining--;
      this.frightenedTicks = Math.max(360 - (this.level - 1) * 30, 120);
      this.ghosts.forEach((g) => {
        if (!g.eaten) g.frightened = true;
      });
    }
  }

  private moveGhosts(): void {
    for (const g of this.ghosts) {
      if (g.releaseDelay > 0) {
        g.releaseDelay--;
        continue;
      }
      const speed = g.eaten
        ? 0.1
        : g.frightened
          ? Math.max(0.03, g.speed - 0.025)
          : g.speed;
      // 進入新格中心時才重新尋路（避免在同格內反覆規劃導致卡住）
      const cellX = Math.round(g.cx);
      const cellY = Math.round(g.cy);
      const enteredNewCell =
        cellX !== g.lastCellX || cellY !== g.lastCellY;
      if (
        enteredNewCell &&
        this.nearCenter(g.cx) &&
        this.nearCenter(g.cy)
      ) {
        g.cx = cellX;
        g.cy = cellY;
        g.lastCellX = cellX;
        g.lastCellY = cellY;
        const target = this.ghostTarget(g);
        const allowDoor = g.eaten || g.cy <= 12; // 鬼屋附近允許穿門
        const forbid = ((g.dir + 2) % 4) as Dir;
        const next = bfsNextStep(
          this.map,
          { x: g.cx, y: g.cy },
          target,
          allowDoor,
          forbid,
        );
        if (next) {
          if (next.x !== g.cx) g.dir = next.x > g.cx ? 0 : 2;
          else if (next.y !== g.cy) g.dir = next.y > g.cy ? 1 : 3;
        } else {
          // 找不到路：隨機合法方向
          const dirs: Dir[] = [0, 1, 2, 3];
          for (const d of dirs) {
            if (d === forbid) continue;
            const nx = (g.cx + DIR_DX[d] + MAP_WIDTH) % MAP_WIDTH;
            const ny = g.cy + DIR_DY[d];
            if (!this.isWall(nx, ny, allowDoor)) {
              g.dir = d;
              break;
            }
          }
        }
      }
      g.cx += DIR_DX[g.dir] * speed;
      g.cy += DIR_DY[g.dir] * speed;
      if (g.cx < -0.5) g.cx += MAP_WIDTH;
      if (g.cx > MAP_WIDTH - 0.5) g.cx -= MAP_WIDTH;

      // 被吃後回到鬼屋中心則復活
      if (g.eaten && Math.abs(g.cx - 9) < 0.2 && Math.abs(g.cy - 10) < 0.2) {
        g.eaten = false;
        g.frightened = false;
        g.releaseDelay = 30;
      }
    }
  }

  private ghostTarget(g: GhostInfo): Cell {
    if (g.eaten) return { x: 9, y: 10 };
    if (g.frightened) {
      // 嚇人模式：朝四角隨機
      const corners: Cell[] = [
        { x: 1, y: 1 },
        { x: MAP_WIDTH - 2, y: 1 },
        { x: 1, y: MAP_HEIGHT - 2 },
        { x: MAP_WIDTH - 2, y: MAP_HEIGHT - 2 },
      ];
      return corners[(g.id + this.tick) % 4];
    }
    const px = Math.round(this.pacman.cx);
    const py = Math.round(this.pacman.cy);
    // 4 隻幽靈不同策略，參考原版 AI
    switch (g.id) {
      case 0:
        // 紅：直接追擊
        return { x: px, y: py };
      case 1: {
        // 粉：預判 4 格
        const fx = px + DIR_DX[this.pacman.dir] * 4;
        const fy = py + DIR_DY[this.pacman.dir] * 4;
        return { x: fx, y: fy };
      }
      case 2: {
        // 青：依紅怪反射
        const red = this.ghosts[0];
        const fx = px + (px - Math.round(red.cx));
        const fy = py + (py - Math.round(red.cy));
        return { x: fx, y: fy };
      }
      case 3: {
        // 橘：遠則追、近則退角
        const dist =
          Math.abs(px - Math.round(g.cx)) + Math.abs(py - Math.round(g.cy));
        if (dist > 6) return { x: px, y: py };
        return { x: 1, y: MAP_HEIGHT - 2 };
      }
    }
    return { x: px, y: py };
  }

  private handleCollisions(): void {
    const px = this.pacman.cx;
    const py = this.pacman.cy;
    for (const g of this.ghosts) {
      if (g.releaseDelay > 0) continue;
      const d = Math.abs(g.cx - px) + Math.abs(g.cy - py);
      if (d < 0.6) {
        if (g.eaten) continue;
        if (g.frightened) {
          g.frightened = false;
          g.eaten = true;
          this.score += 200;
        } else {
          this.die();
          return;
        }
      }
    }
  }

  private die(): void {
    this.lives--;
    this.state = PacmanState.DYING;
    this.diedAtTick = this.tick;
  }

  private respawn(): void {
    this.pacman = { cx: 9, cy: 13, dir: 2, nextDir: 2, mouthFrame: 0 };
    this.ghosts = [
      this.makeGhost(0, 9, 7, 0),
      this.makeGhost(1, 4, 10, 60),
      this.makeGhost(2, 14, 10, 120),
      this.makeGhost(3, 9, 10, 180),
    ];
    this.frightenedTicks = 0;
  }

  destroy(): void {
    this.state = PacmanState.GAME_OVER;
  }
}
