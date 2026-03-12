// Aguaphone Service Worker v4
// PWA + 系統推播通知支援

const CACHE_NAME = "aguaphone-v4";
const OLD_CACHES = ["aguaphone-v1", "aguaphone-v2", "aguaphone-v3"];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // 清除舊快取並接管頁面
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((n) => OLD_CACHES.includes(n))
            .map((n) => caches.delete(n)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// 點擊通知時聚焦視窗，並傳遞導航資訊
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 如果已有視窗，聚焦它並傳遞導航資訊
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            // 通知主線程用戶點擊了通知
            client.postMessage({
              type: "notification-click",
              navigateTo: data.navigateTo,
              chatId: data.chatId,
            });
            return;
          }
        }
        // 否則開啟新視窗
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      }),
  );
});

self.addEventListener("fetch", (event) => {
  // 只處理 http/https，跳過 chrome-extension:// 等
  if (!event.request.url.startsWith("http")) {
    return;
  }

  // 跳過 AI 代理請求（SSE 串流不能被 SW 攔截快取，否則會導致 Load failed）
  const url = new URL(event.request.url);
  if (
    url.pathname.startsWith("/ai-proxy/") ||
    url.pathname.startsWith("/ai-proxy-http/") ||
    url.pathname.startsWith("/image-proxy")
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          event.request.method === "GET" &&
          response.status === 200 &&
          response.type === "basic"
        ) {
          try {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone).catch(() => {});
            });
          } catch {
            // 忽略快取錯誤
          }
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(
          (cached) =>
            cached ||
            new Response("Network error", {
              status: 503,
              statusText: "Service Unavailable",
            }),
        ),
      ),
  );
});
