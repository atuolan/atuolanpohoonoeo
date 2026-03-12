<script setup lang="ts">
import { useWeatherStore } from "@/stores/weather";
import type { WidgetCustomStyle } from "@/types";
import {
    Cloud,
    CloudDrizzle,
    CloudFog,
    CloudLightning,
    CloudRain,
    CloudSnow,
    CloudSun,
    Loader2,
    MapPin,
    RefreshCw,
    Sun,
    Wind,
} from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const props = defineProps<{
  data?: {
    customStyle?: WidgetCustomStyle;
  };
}>();

const weatherStore = useWeatherStore();
const isRefreshing = ref(false);

// 根據天氣代碼映射圖標
const weatherIconComponent = computed(() => {
  const code = weatherStore.weatherData?.current.condition.code;
  if (!code) return Sun;

  // WeatherAPI condition codes: https://www.weatherapi.com/docs/weather_conditions.json
  if (code === 1000) return Sun; // Sunny/Clear
  if ([1003, 1006, 1009].includes(code)) return CloudSun; // Partly cloudy, Cloudy, Overcast
  if ([1030, 1135, 1147].includes(code)) return CloudFog; // Mist, Fog, Freezing fog
  if ([1063, 1150, 1153, 1180, 1183].includes(code)) return CloudDrizzle; // Light rain/drizzle
  if ([1186, 1189, 1192, 1195, 1240, 1243, 1246].includes(code))
    return CloudRain; // Rain
  if (
    [1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(
      code,
    )
  )
    return CloudSnow; // Snow
  if ([1087, 1273, 1276, 1279, 1282].includes(code)) return CloudLightning; // Thunder
  if (
    [
      1072, 1168, 1171, 1198, 1201, 1204, 1207, 1237, 1249, 1252, 1261, 1264,
    ].includes(code)
  )
    return CloudRain; // Sleet/Freezing rain

  return Cloud;
});

// 背景樣式
const backgroundStyle = computed(() => {
  const customStyle = props.data?.customStyle;

  if (customStyle?.backgroundGradient) {
    return { background: customStyle.backgroundGradient };
  }
  if (customStyle?.backgroundColor) {
    return { backgroundColor: customStyle.backgroundColor };
  }

  // 根據天氣狀況設定背景
  const code = weatherStore.weatherData?.current.condition.code;
  if (!code)
    return { background: "linear-gradient(135deg, #89CFF0 0%, #a8d8ea 100%)" };

  if (code === 1000)
    return { background: "linear-gradient(135deg, #f6d365 0%, #fda085 100%)" };
  if ([1003, 1006, 1009].includes(code))
    return { background: "linear-gradient(135deg, #d299c2 0%, #fef9d7 100%)" };
  if ([1030, 1135, 1147].includes(code))
    return { background: "linear-gradient(135deg, #bdc3c7 0%, #2c3e50 100%)" };
  if (code >= 1063 && code <= 1201)
    return { background: "linear-gradient(135deg, #89CFF0 0%, #a8d8ea 100%)" };
  if (code >= 1204 && code <= 1264)
    return { background: "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)" };
  if ([1087, 1273, 1276, 1279, 1282].includes(code))
    return { background: "linear-gradient(135deg, #434343 0%, #000000 100%)" };

  return { background: "linear-gradient(135deg, #89CFF0 0%, #a8d8ea 100%)" };
});

const textClass = computed(() => {
  if (
    props.data?.customStyle?.textColor ||
    props.data?.customStyle?.foregroundColor
  )
    return "";
  const code = weatherStore.weatherData?.current.condition.code;
  if ([1087, 1273, 1276, 1279, 1282].includes(code || 0)) return "light-text";
  return "";
});

const textStyle = computed(() => {
  const style: Record<string, string> = {};
  if (props.data?.customStyle?.textColor) {
    style.color = props.data.customStyle.textColor;
  } else if (props.data?.customStyle?.foregroundColor) {
    style.color = props.data.customStyle.foregroundColor;
  }
  return style;
});

async function handleRefresh() {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await weatherStore.refreshWeather(true);
  } catch {
    // 錯誤已在 store 中處理並設置 error 狀態
  } finally {
    isRefreshing.value = false;
  }
}

onMounted(() => {
  if (!weatherStore.hasWeatherData) {
    weatherStore.refreshWeather().catch(() => {
      // 錯誤已在 store 中處理
    });
  }
});

const currentLayout = computed(() => {
  return props.data?.customStyle?.layout || "pop";
});
</script>

<template>
  <div
    class="weather-widget"
    :style="{ ...backgroundStyle, ...textStyle }"
    :class="[currentLayout, textClass]"
  >
    <!-- 載入中 -->
    <template v-if="weatherStore.isLoading && !weatherStore.hasWeatherData">
      <div class="loading-state">
        <Loader2 :size="32" class="spin" />
        <span>載入天氣中...</span>
      </div>
    </template>

    <!-- 錯誤狀態 -->
    <template v-else-if="weatherStore.error && !weatherStore.hasWeatherData">
      <div class="error-state">
        <Cloud :size="32" />
        <span>{{ weatherStore.error }}</span>
        <button class="retry-btn" @click="handleRefresh">重試</button>
      </div>
    </template>

    <!-- 天氣數據 -->
    <template v-else-if="weatherStore.hasWeatherData">
      <div class="weather-header">
        <div class="location">
          <MapPin :size="12" />
          <span>{{ weatherStore.locationName }}</span>
        </div>
        <button
          class="refresh-btn"
          :class="{ refreshing: isRefreshing }"
          @click="handleRefresh"
          :disabled="isRefreshing"
        >
          <RefreshCw :size="14" />
        </button>
      </div>

      <div class="weather-main">
        <component
          :is="weatherIconComponent"
          :size="40"
          :stroke-width="1.5"
          class="weather-icon"
        />
        <div class="temperature">
          {{ Math.round(weatherStore.currentTemp || 0) }}°
        </div>
      </div>

      <div class="weather-footer">
        <span class="condition">{{ weatherStore.weatherCondition }}</span>
        <span class="humidity">
          <Wind :size="12" />
          {{ weatherStore.weatherData?.current.humidity }}%
        </span>
      </div>
    </template>

    <!-- 無數據 -->
    <template v-else>
      <div class="empty-state" @click="handleRefresh">
        <Sun :size="32" />
        <span>點擊載入天氣</span>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.weather-widget {
  width: 100%;
  height: 100%;
  padding: 16px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  container-type: size;
  overflow: hidden;

  // Classic 傳統樣式
  &.classic {
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    color: #1f2937;

    &.light-text {
      color: white;
    }

    .weather-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;

      .location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .refresh-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: inherit;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background-color 0.2s;
        flex-shrink: 0;

        &:hover {
          background-color: rgba(255, 255, 255, 0.2);
        }

        &.refreshing svg {
          animation: spin 1s linear infinite;
        }
      }
    }

    .weather-main {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      flex: 1;
      min-height: 0;

      .weather-icon {
        flex-shrink: 0;
      }

      .temperature {
        font-size: 48px;
        font-weight: 300;
        letter-spacing: -2px;
      }
    }

    .weather-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
      flex-shrink: 0;

      .condition {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .humidity {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
    }

    .loading-state,
    .error-state,
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 14px;
    }

    .empty-state {
      cursor: pointer;
    }

    .error-state {
      .retry-btn {
        margin-top: 8px;
        padding: 6px 16px;
        background: rgba(255, 255, 255, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 20px;
        cursor: pointer;
        color: inherit;
        transition: background-color 0.2s;

        &:hover {
          background: rgba(255, 255, 255, 0.3);
        }
      }
    }
  }

  // Pop普普風/新粗野派樣式
  &.pop {
    border-radius: 20px;
    border: 3px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    color: #1a1a1a;
    transition: transform 0.2s ease, box-shadow 0.2s ease;

    &:hover {
      transform: translate(-1px, -1px);
      box-shadow: 5px 5px 0px #1a1a1a;
    }

    &.light-text {
      color: white;
      text-shadow: 1px 1px 0px #1a1a1a;
    }

    .weather-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.4);
      padding: 4px 8px;
      border-radius: 12px;
      border: 2px solid #1a1a1a;

      .location {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 13px;
        font-weight: 800;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .refresh-btn {
        background: transparent;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: inherit;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        flex-shrink: 0;

        &:hover {
          transform: rotate(45deg) scale(1.1);
        }

        &.refreshing svg {
          animation: spin 1s linear infinite;
        }
      }
    }

    .weather-main {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex: 1;
      min-height: 0;

      .weather-icon {
        filter: drop-shadow(2px 2px 0px rgba(0,0,0,0.5));
        flex-shrink: 0;
      }

      .temperature {
        font-size: 46px;
        font-weight: 900;
        letter-spacing: -2px;
        text-shadow: 2px 2px 0px rgba(255,255,255,0.4);
      }
    }

    .weather-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 14px;
      font-weight: 800;
      flex-shrink: 0;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid #1a1a1a;
      padding: 4px 8px;
      border-radius: 12px;

      .condition {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .humidity {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
    }

    .loading-state,
    .error-state,
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 800;
    }

    .empty-state {
      cursor: pointer;
    }

    .error-state {
      .retry-btn {
        margin-top: 8px;
        padding: 6px 14px;
        background: #ffb4b4;
        border: 2px solid #1a1a1a;
        border-radius: 8px;
        box-shadow: 2px 2px 0px #1a1a1a;
        font-size: 13px;
        font-weight: 800;
        cursor: pointer;
        color: #1a1a1a;
        transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);

        &:hover {
          transform: translate(-1px, -1px) scale(1.05);
          background: #ef4444;
          box-shadow: 3px 3px 0px #1a1a1a;
        }
        
        &:active {
          transform: scale(0.95);
          box-shadow: 0px 0px 0px #1a1a1a;
        }
      }
    }
  }

  // 平面風
  &.flat {
    border-radius: 32px;
    border: 3px solid #332650;
    box-shadow: 0 6px 0px #332650;
    color: #332650;

    &.light-text { color: white; }

    .weather-header {
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
      background: white; padding: 6px 14px; border-radius: 9999px;
      border: 3px solid #332650; box-shadow: 0 4px 0px #332650; margin-bottom: 8px;
      
      .location { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: 800; }
      .refresh-btn {
        background: transparent; border: none; padding: 2px; cursor: pointer; color: inherit; display: flex; align-items: center; justify-content: center; transition: transform 0.2s;
        &:hover { transform: rotate(45deg); }
        &.refreshing svg { animation: spin 1s linear infinite; }
      }
    }

    .weather-main {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex: 1;
      .weather-icon { filter: drop-shadow(0 4px 0px rgba(51,38,80,0.2)); flex-shrink: 0; }
      .temperature { font-size: 48px; font-weight: 900; letter-spacing: -2px; }
    }

    .weather-footer {
      display: flex; justify-content: space-between; align-items: center; font-size: 15px; font-weight: 800; flex-shrink: 0;
      background: rgba(255,255,255,0.8); border: 3px solid #332650; box-shadow: 0 4px 0px #332650; padding: 6px 14px; border-radius: 9999px;
      .condition, .humidity { display: flex; align-items: center; gap: 4px; }
    }

    .loading-state, .error-state, .empty-state {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 16px; font-weight: 800;
    }

    .empty-state { cursor: pointer; }

    .error-state .retry-btn {
      margin-top: 8px; padding: 8px 16px; background: #FFB347; border: 3px solid #332650; border-radius: 9999px; box-shadow: 0 4px 0px #332650; font-size: 14px; font-weight: 800; cursor: pointer; color: #332650; transition: transform 0.2s;
      &:hover { transform: translateY(-2px); }
      &:active { transform: translateY(2px); box-shadow: 0 2px 0px #332650; }
    }
  }

  // 插圖風
  &.illustration {
    border-radius: 6px;
    border: 2px solid #1a1a1a;
    box-shadow: 4px 4px 0px #1a1a1a;
    color: #1a1a1a;
    padding-top: 34px !important; // override default padding for top bar
    position: relative;
    background: #F6F3EB; // Base color

    &::before {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 22px; border-bottom: 2px solid #1a1a1a;
      background: #F6F3EB; background-image: repeating-linear-gradient(to bottom, transparent, transparent 2px, #1a1a1a 2px, #1a1a1a 3px); background-size: 100% 12px; background-position: center 5px; background-repeat: no-repeat; z-index: 2;
    }
    &::after {
      content: ''; position: absolute; top: 5px; left: 8px; width: 12px; height: 12px; border: 2px solid #1a1a1a; background: white; box-shadow: inset 1px 1px 0 rgba(0,0,0,0.1); z-index: 2;
    }

    &.light-text { color: #1a1a1a; } // override light text for this style

    .weather-header {
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 8px;
      .location { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; background: white; border: 2px solid #1a1a1a; padding: 2px 8px; }
      .refresh-btn {
        background: white; border: 2px solid #1a1a1a; padding: 2px; cursor: pointer; color: inherit; box-shadow: 2px 2px 0px #1a1a1a;
        &:active { box-shadow: 0px 0px 0px #1a1a1a; transform: translate(2px, 2px); }
        &.refreshing svg { animation: spin 1s linear infinite; }
      }
    }

    .weather-main {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex: 1;
      .weather-icon { filter: drop-shadow(2px 2px 0px rgba(0,0,0,1)); flex-shrink: 0; background: white; border-radius: 50%; border: 2px solid #1a1a1a; }
      .temperature { font-size: 42px; font-weight: 800; letter-spacing: -2px; }
    }

    .weather-footer {
      display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; flex-shrink: 0;
      background: #B0D0DB; border: 2px solid #1a1a1a; padding: 4px 8px; margin-top: 8px; box-shadow: 2px 2px 0px #1a1a1a;
      .condition, .humidity { display: flex; align-items: center; gap: 4px; }
    }

    .loading-state, .error-state, .empty-state {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: 700;
    }

    .error-state .retry-btn {
      margin-top: 8px; padding: 4px 12px; background: white; border: 2px solid #1a1a1a; box-shadow: 2px 2px 0px #1a1a1a; font-size: 13px; font-weight: 700; cursor: pointer;
      &:active { transform: translate(2px, 2px); box-shadow: 0px 0px 0px #1a1a1a; }
    }
  }

  // 像素風
  &.pixel {
    border-radius: 8px;
    border: 4px solid #F4A2C5;
    box-shadow: 4px 4px 0px #F5C6DA;
    color: #d06d9a;
    padding-top: 34px !important;
    position: relative;
    background: #FFF1F5;
    background-image: linear-gradient(#F8C6DB 1px, transparent 1px), linear-gradient(90deg, #F8C6DB 1px, transparent 1px);
    background-size: 16px 16px;
    font-family: 'DotGothic16', 'Press Start 2P', monospace, sans-serif;

    &::before {
      content: 'WEATHER.SYS'; position: absolute; top: -4px; right: -4px; left: -4px; height: 26px; background: #F4A2C5; color: white; font-size: 13px; line-height: 26px; padding-left: 8px; font-weight: bold; border: 4px solid #F4A2C5; z-index: 2;
    }

    &.light-text { color: #d06d9a; }

    .weather-header {
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; margin-bottom: 8px; z-index: 1;
      .location { display: flex; align-items: center; gap: 4px; font-size: 14px; font-weight: bold; background: white; border: 2px dashed #EAA3C5; padding: 2px 6px; }
      .refresh-btn {
        background: white; border: 2px solid #EAA3C5; padding: 2px; cursor: pointer; color: inherit; box-shadow: 2px 2px 0px #F5C6DA;
        &:active { box-shadow: none; transform: translate(2px, 2px); }
        &.refreshing svg { animation: spin 1s linear infinite; }
      }
    }

    .weather-main {
      display: flex; align-items: center; justify-content: center; gap: 12px; flex: 1; z-index: 1;
      .weather-icon { flex-shrink: 0; }
      .temperature { font-size: 40px; font-weight: bold; letter-spacing: -2px; text-shadow: 2px 2px 0px white; }
    }

    .weather-footer {
      display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: bold; flex-shrink: 0; z-index: 1;
      background: #93E2B6; color: white; border: 2px solid #EAA3C5; padding: 6px 8px; margin-top: 8px; box-shadow: 2px 2px 0px #F5C6DA;
      .condition, .humidity { display: flex; align-items: center; gap: 4px; }
    }

    .loading-state, .error-state, .empty-state {
      flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 15px; font-weight: bold; z-index: 1;
    }

    .error-state .retry-btn {
      margin-top: 8px; padding: 6px 14px; background: #F4A2C5; color: white; border: 2px solid #EAA3C5; box-shadow: 2px 2px 0px #F5C6DA; font-size: 14px; font-weight: bold; cursor: pointer;
      &:active { transform: translate(2px, 2px); box-shadow: none; }
    }
  }
}

.spin {
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

// 小尺寸響應式調整
@container (max-height: 120px) {
  .weather-widget {
    padding: 10px;
  }

  .weather-header .location {
    font-size: 11px;

    svg {
      width: 10px;
      height: 10px;
    }
  }

  .weather-main {
    gap: 8px;

    .weather-icon {
      width: 28px;
      height: 28px;
    }

    .temperature {
      font-size: 32px;
    }
  }

  .weather-footer {
    font-size: 10px;
  }
}

@container (max-width: 120px) {
  .weather-header .location span {
    display: none;
  }

  .weather-main {
    flex-direction: column;
    gap: 4px;

    .temperature {
      font-size: 28px;
    }
  }

  .weather-footer {
    flex-direction: column;
    gap: 2px;
    text-align: center;
  }
}

// 極小尺寸：只顯示溫度和圖標
@container (max-height: 80px) {
  .weather-header {
    display: none;
  }

  .weather-footer {
    display: none;
  }

  .weather-main {
    gap: 6px;

    .weather-icon {
      width: 24px;
      height: 24px;
    }

    .temperature {
      font-size: 24px;
    }
  }

  .loading-state,
  .error-state,
  .empty-state {
    font-size: 10px;
    gap: 4px;

    svg {
      width: 20px;
      height: 20px;
    }
  }

  .error-state .retry-btn {
    padding: 2px 8px;
    font-size: 10px;
  }
}

// 超小尺寸
@container (max-height: 60px) and (max-width: 80px) {
  .weather-main {
    .weather-icon {
      display: none;
    }

    .temperature {
      font-size: 20px;
    }
  }
}
</style>
