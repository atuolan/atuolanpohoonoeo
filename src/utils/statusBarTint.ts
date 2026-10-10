/**
 * iOS 26+/27 主畫面 PWA 狀態列霧化修正
 *
 * 現象：apple-mobile-web-app-status-bar-style=black-translucent 時，
 * iOS 會在狀態列下方疊一層 Liquid Glass 模糊；若頁面頂端取樣不到「實心底色」，
 * 就會退回預設的白霧（深色畫面也一樣白）。iOS 27 起 theme-color 也被忽略。
 *
 * 據社群回報，iOS 只讀「真實元素」的 background-color（不讀漸層、偽元素、body 背景），
 * 且元素需 position: fixed、貼齊頂端、夠寬夠高。
 *
 * 解法：在頂部放一條固定的實心色條，顏色從狀態列下方實際看到的圖層即時推算，
 * 讓 iOS 取樣到正確顏色，不用每個畫面各自宣告。
 * 個別畫面可在元素上加 data-status-bar-color="#xxxxxx" 直接指定。
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const OPAQUE = 0.995;

/** 解析 getComputedStyle 回傳的顏色（rgb/rgba，含逗號與空白語法）與 #hex */
export function parseCssColor(input: string | null | undefined): Rgba | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  const hex = s.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
    };
  }

  const fn = s.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const channel = (v: string) =>
      v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v);
    const alpha = (v: string | undefined) =>
      v === undefined ? 1 : v.endsWith("%") ? parseFloat(v) / 100 : parseFloat(v);
    const c = {
      r: channel(parts[0]),
      g: channel(parts[1]),
      b: channel(parts[2]),
      a: alpha(parts[3]),
    };
    if ([c.r, c.g, c.b, c.a].some((n) => Number.isNaN(n))) return null;
    return c;
  }

  return null;
}

/** 取漸層字串中的第一個色標（線性漸層由上往下時即為頂端顏色） */
export function firstGradientColor(gradient: string): Rgba | null {
  const m = gradient.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/i);
  return m ? parseCssColor(m[0]) : null;
}

/**
 * 由上而下合成圖層（layers[0] 在最上面），遇到不透明即停止。
 * 剩餘透明度疊在 base 上。
 */
export function compositeLayers(layers: Rgba[], base: Rgba): Rgba {
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (const l of layers) {
    if (l.a <= 0) continue;
    const w = l.a * (1 - a);
    r += l.r * w;
    g += l.g * w;
    b += l.b * w;
    a += w;
    if (a >= OPAQUE) break;
  }
  const rest = 1 - a;
  return {
    r: Math.round(r + base.r * rest),
    g: Math.round(g + base.g * rest),
    b: Math.round(b + base.b * rest),
    a: 1,
  };
}

/**
 * background-size: cover + 置中時，元素頂端 topPx 高度對應到圖片的哪幾列（比例 0~1）
 */
export function coverTopRange(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  topPx: number,
): { start: number; end: number } {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return { start: 0, end: 0.05 };
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const visibleH = boxH / scale;
  const start = (imgH - visibleH) / 2 / imgH;
  const end = start + Math.max(topPx, 4) / scale / imgH;
  return { start: Math.max(0, start), end: Math.min(1, Math.max(end, start + 0.01)) };
}

export function toCss(c: Rgba): string {
  return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

// ===== 圖片取樣（桌布、聊天背景） =====

interface ImageSample {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const imageCache = new Map<string, ImageSample | null | "pending">();
const IMAGE_CACHE_LIMIT = 20;
const SAMPLE_WIDTH = 32;

function loadImageSample(url: string, onReady: () => void): void {
  if (imageCache.size >= IMAGE_CACHE_LIMIT) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  imageCache.set(url, "pending");

  const img = new Image();
  if (/^https?:/i.test(url) && !url.startsWith(location.origin)) {
    img.crossOrigin = "anonymous";
  }
  img.onload = () => {
    try {
      const w = SAMPLE_WIDTH;
      const h = Math.max(1, Math.min(256, Math.round((img.naturalHeight / img.naturalWidth) * w)));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no 2d context");
      ctx.drawImage(img, 0, 0, w, h);
      imageCache.set(url, {
        width: img.naturalWidth,
        height: img.naturalHeight,
        data: ctx.getImageData(0, 0, w, h).data,
      });
    } catch {
      // 跨域圖片無法讀取像素
      imageCache.set(url, null);
    }
    onReady();
  };
  img.onerror = () => {
    imageCache.set(url, null);
    onReady();
  };
  img.src = url;
}

function averageRows(sample: ImageSample, start: number, end: number): Rgba {
  const w = SAMPLE_WIDTH;
  const h = sample.data.length / 4 / w;
  const y0 = Math.min(h - 1, Math.floor(start * h));
  const y1 = Math.min(h, Math.max(y0 + 1, Math.ceil(end * h)));
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const pa = sample.data[i + 3] / 255;
      r += sample.data[i] * pa;
      g += sample.data[i + 1] * pa;
      b += sample.data[i + 2] * pa;
      a += pa;
    }
  }
  const n = (y1 - y0) * w;
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: r / a, g: g / a, b: b / a, a: a / n };
}

// ===== DOM 取樣 =====

function imageLayer(
  url: string,
  rect: DOMRect,
  cover: boolean,
  topPx: number,
  onReady: () => void,
): Rgba | null {
  const cached = imageCache.get(url);
  if (cached === undefined) {
    loadImageSample(url, onReady);
    return null;
  }
  if (!cached || cached === "pending") return null;
  const range = cover
    ? coverTopRange(cached.width, cached.height, rect.width, rect.height, topPx - rect.top)
    : { start: 0, end: Math.min(1, Math.max(topPx, 4) / Math.max(rect.height, 1)) };
  return averageRows(cached, range.start, range.end);
}

/** 單一元素在取樣點貢獻的圖層（由上而下） */
function elementLayers(el: Element, topPx: number, onReady: () => void): Rgba[] {
  const override = el.getAttribute("data-status-bar-color");
  if (override) {
    const c = parseCssColor(override);
    if (c) return [c];
  }

  const cs = getComputedStyle(el);
  const opacity = parseFloat(cs.opacity);
  const fade = (c: Rgba | null): Rgba | null =>
    c ? { ...c, a: c.a * (Number.isNaN(opacity) ? 1 : opacity) } : null;
  const layers: Rgba[] = [];

  if (el instanceof HTMLImageElement && el.currentSrc) {
    const c = fade(
      imageLayer(el.currentSrc, el.getBoundingClientRect(), cs.objectFit === "cover", topPx, onReady),
    );
    if (c) layers.push(c);
  }
  // video / canvas 無法便宜地讀像素，交給下方圖層

  const bgImage = cs.backgroundImage;
  if (bgImage && bgImage !== "none") {
    const url = bgImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    // 只看最上層：url 出現在第一個漸層之前才算圖片在上
    const gradIdx = bgImage.search(/gradient\(/i);
    const urlIdx = bgImage.indexOf("url(");
    if (url && (gradIdx === -1 || urlIdx < gradIdx)) {
      const c = fade(
        imageLayer(url, el.getBoundingClientRect(), cs.backgroundSize === "cover", topPx, onReady),
      );
      if (c) layers.push(c);
    } else if (gradIdx !== -1) {
      const c = fade(firstGradientColor(bgImage));
      if (c) layers.push(c);
    }
  }

  const bg = fade(parseCssColor(cs.backgroundColor));
  if (bg && bg.a > 0) layers.push(bg);
  return layers;
}

const CHILD_SCAN_LIMIT = 40;
const CHILD_SCAN_DEPTH = 3;

/**
 * elementsFromPoint 會略過 pointer-events: none 的元素，
 * 但桌布、聊天背景這類背景層常設成 pointer-events: none（如 .wallpaper-layer）。
 * 這裡補抓 el 底下蓋住取樣點的 pointer-events: none 子孫，
 * 視為畫在 el 背景之上、可點擊內容之下（後面的兄弟元素在上）。
 */
function pointerlessChildLayers(
  el: Element,
  x: number,
  y: number,
  strip: Element,
  topPx: number,
  onReady: () => void,
  depth = 0,
): Rgba[] {
  if (depth >= CHILD_SCAN_DEPTH) return [];
  const layers: Rgba[] = [];
  const children = Array.from(el.children).slice(0, CHILD_SCAN_LIMIT).reverse();
  for (const child of children) {
    if (child === strip) continue;
    const cs = getComputedStyle(child);
    if (cs.pointerEvents !== "none" || cs.visibility === "hidden" || cs.display === "none") {
      continue;
    }
    const rect = child.getBoundingClientRect();
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue;
    layers.push(...pointerlessChildLayers(child, x, y, strip, topPx, onReady, depth + 1));
    layers.push(...elementLayers(child, topPx, onReady));
  }
  return layers;
}

export function sampleTopColor(strip: Element, topPx: number, onReady: () => void): string {
  const x = window.innerWidth / 2;
  const y = Math.max(1, Math.min(topPx - 1, 2));
  const stack = document.elementsFromPoint(x, y).filter((el) => el !== strip);

  const layers: Rgba[] = [];
  for (const el of stack) {
    const ls = [
      ...pointerlessChildLayers(el, x, y, strip, topPx, onReady),
      ...elementLayers(el, topPx, onReady),
    ];
    layers.push(...ls);
    if (ls.some((l) => l.a >= OPAQUE)) break;
  }
  return toCss(compositeLayers(layers, { r: 255, g: 255, b: 255, a: 1 }));
}

// ===== 初始化 =====

function isIOSStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone =
    nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return standalone && isIOS;
}

export function initStatusBarTint(): void {
  if (!isIOSStandalone()) return;

  const strip = document.createElement("div");
  strip.id = "status-bar-tint";
  strip.setAttribute("aria-hidden", "true");
  strip.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    "right:0",
    "height:var(--safe-top, env(safe-area-inset-top, 0px))",
    "pointer-events:none",
    "z-index:2147483647",
    "transition:background-color 0.2s ease",
  ].join(";");
  document.body.appendChild(strip);

  let current = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = () => {
    timer = null;
    const topPx = strip.getBoundingClientRect().height;
    if (topPx <= 0) return;
    const color = sampleTopColor(strip, topPx, schedule);
    if (color !== current) {
      current = color;
      strip.style.backgroundColor = color;
    }
  };

  // 節流：變動密集時（串流訊息）最多每 200ms 取樣一次
  function schedule() {
    if (timer) return;
    timer = setTimeout(run, 200);
  }

  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "data-status-bar-color"],
  });
  // 頁面切換動畫結束後再取一次，避免停在淡入中途的顏色
  document.addEventListener("transitionend", schedule, true);
  document.addEventListener("animationend", schedule, true);
  window.addEventListener("resize", schedule);
  document.addEventListener("visibilitychange", schedule);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", schedule);

  requestAnimationFrame(run);
  console.log("[statusBarTint] iOS standalone：已啟用頂部取色條");
}
