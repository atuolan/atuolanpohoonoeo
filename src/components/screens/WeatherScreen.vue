<script setup lang="ts">
import { WORLD_CITIES, type CityEntry } from "@/data/worldCities";
import { type LocationMode } from "@/services/WeatherService";
import { useSettingsStore } from "@/stores/settings";
import { useWeatherStore } from "@/stores/weather";
import {
  ArrowLeft,
  Check,
  Cloud,
  Loader2,
  MapPin,
  Navigation,
  Plus,
  RefreshCw,
  Trash2,
  Wifi,
} from "lucide-vue-next";
import Button from "primevue/button";
import Card from "primevue/card";
import InputNumber from "primevue/inputnumber";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { computed, onMounted, ref, watch } from "vue";

const emit = defineEmits<{ back: [] }>();

const weatherStore = useWeatherStore();
const settingsStore = useSettingsStore();

// 附近地點設定 v-model（InputNumber 用）
const nearbyLimitModel = computed({
  get: () => settingsStore.nearbyPlacesLimit,
  set: (v: number) => {
    settingsStore.nearbyPlacesLimit = Math.min(30, Math.max(5, v || 5));
    void settingsStore.saveSettings();
  },
});
const nearbyRadiusModel = computed({
  get: () => settingsStore.nearbyPlacesRadius,
  set: (v: number) => {
    settingsStore.nearbyPlacesRadius = Math.min(100, Math.max(10, v || 10));
    void settingsStore.saveSettings();
  },
});

// 國家選項清單
const countryOptions = computed(() => Object.keys(WORLD_CITIES));

// 已儲存城市列表（含精確座標）
interface SavedCity { name: string; lat?: number; lon?: number; }
const customCities = ref<SavedCity[]>([]);

// 當前選擇的定位模式
const selectedMode = ref<LocationMode>(weatherStore.userLocation.mode);

// 載入已儲存城市（相容舊版 string[] 格式）
onMounted(() => {
  const saved = localStorage.getItem("weather_custom_cities");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      customCities.value = parsed.map((c: string | SavedCity) =>
        typeof c === "string" ? { name: c } : c,
      );
    } catch {
      customCities.value = [];
    }
  }
  // 如果還沒有天氣數據，嘗試載入
  if (!weatherStore.hasWeatherData) {
    weatherStore.refreshWeather().catch(() => {
      // 錯誤已在 store 中處理
    });
  }
});

watch(
  () => weatherStore.userLocation.mode,
  (mode) => {
    selectedMode.value = mode;
  },
  { immediate: true },
);

// 保存自訂城市
function saveCustomCities() {
  localStorage.setItem(
    "weather_custom_cities",
    JSON.stringify(customCities.value),
  );
}

// 添加當前位置到已儲存城市
function addCurrentCity() {
  const loc = weatherStore.userLocation;
  const name = weatherStore.locationName || loc.city || "";
  if (!name) return;
  if (customCities.value.some((c) => c.name === name)) return;
  customCities.value.push({ name, lat: loc.lat, lon: loc.lon });
  saveCustomCities();
}

// 刪除已儲存城市
function removeCustomCity(city: SavedCity) {
  customCities.value = customCities.value.filter((c) => c.name !== city.name);
  saveCustomCities();
}

// 選擇已儲存城市
async function selectCustomCity(city: SavedCity) {
  await weatherStore.setManualCity(city.name, city.lat, city.lon);
  selectedMode.value = "manual";
  await weatherStore.refreshWeather(true);
}

// 國家/城市瀏覽選擇器
const openCountry = ref<string>("");

async function selectCityFromBrowse(city: CityEntry, country: string) {
  const label = `${city.name}, ${country}`;
  await weatherStore.setManualCity(label, city.lat, city.lon);
  selectedMode.value = "manual";
  await weatherStore.refreshWeather(true);
}

// 切換定位模式
async function setMode(mode: LocationMode) {
  selectedMode.value = mode;
  try {
    await weatherStore.setLocationMode(mode);
    // 手動模式下如果還沒設定城市，不要立即刷新
    if (mode === "manual" && !weatherStore.userLocation.city) return;
    await weatherStore.refreshWeather(true);
  } catch (e) {
    console.error("切換定位模式失敗", e);
  }
}

// 刷新天氣
async function refresh() {
  try {
    await weatherStore.refreshWeather(true);
  } catch {
    // 錯誤已在 store 中處理
  }
}

// 格式化更新時間
const lastUpdateText = computed(() => {
  if (!weatherStore.lastUpdateTime) return "";
  const diff = Date.now() - weatherStore.lastUpdateTime;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "剛剛更新";
  if (minutes < 60) return `${minutes} 分鐘前更新`;
  const hours = Math.floor(minutes / 60);
  return `${hours} 小時前更新`;
});

// 當前位置是否已在儲存列表中
const isCurrentCityInList = computed(() => {
  const name = weatherStore.locationName || weatherStore.userLocation.city || "";
  return !!name && customCities.value.some((c) => c.name === name);
});

// 當前城市是否為自訂城市
const isCurrentCityCustom = computed(() => {
  return (
    selectedMode.value === "manual" &&
    weatherStore.userLocation.city &&
    customCities.value.some((c) => c.name === weatherStore.userLocation.city)
  );
});
</script>

<template>
  <div class="weather-screen">
    <!-- 頂部導航 -->
    <header class="screen-header">
      <Button text rounded severity="secondary" class="header-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </Button>
      <h1>天氣設定</h1>
      <Button text rounded severity="secondary" class="header-btn" @click="refresh" :disabled="weatherStore.isLoading">
        <RefreshCw :size="20" :class="{ spinning: weatherStore.isLoading }" />
      </Button>
    </header>

    <div class="screen-content">

      <!-- 錯誤 -->
      <Card class="status-card error-card" v-if="weatherStore.error">
        <template #content>
          <div class="status-inner">
            <Cloud :size="32" />
            <span>{{ weatherStore.error }}</span>
            <Button label="重試" severity="danger" size="small" @click="refresh" />
          </div>
        </template>
      </Card>

      <!-- 當前天氣卡片 -->
      <div class="weather-gradient-wrap" v-else-if="weatherStore.hasWeatherData">
        <div class="weather-location">
          <MapPin :size="15" />
          <span>{{ weatherStore.locationName }}</span>
        </div>
        <div class="weather-temp">{{ Math.round(weatherStore.currentTemp || 0) }}°C</div>
        <div class="weather-condition">{{ weatherStore.weatherCondition }}</div>
        <div class="weather-details">
          <span>濕度 {{ weatherStore.weatherData?.current.humidity }}%</span>
          <span>體感 {{ weatherStore.weatherData?.current.feelslike_c }}°C</span>
        </div>
        <div class="weather-update">{{ lastUpdateText }}</div>
      </div>

      <!-- 載入中 -->
      <Card class="status-card" v-else-if="weatherStore.isLoading">
        <template #content>
          <div class="status-inner">
            <Loader2 :size="32" class="spinning" />
            <span>載入天氣中...</span>
          </div>
        </template>
      </Card>

      <!-- 定位模式 -->
      <Card class="section-card">
        <template #title>定位方式</template>
        <template #subtitle>建議手動設定城市，IP 定位經常不準確。</template>
        <template #content>
          <div class="mode-options">
            <button class="mode-option" :class="{ active: selectedMode === 'manual' }" @click="setMode('manual')">
              <MapPin :size="20" class="mode-icon" />
              <div class="mode-info">
                <div class="mode-name-row">
                  <span class="mode-name">手動設定城市</span>
                  <Tag value="推薦" severity="success" class="mode-tag" />
                </div>
                <span class="mode-desc">{{ weatherStore.userLocation.city || "從下方選擇城市" }}</span>
              </div>
              <Check v-if="selectedMode === 'manual'" :size="16" class="check-icon" />
            </button>
            <button class="mode-option" :class="{ active: selectedMode === 'browser' }" @click="setMode('browser')">
              <Navigation :size="20" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">GPS 定位</span>
                <span class="mode-desc">使用瀏覽器精確定位（需授權）</span>
              </div>
              <Check v-if="selectedMode === 'browser'" :size="16" class="check-icon" />
            </button>
            <button class="mode-option" :class="{ active: selectedMode === 'ip' }" @click="setMode('ip')">
              <Wifi :size="20" class="mode-icon" />
              <div class="mode-info">
                <span class="mode-name">IP 自動定位</span>
                <span class="mode-desc">根據網路 IP 判斷位置（可能不準確）</span>
              </div>
              <Check v-if="selectedMode === 'ip'" :size="16" class="check-icon" />
            </button>
          </div>
        </template>
      </Card>

      <!-- 按國家/城市瀏覽 -->
      <Card class="section-card">
        <template #title>
          <div class="card-title-row">
            <span>選擇城市</span>
            <Tag value="精確座標" severity="info" />
          </div>
        </template>
        <template #content>
          <Select
            v-model="openCountry"
            :options="countryOptions"
            placeholder="選擇國家/地區..."
            class="country-select-pv"
            filter
            show-clear
          />
          <div class="city-grid" v-if="openCountry && WORLD_CITIES[openCountry]">
            <Button
              v-for="city in WORLD_CITIES[openCountry]"
              :key="city.name"
              size="small"
              :severity="weatherStore.userLocation.city === `${city.name}, ${openCountry}` && selectedMode === 'manual' ? 'success' : 'secondary'"
              :outlined="weatherStore.userLocation.city === `${city.name}, ${openCountry}` && selectedMode === 'manual'"
              :text="!(weatherStore.userLocation.city === `${city.name}, ${openCountry}` && selectedMode === 'manual')"
              class="city-chip-btn"
              @click="selectCityFromBrowse(city, openCountry)"
            >
              <MapPin :size="12" />
              <span>{{ city.name }}</span>
            </Button>
          </div>
        </template>
      </Card>

      <!-- 我的城市 -->
      <Card class="section-card">
        <template #header>
          <div class="my-cities-header">
            <div class="my-cities-title">
              <span>我的城市</span>
              <span class="cities-hint" v-if="weatherStore.locationName">
                點 + 儲存「{{ weatherStore.locationName }}」
              </span>
            </div>
            <Button
              rounded
              size="small"
              :disabled="isCurrentCityInList || !weatherStore.locationName"
              :title="isCurrentCityInList ? '已在列表中' : '將目前位置加入列表'"
              @click="addCurrentCity"
            >
              <Plus :size="16" />
            </Button>
          </div>
        </template>
        <template #content>
          <div class="saved-city-list" v-if="customCities.length > 0">
            <div
              v-for="city in customCities"
              :key="city.name"
              class="saved-city-row"
              :class="{ active: weatherStore.userLocation.city === city.name && selectedMode === 'manual' }"
              @click="selectCustomCity(city)"
            >
              <MapPin :size="15" class="city-pin" />
              <span class="city-label">{{ city.name }}</span>
              <Tag v-if="city.lat" value="精確" severity="info" class="coords-tag" />
              <Button text rounded severity="danger" size="small" @click.stop="removeCustomCity(city)">
                <Trash2 :size="14" />
              </Button>
            </div>
          </div>
          <div class="empty-hint" v-else>
            <MapPin :size="22" />
            <span>尚未儲存城市，選好城市後點 + 快速儲存</span>
          </div>
        </template>
      </Card>

      <!-- 附近地點設定 -->
      <Card class="section-card">
        <template #title>附近地點設定</template>
        <template #subtitle>GPS 定位可用時，AI 角色可參考附近的餐廳、景點等地點。</template>
        <template #content>
          <div class="setting-row">
            <label class="setting-label">注入筆數 <span class="range-hint">（5–30）</span></label>
            <InputNumber v-model="nearbyLimitModel" :min="5" :max="30" :step="1" show-buttons fluid />
          </div>
          <div class="setting-row">
            <label class="setting-label">搜尋半徑 <span class="range-hint">（10–100 公尺）</span></label>
            <InputNumber v-model="nearbyRadiusModel" :min="10" :max="100" :step="10" show-buttons fluid />
          </div>
        </template>
      </Card>

    </div>
  </div>
</template>

<style lang="scss" scoped>
.weather-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-background, #f8f9fa);
}

// ── Header ──────────────────────────────────────────────
.screen-header {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  padding-top: max(12px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);

  h1 {
    flex: 1;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
    color: var(--color-text, #333);
  }

  .header-btn {
    width: 40px;
    height: 40px;
  }
}

// ── Content ─────────────────────────────────────────────
.screen-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

// ── Weather gradient card ────────────────────────────────
.weather-gradient-wrap {
  background: linear-gradient(135deg, #89cff0 0%, #a8d8ea 100%);
  border-radius: 18px;
  padding: 24px 20px;
  color: #1f2937;
  text-align: center;

  .weather-location {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    font-size: 13px;
    opacity: 0.75;
    margin-bottom: 6px;
  }

  .weather-temp {
    font-size: 52px;
    font-weight: 200;
    line-height: 1;
    margin: 6px 0;
  }

  .weather-condition {
    font-size: 15px;
    margin-bottom: 12px;
  }

  .weather-details {
    display: flex;
    justify-content: center;
    gap: 18px;
    font-size: 13px;
    opacity: 0.75;
  }

  .weather-update {
    margin-top: 10px;
    font-size: 11px;
    opacity: 0.55;
  }
}

// ── Status cards (error / loading) ──────────────────────
.status-card {
  :deep(.p-card-body) { padding: 16px; }

  .status-inner {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px 0;
    color: var(--color-text-secondary, #666);
  }

  &.error-card .status-inner { color: #e53e3e; }
}

// ── Section cards (PrimeVue Card) ────────────────────────
.section-card {
  :deep(.p-card-title) {
    font-size: 15px;
    font-weight: 600;
  }
  :deep(.p-card-subtitle) {
    font-size: 12px;
  }
  :deep(.p-card-body) {
    padding: 14px 16px;
  }
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

// ── Mode options ─────────────────────────────────────────
.mode-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--color-background, #f8f9fa);
  border: 1.5px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.18s;

  &:hover { background: var(--color-hover, #f0f0f0); }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);
  }

  .mode-icon { flex-shrink: 0; color: var(--color-text-secondary, #888); }

  .mode-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .mode-name-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .mode-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text, #333);
  }

  .mode-tag { font-size: 10px; }

  .mode-desc {
    font-size: 11px;
    color: var(--color-text-secondary, #999);
  }

  .check-icon { flex-shrink: 0; color: var(--color-primary, #7dd3a8); }
}

// ── Country Select (PrimeVue) ────────────────────────────
.country-select-pv {
  width: 100%;
  margin-bottom: 12px;
}

// ── City chip grid ───────────────────────────────────────
.city-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.city-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  white-space: nowrap;
}

// ── My Cities header ─────────────────────────────────────
.my-cities-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 0;

  .my-cities-title {
    display: flex;
    flex-direction: column;
    gap: 2px;

    > span:first-child {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text, #333);
    }

    .cities-hint {
      font-size: 11px;
      color: var(--color-text-secondary, #999);
    }
  }
}

// ── Saved city list ──────────────────────────────────────
.saved-city-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.saved-city-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--color-background, #f8f9fa);
  border-radius: 10px;
  cursor: pointer;
  border: 1.5px solid transparent;
  transition: all 0.18s;

  &:hover { background: var(--color-hover, #f0f0f0); }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);
  }

  .city-pin { flex-shrink: 0; color: var(--color-text-secondary, #aaa); }

  .city-label {
    flex: 1;
    font-size: 14px;
    color: var(--color-text, #333);
  }

  .coords-tag { font-size: 10px; }
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--color-text-secondary, #aaa);
  font-size: 13px;
  text-align: center;
}

// ── Nearby settings ──────────────────────────────────────
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.07));
  gap: 12px;

  &:last-child { border-bottom: none; }
}

.setting-label {
  font-size: 14px;
  color: var(--color-text, #333);
  flex-shrink: 0;

  .range-hint {
    font-size: 11px;
    opacity: 0.55;
    margin-left: 4px;
  }
}

// ── Spinner ──────────────────────────────────────────────
.spinning { animation: spin 1s linear infinite; }

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

</style>
