import type { WaimaiMallSection } from "../data/waimaiCatalog";
import type {
  CountryEtaFactor,
  WaimaiEtaSnapshot,
  WaimaiItemLogisticsMeta,
  WaimaiRouteType,
  WaimaiWeatherLevel,
} from "../types/waimaiDelivery";

export const COUNTRY_ETA_FACTORS: Record<string, CountryEtaFactor> = {
  // 高成熟度
  TW: { linehaul: 0.9, customs: 0.8, lastMile: 0.9 },
  JP: { linehaul: 0.9, customs: 0.9, lastMile: 0.9 },
  KR: { linehaul: 0.9, customs: 0.9, lastMile: 0.9 },
  US: { linehaul: 1.0, customs: 1.0, lastMile: 1.0 },
  DE: { linehaul: 0.9, customs: 0.9, lastMile: 0.9 },
  GB: { linehaul: 0.9, customs: 1.0, lastMile: 0.9 },
  SG: { linehaul: 0.9, customs: 0.8, lastMile: 0.8 },
  AU: { linehaul: 1.1, customs: 1.0, lastMile: 1.1 },
  CA: { linehaul: 1.0, customs: 1.0, lastMile: 1.0 },
  // 中等
  TH: { linehaul: 1.0, customs: 1.1, lastMile: 1.1 },
  MY: { linehaul: 1.0, customs: 1.1, lastMile: 1.0 },
  VN: { linehaul: 1.0, customs: 1.2, lastMile: 1.1 },
  PH: { linehaul: 1.1, customs: 1.2, lastMile: 1.2 },
  MX: { linehaul: 1.1, customs: 1.2, lastMile: 1.2 },
  // 低成熟度 / 偏遠
  BR: { linehaul: 1.2, customs: 1.4, lastMile: 1.3 },
  IN: { linehaul: 1.1, customs: 1.3, lastMile: 1.3 },
  RU: { linehaul: 1.3, customs: 1.5, lastMile: 1.4 },
};

export const DEFAULT_FACTOR: CountryEtaFactor = {
  linehaul: 1.1,
  customs: 1.2,
  lastMile: 1.2,
};

const LOCAL_WEATHER_MINUTES: Record<WaimaiWeatherLevel, [number, number]> = {
  clear: [0, 0],
  rain: [6, 15],
  storm: [30, 60],
};

const CROSS_BORDER_WEATHER_PERCENT: Record<WaimaiWeatherLevel, [number, number]> = {
  clear: [0, 0],
  rain: [0.06, 0.15],
  storm: [0.12, 0.25],
};

const DOMESTIC_WEATHER_PERCENT: Record<WaimaiWeatherLevel, [number, number]> = {
  clear: [0, 0],
  rain: [0.04, 0.1],
  storm: [0.08, 0.15],
};

export interface ComputeWaimaiEtaInput {
  section: WaimaiMallSection;
  logisticsMeta: WaimaiItemLogisticsMeta;
  destinationCountry: string;
  destinationLat?: number;
  destinationLon?: number;
  weatherLevel?: WaimaiWeatherLevel;
  isPeakHour?: boolean;
  now?: number;
  random?: () => number;
}

function randomInRange(min: number, max: number, random: () => number): number {
  if (max <= min) {
    return min;
  }
  return min + (max - min) * random();
}

function randomInt(min: number, max: number, random: () => number): number {
  return Math.round(randomInRange(min, max, random));
}

function clampMin(value: number, min: number): number {
  return value < min ? min : value;
}

function normalizeCountryCode(countryCode: string): string {
  return countryCode.trim().toUpperCase();
}

function getCountryFactor(countryCode: string): CountryEtaFactor {
  const key = normalizeCountryCode(countryCode);
  return COUNTRY_ETA_FACTORS[key] ?? DEFAULT_FACTOR;
}

export function isPeakHour(timestamp: number = Date.now()): boolean {
  const d = new Date(timestamp);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const lunchPeak = minutes >= 11 * 60 + 30 && minutes <= 13 * 60 + 30;
  const dinnerPeak = minutes >= 17 * 60 + 30 && minutes <= 20 * 60;
  return lunchPeak || dinnerPeak;
}

export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function decideRouteType(
  section: WaimaiMallSection,
  originCountry: string,
  destinationCountry: string,
): WaimaiRouteType {
  if (section === "food") {
    return "local_instant";
  }

  const sameCountry = normalizeCountryCode(originCountry) === normalizeCountryCode(destinationCountry);
  return sameCountry ? "domestic" : "cross_border";
}

function computeLocalTransitMinutes(distanceKm: number | undefined, random: () => number): number {
  if (distanceKm == null || Number.isNaN(distanceKm)) {
    return randomInt(15, 28, random);
  }

  if (distanceKm <= 2) {
    return randomInt(8, 15, random);
  }
  if (distanceKm <= 5) {
    return randomInt(15, 28, random);
  }
  if (distanceKm <= 10) {
    return randomInt(28, 45, random);
  }
  return randomInt(45, 75, random);
}

function toMinutesFromHoursRange(
  range: [number, number] | undefined,
  fallback: [number, number],
  random: () => number,
): number {
  const [minH, maxH] = range ?? fallback;
  return randomInt(minH * 60, maxH * 60, random);
}

function withJitter(totalMinutes: number, percentRange: [number, number], random: () => number): number {
  const ratio = randomInRange(percentRange[0], percentRange[1], random);
  return Math.round(clampMin(totalMinutes * (1 + ratio), 1));
}

export function computeWaimaiEta(input: ComputeWaimaiEtaInput): WaimaiEtaSnapshot {
  const now = input.now ?? Date.now();
  const random = input.random ?? Math.random;
  const weatherLevel = input.weatherLevel ?? "clear";
  const peak = input.isPeakHour ?? isPeakHour(now);

  const originCountry = normalizeCountryCode(input.logisticsMeta.originCountry || "TW");
  const destinationCountry = normalizeCountryCode(input.destinationCountry || "TW");
  const routeType = decideRouteType(input.section, originCountry, destinationCountry);

  const hasCoord =
    input.logisticsMeta.originLat != null &&
    input.logisticsMeta.originLon != null &&
    input.destinationLat != null &&
    input.destinationLon != null;

  const distanceKm = hasCoord
    ? haversineKm(
        input.logisticsMeta.originLat as number,
        input.logisticsMeta.originLon as number,
        input.destinationLat as number,
        input.destinationLon as number,
      )
    : undefined;

  let prepMinutes = 0;
  let transitMinutes = 0;
  let customsMinutes = 0;
  let lastMileMinutes = 0;

  if (routeType === "local_instant") {
    const prepRange = input.logisticsMeta.prepMinutesRange ?? [12, 28];
    prepMinutes = randomInt(prepRange[0], prepRange[1], random);
    transitMinutes = computeLocalTransitMinutes(distanceKm, random);

    if (peak) {
      transitMinutes += randomInt(8, 22, random);
    }

    const [wMin, wMax] = LOCAL_WEATHER_MINUTES[weatherLevel];
    transitMinutes += randomInt(wMin, wMax, random);
  } else if (routeType === "domestic") {
    prepMinutes = toMinutesFromHoursRange(input.logisticsMeta.prepHoursRange, [4, 12], random);
    transitMinutes = randomInt(1 * 24 * 60, 3 * 24 * 60, random);
    lastMileMinutes = randomInt(Math.round(0.5 * 24 * 60), 1 * 24 * 60, random);

    const [wMin, wMax] = DOMESTIC_WEATHER_PERCENT[weatherLevel];
    const weatherRatio = randomInRange(wMin, wMax, random);
    transitMinutes = Math.round(transitMinutes * (1 + weatherRatio));
    lastMileMinutes = Math.round(lastMileMinutes * (1 + weatherRatio));
  } else {
    const factor = getCountryFactor(destinationCountry);

    prepMinutes = toMinutesFromHoursRange(input.logisticsMeta.prepHoursRange, [12, 48], random);

    const linehaulBase = randomInt(3 * 24 * 60, 7 * 24 * 60, random);
    const customsBase = randomInt(Math.round(0.5 * 24 * 60), 2 * 24 * 60, random);
    const lastMileBase = randomInt(Math.round(0.5 * 24 * 60), Math.round(1.5 * 24 * 60), random);

    transitMinutes = Math.round(linehaulBase * factor.linehaul);
    customsMinutes = Math.round(customsBase * factor.customs);
    lastMileMinutes = Math.round(lastMileBase * factor.lastMile);

    const [wMin, wMax] = CROSS_BORDER_WEATHER_PERCENT[weatherLevel];
    const weatherRatio = randomInRange(wMin, wMax, random);
    transitMinutes = Math.round(transitMinutes * (1 + weatherRatio));
    lastMileMinutes = Math.round(lastMileMinutes * (1 + weatherRatio));
  }

  const baseTotal = prepMinutes + transitMinutes + customsMinutes + lastMileMinutes;
  const totalMinutes =
    routeType === "local_instant"
      ? withJitter(baseTotal, [-0.08, 0.08], random)
      : routeType === "domestic"
        ? withJitter(baseTotal, [-0.1, 0.1], random)
        : withJitter(baseTotal, [-0.12, 0.12], random);

  const windowRatio = routeType === "local_instant" ? 0.2 : routeType === "domestic" ? 0.18 : 0.2;
  const halfWindow = Math.max(8, Math.round(totalMinutes * windowRatio));

  const estimatedDeliveryAt = now + totalMinutes * 60_000;
  const etaWindowStartAt = now + clampMin(totalMinutes - halfWindow, 1) * 60_000;
  const etaWindowEndAt = now + (totalMinutes + halfWindow) * 60_000;

  return {
    computedAt: now,
    estimatedDeliveryAt,
    etaWindowStartAt,
    etaWindowEndAt,
    totalMinutes,
    distanceKm,
    weatherLevel,
    isPeakHour: peak,
    routeType,
    originCountry,
    destinationCountry,
    breakdown: {
      prepMinutes,
      transitMinutes,
      customsMinutes,
      lastMileMinutes,
    },
  };
}

export function formatEtaRangeText(snapshot: WaimaiEtaSnapshot): string {
  const now = snapshot.computedAt;
  const minMinutes = Math.max(1, Math.round((snapshot.etaWindowStartAt - now) / 60_000));
  const maxMinutes = Math.max(minMinutes, Math.round((snapshot.etaWindowEndAt - now) / 60_000));

  if (maxMinutes < 180) {
    return `約 ${minMinutes}-${maxMinutes} 分鐘`;
  }

  const minDays = Math.max(1, Math.round((minMinutes / 60 / 24) * 10) / 10);
  const maxDays = Math.max(minDays, Math.round((maxMinutes / 60 / 24) * 10) / 10);
  return `約 ${minDays}-${maxDays} 天`;
}

/**
 * 將 ISO 3166-1 alpha-2 國碼轉為國旗 emoji。
 * 原理：Regional Indicator Symbol Letters = 0x1F1E6 + (charCode - 65)
 */
export function countryCodeToFlag(code: string): string {
  const upper = code.trim().toUpperCase();
  if (upper.length !== 2) return "";
  const a = upper.codePointAt(0)! - 65 + 0x1F1E6;
  const b = upper.codePointAt(1)! - 65 + 0x1F1E6;
  return String.fromCodePoint(a) + String.fromCodePoint(b);
}

/**
 * 根據訂單 ETA 快照產生延遲原因文案。
 * 規格 8.4 第 4 點：暴雨延遲 / 清關中 等。
 */
export function getDelayReasonText(snapshot: WaimaiEtaSnapshot, currentStatus?: string): string {
  const reasons: string[] = [];

  // 天氣延遲
  if (snapshot.weatherLevel === "storm") {
    reasons.push("⛈️ 暴雨延遲");
  } else if (snapshot.weatherLevel === "rain") {
    reasons.push("🌧️ 雨天延遲");
  }

  // 清關中
  if (currentStatus === "customs") {
    reasons.push("🛃 清關中");
  }

  // 尖峰時段
  if (snapshot.isPeakHour && snapshot.routeType === "local_instant") {
    reasons.push("🕐 尖峰時段");
  }

  return reasons.join("　");
}

/**
 * 產生帶國旗的路由標記文案。
 * 規格 8.4 第 3 點：`本地即時` / `國內配送` / `跨境空運 🇩🇪→🇹🇼`
 */
export function formatRouteLabel(snapshot: WaimaiEtaSnapshot): string {
  if (snapshot.routeType === "local_instant") return "本地即時";
  if (snapshot.routeType === "domestic") return "國內配送";

  const originFlag = countryCodeToFlag(snapshot.originCountry);
  const destFlag = countryCodeToFlag(snapshot.destinationCountry);
  return `跨境空運 ${originFlag}→${destFlag}`;
}
