<!-- src/components/modals/chat-preset/ChatPresetEntryEditor.vue -->
<script setup lang="ts">
/**
 * 單一專屬條目編輯器：名稱、內容、放置位置、適用模式，以及進階的發送身分與深度
 */
import { computed, ref } from "vue";
import { ChevronLeft } from "lucide-vue-next";
import type { ChatLocalPrompt, ChatPromptMode, ChatPromptPlacement } from "@/types/chat";
import type { PromptRoleType } from "@/types/promptManager";
import {
  CHAT_PROMPT_MODE_LABELS,
  CHAT_PROMPT_PLACEMENTS,
  chatPromptModesFor,
  defaultChatPromptModes,
} from "@/utils/chatPromptPreset";

/** 編輯器交出的內容（啟用狀態不在這裡改，由列表上的開關控制） */
export type ChatPromptDraft = Pick<
  ChatLocalPrompt,
  "name" | "role" | "content" | "placement" | "depth" | "modes"
>;

const props = defineProps<{ prompt: ChatLocalPrompt | null; isGroupChat: boolean }>();
const emit = defineEmits<{ save: [draft: ChatPromptDraft]; delete: []; cancel: [] }>();

const ROLES: { value: PromptRoleType; label: string }[] = [
  { value: "system", label: "系統" },
  { value: "user", label: "使用者" },
  { value: "assistant", label: "角色" },
];

function initialDraft(): ChatPromptDraft {
  const source = props.prompt;
  if (source) {
    return {
      name: source.name,
      role: source.role,
      content: source.content,
      placement: source.placement,
      depth: source.depth,
      modes: [...source.modes],
    };
  }
  return {
    name: "",
    role: "system",
    content: "",
    placement: "end",
    depth: 0,
    modes: defaultChatPromptModes(props.isGroupChat),
  };
}

const draft = ref<ChatPromptDraft>(initialDraft());
const original = JSON.stringify(draft.value);
const isDirty = computed(() => JSON.stringify(draft.value) !== original);

// 已經用到進階設定的條目，打開時直接展開，不要把生效中的設定藏起來
const showAdvanced = ref(draft.value.role !== "system" || draft.value.placement === "depth");

const availableModes = computed(() => chatPromptModesFor(props.isGroupChat));
const placementOptions = computed(() =>
  CHAT_PROMPT_PLACEMENTS.filter((item) => !item.advanced || showAdvanced.value),
);

function setPlacement(value: ChatPromptPlacement) {
  draft.value.placement = value;
}

function toggleMode(mode: ChatPromptMode) {
  const modes = draft.value.modes;
  draft.value.modes = modes.includes(mode) ? modes.filter((m) => m !== mode) : [...modes, mode];
}

/** 這種聊天用得到的模式裡至少要選一個，否則條目永遠不會生效 */
const hasUsableMode = computed(() =>
  availableModes.value.some((mode) => draft.value.modes.includes(mode)),
);
const canSave = computed(() => draft.value.content.trim() !== "" && hasUsableMode.value);

function save() {
  if (!canSave.value) return;
  const content = draft.value.content;
  const depth = Math.floor(Number(draft.value.depth));
  emit("save", {
    ...draft.value,
    // 沒取名就用內容開頭當名稱
    name: draft.value.name.trim() || content.trim().replace(/\s+/g, " ").slice(0, 12),
    depth: Number.isFinite(depth) && depth > 0 ? depth : 0,
    modes: [...draft.value.modes],
  });
}

function cancel() {
  if (isDirty.value && !confirm("放棄未儲存的變更？")) return;
  emit("cancel");
}

function remove() {
  if (!props.prompt) return;
  if (!confirm(`刪除專屬條目「${props.prompt.name}」？`)) return;
  emit("delete");
}
</script>

<template>
  <div class="preset-tab">
    <div class="preset-editor-head">
      <button type="button" class="preset-icon-btn" aria-label="返回" @click="cancel">
        <ChevronLeft :size="20" />
      </button>
      <span>{{ prompt ? "編輯專屬條目" : "新增專屬條目" }}</span>
    </div>

    <div class="preset-field">
      <label class="preset-field-label" for="preset-entry-content">內容</label>
      <textarea
        id="preset-entry-content"
        v-model="draft.content"
        class="preset-input"
        placeholder="寫下只在這個聊天成立的設定或規則"
      ></textarea>
    </div>

    <div class="preset-field">
      <label class="preset-field-label" for="preset-entry-name">名稱（可不填）</label>
      <input
        id="preset-entry-name"
        v-model="draft.name"
        class="preset-input"
        placeholder="不填會用內容開頭當名稱"
      />
    </div>

    <div class="preset-field">
      <span class="preset-field-label">放在哪裡</span>
      <div class="preset-options">
        <button
          v-for="item in placementOptions"
          :key="item.value"
          type="button"
          class="preset-option"
          :aria-pressed="draft.placement === item.value"
          @click="setPlacement(item.value)"
        >
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </button>
      </div>
      <template v-if="draft.placement === 'depth'">
        <label class="preset-depth">
          深度
          <input v-model.number="draft.depth" class="preset-input" type="number" min="0" inputmode="numeric" />
        </label>
        <p class="preset-hint">0 = 最新一則訊息之後；N = 從最新往前數第 N 則之前</p>
      </template>
    </div>

    <div class="preset-field">
      <span class="preset-field-label">在哪些模式生效</span>
      <div class="preset-row-line">
        <button
          v-for="mode in availableModes"
          :key="mode"
          type="button"
          :class="['preset-chip', { active: draft.modes.includes(mode) }]"
          :aria-pressed="draft.modes.includes(mode)"
          @click="toggleMode(mode)"
        >
          {{ CHAT_PROMPT_MODE_LABELS[mode] }}
        </button>
      </div>
      <p v-if="!hasUsableMode" class="preset-hint">至少要選一個模式，條目才會生效。</p>
    </div>

    <button v-if="!showAdvanced" type="button" class="preset-link start" @click="showAdvanced = true">
      進階設定（發送身分、插入聊天記錄裡）
    </button>
    <div v-else class="preset-field">
      <span class="preset-field-label">以誰的身分送出</span>
      <div class="preset-row-line">
        <button
          v-for="role in ROLES"
          :key="role.value"
          type="button"
          :class="['preset-chip', { active: draft.role === role.value }]"
          :aria-pressed="draft.role === role.value"
          @click="draft.role = role.value"
        >
          {{ role.label }}
        </button>
      </div>
      <p class="preset-hint">一般用「系統」即可。</p>
    </div>

    <div class="preset-editor-footer">
      <button v-if="prompt" type="button" class="preset-btn danger" @click="remove">刪除</button>
      <span class="spacer"></span>
      <button type="button" class="preset-btn" @click="cancel">取消</button>
      <button type="button" class="preset-btn primary" :disabled="!canSave" @click="save">儲存</button>
    </div>
  </div>
</template>
