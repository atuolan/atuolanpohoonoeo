import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it } from "vitest";
import { useChatSkinsStore } from "./chatSkins";

describe("chatSkins store", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("試穿開始與結束", () => {
    const store = useChatSkinsStore();
    store.startTryOn({ chatId: "c1", slot: "header", pieceId: "greenbubble-header" });
    expect(store.tryOn).toEqual({ chatId: "c1", slot: "header", pieceId: "greenbubble-header" });
    store.endTryOn();
    expect(store.tryOn).toBeNull();
  });

  it("prime 不算使用者修改；set 會加 editRevision 並記下聊天", () => {
    const store = useChatSkinsStore();
    store.primeChatOverrides("c1", { slots: { header: "none" } });
    expect(store.editRevision).toBe(0);
    expect(store.getChatOverrides("c1")).toEqual({ slots: { header: "none" } });

    store.setChatOverrides("c1", { slots: { header: "greenbubble-header", message: "" } as never });
    expect(store.editRevision).toBe(1);
    expect(store.lastEditedChatId).toBe("c1");
    expect(store.getChatOverrides("c1")).toEqual({ slots: { header: "greenbubble-header" } });
  });

  it("沒有資料或沒給聊天 → {}", () => {
    const store = useChatSkinsStore();
    expect(store.getChatOverrides(null)).toEqual({});
    expect(store.getChatOverrides("nope")).toEqual({});
  });
});
