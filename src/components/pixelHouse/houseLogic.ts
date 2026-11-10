/**
 * 像素小屋的純邏輯（不碰畫面）：時間、家具能放哪、他站哪、走哪條路、住的是誰、他現在的狀態。
 */
import type { CharAway } from "@/types/chat";
import {
  ACT_WEIGHTS,
  ACTS,
  DEPTH_BIAS,
  FLAT_ITEMS,
  ROOM_CORRIDOR,
  ROOM_H,
  ROOM_W,
  STRIP_ROOMS,
  type ActDef,
  type ItemZone,
  type RoomId,
  type Scene,
} from "./houseData";

/** 白天 6～17 點、黃昏 17～19 點、晚上 19～6 點（照現實時間） */
export function sceneAt(date: Date): Scene {
  const h = date.getHours();
  if (h >= 6 && h < 17) return "day";
  if (h >= 17 && h < 19) return "dusk";
  return "night";
}

// ===== 家具擺放 =====

export interface ItemBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 拖動家具後的位置：取整數格子，限制在自己的房間裡，牆上的只能在牆上、地上的底部要在地板上
 * @param floorTop 地板從哪一列開始（牆和地板的分界）
 * @param defaultY 門只能左右移，y 固定在原本的位置
 */
export function clampPlacement(
  zone: ItemZone,
  box: ItemBox,
  floorTop: number,
  defaultY: number,
): { x: number; y: number } {
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const x = clamp(Math.round(box.x), 0, ROOM_W - box.w);
  let y = Math.round(box.y);
  if (zone === "row" || zone === "fixed") y = defaultY;
  else if (zone === "wall") y = clamp(y, 0, floorTop - box.h);
  else if (zone === "floor") y = clamp(y, floorTop - 6 - box.h, ROOM_H - box.h);
  else y = clamp(y, 0, ROOM_H - box.h);
  return { x, y };
}

/**
 * 一組家具一起移動（窗戶和窗簾）：整組當成一個大框，限制在牆上，回傳實際移了幾格。
 * 每件之間的相對位置不變。
 */
export function clampGroupMove(boxes: ItemBox[], dx: number, dy: number, floorTop: number): { dx: number; dy: number } {
  if (!boxes.length) return { dx: 0, dy: 0 };
  const left = Math.min(...boxes.map((b) => b.x));
  const top = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  const pos = clampPlacement("wall", { x: left + dx, y: top + dy, w: right - left, h: bottom - top }, floorTop, top);
  return { dx: pos.x - left, dy: pos.y - top };
}

// ===== 誰在前面 =====

export interface DepthItem extends ItemBox {
  id: string;
  zone: ItemZone;
}

/**
 * 每件家具排在多前面（數字大的畫在上面；一樣大的照原本的順序）：
 * - 牆上的、不能動的：-1，在最下面
 * - 平貼地上的（地毯）：0
 * - 其他：看底部在哪一列，越下面越前面
 * - 放在別件家具上面的（桌上的杯子、櫃子上的電視）跟著那件家具，再前面一點
 */
export function itemDepths(room: RoomId, items: ReadonlyArray<DepthItem>): Record<string, number> {
  const flat = FLAT_ITEMS[room];
  const bias = DEPTH_BIAS[room];
  const out: Record<string, number> = {};
  const solid = items.filter((it) => it.zone !== "wall" && it.zone !== "fixed" && !flat.includes(it.id));
  const bottom = (it: DepthItem) => it.y + it.h;
  // 由下往上算：下面那件先算好，上面的才能跟著它
  const sorted = [...solid].sort((a, b) => bottom(b) - bottom(a));
  for (const it of items) {
    if (it.zone === "wall" || it.zone === "fixed") out[it.id] = -1;
    else if (flat.includes(it.id)) out[it.id] = 0;
  }
  for (const a of sorted) {
    let depth = bottom(a) + (bias[a.id] ?? 0);
    const cx = a.x + a.w / 2;
    for (const b of sorted) {
      if (b === a || bottom(b) <= bottom(a) || out[b.id] === undefined) continue;
      // 比 b 窄的 a，底部落在 b 的範圍裡（含剛好放在 b 上緣）：a 放在 b 上面或擺在它前面
      if (a.w <= b.w && bottom(a) >= b.y - 2 && cx >= b.x && cx < b.x + b.w) depth = Math.max(depth, out[b.id] + 0.01);
    }
    out[a.id] = depth;
  }
  return out;
}

/** 腳在 feetY 的他，哪些家具要畫在他前面 */
export function itemsInFront(depths: Record<string, number>, feetY: number): string[] {
  return Object.keys(depths).filter((id) => depths[id] > feetY);
}

// ===== 他站哪 =====

export interface Spot {
  room: RoomId;
  x: number;
  y: number;
}

/** 可以走的範圍（腳的位置） */
export function clampWalkable(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(x, 6), ROOM_W - 6),
    y: Math.min(Math.max(y, 150), 272),
  };
}

type Pos = { x: number; y: number };

/**
 * 做這件事時站哪：照設計稿的站位，家具搬了就跟著平移
 * @param current  這間房家具現在的位置
 * @param defaults 這間房家具預設的位置
 */
export function actSpot(
  act: ActDef,
  current: Record<string, Pos>,
  defaults: Record<string, Pos>,
): Spot {
  let { x, y } = act;
  if (act.anchor && current[act.anchor] && defaults[act.anchor]) {
    x += current[act.anchor].x - defaults[act.anchor].x;
    y += current[act.anchor].y - defaults[act.anchor].y;
  }
  return { room: act.room, ...clampWalkable(x, y) };
}

/** 跟著家具平移的點（蒸氣、躺的位置） */
export function followAnchor(
  point: [number, number],
  anchor: string | undefined,
  current: Record<string, Pos>,
  defaults: Record<string, Pos>,
): Pos {
  if (!anchor || !current[anchor] || !defaults[anchor]) return { x: point[0], y: point[1] };
  return {
    x: point[0] + current[anchor].x - defaults[anchor].x,
    y: point[1] + current[anchor].y - defaults[anchor].y,
  };
}

// ===== 他自己決定下一步 =====

/** 照時間的機率挑下一件事；一半以上的機會留在同一間，比較像在房間裡晃 */
export function pickAct(scene: Scene, current: string | null, room: RoomId | null, rand: () => number = Math.random): string {
  const weights = ACT_WEIGHTS[scene];
  let keys = Object.keys(weights).filter((k) => k !== current);
  const same = keys.filter((k) => ACTS[k].room === room);
  if (room && same.length && rand() < 0.55) keys = same;
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let r = rand() * total;
  for (const k of keys) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return keys[0];
}

/** 「少走動」時每件事做的時間乘幾倍 */
export const CALM_FACTOR = 4;

/**
 * 每件事做多久（毫秒）：睡覺 3～5 分鐘，其他 20～40 秒。
 * calm（設定的「少走動」）：再乘 4 倍，一兩分鐘才換一件事，比較省電。
 */
export function dwellMs(act: string, rand: () => number = Math.random, calm = false): number {
  const base = act === "sleep" ? 180_000 + rand() * 120_000 : 20_000 + rand() * 20_000;
  return calm ? base * CALM_FACTOR : base;
}

// ===== 走哪條路 =====

/** 一段路：走到 (x, y)；teleport 是穿過浴室的門，直接出現在另一邊 */
export interface Leg extends Spot {
  teleport?: boolean;
}

const FRONT_ROW_Y = 225;
const CROSS_Y = 200;

/** 同一間裡從 p 走到 q：前排和後排之間走走道 */
export function pathIn(room: RoomId, p: Pos, q: Pos): Leg[] {
  const front = (y: number) => y >= FRONT_ROW_Y;
  if (!front(p.y) && !front(q.y)) return [{ room, x: q.x, y: q.y }];
  const cx = ROOM_CORRIDOR[room];
  return [
    { room, x: cx, y: p.y },
    { room, x: cx, y: q.y },
    { room, x: q.x, y: q.y },
  ];
}

/**
 * 從 from 走到 to 的整條路。客廳｜臥室｜廚房排一排，走到房間邊上就到隔壁；
 * 浴室要走到臥室的門（bathDoor），穿過去出現在浴室門口。
 */
export function planRoute(from: Spot, to: Spot, bathDoor: Pos): Leg[] {
  const legs: Leg[] = [];
  let pos: Spot = { ...from };
  const BATH_ENTRY = { x: 118, y: 176 };

  if (pos.room === "bath" && to.room !== "bath") {
    legs.push(...pathIn("bath", pos, BATH_ENTRY));
    legs.push({ room: "bedroom", ...bathDoor, teleport: true });
    pos = { room: "bedroom", ...bathDoor };
  }
  const targetStripRoom: RoomId = to.room === "bath" ? "bedroom" : to.room;
  if (pos.room !== "bath") {
    let idx = STRIP_ROOMS.indexOf(pos.room);
    const end = STRIP_ROOMS.indexOf(targetStripRoom);
    while (idx !== end) {
      const dir = Math.sign(end - idx);
      const room = STRIP_ROOMS[idx];
      const exitX = dir > 0 ? ROOM_W : 0;
      legs.push(...pathIn(room, pos, { x: exitX, y: CROSS_Y }));
      idx += dir;
      // 隔壁房間的邊上就是同一個點，接著走進去
      pos = { room: STRIP_ROOMS[idx], x: dir > 0 ? 0 : ROOM_W, y: CROSS_Y };
      legs.push({ ...pos });
    }
    if (to.room === "bath") {
      legs.push(...pathIn("bedroom", pos, bathDoor));
      legs.push({ room: "bath", ...BATH_ENTRY, teleport: true });
      pos = { room: "bath", ...BATH_ENTRY };
    }
  }
  legs.push(...pathIn(to.room, pos, to));
  return legs;
}

/** 房間在橫條裡的位置（浴室算臥室） */
export function stripIndex(room: RoomId): number {
  return STRIP_ROOMS.indexOf(room === "bath" ? "bedroom" : room);
}

// ===== 住的是誰 =====

interface ChatLike {
  characterId?: string;
  isGroupChat?: boolean;
  updatedAt?: number;
}

/** 第一次用：最近聊過的那位（不算群聊） */
export function pickDefaultResident(chats: ReadonlyArray<ChatLike>): string | null {
  let best: ChatLike | null = null;
  for (const c of chats) {
    if (c.isGroupChat || !c.characterId) continue;
    if (!best || (c.updatedAt || 0) > (best.updatedAt || 0)) best = c;
  }
  return best?.characterId ?? null;
}

// ===== 他現在的狀態 =====

export type ResidentStatus = "home" | "sleep" | "busy" | "away" | "date";

/** 跟聊天裡的真實狀態連動：在睡、在忙、暫離、出門約會 */
export function residentStatus(
  away: CharAway | undefined,
  dateOngoing: boolean,
): ResidentStatus {
  if (dateOngoing) return "date";
  if (away && !away.endedAt && !away.pausedAt) {
    if (away.kind === "sleep") return "sleep";
    if (away.kind === "busy") return "busy";
    return "away";
  }
  return "home";
}
