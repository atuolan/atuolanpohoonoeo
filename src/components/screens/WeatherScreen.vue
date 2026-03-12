<script setup lang="ts">
import { searchCities, type LocationMode } from "@/services/WeatherService";
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
    Search,
    Trash2,
    Wifi,
    X,
} from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";

const emit = defineEmits<{
  back: [];
}>();

const weatherStore = useWeatherStore();

// 搜尋相關
const searchQuery = ref("");
const searchResults = ref<
  Array<{ id: number; name: string; region: string; country: string }>
>([]);
const isSearching = ref(false);
const showSearchResults = ref(false);

// 自訂城市列表
const customCities = ref<string[]>([]);
const showAddCity = ref(false);
const newCityName = ref("");

// 當前選擇的定位模式
const selectedMode = ref<LocationMode>(weatherStore.userLocation.mode);

// 載入自訂城市
onMounted(() => {
  const saved = localStorage.getItem("weather_custom_cities");
  if (saved) {
    try {
      customCities.value = JSON.parse(saved);
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

// 保存自訂城市
function saveCustomCities() {
  localStorage.setItem(
    "weather_custom_cities",
    JSON.stringify(customCities.value),
  );
}

// 搜尋城市
let searchTimeout: ReturnType<typeof setTimeout> | null = null;
watch(searchQuery, (val) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!val || val.length < 2) {
    searchResults.value = [];
    showSearchResults.value = false;
    return;
  }
  searchTimeout = setTimeout(async () => {
    isSearching.value = true;
    try {
      const results = await searchCities(val);
      searchResults.value = results.slice(0, 8);
      showSearchResults.value = true;
    } catch (e) {
      console.error("搜尋城市失敗", e);
    } finally {
      isSearching.value = false;
    }
  }, 300);
});

// 選擇搜尋結果中的城市
async function selectCity(city: {
  name: string;
  region: string;
  country: string;
}) {
  const cityName = city.region ? `${city.name}, ${city.region}` : city.name;
  weatherStore.setManualCity(cityName);
  selectedMode.value = "manual";
  searchQuery.value = "";
  showSearchResults.value = false;
  await weatherStore.refreshWeather(true);
}

// 添加自訂城市
function addCustomCity() {
  if (!newCityName.value.trim()) return;
  if (!customCities.value.includes(newCityName.value.trim())) {
    customCities.value.push(newCityName.value.trim());
    saveCustomCities();
  }
  newCityName.value = "";
  showAddCity.value = false;
}

// 刪除自訂城市
function removeCustomCity(city: string) {
  customCities.value = customCities.value.filter((c) => c !== city);
  saveCustomCities();
}

// 選擇自訂城市
async function selectCustomCity(city: string) {
  weatherStore.setManualCity(city);
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

// 當前城市是否為自訂城市
const isCurrentCityCustom = computed(() => {
  return (
    selectedMode.value === "manual" &&
    weatherStore.userLocation.city &&
    customCities.value.includes(weatherStore.userLocation.city)
  );
});
</script>

<template>
  <div class="weather-screen">
    <!-- 頂部導航 -->
    <header class="screen-header">
      <button class="back-btn" @click="emit('back')">
        <ArrowLeft :size="20" />
      </button>
      <h1>天氣設定</h1>
      <button
        class="refresh-btn"
        @click="refresh"
        :disabled="weatherStore.isLoading"
      >
        <RefreshCw :size="20" :class="{ spinning: weatherStore.isLoading }" />
      </button>
    </header>

    <div class="screen-content">
      <!-- 當前天氣卡片 -->
      <section class="current-weather" v-if="weatherStore.hasWeatherData">
        <div class="weather-card">
          <div class="weather-location">
            <MapPin :size="16" />
            <span>{{ weatherStore.locationName }}</span>
          </div>
          <div class="weather-temp">
            {{ Math.round(weatherStore.currentTemp || 0) }}°C
          </div>
          <div class="weather-condition">
            {{ weatherStore.weatherCondition }}
          </div>
          <div class="weather-details">
            <span>濕度 {{ weatherStore.weatherData?.current.humidity }}%</span>
            <span
              >體感 {{ weatherStore.weatherData?.current.feelslike_c }}°C</span
            >
          </div>
          <div class="weather-update">{{ lastUpdateText }}</div>
        </div>
      </section>

      <!-- 載入中 -->
      <section class="loading-section" v-else-if="weatherStore.isLoading">
        <Loader2 :size="32" class="spinning" />
        <span>載入天氣中...</span>
      </section>

      <!-- 錯誤 -->
      <section class="error-section" v-else-if="weatherStore.error">
        <Cloud :size="32" />
        <span>{{ weatherStore.error }}</span>
        <button @click="refresh">重試</button>
      </section>

      <!-- 定位模式選擇 -->
      <section class="mode-section">
        <h2>定位方式</h2>
        <div class="mode-options">
          <button
            class="mode-option"
            :class="{ active: selectedMode === 'ip' }"
            @click="setMode('ip')"
          >
            <Wifi :size="20" />
            <div class="mode-info">
              <span class="mode-name">IP 自動定位</span>
              <span class="mode-desc">根據網路 IP 自動判斷位置</span>
            </div>
            <Check v-if="selectedMode === 'ip'" :size="18" class="check-icon" />
          </button>

          <button
            class="mode-option"
            :class="{ active: selectedMode === 'browser' }"
            @click="setMode('browser')"
          >
            <Navigation :size="20" />
            <div class="mode-info">
              <span class="mode-name">GPS 定位</span>
              <span class="mode-desc">使用瀏覽器精確定位（需授權）</span>
            </div>
            <Check
              v-if="selectedMode === 'browser'"
              :size="18"
              class="check-icon"
            />
          </button>

          <button
            class="mode-option"
            :class="{ active: selectedMode === 'manual' }"
            @click="setMode('manual')"
          >
            <MapPin :size="20" />
            <div class="mode-info">
              <span class="mode-name">手動設定城市</span>
              <span class="mode-desc">{{
                weatherStore.userLocation.city || "從下方選擇或搜尋城市"
              }}</span>
            </div>
            <Check
              v-if="selectedMode === 'manual'"
              :size="18"
              class="check-icon"
            />
          </button>
        </div>
      </section>

      <!-- 城市搜尋 -->
      <section class="search-section">
        <h2>搜尋城市</h2>
        <div class="search-box">
          <Search :size="18" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="輸入城市名稱..."
            @focus="showSearchResults = searchResults.length > 0"
          />
          <Loader2 v-if="isSearching" :size="18" class="spinning" />
        </div>

        <!-- 搜尋結果 -->
        <div
          class="search-results"
          v-if="showSearchResults && searchResults.length > 0"
        >
          <button
            v-for="city in searchResults"
            :key="city.id"
            class="search-result-item"
            @click="selectCity(city)"
          >
            <MapPin :size="16" />
            <span>{{ city.name }}</span>
            <span class="region" v-if="city.region"
              >{{ city.region }}, {{ city.country }}</span
            >
          </button>
        </div>
      </section>

      <!-- 自訂城市列表 -->
      <section class="custom-cities-section">
        <div class="section-header">
          <h2>我的城市</h2>
          <button class="add-btn" @click="showAddCity = true">
            <Plus :size="18" />
          </button>
        </div>

        <div class="custom-cities" v-if="customCities.length > 0">
          <div
            v-for="city in customCities"
            :key="city"
            class="city-item"
            :class="{
              active:
                weatherStore.userLocation.city === city &&
                selectedMode === 'manual',
            }"
            @click="selectCustomCity(city)"
          >
            <MapPin :size="16" />
            <span class="city-name">{{ city }}</span>
            <button class="delete-btn" @click.stop="removeCustomCity(city)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div class="empty-cities" v-else>
          <span>尚未添加城市，點擊右上角 + 添加</span>
        </div>
      </section>

      <!-- 添加城市彈窗 -->
      <div
        class="add-city-modal"
        v-if="showAddCity"
        @click.self="showAddCity = false"
      >
        <div class="modal-content">
          <div class="modal-header">
            <h3>添加城市</h3>
            <button @click="showAddCity = false">
              <X :size="20" />
            </button>
          </div>
          <input
            v-model="newCityName"
            type="text"
            placeholder="輸入城市名稱（如：台北、Tokyo）"
            @keyup.enter="addCustomCity"
          />
          <div class="modal-actions">
            <button class="cancel-btn" @click="showAddCity = false">
              取消
            </button>
            <button class="confirm-btn" @click="addCustomCity">添加</button>
          </div>
        </div>
      </div>
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

.screen-header {
  display: flex;
  align-items: center;
  padding: 16px;
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);

  .back-btn,
  .refresh-btn {
    background: none;
    border: none;
    padding: 8px;
    cursor: pointer;
    color: var(--color-text, #333);
    border-radius: 8px;

    &:hover {
      background: var(--color-hover, #f0f0f0);
    }

    &:disabled {
      opacity: 0.5;
    }
  }

  h1 {
    flex: 1;
    text-align: center;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }
}

.screen-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.current-weather {
  margin-bottom: 24px;

  .weather-card {
    background: linear-gradient(135deg, #89cff0 0%, #a8d8ea 100%);
    border-radius: 16px;
    padding: 24px;
    color: #1f2937;
    text-align: center;
  }

  .weather-location {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 14px;
    opacity: 0.8;
    margin-bottom: 8px;
  }

  .weather-temp {
    font-size: 48px;
    font-weight: 300;
    margin: 8px 0;
  }

  .weather-condition {
    font-size: 16px;
    margin-bottom: 12px;
  }

  .weather-details {
    display: flex;
    justify-content: center;
    gap: 16px;
    font-size: 13px;
    opacity: 0.8;
  }

  .weather-update {
    margin-top: 12px;
    font-size: 12px;
    opacity: 0.6;
  }
}

.loading-section,
.error-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px;
  gap: 12px;
  color: var(--color-text-secondary, #666);

  button {
    margin-top: 8px;
    padding: 8px 16px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }
}

.mode-section,
.search-section,
.custom-cities-section {
  margin-bottom: 24px;

  h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text-secondary, #666);
    margin-bottom: 12px;
  }
}

.mode-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mode-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-surface, #fff);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s;

  &:hover {
    background: var(--color-hover, #f5f5f5);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);
  }

  .mode-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mode-name {
    font-size: 15px;
    font-weight: 500;
    color: var(--color-text, #333);
  }

  .mode-desc {
    font-size: 12px;
    color: var(--color-text-secondary, #888);
  }

  .check-icon {
    color: var(--color-primary, #7dd3a8);
  }
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  border: 1px solid var(--color-border, #eee);

  input {
    flex: 1;
    border: none;
    background: none;
    font-size: 15px;
    outline: none;
    color: var(--color-text, #333);

    &::placeholder {
      color: var(--color-text-secondary, #999);
    }
  }
}

.search-results {
  margin-top: 8px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--color-border, #eee);
}

.search-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  background: none;
  border: none;
  border-bottom: 1px solid var(--color-border, #eee);
  cursor: pointer;
  text-align: left;
  color: var(--color-text, #333);

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: var(--color-hover, #f5f5f5);
  }

  .region {
    margin-left: auto;
    font-size: 12px;
    color: var(--color-text-secondary, #888);
  }
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;

  h2 {
    margin: 0;
  }

  .add-btn {
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    padding: 6px;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
      opacity: 0.9;
    }
  }
}

.custom-cities {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.city-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s;

  &:hover {
    background: var(--color-hover, #f5f5f5);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: rgba(125, 211, 168, 0.1);
  }

  .city-name {
    flex: 1;
    font-size: 15px;
    color: var(--color-text, #333);
  }

  .delete-btn {
    background: none;
    border: none;
    padding: 6px;
    cursor: pointer;
    color: var(--color-text-secondary, #999);
    border-radius: 6px;

    &:hover {
      background: rgba(229, 62, 62, 0.1);
      color: #e53e3e;
    }
  }
}

.empty-cities {
  padding: 24px;
  text-align: center;
  color: var(--color-text-secondary, #888);
  font-size: 14px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
}

.add-city-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;

  .modal-content {
    background: var(--color-surface, #fff);
    border-radius: 16px;
    padding: 20px;
    width: 100%;
    max-width: 320px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;

    h3 {
      margin: 0;
      font-size: 18px;
    }

    button {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--color-text-secondary, #666);
    }
  }

  input {
    width: 100%;
    padding: 12px 16px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 10px;
    font-size: 15px;
    outline: none;
    margin-bottom: 16px;

    &:focus {
      border-color: var(--color-primary, #7dd3a8);
    }
  }

  .modal-actions {
    display: flex;
    gap: 12px;

    button {
      flex: 1;
      padding: 12px;
      border-radius: 10px;
      font-size: 15px;
      cursor: pointer;
    }

    .cancel-btn {
      background: var(--color-hover, #f0f0f0);
      border: none;
      color: var(--color-text, #333);
    }

    .confirm-btn {
      background: var(--color-primary, #7dd3a8);
      border: none;
      color: white;
    }
  }
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
