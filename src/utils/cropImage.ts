/**
 * 按百分比裁剪圖片（座標 0–100），返回正方形 JPEG dataURL
 * 參考 OVO-main 的 cropImageByPercent 實作
 */
export function cropImageByPercent(
  imageUrl: string,
  x1Pct: number,
  y1Pct: number,
  x2Pct: number,
  y2Pct: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const clamp = (v: number) => Math.max(0, Math.min(100, v));
      const x1 = Math.round((w * clamp(x1Pct)) / 100);
      const y1 = Math.round((h * clamp(y1Pct)) / 100);
      const x2 = Math.round((w * clamp(x2Pct)) / 100);
      const y2 = Math.round((h * clamp(y2Pct)) / 100);
      const sw = Math.max(1, x2 - x1);
      const sh = Math.max(1, y2 - y1);
      // 取裁切區域的中心正方形，避免拉伸變形
      const side = Math.min(sw, sh);
      const offsetX = Math.round((sw - side) / 2);
      const offsetY = Math.round((sh - side) / 2);
      const size = Math.max(side, 64);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, x1 + offsetX, y1 + offsetY, side, side, 0, 0, size, size);
      try {
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("圖片載入失敗"));
    img.src = imageUrl;
  });
}
