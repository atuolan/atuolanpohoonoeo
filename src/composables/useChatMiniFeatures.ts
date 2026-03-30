import {
  getWeatherByCity,
  getWeatherByCoords,
  searchCities,
  type WeatherData,
} from "@/services/WeatherService";
import { useCharactersStore } from "@/stores/characters";
import { useWeatherStore } from "@/stores/weather";
import type { StoredCharacter } from "@/types/character";
import { ref, type Ref } from "vue";

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
}) {
  const weatherStore = useWeatherStore();

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

    const topicMessage = {
      id: `msg_topic_${Date.now()}`,
      role: "user" as const,
      content: topicInstruction,
      timestamp: Date.now(),
    };
    deps.messages.value.push(topicMessage);

    await deps.triggerAIResponse();

    deps.messages.value = deps.messages.value.filter(
      (m: any) => m.id !== topicMessage.id,
    );
    await deps.saveChatImmediate();
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
  // 用戶自訂天氣
  const customWeatherData = ref<WeatherData | null>(null);
  const customWeatherCity = ref("");
  // 角色天氣
  const charWeatherData = ref<WeatherData | null>(null);
  const charWeatherLoading = ref(false);
  // 編輯目標：'user' | 'char' | null
  const weatherEditTarget = ref<"user" | "char" | null>(null);

  /** 開啟天氣 modal 時自動載入角色天氣 */
  async function openWeatherModal() {
    showWeatherModal.value = true;
    weatherEditTarget.value = null;
    // 自動查詢角色天氣
    const char = deps.currentCharacter?.value;
    const charLocation = char?.worldSettings?.location;
    if (charLocation && !charWeatherData.value) {
      charWeatherLoading.value = true;
      try {
        charWeatherData.value = await getWeatherByCity(charLocation);
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
  async function selectWeatherCity(city: {
    id: number;
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }) {
    weatherSearchLoading.value = true;
    try {
      let data: WeatherData;
      try {
        data = await getWeatherByCoords(city.lat, city.lon);
      } catch {
        data = await getWeatherByCity(city.name);
      }

      const target = weatherEditTarget.value;
      if (target === "char") {
        // 更新角色所在地
        charWeatherData.value = data;
        const char = deps.currentCharacter?.value;
        if (char) {
          const charactersStore = useCharactersStore();
          const cityLabel = city.region
            ? `${city.name}, ${city.region}`
            : city.name;
          await charactersStore.updateCharacter(char.id, {
            worldSettings: {
              ...char.worldSettings,
              location: cityLabel,
            },
          });
          // 同步本地 ref
          if (char.worldSettings) {
            char.worldSettings.location = cityLabel;
          } else {
            char.worldSettings = { location: cityLabel };
          }
        }
      } else {
        // 更新用戶天氣
        customWeatherData.value = data;
        customWeatherCity.value = city.name;
        // 同時更新全域天氣 store 的手動城市
        const cityLabel = city.region
          ? `${city.name}, ${city.region}`
          : city.name;
        weatherStore.setManualCity(cityLabel);
        await weatherStore.refreshWeather(true);
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

  async function sendWeatherMessage() {
    // 優先使用自訂城市天氣，否則用全域天氣
    let weather = customWeatherData.value ?? weatherStore.weatherData;
    let locationName = customWeatherData.value
      ? customWeatherData.value.location.name
      : weatherStore.locationName;

    if (!weather) {
      await weatherStore.refreshWeather();
      weather = weatherStore.weatherData;
      locationName = weatherStore.locationName;
    }
    if (!weather) {
      console.warn("無法獲取天氣數據");
      showWeatherModal.value = false;
      return;
    }

    const weatherContent = `<天氣分享>
地點：${locationName}
天氣：${weather.current.condition.text}
溫度：${Math.round(weather.current.temp_c)}°C（體感 ${Math.round(weather.current.feelslike_c)}°C）
濕度：${weather.current.humidity}%
</天氣分享>`;

    const weatherMessage = {
      id: `msg_weather_${Date.now()}`,
      role: "user" as const,
      content: weatherContent,
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
  };
}
