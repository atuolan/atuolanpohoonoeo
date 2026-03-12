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

// 當前選擇的模式：'global' = 全局, 'faceToFace' = 面對面, 'groupChat' = 群聊, 'diary' = 日記, 'summary' = 總結, 'events' = 重要事件, 'plurkPost' = 噗浪發文, 'plurkComment' = 噗浪評論, 其他 = 角色 ID
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

// 當前選擇的角色 ID（null = 全局）
const selectedCharacterId = ref<string | null>(null);

// 編輯中的提示詞
const editingPrompt = ref<PromptDefinition | null>(null);
const editingContent = ref("");
const editingRole = ref<"system" | "user" | "assistant">("system");
const editingInjectionPosition = ref<0 | 1>(0); // 0=RELATIVE, 1=ABSOLUTE
const editingInjectionDepth = ref(0);
const editingInjectionOrder = ref(0);

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
const newPromptName = ref("");
const newPromptContent = ref("");
const newPromptRole = ref<"system" | "user" | "assistant">("system");
const newPromptInjectionPosition = ref<0 | 1>(0);
const newPromptInjectionDepth = ref(0);
const newPromptInjectionOrder = ref(100);

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

async function addLibraryItemToCurrentMode(item: PromptDefinition) {
  try {
    await promptManagerStore.addCustomPromptForMode(selectedMode.value, {
      name: item.name,
      content: item.content,
      role: item.role,
      injection_position: item.injection_position,
      injection_depth: item.injection_depth,
      injection_order: item.injection_order,
    });
    alert("已加入到目前模式");
  } catch (e) {
    console.error(e);
    alert("加入失敗，請看 Console");
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

  const fromIndex = touchDragFromIndex.value;
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
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "groupChat") {
      await promptManagerStore.updateGroupChatPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "diary") {
      await promptManagerStore.updateDiaryPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "summary") {
      await promptManagerStore.updateSummaryPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "events") {
      await promptManagerStore.updateEventsPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "plurkPost") {
      await promptManagerStore.updatePlurkPostPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else if (selectedMode.value === "plurkComment") {
      await promptManagerStore.updatePlurkCommentPrompt(
        editingPrompt.value.identifier,
        {
          content: editingContent.value,
          role: editingRole.value,
          injection_position: editingInjectionPosition.value,
          injection_depth: editingInjectionDepth.value,
          injection_order: editingInjectionOrder.value,
        },
      );
    } else {
      await promptManagerStore.updatePrompt(editingPrompt.value.identifier, {
        content: editingContent.value,
        role: editingRole.value,
        injection_position: editingInjectionPosition.value,
        injection_depth: editingInjectionDepth.value,
        injection_order: editingInjectionOrder.value,
      });
    }
    editingPrompt.value = null;
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

    if (isFaceToFaceMode.value) {
      await promptManagerStore.addFaceToFaceCustomPrompt(promptData);
    } else if (isGroupChatMode.value) {
      await promptManagerStore.addGroupChatCustomPrompt(promptData);
    } else {
      await promptManagerStore.addCustomPromptForMode(
        selectedMode.value,
        promptData,
      );
    }
    showNewPromptModal.value = false;
    newPromptName.value = "";
    newPromptContent.value = "";
    newPromptRole.value = "system";
    newPromptInjectionPosition.value = 0;
    newPromptInjectionDepth.value = 0;
    newPromptInjectionOrder.value = 100;
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

// 重置當前模式為默認
async function resetCurrentToDefault() {
  if (selectedMode.value === "faceToFace") {
    if (confirm("確定要重置面對面模式提示詞為默認順序嗎？")) {
      await promptManagerStore.resetFaceToFaceToDefault();
    }
  } else if (selectedMode.value === "groupChat") {
    if (confirm("確定要重置群聊模式提示詞為默認順序嗎？")) {
      await promptManagerStore.resetGroupChatToDefault();
    }
  } else if (selectedMode.value === "diary") {
    if (confirm("確定要重置日記提示詞為默認順序嗎？")) {
      await promptManagerStore.resetDiaryToDefault();
    }
  } else if (selectedMode.value === "summary") {
    if (confirm("確定要重置總結提示詞為默認順序嗎？")) {
      await promptManagerStore.resetSummaryToDefault();
    }
  } else if (selectedMode.value === "events") {
    if (confirm("確定要重置重要事件提示詞為默認順序嗎？")) {
      await promptManagerStore.resetEventsToDefault();
    }
  } else if (selectedMode.value === "plurkPost") {
    if (confirm("確定要重置噗浪發文提示詞為默認順序嗎？")) {
      await promptManagerStore.resetPlurkPostToDefault();
    }
  } else if (selectedMode.value === "plurkComment") {
    if (confirm("確定要重置噗浪評論提示詞為默認順序嗎？")) {
      await promptManagerStore.resetPlurkCommentToDefault();
    }
  } else {
    if (confirm("確定要重置為默認值嗎？這會重置所有提示詞內容和順序。")) {
      await promptManagerStore.resetToDefault(
        selectedCharacterId.value || undefined,
      );
    }
  }
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

// 打開導出選擇模態框
function openExportModal() {
  showExportModal.value = true;
}

// 執行導出
function doExport() {
  const config = promptManagerStore.config;
  const exportData: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
  };

  // 根據選擇添加數據
  if (exportOptions.value.globalPrompts) {
    // 按照 globalPromptOrder 的順序排列 prompts
    const orderedPrompts = config.globalPromptOrder
      .map((entry) =>
        config.prompts.find((p) => p.identifier === entry.identifier),
      )
      .filter((p): p is (typeof config.prompts)[0] => p !== undefined);
    // 添加不在順序中的提示詞（如果有的話）
    const orderedIds = new Set(
      config.globalPromptOrder.map((e) => e.identifier),
    );
    const extraPrompts = config.prompts.filter(
      (p) => !orderedIds.has(p.identifier),
    );
    exportData.prompts = [...orderedPrompts, ...extraPrompts];
  }
  if (exportOptions.value.globalOrder) {
    exportData.globalPromptOrder = config.globalPromptOrder;
  }
  if (exportOptions.value.faceToFace) {
    exportData.faceToFacePrompts = config.faceToFacePrompts;
    exportData.faceToFacePromptOrder = config.faceToFacePromptOrder;
  }
  if (exportOptions.value.diary) {
    exportData.diaryPrompts = config.diaryPrompts;
    exportData.diaryPromptOrder = config.diaryPromptOrder;
  }
  if (exportOptions.value.summary) {
    exportData.summaryPrompts = config.summaryPrompts;
    exportData.summaryPromptOrder = config.summaryPromptOrder;
  }
  if (exportOptions.value.events) {
    exportData.eventsPrompts = config.eventsPrompts;
    exportData.eventsPromptOrder = config.eventsPromptOrder;
  }
  if (exportOptions.value.plurkPost) {
    exportData.plurkPostPrompts = config.plurkPostPrompts;
    exportData.plurkPostPromptOrder = config.plurkPostPromptOrder;
  }
  if (exportOptions.value.plurkComment) {
    exportData.plurkCommentPrompts = config.plurkCommentPrompts;
    exportData.plurkCommentPromptOrder = config.plurkCommentPromptOrder;
  }
  if (exportOptions.value.groupChat) {
    exportData.groupChatPrompts = config.groupChatPrompts;
    exportData.groupChatPromptOrder = config.groupChatPromptOrder;
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
                d="M12 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
              />
            </svg>
          </summary>

          <div class="header-actions-menu" role="menu">
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

            <button
              class="header-menu-item"
              role="menuitem"
              title="重置當前模式"
              @click="resetCurrentToDefault"
            >
              重置當前模式
            </button>

            <button
              class="header-menu-item danger"
              role="menuitem"
              title="重置所有模式"
              @click="resetAllToDefault"
            >
              重置所有模式
            </button>
          </div>
        </details>
      </div>
    </header>

    <!-- 角色選擇器 -->
    <div class="character-selector">
      <button
        class="char-tab"
        :class="{ active: selectedMode === 'global' }"
        @click="selectMode('global')"
      >
        全局設定
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
          恢復全局
        </button>
      </template>
      <template v-else>
        <span class="status-badge global">使用全局配置</span>
        <button class="text-btn primary" @click="createCharacterConfig">
          創建自訂配置
        </button>
      </template>
    </div>

    <!-- 提示詞列表 -->
    <main class="pm-content">
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

          <!-- 名稱 -->
          <span class="prompt-name">{{ getPromptName(entry.identifier) }}</span>

          <!-- 標籤 -->
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
              <h3>編輯「{{ editingPrompt.name }}」</h3>
              <button class="close-btn" @click="cancelEdit">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
            <div class="modal-body">
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
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showNewPromptModal = false">
                取消
              </button>
              <button
                class="btn primary"
                :disabled="!newPromptName.trim()"
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
                <!-- 快捷操作 -->
                <div class="export-quick-actions">
                  <button
                    class="text-btn primary"
                    @click="toggleAllExportOptions(true)"
                  >
                    全選
                  </button>
                  <button
                    class="text-btn"
                    @click="toggleAllExportOptions(false)"
                  >
                    取消全選
                  </button>
                </div>

                <!-- 全局配置 -->
                <div class="export-section">
                  <div class="section-title">全局配置</div>
                  <label class="export-option">
                    <input
                      type="checkbox"
                      v-model="exportOptions.globalPrompts"
                    />
                    <span class="option-content">
                      <span class="option-name">提示詞定義</span>
                      <span class="option-desc">所有提示詞的內容和設定</span>
                    </span>
                  </label>
                  <label class="export-option">
                    <input
                      type="checkbox"
                      v-model="exportOptions.globalOrder"
                    />
                    <span class="option-content">
                      <span class="option-name">全局順序</span>
                      <span class="option-desc">聊天時的提示詞排列順序</span>
                    </span>
                  </label>
                </div>

                <!-- 特殊模式 -->
                <div class="export-section">
                  <div class="section-title">特殊模式</div>
                  <label class="export-option face-to-face">
                    <input type="checkbox" v-model="exportOptions.faceToFace" />
                    <span class="option-content">
                      <span class="option-name">面對面模式</span>
                      <span class="option-desc">面對面聊天的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option diary">
                    <input type="checkbox" v-model="exportOptions.diary" />
                    <span class="option-content">
                      <span class="option-name">角色日記</span>
                      <span class="option-desc">日記生成的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option summary">
                    <input type="checkbox" v-model="exportOptions.summary" />
                    <span class="option-content">
                      <span class="option-name">對話總結</span>
                      <span class="option-desc">總結功能的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option events">
                    <input type="checkbox" v-model="exportOptions.events" />
                    <span class="option-content">
                      <span class="option-name">重要事件</span>
                      <span class="option-desc">事件提取的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option plurk-post">
                    <input type="checkbox" v-model="exportOptions.plurkPost" />
                    <span class="option-content">
                      <span class="option-name">噗浪發文</span>
                      <span class="option-desc">噗浪發文的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option plurk-comment">
                    <input
                      type="checkbox"
                      v-model="exportOptions.plurkComment"
                    />
                    <span class="option-content">
                      <span class="option-name">噗浪評論</span>
                      <span class="option-desc">噗浪評論的提示詞和順序</span>
                    </span>
                  </label>
                  <label class="export-option group-chat">
                    <input type="checkbox" v-model="exportOptions.groupChat" />
                    <span class="option-content">
                      <span class="option-name">群聊模式</span>
                      <span class="option-desc">群聊模式的提示詞和順序</span>
                    </span>
                  </label>
                </div>

                <!-- 角色配置 -->
                <div class="export-section">
                  <div class="section-title">角色配置</div>
                  <label class="export-option">
                    <input
                      type="checkbox"
                      v-model="exportOptions.characterConfigs"
                    />
                    <span class="option-content">
                      <span class="option-name">角色專屬配置</span>
                      <span class="option-desc">各角色的自訂順序和覆蓋</span>
                    </span>
                  </label>
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn secondary" @click="showExportModal = false">
                取消
              </button>
              <button class="btn primary" @click="doExport">
                <svg viewBox="0 0 24 24" fill="currentColor" class="btn-icon">
                  <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                </svg>
                導出
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
  top: calc(100% + 8px);
  right: 0;
  min-width: 180px;
  padding: 8px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-surface);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.header-menu-item {
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  font-size: 14px;
  white-space: nowrap;
  color: var(--color-text);
  cursor: pointer;

  &:hover {
    background: var(--color-surface-hover);
  }

  &.danger {
    color: var(--color-error, #e53e3e);

    &:hover {
      background: rgba(229, 62, 62, 0.1);
    }
  }
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
}

.prompt-name {
  flex: 1;
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

.prompt-tag {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;

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

.option-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
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
</style>

<style lang="scss">
/* 觸控拖拽幽靈元素（掛在 body 上，需要 unscoped） */
.touch-drag-ghost {
  border-radius: var(--radius-lg, 12px);
  border: 2px solid var(--color-primary, #7dd3a8);
  background: var(--color-surface, #fff);
}
</style>
