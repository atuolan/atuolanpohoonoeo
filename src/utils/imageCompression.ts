/**
 * 圖片壓縮工具
 * 用於壓縮用戶上傳的圖片，減少存儲空間和 API 傳輸大小
 */

/** 圖片壓縮選項 */
export interface ImageCompressionOptions {
  /** JPEG 品質 (0-1)，預設 0.8 */
  quality?: number;
  /** 最大寬度（像素），預設 1024 */
  maxWidth?: number;
  /** 最大高度（像素），預設 1024 */
  maxHeight?: number;
  /** 輸出格式，預設 'image/jpeg' */
  outputFormat?: "image/jpeg" | "image/png" | "image/webp";
  /** 是否保留 GIF 動畫（不壓縮），預設 true */
  preserveGif?: boolean;
}

/** 壓縮預設配置 */
export const compressionPresets = {
  /** 頭像：小尺寸，高壓縮 */
  avatar: {
    quality: 0.8,
    maxWidth: 200,
    maxHeight: 200,
    outputFormat: "image/jpeg" as const,
  },
  /** 貼圖/表情包：中等尺寸 */
  sticker: {
    quality: 0.8,
    maxWidth: 400,
    maxHeight: 400,
    outputFormat: "image/png" as const,
  },
  /** 聊天圖片：較大尺寸，保持清晰度 */
  chatImage: {
    quality: 0.8,
    maxWidth: 1024,
    maxHeight: 1024,
    outputFormat: "image/jpeg" as const,
  },
  /** 背景/壁紙：大尺寸，支援橫向畫布 */
  wallpaper: {
    quality: 0.85,
    maxWidth: 2560,
    maxHeight: 1440,
    outputFormat: "image/jpeg" as const,
  },
  /** 角色卡圖片：中高畫質 */
  characterCard: {
    quality: 0.85,
    maxWidth: 800,
    maxHeight: 1200,
    outputFormat: "image/jpeg" as const,
  },
  /** AI Vision：適合 API 傳輸的尺寸 */
  vision: {
    quality: 0.85,
    maxWidth: 1024,
    maxHeight: 1024,
    outputFormat: "image/jpeg" as const,
  },
} as const;

/**
 * 壓縮圖片（使用 Canvas 縮放 + JPEG 壓縮）
 */
export async function compressImage(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<string> {
  const {
    quality = 0.8,
    maxWidth = 1024,
    maxHeight = 1024,
    outputFormat = "image/jpeg",
    preserveGif = true,
  } = options;

  // GIF 動圖不壓縮（會破壞動畫）
  if (preserveGif && file.type === "image/gif") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onerror = reject;

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onerror = reject;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 計算縮放後的尺寸（保持比例）
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round(height * (maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round(width * (maxHeight / height));
            height = maxHeight;
          }
        }

        // 如果圖片已經夠小，且不需要格式轉換，直接返回原始資料
        if (
          width === img.width &&
          height === img.height &&
          file.type === outputFormat
        ) {
          resolve(event.target?.result as string);
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("無法創建 Canvas 上下文"));
          return;
        }

        // PNG 透明圖片轉 JPEG：先填充白色背景
        if (file.type === "image/png" && outputFormat === "image/jpeg") {
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL(outputFormat, quality);
        resolve(compressedDataUrl);
      };
    };
  });
}

/**
 * 從 DataURL 提取 Base64 數據和 MIME 類型
 */
export function parseDataUrl(
  dataUrl: string,
): { base64: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return null;
}

/**
 * 格式化文件大小
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * 壓縮圖片並返回統計資訊
 */
export async function compressImageWithStats(
  file: File,
  options: ImageCompressionOptions = {},
): Promise<{
  dataUrl: string;
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  compressionRatio: number;
}> {
  const originalSize = file.size;
  const dataUrl = await compressImage(file, options);
  const parsed = parseDataUrl(dataUrl);

  if (!parsed) {
    throw new Error("壓縮後的圖片格式無效");
  }

  // Base64 編碼後大小 = 原始大小 × 4/3
  const compressedSize = Math.round((parsed.base64.length * 3) / 4);
  const savedBytes = originalSize - compressedSize;
  const compressionRatio =
    originalSize > 0
      ? parseFloat(((1 - compressedSize / originalSize) * 100).toFixed(2))
      : 0;

  return {
    dataUrl,
    base64: parsed.base64,
    mimeType: parsed.mimeType,
    originalSize,
    compressedSize,
    savedBytes,
    compressionRatio,
  };
}

/**
 * 從 URL 載入圖片並轉換為 Base64
 */
export async function urlToBase64(
  url: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // 使用自己的 Cloudflare Worker 代理避免跨域問題
    const fetchUrl = url.startsWith("http")
      ? `https://nai-proxy.aguacloud.uk/image-proxy?url=${encodeURIComponent(url)}`
      : url;

    const response = await fetch(fetchUrl);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const parsed = parseDataUrl(dataUrl);
        resolve(parsed);
      };
      reader.onerror = () => reject(new Error("FileReader failed"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
