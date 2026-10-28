/**
 * 聊天裝扮：欄位、系列與部件定義
 *
 * 聊天畫面切成幾個欄位，每格裝一個部件；同系列的部件可以一起買組合包。
 * 這裡只描述資料（價格、配色變數、預覽圖），怎麼套到畫面見 utils/chatSkinResolve 與 styles/chat-skins。
 */
import type { Rarity } from "@/schemas/gameEconomy";

/** 可以換的欄位；聊天列表、音效之後再加 */
export type ChatSkinSlot = "message" | "wallpaper" | "header" | "input";

export const CHAT_SKIN_SLOTS: readonly ChatSkinSlot[] = ["message", "wallpaper", "header", "input"];

export const CHAT_SKIN_SLOT_LABELS: Record<ChatSkinSlot, string> = {
  message: "訊息",
  wallpaper: "背景",
  header: "頂欄",
  input: "輸入區",
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
  /** 組合包折扣（0.7 = 七折） */
  bundleRate: number;
  previewImage: ChatSkinPreview;
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
];

export const CHAT_SKIN_SERIES: ChatSkinSeries[] = [
  {
    id: GREEN_BUBBLE,
    name: "綠泡泡",
    description: "熟悉的國民聊天軟體風格：綠白氣泡、淺灰背景，一打開就像回到每天在用的那個聊天軟體。",
    pieceIds: ["greenbubble-message", "greenbubble-wallpaper", "greenbubble-header", "greenbubble-input"],
    upcomingSlots: ["聊天列表", "音效", "表情包"],
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

export interface ChatSkinBundleQuote {
  price: number;
  originalPrice: number;
  pieceIds: string[];
}

/** 組合包：未擁有部件原價加總 × 折扣，四捨五入到百位；未擁有少於 2 件時回傳 null */
export function computeBundlePrice(seriesId: string, owned: readonly string[]): ChatSkinBundleQuote | null {
  const series = getChatSkinSeries(seriesId);
  if (!series) return null;
  const unowned = getSeriesPieces(seriesId).filter((p) => !owned.includes(p.id));
  if (unowned.length < 2) return null;
  const originalPrice = unowned.reduce((sum, p) => sum + p.price, 0);
  return {
    price: Math.round((originalPrice * series.bundleRate) / 100) * 100,
    originalPrice,
    pieceIds: unowned.map((p) => p.id),
  };
}
