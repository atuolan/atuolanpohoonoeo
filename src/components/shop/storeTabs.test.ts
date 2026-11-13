import { describe, expect, it } from "vitest";
import { WAIMAI_SECTION_META } from "@/data/waimaiCatalog";
import { migrateDockAppIds } from "@/components/dock/dockApps";
import { parseHouseDock } from "@/components/pixelHouse/houseData";
import {
  DEFAULT_STORE_TAB,
  STORE_GROUPS,
  STORE_TABS,
  isDeliveryTab,
  isStoreTabId,
  resolveInitialStoreTab,
  setNextStoreTab,
  storeTabsInGroup,
  takeNextStoreTab,
} from "./storeTabs";

describe("商店分頁", () => {
  it("每一頁都屬於一區，id 不重複", () => {
    const ids = STORE_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(STORE_GROUPS.map((g) => g.id));
    for (const t of STORE_TABS) expect(groups.has(t.group), t.id).toBe(true);
    for (const g of STORE_GROUPS) expect(storeTabsInGroup(g.id).length, g.id).toBeGreaterThan(0);
  });

  it("外賣的三區都在，名字跟原本一樣", () => {
    for (const meta of WAIMAI_SECTION_META) {
      const tab = STORE_TABS.find((t) => t.id === meta.id);
      expect(tab?.label, meta.id).toBe(meta.label);
      expect(isDeliveryTab(meta.id)).toBe(true);
    }
    expect(isDeliveryTab("gift")).toBe(false);
    expect(isDeliveryTab("cabinet")).toBe(false);
  });

  it("認得的才算分頁 id", () => {
    expect(isStoreTabId("care")).toBe(true);
    expect(isStoreTabId("nope")).toBe(false);
    expect(isStoreTabId(null)).toBe(false);
  });
});

describe("打開商店停在哪一頁", () => {
  it("別處指定的 > 入口指定的 > 上次停的 > 預設", () => {
    expect(resolveInitialStoreTab({ requested: "care", entry: "food", last: "rod" })).toBe("care");
    expect(resolveInitialStoreTab({ requested: null, entry: "food", last: "rod" })).toBe("food");
    expect(resolveInitialStoreTab({ entry: null, last: "rod" })).toBe("rod");
    expect(resolveInitialStoreTab({})).toBe(DEFAULT_STORE_TAB);
  });

  it("別處指定的只用一次", () => {
    setNextStoreTab("chatskin");
    expect(takeNextStoreTab()).toBe("chatskin");
    expect(takeNextStoreTab()).toBeNull();
  });
});

describe("外賣併進商店：舊的常用 App 存檔", () => {
  it("轉盤：外賣換成商店，重複的只留一個", () => {
    expect(migrateDockAppIds(["message", "delivery", "music"])).toEqual(["message", "shop", "music"]);
    expect(migrateDockAppIds(["shop", "delivery"])).toEqual(["shop"]);
  });

  it("小屋下面那一排：外賣換成商店", () => {
    expect(parseHouseDock(["delivery", "message"])).toEqual(["shop", "message"]);
    expect(parseHouseDock(["shop", "delivery", "music"])).toEqual(["shop", "music"]);
  });
});

describe("重複的商品只留一邊", () => {
  it("玩偶只在禮物賣，外送沒有玩偶", async () => {
    const { WAIMAI_CATALOG } = await import("@/data/waimaiCatalog");
    expect(WAIMAI_CATALOG.filter((i) => i.tags.includes("玩偶"))).toEqual([]);
    const { GIFT_ITEMS } = await import("@/data/shopItems");
    const names = GIFT_ITEMS.filter((i) => !i.retired).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(["小熊娃娃", "兔子娃娃", "灰貓抱枕", "萌系盲盒"]));
  });

  it("禮物的乳液、化妝水不賣了，但已經買的還查得到", async () => {
    const { GIFT_ITEMS, getShopItemById } = await import("@/data/shopItems");
    const onSale = GIFT_ITEMS.filter((i) => !i.retired).map((i) => i.id);
    expect(onSale).not.toContain("gift_lotion");
    expect(onSale).not.toContain("gift_toner");
    expect(getShopItemById("gift_lotion")?.name).toBe("保濕乳液");
    expect(getShopItemById("gift_toner")?.name).toBe("化妝水");
  });

  it("禮物名字不重複（聊天裡靠名字找禮物）", async () => {
    const { GIFT_ITEMS } = await import("@/data/shopItems");
    const names = GIFT_ITEMS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("首頁圖示改名", () => {
  it("舊的「購物」跟新的「商店」當成同一顆", async () => {
    const { appLabelKey } = await import("@/stores/canvas");
    expect(appLabelKey("購物")).toBe(appLabelKey("商店"));
    expect(appLabelKey("外賣")).toBe("外賣");
  });
});
