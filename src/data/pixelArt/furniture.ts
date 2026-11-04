/**
 * 房間與家具的像素圖（程式畫的佔位圖，之後可以在 pixelArtImages.ts 換成自己的圖）
 *
 * artId 規則：
 *   "room:background"     房間背景（96×64）
 *   "furniture:<家具 id>"  家具
 *   "furniture:<家具 id>:front"  床的被子（角色睡覺時蓋在身上）
 *   "gift:<種類>"          展示櫃上的禮物
 */
import { paint, type PixelArt } from "./types";

const WOOD = "#b07a4a";
const WOOD_DARK = "#7a5230";
const WHITE_WOOD = "#efe9e1";
const WHITE_WOOD_DARK = "#c9bfb2";

// ===== 房間背景 =====

function roomBackground(): PixelArt {
  const ops: Array<[string, number, number, number, number]> = [
    ["w", 0, 0, 96, 40],
    ["b", 0, 40, 96, 2],
    ["f", 0, 42, 96, 22],
  ];
  // 壁紙直條
  for (let x = 4; x < 96; x += 8) ops.push(["s", x, 0, 1, 40]);
  // 地板木紋
  for (let y = 46; y < 64; y += 5) ops.push(["l", 0, y, 96, 1]);
  for (let y = 42, i = 0; y < 64; y += 5, i++) {
    for (let x = i % 2 === 0 ? 10 : 26; x < 96; x += 32) ops.push(["l", x, y, 1, 4]);
  }
  return paint(96, 64, { w: "#f3e9dc", s: "#ecdfcd", b: "#c9b29a", f: "#d9b48a", l: "#c79f74" }, ops);
}

// ===== 床（28 寬，底部對齊地板 y=48；床墊上緣在 h-8） =====

function bed(options: { h?: number; head: string; headDark: string; sheet: string; blanket: string; pillow: string; pillows?: number }): PixelArt {
  const h = options.h ?? 14;
  const top = h - 8;
  const ops: Array<[string, number, number, number, number]> = [
    ["H", 0, top - 6, 3, h - top + 6],
    ["F", 3, h - 5, 25, 3],
    ["D", 3, h - 2, 2, 2],
    ["D", 25, h - 2, 2, 2],
    ["m", 3, top, 25, 3],
  ];
  const pillows = options.pillows ?? 1;
  for (let i = 0; i < pillows; i++) ops.push(["p", 4, top - 2 - i * 2, 6, 2]);
  ops.push(["k", 10, top - 1, 18, 4]);
  return paint(28, h, { H: options.head, F: options.head, D: options.headDark, m: options.sheet, p: options.pillow, k: options.blanket }, ops);
}

/** 被子那一塊（睡覺時畫在角色身上） */
function bedFront(art: PixelArt, blanket: string): PixelArt {
  const top = art.h - 8;
  return paint(28, art.h, { k: blanket }, [["k", 10, top - 1, 18, 4]]);
}

const BED_SINGLE = bed({ head: WOOD, headDark: WOOD_DARK, sheet: "#f4f1ea", blanket: "#7aa6d8", pillow: "#ffffff" });
const BED_DOUBLE = bed({ head: "#c98b8b", headDark: "#8a5a5a", sheet: "#f4f1ea", blanket: "#e8a0b4", pillow: "#ffffff", pillows: 2 });
const BED_CANOPY = (() => {
  const base = bed({ h: 26, head: WHITE_WOOD, headDark: WHITE_WOOD_DARK, sheet: "#f7f3ff", blanket: "#b9a3e3", pillow: "#ffffff", pillows: 2 });
  const canopy = paint(28, 26, { c: "#d9c8f2", C: "#b9a3e3", P: WHITE_WOOD_DARK }, [
    ["P", 0, 0, 1, 26],
    ["P", 27, 0, 1, 26],
    ["C", 0, 0, 28, 2],
    ["c", 1, 2, 4, 10],
    ["c", 23, 2, 4, 10],
  ]);
  return mergeArt(base, canopy);
})();
const BED_ROUND = paint(28, 12, { r: "#c94a5a", R: "#8a2a3a", m: "#f7d6dc", h: "#ff6b8a" }, [
  ["R", 1, 9, 26, 3],
  ["r", 0, 6, 28, 3],
  ["r", 2, 5, 24, 1],
  ["m", 3, 3, 22, 3],
  ["m", 5, 2, 18, 1],
  ["h", 5, 0, 2, 2],
  ["h", 8, 0, 2, 2],
  ["h", 6, 2, 3, 1],
]);

// ===== 書桌（22 寬，底部 y=44） =====

const DESK_WOOD = paint(22, 14, { t: WOOD, T: WOOD_DARK, d: "#c9935f", k: "#e8d5b5" }, [
  ["t", 0, 0, 22, 2],
  ["T", 1, 2, 2, 12],
  ["T", 19, 2, 2, 12],
  ["d", 12, 2, 7, 5],
  ["k", 15, 4, 2, 1],
]);
const DESK_GAMING = paint(22, 22, { t: "#2b2b35", T: "#1a1a22", s: "#3a3a48", g: "#5bd6ff", r: "#ff5bd6", y: "#c2ff5b", k: "#9aa0b0" }, [
  ["s", 6, 0, 10, 7],
  ["g", 7, 1, 8, 5],
  ["k", 10, 7, 2, 1],
  ["t", 0, 8, 22, 2],
  ["r", 0, 10, 22, 1],
  ["T", 1, 10, 2, 12],
  ["T", 19, 10, 2, 12],
  ["y", 4, 7, 4, 1],
]);
const DESK_VANITY = paint(22, 24, { t: WHITE_WOOD, T: WHITE_WOOD_DARK, m: "#cfe8f5", M: "#ffffff", f: "#e0c58a", p: "#f2a3b8" }, [
  ["f", 5, 0, 12, 10],
  ["m", 6, 1, 10, 8],
  ["M", 7, 2, 2, 3],
  ["t", 0, 10, 22, 2],
  ["T", 1, 12, 2, 12],
  ["T", 19, 12, 2, 12],
  ["T", 12, 12, 7, 4],
  ["p", 3, 9, 2, 1],
]);

// ===== 衣櫃（14 寬，底部 y=42） =====

function wardrobe(body: string, dark: string, handle: string): PixelArt {
  return paint(14, 28, { b: body, d: dark, h: handle }, [
    ["d", 0, 0, 14, 28],
    ["b", 1, 1, 6, 25],
    ["b", 7, 1, 6, 25],
    ["h", 5, 12, 1, 3],
    ["h", 8, 12, 1, 3],
    ["d", 1, 26, 2, 2],
    ["d", 11, 26, 2, 2],
  ]);
}
const WARDROBE_WOOD = wardrobe(WOOD, WOOD_DARK, "#e8d5b5");
const WARDROBE_WHITE = wardrobe(WHITE_WOOD, WHITE_WOOD_DARK, "#b0a090");
const WARDROBE_RACK = paint(14, 28, { r: "#9aa0b0", a: "#e88b8b", b: "#7aa6d8", c: "#f2d06b", d: "#3d3d4a" }, [
  ["r", 0, 2, 14, 1],
  ["r", 0, 2, 1, 26],
  ["r", 13, 2, 1, 26],
  ["r", 0, 27, 14, 1],
  ["a", 2, 3, 3, 10],
  ["b", 5, 3, 3, 12],
  ["c", 8, 3, 2, 8],
  ["d", 10, 3, 3, 13],
]);

// ===== 窗戶與窗簾（20×18） =====

function windowWith(curtain: string, curtainDark: string, pattern?: string, closed = false): PixelArt {
  const ops: Array<[string, number, number, number, number]> = [
    ["F", 2, 1, 16, 16],
    ["g", 3, 2, 14, 14],
    ["F", 9, 2, 1, 14],
    ["F", 3, 8, 14, 1],
    ["R", 0, 0, 20, 1],
  ];
  if (closed) {
    ops.push(["c", 1, 1, 18, 17], ["C", 9, 1, 2, 17]);
  } else {
    ops.push(["c", 1, 1, 4, 17], ["c", 15, 1, 4, 17], ["C", 4, 1, 1, 17], ["C", 15, 1, 1, 17]);
    if (pattern) {
      for (let y = 3; y < 18; y += 4) ops.push(["p", 2, y, 1, 1], ["p", 17, y, 1, 1], ["p", 3, y + 2, 1, 1], ["p", 16, y + 2, 1, 1]);
    }
  }
  return paint(20, 18, { F: "#ffffff", g: "#bfe3f5", R: "#9aa0b0", c: curtain, C: curtainDark, p: pattern ?? curtain }, ops);
}
const CURTAIN_PLAIN = windowWith("#e8dccb", "#cdbfa9");
const CURTAIN_FLORAL = windowWith("#f6d6de", "#e3b5c1", "#d9667f");
const CURTAIN_BLACKOUT = windowWith("#3d3d4a", "#2b2b35", undefined, true);

// ===== 牆上（最大 14×16） =====

const WALL_POSTER = paint(10, 14, { f: "#2b2b35", a: "#d9667f", b: "#f2d06b", w: "#ffffff" }, [
  ["f", 0, 0, 10, 14],
  ["a", 1, 1, 8, 9],
  ["b", 3, 3, 4, 4],
  ["w", 2, 11, 6, 1],
]);
const WALL_PAINTING = paint(14, 10, { f: "#c9a24a", s: "#bfe3f5", m: "#8cc79a", M: "#5a9a6a", u: "#ffffff" }, [
  ["f", 0, 0, 14, 10],
  ["s", 1, 1, 12, 8],
  ["M", 1, 5, 12, 4],
  ["m", 3, 4, 5, 2],
  ["u", 10, 2, 2, 2],
]);
const WALL_CLOCK = paint(8, 8, { f: "#3d3d4a", w: "#ffffff", h: "#2b2b2b" }, [
  ["f", 1, 0, 6, 8],
  ["f", 0, 1, 8, 6],
  ["w", 1, 1, 6, 6],
  ["h", 4, 2, 1, 3],
  ["h", 4, 4, 2, 1],
]);
const WALL_MIRROR = paint(10, 14, { f: "#c0c0c8", m: "#cfe8f5", M: "#ffffff" }, [
  ["f", 0, 0, 10, 14],
  ["m", 1, 1, 8, 12],
  ["M", 2, 2, 2, 4],
  ["M", 3, 7, 1, 2],
]);

// ===== 地毯（30×8，底部 y=58） =====

function rug(main: string, edge: string, extra?: (ops: Array<[string, number, number, number, number]>) => void): PixelArt {
  const ops: Array<[string, number, number, number, number]> = [
    ["e", 3, 0, 24, 8],
    ["e", 1, 1, 28, 6],
    ["e", 0, 2, 30, 4],
    ["m", 4, 1, 22, 6],
    ["m", 2, 2, 26, 4],
  ];
  extra?.(ops);
  return paint(30, 8, { m: main, e: edge, x: edge }, ops);
}
const RUG_ROUND = rug("#e8c170", "#c9a24a");
const RUG_FLUFFY = rug("#fbf7f0", "#e3dacb", (ops) => {
  for (let x = 2; x < 28; x += 3) ops.push(["x", x, 7, 1, 1], ["x", x + 1, 0, 1, 1]);
});
const RUG_PLAID = rug("#d98b8b", "#8a4a4a", (ops) => {
  for (let x = 6; x < 26; x += 5) ops.push(["x", x, 1, 1, 6]);
  ops.push(["x", 2, 4, 26, 1]);
});

// ===== 角落（最大 12×20，底部 y=44） =====

const CORNER_PLANT = paint(9, 14, { l: "#6db38e", L: "#3f8f5a", p: "#c9935f", P: WOOD_DARK }, [
  ["L", 1, 0, 3, 6],
  ["l", 4, 1, 4, 6],
  ["L", 2, 4, 5, 4],
  ["l", 0, 5, 3, 3],
  ["p", 2, 8, 5, 5],
  ["P", 2, 13, 5, 1],
]);
const CORNER_LAMP = paint(8, 20, { s: "#f2d06b", S: "#e8b84a", p: "#3d3d4a" }, [
  ["S", 0, 0, 8, 1],
  ["s", 1, 1, 6, 4],
  ["p", 3, 5, 2, 14],
  ["p", 1, 19, 6, 1],
]);
const CORNER_FLOOR_MIRROR = paint(9, 20, { f: "#c9a24a", m: "#cfe8f5", M: "#ffffff", F: WOOD_DARK }, [
  ["f", 0, 0, 9, 19],
  ["m", 1, 1, 7, 17],
  ["M", 2, 2, 2, 5],
  ["M", 3, 9, 1, 3],
  ["F", 1, 19, 2, 1],
  ["F", 6, 19, 2, 1],
]);
const CORNER_BEANBAG = paint(12, 9, { b: "#9a8bd8", B: "#7563b8", h: "#c3b8ee" }, [
  ["B", 1, 2, 10, 7],
  ["B", 0, 4, 12, 4],
  ["b", 2, 1, 8, 7],
  ["b", 1, 3, 10, 4],
  ["h", 3, 2, 3, 1],
]);

// ===== 展示櫃（牆上的層板）與禮物 =====

export const SHELF_ART = paint(26, 3, { s: WOOD, S: WOOD_DARK }, [
  ["s", 0, 0, 26, 2],
  ["S", 2, 2, 2, 1],
  ["S", 22, 2, 2, 1],
]);

export type GiftSpriteKind = "box" | "bear" | "mug" | "flower" | "cake";

export const GIFT_ART: Record<GiftSpriteKind, PixelArt> = {
  box: paint(4, 5, { b: "#e88b8b", r: "#f2d06b" }, [["b", 0, 1, 4, 4], ["r", 1, 0, 2, 5], ["r", 0, 2, 4, 1]]),
  bear: paint(4, 5, { b: "#a0703f", B: "#7a5230", f: "#e8c9a0" }, [["B", 0, 0, 1, 1], ["B", 3, 0, 1, 1], ["b", 0, 1, 4, 4], ["f", 1, 2, 2, 2]]),
  mug: paint(4, 5, { m: "#ffffff", M: "#c9bfb2", c: "#7a5230" }, [["M", 0, 1, 3, 4], ["m", 0, 1, 3, 3], ["c", 0, 1, 3, 1], ["M", 3, 2, 1, 2]]),
  flower: paint(4, 5, { p: "#e88b8b", y: "#f2d06b", g: "#3f8f5a", v: "#bfe3f5" }, [["p", 0, 0, 2, 2], ["p", 2, 0, 2, 2], ["y", 1, 1, 2, 1], ["g", 1, 2, 2, 1], ["v", 1, 3, 2, 2]]),
  cake: paint(4, 5, { c: "#f7d6dc", r: "#e8475a", s: "#a0703f" }, [["r", 1, 0, 2, 1], ["c", 0, 1, 4, 3], ["s", 0, 4, 4, 1]]),
};

/** 禮物 id 對到展示用的小圖 */
export function giftSpriteKind(itemId: string): GiftSpriteKind {
  if (/bear|plush|doll/.test(itemId)) return "bear";
  if (/mug|cup/.test(itemId)) return "mug";
  if (/flower|rose|bouquet/.test(itemId)) return "flower";
  if (/cake|chocolate|cookie/.test(itemId)) return "cake";
  return "box";
}

// ===== 對照表 =====

function mergeArt(base: PixelArt, top: PixelArt): PixelArt {
  const rows = base.rows.map((r, y) =>
    r
      .split("")
      .map((ch, x) => {
        const t = top.rows[y]?.[x];
        return t && t !== "." ? `\u0000${t}` : ch;
      })
      .join(""),
  );
  // 上層字元加前綴避免跟下層色票撞名：換成大寫的另一組字元
  const remap: Record<string, string> = {};
  const used = new Set(Object.keys(base.palette));
  const spare = "QVXYZJUIOAEGN".split("").filter((c) => !used.has(c));
  const palette = { ...base.palette };
  for (const key of Object.keys(top.palette)) {
    const alias = spare.shift() ?? key;
    remap[key] = alias;
    palette[alias] = top.palette[key];
  }
  return {
    ...base,
    palette,
    rows: rows.map((r) => r.replace(/\u0000(.)/g, (_, ch: string) => remap[ch] ?? ch)),
  };
}

export const ROOM_BACKGROUND = roomBackground();

export const FURNITURE_ART: Record<string, PixelArt> = {
  "bed-single": BED_SINGLE,
  "bed-double": BED_DOUBLE,
  "bed-canopy": BED_CANOPY,
  "bed-round": BED_ROUND,
  "desk-wood": DESK_WOOD,
  "desk-gaming": DESK_GAMING,
  "desk-vanity": DESK_VANITY,
  "wardrobe-wood": WARDROBE_WOOD,
  "wardrobe-white": WARDROBE_WHITE,
  "wardrobe-rack": WARDROBE_RACK,
  "curtain-plain": CURTAIN_PLAIN,
  "curtain-floral": CURTAIN_FLORAL,
  "curtain-blackout": CURTAIN_BLACKOUT,
  "wall-poster": WALL_POSTER,
  "wall-painting": WALL_PAINTING,
  "wall-clock": WALL_CLOCK,
  "wall-mirror": WALL_MIRROR,
  "rug-round": RUG_ROUND,
  "rug-fluffy": RUG_FLUFFY,
  "rug-plaid": RUG_PLAID,
  "corner-plant": CORNER_PLANT,
  "corner-lamp": CORNER_LAMP,
  "corner-floor-mirror": CORNER_FLOOR_MIRROR,
  "corner-beanbag": CORNER_BEANBAG,
};

/** 床的被子（睡覺時畫在角色上面） */
export const BED_FRONT_ART: Record<string, PixelArt> = {
  "bed-single": bedFront(BED_SINGLE, "#7aa6d8"),
  "bed-double": bedFront(BED_DOUBLE, "#e8a0b4"),
  "bed-canopy": bedFront(BED_CANOPY, "#b9a3e3"),
};
