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

export interface DeliveryAddress {
  id: string;
  label: string;
  recipientName: string;
  phone?: string;
  /** ISO 3166-1 alpha-2 */
  countryCode: string;
  countryName: string;
  city: string;
  addressLine: string;
  lat?: number;
  lon?: number;
  isDefault?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface TemporaryAddress {
  source: "manual_temp";
  displayName?: string;
  countryCode: string;
  countryName: string;
  city: string;
  addressLine: string;
  lat?: number;
  lon?: number;
}

export interface WaimaiDestinationSnapshot {
  source: "address_book" | "manual_temp";
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
