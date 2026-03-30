// Pixabay 搜尋服務
// 封裝防抖（300ms）與 LRU 快取（容量 5）邏輯

import type {
  PixabaySearchParams,
  PixabaySearchResult,
} from "@/api/PixabayApi";
import { searchPixabay } from "@/api/PixabayApi";
import { LRUCache } from "@/utils/lruCache";

export class PixabaySearchService {
  private cache: LRUCache<string, PixabaySearchResult>;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingResolve: ((result: PixabaySearchResult) => void) | null = null;
  private pendingReject: ((err: unknown) => void) | null = null;

  constructor() {
    // 快取容量 5 筆
    this.cache = new LRUCache<string, PixabaySearchResult>(5);
  }

  /**
   * 建立快取 key
   * 格式：${q}:${page}:${perPage}:${lang}
   */
  private buildCacheKey(params: PixabaySearchParams): string {
    const { q, page = 1, perPage = 20, lang = "zh" } = params;
    return `${q}:${page}:${perPage}:${lang}`;
  }

  /**
   * 帶防抖的搜尋（300ms）
   * 連續呼叫時，只有最後一次會實際發送 API 請求
   */
  search(params: PixabaySearchParams): Promise<PixabaySearchResult> {
    // 取消上一個待執行的防抖（拒絕舊的 Promise）
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
      if (this.pendingReject) {
        this.pendingReject({ message: "搜尋已取消" });
        this.pendingReject = null;
        this.pendingResolve = null;
      }
    }

    return new Promise<PixabaySearchResult>((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null;
        const currentResolve = this.pendingResolve;
        const currentReject = this.pendingReject;
        this.pendingResolve = null;
        this.pendingReject = null;

        try {
          const result = await this.searchImmediate(params);
          currentResolve?.(result);
        } catch (err) {
          currentReject?.(err);
        }
      }, 300);
    });
  }

  /**
   * 不帶防抖的直接搜尋（供 AI 遞補鏈使用）
   * 先檢查快取，快取未命中才呼叫 API
   */
  async searchImmediate(
    params: PixabaySearchParams,
  ): Promise<PixabaySearchResult> {
    const key = this.buildCacheKey(params);

    // 快取命中：直接回傳
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    // 快取未命中：呼叫 API 並存入快取
    const result = await searchPixabay(params);
    this.cache.set(key, result);
    return result;
  }

  /**
   * 清除 LRU 快取
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 取消待執行的防抖搜尋
   * 以 { message: '搜尋已取消' } 拒絕待執行的 Promise
   */
  cancelPending(): void {
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.pendingReject) {
      this.pendingReject({ message: "搜尋已取消" });
      this.pendingReject = null;
      this.pendingResolve = null;
    }
  }
}
