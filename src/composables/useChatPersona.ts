import { computed, ref, type Ref } from "vue";
import { db, DB_STORES } from "@/db/database";
import { useUserStore } from "@/stores/user";

export interface ChatPersonaOverride {
  secrets: string;
  powerDynamic: string;
}

/**
 * 聊天 Persona 選擇與聊天專屬覆蓋
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatPersona(deps: {
  currentChatId: Ref<string | null>;
  showMoreMenu: Ref<boolean>;
  showMoreFeatures: Ref<boolean>;
  saveChatImmediate: () => Promise<void>;
}) {
  const userStore = useUserStore();

  const showPersonaSelector = ref(false);
  const showPersonaEditPanel = ref(false);
  const chatPersonaOverride = ref<ChatPersonaOverride>({
    secrets: "",
    powerDynamic: "",
  });
  const hasPersonaOverride = ref(false);

  // 獲取當前聊天使用的 Persona 資訊（合併全局和聊天專屬）
  const effectivePersona = computed(() => {
    const current = userStore.currentPersona;
    if (!current) return null;
    return {
      ...current,
      secrets: chatPersonaOverride.value.secrets || current.secrets,
      powerDynamic:
        chatPersonaOverride.value.powerDynamic || current.powerDynamic,
    };
  });

  // 從 IDB 恢復全局 Persona 設定
  async function restoreGlobalPersona() {
    try {
      const saved = await db.get<{ currentPersonaId: string | null }>(
        DB_STORES.APP_SETTINGS,
        "user-data",
      );
      if (
        saved?.currentPersonaId &&
        userStore.personas.some((p) => p.id === saved.currentPersonaId)
      ) {
        userStore.switchPersona(saved.currentPersonaId);
      }
    } catch (e) {
      console.warn("[ChatScreen] 恢復全局 Persona 失敗:", e);
    }
  }

  function togglePersonaSelector() {
    showPersonaSelector.value = !showPersonaSelector.value;
    if (showPersonaSelector.value) {
      deps.showMoreMenu.value = false;
      deps.showMoreFeatures.value = false;
    }
  }

  async function selectPersona(personaId: string) {
    try {
      userStore.switchPersona(personaId);
      showPersonaSelector.value = false;
      chatPersonaOverride.value = { secrets: "", powerDynamic: "" };
      hasPersonaOverride.value = false;
      await deps.saveChatImmediate();
    } catch (e) {
      console.error("[ChatScreen] 切換 Persona 時保存失敗:", e);
    }
  }

  function openPersonaEditPanel() {
    showPersonaSelector.value = false;
    showPersonaEditPanel.value = true;
  }

  async function savePersonaEdit(data: {
    description: string;
    secrets: string;
    powerDynamic: string;
  }) {
    const currentId = userStore.currentPersonaId;
    if (!currentId) return;

    userStore.updatePersona(currentId, { description: data.description });
    await userStore.saveUserData();

    chatPersonaOverride.value = {
      secrets: data.secrets,
      powerDynamic: data.powerDynamic,
    };
    hasPersonaOverride.value = true;

    console.log(
      "[ChatScreen] savePersonaEdit: chatId=",
      deps.currentChatId.value,
      "secrets=",
      JSON.stringify(data.secrets),
      "powerDynamic=",
      JSON.stringify(data.powerDynamic),
    );

    await deps.saveChatImmediate();
    showPersonaEditPanel.value = false;
  }

  return {
    showPersonaSelector,
    showPersonaEditPanel,
    chatPersonaOverride,
    hasPersonaOverride,
    effectivePersona,
    restoreGlobalPersona,
    togglePersonaSelector,
    selectPersona,
    openPersonaEditPanel,
    savePersonaEdit,
  };
}
