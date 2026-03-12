/**
 * 頭像框樣式定義
 *
 * 定義每個頭像框的視覺樣式（CSS、SVG 或圖片圖層）
 */

/** 圖層定義 */
export interface FrameLayer {
  /** 圖層類型：svg、image (base64) 或 url */
  type: "svg" | "image" | "url";
  /** 圖層內容：SVG 代碼、base64 圖片或圖片 URL */
  content: string;
  /** 偏移量 */
  offset?: { x: number; y: number };
  /** 縮放比例 (100 = 100%) */
  scale?: number;
  /** 旋轉角度 */
  rotation?: number;
  /** CSS 濾鏡效果 */
  filter?: string;
}

export interface AvatarFrameStyle {
  /** 頭像框 ID（對應 shopItems 中的 id） */
  id: string;
  /** 頭像框類型：css、svg 或 image */
  type?: "css" | "svg" | "image";
  /** 邊框樣式 */
  border?: string;
  /** 邊框圓角（覆蓋頭像本身的圓角） */
  borderRadius?: string;
  /** 外框陰影 */
  boxShadow?: string;
  /** 外框動畫 */
  animation?: string;
  /** 額外的 CSS 類名 */
  className?: string;
  /** 偽元素裝飾（::before） */
  beforeStyle?: Record<string, string>;
  /** 偽元素裝飾（::after） */
  afterStyle?: Record<string, string>;
  /** SVG 頭像框（三種形狀） */
  svgFrames?: {
    circle?: string;
    rounded?: string;
    square?: string;
  };
  /** 圖片圖層（用於 PNG 等點陣圖） */
  layers?: {
    /** 背景層（在頭像後面） */
    background?: FrameLayer;
    /** 框架層（環繞頭像） - 對應 svgFrames */
    frame?: FrameLayer;
    /** 覆蓋層（疊在頭像上面） */
    overlay?: FrameLayer;
    /** 裝飾層（額外裝飾元素） */
    decoration?: FrameLayer;
  };
}

/** 頭像框樣式映射 */
export const AVATAR_FRAME_STYLES: Record<string, AvatarFrameStyle> = {
  // 偷看貓咪框
  frame_peekcat: {
    id: "frame_peekcat",
    type: "svg",
    svgFrames: {
      circle: `<svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffb3d9" /><stop offset="50%" stop-color="#ff85a2" /><stop offset="100%" stop-color="#a8e6cf" /></linearGradient><linearGradient id="softGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffc2d1" /><stop offset="100%" stop-color="#b8e6a8" /></linearGradient><filter id="catShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" /><feOffset dx="2" dy="2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><g opacity="0.6" fill="#ff85a2"><circle cx="30" cy="40" r="2" /><circle cx="250" cy="50" r="1.5" /><circle cx="20" cy="220" r="2.5" /><circle cx="260" cy="240" r="1.8" /></g><circle cx="140" cy="140" r="100" stroke="url(#softGradient)" stroke-width="10" fill="none" filter="url(#catShadow)" stroke-linecap="round" /><g transform="translate(75, 50) rotate(-20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(175, 50) rotate(20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(35, 185)" filter="url(#catShadow)"><g fill="#ffffff" stroke="#a8e6cf" stroke-width="2"><ellipse cx="5" cy="-8" rx="8" ry="6" transform="rotate(-25)" /><ellipse cx="15" cy="-5" rx="6" ry="4" transform="rotate(-20)" /><ellipse cx="25" cy="-3" rx="7" ry="5" transform="rotate(-15)" /></g><ellipse cx="45" cy="25" rx="30" ry="28" fill="#ffffff" stroke="#a8e6cf" stroke-width="2" /><g fill="#555"><ellipse cx="35" cy="20" rx="4" ry="5" /><ellipse cx="55" cy="20" rx="4" ry="5" /><ellipse cx="45" cy="30" rx="2" ry="1.5" fill="#ff85a2" /><path d="M40,32 Q45,35 50,32" stroke="#ff85a2" stroke-width="2" fill="none" stroke-linecap="round" /></g><ellipse cx="30" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /><ellipse cx="60" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /></g><g filter="url(#catShadow)"><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ff85a2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /></g></svg>`,
      rounded: `<svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffb3d9" /><stop offset="50%" stop-color="#ff85a2" /><stop offset="100%" stop-color="#a8e6cf" /></linearGradient><linearGradient id="softGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffc2d1" /><stop offset="100%" stop-color="#b8e6a8" /></linearGradient><filter id="catShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" /><feOffset dx="2" dy="2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><g opacity="0.6" fill="#ff85a2"><circle cx="30" cy="40" r="2" /><circle cx="250" cy="50" r="1.5" /><circle cx="20" cy="220" r="2.5" /><circle cx="260" cy="240" r="1.8" /></g><rect x="40" y="40" width="200" height="200" rx="24" ry="24" stroke="url(#softGradient)" stroke-width="10" fill="none" filter="url(#catShadow)" /><g transform="translate(75, 50) rotate(-20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(175, 50) rotate(20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(35, 185)" filter="url(#catShadow)"><g fill="#ffffff" stroke="#a8e6cf" stroke-width="2"><ellipse cx="5" cy="-8" rx="8" ry="6" transform="rotate(-25)" /><ellipse cx="15" cy="-5" rx="6" ry="4" transform="rotate(-20)" /><ellipse cx="25" cy="-3" rx="7" ry="5" transform="rotate(-15)" /></g><ellipse cx="45" cy="25" rx="30" ry="28" fill="#ffffff" stroke="#a8e6cf" stroke-width="2" /><g fill="#555"><ellipse cx="35" cy="20" rx="4" ry="5" /><ellipse cx="55" cy="20" rx="4" ry="5" /><ellipse cx="45" cy="30" rx="2" ry="1.5" fill="#ff85a2" /><path d="M40,32 Q45,35 50,32" stroke="#ff85a2" stroke-width="2" fill="none" stroke-linecap="round" /></g><ellipse cx="30" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /><ellipse cx="60" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /></g><g filter="url(#catShadow)"><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ff85a2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /></g></svg>`,
      square: `<svg viewBox="0 0 280 280" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="catGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffb3d9" /><stop offset="50%" stop-color="#ff85a2" /><stop offset="100%" stop-color="#a8e6cf" /></linearGradient><linearGradient id="softGradient" x1="0%" y1="0%" x2="100%" y2="100%" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ffc2d1" /><stop offset="100%" stop-color="#b8e6a8" /></linearGradient><filter id="catShadow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur in="SourceAlpha" stdDeviation="3" /><feOffset dx="2" dy="2" /><feMerge><feMergeNode /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><g opacity="0.6" fill="#ff85a2"><circle cx="30" cy="40" r="2" /><circle cx="250" cy="50" r="1.5" /><circle cx="20" cy="220" r="2.5" /><circle cx="260" cy="240" r="1.8" /></g><rect x="40" y="40" width="200" height="200" stroke="url(#softGradient)" stroke-width="10" fill="none" filter="url(#catShadow)" /><g transform="translate(75, 50) rotate(-20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(175, 50) rotate(20)" filter="url(#catShadow)"><path d="M0,0 Q20,-35 40,0 Q25,10 0,0 Z" fill="#ffffff" stroke="#ff85a2" stroke-width="3" /><path d="M10,-10 Q20,-25 30,-10" fill="#ff85a2" /></g><g transform="translate(35, 185)" filter="url(#catShadow)"><g fill="#ffffff" stroke="#a8e6cf" stroke-width="2"><ellipse cx="5" cy="-8" rx="8" ry="6" transform="rotate(-25)" /><ellipse cx="15" cy="-5" rx="6" ry="4" transform="rotate(-20)" /><ellipse cx="25" cy="-3" rx="7" ry="5" transform="rotate(-15)" /></g><ellipse cx="45" cy="25" rx="30" ry="28" fill="#ffffff" stroke="#a8e6cf" stroke-width="2" /><g fill="#555"><ellipse cx="35" cy="20" rx="4" ry="5" /><ellipse cx="55" cy="20" rx="4" ry="5" /><ellipse cx="45" cy="30" rx="2" ry="1.5" fill="#ff85a2" /><path d="M40,32 Q45,35 50,32" stroke="#ff85a2" stroke-width="2" fill="none" stroke-linecap="round" /></g><ellipse cx="30" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /><ellipse cx="60" cy="28" rx="5" ry="3" fill="#ff85a2" opacity="0.4" /></g><g filter="url(#catShadow)"><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ffffff" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" /><path d="M210,210 Q235,235 245,195 Q255,170 240,155 Q230,140 220,160" fill="none" stroke="#ff85a2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /></g></svg>`,
    },
  },
  // 綠煤炭框 - 商品列表預覽（使用綠色版本）
  frame_greencoal: {
    id: "frame_greencoal",
    type: "svg",
    svgFrames: {
      circle: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      rounded: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      square: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
    },
  },
  // 綠煤炭框 - 森林綠變體
  frame_greencoal_green: {
    id: "frame_greencoal_green",
    type: "svg",
    svgFrames: {
      circle: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      rounded: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      square: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSpray" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#d9f285"/><stop offset="50%" stop-color="#76c25b"/><stop offset="90%" stop-color="#1e6b26"/></linearGradient><filter id="gcTex" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFur"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcLeaf" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#6ab547" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#6ab547" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#8EDA85" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSpray)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSpray)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTex)" opacity="0.8"/></g><use href="#gcLeaf" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcLeaf" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcLeaf" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcLeaf" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcLeaf" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFur)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
    },
  },
  // 綠煤炭框 - 櫻花粉變體
  frame_greencoal_pink: {
    id: "frame_greencoal_pink",
    type: "svg",
    svgFrames: {
      circle: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSprayPink" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#ffd6e0"/><stop offset="50%" stop-color="#f5a9b8"/><stop offset="90%" stop-color="#d4708a"/></linearGradient><filter id="gcTexPink" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFurPink"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcPetal" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#e891a8" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#e891a8" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#ffb6c1" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSprayPink)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSprayPink)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.8"/></g><use href="#gcPetal" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcPetal" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcPetal" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcPetal" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcPetal" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      rounded: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSprayPink" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#ffd6e0"/><stop offset="50%" stop-color="#f5a9b8"/><stop offset="90%" stop-color="#d4708a"/></linearGradient><filter id="gcTexPink" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFurPink"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcPetal" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#e891a8" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#e891a8" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#ffb6c1" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSprayPink)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSprayPink)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.8"/></g><use href="#gcPetal" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcPetal" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcPetal" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcPetal" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcPetal" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
      square: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcSprayPink" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="10%" stop-color="#ffd6e0"/><stop offset="50%" stop-color="#f5a9b8"/><stop offset="90%" stop-color="#d4708a"/></linearGradient><filter id="gcTexPink" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" result="noise"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 5 -2" in="noise" result="grain"/><feComposite operator="in" in="SourceGraphic" in2="grain" result="composite"/><feGaussianBlur stdDeviation="0.8" result="blur"/></filter><filter id="gcFurPink"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="3"/></filter><symbol id="gcPetal" viewBox="0 0 40 40"><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="none" stroke="#e891a8" stroke-width="2" stroke-linecap="round"/><path d="M20,2 L20,38 M20,10 L30,15 M20,25 L10,30" stroke="#e891a8" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M20,38 Q10,25 2,20 Q10,15 20,2 Q30,15 38,20 Q30,25 20,38 Z" fill="#ffb6c1" opacity="0.4"/></symbol></defs><g transform="translate(140,140)"><path d="M 60 -42 A 75 75 0 1 1 -51 60" stroke="url(#gcSprayPink)" stroke-width="51" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.5"/><path d="M 56 -37 A 70 70 0 1 1 -47 56" stroke="url(#gcSprayPink)" stroke-width="28" fill="none" stroke-linecap="round" filter="url(#gcTexPink)" opacity="0.8"/></g><use href="#gcPetal" x="47" y="70" width="14" height="14" transform="rotate(30, 54, 77)"/><use href="#gcPetal" x="224" y="56" width="19" height="19" transform="rotate(-45, 233, 65)"/><use href="#gcPetal" x="233" y="117" width="9" height="9" transform="rotate(90, 238, 121)"/><use href="#gcPetal" x="84" y="224" width="16" height="16" transform="rotate(120, 92, 232)"/><use href="#gcPetal" x="37" y="210" width="12" height="12" transform="rotate(60, 43, 216)"/><g transform="translate(65, 196)"><g transform="translate(-9, -21) rotate(-15)"><path d="M-12,0 Q0,-9 12,0" fill="none" stroke="#222" stroke-width="1.2" stroke-linecap="round"/><line x1="0" y1="-5" x2="0" y2="14" stroke="#222" stroke-width="1.2"/></g><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="-4" cy="-1" r="0.7" fill="black"/><ellipse cx="4" cy="-1" rx="3" ry="3.3" fill="white"/><circle cx="4" cy="-1" r="0.7" fill="black"/><path d="M-2,7 L-4,12 M2,7 L4,12" stroke="#151515" stroke-width="1"/></g><g transform="translate(205, 75)"><path d="M-2,-5 L-5,-12 M2,-5 L7,-9" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><circle r="10" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="-3" cy="1.5" r="0.6" fill="black"/><ellipse cx="3" cy="1" rx="2.3" ry="2.8" fill="white"/><circle cx="3" cy="1.5" r="0.6" fill="black"/><path d="M-2,7 L-2,10 M2,7 L2,10" stroke="#151515" stroke-width="1"/></g><g transform="translate(210, 201)"><circle r="12" fill="#151515" filter="url(#gcFurPink)"/><ellipse cx="-4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="-4" cy="-2" r="0.7" fill="black"/><ellipse cx="4" cy="-2" rx="2.8" ry="3.3" fill="white"/><circle cx="4" cy="-2" r="0.7" fill="black"/><path d="M-9,0 L-14,-5 M9,0 L15,-2" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/><path d="M-5,9 L-7,14 M5,9 L8,13" stroke="#151515" stroke-width="1.2" stroke-linecap="round"/></g></svg>`,
    },
  },
  // 綠煤炭框 - PNG 精緻版變體
  frame_greencoal_png: {
    id: "frame_greencoal_png",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E7%B6%A0%E7%85%A4%E7%82%AD.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 月亮框 - 商品列表預覽（使用金黃色版本）
  frame_moon: {
    id: "frame_moon",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_7e68c00aa5c50a066b4eb66209204315.png",
        offset: { x: -2, y: 1 },
        scale: 86,
        rotation: 0,
      },
    },
  },
  // 月亮框 - 金黃月變體
  frame_moon_yellow: {
    id: "frame_moon_yellow",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_7e68c00aa5c50a066b4eb66209204315.png",
        offset: { x: -2, y: 1 },
        scale: 86,
        rotation: 0,
      },
    },
  },
  // 月亮框 - 血月變體
  frame_moon_red: {
    id: "frame_moon_red",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_7e68c00aa5c50a066b4eb66209204315.png",
        offset: { x: -2, y: 1 },
        scale: 86,
        rotation: 0,
        // 紅色濾鏡效果會在渲染時通過 CSS filter 實現
        filter: "hue-rotate(330deg) saturate(1.5)",
      },
    },
  },
  // 海的風情框
  frame_see_sea: {
    id: "frame_see_sea",
    type: "image",
    layers: {
      background: {
        type: "svg",
        content: `<svg width="280" height="280" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <rect x="20" y="20" width="240" height="240" rx="40" ry="40" fill="#f0faff"/>
</svg>`,
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
      overlay: {
        type: "svg",
        content: `<svg width="280" height="280" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="waveClip">
      <rect x="20" y="20" width="240" height="240" rx="40" ry="40"/>
    </clipPath>
    <linearGradient id="grad-back" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#b3e5fc" />
      <stop offset="100%" stop-color="#81d4fa" />
    </linearGradient>
    <linearGradient id="grad-mid" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#4fc3f7" />
      <stop offset="100%" stop-color="#29b6f6" />
    </linearGradient>
    <linearGradient id="grad-front" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#039be5" />
      <stop offset="100%" stop-color="#0277bd" />
    </linearGradient>
    <filter id="waveShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#01579b" flood-opacity="0.2"/>
    </filter>
  </defs>
  <g clip-path="url(#waveClip)">
    <path d="M 20 180 Q 60 160 100 175 T 180 170 T 260 160 V 260 H 20 Z" fill="url(#grad-back)" opacity="0.6"/>
    <path d="M 20 200 Q 70 215 120 200 T 220 190 T 260 210 V 260 H 20 Z" fill="url(#grad-mid)" opacity="0.8"/>
    <g filter="url(#waveShadow)">
      <path d="M 20 220 Q 50 200 90 215 T 170 225 T 260 205 V 260 H 20 Z" fill="url(#grad-front)"/>
      <path d="M 20 220 Q 50 200 90 215 T 170 225 T 260 205" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" opacity="0.6" stroke-dasharray="10, 5"/>
    </g>
    <circle cx="50" cy="160" r="4" fill="#fff" opacity="0.6"/>
    <circle cx="230" cy="180" r="3" fill="#fff" opacity="0.5"/>
    <g transform="translate(60, 235) rotate(-15)">
      <path d="M0,-10 L2.5,-2.5 L10,-2.5 L4,2 L6,9 L0,5 L-6,9 L-4,2 L-10,-2.5 L-2.5,-2.5 Z" fill="#ffab91" stroke="#ff7043" stroke-width="1"/>
      <circle cx="0" cy="0" r="1.5" fill="#ffe0b2"/>
    </g>
  </g>
</svg>`,
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
      decoration: {
        type: "svg",
        content: `<svg width="280" height="280" viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="hatShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="#01579b" flood-opacity="0.2"/>
    </filter>
  </defs>
  <g transform="translate(225, 55) rotate(20)" filter="url(#hatShadow)">
    <ellipse cx="0" cy="0" rx="42" ry="14" fill="#fff9c4" stroke="#fbc02d" stroke-width="1.5"/>
    <path d="M -22,0 Q -22,-32 0,-32 Q 22,-32 22,0" fill="#fff176" stroke="#fbc02d" stroke-width="1.5"/>
    <path d="M -23,-2 Q 0,-8 23,-2 L 23,-9 Q 0,-15 -23,-9 Z" fill="#4fc3f7"/>
    <circle cx="14" cy="-5" r="3" fill="#ff8a80"/>
  </g>
</svg>`,
        offset: { x: -20, y: 0 },
        scale: 173,
        rotation: 25,
      },
    },
  },
  // 蜜蜂採蜜框
  frame_bee: {
    id: "frame_bee",
    type: "image",
    layers: {
      background: {
        type: "svg",
        content: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="honeyGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff8e1" />
      <stop offset="60%" stop-color="#ffecb3" />
      <stop offset="100%" stop-color="#ffcc80" />
    </radialGradient>
    <pattern id="honeycomb" x="0" y="0" width="40" height="34.6" patternUnits="userSpaceOnUse">
      <path d="M20 0 L40 11.5 L40 34.6 L20 46.1 L0 34.6 L0 11.5 Z" fill="none" stroke="#ffb74d" stroke-width="1" opacity="0.2"/>
    </pattern>
  </defs>
  <rect x="0" y="0" width="280" height="280" rx="40" fill="url(#honeyGlow)"/>
  <rect x="10" y="10" width="260" height="260" fill="url(#honeycomb)" opacity="0.6"/>
  <path transform="translate(40, 60) scale(0.8)" d="M15 0 L30 8.6 L30 26 L15 34.6 L0 26 L0 8.6 Z" fill="#ffcc80" opacity="0.4"/>
  <path transform="translate(220, 180) scale(0.6)" d="M15 0 L30 8.6 L30 26 L15 34.6 L0 26 L0 8.6 Z" fill="#ffcc80" opacity="0.3"/>
  <path transform="translate(60, 220) scale(0.5)" d="M15 0 L30 8.6 L30 26 L15 34.6 L0 26 L0 8.6 Z" fill="#ffe0b2" opacity="0.5"/>
</svg>`,
        offset: { x: 0, y: 0 },
        scale: 93,
        rotation: 0,
      },
      overlay: {
        type: "svg",
        content: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <g id="cute-bee">
      <path d="M-5,-5 Q-15,-15 -5,-20 Q5,-15 0,-5" fill="#ffffff" stroke="#8d6e63" stroke-width="0.5" opacity="0.8"/>
      <path d="M5,-5 Q15,-15 5,-20 Q-5,-15 0,-5" fill="#ffffff" stroke="#8d6e63" stroke-width="0.5" opacity="0.8" transform="scale(-1,1)"/>
      <ellipse cx="0" cy="0" rx="8" ry="6" fill="#ffd740" stroke="#5d4037" stroke-width="1"/>
      <path d="M-2,-5 Q-4,0 -2,5" fill="none" stroke="#5d4037" stroke-width="1.5"/>
      <path d="M2,-5 Q0,0 2,5" fill="none" stroke="#5d4037" stroke-width="1.5"/>
      <circle cx="-3" cy="-1" r="0.8" fill="#3e2723"/>
      <circle cx="3" cy="-1" r="0.8" fill="#3e2723"/>
      <path d="M-3,-4 L-6,-9" stroke="#5d4037" stroke-width="0.8"/>
      <path d="M3,-4 L6,-9" stroke="#5d4037" stroke-width="0.8"/>
    </g>
  </defs>
  <g transform="translate(50, 230) rotate(-15)">
    <animateTransform attributeName="transform" type="translate" values="50 230; 50 225; 50 230" dur="2s" repeatCount="indefinite" additive="replace"/>
    <use href="#cute-bee" transform="scale(1.5)"/>
  </g>
  <path d="M 20,240 Q 30,250 50,230" fill="none" stroke="#8d6e63" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.5"/>
  <g transform="translate(230, 70) rotate(30)">
    <use href="#cute-bee" transform="scale(1.2)"/>
  </g>
  <g fill="#fff9c4">
    <circle cx="240" cy="80" r="3" opacity="0.6"/>
    <circle cx="220" cy="60" r="2" opacity="0.4"/>
    <circle cx="60" cy="210" r="2" opacity="0.5"/>
  </g>
</svg>`,
        offset: { x: 0, y: 0 },
        scale: 91,
        rotation: 0,
      },
    },
  },
  // 惡魔框
  Demon_DC: {
    id: "Demon_DC",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_c1fba076919b76b5170df846d285117d.png",
        offset: { x: 0, y: -9 },
        scale: 92,
        rotation: 0,
      },
    },
  },
  // 白玫瑰框
  White_rose_DC: {
    id: "White_rose_DC",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_6682092b74310f3d9cadb6ab53594ac4.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 白玫瑰框 - 白色變體
  White_rose_DC_white: {
    id: "White_rose_DC_white",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_6682092b74310f3d9cadb6ab53594ac4.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 黑玫瑰框 - 黑色變體
  White_rose_DC_black: {
    id: "White_rose_DC_black",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E9%BB%91%E7%8E%AB%E7%91%B0.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 天使翅膀框
  Angel_wings: {
    id: "Angel_wings",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/a_b0e4807f3437fd951f7938e682bb7a0b.png",
        offset: { x: 0, y: 0 },
        scale: 84,
        rotation: 0,
      },
    },
  },
  // 朦朧星光框
  Hazy_Starlight_DC: {
    id: "Hazy_Starlight_DC",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/%E6%9C%A6%E6%9C%A7%E6%98%9F%E5%85%89.png",
        offset: { x: 0, y: 0 },
        scale: 101,
        rotation: 0,
      },
    },
  },
  // 月和星框
  Moon_Stars_DC: {
    id: "Moon_Stars_DC",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E6%9C%88%E5%92%8C%E6%98%9F.png",
        offset: { x: 0, y: 0 },
        scale: 89,
        rotation: 0,
      },
    },
  },
  // 你很牛逼克拉斯嗎
  Are_you_so_awesome_Klass: {
    id: "Are_you_so_awesome_Klass",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/%E4%BD%A0%E5%BE%88%E7%89%9B%E9%80%BC%E5%85%8B%E6%8B%89%E6%96%AF%E5%97%8E.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 頭像是我你不滿意？
  Youre_not_satisfied: {
    id: "Youre_not_satisfied",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/%E9%A0%AD%E5%83%8F%E6%98%AF%E6%88%91%EF%BC%8C%E4%BD%A0%E4%B8%8D%E6%BB%BF%E6%84%8F.png",
        offset: { x: 0, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 烘焙熊
  Baking_Bear: {
    id: "Baking_Bear",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E7%83%98%E7%84%99%E7%86%8A.png",
        offset: { x: 0, y: 0 },
        scale: 86,
        rotation: 0,
      },
    },
  },
  // 撫摸，好感度+5
  UPUP_love: {
    id: "UPUP_love",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content:
          "https://img.aguacloud.uk/%E6%92%AB%E6%91%B8%EF%BC%8C%E5%A5%BD%E6%84%9F%E5%BA%A6%2B5.png",
        offset: { x: -3, y: 0 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 霸道總裁小嬌妻
  Overbearing_CEO: {
    id: "Overbearing_CEO",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E9%9C%B8%E9%81%93%E7%B8%BD%E8%A3%81.gif",
        offset: { x: 0, y: -4 },
        scale: 100,
        rotation: 0,
      },
    },
  },
  // 皇上駕到
  Emperor_arrived: {
    id: "Emperor_arrived",
    type: "image",
    layers: {
      overlay: {
        type: "url",
        content: "https://img.aguacloud.uk/%E7%9A%87%E4%B8%8A%E9%A7%95%E5%88%B0.gif",
        offset: { x: 0, y: 0 },
        scale: 119,
        rotation: 0,
      },
    },
  },
  // 簡約銀框（圖層版）
  Silver_rim: {
    id: "Silver_rim",
    type: "image",
    layers: {
      overlay: {
        type: "svg",
        content: `<svg viewBox="0 0 280 280" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="silver-plate" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#8e9eab" />
      <stop offset="20%" stop-color="#eef2f3" />
      <stop offset="45%" stop-color="#8e9eab" />
      <stop offset="50%" stop-color="#708090" />
      <stop offset="55%" stop-color="#eef2f3" />
      <stop offset="100%" stop-color="#bdc3c7" />
    </linearGradient>
    <radialGradient id="gold-glint" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
      <stop offset="30%" stop-color="#ffd700" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#dfa000" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <symbol id="sparkle" viewBox="-10 -10 20 20">
      <path d="M0,-10 C0,-2 2,0 10,0 C2,0 0,2 0,10 C0,2 -2,0 -10,0 C-2,0 0,-2 0,-10" fill="url(#gold-glint)"/>
    </symbol>
  </defs>
  <circle cx="140" cy="140" r="118" fill="none" stroke="#eef2f3" stroke-width="8" filter="url(#soft-glow)" opacity="0.6"/>
  <circle cx="140" cy="140" r="120" fill="none" stroke="#708090" stroke-width="1" opacity="0.5"/>
  <circle cx="140" cy="140" r="115" fill="none" stroke="url(#silver-plate)" stroke-width="6"/>
  <circle cx="140" cy="140" r="110" fill="none" stroke="#708090" stroke-width="0.5" opacity="0.4"/>
  <g transform="translate(65, 65)">
    <use href="#sparkle" width="30" height="30" x="-15" y="-15" />
    <rect x="-10" y="-0.5" width="20" height="1" fill="#fff" opacity="0.8"/>
    <rect x="-0.5" y="-10" width="1" height="20" fill="#fff" opacity="0.8"/>
  </g>
  <g transform="translate(215, 215) scale(0.7)">
    <use href="#sparkle" width="30" height="30" x="-15" y="-15" />
  </g>
  <circle cx="200" cy="50" r="1.5" fill="#ffd700" opacity="0.8"/>
  <circle cx="80" cy="220" r="1" fill="#ffd700" opacity="0.6"/>
</svg>`,
        offset: { x: 0, y: 0 },
        scale: 94,
        rotation: 0,
      },
    },
  },
};

/**
 * 根據頭像框 ID 取得樣式
 * @param frameId 頭像框 ID
 * @returns 頭像框樣式或 undefined
 */
export function getAvatarFrameStyle(
  frameId: string | null | undefined,
): AvatarFrameStyle | undefined {
  if (!frameId) return undefined;
  return AVATAR_FRAME_STYLES[frameId];
}

/**
 * 生成頭像框的內聯樣式（僅適用於 CSS 類型）
 * @param frameId 頭像框 ID
 * @returns CSS 樣式對象
 */
export function getAvatarFrameInlineStyle(
  frameId: string | null | undefined,
): Record<string, string> {
  const style = getAvatarFrameStyle(frameId);
  if (!style || style.type === "svg" || style.type === "image") return {};

  const result: Record<string, string> = {};
  if (style.border) result.border = style.border;
  if (style.borderRadius) result.borderRadius = style.borderRadius;
  if (style.boxShadow) result.boxShadow = style.boxShadow;
  if (style.animation) result.animation = style.animation;

  return result;
}

/**
 * 取得 SVG 頭像框（根據形狀）
 * @param frameId 頭像框 ID
 * @param shape 頭像形狀
 * @returns SVG 字串或 undefined
 */
export function getAvatarFrameSvg(
  frameId: string | null | undefined,
  shape: "circle" | "rounded" | "square" = "circle",
): string | undefined {
  const style = getAvatarFrameStyle(frameId);
  if (!style || style.type !== "svg" || !style.svgFrames) return undefined;
  return style.svgFrames[shape];
}

/**
 * 檢查頭像框是否為 SVG 類型
 * @param frameId 頭像框 ID
 * @returns 是否為 SVG 類型
 */
export function isAvatarFrameSvg(frameId: string | null | undefined): boolean {
  const style = getAvatarFrameStyle(frameId);
  return style?.type === "svg";
}

/**
 * 檢查頭像框是否為圖片圖層類型
 * @param frameId 頭像框 ID
 * @returns 是否為圖片圖層類型
 */
export function isAvatarFrameImage(
  frameId: string | null | undefined,
): boolean {
  const style = getAvatarFrameStyle(frameId);
  return style?.type === "image";
}

/**
 * 取得頭像框的圖層資料
 * @param frameId 頭像框 ID
 * @returns 圖層資料或 undefined
 */
export function getAvatarFrameLayers(
  frameId: string | null | undefined,
): AvatarFrameStyle["layers"] | undefined {
  const style = getAvatarFrameStyle(frameId);
  if (!style || style.type !== "image") return undefined;
  return style.layers;
}

/**
 * 生成圖層的 CSS transform 樣式
 * @param layer 圖層資料
 * @returns CSS transform 字串
 */
export function getLayerTransform(layer: FrameLayer): string {
  const transforms: string[] = [];
  if (layer.offset?.x || layer.offset?.y) {
    transforms.push(
      `translate(${layer.offset.x || 0}px, ${layer.offset.y || 0}px)`,
    );
  }
  if (layer.scale && layer.scale !== 100) {
    transforms.push(`scale(${layer.scale / 100})`);
  }
  if (layer.rotation) {
    transforms.push(`rotate(${layer.rotation}deg)`);
  }
  return transforms.join(" ");
}

/**
 * 取得圖層的可用 src（處理 SVG 字串轉換為 data URL）
 * @param layer 圖層資料
 * @returns 可用於 img src 的 URL
 */
export function getLayerSrc(layer: FrameLayer | undefined): string {
  if (!layer) return "";
  if (layer.type === "svg") {
    // 將 SVG 字串轉換為 data URL
    const encoded = encodeURIComponent(layer.content);
    return `data:image/svg+xml,${encoded}`;
  }
  // url 或 image (base64) 類型直接返回 content
  return layer.content;
}
