import { computeWaimaiEta, countryCodeToFlag, decideRouteType, formatRouteLabel, getDelayReasonText, haversineKm, isPeakHour } from "../waimaiEta";
import type { WaimaiItemLogisticsMeta } from "@/types/waimaiDelivery";

const fixedNow = new Date("2026-03-04T08:00:00.000Z").getTime();
const fixedRandom = () => 0.5;

describe("waimaiEta - 邊界情境", () => {
  it("無座標時，food 應走 local_instant 且 distanceKm 為 undefined", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "local",
      originCountry: "TW",
      prepMinutesRange: [12, 20],
    };

    const eta = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(eta.routeType).toBe("local_instant");
    expect(eta.distanceKm).toBeUndefined();
    expect(eta.totalMinutes).toBeGreaterThan(0);
    expect(eta.breakdown.customsMinutes).toBe(0);
    expect(eta.breakdown.lastMileMinutes).toBe(0);
  });

  it("同國應為 domestic，跨國應為 cross_border", () => {
    expect(decideRouteType("kind", "TW", "tw")).toBe("domestic");
    expect(decideRouteType("kind", "TW", "JP")).toBe("cross_border");
  });

  it("同樣條件下，storm 應比 clear 有更長總耗時（domestic）", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "domestic",
      originCountry: "TW",
      prepHoursRange: [4, 8],
    };

    const clearEta = computeWaimaiEta({
      section: "kind",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const stormEta = computeWaimaiEta({
      section: "kind",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "storm",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(clearEta.routeType).toBe("domestic");
    expect(stormEta.routeType).toBe("domestic");
    expect(stormEta.totalMinutes).toBeGreaterThan(clearEta.totalMinutes);
  });

  it("跨境情境應有 customs 分段，且 storm 會拉長時效", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "cross_border",
      originCountry: "TW",
      prepHoursRange: [12, 24],
    };

    const clearEta = computeWaimaiEta({
      section: "spicy",
      logisticsMeta,
      destinationCountry: "BR",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const stormEta = computeWaimaiEta({
      section: "spicy",
      logisticsMeta,
      destinationCountry: "BR",
      weatherLevel: "storm",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(clearEta.routeType).toBe("cross_border");
    expect(clearEta.breakdown.customsMinutes).toBeGreaterThan(0);
    expect(stormEta.totalMinutes).toBeGreaterThan(clearEta.totalMinutes);
  });
});

describe("waimaiEta - 本地即時外送進階", () => {
  it("尖峰時段應比非尖峰有更長配送時間", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "local",
      originCountry: "TW",
      prepMinutesRange: [12, 20],
    };

    const offPeak = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const peak = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: true,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(peak.totalMinutes).toBeGreaterThan(offPeak.totalMinutes);
    expect(peak.isPeakHour).toBe(true);
    expect(offPeak.isPeakHour).toBe(false);
  });

  it("有座標時應計算 distanceKm", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "local",
      originCountry: "TW",
      originLat: 25.033,
      originLon: 121.565,
      prepMinutesRange: [12, 20],
    };

    const eta = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      destinationLat: 25.042,
      destinationLon: 121.543,
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(eta.distanceKm).toBeDefined();
    expect(eta.distanceKm!).toBeGreaterThan(0);
    expect(eta.distanceKm!).toBeLessThan(5);
  });

  it("storm 天氣應大幅增加本地配送時間", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "local",
      originCountry: "TW",
      prepMinutesRange: [12, 20],
    };

    const clear = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const storm = computeWaimaiEta({
      section: "food",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "storm",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(storm.totalMinutes).toBeGreaterThan(clear.totalMinutes);
    expect(storm.weatherLevel).toBe("storm");
  });
});

describe("waimaiEta - 跨境進階", () => {
  it("低成熟度國家（BR）應比高成熟度國家（JP）有更長 ETA", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "cross_border",
      originCountry: "TW",
      prepHoursRange: [12, 24],
    };

    const toJP = computeWaimaiEta({
      section: "kind",
      logisticsMeta,
      destinationCountry: "JP",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const toBR = computeWaimaiEta({
      section: "kind",
      logisticsMeta,
      destinationCountry: "BR",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(toBR.totalMinutes).toBeGreaterThan(toJP.totalMinutes);
    expect(toBR.breakdown.customsMinutes).toBeGreaterThan(toJP.breakdown.customsMinutes);
  });

  it("未列入國家應使用 DEFAULT_FACTOR fallback", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "cross_border",
      originCountry: "TW",
      prepHoursRange: [12, 24],
    };

    const eta = computeWaimaiEta({
      section: "kind",
      logisticsMeta,
      destinationCountry: "ZZ",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(eta.routeType).toBe("cross_border");
    expect(eta.destinationCountry).toBe("ZZ");
    expect(eta.totalMinutes).toBeGreaterThan(0);
    expect(eta.breakdown.customsMinutes).toBeGreaterThan(0);
  });

  it("ETA 快照時間窗口應合理（start < estimated < end）", () => {
    const logisticsMeta: WaimaiItemLogisticsMeta = {
      logisticsType: "cross_border",
      originCountry: "DE",
      prepHoursRange: [12, 48],
    };

    const eta = computeWaimaiEta({
      section: "spicy",
      logisticsMeta,
      destinationCountry: "TW",
      weatherLevel: "rain",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(eta.etaWindowStartAt).toBeLessThan(eta.estimatedDeliveryAt);
    expect(eta.estimatedDeliveryAt).toBeLessThanOrEqual(eta.etaWindowEndAt);
    expect(eta.etaWindowStartAt).toBeGreaterThan(fixedNow);
  });
});

describe("waimaiEta - 工具函式", () => {
  it("isPeakHour 應正確判斷午餐與晚餐尖峰", () => {
    const lunch = new Date("2026-03-04T12:00:00.000+08:00").getTime();
    const dinner = new Date("2026-03-04T18:30:00.000+08:00").getTime();
    const offPeak = new Date("2026-03-04T15:00:00.000+08:00").getTime();

    expect(isPeakHour(lunch)).toBe(true);
    expect(isPeakHour(dinner)).toBe(true);
    expect(isPeakHour(offPeak)).toBe(false);
  });

  it("haversineKm 應回傳合理距離", () => {
    // 台北 101 到台北車站 ≈ 3km
    const d = haversineKm(25.0339, 121.5645, 25.0478, 121.5170);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(6);
  });

  it("countryCodeToFlag 應正確轉換", () => {
    expect(countryCodeToFlag("TW")).toBe("🇹🇼");
    expect(countryCodeToFlag("JP")).toBe("🇯🇵");
    expect(countryCodeToFlag("US")).toBe("🇺🇸");
    expect(countryCodeToFlag("")).toBe("");
    expect(countryCodeToFlag("X")).toBe("");
  });

  it("getDelayReasonText 應根據天氣和狀態產生文案", () => {
    const baseEta = computeWaimaiEta({
      section: "kind",
      logisticsMeta: { logisticsType: "cross_border", originCountry: "TW" },
      destinationCountry: "JP",
      weatherLevel: "storm",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const text = getDelayReasonText(baseEta, "customs");
    expect(text).toContain("暴雨延遲");
    expect(text).toContain("清關中");
  });

  it("getDelayReasonText clear 天氣無延遲原因", () => {
    const baseEta = computeWaimaiEta({
      section: "kind",
      logisticsMeta: { logisticsType: "cross_border", originCountry: "TW" },
      destinationCountry: "JP",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const text = getDelayReasonText(baseEta, "in_transit");
    expect(text).toBe("");
  });

  it("formatRouteLabel 跨境應帶國旗", () => {
    const eta = computeWaimaiEta({
      section: "kind",
      logisticsMeta: { logisticsType: "cross_border", originCountry: "DE" },
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    const label = formatRouteLabel(eta);
    expect(label).toContain("跨境空運");
    expect(label).toContain("🇩🇪");
    expect(label).toContain("🇹🇼");
  });

  it("formatRouteLabel 本地應回傳「本地即時」", () => {
    const eta = computeWaimaiEta({
      section: "food",
      logisticsMeta: { logisticsType: "local", originCountry: "TW" },
      destinationCountry: "TW",
      weatherLevel: "clear",
      isPeakHour: false,
      now: fixedNow,
      random: fixedRandom,
    });

    expect(formatRouteLabel(eta)).toBe("本地即時");
  });
});
