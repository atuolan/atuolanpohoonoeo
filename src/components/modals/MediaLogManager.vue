<script setup lang="ts">
import { useUserStore } from "@/stores/user";
import {
    createMediaLog,
    MEDIA_STATUS_LABELS,
    MEDIA_TYPE_LABELS,
    type MediaLog,
    type MediaStatus,
    type MediaType,
} from "@/types/mediaLog";
import { computed, onMounted, ref } from "vue";

// Emits
const emit = defineEmits<{
  (e: "close"): void;
}>();

// Store
const userStore = useUserStore();

// 狀態
const isAdding = ref(false);
const editingId = ref<string | null>(null);
const searchQuery = ref("");
const filterType = ref<MediaType | "all">("all");
const filterStatus = ref<MediaStatus | "all">("all");

// 新增/編輯表單
const form = ref({
  title: "",
  mediaType: "book" as MediaType,
  status: "finished" as MediaStatus,
  rating: 0,
  note: "",
});

// 媒體類型選項
const mediaTypes: MediaType[] = [
  "book",
  "movie",
  "anime",
  "drama",
  "game",
  "other",
];
const statusTypes: MediaStatus[] = ["want", "watching", "finished"];

// 過濾後的記錄
const filteredLogs = computed(() => {
  let logs = [...userStore.mediaLogs];

  // 搜索
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    logs = logs.filter((l) => l.title.toLowerCase().includes(q));
  }

  // 類型過濾
  if (filterType.value !== "all") {
    logs = logs.filter((l) => l.mediaType === filterType.value);
  }

  // 狀態過濾
  if (filterStatus.value !== "all") {
    logs = logs.filter((l) => l.status === filterStatus.value);
  }

  // 按時間倒序
  return logs.sort((a, b) => b.timestamp - a.timestamp);
});

// 統計
const stats = computed(() => {
  const logs = userStore.mediaLogs;
  return {
    total: logs.length,
    finished: logs.filter((l) => l.status === "finished").length,
    watching: logs.filter((l) => l.status === "watching").length,
    want: logs.filter((l) => l.status === "want").length,
  };
});

// 初始化
onMounted(async () => {
  if (!userStore.isLoaded) {
    await userStore.loadUserData();
  }
});

// 開始新增
function startAdd() {
  isAdding.value = true;
  editingId.value = null;
  form.value = {
    title: "",
    mediaType: "book",
    status: "finished",
    rating: 0,
    note: "",
  };
}

// 開始編輯
function startEdit(log: MediaLog) {
  isAdding.value = true;
  editingId.value = log.id;
  form.value = {
    title: log.title,
    mediaType: log.mediaType,
    status: log.status,
    rating: log.rating || 0,
    note: log.note || "",
  };
}

// 取消
function cancelEdit() {
  isAdding.value = false;
  editingId.value = null;
}

// 保存
async function saveLog() {
  if (!form.value.title.trim()) return;

  if (editingId.value) {
    // 編輯
    await userStore.updateMediaLog(editingId.value, {
      title: form.value.title.trim(),
      mediaType: form.value.mediaType,
      status: form.value.status,
      rating: form.value.rating || undefined,
      note: form.value.note.trim() || undefined,
    });
  } else {
    // 新增
    const log = createMediaLog(
      form.value.title.trim(),
      form.value.mediaType,
      form.value.status,
    );
    if (form.value.rating) log.rating = form.value.rating;
    if (form.value.note.trim()) log.note = form.value.note.trim();
    await userStore.addMediaLog(log);
  }

  cancelEdit();
}

// 刪除
async function deleteLog(id: string) {
  if (confirm("確定要刪除這條記錄嗎？")) {
    await userStore.deleteMediaLog(id);
  }
}

// 設置評分
function setRating(value: number) {
  form.value.rating = form.value.rating === value ? 0 : value;
}

// 格式化日期
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("zh-TW");
}
</script>

<template>
  <div class="media-log-manager fullscreen-page">
    <!-- 頭部 -->
    <header class="header">
      <button class="back-btn" @click="emit('close')">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
      </button>
      <h1>書影記錄</h1>
      <button class="add-btn" @click="startAdd" v-if="!isAdding">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </header>

    <!-- 統計 -->
    <div class="stats">
      <div class="stat">
        <span class="stat-value">{{ stats.total }}</span>
        <span class="stat-label">總計</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.finished }}</span>
        <span class="stat-label">看完</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.watching }}</span>
        <span class="stat-label">在看</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ stats.want }}</span>
        <span class="stat-label">想看</span>
      </div>
    </div>

    <!-- 新增/編輯表單 -->
    <div class="form-panel" v-if="isAdding">
      <div class="form-header">
        <h3>{{ editingId ? "編輯記錄" : "新增記錄" }}</h3>
        <button class="close-form" @click="cancelEdit">✕</button>
      </div>

      <div class="form-body">
        <div class="form-group">
          <label>標題</label>
          <input
            v-model="form.title"
            type="text"
            placeholder="書名/片名"
            class="input"
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>類型</label>
            <select v-model="form.mediaType" class="select">
              <option v-for="t in mediaTypes" :key="t" :value="t">
                {{ MEDIA_TYPE_LABELS[t] }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>狀態</label>
            <select v-model="form.status" class="select">
              <option v-for="s in statusTypes" :key="s" :value="s">
                {{ MEDIA_STATUS_LABELS[s] }}
              </option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>評分</label>
          <div class="rating-input">
            <button
              v-for="i in 5"
              :key="i"
              class="star-btn"
              :class="{ active: i <= form.rating }"
              @click="setRating(i)"
            >
              ★
            </button>
          </div>
        </div>

        <div class="form-group">
          <label>感想（可選）</label>
          <textarea
            v-model="form.note"
            placeholder="簡短感想..."
            class="textarea"
            rows="2"
          />
        </div>

        <button
          class="save-btn"
          @click="saveLog"
          :disabled="!form.title.trim()"
        >
          {{ editingId ? "保存" : "添加" }}
        </button>
      </div>
    </div>

    <!-- 過濾器 -->
    <div class="filters" v-if="!isAdding">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="搜索..."
        class="search-input"
      />
      <select v-model="filterType" class="filter-select">
        <option value="all">全部類型</option>
        <option v-for="t in mediaTypes" :key="t" :value="t">
          {{ MEDIA_TYPE_LABELS[t] }}
        </option>
      </select>
      <select v-model="filterStatus" class="filter-select">
        <option value="all">全部狀態</option>
        <option v-for="s in statusTypes" :key="s" :value="s">
          {{ MEDIA_STATUS_LABELS[s] }}
        </option>
      </select>
    </div>

    <!-- 記錄列表 -->
    <div class="log-list" v-if="!isAdding">
      <div
        v-for="log in filteredLogs"
        :key="log.id"
        class="log-item"
        @click="startEdit(log)"
      >
        <div class="log-type">{{ MEDIA_TYPE_LABELS[log.mediaType] }}</div>
        <div class="log-content">
          <div class="log-title">{{ log.title }}</div>
          <div class="log-meta">
            <span class="log-status">{{
              MEDIA_STATUS_LABELS[log.status]
            }}</span>
            <span class="log-rating" v-if="log.rating">
              {{ "★".repeat(log.rating) }}
            </span>
            <span class="log-date">{{ formatDate(log.timestamp) }}</span>
          </div>
          <div class="log-note" v-if="log.note">{{ log.note }}</div>
        </div>
        <button class="delete-btn" @click.stop="deleteLog(log.id)">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"
            />
          </svg>
        </button>
      </div>

      <div class="empty" v-if="filteredLogs.length === 0">
        <p>還沒有記錄</p>
        <button class="add-first-btn" @click="startAdd">添加第一條</button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.media-log-manager {
  z-index: 100;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--color-border, #eee);

  h1 {
    flex: 1;
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  .back-btn,
  .add-btn {
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;

    svg {
      width: 20px;
      height: 20px;
    }

    &:hover {
      background: var(--color-surface, #f5f5f5);
    }
  }
}

.stats {
  display: flex;
  padding: 16px;
  gap: 16px;
  border-bottom: 1px solid var(--color-border, #eee);

  .stat {
    flex: 1;
    text-align: center;

    .stat-value {
      display: block;
      font-size: 24px;
      font-weight: 600;
      color: var(--color-primary, #7dd3a8);
    }

    .stat-label {
      font-size: 12px;
      color: var(--color-text-secondary, #888);
    }
  }
}

.form-panel {
  margin: 16px;
  background: var(--color-surface, #f9f9f9);
  border-radius: 12px;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  .form-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--color-border, #eee);

    h3 {
      margin: 0;
      font-size: 16px;
    }

    .close-form {
      border: none;
      background: transparent;
      font-size: 18px;
      cursor: pointer;
      opacity: 0.5;

      &:hover {
        opacity: 1;
      }
    }
  }

  .form-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;

  label {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary, #666);
  }
}

.form-row {
  display: flex;
  gap: 12px;

  .form-group {
    flex: 1;
  }
}

.input,
.select,
.textarea {
  padding: 10px 12px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 8px;
  font-size: 14px;
  background: var(--color-background, #fff);

  &:focus {
    outline: none;
    border-color: var(--color-primary, #7dd3a8);
  }
}

.textarea {
  resize: none;
}

.rating-input {
  display: flex;
  gap: 4px;

  .star-btn {
    border: none;
    background: transparent;
    font-size: 24px;
    color: #ddd;
    cursor: pointer;
    padding: 0;

    &.active {
      color: #ffc107;
    }
  }
}

.save-btn {
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: var(--color-primary, #7dd3a8);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.filters {
  display: flex;
  gap: 8px;
  padding: 12px 16px;

  .search-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    font-size: 14px;
  }

  .filter-select {
    padding: 8px;
    border: 1px solid var(--color-border, #ddd);
    border-radius: 8px;
    font-size: 13px;
    background: var(--color-background, #fff);
  }
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 16px;
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  background: var(--color-surface, #f9f9f9);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;

  &:hover {
    background: var(--color-surface-hover, #f0f0f0);
  }

  .log-type {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 500;
    flex-shrink: 0;
  }

  .log-content {
    flex: 1;
    min-width: 0;

    .log-title {
      font-weight: 500;
      margin-bottom: 4px;
    }

    .log-meta {
      display: flex;
      gap: 8px;
      font-size: 12px;
      color: var(--color-text-secondary, #888);

      .log-rating {
        color: #ffc107;
      }
    }

    .log-note {
      margin-top: 6px;
      font-size: 13px;
      color: var(--color-text-secondary, #666);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  .delete-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0.4;
    flex-shrink: 0;

    svg {
      width: 16px;
      height: 16px;
    }

    &:hover {
      opacity: 1;
      background: #fee;
      color: #e53e3e;
    }
  }
}

.empty {
  text-align: center;
  padding: 48px 16px;
  color: var(--color-text-secondary, #888);

  .add-first-btn {
    margin-top: 16px;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    cursor: pointer;
  }
}
</style>
