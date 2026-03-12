/**
 * 天氣狀態管理
 */

import { DB_STORES, db } from "@/db/database";
import {
    type LocationMode,
    type UserLocation,
    type WeatherData,
    getBrowserLocation,
    getWeatherAdvice,
    getWeatherByUserLocation,
    getWeatherDescription,
} from "@/services/WeatherService";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";

const CACHE_DURATION = 30 * 60 * 1000; // 30分鐘緩存
const LOCATION_STORAGE_KEY = "weather-user-location";

interface WeatherCache {
  data: WeatherData;
  timestamp: number;
  location: UserLocation;
}

export const useWeatherStore = defineStore("weather", () => {
  // ===== 狀態 =====
  const weatherData = ref<WeatherData | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const lastUpdateTime = ref<number | null>(null);
  const locationLoaded = ref(false);

  // 用戶位置設置
  const userLocation = ref<UserLocation>({
    mode: "ip", // 默認使用 IP 定位
  });

  // ===== 持久化 =====

  /** 從 IndexedDB 載入用戶位置設置 */
  async function loadLocationFromDB() {
    try {
      const stored = await db.get<UserLocation>(
        DB_STORES.SETTINGS,
        LOCATION_STORAGE_KEY,
      );
      if (stored) {
        userLocation.value = stored;
      }
    } catch (e) {
      console.error("[WeatherStore] 載入位置設定失敗:", e);
    } finally {
      locationLoaded.value = true;
    }
  }

  /** 將用戶位置設置保存到 IndexedDB */
  async function saveLocationToDB() {
    try {
      const plain = JSON.parse(JSON.stringify(userLocation.value));
      await db.put(DB_STORES.SETTINGS, plain, LOCATION_STORAGE_KEY);
    } catch (e) {
      console.error("[WeatherStore] 儲存位置設定失敗:", e);
    }
  }

  // 監聽 userLocation 變化自動保存
  watch(
    userLocation,
    () => {
      if (locationLoaded.value) {
        saveLocationToDB();
      }
    },
    { deep: true },
  );

  // 初始化時載入
  loadLocationFromDB();

  // ===== 計算屬性 =====
  const hasWeatherData = computed(() => weatherData.value !== null);

  const currentTemp = computed(() => weatherData.value?.current.temp_c ?? null);

  const weatherCondition = computed(
    () => weatherData.value?.current.condition.text ?? "",
  );

  const weatherIcon = computed(
    () => weatherData.value?.current.condition.icon ?? "",
  );

  const locationName = computed(() => {
    if (!weatherData.value) return "";
    const { name, region } = weatherData.value.location;
    return region ? `${name}, ${region}` : name;
  });

  const weatherAdviceText = computed(() =>
    weatherData.value ? getWeatherAdvice(weatherData.value) : "",
  );

  const weatherDescriptionText = computed(() =>
    weatherData.value ? getWeatherDescription(weatherData.value) : "",
  );

  const isCacheValid = computed(() => {
    if (!lastUpdateTime.value) return false;
    return Date.now() - lastUpdateTime.value < CACHE_DURATION;
  });

  // 預報數據
  const forecast = computed(
    () => weatherData.value?.forecast?.forecastday ?? [],
  );

  // ===== 方法 =====

  /**
   * 設置定位模式
   */
  async function setLocationMode(mode: LocationMode, city?: string) {
    userLocation.value.mode = mode;

    if (mode === "manual" && city) {
      userLocation.value.city = city;
    }

    if (mode === "browser") {
      try {
        const coords = await getBrowserLocation();
        userLocation.value.lat = coords.lat;
        userLocation.value.lon = coords.lon;
      } catch (err) {
        error.value = err instanceof Error ? err.message : "獲取位置失敗";
        throw err;
      }
    }
  }

  /**
   * 設置手動城市
   */
  function setManualCity(city: string) {
    userLocation.value.mode = "manual";
    userLocation.value.city = city;
  }

  /**
   * 刷新天氣數據
   */
  async function refreshWeather(forceRefresh = false) {
    if (!forceRefresh && isCacheValid.value && weatherData.value) {
      return;
    }

    isLoading.value = true;
    error.value = null;

    try {
      const data = await getWeatherByUserLocation(userLocation.value);
      weatherData.value = data;
      lastUpdateTime.value = Date.now();
    } catch (err) {
      error.value = err instanceof Error ? err.message : "獲取天氣失敗";
      console.error("獲取天氣失敗", err);
      throw err;
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 清除緩存
   */
  function clearCache() {
    weatherData.value = null;
    lastUpdateTime.value = null;
  }

  return {
    // 狀態
    weatherData,
    isLoading,
    error,
    lastUpdateTime,
    userLocation,

    // 計算屬性
    hasWeatherData,
    currentTemp,
    weatherCondition,
    weatherIcon,
    locationName,
    weatherAdviceText,
    weatherDescriptionText,
    isCacheValid,
    forecast,

    // 方法
    setLocationMode,
    setManualCity,
    refreshWeather,
    clearCache,
  };
});
