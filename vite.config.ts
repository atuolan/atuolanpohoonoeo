import vue from "@vitejs/plugin-vue";
import http from "node:http";
import https from "node:https";
import { fileURLToPath, URL } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// AI API 動態代理插件（使用 Node.js 內建模組，無需額外依賴）
function aiProxyPlugin(): Plugin {
  return {
    name: "ai-proxy",
    configureServer(server) {
      // 圖片代理：繞過 CORS 和 CSP sandbox
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/image-proxy?url=")) return next();

        const encodedUrl = url.slice("/image-proxy?url=".length);
        let targetUrl: string;
        try {
          targetUrl = decodeURIComponent(encodedUrl);
        } catch {
          res.writeHead(400);
          res.end("Invalid URL");
          return;
        }

        const requestModule = targetUrl.startsWith("https") ? https : http;
        const proxyReq = requestModule.get(targetUrl, (proxyRes) => {
          // 跟隨重定向
          if (
            proxyRes.statusCode &&
            proxyRes.statusCode >= 300 &&
            proxyRes.statusCode < 400 &&
            proxyRes.headers.location
          ) {
            const redirectUrl = proxyRes.headers.location.startsWith("http")
              ? proxyRes.headers.location
              : new URL(proxyRes.headers.location, targetUrl).href;
            const redirectModule = redirectUrl.startsWith("https")
              ? https
              : http;
            redirectModule
              .get(redirectUrl, (finalRes) => {
                res.writeHead(finalRes.statusCode || 200, {
                  "Content-Type":
                    finalRes.headers["content-type"] || "image/jpeg",
                  "Cache-Control": "public, max-age=86400",
                  "Access-Control-Allow-Origin": "*",
                });
                finalRes.pipe(res);
              })
              .on("error", () => {
                res.writeHead(502);
                res.end("Redirect proxy error");
              });
            return;
          }
          res.writeHead(proxyRes.statusCode || 200, {
            "Content-Type": proxyRes.headers["content-type"] || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
          });
          proxyRes.pipe(res);
        });
        proxyReq.on("error", () => {
          res.writeHead(502);
          res.end("Proxy error");
        });
      });

      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        let protocol: string;
        let prefix: string;

        if (url.startsWith("/ai-proxy-http/")) {
          protocol = "http";
          prefix = "/ai-proxy-http/";
        } else if (url.startsWith("/ai-proxy/")) {
          protocol = "https";
          prefix = "/ai-proxy/";
        } else {
          return next();
        }

        const stripped = url.slice(prefix.length);
        const slashIndex = stripped.indexOf("/");
        const host =
          slashIndex >= 0 ? stripped.substring(0, slashIndex) : stripped;
        const path = slashIndex >= 0 ? stripped.substring(slashIndex) : "/";

        // 複製原始請求的 headers，移除 host 相關的
        const headers: Record<string, string | string[] | undefined> = {
          ...req.headers,
        };
        delete headers.host;
        headers.host = host;

        const requestModule = protocol === "https" ? https : http;
        const proxyReq = requestModule.request(
          {
            hostname: host,
            path: path,
            method: req.method,
            headers: headers,
          },
          (proxyRes) => {
            // 轉發狀態碼和 headers
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on("error", (err) => {
          console.error(
            `[ai-proxy] Error proxying to ${protocol}://${host}${path}:`,
            err.message,
          );
          if (!res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
          }
        });

        // 轉發請求 body
        req.pipe(proxyReq);
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    vue(),
    aiProxyPlugin(),
    // 只在 inline 模式下啟用單文件打包
    mode === "inline" ? viteSingleFile() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      overlay: false, // 禁用錯誤覆蓋層
      // 明確設定 HMR WebSocket 端口，避免 undefined
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
      clientPort: 5173,
    },
    proxy: {
      // 音樂 API 代理
      "/api/music/qjqq": {
        target: "https://meting.qjqq.cn",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/music\/qjqq/, "/api.php"),
        secure: false,
      },
      "/api/music/vkeys": {
        target: "https://api.vkeys.cn",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/music\/vkeys/, ""),
        secure: false,
      },
      // 天氣 API 代理（開發環境繞過 CORS）
      "/api/weather": {
        target: "https://api.weatherapi.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, ""),
        secure: false,
      },
      // IP 定位代理（開發環境繞過 CORS）
      "/api/ipwho": {
        target: "https://ipwho.is",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ipwho/, ""),
        secure: false,
      },
      "/api/ipapi": {
        target: "https://ipapi.co",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ipapi/, ""),
        secure: false,
      },
      "/api/ip-api": {
        target: "http://ip-api.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ip-api/, ""),
        secure: false,
      },
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler",
        silenceDeprecations: ["import", "legacy-js-api"],
      },
    },
  },
}));
