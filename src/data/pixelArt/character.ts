/**
 * 角色像素小人：體型 × 髮型 × 衣服，顏色都可以換
 *
 * 色票鍵：$skin 膚色、$eye 眼睛、$hair 頭髮、$outfit 衣服、$outfitDark 衣服暗部、$pants 褲子
 * 想整張換成自己畫的圖：pixelArtImages.ts 加 "char:<體型>:<姿勢>"（姿勢：stand / sit / lie / sleep）
 */
import { fromRows, overlay, replaceChar, rotateLeft, type PixelArt } from "./types";

export type CharBody = "standard" | "tall";
export type CharHair = "short" | "long" | "bob" | "bun" | "ponytail" | "spiky";
export type CharOutfit = "tee" | "shirt" | "hoodie" | "dress";
export type CharPose = "stand" | "sit" | "lie" | "sleep";

export interface CharSpriteConfig {
  body: CharBody;
  hair: CharHair;
  outfit: CharOutfit;
  colors: { skin: string; hair: string; eye: string; outfit: string; pants: string };
}

const BASE_PALETTE: Record<string, string> = {
  s: "$skin",
  e: "$eye",
  b: "#f4a6a6",
  m: "#c96f6f",
  o: "$outfit",
  d: "$outfitDark",
  w: "#ffffff",
  p: "$pants",
  k: "#4a3b30",
  h: "$hair",
};

const HEAD = [
  "............",
  "...ssssss...",
  "..ssssssss..",
  "..ssssssss..",
  "..sesssses..",
  "..bssssssb..",
  "..sssmmsss..",
  "...ssssss...",
  ".....ss.....",
];
const TORSO = [
  "..oooooooo..",
  ".oooooooooo.",
  ".oooooooooo.",
  ".soooooooos.",
];
const LEGS_STAND = ["..pppppppp..", "..ppp..ppp..", "..ppp..ppp..", "..ppp..ppp.."];
const LEGS_SIT = ["..pppppppp..", "..pppppppp.."];
const SHOES_STAND = "..kkk..kkk..";
const SHOES_SIT = "..kk....kk..";

function bodyArt(body: CharBody, pose: "stand" | "sit"): PixelArt {
  const extraLeg = body === "tall" ? ["..ppp..ppp.."] : [];
  const rows =
    pose === "stand"
      ? [...HEAD, ...TORSO, ...LEGS_STAND, ...extraLeg, SHOES_STAND]
      : [...HEAD, ...TORSO, ...LEGS_SIT, SHOES_SIT];
  return fromRows(rows, BASE_PALETTE);
}

export const HAIR_STYLES: Record<CharHair, { name: string; art: PixelArt }> = {
  short: {
    name: "短髮",
    art: fromRows(["...hhhhhh...", "..hhhhhhhh..", ".hhhhhhhhhh.", ".hh......hh.", ".h........h."], {}),
  },
  long: {
    name: "長髮",
    art: fromRows(
      [
        "...hhhhhh...",
        "..hhhhhhhh..",
        ".hhhhhhhhhh.",
        ".hhh....hhh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".h........h.",
      ],
      {},
    ),
  },
  bob: {
    name: "鮑伯頭",
    art: fromRows(
      [
        "...hhhhhh...",
        "..hhhhhhhh..",
        ".hhhhhhhhhh.",
        ".hhhhhhhhhh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hh......hh.",
        ".hhh....hhh.",
      ],
      {},
    ),
  },
  bun: {
    name: "丸子頭",
    art: fromRows(["....hhhh....", "..hhhhhhhh..", ".hhhhhhhhhh.", ".hh......hh.", ".h........h."], {}),
  },
  ponytail: {
    name: "馬尾",
    art: fromRows(
      [
        "...hhhhhh...",
        "..hhhhhhhh.h",
        ".hhhhhhhhhhh",
        ".hh......hhh",
        ".h........hh",
        "..........h.",
        "..........h.",
      ],
      {},
    ),
  },
  spiky: {
    name: "刺刺頭",
    art: fromRows(["..h.hh.h.h..", ".hhhhhhhhhh.", ".hhhhhhhhhh.", ".hhh.hh.hhh.", ".h........h."], {}),
  },
};

/** 衣服：蓋在身體上（dy 是從第幾列開始蓋） */
function outfitLayer(outfit: CharOutfit, bodyHeight: number, pose: "stand" | "sit"): { art: PixelArt; dy: number } | null {
  switch (outfit) {
    case "tee":
      return null;
    case "shirt":
      return { art: fromRows([".....ww.....", "......w.....", "......w.....", "......w....."], {}), dy: 9 };
    case "hoodie":
      return { art: fromRows(["..dddddddd..", "....w..w....", "....w..w....", "...dddddd..."], {}), dy: 9 };
    case "dress": {
      if (pose === "sit") return { art: fromRows(["..oooooooo..", ".oooooooooo."], {}), dy: 13 };
      // 13～15 列是裙子，最後一列是鞋子，中間是腿
      const legRows = bodyHeight - 13 - 3 - 1;
      return {
        art: fromRows(
          [
            "..oooooooo..",
            ".oooooooooo.",
            ".oooooooooo.",
            ...Array(Math.max(0, legRows)).fill("...ss..ss..."),
            "..kkk..kkk..",
          ],
          {},
        ),
        dy: 13,
      };
    }
  }
}

export const OUTFIT_STYLES: Record<CharOutfit, string> = {
  tee: "T 恤",
  shirt: "襯衫",
  hoodie: "帽 T",
  dress: "洋裝",
};

export const BODY_TYPES: Record<CharBody, string> = {
  standard: "標準",
  tall: "高挑",
};

export const SKIN_COLORS = ["#ffe0c4", "#f5c9a3", "#e0a87e", "#b97f5a", "#8d5a3c"];
export const HAIR_COLORS = ["#2b2b2b", "#5b3a29", "#a0522d", "#e8c170", "#c0c0c8", "#d96b8a", "#5b7bd5", "#6db38e"];
export const EYE_COLORS = ["#2b2b2b", "#5b3a29", "#3b6fb6", "#3f8f5a", "#b23a48", "#8a5ab8"];
export const OUTFIT_COLORS = ["#7aa6d8", "#e88b8b", "#f2d06b", "#8cc79a", "#9a8bd8", "#3d3d4a", "#f5f5f5"];
export const PANTS_COLORS = ["#3b4a6b", "#2b2b2b", "#8a7560", "#5a6b4a", "#b0b0b8"];

export const DEFAULT_SPRITE: CharSpriteConfig = {
  body: "standard",
  hair: "short",
  outfit: "tee",
  colors: { skin: SKIN_COLORS[0], hair: HAIR_COLORS[0], eye: EYE_COLORS[0], outfit: OUTFIT_COLORS[0], pants: PANTS_COLORS[0] },
};

/** 顏色調暗（衣服暗部用） */
export function darken(hex: string, amount = 0.25): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return hex;
  const ch = (v: string) => Math.max(0, Math.round(parseInt(v, 16) * (1 - amount)));
  return `#${[m[1], m[2], m[3]].map((v) => ch(v).toString(16).padStart(2, "0")).join("")}`;
}

/** 組出某個姿勢的小人和要用的顏色；artId 給換圖用 */
export function composeCharacter(
  config: CharSpriteConfig,
  pose: CharPose,
): { art: PixelArt; colors: Record<string, string>; artId: string } {
  const basePose = pose === "sit" ? "sit" : "stand";
  let art = bodyArt(config.body, basePose);
  const outfit = outfitLayer(config.outfit, art.h, basePose);
  if (outfit) art = overlay(art, outfit.art, 0, outfit.dy);
  art = overlay(art, HAIR_STYLES[config.hair]?.art ?? HAIR_STYLES.short.art, 0, 0);
  if (pose === "sleep") art = replaceChar(art, "e", "s");
  if (pose === "lie" || pose === "sleep") art = rotateLeft(art);
  return {
    art,
    colors: { ...config.colors, outfitDark: darken(config.colors.outfit) },
    artId: `char:${config.body}:${pose}`,
  };
}
