import { describe, expect, it } from "vitest";
import { DOCK_APP_CATALOG } from "@/components/dock/dockApps";
import { DEFAULT_HOUSE_DOCK, HOUSE_DOCK_APPS, HOUSE_DOCK_MAX, parseHouseDock } from "./houseData";
import { parsePixelHouseState } from "./houseState";

describe("常用 App 可以挑的清單", () => {
  it("每個圖示都是 9×9，只有 . 和 #", () => {
    for (const a of HOUSE_DOCK_APPS) {
      expect(a.glyph, a.app).toHaveLength(9);
      for (const row of a.glyph) expect(row, a.app).toMatch(/^[.#]{9}$/);
    }
  });

  it("沒有重複，而且都是點得開的頁面", () => {
    const ids = HOUSE_DOCK_APPS.map((a) => a.app);
    expect(new Set(ids).size).toBe(ids.length);
    // 「全部 App」裡的每一個，加上提示詞
    const navigable = new Set([...DOCK_APP_CATALOG.map((a) => a.id), "prompt-manager"]);
    for (const id of ids) expect(navigable.has(id), id).toBe(true);
    for (const a of DOCK_APP_CATALOG) expect(ids, a.id).toContain(a.id);
  });

  it("預設是訊息、角色、世界書、提示詞", () => {
    expect(DEFAULT_HOUSE_DOCK).toEqual(["message", "character", "book", "prompt-manager"]);
  });
});

describe("parseHouseDock", () => {
  it("沒存過或格式不對用預設", () => {
    expect(parseHouseDock(undefined)).toEqual(DEFAULT_HOUSE_DOCK);
    expect(parseHouseDock("message")).toEqual(DEFAULT_HOUSE_DOCK);
    expect(parseHouseDock([])).toEqual(DEFAULT_HOUSE_DOCK);
    expect(parseHouseDock(["nope", 3])).toEqual(DEFAULT_HOUSE_DOCK);
  });

  it("照存的順序，去掉認不得的和重複的", () => {
    expect(parseHouseDock(["music", "nope", "message", "music"])).toEqual(["music", "message"]);
  });

  it(`最多 ${HOUSE_DOCK_MAX} 個`, () => {
    expect(parseHouseDock(["message", "character", "book", "music", "game", "phone"])).toEqual(["message", "character", "book", "music"]);
  });

  it("回傳的是新陣列，改了不會動到預設", () => {
    const apps = parseHouseDock(null);
    apps.push("music");
    expect(DEFAULT_HOUSE_DOCK).toHaveLength(4);
  });
});

describe("小屋存的狀態", () => {
  it("舊的存檔沒有 dockApps，用預設", () => {
    expect(parsePixelHouseState({ homeStyle: "pixel-house", dockOpen: true }).dockApps).toEqual(DEFAULT_HOUSE_DOCK);
  });

  it("讀回自訂過的", () => {
    expect(parsePixelHouseState({ dockApps: ["phone", "message"] }).dockApps).toEqual(["phone", "message"]);
  });
});
