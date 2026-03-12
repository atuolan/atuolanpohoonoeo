import { db, DB_STORES, getDatabase } from "@/db/database";
import { isChatImageRef } from "@/db/operations";
import type { CachedImage, ImageCacheConfig } from "@/types/imageCache";
import { DEFAULT_IMAGE_CACHE_CONFIG } from "@/types/imageCache";
import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";

// ===== Store =====

export const useImageCacheStore = defineStore("imageCache", () => {
  // 狀態
  const isLoaded = ref(false);
  const isLoading = ref(false);
  const images = ref<CachedImage[]>([]);
  const config = ref<ImageCacheConfig>({ ...DEFAULT_IMAGE_CACHE_CONFIG });

  // ===== 計算屬性 =====

  /** 只計算非聊天圖片（頭像緩存） */
  const avatarImages = computed(() =>
    images.value.filter((img) => !isChatImageRef(img.id)),
  );

  /** 緩存數量（僅頭像緩存） */
  const count = computed(() => avatarImages.value.length);

  /** 是否已滿 */
  const isFull = computed(
    () => avatarImages.value.length >= config.value.maxCount,
  );

  /** 按最後使用時間排序的圖片列表（僅頭像緩存） */
  const sortedImages = computed(() =>
    [...avatarImages.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt),
  );

  // ===== 方法 =====

  /**
   * 從 IDB 載入圖片緩存（只載入 metadata，不載入完整 data）
   */
  async function loadImageCache(): Promise<void> {
    if (isLoading.value) return;

    isLoading.value = true;

    try {
      await db.init();

      // 使用 cursor 只載入 metadata，避免一次性載入所有完整 base64 data 導致 OOM
      const metadataList = await loadImageMetadataOnly();

      if (metadataList && metadataList.length > 0) {
        images.value = metadataList;
        console.log(
          `[ImageCache] 已載入 ${metadataList.length} 張圖片 metadata（含聊天圖片）`,
        );

        // 清理超出上限的頭像緩存圖片
        const avatars = images.value
          .filter((img) => !isChatImageRef(img.id))
          .sort((a, b) => a.lastUsedAt - b.lastUsedAt);

        if (avatars.length > config.value.maxCount) {
          const toRemove = avatars.slice(
            0,
            avatars.length - config.value.maxCount,
          );
          for (const img of toRemove) {
            const idx = images.value.findIndex((i) => i.id === img.id);
            if (idx !== -1) images.value.splice(idx, 1);
            await deleteImageFromDB(img.id);
          }
          console.log(
            `[ImageCache] 已清理 ${toRemove.length} 張超出上限的頭像緩存`,
          );
        }
      }

      isLoaded.value = true;
    } catch (e) {
      console.error("[ImageCache] 載入緩存失敗:", e);
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 使用 cursor 只載入圖片的 metadata（不含完整 data），大幅降低記憶體佔用
   */
  async function loadImageMetadataOnly(): Promise<CachedImage[]> {
    try {
      await db.init();
      const database = await getDatabase();
      const tx = database.transaction(DB_STORES.IMAGE_CACHE as any, "readonly");
      const store = tx.objectStore(DB_STORES.IMAGE_CACHE as any);
      const results: CachedImage[] = [];

      let cursor = await store.openCursor();
      while (cursor) {
        const record = cursor.value as CachedImage;
        // 只保留 metadata + thumbnail，不保留完整 data
        results.push({
          id: record.id,
          data: "", // 不載入完整 base64，需要時再按需讀取
          thumbnail: record.thumbnail || "",
          fileName: record.fileName,
          fileSize: record.fileSize,
          mimeType: record.mimeType,
          createdAt: record.createdAt,
          lastUsedAt: record.lastUsedAt,
          useCount: record.useCount,
        });
        cursor = await cursor.continue();
      }

      return results;
    } catch (e) {
      console.error("[ImageCache] loadImageMetadataOnly 失敗:", e);
      return [];
    }
  }

  /**
   * 按需從 IDB 讀取單張圖片的完整 data
   */
  async function getImageDataFromDB(id: string): Promise<string | null> {
    try {
      await db.init();
      const record = await db.get<CachedImage>(DB_STORES.IMAGE_CACHE, id);
      return record?.data || null;
    } catch (e) {
      console.error("[ImageCache] getImageDataFromDB 失敗:", e);
      return null;
    }
  }

  /**
   * 保存單張圖片到 IDB
   */
  async function saveImage(image: CachedImage): Promise<void> {
    try {
      await db.init();
      const plainImage = JSON.parse(JSON.stringify(toRaw(image)));
      await db.put(DB_STORES.IMAGE_CACHE, plainImage);
    } catch (e) {
      console.error("[ImageCache] 保存圖片失敗:", e);
      throw e;
    }
  }

  /**
   * 從 IDB 刪除圖片
   */
  async function deleteImageFromDB(id: string): Promise<void> {
    try {
      await db.init();
      await db.delete(DB_STORES.IMAGE_CACHE, id);
    } catch (e) {
      console.error("[ImageCache] 刪除圖片失敗:", e);
      throw e;
    }
  }

  /**
   * 生成縮圖
   */
  async function generateThumbnail(
    imageData: string,
    size: number = config.value.thumbnailSize,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("無法創建 canvas context"));
          return;
        }

        // 計算縮放比例，保持比例
        const scale = Math.min(size / img.width, size / img.height);
        const width = img.width * scale;
        const height = img.height * scale;

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = () => reject(new Error("圖片載入失敗"));
      img.src = imageData;
    });
  }

  /**
   * 添加圖片到緩存
   */
  async function addImage(
    data: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
  ): Promise<CachedImage> {
    // 檢查大小限制
    if (fileSize > config.value.maxImageSize) {
      throw new Error(
        `圖片大小超過限制 (${Math.round(config.value.maxImageSize / 1024 / 1024)}MB)`,
      );
    }

    // 檢查是否已存在相同圖片（比對檔案大小和前100字符）
    const dataPrefix = data.substring(0, 100);
    const existing = images.value.find(
      (img) => img.fileSize === fileSize && img.fileName === fileName,
    );
    if (existing) {
      // 更新使用時間和次數
      await useImage(existing.id);
      return existing;
    }

    // 如果緩存已滿，刪除最舊的
    if (avatarImages.value.length >= config.value.maxCount) {
      const oldest = [...avatarImages.value].sort(
        (a, b) => a.lastUsedAt - b.lastUsedAt,
      )[0];
      if (oldest) {
        await removeImage(oldest.id);
      }
    }

    // 生成縮圖
    const thumbnail = await generateThumbnail(data);

    // 創建新圖片記錄
    const newImage: CachedImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data,
      thumbnail,
      fileName,
      fileSize,
      mimeType,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
    };

    images.value.push(newImage);
    await saveImage(newImage);

    console.log(`[ImageCache] 已添加圖片: ${fileName}`);
    return newImage;
  }

  /**
   * 從圖片直連 URL 添加到緩存
   */
  async function addImageFromUrl(url: string): Promise<CachedImage> {
    // 檢查是否已存在相同 URL（透過 fileName 或 mimeType 判斷）
    const existing = images.value.find(
      (img) =>
        img.mimeType === "image/url" && img.fileName === url.split("/").pop(),
    );
    if (existing) {
      await useImage(existing.id);
      // 需要從 DB 讀取完整 data
      const fullData = await getImageDataFromDB(existing.id);
      if (fullData) {
        existing.data = fullData;
      }
      return existing;
    }

    // 如果緩存已滿，刪除最舊的
    if (avatarImages.value.length >= config.value.maxCount) {
      const oldest = [...avatarImages.value].sort(
        (a, b) => a.lastUsedAt - b.lastUsedAt,
      )[0];
      if (oldest) {
        await removeImage(oldest.id);
      }
    }

    // 從 URL 提取檔名
    let fileName = "外部圖片";
    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split("/");
      const last = segments[segments.length - 1];
      if (last && last.includes(".")) {
        fileName = decodeURIComponent(last);
      }
    } catch {
      // ignore
    }

    const newImage: CachedImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      data: url,
      thumbnail: url,
      fileName,
      fileSize: 0,
      mimeType: "image/url",
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
    };

    images.value.push(newImage);
    await saveImage(newImage);

    console.log(`[ImageCache] 已添加圖片 URL: ${url}`);
    return newImage;
  }

  /**
   * 從 File 對象添加圖片
   */
  async function addImageFromFile(file: File): Promise<CachedImage> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("請選擇圖片檔案"));
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = e.target?.result as string;
          const image = await addImage(data, file.name, file.size, file.type);
          resolve(image);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("讀取檔案失敗"));
      reader.readAsDataURL(file);
    });
  }

  /**
   * 使用圖片（更新使用時間和次數）
   */
  async function useImage(id: string): Promise<CachedImage | null> {
    const index = images.value.findIndex((img) => img.id === id);
    if (index === -1) return null;

    images.value[index].lastUsedAt = Date.now();
    images.value[index].useCount++;

    await saveImage(images.value[index]);
    return images.value[index];
  }

  /**
   * 獲取圖片數據
   */
  function getImage(id: string): CachedImage | undefined {
    return images.value.find((img) => img.id === id);
  }

  /**
   * 獲取圖片數據並標記使用（按需從 IDB 讀取完整 data）
   */
  async function getImageAndUse(id: string): Promise<string | null> {
    const image = await useImage(id);
    if (!image) return null;

    // 如果記憶體中已有完整 data，直接返回
    if (image.data && image.data.length > 0) {
      return image.data;
    }

    // 否則從 IDB 按需讀取
    const data = await getImageDataFromDB(id);
    return data;
  }

  /**
   * 刪除圖片
   */
  async function removeImage(id: string): Promise<boolean> {
    const index = images.value.findIndex((img) => img.id === id);
    if (index === -1) return false;

    images.value.splice(index, 1);
    await deleteImageFromDB(id);

    console.log(`[ImageCache] 已刪除圖片: ${id}`);
    return true;
  }

  /**
   * 清空所有緩存
   */
  async function clearAll(): Promise<void> {
    for (const img of images.value) {
      await deleteImageFromDB(img.id);
    }
    images.value = [];
    console.log("[ImageCache] 已清空所有緩存");
  }

  return {
    // 狀態
    isLoaded,
    isLoading,
    images,
    config,

    // 計算屬性
    count,
    isFull,
    sortedImages,
    avatarImages,

    // 方法
    loadImageCache,
    addImage,
    addImageFromFile,
    addImageFromUrl,
    useImage,
    getImage,
    getImageAndUse,
    getImageDataFromDB,
    removeImage,
    clearAll,
  };
});
