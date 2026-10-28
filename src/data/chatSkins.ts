/**
 * 聊天裝扮：欄位、系列與部件定義
 *
 * 聊天畫面切成幾個欄位，每格裝一個部件；同系列的部件可以一起買組合包。
 * 這裡只描述資料（價格、配色變數、預覽圖），怎麼套到畫面見 utils/chatSkinResolve 與 styles/chat-skins。
 */
import type { Rarity } from "@/schemas/gameEconomy";
import type { StickerEmotionId } from "@/data/defaultStickers";

/** 可以換的欄位；聊天列表不在聊天畫面裡，只有全域 */
export type ChatSkinSlot = "message" | "wallpaper" | "header" | "input" | "chatList";

/** 聊天畫面裡的欄位（可以單聊另選、可以在聊天裡試穿） */
export const CHAT_SKIN_SLOTS: readonly ChatSkinSlot[] = ["message", "wallpaper", "header", "input"];

/** 全部欄位（外觀設定的全域搭配會列出） */
export const ALL_CHAT_SKIN_SLOTS: readonly ChatSkinSlot[] = [...CHAT_SKIN_SLOTS, "chatList"];

export const CHAT_SKIN_SLOT_LABELS: Record<ChatSkinSlot, string> = {
  message: "訊息",
  wallpaper: "背景",
  header: "頂欄",
  input: "輸入區",
  chatList: "聊天列表",
};

/** 有「用我自己的顏色」開關的欄位（背景部件本身就是顏色，沒有開關） */
export const OWN_COLOR_SLOTS: readonly ChatSkinSlot[] = ["message", "header", "input"];

export interface ChatSkinVars {
  day: Record<string, string>;
  night: Record<string, string>;
}

export interface ChatSkinPreview {
  day: string;
  night: string;
}

export interface ChatSkinPiece {
  id: string;
  seriesId: string;
  slot: ChatSkinSlot;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  previewImage: ChatSkinPreview;
  /** 部件自帶的配色；「用我自己的顏色」打開時不套 */
  vars: ChatSkinVars;
  /** 訊息部件：裝上時固定使用的訊息排版 */
  messageLayout?: "grouped" | "classic";
  /** 頂欄部件：不顯示頭像，點名字改成打開 AI 記憶管理 */
  hidesHeaderAvatar?: boolean;
}

export interface ChatSkinSeries {
  id: string;
  name: string;
  description: string;
  /** 照欄位順序 */
  pieceIds: string[];
  /** 之後才推出的欄位，商店灰色列出「即將推出」 */
  upcomingSlots: string[];
  /** 系列附帶的表情包（不佔欄位） */
  stickerPackId?: string;
  /** 組合包折扣（0.7 = 七折） */
  bundleRate: number;
  previewImage: ChatSkinPreview;
}

export interface ChatSkinSticker {
  /** 「綠泡泡．收到」；角色用 <sticker name="…" /> 送的就是這個名稱 */
  name: string;
  /** 圖片路徑 */
  file: string;
  emotion: StickerEmotionId;
}

export interface ChatSkinStickerPack {
  id: string;
  seriesId: string;
  name: string;
  description: string;
  price: number;
  rarity: Rarity;
  previewImage: ChatSkinPreview;
  /** 表情包面板的分頁圖示 */
  icon: string;
  stickers: ChatSkinSticker[];
}

/** 商店裡能買的一樣東西（部件或表情包） */
export interface ChatSkinShopItem {
  id: string;
  name: string;
  price: number;
  /** 組合包內容、交易紀錄用的短名稱，例如「頂欄」「表情包」 */
  label: string;
}

const GREEN_BUBBLE = "greenbubble";

function preview(seriesId: string, name: string): ChatSkinPreview {
  return {
    day: `/chat-skins/${seriesId}/${name}-day.webp`,
    night: `/chat-skins/${seriesId}/${name}-night.webp`,
  };
}

export const CHAT_SKIN_PIECES: ChatSkinPiece[] = [
  {
    id: "greenbubble-message",
    seriesId: GREEN_BUBBLE,
    slot: "message",
    name: "綠泡泡．訊息",
    description: "淺綠與白的小尖角氣泡、小圓角方形頭像、置中的灰色時間",
    price: 30000,
    rarity: "epic",
    previewImage: preview(GREEN_BUBBLE, "message"),
    messageLayout: "grouped",
    vars: {
      day: {
        "--bubble-user-bg": "#95e36b",
        "--bubble-user-text": "#111111",
        "--bubble-user-text-gradient": "none",
        "--bubble-user-text-fill": "#111111",
        "--bubble-ai-bg": "#ffffff",
        "--bubble-ai-text": "#111111",
        "--bubble-ai-text-gradient": "none",
        "--bubble-ai-text-fill": "#111111",
        "--bubble-ai-content": "#111111",
        "--bubble-ai-content-gradient": "none",
        "--bubble-ai-content-fill": "#111111",
        "--bubble-radius": "4px",
        "--avatar-border-radius": "6px",
        "--thought-bg": "#f0f0f0",
        "--thought-text": "#555555",
        "--skin-meta-text": "#a8a8a8",
      },
      night: {
        "--bubble-user-bg": "#3fa866",
        "--bubble-user-text": "#101010",
        "--bubble-user-text-gradient": "none",
        "--bubble-user-text-fill": "#101010",
        "--bubble-ai-bg": "#2c2c2c",
        "--bubble-ai-text": "#e8e8e8",
        "--bubble-ai-text-gradient": "none",
        "--bubble-ai-text-fill": "#e8e8e8",
        "--bubble-ai-content": "#e8e8e8",
        "--bubble-ai-content-gradient": "none",
        "--bubble-ai-content-fill": "#e8e8e8",
        "--bubble-radius": "4px",
        "--avatar-border-radius": "6px",
        "--thought-bg": "#262626",
        "--thought-text": "#b0b0b0",
        "--skin-meta-text": "#6f6f6f",
      },
    },
  },
  {
    id: "greenbubble-wallpaper",
    seriesId: GREEN_BUBBLE,
    slot: "wallpaper",
    name: "綠泡泡．背景",
    description: "乾淨的淺灰素色背景，夜間換成深灰",
    price: 15000,
    rarity: "common",
    previewImage: preview(GREEN_BUBBLE, "wallpaper"),
    vars: {
      day: {
        "--chat-wallpaper": "#ededed",
        "--chat-wallpaper-blur": "0px",
        "--chat-wallpaper-opacity": "1",
        "--chat-wallpaper-repeat": "no-repeat",
      },
      night: {
        "--chat-wallpaper": "#111111",
        "--chat-wallpaper-blur": "0px",
        "--chat-wallpaper-opacity": "1",
        "--chat-wallpaper-repeat": "no-repeat",
      },
    },
  },
  {
    id: "greenbubble-header",
    seriesId: GREEN_BUBBLE,
    slot: "header",
    name: "綠泡泡．頂欄",
    description: "名字置中的平整頂欄，右上角「⋯」",
    price: 20000,
    rarity: "rare",
    previewImage: preview(GREEN_BUBBLE, "header"),
    hidesHeaderAvatar: true,
    vars: {
      day: {
        "--skin-header-bg": "#ededed",
        "--skin-header-text": "#111111",
        "--skin-header-text-secondary": "#8c8c8c",
        "--skin-header-divider": "#dadada",
      },
      night: {
        "--skin-header-bg": "#1b1b1b",
        "--skin-header-text": "#e6e6e6",
        "--skin-header-text-secondary": "#8a8a8a",
        "--skin-header-divider": "#2a2a2a",
      },
    },
  },
  {
    id: "greenbubble-input",
    seriesId: GREEN_BUBBLE,
    slot: "input",
    name: "綠泡泡．輸入區",
    description: "語音、表情、＋排在兩側，有字時換成綠色發送鍵",
    price: 20000,
    rarity: "rare",
    previewImage: preview(GREEN_BUBBLE, "input"),
    vars: {
      day: {
        "--skin-input-bg": "#f6f6f6",
        "--skin-input-field-bg": "#ffffff",
        "--skin-input-text": "#111111",
        "--skin-input-icon": "#1f1f1f",
        "--skin-input-divider": "#dcdcdc",
        "--skin-send-bg": "#1aad5a",
        "--skin-send-text": "#ffffff",
      },
      night: {
        "--skin-input-bg": "#1b1b1b",
        "--skin-input-field-bg": "#2c2c2c",
        "--skin-input-text": "#e6e6e6",
        "--skin-input-icon": "#cfcfcf",
        "--skin-input-divider": "#2a2a2a",
        "--skin-send-bg": "#1aad5a",
        "--skin-send-text": "#ffffff",
      },
    },
  },
  {
    id: "greenbubble-chatList",
    seriesId: GREEN_BUBBLE,
    slot: "chatList",
    name: "綠泡泡．聊天列表",
    description: "灰色頂欄、白色長條、方圓頭像和紅色未讀數字",
    price: 20000,
    rarity: "rare",
    previewImage: preview(GREEN_BUBBLE, "chatList"),
    vars: {
      day: {
        "--skin-list-bg": "#ededed",
        "--skin-list-row-bg": "#ffffff",
        "--skin-list-row-pinned-bg": "#f7f7f7",
        "--skin-list-name": "#191919",
        "--skin-list-secondary": "#b2b2b2",
        "--skin-list-divider": "#e5e5e5",
        "--skin-list-search-bg": "#ffffff",
        "--skin-list-icon": "#191919",
        "--skin-list-accent": "#07c160",
        "--skin-list-badge-bg": "#fa5151",
      },
      night: {
        "--skin-list-bg": "#111111",
        "--skin-list-row-bg": "#191919",
        "--skin-list-row-pinned-bg": "#232323",
        "--skin-list-name": "#d5d5d5",
        "--skin-list-secondary": "#6e6e6e",
        "--skin-list-divider": "#2a2a2a",
        "--skin-list-search-bg": "#202020",
        "--skin-list-icon": "#d5d5d5",
        "--skin-list-accent": "#07c160",
        "--skin-list-badge-bg": "#fa5151",
      },
    },
  },
];

/** 綠泡泡表情包：文字與情緒分類；圖檔照順序是 stickers/01.webp … 24.webp */
const GREEN_BUBBLE_STICKER_TEXTS: [string, StickerEmotionId][] = [
  ["收到", "misc"],
  ["好的", "misc"],
  ["OK", "misc"],
  ["在嗎", "sos"],
  ["在忙", "tired"],
  ["等我一下", "misc"],
  ["馬上到", "misc"],
  ["早安", "happy"],
  ["晚安", "tired"],
  ["謝謝", "shy"],
  ["辛苦了", "love"],
  ["加油", "happy"],
  ["好耶", "happy"],
  ["哈哈哈哈", "happy"],
  ["笑死", "mischief"],
  ["嗯嗯", "cute_action"],
  ["？？？", "surprise"],
  ["無語", "tired"],
  ["哼", "angry"],
  ["不要", "angry"],
  ["委屈", "sad"],
  ["抱抱", "love"],
  ["想你了", "love"],
  ["愛你", "love"],
];

function stickerFile(seriesId: string, index: number): string {
  const n = index + 1;
  return `/chat-skins/${seriesId}/stickers/${n < 10 ? "0" : ""}${n}.webp`;
}

export const CHAT_SKIN_STICKER_PACKS: ChatSkinStickerPack[] = [
  {
    id: "greenbubble-stickers",
    seriesId: GREEN_BUBBLE,
    name: "綠泡泡．表情包",
    description: "24 張大字貼圖：收到、晚安、笑死、抱抱……你和角色都能用",
    price: 15000,
    rarity: "common",
    previewImage: preview(GREEN_BUBBLE, "stickers"),
    icon: stickerFile(GREEN_BUBBLE, 0),
    stickers: GREEN_BUBBLE_STICKER_TEXTS.map(([text, emotion], i) => ({
      name: `綠泡泡．${text}`,
      file: stickerFile(GREEN_BUBBLE, i),
      emotion,
    })),
  },
];

export const CHAT_SKIN_SERIES: ChatSkinSeries[] = [
  {
    id: GREEN_BUBBLE,
    name: "綠泡泡",
    description: "熟悉的國民聊天軟體風格：綠白氣泡、淺灰背景，一打開就像回到每天在用的那個聊天軟體。",
    pieceIds: [
      "greenbubble-message",
      "greenbubble-wallpaper",
      "greenbubble-header",
      "greenbubble-input",
      "greenbubble-chatList",
    ],
    upcomingSlots: [],
    stickerPackId: "greenbubble-stickers",
    bundleRate: 0.7,
    previewImage: preview(GREEN_BUBBLE, "series"),
  },
];

/** 所有部件用到的 CSS 變數名稱；每次重新套用外觀前要先清掉 */
export const CHAT_SKIN_VAR_PROPS: readonly string[] = [
  ...new Set(CHAT_SKIN_PIECES.flatMap((p) => [...Object.keys(p.vars.day), ...Object.keys(p.vars.night)])),
];

export function getChatSkinPiece(id: string | null | undefined): ChatSkinPiece | undefined {
  if (!id) return undefined;
  return CHAT_SKIN_PIECES.find((p) => p.id === id);
}

export function getChatSkinSeries(id: string | null | undefined): ChatSkinSeries | undefined {
  if (!id) return undefined;
  return CHAT_SKIN_SERIES.find((s) => s.id === id);
}

export function getSeriesPieces(seriesId: string): ChatSkinPiece[] {
  const series = getChatSkinSeries(seriesId);
  if (!series) return [];
  return series.pieceIds
    .map((id) => getChatSkinPiece(id))
    .filter((p): p is ChatSkinPiece => !!p);
}

export function getPiecesForSlot(slot: ChatSkinSlot): ChatSkinPiece[] {
  return CHAT_SKIN_PIECES.filter((p) => p.slot === slot);
}

export function getChatSkinStickerPack(id: string | null | undefined): ChatSkinStickerPack | undefined {
  if (!id) return undefined;
  return CHAT_SKIN_STICKER_PACKS.find((p) => p.id === id);
}

/** 系列裡能買的東西：部件（照欄位順序）＋表情包 */
export function getSeriesShopItems(seriesId: string): ChatSkinShopItem[] {
  const items: ChatSkinShopItem[] = getSeriesPieces(seriesId).map((p) => ({
    id: p.id,
    name: p.name,
    price: p.price,
    label: CHAT_SKIN_SLOT_LABELS[p.slot],
  }));
  const pack = getChatSkinStickerPack(getChatSkinSeries(seriesId)?.stickerPackId);
  if (pack) items.push({ id: pack.id, name: pack.name, price: pack.price, label: "表情包" });
  return items;
}

/** 用 ID 找部件或表情包 */
export function getChatSkinShopItem(id: string | null | undefined): ChatSkinShopItem | undefined {
  const piece = getChatSkinPiece(id);
  if (piece) return { id: piece.id, name: piece.name, price: piece.price, label: CHAT_SKIN_SLOT_LABELS[piece.slot] };
  const pack = getChatSkinStickerPack(id);
  if (pack) return { id: pack.id, name: pack.name, price: pack.price, label: "表情包" };
  return undefined;
}

export interface ChatSkinBundleQuote {
  price: number;
  originalPrice: number;
  pieceIds: string[];
}

/** 組合包：未擁有的部件和表情包原價加總 × 折扣，四捨五入到百位；未擁有少於 2 件時回傳 null */
export function computeBundlePrice(seriesId: string, owned: readonly string[]): ChatSkinBundleQuote | null {
  const series = getChatSkinSeries(seriesId);
  if (!series) return null;
  const unowned = getSeriesShopItems(seriesId).filter((item) => !owned.includes(item.id));
  if (unowned.length < 2) return null;
  const originalPrice = unowned.reduce((sum, item) => sum + item.price, 0);
  return {
    price: Math.round((originalPrice * series.bundleRate) / 100) * 100,
    originalPrice,
    pieceIds: unowned.map((item) => item.id),
  };
}
