// Pixabay 圖片搜尋 API 客戶端
// 純函式模組，無 Vue 響應性依賴

/** Pixabay 搜尋結果中的單張圖片 */
export interface PixabayHit {
  id: number;
  previewURL: string; // 150px 縮圖
  webformatURL: string; // 640px 中圖
  largeImageURL: string; // 1280px 大圖
  tags: string; // 逗號分隔標籤
  user: string; // 作者名稱
  pageURL: string; // Pixabay 頁面連結
}

/** Pixabay API 原始回應 */
export interface PixabaySearchResponse {
  total: number;
  totalHits: number;
  hits: PixabayHit[];
}

/** 搜尋參數 */
export interface PixabaySearchParams {
  q: string; // 搜尋關鍵字
  page?: number; // 頁碼，預設 1
  perPage?: number; // 每頁數量，預設 20
  lang?: string; // 語言，預設 'zh'
  imageType?: string; // 圖片類型，預設 'photo'
}

/** 搜尋結果（含代理轉換後的 URL） */
export interface PixabaySearchResult {
  hits: Array<
    PixabayHit & {
      proxyPreviewURL: string; // 經 image-proxy 轉換的縮圖 URL
      proxyWebformatURL: string; // 經 image-proxy 轉換的中圖 URL
      proxyLargeImageURL: string; // 經 image-proxy 轉換的大圖 URL
    }
  >;
  total: number;
  totalHits: number;
}

// 硬編碼 API 金鑰（Pixabay 免費方案）
const PIXABAY_API_KEY = "55224924-5e1b99de2bfb4b44b0cdecaf8";
const PIXABAY_API_URL = "https://pixabay.com/api/";
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * 將任意 URL 轉換為 image-proxy 代理格式，以繞過 CORS 限制
 * 生產環境走 CF Worker（nai-proxy.aguacloud.uk），開發環境走本地 Vite middleware
 */
export function toImageProxyUrl(url: string): string {
  const base = import.meta.env.DEV ? "" : "https://nai-proxy.aguacloud.uk";
  return `${base}/image-proxy?url=${encodeURIComponent(url)}`;
}

/**
 * 向 Pixabay API 搜尋圖片
 * @throws 結構化錯誤物件，包含 status（HTTP 狀態碼）與 message
 */
export async function searchPixabay(
  params: PixabaySearchParams,
): Promise<PixabaySearchResult> {
  const {
    q,
    page = 1,
    perPage = 20,
    lang = "zh",
    imageType = "photo",
  } = params;

  // 建立查詢參數
  const searchParams = new URLSearchParams({
    key: PIXABAY_API_KEY,
    q,
    lang,
    image_type: imageType,
    per_page: String(perPage),
    page: String(page),
  });

  const url = `${PIXABAY_API_URL}?${searchParams.toString()}`;

  // 設定 10 秒逾時
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      // HTTP 錯誤：回傳結構化錯誤物件
      throw {
        status: response.status,
        message: `Pixabay API 錯誤：HTTP ${response.status}`,
      };
    }

    const data: PixabaySearchResponse = await response.json();

    // 將所有圖片 URL 轉換為代理 URL
    const hits = data.hits.map((hit) => ({
      ...hit,
      proxyPreviewURL: toImageProxyUrl(hit.previewURL),
      proxyWebformatURL: toImageProxyUrl(hit.webformatURL),
      proxyLargeImageURL: toImageProxyUrl(hit.largeImageURL),
    }));

    return {
      hits,
      total: data.total,
      totalHits: data.totalHits,
    };
  } catch (err: unknown) {
    // 若已是結構化錯誤（HTTP 錯誤），直接重新拋出
    if (err && typeof err === "object" && "status" in err) {
      throw err;
    }

    // 網路逾時或其他網路錯誤
    if (err instanceof DOMException && err.name === "AbortError") {
      throw { message: "Pixabay API 請求逾時（超過 10 秒）" };
    }

    throw {
      message: `Pixabay API 網路錯誤：${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
