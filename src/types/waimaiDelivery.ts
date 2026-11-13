export type WaimaiLogisticsType = "local" | "domestic" | "cross_border";

export interface WaimaiItemLogisticsMeta {
  logisticsType: WaimaiLogisticsType;
  /** ISO 3166-1 alpha-2 */
  originCountry: string;
  originCity?: string;
  originLat?: number;
  originLon?: number;
  /** 本地備餐（分鐘） */
  prepMinutesRange?: [number, number];
  /** 跨境/國內備貨（小時） */
  prepHoursRange?: [number, number];
}

export interface WaimaiDestinationSnapshot {
  /** recipient：依收件人（自己／角色）所在地自動帶入；另外兩種是舊版地址簿留下的訂單 */
  source: "recipient" | "address_book" | "manual_temp";
  addressId?: string;
  recipientName: string;
  phone?: string;
  countryCode: string;
  countryName: string;
  city: string;
  addressLine: string;
  lat?: number;
  lon?: number;
}

export type WaimaiWeatherLevel = "clear" | "rain" | "storm";

export interface WaimaiEtaBreakdown {
  /** 備餐/備貨 */
  prepMinutes: number;
  /** 配送/幹線運輸 */
  transitMinutes: number;
  /** 清關（本地/國內為 0） */
  customsMinutes: number;
  /** 末端配送 */
  lastMileMinutes: number;
}

export type WaimaiRouteType = "local_instant" | "domestic" | "cross_border";

export interface WaimaiEtaSnapshot {
  computedAt: number;
  estimatedDeliveryAt: number;
  etaWindowStartAt: number;
  etaWindowEndAt: number;
  totalMinutes: number;
  distanceKm?: number;
  weatherLevel: WaimaiWeatherLevel;
  isPeakHour: boolean;
  routeType: WaimaiRouteType;
  originCountry: string;
  destinationCountry: string;
  breakdown: WaimaiEtaBreakdown;
}

export interface CountryEtaFactor {
  linehaul: number;
  customs: number;
  lastMile: number;
}
