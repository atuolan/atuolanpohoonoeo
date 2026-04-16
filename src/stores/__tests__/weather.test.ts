import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dbGetMock = vi.fn();
const dbPutMock = vi.fn();
const getWeatherByUserLocationMock = vi.fn();
const getBrowserLocationMock = vi.fn();
const getWeatherAdviceMock = vi.fn();
const getWeatherDescriptionMock = vi.fn();

vi.mock("@/db/database", () => ({
  DB_STORES: {
    SETTINGS: "settings",
  },
  db: {
    get: dbGetMock,
    put: dbPutMock,
  },
}));

vi.mock("@/services/WeatherService", () => ({
  getBrowserLocation: getBrowserLocationMock,
  getWeatherAdvice: getWeatherAdviceMock,
  getWeatherByUserLocation: getWeatherByUserLocationMock,
  getWeatherDescription: getWeatherDescriptionMock,
}));

describe("weather store regressions", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    dbGetMock.mockReset();
    dbPutMock.mockReset();
    getWeatherByUserLocationMock.mockReset();
    getBrowserLocationMock.mockReset();
    getWeatherAdviceMock.mockReset();
    getWeatherDescriptionMock.mockReset();
    getWeatherAdviceMock.mockReturnValue("");
    getWeatherDescriptionMock.mockReturnValue("");
  });

  it("waits for persisted location before refreshing weather", async () => {
    let releaseStoredLocationLoad: (() => void) | null = null;
    dbGetMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseStoredLocationLoad = () =>
            resolve({
              mode: "manual",
              city: "Taipei",
              lat: 25.03,
              lon: 121.56,
            });
        }),
    );

    getWeatherByUserLocationMock.mockResolvedValue({
      location: {
        name: "Taipei",
        region: "Taiwan",
        country: "Taiwan",
        lat: 25.03,
        lon: 121.56,
        localtime: "2026-04-16 14:00",
      },
      current: {
        temp_c: 29,
        temp_f: 84.2,
        feelslike_c: 32,
        condition: {
          text: "晴天",
          icon: "",
          code: 1000,
        },
        humidity: 70,
        wind_kph: 10,
        wind_dir: "SE",
        pressure_mb: 1008,
        uv: 7,
      },
    });

    const { useWeatherStore } = await import("../weather");
    const store = useWeatherStore();
    const refreshPromise = store.refreshWeather(true);

    await Promise.resolve();
    expect(getWeatherByUserLocationMock).not.toHaveBeenCalled();

    const releaseFn = releaseStoredLocationLoad;
    if (!releaseFn) {
      throw new Error("expected persisted location loader to be pending");
    }

    releaseFn();

    await refreshPromise;

    expect(getWeatherByUserLocationMock).toHaveBeenCalledTimes(1);
    expect(getWeatherByUserLocationMock).toHaveBeenCalledWith({
      mode: "manual",
      city: "Taipei",
      lat: 25.03,
      lon: 121.56,
    });
  });

  it("clears stale coordinates when manual city is set without lat lon", async () => {
    dbGetMock.mockResolvedValue({
      mode: "browser",
      city: "Tokyo",
      lat: 35.68,
      lon: 139.76,
    });
    getWeatherByUserLocationMock.mockResolvedValue({
      location: {
        name: "Osaka",
        region: "Osaka",
        country: "Japan",
        lat: 34.69,
        lon: 135.5,
        localtime: "2026-04-16 14:00",
      },
      current: {
        temp_c: 23,
        temp_f: 73.4,
        feelslike_c: 24,
        condition: {
          text: "多雲",
          icon: "",
          code: 1003,
        },
        humidity: 66,
        wind_kph: 12,
        wind_dir: "E",
        pressure_mb: 1012,
        uv: 4,
      },
    });

    const { useWeatherStore } = await import("../weather");
    const store = useWeatherStore();

    await store.loadLocationFromDB();
    await store.setManualCity("Osaka");
    await store.refreshWeather(true);

    expect(store.userLocation).toEqual({
      mode: "manual",
      city: "Osaka",
    });
    expect(getWeatherByUserLocationMock).toHaveBeenLastCalledWith({
      mode: "manual",
      city: "Osaka",
    });
  });
});
