/**
 * 專屬預設面板的共用狀態：各模式可調整的條目，以及這個聊天目前的調整
 * 調整內容直接讀寫 chatVariables store，不另存
 */
import { computed } from "vue";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { usePromptManagerStore } from "@/stores/promptManager";
import {
  getEffectivePromptOrder,
  type PromptDefinition,
  type PromptOrderEntry,
} from "@/types/promptManager";
import { buildPresetToggleRows, type PresetToggleRow } from "@/utils/chatPromptPreset";

/** 開關調整頁可切換的模式（通話用的是另一套固定提示詞，不開放逐條調整） */
export type PresetToggleMode = "online" | "f2f" | "gc";

export function useChatPresetToggles(options: {
  characterId: () => string;
  isGroupChat: () => boolean;
}) {
  const promptManagerStore = usePromptManagerStore();
  const chatVariablesStore = useChatVariablesStore();

  const sources = computed<
    Record<PresetToggleMode, { definitions: PromptDefinition[]; order: PromptOrderEntry[] }>
  >(() => ({
    online: {
      definitions: promptManagerStore.prompts,
      // 角色有獨立順序時，線上模式實際用的是那一份
      order: getEffectivePromptOrder(promptManagerStore.config, options.characterId()),
    },
    f2f: {
      definitions: promptManagerStore.faceToFacePrompts,
      order: promptManagerStore.faceToFacePromptOrder,
    },
    gc: {
      definitions: promptManagerStore.groupChatPrompts,
      order: promptManagerStore.groupChatPromptOrder,
    },
  }));

  const modes = computed<PresetToggleMode[]>(() =>
    options.isGroupChat() ? ["gc"] : ["online", "f2f"],
  );

  const rowsByMode = computed(() => {
    const result = {} as Record<PresetToggleMode, PresetToggleRow[]>;
    for (const mode of modes.value) {
      const { definitions, order } = sources.value[mode];
      result[mode] = buildPresetToggleRows(definitions, order, chatVariablesStore.promptToggles);
    }
    return result;
  });

  function adjustedCount(mode: PresetToggleMode): number {
    return (rowsByMode.value[mode] ?? []).filter((row) => row.override !== null).length;
  }

  const adjustedTotal = computed(() =>
    modes.value.reduce((sum, mode) => sum + adjustedCount(mode), 0),
  );

  /** 調整過、但對應的提示詞已經從提示詞管理器刪掉的條目 */
  const staleIds = computed(() => {
    const known = new Set(
      Object.values(sources.value).flatMap(({ definitions }) =>
        definitions.map((prompt) => prompt.identifier),
      ),
    );
    return Object.keys(chatVariablesStore.promptToggles).filter((id) => !known.has(id));
  });

  return { modes, rowsByMode, adjustedCount, adjustedTotal, staleIds };
}
