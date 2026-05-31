// 代碼保護工具
// 防止未授權使用和內容盜取

import { AuthService } from "@/services/AuthService";
import { recordReloadReason } from "@/utils/runtimeDiagnostics";

export class CodeProtection {
  private static isInitialized = false;

  // 初始化保護機制
  static initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. 防止 iframe 嵌入
    this.preventIframeEmbedding();

    // 2. 定期驗證授權狀態
    this.startAuthCheck();
  }

  // 防止 iframe 嵌入
  private static preventIframeEmbedding() {
    if (window.self !== window.top) {
      // 如果在 iframe 中，跳轉到頂層
      window.top!.location.href = window.self.location.href;
    }
  }

  // 定期檢查授權狀態
  private static authFailCount = 0;
  private static readonly AUTH_FAIL_THRESHOLD = 10; // 連續失敗 10 次才刷新（避免 IndexedDB 暫時不可用誤殺）
  private static lastReloadAt = 0;
  private static readonly RELOAD_COOLDOWN_MS = 30 * 60 * 1000; // 30 分鐘冷卻，避免反覆重整

  private static startAuthCheck() {
    setInterval(async () => {
      try {
        const isAuthed = await AuthService.isAuthenticated();
        if (!isAuthed) {
          this.authFailCount++;
          console.warn(
            `[CodeProtection] 授權檢查失敗 (${this.authFailCount}/${this.AUTH_FAIL_THRESHOLD})`,
          );
          // 連續多次失敗才刷新，避免 IndexedDB 暫時不可用導致誤殺
          if (this.authFailCount >= this.AUTH_FAIL_THRESHOLD) {
            const now = Date.now();
            const inCooldown = now - this.lastReloadAt < this.RELOAD_COOLDOWN_MS;
            const pageVisible = document.visibilityState === "visible";

            if (!inCooldown && pageVisible) {
              this.lastReloadAt = now;
              console.warn("[CodeProtection] 授權持續失敗，準備重整頁面");
              recordReloadReason("CodeProtection.startAuthCheck", "Repeated auth check failures triggered page reload", {
                authFailCount: this.authFailCount,
                threshold: this.AUTH_FAIL_THRESHOLD,
              });
              window.location.reload();
            } else {
              console.warn(
                `[CodeProtection] 已達刷新門檻，但目前${
                  inCooldown ? "在冷卻期內" : "頁面不可見"
                }，暫不重整`,
              );
            }
          }
        } else {
          // 成功時重置計數器
          this.authFailCount = 0;
        }
      } catch {
        // IndexedDB 讀取失敗時不刷新，避免誤殺
        // 同時不增加失敗計數，因為這是 IndexedDB 層面的問題而非授權問題
        console.warn("[CodeProtection] 授權檢查異常，跳過本次檢查");
      }
    }, 60000); // 每 60 秒檢查一次（降低頻率，減少 IndexedDB 暫時不可用時的誤判）
  }

  // 清除所有數據（登出時調用）
  static clearAllData() {
    // 清除 localStorage
    localStorage.clear();

    // 清除 sessionStorage
    sessionStorage.clear();

    // 清除 IndexedDB
    indexedDB.databases().then((dbs) => {
      dbs.forEach((db) => {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      });
    });

    // 清除 cookies
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
  }

  // 添加水印（顯示用戶信息）
  static addWatermark(username: string) {
    const watermark = document.createElement("div");
    watermark.id = "auth-watermark";
    watermark.textContent = `授權用戶：${username}`;
    watermark.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      font-size: 10px;
      color: rgba(0, 0, 0, 0.1);
      pointer-events: none;
      user-select: none;
      z-index: 999999;
    `;
    document.body.appendChild(watermark);
  }

  // 移除水印
  static removeWatermark() {
    const watermark = document.getElementById("auth-watermark");
    if (watermark) {
      watermark.remove();
    }
  }
}

// 在生產環境自動啟用保護
if (import.meta.env.PROD) {
  CodeProtection.initialize();
}
