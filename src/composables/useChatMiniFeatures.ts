import {
  getWeatherByCity,
  getWeatherByCoords,
  searchCities,
  type WeatherData,
} from "@/services/WeatherService";
import { useCharactersStore } from "@/stores/characters";
import { useWeatherStore } from "@/stores/weather";
import type { StoredCharacter } from "@/types/character";
import { WORLD_CITIES } from "@/data/worldCities";
import { computed, ref, watch, type Ref } from "vue";

/**
 * 聊天小功能合集：遊戲成績、話題引導、位置分享、天氣分享
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatMiniFeatures(deps: {
  messages: Ref<any[]>;
  scrollToBottom: () => void;
  saveChat: () => void;
  saveChatImmediate: () => Promise<void>;
  triggerAIResponse: (opts?: any) => Promise<void>;
  currentCharacter?: Ref<StoredCharacter | null | undefined>;
  getFakeTime?: () => Date;
  getRealTimeAwareness?: () => boolean;
}) {
  const weatherStore = useWeatherStore();

  function formatDateTime(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function getTimeZoneOffsetSeconds(timeZone: string | undefined, date = new Date()): number | undefined {
    if (!timeZone) return undefined;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      const hour = values.hour === "24" ? 0 : Number(values.hour);
      const localAsUtcMs = Date.UTC(
        Number(values.year),
        Number(values.month) - 1,
        Number(values.day),
        hour,
        Number(values.minute),
        Number(values.second),
      );
      return Math.round((localAsUtcMs - date.getTime()) / 1000);
    } catch {
      return undefined;
    }
  }

  function parseLocaltimeOffsetSeconds(localtime: string | undefined, reference = new Date()): number | undefined {
    if (!localtime) return undefined;
    const match = localtime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return undefined;
    const [, y, m, d, h, min, sec] = match;
    const localAsUtcMs = Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(h),
      Number(min),
      Number(sec ?? "0"),
    );
    return Math.round((localAsUtcMs - reference.getTime()) / 1000);
  }

  function getWeatherOffsetSeconds(weather: WeatherData | null | undefined, role: "user" | "char", reference = new Date()): number | undefined {
    if (!weather) return undefined;
    if (typeof weather.location.utcOffsetSeconds === "number") {
      return weather.location.utcOffsetSeconds;
    }

    const tzId = weather.location.tzId || (role === "char" ? deps.currentCharacter?.value?.worldSettings?.timezone : undefined);
    return getTimeZoneOffsetSeconds(tzId, reference) ?? parseLocaltimeOffsetSeconds(weather.location.localtime, reference);
  }

  function formatTimeDiffAmount(hours: number): string {
    const rounded = Math.round(Math.abs(hours) * 2) / 2;
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  }
 
  // ===== 遊戲成績 =====
  const showGameScorePicker = ref(false);

  function formatSudokuTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function handleGameScoreSelect(gameId: string, label: string) {
    showGameScorePicker.value = false;
    let scoreValue = "0";
    if (gameId === "2048") {
      scoreValue = localStorage.getItem("2048-best-score") || "0";
    } else if (gameId === "snake") {
      scoreValue = localStorage.getItem("snake_best_score") || "0";
    } else if (gameId === "sudoku") {
      const t = localStorage.getItem("sudoku-best-times");
      if (t) {
        try {
          const times = JSON.parse(t);
          const parts: string[] = [];
          if (times.easy > 0) parts.push(`簡單${formatSudokuTime(times.easy)}`);
          if (times.medium > 0)
            parts.push(`中等${formatSudokuTime(times.medium)}`);
          if (times.hard > 0) parts.push(`困難${formatSudokuTime(times.hard)}`);
          scoreValue = parts.join(" ");
        } catch {
          scoreValue = label;
        }
      }
    } else if (gameId === "tetris") {
      const s = localStorage.getItem("tetris-high-scores");
      if (s) {
        try {
          const scores = JSON.parse(s);
          if (Array.isArray(scores) && scores.length > 0)
            scoreValue = String(scores[0].score);
        } catch {
          scoreValue = "0";
        }
      }
    }

    const nameMap: Record<string, string> = {
      "2048": "2048",
      snake: "貪吃蛇",
      sudoku: "數獨",
      tetris: "俄羅斯方塊",
    };
    const gameName = nameMap[gameId] || gameId;
    const content = `<game>${gameName}|${scoreValue}</game>`;

    const userMessage = {
      id: `msg_${Date.now()}`,
      role: "user" as const,
      content,
      timestamp: Date.now(),
    };
    deps.messages.value.push(userMessage);
    deps.scrollToBottom();
    deps.saveChat();
  }

  // ===== 話題引導 =====
  const showTopicPromptModal = ref(false);
  const topicPromptInput = ref("");
  const showTopicPromptChoiceModal = ref(false);

  async function executeTopicPrompt(topic: string) {
    showTopicPromptModal.value = false;
    showTopicPromptChoiceModal.value = false;
    topicPromptInput.value = "";

    const topicInstruction = `【話題引導】請根據以下話題主動向用戶發起對話。用自然、符合你性格的方式提起這個話題，就像是你自己想到的一樣。話題：${topic}`;

    // 以隱藏的方式注入提示詞，不顯示在聊天記錄中
    await deps.triggerAIResponse({ holidayTriggerPrompt: topicInstruction });
  }

  async function confirmTopicPrompt() {
    const topic = topicPromptInput.value.trim();
    if (!topic) {
      showTopicPromptModal.value = false;
      showTopicPromptChoiceModal.value = true;
      return;
    }
    await executeTopicPrompt(topic);
  }

  async function useHistoryBasedTopic() {
    showTopicPromptChoiceModal.value = false;
    if (deps.messages.value.length <= 3) {
      await useRandomTopic();
      return;
    }
    const topic = "依照前文對話來提出一個相關的話題";
    await executeTopicPrompt(topic);
  }

  async function useRandomTopic() {
    showTopicPromptChoiceModal.value = false;
    const topics = [
      "今天的天氣",
      "最近看的電影或劇",
      "週末的計劃",
      "喜歡的音樂類型",
      "最近的心情",
      "想去的旅行地點",
      "喜歡的食物",
      "童年的回憶",
      "夢想或目標",
      "有趣的經歷",
      "喜歡的季節",
      "最近的困擾",
      "感興趣的話題",
      "喜歡的顏色",
      "放鬆的方式",
      "最近學到的東西",
      "想嘗試的新事物",
      "珍貴的回憶",
      "理想的一天",
      "最近的發現",
    ];
    const randomTopic = topics[Math.floor(Math.random() * topics.length)];
    await executeTopicPrompt(randomTopic);
  }

  function cancelTopicPrompt() {
    showTopicPromptModal.value = false;
    showTopicPromptChoiceModal.value = false;
    topicPromptInput.value = "";
  }

  // ===== 位置分享 =====
  const showLocationModal = ref(false);
  const locationInput = ref("");

  function confirmLocation() {
    const location = locationInput.value.trim();
    if (!location) return;

    const locationMessage = {
      id: `msg_location_${Date.now()}`,
      role: "user" as const,
      content: location,
      timestamp: Date.now(),
      isLocation: true,
      locationContent: location,
    };

    deps.messages.value.push(locationMessage);
    deps.scrollToBottom();
    deps.saveChat();
    showLocationModal.value = false;
    locationInput.value = "";
  }

  function cancelLocation() {
    showLocationModal.value = false;
    locationInput.value = "";
  }

  // ===== 天氣分享（可編輯用戶/角色所在地） =====
  /** 將 WeatherData.location 組成「城市, 地區, 國家」格式（缺項自動省略，重複自動去除） */
  function formatFullLocation(
    loc: { name?: string; region?: string; country?: string } | undefined | null,
  ): string {
    if (!loc) return "";
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const v of [loc.name, loc.region, loc.country]) {
      const t = (v || "").trim();
      if (!t) continue;
      const norm = t.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      parts.push(t);
    }
    return parts.join(", ");
  }

  const showWeatherModal = ref(false);
  // 搜尋
  const weatherSearchQuery = ref("");
  const weatherSearchResults = ref<
    Array<{
      id: number;
      name: string;
      region: string;
      country: string;
      lat: number;
      lon: number;
    }>
  >([]);
  const weatherSearchLoading = ref(false);

  // 自動搜尋（debounce）
  let _weatherSearchDebounce: ReturnType<typeof setTimeout> | null = null;
  watch(weatherSearchQuery, (val) => {
    if (_weatherSearchDebounce) clearTimeout(_weatherSearchDebounce);
    const q = val.trim();
    if (!q || q.length < 2) {
      weatherSearchResults.value = [];
      return;
    }
    _weatherSearchDebounce = setTimeout(async () => {
      weatherSearchLoading.value = true;
      try {
        weatherSearchResults.value = await searchCities(q);
      } catch {
        weatherSearchResults.value = [];
      } finally {
        weatherSearchLoading.value = false;
      }
    }, 350);
  });
  // 用戶自訂天氣
  const customWeatherData = ref<WeatherData | null>(null);
  const customWeatherCity = ref("");
  // 角色天氣
  const charWeatherData = ref<WeatherData | null>(null);
  const charWeatherLoading = ref(false);
  // 編輯目標：'user' | 'char' | null
  const weatherEditTarget = ref<"user" | "char" | null>(null);
  // 發送對象：'both' | 'user' | 'char'
  const weatherSendTarget = ref<"both" | "user" | "char">("both");

  /**
   * 嘗試從 WORLD_CITIES 為一段角色地點字串找出精確座標。
   * 規則：在字串中找到屬於 WORLD_CITIES key 的國家後，再於該國的城市清單裡比對 name。
   * 比對方式為「包含」雙向（容忍 "東京" vs "東京, 日本" vs "Tokyo" 等差異），全部失敗則回 null。
   */
  function lookupWorldCityCoords(
    locationText: string,
  ): { lat: number; lon: number; country: string; cityName: string } | null {
    if (!locationText) return null;
    const parts = locationText
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;
    const countryKeys = Object.keys(WORLD_CITIES);
    let matchedCountry = "";
    for (let i = parts.length - 1; i >= 0; i--) {
      if (countryKeys.includes(parts[i])) {
        matchedCountry = parts[i];
        break;
      }
    }
    if (!matchedCountry) return null;
    const cities = WORLD_CITIES[matchedCountry];
    if (!cities) return null;
    // 城市名候選：扣掉 country 後的所有段落
    const cityCandidates = parts.filter((p) => p !== matchedCountry);
    for (const c of cities) {
      for (const cand of cityCandidates) {
        if (cand === c.name || cand.includes(c.name) || c.name.includes(cand)) {
          return { lat: c.lat, lon: c.lon, country: matchedCountry, cityName: c.name };
        }
      }
    }
    return null;
  }

  /** 開啟天氣 modal 時自動載入角色天氣 */
  async function openWeatherModal() {
    showWeatherModal.value = true;
    // 重新設計後：開啟時不再自動進入編輯模式，由整列可點的卡片引導
    weatherEditTarget.value = null;
    // 預設兩邊都送，後續會依資料可用性自動修正
    weatherSendTarget.value = "both";
    // 自動查詢角色天氣
    const char = deps.currentCharacter?.value;
    const ws = char?.worldSettings;
    const charLocation = ws?.location;
    if (charLocation && !charWeatherData.value) {
      charWeatherLoading.value = true;
      try {
        // 1) 已存座標 → 直接用座標查（最準確）
        if (typeof ws?.lat === "number" && typeof ws?.lon === "number") {
          charWeatherData.value = await getWeatherByCoords(ws.lat, ws.lon);
        } else {
          // 2) 沒座標 → 先試 WORLD_CITIES 精確比對（避免 Open-Meteo geocoding 模糊命中）
          const matched = lookupWorldCityCoords(charLocation);
          if (matched) {
            charWeatherData.value = await getWeatherByCoords(matched.lat, matched.lon);
          } else {
            // 3) 最後才走字串模糊查
            charWeatherData.value = await getWeatherByCity(charLocation);
          }

          // 一次性回填座標 + 修正 location 字串，避免下次再走 fuzzy
          if (charWeatherData.value && char) {
            const data = charWeatherData.value;
            const backfillLat = matched?.lat ?? data.location.lat;
            const backfillLon = matched?.lon ?? data.location.lon;
            if (typeof backfillLat === "number" && typeof backfillLon === "number") {
              const correctedLabel =
                formatFullLocation(data.location) || charLocation;
              try {
                const charactersStore = useCharactersStore();
                await charactersStore.updateCharacter(char.id, {
                  worldSettings: {
                    ...char.worldSettings,
                    location: correctedLabel,
                    lat: backfillLat,
                    lon: backfillLon,
                  },
                });
                if (char.worldSettings) {
                  char.worldSettings.location = correctedLabel;
                  char.worldSettings.lat = backfillLat;
                  char.worldSettings.lon = backfillLon;
                } else {
                  char.worldSettings = {
                    location: correctedLabel,
                    lat: backfillLat,
                    lon: backfillLon,
                  };
                }
              } catch (e) {
                console.warn("[天氣分享] 回填角色座標失敗", e);
              }
            }
          }
        }
      } catch {
        console.warn("[天氣分享] 角色天氣查詢失敗");
      } finally {
        charWeatherLoading.value = false;
      }
    }
  }

  /** 開始編輯某一方的所在地 */
  function startWeatherEdit(target: "user" | "char") {
    weatherEditTarget.value = target;
    weatherSearchQuery.value = "";
    weatherSearchResults.value = [];
  }

  /** 取消編輯模式 */
  function cancelWeatherEdit() {
    weatherEditTarget.value = null;
    weatherSearchQuery.value = "";
    weatherSearchResults.value = [];
  }

  async function searchWeatherCities() {
    const q = weatherSearchQuery.value.trim();
    if (!q) return;
    weatherSearchLoading.value = true;
    try {
      weatherSearchResults.value = await searchCities(q);
    } catch {
      weatherSearchResults.value = [];
    } finally {
      weatherSearchLoading.value = false;
    }
  }

  /** 選擇城市後，根據 editTarget 套用到用戶或角色 */
  async function selectWeatherCity(
    city: {
      id: number;
      name: string;
      region: string;
      country: string;
      lat: number;
      lon: number;
    },
    options: { skipGlobalUserUpdate?: boolean } = {},
  ) {
    weatherSearchLoading.value = true;
    try {
      let data: WeatherData;
      try {
        data = await getWeatherByCoords(city.lat, city.lon);
      } catch {
        data = await getWeatherByCity(city.name);
      }

      // 完整地點 label（城市, 地區, 國家），優先用 API 回傳的資料補足
      const cityLabel = formatFullLocation({
        name: city.name || data.location.name,
        region: city.region || data.location.region,
        country: city.country || data.location.country,
      });

      const target = weatherEditTarget.value;
      if (target === "char") {
        // 更新角色所在地
        charWeatherData.value = data;
        const char = deps.currentCharacter?.value;
        if (char) {
          const charactersStore = useCharactersStore();
          await charactersStore.updateCharacter(char.id, {
            worldSettings: {
              ...char.worldSettings,
              location: cityLabel,
              lat: city.lat,
              lon: city.lon,
            },
          });
          // 同步本地 ref
          if (char.worldSettings) {
            char.worldSettings.location = cityLabel;
            char.worldSettings.lat = city.lat;
            char.worldSettings.lon = city.lon;
          } else {
            char.worldSettings = {
              location: cityLabel,
              lat: city.lat,
              lon: city.lon,
            };
          }
        }
      } else {
        // 更新用戶天氣
        customWeatherData.value = data;
        customWeatherCity.value = cityLabel;
        // 同時更新全域天氣 store 的手動城市（帶座標，避免城市名稱查詢誤判）
        // 若呼叫端指定僅套用到此聊天，則跳過全域更新避免影響其他聊天
        if (!options.skipGlobalUserUpdate) {
          await weatherStore.setManualCity(cityLabel, city.lat, city.lon);
          await weatherStore.refreshWeather(true);
        }
      }
    } catch {
      console.warn("[天氣分享] 無法取得城市天氣");
    } finally {
      weatherSearchLoading.value = false;
      weatherSearchQuery.value = "";
      weatherSearchResults.value = [];
      weatherEditTarget.value = null;
    }
  }

  function clearCustomWeather() {
    customWeatherData.value = null;
    customWeatherCity.value = "";
  }

  /**
   * 組合天氣分享訊息文字。回傳 null 表示沒有任何可送出的天氣資料。
   * 依 weatherSendTarget 決定要包含哪幾段（user / char / both）。
   */
  function buildWeatherContent(): {
    content: string;
    timeDiffHours: number;
    diffSummary: string;
    hasUser: boolean;
    hasChar: boolean;
  } | null {
    const target = weatherSendTarget.value;
    const userWeather = customWeatherData.value ?? weatherStore.weatherData;
    const userLocationName = userWeather
      ? formatFullLocation(userWeather.location) ||
        (customWeatherData.value
          ? customWeatherData.value.location.name
          : weatherStore.locationName)
      : "";
    const charWeather = charWeatherData.value;
    const charLocationName = charWeather
      ? formatFullLocation(charWeather.location) || charWeather.location.name
      : "";

    const includeUser = (target === "both" || target === "user") && !!userWeather;
    const includeChar = (target === "both" || target === "char") && !!charWeather;
    if (!includeUser && !includeChar) return null;

    const isRealTimeAware = deps.getRealTimeAwareness ? deps.getRealTimeAwareness() : true;
    const currentVirtualTime = deps.getFakeTime ? deps.getFakeTime() : new Date();

    // 計算時差（僅在雙方都有資料時有意義）。優先比較 UTC 偏移，避免同時區城市因 API localtime 刷新粒度不同被誤判。
    let timeDiffHours = 0;
    let timeDiffSeconds = 0;
    let diffText = "";
    let diffSummary = "";
    if (userWeather && charWeather) {
      const userOffset = getWeatherOffsetSeconds(userWeather, "user", currentVirtualTime);
      const charOffset = getWeatherOffsetSeconds(charWeather, "char", currentVirtualTime);
      if (typeof userOffset === "number" && typeof charOffset === "number") {
        timeDiffSeconds = charOffset - userOffset;
        timeDiffHours = Math.round((timeDiffSeconds / (60 * 60)) * 2) / 2;
      }
      if (Math.abs(timeDiffHours) > 0) {
        const amount = formatTimeDiffAmount(timeDiffHours);
        diffSummary = `對方比你${timeDiffHours > 0 ? "快" : "慢"} ${amount} 小時`;
        if (target === "both") {
          diffText = `\n\n[時區差異] 客觀上的時區差異計算，對方所在時區比你${timeDiffHours > 0 ? "快" : "慢"} ${amount} 小時。`;
        }
      } else if (typeof userOffset === "number" && typeof charOffset === "number") {
        diffSummary = "雙方在同一個時區";
        if (target === "both") {
          diffText = `\n\n[時區差異] 雙方在同一個時區。`;
        }
      }
    }

    const userTimeLine = isRealTimeAware && includeUser
      ? `\n當地時間：${formatDateTime(currentVirtualTime)}`
      : "";
    const charTimeLine = isRealTimeAware && includeChar
      ? `\n當地時間：${formatDateTime(new Date(currentVirtualTime.getTime() + timeDiffSeconds * 1000))}`
      : "";

    const userBlock = includeUser && userWeather
      ? `【我的天氣】
地點：${userLocationName}${userTimeLine}
天氣：${userWeather.current.condition.text}
溫度：${Math.round(userWeather.current.temp_c)}°C（體感 ${Math.round(userWeather.current.feelslike_c)}°C）
濕度：${userWeather.current.humidity}%`
      : "";

    const charBlock = includeChar && charWeather
      ? `【你的天氣】
地點：${charLocationName}${charTimeLine}
天氣：${charWeather.current.condition.text}
溫度：${Math.round(charWeather.current.temp_c)}°C（體感 ${Math.round(charWeather.current.feelslike_c)}°C）
濕度：${charWeather.current.humidity}%`
      : "";

    const sections = [userBlock, charBlock].filter(Boolean).join("\n\n");

    let prompt: string;
    if (includeUser && includeChar) {
      prompt = `*對方與你分享了天氣和時區，請針對以上天氣與時差情報做出符合情境的回應，不要複述冷冰冰的資訊，可以根據溫度差異、${isRealTimeAware ? "晚睡早起、" : ""}時差或目前時間來關心情境。*`;
    } else if (includeUser) {
      prompt = `*對方分享了自己這邊的天氣，請自然地回應，不要複述資訊，可以根據天氣關心對方的情境。*`;
    } else {
      prompt = `*對方主動詢問或描述了你（角色）那邊的天氣，請以角色的視角自然回應，不要複述資訊。*`;
    }

    const content = `<天氣分享>
${sections}${diffText}

${prompt}
</天氣分享>`;

    return {
      content,
      timeDiffHours,
      diffSummary,
      hasUser: includeUser,
      hasChar: includeChar,
    };
  }

  /** 預覽用 computed：依目前 weatherSendTarget / 資料即時組合 */
  const weatherPreview = computed(() => buildWeatherContent());

  async function sendWeatherMessage() {
    // 若兩邊都沒資料且全域天氣也沒載入，嘗試刷新一次
    if (!customWeatherData.value && !weatherStore.weatherData && !charWeatherData.value) {
      await weatherStore.refreshWeather();
    }

    const built = buildWeatherContent();
    if (!built) {
      console.warn("無法獲取天氣數據");
      showWeatherModal.value = false;
      return;
    }

    const weatherMessage = {
      id: `msg_weather_${Date.now()}`,
      role: "user" as const,
      content: built.content,
      timestamp: Date.now(),
    };

    deps.messages.value.push(weatherMessage);
    deps.scrollToBottom();
    deps.saveChat();
    showWeatherModal.value = false;
    customWeatherData.value = null;
    customWeatherCity.value = "";
  }

  function cancelWeather() {
    showWeatherModal.value = false;
    customWeatherData.value = null;
    customWeatherCity.value = "";
    charWeatherData.value = null;
    weatherSearchQuery.value = "";
    weatherSearchResults.value = [];
    weatherEditTarget.value = null;
  }

  return {
    // 遊戲成績
    showGameScorePicker,
    handleGameScoreSelect,
    // 話題引導
    showTopicPromptModal,
    topicPromptInput,
    showTopicPromptChoiceModal,
    confirmTopicPrompt,
    useHistoryBasedTopic,
    useRandomTopic,
    cancelTopicPrompt,
    // 位置分享
    showLocationModal,
    locationInput,
    confirmLocation,
    cancelLocation,
    // 天氣分享
    showWeatherModal,
    openWeatherModal,
    sendWeatherMessage,
    cancelWeather,
    weatherSearchQuery,
    weatherSearchResults,
    weatherSearchLoading,
    customWeatherData,
    customWeatherCity,
    charWeatherData,
    charWeatherLoading,
    searchWeatherCities,
    selectWeatherCity,
    clearCustomWeather,
    weatherEditTarget,
    startWeatherEdit,
    cancelWeatherEdit,
    weatherSendTarget,
    weatherPreview,
    formatFullLocation,
    getVirtualLocalTime: (targetWeather: WeatherData | null) => {
      const isRealTimeAware = deps.getRealTimeAwareness ? deps.getRealTimeAwareness() : true;
      if (!isRealTimeAware) return "";
      const virtualNow = deps.getFakeTime ? deps.getFakeTime() : new Date();

      if (!targetWeather) {
        return formatDateTime(virtualNow);
      }
      
      const baseWeather = customWeatherData.value ?? weatherStore.weatherData;
      if (!baseWeather) {
        return formatDateTime(virtualNow);
      }

      const baseOffset = getWeatherOffsetSeconds(baseWeather, "user", virtualNow);
      const targetRole = targetWeather === charWeatherData.value ? "char" : "user";
      const targetOffset = getWeatherOffsetSeconds(targetWeather, targetRole, virtualNow);
      if (typeof baseOffset !== "number" || typeof targetOffset !== "number") {
        return formatDateTime(virtualNow);
      }
      
      const targetVirtualTime = new Date(virtualNow.getTime() + (targetOffset - baseOffset) * 1000);
      return formatDateTime(targetVirtualTime);
    }
  };
}
