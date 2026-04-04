<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore } from "@/stores";
import { usePeekPhoneStore } from "@/stores/peekPhone";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type { PeekPhoneTab } from "@/types/peekPhone";
import {
    AlertTriangle,
    ArrowLeft,
    Battery,
    BookOpen,
    Calendar,
    Camera,
    ChevronLeft,
    Clock,
    CreditCard,
    FileText,
    Image,
    ListChecks,
    Loader2,
    MessageCircle,
    RefreshCw,
    Signal,
    Smile,
    UtensilsCrossed,
    Wifi,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";

const emit = defineEmits<{ back: [] }>();
const props = defineProps<{ characterId: string; chatId: string }>();

const charactersStore = useCharactersStore();
const peekPhoneStore = usePeekPhoneStore();

const character = computed<StoredCharacter | undefined>(() =>
  charactersStore.characters.find((c) => c.id === props.characterId),
);
const charName = computed(
  () => character.value?.nickname || character.value?.data?.name || "角色",
);
const charAvatar = computed(() => character.value?.avatar || "");

// 當前視圖
const currentView = ref<"home" | PeekPhoneTab>("home");

// 時間顯示
const now = ref(new Date());
const timer = setInterval(() => {
  now.value = new Date();
}, 30000);
onUnmounted(() => {
  clearInterval(timer);
  // 不再在離開頁面時中止生成，讓串流在背景繼續
  // peekPhoneStore.abortAll();
});

const timeStr = computed(() => {
  const h = String(now.value.getHours()).padStart(2, "0");
  const m = String(now.value.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
});
const dateStr = computed(() => {
  const d = now.value;
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${weekdays[d.getDay()]}`;
});

// 桌面 App 列表
const phoneApps = [
  {
    key: "chat" as PeekPhoneTab,
    label: "訊息",
    icon: MessageCircle,
    color: "#ffffff",
    group: "A" as const,
  },
  {
    key: "schedule" as PeekPhoneTab,
    label: "行事曆",
    icon: Calendar,
    color: "#ffffff",
    group: "B" as const,
  },
  {
    key: "meals" as PeekPhoneTab,
    label: "飲食記錄",
    icon: UtensilsCrossed,
    color: "#ffffff",
    group: "B" as const,
  },
  {
    key: "balance" as PeekPhoneTab,
    label: "錢包",
    icon: CreditCard,
    color: "#ffffff",
    group: "C" as const,
  },
  {
    key: "memo" as PeekPhoneTab,
    label: "備忘錄",
    icon: ListChecks,
    color: "#ffffff",
    group: "B" as const,
  },
  {
    key: "notes" as PeekPhoneTab,
    label: "記事本",
    icon: FileText,
    color: "#ffffff",
    group: "C" as const,
  },
  {
    key: "diary" as PeekPhoneTab,
    label: "日記",
    icon: BookOpen,
    color: "#ffffff",
    group: "C" as const,
  },
  {
    key: "gallery" as PeekPhoneTab,
    label: "相冊",
    icon: Image,
    color: "#ffffff",
    group: "D" as const,
  },
];

// 從 store 讀取資料
const storeData = computed(() => peekPhoneStore.data);
const groupStatus = computed(() => peekPhoneStore.groupStatus);
const groupErrors = computed(() => peekPhoneStore.groupErrors);

// 各模塊的資料
const chats = computed(() => storeData.value?.chats ?? []);
const schedule = computed(() => storeData.value?.schedule ?? []);
const meals = computed(() => storeData.value?.meals ?? []);
const balance = computed(() => storeData.value?.balance ?? 0);
const transactions = computed(() => storeData.value?.transactions ?? []);
const memos = computed(() => storeData.value?.memos ?? []);
const notes = computed(() => storeData.value?.notes ?? []);
const diary = computed(() => storeData.value?.diary ?? []);
const gallery = computed(() => storeData.value?.gallery ?? []);

// 聊天詳情
const selectedChatId = ref<string | null>(null);
const selectedChat = computed(() =>
  chats.value.find((c) => c.id === selectedChatId.value),
);

// 記事本詳情
const selectedNoteId = ref<string | null>(null);
const selectedNote = computed(() =>
  notes.value.find((n) => n.id === selectedNoteId.value),
);

// 日記詳情
const selectedDiaryId = ref<string | null>(null);
const selectedDiary = computed(() =>
  diary.value.find((d) => d.id === selectedDiaryId.value),
);

// 刷新選單
const showRefreshMenu = ref(false);
const isAnyGroupLoading = computed(
  () =>
    groupStatus.value.A === "loading" ||
    groupStatus.value.B === "loading" ||
    groupStatus.value.C === "loading" ||
    groupStatus.value.D === "loading",
);

// 取得模塊對應的 group
function getGroupForTab(tab: PeekPhoneTab): "A" | "B" | "C" | "D" {
  const app = phoneApps.find((a) => a.key === tab);
  return app?.group ?? "A";
}

// 取得 badge 數量
function getBadge(tab: PeekPhoneTab): number {
  if (groupStatus.value[getGroupForTab(tab)] !== "done") return 0;
  switch (tab) {
    case "chat":
      return chats.value.length;
    case "memo":
      return memos.value.filter((m) => !m.done).length;
    case "gallery":
      return gallery.value.length;
    default:
      return 0;
  }
}

function openApp(key: PeekPhoneTab) {
  currentView.value = key;
}

function goBackToHome() {
  currentView.value = "home";
  selectedChatId.value = null;
  selectedNoteId.value = null;
  selectedDiaryId.value = null;
}

// 載入聊天資料並觸發生成
const chatRecord = ref<Chat | null>(null);

/** 僅載入聊天資料和快取，不呼叫 API */
async function loadChatData() {
  if (!character.value) return;
  try {
    await db.init();
    const chat = await db.get<Chat>(DB_STORES.CHATS, props.chatId);
    if (!chat) return;
    chatRecord.value = chat;
    // 只載入快取，不自動生成
    const cached = peekPhoneStore.getCached(props.characterId, props.chatId);
    if (cached) {
      await peekPhoneStore.generateAll(
        props.characterId,
        props.chatId,
        character.value,
        chat,
      );
    }
  } catch (err) {
    console.error("[PeekPhoneScreen] Failed to load chat data:", err);
  }
}

/** 用戶手動觸發全部生成 */
async function loadAndGenerate() {
  if (!character.value) return;
  try {
    if (!chatRecord.value) {
      await db.init();
      const chat = await db.get<Chat>(DB_STORES.CHATS, props.chatId);
      if (!chat) return;
      chatRecord.value = chat;
    }
    await peekPhoneStore.generateAll(
      props.characterId,
      props.chatId,
      character.value,
      chatRecord.value,
    );
  } catch (err) {
    console.error("[PeekPhoneScreen] Failed to generate:", err);
  }
}

async function retryGroup(group: "A" | "B" | "C" | "D") {
  if (!character.value || !chatRecord.value) return;
  await peekPhoneStore.retryGroup(group, character.value, chatRecord.value);
}

async function refreshAll() {
  showRefreshMenu.value = false;
  if (!character.value) return;
  if (!chatRecord.value) {
    await loadChatData();
  }
  if (!chatRecord.value) return;
  peekPhoneStore.clearCache(props.characterId, props.chatId);
  await peekPhoneStore.generateAll(
    props.characterId,
    props.chatId,
    character.value,
    chatRecord.value,
  );
}

async function refreshGroup(group: "A" | "B" | "C" | "D") {
  showRefreshMenu.value = false;
  if (!character.value) return;
  // 確保聊天資料已載入
  if (!chatRecord.value) {
    await loadChatData();
  }
  if (!chatRecord.value) return;
  // 確保 store 基本狀態已初始化（不觸發 API），只生成指定的組
  peekPhoneStore.ensureInitialized(props.characterId, props.chatId);
  await peekPhoneStore.retryGroup(group, character.value, chatRecord.value);
}

onMounted(() => {
  loadChatData();
});

// Utils
function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 取得聊天列表的最後一則訊息預覽（去除換行） */
function getLastMessagePreview(thread: {
  messages: { content: string }[];
}): string {
  const last = thread.messages[thread.messages.length - 1];
  if (!last) return "";
  return last.content.replace(/\n/g, " ");
}
function getMealLabel(type: string) {
  return (
    (
      {
        breakfast: "早餐",
        lunch: "午餐",
        dinner: "晚餐",
        snack: "點心",
      } as Record<string, string>
    )[type] || type
  );
}
function getMoodIcon(mood: string) {
  return (
    (
      {
        happy: "😊",
        neutral: "😐",
        sad: "😢",
        angry: "😠",
        excited: "🤩",
      } as Record<string, string>
    )[mood] || "😐"
  );
}
function getAppTitle(key: PeekPhoneTab) {
  return phoneApps.find((a) => a.key === key)?.label || "";
}
</script>

<template>
  <div class="peek-phone-screen">
    <!-- ===== 手機外框 ===== -->
    <div class="phone-frame">
      <!-- 背景裝飾 -->
      <div class="blob-bg-top" />
      <div class="blob-bg-bottom" />

      <!-- 狀態列 -->
      <div class="status-bar">
        <div class="status-left">
          <Signal :size="12" />
          <Wifi :size="12" />
        </div>
        <div class="status-time">{{ timeStr }}</div>
        <div class="status-right">
          <span class="battery-pct">87%</span>
          <Battery :size="14" />
        </div>
      </div>

      <!-- ===== 手機桌面 ===== -->
      <template v-if="currentView === 'home'">
        <!-- 返回按鈕（退出偷窺） -->
        <button class="exit-peek-btn" @click="emit('back')">
          <ArrowLeft :size="16" />
          <span>離開</span>
        </button>

        <!-- 重新整理按鈕 -->
        <div class="refresh-wrapper">
          <button
            class="refresh-btn"
            :class="{ 'is-loading': isAnyGroupLoading }"
            @click="!isAnyGroupLoading && (showRefreshMenu = !showRefreshMenu)"
          >
            <Loader2 v-if="isAnyGroupLoading" :size="16" class="spin" />
            <RefreshCw v-else :size="16" />
          </button>
          <Transition name="menu-fade">
            <div v-if="showRefreshMenu" class="refresh-menu">
              <div class="refresh-menu-item" @click="refreshAll">
                <RefreshCw :size="14" />
                <span>全部重新生成</span>
              </div>
              <div class="refresh-menu-divider" />
              <div class="refresh-menu-item" @click="refreshGroup('A')">
                <MessageCircle :size="14" />
                <span>聊天</span>
              </div>
              <div class="refresh-menu-item" @click="refreshGroup('B')">
                <Calendar :size="14" />
                <span>行程 / 飲食 / 備忘錄</span>
              </div>
              <div class="refresh-menu-item" @click="refreshGroup('C')">
                <BookOpen :size="14" />
                <span>記事本 / 日記 / 錢包</span>
              </div>
              <div class="refresh-menu-item" @click="refreshGroup('D')">
                <Image :size="14" />
                <span>相冊</span>
              </div>
            </div>
          </Transition>
          <div
            v-if="showRefreshMenu"
            class="refresh-overlay"
            @click="showRefreshMenu = false"
          />
        </div>

        <!-- 桌面時鐘 + 日期 -->
        <div class="home-clock">
          <div class="home-time">{{ timeStr }}</div>
          <div class="home-date">{{ dateStr }}</div>
        </div>

        <!-- 角色頭像 + 名字 -->
        <div class="home-owner">
          <div class="home-avatar">
            <template v-if="charAvatar">
              <img :src="charAvatar" alt="avatar" />
            </template>
            <Smile v-else :size="48" color="#1a1a1a" stroke-width="2" />
          </div>
          <div class="home-owner-name">{{ charName }} 的手機</div>
        </div>

        <!-- App 圖標網格 -->
        <div class="app-grid">
          <div
            v-for="app in phoneApps"
            :key="app.key"
            class="app-icon-wrapper"
            @click="openApp(app.key)"
          >
            <div class="app-icon" :style="{ background: app.color }">
              <component
                :is="app.icon"
                :size="28"
                color="#1a1a1a"
                stroke-width="2.5"
              />
              <div v-if="getBadge(app.key) > 0" class="app-badge">
                {{ getBadge(app.key) }}
              </div>
              <!-- 載入中指示 -->
              <div
                v-if="groupStatus[app.group] === 'loading'"
                class="app-loading"
              >
                <Loader2 :size="14" class="spin" />
              </div>
              <!-- 錯誤指示 -->
              <div
                v-if="groupStatus[app.group] === 'error'"
                class="app-error-dot"
              />
            </div>
            <div class="app-label">{{ app.label }}</div>
          </div>
        </div>

        <!-- 底部 Dock -->
        <div class="home-dock">
          <div class="dock-dot" />
          <div class="dock-dot" />
          <div class="dock-dot active" />
          <div class="dock-dot" />
          <div class="dock-dot" />
        </div>
      </template>

      <!-- ===== App 內頁 ===== -->
      <template v-else>
        <!-- App 頂部欄 -->
        <div class="app-header">
          <button class="app-back-btn" @click="goBackToHome">
            <ChevronLeft :size="20" />
            <span>返回</span>
          </button>
          <div class="app-header-title">{{ getAppTitle(currentView) }}</div>
          <div style="width: 60px" />
        </div>

        <div class="app-content">
          <!-- 載入中狀態 -->
          <template
            v-if="groupStatus[getGroupForTab(currentView)] === 'loading'"
          >
            <div class="group-loading">
              <Loader2 :size="40" class="spin" />
              <div class="group-loading-text">AI 正在生成內容...</div>
            </div>
          </template>

          <!-- 錯誤狀態 -->
          <template
            v-else-if="groupStatus[getGroupForTab(currentView)] === 'error'"
          >
            <div class="group-error">
              <AlertTriangle :size="40" />
              <div class="group-error-text">
                {{ groupErrors[getGroupForTab(currentView)] || "生成失敗" }}
              </div>
              <button
                class="retry-btn"
                @click="retryGroup(getGroupForTab(currentView))"
              >
                <RefreshCw :size="16" />
                <span>重試</span>
              </button>
            </div>
          </template>

          <!-- 內容狀態 -->
          <template v-else>
            <!-- ===== 聊天 ===== -->
            <template v-if="currentView === 'chat'">
              <div v-if="!selectedChat" class="chat-list">
                <div
                  v-for="thread in chats"
                  :key="thread.id"
                  class="chat-list-item"
                  @click="selectedChatId = thread.id"
                >
                  <div class="chat-list-avatar">
                    <MessageCircle :size="20" />
                  </div>
                  <div class="chat-list-info">
                    <div class="chat-list-name">{{ thread.contactName }}</div>
                    <div class="chat-list-preview">
                      {{ getLastMessagePreview(thread) }}
                    </div>
                  </div>
                  <div class="chat-list-time">
                    {{ formatTime(thread.updatedAt) }}
                  </div>
                </div>
                <div v-if="chats.length === 0" class="empty-hint">
                  沒有聊天記錄
                </div>
              </div>
              <div v-else class="chat-detail">
                <div class="chat-detail-header">
                  <button class="icon-btn-sm" @click="selectedChatId = null">
                    <ChevronLeft :size="18" />
                  </button>
                  <span class="chat-detail-name">{{
                    selectedChat.contactName
                  }}</span>
                </div>
                <div class="chat-messages">
                  <div
                    v-for="msg in selectedChat.messages"
                    :key="msg.id"
                    class="chat-msg"
                    :class="{ self: msg.isSelf }"
                  >
                    <div class="chat-bubble">{{ msg.content }}</div>
                    <div class="chat-time-label">
                      {{ formatTime(msg.timestamp) }}
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- ===== 行程 ===== -->
            <template v-else-if="currentView === 'schedule'">
              <div class="section-label">
                <Calendar :size="16" /><span>今日行程</span>
              </div>
              <div class="schedule-list">
                <div
                  v-for="item in schedule"
                  :key="item.id"
                  class="schedule-item"
                  :class="{ done: item.done }"
                >
                  <div class="schedule-time">{{ item.time }}</div>
                  <div class="schedule-line"><div class="schedule-dot" /></div>
                  <div class="schedule-info">
                    <div class="schedule-title">{{ item.title }}</div>
                    <div v-if="item.location" class="schedule-location">
                      {{ item.location }}
                    </div>
                  </div>
                  <div v-if="item.done" class="schedule-check">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2.5"
                      width="16"
                      height="16"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </div>
              </div>
              <div v-if="schedule.length === 0" class="empty-hint">
                今天沒有行程
              </div>
            </template>

            <!-- ===== 飲食 ===== -->
            <template v-else-if="currentView === 'meals'">
              <div class="section-label">
                <UtensilsCrossed :size="16" /><span>今日飲食</span>
              </div>
              <div class="meals-list">
                <div v-for="meal in meals" :key="meal.id" class="meal-card">
                  <div class="meal-type-badge" :class="meal.mealType">
                    {{ getMealLabel(meal.mealType) }}
                  </div>
                  <div class="meal-info">
                    <div class="meal-food">{{ meal.food }}</div>
                    <div v-if="meal.note" class="meal-note">
                      {{ meal.note }}
                    </div>
                  </div>
                  <div class="meal-time">
                    <Clock :size="12" /> {{ meal.time }}
                  </div>
                </div>
              </div>
              <div v-if="meals.length === 0" class="empty-hint">
                今天還沒吃東西
              </div>
            </template>

            <!-- ===== 存款 ===== -->
            <template v-else-if="currentView === 'balance'">
              <div class="balance-card">
                <div class="balance-label">帳戶餘額</div>
                <div class="balance-amount">
                  <span class="balance-currency">$</span>
                  <span class="balance-number">{{
                    balance.toLocaleString()
                  }}</span>
                </div>
                <div class="balance-hint">上次更新：今天</div>
              </div>

              <div v-if="transactions.length > 0" class="section-label">
                <CreditCard :size="16" /><span>交易記錄</span>
              </div>
              <div v-if="transactions.length > 0" class="tx-list">
                <div v-for="tx in transactions" :key="tx.id" class="tx-item">
                  <div class="tx-info">
                    <div class="tx-desc">{{ tx.description }}</div>
                    <div class="tx-time">{{ tx.time }}</div>
                  </div>
                  <div
                    class="tx-amount"
                    :class="tx.amount >= 0 ? 'tx-income' : 'tx-expense'"
                  >
                    {{ tx.amount >= 0 ? "+" : ""
                    }}{{ tx.amount.toLocaleString() }}
                  </div>
                </div>
              </div>
            </template>

            <!-- ===== 備忘錄 ===== -->
            <template v-else-if="currentView === 'memo'">
              <div class="section-label">
                <ListChecks :size="16" /><span>備忘錄</span>
              </div>
              <div class="memo-list">
                <div
                  v-for="memo in memos"
                  :key="memo.id"
                  class="memo-item"
                  :class="{ done: memo.done }"
                >
                  <div class="memo-checkbox">
                    <svg
                      v-if="memo.done"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      width="18"
                      height="18"
                    >
                      <path
                        d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"
                      />
                    </svg>
                    <div v-else class="memo-checkbox-empty" />
                  </div>
                  <div class="memo-text">{{ memo.content }}</div>
                </div>
              </div>
              <div v-if="memos.length === 0" class="empty-hint">沒有備忘錄</div>
            </template>

            <!-- ===== 記事本 ===== -->
            <template v-else-if="currentView === 'notes'">
              <div v-if="!selectedNote" class="notes-grid">
                <div
                  v-for="note in notes"
                  :key="note.id"
                  class="note-card"
                  @click="selectedNoteId = note.id"
                >
                  <div class="note-card-title">{{ note.title }}</div>
                  <div class="note-card-preview">
                    {{ note.content.slice(0, 60) }}...
                  </div>
                  <div class="note-card-date">
                    {{ new Date(note.updatedAt).toLocaleDateString("zh-TW") }}
                  </div>
                </div>
                <div v-if="notes.length === 0" class="empty-hint">沒有記事</div>
              </div>
              <div v-else class="note-detail">
                <div class="note-detail-header">
                  <button class="icon-btn-sm" @click="selectedNoteId = null">
                    <ChevronLeft :size="18" />
                  </button>
                  <span class="note-detail-title">{{
                    selectedNote.title
                  }}</span>
                </div>
                <div class="note-detail-content">
                  {{ selectedNote.content }}
                </div>
              </div>
            </template>

            <!-- ===== 日記 ===== -->
            <template v-else-if="currentView === 'diary'">
              <div v-if="!selectedDiary" class="diary-list">
                <div
                  v-for="entry in diary"
                  :key="entry.id"
                  class="diary-card"
                  @click="selectedDiaryId = entry.id"
                >
                  <div class="diary-card-header">
                    <span class="diary-date">{{ entry.date }}</span>
                    <span v-if="entry.weather" class="diary-weather">{{
                      entry.weather
                    }}</span>
                    <span class="diary-mood">{{
                      getMoodIcon(entry.mood)
                    }}</span>
                  </div>
                  <div class="diary-card-preview">
                    {{ entry.content.slice(0, 80) }}...
                  </div>
                </div>
                <div v-if="diary.length === 0" class="empty-hint">沒有日記</div>
              </div>
              <div v-else class="diary-detail">
                <div class="diary-detail-header">
                  <button class="icon-btn-sm" @click="selectedDiaryId = null">
                    <ChevronLeft :size="18" />
                  </button>
                  <div class="diary-detail-meta">
                    <span>{{ selectedDiary.date }}</span>
                    <span v-if="selectedDiary.weather">{{
                      selectedDiary.weather
                    }}</span>
                    <span>{{ getMoodIcon(selectedDiary.mood) }}</span>
                  </div>
                </div>
                <div class="diary-detail-content">
                  {{ selectedDiary.content }}
                </div>
              </div>
            </template>

            <!-- ===== 相冊 ===== -->
            <template v-else-if="currentView === 'gallery'">
              <div class="section-label">
                <Image :size="16" /><span>相冊</span>
              </div>
              <div v-if="gallery.length === 0" class="empty-hint">沒有照片</div>
              <div v-else class="gallery-list">
                <div
                  v-for="item in gallery"
                  :key="item.id"
                  class="gallery-card"
                >
                  <div class="gallery-icon-area">
                    <Camera v-if="item.source === 'selfie'" :size="28" />
                    <Image v-else-if="item.source === 'scene'" :size="28" />
                    <MessageCircle v-else :size="28" />
                  </div>
                  <div class="gallery-info">
                    <div class="gallery-desc">{{ item.description }}</div>
                    <div class="gallery-reason">
                      <span class="gallery-reason-label"
                        >{{
                          item.source === "saved" ? "保存原因" : "拍攝心情"
                        }}：</span
                      >{{ item.reason }}
                    </div>
                    <div class="gallery-meta">
                      <span class="gallery-source-tag">{{
                        item.source === "selfie"
                          ? "自拍"
                          : item.source === "scene"
                            ? "拍攝"
                            : "聊天保存"
                      }}</span>
                      <span class="gallery-date">{{ item.date }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>
      </template>

      <!-- 底部橫條 -->
      <div class="home-indicator" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

// 變數
$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$text-main: #1a1a1a;
$text-sec: #6b7280;
$accent-color: #fb923c;
$card-bg: #ffffff;
$blob-bg: #d4f2cc;

.peek-phone-screen {
  width: 100%;
  height: 100%;
  background: $bg-color;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-family: "Nunito", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}

// ===== Phone Frame =====
.phone-frame {
  width: 100%;
  height: 100%;
  max-height: 100%;
  background: $phone-bg;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.blob-bg-top {
  position: absolute;
  top: -50px;
  left: -20px;
  right: -20px;
  height: 240px;
  background: $blob-bg;
  border-bottom: 3px solid $frame-border;
  border-radius: 0 0 45% 45%;
  z-index: 0;
  transform: rotate(-3deg);
}

.blob-bg-bottom {
  position: absolute;
  bottom: -40px;
  left: -20px;
  right: -20px;
  height: 180px;
  background: $blob-bg;
  border-top: 3px solid $frame-border;
  border-radius: 50% 50% 0 0;
  z-index: 0;
  transform: rotate(2deg);
}

// ===== Status Bar =====
.status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 24px;
  font-size: 11px;
  font-weight: 800;
  color: $text-main;
  flex-shrink: 0;
  z-index: 2;
  position: relative;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-time {
  font-size: 13px;
  letter-spacing: 0.5px;
}

// ===== Exit & Refresh Buttons =====
.exit-peek-btn {
  position: absolute;
  top: 48px;
  left: 20px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  background: $card-bg;
  color: $text-main;
  font-weight: 800;
  font-size: 13px;
  cursor: pointer;
  z-index: 3;
  box-shadow: 2px 2px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }

  svg {
    stroke-width: 3px;
  }
}

.refresh-btn {
  position: absolute;
  top: 48px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid $frame-border;
  background: $card-bg;
  color: $text-main;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 3;
  box-shadow: 2px 2px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }

  &.is-loading {
    cursor: default;
    opacity: 0.7;
  }
}

.refresh-wrapper {
  position: absolute;
  top: 48px;
  right: 20px;
  z-index: 10;

  .refresh-btn {
    position: static;
  }
}

.refresh-overlay {
  position: fixed;
  inset: 0;
  z-index: 9;
}

.refresh-menu {
  position: absolute;
  top: 48px;
  right: 0;
  min-width: 180px;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 16px;
  box-shadow: 4px 4px 0 $frame-border;
  padding: 6px 0;
  z-index: 11;
}

.refresh-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 700;
  color: $text-main;
  cursor: pointer;
  transition: background 0.1s;
  white-space: nowrap;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  &:active {
    background: rgba(0, 0, 0, 0.08);
  }
}

.refresh-menu-divider {
  height: 1px;
  background: rgba(0, 0, 0, 0.1);
  margin: 4px 12px;
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 0.15s,
    transform 0.15s;
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

// ===== Home Screen =====
.home-clock {
  text-align: center;
  padding: 24px 0 16px;
  position: relative;
  z-index: 2;
  color: $text-main;
}

.home-time {
  font-size: 72px;
  font-weight: 900;
  letter-spacing: -2px;
  line-height: 1;
  text-shadow: 3px 3px 0 #fff;
}

.home-date {
  font-size: 15px;
  font-weight: 700;
  margin-top: 8px;
  opacity: 0.9;
}

.home-owner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 12px 0 24px;
  position: relative;
  z-index: 2;
  margin-top: -10px;
}

.home-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid $frame-border;
  background: $card-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 3px 3px 0 $frame-border;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.home-owner-name {
  font-size: 16px;
  font-weight: 800;
  color: $frame-border;
  background: $phone-bg;
  padding: 4px 12px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
}

// ===== App Grid =====
.app-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 24px 12px;
  padding: 20px 24px;
  align-content: start;
  overflow-y: auto;
  position: relative;
  z-index: 2;
}

.app-icon-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: transform 0.1s;

  &:active {
    transform: scale(0.92);
  }
}

.app-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  border: 3px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  box-shadow: 3px 3px 0 $frame-border;
  background: $card-bg;

  &::before {
    content: "";
    position: absolute;
    top: 6px;
    left: 8px;
    width: 16px;
    height: 8px;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 4px;
    transform: rotate(-15deg);
  }
}

.app-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  min-width: 24px;
  height: 24px;
  border-radius: 12px;
  background: $accent-color;
  color: #fff;
  font-size: 12px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border: 2px solid $frame-border;
  box-shadow: 2px 2px 0 $frame-border;
}

.app-loading {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: $card-bg;
  border: 2px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-error-dot {
  position: absolute;
  bottom: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #e53e3e;
  border: 2px solid $frame-border;
}

.app-label {
  font-size: 12px;
  font-weight: 800;
  color: $frame-border;
  text-align: center;
  line-height: 1.2;
}

// ===== Home Dock =====
.home-dock {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 16px 0;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.dock-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid $frame-border;
  background: transparent;

  &.active {
    background: $frame-border;
    width: 20px;
    border-radius: 4px;
  }
}

// ===== Home Indicator =====
.home-indicator {
  width: 140px;
  height: 5px;
  border-radius: 3px;
  background: $frame-border;
  margin: 8px auto 12px;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

// ===== App Header =====
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  padding-top: max(12px, var(--safe-top, 0px));
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.app-back-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 16px;
  border: 2px solid $frame-border;
  background: $card-bg;
  color: $text-main;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 2px 2px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }

  svg {
    stroke-width: 3px;
  }
}

.app-header-title {
  font-size: 18px;
  font-weight: 900;
  color: $text-main;
  text-transform: uppercase;
  letter-spacing: 1px;
}

// ===== App Content =====
.app-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px;
  position: relative;
  z-index: 1;
}

.section-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 800;
  color: $text-main;
  background: $accent-color;
  padding: 6px 16px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  margin-bottom: 16px;
  box-shadow: 2px 2px 0 $frame-border;
}

.empty-hint {
  text-align: center;
  color: $text-sec;
  font-size: 14px;
  font-weight: 700;
  padding: 40px 0;
  border: 2px dashed $text-sec;
  border-radius: 20px;
  margin-top: 20px;
}

// ===== Loading & Error States =====
.group-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
  color: $text-sec;
}

.group-loading-text {
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
}

.group-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 16px;
  color: #e53e3e;
}

.group-error-text {
  font-size: 14px;
  font-weight: 700;
  color: $text-sec;
  text-align: center;
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  background: $accent-color;
  color: $text-main;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 3px 3px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

// ===== Chat =====
.chat-list-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  background: $card-bg;
  border-radius: 24px;
  border: 2px solid $frame-border;
  margin-bottom: 12px;
  cursor: pointer;
  box-shadow: 3px 3px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }
}

.chat-list-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #fdf4ff;
  border: 2px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-main;
  flex-shrink: 0;
  svg {
    stroke-width: 2.5px;
  }
}

.chat-list-info {
  flex: 1;
  min-width: 0;
}
.chat-list-name {
  font-size: 16px;
  font-weight: 800;
  color: $text-main;
  margin-bottom: 4px;
}
.chat-list-preview {
  font-size: 13px;
  font-weight: 600;
  color: $text-sec;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-list-time {
  font-size: 12px;
  font-weight: 800;
  color: $text-main;
  background: #f1f5f9;
  padding: 4px 8px;
  border-radius: 12px;
  border: 2px solid $frame-border;
}

.chat-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.chat-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px dashed $frame-border;
}
.chat-detail-name {
  font-size: 20px;
  font-weight: 900;
  color: $text-main;
}

.icon-btn-sm {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 2px solid $frame-border;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $text-main;
  flex-shrink: 0;
  box-shadow: 2px 2px 0 $frame-border;
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.chat-messages {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-msg {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
  &.self {
    align-self: flex-end;
    align-items: flex-end;
    .chat-bubble {
      background: $text-main;
      color: #fff;
      border-radius: 20px 20px 4px 20px;
      border-color: $text-main;
      box-shadow: none;
    }
  }
}
.chat-bubble {
  padding: 12px 16px;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 20px 20px 20px 4px;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  color: $text-main;
  word-break: break-word;
  white-space: pre-line;
  box-shadow: 3px 3px 0 $frame-border;
}
.chat-time-label {
  font-size: 11px;
  font-weight: 800;
  color: $text-sec;
  margin-top: 6px;
  padding: 0 4px;
}

// ===== Schedule =====
.schedule-list {
  display: flex;
  flex-direction: column;
}
.schedule-item {
  display: flex;
  align-items: stretch;
  gap: 16px;
  padding: 12px 0;
  &.done {
    opacity: 0.6;
    .schedule-title {
      text-decoration: line-through;
    }
    .schedule-dot {
      background: $frame-border;
    }
  }
}
.schedule-time {
  font-size: 14px;
  font-weight: 900;
  color: $text-main;
  min-width: 50px;
  flex-shrink: 0;
  padding-top: 2px;
}
.schedule-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  flex-shrink: 0;
  position: relative;
  &::after {
    content: "";
    position: absolute;
    top: 24px;
    bottom: -16px;
    width: 2px;
    background: repeating-linear-gradient(
      to bottom,
      $frame-border,
      $frame-border 4px,
      transparent 4px,
      transparent 8px
    );
  }
}
.schedule-item:last-child .schedule-line::after {
  display: none;
}
.schedule-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 3px solid $frame-border;
  position: relative;
  z-index: 1;
}
.schedule-info {
  flex: 1;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 16px;
  padding: 12px;
  box-shadow: 3px 3px 0 $frame-border;
}
.schedule-title {
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
}
.schedule-location {
  font-size: 12px;
  font-weight: 700;
  color: $text-sec;
  margin-top: 4px;
  display: inline-block;
  background: #f1f5f9;
  padding: 2px 8px;
  border-radius: 8px;
  border: 1px solid $frame-border;
}
.schedule-check {
  color: $frame-border;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-left: 8px;
}

// ===== Meals =====
.meals-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.meal-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 24px;
  box-shadow: 4px 4px 0 $frame-border;
}
.meal-type-badge {
  padding: 6px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 900;
  border: 2px solid $frame-border;
  flex-shrink: 0;
  background: #fff;
  box-shadow: 2px 2px 0 $frame-border;
  &.breakfast {
    background: #fde047;
  }
  &.lunch {
    background: #93c5fd;
  }
  &.dinner {
    background: #c084fc;
  }
  &.snack {
    background: #f9a8d4;
  }
}
.meal-info {
  flex: 1;
  min-width: 0;
}
.meal-food {
  font-size: 16px;
  font-weight: 800;
  color: $text-main;
}
.meal-note {
  font-size: 13px;
  font-weight: 600;
  color: $text-sec;
  margin-top: 4px;
}
.meal-time {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 800;
  color: $text-main;
  flex-shrink: 0;
}

// ===== Balance =====
.balance-card {
  background: $accent-color;
  border: 3px solid $frame-border;
  border-radius: 24px;
  padding: 32px 20px;
  text-align: center;
  margin-bottom: 24px;
  box-shadow: 5px 5px 0 $frame-border;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    right: -20px;
    top: -20px;
    width: 100px;
    height: 100px;
    background: #fff;
    border-radius: 50%;
    opacity: 0.2;
  }
}
.balance-label {
  font-size: 14px;
  font-weight: 800;
  color: $text-main;
  margin-bottom: 12px;
  position: relative;
  z-index: 1;
}
.balance-amount {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  position: relative;
  z-index: 1;
}
.balance-currency {
  font-size: 24px;
  color: $text-main;
  font-weight: 900;
}
.balance-number {
  font-size: 48px;
  font-weight: 900;
  color: $text-main;
  letter-spacing: -1px;
}
.balance-hint {
  font-size: 12px;
  font-weight: 700;
  color: $text-main;
  opacity: 0.8;
  margin-top: 12px;
  position: relative;
  z-index: 1;
}

// ===== Transactions =====
.tx-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.tx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-bottom: none;
  &:first-child {
    border-radius: 16px 16px 0 0;
  }
  &:last-child {
    border-bottom: 2px solid $frame-border;
    border-radius: 0 0 16px 16px;
    box-shadow: 3px 3px 0 $frame-border;
  }
  &:first-child:last-child {
    border-radius: 16px;
  }
}
.tx-info {
  flex: 1;
  min-width: 0;
}
.tx-desc {
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
}
.tx-time {
  font-size: 12px;
  font-weight: 700;
  color: $text-sec;
  margin-top: 2px;
}
.tx-amount {
  font-size: 16px;
  font-weight: 900;
  flex-shrink: 0;
  margin-left: 12px;
}
.tx-income {
  color: #22c55e;
}
.tx-expense {
  color: #e53e3e;
}

// ===== Memo =====
.memo-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.memo-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 20px;
  box-shadow: 3px 3px 0 $frame-border;
  transition: transform 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }

  &.done {
    background: #f1f5f9;
    .memo-text {
      text-decoration: line-through;
      color: $text-sec;
    }
  }
}
.memo-checkbox {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $frame-border;
  flex-shrink: 0;
  background: $accent-color;
  border: 2px solid $frame-border;
  border-radius: 8px;
}
.memo-checkbox-empty {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid $frame-border;
  background: #fff;
}
.memo-text {
  font-size: 16px;
  font-weight: 800;
  color: $text-main;
}

// ===== Notes =====
.notes-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.note-card {
  background: #fdf4ff;
  border: 2px solid $frame-border;
  border-radius: 24px;
  padding: 20px;
  cursor: pointer;
  box-shadow: 4px 4px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:nth-child(even) {
    background: #ecfeff;
  }
  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
}
.note-card-title {
  font-size: 16px;
  font-weight: 900;
  color: $text-main;
  margin-bottom: 8px;
}
.note-card-preview {
  font-size: 13px;
  font-weight: 700;
  color: $text-sec;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.note-card-date {
  font-size: 11px;
  font-weight: 800;
  color: $text-main;
  margin-top: 12px;
  display: inline-block;
  background: #fff;
  border: 2px solid $frame-border;
  padding: 4px 8px;
  border-radius: 12px;
}

.note-detail {
  background: #fefce8;
  border: 2px solid $frame-border;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 4px 4px 0 $frame-border;
}
.note-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px solid $frame-border;
}
.note-detail-title {
  font-size: 20px;
  font-weight: 900;
  color: $text-main;
}
.note-detail-content {
  font-size: 16px;
  font-weight: 700;
  color: $text-main;
  line-height: 1.8;
  white-space: pre-wrap;
}

// ===== Diary =====
.diary-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.diary-card {
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 24px;
  padding: 20px;
  cursor: pointer;
  box-shadow: 4px 4px 0 $frame-border;
  transition: transform 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0 0 0 $frame-border;
  }
}
.diary-card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.diary-date {
  font-size: 15px;
  font-weight: 900;
  color: $text-main;
}
.diary-weather {
  font-size: 12px;
  font-weight: 800;
  color: $text-main;
  background: #fef08a;
  padding: 4px 10px;
  border-radius: 12px;
  border: 2px solid $frame-border;
}
.diary-mood {
  font-size: 24px;
  margin-left: auto;
}
.diary-card-preview {
  font-size: 14px;
  font-weight: 700;
  color: $text-sec;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.diary-detail {
  background: $card-bg;
  border: 2px solid $frame-border;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 4px 4px 0 $frame-border;
}
.diary-detail-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 2px dashed $frame-border;

  .icon-btn-sm {
    align-self: flex-start;
  }
}
.diary-detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 800;
  color: $text-main;

  span:not(:last-child) {
    background: #f1f5f9;
    padding: 6px 12px;
    border-radius: 12px;
    border: 2px solid $frame-border;
  }
}
.diary-detail-content {
  font-size: 16px;
  font-weight: 700;
  color: $text-main;
  line-height: 1.8;
  white-space: pre-wrap;
}

// ===== Gallery =====
.gallery-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gallery-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  background: $card-bg;
  border: 3px solid $frame-border;
  border-radius: 20px;
  box-shadow: 4px 4px 0 $frame-border;
}
.gallery-icon-area {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: #f0fdf4;
  border: 2px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: $text-main;
}
.gallery-info {
  flex: 1;
  min-width: 0;
}
.gallery-desc {
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
  margin-bottom: 6px;
  line-height: 1.4;
}
.gallery-reason {
  font-size: 13px;
  font-weight: 700;
  color: $text-sec;
  line-height: 1.5;
  margin-bottom: 8px;
}
.gallery-reason-label {
  color: $accent-color;
  font-weight: 800;
}
.gallery-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.gallery-source-tag {
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 8px;
  border: 2px solid $frame-border;
  background: #fef3c7;
  color: $text-main;
}
.gallery-date {
  font-size: 12px;
  font-weight: 700;
  color: $text-sec;
}
</style>
