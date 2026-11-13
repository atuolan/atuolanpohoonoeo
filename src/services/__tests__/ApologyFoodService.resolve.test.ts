import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/database", () => ({ db: {}, DB_STORES: {} }));

import { resolveApologyFoodItem } from "@/services/ApologyFoodService";
import { WAIMAI_CATALOG } from "@/data/waimaiCatalog";

describe("resolveApologyFoodItem", () => {
  it("亂寫的 ID 永遠回傳餐飲館商品", () => {
    for (const r of [0, 0.3, 0.7, 0.999]) {
      const item = resolveApologyFoodItem("not_a_real_id", () => r);
      expect(item?.section).toBe("food");
    }
  });

  it("非餐飲館的 ID 不會被採用", () => {
    const other = WAIMAI_CATALOG.find((i) => i.section !== "food")!;
    expect(resolveApologyFoodItem(other.id)?.section).toBe("food");
  });

  it("名字『珍珠』對到黑糖珍珠鮮奶", () => {
    expect(resolveApologyFoodItem("珍珠")?.name).toContain("黑糖珍珠鮮奶");
  });

  it("正確的 food ID 直接命中", () => {
    const food = WAIMAI_CATALOG.find((i) => i.section === "food")!;
    expect(resolveApologyFoodItem(food.id)?.id).toBe(food.id);
  });
});
