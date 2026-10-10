import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const { getAuthState, saveAuthState, verifyTOTP, takePendingDiscordOAuthResult } = vi.hoisted(() => ({
  getAuthState: vi.fn(),
  saveAuthState: vi.fn().mockResolvedValue(undefined),
  verifyTOTP: vi.fn(),
  takePendingDiscordOAuthResult: vi.fn(),
}));

vi.mock("@/services/AuthService", () => ({
  AuthService: {
    getCachedAuthStateSync: () => null,
    getAuthState,
    saveAuthState,
    verifyTOTP,
    takePendingDiscordOAuthResult,
    clearAuth: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/utils/codeProtection", () => ({
  CodeProtection: { addWatermark: vi.fn(), removeWatermark: vi.fn() },
}));

import { useAuthStore } from "@/stores/auth";

const SIGNED_IN = {
  isAuthenticated: true,
  discordUserId: "1",
  discordUsername: "user",
  discordDisplayName: "使用者",
};

describe("auth store：驗證通過後進入 App", () => {
  beforeEach(() => {
    getAuthState.mockReset();
    verifyTOTP.mockReset();
    setActivePinia(createPinia());
  });

  it("驗證成功時同時進入已驗證與「正在進入」狀態，由 App 收尾", async () => {
    verifyTOTP.mockResolvedValue({ success: true, userId: "1", username: "user" });
    getAuthState.mockResolvedValue(SIGNED_IN);
    const store = useAuthStore();

    const result = await store.verifyCode("123456");

    expect(result.success).toBe(true);
    expect(store.isAuthenticated).toBe(true);
    expect(store.isEnteringApp).toBe(true);

    store.finishEnteringApp();
    expect(store.isEnteringApp).toBe(false);
    expect(store.isAuthenticated).toBe(true);
  });

  it("還在讀回登入狀態時就先標記正在進入，驗證頁不會閃回可輸入狀態", async () => {
    let resolveState: (value: unknown) => void = () => {};
    getAuthState.mockReturnValue(new Promise((resolve) => (resolveState = resolve)));
    const store = useAuthStore();

    const pending = store.friendBypass("friendUSED");
    await vi.waitFor(() => expect(store.isEnteringApp).toBe(true));
    expect(store.isAuthenticated).toBe(false);

    resolveState(SIGNED_IN);
    expect((await pending).success).toBe(true);
    expect(store.isAuthenticated).toBe(true);
  });

  it("登入狀態沒有保存成功時回報失敗，不停在「正在進入」", async () => {
    verifyTOTP.mockResolvedValue({ success: true, userId: "1", username: "user" });
    getAuthState.mockResolvedValue(null);
    const store = useAuthStore();

    const result = await store.verifyCode("123456");

    expect(result.success).toBe(false);
    expect(result.message).not.toBe("");
    expect(store.isAuthenticated).toBe(false);
    expect(store.isEnteringApp).toBe(false);
  });

  it("驗證失敗不會進入「正在進入」狀態", async () => {
    verifyTOTP.mockResolvedValue({ success: false, message: "驗證碼錯誤" });
    const store = useAuthStore();

    const result = await store.verifyCode("000000");

    expect(result).toEqual({ success: false, message: "驗證碼錯誤" });
    expect(store.isEnteringApp).toBe(false);
    await expect(store.friendBypass("wrong")).resolves.toEqual({ success: false, message: "" });
  });
});

describe("auth store：補接脫離追蹤的 Discord 授權結果", () => {
  beforeEach(() => {
    getAuthState.mockReset();
    saveAuthState.mockClear();
    takePendingDiscordOAuthResult.mockReset();
    setActivePinia(createPinia());
  });

  it("沒有待處理結果時不做任何事", async () => {
    takePendingDiscordOAuthResult.mockReturnValue(null);
    const store = useAuthStore();

    await expect(store.completePendingDiscordOAuth()).resolves.toBeNull();
    expect(saveAuthState).not.toHaveBeenCalled();
  });

  it("稍後寫入的成功結果會完成登入", async () => {
    takePendingDiscordOAuthResult.mockReturnValue({
      success: true,
      message: "驗證通過",
      userId: "1",
      username: "user",
      displayName: "使用者",
    });
    getAuthState.mockResolvedValue(SIGNED_IN);
    const store = useAuthStore();

    const result = await store.completePendingDiscordOAuth();

    expect(result?.success).toBe(true);
    expect(saveAuthState).toHaveBeenCalledWith("1", "user", "使用者");
    expect(store.isAuthenticated).toBe(true);
  });

  it("已登入時不會取走待處理結果", async () => {
    getAuthState.mockResolvedValue(SIGNED_IN);
    const store = useAuthStore();
    await store.friendBypass("friendUSED");

    await expect(store.completePendingDiscordOAuth()).resolves.toBeNull();
    expect(takePendingDiscordOAuthResult).not.toHaveBeenCalled();
  });
});
