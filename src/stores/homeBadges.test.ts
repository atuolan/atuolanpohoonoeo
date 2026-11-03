import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAllChats } from "@/storage/chatStorage";
import {
  countUnreadOfTypes,
  formatBadgeCount,
  sumChatUnread,
  useHomeBadgesStore,
} from "./homeBadges";

vi.mock("@/storage/chatStorage", () => ({
  CHAT_UNREAD_CHANGED_EVENT: "aguaphone:chat-unread-changed",
  loadAllChats: vi.fn(),
}));

const notifications: Array<{ type: string; read: boolean }> = [];
vi.mock("./notification", () => ({
  useNotificationStore: () => ({ notifications }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  notifications.length = 0;
  vi.mocked(loadAllChats).mockReset();
});

describe("算未讀數", () => {
  it("聊天未讀數加總，沒有或負數當 0", () => {
    expect(sumChatUnread([{ unreadCount: 2 }, {}, { unreadCount: 5 }, { unreadCount: -1 }])).toBe(7);
  });

  it("只算指定類型、還沒讀的通知", () => {
    const list = [
      { type: "qzone_post", read: false },
      { type: "qzone_comment", read: false },
      { type: "qzone_post", read: true },
      { type: "chat_message", read: false },
    ] as const;
    expect(countUnreadOfTypes(list, ["qzone_post", "qzone_comment"])).toBe(2);
  });

  it("超過 99 顯示 99+", () => {
    expect(formatBadgeCount(5)).toBe("5");
    expect(formatBadgeCount(99)).toBe("99");
    expect(formatBadgeCount(100)).toBe("99+");
  });
});

describe("useHomeBadgesStore", () => {
  it("訊息是聊天未讀加總，空間是噗浪通知", async () => {
    vi.mocked(loadAllChats).mockResolvedValue([{ unreadCount: 3 }, { unreadCount: 1 }] as never);
    notifications.push({ type: "qzone_post", read: false }, { type: "qzone_comment", read: true });
    const store = useHomeBadgesStore();

    await store.refreshChats();

    expect(store.badges.message).toBe(4);
    expect(store.badges.space).toBe(1);
    expect(store.total).toBe(5);
  });

  it("讀不到聊天時維持原本的數字，不會壞掉", async () => {
    vi.mocked(loadAllChats).mockRejectedValue(new Error("db 壞了"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = useHomeBadgesStore();

    await store.refreshChats();

    expect(store.badges.message).toBe(0);
  });
});
