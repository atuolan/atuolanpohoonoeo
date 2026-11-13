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
