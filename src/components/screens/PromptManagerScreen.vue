<script setup lang="ts">
/**
 * 提示詞管理器頁面
 * 管理提示詞順序、啟用狀態、自定義提示詞
 */

import MediaLogManager from "@/components/modals/MediaLogManager.vue";
import {
  DEFAULT_PROMPT_DEFINITIONS,
  DIARY_PROMPT_DEFINITIONS,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
  GROUP_CHAT_PROMPT_DEFINITIONS,
  IMPORTANT_EVENTS_PROMPT_DEFINITIONS,
  PLURK_COMMENT_PROMPT_DEFINITIONS,
  PLURK_POST_PROMPT_DEFINITIONS,
  SUMMARY_PROMPT_DEFINITIONS,
} from "@/data/defaultPrompts";
import {
  useAdminStore,
  useCharactersStore,
  usePromptLibraryStore,
  usePromptManagerStore,
} from "@/stores";
import type { PromptDefinition, PromptOrderEntry } from "@/types/promptManager";
import {
  isPromptDeletable,
  isPromptEditable,
  isPromptToggleable,
} from "@/types/promptManager";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

// Emits
const emit = defineEmits<{
  (e: "back"): void;
}>();

// Stores
const promptManagerStore = usePromptManagerStore();
const promptLibraryStore = usePromptLibraryStore();
const charactersStore = useCharactersStore();
const adminStore = useAdminStore();

// 當前選擇的模式：'global' = 線上模式, 'faceToFace' = 面對面, 'groupChat' = 群聊, 'diary' = 日記, 'summary' = 總結, 'events' = 重要事件, 'plurkPost' = 噗浪發文, 'plurkComment' = 噗浪評論, 其他 = 角色 ID
const selectedMode = ref<
  | "global"
  | "faceToFace"
  | "groupChat"
  | "diary"
  | "summary"
  | "events"
  | "plurkPost"
  | "plurkComment"
  | string
>("global");

// 當前選擇的角色 ID（null = 線上模式）
const selectedCharacterId = ref<string | null>(null);

// 編輯中的提示詞
const editingPrompt = ref<PromptDefinition | null>(null);
const editingName = ref("");
const editingContent = ref("");
const editingRole = ref<"system" | "user" | "assistant">("system");
const editingInjectionPosition = ref<0 | 1>(0); // 0=RELATIVE, 1=ABSOLUTE
const editingInjectionDepth = ref(0);
const editingInjectionOrder = ref(0);
const editingAdminOnly = ref(false);

// 新建提示詞
const showNewPromptModal = ref(false);

// 書影記錄管理器
const showMediaLogManager = ref(false);

// 管理員登入
const showAdminLoginModal = ref(false);
const adminPassword = ref("");
const adminLoginError = ref("");

// 添加預設模塊選擇器
const showPresetPicker = ref(false);

// 重置選單
const showResetMenu = ref(false);

// 導出選擇
const showExportModal = ref(false);
const exportOptions = ref({
  globalPrompts: true,
  globalOrder: true,
  faceToFace: false,
  diary: false,
  summary: false,
  events: false,
  plurkPost: false,
  plurkComment: false,
  groupChat: false,
  characterConfigs: false,
});
const exportFormat = ref<"json" | "typescript">("json");
const newPromptName = ref("");
const newPromptContent = ref("");
const newPromptRole = ref<"system" | "user" | "assistant">("system");
const newPromptInjectionPosition = ref<0 | 1>(0);
const newPromptInjectionDepth = ref(0);
const newPromptInjectionOrder = ref(100);
const newPromptInsertMode = ref<ImportInsertMode>("end");
const newPromptAnchorIdentifier = ref("");

// 拖拽狀態
const draggedItem = ref<PromptOrderEntry | null>(null);
const dragOverIndex = ref<number | null>(null);

// 觸控拖拽狀態
let touchLongPressTimer: ReturnType<typeof setTimeout> | null = null;
const touchDragging = ref(false);
const touchDragFromIndex = ref(-1);
const touchDragClone = ref<HTMLElement | null>(null);
const promptListRef = ref<HTMLElement | null>(null);

// 自訂模塊庫
const showPromptLibraryModal = ref(false);

// 導入條目
const showImportModal = ref(false);
const importFileInput = ref<HTMLInputElement | null>(null);
const importedPromptItems = ref<ImportedPromptItem[]>([]);
const selectedImportedPromptIds = ref<string[]>([]);
const importInsertMode = ref<ImportInsertMode>("end");
const importAnchorIdentifier = ref("");
const importSourceFileName = ref("");
const importStatusMessage = ref("");
const importErrorMessage = ref("");
const importedInCurrentSession = ref<string[]>([]);

interface ImportedPromptItem {
  sourceIdentifier: string;
  name: string;
  content: string;
  role: "system" | "user" | "assistant";
  enabled: boolean;
  injection_position: 0 | 1;
  injection_depth: number;
  injection_order: number;
  marker: boolean;
  system_prompt: boolean;
}

type ImportInsertMode = "start" | "end" | "before" | "after";

const RESERVED_SYSTEM_IDENTIFIERS = new Set([
  "main",
  "nsfw",
  "jailbreak",
  "enhanceDefinitions",
  "charDescription",
  "charPersonality",
  "scenario",
  "personaDescription",
  "worldInfoBefore",
  "worldInfoAfter",
  "dialogueExamples",
  "chatHistory",
  "authorsNote",
]);

const currentOrderChoices = computed(() =>
  filteredCurrentOrder.value
    .map((entry) => {
      const def = getPromptDef(entry.identifier);
      return {
        identifier: entry.identifier,
        name: def?.name || entry.identifier,
      };
    })
    .filter((item) => item.identifier.trim().length > 0),
);

const selectedImportedPromptCount = computed(
  () => selectedImportedPromptIds.value.length,
);

const canSubmitImportedPrompts = computed(() => {
  if (selectedImportedPromptIds.value.length === 0) return false;
  if (importInsertMode.value === "before" || importInsertMode.value === "after") {
    return importAnchorIdentifier.value.trim().length > 0;
  }
  return true;
});

const isAllImportedSelected = computed(
  () =>
    importedPromptItems.value.length > 0 &&
    selectedImportedPromptIds.value.length === importedPromptItems.value.length,
);

const shouldCreateAsSystemPrompt = computed(() => adminStore.isAdmin);

async function addLibraryItemToCurrentMode(item: PromptDefinition) {
  try {
    await promptManagerStore.addCustomPromptForMode(selectedMode.value, {
      name: item.name,
      content: item.content,
      role: item.role,
      injection_position: item.injection_position,
      injection_depth: item.injection_depth,
      injection_order: item.injection_order,
    }, {
      systemPrompt: shouldCreateAsSystemPrompt.value,
    });
    alert("已加入到目前模式");
  } catch (e) {
    console.error(e);
    alert("加入失敗，請看 Console");
  }
}

function getImportedPromptType(item: ImportedPromptItem): string {
  if (item.marker) return "系統插槽";
  if (RESERVED_SYSTEM_IDENTIFIERS.has(item.sourceIdentifier)) return "核心條目";
  return "一般條目";
}

function isImportedPromptRecommended(item: ImportedPromptItem): boolean {
  return !item.marker && item.content.trim().length > 0;
}

function clearImportState() {
  importedPromptItems.value = [];
  selectedImportedPromptIds.value = [];
  importInsertMode.value = "end";
  importAnchorIdentifier.value = "";
  importSourceFileName.value = "";
  importStatusMessage.value = "";
  importErrorMessage.value = "";
  importedInCurrentSession.value = [];
  if (importFileInput.value) {
    importFileInput.value.value = "";
  }
}

function openImportPicker() {
  importErrorMessage.value = "";
  importStatusMessage.value = "";
  importFileInput.value?.click();
}

function parseImportedPromptItems(raw: unknown): ImportedPromptItem[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as any).prompts)) {
    throw new Error("找不到 prompts 陣列，這不是可識別的酒館預設格式。");
  }

  return (raw as any).prompts
    .filter((item: unknown) => item && typeof item === "object")
    .map((item: any, index: number) => ({
      sourceIdentifier: String(item.identifier || `imported_${index}`),
      name: String(item.name || item.identifier || `導入條目 ${index + 1}`),
      content: typeof item.content === "string" ? item.content : "",
      role:
        item.role === "user" || item.role === "assistant" ? item.role : "system",
      enabled: item.enabled !== false,
      injection_position: item.injection_position === 1 ? 1 : 0,
      injection_depth:
        typeof item.injection_depth === "number" ? item.injection_depth : 0,
      injection_order:
        typeof item.injection_order === "number" ? item.injection_order : 100,
      marker: Boolean(item.marker),
      system_prompt: Boolean(item.system_prompt),
    }));
}

async function handleImportFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const items = parseImportedPromptItems(parsed);

    importedPromptItems.value = items;
    selectedImportedPromptIds.value = items
      .filter((item) => isImportedPromptRecommended(item))
      .map((item) => item.sourceIdentifier);
    importSourceFileName.value = file.name;
    importStatusMessage.value = `已解析 ${items.length} 個條目，請選擇要插入的內容。`;
    importErrorMessage.value = "";
    importedInCurrentSession.value = [];
    if (
      (importInsertMode.value === "before" || importInsertMode.value === "after") &&
      currentOrderChoices.value.length === 0
    ) {
      importInsertMode.value = "end";
    }
    showImportModal.value = true;
  } catch (error) {
    console.error(error);
    importErrorMessage.value =
      error instanceof Error ? error.message : "導入失敗，請確認 JSON 格式正確。";
  } finally {
    if (input) {
      input.value = "";
    }
  }
}

function toggleSelectAllImported(selectAll: boolean) {
  selectedImportedPromptIds.value = selectAll
    ? importedPromptItems.value.map((item) => item.sourceIdentifier)
    : [];
}

function updateImportAnchorOnModeChange() {
  if (currentOrderChoices.value.length === 0) {
    importAnchorIdentifier.value = "";
    if (importInsertMode.value === "before" || importInsertMode.value === "after") {
      importInsertMode.value = "end";
    }
    return;
  }

  const exists = currentOrderChoices.value.some(
    (item) => item.identifier === importAnchorIdentifier.value,
  );
  if (!exists && (importInsertMode.value === "before" || importInsertMode.value === "after")) {
    importAnchorIdentifier.value = currentOrderChoices.value[0]?.identifier || "";
  }
}

function getImportInsertIndex(count: number): number | undefined {
  if (importInsertMode.value === "start") return 0;
  if (importInsertMode.value === "end") return currentOrder.value.length;

  const anchorIndex = currentOrder.value.findIndex(
    (entry) => entry.identifier === importAnchorIdentifier.value,
  );
  if (anchorIndex === -1) return currentOrder.value.length;
  if (importInsertMode.value === "before") return anchorIndex;
  return anchorIndex + count;
}

function getNewPromptInsertIndex(): number | undefined {
  if (newPromptInsertMode.value === "start") return 0;
  if (newPromptInsertMode.value === "end") return currentOrder.value.length;

  const anchorIndex = currentOrder.value.findIndex(
    (entry) => entry.identifier === newPromptAnchorIdentifier.value,
  );
  if (anchorIndex === -1) return currentOrder.value.length;
  if (newPromptInsertMode.value === "before") return anchorIndex;
  return anchorIndex + 1;
}

async function insertSelectedImportedPrompts() {
  if (!canSubmitImportedPrompts.value) return;

  const selectedItems = importedPromptItems.value.filter((item) =>
    selectedImportedPromptIds.value.includes(item.sourceIdentifier),
  );
  if (selectedItems.length === 0) return;

  importErrorMessage.value = "";
  importStatusMessage.value = "";

  try {
    let insertIndex = getImportInsertIndex(0);
    const insertedIds: string[] = [];

    for (const item of selectedItems) {
      await promptManagerStore.addCustomPromptForMode(
        selectedMode.value,
        {
          name: item.name,
          content: item.content,
          role: item.role,
          injection_position: item.injection_position,
          injection_depth: item.injection_depth,
          injection_order: item.injection_order,
        },
        {
          enabled: item.enabled,
          insertIndex,
          systemPrompt: shouldCreateAsSystemPrompt.value,
        },
      );
      insertedIds.push(item.sourceIdentifier);
      if (typeof insertIndex === "number") {
        insertIndex += 1;
      }
      importedInCurrentSession.value.push(item.sourceIdentifier);
    }

    selectedImportedPromptIds.value = selectedImportedPromptIds.value.filter(
      (id) => !insertedIds.includes(id),
    );
    importStatusMessage.value = `已插入 ${selectedItems.length} 個條目到目前模式。`;
    updateImportAnchorOnModeChange();
  } catch (error) {
    console.error(error);
    importErrorMessage.value = "插入失敗，請查看 Console。";
  }
}

// 計算屬性
const currentOrder = computed(() => {
  if (selectedMode.value === "faceToFace") {
    return promptManagerStore.faceToFacePromptOrder;
  }
  if (selectedMode.value === "groupChat") {
    return promptManagerStore.groupChatPromptOrder;
  }
  if (selectedMode.value === "diary") {
    return promptManagerStore.diaryPromptOrder;
  }
  if (selectedMode.value === "summary") {
    return promptManagerStore.summaryPromptOrder;
  }
  if (selectedMode.value === "events") {
    return promptManagerStore.eventsPromptOrder;
  }
  if (selectedMode.value === "plurkPost") {
    return promptManagerStore.plurkPostPromptOrder;
  }
  if (selectedMode.value === "plurkComment") {
    return promptManagerStore.plurkCommentPromptOrder;
  }
  return promptManagerStore.currentPromptOrder;
});
const isUsingCharacterConfig = computed(
  () => promptManagerStore.isUsingCharacterConfig,
);

// 是否為面對面模式
const isFaceToFaceMode = computed(() => selectedMode.value === "faceToFace");

// 是否為群聊模式
const isGroupChatMode = computed(() => selectedMode.value === "groupChat");

// 是否為日記模式
const isDiaryMode = computed(() => selectedMode.value === "diary");

// 是否為總結模式
const isSummaryMode = computed(() => selectedMode.value === "summary");

// 是否為重要事件模式
const isEventsMode = computed(() => selectedMode.value === "events");

// 是否為噗浪發文模式
const isPlurkPostMode = computed(() => selectedMode.value === "plurkPost");

// 是否為噗浪評論模式
const isPlurkCommentMode = computed(
  () => selectedMode.value === "plurkComment",
);

// 角色列表
const characters = computed(() => charactersStore.characters);

/** 當前模式對應的所有預設提示詞定義 */
function getDefaultsForCurrentMode(): PromptDefinition[] {
  switch (selectedMode.value) {
    case "faceToFace":
      return FACE_TO_FACE_PROMPT_DEFINITIONS;
    case "groupChat":
      return GROUP_CHAT_PROMPT_DEFINITIONS;
    case "diary":
      return DIARY_PROMPT_DEFINITIONS;
    case "summary":
      return SUMMARY_PROMPT_DEFINITIONS;
    case "events":
      return IMPORTANT_EVENTS_PROMPT_DEFINITIONS;
    case "plurkPost":
      return PLURK_POST_PROMPT_DEFINITIONS;
    case "plurkComment":
      return PLURK_COMMENT_PROMPT_DEFINITIONS;
    default:
      return DEFAULT_PROMPT_DEFINITIONS;
  }
}

/** 可添加的預設模塊（不在當前列表中的） */
const availablePresets = computed(() => {
  const currentIds = new Set(currentOrder.value.map((e) => e.identifier));
  const allDefaults = getDefaultsForCurrentMode();
  return allDefaults.filter((def) => {
    if (currentIds.has(def.identifier)) return false;
    if (def.adminOnly && !adminStore.isAdmin) return false;
    return true;
  });
});

/** 過濾後的當前順序（所有模塊都顯示，adminOnly 只是隱藏內容） */
const filteredCurrentOrder = computed(() => {
  return currentOrder.value;
});

// 已有自訂配置的角色 ID 列表
const configuredCharacterIds = computed(() => {
  return Object.keys(promptManagerStore.config.characterConfigs);
});

// 已有自訂配置的角色（用於顯示標籤）
const configuredCharacters = computed(() => {
  return characters.value.filter((char) =>
    configuredCharacterIds.value.includes(char.id),
  );
});

// 尚未配置的角色（用於添加選單）
const unconfiguredCharacters = computed(() => {
  return characters.value.filter(
    (char) => !configuredCharacterIds.value.includes(char.id),
  );
});

// 顯示添加角色配置的選單
const showAddCharacterMenu = ref(false);
const addCharBtnRef = ref<HTMLElement | null>(null);
const addCharMenuStyle = ref<{ top: string; left: string }>({
  top: "0px",
  left: "0px",
});

// 切換添加角色選單
function toggleAddCharacterMenu() {
  if (!showAddCharacterMenu.value && addCharBtnRef.value) {
    const rect = addCharBtnRef.value.getBoundingClientRect();
    addCharMenuStyle.value = {
      top: `${rect.bottom + 8}px`,
      left: `${rect.left}px`,
    };
  }
  showAddCharacterMenu.value = !showAddCharacterMenu.value;
}

// 獲取提示詞定義
function getPromptDef(identifier: string): PromptDefinition | undefined {
  if (selectedMode.value === "faceToFace") {
    return promptManagerStore.getFaceToFacePrompt(identifier);
  }
  if (selectedMode.value === "groupChat") {
    return promptManagerStore.getGroupChatPrompt(identifier);
  }
  if (selectedMode.value === "diary") {
    return promptManagerStore.getDiaryPrompt(identifier);
  }
  if (selectedMode.value === "summary") {
    return promptManagerStore.getSummaryPrompt(identifier);
  }
  if (selectedMode.value === "events") {
    return promptManagerStore.getEventsPrompt(identifier);
  }
  if (selectedMode.value === "plurkPost") {
    return promptManagerStore.getPlurkPostPrompt(identifier);
  }
  if (selectedMode.value === "plurkComment") {
    return promptManagerStore.getPlurkCommentPrompt(identifier);
  }
  return promptManagerStore.getPrompt(identifier);
}

// 獲取提示詞顯示名稱
function getPromptName(identifier: string): string {
  const def = getPromptDef(identifier);
  return def?.name || identifier;
}

// 獲取提示詞圖標
function getPromptIcon(identifier: string): string {
  const def = getPromptDef(identifier);
  if (!def) return "📝";

  if (def.marker) {
    // Marker 圖標
    switch (identifier) {
      case "charDescription":
        return "👤";
      case "charPersonality":
        return "💭";
      case "scenario":
        return "🎬";
      case "personaDescription":
        return "🧑";
      case "worldInfoBefore":
        return "🌍↑";
      case "worldInfoAfter":
        return "🌍↓";
      case "dialogueExamples":
        return "💬";
      case "chatHistory":
        return "📜";
      case "authorsNote":
        return "✏️";
      default:
        return "📌";
    }
  } else {
    // 非 Marker 提示詞
    switch (identifier) {
      case "main":
        return "⭐";
      case "nsfw":
        return "🔞";
      case "jailbreak":
        return "🔓";
      case "enhanceDefinitions":
        return "✨";
      default:
        return "📝";
    }
  }
}

// 獲取角色標籤
function getRoleLabel(
  identifier: string,
): { text: string; class: string } | null {
  const def = getPromptDef(identifier);
  if (!def || def.role === "system") return null;

  if (def.role === "user") {
    return { text: "使用者", class: "role-user" };
  } else if (def.role === "assistant") {
    return { text: "AI", class: "role-assistant" };
  }
  return null;
}

// 獲取位置標籤
function getPositionLabel(
  identifier: string,
): { text: string; class: string } | null {
  const def = getPromptDef(identifier);
  if (!def || def.injection_position !== 1) return null;

  return { text: `@${def.injection_depth}`, class: "position-depth" };
}

// 切換啟用狀態
async function toggleEnabled(identifier: string) {
  const def = getPromptDef(identifier);
  if (def && isPromptToggleable(def)) {
    if (selectedMode.value === "faceToFace") {
      await promptManagerStore.toggleFaceToFacePrompt(identifier);
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.toggleGroupChatPrompt(identifier);
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.toggleDiaryPrompt(identifier);
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.toggleSummaryPrompt(identifier);
    } else if (selectedMode.value === "events") {
      await promptManagerStore.toggleEventsPrompt(identifier);
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.togglePlurkPostPrompt(identifier);
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.togglePlurkCommentPrompt(identifier);
    } else {
      await promptManagerStore.togglePrompt(identifier);
    }
  }
}

// 開始拖拽
function onDragStart(event: DragEvent, entry: PromptOrderEntry, index: number) {
  draggedItem.value = entry;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", index.toString());
  }
}

// 拖拽經過
function onDragOver(event: DragEvent, index: number) {
  event.preventDefault();
  dragOverIndex.value = index;
}

// 拖拽離開
function onDragLeave() {
  dragOverIndex.value = null;
}

// 放下
async function onDrop(event: DragEvent, toIndex: number) {
  event.preventDefault();
  const fromIndex = parseInt(event.dataTransfer?.getData("text/plain") || "-1");

  if (fromIndex !== -1 && fromIndex !== toIndex && draggedItem.value) {
    if (selectedMode.value === "faceToFace") {
      await promptManagerStore.moveFaceToFacePrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.moveGroupChatPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.moveDiaryPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.moveSummaryPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "events") {
      await promptManagerStore.moveEventsPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.movePlurkPostPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.movePlurkCommentPrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    } else {
      await promptManagerStore.movePrompt(
        draggedItem.value.identifier,
        fromIndex,
        toIndex,
      );
    }
  }

  draggedItem.value = null;
  dragOverIndex.value = null;
}

// 拖拽結束
function onDragEnd() {
  draggedItem.value = null;
  dragOverIndex.value = null;
}

// ===== 觸控長按拖拽 =====
function onTouchStart(
  event: TouchEvent,
  entry: PromptOrderEntry,
  _filteredIndex: number,
) {
  // 只處理單指觸控
  if (event.touches.length !== 1) return;

  const touch = event.touches[0];
  const startX = touch.clientX;
  const startY = touch.clientY;
  let moved = false;

  const onTouchMoveCheck = (e: TouchEvent) => {
    const t = e.touches[0];
    if (
      Math.abs(t.clientX - startX) > 10 ||
      Math.abs(t.clientY - startY) > 10
    ) {
      moved = true;
      cancelLongPress();
    }
  };

  const cancelLongPress = () => {
    if (touchLongPressTimer) {
      clearTimeout(touchLongPressTimer);
      touchLongPressTimer = null;
    }
    window.removeEventListener("touchmove", onTouchMoveCheck);
  };

  window.addEventListener("touchmove", onTouchMoveCheck, { passive: true });

  touchLongPressTimer = setTimeout(() => {
    window.removeEventListener("touchmove", onTouchMoveCheck);
    if (moved) return;

    // 觸發長按拖拽
    const realIdx = getRealIndex(entry.identifier);
    draggedItem.value = entry;
    touchDragging.value = true;
    touchDragFromIndex.value = realIdx;

    // 震動反饋
    if (navigator.vibrate) navigator.vibrate(30);

    // 建立拖拽幽靈元素
    const target = (event.target as HTMLElement).closest(
      ".prompt-item",
    ) as HTMLElement;
    if (target) {
      const clone = target.cloneNode(true) as HTMLElement;
      clone.classList.add("touch-drag-ghost");
      const rect = target.getBoundingClientRect();
      clone.style.width = `${rect.width}px`;
      clone.style.position = "fixed";
      clone.style.left = `${rect.left}px`;
      clone.style.top = `${rect.top}px`;
      clone.style.zIndex = "9999";
      clone.style.pointerEvents = "none";
      clone.style.opacity = "0.85";
      clone.style.boxShadow = "0 8px 24px rgba(0,0,0,0.18)";
      clone.style.transform = "scale(1.03)";
      clone.style.transition = "none";
      document.body.appendChild(clone);
      touchDragClone.value = clone;
    }

    // 綁定移動和結束事件
    window.addEventListener("touchmove", onTouchDragMove, { passive: false });
    window.addEventListener("touchend", onTouchDragEnd);
    window.addEventListener("touchcancel", onTouchDragEnd);
  }, 400);
}

function onTouchDragMove(event: TouchEvent) {
  if (!touchDragging.value) return;
  event.preventDefault(); // 阻止頁面滾動

  const touch = event.touches[0];

  // 移動幽靈元素
  if (touchDragClone.value) {
    const cloneHeight = touchDragClone.value.offsetHeight;
    touchDragClone.value.style.top = `${touch.clientY - cloneHeight / 2}px`;
  }

  // 計算觸控位置對應的列表項
  const listEl = promptListRef.value;
  if (!listEl) return;

  const items = listEl.querySelectorAll(".prompt-item");
  let overIdx: number | null = null;
  items.forEach((item, idx) => {
    const rect = item.getBoundingClientRect();
    if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
      overIdx = idx;
    }
  });
  dragOverIndex.value = overIdx;
}

async function onTouchDragEnd() {
  window.removeEventListener("touchmove", onTouchDragMove);
  window.removeEventListener("touchend", onTouchDragEnd);
  window.removeEventListener("touchcancel", onTouchDragEnd);

  // 移除幽靈元素
  if (touchDragClone.value) {
    touchDragClone.value.remove();
    touchDragClone.value = null;
  }

  if (
    !touchDragging.value ||
    !draggedItem.value ||
    dragOverIndex.value === null
  ) {
    touchDragging.value = false;
    draggedItem.value = null;
    dragOverIndex.value = null;
    return;
  }

  const filteredToIndex = dragOverIndex.value;
  const targetEntry = filteredCurrentOrder.value[filteredToIndex];
  if (!targetEntry) {
    touchDragging.value = false;
    draggedItem.value = null;
    dragOverIndex.value = null;
    return;
  }
  const realToIndex = getRealIndex(targetEntry.identifier);

  if (touchDragFromIndex.value !== realToIndex) {
    if (selectedMode.value === "faceToFace") {
      await promptManagerStore.moveFaceToFacePrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.moveGroupChatPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.moveDiaryPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.moveSummaryPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "events") {
      await promptManagerStore.moveEventsPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.movePlurkPostPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.movePlurkCommentPrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    } else {
      await promptManagerStore.movePrompt(
        draggedItem.value.identifier,
        touchDragFromIndex.value,
        realToIndex,
      );
    }
  }

  touchDragging.value = false;
  draggedItem.value = null;
  dragOverIndex.value = null;
}

function cleanupTouchDrag() {
  if (touchLongPressTimer) {
    clearTimeout(touchLongPressTimer);
    touchLongPressTimer = null;
  }
  if (touchDragClone.value) {
    touchDragClone.value.remove();
    touchDragClone.value = null;
  }
  window.removeEventListener("touchmove", onTouchDragMove);
  window.removeEventListener("touchend", onTouchDragEnd);
  window.removeEventListener("touchcancel", onTouchDragEnd);
}

// 獲取過濾後項目在原始 currentOrder 中的真實索引
function getRealIndex(identifier: string): number {
  return currentOrder.value.findIndex((e) => e.identifier === identifier);
}

// 過濾列表的放下處理（將過濾索引映射回真實索引）
async function onDropFiltered(event: DragEvent, filteredToIndex: number) {
  event.preventDefault();
  const fromIndex = parseInt(event.dataTransfer?.getData("text/plain") || "-1");
  if (fromIndex === -1 || !draggedItem.value) {
    draggedItem.value = null;
    dragOverIndex.value = null;
    return;
  }

  // 獲取目標位置在原始列表中的真實索引
  const targetEntry = filteredCurrentOrder.value[filteredToIndex];
  if (!targetEntry) {
    draggedItem.value = null;
    dragOverIndex.value = null;
    return;
  }
  const realToIndex = getRealIndex(targetEntry.identifier);

  if (fromIndex !== realToIndex) {
    if (selectedMode.value === "faceToFace") {
      await promptManagerStore.moveFaceToFacePrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.moveGroupChatPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.moveDiaryPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.moveSummaryPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "events") {
      await promptManagerStore.moveEventsPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.movePlurkPostPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.movePlurkCommentPrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    } else {
      await promptManagerStore.movePrompt(
        draggedItem.value.identifier,
        fromIndex,
        realToIndex,
      );
    }
  }

  draggedItem.value = null;
  dragOverIndex.value = null;
}

// 編輯提示詞
function editPrompt(identifier: string) {
  const def = getPromptDef(identifier);
  if (def && (isGroupChatMode.value || isPromptEditable(def))) {
    editingPrompt.value = def;
    editingName.value = def.name;
    // adminOnly 模塊：非管理員看不到內容
    if (def.adminOnly && !adminStore.isAdmin) {
      editingContent.value = "";
    } else {
      editingContent.value = def.content;
    }
    editingRole.value = def.role;
    editingInjectionPosition.value = def.injection_position as 0 | 1;
    editingInjectionDepth.value = def.injection_depth;
    editingInjectionOrder.value = def.injection_order;
    editingAdminOnly.value = !!def.adminOnly;
  }
}

// 處理 prompt-item 點擊（用於打開特殊管理器）
function handlePromptItemClick(identifier: string) {
  // 書影記錄 - 打開管理器
  if (
    identifier === "mediaLogs" ||
    identifier === "f2fMediaLogs" ||
    identifier === "gcMediaLogs"
  ) {
    showMediaLogManager.value = true;
    return;
  }
  // 其他 marker 項目暫不處理
}

// 保存編輯
async function saveEdit() {
  if (editingPrompt.value) {
    if (selectedMode.value === "faceToFace") {
      await promptManagerStore.updateFaceToFacePrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.updateGroupChatPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.updateDiaryPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.updateSummaryPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "events") {
      await promptManagerStore.updateEventsPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.updatePlurkPostPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.updatePlurkCommentPrompt(
        editingPrompt.value.identifier,
        {
          name: editingName.value,
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
          adminOnly: editingAdminOnly.value,
        },
      );
    } else {
      await promptManagerStore.updatePrompt(editingPrompt.value.identifier, {
        name: editingName.value,
        content: editingContent.value,
        role: editingRole.value,
        injection_position: editingInjectionPosition.value,
        injection_depth: editingInjectionDepth.value,
        injection_order: editingInjectionOrder.value,
        adminOnly: editingAdminOnly.value,
      });
    }
    editingPrompt.value = null;
    editingName.value = "";
    editingContent.value = "";
  }
}

// 存入自訂模塊庫（可覆蓋同 identifier）
async function saveEditingPromptToLibrary() {
  if (!editingPrompt.value) return;
  const def = getPromptDef(editingPrompt.value.identifier);
  if (!def) return;
  await promptLibraryStore.upsert(def);
  alert(`已存入自訂模塊庫：${def.name}`);
}

// 取消編輯
function cancelEdit() {
  editingPrompt.value = null;
  editingContent.value = "";
  editingRole.value = "system";
  editingInjectionPosition.value = 0;
  editingInjectionDepth.value = 0;
  editingInjectionOrder.value = 0;
}

// 刪除提示詞
async function deletePrompt(identifier: string) {
  const def = getPromptDef(identifier);
  if (!def) return;
  if (isPromptDeletable(def)) {
    if (confirm(`確定要刪除「${def.name}」嗎？`)) {
      if (isGroupChatMode.value) {
        await promptManagerStore.deleteGroupChatPrompt(identifier);
      } else if (
        selectedMode.value === "faceToFace" ||
        selectedMode.value === "diary" ||
        selectedMode.value === "summary" ||
        selectedMode.value === "events" ||
        selectedMode.value === "plurkPost" ||
        selectedMode.value === "plurkComment"
      ) {
        await promptManagerStore.deletePromptForMode(
          identifier,
          selectedMode.value,
        );
      } else {
        await promptManagerStore.deletePrompt(identifier);
      }
    }
  }
}

// 新建提示詞
async function createNewPrompt() {
  if (newPromptName.value.trim()) {
    const promptData = {
      name: newPromptName.value.trim(),
      content: newPromptContent.value,
      role: newPromptRole.value,
      injection_position: newPromptInjectionPosition.value,
      injection_depth: newPromptInjectionDepth.value,
      injection_order: newPromptInjectionOrder.value,
    };

    const insertIndex = getNewPromptInsertIndex();
    const insertOptions = {
      insertIndex,
      enabled: true,
      systemPrompt: shouldCreateAsSystemPrompt.value,
    };

    if (isFaceToFaceMode.value) {
      await promptManagerStore.addFaceToFaceCustomPrompt(promptData, insertOptions);
    } else if (isGroupChatMode.value) {
      await promptManagerStore.addGroupChatCustomPrompt(promptData, insertOptions);
    } else {
      await promptManagerStore.addCustomPromptForMode(
        selectedMode.value,
        promptData,
        insertOptions,
      );
    }
    showNewPromptModal.value = false;
    newPromptName.value = "";
    newPromptContent.value = "";
    newPromptRole.value = "system";
    newPromptInjectionPosition.value = 0;
    newPromptInjectionDepth.value = 0;
    newPromptInjectionOrder.value = 100;
    newPromptInsertMode.value = "end";
    newPromptAnchorIdentifier.value = "";
  }
}

// 切換模式（全局/面對面/日記/總結/噗浪發文/噗浪評論/角色）
function selectMode(
  mode:
    | "global"
    | "faceToFace"
    | "groupChat"
    | "diary"
    | "summary"
    | "events"
    | "plurkPost"
    | "plurkComment"
    | string,
) {
  selectedMode.value = mode;
  if (mode === "global") {
    selectedCharacterId.value = null;
    promptManagerStore.setCurrentCharacter(null);
  } else if (
    mode === "faceToFace" ||
    mode === "groupChat" ||
    mode === "diary" ||
    mode === "summary" ||
    mode === "events" ||
    mode === "plurkPost" ||
    mode === "plurkComment"
  ) {
    selectedCharacterId.value = null;
    // 這些模式不需要設置角色
  } else {
    // 角色模式
    selectedCharacterId.value = mode;
    promptManagerStore.setCurrentCharacter(mode);
  }

  updateImportAnchorOnModeChange();
}

// 創建角色配置
async function createCharacterConfig() {
  if (selectedCharacterId.value) {
    await promptManagerStore.createCharacterConfig(selectedCharacterId.value);
  }
}

// 為指定角色添加配置並切換到該角色
async function addCharacterConfig(characterId: string) {
  await promptManagerStore.createCharacterConfig(characterId);
  selectMode(characterId);
  showAddCharacterMenu.value = false;
}

// 刪除角色配置
async function deleteCharacterConfig() {
  if (
    selectedCharacterId.value &&
    confirm("確定要刪除此角色的自訂配置嗎？將恢復使用全局設定。")
  ) {
    await promptManagerStore.deleteCharacterConfig(selectedCharacterId.value);
  }
}

// 重置當前模式為默認（只影響當前分頁，不會動到其他模式）
async function resetCurrentToDefault() {
  if (selectedMode.value === "faceToFace") {
    if (confirm("確定要重置「面對面模式」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetFaceToFaceToDefault();
    }
  } else if (selectedMode.value === "groupChat") {
    if (confirm("確定要重置「群聊模式」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetGroupChatToDefault();
    }
  } else if (selectedMode.value === "diary") {
    if (confirm("確定要重置「角色日記」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetDiaryToDefault();
    }
  } else if (selectedMode.value === "summary") {
    if (confirm("確定要重置「總結」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetSummaryToDefault();
    }
  } else if (selectedMode.value === "events") {
    if (confirm("確定要重置「重要事件」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetEventsToDefault();
    }
  } else if (selectedMode.value === "plurkPost") {
    if (confirm("確定要重置「噗浪發文」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetPlurkPostToDefault();
    }
  } else if (selectedMode.value === "plurkComment") {
    if (confirm("確定要重置「噗浪評論」的提示詞為預設嗎？\n（不會影響其他模式）")) {
      await promptManagerStore.resetPlurkCommentToDefault();
    }
  } else if (selectedCharacterId.value) {
    if (
      confirm(
        "確定要重置此角色的獨立提示詞配置為預設順序嗎？\n（只影響此角色，不會動到線上模式或其他模式）",
      )
    ) {
      await promptManagerStore.resetToDefault(selectedCharacterId.value);
    }
  } else {
    if (
      confirm(
        "確定要重置「線上模式」的提示詞為預設嗎？\n（只會重置線上模式的提示詞內容與順序，不會影響面對面、群聊、日記、總結、重要事件、噗浪等其他模式）",
      )
    ) {
      await promptManagerStore.resetToDefault();
    }
  }
}

// 當前模式的顯示名稱
function getCurrentModeLabel(): string {
  switch (selectedMode.value) {
    case "global":
      return "線上模式";
    case "faceToFace":
      return "面對面模式";
    case "groupChat":
      return "群聊模式";
    case "diary":
      return "角色日記";
    case "summary":
      return "總結";
    case "events":
      return "重要事件";
    case "plurkPost":
      return "噗浪發文";
    case "plurkComment":
      return "噗浪評論";
    default:
      return "當前模式";
  }
}

// 批量刪除當前模式的所有自訂模塊
async function deleteAllCustomInCurrentMode() {
  const modeKey =
    selectedMode.value === "global" ||
    selectedMode.value === "faceToFace" ||
    selectedMode.value === "groupChat" ||
    selectedMode.value === "diary" ||
    selectedMode.value === "summary" ||
    selectedMode.value === "events" ||
    selectedMode.value === "plurkPost" ||
    selectedMode.value === "plurkComment"
      ? selectedMode.value
      : "global";

  const label = getCurrentModeLabel();
  if (
    !confirm(
      `確定要刪除「${label}」下所有自訂模塊嗎？\n此操作不可撤銷（預設模塊不受影響，可由「恢復預設模塊」找回）。`,
    )
  ) {
    return;
  }
  const removed =
    await promptManagerStore.deleteAllCustomPromptsForMode(modeKey);
  alert(removed > 0 ? `已刪除 ${removed} 個自訂模塊。` : "沒有可刪除的自訂模塊。");
}

// 重置所有模式為默認
async function resetAllToDefault() {
  if (
    confirm(
      "確定要重置所有模式的提示詞為默認值嗎？這會重置全局、面對面、群聊、日記、總結、重要事件、噗浪等所有提示詞。",
    )
  ) {
    await promptManagerStore.resetAllToDefault();
  }
}

const exportScope = ref<"current" | "all" | "custom">("current");

watch(exportScope, (newScope) => {
  if (newScope === "current") {
    exportOptions.value = getDefaultExportOptionsForCurrentMode();
  } else if (newScope === "all") {
    exportOptions.value = {
      globalPrompts: true,
      globalOrder: true,
      faceToFace: true,
      diary: true,
      summary: true,
      events: true,
      plurkPost: true,
      plurkComment: true,
      groupChat: true,
      characterConfigs: true,
    };
  }
});

// 打開導出選擇模態框
function openExportModal() {
  exportScope.value = "current";
  exportOptions.value = getDefaultExportOptionsForCurrentMode();
  showExportModal.value = true;
}

const EXPORT_MODE_META: Record<string, { label: string; icon: string }> = {
  global: { label: "線上模式", icon: "💬" },
  faceToFace: { label: "面對面模式", icon: "🤝" },
  groupChat: { label: "群聊模式", icon: "👥" },
  diary: { label: "角色日記", icon: "📔" },
  summary: { label: "對話總結", icon: "📋" },
  events: { label: "重要事件", icon: "⭐" },
  plurkPost: { label: "噗浪發文", icon: "📝" },
  plurkComment: { label: "噗浪評論", icon: "💭" },
  characterConfigs: { label: "角色專屬配置", icon: "🎭" },
};

const currentExportModeKey = computed<string>(() => {
  switch (selectedMode.value) {
    case "global":
    case "faceToFace":
    case "groupChat":
    case "diary":
    case "summary":
    case "events":
    case "plurkPost":
    case "plurkComment":
      return selectedMode.value;
    default:
      return "characterConfigs";
  }
});

const currentExportModeLabel = computed(() => {
  const info = EXPORT_MODE_META[currentExportModeKey.value];
  return info ? `${info.icon} ${info.label}` : "目前模式";
});

const selectedExportCount = computed(() => {
  const opts = exportOptions.value;
  let count = 0;
  if (opts.globalPrompts || opts.globalOrder) count += 1;
  if (opts.faceToFace) count += 1;
  if (opts.groupChat) count += 1;
  if (opts.diary) count += 1;
  if (opts.summary) count += 1;
  if (opts.events) count += 1;
  if (opts.plurkPost) count += 1;
  if (opts.plurkComment) count += 1;
  if (opts.characterConfigs) count += 1;
  return count;
});

function selectOnlyCurrentMode() {
  exportOptions.value = getDefaultExportOptionsForCurrentMode();
}

function getDefaultExportOptionsForCurrentMode() {
  const baseOptions = {
    globalPrompts: false,
    globalOrder: false,
    faceToFace: false,
    diary: false,
    summary: false,
    events: false,
    plurkPost: false,
    plurkComment: false,
    groupChat: false,
    characterConfigs: false,
  };

  switch (selectedMode.value) {
    case "global":
      return {
        ...baseOptions,
        globalPrompts: true,
        globalOrder: true,
      };
    case "faceToFace":
      return {
        ...baseOptions,
        faceToFace: true,
      };
    case "groupChat":
      return {
        ...baseOptions,
        groupChat: true,
      };
    case "diary":
      return {
        ...baseOptions,
        diary: true,
      };
    case "summary":
      return {
        ...baseOptions,
        summary: true,
      };
    case "events":
      return {
        ...baseOptions,
        events: true,
      };
    case "plurkPost":
      return {
        ...baseOptions,
        plurkPost: true,
      };
    case "plurkComment":
      return {
        ...baseOptions,
        plurkComment: true,
      };
    default:
      return {
        ...baseOptions,
        characterConfigs: true,
      };
  }
}

function serializePromptContent(content: string): string {
  const normalized = content.replace(/\r\n/g, "\n");
  return JSON.stringify(normalized);
}

function dedupeById<T extends { identifier: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.identifier)) continue;
    seen.add(item.identifier);
    out.push(item);
  }
  return out;
}

function buildPromptDefinitionsBlock(
  prompts: PromptDefinition[],
  exportName: string,
): string[] {
  const lines: string[] = [];
  lines.push(`export const ${exportName}: PromptDefinition[] = [`);
  for (const prompt of dedupeById(prompts)) {
    lines.push("  {");
    lines.push(`    identifier: ${JSON.stringify(prompt.identifier)},`);
    lines.push(`    name: ${JSON.stringify(prompt.name)},`);
    lines.push(`    description: ${JSON.stringify(prompt.description || "")},`);
    lines.push(`    category: ${JSON.stringify(prompt.category)},`);
    lines.push(`    role: ${JSON.stringify(prompt.role)},`);
    lines.push(`    content: ${serializePromptContent(prompt.content)},`);
    lines.push(`    system_prompt: ${prompt.system_prompt},`);
    lines.push(`    marker: ${prompt.marker},`);
    const injPos =
      prompt.injection_position === 1
        ? "INJECTION_ABSOLUTE"
        : "INJECTION_RELATIVE";
    lines.push(`    injection_position: ${injPos},`);
    lines.push(`    injection_depth: ${prompt.injection_depth},`);
    lines.push(`    injection_order: ${prompt.injection_order},`);
    lines.push(`    forbid_overrides: ${prompt.forbid_overrides},`);
    lines.push(`    extension: ${prompt.extension},`);
    lines.push(
      `    injection_trigger: ${JSON.stringify(prompt.injection_trigger || [])},`,
    );
    lines.push(`    isEditable: ${prompt.isEditable},`);
    lines.push(`    isDeletable: ${prompt.isDeletable},`);
    if (typeof prompt.adminOnly === "boolean") {
      lines.push(`    adminOnly: ${prompt.adminOnly},`);
    }
    lines.push("  },");
  }
  lines.push("];");
  return lines;
}

function buildPromptOrderBlock(order: PromptOrderEntry[], exportName: string): string[] {
  const lines: string[] = [];
  lines.push(`export const ${exportName}: PromptOrderEntry[] = [`);
  for (const entry of dedupeById(order)) {
    lines.push(
      `  { identifier: ${JSON.stringify(entry.identifier)}, enabled: ${entry.enabled} },`,
    );
  }
  lines.push("];");
  return lines;
}

type TsExportFile = {
  path: string;
  fileName: string;
  content: string;
};

function buildChatTsFile(): TsExportFile {
  const config = promptManagerStore.config;
  const dedupedOrder = dedupeById(config.globalPromptOrder);
  const dedupedPrompts = dedupeById(config.prompts);
  const orderedPrompts = dedupedOrder
    .map((entry) => dedupedPrompts.find((p) => p.identifier === entry.identifier))
    .filter((p): p is PromptDefinition => p !== undefined);
  const orderedIds = new Set(dedupedOrder.map((e) => e.identifier));
  const extraPrompts = dedupedPrompts.filter((p) => !orderedIds.has(p.identifier));
  const allPrompts = [...orderedPrompts, ...extraPrompts];
  const lines: string[] = [
    "/**",
    " * 線上模式（主要聊天）默認提示詞",
    " * 包含：",
    " * - 系統防護和身份設定",
    " * - 核心規則（禁止讀心、平等互動等）",
    " * - 上下文注入（時間、天氣、遊戲等）",
    " * - 線上模式功能和格式",
    " * - 思考框架和輸出規則",
    " */",
    "",
    'import type { PromptDefinition, PromptOrderEntry } from "./types";',
    'import { INJECTION_ABSOLUTE, INJECTION_RELATIVE } from "./types";',
    "",
    "// ===== 主要聊天提示詞定義 =====",
    ...buildPromptDefinitionsBlock(allPrompts, "DEFAULT_PROMPT_DEFINITIONS"),
    "",
    "// ===== 主要聊天提示詞順序 =====",
    ...buildPromptOrderBlock(dedupedOrder, "DEFAULT_PROMPT_ORDER"),
    "",
    "// ===== 向後兼容別名 =====",
    "export {",
    "  DEFAULT_PROMPT_DEFINITIONS as CHAT_PROMPT_DEFINITIONS,",
    "  DEFAULT_PROMPT_ORDER as DEFAULT_CHAT_PROMPT_ORDER,",
    "};",
    "",
  ];

  return {
    path: "src/data/defaultPrompts/chat.ts",
    fileName: "chat.ts",
    content: lines.join("\n"),
  };
}

function getOrderedPrompts(
  prompts: PromptDefinition[],
  order: PromptOrderEntry[],
): PromptDefinition[] {
  const dedupedPrompts = dedupeById(prompts);
  const dedupedOrder = dedupeById(order);
  const orderedPrompts = dedupedOrder
    .map((entry) => dedupedPrompts.find((p) => p.identifier === entry.identifier))
    .filter((p): p is PromptDefinition => p !== undefined);
  const orderedIds = new Set(dedupedOrder.map((entry) => entry.identifier));
  const extraPrompts = dedupedPrompts.filter((p) => !orderedIds.has(p.identifier));
  return [...orderedPrompts, ...extraPrompts];
}

function getPromptExportPayload(
  prompts: PromptDefinition[],
  order: PromptOrderEntry[],
): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return {
    prompts: getOrderedPrompts(prompts, order),
    order: dedupeById(order),
  };
}

function getDiaryExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.diaryPrompts,
    promptManagerStore.diaryPromptOrder,
  );
}

function getSummaryExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.summaryPrompts,
    promptManagerStore.summaryPromptOrder,
  );
}

function getEventsExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.eventsPrompts,
    promptManagerStore.eventsPromptOrder,
  );
}

function getPlurkPostExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.plurkPostPrompts,
    promptManagerStore.plurkPostPromptOrder,
  );
}

function getPlurkCommentExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.plurkCommentPrompts,
    promptManagerStore.plurkCommentPromptOrder,
  );
}

function getFaceToFaceExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.faceToFacePrompts,
    promptManagerStore.faceToFacePromptOrder,
  );
}

function getGroupChatExportPayload(): {
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
} {
  return getPromptExportPayload(
    promptManagerStore.groupChatPrompts,
    promptManagerStore.groupChatPromptOrder,
  );
}

function buildModuleTsFile(options: {
  path: string;
  fileName: string;
  titleComment: string[];
  importStyle?: "localTypes" | "aliasTypes";
  definitionsTitle: string;
  orderTitle: string;
  definitionsExportName: string;
  orderExportName: string;
  prompts: PromptDefinition[];
  order: PromptOrderEntry[];
  aliases?: string[];
}): TsExportFile {
  const importStyle = options.importStyle ?? "localTypes";
  const lines: string[] = [];

  if (options.titleComment.length > 0) {
    lines.push("/**");
    for (const line of options.titleComment) {
      lines.push(` * ${line}`);
    }
    lines.push(" */");
    lines.push("");
  }

  if (importStyle === "aliasTypes") {
    lines.push('import type { PromptDefinition, PromptOrderEntry } from "@/types/promptManager";');
    lines.push("");
    lines.push("// 注入位置常量");
    lines.push("const INJECTION_RELATIVE = 0;");
    if (options.prompts.some((prompt) => prompt.injection_position === 1)) {
      lines.push("const INJECTION_ABSOLUTE = 1;");
    }
  } else {
    lines.push('import type { PromptDefinition, PromptOrderEntry } from "./types";');
    lines.push('import { INJECTION_ABSOLUTE, INJECTION_RELATIVE } from "./types";');
  }

  lines.push("");
  lines.push(`// ===== ${options.definitionsTitle} =====`);
  lines.push(...buildPromptDefinitionsBlock(options.prompts, options.definitionsExportName));
  lines.push("");
  lines.push(`// ===== ${options.orderTitle} =====`);
  lines.push(...buildPromptOrderBlock(options.order, options.orderExportName));

  if (options.aliases && options.aliases.length > 0) {
    lines.push("");
    lines.push("export {");
    for (const alias of options.aliases) {
      lines.push(`  ${alias},`);
    }
    lines.push("};");
  }

  lines.push("");

  return {
    path: options.path,
    fileName: options.fileName,
    content: lines.join("\n"),
  };
}

function getSelectedTsExportFiles(): TsExportFile[] {
  const config = promptManagerStore.config;
  const files: TsExportFile[] = [];

  if (exportOptions.value.globalPrompts || exportOptions.value.globalOrder) {
    files.push(buildChatTsFile());
  }

  if (exportOptions.value.diary) {
    const diaryExport = getDiaryExportPayload();
    files.push(
      buildModuleTsFile({
        path: "src/data/defaultPrompts/diary.ts",
        fileName: "diary.ts",
        titleComment: ["日記系統提示詞定義"],
        definitionsTitle: "日記提示詞定義",
        orderTitle: "日記提示詞順序",
        definitionsExportName: "DIARY_PROMPT_DEFINITIONS",
        orderExportName: "DEFAULT_DIARY_PROMPT_ORDER",
        prompts: diaryExport.prompts,
        order: diaryExport.order,
      }),
    );
  }

  if (exportOptions.value.summary) {
    const summaryExport = getSummaryExportPayload();
    files.push(
      buildModuleTsFile({
        path: "src/data/defaultPrompts/summary.ts",
        fileName: "summary.ts",
        titleComment: ["總結系統提示詞定義"],
        definitionsTitle: "總結提示詞定義",
        orderTitle: "總結提示詞順序",
        definitionsExportName: "SUMMARY_PROMPT_DEFINITIONS",
        orderExportName: "DEFAULT_SUMMARY_PROMPT_ORDER",
        prompts: summaryExport.prompts,
        order: summaryExport.order,
      }),
    );
  }

  if (exportOptions.value.events) {
    const eventsExport = getEventsExportPayload();
    files.push(
      buildModuleTsFile({
        path: "src/data/defaultPrompts/events.ts",
        fileName: "events.ts",
        titleComment: ["重要事件提取提示詞定義"],
        definitionsTitle: "重要事件提示詞定義",
        orderTitle: "重要事件提示詞順序",
        definitionsExportName: "IMPORTANT_EVENTS_PROMPT_DEFINITIONS",
        orderExportName: "DEFAULT_IMPORTANT_EVENTS_PROMPT_ORDER",
        prompts: eventsExport.prompts,
        order: eventsExport.order,
      }),
    );
  }

  if (exportOptions.value.plurkPost || exportOptions.value.plurkComment) {
    const plurkPostExport = getPlurkPostExportPayload();
    const plurkCommentExport = getPlurkCommentExportPayload();
    const lines: string[] = [
      "/**",
      " * 噗浪相關提示詞定義（發文 + 評論）",
      " */",
      "",
      'import type { PromptDefinition, PromptOrderEntry } from "./types";',
      "import { INJECTION_RELATIVE } from \"./types\";",
      "",
      "// ===== 噗浪發文提示詞定義 =====",
      ...buildPromptDefinitionsBlock(
        plurkPostExport.prompts,
        "PLURK_POST_PROMPT_DEFINITIONS",
      ),
      "",
      "// ===== 噗浪發文提示詞順序 =====",
      ...buildPromptOrderBlock(
        plurkPostExport.order,
        "DEFAULT_PLURK_POST_PROMPT_ORDER",
      ),
      "",
      "// ===== 噗浪評論提示詞定義 =====",
      ...buildPromptDefinitionsBlock(
        plurkCommentExport.prompts,
        "PLURK_COMMENT_PROMPT_DEFINITIONS",
      ),
      "",
      "// ===== 噗浪評論提示詞順序 =====",
      ...buildPromptOrderBlock(
        plurkCommentExport.order,
        "DEFAULT_PLURK_COMMENT_PROMPT_ORDER",
      ),
      "",
    ];

    files.push({
      path: "src/data/defaultPrompts/plurk.ts",
      fileName: "plurk.ts",
      content: lines.join("\n"),
    });
  }

  if (exportOptions.value.faceToFace) {
    const faceToFaceExport = getFaceToFaceExportPayload();
    files.push(
      buildModuleTsFile({
        path: "src/data/faceToFacePrompts.ts",
        fileName: "faceToFacePrompts.ts",
        titleComment: [
          "面對面模式提示詞定義",
          "從導出模組生成",
        ],
        importStyle: "aliasTypes",
        definitionsTitle: "面對面模式提示詞定義",
        orderTitle: "面對面模式提示詞順序",
        definitionsExportName: "FACE_TO_FACE_PROMPT_DEFINITIONS",
        orderExportName: "DEFAULT_FACE_TO_FACE_PROMPT_ORDER",
        prompts: faceToFaceExport.prompts,
        order: faceToFaceExport.order,
      }),
    );
  }

  if (exportOptions.value.groupChat) {
    const groupChatExport = getGroupChatExportPayload();
    files.push(
      buildModuleTsFile({
        path: "src/data/groupChatPrompts.ts",
        fileName: "groupChatPrompts.ts",
        titleComment: [
          "群聊模式提示詞定義",
          "群聊專屬提示詞：導演系統、成員列表、XML 格式規範、互動規則",
        ],
        importStyle: "aliasTypes",
        definitionsTitle: "群聊模式提示詞定義",
        orderTitle: "群聊模式提示詞順序",
        definitionsExportName: "GROUP_CHAT_PROMPT_DEFINITIONS",
        orderExportName: "DEFAULT_GROUP_CHAT_PROMPT_ORDER",
        prompts: groupChatExport.prompts,
        order: groupChatExport.order,
      }),
    );
  }

  return files;
}

// 執行導出
function doExport() {
  if (exportFormat.value === "typescript") {
    const files = getSelectedTsExportFiles();
    const code =
      files.length === 1
        ? files[0].content
        : files
            .map(
              (file) =>
                `// ===== FILE: ${file.path} =====\n\n${file.content}`,
            )
            .join("\n\n");
    const downloadName = `prompt-export-${Date.now()}.txt`;
    const successMessage =
      files.length === 1
        ? `可替換 ${files[0].path} 的文字內容已複製到剪貼簿！`
        : "多個可替換檔案的文字內容已複製到剪貼簿！已依檔案分段標示。";

    if (files.length === 0) {
      alert("請先勾選至少一個要導出的模組。");
      return;
    }

    navigator.clipboard
      .writeText(code)
      .then(() => {
        alert(successMessage);
        showExportModal.value = false;
      })
      .catch(() => {
        const blob = new Blob([code], {
          type: "text/plain",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        a.click();
        URL.revokeObjectURL(url);
        alert(`已下載 ${downloadName} 檔案！可直接打開複製替換內容。`);
        showExportModal.value = false;
      });
    return;
  }

  const config = promptManagerStore.config;
  const exportData: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
  };

  // 根據選擇添加數據
  const dedupedGlobalOrder = dedupeById(config.globalPromptOrder);
  const dedupedGlobalPrompts = dedupeById(config.prompts);
  if (exportOptions.value.globalPrompts) {
    // 按照 globalPromptOrder 的順序排列 prompts
    const orderedPrompts = dedupedGlobalOrder
      .map((entry) =>
        dedupedGlobalPrompts.find((p) => p.identifier === entry.identifier),
      )
      .filter((p): p is (typeof config.prompts)[0] => p !== undefined);
    // 添加不在順序中的提示詞（如果有的話）
    const orderedIds = new Set(
      dedupedGlobalOrder.map((e) => e.identifier),
    );
    const extraPrompts = dedupedGlobalPrompts.filter(
      (p) => !orderedIds.has(p.identifier),
    );
    exportData.prompts = [...orderedPrompts, ...extraPrompts];
  }
  if (exportOptions.value.globalOrder) {
    exportData.globalPromptOrder = dedupedGlobalOrder;
  }
  if (exportOptions.value.faceToFace) {
    const faceToFaceExport = getFaceToFaceExportPayload();
    exportData.faceToFacePrompts = faceToFaceExport.prompts;
    exportData.faceToFacePromptOrder = faceToFaceExport.order;
  }
  if (exportOptions.value.diary) {
    const diaryExport = getDiaryExportPayload();
    exportData.diaryPrompts = diaryExport.prompts;
    exportData.diaryPromptOrder = diaryExport.order;
  }
  if (exportOptions.value.summary) {
    const summaryExport = getSummaryExportPayload();
    exportData.summaryPrompts = summaryExport.prompts;
    exportData.summaryPromptOrder = summaryExport.order;
  }
  if (exportOptions.value.events) {
    const eventsExport = getEventsExportPayload();
    exportData.eventsPrompts = eventsExport.prompts;
    exportData.eventsPromptOrder = eventsExport.order;
  }
  if (exportOptions.value.plurkPost) {
    const plurkPostExport = getPlurkPostExportPayload();
    exportData.plurkPostPrompts = plurkPostExport.prompts;
    exportData.plurkPostPromptOrder = plurkPostExport.order;
  }
  if (exportOptions.value.plurkComment) {
    const plurkCommentExport = getPlurkCommentExportPayload();
    exportData.plurkCommentPrompts = plurkCommentExport.prompts;
    exportData.plurkCommentPromptOrder = plurkCommentExport.order;
  }
  if (exportOptions.value.groupChat) {
    const groupChatExport = getGroupChatExportPayload();
    exportData.groupChatPrompts = groupChatExport.prompts;
    exportData.groupChatPromptOrder = groupChatExport.order;
  }
  if (exportOptions.value.characterConfigs) {
    exportData.characterConfigs = config.characterConfigs;
  }

  const json = JSON.stringify(exportData, null, 2);

  // 複製到剪貼簿
  navigator.clipboard
    .writeText(json)
    .then(() => {
      alert("提示詞配置已複製到剪貼簿！");
      showExportModal.value = false;
    })
    .catch(() => {
      // 降級方案：下載檔案
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prompt-config-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert("已下載提示詞配置檔案！");
      showExportModal.value = false;
    });
}

// 全選/取消全選導出選項
function toggleAllExportOptions(selectAll: boolean) {
  exportOptions.value = {
    globalPrompts: selectAll,
    globalOrder: selectAll,
    faceToFace: selectAll,
    diary: selectAll,
    summary: selectAll,
    events: selectAll,
    plurkPost: selectAll,
    plurkComment: selectAll,
    groupChat: selectAll,
    characterConfigs: selectAll,
  };
}

async function convertAllCustomPromptsToSystem() {
  const updated = await promptManagerStore.convertAllCustomPromptsToSystem();
  if (updated > 0) {
    alert(`已將 ${updated} 個自訂條目轉為系統。`);
  }
}

// 管理員登入
async function adminLogin() {
  adminLoginError.value = "";
  const success = await adminStore.login(adminPassword.value);
  if (success) {
    showAdminLoginModal.value = false;
    adminPassword.value = "";
  } else {
    adminLoginError.value = "密碼錯誤";
  }
}

// 管理員登出
async function adminLogout() {
  await adminStore.logout();
}

// 管理員按鈕點擊
function handleAdminClick() {
  if (adminStore.isAdmin) {
    adminLogout();
  } else {
    showAdminLoginModal.value = true;
    adminPassword.value = "";
    adminLoginError.value = "";
  }
}

// 添加預設模塊
async function addPresetModule(def: PromptDefinition) {
  await promptManagerStore.restorePresetModule(def, selectedMode.value);
  showPresetPicker.value = false;
}

// 返回
function handleBack() {
  emit("back");
}

// 初始化
onMounted(async () => {
  await promptManagerStore.loadConfig();
  await promptLibraryStore.load();
  await charactersStore.loadCharacters();
  await adminStore.loadAdminState();
});

onUnmounted(() => {
  cleanupTouchDrag();
});

// 監聽角色變化
watch(selectedCharacterId, (charId) => {
  if (selectedMode.value !== "diary") {
    promptManagerStore.setCurrentCharacter(charId);
  }
});

watch(currentOrderChoices, () => {
  updateImportAnchorOnModeChange();
});

watch(importInsertMode, (mode) => {
  if ((mode === "before" || mode === "after") && !importAnchorIdentifier.value) {
    importAnchorIdentifier.value = currentOrderChoices.value[0]?.identifier || "";
  }
});

watch(newPromptInsertMode, (mode) => {
  if ((mode === "before" || mode === "after") && !newPromptAnchorIdentifier.value) {
    newPromptAnchorIdentifier.value = currentOrderChoices.value[0]?.identifier || "";
  }
});
</script>

<template>
  <div class="screen-container prompt-manager-screen">
    <!-- 標題欄 -->
    <header class="pm-header">
      <button class="header-back" @click="handleBack">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <h1 class="header-title">提示詞管理</h1>

      <!-- 桌面端：完整 actions；移動端：收合到 overflow menu -->
      <div class="header-actions" aria-label="提示詞管理：操作">
        <div class="header-actions-main" aria-label="主要操作">
          <button
            class="header-btn"
            :class="{ 'admin-active': adminStore.isAdmin }"
            :title="adminStore.isAdmin ? '登出管理員' : '管理員登入'"
            @click="handleAdminClick"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
              />
            </svg>
          </button>
          <button
            class="header-btn"
            title="自訂模塊庫"
            @click="showPromptLibraryModal = true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M20 6H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10zM6 10h4v2H6v-2zm0 4h8v2H6v-2z"
              />
            </svg>
          </button>
          <button
            class="header-btn"
            title="新增自定義模塊"
            @click="showNewPromptModal = true"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>

        <details class="header-actions-more">
          <summary class="header-btn" title="更多操作" aria-label="更多操作">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
              />
            </svg>
          </summary>

          <div class="header-actions-menu" role="menu">
            <button
              class="header-menu-item"
              role="menuitem"
              title="導入條目"
              @click="openImportPicker"
            >
              導入條目
            </button>

            <button
              v-if="adminStore.isAdmin"
              class="header-menu-item"
              role="menuitem"
              title="導出配置"
              @click="openExportModal"
            >
              導出配置
            </button>

            <button
              v-if="availablePresets.length > 0"
              class="header-menu-item"
              role="menuitem"
              title="恢復預設模塊"
              @click="showPresetPicker = true"
            >
              恢復預設模塊
            </button>

            <div class="header-menu-divider" role="separator"></div>

            <div class="header-menu-group">
              <div class="header-menu-group-title">
                當前模式 ({{ getCurrentModeLabel() }})
              </div>
              <div class="header-menu-group-content">
                <button
                  class="header-menu-item"
                  role="menuitem"
                  :title="`重置當前模式（${getCurrentModeLabel()}）為預設`"
                  @click="resetCurrentToDefault"
                >
                  重置為預設
                </button>
                <button
                  class="header-menu-item danger"
                  role="menuitem"
                  :title="`刪除「${getCurrentModeLabel()}」所有自訂模塊`"
                  @click="deleteAllCustomInCurrentMode"
                >
                  刪除所有自訂模塊
                </button>
              </div>
            </div>

            <template v-if="adminStore.isAdmin">
              <div class="header-menu-divider" role="separator"></div>
              <div class="header-menu-group">
                <div class="header-menu-group-title">系統管理</div>
                <div class="header-menu-group-content">
                  <button
                    class="header-menu-item"
                    role="menuitem"
                    title="將所有模式的自訂條目轉成系統"
                    @click="convertAllCustomPromptsToSystem"
                  >
                    全部自訂轉系統
                  </button>
                </div>
              </div>
            </template>

            <div class="header-menu-divider" role="separator"></div>

            <div class="header-menu-group">
              <div class="header-menu-group-title">全部模式</div>
              <div class="header-menu-group-content">
                <button
                  class="header-menu-item danger"
                  role="menuitem"
                  title="重置所有模式的提示詞為預設"
                  @click="resetAllToDefault"
                >
                  重置所有模式
                </button>
              </div>
            </div>
          </div>
        </details>
      </div>
    </header>

    <input
      ref="importFileInput"
      type="file"
      accept="application/json,.json"
      class="hidden-file-input"
      @change="handleImportFileChange"
    />

    <!-- 角色選擇器 -->
    <div class="character-selector">
      <button
        class="char-tab"
        :class="{ active: selectedMode === 'global' }"
        @click="selectMode('global')"
      >
        線上模式
      </button>
      <button
        class="char-tab face-to-face-tab"
        :class="{ active: selectedMode === 'faceToFace' }"
        @click="selectMode('faceToFace')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
          />
        </svg>
        面對面模式
      </button>
      <button
        class="char-tab group-chat-tab"
        :class="{ active: selectedMode === 'groupChat' }"
        @click="selectMode('groupChat')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
          />
        </svg>
        群聊模式
      </button>
      <button
        class="char-tab diary-tab"
        :class="{ active: selectedMode === 'diary' }"
        @click="selectMode('diary')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
          />
        </svg>
        角色日記
      </button>
      <button
        class="char-tab summary-tab"
        :class="{ active: selectedMode === 'summary' }"
        @click="selectMode('summary')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
          />
        </svg>
        對話總結
      </button>
      <button
        class="char-tab events-tab"
        :class="{ active: selectedMode === 'events' }"
        @click="selectMode('events')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
          />
        </svg>
        重要事件
      </button>
      <button
        class="char-tab plurk-post-tab"
        :class="{ active: selectedMode === 'plurkPost' }"
        @click="selectMode('plurkPost')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
          />
        </svg>
        噗浪發文
      </button>
      <button
        class="char-tab plurk-comment-tab"
        :class="{ active: selectedMode === 'plurkComment' }"
        @click="selectMode('plurkComment')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
          <path
            d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
          />
        </svg>
        噗浪評論
      </button>
      <div class="char-tabs-scroll">
        <!-- 只顯示已有自訂配置的角色 -->
        <button
          v-for="char in configuredCharacters"
          :key="char.id"
          class="char-tab"
          :class="{ active: selectedMode === char.id }"
          @click="selectMode(char.id)"
        >
          {{ char.nickname || char.data.name }}
        </button>
        <!-- 添加角色配置按鈕 -->
        <div
          v-if="characters.length > 0"
          class="add-char-wrapper"
          ref="addCharBtnRef"
        >
          <button
            class="char-tab add-char-btn"
            @click="toggleAddCharacterMenu"
            title="添加角色配置"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="tab-icon">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 角色選擇下拉選單 (Teleport 到 body) -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAddCharacterMenu"
          class="add-char-menu-overlay"
          @click="showAddCharacterMenu = false"
        >
          <div class="add-char-menu" :style="addCharMenuStyle" @click.stop>
            <div class="menu-header">選擇角色</div>
            <template v-if="unconfiguredCharacters.length > 0">
              <button
                v-for="char in unconfiguredCharacters"
                :key="char.id"
                class="menu-item"
                @click="addCharacterConfig(char.id)"
              >
                {{ char.nickname || char.data.name }}
              </button>
            </template>
            <div v-else class="menu-empty">所有角色都已配置</div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 面對面模式說明 -->
    <div v-if="isFaceToFaceMode" class="mode-info face-to-face-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
        />
      </svg>
      <span>這些提示詞用於面對面模式聊天時，取代線上模式的提示詞</span>
    </div>

    <!-- 群聊模式說明 -->
    <div v-if="isGroupChatMode" class="mode-info group-chat-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58C.48 14.9 0 15.62 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85-.85-.37-1.79-.58-2.78-.58-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"
        />
      </svg>
      <span>這些提示詞用於群聊模式，AI 同時扮演多個角色進行群組對話</span>
    </div>

    <!-- 日記模式說明 -->
    <div v-if="isDiaryMode" class="mode-info diary-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"
        />
      </svg>
      <span>這些提示詞用於 AI 自動生成角色日記時</span>
    </div>

    <!-- 總結模式說明 -->
    <div v-if="isSummaryMode" class="mode-info summary-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"
        />
      </svg>
      <span>這些提示詞用於 AI 自動總結對話內容時</span>
    </div>

    <!-- 重要事件模式說明 -->
    <div v-if="isEventsMode" class="mode-info events-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
        />
      </svg>
      <span>這些提示詞用於 AI 從對話中提取重要事件時</span>
    </div>

    <!-- 噗浪發文模式說明 -->
    <div v-if="isPlurkPostMode" class="mode-info plurk-post-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"
        />
      </svg>
      <span>這些提示詞用於 AI 角色自動發布噗浪動態時</span>
    </div>

    <!-- 噗浪評論模式說明 -->
    <div v-if="isPlurkCommentMode" class="mode-info plurk-comment-mode-info">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"
        />
      </svg>
      <span>這些提示詞用於 AI 角色自動回覆噗浪評論時</span>
    </div>

    <!-- 角色配置狀態 -->
    <div
      v-if="
        selectedCharacterId && !isDiaryMode && !isSummaryMode && !isEventsMode
      "
      class="config-status"
    >
      <template v-if="isUsingCharacterConfig">
        <span class="status-badge custom">使用自訂配置</span>
        <button class="text-btn danger" @click="deleteCharacterConfig">
          恢復線上模式
        </button>
      </template>
      <template v-else>
        <span class="status-badge global">使用線上模式配置</span>
        <button class="text-btn primary" @click="createCharacterConfig">
          創建自訂配置
        </button>
      </template>
    </div>

    <!-- 提示詞列表 -->
    <main class="pm-content" data-no-swipe-back>
      <div ref="promptListRef" class="prompt-list">
        <div
          v-for="(entry, filteredIndex) in filteredCurrentOrder"
          :key="entry.identifier"
          class="prompt-item"
          :class="{
            disabled: !entry.enabled,
            'drag-over': dragOverIndex === filteredIndex,
            dragging: draggedItem?.identifier === entry.identifier,
            'touch-dragging':
              touchDragging && draggedItem?.identifier === entry.identifier,
            clickable:
              entry.identifier === 'mediaLogs' ||
              entry.identifier === 'f2fMediaLogs' ||
              entry.identifier === 'gcMediaLogs',
          }"
          draggable="true"
          @dragstart="
            onDragStart($event, entry, getRealIndex(entry.identifier))
          "
          @dragover="onDragOver($event, filteredIndex)"
          @dragleave="onDragLeave"
          @drop="onDropFiltered($event, filteredIndex)"
          @dragend="onDragEnd"
          @click="handlePromptItemClick(entry.identifier)"
        >
          <!-- 拖拽手柄 -->
          <span
            class="drag-handle"
            @touchstart.prevent="onTouchStart($event, entry, filteredIndex)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path
                d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"
              />
            </svg>
          </span>

          <!-- 圖標 -->
          <span class="prompt-icon">{{ getPromptIcon(entry.identifier) }}</span>

          <!-- 資訊區塊（名稱與標籤） -->
          <div class="prompt-info">
            <!-- 名稱 -->
            <span class="prompt-name">{{ getPromptName(entry.identifier) }}</span>

            <!-- 標籤列表 -->
            <div class="prompt-tags">
              <span
                v-if="getPromptDef(entry.identifier)?.marker"
                class="prompt-tag marker"
                >Marker</span
              >
              <span
                v-else-if="getPromptDef(entry.identifier)?.system_prompt"
                class="prompt-tag system"
                >系統</span
              >
              <span v-else class="prompt-tag custom">自訂</span>

              <!-- 角色標籤 -->
              <span
                v-if="getRoleLabel(entry.identifier)"
                class="prompt-tag"
                :class="getRoleLabel(entry.identifier)!.class"
              >
                {{ getRoleLabel(entry.identifier)!.text }}
              </span>

              <!-- 位置標籤 -->
              <span
                v-if="getPositionLabel(entry.identifier)"
                class="prompt-tag"
                :class="getPositionLabel(entry.identifier)!.class"
              >
                {{ getPositionLabel(entry.identifier)!.text }}
              </span>
            </div>
          </div>

          <!-- 操作按鈕 -->
          <div class="prompt-actions">
            <!-- 鎖定標記（adminOnly 模塊） -->
            <span
              v-if="getPromptDef(entry.identifier)?.adminOnly"
              class="admin-lock-icon"
              title="管理員專屬"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                />
              </svg>
            </span>

            <!-- 編輯 -->
            <button
              v-if="
                getPromptDef(entry.identifier) &&
                (isGroupChatMode ||
                  isPromptEditable(getPromptDef(entry.identifier)!))
              "
              class="action-btn edit"
              title="編輯"
              @click.stop="editPrompt(entry.identifier)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                />
              </svg>
            </button>

            <!-- 刪除 -->
            <button
              v-if="
                getPromptDef(entry.identifier) &&
                isPromptDeletable(getPromptDef(entry.identifier)!)
              "
              class="action-btn delete"
              title="刪除"
              @click.stop="deletePrompt(entry.identifier)"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                />
              </svg>
            </button>

            <!-- 啟用/禁用開關 -->
            <label
              v-if="
                getPromptDef(entry.identifier) &&
                isPromptToggleable(getPromptDef(entry.identifier)!)
              "
              class="toggle-switch"
              @click.stop
            >
              <input
                type="checkbox"
                :checked="entry.enabled"
                @change="toggleEnabled(entry.identifier)"
              />
              <span class="slider"></span>
            </label>
          </div>
        </div>
      </div>
    </main>

    <!-- 編輯模態框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="editingPrompt" class="modal-overlay" @click="cancelEdit">
          <div class="modal modal-lg" @click.stop>
            <div class="modal-header">
              <h3>編輯提示詞</h3>
              <button class="close-btn" @click="cancelEdit">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <!-- 名稱編輯 -->
              <div class="form-group">
                <label class="form-label">名稱</label>
                <input
                  v-model="editingName"
                  type="text"
                  class="input-field"
                  placeholder="輸入提示詞名稱..."
                />
              </div>
              <!-- 內容編輯 -->
              <div class="form-group">
                <label class="form-label">內容</label>
                <div
                  v-if="editingPrompt.adminOnly && !adminStore.isAdmin"
                  class="admin-locked-content"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    class="lock-icon"
                  >
                    <path
                      d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"
                    />
                  </svg>
                  <span>需要管理員權限才能查看內容</span>
                </div>
                <template v-else>
                  <textarea
                    v-model="editingContent"
                    class="edit-textarea"
                    rows="8"
                    placeholder="輸入提示詞內容..."
                  ></textarea>
                  <p class="help-text" v-pre>
                    支援宏：{{ char }}、{{ user }}、{{ personality }} 等
                  </p>
                </template>
              </div>

              <!-- 進階設定（非管理員查看 adminOnly 時隱藏） -->
              <div
                v-if="!editingPrompt.adminOnly || adminStore.isAdmin"
                class="advanced-settings"
              >
                <div class="settings-title">進階設定</div>

                <!-- 角色選擇 -->
                <div class="form-group">
                  <label class="form-label">
                    角色
                    <span class="label-hint">AI 如何理解這條訊息</span>
                  </label>
                  <select v-model="editingRole" class="select-field">
                    <option value="system">系統 - 行為準則和背景設定</option>
                    <option value="user">使用者 - AI 認為是人類說的話</option>
                    <option value="assistant">
                      AI 助手 - AI 認為是自己說過的話
                    </option>
                  </select>
                </div>

                <!-- 注入位置 -->
                <div class="form-group">
                  <label class="form-label">
                    注入位置
                    <span class="label-hint">提示詞放置的位置</span>
                  </label>
                  <div class="radio-group horizontal">
                    <label
                      class="radio-option compact"
                      :class="{ active: editingInjectionPosition === 0 }"
                    >
                      <input
                        type="radio"
                        v-model="editingInjectionPosition"
                        :value="0"
                      />
                      <span class="radio-content">
                        <span class="radio-title">相對位置</span>
                        <span class="radio-desc">按順序排列</span>
                      </span>
                    </label>
                    <label
                      class="radio-option compact"
                      :class="{ active: editingInjectionPosition === 1 }"
                    >
                      <input
                        type="radio"
                        v-model="editingInjectionPosition"
                        :value="1"
                      />
                      <span class="radio-content">
                        <span class="radio-title">聊天中</span>
                        <span class="radio-desc">插入聊天歷史</span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- 深度設定（僅聊天中位置顯示） -->
                <Transition name="slide">
                  <div
                    v-if="editingInjectionPosition === 1"
                    class="form-group depth-settings"
                  >
                    <div class="depth-row">
                      <div class="depth-field">
                        <label class="form-label-sm">深度</label>
                        <input
                          type="number"
                          v-model.number="editingInjectionDepth"
                          min="0"
                          max="100"
                          class="number-input"
                        />
                        <span class="field-hint">0 = 最接近 AI 回覆</span>
                      </div>
                      <div class="depth-field">
                        <label class="form-label-sm">優先級</label>
                        <input
                          type="number"
                          v-model.number="editingInjectionOrder"
                          min="0"
                          max="1000"
                          class="number-input"
                        />
                        <span class="field-hint">數字越小越先插入</span>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="cancelEdit">取消</button>
              <button
                v-if="adminStore.isAdmin"
                class="btn secondary"
                :class="{ 'btn-locked': editingAdminOnly }"
                @click="editingAdminOnly = !editingAdminOnly"
                :title="editingAdminOnly ? '點擊解鎖（取消管理員專屬）' : '點擊鎖定（設為管理員專屬）'"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" style="width: 16px; height: 16px; vertical-align: middle; margin-right: 4px;">
                  <path v-if="editingAdminOnly" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
                  <path v-else d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm0 12H6V10h12v10z" />
                </svg>
                {{ editingAdminOnly ? '已鎖定' : '未鎖定' }}
              </button>
              <button
                v-if="!editingPrompt.adminOnly || adminStore.isAdmin"
                class="btn secondary"
                @click="saveEditingPromptToLibrary"
              >
                存回自訂庫
              </button>
              <button
                v-if="!editingPrompt.adminOnly || adminStore.isAdmin"
                class="btn primary"
                @click="saveEdit"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 導入條目 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showImportModal"
          class="modal-overlay"
          @click="showImportModal = false"
        >
          <div class="modal modal-lg import-modal" @click.stop>
            <div class="modal-header">
              <h3>導入條目</h3>
              <button class="close-btn" @click="showImportModal = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body import-modal-body">
              <div class="import-toolbar">
                <div class="import-source">
                  <div class="section-title">來源檔案</div>
                  <div class="import-source-name">
                    {{ importSourceFileName || "尚未選擇檔案" }}
                  </div>
                </div>
                <div class="import-toolbar-actions">
                  <button class="text-btn primary" @click="openImportPicker">
                    重新選擇檔案
                  </button>
                  <button
                    class="text-btn"
                    @click="toggleSelectAllImported(true)"
                  >
                    全選
                  </button>
                  <button
                    class="text-btn"
                    @click="toggleSelectAllImported(false)"
                  >
                    取消全選
                  </button>
                </div>
              </div>

              <div v-if="importErrorMessage" class="import-message error">
                {{ importErrorMessage }}
              </div>
              <div v-else-if="importStatusMessage" class="import-message success">
                {{ importStatusMessage }}
              </div>

              <div v-if="importedPromptItems.length === 0" class="empty-state">
                請先選擇酒館預設 JSON，解析後即可從這裡多選並插入到目前模式。
              </div>
              <div v-else class="import-layout">
                <div class="import-list">
                  <label
                    v-for="item in importedPromptItems"
                    :key="item.sourceIdentifier"
                    class="import-item"
                    :class="{
                      recommended: isImportedPromptRecommended(item),
                      inserted: importedInCurrentSession.includes(item.sourceIdentifier),
                    }"
                  >
                    <input
                      v-model="selectedImportedPromptIds"
                      type="checkbox"
                      :value="item.sourceIdentifier"
                    />
                    <div class="import-item-main">
                      <div class="import-item-header">
                        <span class="import-item-name">{{ item.name }}</span>
                        <span class="import-badge type">{{ getImportedPromptType(item) }}</span>
                        <span class="import-badge role">{{ item.role }}</span>
                        <span v-if="item.enabled" class="import-badge enabled">啟用</span>
                        <span
                          v-if="importedInCurrentSession.includes(item.sourceIdentifier)"
                          class="import-badge inserted"
                        >
                          已插入
                        </span>
                      </div>
                      <div class="import-item-meta">
                        {{ item.sourceIdentifier }}
                      </div>
                      <div class="import-item-preview">
                        {{ item.content || "此條目沒有固定內容。" }}
                      </div>
                    </div>
                  </label>
                </div>

                <div class="import-side-panel">
                  <div class="section-title">插入設定</div>
                  <div class="form-group">
                    <label class="form-label">目前模式</label>
                    <div class="import-current-mode">{{ selectedMode === "global" ? "線上模式" : selectedMode }}</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">已選條目</label>
                    <div class="import-selection-count">{{ selectedImportedPromptCount }} 個</div>
                  </div>
                  <div class="form-group">
                    <label class="form-label">插入位置</label>
                    <select v-model="importInsertMode" class="select-field">
                      <option value="start">插到最前面</option>
                      <option value="end">插到最後面</option>
                      <option value="before" :disabled="currentOrderChoices.length === 0">
                        插到某條目前面
                      </option>
                      <option value="after" :disabled="currentOrderChoices.length === 0">
                        插到某條目後面
                      </option>
                    </select>
                  </div>
                  <div
                    v-if="importInsertMode === 'before' || importInsertMode === 'after'"
                    class="form-group"
                  >
                    <label class="form-label">參考條目</label>
                    <select v-model="importAnchorIdentifier" class="select-field">
                      <option disabled value="">請選擇條目</option>
                      <option
                        v-for="item in currentOrderChoices"
                        :key="item.identifier"
                        :value="item.identifier"
                      >
                        {{ item.name }}
                      </option>
                    </select>
                  </div>
                  <div class="import-tip">
                    插入後會留在這個彈窗，你可以繼續挑選其他條目再插入。
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showImportModal = false">
                關閉
              </button>
              <button class="btn secondary" @click="clearImportState">
                清空
              </button>
              <button
                class="btn primary"
                :disabled="!canSubmitImportedPrompts"
                @click="insertSelectedImportedPrompts"
              >
                插入到目前模式
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 新建模態框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showNewPromptModal"
          class="modal-overlay"
          @click="showNewPromptModal = false"
        >
          <div class="modal modal-lg" @click.stop>
            <div class="modal-header">
              <h3>新增提示詞</h3>
              <button class="close-btn" @click="showNewPromptModal = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <!-- 名稱 -->
              <div class="form-group">
                <label class="form-label">名稱</label>
                <input
                  v-model="newPromptName"
                  class="input-field"
                  placeholder="提示詞名稱"
                />
              </div>

              <!-- 內容 -->
              <div class="form-group">
                <label class="form-label">內容</label>
                <textarea
                  v-model="newPromptContent"
                  class="edit-textarea"
                  rows="6"
                  placeholder="提示詞內容..."
                ></textarea>
              </div>

              <!-- 進階設定 -->
              <div class="advanced-settings">
                <div class="settings-title">進階設定</div>

                <!-- 角色選擇 -->
                <div class="form-group">
                  <label class="form-label">
                    角色
                    <span class="label-hint">AI 如何理解這條訊息</span>
                  </label>
                  <select v-model="newPromptRole" class="select-field">
                    <option value="system">系統 - 行為準則和背景設定</option>
                    <option value="user">使用者 - AI 認為是人類說的話</option>
                    <option value="assistant">
                      AI 助手 - AI 認為是自己說過的話
                    </option>
                  </select>
                </div>

                <!-- 注入位置 -->
                <div class="form-group">
                  <label class="form-label">
                    注入位置
                    <span class="label-hint">提示詞放置的位置</span>
                  </label>
                  <div class="radio-group horizontal">
                    <label
                      class="radio-option compact"
                      :class="{ active: newPromptInjectionPosition === 0 }"
                    >
                      <input
                        type="radio"
                        v-model="newPromptInjectionPosition"
                        :value="0"
                      />
                      <span class="radio-content">
                        <span class="radio-title">相對位置</span>
                        <span class="radio-desc">按順序排列</span>
                      </span>
                    </label>
                    <label
                      class="radio-option compact"
                      :class="{ active: newPromptInjectionPosition === 1 }"
                    >
                      <input
                        type="radio"
                        v-model="newPromptInjectionPosition"
                        :value="1"
                      />
                      <span class="radio-content">
                        <span class="radio-title">聊天中</span>
                        <span class="radio-desc">插入聊天歷史</span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- 深度設定（僅聊天中位置顯示） -->
                <Transition name="slide">
                  <div
                    v-if="newPromptInjectionPosition === 1"
                    class="form-group depth-settings"
                  >
                    <div class="depth-row">
                      <div class="depth-field">
                        <label class="form-label-sm">深度</label>
                        <input
                          type="number"
                          v-model.number="newPromptInjectionDepth"
                          min="0"
                          max="100"
                          class="number-input"
                        />
                        <span class="field-hint">0 = 最接近 AI 回覆</span>
                      </div>
                      <div class="depth-field">
                        <label class="form-label-sm">優先級</label>
                        <input
                          type="number"
                          v-model.number="newPromptInjectionOrder"
                          min="0"
                          max="1000"
                          class="number-input"
                        />
                        <span class="field-hint">數字越小越先插入</span>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- 插入位置 -->
              <div class="advanced-settings">
                <div class="settings-title">插入位置</div>
                <div class="form-group">
                  <select v-model="newPromptInsertMode" class="select-field">
                    <option value="start">插到最前面</option>
                    <option value="end">插到最後面</option>
                    <option value="before" :disabled="currentOrderChoices.length === 0">
                      插到某條目前面
                    </option>
                    <option value="after" :disabled="currentOrderChoices.length === 0">
                      插到某條目後面
                    </option>
                  </select>
                </div>
                <div
                  v-if="newPromptInsertMode === 'before' || newPromptInsertMode === 'after'"
                  class="form-group"
                >
                  <label class="form-label">參考條目</label>
                  <select v-model="newPromptAnchorIdentifier" class="select-field">
                    <option disabled value="">請選擇條目</option>
                    <option
                      v-for="item in currentOrderChoices"
                      :key="item.identifier"
                      :value="item.identifier"
                    >
                      {{ item.name }}
                    </option>
                  </select>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showNewPromptModal = false">
                取消
              </button>
              <button
                class="btn primary"
                :disabled="!newPromptName.trim() || ((newPromptInsertMode === 'before' || newPromptInsertMode === 'after') && !newPromptAnchorIdentifier)"
                @click="createNewPrompt"
              >
                創建
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 自訂模塊庫 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showPromptLibraryModal"
          class="modal-overlay"
          @click="showPromptLibraryModal = false"
        >
          <div class="modal modal-lg" @click.stop>
            <div class="modal-header">
              <h3>自訂模塊庫</h3>
              <button class="close-btn" @click="showPromptLibraryModal = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div v-if="promptLibraryStore.isLoading" class="empty-state">
                讀取中...
              </div>
              <div
                v-else-if="promptLibraryStore.list.length === 0"
                class="empty-state"
              >
                目前沒有條目。你可以在「編輯提示詞」時按「存回自訂庫」把條目存進來。
              </div>
              <div v-else class="library-list">
                <div
                  v-for="item in promptLibraryStore.list"
                  :key="item.identifier"
                  class="library-item"
                >
                  <div class="library-item-main">
                    <div class="library-item-title">{{ item.name }}</div>
                    <div class="library-item-id">{{ item.identifier }}</div>
                  </div>
                  <div class="library-item-actions">
                    <button
                      class="btn primary"
                      @click="addLibraryItemToCurrentMode(item)"
                    >
                      加入到目前模式
                    </button>
                    <button
                      class="btn secondary"
                      @click="promptLibraryStore.remove(item.identifier)"
                    >
                      刪除
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button
                class="btn secondary"
                @click="showPromptLibraryModal = false"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 導出選擇模態框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showExportModal"
          class="modal-overlay"
          @click="showExportModal = false"
        >
          <div class="modal" @click.stop>
            <div class="modal-header">
              <h3>選擇導出模塊</h3>
              <button class="close-btn" @click="showExportModal = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="export-options">
                <!-- 高層次導出範圍選擇 -->
                <div class="export-scope-cards">
                  <label class="scope-card" :class="{ active: exportScope === 'current' }">
                    <input type="radio" v-model="exportScope" value="current" />
                    <span class="scope-icon">{{ EXPORT_MODE_META[currentExportModeKey]?.icon || '✨' }}</span>
                    <span class="scope-content">
                      <span class="scope-title">僅導出 {{ currentExportModeLabel }}</span>
                      <span class="scope-desc">推薦，只會導出你目前正在編輯的模式設定，避免覆蓋其他模式</span>
                    </span>
                  </label>

                  <label class="scope-card" :class="{ active: exportScope === 'all' }">
                    <input type="radio" v-model="exportScope" value="all" />
                    <span class="scope-icon">🌟</span>
                    <span class="scope-content">
                      <span class="scope-title">導出所有模式</span>
                      <span class="scope-desc">包含線上、面對面、群聊等所有模組，適合完整備份與搬家</span>
                    </span>
                  </label>

                  <label class="scope-card" :class="{ active: exportScope === 'custom' }">
                    <input type="radio" v-model="exportScope" value="custom" />
                    <span class="scope-icon">⚙️</span>
                    <span class="scope-content">
                      <span class="scope-title">自訂選擇</span>
                      <span class="scope-desc">進階，自行勾選需要導出的特定模組組合</span>
                    </span>
                  </label>
                </div>

                <!-- 自訂選項區域 (僅在 custom 時顯示) -->
                <div v-if="exportScope === 'custom'" class="custom-options-container">
                  <!-- 快捷操作 + 計數 -->
                  <div class="export-quick-actions">
                    <button
                      class="chip-btn"
                      type="button"
                      @click="toggleAllExportOptions(true)"
                    >
                      全選
                    </button>
                    <button
                      class="chip-btn"
                      type="button"
                      @click="toggleAllExportOptions(false)"
                    >
                      取消全選
                    </button>
                  </div>

                  <!-- 線上模式 -->
                  <div
                    class="export-section"
                    :class="{ 'is-current-group': currentExportModeKey === 'global' }"
                  >
                    <div class="section-title">
                      <span class="section-icon">💬</span>
                      線上模式
                      <span
                        v-if="currentExportModeKey === 'global'"
                        class="current-badge"
                      >目前模式</span>
                    </div>
                    <label
                      class="export-option"
                      :class="{
                        'is-current': currentExportModeKey === 'global',
                        'is-checked': exportOptions.globalPrompts,
                      }"
                    >
                      <input
                        type="checkbox"
                        v-model="exportOptions.globalPrompts"
                      />
                      <span class="option-icon">📦</span>
                      <span class="option-content">
                        <span class="option-name">提示詞定義</span>
                        <span class="option-desc">所有提示詞的內容和設定</span>
                      </span>
                    </label>
                    <label
                      class="export-option"
                      :class="{
                        'is-current': currentExportModeKey === 'global',
                        'is-checked': exportOptions.globalOrder,
                      }"
                    >
                      <input
                        type="checkbox"
                        v-model="exportOptions.globalOrder"
                      />
                      <span class="option-icon">🔢</span>
                      <span class="option-content">
                        <span class="option-name">線上模式順序</span>
                        <span class="option-desc">提示詞執行順序與啟用狀態</span>
                      </span>
                    </label>
                  </div>

                  <!-- 特殊模式 -->
                  <div class="export-section">
                    <div class="section-title">
                      <span class="section-icon">✨</span>
                      特殊模式
                    </div>
                    <label
                      class="export-option face-to-face"
                      :class="{
                        'is-current': currentExportModeKey === 'faceToFace',
                        'is-checked': exportOptions.faceToFace,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.faceToFace" />
                      <span class="option-icon">🤝</span>
                      <span class="option-content">
                        <span class="option-name">
                          面對面模式
                          <span
                            v-if="currentExportModeKey === 'faceToFace'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">面對面聊天的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option group-chat"
                      :class="{
                        'is-current': currentExportModeKey === 'groupChat',
                        'is-checked': exportOptions.groupChat,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.groupChat" />
                      <span class="option-icon">👥</span>
                      <span class="option-content">
                        <span class="option-name">
                          群聊模式
                          <span
                            v-if="currentExportModeKey === 'groupChat'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">群聊模式的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option diary"
                      :class="{
                        'is-current': currentExportModeKey === 'diary',
                        'is-checked': exportOptions.diary,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.diary" />
                      <span class="option-icon">📔</span>
                      <span class="option-content">
                        <span class="option-name">
                          角色日記
                          <span
                            v-if="currentExportModeKey === 'diary'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">日記生成的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option summary"
                      :class="{
                        'is-current': currentExportModeKey === 'summary',
                        'is-checked': exportOptions.summary,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.summary" />
                      <span class="option-icon">📋</span>
                      <span class="option-content">
                        <span class="option-name">
                          對話總結
                          <span
                            v-if="currentExportModeKey === 'summary'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">總結功能的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option events"
                      :class="{
                        'is-current': currentExportModeKey === 'events',
                        'is-checked': exportOptions.events,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.events" />
                      <span class="option-icon">⭐</span>
                      <span class="option-content">
                        <span class="option-name">
                          重要事件
                          <span
                            v-if="currentExportModeKey === 'events'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">事件提取的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option plurk-post"
                      :class="{
                        'is-current': currentExportModeKey === 'plurkPost',
                        'is-checked': exportOptions.plurkPost,
                      }"
                    >
                      <input type="checkbox" v-model="exportOptions.plurkPost" />
                      <span class="option-icon">📝</span>
                      <span class="option-content">
                        <span class="option-name">
                          噗浪發文
                          <span
                            v-if="currentExportModeKey === 'plurkPost'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">噗浪發文的提示詞和順序</span>
                      </span>
                    </label>
                    <label
                      class="export-option plurk-comment"
                      :class="{
                        'is-current': currentExportModeKey === 'plurkComment',
                        'is-checked': exportOptions.plurkComment,
                      }"
                    >
                      <input
                        type="checkbox"
                        v-model="exportOptions.plurkComment"
                      />
                      <span class="option-icon">💭</span>
                      <span class="option-content">
                        <span class="option-name">
                          噗浪評論
                          <span
                            v-if="currentExportModeKey === 'plurkComment'"
                            class="current-badge"
                          >目前</span>
                        </span>
                        <span class="option-desc">噗浪評論的提示詞和順序</span>
                      </span>
                    </label>
                  </div>

                  <!-- 角色配置 -->
                  <div class="export-section">
                    <div class="section-title">
                      <span class="section-icon">🎭</span>
                      角色配置
                    </div>
                    <label
                      class="export-option"
                      :class="{ 'is-checked': exportOptions.characterConfigs }"
                    >
                      <input
                        type="checkbox"
                        v-model="exportOptions.characterConfigs"
                      />
                      <span class="option-icon">👤</span>
                      <span class="option-content">
                        <span class="option-name">角色專屬配置</span>
                        <span class="option-desc">各角色的自訂順序和覆蓋</span>
                      </span>
                    </label>
                  </div>
                </div>

                <!-- 導出格式 -->
                <div class="export-section">
                  <div class="section-title">
                    <span class="section-icon">📤</span>
                    導出格式
                  </div>
                  <label
                    class="export-option"
                    :class="{ 'is-checked': exportFormat === 'json' }"
                  >
                    <input
                      type="radio"
                      v-model="exportFormat"
                      value="json"
                    />
                    <span class="option-icon">🧩</span>
                    <span class="option-content">
                      <span class="option-name">JSON</span>
                      <span class="option-desc">標準 JSON 格式（可直接匯入）</span>
                    </span>
                  </label>
                  <label
                    class="export-option"
                    :class="{ 'is-checked': exportFormat === 'typescript' }"
                  >
                    <input
                      type="radio"
                      v-model="exportFormat"
                      value="typescript"
                    />
                    <span class="option-icon">📄</span>
                    <span class="option-content">
                      <span class="option-name">可複製替換文字</span>
                      <span class="option-desc">輸出純文字，用來貼去覆蓋對應的 .ts 檔案</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showExportModal = false">
                取消
              </button>
              <button
                class="btn primary"
                :disabled="selectedExportCount === 0"
                @click="doExport"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                導出 ({{ selectedExportCount }})
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 書影記錄管理器 -->
    <Teleport to="body">
      <MediaLogManager
        v-if="showMediaLogManager"
        @close="showMediaLogManager = false"
      />
    </Teleport>

    <!-- 管理員登入模態框 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showAdminLoginModal"
          class="modal-overlay"
          @click="showAdminLoginModal = false"
        >
          <div class="modal" @click.stop>
            <div class="modal-header">
              <h3>管理員登入</h3>
              <button class="close-btn" @click="showAdminLoginModal = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label">密碼</label>
                <input
                  v-model="adminPassword"
                  type="password"
                  class="input-field"
                  placeholder="請輸入管理員密碼"
                  @keyup.enter="adminLogin"
                />
                <p v-if="adminLoginError" class="error-text">
                  {{ adminLoginError }}
                </p>
              </div>
            </div>
            <div class="modal-footer">
              <button
                class="btn secondary"
                @click="showAdminLoginModal = false"
              >
                取消
              </button>
              <button class="btn primary" @click="adminLogin">登入</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 預設模塊選擇器 -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showPresetPicker"
          class="modal-overlay"
          @click="showPresetPicker = false"
        >
          <div class="modal" @click.stop>
            <div class="modal-header">
              <h3>添加預設模塊</h3>
              <button class="close-btn" @click="showPresetPicker = false">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
              <div v-if="availablePresets.length === 0" class="preset-empty">
                目前沒有可添加的預設模塊
              </div>
              <div v-else class="preset-list">
                <button
                  v-for="preset in availablePresets"
                  :key="preset.identifier"
                  class="preset-item"
                  @click="addPresetModule(preset)"
                >
                  <span class="preset-name">{{ preset.name }}</span>
                  <span v-if="preset.description" class="preset-desc">{{
                    preset.description
                  }}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style lang="scss" scoped>
.prompt-manager-screen {
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  height: 100%;
}

// 標題欄
.pm-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  padding-top: calc(12px + var(--safe-top));
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  gap: 12px;
  flex-shrink: 0;
}

.header-back {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 24px;
    height: 24px;
  }

  &:hover {
    background: var(--color-surface-hover);
  }
}

.header-title {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-actions-main {
  display: flex;
  gap: 8px;
}

.header-actions-more {
  position: relative;
}

.header-actions-more > summary {
  list-style: none;
}

.header-actions-more > summary::-webkit-details-marker {
  display: none;
}

.header-actions-menu {
  position: absolute;
  top: calc(100% + 14px);
  right: -6px;
  min-width: 220px;
  padding: 14px 12px;
  border: none;
  border-radius: 22px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  animation: bubble-pop 0.18s ease-out;
}

/* 產生邊緣羽化與背景的偽元素 */
.header-actions-menu::after {
  content: "";
  position: absolute;
  inset: -2px; /* 稍微擴張讓邊界更柔和 */
  border-radius: 24px;
  background: color-mix(in srgb, color-mix(in hsl, var(--color-primary, #6b4a3f) 55%, white) 45%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  filter: blur(10px); /* 邊緣羽化核心 */
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.15); /* 陰影稍微調淡一點點 */
  z-index: -1;
}

@keyframes bubble-pop {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.header-menu-item {
  width: 100%;
  text-align: left;
  padding: 10px 16px;
  border-radius: 999px;
  border: none;
  background: #fff;
  font-size: 14px;
  color: #2a2a2a;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition:
    background 0.2s,
    transform 0.15s,
    box-shadow 0.2s;

  &:hover {
    background: #f5f5f5;
    transform: translateX(3px);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
  }

  &.danger {
    color: var(--color-error, #e53e3e);

    &:hover {
      background: rgba(229, 62, 62, 0.08);
    }
  }
}

.header-menu-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-menu-group-title {
  padding: 4px 12px 2px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: rgba(255, 255, 255, 0.78);
  user-select: none;
}

.header-menu-group-content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-left: 0;
  padding-left: 0;
  border-left: none;
}

.header-menu-group-content .header-menu-item {
  font-size: 13px;
}

.header-menu-group-content .header-menu-item::before {
  content: none;
}

.header-menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: rgba(255, 255, 255, 0.18);
}

.header-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-lg);
  background: var(--color-background);
  color: var(--color-text-secondary);
  cursor: pointer;
  border: none;
  transition: all var(--transition-fast);

  svg {
    width: 22px;
    height: 22px;
  }

  &:hover {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &.reset-all-btn {
    color: var(--color-error, #e53e3e);

    &:hover {
      background: rgba(229, 62, 62, 0.1);
      color: var(--color-error, #e53e3e);
    }
  }
}

.library-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--color-border);
  background: var(--color-background);
}

.library-item-title {
  font-weight: 700;
  color: var(--color-text);
}

.library-item-id {
  font-size: 12px;
  opacity: 0.7;
}

.library-item-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 16px;
  color: var(--color-text-muted);
}

.hidden-file-input {
  display: none;
}

.import-modal {
  width: min(960px, calc(100vw - 32px));
}

.import-modal-body {
  gap: 16px;
}

.import-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.import-source {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.import-source-name,
.import-current-mode,
.import-selection-count {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.import-toolbar-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.import-message {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  font-size: 13px;
}

.import-message.success {
  background: rgba(34, 197, 94, 0.1);
  color: #15803d;
}

.import-message.error {
  background: rgba(239, 68, 68, 0.1);
  color: #b91c1c;
}

.import-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 16px;
  min-height: 400px;
  height: calc(100vh - 280px);
  max-height: 600px;
}

.import-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  overflow-y: auto;
  padding-right: 4px;
}

.import-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  cursor: pointer;
}

.import-item.recommended {
  border-color: rgba(59, 130, 246, 0.35);
}

.import-item.inserted {
  background: rgba(34, 197, 94, 0.06);
}

.import-item input[type="checkbox"] {
  margin-top: 4px;
  width: 18px;
  height: 18px;
  accent-color: var(--color-primary);
}

.import-item-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.import-item-header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.import-item-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.import-item-meta {
  font-size: 11px;
  color: var(--color-text-muted);
  word-break: break-all;
}

.import-item-preview {
  font-size: 12px;
  line-height: 1.55;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
}

.import-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
}

.import-badge.type {
  background: rgba(139, 92, 246, 0.12);
  color: #7c3aed;
}

.import-badge.role {
  background: rgba(59, 130, 246, 0.12);
  color: #2563eb;
}

.import-badge.enabled {
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.import-badge.inserted {
  background: rgba(249, 115, 22, 0.12);
  color: #c2410c;
}

.import-side-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-background);
  height: fit-content;
  max-height: 100%;
  overflow-y: auto;
}

.import-tip {
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text-muted);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: 10px 12px;
}

// 角色選擇器
.character-selector {
  display: flex;
  padding: 12px 16px;
  gap: 8px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  overflow-x: auto;
  flex-shrink: 0;

  &::-webkit-scrollbar {
    display: none;
  }
}

.char-tabs-scroll {
  display: flex;
  gap: 8px;
}

.char-tab {
  padding: 8px 16px;
  border-radius: 20px;
  background: var(--color-background);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  gap: 6px;

  .tab-icon {
    width: 16px;
    height: 16px;
  }

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  &.active {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: white;
  }

  &.diary-tab {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-color: #fcd34d;
    color: #92400e;

    &:hover {
      background: linear-gradient(135deg, #fde68a 0%, #fcd34d 100%);
    }

    &.active {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      border-color: #d97706;
      color: white;
    }
  }

  &.summary-tab {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    border-color: #93c5fd;
    color: #1e40af;

    &:hover {
      background: linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%);
    }

    &.active {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border-color: #2563eb;
      color: white;
    }
  }

  &.events-tab {
    background: linear-gradient(135deg, #fce7f3 0%, #fbcfe8 100%);
    border-color: #f9a8d4;
    color: #9d174d;

    &:hover {
      background: linear-gradient(135deg, #fbcfe8 0%, #f9a8d4 100%);
    }

    &.active {
      background: linear-gradient(135deg, #ec4899 0%, #db2777 100%);
      border-color: #db2777;
      color: white;
    }
  }

  &.plurk-post-tab {
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    border-color: #6ee7b7;
    color: #065f46;

    &:hover {
      background: linear-gradient(135deg, #a7f3d0 0%, #6ee7b7 100%);
    }

    &.active {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      border-color: #059669;
      color: white;
    }
  }

  &.plurk-comment-tab {
    background: linear-gradient(135deg, #e0e7ff 0%, #c7d2fe 100%);
    border-color: #a5b4fc;
    color: #3730a3;

    &:hover {
      background: linear-gradient(135deg, #c7d2fe 0%, #a5b4fc 100%);
    }

    &.active {
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      border-color: #4f46e5;
      color: white;
    }
  }

  &.group-chat-tab {
    background: linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%);
    border-color: #f48fb1;
    color: #880e4f;

    &:hover {
      background: linear-gradient(135deg, #f8bbd0 0%, #f48fb1 100%);
    }

    &.active {
      background: linear-gradient(135deg, #e91e63 0%, #c2185b 100%);
      border-color: #c2185b;
      color: white;
    }
  }

  &.add-char-btn {
    padding: 8px 12px;
    background: transparent;
    border-style: dashed;
    color: var(--color-text-muted);

    .tab-icon {
      width: 18px;
      height: 18px;
    }

    &:hover {
      background: var(--color-primary-light);
      border-color: var(--color-primary);
      border-style: solid;
      color: var(--color-primary);
    }
  }
}

// 添加角色配置的包裝器
.add-char-wrapper {
  position: relative;
}

// 添加角色選單遮罩層
.add-char-menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

// 添加角色選單
.add-char-menu {
  position: fixed;
  min-width: 160px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 10000;
  overflow: hidden;

  .menu-header {
    padding: 10px 14px;
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-background);
    border-bottom: 1px solid var(--color-border);
  }

  .menu-item {
    display: block;
    width: 100%;
    padding: 10px 14px;
    text-align: left;
    font-size: 14px;
    color: var(--color-text);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);

    &:hover {
      background: var(--color-primary-light);
      color: var(--color-primary);
    }

    &:not(:last-child) {
      border-bottom: 1px solid var(--color-border-light);
    }
  }

  .menu-empty {
    padding: 12px 14px;
    font-size: 13px;
    color: var(--color-text-muted);
    text-align: center;
  }
}

// 模式說明
.mode-info {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  font-size: 13px;
  color: var(--color-text-secondary);

  .info-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  &.diary-mode-info {
    background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
    color: #92400e;

    .info-icon {
      color: #f59e0b;
    }
  }

  &.summary-mode-info {
    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
    color: #1e40af;

    .info-icon {
      color: #3b82f6;
    }
  }

  &.events-mode-info {
    background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
    color: #9d174d;

    .info-icon {
      color: #ec4899;
    }
  }

  &.plurk-post-mode-info {
    background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
    color: #065f46;

    .info-icon {
      color: #10b981;
    }
  }

  &.plurk-comment-mode-info {
    background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%);
    color: #3730a3;

    .info-icon {
      color: #6366f1;
    }
  }

  &.group-chat-mode-info {
    background: linear-gradient(135deg, #fce4ec 0%, #fce4ec 100%);
    color: #880e4f;

    .info-icon {
      color: #e91e63;
    }
  }
}

// 配置狀態
.config-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;

  &.custom {
    background: var(--color-primary-light);
    color: var(--color-primary);
  }

  &.global {
    background: var(--color-background);
    color: var(--color-text-secondary);
  }
}

.text-btn {
  background: none;
  border: none;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all var(--transition-fast);

  &.primary {
    color: var(--color-primary);

    &:hover {
      background: var(--color-primary-light);
    }
  }

  &.danger {
    color: var(--color-error);

    &:hover {
      background: rgba(229, 62, 62, 0.1);
    }
  }
}

// 內容區
.pm-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

// 提示詞列表
.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  cursor: grab;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    box-shadow: var(--shadow-sm);
  }

  &.disabled {
    opacity: 0.5;
    background: var(--color-background);
  }

  &.drag-over {
    border-color: var(--color-primary);
    border-style: dashed;
    background: var(--color-primary-light);
  }

  &.dragging {
    opacity: 0.5;
    transform: scale(0.98);
  }

  &.touch-dragging {
    opacity: 0.3;
    transform: scale(0.96);
    border-style: dashed;
  }

  &.clickable {
    cursor: pointer;

    &:hover {
      background: var(--color-primary-light);
    }
  }
}

.drag-handle {
  color: var(--color-text-muted);
  cursor: grab;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  touch-action: none;

  svg {
    width: 16px;
    height: 16px;
  }
}

.prompt-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.prompt-info {
  flex: 1;
  min-width: 0; /* 關鍵：防止內容撐破 flex 容器 */
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-name {
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
  word-break: break-word; /* 允許長文字換行 */
  line-height: 1.3;
}

.prompt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.prompt-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;

  &.marker {
    background: #e3f2fd;
    color: #1976d2;
  }

  &.system {
    background: #f3e5f5;
    color: #7b1fa2;
  }

  &.custom {
    background: #e8f5e9;
    color: #388e3c;
  }

  &.role-user {
    background: #fff3e0;
    color: #e65100;
  }

  &.role-assistant {
    background: #e0f2f1;
    color: #00695c;
  }

  &.position-depth {
    background: #fce4ec;
    color: #c2185b;
    font-family: monospace;
  }
}

.prompt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  &.edit {
    color: var(--color-text-secondary);

    &:hover {
      background: var(--color-primary-light);
      color: var(--color-primary);
    }
  }

  &.delete {
    color: var(--color-text-secondary);

    &:hover {
      background: rgba(229, 62, 62, 0.1);
      color: var(--color-error);
    }
  }
}

// 開關
.toggle-switch {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--color-border);
    border-radius: 24px;
    transition: all var(--transition-fast);

    &::before {
      content: "";
      position: absolute;
      width: 20px;
      height: 20px;
      left: 2px;
      bottom: 2px;
      background: white;
      border-radius: 50%;
      transition: all var(--transition-fast);
      box-shadow: var(--shadow-sm);
    }
  }

  input:checked + .slider {
    background: var(--color-primary);

    &::before {
      transform: translateX(20px);
    }
  }
}

// 模態框
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: var(--color-surface);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);

  &.modal-lg {
    max-width: 600px;
    max-height: 90vh;
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-text-muted);

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    background: var(--color-background);
  }
}

.modal-body {
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 20px;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}

.btn-locked {
  background: var(--color-warning, #f59e0b) !important;
  color: #fff !important;
  border-color: var(--color-warning, #f59e0b) !important;
}

.input-field {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 15px;
  background: var(--color-background);
  color: var(--color-text);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.select-field {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  background: var(--color-background);
  color: var(--color-text);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 36px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }

  option {
    padding: 8px;
  }
}

.edit-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: 14px;
  font-family: monospace;
  resize: vertical;
  background: var(--color-background);
  color: var(--color-text);
  line-height: 1.5;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.help-text {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}

// 表單組
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-label-sm {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.label-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-muted);
}

// 進階設定區塊
.advanced-settings {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

// 單選按鈕組
.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &.horizontal {
    flex-direction: row;

    .radio-option {
      flex: 1;
    }
  }
}

.radio-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  input[type="radio"] {
    display: none;
  }

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  &.compact {
    padding: 10px 12px;

    .radio-content {
      gap: 2px;
    }

    .radio-title {
      font-size: 13px;
    }

    .radio-desc {
      font-size: 11px;
    }
  }
}

.radio-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.radio-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.radio-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.radio-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

// 深度設定
.depth-settings {
  background: var(--color-background);
  padding: 12px;
  border-radius: var(--radius-md);
}

.depth-row {
  display: flex;
  gap: 16px;
}

.depth-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.number-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-size: 14px;
  background: var(--color-surface);
  color: var(--color-text);

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.field-hint {
  font-size: 11px;
  color: var(--color-text-muted);
}

// 滑動動畫
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.btn {
  padding: 10px 20px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);

  &.primary {
    background: var(--color-primary);
    border: none;
    color: white;

    &:hover:not(:disabled) {
      filter: brightness(1.1);
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.secondary {
    background: var(--color-background);
    border: 1px solid var(--color-border);
    color: var(--color-text-secondary);

    &:hover {
      background: var(--color-surface-hover);
    }
  }
}

// 動畫
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 導出選擇模態框
.export-options {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.export-quick-actions {
  display: flex;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--color-border);
}

.export-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.export-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }

  &.diary {
    border-left: 3px solid #f59e0b;
  }

  &.summary {
    border-left: 3px solid #3b82f6;
  }

  &.events {
    border-left: 3px solid #ec4899;
  }

  &.plurk-post {
    border-left: 3px solid #10b981;
  }

  &.plurk-comment {
    border-left: 3px solid #6366f1;
  }

  &.group-chat {
    border-left: 3px solid #e91e63;
  }
}

// 高層次導出範圍選擇卡片
.export-scope-cards {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.scope-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px;
  border-radius: var(--radius-md);
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  cursor: pointer;
  transition: all var(--transition-fast);

  input[type="radio"] {
    margin-top: 4px;
    width: 20px;
    height: 20px;
    accent-color: var(--color-primary);
    cursor: pointer;
    flex-shrink: 0;
  }

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-bg-alt);
  }

  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
    box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.1);
  }
}

.scope-icon {
  font-size: 28px;
  line-height: 1;
  flex-shrink: 0;
  margin-top: 2px;
}

.scope-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.scope-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.scope-desc {
  font-size: 13px;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.custom-options-container {
  padding-top: 16px;
  border-top: 1px dashed var(--color-border);
  margin-top: -8px;
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.btn-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  &.primary {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;

    &:hover {
      opacity: 0.9;
      color: #fff;
    }
  }
}

.chip-btn {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
}

.selected-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted);

  strong {
    color: var(--color-primary);
    font-weight: 600;
  }
}

.section-icon {
  margin-right: 6px;
}

.current-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  vertical-align: middle;
}

.is-current-group .section-title {
  color: var(--color-primary);
}

.option-icon {
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
}

.export-option {
  &.is-checked {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }

  &.is-current {
    box-shadow: 0 0 0 1px var(--color-primary) inset;
  }
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.option-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.option-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

.btn-icon {
  width: 16px;
  height: 16px;
  margin-right: 6px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

// 管理員按鈕
.admin-active {
  color: #7dd3a8 !important;
  background: rgba(125, 211, 168, 0.15) !important;
}

// 管理員鎖定圖標
.admin-lock-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #f59e0b;
  opacity: 0.8;

  svg {
    width: 16px;
    height: 16px;
  }
}

// 錯誤文字
.error-text {
  color: #e53e3e;
  font-size: 12px;
  margin-top: 4px;
}

// 預設模塊選擇器
.preset-empty {
  text-align: center;
  padding: 24px;
  color: var(--color-text-muted);
  font-size: 14px;
}

.preset-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 400px;
  overflow-y: auto;
}

.preset-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-light);
  }
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.preset-desc {
  font-size: 12px;
  color: var(--color-text-muted);
}

@media (max-width: 900px) {
  .import-layout {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 200px);
    max-height: none;
  }
  
  .import-list {
    flex: 1;
    min-height: 200px;
  }
  
  .import-side-panel {
    flex-shrink: 0;
    max-height: 220px;
  }
}
</style>

<style lang="scss">
/* 觸控拖拽幽靈元素（掛在 body 上，需要 unscoped） */
.touch-drag-ghost {
  border-radius: var(--radius-lg, 12px);
  border: 2px solid var(--color-primary, #7dd3a8);
  background: var(--color-surface, #fff);
}
</style>
