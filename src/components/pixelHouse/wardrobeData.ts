/**
 * 換外觀（衣櫃）的固定資料：能換哪些部位、顏色選項、預設價錢。
 *
 * 部位就是紙娃娃的圖層名（public/pixel-house/chars/<身體>/doll.json）；
 * 款式的名字和價錢寫在同一個資料夾的 wardrobe.json，沒寫的用這裡的預設。
 */

/** 能換的部位（= 紙娃娃的圖層名；body 是膚色，只能換顏色） */
export type PartSlot = "body" | "hair" | "eyes" | "shirt" | "jacket" | "pants" | "shoes";

export interface PartSlotDef {
  slot: PartSlot;
  label: string;
  /** 有款式可以選（膚色只有顏色） */
  styles: boolean;
  /** 可以不穿 */
  optional: boolean;
  /** 用戶可以上傳自己畫的 */
  upload: boolean;
  /** 換這個部位的顏色時，這幾層也跟著換（眉毛跟頭髮同色） */
  colorAlso?: string[];
  /** 同一個款式還畫在這幾層（長頭髮垂在身體後面那段）：跟著這個部位的款式和顏色，沒畫就沒有 */
  layersAlso?: string[];
  /** 換色時保留白色和黑色（眼白、瞳孔的反光） */
  keepNeutrals?: boolean;
}

export const PART_SLOTS: PartSlotDef[] = [
  { slot: "body", label: "膚色", styles: false, optional: false, upload: false },
  { slot: "hair", label: "髮型", styles: true, optional: false, upload: true, colorAlso: ["brows"], layersAlso: ["hairBack"] },
  { slot: "eyes", label: "眼睛", styles: true, optional: false, upload: true, keepNeutrals: true },
  { slot: "shirt", label: "上衣", styles: true, optional: false, upload: true },
  { slot: "jacket", label: "外套", styles: true, optional: true, upload: true },
  { slot: "pants", label: "下裝", styles: true, optional: false, upload: true },
  { slot: "shoes", label: "鞋子", styles: true, optional: true, upload: true },
];

export const PART_SLOT_IDS = PART_SLOTS.map((d) => d.slot);

export function partSlotDef(slot: string): PartSlotDef | undefined {
  return PART_SLOTS.find((d) => d.slot === slot);
}

/** 圖層 → 用哪個部位的顏色（眉毛、身體後面的頭髮跟頭髮） */
export function colorSlotOf(layer: string): PartSlot | null {
  for (const d of PART_SLOTS) {
    if (d.slot === layer || d.colorAlso?.includes(layer) || d.layersAlso?.includes(layer)) return d.slot;
  }
  return null;
}

/** 圖層 → 跟著哪個部位選款式（hairBack 跟著 hair） */
export function ownerSlotOf(layer: string): PartSlot | null {
  for (const d of PART_SLOTS) {
    if (d.slot === layer || d.layersAlso?.includes(layer)) return d.slot;
  }
  return null;
}

/** 顏色選項（第一個「原色」是不換色） */
export const PART_COLORS: Record<PartSlot, string[]> = {
  body: ["#FFE9D6", "#F9E0CC", "#F1C9A5", "#E0AC84", "#C68B62", "#9A6444", "#6E452E"],
  hair: ["#2B2326", "#5E4C51", "#7A5236", "#B9783F", "#E8C35A", "#F2E6C8", "#C9C9D2", "#D98BA6", "#B03A3A", "#5C7BC4", "#5FA88A", "#8C6BC2"],
  eyes: ["#3B2A26", "#6B5B5F", "#7A5236", "#4F7FC4", "#4C9A70", "#B0453C", "#8C6BC2", "#D9A23A"],
  shirt: ["#FFEA35", "#FFFFFF", "#2B2326", "#E26D5A", "#F4A9B8", "#9ED3A5", "#9CC7E6", "#5C7BC4", "#C9A7E0", "#E8C79A"],
  jacket: ["#30261D", "#2B2326", "#5E5650", "#7A5236", "#C9B48E", "#3E5A7A", "#4F6B4A", "#7A2E2E", "#E8E2D6"],
  pants: ["#4D4152", "#2B2326", "#3E5A7A", "#6B7A8F", "#7A5236", "#C9B48E", "#4F6B4A", "#E8E2D6"],
  shoes: ["#362C31", "#F2EFE8", "#7A5236", "#B03A3A", "#3E5A7A", "#C9B48E"],
};

/** 你畫的款式沒在 wardrobe.json 寫價錢時的預設（第一款 01 免費） */
export const DEFAULT_STYLE_PRICE = 3000;
/** 用戶上傳一件自己畫的（裁縫費） */
export const DEFAULT_UPLOAD_FEE = 1500;
/** 付錢用的錢包（跟商店、遊戲同一個） */
export const WARDROBE_WALLET_ID = "global";

/** 上傳的圖：一格一格往右排，正面｜背面｜走路 1｜走路 2｜走路 3｜走路 4（走路 2~4 可以空著或整個不給） */
export const UPLOAD_CELLS = ["front", "back", "walk0", "walk1", "walk2", "walk3"] as const;
export type UploadCell = (typeof UPLOAD_CELLS)[number];
