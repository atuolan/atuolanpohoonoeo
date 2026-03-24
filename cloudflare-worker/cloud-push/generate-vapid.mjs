/**
 * 產生 VAPID 金鑰對（Web Push 用）
 * 執行: node generate-vapid.mjs
 *
 * 輸出：
 * - publicKey: Base64URL 編碼，放到 wrangler.jsonc 的 VAPID_PUBLIC_KEY 和前端 CloudPushService.ts
 * - privateKey: Base64URL 編碼，用 wrangler secret put VAPID_PRIVATE_KEY 設定
 */

const crypto = globalThis.crypto || (await import("node:crypto")).webcrypto;

const keyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

// 匯出為 raw 格式（公鑰 65 bytes uncompressed）
const publicKeyRaw = new Uint8Array(
  await crypto.subtle.exportKey("raw", keyPair.publicKey),
);

// 匯出為 PKCS8 格式（私鑰）
const privateKeyPkcs8 = new Uint8Array(
  await crypto.subtle.exportKey("pkcs8", keyPair.privateKey),
);

// Base64URL 編碼
function toBase64Url(bytes) {
  const binary = Array.from(bytes)
    .map((b) => String.fromCharCode(b))
    .join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const publicKeyB64 = toBase64Url(publicKeyRaw);
const privateKeyB64 = toBase64Url(privateKeyPkcs8);

console.log("=== VAPID 金鑰對 ===\n");
console.log("📢 Public Key (放到 wrangler.jsonc VAPID_PUBLIC_KEY + 前端 CloudPushService.ts):");
console.log(publicKeyB64);
console.log("\n🔒 Private Key (用 wrangler secret put VAPID_PRIVATE_KEY 設定):");
console.log(privateKeyB64);
console.log("\n=== 設定步驟 ===");
console.log("1. 複製 Public Key，更新 wrangler.jsonc 的 VAPID_PUBLIC_KEY");
console.log("2. 複製 Public Key，更新 src/services/CloudPushService.ts 的 VAPID_PUBLIC_KEY");
console.log("3. 在 cloudflare-worker/cloud-push 目錄執行:");
console.log("   npx wrangler secret put VAPID_PRIVATE_KEY");
console.log("   然後貼上 Private Key 按 Enter");
console.log("4. 重新部署 Worker: npx wrangler deploy");
console.log("5. 前端重新 build + 部署");
console.log("6. 在設定頁重新「同步 API 設定到雲端」（會重新訂閱 Web Push）");
