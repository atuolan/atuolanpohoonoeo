/**
 * 共感娃娃的衣櫃：棉花娃娃分層疊起來（後髮 → 身體 → 臉 → 下身 → 上衣 → 鞋 → 前髮 → 頭飾）
 * 身體姿勢固定，換裝不影響可以點的部位。
 */

export interface DollTune {
  /** 瀏海高低（-8～8） */
  hairY: number;
  /** 眼睛間距（-8～8） */
  eyeGap: number;
  /** 頭飾高低（-12～12） */
  accY: number;
  /** 頭飾大小（0.8～1.25） */
  accScale: number;
}

export interface DollLook {
  skin: string;
  eyes: string;
  mouth: string;
  blush: boolean;
  hair: string;
  hairColor: string;
  top: string;
  topColor: string;
  bottom: string;
  bottomColor: string;
  shoes: string;
  shoesColor: string;
  accessory: string;
  accessoryColor: string;
  tune: DollTune;
}

export interface WardrobeOption {
  id: string;
  label: string;
  /** 上衣：洋裝這類會蓋住下身 */
  fullBody?: boolean;
}

export const SKIN_TONES: Array<{ id: string; label: string; color: string }> = [
  { id: "porcelain", label: "白皙", color: "#fdeadb" },
  { id: "peach", label: "蜜桃", color: "#f8d9bf" },
  { id: "honey", label: "小麥", color: "#e6b98f" },
  { id: "cocoa", label: "可可", color: "#b9835f" },
];

export const EYE_STYLES: WardrobeOption[] = [
  { id: "round", label: "圓眼" },
  { id: "smile", label: "瞇眼笑" },
  { id: "sleepy", label: "想睡" },
  { id: "wink", label: "眨眼" },
];

export const MOUTH_STYLES: WardrobeOption[] = [
  { id: "smile", label: "微笑" },
  { id: "cat", label: "貓嘴" },
  { id: "tiny", label: "小圓嘴" },
];

export const HAIR_STYLES: WardrobeOption[] = [
  { id: "bob", label: "短鮑伯" },
  { id: "long", label: "長直髮" },
  { id: "bun", label: "丸子頭" },
  { id: "twintails", label: "雙馬尾" },
  { id: "short", label: "短碎髮" },
  { id: "none", label: "光頭" },
];

export const TOP_STYLES: WardrobeOption[] = [
  { id: "tee", label: "圓領 T" },
  { id: "hoodie", label: "連帽衣" },
  { id: "sailor", label: "水手服" },
  { id: "dress", label: "洋裝", fullBody: true },
  { id: "maid", label: "女僕裝", fullBody: true },
  { id: "none", label: "不穿" },
];

export const BOTTOM_STYLES: WardrobeOption[] = [
  { id: "shorts", label: "短褲" },
  { id: "skirt", label: "百褶裙" },
  { id: "pants", label: "長褲" },
  { id: "overalls", label: "吊帶褲" },
  { id: "none", label: "不穿" },
];

export const SHOE_STYLES: WardrobeOption[] = [
  { id: "round", label: "圓頭鞋" },
  { id: "sneakers", label: "運動鞋" },
  { id: "none", label: "光腳" },
];

export const ACCESSORY_STYLES: WardrobeOption[] = [
  { id: "none", label: "不戴" },
  { id: "bow", label: "蝴蝶結" },
  { id: "headband", label: "髮箍" },
  { id: "catears", label: "貓耳" },
  { id: "flower", label: "小花" },
  { id: "crown", label: "小皇冠" },
  { id: "glasses", label: "眼鏡" },
];

export const HAIR_COLORS = ["#3b2b26", "#6b4a35", "#a8774f", "#e2c08d", "#f4eee4", "#c9c4d6", "#e79db0", "#8fb7e0", "#5a6b8c", "#c0503f"];
export const CLOTH_COLORS = ["#ffffff", "#f6e7c8", "#f7b8c4", "#f39a8b", "#ffd36e", "#b9dfa8", "#9fd2e6", "#7d9bd8", "#b8a2e0", "#4a4a5a", "#2f3a56", "#8a5a44"];

export const DEFAULT_DOLL_LOOK: DollLook = {
  skin: "porcelain",
  eyes: "round",
  mouth: "smile",
  blush: true,
  hair: "bob",
  hairColor: "#6b4a35",
  top: "tee",
  topColor: "#ffffff",
  bottom: "overalls",
  bottomColor: "#9fd2e6",
  shoes: "round",
  shoesColor: "#8a5a44",
  accessory: "none",
  accessoryColor: "#f7b8c4",
  tune: { hairY: 0, eyeGap: 0, accY: 0, accScale: 1 },
};

const clamp = (n: unknown, min: number, max: number, fallback: number): number =>
  typeof n === "number" && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
const pick = (value: unknown, options: Array<{ id: string }>, fallback: string): string =>
  typeof value === "string" && options.some((o) => o.id === value) ? value : fallback;
const color = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

/** 存檔讀回來的造型：缺的、壞的欄位補預設 */
export function normalizeDollLook(raw: unknown): DollLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DollLook>;
  const d = DEFAULT_DOLL_LOOK;
  const t = (r.tune && typeof r.tune === "object" ? r.tune : {}) as Partial<DollTune>;
  return {
    skin: pick(r.skin, SKIN_TONES, d.skin),
    eyes: pick(r.eyes, EYE_STYLES, d.eyes),
    mouth: pick(r.mouth, MOUTH_STYLES, d.mouth),
    blush: typeof r.blush === "boolean" ? r.blush : d.blush,
    hair: pick(r.hair, HAIR_STYLES, d.hair),
    hairColor: color(r.hairColor, d.hairColor),
    top: pick(r.top, TOP_STYLES, d.top),
    topColor: color(r.topColor, d.topColor),
    bottom: pick(r.bottom, BOTTOM_STYLES, d.bottom),
    bottomColor: color(r.bottomColor, d.bottomColor),
    shoes: pick(r.shoes, SHOE_STYLES, d.shoes),
    shoesColor: color(r.shoesColor, d.shoesColor),
    accessory: pick(r.accessory, ACCESSORY_STYLES, d.accessory),
    accessoryColor: color(r.accessoryColor, d.accessoryColor),
    tune: {
      hairY: clamp(t.hairY, -8, 8, 0),
      eyeGap: clamp(t.eyeGap, -8, 8, 0),
      accY: clamp(t.accY, -12, 12, 0),
      accScale: clamp(t.accScale, 0.8, 1.25, 1),
    },
  };
}

const labelOf = (options: WardrobeOption[], id: string) => options.find((o) => o.id === id)?.label ?? "";

/** 給提示詞的一句：「娃娃穿著水手服配百褶裙，戴著貓耳」；什麼都沒穿也照實說 */
export function describeDollLook(look: DollLook): string {
  const top = TOP_STYLES.find((o) => o.id === look.top);
  const parts: string[] = [];
  if (look.top !== "none") parts.push(top?.label ?? "");
  if (!top?.fullBody && look.bottom !== "none") parts.push(labelOf(BOTTOM_STYLES, look.bottom));
  let text = parts.length ? `娃娃穿著${parts.join("配")}` : "娃娃什麼都沒穿";
  if (look.accessory !== "none") text += `，戴著${labelOf(ACCESSORY_STYLES, look.accessory)}`;
  return text;
}

/** 造型有沒有變（只看會寫進提示詞的部分） */
export function dollLookKey(look: DollLook): string {
  return describeDollLook(look);
}

// ===== 顏色 =====

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** amount > 0 變亮、< 0 變暗（-1～1） */
export function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export function skinColorOf(look: DollLook): string {
  return SKIN_TONES.find((s) => s.id === look.skin)?.color ?? SKIN_TONES[0].color;
}

/** 很淺的顏色描邊要深一點才看得到 */
export function outlineOf(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  const light = (r * 299 + g * 587 + b * 114) / 1000;
  return shade(hex, light > 200 ? -0.32 : -0.38);
}
