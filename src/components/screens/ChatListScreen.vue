<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { deleteChatCascade } from "@/storage/chatStorage";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import type { Chat } from "@/types/chat";
import { createDefaultGroupChat } from "@/types/chat";
import { computed, onMounted, ref } from "vue";
import { setLocalChatUnreadCount } from "@/storage/chatStorage";

// Emits
const emit = defineEmits<{
  (e: "back"): void;
  (e: "openChat", chatId: string, characterId: string): void;
  (e: "newChat", characterId: string): void;
}>();

// Stores
const charactersStore = useCharactersStore();
const lorebooksStore = useLorebooksStore();

// 狀態
const currentTab = ref<"chats" | "contacts">("chats");
const chatList = ref<Chat[]>([]);
const isLoading = ref(true);
const searchQuery = ref("");

// 載入對話列表
async function loadChats() {
  isLoading.value = true;
  try {
    await db.init();
    const chats = await db.getAll<Chat>(DB_STORES.CHATS);

    // 按更新時間排序所有聊天
    const sorted = chats.sort((a, b) => b.updatedAt - a.updatedAt);

    // 每個角色（或群聊）只保留最新的一個入口顯示在主列表
    // 但 pinnedToList === true 的聊天不受去重限制，可以同時出現在列表中
    // 群聊用 chat.id 作為唯一 key（群聊沒有共用 characterId 的概念）
    const seen = new Set<string>();
    chatList.value = sorted.filter((c) => {
      // 釘選到列表的聊天直接顯示，不參與去重
      if (c.pinnedToList) return true;
      const key = c.isGroupChat ? `group_${c.id}` : c.characterId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  } catch (e) {
    console.error("載入對話失敗:", e);
  } finally {
    isLoading.value = false;
  }
}

// 載入角色
async function loadCharacters() {
  if (charactersStore.characters.length === 0) {
    await charactersStore.loadCharacters();
  }
}

onMounted(async () => {
  await Promise.all([loadChats(), loadCharacters()]);
});

// 過濾後的對話列表
const filteredChats = computed(() => {
  if (!searchQuery.value.trim()) return chatList.value;
  const query = searchQuery.value.toLowerCase();
  return chatList.value.filter((chat) => {
    const name = getCharacterName(chat);
    const lastMessage =
      chat.lastMessagePreview ||
      chat.messages[chat.messages.length - 1]?.content ||
      "";
    return (
      name.toLowerCase().includes(query) ||
      lastMessage.toLowerCase().includes(query)
    );
  });
});

// 置頂與最近對話
const pinnedChats = computed(() => filteredChats.value.filter(c => c.pinnedToList));
const recentChats = computed(() => filteredChats.value.filter(c => !c.pinnedToList));

// 預覽輔助函式
function getPreviewContent(chat: Chat) {
  return chat.lastMessagePreview || chat.messages[chat.messages.length - 1]?.content || "開始對話...";
}

function formatPreview(chat: Chat) {
  const content = getPreviewContent(chat);
  if (content.trim().startsWith("<style") || content.trim().startsWith("<script") || content.trim().startsWith("<div")) return "網頁卡片";
  if (content.includes("[sticker:")) return "貼圖";
  if (content.includes("[image]") || content.includes("data:image")) return "圖片";
  const text = content.replace(/<[^>]*>?/gm, '');
  return text.length > 50 ? text.substring(0, 50) + "..." : text;
}

function previewIconKind(chat: Chat) {
  const content = getPreviewContent(chat);
  if (content.trim().startsWith("<style") || content.trim().startsWith("<script") || content.trim().startsWith("<div")) return 'html';
  if (content.includes("[sticker:")) return 'sticker';
  if (content.includes("[image]") || content.includes("data:image")) return 'image';
  return 'text';
}

// 過濾後的角色列表
const filteredCharacters = computed(() => {
  if (!searchQuery.value.trim()) return charactersStore.characters;
  const query = searchQuery.value.toLowerCase();
  return charactersStore.characters.filter((char) => {
    const name = char.nickname || char.data?.name || "";
    return name.toLowerCase().includes(query);
  });
});

// 格式化時間
function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "剛剛";
  if (diff < hour) return `${Math.floor(diff / minute)} 分鐘前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小時前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;

  const date = new Date(timestamp);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// 獲取角色頭像（優先使用聊天專屬覆蓋頭像）
function getCharacterAvatar(characterId: string, chat?: Chat): string {
  if (chat?.charAvatarOverride) return chat.charAvatarOverride;
  const char = charactersStore.characters.find((c) => c.id === characterId);
  return char?.avatar || "";
}

// 獲取角色名稱（優先從 store 獲取真實名稱）
function getCharacterName(chat: Chat): string {
  if (chat.isGroupChat && chat.groupMetadata) {
    return chat.groupMetadata.groupName;
  }
  const char = charactersStore.characters.find(
    (c) => c.id === chat.characterId,
  );
  return char?.nickname || char?.data?.name || chat.name || "未知角色";
}

// 開啟對話
async function openChat(chat: Chat) {
  // 清除未讀計數
  if (chat.unreadCount) {
    chat.unreadCount = 0;
    try {
      await setLocalChatUnreadCount(chat.id, 0);
    } catch (e) {
      console.error("清除未讀失敗:", e);
    }
  }

  emit("openChat", chat.id, chat.characterId);
}

// 開始新對話
function startNewChat(characterId: string) {
  emit("newChat", characterId);
}

// 刪除對話
async function deleteChat(chatId: string) {
  if (!confirm("確定要刪除這個對話嗎？")) return;

  try {
    await deleteChatCascade(chatId);
    await loadChats();
  } catch (e) {
    console.error("刪除對話失敗:", e);
  }
}

// ===== 群聊建立 =====
const showGroupChatCreation = ref(false);
const groupChatName = ref("");
const selectedCharacterIds = ref<string[]>([]);

function openGroupChatCreation() {
  showGroupChatCreation.value = true;
  groupChatName.value = "";
  selectedCharacterIds.value = [];
}

function closeGroupChatCreation() {
  showGroupChatCreation.value = false;
}

function toggleCharacterSelection(characterId: string) {
  const idx = selectedCharacterIds.value.indexOf(characterId);
  if (idx >= 0) {
    selectedCharacterIds.value.splice(idx, 1);
  } else {
    selectedCharacterIds.value.push(characterId);
  }
}

const canCreateGroupChat = computed(
  () => selectedCharacterIds.value.length >= 2 && groupChatName.value.trim(),
);

async function createGroupChat() {
  if (!canCreateGroupChat.value) return;
  try {
    const chat = createDefaultGroupChat(
      groupChatName.value.trim(),
      selectedCharacterIds.value,
    );
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
    closeGroupChatCreation();
    await loadChats();
    emit("openChat", chat.id, chat.characterId);
  } catch (e) {
    console.error("建立群聊失敗:", e);
    alert("建立群聊失敗");
  }
}

// ===== 群聊設定 =====
const showGroupChatSettings = ref(false);
const editingGroupChat = ref<Chat | null>(null);
const editGroupName = ref("");
const groupAvatarInput = ref<HTMLInputElement | null>(null);
const editGroupLorebookIds = ref<string[]>([]);

function openGroupChatSettings(chat: Chat) {
  editingGroupChat.value = chat;
  editGroupName.value = chat.groupMetadata?.groupName || "";
  editGroupLorebookIds.value = [...(chat.groupMetadata?.lorebookIds || [])];
  // 確保世界書列表已載入
  if (lorebooksStore.lorebooks.length === 0) {
    lorebooksStore.loadLorebooks();
  }
  showGroupChatSettings.value = true;
}

function closeGroupChatSettings() {
  showGroupChatSettings.value = false;
  editingGroupChat.value = null;
}

function triggerGroupAvatarUpload() {
  groupAvatarInput.value?.click();
}

function handleGroupAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file || !editingGroupChat.value?.groupMetadata) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    if (editingGroupChat.value?.groupMetadata) {
      editingGroupChat.value.groupMetadata.groupAvatar = e.target
        ?.result as string;
    }
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function removeGroupAvatar() {
  if (editingGroupChat.value?.groupMetadata) {
    editingGroupChat.value.groupMetadata.groupAvatar = undefined;
  }
}

async function saveGroupChatSettings() {
  if (!editingGroupChat.value?.groupMetadata) return;
  editingGroupChat.value.groupMetadata.groupName =
    editGroupName.value.trim() ||
    editingGroupChat.value.groupMetadata.groupName;
  editingGroupChat.value.groupMetadata.lorebookIds = [
    ...editGroupLorebookIds.value,
  ];
  editingGroupChat.value.name = editingGroupChat.value.groupMetadata.groupName;
  editingGroupChat.value.updatedAt = Date.now();
  await db.put(
    DB_STORES.CHATS,
    JSON.parse(JSON.stringify(editingGroupChat.value)),
  );
  await loadChats();
  closeGroupChatSettings();
}

function toggleGroupMemberAdmin(characterId: string) {
  if (!editingGroupChat.value?.groupMetadata) return;
  const member = editingGroupChat.value.groupMetadata.members.find(
    (m) => m.characterId === characterId,
  );
  if (member) member.isAdmin = !member.isAdmin;
}

function toggleGroupMemberMute(characterId: string) {
  if (!editingGroupChat.value?.groupMetadata) return;
  const member = editingGroupChat.value.groupMetadata.members.find(
    (m) => m.characterId === characterId,
  );
  if (member) member.isMuted = !member.isMuted;
}

function removeGroupMember(characterId: string) {
  if (!editingGroupChat.value?.groupMetadata) return;
  const members = editingGroupChat.value.groupMetadata.members;
  if (members.length <= 2) {
    alert("群聊至少需要 2 位成員");
    return;
  }
  editingGroupChat.value.groupMetadata.members = members.filter(
    (m) => m.characterId !== characterId,
  );
}

function addMemberToGroup(characterId: string) {
  if (!editingGroupChat.value?.groupMetadata) return;
  const exists = editingGroupChat.value.groupMetadata.members.some(
    (m) => m.characterId === characterId,
  );
  if (exists) return;
  editingGroupChat.value.groupMetadata.members.push({
    characterId,
    isAdmin: false,
    isMuted: false,
    joinedAt: Date.now(),
  });
}

function toggleGroupLorebook(lorebookId: string) {
  const idx = editGroupLorebookIds.value.indexOf(lorebookId);
  if (idx === -1) {
    editGroupLorebookIds.value.push(lorebookId);
  } else {
    editGroupLorebookIds.value.splice(idx, 1);
  }
}

function getCharName(characterId: string): string {
  const char = charactersStore.characters.find((c) => c.id === characterId);
  return char?.nickname || char?.data?.name || "未知";
}

function getCharAvatar(characterId: string): string {
  const char = charactersStore.characters.find((c) => c.id === characterId);
  return char?.avatar || "";
}

// ===== 長按刪除功能 =====
const longPressChat = ref<Chat | null>(null);
const longPressPosition = ref({ x: 0, y: 0 });
let longPressTimer: ReturnType<typeof setTimeout> | null = null;

function handleChatTouchStart(event: TouchEvent | MouseEvent, chat: Chat) {
  const touch = "touches" in event ? event.touches[0] : event;
  longPressPosition.value = { x: touch.clientX, y: touch.clientY };

  longPressTimer = setTimeout(() => {
    longPressChat.value = chat;
  }, 500); // 500ms 長按觸發
}

function handleChatTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleChatTouchMove() {
  // 移動時取消長按
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function closeLongPressMenu() {
  longPressChat.value = null;
}

async function confirmDeleteChat() {
  if (!longPressChat.value) return;
  const chatId = longPressChat.value.id;
  closeLongPressMenu();

  try {
    await deleteChatCascade(chatId);
    await loadChats();
  } catch (e) {
    console.error("刪除對話失敗:", e);
  }
}

async function togglePinChat() {
  if (!longPressChat.value) return;
  const chatId = longPressChat.value.id;
  const wasPinned = longPressChat.value.pinnedToList;
  closeLongPressMenu();

  try {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
    if (!chat) return;
    chat.pinnedToList = !wasPinned;
    chat.updatedAt = Date.now();
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
    await loadChats();
  } catch (e) {
    console.error("切換釘選失敗:", e);
  }
}
</script>

<template>
  <div class="screen-container chat-list-screen">
    <!-- 整合的頂部導航 -->
    <div class="chat-list-topbar">
      <!-- 標題欄 -->
      <header class="topbar-header">
        <button class="header-back" @click="emit('back')">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"
            />
          </svg>
        </button>
        <h1 class="header-title">訊息</h1>
      </header>

      <!-- 分頁標籤 -->
      <nav class="pill-tabs">
        <button
          class="pill-tab"
          :class="{ active: currentTab === 'chats' }"
          @click="currentTab = 'chats'"
        >
          對話
          <span v-if="chatList.length" class="pill-badge">{{ chatList.length }}</span>
        </button>
        <button
          class="pill-tab"
          :class="{ active: currentTab === 'contacts' }"
          @click="currentTab = 'contacts'"
        >
          聯繫人
          <span v-if="charactersStore.characters.length" class="pill-badge">{{ charactersStore.characters.length }}</span>
        </button>
      </nav>

      <!-- 搜尋欄與新建群聊 -->
      <div class="topbar-actions">
        <div class="search-bar">
          <svg viewBox="0 0 24 24" fill="currentColor" class="search-icon">
            <path
              d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"
            />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="currentTab === 'chats' ? '搜尋對話...' : '搜尋聯繫人...'"
          />
        </div>
        <button v-if="currentTab === 'chats'" class="create-group-fab" @click="openGroupChatCreation" title="建立群聊">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
          </svg>
          <span class="fab-label">群聊</span>
        </button>
      </div>
    </div>

    <!-- 內容區域 -->
    <main class="content">
      <!-- 載入中 -->
      <div v-if="isLoading" class="loading">
        <div class="spinner"></div>
        <span>載入中...</span>
      </div>

      <!-- 對話列表 -->
      <template v-else-if="currentTab === 'chats'">
        <div v-if="filteredChats.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z" />
          </svg>
          <p>還沒有對話</p>
          <div class="empty-actions">
            <button class="btn-primary" @click="currentTab = 'contacts'">開始新對話</button>
            <button class="btn-ghost" @click="openGroupChatCreation">建立群聊</button>
          </div>
        </div>

        <div v-else class="chat-list">
          <!-- 置頂對話 -->
          <template v-if="pinnedChats.length > 0">
            <div class="section-label">置頂對話</div>
            <div
              v-for="chat in pinnedChats"
              :key="chat.id"
              class="chat-item pinned"
              @click="openChat(chat)"
              @touchstart="handleChatTouchStart($event, chat)"
              @touchend="handleChatTouchEnd"
              @touchmove="handleChatTouchMove"
              @mousedown="handleChatTouchStart($event, chat)"
              @mouseup="handleChatTouchEnd"
              @mouseleave="handleChatTouchEnd"
            >
              <div class="chat-avatar">
                <img v-if="!chat.isGroupChat && getCharacterAvatar(chat.characterId, chat)" :src="getCharacterAvatar(chat.characterId, chat)" :alt="getCharacterName(chat)" />
                <img v-else-if="chat.isGroupChat && chat.groupMetadata?.isMultiCharCard && getCharacterAvatar(chat.characterId, chat)" :src="getCharacterAvatar(chat.characterId, chat)" :alt="getCharacterName(chat)" />
                <img v-else-if="chat.isGroupChat && chat.groupMetadata?.groupAvatar" :src="chat.groupMetadata.groupAvatar" :alt="getCharacterName(chat)" />
                <div v-else-if="chat.isGroupChat" class="group-avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                </div>
                <div v-else class="avatar-placeholder">{{ getCharacterName(chat).charAt(0) }}</div>
                
                <div v-if="chat.unreadCount" class="avatar-dot unread"></div>
                <div v-else-if="chat.groupMetadata?.isMultiCharCard" class="avatar-dot multi"></div>
                <div v-else-if="chat.isGroupChat" class="avatar-dot group"></div>
              </div>
              <div class="chat-info">
                <div class="chat-header">
                  <span class="chat-name">
                    <span v-if="chat.isGroupChat && !chat.groupMetadata?.isMultiCharCard" class="inline-badge group" title="群聊">群</span>
                    <span v-else-if="chat.groupMetadata?.isMultiCharCard" class="inline-badge multi" title="多角卡">多</span>
                    {{ getCharacterName(chat) }}
                  </span>
                </div>
                <div class="preview-line">
                  <svg v-if="previewIconKind(chat) === 'html'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.34.16-2h4.68c.09.66.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
                  <svg v-else-if="previewIconKind(chat) === 'sticker'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                  <svg v-else-if="previewIconKind(chat) === 'image'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                  <span class="chat-preview-text">{{ formatPreview(chat) }}</span>
                </div>
                <div v-if="chat.name" class="chat-file-label">{{ chat.name }}</div>
              </div>
              <div class="meta-column">
                <span class="chat-time">{{ formatTime(chat.updatedAt) }}</span>
                <span v-if="chat.unreadCount" class="unread-badge">{{ chat.unreadCount > 99 ? "99+" : chat.unreadCount }}</span>
                <svg v-else class="pin-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" /></svg>
              </div>
            </div>
          </template>

          <!-- 最近對話 -->
          <template v-if="recentChats.length > 0">
            <div class="section-label" v-if="pinnedChats.length > 0">最近對話</div>
            <div
              v-for="chat in recentChats"
              :key="chat.id"
              class="chat-item"
              @click="openChat(chat)"
              @touchstart="handleChatTouchStart($event, chat)"
              @touchend="handleChatTouchEnd"
              @touchmove="handleChatTouchMove"
              @mousedown="handleChatTouchStart($event, chat)"
              @mouseup="handleChatTouchEnd"
              @mouseleave="handleChatTouchEnd"
            >
              <div class="chat-avatar">
                <img v-if="!chat.isGroupChat && getCharacterAvatar(chat.characterId, chat)" :src="getCharacterAvatar(chat.characterId, chat)" :alt="getCharacterName(chat)" />
                <img v-else-if="chat.isGroupChat && chat.groupMetadata?.isMultiCharCard && getCharacterAvatar(chat.characterId, chat)" :src="getCharacterAvatar(chat.characterId, chat)" :alt="getCharacterName(chat)" />
                <img v-else-if="chat.isGroupChat && chat.groupMetadata?.groupAvatar" :src="chat.groupMetadata.groupAvatar" :alt="getCharacterName(chat)" />
                <div v-else-if="chat.isGroupChat" class="group-avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
                  </svg>
                </div>
                <div v-else class="avatar-placeholder">{{ getCharacterName(chat).charAt(0) }}</div>
                
                <div v-if="chat.unreadCount" class="avatar-dot unread"></div>
                <div v-else-if="chat.groupMetadata?.isMultiCharCard" class="avatar-dot multi"></div>
                <div v-else-if="chat.isGroupChat" class="avatar-dot group"></div>
              </div>
              <div class="chat-info">
                <div class="chat-header">
                  <span class="chat-name">
                    <span v-if="chat.isGroupChat && !chat.groupMetadata?.isMultiCharCard" class="inline-badge group" title="群聊">群</span>
                    <span v-else-if="chat.groupMetadata?.isMultiCharCard" class="inline-badge multi" title="多角卡">多</span>
                    {{ getCharacterName(chat) }}
                  </span>
                </div>
                <div class="preview-line">
                  <svg v-if="previewIconKind(chat) === 'html'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2 0 .68.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2 0-.68.07-1.34.16-2h4.68c.09.66.16 1.32.16 2 0 .68-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2 0-.68-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
                  <svg v-else-if="previewIconKind(chat) === 'sticker'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
                  <svg v-else-if="previewIconKind(chat) === 'image'" class="preview-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
                  <span class="chat-preview-text">{{ formatPreview(chat) }}</span>
                </div>
              </div>
              <div class="meta-column">
                <span class="chat-time">{{ formatTime(chat.updatedAt) }}</span>
                <span v-if="chat.unreadCount" class="unread-badge">{{ chat.unreadCount > 99 ? "99+" : chat.unreadCount }}</span>
              </div>
            </div>
          </template>
        </div>
      </template>

      <!-- 聯繫人列表 -->
      <template v-else>
        <div v-if="filteredCharacters.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
            />
          </svg>
          <p>還沒有角色</p>
          <p class="hint">請先在角色庫中添加角色</p>
        </div>

        <div v-else class="contacts-grid">
          <div
            v-for="character in filteredCharacters"
            :key="character.id"
            class="contact-card"
            @click="startNewChat(character.id)"
          >
            <div class="contact-avatar">
              <img
                v-if="character.avatar"
                :src="character.avatar"
                :alt="
                  character.nickname || character.data?.name
                "
              />
              <div v-else class="avatar-placeholder large">
                {{
                  (
                    character.nickname ||
                    character.data?.name ||
                    "?"
                  ).charAt(0)
                }}
              </div>
            </div>
            <span class="contact-name">{{
              character.nickname || character.data?.name
            }}</span>
            <span class="contact-hint">點擊開始對話</span>
          </div>
        </div>
      </template>
    </main>

    <!-- 群聊建立彈窗 -->
    <Transition name="fade">
      <div
        v-if="showGroupChatCreation"
        class="modal-overlay"
        @click.self="closeGroupChatCreation"
      >
        <div class="modal-content group-creation-modal">
          <h2 class="modal-title">建立群聊</h2>

          <div class="form-group">
            <label>群名稱</label>
            <input
              v-model="groupChatName"
              type="text"
              placeholder="輸入群聊名稱..."
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label>選擇成員（至少 2 位）</label>
            <div class="character-select-list">
              <div
                v-for="character in charactersStore.characters"
                :key="character.id"
                class="character-select-item"
                :class="{
                  selected: selectedCharacterIds.includes(character.id),
                }"
                @click="toggleCharacterSelection(character.id)"
              >
                <div class="select-avatar">
                  <img
                    v-if="character.avatar"
                    :src="character.avatar"
                    :alt="character.data?.name"
                  />
                  <div v-else class="avatar-placeholder small">
                    {{
                      (
                        character.nickname ||
                        character.data?.name ||
                        "?"
                      ).charAt(0)
                    }}
                  </div>
                </div>
                <span class="select-name">{{
                  character.nickname || character.data?.name
                }}</span>
                <div class="select-check">
                  <svg
                    v-if="selectedCharacterIds.includes(character.id)"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="closeGroupChatCreation">
              取消
            </button>
            <button
              class="btn-confirm"
              :disabled="!canCreateGroupChat"
              @click="createGroupChat"
            >
              建立（{{ selectedCharacterIds.length }} 位成員）
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 群聊設定彈窗 -->
    <Transition name="fade">
      <div
        v-if="showGroupChatSettings && editingGroupChat"
        class="modal-overlay"
        @click.self="closeGroupChatSettings"
      >
        <div class="modal-content group-settings-modal">
          <h2 class="modal-title">群聊設定</h2>

          <!-- 群頭像 -->
          <div class="form-group group-avatar-section">
            <label>群頭像</label>
            <div class="group-avatar-editor">
              <div
                class="group-avatar-preview"
                @click="triggerGroupAvatarUpload"
              >
                <img
                  v-if="editingGroupChat.groupMetadata?.groupAvatar"
                  :src="editingGroupChat.groupMetadata.groupAvatar"
                  alt="群頭像"
                />
                <div v-else class="group-avatar-placeholder">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
                    />
                  </svg>
                </div>
                <div class="avatar-edit-overlay">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path
                      d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
                    />
                  </svg>
                </div>
              </div>
              <button
                v-if="editingGroupChat.groupMetadata?.groupAvatar"
                class="btn-remove-avatar"
                @click="removeGroupAvatar"
              >
                移除頭像
              </button>
            </div>
            <input
              ref="groupAvatarInput"
              type="file"
              accept="image/*"
              style="display: none"
              @change="handleGroupAvatarChange"
            />
          </div>

          <div class="form-group">
            <label>群名稱</label>
            <input v-model="editGroupName" type="text" class="form-input" />
          </div>

          <div class="form-group">
            <label>成員管理</label>
            <div class="member-list">
              <div
                v-for="member in editingGroupChat.groupMetadata?.members"
                :key="member.characterId"
                class="member-item"
              >
                <div class="member-avatar">
                  <img
                    v-if="getCharAvatar(member.characterId)"
                    :src="getCharAvatar(member.characterId)"
                  />
                  <div v-else class="avatar-placeholder small">
                    {{ getCharName(member.characterId).charAt(0) }}
                  </div>
                </div>
                <span class="member-name">{{
                  getCharName(member.characterId)
                }}</span>
                <div class="member-badges">
                  <span v-if="member.isAdmin" class="badge admin">管理員</span>
                  <span v-if="member.isMuted" class="badge muted">已禁言</span>
                </div>
                <div class="member-actions">
                  <button
                    class="action-btn"
                    @click="toggleGroupMemberAdmin(member.characterId)"
                    :title="member.isAdmin ? '取消管理員' : '設為管理員'"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"
                      />
                    </svg>
                  </button>
                  <button
                    class="action-btn"
                    @click="toggleGroupMemberMute(member.characterId)"
                    :title="member.isMuted ? '解除禁言' : '禁言'"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
                      />
                    </svg>
                  </button>
                  <button
                    class="action-btn danger"
                    @click="removeGroupMember(member.characterId)"
                    title="移除"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path
                        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- 新增成員 -->
          <div class="form-group">
            <label>新增成員</label>
            <div class="add-member-list">
              <div
                v-for="character in charactersStore.characters.filter(
                  (c) =>
                    !editingGroupChat?.groupMetadata?.members.some(
                      (m) => m.characterId === c.id,
                    ),
                )"
                :key="character.id"
                class="character-select-item compact"
                @click="addMemberToGroup(character.id)"
              >
                <div class="select-avatar">
                  <img v-if="character.avatar" :src="character.avatar" />
                  <div v-else class="avatar-placeholder small">
                    {{
                      (
                        character.nickname ||
                        character.data?.name ||
                        "?"
                      ).charAt(0)
                    }}
                  </div>
                </div>
                <span class="select-name">{{
                  character.nickname || character.data?.name
                }}</span>
                <svg viewBox="0 0 24 24" fill="currentColor" class="add-icon">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
              </div>
            </div>
          </div>

          <!-- 綁定世界書 -->
          <div class="form-group">
            <label>綁定世界書（僅此群組生效）</label>
            <div
              v-if="lorebooksStore.lorebooks.length === 0"
              class="empty-hint"
            >
              尚無世界書，請先建立世界書
            </div>
            <div v-else class="lorebook-bind-list">
              <div
                v-for="lb in lorebooksStore.lorebooks"
                :key="lb.id"
                class="lorebook-bind-item"
                :class="{ active: editGroupLorebookIds.includes(lb.id) }"
                @click="toggleGroupLorebook(lb.id)"
              >
                <div class="lorebook-check">
                  <svg
                    v-if="editGroupLorebookIds.includes(lb.id)"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"
                    />
                  </svg>
                </div>
                <div class="lorebook-info">
                  <span class="lorebook-name">{{ lb.name }}</span>
                  <span class="lorebook-count"
                    >{{ lb.entries.length }} 條目</span
                  >
                </div>
              </div>
            </div>
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="closeGroupChatSettings">
              取消
            </button>
            <button class="btn-confirm" @click="saveGroupChatSettings">
              儲存
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 長按刪除彈窗 -->
    <Transition name="fade">
      <div
        v-if="longPressChat"
        class="longpress-overlay"
        @click="closeLongPressMenu"
      >
        <div
          class="longpress-menu"
          :style="{
            top: `${longPressPosition.y}px`,
            left: `${longPressPosition.x}px`,
          }"
          @click.stop
        >
          <div class="longpress-chat-info">
            <span class="chat-name">{{ getCharacterName(longPressChat) }}</span>
          </div>
          <button class="longpress-btn pin" @click="togglePinChat">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                v-if="longPressChat.pinnedToList"
                d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"
              />
              <path
                v-else
                d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h8v-2H7v2zm0 4h8v-2H7v2zM7 7v2h8V7H7zm9 8v-3h-2v3h-3v2h3v3h2v-3h3v-2h-3z"
              />
            </svg>
            {{ longPressChat.pinnedToList ? "從聊天列表移除" : "加入聊天列表" }}
          </button>
          <button class="longpress-btn delete" @click="confirmDeleteChat">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            刪除對話
          </button>
          <button class="longpress-btn cancel" @click="closeLongPressMenu">
            取消
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" scoped>
.chat-list-screen {
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
}

/* --- 整合頂部導航區塊 --- */
.chat-list-topbar {
  background: var(--color-surface, #fff);
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar-header {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: max(12px, calc(var(--safe-top, 0px) + 8px)) 16px 8px;
  gap: 12px;
}

.header-back {
  background: none;
  border: none;
  padding: 8px;
  margin-left: -8px;
  cursor: pointer;
  color: var(--color-text, #333);
  border-radius: 50%;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  
  svg {
    width: 24px;
    height: 24px;
  }
  
  &:hover {
    background: var(--color-background, #f5f5f5);
  }
}

.header-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-text, #333);
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Pill Tabs */
.pill-tabs {
  display: flex;
  min-width: 0;
  padding: 0 16px 12px;
  gap: 8px;
}

.pill-tab {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  background: var(--color-background, #f5f5f5);
  border: none;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary, #666);
  cursor: pointer;
  transition: all 0.2s;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.active {
    background: var(--color-primary, #7dd3a8);
    color: #fff;
    box-shadow: 0 2px 8px rgba(125, 211, 168, 0.3);

    .pill-badge {
      background: rgba(255,255,255,0.2);
      color: #fff;
    }
  }
}

.pill-badge {
  flex-shrink: 0;
  background: var(--color-border, #e2e8f0);
  color: var(--color-text-secondary, #666);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 600;
}

/* 搜尋欄 & FAB */
.topbar-actions {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 16px 12px;
  gap: 12px;
}

.search-bar {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-background, #f9f9f9);
  border: 1px solid transparent;
  border-radius: 16px;
  transition: all 0.2s;

  &:focus-within {
    background: var(--color-surface, #fff);
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 0 0 3px rgba(125, 211, 168, 0.15);
  }

  .search-icon {
    width: 18px;
    height: 18px;
    color: var(--color-text-muted, #999);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    background: none;
    font-size: 14px;
    color: var(--color-text, #333);
    outline: none;

    &::placeholder {
      color: var(--color-text-muted, #999);
    }
  }
}

.create-group-fab {
  height: 40px;
  max-width: 44%;
  padding: 0 14px 0 12px;
  border-radius: 20px;
  background: var(--color-primary, #7dd3a8);
  color: white;
  border: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(125, 211, 168, 0.35);
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;

  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .fab-label {
    min-width: 0;
    line-height: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(125, 211, 168, 0.5);
  }
}

/* --- 內容區域 --- */
.content {
  flex: 1;
  overflow-y: auto;
  padding-bottom: var(--safe-bottom, 20px);
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;
  color: var(--color-text-muted, #999);

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--color-border, #e2e8f0);
    border-top-color: var(--color-primary, #7dd3a8);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;

  svg {
    width: 64px;
    height: 64px;
    color: var(--color-primary-light, #c7fcbb);
    margin-bottom: 16px;
  }

  p {
    color: var(--color-text-secondary, #666);
    font-size: 16px;
    margin: 0;
  }

  .hint {
    font-size: 14px;
    color: var(--color-text-muted, #999);
    margin-top: 8px;
  }

  .empty-actions {
    margin-top: 20px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }

  .btn-primary, .btn-ghost {
    padding: 12px 24px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-primary {
    background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
    color: white;
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(125, 211, 168, 0.4);
    }
  }

  .btn-ghost {
    background: var(--color-surface, #f0f0f0);
    color: var(--color-text, #333);
    &:hover {
      background: var(--color-border, #e2e8f0);
    }
  }
}

/* --- 對話列表 --- */
.chat-list {
  padding: 12px 16px;
}

.section-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-muted, #999);
  margin: 16px 0 8px 4px;
  letter-spacing: 0.5px;
  
  &:first-child {
    margin-top: 4px;
  }
}

.chat-item {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 12px;
  padding: 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, rgba(0,0,0,0.04));
  border-radius: 14px;
  margin-bottom: 6px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  &:hover {
    transform: translateY(-1px);
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  &.pinned {
    background: linear-gradient(to right, rgba(125, 211, 168, 0.05), var(--color-surface, #fff) 40%);
    &::before {
      content: '';
      position: absolute;
      left: -1px;
      top: 12px;
      bottom: 12px;
      width: 3px;
      background: var(--color-primary, #7dd3a8);
      border-radius: 0 2px 2px 0;
    }
  }
}

/* 三欄結構：avatar | info | meta */
.chat-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  position: relative;
  flex-shrink: 0;

  img, .group-avatar-placeholder, .avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #a8e6cf, #7dd3a8);
  color: white;
  font-size: 20px;
  font-weight: 600;

  &.large { font-size: 28px; }
}

.group-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light, #e8f5e9);
  
  svg {
    width: 55%;
    height: 55%;
    color: var(--color-primary, #7dd3a8);
  }
}

/* 頭像右下角狀態點 */
.avatar-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--color-surface, #fff);

  &.unread { background: #e53e3e; }
  &.multi { background: #89cff0; }
  &.group { background: var(--color-primary, #7dd3a8); }
}

.chat-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.chat-header {
  display: flex;
  align-items: center;
  min-width: 0;
}

.chat-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text, #333);
  display: flex;
  align-items: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.inline-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  height: 16px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  margin-right: 6px;
  flex-shrink: 0;

  &.group {
    background: var(--color-primary-light, #e8f5e9);
    color: var(--color-primary, #7dd3a8);
  }
  &.multi {
    background: #e1f5fe;
    color: #0288d1;
  }
}

.preview-line {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary, #666);
}

.preview-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted, #999);
  flex-shrink: 0;
}

.chat-preview-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-file-label {
  font-size: 11px;
  color: var(--color-primary, #7dd3a8);
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右側 Meta Column */
.meta-column {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  min-width: 40px;
  height: 42px;
  flex-shrink: 0;
}

.chat-time {
  font-size: 11px;
  color: var(--color-text-muted, #999);
  font-weight: 500;
}

.unread-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #e53e3e;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.pin-icon {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted, #ccc);
  margin-right: 2px;
}

/* --- 聯繫人網格 --- */
.contacts-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: 1fr;
  gap: 12px;
  padding: 0 16px;
  align-items: stretch;
}

.contact-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
  padding: 16px 8px 12px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, rgba(0,0,0,0.04));
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  height: 100%;
  box-sizing: border-box;

  &:hover {
    transform: translateY(-2px);
    border-color: var(--color-primary, #7dd3a8);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }
}

.contact-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  overflow: hidden;
  margin-bottom: 10px;
  flex-shrink: 0;
  border: 1px solid var(--color-border, rgba(0,0,0,0.08));

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.contact-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #333);
  text-align: center;
  width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  line-height: 1.3;
}

.contact-hint {
  font-size: 11px;
  color: var(--color-text-muted, #999);
  margin-top: 6px;
  letter-spacing: 0.5px;
}

// ===== 彈窗樣式 =====

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 24px;
  width: 100%;
  max-width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--color-text, #333);
}

.form-group {
  margin-bottom: 16px;

  label {
    display: block;
    font-size: 13px;
    color: var(--color-text-secondary, #666);
    margin-bottom: 8px;
  }
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border, #ddd);
  border-radius: 10px;
  font-size: 14px;
  background: var(--color-background, #f9f9f9);
  color: var(--color-text, #333);
  outline: none;

  &:focus {
    border-color: var(--color-primary, #7dd3a8);
  }
}

.character-select-list {
  max-height: 300px;
  overflow-y: auto;
}

.character-select-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-primary-light, #f0f0f0);
  }

  &.selected {
    background: var(--color-primary-light, #e8f5e9);
  }

  &.compact {
    padding: 8px;
  }
}

.select-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
}

.select-name {
  flex: 1;
  font-size: 14px;
}

.select-check {
  width: 20px;
  height: 20px;
  color: var(--color-primary, #7dd3a8);

  svg {
    width: 100%;
    height: 100%;
  }
}

.add-icon {
  width: 20px;
  height: 20px;
  color: var(--color-primary, #7dd3a8);
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
}

.btn-cancel {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: var(--color-background, #f0f0f0);
  color: var(--color-text, #333);
  font-size: 14px;
  cursor: pointer;
}

.btn-confirm {
  padding: 10px 20px;
  border: none;
  border-radius: 10px;
  background: var(--color-primary, #7dd3a8);
  color: white;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

// 成員管理
.member-list {
  max-height: 250px;
  overflow-y: auto;
}

.member-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;

  &:hover {
    background: var(--color-primary-light, #f0f0f0);
  }
}

.member-avatar {
  width: 32px;
  height: 32px;
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }
}

.member-name {
  flex: 1;
  font-size: 14px;
}

.member-badges {
  display: flex;
  gap: 4px;
}

.badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;

  &.admin {
    background: var(--color-primary-light, #e8f5e9);
    color: var(--color-primary, #7dd3a8);
  }

  &.muted {
    background: #fff3e0;
    color: #e65100;
  }
}

.member-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: none;
  cursor: pointer;
  color: var(--color-text-secondary, #666);

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--color-primary-light, #f0f0f0);
  }

  &.danger:hover {
    background: #ffebee;
    color: #e53e3e;
  }
}

.add-member-list {
  max-height: 150px;
  overflow-y: auto;
}

.avatar-placeholder.small {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-background, #f0f0f0);
  border-radius: 50%;
  font-size: 14px;
  color: var(--color-text-secondary, #666);
}

// Transition
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

// 群頭像編輯
.group-avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.group-avatar-editor {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.group-avatar-preview {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 2px solid var(--color-border, #ddd);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .group-avatar-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-primary-light, #e8f5e9);

    svg {
      width: 50%;
      height: 50%;
      color: var(--color-primary, #7dd3a8);
    }
  }

  .avatar-edit-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;

    svg {
      width: 24px;
      height: 24px;
      color: #fff;
    }
  }

  &:hover .avatar-edit-overlay {
    opacity: 1;
  }
}

.btn-remove-avatar {
  background: none;
  border: none;
  color: var(--color-error, #e53e3e);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;

  &:hover {
    background: rgba(229, 62, 62, 0.1);
  }
}

// ===== 長按刪除彈窗 =====
.longpress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 1000;
}

.longpress-menu {
  position: fixed;
  transform: translate(-50%, -50%);
  background: var(--color-surface, #fff);
  border-radius: 16px;
  padding: 12px;
  min-width: 180px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  z-index: 1001;
}

.longpress-chat-info {
  padding: 8px 12px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--color-border, #eee);

  .chat-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text, #333);
  }
}

.longpress-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px;
  border: none;
  border-radius: 10px;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.2s;

  svg {
    width: 18px;
    height: 18px;
  }

  &.delete {
    color: #e53e3e;

    &:hover {
      background: rgba(229, 62, 62, 0.1);
    }
  }

  &.pin {
    color: var(--color-primary, #7dd3a8);

    &:hover {
      background: rgba(125, 211, 168, 0.1);
    }
  }

  &.cancel {
    color: var(--color-text-secondary, #666);

    &:hover {
      background: var(--color-background, #f5f5f5);
    }
  }
}

.empty-hint {
  font-size: 13px;
  color: var(--color-text-secondary, #999);
  padding: 12px;
  text-align: center;
}

.lorebook-bind-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.lorebook-bind-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--color-background, #f5f5f5);
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
  }

  &.active {
    background: var(--color-primary-light, rgba(125, 211, 168, 0.15));
    border: 1px solid var(--color-primary, #7dd3a8);
  }

  .lorebook-check {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border, #ddd);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    svg {
      width: 16px;
      height: 16px;
      color: var(--color-primary, #7dd3a8);
    }
  }

  &.active .lorebook-check {
    border-color: var(--color-primary, #7dd3a8);
    background: var(--color-primary, #7dd3a8);

    svg {
      color: #fff;
    }
  }

  .lorebook-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;

    .lorebook-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--color-text, #333);
    }

    .lorebook-count {
      font-size: 12px;
      color: var(--color-text-secondary, #999);
    }
  }
}
</style>
