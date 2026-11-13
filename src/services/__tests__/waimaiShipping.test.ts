import { describe, expect, it } from "vitest";
import { getWaimaiCatalogItemById } from "@/data/waimaiCatalog";
import { pickWaimaiWeather } from "@/services/waimaiEta";
import {
  computeWaimaiShippingFee,
  resolveWaimaiRoute,
} from "@/services/waimaiShipping";

describe("外賣運費", () => {
  const food = getWaimaiCatalogItemById("food_rice_curry_pork_cutlet")!;
  const kind = getWaimaiCatalogItemById("kind_daily_toothpaste_mint")!;
  const spicy = getWaimaiCatalogItemById("spicy_safe_condom_thin")!;

  it("美食廣場不管寄到哪國都是就近外送", () => {
    expect(resolveWaimaiRoute(food, "TW")).toBe("local_instant");
    expect(resolveWaimaiRoute(food, "US")).toBe("local_instant");
    expect(computeWaimaiShippingFee(resolveWaimaiRoute(food, "US"))).toBe(30);
  });

  it("同國走國內物流，跨國走跨境物流", () => {
    expect(computeWaimaiShippingFee(resolveWaimaiRoute(kind, "TW"))).toBe(60);
    expect(computeWaimaiShippingFee(resolveWaimaiRoute(kind, "JP"))).toBe(150);
    // 邪氣商店從德國出貨
    expect(computeWaimaiShippingFee(resolveWaimaiRoute(spicy, "TW"))).toBe(150);
    expect(computeWaimaiShippingFee(resolveWaimaiRoute(spicy, "de"))).toBe(60);
  });
});

describe("配送天氣", () => {
  it("依機率分成晴天、下雨、暴雨", () => {
    expect(pickWaimaiWeather(() => 0.01)).toBe("storm");
    expect(pickWaimaiWeather(() => 0.1)).toBe("rain");
    expect(pickWaimaiWeather(() => 0.5)).toBe("clear");
  });
});
