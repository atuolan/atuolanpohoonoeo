/**
 * 面對面設定面板的共用狀態
 * 開關狀態直接讀寫 promptManager store 的 faceToFacePromptOrder，不另存
 */
import { computed } from "vue";
import { usePromptManagerStore } from "@/stores/promptManager";
import type { F2FPanelLayout, F2FPanelModule } from "@/types/f2fPanel";
import {
  activeOptionIds,
  applyModuleSelection,
  applyStyle,
  buildEnabledMap,
  deriveModuleSelection,
  entryOwners,
  findActiveStyleId,
  nextSelection,
  reconcileLayout,
} from "@/utils/f2fPanelEngine";

/** 已由「視角」模塊取代的舊條目，不在面板中顯示 */
const HIDDEN_ENTRY_IDS = new Set(["f2fNarrativePerson"]);

export interface F2FPanelEntry {
  identifier: string;
  name: string;
  enabled: boolean;
  /** 只用來分隔結構的標籤條目（例如 <視角>）：不是 marker，也沒有內容 */
  structural: boolean;
  ownerModuleId: string | null;
}

export function useF2FPanel() {
  const store = usePromptManagerStore();

  const promptById = computed(() => new Map(store.faceToFacePrompts.map((p) => [p.identifier, p])));
  const enabledMap = computed(() => buildEnabledMap(store.faceToFacePromptOrder));
  const reconciled = computed(() =>
    reconcileLayout(
      store.faceToFacePanelLayout,
      new Set(store.faceToFacePromptOrder.map((entry) => entry.identifier)),
    ),
  );
  const layout = computed(() => reconciled.value.layout);
  const staleCount = computed(() => reconciled.value.staleCount);
  const owners = computed(() => entryOwners(layout.value));

  const entries = computed<F2FPanelEntry[]>(() =>
    store.faceToFacePromptOrder.flatMap((entry) => {
      if (HIDDEN_ENTRY_IDS.has(entry.identifier)) return [];
      const prompt = promptById.value.get(entry.identifier);
      if (!prompt) return [];
      return [
        {
          identifier: entry.identifier,
          name: prompt.name,
          enabled: entry.enabled,
          // 匯入的提示詞在執行期可能沒有 content，需用 ?? "" 兜底
          structural: !prompt.marker && !(prompt.content ?? "").trim(),
          ownerModuleId: owners.value.get(entry.identifier) ?? null,
        },
      ];
    }),
  );

  const selections = computed(
    () => new Map(layout.value.modules.map((module) => [module.id, deriveModuleSelection(module, enabledMap.value)])),
  );
  const activeStyleId = computed(() => findActiveStyleId(layout.value, enabledMap.value));

  function entryName(identifier: string): string {
    return promptById.value.get(identifier)?.name ?? identifier;
  }

  function currentOptionIds(module: F2FPanelModule): string[] {
    const selection = selections.value.get(module.id);
    return selection?.status === "matched" ? selection.optionIds : activeOptionIds(module, enabledMap.value);
  }

  async function selectOption(module: F2FPanelModule, optionId: string): Promise<void> {
    const next = nextSelection(module, currentOptionIds(module), optionId);
    await store.setFaceToFacePromptStates(applyModuleSelection(module, next));
  }

  async function selectNone(module: F2FPanelModule): Promise<void> {
    await store.setFaceToFacePromptStates(applyModuleSelection(module, []));
  }

  async function applyStyleById(styleId: string): Promise<void> {
    const style = layout.value.styles.find((s) => s.id === styleId);
    if (style) await store.setFaceToFacePromptStates(applyStyle(layout.value, style));
  }

  async function toggleEntry(identifier: string, enabled: boolean): Promise<void> {
    await store.toggleFaceToFacePrompt(identifier, enabled);
  }

  async function saveLayout(next: F2FPanelLayout): Promise<void> {
    await store.saveFaceToFacePanelLayout(next);
  }

  return {
    layout,
    staleCount,
    entries,
    owners,
    enabledMap,
    selections,
    activeStyleId,
    entryName,
    currentOptionIds,
    selectOption,
    selectNone,
    applyStyleById,
    toggleEntry,
    saveLayout,
  };
}
