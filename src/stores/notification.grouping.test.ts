/// <reference types="vitest/globals" />

import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationItem } from "@/types/notification";

const sent: NotificationItem[] = [];

vi.mock("@/db/operations", () => ({
  getSetting: async () => null,
  saveSetting: async () => {},
}));
vi.mock("@/services/PushNotificationService", () => ({
  pushNotificationService: {
    send: (item: NotificationItem) => sent.push(item),
    init: () => {},
  },
}));

const { useNotificationStore } = await import("./notification");

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  sent.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("噗浪通知合併", () => {
  it("一批回應只留一則通知、一個 Toast，系統通知等停下來只發一次", () => {
    const store = useNotificationStore();
    store.notifyQzoneComment("小明", undefined, "a", "早安");
    store.notifyQzoneComment("小華", undefined, "b", "吃飯了沒");
    store.notifyQzoneComment("小明", undefined, "a", "人呢");

    expect(store.notifications).toHaveLength(1);
    expect(store.visibleToasts).toHaveLength(1);
    expect(store.notifications[0].title).toBe("噗浪 · 3 則新回應");
    expect(store.notifications[0].message).toBe("小明、小華｜小明：人呢");

    expect(sent).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(sent).toHaveLength(1);
    expect(sent[0].title).toBe("噗浪 · 3 則新回應");
  });

  it("同一批的系統通知用同一個 tag，後面的蓋掉前面的", () => {
    const store = useNotificationStore();
    store.notifyQzoneComment("小明", undefined, "a", "早安");
    vi.advanceTimersByTime(3000);
    store.notifyQzoneComment("小華", undefined, "b", "午安");
    vi.advanceTimersByTime(3000);
    expect(sent).toHaveLength(2);
    expect(sent[0].data?.pushTag).toBe(sent[1].data?.pushTag);
  });

  it("單則顯示誰回了什麼", () => {
    const store = useNotificationStore();
    store.notifyQzonePost("小明", undefined, "a", "今天好熱");
    expect(store.notifications[0].title).toBe("小明 發了新噗");
    expect(store.notifications[0].message).toBe("今天好熱");
  });

  it("看過（已讀）或超過時間就另起一則", () => {
    const store = useNotificationStore();
    store.notifyQzoneComment("小明", undefined, "a", "一");
    store.markAllAsRead();
    store.notifyQzoneComment("小華", undefined, "b", "二");
    expect(store.notifications).toHaveLength(2);

    vi.advanceTimersByTime(11 * 60_000);
    store.notifyQzoneComment("小美", undefined, "c", "三");
    expect(store.notifications).toHaveLength(3);
  });

  it("新噗和新回應分開合併", () => {
    const store = useNotificationStore();
    store.notifyQzonePost("小明", undefined, "a", "噗");
    store.notifyQzoneComment("小華", undefined, "b", "回");
    expect(store.notifications).toHaveLength(2);
  });

  it("正在看噗浪：不跳 Toast，背景的系統通知照發", () => {
    const store = useNotificationStore();
    store.setViewingQzone(true);
    store.notifyQzoneComment("小明", undefined, "a", "早安");
    expect(store.visibleToasts).toHaveLength(0);
    vi.advanceTimersByTime(3000);
    expect(sent).toHaveLength(1);
  });

  it("Toast 合併後重新計時，不會被第一則的計時器提早收掉", () => {
    const store = useNotificationStore();
    store.notifyQzoneComment("小明", undefined, "a", "一");
    vi.advanceTimersByTime(3000);
    store.notifyQzoneComment("小華", undefined, "b", "二");
    vi.advanceTimersByTime(2000);
    expect(store.visibleToasts).toHaveLength(1);
    vi.advanceTimersByTime(2500);
    expect(store.visibleToasts).toHaveLength(0);
  });

  it("類型關掉就不通知", () => {
    const store = useNotificationStore();
    store.settings.typeSettings.qzone_comment = false;
    store.notifyQzoneComment("小明", undefined, "a", "早安");
    vi.advanceTimersByTime(3000);
    expect(store.notifications).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
