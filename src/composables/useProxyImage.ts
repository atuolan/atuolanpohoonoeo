import { ref, watch, type Ref } from "vue";

// 全域快取：避免重複處理同一 URL
const proxyCache = new Map<string, string>();

/**
 * 將外部圖片 URL 轉為本地代理 URL，繞過 CORS 和 CSP sandbox 限制
 */
export function proxyImageUrl(url: string): string {
  if (!url) return "";
  // data: 和 blob: URL 不需要代理
  if (url.startsWith("data:") || url.startsWith("blob:")) return url;
  // 同源 URL 不需要代理
  if (url.startsWith("/") || url.startsWith(window.location.origin)) return url;

  const cached = proxyCache.get(url);
  if (cached) return cached;

  const proxied = (() => {
    try {
      const parsed = new URL(url);
      const hostAndPath = parsed.host + parsed.pathname + parsed.search;
      if (parsed.protocol === "https:") {
        return `/ai-proxy/${hostAndPath}`;
      } else {
        return `/ai-proxy-http/${hostAndPath}`;
      }
    } catch {
      return `/image-proxy?url=${encodeURIComponent(url)}`;
    }
  })();
  proxyCache.set(url, proxied);
  return proxied;
}

/**
 * 響應式代理圖片 URL composable
 */
export function useProxyImage(src: Ref<string | undefined>) {
  const proxiedSrc = ref("");

  watch(
    src,
    (url) => {
      proxiedSrc.value = proxyImageUrl(url || "");
    },
    { immediate: true },
  );

  return { proxiedSrc };
}
