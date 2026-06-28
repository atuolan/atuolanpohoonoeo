// ===== 皮（Skin）預設 =====
// 「皮」只負責「東西長什麼樣」：圓角、陰影、模糊、互動回饋、圖標質感。
// 它不碰顏色（顏色是 Palette 的事），也不碰排版（排版是 canvas 的事）。
//
// 設計原則：
// 1. 所有數值最終都會變成 CSS 變數注入 :root，元件只讀變數、不寫死。
// 2. 陰影配方裡的 {shadow} 佔位符，會在 theme store 注入時換成當前配色的陰影色，
//    讓「皮的陰影形狀」與「配色的陰影顏色」彼此正交、自由組合。
// 3. 預設皮 "soft" 必須 1:1 還原目前寫死的數值，確保不換皮時外觀零變化。

export interface SkinTokens {
  id: string;
  name: string;
  description: string;

  // 圓角階梯
  radius: {
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };

  // 陰影配方（{shadow} 會被換成當前配色的陰影色）
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };

  // 過渡 / 互動緩動
  transition: {
    fast: string;
    normal: string;
    slow: string;
  };

  // 表面質感（玻璃皮的靈魂）
  surface: {
    // backdrop-filter 的模糊量，非玻璃皮設 "0px"
    blur: string;
    // 表面透明度 0-1，1 = 完全不透明（非玻璃皮）
    opacity: number;
    // 表面飽和度增益（玻璃常用 saturate 提升背景色彩）
    saturate: string;
  };

  // 邊框預設寬度
  borderWidth: string;

  // 圖標質感
  icon: {
    // 預設圖標形狀（對應 shape-presets 的 id）
    shape: string;
    // 圖標底下的陰影配方（{shadow} 同樣會被換色）
    shadow: string;
  };

  // 互動回饋：按下時的縮放比例（iOS 風格）
  pressScale: string;
}

// 柔和（目前的預設外觀，1:1 還原寫死數值）
const softSkin: SkinTokens = {
  id: "soft",
  name: "柔和",
  description: "目前的預設外觀：中等圓角、柔和擴散陰影、無玻璃模糊。",
  radius: {
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    full: "9999px",
  },
  shadow: {
    sm: "0 2px 8px {shadow}",
    md: "0 4px 16px {shadow}",
    lg: "0 8px 32px {shadow}",
  },
  transition: {
    fast: "0.15s cubic-bezier(0.34, 1.56, 0.64, 1)",
    normal: "0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
    slow: "0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
  },
  surface: {
    blur: "0px",
    opacity: 1,
    saturate: "100%",
  },
  borderWidth: "1px",
  icon: {
    shape: "rounded-square",
    shadow: "0 2px 8px {shadow}",
  },
  pressScale: "0.97",
};

// 玻璃（iOS 風格：大圓角、柔和擴散陰影、半透明 + 模糊）
const glassSkin: SkinTokens = {
  id: "glass",
  name: "玻璃",
  description: "iOS 風格：大圓角、半透明表面、背景模糊、柔和擴散陰影、按壓縮放。",
  radius: {
    sm: "12px",
    md: "18px",
    lg: "26px",
    xl: "36px",
    full: "9999px",
  },
  shadow: {
    sm: "0 4px 16px {shadow}",
    md: "0 10px 30px {shadow}",
    lg: "0 18px 50px {shadow}",
  },
  transition: {
    fast: "0.2s cubic-bezier(0.32, 0.72, 0, 1)",
    normal: "0.32s cubic-bezier(0.32, 0.72, 0, 1)",
    slow: "0.5s cubic-bezier(0.32, 0.72, 0, 1)",
  },
  surface: {
    blur: "20px",
    opacity: 0.62,
    saturate: "180%",
  },
  borderWidth: "1px",
  icon: {
    shape: "squircle",
    shadow: "0 6px 18px {shadow}",
  },
  pressScale: "0.94",
};

// 極簡（直角 / 小圓角、極淡陰影、無模糊；安卓灰階 / 雜誌感）
const flatSkin: SkinTokens = {
  id: "flat",
  name: "極簡",
  description: "極簡風格：小圓角、極淡分層陰影、無模糊、克制的互動回饋。",
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    full: "9999px",
  },
  shadow: {
    sm: "0 1px 2px {shadow}",
    md: "0 2px 6px {shadow}",
    lg: "0 4px 12px {shadow}",
  },
  transition: {
    fast: "0.12s ease-out",
    normal: "0.2s ease-out",
    slow: "0.3s ease-out",
  },
  surface: {
    blur: "0px",
    opacity: 1,
    saturate: "100%",
  },
  borderWidth: "1px",
  icon: {
    shape: "square",
    shadow: "0 1px 3px {shadow}",
  },
  pressScale: "0.98",
};

// 圓潤（更可愛 / 自然插畫感：超大圓角、厚實柔陰影）
const plumpSkin: SkinTokens = {
  id: "plump",
  name: "圓潤",
  description: "可愛 / 插畫風格：超大圓角、厚實柔和陰影、彈性互動回饋。",
  radius: {
    sm: "14px",
    md: "22px",
    lg: "30px",
    xl: "44px",
    full: "9999px",
  },
  shadow: {
    sm: "0 4px 12px {shadow}",
    md: "0 8px 22px {shadow}",
    lg: "0 14px 40px {shadow}",
  },
  transition: {
    fast: "0.18s cubic-bezier(0.34, 1.8, 0.64, 1)",
    normal: "0.3s cubic-bezier(0.34, 1.8, 0.64, 1)",
    slow: "0.5s cubic-bezier(0.34, 1.8, 0.64, 1)",
  },
  surface: {
    blur: "0px",
    opacity: 1,
    saturate: "100%",
  },
  borderWidth: "2px",
  icon: {
    shape: "blob",
    shadow: "0 4px 14px {shadow}",
  },
  pressScale: "0.95",
};

// ===== 皮列表 =====
export const skinPresets: Record<string, SkinTokens> = {
  soft: softSkin,
  glass: glassSkin,
  flat: flatSkin,
  plump: plumpSkin,
};

export const DEFAULT_SKIN_ID = "soft";

/**
 * 把陰影配方裡的 {shadow} 佔位符換成實際的陰影色。
 */
export function resolveShadow(recipe: string, shadowColor: string): string {
  return recipe.replace(/\{shadow\}/g, shadowColor);
}

/**
 * 取得指定皮（找不到時回退到預設皮）。
 */
export function getSkin(skinId?: string): SkinTokens {
  if (skinId && skinPresets[skinId]) return skinPresets[skinId];
  return skinPresets[DEFAULT_SKIN_ID];
}
