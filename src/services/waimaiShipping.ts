import type { WaimaiCatalogItem } from "../data/waimaiCatalog";
import type { WaimaiRouteType } from "../types/waimaiDelivery";
import { decideRouteType } from "./waimaiEta";

/**
 * 外賣運費：依配送路線計價。
 * - 就近外送（美食廣場）：🪙 30
 * - 國內物流：🪙 60
 * - 跨境物流：🪙 150
 */
export const WAIMAI_SHIPPING_FEES: Record<WaimaiRouteType, number> = {
  local_instant: 30,
  domestic: 60,
  cross_border: 150,
};

export function computeWaimaiShippingFee(routeType: WaimaiRouteType): number {
  return WAIMAI_SHIPPING_FEES[routeType];
}

/** 商品寄到某國時走哪條路線（美食廣場一律就近外送）。 */
export function resolveWaimaiRoute(
  item: Pick<WaimaiCatalogItem, "section" | "logisticsMeta">,
  destinationCountry: string,
): WaimaiRouteType {
  return decideRouteType(
    item.section,
    item.logisticsMeta.originCountry || "TW",
    destinationCountry || "TW",
  );
}

export function formatWaimaiRouteName(routeType: WaimaiRouteType): string {
  if (routeType === "local_instant") return "就近外送";
  if (routeType === "domestic") return "國內物流";
  return "跨境物流";
}
