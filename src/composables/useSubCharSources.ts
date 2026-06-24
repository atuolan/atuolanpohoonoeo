import { computed } from "vue";
import { useChatStore } from "@/stores/chat";
import { useCharactersStore } from "@/stores/characters";
import { useUserStore } from "@/stores/user";
import type { MultiCharMember } from "@/types/chat";

/**
 * 子角色匯入來源清單 composable（步驟2）
 *
 * 為「加子角色」表單提供三類可匯入來源：
 *  1. character  — 其他角色卡
 *  2. multichar  — 其他多人卡的子角色
 *  3. persona    — 其他使用者角色（Persona），由 AI 代演
 *
 * 同時提供好感度來源解析（角色卡 → 其私聊 chatId），供唯讀引入使用。
 */

/** 角色卡來源項 */
export interface CharacterSourceItem {
  /** characterId */
  id: string;
  name: string;
  avatar: string;
  description?: string;
  personality?: string;
  scenario?: string;
  /** 該角色現有的私聊 chatId（用於好感度唯讀引入；無私聊則 undefined） */
  privateChatId?: string;
}

/** 其他多人卡的子角色來源項 */
export interface MultiCharSourceItem {
  /** 來源多人卡 chatId */
  sourceChatId: string;
  /** 來源多人卡名稱（群名） */
  cardName: string;
  /** 該卡的子角色 */
  member: MultiCharMember;
}

/** 使用者角色（Persona）來源項 */
export interface PersonaSourceItem {
  /** personaId */
  id: string;
  name: string;
  avatar: string;
  description?: string;
}

export function useSubCharSources(options?: {
  /** 當前所在群聊/多人卡的 chatId，用於從多人卡來源中排除自身 */
  currentChatId?: () => string | undefined;
}) {
  const chatStore = useChatStore();
  const charactersStore = useCharactersStore();
  const userStore = useUserStore();

  /**
   * 找出某 characterId 最新的私聊（非群聊、非分支、非小劇場），用於好感度唯讀來源。
   * 取 updatedAt 最大者。
   */
  function findPrivateChatId(characterId: string): string | undefined {
    const candidates = chatStore.chatHistory
      .filter(
        (c) =>
          !c.isGroupChat &&
          !c.isBranch &&
          !c.isTheater &&
          c.characterId === characterId,
      )
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    return candidates[0]?.id;
  }

  /** 1. 角色卡來源 */
  const characterSources = computed<CharacterSourceItem[]>(() => {
    return charactersStore.characters.map((c) => ({
      id: c.id,
      name: c.nickname || c.data.name || "未命名角色",
      avatar: c.avatar || "",
      description: c.data.description || "",
      personality: c.data.personality || "",
      scenario: c.data.scenario || "",
      privateChatId: findPrivateChatId(c.id),
    }));
  });

  /** 2. 其他多人卡的子角色來源（排除當前卡） */
  const multiCharSources = computed<MultiCharSourceItem[]>(() => {
    const currentId = options?.currentChatId?.();
    const result: MultiCharSourceItem[] = [];
    for (const chat of chatStore.chatHistory) {
      if (!chat.isGroupChat) continue;
      if (!chat.groupMetadata?.isMultiCharCard) continue;
      if (chat.id === currentId) continue;
      const members = chat.groupMetadata.multiCharMembers || [];
      for (const member of members) {
        // 只匯入「本卡子角色 / 角色 / persona」型，避免重複引用鏈
        result.push({
          sourceChatId: chat.id,
          cardName: chat.groupMetadata.groupName || chat.name || "多人卡",
          member,
        });
      }
    }
    return result;
  });

  /** 3. 使用者角色（Persona）來源 */
  const personaSources = computed<PersonaSourceItem[]>(() => {
    return userStore.personas.map((p) => ({
      id: p.id,
      name: p.name || "未命名角色",
      avatar: p.avatar || "",
      description: p.description || "",
    }));
  });

  /** 供關係綁定下拉用：所有 persona（含名稱） */
  const bindablePersonas = computed(() =>
    personaSources.value.map((p) => ({ id: p.id, name: p.name })),
  );

  return {
    characterSources,
    multiCharSources,
    personaSources,
    bindablePersonas,
    findPrivateChatId,
  };
}
