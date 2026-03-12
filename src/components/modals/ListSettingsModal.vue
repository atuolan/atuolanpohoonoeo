<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

// Props
const props = defineProps<{
  show: boolean;
  type: "character" | "lorebook";
}>();

// Emits
const emit = defineEmits<{
  (e: "close"): void;
  (e: "update", settings: ListSettings): void;
}>();

// 設定類型
interface ListSettings {
  columns: number;
  cardSize: "small" | "medium" | "large";
  showAvatar: boolean;
  showCreator: boolean;
  showTags: boolean;
  showLorebookCount: boolean;
  showDescription: boolean;
  sortBy: "name" | "updated" | "created";
  sortOrder: "asc" | "desc";
}

// 預設設定
const defaultSettings: ListSettings = {
  columns: 2,
  cardSize: "medium",
  showAvatar: true,
  showCreator: true,
  showTags: true,
  showLorebookCount: true,
  showDescription: true,
  sortBy: "updated",
  sortOrder: "desc",
};

// 當前設定
const settings = ref<ListSettings>({ ...defaultSettings });

// 當前分頁
const currentTab = ref<"layout" | "display" | "sort">("layout");

// 標題
const title = computed(() => {
  return props.type === "character" ? "角色庫設定" : "世界書庫設定";
});

// 載入設定
onMounted(() => {
  loadSettings();
});

watch(
  () => props.show,
  (show) => {
    if (show) {
      loadSettings();
    }
  },
);

function loadSettings() {
  const key = `${props.type}ListSettings`;
  const saved = localStorage.getItem(key);
  if (saved) {
    try {
      settings.value = { ...defaultSettings, ...JSON.parse(saved) };
    } catch {
      settings.value = { ...defaultSettings };
    }
  }
}

// 保存設定
function saveSettings() {
  const key = `${props.type}ListSettings`;
  localStorage.setItem(key, JSON.stringify(settings.value));
  emit("update", settings.value);
}

// 關閉
function handleClose() {
  emit("close");
}

// 完成
function handleDone() {
  saveSettings();
  emit("close");
}

// 恢復預設
function resetToDefault() {
  settings.value = { ...defaultSettings };
}

// 更新列數
function setColumns(n: number) {
  settings.value.columns = n;
}

// 更新卡片大小
function setCardSize(size: "small" | "medium" | "large") {
  settings.value.cardSize = size;
}

// 更新排序
function setSortBy(by: "name" | "updated" | "created") {
  settings.value.sortBy = by;
}

// 切換排序方向
function toggleSortOrder() {
  settings.value.sortOrder =
    settings.value.sortOrder === "asc" ? "desc" : "asc";
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="handleClose">
        <div class="list-settings-modal">
          <!-- 標題欄 -->
          <header class="modal-header">
            <h2>{{ title }}</h2>
            <button class="close-btn" @click="handleClose">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                />
              </svg>
            </button>
          </header>

          <!-- 分頁標籤 -->
          <nav class="tabs">
            <button
              class="tab"
              :class="{ active: currentTab === 'layout' }"
              @click="currentTab = 'layout'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z"
                />
              </svg>
              佈局
            </button>
            <button
              class="tab"
              :class="{ active: currentTab === 'display' }"
              @click="currentTab = 'display'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"
                />
              </svg>
              顯示
            </button>
            <button
              class="tab"
              :class="{ active: currentTab === 'sort' }"
              @click="currentTab = 'sort'"
            >
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 18h6v-2H3v2zM3 6v2h18V6H3zm0 7h12v-2H3v2z" />
              </svg>
              排序
            </button>
          </nav>

          <!-- 內容 -->
          <div class="modal-content">
            <!-- 佈局設定 -->
            <div v-if="currentTab === 'layout'" class="settings-section">
              <div class="setting-group">
                <label class="setting-label">每行列數</label>
                <div class="column-options">
                  <button
                    v-for="n in [1, 2, 3, 4]"
                    :key="n"
                    class="column-btn"
                    :class="{ active: settings.columns === n }"
                    @click="setColumns(n)"
                  >
                    <div class="column-preview" :style="{ '--cols': n }">
                      <span v-for="i in n" :key="i"></span>
                    </div>
                    <span>{{ n }}</span>
                  </button>
                </div>
              </div>

              <div class="setting-group">
                <label class="setting-label">卡片大小</label>
                <div class="size-options">
                  <button
                    class="size-btn"
                    :class="{ active: settings.cardSize === 'small' }"
                    @click="setCardSize('small')"
                  >
                    <div class="size-preview small"></div>
                    <span>小</span>
                  </button>
                  <button
                    class="size-btn"
                    :class="{ active: settings.cardSize === 'medium' }"
                    @click="setCardSize('medium')"
                  >
                    <div class="size-preview medium"></div>
                    <span>中</span>
                  </button>
                  <button
                    class="size-btn"
                    :class="{ active: settings.cardSize === 'large' }"
                    @click="setCardSize('large')"
                  >
                    <div class="size-preview large"></div>
                    <span>大</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 顯示設定 -->
            <div v-if="currentTab === 'display'" class="settings-section">
              <div class="toggle-group">
                <label class="toggle-item">
                  <span class="toggle-label">顯示頭像</span>
                  <input
                    type="checkbox"
                    v-model="settings.showAvatar"
                    class="toggle-input"
                  />
                  <span class="toggle-switch"></span>
                </label>

                <label class="toggle-item">
                  <span class="toggle-label">顯示創作者</span>
                  <input
                    type="checkbox"
                    v-model="settings.showCreator"
                    class="toggle-input"
                  />
                  <span class="toggle-switch"></span>
                </label>

                <label class="toggle-item">
                  <span class="toggle-label">顯示標籤</span>
                  <input
                    type="checkbox"
                    v-model="settings.showTags"
                    class="toggle-input"
                  />
                  <span class="toggle-switch"></span>
                </label>

                <label v-if="type === 'character'" class="toggle-item">
                  <span class="toggle-label">顯示世界書數量</span>
                  <input
                    type="checkbox"
                    v-model="settings.showLorebookCount"
                    class="toggle-input"
                  />
                  <span class="toggle-switch"></span>
                </label>

                <label v-if="type === 'lorebook'" class="toggle-item">
                  <span class="toggle-label">顯示描述</span>
                  <input
                    type="checkbox"
                    v-model="settings.showDescription"
                    class="toggle-input"
                  />
                  <span class="toggle-switch"></span>
                </label>
              </div>
            </div>

            <!-- 排序設定 -->
            <div v-if="currentTab === 'sort'" class="settings-section">
              <div class="setting-group">
                <label class="setting-label">排序依據</label>
                <div class="sort-options">
                  <button
                    class="sort-btn"
                    :class="{ active: settings.sortBy === 'name' }"
                    @click="setSortBy('name')"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M2.5 4v3h5v12h3V7h5V4h-13zm19 5h-9v3h3v7h3v-7h3V9z"
                      />
                    </svg>
                    名稱
                  </button>
                  <button
                    class="sort-btn"
                    :class="{ active: settings.sortBy === 'updated' }"
                    @click="setSortBy('updated')"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"
                      />
                    </svg>
                    更新時間
                  </button>
                  <button
                    class="sort-btn"
                    :class="{ active: settings.sortBy === 'created' }"
                    @click="setSortBy('created')"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm-8 4H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z"
                      />
                    </svg>
                    創建時間
                  </button>
                </div>
              </div>

              <div class="setting-group">
                <label class="setting-label">排序方向</label>
                <button class="order-toggle" @click="toggleSortOrder">
                  <svg
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    :class="{ flipped: settings.sortOrder === 'asc' }"
                  >
                    <path
                      d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"
                    />
                  </svg>
                  <span>{{
                    settings.sortOrder === "desc"
                      ? "降序（新→舊）"
                      : "升序（舊→新）"
                  }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 底部按鈕 -->
          <footer class="modal-footer">
            <button class="reset-btn" @click="resetToDefault">恢復預設</button>
            <button class="done-btn" @click="handleDone">完成</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100dvh;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.list-settings-modal {
  background: var(--color-surface, #fff);
  border-radius: 20px;
  width: 100%;
  max-width: 400px;
  max-height: 85vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text, #333);
    margin: 0;
  }

  .close-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: var(--color-background, #f5f5f5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;

    svg {
      width: 20px;
      height: 20px;
      color: var(--color-text-secondary, #666);
    }

    &:hover {
      background: var(--color-primary-light, #c7fcbb);

      svg {
        color: var(--color-primary, #7dd3a8);
      }
    }
  }
}

.tabs {
  display: flex;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  background: var(--color-surface, #fff);
}

.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  svg {
    width: 22px;
    height: 22px;
  }

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 3px;
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    border-radius: 3px 3px 0 0;
    transition: width 0.2s;
  }

  &.active {
    color: var(--color-primary, #7dd3a8);

    &::after {
      width: 40px;
    }
  }
}

.modal-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text, #333);
}

.column-options {
  display: flex;
  gap: 10px;
}

.column-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  .column-preview {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 3px;
    width: 36px;
    height: 36px;

    span {
      background: var(--color-text-muted, #ccc);
      border-radius: 3px;
    }
  }

  span:last-child {
    font-size: 13px;
    color: var(--color-text-secondary, #666);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);

    .column-preview span {
      background: var(--color-primary, #7dd3a8);
    }

    span:last-child {
      color: var(--color-primary, #7dd3a8);
    }
  }
}

.size-options {
  display: flex;
  gap: 10px;
}

.size-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;

  .size-preview {
    background: var(--color-text-muted, #ccc);
    border-radius: 4px;

    &.small {
      width: 24px;
      height: 32px;
    }

    &.medium {
      width: 32px;
      height: 40px;
    }

    &.large {
      width: 40px;
      height: 48px;
    }
  }

  span {
    font-size: 13px;
    color: var(--color-text-secondary, #666);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);

    .size-preview {
      background: var(--color-primary, #7dd3a8);
    }

    span {
      color: var(--color-primary, #7dd3a8);
    }
  }
}

.toggle-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: var(--color-background, #f5f5f5);
  border-radius: 12px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-primary-light, #c7fcbb);
  }
}

.toggle-label {
  font-size: 15px;
  color: var(--color-text, #333);
}

.toggle-input {
  display: none;

  &:checked + .toggle-switch {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);

    &::after {
      transform: translateX(20px);
    }
  }
}

.toggle-switch {
  width: 48px;
  height: 28px;
  background: var(--color-text-muted, #ccc);
  border-radius: 14px;
  position: relative;
  transition: background 0.2s;

  &::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 22px;
    height: 22px;
    background: white;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s;
  }
}

.sort-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sort-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-background, #f5f5f5);
  border: 2px solid transparent;
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text, #333);
  cursor: pointer;
  transition: all 0.2s;

  svg {
    width: 22px;
    height: 22px;
    color: var(--color-text-secondary, #666);
  }

  &.active {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary-light, #c7fcbb);
    color: var(--color-primary, #7dd3a8);

    svg {
      color: var(--color-primary, #7dd3a8);
    }
  }
}

.order-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-background, #f5f5f5);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text, #333);
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;

  svg {
    width: 24px;
    height: 24px;
    color: var(--color-primary, #7dd3a8);
    transition: transform 0.2s;

    &.flipped {
      transform: rotate(180deg);
    }
  }

  &:hover {
    background: var(--color-primary-light, #c7fcbb);
  }
}

.modal-footer {
  display: flex;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
}

.reset-btn {
  flex: 1;
  padding: 14px;
  background: var(--color-background, #f5f5f5);
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    background: var(--color-text-muted, #ddd);
  }
}

.done-btn {
  flex: 1;
  padding: 14px;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8); // 淡薄荷綠漸變
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(255, 107, 157, 0.4);
  }
}

// 動畫
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;

  .list-settings-modal {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;

  .list-settings-modal {
    transform: scale(0.9) translateY(20px);
  }
}
</style>
