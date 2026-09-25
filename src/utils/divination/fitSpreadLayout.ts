import type { SpreadCoords } from "@/types/divination";

/** 牌的寬高比（牌圖約 178×297） */
export const CARD_ASPECT = 0.6;

/** 牌位中心點（px）；top 是「牌＋標籤」整塊的中心 */
export interface LayoutSlot {
  left: number;
  top: number;
  rotate: number;
}

export interface SpreadLayout {
  cardW: number;
  cardH: number;
  slots: LayoutSlot[];
}

export interface FitOptions {
  labelH?: number;
  gap?: number;
  maxH?: number;
  minH?: number;
  aspect?: number;
}

const DEFAULTS = { labelH: 14, gap: 6, maxH: 200, minH: 40, aspect: CARD_ASPECT };

const sameCoords = (a: SpreadCoords, b: SpreadCoords) => a.x === b.x && a.y === b.y;

/** 有指定 rotate 用指定值；與前面某張座標相同則橫放（例如凱爾特十字的第 2 張） */
function effectiveRotations(coords: SpreadCoords[]): number[] {
  return coords.map((c, i) => {
    if (c.rotate !== undefined) return c.rotate;
    return coords.slice(0, i).some((prev) => sameCoords(prev, c)) ? 90 : 0;
  });
}

const isSideways = (rotate: number) => Math.abs(rotate % 180) === 90;

function footprint(rotate: number, w: number, h: number, labelH: number) {
  return isSideways(rotate) ? { fw: h, fh: w + labelH } : { fw: w, fh: h + labelH };
}

/** 空間充裕時，相鄰兩排（欄）的距離最多拉到牌佔位的這個倍數，避免牌被撐到四角 */
const MAX_SPACING_RATIO = 1.3;

/**
 * 把某一軸的百分比座標攤到像素：
 * 預設攤滿可用空間，但相鄰層級的間距不超過 (牌佔位 + gap) × MAX_SPACING_RATIO，整組置中
 */
function axisMapper(values: number[], boxSize: number, footprint: number, gap: number) {
  const min = Math.min(...values);
  const range = Math.max(...values) - min;
  if (range === 0) return () => boxSize / 2;

  const levels = [...new Set(values)].sort((a, b) => a - b);
  const minStep = Math.min(...levels.slice(1).map((v, i) => v - levels[i]));
  const available = boxSize - footprint;
  const comfortable = (range / minStep) * (footprint + gap) * MAX_SPACING_RATIO;
  const span = Math.min(available, comfortable);
  const start = (boxSize - span) / 2;
  return (v: number) => start + ((v - min) / range) * span;
}

function place(
  coords: SpreadCoords[],
  rotations: number[],
  box: { width: number; height: number },
  h: number,
  o: typeof DEFAULTS,
): SpreadLayout {
  const w = h * o.aspect;
  const prints = rotations.map((r) => footprint(r, w, h, o.labelH));
  const FW = Math.max(...prints.map((p) => p.fw));
  const FH = Math.max(...prints.map((p) => p.fh));
  const toX = axisMapper(coords.map((c) => c.x), box.width, FW, o.gap);
  const toY = axisMapper(coords.map((c) => c.y), box.height, FH, o.gap);

  return {
    cardW: w,
    cardH: h,
    slots: coords.map((c, i) => ({ left: toX(c.x), top: toY(c.y), rotate: rotations[i] })),
  };
}

/** 找出重疊的牌位配對（座標相同的刻意疊放不算） */
export function findOverlaps(
  layout: SpreadLayout,
  coords: SpreadCoords[],
  labelH = DEFAULTS.labelH,
  gap = DEFAULTS.gap,
): [number, number][] {
  const prints = layout.slots.map((s) => footprint(s.rotate, layout.cardW, layout.cardH, labelH));
  const overlaps: [number, number][] = [];
  for (let i = 0; i < layout.slots.length; i++) {
    for (let j = i + 1; j < layout.slots.length; j++) {
      if (sameCoords(coords[i], coords[j])) continue;
      const dx = Math.abs(layout.slots[i].left - layout.slots[j].left);
      const dy = Math.abs(layout.slots[i].top - layout.slots[j].top);
      if (
        dx < (prints[i].fw + prints[j].fw) / 2 + gap - 0.01 &&
        dy < (prints[i].fh + prints[j].fh) / 2 + gap - 0.01
      ) {
        overlaps.push([i, j]);
      }
    }
  }
  return overlaps;
}

/**
 * 依可用寬高計算牌陣版面：從最大牌高往下試，找第一個「全部在框內、任兩張不重疊」的尺寸
 */
export function fitSpreadLayout(
  coords: SpreadCoords[],
  box: { width: number; height: number },
  opts: FitOptions = {},
): SpreadLayout {
  const o = { ...DEFAULTS, ...opts };
  if (coords.length === 0) return { cardW: o.minH * o.aspect, cardH: o.minH, slots: [] };

  const rotations = effectiveRotations(coords);
  const startH = Math.max(o.minH, Math.min(o.maxH, Math.floor(box.height * 0.55)));

  for (let h = startH; h >= o.minH; h -= 2) {
    const layout = place(coords, rotations, box, h, o);
    const w = h * o.aspect;
    const fits = rotations.every((r) => {
      const { fw, fh } = footprint(r, w, h, o.labelH);
      return fw <= box.width && fh <= box.height;
    });
    if (fits && findOverlaps(layout, coords, o.labelH, o.gap).length === 0) return layout;
  }
  return place(coords, rotations, box, o.minH, o);
}
