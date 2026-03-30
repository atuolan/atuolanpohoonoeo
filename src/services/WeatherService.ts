/**
 * 天氣服務
 * 整合 WeatherAPI.com 提供三種定位方式：瀏覽器定位、手動設置、IP定位
 */

const WEATHER_API_KEY = "a2429675a11f4fc788f185319262202";
// 開發環境走 Vite proxy 繞過 CORS，生產環境直連
const isDev = import.meta.env.DEV;
const WEATHER_API_BASE = isDev
  ? "/api/weather/v1"
  : "https://api.weatherapi.com/v1";

export type LocationMode = "browser" | "manual" | "ip";

export interface WeatherData {
  location: {
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
    localtime: string;
  };
  current: {
    temp_c: number;
    temp_f: number;
    feelslike_c: number;
    condition: {
      text: string;
      icon: string;
      code: number;
    };
    humidity: number;
    wind_kph: number;
    wind_dir: string;
    pressure_mb: number;
    uv: number;
    air_quality?: {
      pm2_5: number;
      pm10: number;
      "us-epa-index": number;
    };
  };
  forecast?: {
    forecastday: Array<{
      date: string;
      day: {
        maxtemp_c: number;
        mintemp_c: number;
        condition: {
          text: string;
          icon: string;
        };
      };
    }>;
  };
}

export interface UserLocation {
  mode: LocationMode;
  city?: string;
  lat?: number;
  lon?: number;
}

// ===== Nominatim 地名搜尋 =====

/** Nominatim API 原始回應格式 */
export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

/**
 * 從 Nominatim address 欄位解析最精確地名
 * 優先順序：city > town > village > county > display_name 第一段
 */
export function parseNominatimDisplayName(
  address: NominatimResult["address"],
  displayName?: string,
): string {
  if (address) {
    if (address.city) return address.city;
    if (address.town) return address.town;
    if (address.village) return address.village;
    if (address.county) return address.county;
  }
  // 回退：取 display_name 第一個逗號前的部分
  if (displayName) return displayName.split(",")[0].trim();
  return "";
}

// ===== Overpass API 附近地點 =====

/** 附近地點（POI） */
export interface NearbyPlace {
  /** 地點名稱 */
  name: string;
  /** 中文類型標籤 */
  type: string;
  /** 與用戶座標的直線距離（公尺，整數） */
  distance: number;
}

/** Overpass API 節點原始格式 */
interface OverpassNode {
  type: string;
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
}

/** Overpass API 回應格式 */
interface OverpassResponse {
  elements: OverpassNode[];
}

/** POI 類型對應中文標籤 */
const POI_TYPE_LABELS: Record<string, string> = {
  restaurant: "餐廳",
  cafe: "咖啡廳",
  attraction: "景點",
  park: "公園",
  convenience: "便利商店",
};

/**
 * Haversine 公式計算兩點直線距離（公尺）
 */
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // 地球半徑（公尺）
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.asin(Math.sqrt(a)));
}

/**
 * 從 Overpass 節點取得 POI 中文類型
 */
function getPoiType(tags: Record<string, string>): string {
  if (tags.amenity === "restaurant") return POI_TYPE_LABELS.restaurant;
  if (tags.amenity === "cafe") return POI_TYPE_LABELS.cafe;
  if (tags.tourism === "attraction") return POI_TYPE_LABELS.attraction;
  if (tags.leisure === "park") return POI_TYPE_LABELS.park;
  if (tags.shop === "convenience") return POI_TYPE_LABELS.convenience;
  return "地點";
}

/**
 * 查詢附近 POI（餐廳、咖啡廳、景點、公園、便利商店）
 * 失敗時靜默回傳空陣列
 */
export async function getNearbyPlaces(
  lat: number,
  lon: number,
  radiusMeters: number,
  limit: number,
): Promise<NearbyPlace[]> {
  try {
    // 建構 Overpass QL 查詢
    const query = `
[out:json][timeout:10];
(
  node["amenity"="restaurant"](around:${radiusMeters},${lat},${lon});
  node["amenity"="cafe"](around:${radiusMeters},${lat},${lon});
  node["tourism"="attraction"](around:${radiusMeters},${lat},${lon});
  node["leisure"="park"](around:${radiusMeters},${lat},${lon});
  node["shop"="convenience"](around:${radiusMeters},${lat},${lon});
);
out body;`.trim();

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const proxyUrl = `/image-proxy?url=${encodeURIComponent(overpassUrl)}`;

    const res = await fetch(proxyUrl);
    if (!res.ok) return [];

    const data: OverpassResponse = await res.json();
    const elements = data.elements ?? [];

    // 計算距離、過濾無名稱節點、排序、截斷
    const places: NearbyPlace[] = elements
      .filter((el) => el.tags?.name)
      .map((el) => ({
        name: el.tags!["name:zh"] ?? el.tags!.name!,
        type: getPoiType(el.tags!),
        distance: haversineDistance(lat, lon, el.lat, el.lon),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);

    return places;
  } catch (e) {
    console.warn("[WeatherService] Overpass API 查詢失敗，回傳空陣列", e);
    return [];
  }
}

/**
 * 從 WeatherAPI 獲取天氣數據
 */
async function fetchWeather(
  query: string,
  includeForecast = false,
  includeAirQuality = true,
): Promise<WeatherData> {
  const params = new URLSearchParams({
    key: WEATHER_API_KEY,
    aqi: includeAirQuality ? "yes" : "no",
    lang: "zh_tw",
  });

  const endpoint = includeForecast ? "forecast.json" : "current.json";
  if (includeForecast) {
    params.append("days", "3");
  }

  // 手動拼接 q 參數，避免 URLSearchParams 將逗號編碼為 %2C
  const url = `${WEATHER_API_BASE}/${endpoint}?${params}&q=${encodeURIComponent(query).replace(/%2C/gi, ",")}`;

  const response = await fetch(url);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || "獲取天氣失敗");
  }

  return await response.json();
}

/**
 * 瀏覽器地理定位
 */
export async function getBrowserLocation(): Promise<{
  lat: number;
  lon: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("您的瀏覽器不支持地理定位"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        let message = "獲取位置失敗";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = "您拒絕了位置授權";
            break;
          case error.POSITION_UNAVAILABLE:
            message = "位置信息不可用";
            break;
          case error.TIMEOUT:
            message = "獲取位置超時";
            break;
        }
        reject(new Error(message));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      },
    );
  });
}

/**
 * 透過多個 IP 地理定位服務取得座標
 * 依序嘗試，任一成功即返回
 */
async function getCoordsByIP(): Promise<{
  lat: number;
  lon: number;
  city?: string;
  region?: string;
  country?: string;
}> {
  // 服務1: ipwho.is（免費，支援 CORS，HTTPS）
  try {
    const res = await fetch(isDev ? "/api/ipwho/" : "https://ipwho.is/");
    if (res.ok) {
      const data = await res.json();
      if (data.success !== false && data.latitude && data.longitude) {
        return {
          lat: data.latitude,
          lon: data.longitude,
          city: data.city,
          region: data.region,
          country: data.country,
        };
      }
    }
  } catch (e) {
    console.warn("[WeatherService] ipwho.is 失敗", e);
  }

  // 服務2: ipapi.co（免費，HTTPS）
  try {
    const res = await fetch(
      isDev ? "/api/ipapi/json/" : "https://ipapi.co/json/",
    );
    if (res.ok) {
      const data = await res.json();
      if (!data.error && data.latitude && data.longitude) {
        return {
          lat: data.latitude,
          lon: data.longitude,
          city: data.city,
          region: data.region,
          country: data.country_name,
        };
      }
    }
  } catch (e) {
    console.warn("[WeatherService] ipapi.co 失敗", e);
  }

  // 服務3: ip-api.com（免費，僅 HTTP）
  try {
    const res = await fetch(
      isDev
        ? "/api/ip-api/json/?fields=status,lat,lon,city,regionName,country"
        : "http://ip-api.com/json/?fields=status,lat,lon,city,regionName,country",
    );
    if (res.ok) {
      const data = await res.json();
      if (data.status === "success" && data.lat && data.lon) {
        return {
          lat: data.lat,
          lon: data.lon,
          city: data.city,
          region: data.regionName,
          country: data.country,
        };
      }
    }
  } catch (e) {
    console.warn("[WeatherService] ip-api.com 失敗", e);
  }

  throw new Error("無法透過 IP 定位取得位置");
}

/** 保留舊介面相容性 */
async function getLocationQueryByIP(): Promise<string> {
  const coords = await getCoordsByIP();
  return `${coords.lat},${coords.lon}`;
}

// ===== Open-Meteo 回退 =====

/** WMO 天氣代碼對照表 */
const WMO_CONDITIONS: Record<number, { text: string; weatherApiCode: number }> =
  {
    0: { text: "晴天", weatherApiCode: 1000 },
    1: { text: "大致晴朗", weatherApiCode: 1003 },
    2: { text: "局部多雲", weatherApiCode: 1003 },
    3: { text: "陰天", weatherApiCode: 1009 },
    45: { text: "霧", weatherApiCode: 1135 },
    48: { text: "霧凇", weatherApiCode: 1147 },
    51: { text: "小毛毛雨", weatherApiCode: 1150 },
    53: { text: "毛毛雨", weatherApiCode: 1153 },
    55: { text: "大毛毛雨", weatherApiCode: 1153 },
    56: { text: "凍毛毛雨", weatherApiCode: 1168 },
    57: { text: "大凍毛毛雨", weatherApiCode: 1171 },
    61: { text: "小雨", weatherApiCode: 1183 },
    63: { text: "中雨", weatherApiCode: 1189 },
    65: { text: "大雨", weatherApiCode: 1195 },
    66: { text: "小凍雨", weatherApiCode: 1198 },
    67: { text: "大凍雨", weatherApiCode: 1201 },
    71: { text: "小雪", weatherApiCode: 1213 },
    73: { text: "中雪", weatherApiCode: 1219 },
    75: { text: "大雪", weatherApiCode: 1225 },
    77: { text: "雪粒", weatherApiCode: 1237 },
    80: { text: "小陣雨", weatherApiCode: 1240 },
    81: { text: "中陣雨", weatherApiCode: 1243 },
    82: { text: "大陣雨", weatherApiCode: 1246 },
    85: { text: "小陣雪", weatherApiCode: 1255 },
    86: { text: "大陣雪", weatherApiCode: 1258 },
    95: { text: "雷暴", weatherApiCode: 1273 },
    96: { text: "雷暴伴小冰雹", weatherApiCode: 1276 },
    99: { text: "雷暴伴大冰雹", weatherApiCode: 1279 },
  };

function wmoToCondition(code: number): {
  text: string;
  icon: string;
  code: number;
} {
  const info = WMO_CONDITIONS[code] || { text: "未知", weatherApiCode: 1000 };
  // 使用 WeatherAPI 的 icon CDN（根據 code 映射）
  const isDay = new Date().getHours() >= 6 && new Date().getHours() < 18;
  const iconBase = isDay ? "day" : "night";
  // 簡單映射 icon
  let iconNum = 113; // default sunny
  if (code === 0) iconNum = 113;
  else if (code <= 3) iconNum = 116;
  else if (code <= 48) iconNum = 143;
  else if (code <= 57) iconNum = 263;
  else if (code <= 67) iconNum = 296;
  else if (code <= 77) iconNum = 326;
  else if (code <= 82) iconNum = 308;
  else if (code <= 86) iconNum = 338;
  else iconNum = 389;
  return {
    text: info.text,
    icon: `//cdn.weatherapi.com/weather/64x64/${iconBase}/${iconNum}.png`,
    code: info.weatherApiCode,
  };
}

/** 風向角度轉文字 */
function degreeToDirection(deg: number): string {
  const dirs = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ];
  return dirs[Math.round(deg / 22.5) % 16];
}

/**
 * 從 Open-Meteo 獲取天氣並轉換為 WeatherData 格式
 */
async function fetchOpenMeteo(
  lat: number,
  lon: number,
  locationInfo?: { city?: string; region?: string; country?: string },
): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    current:
      "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index",
    daily: "temperature_2m_max,temperature_2m_min,weather_code",
    timezone: "auto",
    forecast_days: "3",
  });

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Open-Meteo 請求失敗");
  }

  const data = await response.json();
  const current = data.current;
  const daily = data.daily;

  const condition = wmoToCondition(current.weather_code);

  // 組裝成 WeatherData 格式
  const now = new Date();
  const localtime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return {
    location: {
      name: locationInfo?.city || `${lat.toFixed(2)}, ${lon.toFixed(2)}`,
      region: locationInfo?.region || "",
      country: locationInfo?.country || "",
      lat,
      lon,
      localtime,
    },
    current: {
      temp_c: current.temperature_2m,
      temp_f: (current.temperature_2m * 9) / 5 + 32,
      feelslike_c: current.apparent_temperature,
      condition,
      humidity: current.relative_humidity_2m,
      wind_kph: current.wind_speed_10m,
      wind_dir: degreeToDirection(current.wind_direction_10m),
      pressure_mb: current.surface_pressure,
      uv: current.uv_index,
    },
    forecast: daily
      ? {
          forecastday: daily.time.map((date: string, i: number) => ({
            date,
            day: {
              maxtemp_c: daily.temperature_2m_max[i],
              mintemp_c: daily.temperature_2m_min[i],
              condition: wmoToCondition(daily.weather_code[i]),
            },
          })),
        }
      : undefined,
  };
}

/**
 * IP 定位（WeatherAPI → Open-Meteo 回退）
 */
export async function getWeatherByIP(): Promise<WeatherData> {
  // 先嘗試 WeatherAPI
  try {
    return await fetchWeather("auto:ip", true, true);
  } catch (e) {
    console.warn("[WeatherService] WeatherAPI auto:ip 失敗", e);
  }

  // 取得 IP 座標
  const geoInfo = await getCoordsByIP();

  // 嘗試 WeatherAPI + 座標
  try {
    return await fetchWeather(`${geoInfo.lat},${geoInfo.lon}`, true, true);
  } catch (e) {
    console.warn(
      "[WeatherService] WeatherAPI 座標查詢也失敗，回退到 Open-Meteo",
      e,
    );
  }

  // 最終回退：Open-Meteo
  return fetchOpenMeteo(geoInfo.lat, geoInfo.lon, geoInfo);
}

/**
 * 根據城市名獲取天氣
 */
export async function getWeatherByCity(city: string): Promise<WeatherData> {
  try {
    return await fetchWeather(city, true, true);
  } catch (e) {
    console.warn(
      "[WeatherService] WeatherAPI 城市查詢失敗，嘗試 Open-Meteo 回退",
      e,
    );
    // 用 Open-Meteo geocoding 查城市座標
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`,
    );
    if (geoRes.ok) {
      const geoData = await geoRes.json();
      if (geoData.results?.length > 0) {
        const r = geoData.results[0];
        return fetchOpenMeteo(r.latitude, r.longitude, {
          city: r.name,
          region: r.admin1,
          country: r.country,
        });
      }
    }
    throw new Error("無法獲取該城市的天氣");
  }
}

/**
 * 根據經緯度獲取天氣
 */
export async function getWeatherByCoords(
  lat: number,
  lon: number,
): Promise<WeatherData> {
  try {
    return await fetchWeather(`${lat},${lon}`, true, true);
  } catch (e) {
    console.warn(
      "[WeatherService] WeatherAPI 座標查詢失敗，回退到 Open-Meteo",
      e,
    );
    return fetchOpenMeteo(lat, lon);
  }
}

/**
 * 根據用戶設置的定位模式獲取天氣
 */
export async function getWeatherByUserLocation(
  location: UserLocation,
): Promise<WeatherData> {
  switch (location.mode) {
    case "browser":
      if (location.lat && location.lon) {
        return getWeatherByCoords(location.lat, location.lon);
      }
      const coords = await getBrowserLocation();
      return getWeatherByCoords(coords.lat, coords.lon);

    case "manual":
      if (!location.city) {
        throw new Error("請設置城市名稱");
      }
      return getWeatherByCity(location.city);

    case "ip":
      return getWeatherByIP();

    default:
      throw new Error("未知的定位模式");
  }
}

/**
 * 搜索城市（WeatherAPI → Open-Meteo Geocoding 回退）
 */
export async function searchCities(query: string): Promise<
  Array<{
    id: number;
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }>
> {
  // 優先：Nominatim API（支援台灣鄉鎮市區等細粒度地名）
  // 直接 fetch，帶 User-Agent（Nominatim 要求）；不走 image-proxy 避免 403
  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1&accept-language=zh-TW`;
    const res = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "Aguaphone/1.0 (https://aguaphone.aguacloud.uk)",
        "Accept-Language": "zh-TW,zh;q=0.9",
      },
    });
    if (res.ok) {
      const results: NominatimResult[] = await res.json();
      if (results.length > 0) {
        return results.map((r, idx) => ({
          id: r.place_id ?? idx,
          name: parseNominatimDisplayName(r.address, r.display_name),
          region: r.address?.state ?? r.address?.county ?? "",
          country: r.address?.country ?? "",
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
        }));
      }
    }
  } catch (e) {
    console.warn(
      "[WeatherService] Nominatim 城市搜尋失敗，回退至 Open-Meteo",
      e,
    );
  }

  // 回退：Open-Meteo Geocoding
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=zh`,
    );
    if (res.ok) {
      const data = await res.json();
      return (data.results || []).map(
        (r: {
          id: number;
          name: string;
          admin1?: string;
          country: string;
          latitude: number;
          longitude: number;
        }) => ({
          id: r.id,
          name: r.name,
          region: r.admin1 || "",
          country: r.country,
          lat: r.latitude,
          lon: r.longitude,
        }),
      );
    }
  } catch (e) {
    console.warn("[WeatherService] Open-Meteo 城市搜尋也失敗", e);
  }

  throw new Error("搜索城市失敗");
}

/**
 * 獲取天氣建議文本
 */
export function getWeatherAdvice(weather: WeatherData): string {
  const { current } = weather;
  const advices: string[] = [];

  if (current.temp_c < 10) {
    advices.push("天氣較冷，建議多穿衣物保暖");
  } else if (current.temp_c > 30) {
    advices.push("天氣炎熱，注意防曬和補充水分");
  }

  if (Math.abs(current.temp_c - current.feelslike_c) > 5) {
    if (current.feelslike_c < current.temp_c) {
      advices.push("風較大，體感溫度較低");
    } else {
      advices.push("濕度較高，體感較悶熱");
    }
  }

  if (current.uv >= 8) {
    advices.push("紫外線很強，外出務必做好防曬");
  } else if (current.uv >= 6) {
    advices.push("紫外線較強，建議塗抹防曬霜");
  }

  const condition = current.condition.text.toLowerCase();
  if (condition.includes("rain") || condition.includes("雨")) {
    advices.push("有降雨，記得帶傘");
  }

  if (current.air_quality) {
    const aqi = current.air_quality["us-epa-index"];
    if (aqi >= 5) {
      advices.push("空氣質量差，建議減少戶外活動");
    } else if (aqi >= 3) {
      advices.push("空氣質量一般，敏感人群注意防護");
    }
  }

  return advices.join("；");
}

/**
 * 獲取天氣描述文本（供 AI 參考）
 */
export function getWeatherDescription(weather: WeatherData): string {
  const { current, location } = weather;

  let desc = `當前位置：${location.name}`;
  if (location.region) desc += `，${location.region}`;
  desc += `\n當地時間：${location.localtime}`;
  desc += `\n天氣狀況：${current.condition.text}`;
  desc += `\n溫度：${current.temp_c}°C（體感 ${current.feelslike_c}°C）`;
  desc += `\n濕度：${current.humidity}%`;
  desc += `\n風速：${current.wind_kph} km/h，風向 ${current.wind_dir}`;
  desc += `\n紫外線指數：${current.uv}`;

  if (current.air_quality) {
    const aqiLabels = [
      "優秀",
      "良好",
      "中等",
      "對敏感人群不健康",
      "不健康",
      "非常不健康",
      "危險",
    ];
    const aqiIndex = current.air_quality["us-epa-index"];
    desc += `\n空氣質量：${aqiLabels[aqiIndex - 1] || "未知"} (PM2.5: ${current.air_quality.pm2_5})`;
  }

  const advice = getWeatherAdvice(weather);
  if (advice) {
    desc += `\n\n建議：${advice}`;
  }

  return desc;
}
