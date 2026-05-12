import vue from "@vitejs/plugin-vue";
import http from "node:http";
import https from "node:https";
import { fileURLToPath, URL } from "node:url";
import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const IMAGE_PROXY_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64; rv:122.0) Gecko/20100101 Firefox/122.0",
];
const IMAGE_PROXY_ACCEPT =
  "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";
// 與 Cloudflare WAF Skip 規則配對的私密 header，讓自家代理繞過 Bot Fight / Custom Rules。
const IMAGE_PROXY_SECRET = "gkGHAmlzsZKuybu5yFrUWYvy9yBgKRaB";
function buildImageProxyHeaders(attempt: number): Record<string, string> {
  return {
    "User-Agent": IMAGE_PROXY_UAS[attempt % IMAGE_PROXY_UAS.length],
    Accept: IMAGE_PROXY_ACCEPT,
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "X-Aguaphone-Proxy": IMAGE_PROXY_SECRET,
  };
}

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

        const MAX_REDIRECTS = 5;
        const MAX_WAF_RETRIES = IMAGE_PROXY_UAS.length;
        const pipeImage = (
          currentUrl: string,
          redirects = 0,
          attempt = 0,
        ) => {
          const requestModule = currentUrl.startsWith("https") ? https : http;
          const proxyReq = requestModule.get(
            currentUrl,
            { headers: buildImageProxyHeaders(attempt) },
            (proxyRes) => {
              const statusCode = proxyRes.statusCode || 0;
              if (
                statusCode >= 300 &&
                statusCode < 400 &&
                proxyRes.headers.location &&
                redirects < MAX_REDIRECTS
              ) {
                const redirectUrl = proxyRes.headers.location.startsWith("http")
                  ? proxyRes.headers.location
                  : new URL(proxyRes.headers.location, currentUrl).href;
                proxyRes.resume();
                pipeImage(redirectUrl, redirects + 1, attempt);
                return;
              }
              const contentType = String(
                proxyRes.headers["content-type"] || "",
              );
              const wafBlock =
                statusCode >= 400 &&
                statusCode < 500 &&
                contentType.includes("text/html");
              if (wafBlock && attempt + 1 < MAX_WAF_RETRIES) {
                proxyRes.resume();
                pipeImage(targetUrl, 0, attempt + 1);
                return;
              }
              res.writeHead(statusCode || 200, {
                "Content-Type":
                  proxyRes.headers["content-type"] || "image/jpeg",
                "Cache-Control": "public, max-age=86400",
                "Access-Control-Allow-Origin": "*",
              });
              proxyRes.pipe(res);
            },
          );
          proxyReq.on("error", () => {
            res.writeHead(502);
            res.end("Proxy error");
          });
        };
        pipeImage(targetUrl);
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
  base: "/",
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // 讓編譯器把 <aguaphone-*> 視為原生自訂元素，
          // 不嘗試解析成 Vue 組件、也不發出 unknown element 警告。
          isCustomElement: (tag) => tag.startsWith("aguaphone-"),
        },
      },
    }),
    aiProxyPlugin(),
    // 只在 inline 模式下啟用單文件打包
    mode === "inline" ? viteSingleFile() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // ejs 預設入口 lib/ejs.js 在頂層 require('fs')，瀏覽器端會跳出
      // "Module 'node:fs' has been externalized" 警告。改用包內的 UMD 瀏覽器
      // 版（不含 fs/path 依賴），同時保持 render(template, data) API 相同。
      ejs: fileURLToPath(new URL("./node_modules/ejs/ejs.min.js", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: false,
    allowedHosts: [".ngrok-free.app"],
    hmr: {
      overlay: false, // 禁用錯誤覆蓋層
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
  preview: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: false,
    allowedHosts: [".ngrok-free.app"],
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
