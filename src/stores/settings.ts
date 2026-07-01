import {
  createDefaultMiniMaxTTSSettings,
  type MiniMaxTTSSettings,
} from "@/api/MiniMaxTTSApi";
import {
  createDefaultNovelAIImageSettings,
  type NovelAIImageSettings,
} from "@/api/NovelAIImageApi";
import {
  SETTINGS_ID,
  loadSettingsData,
  saveSettingsData,
} from "@/storage/settingsStorage";
import type { APISettings, AudioSettings } from "@/types/settings";
import {
  createDefaultAPISettings,
  createDefaultAudioSettings,
} from "@/types/settings";
import { defineStore } from "pinia";
import { computed, reactive, ref, toRaw } from "vue";

// ===== 類型定義 =====

export interface GenerationParams {
  temperature: number;
  maxTokens: number;
  maxContextLength: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  streamingEnabled: boolean;
  useStreamingWindow: boolean;
  /** 是否發送 temperature 參數（關閉則不傳給 API） */
  enableTemperature: boolean;
  /** 是否發送 top_p 參數 */
  enableTopP: boolean;
  /** 是否發送 top_k 參數 */
  enableTopK: boolean;
  /** 是否發送 frequency_penalty 參數 */
  enableFrequencyPenalty: boolean;
  /** 是否發送 presence_penalty 參數 */
  enablePresencePenalty: boolean;
}

export interface APIProfile {
  id: string;
  name: string;
  api: APISettings;
  generation: GenerationParams;
  createdAt: number;
  updatedAt: number;
  /** 最近一次被切換為當前配置的時間（可選，舊資料可能沒有） */
  lastUsedAt?: number;
}

export interface AuxiliaryProfile {
  id: string;
  name: string;
  api: APISettings;
  generation: GenerationParams;
  createdAt: number;
  updatedAt: number;
  /** 最近一次被切換為當前配置的時間 */
  lastUsedAt?: number;
}

export const ROUTABLE_TASKS = [
  "summary",
  "diary",
  "importantEvents",
  "chat",
  "phoneCall",
  "groupCall",
  "peekPhone",
  "plurkPost",
  "plurkComment",
  "theater",
  "characterGen",
  "fate",
  "themeAssistant",
] as const;

export type RoutableTaskType = (typeof ROUTABLE_TASKS)[number];

export interface AuxiliaryTaskOption {
  id: RoutableTaskType;
  name: string;
  icon: string;
  description: string;
}

export interface AuxiliaryAPIConfig {
  enabled: boolean;
  api: APISettings;
  generation: GenerationParams;
  enabledTasks: string[];
  taskBindings: Record<RoutableTaskType, string | null>;
  taskDirectConnect: Record<RoutableTaskType, boolean | null>;
  profiles: AuxiliaryProfile[];
  currentProfileId: string | null;
}

export const AUXILIARY_TASKS: readonly AuxiliaryTaskOption[] = [
  { id: "summary", name: "對話總結", icon: "📝", description: "自動總結對話內容" },
  { id: "diary", name: "日記", icon: "📔", description: "角色日記生成" },
  { id: "importantEvents", name: "重要事件總結", icon: "📋", description: "從對話中提取重要事件" },
  { id: "chat", name: "一般聊天", icon: "💭", description: "聊天主流程 AI 回覆生成" },
  { id: "phoneCall", name: "電話通話", icon: "📞", description: "語音/視訊通話 AI 回覆生成" },
  { id: "groupCall", name: "群通話", icon: "👥", description: "群聊通話 AI 回覆生成" },
  { id: "peekPhone", name: "偷窺手機", icon: "📱", description: "偷窺角色手機內容生成" },
  { id: "plurkPost", name: "噗浪發文", icon: "📮", description: "噗浪空間 AI 自動發文" },
  { id: "plurkComment", name: "噗浪評論", icon: "💬", description: "噗浪空間 AI 批量評論" },
  { id: "theater", name: "小劇場", icon: "🎭", description: "小劇場博主自動生成" },
  { id: "characterGen", name: "生成角色卡", icon: "👤", description: "AI 角色卡生成" },
  { id: "fate", name: "占卜", icon: "🔮", description: "塔羅占卜 AI 解讀" },
  { id: "themeAssistant", name: "介面美化助手", icon: "✨", description: "對話式 AI 美化介面外觀" },
] as const;

export interface EmbeddingAPIConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  directConnect?: boolean;
}

export interface IncomingCallRingtoneSettings {
  selectedRingtoneId: string;
  volume: number;
  customAudioDataUrl: string;
  customAudioName: string;
}

export interface SettingsData {
  id: string;
  currentProfileId: string | null;
  api?: APISettings;
  generation?: GenerationParams;
  profiles: APIProfile[];
  auxiliary: AuxiliaryAPIConfig;
  novelAIImage: NovelAIImageSettings;
  minimaxTTS: MiniMaxTTSSettings;
  language: "zh-TW" | "zh-CN" | "none";
  doNotDisturb: boolean;
  faceToFaceMode: boolean;
  nightMode: boolean;
  customQuickActions: QuickActionItem[];
  backgroundGenerationEnabled: boolean;
  backgroundAudioEnabled: boolean;
  keepAliveMode: "audio";
  audio: AudioSettings;
  incomingCallRingtone: IncomingCallRingtoneSettings;
  embeddingAPI?: EmbeddingAPIConfig;
  embeddingMode?: "local" | "api";
  vectorMemoryEnabled?: boolean;
  nearbyPlacesLimit: number;
  nearbyPlacesRadius: number;
  updatedAt: number;
}

export interface QuickActionItem {
  label: string;
  text: string;
  hint: string;
}

function isRoutableTaskType(taskType: string): taskType is RoutableTaskType {
  return ROUTABLE_TASKS.includes(taskType as RoutableTaskType);
}

function createDefaultTaskBindings(): Record<RoutableTaskType, string | null> {
  return ROUTABLE_TASKS.reduce(
    (bindings, taskType) => {
      bindings[taskType] = null;
      return bindings;
    },
    {} as Record<RoutableTaskType, string | null>,
  );
}

function createDefaultTaskDirectConnect(): Record<RoutableTaskType, boolean | null> {
  return ROUTABLE_TASKS.reduce(
    (map, taskType) => {
      map[taskType] = null;
      return map;
    },
    {} as Record<RoutableTaskType, boolean | null>,
  );
}

function normalizeTaskBindings(
  bindings?: Partial<Record<RoutableTaskType, string | null>>,
): Record<RoutableTaskType, string | null> {
  return {
    ...createDefaultTaskBindings(),
    ...(bindings ?? {}),
  };
}

function createDefaultGenerationParams(): GenerationParams {
  return {
    temperature: 0.7,
    maxTokens: 2048,
    maxContextLength: 12000,
    topP: 1,
    topK: 0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    streamingEnabled: true,
    useStreamingWindow: true,
    // 開關預設：temperature / topP 開啟，penalty / topK 關閉
    enableTemperature: true,
    enableTopP: true,
    enableTopK: false,
    enableFrequencyPenalty: false,
    enablePresencePenalty: false,
  };
}

/**
 * 補齊舊資料缺少的生成參數欄位（新增的 topK 與開關）。
 * 直接在傳入物件上補值並回傳，確保 reactive 物件欄位完整。
 */
function ensureGenerationParamsDefaults(
  params: Partial<GenerationParams> & Record<string, unknown>,
): GenerationParams {
  const defaults = createDefaultGenerationParams();
  if (params.topK === undefined) params.topK = defaults.topK;
  if (params.enableTemperature === undefined)
    params.enableTemperature = defaults.enableTemperature;
  if (params.enableTopP === undefined) params.enableTopP = defaults.enableTopP;
  if (params.enableTopK === undefined) params.enableTopK = defaults.enableTopK;
  if (params.enableFrequencyPenalty === undefined)
    params.enableFrequencyPenalty = defaults.enableFrequencyPenalty;
  if (params.enablePresencePenalty === undefined)
    params.enablePresencePenalty = defaults.enablePresencePenalty;
  return params as GenerationParams;
}

function normalizeMaxContextLength(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return createDefaultGenerationParams().maxContextLength;
  }
  return Math.min(200000, Math.max(4096, Math.round(numeric)));
}

const createDefaultAuxiliaryConfig = (): AuxiliaryAPIConfig => ({
  enabled: false,
  api: createDefaultAPISettings(),
  generation: createDefaultGenerationParams(),
  enabledTasks: [],
  taskBindings: createDefaultTaskBindings(),
  taskDirectConnect: createDefaultTaskDirectConnect(),
  profiles: [],
  currentProfileId: null,
});

const createDefaultIncomingCallRingtoneSettings =
  (): IncomingCallRingtoneSettings => ({
    selectedRingtoneId: "classic",
    volume: 0.8,
    customAudioDataUrl: "",
    customAudioName: "",
  });

// ===== Store =====

export const useSettingsStore = defineStore("settings", () => {
  // 狀態
  const isLoaded = ref(false);
  const isLoading = ref(false);

  // 配置文件列表
  const profiles = ref<APIProfile[]>([]);

  // 當前選中的配置文件 ID
  const currentProfileId = ref<string | null>(null);

  // 當前 API 設定（直接編輯用）
  const api = reactive<APISettings>(createDefaultAPISettings());

  // 當前生成參數（直接編輯用）
  const generation = reactive<GenerationParams>(
    createDefaultGenerationParams(),
  );

  // 備用 API 配置
  const auxiliary = reactive<AuxiliaryAPIConfig>(
    createDefaultAuxiliaryConfig(),
  );

  // NovelAI 圖像生成設定
  const novelAIImage = reactive<NovelAIImageSettings>(
    createDefaultNovelAIImageSettings(),
  );

  // MiniMax TTS 語音合成設定
  const minimaxTTS = reactive<MiniMaxTTSSettings>(
    createDefaultMiniMaxTTSSettings(),
  );

  // 語言設定
  // 預設為 'none' = 不轉換（按使用者打字 / AI 回覆原樣顯示），避免簡體使用者預設被自動轉成繁體
  const language = ref<"zh-TW" | "zh-CN" | "none">("none");

  // 勿擾模式設定
  const doNotDisturb = ref(false);

  // 面對面模式（聊天時雙方頭像面對面顯示）
  const faceToFaceMode = ref(false);

  // 夜晚模式（深色主題）
  const nightMode = ref(false);

  // 自定義快速輸入按鈕
  const customQuickActions = ref<QuickActionItem[]>([]);

  // HF 後台生成全域開關（預設關閉，保持既有本地生成行為）
  const backgroundGenerationEnabled = ref(false);

  // 背景無聲音樂（防止瀏覽器後台暫停）
  const backgroundAudioEnabled = ref(false);

  // 保活模式：僅音頻模式
  const keepAliveMode = ref<"audio">("audio");

  // 語音訊息設定
  const audio = reactive<AudioSettings>(createDefaultAudioSettings());

  // 來電鈴聲設定
  const incomingCallRingtone = reactive<IncomingCallRingtoneSettings>(
    createDefaultIncomingCallRingtoneSettings(),
  );

  // Embedding API 設定（向量記憶用）
  const embeddingAPI = reactive<EmbeddingAPIConfig>({
    endpoint: "",
    apiKey: "",
    model: "",
    directConnect: false,
  });

  // 嵌入模式：local（本地 Web Worker 推理）或 api（遠端 API），預設 api
  const embeddingMode = ref<"local" | "api">("api");

  // 向量記憶全域開關（啟用後，所有聊天的總結會自動嵌入並用語義檢索）
  // 預設開啟；首次啟動時若本地模型未下載，App.vue 會提示使用者下載或前往設定關閉
  const vectorMemoryEnabled = ref(true);

  // 附近地點注入筆數（5–30，預設 5）
  const nearbyPlacesLimit = ref(5);

  // 附近地點搜尋半徑（公尺，10–100，預設 10）
  const nearbyPlacesRadius = ref(10);

  // ===== 計算屬性 =====

  // 當前配置文件
  const currentProfile = computed(() => {
    if (!currentProfileId.value) return null;
    return profiles.value.find((p) => p.id === currentProfileId.value) || null;
  });

  // 是否有有效的 API 配置
  const hasValidConfig = computed(() => {
    return !!(api.endpoint && api.apiKey && api.model);
  });

  /** 取得有效的 Embedding API 設定（未設定時 fallback 到主 API） */
  const effectiveEmbeddingAPI = computed(() => ({
    endpoint: embeddingAPI.endpoint || api.endpoint,
    apiKey: embeddingAPI.apiKey || api.apiKey,
    model: embeddingAPI.model,
    directConnect: embeddingAPI.directConnect ?? false,
  }));

  function getGlobalGenerationParams(
    source: GenerationParams,
  ): GenerationParams {
    return {
      ...toRaw(source),
      maxContextLength: normalizeMaxContextLength(generation.maxContextLength),
    };
  }

  // ===== 方法 =====

  /** 正在進行的載入 Promise（用於防止並發載入時丟失等待） */
  let _loadingPromise: Promise<void> | null = null;

  /**
   * 從 IDB 載入設定
   */
  async function loadSettings(): Promise<void> {
    // 如果已經在載入中，等待現有的載入完成而不是直接返回
    if (isLoading.value && _loadingPromise) {
      await _loadingPromise;
      return;
    }

    isLoading.value = true;

    const doLoad = async () => {
      try {
        const saved = await loadSettingsData();

        if (saved) {
          const savedGlobalMaxContextLength = normalizeMaxContextLength(
            saved.generation?.maxContextLength,
          );

          // 載入配置文件列表
          if (saved.profiles && Array.isArray(saved.profiles)) {
            profiles.value = saved.profiles;
          }

          // 載入當前配置文件 ID
          currentProfileId.value = saved.currentProfileId || null;

          // 如果有當前配置文件，載入其設定
          const current = profiles.value.find(
            (p) => p.id === currentProfileId.value,
          );
          if (current) {
            Object.assign(api, current.api);
            Object.assign(generation, current.generation);
          } else {
            if (saved.api) {
              Object.assign(api, saved.api);
            }
            if (saved.generation) {
              Object.assign(generation, saved.generation);
            }
          }
          generation.maxContextLength = savedGlobalMaxContextLength;
          // 補齊舊資料缺少的生成參數欄位（topK 與開關）
          ensureGenerationParamsDefaults(generation);
          for (const profile of profiles.value) {
            if (profile.generation) {
              ensureGenerationParamsDefaults(profile.generation);
            }
          }

          // 載入備用 API 配置
          if (saved.auxiliary) {
            Object.assign(auxiliary, saved.auxiliary);
            // 確保 profiles 和 currentProfileId 存在
            if (!auxiliary.profiles) auxiliary.profiles = [];
            if (!auxiliary.currentProfileId) auxiliary.currentProfileId = null;
            
            // 補齊備用 API 生成參數的新欄位
            if (auxiliary.generation) {
              ensureGenerationParamsDefaults(auxiliary.generation);
            }
            for (const profile of auxiliary.profiles) {
              if (profile.generation) {
                ensureGenerationParamsDefaults(profile.generation);
              }
            }

            const profileIds = new Set(auxiliary.profiles.map((p) => p.id));
            const migratedBindings = normalizeTaskBindings(
              saved.auxiliary.taskBindings,
            );

            if (!saved.auxiliary.taskBindings) {
              const legacyEnabledTasks = Array.isArray(
                saved.auxiliary.enabledTasks,
              )
                ? saved.auxiliary.enabledTasks
                : [];
              const legacyProfileId = saved.auxiliary.currentProfileId;

              if (legacyProfileId && profileIds.has(legacyProfileId)) {
                for (const taskType of legacyEnabledTasks) {
                  if (isRoutableTaskType(taskType)) {
                    migratedBindings[taskType] = legacyProfileId;
                  }
                }
              }
            }

            for (const taskType of ROUTABLE_TASKS) {
              const profileId = migratedBindings[taskType];
              if (profileId && !profileIds.has(profileId)) {
                migratedBindings[taskType] = null;
              }
            }

            auxiliary.taskBindings = migratedBindings;
            auxiliary.enabledTasks = ROUTABLE_TASKS.filter(
              (taskType) => auxiliary.taskBindings[taskType],
            );

            // 確保 taskDirectConnect 存在（舊資料相容）
            if (
              !auxiliary.taskDirectConnect ||
              typeof auxiliary.taskDirectConnect !== "object"
            ) {
              auxiliary.taskDirectConnect = createDefaultTaskDirectConnect();
            } else {
              // 補齊缺少的任務類型
              for (const taskType of ROUTABLE_TASKS) {
                if (!(taskType in auxiliary.taskDirectConnect)) {
                  auxiliary.taskDirectConnect[taskType] = null;
                }
              }
            }
          }

          // 載入 NovelAI 圖像生成設定
          if (saved.novelAIImage) {
            Object.assign(novelAIImage, saved.novelAIImage);
            // 舊資料相容：補上新欄位預設值
            if (novelAIImage.positivePromptPrefix === undefined)
              novelAIImage.positivePromptPrefix = "";
            if (novelAIImage.positivePromptSuffix === undefined)
              novelAIImage.positivePromptSuffix = "";
            if (novelAIImage.useUserTag === undefined)
              novelAIImage.useUserTag = false;

            // 一次性遷移：代理修復（CORS preflight + SW 攔截）後，
            // 把所有未遷移過的使用者強制翻回「使用代理 = ON」。
            // 之後使用者再手動關閉就會永久保留 false，不會再被覆寫。
            if (!novelAIImage.proxyDefaultEnforcedV1) {
              novelAIImage.useProxy = true;
              novelAIImage.proxyDefaultEnforcedV1 = true;
            }
          }

          // 載入 MiniMax TTS 語音合成設定
          if (saved.minimaxTTS) {
            Object.assign(minimaxTTS, saved.minimaxTTS);
          }

          // 載入語言設定
          if (saved.language) {
            language.value = saved.language;
          }

          // 載入勿擾模式設定
          if (saved.doNotDisturb !== undefined) {
            doNotDisturb.value = saved.doNotDisturb;
          }

          // 載入面對面模式設定
          if (saved.faceToFaceMode !== undefined) {
            faceToFaceMode.value = saved.faceToFaceMode;
          }

          // 載入夜晚模式設定
          if (saved.nightMode !== undefined) {
            nightMode.value = saved.nightMode;
          }

          // 載入自定義快速輸入按鈕
          if (
            saved.customQuickActions &&
            Array.isArray(saved.customQuickActions)
          ) {
            customQuickActions.value = saved.customQuickActions;
          }

          // 載入 HF 後台生成設定
          if (saved.backgroundGenerationEnabled !== undefined) {
            backgroundGenerationEnabled.value = saved.backgroundGenerationEnabled;
          }

          // 載入背景無聲音樂設定
          if (saved.backgroundAudioEnabled !== undefined) {
            backgroundAudioEnabled.value = saved.backgroundAudioEnabled;
          }

          // 保活模式已簡化為僅音頻，忽略舊的 mic/camera 設定

          // 載入語音訊息設定
          if (saved.audio) {
            Object.assign(audio, saved.audio);
          }

          if (saved.incomingCallRingtone) {
            Object.assign(incomingCallRingtone, saved.incomingCallRingtone);
          }

          // 載入 Embedding API 設定
          if (saved.embeddingAPI) {
            Object.assign(embeddingAPI, saved.embeddingAPI);
          }
          // 載入嵌入模式
          if (saved.embeddingMode) {
            embeddingMode.value = saved.embeddingMode;
          }
          // 載入向量記憶全域開關
          if (saved.vectorMemoryEnabled !== undefined) {
            vectorMemoryEnabled.value = saved.vectorMemoryEnabled;
          }

          // 載入附近地點設定（值域限制）
          if (saved.nearbyPlacesLimit !== undefined) {
            nearbyPlacesLimit.value = Math.min(
              30,
              Math.max(5, Number(saved.nearbyPlacesLimit) || 5),
            );
          }
          if (saved.nearbyPlacesRadius !== undefined) {
            nearbyPlacesRadius.value = Math.min(
              100,
              Math.max(10, Number(saved.nearbyPlacesRadius) || 10),
            );
          }

          // 舊資料相容與防呆
          if (!incomingCallRingtone.selectedRingtoneId) {
            incomingCallRingtone.selectedRingtoneId = "classic";
          }
          incomingCallRingtone.volume = Math.min(
            1,
            Math.max(0, Number(incomingCallRingtone.volume ?? 0.8)),
          );
          if (!incomingCallRingtone.customAudioDataUrl) {
            incomingCallRingtone.customAudioDataUrl = "";
          }
          if (!incomingCallRingtone.customAudioName) {
            incomingCallRingtone.customAudioName = "";
          }

          console.log("[SettingsStore] 設定已載入", {
            profiles: profiles.value.length,
            currentProfileId: currentProfileId.value,
            auxiliaryEnabled: auxiliary.enabled,
            auxiliaryProfiles: auxiliary.profiles?.length || 0,
          });
        } else {
          console.log("[SettingsStore] 使用默認設定");
        }

        isLoaded.value = true;
      } catch (e) {
        console.error("[SettingsStore] 載入設定失敗:", e);
      } finally {
        isLoading.value = false;
        _loadingPromise = null;
      }
    };

    _loadingPromise = doLoad();
    await _loadingPromise;
  }

  /**
   * 保存設定到 IDB
   */
  async function saveSettings(): Promise<void> {
    // 防止在 loadSettings 完成前保存，避免用空預設值覆蓋 IDB 中的資料
    if (!isLoaded.value) {
      console.warn("[SettingsStore] 設定尚未載入完成，跳過保存");
      return;
    }
    try {
      // 如果有當前配置文件，更新它
      if (currentProfileId.value) {
        const index = profiles.value.findIndex(
          (p) => p.id === currentProfileId.value,
        );
        if (index !== -1) {
          profiles.value[index] = {
            ...profiles.value[index],
            api: { ...toRaw(api) },
            generation: { ...toRaw(generation) },
            updatedAt: Date.now(),
          };
        }
      }

      // 深度克隆數據以避免 Vue 響應式代理問題
      const rawProfiles = profiles.value.map((p) => ({
        ...p,
        api: { ...toRaw(p.api) },
        generation: { ...toRaw(p.generation) },
      }));

      // 如果有當前備用配置文件，更新它
      if (auxiliary.currentProfileId) {
        const auxIndex = auxiliary.profiles.findIndex(
          (p) => p.id === auxiliary.currentProfileId,
        );
        if (auxIndex !== -1) {
          auxiliary.profiles[auxIndex] = {
            ...auxiliary.profiles[auxIndex],
            api: { ...toRaw(auxiliary.api) },
            generation: { ...toRaw(auxiliary.generation) },
            updatedAt: Date.now(),
          };
        }
      }

      const rawAuxProfiles = auxiliary.profiles.map((p) => ({
        ...p,
        api: { ...toRaw(p.api) },
        generation: { ...toRaw(p.generation) },
      }));

      const normalizedTaskBindings = normalizeTaskBindings(
        auxiliary.taskBindings,
      );
      const rawAuxiliary = {
        enabled: auxiliary.enabled,
        api: { ...toRaw(auxiliary.api) },
        generation: { ...toRaw(auxiliary.generation) },
        enabledTasks: ROUTABLE_TASKS.filter(
          (taskType) => normalizedTaskBindings[taskType],
        ),
        taskBindings: { ...normalizedTaskBindings },
        taskDirectConnect: {
          ...(auxiliary.taskDirectConnect || createDefaultTaskDirectConnect()),
        },
        profiles: rawAuxProfiles,
        currentProfileId: auxiliary.currentProfileId,
      };

      const data: SettingsData = {
        id: SETTINGS_ID,
        currentProfileId: currentProfileId.value,
        api: { ...toRaw(api) },
        generation: { ...toRaw(generation) },
        profiles: rawProfiles,
        auxiliary: rawAuxiliary,
        novelAIImage: { ...toRaw(novelAIImage) },
        minimaxTTS: { ...toRaw(minimaxTTS) },
        language: language.value,
        doNotDisturb: doNotDisturb.value,
        faceToFaceMode: faceToFaceMode.value,
        nightMode: nightMode.value,
        customQuickActions: customQuickActions.value.map((a) => ({
          ...toRaw(a),
        })),
        backgroundGenerationEnabled: backgroundGenerationEnabled.value,
        backgroundAudioEnabled: backgroundAudioEnabled.value,
        keepAliveMode: keepAliveMode.value,
        audio: { ...toRaw(audio) },
        incomingCallRingtone: { ...toRaw(incomingCallRingtone) },
        embeddingAPI: { ...toRaw(embeddingAPI) },
        embeddingMode: embeddingMode.value,
        vectorMemoryEnabled: vectorMemoryEnabled.value,
        nearbyPlacesLimit: nearbyPlacesLimit.value,
        nearbyPlacesRadius: nearbyPlacesRadius.value,
        updatedAt: Date.now(),
      };

      await saveSettingsData(data);
      console.log("[SettingsStore] 設定已保存");
    } catch (e) {
      console.error("[SettingsStore] 保存設定失敗:", e);
      throw e;
    }
  }

  /**
   * 創建新配置文件
   */
  function createProfile(name: string): APIProfile {
    const profile: APIProfile = {
      id: "profile-" + Date.now(),
      name,
      api: { ...api },
      generation: { ...generation },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    profiles.value.push(profile);
    currentProfileId.value = profile.id;

    return profile;
  }

  /**
   * 切換配置文件
   */
  function switchProfile(profileId: string): void {
    const profile = profiles.value.find((p) => p.id === profileId);
    if (profile) {
      const globalMaxContextLength = normalizeMaxContextLength(
        generation.maxContextLength,
      );
      currentProfileId.value = profileId;
      profile.lastUsedAt = Date.now();
      Object.assign(api, profile.api);
      Object.assign(generation, profile.generation);
      generation.maxContextLength = globalMaxContextLength;
    }
  }

  /**
   * 刪除配置文件
   */
  function deleteProfile(profileId: string): void {
    const index = profiles.value.findIndex((p) => p.id === profileId);
    if (index !== -1) {
      profiles.value.splice(index, 1);

      // 如果刪除的是當前配置，切換到第一個
      if (currentProfileId.value === profileId) {
        if (profiles.value.length > 0) {
          switchProfile(profiles.value[0].id);
        } else {
          currentProfileId.value = null;
        }
      }
    }
  }

  /**
   * 重命名配置文件
   */
  function renameProfile(profileId: string, newName: string): void {
    const profile = profiles.value.find((p) => p.id === profileId);
    if (profile) {
      profile.name = newName;
      profile.updatedAt = Date.now();
    }
  }

  /**
   * 複製一份配置文件為新的配置（不切換當前）
   */
  function duplicateProfile(
    profileId: string,
    newName?: string,
  ): APIProfile | null {
    const source = profiles.value.find((p) => p.id === profileId);
    if (!source) return null;
    const profile: APIProfile = {
      id: "profile-" + Date.now(),
      name: newName?.trim() || `${source.name} (副本)`,
      api: { ...toRaw(source.api) },
      generation: { ...toRaw(source.generation) },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    profiles.value.push(profile);
    return profile;
  }

  /**
   * 將指定配置文件更新為傳入的 api / generation 內容（不改變當前選中）
   */
  function updateProfile(
    profileId: string,
    apiData?: Partial<APISettings>,
    genData?: Partial<GenerationParams>,
  ): void {
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) return;
    if (apiData) Object.assign(profile.api, apiData);
    if (genData) Object.assign(profile.generation, genData);
    profile.updatedAt = Date.now();
  }

  /**
   * 複製配置文件到備用 API
   */
  function copyToAuxiliary(profileId: string): void {
    const profile = profiles.value.find((p) => p.id === profileId);
    if (profile) {
      Object.assign(auxiliary.api, profile.api);
      Object.assign(auxiliary.generation, profile.generation);
      auxiliary.generation.streamingEnabled = false; // 備用 API 不需要串流
      auxiliary.generation.temperature = 0.5; // 較低溫度
    }
  }

  /**
   * 創建備用 API 配置文件
   */
  function createAuxiliaryProfile(name: string): AuxiliaryProfile {
    const profile: AuxiliaryProfile = {
      id: "aux-profile-" + Date.now(),
      name,
      api: { ...toRaw(auxiliary.api) },
      generation: { ...toRaw(auxiliary.generation) },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    auxiliary.profiles.push(profile);
    auxiliary.currentProfileId = profile.id;

    return profile;
  }

  /**
   * 切換備用 API 配置文件
   */
  function switchAuxiliaryProfile(profileId: string): void {
    const profile = auxiliary.profiles.find((p) => p.id === profileId);
    if (profile) {
      auxiliary.currentProfileId = profileId;
      profile.lastUsedAt = Date.now();
      Object.assign(auxiliary.api, profile.api);
      Object.assign(auxiliary.generation, profile.generation);
    }
  }

  /**
   * 刪除備用 API 配置文件
   */
  function deleteAuxiliaryProfile(profileId: string): void {
    const index = auxiliary.profiles.findIndex((p) => p.id === profileId);
    if (index !== -1) {
      auxiliary.profiles.splice(index, 1);

      for (const taskType of ROUTABLE_TASKS) {
        if (auxiliary.taskBindings[taskType] === profileId) {
          auxiliary.taskBindings[taskType] = null;
        }
      }

      auxiliary.enabledTasks = ROUTABLE_TASKS.filter(
        (taskType) => auxiliary.taskBindings[taskType],
      );

      if (auxiliary.currentProfileId === profileId) {
        if (auxiliary.profiles.length > 0) {
          switchAuxiliaryProfile(auxiliary.profiles[0].id);
        } else {
          auxiliary.currentProfileId = null;
        }
      }
    }
  }

  /**
   * 重命名備用 API 配置文件
   */
  function renameAuxiliaryProfile(profileId: string, newName: string): void {
    const profile = auxiliary.profiles.find((p) => p.id === profileId);
    if (profile) {
      profile.name = newName;
      profile.updatedAt = Date.now();
    }
  }

  /**
   * 複製一份備用配置為新的配置（不切換當前）
   */
  function duplicateAuxiliaryProfile(
    profileId: string,
    newName?: string,
  ): AuxiliaryProfile | null {
    const source = auxiliary.profiles.find((p) => p.id === profileId);
    if (!source) return null;
    const profile: AuxiliaryProfile = {
      id: "aux-profile-" + Date.now(),
      name: newName?.trim() || `${source.name} (副本)`,
      api: { ...toRaw(source.api) },
      generation: { ...toRaw(source.generation) },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    auxiliary.profiles.push(profile);
    return profile;
  }

  /**
   * 將指定備用配置更新為傳入的 api / generation 內容（不改變當前選中）
   */
  function updateAuxiliaryProfile(
    profileId: string,
    apiData?: Partial<APISettings>,
    genData?: Partial<GenerationParams>,
  ): void {
    const profile = auxiliary.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    if (apiData) Object.assign(profile.api, apiData);
    if (genData) Object.assign(profile.generation, genData);
    profile.updatedAt = Date.now();
  }

  function isUsableAuxiliaryProfile(
    profile: AuxiliaryProfile | undefined,
  ): profile is AuxiliaryProfile {
    return !!(
      profile?.api.endpoint?.trim() &&
      profile.api.apiKey?.trim() &&
      profile.api.model?.trim()
    );
  }

  /**
   * 檢查任務是否應該使用備用 API
   */
  function shouldUseAuxiliary(taskType: string): boolean {
    // 備用 API 總開關關閉時，一律不使用備用
    if (!auxiliary.enabled) return false;
    if (!isRoutableTaskType(taskType)) return false;
    const profileId = auxiliary.taskBindings[taskType];
    if (!profileId) return false;
    const profile = auxiliary.profiles.find((p) => p.id === profileId);
    return isUsableAuxiliaryProfile(profile);
  }

  /**
   * 獲取任務對應的 API 配置
   * 當備用 API 總開關關閉時，所有任務一律使用主 API
   */
  function getAPIForTask(taskType: string): {
    api: APISettings;
    generation: GenerationParams;
  } {
    // 取得基礎 API 配置
    let taskApi: APISettings;
    let taskGen: GenerationParams;

    if (isRoutableTaskType(taskType) && auxiliary.enabled) {
      const profileId = auxiliary.taskBindings[taskType];
      const profile = profileId
        ? auxiliary.profiles.find((p) => p.id === profileId)
        : undefined;
      const useAux = profileId && isUsableAuxiliaryProfile(profile);

      console.log(
        `[getAPIForTask] 任務=${taskType}, 備用開關=${auxiliary.enabled}, 綁定profileId=${profileId ?? "無"}, 使用備用=${!!useAux}, 模型=${useAux ? profile!.api.model : api.model}`,
      );

      if (useAux) {
        taskApi = { ...profile!.api };
        taskGen = getGlobalGenerationParams(profile!.generation);
      } else {
        taskApi = { ...api };
        taskGen = getGlobalGenerationParams(generation);
      }

      // 套用各任務直連覆寫
      const dcOverride = auxiliary.taskDirectConnect?.[taskType];
      if (dcOverride !== null && dcOverride !== undefined) {
        taskApi.directConnect = dcOverride;
      }

      return { api: taskApi, generation: taskGen };
    }

    if (isRoutableTaskType(taskType) && !auxiliary.enabled) {
      console.log(
        `[getAPIForTask] 任務=${taskType}, 備用 API 總開關已關閉，使用主 API, 模型=${api.model}`,
      );
    }

    return { api, generation: getGlobalGenerationParams(generation) };
  }

  /**
   * 重置為默認值
   */
  function resetToDefaults(): void {
    Object.assign(api, createDefaultAPISettings());
    Object.assign(generation, createDefaultGenerationParams());
  }

  /**
   * 重置備用 API
   */
  function resetAuxiliary(): void {
    Object.assign(auxiliary, createDefaultAuxiliaryConfig());
  }

  /**
   * 設定語言
   *
   * 語言切換需要立即持久化，避免後續任意 re-load settings
   * 把暫存中的 zh-TW 覆蓋回來，造成「簡體會自己失效」的體感。
   */
  function setLanguage(lang: "zh-TW" | "zh-CN" | "none"): void {
    if (language.value === lang) return;

    language.value = lang;

    // 立即保存，避免只在某些 UI 關閉時才保存導致狀態回彈
    if (isLoaded.value) {
      void saveSettings().catch((e) => {
        console.error("[SettingsStore] 語言設定自動保存失敗:", e);
      });
    }
  }

  /**
   * 設定勿擾模式
   */
  function setDoNotDisturb(enabled: boolean): void {
    doNotDisturb.value = enabled;
  }

  /**
   * 切換勿擾模式
   */
  function toggleDoNotDisturb(): void {
    doNotDisturb.value = !doNotDisturb.value;
  }

  /**
   * 設定面對面模式
   */
  function setFaceToFaceMode(enabled: boolean): void {
    faceToFaceMode.value = enabled;
  }

  /**
   * 切換面對面模式
   */
  function toggleFaceToFaceMode(): void {
    faceToFaceMode.value = !faceToFaceMode.value;
  }

  /**
   * 設定夜晚模式
   */
  function setNightMode(enabled: boolean): void {
    nightMode.value = enabled;
  }

  /**
   * 切換夜晚模式
   */
  function toggleNightMode(): void {
    nightMode.value = !nightMode.value;
  }

  /**
   * 添加自定義快速輸入按鈕
   */
  function addCustomQuickAction(action: QuickActionItem): void {
    customQuickActions.value.push(action);
  }

  /**
   * 更新自定義快速輸入按鈕
   */
  function updateCustomQuickAction(
    index: number,
    action: QuickActionItem,
  ): void {
    if (index >= 0 && index < customQuickActions.value.length) {
      customQuickActions.value[index] = action;
    }
  }

  /**
   * 刪除自定義快速輸入按鈕
   */
  function removeCustomQuickAction(index: number): void {
    if (index >= 0 && index < customQuickActions.value.length) {
      customQuickActions.value.splice(index, 1);
    }
  }

  /**
   * 設定所有自定義快速輸入按鈕
   */
  function setCustomQuickActions(actions: QuickActionItem[]): void {
    customQuickActions.value = actions.map((a) => ({ ...a }));
  }

  /**
   * 設定 HF 後台生成開關
   */
  function setBackgroundGenerationEnabled(enabled: boolean): void {
    backgroundGenerationEnabled.value = enabled;
  }

  /**
   * 切換 HF 後台生成開關
   */
  function toggleBackgroundGeneration(): void {
    backgroundGenerationEnabled.value = !backgroundGenerationEnabled.value;
  }

  /**
   * 切換背景無聲音樂
   */
  function toggleBackgroundAudio(): void {
    backgroundAudioEnabled.value = !backgroundAudioEnabled.value;
  }

  return {
    // 狀態
    isLoaded,
    isLoading,
    profiles,
    currentProfileId,
    currentProfile,
    hasValidConfig,
    api,
    generation,
    auxiliary,
    novelAIImage,
    minimaxTTS,
    doNotDisturb,
    faceToFaceMode,
    nightMode,
    language,
    customQuickActions,
    backgroundGenerationEnabled,
    backgroundAudioEnabled,
    keepAliveMode,
    audio,
    incomingCallRingtone,
    embeddingAPI,
    embeddingMode,
    vectorMemoryEnabled,
    nearbyPlacesLimit,
    nearbyPlacesRadius,
    effectiveEmbeddingAPI,

    // 常數與輔助
    ROUTABLE_TASKS,
    AUXILIARY_TASKS,
    isUsableAuxiliaryProfile,

    // 方法
    loadSettings,
    saveSettings,
    createProfile,
    switchProfile,
    deleteProfile,
    renameProfile,
    duplicateProfile,
    updateProfile,
    copyToAuxiliary,
    createAuxiliaryProfile,
    switchAuxiliaryProfile,
    deleteAuxiliaryProfile,
    renameAuxiliaryProfile,
    duplicateAuxiliaryProfile,
    updateAuxiliaryProfile,
    shouldUseAuxiliary,
    getAPIForTask,
    resetToDefaults,
    resetAuxiliary,
    setLanguage,
    setDoNotDisturb,
    toggleDoNotDisturb,
    setFaceToFaceMode,
    toggleFaceToFaceMode,
    setNightMode,
    toggleNightMode,
    addCustomQuickAction,
    updateCustomQuickAction,
    removeCustomQuickAction,
    setCustomQuickActions,
    setBackgroundGenerationEnabled,
    toggleBackgroundGeneration,
    toggleBackgroundAudio,
  };
});
