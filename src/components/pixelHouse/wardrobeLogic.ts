/**
 * 換外觀的純邏輯（不碰畫面、不碰儲存）：
 * - 每個角色的穿搭（Outfit）讀檔、預設值
 * - 每個部位有哪些款式、價錢、買了沒、這套要付多少
 * - 某個動作某一格要疊哪些圖層（含用戶上傳的）
 * - 換顏色：保留原本的深淺，換成選的顏色
 * - 上傳的圖尺寸對不對
 */
import type { ResidentLook } from "./houseState";
import {
  DEFAULT_STYLE_PRICE,
  DEFAULT_UPLOAD_FEE,
  PART_SLOT_IDS,
  colorSlotOf,
  ownerSlotOf,
  partSlotDef,
  type PartSlot,
} from "./wardrobeData";

// ===== 紙娃娃清單（doll.json） =====

export interface DollPose {
  w: number;
  h: number;
  /** 好幾格的動作（走路）：幾格、每格幾毫秒；每個款式是一格一張圖 */
  frames?: number;
  ms?: number;
  /** 畫的是往哪邊；另一邊左右翻 */
  faces?: "left" | "right";
  layers: { slot: string; styles: Record<string, string | string[]> }[];
}
export interface DollManifest {
  poses: Record<string, DollPose>;
  /** 沒選的部位穿哪款；null = 不穿（例如女生預設不穿外套）。沒寫 = 第一款 */
  defaults?: Partial<Record<string, string | null>>;
}

/** wardrobe.json：款式的名字、價錢，上傳費 */
export interface WardrobeCatalog {
  uploadFee?: number;
  styles?: Partial<Record<PartSlot, Record<string, { name?: string; price?: number }>>>;
}

// ===== 穿搭 =====

export interface Outfit {
  /** 男生／女生的身體 */
  base: ResidentLook;
  /** 部位 → 款式 id（你畫的是 "01"、"02"…；用戶上傳的是 "u-…"）；null = 不穿；沒寫 = 第一款 */
  parts: Partial<Record<PartSlot, string | null>>;
  /** 部位 → 顏色（#RRGGBB）；沒寫 = 原色 */
  colors: Partial<Record<PartSlot, string>>;
  /** 買過的款式："<身體>/<部位>/<款式>" */
  owned: string[];
}

/** 用戶上傳的一件 */
export interface CustomPart {
  id: string;
  base: ResidentLook;
  slot: PartSlot;
  name: string;
  /** 整張圖（data URL），一格一格往右排：正面｜背面｜走路 1~4 */
  sheet: string;
  /** 幾格（3：正面、背面、走路 1；6：再加走路 2~4） */
  cells: number;
  createdAt: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function defaultOutfit(base: ResidentLook): Outfit {
  return { base, parts: {}, colors: {}, owned: [] };
}

/** 讀不到或格式不對的欄位用預設值 */
export function parseOutfit(raw: unknown, fallbackBase: ResidentLook): Outfit {
  if (!raw || typeof raw !== "object") return defaultOutfit(fallbackBase);
  const r = raw as Record<string, unknown>;
  const base: ResidentLook = r.base === "girl" ? "girl" : r.base === "boy" ? "boy" : fallbackBase;
  const parts: Outfit["parts"] = {};
  const colors: Outfit["colors"] = {};
  if (r.parts && typeof r.parts === "object") {
    for (const [k, v] of Object.entries(r.parts as Record<string, unknown>)) {
      if (!PART_SLOT_IDS.includes(k as PartSlot)) continue;
      if (v === null && partSlotDef(k)?.optional) parts[k as PartSlot] = null;
      else if (typeof v === "string" && v) parts[k as PartSlot] = v;
    }
  }
  if (r.colors && typeof r.colors === "object") {
    for (const [k, v] of Object.entries(r.colors as Record<string, unknown>)) {
      if (PART_SLOT_IDS.includes(k as PartSlot) && typeof v === "string" && HEX.test(v)) colors[k as PartSlot] = v.toUpperCase();
    }
  }
  const owned = Array.isArray(r.owned) ? r.owned.filter((x): x is string => typeof x === "string") : [];
  return { base, parts, colors, owned: [...new Set(owned)] };
}

export function parseCustomParts(raw: unknown): CustomPart[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomPart[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id.startsWith("u-")) continue;
    if (!PART_SLOT_IDS.includes(r.slot as PartSlot) || r.slot === "body") continue;
    if (typeof r.sheet !== "string" || !r.sheet.startsWith("data:image/")) continue;
    out.push({
      id: r.id,
      base: r.base === "girl" ? "girl" : "boy",
      slot: r.slot as PartSlot,
      name: typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 20) : "自己畫的",
      sheet: r.sheet,
      cells: r.cells === 6 ? 6 : 3,
      createdAt: typeof r.createdAt === "number" ? r.createdAt : 0,
    });
  }
  return out;
}

// ===== 款式 =====

export const ownedKey = (base: ResidentLook, slot: PartSlot, style: string) => `${base}/${slot}/${style}`;

/** 你畫的款式：每個有這個部位的動作都要有這款，才算完整、能選 */
export function officialStyles(manifest: DollManifest | null, slot: PartSlot): string[] {
  if (!manifest) return [];
  let common: string[] | null = null;
  for (const pose of Object.values(manifest.poses)) {
    const layer = pose.layers.find((l) => l.slot === slot);
    if (!layer) continue;
    const ids = Object.keys(layer.styles);
    common = common ? common.filter((s) => ids.includes(s)) : ids;
  }
  return (common ?? []).sort();
}

export function styleInfo(catalog: WardrobeCatalog | null, slot: PartSlot, style: string): { name: string; price: number } {
  const c = catalog?.styles?.[slot]?.[style];
  const fallbackPrice = style === "01" ? 0 : DEFAULT_STYLE_PRICE;
  const price = typeof c?.price === "number" && c.price >= 0 ? Math.round(c.price) : fallbackPrice;
  return { name: c?.name || `款式 ${style}`, price };
}

export function uploadFee(catalog: WardrobeCatalog | null): number {
  const f = catalog?.uploadFee;
  return typeof f === "number" && f >= 0 ? Math.round(f) : DEFAULT_UPLOAD_FEE;
}

export function isStyleOwned(outfit: Outfit, catalog: WardrobeCatalog | null, slot: PartSlot, style: string): boolean {
  if (style.startsWith("u-")) return true; // 上傳時已經付過
  return styleInfo(catalog, slot, style).price === 0 || outfit.owned.includes(ownedKey(outfit.base, slot, style));
}

export type PartChoice = { kind: "none" } | { kind: "official"; style: string } | { kind: "custom"; part: CustomPart };

/** 這個部位現在穿什麼：沒選、選的不存在 → 第一款 */
export function resolveChoice(outfit: Outfit, manifest: DollManifest | null, slot: PartSlot, customs: CustomPart[]): PartChoice {
  const pick = slot in outfit.parts ? outfit.parts[slot] : manifest?.defaults?.[slot];
  const def = partSlotDef(slot);
  if (pick === null && def?.optional) return { kind: "none" };
  if (typeof pick === "string" && pick.startsWith("u-")) {
    const part = customs.find((c) => c.id === pick && c.base === outfit.base && c.slot === slot);
    if (part) return { kind: "custom", part };
  }
  const styles = officialStyles(manifest, slot);
  if (typeof pick === "string" && styles.includes(pick)) return { kind: "official", style: pick };
  return styles.length ? { kind: "official", style: styles[0] } : { kind: "none" };
}

/** 這套裡還沒買的款式和總價 */
export function outfitCost(
  outfit: Outfit,
  manifest: DollManifest | null,
  catalog: WardrobeCatalog | null,
  customs: CustomPart[],
): { total: number; items: { slot: PartSlot; style: string; name: string; price: number }[] } {
  const items: { slot: PartSlot; style: string; name: string; price: number }[] = [];
  for (const slot of PART_SLOT_IDS) {
    const choice = resolveChoice(outfit, manifest, slot, customs);
    if (choice.kind !== "official") continue;
    if (isStyleOwned(outfit, catalog, slot, choice.style)) continue;
    const info = styleInfo(catalog, slot, choice.style);
    items.push({ slot, style: choice.style, name: info.name, price: info.price });
  }
  return { total: items.reduce((s, i) => s + i.price, 0), items };
}

/** 付完錢：把這套裡的款式記成買過了 */
export function markOwned(outfit: Outfit, items: { slot: PartSlot; style: string }[]): Outfit {
  const owned = new Set(outfit.owned);
  for (const i of items) owned.add(ownedKey(outfit.base, i.slot, i.style));
  return { ...outfit, owned: [...owned] };
}

// ===== 疊圖層 =====

/** 一層圖從哪來 */
export type LayerSource =
  | { kind: "file"; path: string }
  /**
   * 用戶上傳的第幾格；那格空著就改用 fallbackCell。
   * 走路第 2~4 格畫的是「走路 1」那格（cell 2）時，照身體這格的高低上下移。
   */
  | { kind: "custom"; part: CustomPart; cell: number; fallbackCell: number | null };

export interface PlanLayer {
  layer: string;
  source: LayerSource;
  color: string | null;
  keepNeutrals: boolean;
}

/** 沒有這層的動作要插進用戶上傳的部位時，照這個順序插（由底往上） */
const DEFAULT_ORDER = ["hairBack", "body", "underwear", "shoes", "pants", "shirt", "jacket", "eyes", "blush", "brows", "hair"];

/** 用戶上傳的圖哪一格對到哪個動作；只有 3 格的，走路 2~4 都用走路 1（畫的時候再照身體上下移） */
function customSource(part: CustomPart, pose: string, frame: number): LayerSource | null {
  let cell: number;
  if (pose === "front") cell = 0;
  else if (pose === "back") cell = 1;
  else if (pose === "walk") cell = 2 + Math.max(0, Math.min(3, frame));
  else return null;
  const has = cell < part.cells;
  return { kind: "custom", part, cell: has ? cell : 2, fallbackCell: has && cell >= 3 ? 2 : null };
}

/** 某個動作的某一格，由底往上要疊哪些圖 */
export function buildLayerPlan(
  manifest: DollManifest,
  poseName: string,
  frame: number,
  outfit: Outfit,
  customs: CustomPart[],
): PlanLayer[] {
  const pose = manifest.poses[poseName];
  if (!pose) return [];
  const pickFile = (styles: Record<string, string | string[]>, style: string): string | null => {
    const v = styles[style] ?? Object.values(styles)[0];
    if (!v) return null;
    if (Array.isArray(v)) return v[Math.min(frame, v.length - 1)] ?? v[0] ?? null;
    return v;
  };
  const colorFor = (layer: string) => {
    const slot = colorSlotOf(layer);
    return slot ? (outfit.colors[slot] ?? null) : null;
  };
  const keepFor = (layer: string) => !!partSlotDef(colorSlotOf(layer) ?? "")?.keepNeutrals;

  const plan: PlanLayer[] = [];
  const choices = new Map<PartSlot, PartChoice>();
  for (const slot of PART_SLOT_IDS) choices.set(slot, resolveChoice(outfit, manifest, slot, customs));

  for (const l of pose.layers) {
    const slot = ownerSlotOf(l.slot);
    const choice = slot ? choices.get(slot)! : null;
    if (choice?.kind === "none") continue;
    if (slot && slot !== l.slot) {
      // 跟著別的部位的層（身體後面的頭髮）：那款有畫才疊，上傳的沒有這層
      const v = choice?.kind === "official" ? l.styles[choice.style] : undefined;
      const path = Array.isArray(v) ? (v[Math.min(frame, v.length - 1)] ?? null) : (v ?? null);
      if (path) plan.push({ layer: l.slot, source: { kind: "file", path }, color: colorFor(l.slot), keepNeutrals: keepFor(l.slot) });
      continue;
    }
    if (choice?.kind === "custom") {
      const source = customSource(choice.part, poseName, frame);
      if (source) {
        plan.push({ layer: l.slot, source, color: colorFor(l.slot), keepNeutrals: keepFor(l.slot) });
        continue;
      }
      // 這個動作沒有上傳的那格（例如之後的睡覺）：先用你畫的第一款
    }
    const style = choice?.kind === "official" ? choice.style : Object.keys(l.styles).sort()[0];
    const path = pickFile(l.styles, style);
    if (path) plan.push({ layer: l.slot, source: { kind: "file", path }, color: colorFor(l.slot), keepNeutrals: keepFor(l.slot) });
  }

  // 這個動作沒有這層、但穿了用戶上傳的（例如走路沒有鞋子層）：插進去
  for (const [slot, choice] of choices) {
    if (choice.kind !== "custom" || pose.layers.some((l) => l.slot === slot)) continue;
    const source = customSource(choice.part, poseName, frame);
    if (!source) continue;
    const entry: PlanLayer = { layer: slot, source, color: colorFor(slot), keepNeutrals: keepFor(slot) };
    const rank = DEFAULT_ORDER.indexOf(slot);
    const at = plan.findIndex((p) => DEFAULT_ORDER.indexOf(p.layer) > rank);
    if (at < 0) plan.push(entry);
    else plan.splice(at, 0, entry);
  }
  return plan;
}

/** 走路每格身體比第一格高（負）或低（正）幾格：用頭頂的位置算 */
export function bobOffsets(tops: (number | null)[]): number[] {
  const base = tops[0] ?? 0;
  return tops.map((t) => (t === null ? 0 : t - base));
}

// ===== 換顏色 =====

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(hue(h + 1 / 3) * 255), Math.round(hue(h) * 255), Math.round(hue(h - 1 / 3) * 255)];
}

const isNeutral = (s: number, l: number) => (l > 0.86 && s < 0.25) || l < 0.1;

/**
 * 把一層圖換成指定顏色：最多的那個顏色（主色）變成選的顏色，
 * 其他顏色照它們跟主色差多少亮、多少飽和，一樣套上去（陰影、亮面、外框都留著）。
 * 選的顏色太亮或太暗時把深淺差距壓縮，不會整片變白或變黑。直接改 data。
 */
export function recolorPixels(data: Uint8ClampedArray, target: string, opts: { keepNeutrals?: boolean } = {}): void {
  if (!HEX.test(target)) return;
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (!counts.size) return;
  const hsl = new Map<number, [number, number, number]>();
  for (const key of counts.keys()) hsl.set(key, rgbToHsl((key >> 16) & 255, (key >> 8) & 255, key & 255));
  const changeable = [...counts.keys()].filter((k) => !(opts.keepNeutrals && isNeutral(hsl.get(k)![1], hsl.get(k)![2])));
  if (!changeable.length) return;
  const main = changeable.reduce((a, b) => (counts.get(b)! > counts.get(a)! ? b : a));
  const [, sMain, lMain] = hsl.get(main)!;
  const [hT, sT, lT] = rgbToHsl(...hexToRgb(target));

  let minD = 0;
  let maxD = 0;
  for (const k of changeable) {
    const d = hsl.get(k)![2] - lMain;
    minD = Math.min(minD, d);
    maxD = Math.max(maxD, d);
  }
  const LO = 0.04;
  const HI = 0.97;
  let f = 1;
  if (minD < 0 && lT + minD < LO) f = Math.min(f, (lT - LO) / -minD);
  if (maxD > 0 && lT + maxD > HI) f = Math.min(f, (HI - lT) / maxD);
  f = Math.max(0.25, f);

  const map = new Map<number, [number, number, number]>();
  for (const k of changeable) {
    const [, s, l] = hsl.get(k)!;
    const nl = Math.min(HI, Math.max(LO, lT + (l - lMain) * f));
    const ns = sMain < 0.05 ? sT : Math.min(1, Math.max(0, (sT * s) / sMain));
    map.set(k, hslToRgb(hT, ns, nl));
  }
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const to = map.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (!to) continue;
    data[i] = to[0];
    data[i + 1] = to[1];
    data[i + 2] = to[2];
  }
}

// ===== 上傳 =====

export type UploadCheck =
  | { ok: true; cells: 3 | 6; scale: number }
  | { ok: false; error: string };

/** 下載原圖用的檔名：名字_部位.png；這個檔案可以原樣再上傳 */
export function customPartFilename(part: Pick<CustomPart, "name">, slotLabel: string): string {
  const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").trim();
  return `${safe(part.name) || "自己畫的"}_${safe(slotLabel) || "衣服"}.png`;
}

/** 上傳的圖要是 3 格或 6 格寬、1 格高（可以整數倍放大，例如 2 倍匯出） */
export function checkUploadSize(width: number, height: number, cellW: number, cellH: number): UploadCheck {
  if (height % cellH !== 0 || height < cellH) {
    return { ok: false, error: `高度要是 ${cellH} 的倍數（現在是 ${height}）` };
  }
  const scale = height / cellH;
  for (const cells of [6, 3] as const) {
    if (width === cellW * cells * scale) return { ok: true, cells, scale };
  }
  return {
    ok: false,
    error: `寬度要是 ${cellW * 3 * scale}（正面、背面、走路 1）或 ${cellW * 6 * scale}（再加走路 2~4），現在是 ${width}`,
  };
}
