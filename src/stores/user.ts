import { db, DB_STORES } from "@/db/database";
import {
  DEFAULT_MEDIA_LOG_SETTINGS,
  MediaLog,
  MediaLogSettings,
} from "@/types/mediaLog";
import { defineStore } from "pinia";
import { computed, ref, toRaw } from "vue";

// ===== 類型定義 =====

/** 使用者角色描述位置 */
export enum PersonaDescriptionPosition {
  /** 在提示詞中 */
  IN_PROMPT = 0,
  /** 在作者筆記頂部 */
  TOP_AN = 2,
  /** 在作者筆記底部 */
  BOTTOM_AN = 3,
  /** 在指定深度 */
  AT_DEPTH = 4,
  /** 不使用 */
  NONE = 9,
}

/** 噗浪群組設定 */
export interface PersonaQzoneSettings {
  /** 默認貼文可見性 */
  defaultVisibility: "public" | "group-only";
}

/** 使用者角色 */
export interface UserPersona {
  /** 唯一識別碼 */
  id: string;
  /** 名稱 */
  name: string;
  /** 頭像（base64 或 URL） */
  avatar: string;
  /** 描述 */
  description: string;
  /** 設計能力（個人技能） */
  designSkill: string;
  /** 構思能力（個人技能） */
  ideationSkill: string;
  /** 風格標籤（個人技能，多選） */
  styleTags: string[];
  /** NAI 使用者提示（生圖時可選注入） */
  naiUserPrompt?: string;
  /** 用戶的秘密（只有用戶主動說出來，AI角色才會知道） */
  secrets: string;
  /** 與AI角色的權力關係 */
  powerDynamic: string;
  /** 描述位置 */
  descriptionPosition: PersonaDescriptionPosition;
  /** 描述深度（當位置為 AT_DEPTH 時使用） */
  descriptionDepth: number;
  /** 描述角色（0=system, 1=user, 2=assistant） */
  descriptionRole: number;
  /** 關聯的世界書 ID 列表 */
  lorebookIds: string[];
  /** 群組名稱（噗浪空間用） */
  groupName: string;
  /** 綁定的 AI 角色 ID 列表（= 群組成員） */
  boundCharacterIds: string[];
  /** 噗浪空間專用設定 */
  qzoneSettings: PersonaQzoneSettings;
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
}

/** 使用者資料（存儲到 IDB） */
export interface UserData {
  id: string;
  /** 當前使用的角色 ID */
  currentPersonaId: string | null;
  /** 預設角色 ID（所有新聊天和未鎖定聊天的預設 persona） */
  defaultPersonaId: string | null;
  /** 所有角色列表 */
  personas: UserPersona[];
  /** 書影記錄 */
  mediaLogs?: MediaLog[];
  /** 書影記錄設定 */
  mediaLogSettings?: MediaLogSettings;
  /** 更新時間 */
  updatedAt: number;
}

// ===== 常量 =====

const USER_DATA_ID = "user-data";

// ===== 默認值 =====

const createDefaultPersona = (): UserPersona => ({
  id: `persona-${Date.now()}`,
  name: "使用者",
  avatar: "",
  description: "",
  designSkill: "",
  ideationSkill: "",
  styleTags: [],
  naiUserPrompt: "",
  secrets: "",
  powerDynamic: "",
  descriptionPosition: PersonaDescriptionPosition.IN_PROMPT,
  descriptionDepth: 4,
  descriptionRole: 0,
  lorebookIds: [],
  groupName: "",
  boundCharacterIds: [],
  qzoneSettings: {
    defaultVisibility: "public",
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// ===== Store =====

export const useUserStore = defineStore("user", () => {
  // 狀態
  const isLoaded = ref(false);
  const isLoading = ref(false);

  // 角色列表
  const personas = ref<UserPersona[]>([]);

  // 當前選中的角色 ID
  const currentPersonaId = ref<string | null>(null);

  // 預設角色 ID（所有新聊天和未鎖定聊天的預設 persona）
  const defaultPersonaId = ref<string | null>(null);

  // 書影記錄
  const mediaLogs = ref<MediaLog[]>([]);
  const mediaLogSettings = ref<MediaLogSettings>({
    ...DEFAULT_MEDIA_LOG_SETTINGS,
  });

  // ===== 計算屬性 =====

  /** 當前角色 */
  const currentPersona = computed(() => {
    if (!currentPersonaId.value) return null;
    return personas.value.find((p) => p.id === currentPersonaId.value) || null;
  });

  /** 當前角色名稱 */
  const currentName = computed(() => currentPersona.value?.name || "使用者");

  /** 當前角色頭像 */
  const currentAvatar = computed(() => currentPersona.value?.avatar || "");

  /** 當前角色描述 */
  const currentDescription = computed(
    () => currentPersona.value?.description || "",
  );

  /** 當前群組名稱 */
  const currentGroupName = computed(
    () => currentPersona.value?.groupName || "",
  );

  /** 當前綁定的角色 ID 列表 */
  const currentBoundCharacterIds = computed(
    () => currentPersona.value?.boundCharacterIds || [],
  );

  /** 是否為預設角色 */
  const isDefaultPersona = computed(
    () =>
      defaultPersonaId.value !== null &&
      defaultPersonaId.value === currentPersonaId.value,
  );

  // ===== 方法 =====

  /** 正在進行的載入 Promise（用於防止並發載入時丟失等待） */
  let _loadingPromise: Promise<void> | null = null;

  /**
   * 從 IDB 載入使用者資料
   */
  async function loadUserData(): Promise<void> {
    // 如果已經在載入中，等待現有的載入完成而不是直接返回
    if (isLoading.value && _loadingPromise) {
      await _loadingPromise;
      return;
    }

    isLoading.value = true;

    const doLoad = async () => {
      try {
        await db.init();
        const saved = await db.get<UserData>(
          DB_STORES.APP_SETTINGS,
          USER_DATA_ID,
        );

        if (saved) {
          personas.value = (saved.personas || []).map((p) => ({
            ...p,
            designSkill: p.designSkill || "",
            ideationSkill: p.ideationSkill || "",
            styleTags: Array.isArray(p.styleTags) ? p.styleTags : [],
            naiUserPrompt: p.naiUserPrompt || "",
            qzoneSettings: p.qzoneSettings || { defaultVisibility: "public" },
          }));
          currentPersonaId.value = saved.currentPersonaId || null;
          defaultPersonaId.value = saved.defaultPersonaId || null;
          mediaLogs.value = saved.mediaLogs || [];
          mediaLogSettings.value = saved.mediaLogSettings || {
            ...DEFAULT_MEDIA_LOG_SETTINGS,
          };

          // 如果沒有角色，創建默認角色
          if (personas.value.length === 0) {
            const defaultPersona = createDefaultPersona();
            personas.value.push(defaultPersona);
            currentPersonaId.value = defaultPersona.id;
            await saveUserData();
          }

          // 驗證 currentPersonaId 指向的角色確實存在
          if (
            currentPersonaId.value &&
            !personas.value.some((p) => p.id === currentPersonaId.value)
          ) {
            console.warn(
              "[UserStore] currentPersonaId 指向不存在的角色，重置為第一個",
              currentPersonaId.value,
            );
            currentPersonaId.value = personas.value[0]?.id || null;
          }

          console.log("[UserStore] 使用者資料已載入", {
            personas: personas.value.length,
            currentPersonaId: currentPersonaId.value,
            mediaLogs: mediaLogs.value.length,
          });
        } else {
          // 首次使用，創建默認角色
          const defaultPersona = createDefaultPersona();
          personas.value = [defaultPersona];
          currentPersonaId.value = defaultPersona.id;
          await saveUserData();
          console.log("[UserStore] 已創建默認使用者角色");
        }

        isLoaded.value = true;
      } catch (e) {
        console.error("[UserStore] 載入使用者資料失敗:", e);
      } finally {
        isLoading.value = false;
        _loadingPromise = null;
      }
    };

    _loadingPromise = doLoad();
    await _loadingPromise;
  }

  /**
   * 保存使用者資料到 IDB
   */
  async function saveUserData(): Promise<void> {
    try {
      await db.init();

      // 深度克隆以避免 Vue 響應式代理問題
      const rawPersonas = personas.value.map((p) => ({
        ...toRaw(p),
        lorebookIds: [...(p.lorebookIds || [])],
        boundCharacterIds: [...(p.boundCharacterIds || [])],
        styleTags: [...(p.styleTags || [])],
        qzoneSettings: p.qzoneSettings
          ? { ...p.qzoneSettings }
          : { defaultVisibility: "public" as const },
      }));

      const data: UserData = {
        id: USER_DATA_ID,
        currentPersonaId: currentPersonaId.value,
        defaultPersonaId: defaultPersonaId.value,
        personas: rawPersonas,
        mediaLogs: JSON.parse(JSON.stringify(mediaLogs.value)),
        mediaLogSettings: { ...toRaw(mediaLogSettings.value) },
        updatedAt: Date.now(),
      };

      await db.put(DB_STORES.APP_SETTINGS, data);
      console.log("[UserStore] 使用者資料已保存");
    } catch (e) {
      console.error("[UserStore] 保存使用者資料失敗:", e);
      throw e;
    }
  }

  /**
   * 創建新角色
   */
  function createPersona(name: string = "新角色"): UserPersona {
    const persona = createDefaultPersona();
    persona.name = name;
    personas.value.push(persona);
    return persona;
  }

  /**
   * 切換當前角色
   */
  function switchPersona(personaId: string): void {
    const persona = personas.value.find((p) => p.id === personaId);
    if (persona) {
      currentPersonaId.value = personaId;
    }
  }

  /**
   * 更新角色
   */
  function updatePersona(
    personaId: string,
    updates: Partial<UserPersona>,
  ): void {
    const index = personas.value.findIndex((p) => p.id === personaId);
    if (index !== -1) {
      personas.value[index] = {
        ...personas.value[index],
        ...updates,
        updatedAt: Date.now(),
      };
    }
  }

  /**
   * 刪除角色
   */
  function deletePersona(personaId: string): boolean {
    // 至少保留一個角色
    if (personas.value.length <= 1) {
      console.warn("[UserStore] 無法刪除最後一個角色");
      return false;
    }

    const index = personas.value.findIndex((p) => p.id === personaId);
    if (index !== -1) {
      personas.value.splice(index, 1);

      // 如果刪除的是當前角色，切換到第一個
      if (currentPersonaId.value === personaId) {
        currentPersonaId.value = personas.value[0]?.id || null;
      }
      // 如果刪除的是預設角色，清除預設
      if (defaultPersonaId.value === personaId) {
        defaultPersonaId.value = null;
      }
      return true;
    }
    return false;
  }

  /**
   * 複製角色
   */
  function duplicatePersona(personaId: string): UserPersona | null {
    const source = personas.value.find((p) => p.id === personaId);
    if (!source) return null;

    const newPersona: UserPersona = {
      ...toRaw(source),
      id: `persona-${Date.now()}`,
      name: `${source.name} (副本)`,
      lorebookIds: [...(source.lorebookIds || [])],
      boundCharacterIds: [...(source.boundCharacterIds || [])],
      styleTags: [...(source.styleTags || [])],
      qzoneSettings: source.qzoneSettings
        ? { ...source.qzoneSettings }
        : { defaultVisibility: "public" },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    personas.value.push(newPersona);
    return newPersona;
  }

  /**
   * 設置角色頭像
   */
  function setPersonaAvatar(personaId: string, avatar: string): void {
    updatePersona(personaId, { avatar });
  }

  /**
   * 獲取角色的世界書 ID 列表
   */
  function getPersonaLorebookIds(personaId?: string): string[] {
    const id = personaId || currentPersonaId.value;
    if (!id) return [];
    const persona = personas.value.find((p) => p.id === id);
    return persona?.lorebookIds || [];
  }

  /**
   * 更新群組名稱
   */
  function updateGroupName(personaId: string, groupName: string): void {
    updatePersona(personaId, { groupName });
  }

  /**
   * 綁定角色到群組
   */
  function bindCharacter(personaId: string, characterId: string): void {
    const persona = personas.value.find((p) => p.id === personaId);
    if (!persona) return;

    const ids = persona.boundCharacterIds || [];
    if (!ids.includes(characterId)) {
      updatePersona(personaId, {
        boundCharacterIds: [...ids, characterId],
      });
    }
  }

  /**
   * 從群組解綁角色
   */
  function unbindCharacter(personaId: string, characterId: string): void {
    const persona = personas.value.find((p) => p.id === personaId);
    if (!persona) return;

    const ids = persona.boundCharacterIds || [];
    updatePersona(personaId, {
      boundCharacterIds: ids.filter((id) => id !== characterId),
    });
  }

  /**
   * 切換角色綁定狀態
   */
  function toggleCharacterBinding(
    personaId: string,
    characterId: string,
  ): void {
    const persona = personas.value.find((p) => p.id === personaId);
    if (!persona) return;

    const ids = persona.boundCharacterIds || [];
    if (ids.includes(characterId)) {
      unbindCharacter(personaId, characterId);
    } else {
      bindCharacter(personaId, characterId);
    }
  }

  /**
   * 檢查角色是否已綁定
   */
  function isCharacterBound(personaId: string, characterId: string): boolean {
    const persona = personas.value.find((p) => p.id === personaId);
    if (!persona) return false;
    return (persona.boundCharacterIds || []).includes(characterId);
  }

  /**
   * 獲取綁定了指定角色的所有 Persona ID
   */
  function getPersonasByBoundCharacter(characterId: string): string[] {
    return personas.value
      .filter((p) => (p.boundCharacterIds || []).includes(characterId))
      .map((p) => p.id);
  }

  /**
   * 更新噗浪空間設定
   */
  function updateQzoneSettings(
    personaId: string,
    settings: Partial<PersonaQzoneSettings>,
  ): void {
    const persona = personas.value.find((p) => p.id === personaId);
    if (!persona) return;

    updatePersona(personaId, {
      qzoneSettings: {
        ...persona.qzoneSettings,
        ...settings,
      },
    });
  }

  /**
   * 從 SillyTavern personas JSON 導入
   */
  async function importFromSillyTavern(jsonData: any): Promise<number> {
    if (!jsonData.personas || !jsonData.persona_descriptions) {
      throw new Error("無效的 personas JSON 格式");
    }

    const importedCount = { value: 0 };

    // 遍歷所有 personas
    for (const [avatarKey, name] of Object.entries(jsonData.personas)) {
      const description = jsonData.persona_descriptions[avatarKey];

      // 跳過名稱為 {{user}} 的（這是佔位符）
      if (name === "{{user}}") continue;

      const persona: UserPersona = {
        id: `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: name as string,
        avatar: "", // 頭像需要另外處理（原始檔案名）
        description: description?.description || "",
        designSkill: "",
        ideationSkill: "",
        styleTags: [],
        naiUserPrompt: "",
        secrets: description?.userSecrets || "",
        powerDynamic: description?.powerDynamics || "",
        descriptionPosition:
          description?.position ?? PersonaDescriptionPosition.IN_PROMPT,
        descriptionDepth: description?.depth ?? 4,
        descriptionRole: description?.role ?? 0,
        lorebookIds: [], // lorebook 名稱需要另外映射
        groupName: "",
        boundCharacterIds: [],
        qzoneSettings: {
          defaultVisibility: "public",
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // 保存原始頭像檔名到 avatar 欄位（方便後續處理）
      persona.avatar = avatarKey;

      personas.value.push(persona);
      importedCount.value++;
    }

    // 如果導入了角色且沒有當前選中的，選中第一個導入的
    if (importedCount.value > 0 && !currentPersonaId.value) {
      currentPersonaId.value = personas.value[0]?.id || null;
    }

    await saveUserData();
    console.log(`[UserStore] 導入了 ${importedCount.value} 個角色`);
    return importedCount.value;
  }

  /**
   * 導出為 SillyTavern personas JSON 格式
   */
  function exportToSillyTavern(): any {
    const personasMap: Record<string, string> = {};
    const descriptionsMap: Record<string, any> = {};

    for (const persona of personas.value) {
      // 使用 id 作為 key（或原始 avatar 如果有）
      const key = persona.avatar || `${persona.id}.png`;

      personasMap[key] = persona.name;
      descriptionsMap[key] = {
        description: persona.description,
        position: persona.descriptionPosition,
        depth: persona.descriptionDepth,
        role: persona.descriptionRole,
        lorebook: "", // 需要另外映射
        connections: [],
        userSecrets: persona.secrets,
        powerDynamics: persona.powerDynamic,
      };
    }

    return {
      personas: personasMap,
      persona_descriptions: descriptionsMap,
    };
  }

  /**
   * 清空所有角色（保留一個默認）
   */
  async function clearAllPersonas(): Promise<void> {
    const defaultPersona = createDefaultPersona();
    personas.value = [defaultPersona];
    currentPersonaId.value = defaultPersona.id;
    defaultPersonaId.value = null;
    await saveUserData();
  }

  // ===== 預設角色與自動切換 =====

  /**
   * 設定/取消預設角色
   * 預設角色會在沒有其他鎖定時自動使用
   */
  function setDefaultPersona(personaId: string | null): void {
    // 如果已經是預設，則取消
    if (defaultPersonaId.value === personaId) {
      defaultPersonaId.value = null;
      console.log("[UserStore] 已取消預設角色");
    } else {
      defaultPersonaId.value = personaId;
      console.log(`[UserStore] 已設定預設角色: ${personaId}`);
    }
  }

  /**
   * 根據聊天的角色 ID 和聊天級鎖定，自動解析應該使用的 persona
   *
   * 優先順序：
   * 1. 聊天級鎖定（chat.metadata.personaOverride.personaId）
   * 2. 角色級綁定（boundCharacterIds 包含該角色）
   * 3. 預設角色（defaultPersonaId）
   * 4. 當前選中（currentPersonaId）
   *
   * @param characterId 聊天對應的角色 ID
   * @param chatLockedPersonaId 聊天級鎖定的 persona ID（來自 chat.metadata.personaOverride）
   * @returns 解析出的 persona ID，null 表示無法解析
   */
  function resolvePersonaForChat(
    characterId: string,
    chatLockedPersonaId?: string | null,
  ): string | null {
    // 1. 聊天級鎖定（最高優先）
    if (chatLockedPersonaId) {
      const exists = personas.value.some((p) => p.id === chatLockedPersonaId);
      if (exists) {
        console.log(
          `[UserStore] 使用聊天鎖定的 persona: ${chatLockedPersonaId}`,
        );
        return chatLockedPersonaId;
      }
      console.warn(
        `[UserStore] 聊天鎖定的 persona 不存在: ${chatLockedPersonaId}`,
      );
    }

    // 2. 角色級綁定（查找哪些 persona 的 boundCharacterIds 包含此角色）
    const boundPersonas = getPersonasByBoundCharacter(characterId);
    if (boundPersonas.length === 1) {
      console.log(`[UserStore] 使用角色綁定的 persona: ${boundPersonas[0]}`);
      return boundPersonas[0];
    }
    if (boundPersonas.length > 1) {
      // 多個 persona 綁定了同一角色，優先選當前的，否則選第一個
      if (
        currentPersonaId.value &&
        boundPersonas.includes(currentPersonaId.value)
      ) {
        console.log(
          `[UserStore] 多個綁定，使用當前 persona: ${currentPersonaId.value}`,
        );
        return currentPersonaId.value;
      }
      console.log(`[UserStore] 多個綁定，使用第一個: ${boundPersonas[0]}`);
      return boundPersonas[0];
    }

    // 3. 預設角色
    if (defaultPersonaId.value) {
      const exists = personas.value.some(
        (p) => p.id === defaultPersonaId.value,
      );
      if (exists) {
        console.log(`[UserStore] 使用預設 persona: ${defaultPersonaId.value}`);
        return defaultPersonaId.value;
      }
    }

    // 4. 當前選中
    console.log(`[UserStore] 使用當前 persona: ${currentPersonaId.value}`);
    return currentPersonaId.value;
  }

  /**
   * 根據聊天自動切換 persona（在進入聊天時調用）
   * @param characterId 聊天對應的角色 ID
   * @param chatLockedPersonaId 聊天級鎖定的 persona ID
   * @returns 是否發生了切換
   */
  function autoSwitchPersonaForChat(
    characterId: string,
    chatLockedPersonaId?: string | null,
  ): boolean {
    const resolved = resolvePersonaForChat(characterId, chatLockedPersonaId);
    if (resolved && resolved !== currentPersonaId.value) {
      switchPersona(resolved);
      console.log(`[UserStore] 自動切換 persona 到: ${resolved}`);
      return true;
    }
    return false;
  }

  // ===== 書影記錄方法 =====

  /**
   * 添加書影記錄
   */
  async function addMediaLog(log: MediaLog): Promise<void> {
    mediaLogs.value.push(log);
    await saveUserData();
  }

  /**
   * 更新書影記錄
   */
  async function updateMediaLog(
    id: string,
    updates: Partial<MediaLog>,
  ): Promise<void> {
    const index = mediaLogs.value.findIndex((l) => l.id === id);
    if (index !== -1) {
      mediaLogs.value[index] = { ...mediaLogs.value[index], ...updates };
      await saveUserData();
    }
  }

  /**
   * 刪除書影記錄
   */
  async function deleteMediaLog(id: string): Promise<void> {
    mediaLogs.value = mediaLogs.value.filter((l) => l.id !== id);
    await saveUserData();
  }

  /**
   * 更新書影記錄設定
   */
  async function updateMediaLogSettings(
    settings: Partial<MediaLogSettings>,
  ): Promise<void> {
    mediaLogSettings.value = { ...mediaLogSettings.value, ...settings };
    await saveUserData();
  }

  return {
    // 狀態
    isLoaded,
    isLoading,
    personas,
    currentPersonaId,
    defaultPersonaId,

    // 計算屬性
    currentPersona,
    currentName,
    currentAvatar,
    currentDescription,
    currentGroupName,
    currentBoundCharacterIds,
    isDefaultPersona,

    // 方法
    loadUserData,
    saveUserData,
    createPersona,
    switchPersona,
    updatePersona,
    deletePersona,
    duplicatePersona,
    setPersonaAvatar,
    getPersonaLorebookIds,
    // 群組管理 & 角色綁定
    updateGroupName,
    bindCharacter,
    unbindCharacter,
    toggleCharacterBinding,
    isCharacterBound,
    getPersonasByBoundCharacter,
    updateQzoneSettings,
    // 預設角色與自動切換
    setDefaultPersona,
    resolvePersonaForChat,
    autoSwitchPersonaForChat,
    // 導入導出
    importFromSillyTavern,
    exportToSillyTavern,
    clearAllPersonas,
    // 書影記錄
    mediaLogs,
    mediaLogSettings,
    addMediaLog,
    updateMediaLog,
    deleteMediaLog,
    updateMediaLogSettings,
  };
});
