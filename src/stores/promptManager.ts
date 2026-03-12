/**
 * 提示詞管理器 Store
 * 管理提示詞順序、啟用狀態、角色獨立配置
 */

import { db, DB_STORES } from "@/db/database";
import type {
    CharacterPromptConfig,
    PromptCategory,
    PromptDefinition,
    PromptManagerConfig,
    PromptOrderEntry,
} from "@/types/promptManager";
import {
    CATEGORY_INFO,
    createCharacterPromptConfig,
    createDefaultPromptManagerConfig,
    DEFAULT_DIARY_PROMPT_ORDER,
    DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
    DEFAULT_GROUP_CHAT_PROMPT_ORDER,
    DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
    DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
    DEFAULT_PLURK_POST_PROMPT_ORDER,
    DEFAULT_PROMPT_ORDER,
    DEFAULT_SUMMARY_PROMPT_ORDER,
    DIARY_PROMPT_DEFINITIONS,
    FACE_TO_FACE_PROMPT_DEFINITIONS,
    getEffectivePromptOrder,
    getPromptDefinition,
    GROUP_CHAT_PROMPT_DEFINITIONS,
    IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
    isPromptDeletable,
    isPromptToggleable,
    PLURK_COMMENT_PROMPT_DEFINITIONS,
    PLURK_POST_PROMPT_DEFINITIONS,
    SUMMARY_PROMPT_DEFINITIONS,
} from "@/types/promptManager";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

const STORAGE_KEY = "promptManagerConfig";

export const usePromptManagerStore = defineStore("promptManager", () => {
  // ===== State =====
  const config = ref<PromptManagerConfig>(createDefaultPromptManagerConfig());
  const isLoading = ref(false);
  const currentCharacterId = ref<string | null>(null);

  // ===== Getters =====

  /** 當前有效的提示詞順序 */
  const currentPromptOrder = computed(() => {
    return getEffectivePromptOrder(
      config.value,
      currentCharacterId.value ?? undefined,
    );
  });

  /** 當前啟用的提示詞順序 */
  const enabledPromptOrder = computed(() => {
    return currentPromptOrder.value.filter((entry) => entry.enabled);
  });

  /** 所有提示詞定義 */
  const prompts = computed(() => config.value.prompts);

  /** 全局順序 */
  const globalPromptOrder = computed(() => config.value.globalPromptOrder);

  /** 當前角色配置 */
  const currentCharacterConfig = computed(() => {
    if (!currentCharacterId.value) return null;
    return config.value.characterConfigs[currentCharacterId.value] ?? null;
  });

  /** 是否使用角色獨立配置 */
  const isUsingCharacterConfig = computed(() => {
    return (
      currentCharacterConfig.value !== null &&
      currentCharacterConfig.value.promptOrder.length > 0
    );
  });

  /** 按分類分組的提示詞 */
  const promptsByCategory = computed(() => {
    const grouped: Record<PromptCategory, PromptDefinition[]> = {
      system: [],
      director: [],
      context: [],
      character: [],
      rules: [],
      custom: [],
    };
    for (const prompt of config.value.prompts) {
      if (prompt.category && grouped[prompt.category]) {
        grouped[prompt.category].push(prompt);
      }
    }
    return grouped;
  });

  /** 分類信息 */
  const categoryInfo = computed(() => CATEGORY_INFO);

  /** 日記提示詞順序 */
  const diaryPromptOrder = computed(
    () => config.value.diaryPromptOrder ?? DEFAULT_DIARY_PROMPT_ORDER,
  );

  /** 日記提示詞定義 */
  const diaryPrompts = computed(
    () => config.value.diaryPrompts ?? DIARY_PROMPT_DEFINITIONS,
  );

  /** 總結提示詞順序 */
  const summaryPromptOrder = computed(
    () => config.value.summaryPromptOrder ?? DEFAULT_SUMMARY_PROMPT_ORDER,
  );

  /** 總結提示詞定義 */
  const summaryPrompts = computed(
    () => config.value.summaryPrompts ?? SUMMARY_PROMPT_DEFINITIONS,
  );

  /** 重要事件提示詞順序 */
  const eventsPromptOrder = computed(
    () =>
      config.value.eventsPromptOrder ?? DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
  );

  /** 重要事件提示詞定義 */
  const eventsPrompts = computed(
    () => config.value.eventsPrompts ?? IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
  );

  /** 噗浪發文提示詞順序 */
  const plurkPostPromptOrder = computed(
    () => config.value.plurkPostPromptOrder ?? DEFAULT_PLURK_POST_PROMPT_ORDER,
  );

  /** 噗浪發文提示詞定義 */
  const plurkPostPrompts = computed(
    () => config.value.plurkPostPrompts ?? PLURK_POST_PROMPT_DEFINITIONS,
  );

  /** 噗浪評論提示詞順序 */
  const plurkCommentPromptOrder = computed(
    () =>
      config.value.plurkCommentPromptOrder ??
      DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
  );

  /** 噗浪評論提示詞定義 */
  const plurkCommentPrompts = computed(
    () => config.value.plurkCommentPrompts ?? PLURK_COMMENT_PROMPT_DEFINITIONS,
  );

  /** 面對面模式提示詞順序 */
  const faceToFacePromptOrder = computed(
    () =>
      config.value.faceToFacePromptOrder ?? DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
  );

  /** 面對面模式提示詞定義 */
  const faceToFacePrompts = computed(
    () => config.value.faceToFacePrompts ?? FACE_TO_FACE_PROMPT_DEFINITIONS,
  );

  /** 群聊模式提示詞順序 */
  const groupChatPromptOrder = computed(
    () => config.value.groupChatPromptOrder ?? DEFAULT_GROUP_CHAT_PROMPT_ORDER,
  );

  /** 群聊模式提示詞定義 */
  const groupChatPrompts = computed(
    () => config.value.groupChatPrompts ?? GROUP_CHAT_PROMPT_DEFINITIONS,
  );

  // ===== Actions =====

  /**
   * 載入配置
   */
  async function loadConfig(): Promise<void> {
    isLoading.value = true;
    try {
      await db.init();
      const stored = await db.get<PromptManagerConfig>(
        DB_STORES.SETTINGS,
        STORAGE_KEY,
      );
      if (stored) {
        // 合併默認值，確保新增的提示詞不會丟失
        config.value = mergeWithDefaults(stored);
      } else {
        config.value = createDefaultPromptManagerConfig();
      }
    } catch (e) {
      console.error("[PromptManagerStore] Failed to load config:", e);
      config.value = createDefaultPromptManagerConfig();
    } finally {
      isLoading.value = false;
    }
  }

  /**
   * 保存配置
   */
  async function saveConfig(): Promise<void> {
    try {
      await db.init();
      // 將 Vue reactive 物件轉換為純 JavaScript 物件
      const plainConfig = JSON.parse(JSON.stringify(config.value));
      // settings store 沒有 keyPath，需要提供 key 參數
      await db.put(DB_STORES.SETTINGS, plainConfig, STORAGE_KEY);
    } catch (e) {
      console.error("[PromptManagerStore] Failed to save config:", e);
    }
  }

  /**
   * 合併默認值（處理版本升級）
   */
  function mergeWithDefaults(stored: PromptManagerConfig): PromptManagerConfig {
    const defaults = createDefaultPromptManagerConfig();

    // 確保刪除追蹤字段存在（向後兼容舊存儲）
    if (!stored.deletedDefaultPromptIds) stored.deletedDefaultPromptIds = [];
    if (!stored.deletedFaceToFacePromptIds) stored.deletedFaceToFacePromptIds = [];
    if (!stored.deletedGroupChatPromptIds) stored.deletedGroupChatPromptIds = [];
    if (!stored.deletedDiaryPromptIds) stored.deletedDiaryPromptIds = [];
    if (!stored.deletedSummaryPromptIds) stored.deletedSummaryPromptIds = [];
    if (!stored.deletedEventsPromptIds) stored.deletedEventsPromptIds = [];
    if (!stored.deletedPlurkPostPromptIds) stored.deletedPlurkPostPromptIds = [];
    if (!stored.deletedPlurkCommentPromptIds) stored.deletedPlurkCommentPromptIds = [];

    // 確保所有默認提示詞都存在（跳過用戶主動刪除的）
    for (const defaultPrompt of defaults.prompts) {
      if (stored.deletedDefaultPromptIds.includes(defaultPrompt.identifier)) {
        continue;
      }
      if (
        !stored.prompts.find((p) => p.identifier === defaultPrompt.identifier)
      ) {
        stored.prompts.push(defaultPrompt);
      }
    }

    // 同步 adminOnly 屬性（從默認值更新到已存儲的提示詞）
    for (const storedPrompt of stored.prompts) {
      const defaultPrompt = defaults.prompts.find(
        (p) => p.identifier === storedPrompt.identifier,
      );
      if (defaultPrompt) {
        // 同步 adminOnly 屬性
        storedPrompt.adminOnly = defaultPrompt.adminOnly;
        // 同步 isDeletable 屬性
        storedPrompt.isDeletable = defaultPrompt.isDeletable;
      }
    }

    // 自動更新特定提示詞（來電功能相關）
    // 注意：只在用戶從未手動編輯過的情況下才自動更新
    // 通過檢查 isEditable 標記來判斷（自定義提示詞 isEditable 為 true）
    const exampleScriptIndex = stored.prompts.findIndex(
      (p) => p.identifier === "exampleScript",
    );
    if (exampleScriptIndex !== -1) {
      const storedExampleScript = stored.prompts[exampleScriptIndex];
      const defaultExampleScript = defaults.prompts.find(
        (p) => p.identifier === "exampleScript",
      );
      // 只有當存儲的內容與某個歷史默認版本完全一致時才更新
      // 如果用戶做了任何修改，保留用戶的版本
      if (
        defaultExampleScript &&
        !storedExampleScript.content.includes("來電決策") &&
        !storedExampleScript.content.includes("schedule-call") &&
        !storedExampleScript.content.includes("calendar-event")
      ) {
        // 將新功能的內容追加到用戶現有內容末尾，而不是完全覆蓋
        const callDecisionSection = defaultExampleScript.content.match(
          /(?:來電決策|schedule-call|calendar-event)[\s\S]*$/,
        );
        if (callDecisionSection) {
          stored.prompts[exampleScriptIndex].content +=
            "\n\n" + callDecisionSection[0];
        }
      }
    }

    // 檢查 formatRules - 追加缺失的格式定義而非覆蓋
    const formatRulesIndex = stored.prompts.findIndex(
      (p) => p.identifier === "formatRules",
    );
    if (formatRulesIndex !== -1) {
      const storedFormatRules = stored.prompts[formatRulesIndex];
      const defaultFormatRules = defaults.prompts.find(
        (p) => p.identifier === "formatRules",
      );
      if (defaultFormatRules) {
        // 逐個檢查缺失的功能標記，只追加缺失的部分
        const missingFeatures: string[] = [];
        if (!storedFormatRules.content.includes("來電預約"))
          missingFeatures.push("來電預約");
        if (!storedFormatRules.content.includes("schedule-call"))
          missingFeatures.push("schedule-call");
        if (!storedFormatRules.content.includes("<pic>"))
          missingFeatures.push("<pic>");
        if (!storedFormatRules.content.includes("avatar-change"))
          missingFeatures.push("avatar-change");
        if (!storedFormatRules.content.includes("calendar-event"))
          missingFeatures.push("calendar-event");

        if (missingFeatures.length > 0) {
          // 從默認內容中提取包含缺失功能的段落並追加
          for (const feature of missingFeatures) {
            const regex = new RegExp(
              `[^\\n]*${feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*`,
            );
            const match = defaultFormatRules.content.match(regex);
            if (
              match &&
              !storedFormatRules.content.includes(match[0].trim())
            ) {
              stored.prompts[formatRulesIndex].content +=
                "\n" + match[0].trim();
            }
          }
        }
      }
    }

    // 檢查 onlineModeFeatures - 追加缺失的功能而非覆蓋
    const onlineModeIndex = stored.prompts.findIndex(
      (p) => p.identifier === "onlineModeFeatures",
    );
    if (onlineModeIndex !== -1) {
      const storedOnlineMode = stored.prompts[onlineModeIndex];
      const defaultOnlineMode = defaults.prompts.find(
        (p) => p.identifier === "onlineModeFeatures",
      );
      if (defaultOnlineMode) {
        const missingFeatures: string[] = [];
        if (!storedOnlineMode.content.includes("<pic>"))
          missingFeatures.push("<pic>");
        if (!storedOnlineMode.content.includes("<vid>"))
          missingFeatures.push("<vid>");
        if (!storedOnlineMode.content.includes("<avatar-change"))
          missingFeatures.push("<avatar-change");

        if (missingFeatures.length > 0) {
          for (const feature of missingFeatures) {
            const regex = new RegExp(
              `[^\\n]*${feature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\n]*`,
            );
            const match = defaultOnlineMode.content.match(regex);
            if (match && !storedOnlineMode.content.includes(match[0].trim())) {
              stored.prompts[onlineModeIndex].content +=
                "\n" + match[0].trim();
            }
          }
        }
      }
    }

    // 確保順序中包含所有提示詞（跳過用戶主動刪除的）
    for (const defaultOrder of defaults.globalPromptOrder) {
      if (stored.deletedDefaultPromptIds!.includes(defaultOrder.identifier)) {
        continue;
      }
      if (
        !stored.globalPromptOrder.find(
          (o) => o.identifier === defaultOrder.identifier,
        )
      ) {
        stored.globalPromptOrder.push(defaultOrder);
      }
    }

    // 確保日記提示詞存在
    if (!stored.diaryPrompts) {
      stored.diaryPrompts = defaults.diaryPrompts;
    } else {
      // 合併新增的日記提示詞（跳過用戶主動刪除的）
      for (const defaultDiaryPrompt of defaults.diaryPrompts || []) {
        if (stored.deletedDiaryPromptIds!.includes(defaultDiaryPrompt.identifier)) continue;
        if (
          !stored.diaryPrompts.find(
            (p) => p.identifier === defaultDiaryPrompt.identifier,
          )
        ) {
          stored.diaryPrompts.push(defaultDiaryPrompt);
        }
      }
    }

    // 確保日記順序存在
    if (!stored.diaryPromptOrder) {
      stored.diaryPromptOrder = defaults.diaryPromptOrder;
    } else {
      // 合併新增的日記順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.diaryPromptOrder || []) {
        if (stored.deletedDiaryPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.diaryPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.diaryPromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保總結提示詞存在
    if (!stored.summaryPrompts) {
      stored.summaryPrompts = defaults.summaryPrompts;
    } else {
      // 合併新增的總結提示詞（跳過用戶主動刪除的）
      for (const defaultSummaryPrompt of defaults.summaryPrompts || []) {
        if (stored.deletedSummaryPromptIds!.includes(defaultSummaryPrompt.identifier)) continue;
        if (
          !stored.summaryPrompts.find(
            (p) => p.identifier === defaultSummaryPrompt.identifier,
          )
        ) {
          stored.summaryPrompts.push(defaultSummaryPrompt);
        }
      }
    }

    // 確保總結順序存在
    if (!stored.summaryPromptOrder) {
      stored.summaryPromptOrder = defaults.summaryPromptOrder;
    } else {
      // 合併新增的總結順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.summaryPromptOrder || []) {
        if (stored.deletedSummaryPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.summaryPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.summaryPromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保重要事件提示詞存在
    if (!stored.eventsPrompts) {
      stored.eventsPrompts = defaults.eventsPrompts;
    } else {
      // 合併新增的重要事件提示詞（跳過用戶主動刪除的）
      for (const defaultEventsPrompt of defaults.eventsPrompts || []) {
        if (stored.deletedEventsPromptIds!.includes(defaultEventsPrompt.identifier)) continue;
        if (
          !stored.eventsPrompts.find(
            (p) => p.identifier === defaultEventsPrompt.identifier,
          )
        ) {
          stored.eventsPrompts.push(defaultEventsPrompt);
        }
      }
    }

    // 確保重要事件順序存在
    if (!stored.eventsPromptOrder) {
      stored.eventsPromptOrder = defaults.eventsPromptOrder;
    } else {
      // 合併新增的重要事件順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.eventsPromptOrder || []) {
        if (stored.deletedEventsPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.eventsPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.eventsPromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保噗浪發文提示詞存在
    if (!stored.plurkPostPrompts) {
      stored.plurkPostPrompts = defaults.plurkPostPrompts;
    } else {
      // 合併新增的噗浪發文提示詞（跳過用戶主動刪除的）
      for (const defaultPlurkPostPrompt of defaults.plurkPostPrompts || []) {
        if (stored.deletedPlurkPostPromptIds!.includes(defaultPlurkPostPrompt.identifier)) continue;
        if (
          !stored.plurkPostPrompts.find(
            (p) => p.identifier === defaultPlurkPostPrompt.identifier,
          )
        ) {
          stored.plurkPostPrompts.push(defaultPlurkPostPrompt);
        }
      }
    }

    // 確保噗浪發文順序存在
    if (!stored.plurkPostPromptOrder) {
      stored.plurkPostPromptOrder = defaults.plurkPostPromptOrder;
    } else {
      // 合併新增的噗浪發文順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.plurkPostPromptOrder || []) {
        if (stored.deletedPlurkPostPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.plurkPostPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.plurkPostPromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保噗浪評論提示詞存在
    if (!stored.plurkCommentPrompts) {
      stored.plurkCommentPrompts = defaults.plurkCommentPrompts;
    } else {
      // 合併新增的噗浪評論提示詞（跳過用戶主動刪除的）
      for (const defaultPlurkCommentPrompt of defaults.plurkCommentPrompts ||
        []) {
        if (stored.deletedPlurkCommentPromptIds!.includes(defaultPlurkCommentPrompt.identifier)) continue;
        if (
          !stored.plurkCommentPrompts.find(
            (p) => p.identifier === defaultPlurkCommentPrompt.identifier,
          )
        ) {
          stored.plurkCommentPrompts.push(defaultPlurkCommentPrompt);
        }
      }
    }

    // 確保噗浪評論順序存在
    if (!stored.plurkCommentPromptOrder) {
      stored.plurkCommentPromptOrder = defaults.plurkCommentPromptOrder;
    } else {
      // 合併新增的噗浪評論順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.plurkCommentPromptOrder || []) {
        if (stored.deletedPlurkCommentPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.plurkCommentPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.plurkCommentPromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保面對面模式提示詞存在
    if (!stored.faceToFacePrompts) {
      stored.faceToFacePrompts = defaults.faceToFacePrompts;
    } else {
      // 合併新增的面對面模式提示詞（跳過用戶主動刪除的）
      for (const defaultF2FPrompt of defaults.faceToFacePrompts || []) {
        if (stored.deletedFaceToFacePromptIds!.includes(defaultF2FPrompt.identifier)) continue;
        if (
          !stored.faceToFacePrompts.find(
            (p) => p.identifier === defaultF2FPrompt.identifier,
          )
        ) {
          stored.faceToFacePrompts.push(defaultF2FPrompt);
        }
      }
      // 同步 adminOnly 屬性
      for (const storedPrompt of stored.faceToFacePrompts) {
        const defaultPrompt = (defaults.faceToFacePrompts || []).find(
          (p) => p.identifier === storedPrompt.identifier,
        );
        if (defaultPrompt) {
          storedPrompt.adminOnly = defaultPrompt.adminOnly;
          storedPrompt.isDeletable = defaultPrompt.isDeletable;
        }
      }
    }

    // 確保面對面模式順序存在
    if (!stored.faceToFacePromptOrder) {
      stored.faceToFacePromptOrder = defaults.faceToFacePromptOrder;
    } else {
      // 合併新增的面對面模式順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.faceToFacePromptOrder || []) {
        if (stored.deletedFaceToFacePromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.faceToFacePromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.faceToFacePromptOrder.push(defaultOrder);
        }
      }
    }

    // 確保群聊模式提示詞存在
    if (!stored.groupChatPrompts) {
      stored.groupChatPrompts = defaults.groupChatPrompts;
    } else {
      // 合併新增的群聊模式提示詞（跳過用戶主動刪除的）
      for (const defaultGCPrompt of defaults.groupChatPrompts || []) {
        if (stored.deletedGroupChatPromptIds!.includes(defaultGCPrompt.identifier)) continue;
        if (
          !stored.groupChatPrompts.find(
            (p) => p.identifier === defaultGCPrompt.identifier,
          )
        ) {
          stored.groupChatPrompts.push(defaultGCPrompt);
        }
      }
      // 同步 adminOnly 屬性
      for (const storedPrompt of stored.groupChatPrompts) {
        const defaultPrompt = (defaults.groupChatPrompts || []).find(
          (p) => p.identifier === storedPrompt.identifier,
        );
        if (defaultPrompt) {
          storedPrompt.adminOnly = defaultPrompt.adminOnly;
          storedPrompt.isDeletable = defaultPrompt.isDeletable;
        }
      }
    }

    // 確保群聊模式順序存在
    if (!stored.groupChatPromptOrder) {
      stored.groupChatPromptOrder = defaults.groupChatPromptOrder;
    } else {
      // 合併新增的群聊模式順序（跳過用戶主動刪除的）
      for (const defaultOrder of defaults.groupChatPromptOrder || []) {
        if (stored.deletedGroupChatPromptIds!.includes(defaultOrder.identifier)) continue;
        if (
          !stored.groupChatPromptOrder.find(
            (o) => o.identifier === defaultOrder.identifier,
          )
        ) {
          stored.groupChatPromptOrder.push(defaultOrder);
        }
      }
    }

    return stored;
  }

  /**
   * 設置當前角色
   */
  function setCurrentCharacter(characterId: string | null): void {
    currentCharacterId.value = characterId;
  }

  /**
   * 更新全局順序
   */
  async function updateGlobalOrder(order: PromptOrderEntry[]): Promise<void> {
    config.value.globalPromptOrder = order;
    await saveConfig();
  }

  /**
   * 更新角色順序
   */
  async function updateCharacterOrder(
    characterId: string,
    order: PromptOrderEntry[],
  ): Promise<void> {
    if (!config.value.characterConfigs[characterId]) {
      config.value.characterConfigs[characterId] = createCharacterPromptConfig(
        characterId,
        config.value.globalPromptOrder,
      );
    }
    config.value.characterConfigs[characterId].promptOrder = order;
    config.value.characterConfigs[characterId].updatedAt = Date.now();
    await saveConfig();
  }

  /**
   * 切換提示詞啟用狀態
   */
  async function togglePrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getPromptDefinition(config.value, identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    const order = currentCharacterId.value
      ? config.value.characterConfigs[currentCharacterId.value]?.promptOrder
      : config.value.globalPromptOrder;

    if (!order) return false;

    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動提示詞位置
   */
  async function movePrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    const order = currentCharacterId.value
      ? config.value.characterConfigs[currentCharacterId.value]?.promptOrder
      : config.value.globalPromptOrder;

    if (!order || fromIndex === toIndex) return;

    // 先移除元素
    const [moved] = order.splice(fromIndex, 1);
    // 插入到目標位置（如果從上往下拖，目標索引需要減 1，因為移除了一個元素）
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 添加自定義提示詞
   */
  async function addCustomPrompt(
    prompt: Partial<PromptDefinition>,
  ): Promise<PromptDefinition> {
    const identifier = `custom_${Date.now()}`;
    const newPrompt: PromptDefinition = {
      identifier,
      name: prompt.name || "自定義提示詞",
      description: prompt.description || "",
      category: prompt.category || "custom",
      role: prompt.role || "system",
      content: prompt.content || "",
      system_prompt: false,
      marker: false,
      injection_position: prompt.injection_position ?? 0,
      injection_depth: prompt.injection_depth ?? 0,
      injection_order: prompt.injection_order ?? 100,
      forbid_overrides: false,
      extension: false,
      injection_trigger: prompt.injection_trigger || [],
      isEditable: true,
      isDeletable: true,
    };

    config.value.prompts.push(newPrompt);

    // 添加到順序列表
    config.value.globalPromptOrder.push({
      identifier,
      enabled: true,
    });

    await saveConfig();
    return newPrompt;
  }

  /**
   * 更新提示詞
   */
  async function updatePrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    const index = config.value.prompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.prompts[index] = {
      ...config.value.prompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 刪除提示詞（全局模式）
   */
  async function deletePrompt(identifier: string): Promise<boolean> {
    const prompt = getPromptDefinition(config.value, identifier);
    if (!prompt || !isPromptDeletable(prompt)) {
      return false;
    }

    // 若刪除的是默認提示詞（存在於默認定義中），記錄其 ID 防止被 mergeWithDefaults 恢復
    const defaultsForCheck = createDefaultPromptManagerConfig();
    const isDefault = defaultsForCheck.prompts.some(p => p.identifier === identifier);
    if (isDefault) {
      if (!config.value.deletedDefaultPromptIds) config.value.deletedDefaultPromptIds = [];
      if (!config.value.deletedDefaultPromptIds.includes(identifier)) {
        config.value.deletedDefaultPromptIds.push(identifier);
      }
    }

    // 從定義中移除
    config.value.prompts = config.value.prompts.filter(
      (p) => p.identifier !== identifier,
    );

    // 從順序中移除
    config.value.globalPromptOrder = config.value.globalPromptOrder.filter(
      (o) => o.identifier !== identifier,
    );

    // 從所有角色配置中移除
    for (const charConfig of Object.values(config.value.characterConfigs)) {
      charConfig.promptOrder = charConfig.promptOrder.filter(
        (o) => o.identifier !== identifier,
      );
    }

    await saveConfig();
    return true;
  }

  /**
   * 為角色創建獨立配置（從全局複製）
   */
  async function createCharacterConfig(
    characterId: string,
  ): Promise<CharacterPromptConfig> {
    const charConfig = createCharacterPromptConfig(
      characterId,
      config.value.globalPromptOrder,
    );
    config.value.characterConfigs[characterId] = charConfig;
    await saveConfig();
    return charConfig;
  }

  /**
   * 刪除角色配置（恢復使用全局）
   */
  async function deleteCharacterConfig(characterId: string): Promise<void> {
    delete config.value.characterConfigs[characterId];
    await saveConfig();
  }

  /**
   * 重置單個提示詞為默認值
   */
  async function resetSinglePrompt(identifier: string): Promise<boolean> {
    const defaults = createDefaultPromptManagerConfig();
    const defaultPrompt = defaults.prompts.find(
      (p) => p.identifier === identifier,
    );
    if (!defaultPrompt) return false;

    const index = config.value.prompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) {
      // 如果不存在，添加它
      config.value.prompts.push(structuredClone(defaultPrompt));
    } else {
      // 如果存在，替換它
      config.value.prompts[index] = structuredClone(defaultPrompt);
    }
    await saveConfig();
    return true;
  }

  /**
   * 重置為默認值（包含內容和順序）
   */
  async function resetToDefault(characterId?: string): Promise<void> {
    const defaults = createDefaultPromptManagerConfig();

    if (characterId) {
      // 重置角色配置
      if (config.value.characterConfigs[characterId]) {
        config.value.characterConfigs[characterId].promptOrder =
          structuredClone(DEFAULT_PROMPT_ORDER);
        config.value.characterConfigs[characterId].updatedAt = Date.now();
      }
    } else {
      // 重置全局配置（包含內容和順序）
      config.value.prompts = structuredClone(defaults.prompts);
      config.value.globalPromptOrder = structuredClone(DEFAULT_PROMPT_ORDER);
    }
    await saveConfig();
  }

  /**
   * 重置所有模式的提示詞為默認值
   */
  async function resetAllToDefault(): Promise<void> {
    const defaults = createDefaultPromptManagerConfig();
    // 全局
    config.value.prompts = structuredClone(defaults.prompts);
    config.value.globalPromptOrder = structuredClone(DEFAULT_PROMPT_ORDER);
    // 面對面
    config.value.faceToFacePrompts = structuredClone(
      FACE_TO_FACE_PROMPT_DEFINITIONS,
    );
    config.value.faceToFacePromptOrder = structuredClone(
      DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
    );
    // 群聊
    config.value.groupChatPrompts = structuredClone(
      GROUP_CHAT_PROMPT_DEFINITIONS,
    );
    config.value.groupChatPromptOrder = structuredClone(
      DEFAULT_GROUP_CHAT_PROMPT_ORDER,
    );
    // 日記
    config.value.diaryPrompts = structuredClone(DIARY_PROMPT_DEFINITIONS);
    config.value.diaryPromptOrder = structuredClone(DEFAULT_DIARY_PROMPT_ORDER);
    // 總結
    config.value.summaryPrompts = structuredClone(SUMMARY_PROMPT_DEFINITIONS);
    config.value.summaryPromptOrder = structuredClone(
      DEFAULT_SUMMARY_PROMPT_ORDER,
    );
    // 重要事件
    config.value.eventsPrompts = structuredClone(
      IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
    );
    config.value.eventsPromptOrder = structuredClone(
      DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
    );
    // 噗浪發文
    config.value.plurkPostPrompts = structuredClone(
      PLURK_POST_PROMPT_DEFINITIONS,
    );
    config.value.plurkPostPromptOrder = structuredClone(
      DEFAULT_PLURK_POST_PROMPT_ORDER,
    );
    // 噗浪評論
    config.value.plurkCommentPrompts = structuredClone(
      PLURK_COMMENT_PROMPT_DEFINITIONS,
    );
    config.value.plurkCommentPromptOrder = structuredClone(
      DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
    );
    await saveConfig();
  }

  /**
   * 獲取提示詞定義
   */
  function getPrompt(identifier: string): PromptDefinition | undefined {
    return getPromptDefinition(config.value, identifier);
  }

  /**
   * 獲取日記提示詞定義
   */
  function getDiaryPrompt(identifier: string): PromptDefinition | undefined {
    return (config.value.diaryPrompts ?? DIARY_PROMPT_DEFINITIONS).find(
      (p) => p.identifier === identifier,
    );
  }

  /**
   * 切換日記提示詞啟用狀態
   */
  async function toggleDiaryPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getDiaryPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    const order = config.value.diaryPromptOrder ?? DEFAULT_DIARY_PROMPT_ORDER;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動日記提示詞位置
   */
  async function moveDiaryPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.diaryPromptOrder) {
      config.value.diaryPromptOrder = structuredClone(
        DEFAULT_DIARY_PROMPT_ORDER,
      );
    }
    const order = config.value.diaryPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新日記提示詞
   */
  async function updateDiaryPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.diaryPrompts) {
      config.value.diaryPrompts = structuredClone(DIARY_PROMPT_DEFINITIONS);
    }
    const index = config.value.diaryPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.diaryPrompts[index] = {
      ...config.value.diaryPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置日記提示詞為默認
   */
  async function resetDiaryToDefault(): Promise<void> {
    config.value.diaryPrompts = structuredClone(DIARY_PROMPT_DEFINITIONS);
    config.value.diaryPromptOrder = structuredClone(DEFAULT_DIARY_PROMPT_ORDER);
    await saveConfig();
  }

  /**
   * 獲取總結提示詞定義
   */
  function getSummaryPrompt(identifier: string): PromptDefinition | undefined {
    return (config.value.summaryPrompts ?? SUMMARY_PROMPT_DEFINITIONS).find(
      (p) => p.identifier === identifier,
    );
  }

  /**
   * 切換總結提示詞啟用狀態
   */
  async function toggleSummaryPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getSummaryPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.summaryPromptOrder) {
      config.value.summaryPromptOrder = structuredClone(
        DEFAULT_SUMMARY_PROMPT_ORDER,
      );
    }
    const order = config.value.summaryPromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動總結提示詞位置
   */
  async function moveSummaryPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.summaryPromptOrder) {
      config.value.summaryPromptOrder = structuredClone(
        DEFAULT_SUMMARY_PROMPT_ORDER,
      );
    }
    const order = config.value.summaryPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新總結提示詞
   */
  async function updateSummaryPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.summaryPrompts) {
      config.value.summaryPrompts = structuredClone(SUMMARY_PROMPT_DEFINITIONS);
    }
    const index = config.value.summaryPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.summaryPrompts[index] = {
      ...config.value.summaryPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置總結提示詞為默認
   */
  async function resetSummaryToDefault(): Promise<void> {
    config.value.summaryPrompts = structuredClone(SUMMARY_PROMPT_DEFINITIONS);
    config.value.summaryPromptOrder = structuredClone(
      DEFAULT_SUMMARY_PROMPT_ORDER,
    );
    await saveConfig();
  }

  /**
   * 獲取重要事件提示詞定義
   */
  function getEventsPrompt(identifier: string): PromptDefinition | undefined {
    return (
      config.value.eventsPrompts ?? IMPORTANT_EVENTS_PROMPT_DEFINITIONS
    ).find((p) => p.identifier === identifier);
  }

  /**
   * 切換重要事件提示詞啟用狀態
   */
  async function toggleEventsPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getEventsPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.eventsPromptOrder) {
      config.value.eventsPromptOrder = structuredClone(
        DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
      );
    }
    const order = config.value.eventsPromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動重要事件提示詞位置
   */
  async function moveEventsPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.eventsPromptOrder) {
      config.value.eventsPromptOrder = structuredClone(
        DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
      );
    }
    const order = config.value.eventsPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新重要事件提示詞
   */
  async function updateEventsPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.eventsPrompts) {
      config.value.eventsPrompts = structuredClone(
        IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
      );
    }
    const index = config.value.eventsPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.eventsPrompts[index] = {
      ...config.value.eventsPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置重要事件提示詞為默認
   */
  async function resetEventsToDefault(): Promise<void> {
    config.value.eventsPrompts = structuredClone(
      IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
    );
    config.value.eventsPromptOrder = structuredClone(
      DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
    );
    await saveConfig();
  }

  // ===== 噗浪發文提示詞相關 =====

  /**
   * 獲取噗浪發文提示詞定義
   */
  function getPlurkPostPrompt(
    identifier: string,
  ): PromptDefinition | undefined {
    return (
      config.value.plurkPostPrompts ?? PLURK_POST_PROMPT_DEFINITIONS
    ).find((p) => p.identifier === identifier);
  }

  /**
   * 切換噗浪發文提示詞啟用狀態
   */
  async function togglePlurkPostPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getPlurkPostPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.plurkPostPromptOrder) {
      config.value.plurkPostPromptOrder = structuredClone(
        DEFAULT_PLURK_POST_PROMPT_ORDER,
      );
    }
    const order = config.value.plurkPostPromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動噗浪發文提示詞位置
   */
  async function movePlurkPostPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.plurkPostPromptOrder) {
      config.value.plurkPostPromptOrder = structuredClone(
        DEFAULT_PLURK_POST_PROMPT_ORDER,
      );
    }
    const order = config.value.plurkPostPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新噗浪發文提示詞
   */
  async function updatePlurkPostPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.plurkPostPrompts) {
      config.value.plurkPostPrompts = structuredClone(
        PLURK_POST_PROMPT_DEFINITIONS,
      );
    }
    const index = config.value.plurkPostPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.plurkPostPrompts[index] = {
      ...config.value.plurkPostPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置噗浪發文提示詞為默認
   */
  async function resetPlurkPostToDefault(): Promise<void> {
    config.value.plurkPostPrompts = structuredClone(
      PLURK_POST_PROMPT_DEFINITIONS,
    );
    config.value.plurkPostPromptOrder = structuredClone(
      DEFAULT_PLURK_POST_PROMPT_ORDER,
    );
    await saveConfig();
  }

  // ===== 噗浪評論提示詞相關 =====

  /**
   * 獲取噗浪評論提示詞定義
   */
  function getPlurkCommentPrompt(
    identifier: string,
  ): PromptDefinition | undefined {
    return (
      config.value.plurkCommentPrompts ?? PLURK_COMMENT_PROMPT_DEFINITIONS
    ).find((p) => p.identifier === identifier);
  }

  /**
   * 切換噗浪評論提示詞啟用狀態
   */
  async function togglePlurkCommentPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getPlurkCommentPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.plurkCommentPromptOrder) {
      config.value.plurkCommentPromptOrder = structuredClone(
        DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
      );
    }
    const order = config.value.plurkCommentPromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動噗浪評論提示詞位置
   */
  async function movePlurkCommentPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.plurkCommentPromptOrder) {
      config.value.plurkCommentPromptOrder = structuredClone(
        DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
      );
    }
    const order = config.value.plurkCommentPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新噗浪評論提示詞
   */
  async function updatePlurkCommentPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.plurkCommentPrompts) {
      config.value.plurkCommentPrompts = structuredClone(
        PLURK_COMMENT_PROMPT_DEFINITIONS,
      );
    }
    const index = config.value.plurkCommentPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.plurkCommentPrompts[index] = {
      ...config.value.plurkCommentPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置噗浪評論提示詞為默認
   */
  async function resetPlurkCommentToDefault(): Promise<void> {
    config.value.plurkCommentPrompts = structuredClone(
      PLURK_COMMENT_PROMPT_DEFINITIONS,
    );
    config.value.plurkCommentPromptOrder = structuredClone(
      DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
    );
    await saveConfig();
  }

  // ===== 面對面模式提示詞相關 =====

  /**
   * 獲取面對面模式提示詞定義
   */
  function getFaceToFacePrompt(
    identifier: string,
  ): PromptDefinition | undefined {
    return (
      config.value.faceToFacePrompts ?? FACE_TO_FACE_PROMPT_DEFINITIONS
    ).find((p) => p.identifier === identifier);
  }

  /**
   * 切換面對面模式提示詞啟用狀態
   */
  async function toggleFaceToFacePrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getFaceToFacePrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.faceToFacePromptOrder) {
      config.value.faceToFacePromptOrder = structuredClone(
        DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
      );
    }
    const order = config.value.faceToFacePromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動面對面模式提示詞位置
   */
  async function moveFaceToFacePrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.faceToFacePromptOrder) {
      config.value.faceToFacePromptOrder = structuredClone(
        DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
      );
    }
    const order = config.value.faceToFacePromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新面對面模式提示詞
   */
  async function updateFaceToFacePrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.faceToFacePrompts) {
      config.value.faceToFacePrompts = structuredClone(
        FACE_TO_FACE_PROMPT_DEFINITIONS,
      );
    }
    const index = config.value.faceToFacePrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.faceToFacePrompts[index] = {
      ...config.value.faceToFacePrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置面對面模式提示詞為默認
   */
  async function resetFaceToFaceToDefault(): Promise<void> {
    config.value.faceToFacePrompts = structuredClone(
      FACE_TO_FACE_PROMPT_DEFINITIONS,
    );
    config.value.faceToFacePromptOrder = structuredClone(
      DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
    );
    await saveConfig();
  }

  /**
   * 獲取群聊模式提示詞定義
   */
  function getGroupChatPrompt(
    identifier: string,
  ): PromptDefinition | undefined {
    return (
      config.value.groupChatPrompts ?? GROUP_CHAT_PROMPT_DEFINITIONS
    ).find((p) => p.identifier === identifier);
  }

  /**
   * 切換群聊模式提示詞啟用狀態
   */
  async function toggleGroupChatPrompt(
    identifier: string,
    enabled?: boolean,
  ): Promise<boolean> {
    const prompt = getGroupChatPrompt(identifier);
    if (!prompt || !isPromptToggleable(prompt)) {
      return false;
    }

    if (!config.value.groupChatPromptOrder) {
      config.value.groupChatPromptOrder = structuredClone(
        DEFAULT_GROUP_CHAT_PROMPT_ORDER,
      );
    }
    const order = config.value.groupChatPromptOrder;
    const entry = order.find((e) => e.identifier === identifier);
    if (entry) {
      entry.enabled = enabled ?? !entry.enabled;
      await saveConfig();
      return true;
    }
    return false;
  }

  /**
   * 移動群聊模式提示詞位置
   */
  async function moveGroupChatPrompt(
    identifier: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> {
    if (!config.value.groupChatPromptOrder) {
      config.value.groupChatPromptOrder = structuredClone(
        DEFAULT_GROUP_CHAT_PROMPT_ORDER,
      );
    }
    const order = config.value.groupChatPromptOrder;
    if (!order || fromIndex === toIndex) return;

    const [moved] = order.splice(fromIndex, 1);
    const adjustedToIndex = fromIndex < toIndex ? toIndex - 1 : toIndex;
    order.splice(adjustedToIndex, 0, moved);
    await saveConfig();
  }

  /**
   * 更新群聊模式提示詞
   */
  async function updateGroupChatPrompt(
    identifier: string,
    updates: Partial<PromptDefinition>,
  ): Promise<boolean> {
    if (!config.value.groupChatPrompts) {
      config.value.groupChatPrompts = structuredClone(
        GROUP_CHAT_PROMPT_DEFINITIONS,
      );
    }
    const index = config.value.groupChatPrompts.findIndex(
      (p) => p.identifier === identifier,
    );
    if (index === -1) return false;

    config.value.groupChatPrompts[index] = {
      ...config.value.groupChatPrompts[index],
      ...updates,
    };
    await saveConfig();
    return true;
  }

  /**
   * 重置群聊模式提示詞為默認
   */
  async function resetGroupChatToDefault(): Promise<void> {
    config.value.groupChatPrompts = structuredClone(
      GROUP_CHAT_PROMPT_DEFINITIONS,
    );
    config.value.groupChatPromptOrder = structuredClone(
      DEFAULT_GROUP_CHAT_PROMPT_ORDER,
    );
    await saveConfig();
  }

  /**
   * 刪除群聊模式提示詞（管理員模式，可刪除任何提示詞）
   */
  async function deleteGroupChatPrompt(identifier: string): Promise<boolean> {
    if (!config.value.groupChatPrompts) {
      config.value.groupChatPrompts = structuredClone(
        GROUP_CHAT_PROMPT_DEFINITIONS,
      );
    }
    if (!config.value.groupChatPromptOrder) {
      config.value.groupChatPromptOrder = structuredClone(
        DEFAULT_GROUP_CHAT_PROMPT_ORDER,
      );
    }

    // 若刪除的是默認提示詞，記錄其 ID
    const gcDefaults = createDefaultPromptManagerConfig();
    const isGcDefault = (gcDefaults.groupChatPrompts ?? []).some(p => p.identifier === identifier);
    if (isGcDefault) {
      if (!config.value.deletedGroupChatPromptIds) config.value.deletedGroupChatPromptIds = [];
      if (!config.value.deletedGroupChatPromptIds.includes(identifier)) {
        config.value.deletedGroupChatPromptIds.push(identifier);
      }
    }

    // 從定義中移除
    config.value.groupChatPrompts = config.value.groupChatPrompts.filter(
      (p) => p.identifier !== identifier,
    );

    // 從順序中移除
    config.value.groupChatPromptOrder =
      config.value.groupChatPromptOrder.filter(
        (o) => o.identifier !== identifier,
      );

    await saveConfig();
    return true;
  }

  /**
   * 在面對面模式新增自定義提示詞
   */
  async function addFaceToFaceCustomPrompt(
    prompt: Partial<PromptDefinition>,
  ): Promise<PromptDefinition> {
    if (!config.value.faceToFacePrompts) {
      config.value.faceToFacePrompts = structuredClone(
        FACE_TO_FACE_PROMPT_DEFINITIONS,
      );
    }
    if (!config.value.faceToFacePromptOrder) {
      config.value.faceToFacePromptOrder = structuredClone(
        DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
      );
    }

    const identifier = `f2f_custom_${Date.now()}`;
    const newPrompt: PromptDefinition = {
      identifier,
      name: prompt.name || "自定義提示詞",
      description: prompt.description || "",
      category: prompt.category || "custom",
      role: prompt.role || "system",
      content: prompt.content || "",
      system_prompt: true,
      marker: false,
      injection_position: prompt.injection_position ?? 0,
      injection_depth: prompt.injection_depth ?? 0,
      injection_order: prompt.injection_order ?? 100,
      forbid_overrides: false,
      extension: false,
      injection_trigger: prompt.injection_trigger || [],
      isEditable: true,
      isDeletable: true,
    };

    config.value.faceToFacePrompts.push(newPrompt);
    config.value.faceToFacePromptOrder.push({
      identifier,
      enabled: true,
    });

    await saveConfig();
    return newPrompt;
  }

  /**
   * 在群聊模式新增自定義提示詞
   */
  async function addGroupChatCustomPrompt(
    prompt: Partial<PromptDefinition>,
  ): Promise<PromptDefinition> {
    if (!config.value.groupChatPrompts) {
      config.value.groupChatPrompts = structuredClone(
        GROUP_CHAT_PROMPT_DEFINITIONS,
      );
    }
    if (!config.value.groupChatPromptOrder) {
      config.value.groupChatPromptOrder = structuredClone(
        DEFAULT_GROUP_CHAT_PROMPT_ORDER,
      );
    }

    const identifier = `gc_custom_${Date.now()}`;
    const newPrompt: PromptDefinition = {
      identifier,
      name: prompt.name || "自定義提示詞",
      description: prompt.description || "",
      category: prompt.category || "custom",
      role: prompt.role || "system",
      content: prompt.content || "",
      system_prompt: true,
      marker: false,
      injection_position: prompt.injection_position ?? 0,
      injection_depth: prompt.injection_depth ?? 0,
      injection_order: prompt.injection_order ?? 100,
      forbid_overrides: false,
      extension: false,
      injection_trigger: prompt.injection_trigger || [],
      isEditable: true,
      isDeletable: true,
    };

    config.value.groupChatPrompts.push(newPrompt);
    config.value.groupChatPromptOrder.push({
      identifier,
      enabled: true,
    });

    await saveConfig();
    return newPrompt;
  }

  /**
   * 通用：在指定模式新增自定義提示詞
   */
  async function addCustomPromptForMode(
    mode: string,
    prompt: Partial<PromptDefinition>,
  ): Promise<PromptDefinition> {
    // 模式前綴映射
    const prefixMap: Record<string, string> = {
      global: "custom",
      faceToFace: "f2f_custom",
      groupChat: "gc_custom",
      diary: "diary_custom",
      summary: "summary_custom",
      events: "events_custom",
      plurkPost: "pp_custom",
      plurkComment: "pc_custom",
    };

    // 模式對應的 config key 映射
    const configMap: Record<
      string,
      {
        prompts: keyof PromptManagerConfig;
        order: keyof PromptManagerConfig;
        defaultPrompts: PromptDefinition[];
        defaultOrder: PromptOrderEntry[];
      }
    > = {
      diary: {
        prompts: "diaryPrompts",
        order: "diaryPromptOrder",
        defaultPrompts: DIARY_PROMPT_DEFINITIONS,
        defaultOrder: DEFAULT_DIARY_PROMPT_ORDER,
      },
      summary: {
        prompts: "summaryPrompts",
        order: "summaryPromptOrder",
        defaultPrompts: SUMMARY_PROMPT_DEFINITIONS,
        defaultOrder: DEFAULT_SUMMARY_PROMPT_ORDER,
      },
      events: {
        prompts: "eventsPrompts",
        order: "eventsPromptOrder",
        defaultPrompts: IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
        defaultOrder: DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
      },
      plurkPost: {
        prompts: "plurkPostPrompts",
        order: "plurkPostPromptOrder",
        defaultPrompts: PLURK_POST_PROMPT_DEFINITIONS,
        defaultOrder: DEFAULT_PLURK_POST_PROMPT_ORDER,
      },
      plurkComment: {
        prompts: "plurkCommentPrompts",
        order: "plurkCommentPromptOrder",
        defaultPrompts: PLURK_COMMENT_PROMPT_DEFINITIONS,
        defaultOrder: DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
      },
    };

    // 已有專用函數的模式直接委派
    if (mode === "global") return addCustomPrompt(prompt);
    if (mode === "faceToFace") return addFaceToFaceCustomPrompt(prompt);
    if (mode === "groupChat") return addGroupChatCustomPrompt(prompt);

    const mapping = configMap[mode];
    if (!mapping) return addCustomPrompt(prompt); // fallback

    const prefix = prefixMap[mode] || "custom";
    const identifier = `${prefix}_${Date.now()}`;
    const newPrompt: PromptDefinition = {
      identifier,
      name: prompt.name || "自定義提示詞",
      description: prompt.description || "",
      category: prompt.category || "custom",
      role: prompt.role || "system",
      content: prompt.content || "",
      system_prompt: true,
      marker: false,
      injection_position: prompt.injection_position ?? 0,
      injection_depth: prompt.injection_depth ?? 0,
      injection_order: prompt.injection_order ?? 100,
      forbid_overrides: false,
      extension: false,
      injection_trigger: prompt.injection_trigger || [],
      isEditable: true,
      isDeletable: true,
    };

    // 確保 prompts 陣列存在
    if (!(config.value as any)[mapping.prompts]) {
      (config.value as any)[mapping.prompts] = structuredClone(
        mapping.defaultPrompts,
      );
    }
    (config.value as any)[mapping.prompts].push(newPrompt);

    // 確保 order 陣列存在
    if (!(config.value as any)[mapping.order]) {
      (config.value as any)[mapping.order] = structuredClone(
        mapping.defaultOrder,
      );
    }
    (config.value as any)[mapping.order].push({
      identifier,
      enabled: true,
    });

    await saveConfig();
    return newPrompt;
  }

  /**
   * 恢復預設模塊（從預設定義中添加回已刪除的模塊）
   */
  async function restorePresetModule(
    definition: PromptDefinition,
    mode: string,
  ): Promise<void> {
    const def = structuredClone(definition);
    const orderEntry: PromptOrderEntry = {
      identifier: def.identifier,
      enabled: true,
    };

    switch (mode) {
      case "global":
        if (
          !config.value.prompts.find((p) => p.identifier === def.identifier)
        ) {
          config.value.prompts.push(def);
        }
        if (
          !config.value.globalPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.globalPromptOrder.push(orderEntry);
        }
        break;
      case "faceToFace":
        if (!config.value.faceToFacePrompts) {
          config.value.faceToFacePrompts = structuredClone(
            FACE_TO_FACE_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.faceToFacePrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.faceToFacePrompts.push(def);
        }
        if (!config.value.faceToFacePromptOrder) {
          config.value.faceToFacePromptOrder = structuredClone(
            DEFAULT_FACE_TO_FACE_PROMPT_ORDER,
          );
        }
        if (
          !config.value.faceToFacePromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.faceToFacePromptOrder.push(orderEntry);
        }
        break;
      case "groupChat":
        if (!config.value.groupChatPrompts) {
          config.value.groupChatPrompts = structuredClone(
            GROUP_CHAT_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.groupChatPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.groupChatPrompts.push(def);
        }
        if (!config.value.groupChatPromptOrder) {
          config.value.groupChatPromptOrder = structuredClone(
            DEFAULT_GROUP_CHAT_PROMPT_ORDER,
          );
        }
        if (
          !config.value.groupChatPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.groupChatPromptOrder.push(orderEntry);
        }
        break;
      case "diary":
        if (!config.value.diaryPrompts) {
          config.value.diaryPrompts = structuredClone(DIARY_PROMPT_DEFINITIONS);
        }
        if (
          !config.value.diaryPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.diaryPrompts.push(def);
        }
        if (!config.value.diaryPromptOrder) {
          config.value.diaryPromptOrder = structuredClone(
            DEFAULT_DIARY_PROMPT_ORDER,
          );
        }
        if (
          !config.value.diaryPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.diaryPromptOrder.push(orderEntry);
        }
        break;
      case "summary":
        if (!config.value.summaryPrompts) {
          config.value.summaryPrompts = structuredClone(
            SUMMARY_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.summaryPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.summaryPrompts.push(def);
        }
        if (!config.value.summaryPromptOrder) {
          config.value.summaryPromptOrder = structuredClone(
            DEFAULT_SUMMARY_PROMPT_ORDER,
          );
        }
        if (
          !config.value.summaryPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.summaryPromptOrder.push(orderEntry);
        }
        break;
      case "events":
        if (!config.value.eventsPrompts) {
          config.value.eventsPrompts = structuredClone(
            IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.eventsPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.eventsPrompts.push(def);
        }
        if (!config.value.eventsPromptOrder) {
          config.value.eventsPromptOrder = structuredClone(
            DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER,
          );
        }
        if (
          !config.value.eventsPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.eventsPromptOrder.push(orderEntry);
        }
        break;
      case "plurkPost":
        if (!config.value.plurkPostPrompts) {
          config.value.plurkPostPrompts = structuredClone(
            PLURK_POST_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.plurkPostPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.plurkPostPrompts.push(def);
        }
        if (!config.value.plurkPostPromptOrder) {
          config.value.plurkPostPromptOrder = structuredClone(
            DEFAULT_PLURK_POST_PROMPT_ORDER,
          );
        }
        if (
          !config.value.plurkPostPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.plurkPostPromptOrder.push(orderEntry);
        }
        break;
      case "plurkComment":
        if (!config.value.plurkCommentPrompts) {
          config.value.plurkCommentPrompts = structuredClone(
            PLURK_COMMENT_PROMPT_DEFINITIONS,
          );
        }
        if (
          !config.value.plurkCommentPrompts.find(
            (p) => p.identifier === def.identifier,
          )
        ) {
          config.value.plurkCommentPrompts.push(def);
        }
        if (!config.value.plurkCommentPromptOrder) {
          config.value.plurkCommentPromptOrder = structuredClone(
            DEFAULT_PLURK_COMMENT_PROMPT_ORDER,
          );
        }
        if (
          !config.value.plurkCommentPromptOrder.find(
            (o) => o.identifier === def.identifier,
          )
        ) {
          config.value.plurkCommentPromptOrder.push(orderEntry);
        }
        break;
    }

    await saveConfig();
  }

  /**
   * 輔助：若 identifier 存在於 defaultPrompts 中，記錄到對應的已刪除列表
   */
  function trackDeletedForMode(
    identifier: string,
    defaultPrompts: PromptDefinition[],
    deletedKey: keyof PromptManagerConfig,
  ): void {
    const isDefault = defaultPrompts.some(p => p.identifier === identifier);
    if (isDefault) {
      if (!config.value[deletedKey]) (config.value as any)[deletedKey] = [];
      const list = config.value[deletedKey] as string[];
      if (!list.includes(identifier)) list.push(identifier);
    }
  }

  /**
   * 刪除指定模式的提示詞
   */
  async function deletePromptForMode(
    identifier: string,
    mode: string,
  ): Promise<boolean> {
    switch (mode) {
      case "faceToFace":
        trackDeletedForMode(identifier, FACE_TO_FACE_PROMPT_DEFINITIONS, "deletedFaceToFacePromptIds");
        if (config.value.faceToFacePrompts) {
          config.value.faceToFacePrompts =
            config.value.faceToFacePrompts.filter(
              (p) => p.identifier !== identifier,
            );
        }
        if (config.value.faceToFacePromptOrder) {
          config.value.faceToFacePromptOrder =
            config.value.faceToFacePromptOrder.filter(
              (o) => o.identifier !== identifier,
            );
        }
        break;
      case "diary":
        trackDeletedForMode(identifier, DIARY_PROMPT_DEFINITIONS, "deletedDiaryPromptIds");
        if (config.value.diaryPrompts) {
          config.value.diaryPrompts = config.value.diaryPrompts.filter(
            (p) => p.identifier !== identifier,
          );
        }
        if (config.value.diaryPromptOrder) {
          config.value.diaryPromptOrder = config.value.diaryPromptOrder.filter(
            (o) => o.identifier !== identifier,
          );
        }
        break;
      case "summary":
        trackDeletedForMode(identifier, SUMMARY_PROMPT_DEFINITIONS, "deletedSummaryPromptIds");
        if (config.value.summaryPrompts) {
          config.value.summaryPrompts = config.value.summaryPrompts.filter(
            (p) => p.identifier !== identifier,
          );
        }
        if (config.value.summaryPromptOrder) {
          config.value.summaryPromptOrder =
            config.value.summaryPromptOrder.filter(
              (o) => o.identifier !== identifier,
            );
        }
        break;
      case "events":
        trackDeletedForMode(identifier, IMPORTANT_EVENTS_PROMPT_DEFINITIONS, "deletedEventsPromptIds");
        if (config.value.eventsPrompts) {
          config.value.eventsPrompts = config.value.eventsPrompts.filter(
            (p) => p.identifier !== identifier,
          );
        }
        if (config.value.eventsPromptOrder) {
          config.value.eventsPromptOrder =
            config.value.eventsPromptOrder.filter(
              (o) => o.identifier !== identifier,
            );
        }
        break;
      case "plurkPost":
        trackDeletedForMode(identifier, PLURK_POST_PROMPT_DEFINITIONS, "deletedPlurkPostPromptIds");
        if (config.value.plurkPostPrompts) {
          config.value.plurkPostPrompts = config.value.plurkPostPrompts.filter(
            (p) => p.identifier !== identifier,
          );
        }
        if (config.value.plurkPostPromptOrder) {
          config.value.plurkPostPromptOrder =
            config.value.plurkPostPromptOrder.filter(
              (o) => o.identifier !== identifier,
            );
        }
        break;
      case "plurkComment":
        trackDeletedForMode(identifier, PLURK_COMMENT_PROMPT_DEFINITIONS, "deletedPlurkCommentPromptIds");
        if (config.value.plurkCommentPrompts) {
          config.value.plurkCommentPrompts =
            config.value.plurkCommentPrompts.filter(
              (p) => p.identifier !== identifier,
            );
        }
        if (config.value.plurkCommentPromptOrder) {
          config.value.plurkCommentPromptOrder =
            config.value.plurkCommentPromptOrder.filter(
              (o) => o.identifier !== identifier,
            );
        }
        break;
      default:
        return deletePrompt(identifier);
    }
    await saveConfig();
    return true;
  }

  /**
   * 獲取角色的提示詞內容覆蓋
   */
  function getPromptOverride(
    characterId: string,
    identifier: string,
  ): string | undefined {
    return config.value.characterConfigs[characterId]?.promptOverrides[
      identifier
    ];
  }

  /**
   * 設置角色的提示詞內容覆蓋
   */
  async function setPromptOverride(
    characterId: string,
    identifier: string,
    content: string,
  ): Promise<void> {
    if (!config.value.characterConfigs[characterId]) {
      await createCharacterConfig(characterId);
    }
    config.value.characterConfigs[characterId].promptOverrides[identifier] =
      content;
    config.value.characterConfigs[characterId].updatedAt = Date.now();
    await saveConfig();
  }

  return {
    // State
    config,
    isLoading,
    currentCharacterId,
    // Getters
    currentPromptOrder,
    enabledPromptOrder,
    prompts,
    globalPromptOrder,
    currentCharacterConfig,
    isUsingCharacterConfig,
    promptsByCategory,
    categoryInfo,
    diaryPromptOrder,
    diaryPrompts,
    summaryPromptOrder,
    summaryPrompts,
    eventsPromptOrder,
    eventsPrompts,
    plurkPostPromptOrder,
    plurkPostPrompts,
    plurkCommentPromptOrder,
    plurkCommentPrompts,
    faceToFacePromptOrder,
    faceToFacePrompts,
    groupChatPromptOrder,
    groupChatPrompts,
    // Actions
    loadConfig,
    saveConfig,
    setCurrentCharacter,
    updateGlobalOrder,
    updateCharacterOrder,
    togglePrompt,
    movePrompt,
    addCustomPrompt,
    updatePrompt,
    deletePrompt,
    createCharacterConfig,
    deleteCharacterConfig,
    resetToDefault,
    resetAllToDefault,
    resetSinglePrompt,
    getPrompt,
    getDiaryPrompt,
    toggleDiaryPrompt,
    moveDiaryPrompt,
    updateDiaryPrompt,
    resetDiaryToDefault,
    getSummaryPrompt,
    toggleSummaryPrompt,
    moveSummaryPrompt,
    updateSummaryPrompt,
    resetSummaryToDefault,
    getEventsPrompt,
    toggleEventsPrompt,
    moveEventsPrompt,
    updateEventsPrompt,
    resetEventsToDefault,
    getPlurkPostPrompt,
    togglePlurkPostPrompt,
    movePlurkPostPrompt,
    updatePlurkPostPrompt,
    resetPlurkPostToDefault,
    getPlurkCommentPrompt,
    togglePlurkCommentPrompt,
    movePlurkCommentPrompt,
    updatePlurkCommentPrompt,
    resetPlurkCommentToDefault,
    getFaceToFacePrompt,
    toggleFaceToFacePrompt,
    moveFaceToFacePrompt,
    updateFaceToFacePrompt,
    resetFaceToFaceToDefault,
    addFaceToFaceCustomPrompt,
    getGroupChatPrompt,
    toggleGroupChatPrompt,
    moveGroupChatPrompt,
    updateGroupChatPrompt,
    resetGroupChatToDefault,
    deleteGroupChatPrompt,
    addGroupChatCustomPrompt,
    addCustomPromptForMode,
    getPromptOverride,
    setPromptOverride,
    restorePresetModule,
    deletePromptForMode,
  };
});
