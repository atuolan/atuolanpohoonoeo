/**
 * 像素小屋存的東西（localStorage，會跟著備份走）：
 * - 主頁用哪種：畫布或像素小屋
 * - 住在小屋的角色（第一次用時是最近聊天的那位，之後固定）
 * - 小人是男生還是女生
 * - 家具擺在哪（只存搬過的）
 */
import type { RoomId } from "./houseData";

export type HomeStyle = "canvas" | "pixel-house";
export type ResidentLook = "boy" | "girl";

export interface PixelHouseState {
  homeStyle: HomeStyle;
  residentCharId: string | null;
  look: ResidentLook;
  /** 房間 → 家具 id → [x, y]（房間格子） */
  placements: Partial<Record<RoomId, Record<string, [number, number]>>>;
}

const STORAGE_KEY = "pixel_house_state";
export const PIXEL_HOUSE_CHANGED_EVENT = "aguaphone:pixel-house-changed";

export function defaultPixelHouseState(): PixelHouseState {
  return { homeStyle: "canvas", residentCharId: null, look: "boy", placements: {} };
}

/** 讀不到或格式不對的欄位用預設值 */
export function parsePixelHouseState(raw: unknown): PixelHouseState {
  const base = defaultPixelHouseState();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const placements: PixelHouseState["placements"] = {};
  if (r.placements && typeof r.placements === "object") {
    for (const [room, items] of Object.entries(r.placements as Record<string, unknown>)) {
      if (!items || typeof items !== "object") continue;
      const clean: Record<string, [number, number]> = {};
      for (const [id, pos] of Object.entries(items as Record<string, unknown>)) {
        if (Array.isArray(pos) && pos.length === 2 && pos.every((n) => typeof n === "number" && Number.isFinite(n))) {
          clean[id] = [pos[0], pos[1]];
        }
      }
      placements[room as RoomId] = clean;
    }
  }
  return {
    homeStyle: r.homeStyle === "pixel-house" ? "pixel-house" : "canvas",
    residentCharId: typeof r.residentCharId === "string" && r.residentCharId ? r.residentCharId : null,
    look: r.look === "girl" ? "girl" : "boy",
    placements,
  };
}

export function loadPixelHouseState(): PixelHouseState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return parsePixelHouseState(saved ? JSON.parse(saved) : null);
  } catch {
    return defaultPixelHouseState();
  }
}

export function savePixelHouseState(state: PixelHouseState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存不了就只在這次開啟有效
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PIXEL_HOUSE_CHANGED_EVENT));
  }
}

/** 改幾個欄位後存起來，回傳新的狀態 */
export function updatePixelHouseState(patch: Partial<PixelHouseState>): PixelHouseState {
  const next = { ...loadPixelHouseState(), ...patch };
  savePixelHouseState(next);
  return next;
}
