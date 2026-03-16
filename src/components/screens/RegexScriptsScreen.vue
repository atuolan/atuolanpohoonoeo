<script setup lang="ts">
/**
 * 全域 Regex 腳本管理頁面
 * 相容 SillyTavern regex JSON 格式，支援導入/導出
 */

import { regex_placement, regexFromString } from "@/services/RegexEngine";
import { useRegexScriptsStore } from "@/stores/regexScripts";
import type { RegexScript } from "@/types/character";
import { computed, onMounted, ref } from "vue";

const emit = defineEmits<{ (e: "back"): void }>();

const store = useRegexScriptsStore();
onMounted(() => store.init());

// ===== 編輯彈窗 =====
const showModal = ref(false);
const editingId = ref<string | null>(null);

// 表單欄位
const fName = ref("");
const fFindRegex = ref("");
const fReplaceString = ref("");
const fTrimStrings = ref(""); // 換行分隔
const fPlacementUser = ref(true);
const fPlacementAI = ref(true);
const fPlacementSlash = ref(false);
const fPlacementWorldInfo = ref(false);
const fDisabled = ref(false);
const fMarkdownOnly = ref(false);
const fPromptOnly = ref(false);
const fRunOnEdit = ref(false);
const fSubstituteRegex = ref(0);
const fMinDepth = ref<number | "">("");
const fMaxDepth = ref<number | "">("");

// 展開編輯器
const expandReplace = ref(false);

// 正則驗證
const regexError = ref("");

function validateRegex() {
  if (!fFindRegex.value) {
    regexError.value = "";
    return;
  }
  const r = regexFromString(fFindRegex.value);
  regexError.value = r ? "" : "正則表達式格式無效";
}

// 預覽
const previewInput = ref("");
const previewResult = computed(() => {
  if (!previewInput.value || !fFindRegex.value || regexError.value) return "";
  try {
    const r = regexFromString(fFindRegex.value);
    if (!r) return "";
    return previewInput.value.replace(
      r,
      fReplaceString.value.replace(/\{\{match\}\}/gi, "$&"),
    );
  } catch {
    return "";
  }
});

function openNew() {
  editingId.value = null;
  fName.value = "";
  fFindRegex.value = "";
  fReplaceString.value = "";
  fTrimStrings.value = "";
  fPlacementUser.value = true;
  fPlacementAI.value = true;
  fPlacementSlash.value = false;
  fPlacementWorldInfo.value = false;
  fDisabled.value = false;
  fMarkdownOnly.value = false;
  fPromptOnly.value = false;
  fRunOnEdit.value = false;
  fSubstituteRegex.value = 0;
  fMinDepth.value = "";
  fMaxDepth.value = "";
  regexError.value = "";
  previewInput.value = "";
  showModal.value = true;
}

function openEdit(script: RegexScript) {
  editingId.value = script.id;
  fName.value = script.scriptName;
  fFindRegex.value = script.findRegex;
  fReplaceString.value = script.replaceString;
  fTrimStrings.value = (script.trimStrings ?? []).join("\n");
  fPlacementUser.value =
    script.placement?.includes(regex_placement.USER_INPUT) ?? false;
  fPlacementAI.value =
    script.placement?.includes(regex_placement.AI_OUTPUT) ?? false;
  fPlacementSlash.value =
    script.placement?.includes(regex_placement.SLASH_COMMAND) ?? false;
  fPlacementWorldInfo.value =
    script.placement?.includes(regex_placement.WORLD_INFO) ?? false;
  fDisabled.value = script.disabled ?? false;
  fMarkdownOnly.value = script.markdownOnly ?? false;
  fPromptOnly.value = script.promptOnly ?? false;
  fRunOnEdit.value = script.runOnEdit ?? false;
  fSubstituteRegex.value = script.substituteRegex ?? 0;
  fMinDepth.value =
    script.minDepth != null && script.minDepth >= 0 ? script.minDepth : "";
  fMaxDepth.value =
    script.maxDepth != null && script.maxDepth >= 0 ? script.maxDepth : "";
  regexError.value = "";
  previewInput.value = "";
  showModal.value = true;
}

async function saveScript() {
  if (!fName.value.trim()) return;
  validateRegex();
  if (regexError.value) return;

  const placement: number[] = [];
  if (fPlacementUser.value) placement.push(regex_placement.USER_INPUT);
  if (fPlacementAI.value) placement.push(regex_placement.AI_OUTPUT);
  if (fPlacementSlash.value) placement.push(regex_placement.SLASH_COMMAND);
  if (fPlacementWorldInfo.value) placement.push(regex_placement.WORLD_INFO);

  const data: Omit<RegexScript, "id"> = {
    scriptName: fName.value.trim(),
    findRegex: fFindRegex.value,
    replaceString: fReplaceString.value,
    trimStrings: fTrimStrings.value
      ? fTrimStrings.value.split("\n").filter(Boolean)
      : [],
    placement,
    disabled: fDisabled.value,
    markdownOnly: fMarkdownOnly.value,
    promptOnly: fPromptOnly.value,
    runOnEdit: fRunOnEdit.value,
    substituteRegex: fSubstituteRegex.value,
    minDepth: fMinDepth.value === "" ? -1 : Number(fMinDepth.value),
    maxDepth: fMaxDepth.value === "" ? -1 : Number(fMaxDepth.value),
  };

  if (editingId.value) {
    await store.updateScript(editingId.value, data);
  } else {
    await store.addScript(data);
  }
  showModal.value = false;
}

// ===== 導入 =====
const fileInput = ref<HTMLInputElement | null>(null);
const importError = ref("");

async function onFileChange(e: Event) {
  importError.value = "";
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const count = await store.importFromJson(text);
    alert(`成功導入 ${count} 個腳本`);
  } catch (err) {
    importError.value = "導入失敗：JSON 格式錯誤";
  }
  if (fileInput.value) fileInput.value.value = "";
}

// ===== 導出 =====
function exportAll() {
  const json = store.exportToJson();
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regex-scripts-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportOne(script: RegexScript) {
  const json = JSON.stringify(script, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `regex-${script.scriptName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function placementLabel(script: RegexScript): string {
  const labels: string[] = [];
  if (script.placement?.includes(1)) labels.push("用戶");
  if (script.placement?.includes(2)) labels.push("AI");
  if (script.placement?.includes(3)) labels.push("指令");
  if (script.placement?.includes(5)) labels.push("世界書");
  return labels.join(" · ") || "無";
}
</script>

<template>
  <div class="regex-screen">
    <!-- 頂欄 -->
    <div class="regex-header">
      <button class="back-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
          />
        </svg>
      </button>
      <span class="header-title">正則腳本</span>
      <div class="header-actions">
        <button class="icon-btn" title="導入 JSON" @click="fileInput?.click()">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
          </svg>
        </button>
        <button
          class="icon-btn"
          title="導出全部"
          @click="exportAll"
          :disabled="!store.scripts.length"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"
            />
          </svg>
        </button>
        <button class="add-btn" @click="openNew">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          新增
        </button>
      </div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="onFileChange"
    />

    <p v-if="importError" class="import-error">{{ importError }}</p>

    <!-- 說明 -->
    <div class="info-banner">
      <svg viewBox="0 0 24 24" fill="currentColor" class="info-icon">
        <path
          d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
        />
      </svg>
      <span
        >全域腳本對所有角色有效。角色卡內嵌的腳本在角色編輯頁管理。支援導入酒館
        regex JSON 格式。</span
      >
    </div>

    <!-- 空狀態 -->
    <div v-if="!store.scripts.length" class="empty-state">
      <svg viewBox="0 0 24 24" fill="currentColor" class="empty-icon">
        <path
          d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"
        />
      </svg>
      <p>尚無腳本</p>
      <p class="empty-sub">點擊「新增」或導入酒館 regex JSON</p>
    </div>

    <!-- 腳本列表 -->
    <div v-else class="scripts-list">
      <div
        v-for="script in store.scripts"
        :key="script.id"
        class="script-item"
        :class="{ disabled: script.disabled }"
      >
        <div class="script-main" @click="openEdit(script)">
          <div class="script-name">{{ script.scriptName }}</div>
          <div class="script-meta">
            <span class="meta-tag">{{ placementLabel(script) }}</span>
            <span v-if="script.markdownOnly" class="meta-tag">僅顯示</span>
            <span v-if="script.promptOnly" class="meta-tag">僅提示詞</span>
          </div>
          <div class="script-regex">{{ script.findRegex }}</div>
        </div>
        <div class="script-actions">
          <button
            class="toggle-btn"
            :class="{ active: !script.disabled }"
            @click.stop="store.toggleScript(script.id)"
            :title="script.disabled ? '啟用' : '停用'"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                v-if="!script.disabled"
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"
              />
              <path
                v-else
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"
              />
            </svg>
          </button>
          <button
            class="export-btn"
            @click.stop="exportOne(script)"
            title="導出"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2v9.67z"
              />
            </svg>
          </button>
          <button
            class="delete-btn"
            @click.stop="store.deleteScript(script.id)"
            title="刪除"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- 編輯彈窗 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <span>{{ editingId ? "編輯腳本" : "新增腳本" }}</span>
          <button class="close-btn" @click="showModal = false">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
              />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <!-- 腳本名稱 -->
          <label class="field-label">腳本名稱</label>
          <input v-model="fName" class="field-input" placeholder="腳本名稱" />

          <!-- 查找正則 -->
          <label class="field-label">查找正則表達式</label>
          <input
            v-model="fFindRegex"
            class="field-input mono"
            placeholder="/pattern/flags"
            @input="validateRegex"
          />
          <p v-if="regexError" class="field-error">{{ regexError }}</p>

          <!-- 替換為 -->
          <label class="field-label"
            >替換為（支援 &#123;&#123;match&#125;&#125;、$1、$2）</label
          >
          <div class="textarea-wrapper">
            <textarea
              v-model="fReplaceString"
              class="field-textarea mono"
              rows="5"
              placeholder="替換字串"
            />
            <button
              class="expand-btn"
              @click="expandReplace = true"
              title="展開編輯"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                />
              </svg>
            </button>
          </div>

          <!-- 展開編輯 overlay -->
          <div
            v-if="expandReplace"
            class="expand-overlay"
            @click.self="expandReplace = false"
          >
            <div class="expand-editor">
              <div class="expand-header">
                <span>替換字串</span>
                <button class="close-btn" @click="expandReplace = false">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                    />
                  </svg>
                </button>
              </div>
              <textarea
                v-model="fReplaceString"
                class="field-textarea mono expand-textarea"
                placeholder="替換字串"
              />
            </div>
          </div>

          <!-- 修剪字串 -->
          <label class="field-label"
            >修剪字串（每行一個，替換前從匹配中移除）</label
          >
          <textarea
            v-model="fTrimStrings"
            class="field-textarea"
            rows="3"
            placeholder="每行一個字串"
          />

          <!-- 影響位置 -->
          <label class="field-label">影響位置</label>
          <div class="checkbox-row">
            <label class="checkbox-item">
              <input type="checkbox" v-model="fPlacementUser" />
              <span>使用者輸入</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="fPlacementAI" />
              <span>AI 輸出</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="fPlacementSlash" />
              <span>斜線命令</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="fPlacementWorldInfo" />
              <span>世界資訊</span>
            </label>
          </div>

          <!-- 其他選項 -->
          <label class="field-label">其他選項</label>
          <div class="checkbox-row">
            <label class="checkbox-item">
              <input type="checkbox" v-model="fDisabled" />
              <span>停用</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="fRunOnEdit" />
              <span>編輯時執行</span>
            </label>
          </div>
          <div class="checkbox-row">
            <label class="checkbox-item">
              <input type="checkbox" v-model="fMarkdownOnly" />
              <span>僅修改聊天顯示</span>
            </label>
            <label class="checkbox-item">
              <input type="checkbox" v-model="fPromptOnly" />
              <span>僅修改系統提示詞</span>
            </label>
          </div>

          <!-- 巨集替換模式 -->
          <label class="field-label">巨集替換模式</label>
          <select v-model="fSubstituteRegex" class="field-select">
            <option :value="0">不替換（純文字匹配）</option>
            <option :value="1">替換（直接插入）</option>
            <option :value="2">替換（跳脫後插入）</option>
          </select>

          <!-- 深度 -->
          <div class="depth-row">
            <div class="depth-field">
              <label class="field-label">最小深度</label>
              <input
                v-model="fMinDepth"
                type="number"
                class="field-input"
                placeholder="無限制"
                min="0"
              />
            </div>
            <div class="depth-field">
              <label class="field-label">最大深度</label>
              <input
                v-model="fMaxDepth"
                type="number"
                class="field-input"
                placeholder="無限制"
                min="0"
              />
            </div>
          </div>

          <!-- 預覽 -->
          <label class="field-label">測試預覽</label>
          <input
            v-model="previewInput"
            class="field-input"
            placeholder="輸入測試文字..."
          />
          <div
            v-if="previewResult"
            class="preview-result"
            v-html="previewResult"
          />
        </div>

        <div class="modal-footer">
          <button class="cancel-btn" @click="showModal = false">取消</button>
          <button
            class="save-btn"
            @click="saveScript"
            :disabled="!fName.trim() || !!regexError"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.regex-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg, #f5f5f5);
  overflow: hidden;
}

.regex-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  padding-top: max(16px, var(--safe-top, 0px));
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}

.back-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text, #333);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}
.back-btn svg {
  width: 22px;
  height: 22px;
}

.header-title {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text, #333);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.icon-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary, #666);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn svg {
  width: 20px;
  height: 20px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 14px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.add-btn svg {
  width: 18px;
  height: 18px;
}

.import-error {
  margin: 8px 16px 0;
  color: #e53e3e;
  font-size: 13px;
}

.info-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 12px 16px 0;
  padding: 10px 12px;
  background: var(--color-surface, #fff);
  border-radius: 10px;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  line-height: 1.5;
}
.info-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--color-primary, #7dd3a8);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--color-text-secondary, #999);
}
.empty-icon {
  width: 48px;
  height: 48px;
  opacity: 0.3;
}
.empty-state p {
  margin: 0;
  font-size: 15px;
}
.empty-sub {
  font-size: 13px !important;
}

.scripts-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.script-item {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-surface, #fff);
  border-radius: 12px;
  padding: 12px;
  transition: opacity 0.2s;
}
.script-item.disabled {
  opacity: 0.5;
}

.script-main {
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.script-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text, #333);
  margin-bottom: 4px;
}

.script-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 4px;
}

.meta-tag {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  border-radius: 10px;
  opacity: 0.85;
}

.script-regex {
  font-size: 11px;
  color: var(--color-text-secondary, #888);
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.script-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.toggle-btn,
.export-btn,
.delete-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.toggle-btn svg,
.export-btn svg,
.delete-btn svg {
  width: 18px;
  height: 18px;
}
.toggle-btn {
  color: #ccc;
}
.toggle-btn.active {
  color: var(--color-primary, #7dd3a8);
}
.export-btn {
  color: var(--color-text-secondary, #888);
}
.delete-btn {
  color: #e53e3e;
}

/* ===== Modal ===== */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 200;
}

.modal {
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  background: var(--color-surface, #fff);
  border-radius: 20px 20px 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}

.close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary, #666);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}
.close-btn svg {
  width: 20px;
  height: 20px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  margin-top: 16px;
}

.field-input,
.field-textarea,
.field-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 10px;
  font-size: 14px;
  background: var(--color-bg, #f9f9f9);
  color: var(--color-text, #333);
  box-sizing: border-box;
}
.field-textarea {
  resize: vertical;
  font-family: inherit;
}
.mono {
  font-family: monospace;
  font-size: 13px;
}
.field-select {
  cursor: pointer;
}

.textarea-wrapper {
  position: relative;
}
.textarea-wrapper .field-textarea {
  padding-right: 36px;
}
.expand-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 26px;
  height: 26px;
  border: none;
  background: var(--color-bg, #f0f0f0);
  border-radius: 6px;
  cursor: pointer;
  color: var(--color-text-secondary, #888);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
}
.expand-btn:hover {
  opacity: 1;
}
.expand-btn svg {
  width: 16px;
  height: 16px;
}

.expand-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
  padding: 20px;
}
.expand-editor {
  width: 100%;
  max-width: 640px;
  background: var(--color-surface, #fff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 80vh;
}
.expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}
.expand-textarea {
  flex: 1;
  resize: none !important;
  border: none !important;
  border-radius: 0 !important;
  min-height: 300px;
  font-size: 14px !important;
  user-select: text;
  -webkit-user-select: text;
  touch-action: manipulation;
}

.field-error {
  font-size: 12px;
  color: #e53e3e;
  margin: 0;
}

.checkbox-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 4px 0;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text, #333);
  cursor: pointer;
}
.checkbox-item input {
  cursor: pointer;
}

.depth-row {
  display: flex;
  gap: 12px;
}
.depth-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preview-result {
  padding: 10px 12px;
  background: var(--color-bg, #f0f0f0);
  border-radius: 10px;
  font-size: 13px;
  word-break: break-all;
}

.modal-footer {
  display: flex;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--color-border, #eee);
  flex-shrink: 0;
}

.cancel-btn {
  flex: 1;
  padding: 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 12px;
  background: none;
  font-size: 15px;
  cursor: pointer;
  color: var(--color-text, #333);
}

.save-btn {
  flex: 2;
  padding: 12px;
  border: none;
  border-radius: 12px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
