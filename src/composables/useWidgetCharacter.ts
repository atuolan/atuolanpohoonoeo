/**
 * useWidgetCharacter
 * 角色綁定組件共用邏輯：依 characterId 解析角色資料、偏好聊天與好感度狀態
 */

import { computed, ref, watch, type Ref } from "vue";
import { useCharactersStore } from "@/stores/characters";
import { useAffinityStore } from "@/stores/affinity";
import { resolvePreferredDirectChat } from "@/storage/chatStorage";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";

export interface WidgetCharacterData {
  characterId?: string;
}

/**
 * 解析 widget 綁定的角色，並提供常用衍生資料。
 * @param dataRef 反應式的 widget data（需含 characterId）
 */
export function useWidgetCharacter(dataRef: Ref<WidgetCharacterData | undefined>) {
  const charactersStore = useCharactersStore();
  const affinityStore = useAffinityStore();

  // 確保角色列表已載入
  if (charactersStore.characters.length === 0 && !charactersStore.isLoading) {
    void charactersStore.loadCharacters();
  }

  const characterId = computed(() => dataRef.value?.characterId || null);

  const character = computed<StoredCharacter | null>(() => {
    if (!characterId.value) return null;
    return (
      charactersStore.characters.find((c) => c.id === characterId.value) ?? null
    );
  });

  const displayName = computed(() => {
    const c = character.value;
    if (!c) return "未綁定角色";
    return c.nickname || c.data?.name || "未命名角色";
  });

  const avatar = computed(() => character.value?.avatar || "");

  const description = computed(() => character.value?.data?.description || "");

  const tags = computed(() => character.value?.data?.tags || []);

  // ===== 偏好聊天解析（好感度與最近聊天皆以 chatId 為鍵）=====
  const preferredChat = ref<Chat | null>(null);

  watch(
    characterId,
    async (id) => {
      if (!id) {
        preferredChat.value = null;
        return;
      }
      try {
        const chat = await resolvePreferredDirectChat(id);
        preferredChat.value = chat ?? null;
        if (chat) {
          // 確保好感度 store 已初始化並載入該聊天狀態
          await affinityStore.initialize();
          await affinityStore.loadState(chat.id);
        }
      } catch (e) {
        console.error("[useWidgetCharacter] resolve chat failed:", e);
        preferredChat.value = null;
      }
    },
    { immediate: true },
  );

  const chatId = computed(() => preferredChat.value?.id || null);

  /** 認識天數（依角色 createdAt 計算） */
  const knownDays = computed(() => {
    const c = character.value;
    if (!c?.createdAt) return 0;
    const diff = Date.now() - c.createdAt;
    return Math.max(0, Math.floor(diff / 86400000));
  });

  /** 好感度指標快照（陣列） */
  const metrics = computed(() => {
    if (!chatId.value) return [];
    return affinityStore.getMetricsSnapshot(chatId.value);
  });

  return {
    charactersStore,
    affinityStore,
    characterId,
    character,
    displayName,
    avatar,
    description,
    tags,
    preferredChat,
    chatId,
    knownDays,
    metrics,
  };
}
