/**
 * 像素房間的家具：放在哪個位置、多少錢、帶來什麼場景
 *
 * - hint：一般的場景提示，去他房間時告訴 AI
 * - intimateHint：親密場景提示，只在成人內容開啟、去他房間時才送
 * - isDefault：每間房間一開始就有的基本款，不用買
 */
import type { Rarity } from "@/schemas/gameEconomy";

export type RoomSlotId = "bed" | "desk" | "wardrobe" | "window" | "wallA" | "wallB" | "rug" | "corner";

/** 家具適合放的位置；牆上的東西兩面牆都能放 */
export type FurnitureSlot = Exclude<RoomSlotId, "wallA" | "wallB"> | "wall";

export interface FurnitureDef {
  id: string;
  name: string;
  slot: FurnitureSlot;
  price: number;
  rarity: Rarity;
  description: string;
  hint: string;
  intimateHint?: string;
  /** 床：床墊上緣在圖的第幾列；書桌：桌面在第幾列（角色躺、坐的位置） */
  surface?: number;
  isDefault?: boolean;
}

export const ROOM_SLOTS: Array<{ id: RoomSlotId; name: string; accepts: FurnitureSlot }> = [
  { id: "bed", name: "床", accepts: "bed" },
  { id: "desk", name: "書桌", accepts: "desk" },
  { id: "wardrobe", name: "衣櫃", accepts: "wardrobe" },
  { id: "window", name: "窗簾", accepts: "window" },
  { id: "wallA", name: "左邊牆上", accepts: "wall" },
  { id: "wallB", name: "右邊牆上", accepts: "wall" },
  { id: "rug", name: "地毯", accepts: "rug" },
  { id: "corner", name: "角落", accepts: "corner" },
];

export const FURNITURE: FurnitureDef[] = [
  // 床
  { id: "bed-single", name: "單人床", slot: "bed", price: 0, rarity: "common", isDefault: true, surface: 6, description: "窄窄的木頭單人床", hint: "窄窄的單人床，兩個人要擠在一起才躺得下", intimateHint: "單人床很窄，只能緊緊貼著彼此" },
  { id: "bed-double", name: "雙人床", slot: "bed", price: 3000, rarity: "uncommon", surface: 6, description: "粉色床頭板的雙人床，兩顆枕頭", hint: "寬敞的雙人床，兩個人可以並肩躺著聊到睡著", intimateHint: "寬敞的雙人床，可以慢慢來，不用怕掉下去" },
  { id: "bed-canopy", name: "帷幕床", slot: "bed", price: 8000, rarity: "rare", surface: 18, description: "掛著紫色紗簾的公主床", hint: "放下紗簾，床上就像另一個小世界", intimateHint: "放下紗簾，外面什麼都看不見，只剩紗簾裡的兩個人" },
  { id: "bed-round", name: "圓床", slot: "bed", price: 12000, rarity: "epic", surface: 3, description: "紅色的圓形大床，枕頭是愛心形狀", hint: "圓形的床，躺哪個方向都可以", intimateHint: "像情趣旅館的圓床，氣氛曖昧，可以玩些平常不敢的" },
  // 書桌
  { id: "desk-wood", name: "木書桌", slot: "desk", price: 0, rarity: "common", isDefault: true, surface: 0, description: "有一個抽屜的木書桌", hint: "他平常在這張書桌工作、看書", intimateHint: "書桌夠穩，可以把人抱上去坐" },
  { id: "desk-gaming", name: "電競桌", slot: "desk", price: 5000, rarity: "uncommon", surface: 8, description: "會發光的電競桌和大螢幕", hint: "可以一起打電動，輸的人要聽贏的人的", intimateHint: "電競椅可以兩個人擠著坐，螢幕的光照在臉上" },
  { id: "desk-vanity", name: "梳妝台", slot: "desk", price: 4500, rarity: "uncommon", surface: 10, description: "附鏡子的白色梳妝台", hint: "梳妝台的鏡子照得到兩個人，可以幫對方弄頭髮", intimateHint: "坐在梳妝台前，從鏡子裡看著身後的對方" },
  // 衣櫃
  { id: "wardrobe-wood", name: "木衣櫃", slot: "wardrobe", price: 0, rarity: "common", isDefault: true, description: "兩扇門的木衣櫃", hint: "衣櫃裡有他的衣服，可以偷穿他的襯衫", intimateHint: "穿著他的襯衫，裡面什麼都沒穿" },
  { id: "wardrobe-white", name: "白衣櫃", slot: "wardrobe", price: 2500, rarity: "common", description: "簡約的白色衣櫃", hint: "衣櫃裡有他的衣服，可以偷穿他的襯衫", intimateHint: "穿著他的襯衫，裡面什麼都沒穿" },
  { id: "wardrobe-rack", name: "開放式衣架", slot: "wardrobe", price: 1800, rarity: "common", description: "衣服都掛在外面的衣架", hint: "衣服都掛在外面，可以挑衣服給對方換", intimateHint: "幫對方一件一件換衣服" },
  // 窗簾
  { id: "curtain-plain", name: "素色窗簾", slot: "window", price: 0, rarity: "common", isDefault: true, description: "米色的窗簾", hint: "拉開窗簾陽光會照進來" },
  { id: "curtain-floral", name: "碎花窗簾", slot: "window", price: 1200, rarity: "common", description: "粉色碎花窗簾", hint: "碎花窗簾讓房間看起來很溫暖" },
  { id: "curtain-blackout", name: "遮光窗簾", slot: "window", price: 2000, rarity: "uncommon", description: "完全不透光的深色窗簾", hint: "拉上遮光窗簾就像晚上一樣，適合睡午覺", intimateHint: "拉上遮光窗簾，白天也一片漆黑，只聽得到彼此的聲音" },
  // 牆上
  { id: "wall-poster", name: "電影海報", slot: "wall", price: 600, rarity: "common", description: "他喜歡的電影海報", hint: "牆上的電影海報，可以聊聊那部電影" },
  { id: "wall-painting", name: "風景畫", slot: "wall", price: 1500, rarity: "common", description: "一幅山和天空的風景畫", hint: "牆上的風景畫，可以聊聊想一起去的地方" },
  { id: "wall-clock", name: "掛鐘", slot: "wall", price: 800, rarity: "common", description: "黑框的圓掛鐘", hint: "牆上的掛鐘，提醒時間已經不早了" },
  { id: "wall-mirror", name: "壁鏡", slot: "wall", price: 2000, rarity: "uncommon", description: "銀框的長方形鏡子", hint: "牆上的鏡子可以整理儀容", intimateHint: "站在鏡子前，看著鏡子裡的兩個人" },
  // 地毯
  { id: "rug-round", name: "圓地毯", slot: "rug", price: 800, rarity: "common", description: "黃色的圓地毯", hint: "坐在地毯上靠著床邊聊天" },
  { id: "rug-fluffy", name: "長毛地毯", slot: "rug", price: 2500, rarity: "uncommon", description: "很軟的白色長毛地毯", hint: "長毛地毯很軟，可以直接躺在地上", intimateHint: "躺在柔軟的長毛地毯上，不用上床" },
  { id: "rug-plaid", name: "格紋地毯", slot: "rug", price: 1200, rarity: "common", description: "紅色格紋地毯", hint: "格紋地毯上可以擺零食，坐著看電影" },
  // 角落
  { id: "corner-plant", name: "盆栽", slot: "corner", price: 500, rarity: "common", description: "他照顧得很好的盆栽", hint: "角落的盆栽，他每天都會澆水" },
  { id: "corner-lamp", name: "立燈", slot: "corner", price: 900, rarity: "common", description: "暖黃色的立燈", hint: "立燈的光很柔和，關掉大燈也看得見", intimateHint: "關掉大燈只留立燈，房間暗暗的很有氣氛" },
  { id: "corner-floor-mirror", name: "落地鏡", slot: "corner", price: 3000, rarity: "rare", description: "金框的落地鏡，照得到全身", hint: "落地鏡照得到全身，出門前會在這裡看穿搭", intimateHint: "站在落地鏡前，看著鏡子裡的彼此" },
  { id: "corner-beanbag", name: "懶骨頭", slot: "corner", price: 2200, rarity: "uncommon", description: "紫色的懶骨頭沙發", hint: "懶骨頭可以整個人陷進去", intimateHint: "兩個人一起陷在懶骨頭裡，動一下就滾在一起" },
];

export function getFurniture(id: string | null | undefined): FurnitureDef | undefined {
  return id ? FURNITURE.find((f) => f.id === id) : undefined;
}

/** 商店商品 id ↔ 家具 id */
export const FURNITURE_SHOP_PREFIX = "furn_";
export const furnitureShopId = (id: string) => `${FURNITURE_SHOP_PREFIX}${id}`;
export function furnitureIdFromShopId(shopId: string): string | null {
  return shopId.startsWith(FURNITURE_SHOP_PREFIX) ? shopId.slice(FURNITURE_SHOP_PREFIX.length) : null;
}

export function slotAccepts(slot: RoomSlotId, furniture: FurnitureDef): boolean {
  return ROOM_SLOTS.find((s) => s.id === slot)?.accepts === furniture.slot;
}

export const DEFAULT_PLACEMENTS: Record<RoomSlotId, string | null> = {
  bed: "bed-single",
  desk: "desk-wood",
  wardrobe: "wardrobe-wood",
  window: "curtain-plain",
  wallA: null,
  wallB: null,
  rug: null,
  corner: null,
};
