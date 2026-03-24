// Aguaphone Service Worker v6
// PWA + 系統推播通知 + 雲端推送支援
//
// 更新策略：
//   - 不在 install 時 skipWaiting，避免強制接管導致 IDB blocking
//   - 新 SW 安裝完成後通知頁面，由頁面決定何時 reload
//   - 頁面 reload 後 IDB 連線自然關閉，不會有 UnknownError

const CACHE_NAME = "aguaphone-v6";
const OLD_CACHES = [
  "aguaphone-v1",
  "aguaphone-v2",
  "aguaphone-v3",
  "aguaphone-v4",
  "aguaphone-v5",
];

// install：不 skipWaiting，等待頁面安全 reload 後再接管
self.addEventListener("install", () => {
  // 不呼叫 skipWaiting()，讓舊 SW 繼續服務直到頁面 reload
});

self.addEventListener("activate", (event) => {
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

// 新 SW 安裝完成後，通知所有 client 頁面有更新可用
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    // 頁面確認可以更新時才 skipWaiting
    self.skipWaiting();
  }

  // 主線程請求 SW 發送通知（後台時更可靠）
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, options } = event.data;
    event.waitUntil(
      self.registration.showNotification(title || "新訊息", options || {}),
    );
  }
});

// 雲端推送通知接收（Web Push）
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = { body: event.data?.text() || "" };
  }

  const isCloudPush = data.type === "cloud-push-message";
  const title = isCloudPush
    ? data.characterName || "角色訊息"
    : data.title || "新訊息";
  const body = isCloudPush ? data.content : data.body || "";
  const tag = isCloudPush
    ? `cloud-push-${data.characterId}-${data.timestamp}`
    : data.tag || `push-${Date.now()}`;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag,
      renotify: true,
      data: {
        type: data.type || "generic",
        characterId: data.characterId || null,
        navigateTo: data.characterId ? `/chat/${data.characterId}` : "/",
      },
    }),
  );
});

// 點擊通知時聚焦視窗
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.focus();
            client.postMessage({
              type: "notification-click",
              navigateTo: data.navigateTo,
              chatId: data.chatId,
            });
            return;
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow("/");
        }
      }),
  );
});

self.addEventListener("fetch", (event) => {
  if (!event.request.url.startsWith("http")) return;

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
