/**
 * 圖片緩存類型定義
 */

/** 緩存的圖片項目 */
export interface CachedImage {
  /** 唯一識別碼 */
  id: string;
  /** 圖片數據（base64） */
  data: string;
  /** 縮圖數據（base64，用於列表顯示） */
  thumbnail: string;
  /** 原始檔名 */
  fileName: string;
  /** 檔案大小（bytes） */
  fileSize: number;
  /** MIME 類型 */
  mimeType: string;
  /** 創建時間 */
  createdAt: number;
  /** 最後使用時間 */
  lastUsedAt: number;
  /** 使用次數 */
  useCount: number;
}

/** 圖片緩存設定 */
export interface ImageCacheConfig {
  /** 最大緩存數量 */
  maxCount: number;
  /** 最大單張圖片大小（bytes） */
  maxImageSize: number;
  /** 縮圖尺寸 */
  thumbnailSize: number;
}

/** 預設緩存設定 */
export const DEFAULT_IMAGE_CACHE_CONFIG: ImageCacheConfig = {
  maxCount: 10,
  maxImageSize: 5 * 1024 * 1024, // 5MB
  thumbnailSize: 100,
};
