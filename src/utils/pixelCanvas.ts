/**
 * 把像素圖畫到 canvas 上（色票的 $鍵名 由 colors 給）；有對應圖檔就畫圖檔
 */
import { PIXEL_ART_IMAGES } from "@/data/pixelArt/pixelArtImages";
import type { PixelArt } from "@/data/pixelArt/types";

const imageCache = new Map<string, HTMLImageElement | "loading" | "failed">();

/** 圖檔載好了才回傳；第一次會開始載，載完呼叫 onLoad 讓畫面重畫 */
export function artImage(artId: string | undefined, onLoad?: () => void): HTMLImageElement | null {
  if (!artId) return null;
  const src = PIXEL_ART_IMAGES[artId];
  if (!src || typeof Image === "undefined") return null;
  const cached = imageCache.get(src);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached) return null;
  imageCache.set(src, "loading");
  const img = new Image();
  img.onload = () => {
    imageCache.set(src, img);
    onLoad?.();
  };
  img.onerror = () => imageCache.set(src, "failed");
  img.src = src;
  return null;
}

export function resolveColor(value: string, colors: Record<string, string>): string | null {
  if (!value) return null;
  if (value.startsWith("$")) return colors[value.slice(1)] ?? null;
  return value;
}

export function drawPixelArt(
  ctx: CanvasRenderingContext2D,
  art: PixelArt,
  x: number,
  y: number,
  options: { colors?: Record<string, string>; artId?: string; onImageLoad?: () => void; flipX?: boolean } = {},
): void {
  const img = artImage(options.artId, options.onImageLoad);
  if (img) {
    ctx.drawImage(img, x, y, art.w, art.h);
    return;
  }
  const colors = options.colors ?? {};
  for (let row = 0; row < art.h; row++) {
    const line = art.rows[row] ?? "";
    for (let col = 0; col < art.w; col++) {
      const ch = line[col];
      if (!ch || ch === ".") continue;
      const color = resolveColor(art.palette[ch] ?? "", colors);
      if (!color) continue;
      ctx.fillStyle = color;
      const cx = options.flipX ? x + art.w - 1 - col : x + col;
      ctx.fillRect(cx, y + row, 1, 1);
    }
  }
}
