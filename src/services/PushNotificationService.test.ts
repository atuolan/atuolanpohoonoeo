/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "@/types/notification";

let native = true;
let pluginAvailable = true;
let foreground = false;
let permission: NotificationPermission = "granted";
const shown: Array<{ tag: string; title: string; body: string; extra?: Record<string, unknown> }> = [];

vi.mock("@/native/platform", () => ({
  isNativeApp: () => native,
  hasNativeNotifications: () => native && pluginAvailable,
}));
vi.mock("@/native/notifications", () => ({
  isAppInForeground: () => foreground,
  checkNativeNotificationPermission: async () => permission,
  requestNativeNotificationPermission: async () => permission,
  showNativeNotification: async (options: (typeof shown)[number]) => {
    shown.push(options);
  },
}));

const { pushNotificationService } = await import("./PushNotificationService");

function item(overrides: Partial<NotificationItem> = {}): NotificationItem {
  return {
    id: "n1",
    type: "chat_message",
    title: "小明",
    message: "給你發了一條新訊息",
    chatId: "chat-1",
    characterId: "char-1",
    priority: "normal",
    createdAt: 0,
    read: false,
    ...overrides,
  };
}

/** send() 不回傳 Promise，等原生通知模組載入、非同步流程跑完 */
async function flush() {
  await vi.dynamicImportSettled();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  native = true;
  pluginAvailable = true;
  foreground = false;
  permission = "granted";
  shown.length = 0;
});

describe("App 裡的系統通知", () => {
  it("App 在背景時用原生通知發送，點通知要用的資料放在 extra", async () => {
    pushNotificationService.send(item());
    await flush();
    expect(shown).toEqual([
      {
        tag: "n1",
        title: "💌 小明",
        body: "給你發了一條新訊息",
        extra: { type: "chat_message", chatId: "chat-1", characterId: "char-1", navigateTo: undefined, reason: undefined },
      },
    ]);
  });

  it("App 在前景時不發，來電例外，同一通來電用同一個 tag", async () => {
    foreground = true;
    pushNotificationService.send(item());
    pushNotificationService.send(item({ id: "n2", type: "incoming_call" }));
    await flush();
    expect(shown.map((n) => n.tag)).toEqual(["incoming-call-chat-1"]);
  });

  it("沒有通知權限就不發", async () => {
    permission = "denied";
    pushNotificationService.send(item());
    await flush();
    expect(shown).toEqual([]);
  });

  it("舊 App 外殼沒有通知插件時當成不支援", async () => {
    pluginAvailable = false;
    expect(pushNotificationService.isSupported).toBe(false);
    expect(await pushNotificationService.requestPermission()).toBe("denied");
    pushNotificationService.send(item());
    await flush();
    expect(shown).toEqual([]);
  });

  it("權限從原生端讀", async () => {
    permission = "default";
    expect(await pushNotificationService.refreshPermission()).toBe("default");
    permission = "granted";
    expect(await pushNotificationService.refreshPermission()).toBe("granted");
  });
});
