<!-- src/components/modals/chat-preset/ChatPresetEntriesTab.vue -->
<script setup lang="ts">
/**
 * 專屬預設 第二頁：只屬於這個聊天的提示詞條目
 */
import { computed, ref, watch } from "vue";
import { useChatVariablesStore } from "@/stores/chatVariables";
import type { ChatLocalPrompt } from "@/types/chat";
import {
  CHAT_PROMPT_MODE_LABELS,
  CHAT_PROMPT_PLACEMENTS,
  chatPromptModesFor,
} from "@/utils/chatPromptPreset";
import ChatPresetEntryEditor, { type ChatPromptDraft } from "./ChatPresetEntryEditor.vue";

const props = defineProps<{ isGroupChat: boolean }>();
const emit = defineEmits<{ editing: [value: boolean] }>();

const chatVariablesStore = useChatVariablesStore();

type EditorState = { prompt: ChatLocalPrompt | null };
const editor = ref<EditorState | null>(null);
watch(editor, (value) => emit("editing", value !== null));

const prompts = computed(() => chatVariablesStore.chatPrompts);
const availableModes = computed(() => chatPromptModesFor(props.isGroupChat));

function placementLabel(prompt: ChatLocalPrompt): string {
  if (prompt.placement === "depth") return `聊天記錄裡・深度 ${prompt.depth}`;
  return CHAT_PROMPT_PLACEMENTS.find((item) => item.value === prompt.placement)?.label ?? "";
}

/** 這種聊天用得到的模式中，這個條目適用哪些 */
function modeLabels(prompt: ChatLocalPrompt): string[] {
  return availableModes.value
    .filter((mode) => prompt.modes.includes(mode))
    .map((mode) => CHAT_PROMPT_MODE_LABELS[mode]);
}

function excerpt(prompt: ChatLocalPrompt): string {
  return prompt.content.replace(/\s+/g, " ").trim();
}

function onToggle(prompt: ChatLocalPrompt, event: Event) {
  chatVariablesStore.updateChatPrompt(prompt.id, {
    enabled: (event.target as HTMLInputElement).checked,
  });
}

function onSave(draft: ChatPromptDraft) {
  const target = editor.value?.prompt;
  if (target) {
    chatVariablesStore.updateChatPrompt(target.id, draft);
  } else {
    chatVariablesStore.addChatPrompt({ ...draft, enabled: true });
  }
  editor.value = null;
}

function onDelete() {
  const target = editor.value?.prompt;
  if (target) chatVariablesStore.deleteChatPrompt(target.id);
  editor.value = null;
}
</script>

<template>
  <ChatPresetEntryEditor
    v-if="editor"
    :prompt="editor.prompt"
    :is-group-chat="isGroupChat"
    @save="onSave"
    @delete="onDelete"
    @cancel="editor = null"
  />
  <div v-else class="preset-tab">
    <p class="preset-hint">專屬條目是只加進這個聊天的提示詞，不會出現在其他聊天裡。</p>

    <div v-for="prompt in prompts" :key="prompt.id" :class="['preset-card', { off: !prompt.enabled }]">
      <button type="button" class="preset-card-main" @click="editor = { prompt }">
        <span class="preset-card-title">{{ prompt.name }}</span>
        <span class="preset-card-excerpt">{{ excerpt(prompt) }}</span>
        <span class="preset-badges">
          <span class="preset-badge">{{ placementLabel(prompt) }}</span>
          <span v-for="label in modeLabels(prompt)" :key="label" class="preset-badge muted">{{ label }}</span>
        </span>
      </button>
      <label class="preset-switch">
        <input
          type="checkbox"
          :aria-label="`啟用 ${prompt.name}`"
          :checked="prompt.enabled"
          @change="onToggle(prompt, $event)"
        />
        <span class="preset-switch-slider"></span>
      </label>
    </div>

    <p v-if="prompts.length === 0" class="preset-empty">
      還沒有專屬條目。<br />
      可以用來寫只有這段對話才成立的設定，例如「這個聊天裡，兩人正在旅行途中」。
    </p>

    <button type="button" class="preset-btn primary block" @click="editor = { prompt: null }">
      ＋ 新增專屬條目
    </button>
  </div>
</template>
