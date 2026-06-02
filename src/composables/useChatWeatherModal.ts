import { WORLD_CITIES, type CityEntry } from "@/data/worldCities";
import { useWeatherStore } from "@/stores/weather";
import { computed, ref, type Ref } from "vue";

interface WmSavedCity {
  name: string;
  region?: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export function useChatWeatherModal(context: {
  currentCharacter: Ref<any>;
  weatherStore: ReturnType<typeof useWeatherStore>;
  customWeatherData: Ref<any>;
  charWeatherData: Ref<any>;
  charWeatherLoading: Ref<boolean>;
  chatLocationOverride: Ref<any>;
  weatherSendTarget: Ref<string>;
  weatherSearchQuery: Ref<string>;
  weatherPreview: Ref<any>;
  selectWeatherCity: (city: any, opts?: any) => Promise<void>;
  startWeatherEdit: (target: "user" | "char") => void;
  cancelWeatherEdit: () => void;
  resetChatLocationOverride: () => Promise<void>;
  saveChatImmediate: () => Promise<void>;
  formatFullLocation: (loc: any) => string;
  showToast?: (msg: string) => void;
}) {
  const wmCountry = ref<string>("");
  const wmSavedCities = ref<WmSavedCity[]>([]);
  const wmKeepInThisChat = ref<boolean>(false);
  const weatherCitySheetTarget = ref<"user" | "char" | null>(null);
  const weatherPreviewExpanded = ref<boolean>(false);

  const wmCountryOptions = computed(() => Object.keys(WORLD_CITIES));

  function detectCountryKey(...candidates: (string | undefined | null)[]): string {
    const keys = Object.keys(WORLD_CITIES);
    for (const cand of candidates) {
      if (!cand) continue;
      const trimmed = cand.trim();
      if (!trimmed) continue;
      if (keys.includes(trimmed)) return trimmed;
      const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      for (let i = parts.length - 1; i >= 0; i--) {
        if (keys.includes(parts[i])) return parts[i];
      }
    }
    return "";
  }

  function wmFormatCityLabel(name: string, region?: string, country?: string): string {
    return context.formatFullLocation({ name, region, country });
  }

  function loadWmSavedCities() {
    const saved = localStorage.getItem("weather_custom_cities");
    if (!saved) { wmSavedCities.value = []; return; }
    try {
      const parsed = JSON.parse(saved);
      let migrated = false;
      wmSavedCities.value = parsed.map((c: string | WmSavedCity): WmSavedCity => {
        const base: WmSavedCity =
          typeof c === "string"
            ? { name: c }
            : { name: c.name, region: c.region, country: c.country, lat: c.lat, lon: c.lon };
        if (!base.country && base.name?.includes(",")) {
          const detected = detectCountryKey(base.name);
          if (detected) {
            base.country = detected;
            const cleaned = base.name.split(",").map((s) => s.trim()).filter((s) => s && s !== detected).join(", ");
            if (cleaned) base.name = cleaned;
            migrated = true;
          }
        }
        return base;
      });
      if (migrated) saveWmSavedCities();
    } catch {
      wmSavedCities.value = [];
    }
  }

  function saveWmSavedCities() {
    try {
      localStorage.setItem("weather_custom_cities", JSON.stringify(wmSavedCities.value));
    } catch (e) {
      console.warn("[天氣] 無法保存我的城市", e);
    }
  }

  function openWeatherCitySheet(target: "user" | "char") {
    weatherCitySheetTarget.value = target;
    context.startWeatherEdit(target);
    context.weatherSearchQuery.value = "";
    if (target === "char") {
      const charLoc = context.currentCharacter.value?.worldSettings?.location;
      wmCountry.value = detectCountryKey(
        context.charWeatherData.value?.location.country,
        context.charWeatherData.value?.location.region,
        charLoc,
      );
    } else {
      wmCountry.value = detectCountryKey(
        context.customWeatherData.value?.location.country,
        context.customWeatherData.value?.location.region,
        context.weatherStore.weatherData?.location.country,
        context.weatherStore.weatherData?.location.region,
        context.weatherStore.userLocation?.city,
      );
    }
  }

  function closeWeatherCitySheet() {
    weatherCitySheetTarget.value = null;
    context.cancelWeatherEdit();
  }

  async function onWmKeepInThisChatChange(next: boolean) {
    wmKeepInThisChat.value = next;
    if (!next && context.chatLocationOverride.value) {
      await context.resetChatLocationOverride();
    }
  }

  async function applyUserChatLocationOverride(city: {
    name: string; region?: string; country?: string; lat?: number; lon?: number;
  }) {
    const cityLabel = wmFormatCityLabel(city.name, city.region, city.country) || city.name;
    context.chatLocationOverride.value = {
      mode: city.lat !== undefined && city.lon !== undefined ? "browser" : "manual",
      city: cityLabel,
      lat: city.lat,
      lon: city.lon,
    };
    await context.saveChatImmediate();
  }

  function upsertMyCity(entry: WmSavedCity) {
    if (!entry.name) return;
    const idx = wmSavedCities.value.findIndex((c) => c.name === entry.name);
    const next: WmSavedCity = {
      name: entry.name,
      region: entry.region || undefined,
      country: entry.country || undefined,
      lat: entry.lat,
      lon: entry.lon,
    };
    if (idx >= 0) wmSavedCities.value.splice(idx, 1, next);
    else wmSavedCities.value.push(next);
    saveWmSavedCities();
  }

  async function selectWmWorldCity(city: CityEntry, country: string) {
    if (!country) {
      context.showToast?.("請先選擇國家/地區");
      return;
    }
    const isUserChatScope = weatherCitySheetTarget.value === "user" && wmKeepInThisChat.value;
    await context.selectWeatherCity(
      { id: 0, name: city.name, region: "", country, lat: city.lat, lon: city.lon },
      { skipGlobalUserUpdate: isUserChatScope },
    );
    if (isUserChatScope) await applyUserChatLocationOverride({ name: city.name, country, lat: city.lat, lon: city.lon });
    upsertMyCity({ name: city.name, country, lat: city.lat, lon: city.lon });
    closeWeatherCitySheet();
  }

  async function selectWmSavedCity(c: WmSavedCity) {
    if (c.lat === undefined || c.lon === undefined) return;
    if (!c.country) {
      context.showToast?.("此城市缺少國家資訊，請從下方選擇國家/地區後重新選擇此城市");
      wmCountry.value = "";
      return;
    }
    const isUserChatScope = weatherCitySheetTarget.value === "user" && wmKeepInThisChat.value;
    await context.selectWeatherCity(
      { id: 0, name: c.name, region: c.region || "", country: c.country, lat: c.lat, lon: c.lon },
      { skipGlobalUserUpdate: isUserChatScope },
    );
    if (isUserChatScope) await applyUserChatLocationOverride({ name: c.name, region: c.region, country: c.country, lat: c.lat, lon: c.lon });
    closeWeatherCitySheet();
  }

  async function selectWmSearchResult(city: { name: string; region: string; country: string; lat: number; lon: number }) {
    if (!city.country && !wmCountry.value) {
      context.showToast?.("請先在上方選擇國家/地區");
      return;
    }
    const country = city.country || wmCountry.value;
    const matchedKey = detectCountryKey(country);
    if (matchedKey) wmCountry.value = matchedKey;
    const isUserChatScope = weatherCitySheetTarget.value === "user" && wmKeepInThisChat.value;
    await context.selectWeatherCity(
      { id: 0, name: city.name, region: city.region || "", country, lat: city.lat, lon: city.lon },
      { skipGlobalUserUpdate: isUserChatScope },
    );
    if (isUserChatScope) await applyUserChatLocationOverride({ name: city.name, region: city.region, country, lat: city.lat, lon: city.lon });
    upsertMyCity({ name: city.name, region: city.region, country, lat: city.lat, lon: city.lon });
    closeWeatherCitySheet();
  }

  const weatherCanSend = computed(() => {
    const hasUser = !!(context.customWeatherData.value || context.weatherStore.weatherData);
    const hasChar = !!context.charWeatherData.value;
    if (context.weatherSendTarget.value === "user") return hasUser;
    if (context.weatherSendTarget.value === "char") return hasChar;
    return hasUser || hasChar;
  });

  const weatherSendTargetOptions = computed(() => {
    const hasUser = !!(context.customWeatherData.value || context.weatherStore.weatherData);
    const hasChar = !!context.charWeatherData.value;
    return [
      { value: "both", label: "雙方", disabled: !(hasUser && hasChar) },
      { value: "user", label: "只發我", disabled: !hasUser },
      { value: "char", label: "只發角色", disabled: !hasChar },
    ] as const;
  });

  const weatherTimeDiffSummary = computed(() => context.weatherPreview.value?.diffSummary || "");

  async function refreshWeatherInModal() {
    await context.weatherStore.refreshWeather(true);
    const charLocation = context.currentCharacter.value?.worldSettings?.location;
    if (charLocation) {
      context.charWeatherLoading.value = true;
      try {
        const fresh = await import("@/services/WeatherService").then((m) =>
          m.getWeatherByCity(charLocation),
        );
        context.charWeatherData.value = fresh;
      } catch (e) {
        console.warn("[天氣] 角色天氣重抓失敗", e);
      } finally {
        context.charWeatherLoading.value = false;
      }
    }
  }

  return {
    wmCountry,
    wmSavedCities,
    wmKeepInThisChat,
    weatherCitySheetTarget,
    weatherPreviewExpanded,
    wmCountryOptions,
    detectCountryKey,
    wmFormatCityLabel,
    loadWmSavedCities,
    saveWmSavedCities,
    openWeatherCitySheet,
    closeWeatherCitySheet,
    onWmKeepInThisChatChange,
    applyUserChatLocationOverride,
    upsertMyCity,
    selectWmWorldCity,
    selectWmSavedCity,
    selectWmSearchResult,
    weatherCanSend,
    weatherSendTargetOptions,
    weatherTimeDiffSummary,
    refreshWeatherInModal,
  };
}
