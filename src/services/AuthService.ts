// 驗證服務
import { db, DB_STORES } from "@/db/database";
import type { AuthState, VerificationResponse } from "@/types/auth";
import { DeviceFingerprintCollector } from "@/utils/deviceFingerprint";

const AUTH_RECORD_ID = "current_auth";
const SESSION_DURATION = 14 * 24 * 60 * 60 * 1000; // 14天
const SESSION_RENEW_THRESHOLD = 2 * 24 * 60 * 60 * 1000; // 剩餘 2 天內自動續期
// 驗證 API 端點：本地開發走相對路徑，生產環境一律走 VPS 絕對路徑
// （GitHub Pages 是純靜態，無法代理 /api/ 到 Discord bot）
const API_ENDPOINT = (() => {
  if (typeof window === "undefined") return "/api";
  const host = window.location.hostname;
  // 本地開發時走相對路徑（Vite dev server 可以代理）
  if (host === "localhost" || host === "127.0.0.1") {
    return "/api";
  }
  // 生產環境一律走 VPS 絕對路徑（不管是 GitHub Pages 還是自有服務器）
  return "https://api-203.aguacloud.uk/api";
})();
const LEGACY_AUTH_KEY = "aguaphone_auth"; // 舊版 localStorage key（遷移用）
const BACKUP_AUTH_KEY = "aguaphone_auth_backup_v2"; // 新版 localStorage 備援
const AUTH_ENCRYPTION_KEY = "aguaphone_secret_key_2026";

type AuthRecord = AuthState & { id: string };

export class AuthService {
  // 驗證 TOTP 碼（通過 API）
  static async verifyTOTP(code: string): Promise<VerificationResponse> {
    try {
      // 收集設備指紋
      const deviceInfo = await DeviceFingerprintCollector.generate();

      // 發送驗證請求到 Discord bot API
      const response = await fetch(`${API_ENDPOINT}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          deviceInfo: {
            fingerprint: deviceInfo.fingerprint,
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            screen: deviceInfo.screen,
            timezone: deviceInfo.timezone,
            language: deviceInfo.language,
            ip: "Client-side", // IP 由服務器端獲取
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          message: error.message || "驗證失敗",
        };
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error("驗證請求錯誤:", error);
      return {
        success: false,
        message: "無法連接到驗證服務器，請確保 Discord bot 正在運行",
      };
    }
  }

  // 保存驗證狀態到 IndexedDB + localStorage 備援
  static async saveAuthState(
    userId: string,
    username: string,
    displayName: string,
  ): Promise<void> {
    const now = Date.now();
    const authState: AuthRecord = {
      id: AUTH_RECORD_ID,
      isAuthenticated: true,
      discordUserId: userId,
      discordUsername: username,
      discordDisplayName: displayName,
      authenticatedAt: now,
      expiresAt: now + SESSION_DURATION,
    };

    // 先寫備援，確保 IDB 寫入失敗時仍可恢復
    this.saveBackupAuthState(authState);

    // 主存儲：IndexedDB（失敗時不阻斷流程，避免強制重新驗證）
    try {
      await db.put(DB_STORES.AUTH_STATE, authState);
    } catch (e) {
      console.warn(
        "[Auth] 保存 IndexedDB 驗證狀態失敗，已保留 localStorage 備援:",
        e,
      );
    }
  }

  // 從 IndexedDB 獲取驗證狀態（含備援與續期）
  // 策略：先快速讀 localStorage 備援，若有效立即返回（避免 IDB blocking 時 hang 住）
  // 同時在背景嘗試 IDB，若 IDB 有更新的資料則回寫備援
  static async getAuthState(): Promise<AuthState | null> {
    // 1. 先嘗試 localStorage 備援（幾乎即時，不受 IDB 狀態影響）
    const localBackup = await this.restoreFromLocalBackup(false);

    // 2. 用帶超時的方式嘗試 IDB（避免 blocking 時 hang 住）
    let idbState: AuthRecord | undefined;
    try {
      const idbPromise = db.get<AuthRecord>(
        DB_STORES.AUTH_STATE,
        AUTH_RECORD_ID,
      );
      // 給 IDB 最多 2 秒，超時就用備援
      const timeoutPromise = new Promise<undefined>((resolve) =>
        setTimeout(() => resolve(undefined), 2000),
      );
      idbState = await Promise.race([idbPromise, timeoutPromise]);
    } catch (error) {
      console.warn("[Auth] IDB 讀取失敗，使用 localStorage 備援:", error);
    }

    // 3. 決定使用哪個狀態
    if (idbState) {
      if (this.isExpired(idbState)) {
        await this.clearAuth();
        return null;
      }
      // IDB 有資料，同步備援並續期
      const renewed = await this.renewIfNeeded(idbState);
      return renewed;
    }

    // IDB 無資料或超時，使用 localStorage 備援
    if (localBackup) {
      console.warn("[Auth] 使用 localStorage 備援恢復驗證狀態");
      // 背景嘗試回寫 IDB（不阻塞）
      void this.tryWriteBackToIdb(localBackup);
      return localBackup;
    }

    return null;
  }

  // 清除驗證
  static async clearAuth(): Promise<void> {
    try {
      await db.delete(DB_STORES.AUTH_STATE, AUTH_RECORD_ID);
    } catch (e) {
      console.warn(
        "[Auth] 清除 IndexedDB 驗證狀態失敗，改以本地備援清除為主:",
        e,
      );
    }

    // 同時清除 localStorage（舊版 + 新版備援）
    localStorage.removeItem(LEGACY_AUTH_KEY);
    localStorage.removeItem(BACKUP_AUTH_KEY);
  }

  // 檢查是否已驗證
  // 注意：如果 IndexedDB 暫時不可用，會使用 localStorage 備援
  static async isAuthenticated(): Promise<boolean> {
    const authState = await this.getAuthState();
    return authState?.isAuthenticated ?? false;
  }

  private static async renewIfNeeded(
    authState: AuthRecord,
  ): Promise<AuthState> {
    const now = Date.now();
    const expiresAt = authState.expiresAt ?? 0;

    if (!expiresAt || expiresAt - now > SESSION_RENEW_THRESHOLD) {
      // 同步補寫備援，確保歷史版本升級後也有 backup
      this.saveBackupAuthState(authState);
      return authState;
    }

    if (!authState.discordUserId || !authState.discordUsername) {
      return authState;
    }

    try {
      await this.saveAuthState(
        authState.discordUserId,
        authState.discordUsername,
        authState.discordDisplayName || authState.discordUsername,
      );

      const renewed = await db.get<AuthRecord>(
        DB_STORES.AUTH_STATE,
        AUTH_RECORD_ID,
      );
      return renewed ?? authState;
    } catch (e) {
      console.warn("[Auth] 驗證續期失敗，維持原狀:", e);
      return authState;
    }
  }

  private static async restoreFromLocalBackup(
    tryWriteBackToIdb: boolean,
  ): Promise<AuthState | null> {
    // 1) 先讀新版備援
    const backup = this.readBackupAuthState(BACKUP_AUTH_KEY);
    if (backup) {
      if (tryWriteBackToIdb) {
        await this.tryWriteBackToIdb(backup);
      }
      return backup;
    }

    // 2) 再嘗試舊版資料遷移
    const legacy = this.readBackupAuthState(LEGACY_AUTH_KEY);
    if (!legacy) {
      return null;
    }

    // 成功讀到舊版後，升級寫入新版備援
    this.saveBackupAuthState(legacy);
    localStorage.removeItem(LEGACY_AUTH_KEY);

    if (tryWriteBackToIdb) {
      await this.tryWriteBackToIdb(legacy);
    }

    return legacy;
  }

  private static async tryWriteBackToIdb(authState: AuthState): Promise<void> {
    if (!authState.discordUserId || !authState.discordUsername) return;

    try {
      const record: AuthRecord = {
        id: AUTH_RECORD_ID,
        ...authState,
      };
      await db.put(DB_STORES.AUTH_STATE, record);
    } catch (e) {
      console.warn("[Auth] 將備援資料回寫到 IndexedDB 失敗:", e);
    }
  }

  private static saveBackupAuthState(authState: AuthState): void {
    try {
      const encrypted = this.encrypt(JSON.stringify(authState));
      localStorage.setItem(BACKUP_AUTH_KEY, encrypted);
    } catch (e) {
      console.warn("[Auth] 保存 localStorage 備援失敗:", e);
    }
  }

  private static readBackupAuthState(storageKey: string): AuthState | null {
    try {
      const encrypted = localStorage.getItem(storageKey);
      if (!encrypted) return null;

      const decrypted = this.decrypt(encrypted);
      const parsed = JSON.parse(decrypted) as Partial<AuthState>;
      const normalized = this.normalizeAuthState(parsed);
      if (!normalized) return null;

      if (this.isExpired(normalized)) {
        localStorage.removeItem(storageKey);
        return null;
      }

      return normalized;
    } catch (error) {
      console.error(`[Auth] 讀取本地備援失敗 (${storageKey}):`, error);
      return null;
    }
  }

  private static normalizeAuthState(raw: Partial<AuthState>): AuthState | null {
    if (!raw || raw.isAuthenticated !== true) return null;

    const discordUserId = raw.discordUserId ?? null;
    const discordUsername = raw.discordUsername ?? null;
    if (!discordUserId || !discordUsername) return null;

    return {
      isAuthenticated: true,
      discordUserId,
      discordUsername,
      discordDisplayName: raw.discordDisplayName ?? discordUsername,
      authenticatedAt: raw.authenticatedAt ?? Date.now(),
      expiresAt: raw.expiresAt ?? Date.now() + SESSION_DURATION,
    };
  }

  private static isExpired(authState: AuthState): boolean {
    return !!(authState.expiresAt && Date.now() > authState.expiresAt);
  }

  // 簡單加解密（僅保護本地備援可讀性）- 支援 Unicode
  private static encrypt(plain: string): string {
    const key = AUTH_ENCRYPTION_KEY;
    const bytes = new TextEncoder().encode(plain);
    const encrypted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      encrypted[i] = bytes[i] ^ key.charCodeAt(i % key.length);
    }
    return btoa(String.fromCharCode(...encrypted));
  }

  private static decrypt(encrypted: string): string {
    const key = AUTH_ENCRYPTION_KEY;
    const bytes = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));
    const decrypted = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      decrypted[i] = bytes[i] ^ key.charCodeAt(i % key.length);
    }
    return new TextDecoder().decode(decrypted);
  }
}
