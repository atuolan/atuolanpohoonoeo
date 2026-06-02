<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useChatVariablesStore } from "@/stores/chatVariables";
import { usePromptManagerStore } from "@/stores/promptManager";
import type { PromptDefinition } from "@/types/promptManager";

type VarMode = "online" | "f2f" | "gc";

interface ChatVarEntry {
  name: string;
  defaultValue: string;
  scopedKey: string;
  promptNames: string[];
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

const modeTabs: Array<{ key: VarMode; label: string; desc: string }> = [
  { key: "online", label: "線上模式", desc: "一般聊天提示詞中的變量" },
  { key: "f2f", label: "面對面模式", desc: "面對面模式提示詞中的變量" },
  { key: "gc", label: "群組模式", desc: "群組聊天提示詞中的變量" },
];

const activeMode = ref<VarMode>(getDefaultMode());
const draftValues = ref<Record<string, string>>({});
const savedKeys = ref<Record<string, boolean>>({});
const expandedKeys = ref<Record<string, boolean>>({});
const editorRefs = ref<Record<string, HTMLTextAreaElement | null>>({});

const visibleTabs = computed(() => {
  if (props.isGroupChat) return modeTabs.filter((tab) => tab.key === "gc");
  return modeTabs.filter((tab) => tab.key !== "gc");
});

const activeTab = computed(() => modeTabs.find((tab) => tab.key === activeMode.value) ?? modeTabs[0]);

const promptDefinitionsByMode = computed<Record<VarMode, PromptDefinition[]>>(() => ({
  online: promptManagerStore.prompts,
  f2f: promptManagerStore.faceToFacePrompts,
  gc: promptManagerStore.groupChatPrompts,
}));

const entriesByMode = computed<Record<VarMode, ChatVarEntry[]>>(() => ({
  online: extractDefineVarEntries(promptDefinitionsByMode.value.online, "online"),
  f2f: extractDefineVarEntries(promptDefinitionsByMode.value.f2f, "f2f"),
  gc: extractDefineVarEntries(promptDefinitionsByMode.value.gc, "gc"),
}));

const currentEntries = computed(() => entriesByMode.value[activeMode.value] ?? []);
const hasEntries = computed(() => currentEntries.value.length > 0);

watch(
  () => [props.chatId, props.isGroupChat, props.faceToFaceMode] as const,
  () => {
    chatVariablesStore.initForChat(props.chatId);
    activeMode.value = getDefaultMode();
    syncDraftValues();
  },
  { immediate: true },
);

watch(
  currentEntries,
  () => syncDraftValues(),
  { immediate: true },
);

watch(
  () => chatVariablesStore.localVars,
  () => syncDraftValues(),
  { deep: true },
);

function getDefaultMode(): VarMode {
  if (props.isGroupChat) return "gc";
  return props.faceToFaceMode ? "f2f" : "online";
}

function scopedVarKey(mode: VarMode, name: string): string {
  return `${mode}__${name.trim()}`;
}

function extractDefineVarEntries(prompts: PromptDefinition[], mode: VarMode): ChatVarEntry[] {
  const entries = new Map<string, ChatVarEntry>();
  const defineVarPattern = /\{\{setvar::([^:}]+)::([\s\S]*?)\}\}/gu;

  for (const prompt of prompts) {
    const content = prompt.content ?? "";
    defineVarPattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = defineVarPattern.exec(content)) !== null) {
      const name = (match[1] ?? "").trim();
      if (!name) continue;

      const defaultValue = match[2] ?? "";
      const scopedKey = scopedVarKey(mode, name);
      const promptName = prompt.name || prompt.identifier || "未命名提示詞";
      const existing = entries.get(scopedKey);

      if (existing) {
        if (!existing.promptNames.includes(promptName)) {
          existing.promptNames.push(promptName);
        }
        if (existing.defaultValue.trim() === "" && defaultValue.trim() !== "") {
          existing.defaultValue = defaultValue;
        }
        continue;
      }

      entries.set(scopedKey, {
        name,
        defaultValue,
        scopedKey,
        promptNames: [promptName],
      });
    }
  }

  return Array.from(entries.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
}

function overrideKey(scopedKey: string): string {
  return `__override__${scopedKey}`;
}

function overrideSetKey(scopedKey: string): string {
  return `__override_set__${scopedKey}`;
}

function globalEnabledKey(scopedKey: string): string {
  return `__global_enabled__${scopedKey}`;
}

function enabledKey(scopedKey: string): string {
  return `__enabled__${scopedKey}`;
}

function clearOverride(entry: ChatVarEntry): void {
  chatVariablesStore.setLocal(overrideKey(entry.scopedKey), "");
  chatVariablesStore.setLocal(overrideSetKey(entry.scopedKey), "");
}

function getGlobalOverrideValue(entry: ChatVarEntry): string {
  const scopedOverrideSet = chatVariablesStore.getGlobal(overrideSetKey(entry.scopedKey)) === "1";
  if (scopedOverrideSet) return chatVariablesStore.getGlobal(overrideKey(entry.scopedKey));

  const scopedValue = chatVariablesStore.getGlobal(entry.scopedKey);
  if (scopedValue !== "") return scopedValue;

  const rawValue = chatVariablesStore.getGlobal(entry.name);
  return rawValue;
}

function getInheritedValue(entry: ChatVarEntry): string {
  const globalValue = getGlobalOverrideValue(entry);
  return globalValue !== "" ? globalValue : entry.defaultValue;
}

function getStoredOrDefaultValue(entry: ChatVarEntry): string {
  const hasOverride = chatVariablesStore.getLocal(overrideSetKey(entry.scopedKey)) === "1";
  const saved = chatVariablesStore.getLocal(overrideKey(entry.scopedKey));
  const inheritedValue = getInheritedValue(entry);

  // 舊版本可能因為空白 textarea 失焦而誤存「空白覆蓋值」。
  // 若全局或提示詞本身有預設內容，就自動清掉這個空白覆蓋，回到繼承值。
  if (hasOverride && saved === "" && inheritedValue.trim() !== "") {
    clearOverride(entry);
    return inheritedValue;
  }

  return hasOverride ? saved : inheritedValue;
}

function syncDraftValues(): void {
  const nextDrafts = { ...draftValues.value };

  for (const entries of Object.values(entriesByMode.value)) {
    for (const entry of entries) {
      if (savedKeys.value[entry.scopedKey] === false) continue;
      nextDrafts[entry.scopedKey] = getStoredOrDefaultValue(entry);
    }
  }

  draftValues.value = nextDrafts;
}

function getDraftValue(entry: ChatVarEntry): string {
  // 总是返回最新的值
  const value = getStoredOrDefaultValue(entry);
  if (!(entry.scopedKey in draftValues.value)) {
    draftValues.value[entry.scopedKey] = value;
  }
  return draftValues.value[entry.scopedKey] ?? value;
}

function updateDraftValue(entry: ChatVarEntry, value: string): void {
  draftValues.value = {
    ...draftValues.value,
    [entry.scopedKey]: value,
  };
  savedKeys.value = {
    ...savedKeys.value,
    [entry.scopedKey]: false,
  };
}

function saveEntry(entry: ChatVarEntry): void {
  const value = getDraftValue(entry);
  const inheritedValue = getInheritedValue(entry);
  if (value === inheritedValue || (value === "" && inheritedValue.trim() !== "")) {
    clearOverride(entry);
    draftValues.value = { ...draftValues.value, [entry.scopedKey]: inheritedValue };
  } else {
    chatVariablesStore.setLocal(overrideKey(entry.scopedKey), value);
    chatVariablesStore.setLocal(overrideSetKey(entry.scopedKey), "1");
  }
  savedKeys.value = { ...savedKeys.value, [entry.scopedKey]: true };
}

function resetEntry(entry: ChatVarEntry): void {
  const inheritedValue = getInheritedValue(entry);
  draftValues.value = { ...draftValues.value, [entry.scopedKey]: inheritedValue };
  clearOverride(entry);
  savedKeys.value = { ...savedKeys.value, [entry.scopedKey]: true };
}

function saveAll(): void {
  for (const entry of currentEntries.value) {
    saveEntry(entry);
  }
}

function switchMode(mode: VarMode): void {
  activeMode.value = mode;
  syncDraftValues();
}

function isExpanded(entry: ChatVarEntry): boolean {
  return expandedKeys.value[entry.scopedKey] === true;
}

function setEditorRef(entry: ChatVarEntry, el: unknown): void {
  editorRefs.value[entry.scopedKey] = el instanceof HTMLTextAreaElement ? el : null;
}

async function toggleEditor(entry: ChatVarEntry): Promise<void> {
  const shouldOpen = !isExpanded(entry);
  expandedKeys.value = {
    ...expandedKeys.value,
    [entry.scopedKey]: shouldOpen,
  };

  if (!shouldOpen) return;
  await nextTick();
  editorRefs.value[entry.scopedKey]?.focus();
}

function isEntryEnabled(entry: ChatVarEntry): boolean {
  const localValue = chatVariablesStore.getLocal(enabledKey(entry.scopedKey));
  
  // 如果当前聊天没有设置，则使用全局设置
  if (localValue === "") {
    const globalValue = chatVariablesStore.getGlobal(globalEnabledKey(entry.scopedKey));
    // 如果全局也没有设置，默认启用
    return globalValue !== "0";
  }
  
  return localValue !== "0";
}

function setEntryEnabled(entry: ChatVarEntry, enabled: boolean): void {
  chatVariablesStore.setLocal(enabledKey(entry.scopedKey), enabled ? "1" : "0");
}

function isUsingGlobalSetting(entry: ChatVarEntry): boolean {
  return chatVariablesStore.getLocal(enabledKey(entry.scopedKey)) === "";
}

function setGlobalEnabled(entry: ChatVarEntry, enabled: boolean): void {
  chatVariablesStore.setGlobal(globalEnabledKey(entry.scopedKey), enabled ? "1" : "0");
  // 同时清除所有聊天的局部设置，使其继承全局设置
  // 注意：这里只清除当前聊天的设置
  chatVariablesStore.setLocal(enabledKey(entry.scopedKey), "");
}
</script>

<template>
  <div class="chat-vars-panel-backdrop" @click.self="emit('close')">
    <aside class="chat-vars-panel" role="dialog" aria-modal="true" aria-label="聊天變量設定">
      <header class="panel-header">
        <div>
          <p class="panel-eyebrow">Chat Variables</p>
          <h2>變量設定</h2>
          <p class="panel-subtitle">編輯此聊天在不同模式下的提示詞變量。</p>
        </div>
        <button class="close-btn" type="button" title="關閉" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </header>

      <nav class="mode-tabs" aria-label="變量模式分頁">
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          type="button"
          class="mode-tab"
          :class="{ active: activeMode === tab.key }"
          @click="switchMode(tab.key)"
        >
          <span>{{ tab.label }}</span>
          <small>{{ entriesByMode[tab.key].length }} 個條目</small>
        </button>
      </nav>

      <section v-if="hasEntries" class="vars-list">
        <article
          v-for="entry in currentEntries"
          :key="entry.scopedKey"
          class="var-card"
          :class="{ expanded: isExpanded(entry), disabled: !isEntryEnabled(entry) }"
        >
          <div
            class="var-card-summary"
            role="button"
            tabindex="0"
            @click="toggleEditor(entry)"
            @keydown.enter.prevent="toggleEditor(entry)"
            @keydown.space.prevent="toggleEditor(entry)"
          >
            <div class="var-card-title">
              <div class="var-title-main">
                <h4>{{ entry.name }}</h4>
                <p>來源：{{ entry.promptNames.join('、') }}</p>
              </div>
              <span class="var-key">{{ entry.scopedKey }}</span>
            </div>
            <div class="var-card-controls">
              <label
                class="var-switch"
                :class="{ 'using-global': isUsingGlobalSetting(entry) }"
                :title="isUsingGlobalSetting(entry) ? '遵循全局設定' : (isEntryEnabled(entry) ? '此聊天啟用' : '此聊天停用')"
                @click.stop
                @keydown.stop
              >
                <input
                  type="checkbox"
                  :checked="isEntryEnabled(entry)"
                  @change="setEntryEnabled(entry, ($event.target as HTMLInputElement).checked)"
                />
                <span></span>
              </label>
              <span class="expand-icon">{{ isExpanded(entry) ? '收起' : '編輯' }}</span>
            </div>
          </div>

          <div v-if="isExpanded(entry)" class="var-editor">
            <textarea
              :ref="(el) => setEditorRef(entry, el)"
              :value="getDraftValue(entry)"
              rows="6"
              spellcheck="false"
              :disabled="!isEntryEnabled(entry)"
              @input="updateDraftValue(entry, ($event.target as HTMLTextAreaElement).value)"
              @blur="saveEntry(entry)"
            ></textarea>

            <div class="var-actions">
              <span class="save-status" :class="{ saved: savedKeys[entry.scopedKey] }">
                {{ savedKeys[entry.scopedKey] ? '已保存' : '失焦自動保存' }}
              </span>
              <div class="var-buttons">
                <button type="button" class="ghost-btn" @click="resetEntry(entry)">重置預設</button>
                <button type="button" class="primary-btn" :disabled="!isEntryEnabled(entry)" @click="saveEntry(entry)">保存</button>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section v-else class="empty-state">
        <div class="empty-icon">{{ '{ }' }}</div>
        <h3>沒有找到變量條目</h3>
        <p>目前 {{ activeTab.label }} 的提示詞中沒有 <code>setvar</code> 條目。</p>
      </section>

      <footer class="panel-footer">
        <button type="button" class="ghost-btn" @click="emit('close')">關閉</button>
        <button type="button" class="primary-btn" :disabled="!hasEntries" @click="saveAll">保存全部</button>
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
  width: min(860px, 100%);
  height: min(820px, calc(100vh - 48px));
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
  min-width: 130px;
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

  &.expanded {
    border-color: rgba(143, 101, 63, 0.24);
    box-shadow: 0 8px 24px rgba(92, 72, 55, 0.1);
  }

  &.disabled {
    opacity: 0.62;
  }

  textarea {
    width: 100%;
    min-height: 90px;
    padding: 10px 12px;
    resize: vertical;
    border-radius: 12px;
    border: 1px solid rgba(94, 74, 55, 0.16);
    background: rgba(255, 252, 248, 0.9);
    color: #342b24;
    line-height: 1.5;
    font-size: 0.9rem;
    font: inherit;
    outline: none;

    &:focus {
      border-color: rgba(143, 101, 63, 0.48);
      box-shadow: 0 0 0 3px rgba(143, 101, 63, 0.12);
    }

    &:disabled {
      cursor: not-allowed;
      background: rgba(238, 232, 225, 0.72);
      color: rgba(52, 43, 36, 0.48);
    }
  }
}

.var-card-summary {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
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
    font-size: 0.7rem;
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

.var-editor {
  padding: 0 14px 12px;
}

.var-key {
  display: none;
}

.expand-icon {
  min-width: 36px;
  padding: 5px 8px;
  border-radius: 999px;
  background: rgba(103, 78, 56, 0.08);
  color: rgba(63, 48, 37, 0.72);
  font-size: 0.72rem;
  font-weight: 700;
  text-align: center;
  line-height: 1.2;
}

.var-switch {
  position: relative;
  width: 40px;
  height: 22px;
  display: inline-block;
  cursor: pointer;

  &.using-global span {
    background: rgba(100, 140, 200, 0.3);
    
    &::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 999px;
      border: 2px dashed rgba(100, 140, 200, 0.4);
      pointer-events: none;
    }
  }

  &.using-global input:checked + span {
    background: linear-gradient(135deg, rgba(100, 140, 200, 0.7), rgba(100, 140, 200, 0.85));
  }

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

.var-actions,
.panel-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.var-actions {
  margin-top: 10px;
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
.primary-btn {
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
  flex: 1;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 30px;
  text-align: center;
  color: rgba(62, 48, 36, 0.62);

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
  .var-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .var-card-controls {
    justify-content: space-between;
  }

  .var-key {
    max-width: 100%;
  }

  .var-buttons {
    justify-content: flex-end;
  }
}
</style>
