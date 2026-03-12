import { ref, computed, watch, nextTick, type Ref } from "vue";
import { useSettingsStore } from "@/stores";

interface QuickAction {
  label: string;
  text: string;
  hint: string;
}

/**
 * 快速輸入助手（面對面模式）+ 輸入框展開 + 快捷編輯器
 * 從 ChatScreen.vue 抽取的獨立 composable
 */
export function useChatInputHelper(deps: {
  inputText: Ref<string>;
  sendAndTriggerAI: () => Promise<void>;
}) {
  const settingsStore = useSettingsStore();

  const isInputFocused = ref(false);
  const messageInputRef = ref<HTMLTextAreaElement | null>(null);
  const isInputExpanded = ref(false);
  const expandedInputRef = ref<HTMLTextAreaElement | null>(null);
  const showQuickActionEditor = ref(false);
  const editingQuickActions = ref<QuickAction[]>([]);
  const newActionLabel = ref("");
  const newActionText = ref("");
  const newActionHint = ref("");

  const defaultQuickActions: QuickAction[] = [
    { label: "**", text: "**", hint: "粗體" },
    { label: '""', text: '""', hint: "引號" },
    { label: "( )", text: "()", hint: "括號" },
    { label: "「」", text: "「」", hint: "直角引號" },
    { label: "『』", text: "『』", hint: "雙直角引號" },
    { label: "user", text: "{{user}}", hint: "使用者名稱" },
    { label: "char", text: "{{char}}", hint: "角色名稱" },
    { label: "!", text: "!", hint: "驚嘆號" },
    { label: "?", text: "?", hint: "問號" },
    { label: "...", text: "...", hint: "省略號" },
  ];

  const quickActions = computed(() => {
    return [...defaultQuickActions, ...settingsStore.customQuickActions];
  });

  function toggleInputExpand() {
    isInputExpanded.value = !isInputExpanded.value;
    if (isInputExpanded.value) {
      nextTick(() => {
        expandedInputRef.value?.focus();
      });
    } else {
      nextTick(() => {
        messageInputRef.value?.focus();
      });
    }
  }

  function closeExpandedInput() {
    isInputExpanded.value = false;
    nextTick(() => {
      messageInputRef.value?.focus();
    });
  }

  async function sendFromExpanded() {
    await deps.sendAndTriggerAI();
    closeExpandedInput();
  }

  function openQuickActionEditor() {
    editingQuickActions.value = [...settingsStore.customQuickActions];
    showQuickActionEditor.value = true;
  }

  function addNewQuickAction() {
    if (!newActionLabel.value.trim() || !newActionText.value.trim()) return;
    editingQuickActions.value.push({
      label: newActionLabel.value.trim(),
      text: newActionText.value.trim(),
      hint: newActionHint.value.trim() || newActionLabel.value.trim(),
    });
    newActionLabel.value = "";
    newActionText.value = "";
    newActionHint.value = "";
  }

  function removeEditingQuickAction(index: number) {
    editingQuickActions.value.splice(index, 1);
  }

  async function saveQuickActions() {
    settingsStore.setCustomQuickActions(editingQuickActions.value);
    await settingsStore.saveSettings();
    showQuickActionEditor.value = false;
  }

  function cancelQuickActionEdit() {
    showQuickActionEditor.value = false;
    editingQuickActions.value = [];
  }

  function onInputFocus() {
    isInputFocused.value = true;
  }

  function onInputBlur() {
    setTimeout(() => {
      isInputFocused.value = false;
    }, 200);
  }

  function autoResizeInput() {
    const textarea = messageInputRef.value;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 84) + "px";
  }

  // 輸入清空時重置高度
  watch(deps.inputText, (val) => {
    if (!val) {
      nextTick(() => {
        const textarea = messageInputRef.value;
        if (textarea) textarea.style.height = "";
      });
    }
  });

  function insertQuickAction(text: string) {
    const textarea = isInputExpanded.value
      ? expandedInputRef.value
      : messageInputRef.value;
    if (!textarea) {
      deps.inputText.value += text;
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = deps.inputText.value.substring(0, start);
    const after = deps.inputText.value.substring(end);

    const pairSymbols = ["**", '""', "()", "「」", "『』"];
    if (pairSymbols.includes(text)) {
      const half = Math.floor(text.length / 2);
      deps.inputText.value = before + text + after;
      nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(start + half, start + half);
      });
    } else {
      deps.inputText.value = before + text + after;
      nextTick(() => {
        textarea.focus();
        textarea.setSelectionRange(start + text.length, start + text.length);
      });
    }
  }

  return {
    isInputFocused,
    messageInputRef,
    isInputExpanded,
    expandedInputRef,
    showQuickActionEditor,
    editingQuickActions,
    newActionLabel,
    newActionText,
    newActionHint,
    quickActions,
    toggleInputExpand,
    closeExpandedInput,
    sendFromExpanded,
    openQuickActionEditor,
    addNewQuickAction,
    removeEditingQuickAction,
    saveQuickActions,
    cancelQuickActionEdit,
    onInputFocus,
    onInputBlur,
    autoResizeInput,
    insertQuickAction,
  };
}
