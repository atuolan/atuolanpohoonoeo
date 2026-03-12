<template>
  <div class="modal-overlay" @click="$emit('close')">
    <div class="modal-container" @click.stop>
      <!-- 頭部 -->
      <div class="modal-header">
        <h2>
          <svg viewBox="0 0 24 24" fill="currentColor" class="header-icon">
            <path
              d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"
            />
          </svg>
          重要事件記錄本
        </h2>
        <p class="subtitle">記錄 {{ characterName }} 必須記住的關鍵信息</p>
        <button class="close-btn" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
          </svg>
        </button>
      </div>

      <!-- 設置 -->
      <div class="settings-section">
        <label class="setting-item">
          <input
            v-model="localSettings.enabled"
            type="checkbox"
            @change="saveSettings"
          />
          <span>啟用重要事件記錄本</span>
        </label>
        <label class="setting-item">
          <input
            v-model="localSettings.autoSave"
            type="checkbox"
            @change="saveSettings"
          />
          <span>自動從對話中提取重要事件</span>
        </label>
        <div class="setting-item slider-setting">
          <span>注入上限</span>
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            v-model.number="localSettings.maxEvents"
            @change="saveSettings"
          />
          <span class="slider-value">{{ localSettings.maxEvents }} 筆</span>
        </div>
      </div>

      <!-- 批次操作 -->
      <div class="bulk-actions">
        <button
          class="btn-secondary"
          :class="{ active: multiSelectMode }"
          @click="toggleMultiSelect"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 5h2V3c-1.1 0-2 .9-2 2zm0 8h2v-2H3v2zm4 8h2v-2H7v2zM3 9h2V7H3v2zm10-6h-2v2h2V3zm6 0v2h2c0-1.1-.9-2-2-2zM5 21v-2H3c0 1.1.9 2 2 2zm-2-4h2v-2H3v2zM9 3H7v2h2V3zm2 18h2v-2h-2v2zm8-8h2v-2h-2v2zm0 8c1.1 0 2-.9 2-2h-2v2zm0-12h2V7h-2v2zm0 8h2v-2h-2v2zm-4 4h2v-2h-2v2zm0-16h2V3h-2v2z"
            />
          </svg>
          {{ multiSelectMode ? "完成" : "多選" }}
        </button>
        <button
          v-if="multiSelectMode"
          class="btn-danger"
          :disabled="selectedIds.length === 0"
          @click="deleteSelected"
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
          刪除選取 ({{ selectedIds.length }})
        </button>
        <div class="spacer"></div>
        <button class="btn-secondary" @click="exportAllEvents">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 12v7H5v-7H3v7c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2zm-6 .67l2.59-2.58L17 11.5l-5 5-5-5 1.41-1.41L11 12.67V3h2z"
            />
          </svg>
          導出
        </button>
        <button class="btn-secondary" @click="importEvents">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
          </svg>
          導入
        </button>
      </div>

      <!-- 添加新事件 -->
      <div class="add-event-section">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          添加新事件
        </h3>
        <textarea
          v-model="newEventContent"
          placeholder="例如：{{user}} 答應了周末一起去看電影"
          rows="3"
          class="event-textarea"
        ></textarea>

        <div class="event-meta">
          <select v-model="newEventCategory" class="meta-select">
            <option value="relationship">關係與交往</option>
            <option value="promise">約定與承諾</option>
            <option value="secret">秘密與隱私</option>
            <option value="fact">重要事實</option>
            <option value="custom">其他</option>
          </select>

          <select v-model="newEventPriority" class="meta-select">
            <option :value="1">最重要</option>
            <option :value="2">重要</option>
            <option :value="3">一般</option>
          </select>

          <input
            v-model="newEventTags"
            type="text"
            placeholder="標籤（用逗號分隔）"
            class="tags-input"
          />
        </div>

        <button
          class="btn-add"
          :disabled="!newEventContent.trim()"
          @click="addEvent"
        >
          添加事件
        </button>
      </div>

      <!-- 事件列表 -->
      <div class="events-list-section">
        <h3>
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
            />
          </svg>
          已記錄的事件 ({{ events.length }})
        </h3>

        <div v-if="events.length === 0" class="empty-state">
          <p>還沒有記錄任何重要事件</p>
          <p>開始添加 {{ characterName }} 需要記住的關鍵信息吧！</p>
        </div>

        <div v-else class="events-list">
          <div
            v-for="event in events"
            :key="event.id"
            class="event-item"
            :class="[
              `priority-${event.priority || 3}`,
              { selected: isSelected(event.id) },
            ]"
            @click="multiSelectMode && toggleSelect(event.id)"
          >
            <div class="event-header">
              <label v-if="multiSelectMode" class="select-box" @click.stop>
                <input
                  type="checkbox"
                  :checked="isSelected(event.id)"
                  @change="toggleSelect(event.id)"
                />
              </label>
              <span
                class="event-priority"
                :class="`priority-level-${event.priority || 3}`"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
                  />
                </svg>
              </span>
              <span class="event-category">{{
                getCategoryName(event.category)
              }}</span>
              <span class="event-time">{{ formatTime(event.timestamp) }}</span>
              <button
                v-if="!multiSelectMode"
                class="btn-delete"
                @click.stop="deleteEvent(event.id)"
              >
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
                  />
                </svg>
              </button>
            </div>

            <div
              class="event-content"
              v-if="editingEventId !== event.id"
              @click.stop="startEdit(event)"
            >
              {{ event.content }}
            </div>
            <div class="event-edit" v-else @click.stop>
              <div class="edit-textarea-wrapper">
                <textarea
                  ref="editTextarea"
                  v-model="editContent"
                  rows="3"
                  class="edit-textarea"
                  @keydown.enter.ctrl="saveEdit(event.id)"
                  @keydown.escape="cancelEdit"
                ></textarea>
                <button
                  class="expand-btn"
                  type="button"
                  @click="expandEditMode = true"
                  title="展開編輯"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
                    />
                  </svg>
                </button>
              </div>
              <div class="edit-actions">
                <button class="btn-save" @click="saveEdit(event.id)">
                  儲存
                </button>
                <button class="btn-cancel" @click="cancelEdit">取消</button>
              </div>
            </div>

            <div v-if="event.tags && event.tags.length > 0" class="event-tags">
              <span v-for="tag in event.tags" :key="tag" class="tag">{{
                tag
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 展開編輯 overlay -->
  <Teleport to="body">
    <Transition name="expand-fade">
      <div
        v-if="expandEditMode && editingEventId"
        class="expand-overlay"
        @click.self="expandEditMode = false"
      >
        <div class="expand-container">
          <div class="expand-header">
            <span class="expand-title">編輯事件</span>
            <button class="expand-close" @click="expandEditMode = false">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </div>
          <textarea
            v-model="editContent"
            class="expand-textarea"
            placeholder="事件內容..."
          ></textarea>
          <div class="expand-footer">
            <button class="btn-cancel" @click="expandEditMode = false">
              取消
            </button>
            <button class="btn-save" @click="saveEditFromExpand()">儲存</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import type {
    ImportantEvent,
    ImportantEventCategory,
    ImportantEventPriority,
    ImportantEventsLog,
} from "@/types/importantEvents";
import {
    createDefaultImportantEventsLog,
    createImportantEvent,
} from "@/types/importantEvents";
import { computed, onMounted, ref } from "vue";

const props = defineProps<{
  characterId: string;
  characterName: string;
  chatId?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

// 本地狀態
const eventsLog = ref<ImportantEventsLog | null>(null);
const localSettings = ref({
  enabled: true,
  autoSave: true,
  maxEvents: 50,
});

// 新事件表單
const newEventContent = ref("");
const newEventCategory = ref<ImportantEventCategory>("custom");
const newEventPriority = ref<ImportantEventPriority>(2);
const newEventTags = ref("");

// 多選模式
const multiSelectMode = ref(false);
const selectedIds = ref<string[]>([]);

// 編輯模式
const editingEventId = ref<string | null>(null);
const editContent = ref("");
const expandEditMode = ref(false);

function startEdit(event: ImportantEvent) {
  if (multiSelectMode.value) return;
  editingEventId.value = event.id;
  editContent.value = event.content;
}

function saveEdit(eventId: string) {
  if (!eventsLog.value || !editContent.value.trim()) return;
  const event = eventsLog.value.events.find((e) => e.id === eventId);
  if (event) {
    event.content = editContent.value.trim();
    saveEventsLog();
  }
  editingEventId.value = null;
}

function cancelEdit() {
  editingEventId.value = null;
  editContent.value = "";
  expandEditMode.value = false;
}

function saveEditFromExpand() {
  if (editingEventId.value) {
    saveEdit(editingEventId.value);
  }
  expandEditMode.value = false;
}

// 計算屬性
const events = computed(() => eventsLog.value?.events || []);

// 載入數據
async function loadEventsLog() {
  try {
    await db.init();
    const id = props.chatId || props.characterId;
    const existing = await db.get<ImportantEventsLog>(
      DB_STORES.IMPORTANT_EVENTS,
      id,
    );

    if (existing) {
      eventsLog.value = existing;
      localSettings.value = { ...existing.settings };
    } else {
      eventsLog.value = createDefaultImportantEventsLog(
        props.characterId,
        props.chatId,
      );
    }
  } catch (e) {
    console.error("載入重要事件失敗:", e);
    eventsLog.value = createDefaultImportantEventsLog(
      props.characterId,
      props.chatId,
    );
  }
}

// 保存數據
async function saveEventsLog() {
  if (!eventsLog.value) return;

  try {
    eventsLog.value.updatedAt = Date.now();
    const plainData = JSON.parse(JSON.stringify(eventsLog.value));
    await db.put(DB_STORES.IMPORTANT_EVENTS, plainData);
  } catch (e) {
    console.error("保存重要事件失敗:", e);
  }
}

// 添加事件
function addEvent() {
  if (!newEventContent.value.trim() || !eventsLog.value) return;

  const tags = newEventTags.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t);

  const event = createImportantEvent(newEventContent.value.trim(), {
    category: newEventCategory.value,
    priority: newEventPriority.value,
    tags,
    source: "user",
  });

  eventsLog.value.events.unshift(event);
  saveEventsLog();

  // 重置表單
  newEventContent.value = "";
  newEventTags.value = "";
  newEventPriority.value = 2;
}

// 刪除事件
function deleteEvent(eventId: string) {
  if (!eventsLog.value) return;
  if (!confirm("確定要刪除這個重要事件嗎？")) return;

  eventsLog.value.events = eventsLog.value.events.filter(
    (e) => e.id !== eventId,
  );
  saveEventsLog();
}

// 保存設置
function saveSettings() {
  if (!eventsLog.value) return;
  eventsLog.value.settings = { ...localSettings.value };
  saveEventsLog();
}

// 多選功能
function toggleMultiSelect() {
  multiSelectMode.value = !multiSelectMode.value;
  if (!multiSelectMode.value) {
    selectedIds.value = [];
  }
}

function isSelected(id: string): boolean {
  return selectedIds.value.includes(id);
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function deleteSelected() {
  if (!eventsLog.value || selectedIds.value.length === 0) return;
  if (!confirm(`確定刪除 ${selectedIds.value.length} 筆重要事件？`)) return;

  const idsToDelete = new Set(selectedIds.value);
  eventsLog.value.events = eventsLog.value.events.filter(
    (e) => !idsToDelete.has(e.id),
  );
  saveEventsLog();
  selectedIds.value = [];
}

// 導出導入
function exportAllEvents() {
  if (!eventsLog.value) return;

  const payload = {
    characterId: props.characterId,
    chatId: props.chatId,
    exportTime: new Date().toISOString(),
    log: eventsLog.value,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const link = document.createElement("a");
  link.download = `important-events-${props.characterName}-${Date.now()}.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

function importEvents() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file || !eventsLog.value) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const importedLog = data?.log || data;
      const importedEvents: ImportantEvent[] = Array.isArray(
        importedLog?.events,
      )
        ? importedLog.events
        : Array.isArray(data)
          ? data
          : [];

      if (importedEvents.length === 0) {
        alert("文件中沒有找到有效的事件數據");
        return;
      }

      const mode = confirm(
        `導入 ${importedEvents.length} 筆事件：\n確定=替換，取消=追加`,
      )
        ? "replace"
        : "append";

      if (mode === "replace") {
        eventsLog.value.events = importedEvents;
      } else {
        // 去重合併
        const existingIds = new Set(eventsLog.value.events.map((e) => e.id));
        const newEvents = importedEvents.filter((e) => !existingIds.has(e.id));
        eventsLog.value.events = [...eventsLog.value.events, ...newEvents];
      }

      saveEventsLog();
      alert(`已導入 ${importedEvents.length} 筆重要事件`);
    } catch {
      alert("導入失敗：文件格式錯誤");
    }
  };
  input.click();
}

// 輔助函數
function getCategoryName(category?: string) {
  const names: Record<string, string> = {
    relationship: "關係",
    promise: "約定",
    secret: "秘密",
    fact: "事實",
    custom: "其他",
  };
  return names[category || "custom"] || "其他";
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;

  return date.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

onMounted(() => {
  loadEventsLog();
});
</script>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  padding-top: max(20px, env(safe-area-inset-top));
  padding-bottom: max(20px, var(--safe-bottom, 0px));
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-container {
  background: var(--color-surface, white);
  border-radius: 16px;
  max-width: min(600px, 100%);
  width: 100%;
  max-height: calc(
    100dvh - 40px - env(safe-area-inset-top) - var(--safe-bottom, 0px)
  );
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  position: relative;
  text-align: center;

  h2 {
    font-size: 20px;
    margin: 0 0 5px 0;
    color: var(--color-text, #1f2937);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding-right: 30px;

    .header-icon {
      width: 24px;
      height: 24px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .subtitle {
    font-size: 14px;
    color: var(--color-text-secondary, #6b7280);
    margin: 0;
    padding-right: 30px;
  }

  .close-btn {
    position: absolute;
    top: 20px;
    right: 20px;
    background: none;
    border: none;
    cursor: pointer;
    color: var(--color-text-muted, #9ca3af);
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;

    svg {
      width: 24px;
      height: 24px;
    }

    &:hover {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text, #374151);
    }
  }
}

.settings-section {
  padding: 15px 20px;
  background: var(--color-background, #f9fafb);
  border-bottom: 1px solid var(--color-border, #e5e7eb);

  .setting-item {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    cursor: pointer;

    &:last-child {
      margin-bottom: 0;
    }

    input[type="checkbox"] {
      width: 18px;
      height: 18px;
      cursor: pointer;
      accent-color: var(--color-primary, #7dd3a8);
    }

    span {
      font-size: 14px;
      color: var(--color-text, #374151);
    }

    &.slider-setting {
      gap: 10px;

      input[type="range"] {
        flex: 1;
        height: 4px;
        accent-color: var(--color-primary, #7dd3a8);
        cursor: pointer;
      }

      .slider-value {
        min-width: 48px;
        text-align: right;
        font-size: 13px;
        color: var(--color-text-secondary, #6b7280);
      }
    }
  }
}

.bulk-actions {
  padding: 10px 20px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;

  .spacer {
    flex: 1;
  }
}

.btn-secondary {
  padding: 8px 12px;
  background: var(--color-background, #f3f4f6);
  color: var(--color-text, #1f2937);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  &.active {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border-color: var(--color-primary, #7dd3a8);
    color: var(--color-primary, #7dd3a8);
  }

  &:hover {
    background: var(--color-surface-hover, #e5e7eb);
  }
}

.btn-danger {
  padding: 8px 12px;
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;

  svg {
    width: 16px;
    height: 16px;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &:hover:not(:disabled) {
    background: #fecaca;
  }
}

.add-event-section {
  padding: 20px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);

  h3 {
    font-size: 16px;
    margin: 0 0 15px 0;
    color: var(--color-text, #1f2937);
    display: flex;
    align-items: center;
    gap: 6px;

    svg {
      width: 18px;
      height: 18px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .event-textarea {
    width: 100%;
    padding: 12px;
    border: 2px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    font-size: 14px;
    resize: vertical;
    margin-bottom: 12px;
    font-family: inherit;
    transition: border-color 0.2s;
    background: var(--color-surface, white);
    color: var(--color-text, #1f2937);

    &:focus {
      outline: none;
      border-color: var(--color-primary, #7dd3a8);
    }

    &::placeholder {
      color: var(--color-text-muted, #9ca3af);
    }
  }

  .event-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 15px;

    .meta-select,
    .tags-input {
      width: 100%;
      padding: 10px 12px;
      border: 2px solid var(--color-border, #e5e7eb);
      border-radius: 6px;
      font-size: 14px;
      background: var(--color-surface, white);
      color: var(--color-text, #1f2937);
      transition: border-color 0.2s;

      &:focus {
        outline: none;
        border-color: var(--color-primary, #7dd3a8);
      }
    }

    .tags-input {
      grid-column: 1 / -1;
      &::placeholder {
        color: var(--color-text-muted, #9ca3af);
      }
    }
  }

  .btn-add {
    width: 100%;
    padding: 12px;
    background: var(--color-primary, #7dd3a8);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.events-list-section {
  padding: 20px;

  h3 {
    font-size: 16px;
    margin: 0 0 15px 0;
    color: var(--color-text, #1f2937);
    display: flex;
    align-items: center;
    gap: 6px;

    svg {
      width: 18px;
      height: 18px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px;
    color: var(--color-text-muted, #9ca3af);

    p {
      margin: 5px 0;
      font-size: 14px;
    }
  }

  .events-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .event-item {
    background: var(--color-background, #f9fafb);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 12px;
    padding: 15px;
    transition: all 0.2s;

    &.priority-1 {
      border-left: 4px solid #ef4444;
    }
    &.priority-2 {
      border-left: 4px solid #f59e0b;
    }
    &.priority-3 {
      border-left: 4px solid var(--color-primary, #7dd3a8);
    }
    &.selected {
      background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    }

    .event-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      font-size: 12px;
      color: var(--color-text-secondary, #6b7280);

      .select-box {
        margin-right: 4px;
        input {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }
      }

      .event-priority {
        display: flex;
        align-items: center;
        svg {
          width: 16px;
          height: 16px;
        }

        &.priority-level-1 {
          color: #ef4444;
        }
        &.priority-level-2 {
          color: #f59e0b;
        }
        &.priority-level-3 {
          color: var(--color-primary, #7dd3a8);
        }
      }

      .event-time {
        margin-left: auto;
      }

      .btn-delete {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-text-muted, #9ca3af);
        opacity: 0.6;
        transition: all 0.2s;
        padding: 4px;
        display: flex;

        svg {
          width: 18px;
          height: 18px;
        }

        &:hover {
          opacity: 1;
          color: #ef4444;
        }
      }
    }

    .event-content {
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 10px;
      color: var(--color-text, #1f2937);
      white-space: pre-wrap;
      word-break: break-word;
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 6px;
      transition: background 0.15s;

      &:hover {
        background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
      }
    }

    .event-edit {
      margin-bottom: 10px;

      .edit-textarea {
        width: 100%;
        padding: 10px;
        border: 2px solid var(--color-primary, #7dd3a8);
        border-radius: 8px;
        font-size: 14px;
        font-family: inherit;
        line-height: 1.6;
        resize: vertical;
        background: var(--color-surface, white);
        color: var(--color-text, #1f2937);

        &:focus {
          outline: none;
        }
      }

      .edit-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        justify-content: flex-end;

        .btn-save,
        .btn-cancel {
          padding: 6px 14px;
          border: none;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-save {
          background: var(--color-primary, #7dd3a8);
          color: white;
        }

        .btn-cancel {
          background: var(--color-background, #f3f4f6);
          color: var(--color-text-secondary, #6b7280);
        }
      }
    }

    .event-tags {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;

      .tag {
        background: var(--color-surface, white);
        padding: 4px 10px;
        border-radius: 12px;
        font-size: 12px;
        color: var(--color-text-secondary, #4b5563);
        border: 1px solid var(--color-border, #e5e7eb);
      }
    }
  }
}

@media (max-width: 480px) {
  .modal-container {
    border-radius: 16px 16px 0 0;
  }
  .event-meta {
    grid-template-columns: 1fr !important;
  }
  .bulk-actions {
    justify-content: center;
    .spacer {
      display: none;
    }
  }
}

// 展開按鈕
.edit-textarea-wrapper {
  position: relative;

  .edit-textarea {
    padding-right: 36px;
  }

  .expand-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 28px;
    height: 28px;
    padding: 4px;
    background: var(--color-surface, white);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.5;
    transition: opacity 0.15s;

    svg {
      width: 16px;
      height: 16px;
      color: var(--color-text-secondary, #6b7280);
    }
    &:hover {
      opacity: 1;
    }
  }
}

// 展開 overlay
.expand-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.6);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(12px, env(safe-area-inset-top))
    max(12px, env(safe-area-inset-right)) max(12px, var(--safe-bottom, 0px))
    max(12px, env(safe-area-inset-left));
}

.expand-container {
  background: var(--color-surface, white);
  border-radius: 16px;
  width: 100%;
  max-width: 700px;
  height: 100%;
  max-height: calc(
    100dvh - max(24px, env(safe-area-inset-top)) - max(
        24px,
        var(--safe-bottom, 0px)
      )
  );
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.expand-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;

  .expand-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text, #1f2937);
  }

  .expand-close {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    color: var(--color-text-muted, #9ca3af);
    border-radius: 50%;
    transition: all 0.15s;

    svg {
      width: 22px;
      height: 22px;
    }
    &:hover {
      background: var(--color-background, #f3f4f6);
      color: var(--color-text, #374151);
    }
  }
}

.expand-textarea {
  flex: 1;
  width: 100%;
  padding: 16px;
  border: none;
  resize: none;
  font-size: 15px;
  line-height: 1.7;
  font-family: inherit;
  background: var(--color-surface, white);
  color: var(--color-text, #1f2937);
  user-select: text;
  -webkit-user-select: text;
  touch-action: manipulation;

  &:focus {
    outline: none;
  }
  &::placeholder {
    color: var(--color-text-muted, #9ca3af);
  }
}

.expand-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 12px 16px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  flex-shrink: 0;

  .btn-cancel,
  .btn-save {
    padding: 8px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .btn-cancel {
    background: var(--color-background, #f3f4f6);
    color: var(--color-text-secondary, #6b7280);
  }

  .btn-save {
    background: var(--color-primary, #7dd3a8);
    color: white;
  }
}

.expand-fade-enter-active,
.expand-fade-leave-active {
  transition: opacity 0.2s ease;
}
.expand-fade-enter-from,
.expand-fade-leave-to {
  opacity: 0;
}
</style>
