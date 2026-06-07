<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { usePromptManagerStore } from "@/stores/promptManager";
import type { ChatLocalPrompt } from "@/types/chat";
import type { PromptDefinition, PromptOrderEntry, PromptRoleType } from "@/types/promptManager";
import { CATEGORY_INFO, PromptInjectionPosition } from "@/types/promptManager";

type PromptMode = "online" | "f2f" | "gc";

interface PromptToggleEntry {
  identifier: string;
  name: string;
  description?: string;
  category: PromptDefinition["category"];
  role: PromptRoleType;
  defaultEnabled: boolean;
  prompt: PromptDefinition;
  /** 是否為聊天專屬條目 */
  isChatLocal?: boolean;
  /** 聊天專屬條目的原始資料 */
  chatLocalPrompt?: ChatLocalPrompt;
}

interface ChatPromptDraft {
  id?: string;
  name: string;
  role: PromptRoleType;
  content: string;
  injection_position: PromptInjectionPosition;
  injection_depth: number;
  injection_order: number;
  enabled: boolean;
}

const props = defineProps<{
  chatId: string;
  isGroupChat: boolean;
  faceToFaceMode: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const promptManagerStore = usePromptManagerStore();
const chatVariablesStore = useChatVariablesStore();

const modeTabs: Array<{ key: PromptMode; label: string; desc: string }> = [
  { key: "online", label: "線上模式", desc: "一般聊天提示詞開關" },
  { key: "f2f", label: "面對面模式", desc: "面對面模式提示詞開關" },
  { key: "gc", label: "群組模式", desc: "群組聊天提示詞開關" },
];

const activeMode = ref<PromptMode>(getDefaultMode());
const editingPromptId = ref<string | null>(null);
const showPromptEditor = ref(false);
const draftPrompt = ref<ChatPromptDraft>(createEmptyDraft());

const visibleTabs = computed(() => {
  if (props.isGroupChat) return modeTabs.filter((tab) => tab.key === "gc");
  return modeTabs.filter((tab) => tab.key !== "gc");
});

const activeTab = computed(() => modeTabs.find((tab) => tab.key === activeMode.value) ?? modeTabs[0]);

const promptDefinitionsByMode = computed<Record<PromptMode, PromptDefinition[]>>(() => ({
  online: promptManagerStore.prompts,
  f2f: promptManagerStore.faceToFacePrompts,
  gc: promptManagerStore.groupChatPrompts,
}));

const promptOrdersByMode = computed<Record<PromptMode, PromptOrderEntry[]>>(() => ({
  online: promptManagerStore.globalPromptOrder,
  f2f: promptManagerStore.faceToFacePromptOrder,
  gc: promptManagerStore.groupChatPromptOrder,
}));

const currentPromptEntries = computed<PromptToggleEntry[]>(() => {
  const definitions = promptDefinitionsByMode.value[activeMode.value] ?? [];
  const definitionMap = new Map(definitions.map((prompt) => [prompt.identifier, prompt]));
  const order = promptOrdersByMode.value[activeMode.value] ?? [];
  const entries: PromptToggleEntry[] = [];

  for (const entry of order) {
    const prompt = definitionMap.get(entry.identifier);
    if (!prompt || prompt.marker) continue;
    entries.push({
      identifier: entry.identifier,
      name: prompt.name || entry.identifier,
      description: prompt.description,
      category: prompt.category,
      role: prompt.role,
      defaultEnabled: entry.enabled,
      prompt,
    });
  }

  // 將聊天專屬提示詞按 injection_order 插入列表
  for (const cp of chatVariablesStore.chatPrompts) {
    entries.push({
      identifier: cp.id,
      name: cp.name,
      category: "custom",
      role: cp.role,
      defaultEnabled: cp.enabled,
      prompt: {} as PromptDefinition,
      isChatLocal: true,
      chatLocalPrompt: cp,
    });
  }

  // 按 injection_order 排序（chatLocal 條目以自身 injection_order 為準）
  const orderMap = new Map(order.map((e, i) => [e.identifier, i]));
  entries.sort((a, b) => {
    const aOrder = a.isChatLocal
      ? (a.chatLocalPrompt!.injection_order + 10000)
      : (orderMap.get(a.identifier) ?? 9999);
    const bOrder = b.isChatLocal
      ? (b.chatLocalPrompt!.injection_order + 10000)
      : (orderMap.get(b.identifier) ?? 9999);
    return aOrder - bOrder;
  });

  return entries;
});

const groupedPromptEntries = computed(() => {
  const groups = new Map<string, { key: string; label: string; entries: PromptToggleEntry[] }>();
  for (const entry of currentPromptEntries.value) {
    const info = CATEGORY_INFO[entry.category];
    // 聊天專屬條目歸入獨立群組
    const key = entry.isChatLocal ? "__chat_local__" : entry.category;
    const label = entry.isChatLocal ? "聊天專屬" : (info?.name ?? key);
    if (!groups.has(key)) {
      groups.set(key, { key, label, entries: [] });
    }
    groups.get(key)?.entries.push(entry);
  }
  // 確保聊天專屬群組排最後
  const result = Array.from(groups.values());
  const chatLocalIdx = result.findIndex((g) => g.key === "__chat_local__");
  if (chatLocalIdx > 0) result.push(result.splice(chatLocalIdx, 1)[0]);
  return result;
});

const chatPrompts = computed(() => chatVariablesStore.chatPrompts);
const validPromptIds = computed(() => [
  ...currentPromptEntries.value.map((entry) => entry.identifier),
  ...chatPrompts.value.map((prompt) => prompt.id),
]);

watch(
  () => [props.chatId, props.isGroupChat, props.faceToFaceMode] as const,
  () => {
    chatVariablesStore.initForChat(props.chatId);
    activeMode.value = getDefaultMode();
  },
  { immediate: true },
);

watch(
  validPromptIds,
  (ids) => chatVariablesStore.prunePromptToggles(ids),
  { immediate: true },
);

function getDefaultMode(): PromptMode {
  if (props.isGroupChat) return "gc";
  return props.faceToFaceMode ? "f2f" : "online";
}

function switchMode(mode: PromptMode): void {
  activeMode.value = mode;
}

function isPromptEnabled(entry: PromptToggleEntry): boolean {
  if (entry.isChatLocal) return entry.chatLocalPrompt!.enabled;
  return chatVariablesStore.getPromptToggle(entry.identifier, entry.defaultEnabled);
}

function isPromptCustomized(entry: PromptToggleEntry): boolean {
  if (entry.isChatLocal) return false;
  return Object.prototype.hasOwnProperty.call(chatVariablesStore.promptToggles, entry.identifier);
}

function setPromptEnabled(entry: PromptToggleEntry, enabled: boolean): void {
  if (entry.isChatLocal) {
    chatVariablesStore.updateChatPrompt(entry.identifier, { enabled });
    return;
  }
  chatVariablesStore.setPromptToggle(entry.identifier, enabled, entry.defaultEnabled);
}

function resetPromptToggle(entry: PromptToggleEntry): void {
  chatVariablesStore.setPromptToggle(entry.identifier, entry.defaultEnabled, entry.defaultEnabled);
}

function createEmptyDraft(): ChatPromptDraft {
  return {
    name: "",
    role: "system",
    content: "",
    injection_position: PromptInjectionPosition.RELATIVE,
    injection_depth: 0,
    injection_order: 100,
    enabled: true,
  };
}

function startCreateChatPrompt(): void {
  editingPromptId.value = null;
  draftPrompt.value = createEmptyDraft();
  showPromptEditor.value = true;
}

function startEditChatPrompt(prompt: ChatLocalPrompt): void {
  editingPromptId.value = prompt.id;
  draftPrompt.value = {
    id: prompt.id,
    name: prompt.name,
    role: prompt.role,
    content: prompt.content,
    injection_position: prompt.injection_position,
    injection_depth: prompt.injection_depth,
    injection_order: prompt.injection_order,
    enabled: prompt.enabled,
  };
  showPromptEditor.value = true;
}

function cancelEditChatPrompt(): void {
  editingPromptId.value = null;
  showPromptEditor.value = false;
  draftPrompt.value = createEmptyDraft();
}

function saveChatPrompt(): void {
  const draft = draftPrompt.value;
  if (!draft.name.trim() || !draft.content.trim()) return;

  const payload = {
    name: draft.name.trim(),
    role: draft.role,
    content: draft.content,
    injection_position: Number(draft.injection_position) as PromptInjectionPosition,
    injection_depth: Number(draft.injection_depth) || 0,
    injection_order: Number(draft.injection_order) || 0,
    enabled: draft.enabled,
  };

  if (editingPromptId.value) {
    chatVariablesStore.updateChatPrompt(editingPromptId.value, payload);
  } else {
    chatVariablesStore.addChatPrompt(payload);
  }
  cancelEditChatPrompt();
}

function setChatPromptEnabled(prompt: ChatLocalPrompt, enabled: boolean): void {
  chatVariablesStore.updateChatPrompt(prompt.id, { enabled });
}

function deleteChatPrompt(prompt: ChatLocalPrompt): void {
  if (!confirm(`確定刪除聊天專屬提示詞「${prompt.name}」？`)) return;
  chatVariablesStore.deleteChatPrompt(prompt.id);
  if (editingPromptId.value === prompt.id) cancelEditChatPrompt();
}
</script>

<template>
  <div class="chat-vars-panel-backdrop" @click.self="emit('close')">
    <aside class="chat-vars-panel" role="dialog" aria-modal="true" aria-label="聊天提示詞設定">
      <header class="panel-header">
        <div>
          <p class="panel-eyebrow">Chat Prompts</p>
          <h2>提示詞開關</h2>
          <p class="panel-subtitle">設定此聊天專屬的提示詞開關，並新增只屬於此聊天的提示詞條目。</p>
        </div>
        <button class="close-btn" type="button" title="關閉" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <nav class="mode-tabs" aria-label="提示詞模式分頁">
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          type="button"
          class="mode-tab"
          :class="{ active: activeMode === tab.key }"
          @click="switchMode(tab.key)"
        >
          <span>{{ tab.label }}</span>
          <small>{{ currentPromptEntries.length }} 個可切換提示詞</small>
        </button>
      </nav>

      <section class="vars-list">
        <div class="section-title">
          <div>
            <h3>{{ activeTab.label }}</h3>
            <p>{{ activeTab.desc }}。只保存與默認值不同的開關。</p>
          </div>
        </div>

        <template v-if="groupedPromptEntries.length > 0">
          <section v-for="group in groupedPromptEntries" :key="group.key" class="prompt-group">
            <div class="prompt-group-header">
              <h4>{{ group.label }}</h4>
              <button
                v-if="group.key === '__chat_local__'"
                type="button"
                class="mini-btn"
                @click="startCreateChatPrompt"
              >＋ 新增</button>
            </div>
            <article
              v-for="entry in group.entries"
              :key="entry.identifier"
              class="var-card prompt-card"
              :class="{
                disabled: !isPromptEnabled(entry),
                customized: isPromptCustomized(entry),
                'chat-local': entry.isChatLocal,
              }"
            >
              <div class="var-card-summary prompt-summary">
                <div class="var-card-title">
                  <div class="var-title-main">
                    <h4>{{ entry.name }}</h4>
                    <p v-if="entry.isChatLocal">
                      {{ entry.chatLocalPrompt!.role }} ·
                      {{ entry.chatLocalPrompt!.injection_position === PromptInjectionPosition.ABSOLUTE
                        ? `絕對深度 ${entry.chatLocalPrompt!.injection_depth}`
                        : `相對位置 order ${entry.chatLocalPrompt!.injection_order}` }}
                    </p>
                    <p v-else>{{ entry.description || entry.identifier }}</p>
                  </div>
                  <span v-if="entry.isChatLocal" class="chat-local-badge">聊天專屬</span>
                  <span v-else-if="isPromptCustomized(entry)" class="custom-badge">已自訂</span>
                </div>
                <div class="var-card-controls">
                  <template v-if="entry.isChatLocal">
                    <button type="button" class="mini-btn" @click="startEditChatPrompt(entry.chatLocalPrompt!)">編輯</button>
                    <button type="button" class="mini-btn danger" @click="deleteChatPrompt(entry.chatLocalPrompt!)">刪除</button>
                  </template>
                  <button
                    v-else-if="isPromptCustomized(entry)"
                    type="button"
                    class="mini-btn"
                    @click="resetPromptToggle(entry)"
                  >
                    回默認
                  </button>
                  <label class="var-switch" :title="isPromptEnabled(entry) ? '此聊天啟用' : '此聊天停用'">
                    <input
                      type="checkbox"
                      :checked="isPromptEnabled(entry)"
                      @change="setPromptEnabled(entry, ($event.target as HTMLInputElement).checked)"
                    />
                    <span></span>
                  </label>
                </div>
              </div>
            </article>

            <!-- 聊天專屬群組：若無條目顯示提示，並顯示新增按鈕 -->
            <div v-if="group.key === '__chat_local__' && group.entries.length === 0" class="empty-state compact">
              <p>尚無聊天專屬提示詞，點擊上方「＋ 新增」來建立。</p>
            </div>
          </section>
        </template>

        <!-- 完全沒有任何提示詞時的空狀態 -->
        <section v-if="groupedPromptEntries.length === 0" class="empty-state compact">
          <div class="empty-icon">P</div>
          <h3>沒有可切換提示詞</h3>
          <p>目前 {{ activeTab.label }} 沒有非 Marker 提示詞條目。</p>
        </section>

        <!-- 沒有系統提示詞但有聊天專屬的情況：顯示新增按鈕 -->
        <section v-if="groupedPromptEntries.length === 0 || !groupedPromptEntries.find(g => g.key === '__chat_local__')" class="local-prompts-add">
          <button type="button" class="ghost-btn" @click="startCreateChatPrompt">＋ 新增聊天專屬提示詞</button>
        </section>

        <!-- 聊天專屬提示詞編輯表單 -->
        <form v-if="showPromptEditor" class="local-prompt-editor" @submit.prevent="saveChatPrompt">
          <label>
            <span>名稱</span>
            <input v-model="draftPrompt.name" type="text" placeholder="例如：此聊天特殊規則" required />
          </label>
          <label>
            <span>角色</span>
            <select v-model="draftPrompt.role">
              <option value="system">system</option>
              <option value="user">user</option>
              <option value="assistant">assistant</option>
            </select>
          </label>
          <label>
            <span>注入位置</span>
            <select v-model.number="draftPrompt.injection_position">
              <option :value="PromptInjectionPosition.RELATIVE">相對位置</option>
              <option :value="PromptInjectionPosition.ABSOLUTE">絕對深度</option>
            </select>
          </label>
          <label v-if="draftPrompt.injection_position === PromptInjectionPosition.ABSOLUTE">
            <span>深度</span>
            <input v-model.number="draftPrompt.injection_depth" type="number" min="0" />
          </label>
          <label>
            <span>排序 (order)</span>
            <input v-model.number="draftPrompt.injection_order" type="number" />
          </label>
          <label class="full-row">
            <span>內容</span>
            <textarea v-model="draftPrompt.content" rows="8" placeholder="輸入此聊天專屬提示詞內容" required></textarea>
          </label>
          <label class="inline-check full-row">
            <input v-model="draftPrompt.enabled" type="checkbox" />
            <span>保存後立即啟用</span>
          </label>
          <div class="var-actions full-row">
            <span class="save-status">{{ editingPromptId ? '正在編輯聊天專屬條目' : '新增聊天專屬條目' }}</span>
            <div class="var-buttons">
              <button type="button" class="ghost-btn" @click="cancelEditChatPrompt">取消</button>
              <button type="submit" class="primary-btn">保存</button>
            </div>
          </div>
        </form>
      </section>

      <footer class="panel-footer">
        <span class="save-status saved">變更會自動保存到此聊天</span>
        <button type="button" class="ghost-btn" @click="emit('close')">關閉</button>
      </footer>
    </aside>
  </div>
</template>

<style lang="scss" scoped>
.chat-vars-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2200;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
  background: rgba(10, 10, 12, 0.42);
  backdrop-filter: blur(10px);
}

.chat-vars-panel {
  width: min(920px, 100%);
  height: min(860px, calc(100vh - 48px));
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.18), transparent 34%),
    rgba(252, 248, 242, 0.94);
  color: #3c332b;
  box-shadow: 0 26px 90px rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 30px;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  padding: 28px 24px 18px;
  border-bottom: 1px solid rgba(92, 72, 55, 0.12);

  h2 {
    margin: 4px 0 6px;
    font-size: 1.55rem;
    font-weight: 800;
    letter-spacing: 0.03em;
  }
}

.panel-eyebrow {
  margin: 0;
  color: rgba(90, 68, 46, 0.62);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.panel-subtitle {
  margin: 0;
  color: rgba(62, 48, 36, 0.64);
  font-size: 0.9rem;
}

.close-btn {
  width: 40px;
  height: 40px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: #5c4636;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 8px 24px rgba(83, 64, 44, 0.12);

  svg {
    width: 20px;
    height: 20px;
  }
}

.mode-tabs {
  display: flex;
  gap: 10px;
  padding: 16px 20px 10px;
  overflow-x: auto;
}

.mode-tab {
  min-width: 150px;
  padding: 12px 14px;
  border: 1px solid rgba(97, 75, 55, 0.12);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.52);
  color: rgba(63, 48, 37, 0.72);
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, background 0.18s ease, border-color 0.18s ease;

  span,
  small {
    display: block;
  }

  span {
    font-weight: 700;
    font-size: 0.92rem;
  }

  small {
    margin-top: 4px;
    font-size: 0.74rem;
    color: rgba(62, 48, 36, 0.52);
  }

  &.active {
    background: linear-gradient(135deg, rgba(119, 84, 54, 0.95), rgba(168, 123, 82, 0.9));
    border-color: rgba(114, 80, 51, 0.35);
    color: #fff;
    box-shadow: 0 10px 28px rgba(106, 75, 47, 0.24);

    small {
      color: rgba(255, 255, 255, 0.78);
    }
  }

  &:hover {
    transform: translateY(-1px);
  }
}

.vars-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 12px;
}

.section-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin: 12px 0;

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    font-weight: 800;
  }

  p {
    margin-top: 4px;
    color: rgba(62, 48, 36, 0.58);
    font-size: 0.82rem;
  }
}

.prompt-group {
  margin-bottom: 14px;
}

.prompt-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  h4 {
    margin: 0;
    color: rgba(63, 48, 37, 0.72);
    font-size: 0.82rem;
    font-weight: 800;
  }
}

.var-card {
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(92, 72, 55, 0.1);
  box-shadow: 0 6px 18px rgba(92, 72, 55, 0.06);
  overflow: hidden;
  transition: opacity 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;

  & + & {
    margin-top: 8px;
  }

  &.disabled {
    opacity: 0.62;
  }

  &.customized {
    border-color: rgba(143, 101, 63, 0.28);
    box-shadow: 0 8px 24px rgba(92, 72, 55, 0.1);
  }

  &.chat-local {
    border-color: rgba(63, 101, 143, 0.26);
    background: rgba(240, 246, 255, 0.72);
  }
}

.var-card-summary {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 12px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}

.var-card-title {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;

  h4,
  p {
    margin: 0;
  }
}

.var-title-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;

  h4 {
    font-size: 0.88rem;
    font-weight: 700;
    white-space: nowrap;
  }

  p {
    color: rgba(62, 48, 36, 0.55);
    font-size: 0.72rem;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.var-card-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.custom-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(143, 101, 63, 0.12);
  color: rgba(92, 61, 37, 0.86);
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
}

.chat-local-badge {
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(63, 101, 143, 0.12);
  color: rgba(37, 61, 92, 0.86);
  font-size: 0.7rem;
  font-weight: 800;
  white-space: nowrap;
}

.local-prompts-add {
  padding: 8px 0;
  text-align: center;
}

.var-switch {
  position: relative;
  width: 40px;
  height: 22px;
  display: inline-block;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: rgba(92, 72, 55, 0.18);
    transition: background 0.18s ease;

    &::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #fff;
      box-shadow: 0 2px 8px rgba(65, 49, 36, 0.18);
      transition: transform 0.18s ease;
    }
  }

  input:checked + span {
    background: linear-gradient(135deg, #6f4d33, #a47751);

    &::after {
      transform: translateX(18px);
    }
  }
}

.local-prompt-editor {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(92, 72, 55, 0.12);

  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    color: rgba(63, 48, 37, 0.72);
    font-size: 0.78rem;
    font-weight: 700;
  }

  input,
  select,
  textarea {
    width: 100%;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(94, 74, 55, 0.16);
    background: rgba(255, 252, 248, 0.9);
    color: #342b24;
    line-height: 1.5;
    font: inherit;
    outline: none;

    &:focus {
      border-color: rgba(143, 101, 63, 0.48);
      box-shadow: 0 0 0 3px rgba(143, 101, 63, 0.12);
    }
  }

  textarea {
    min-height: 130px;
    resize: vertical;
  }
}

.full-row {
  grid-column: 1 / -1;
}

.inline-check {
  flex-direction: row !important;
  align-items: center;

  input {
    width: auto;
  }
}

.var-actions,
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.var-buttons {
  display: flex;
  gap: 8px;
}

.save-status {
  color: rgba(62, 48, 36, 0.46);
  font-size: 0.78rem;

  &.saved {
    color: #4d8d5b;
  }
}

.ghost-btn,
.primary-btn,
.mini-btn {
  border: 0;
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.16s ease, opacity 0.16s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }
}

.mini-btn {
  padding: 6px 10px;
  background: rgba(103, 78, 56, 0.08);
  color: rgba(63, 48, 37, 0.72);
  font-size: 0.72rem;

  &.danger {
    background: rgba(176, 65, 65, 0.1);
    color: #a34040;
  }
}

.ghost-btn {
  background: rgba(103, 78, 56, 0.08);
  color: rgba(63, 48, 37, 0.72);
}

.primary-btn {
  background: linear-gradient(135deg, #6f4d33, #a47751);
  color: #fff;
  box-shadow: 0 8px 22px rgba(106, 75, 47, 0.22);
}

.empty-state {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 30px;
  text-align: center;
  color: rgba(62, 48, 36, 0.62);

  &.compact {
    padding: 18px;
  }

  h3,
  p {
    margin: 0;
  }
}

.empty-icon {
  width: 64px;
  height: 64px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  background: rgba(104, 78, 55, 0.08);
  color: rgba(72, 54, 39, 0.56);
  font-weight: 900;
}

.panel-footer {
  padding: 16px 20px calc(16px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(92, 72, 55, 0.12);
  background: rgba(252, 248, 242, 0.82);
}

@media (max-width: 560px) {
  .chat-vars-panel-backdrop {
    padding: 0;
    align-items: stretch;
  }

  .chat-vars-panel {
    width: 100vw;
    height: 100vh;
    border-radius: 0;
  }

  .panel-header {
    padding: 24px 18px 16px;
  }

  .mode-tabs,
  .vars-list,
  .panel-footer {
    padding-left: 16px;
    padding-right: 16px;
  }

  .var-card-summary,
  .section-title,
  .var-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .var-card-controls {
    justify-content: space-between;
  }

  .local-prompt-editor {
    grid-template-columns: 1fr;
  }

  .var-buttons {
    justify-content: flex-end;
  }
}
</style>
