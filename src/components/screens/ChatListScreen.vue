<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { deleteChatCascade } from "@/storage/chatStorage";
import { useCharactersStore, useLorebooksStore } from "@/stores";
import type { Chat } from "@/types/chat";
import { createDefaultGroupChat } from "@/types/chat";
import { computed, onMounted, ref } from "vue";
import { setLocalChatUnreadCount } from "@/storage/chatStorage";
import {
  ChevronLeft,
  Globe,
  Image as ImageIcon,
  Lock,
  Pin,
  Search,
  Smile,
  UsersRound,
} from "lucide-vue-next";

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

// 列表分段：有置頂時才顯示分段標題
const chatSections = computed(() => {
  const hasPinned = pinnedChats.value.length > 0;
  return [
    { key: "pinned", label: "置頂", chats: pinnedChats.value },
    { key: "recent", label: hasPinned ? "所有對話" : "", chats: recentChats.value },
  ].filter((s) => s.chats.length > 0);
});

// 預留：角色此刻在做什麼（例如「在烤餅乾」），目前沒有資料來源，回傳空字串時不顯示
function getCharacterStatus(_chat: Chat): string {
  return "";
}

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
  // 預覽顯示兩行，由 CSS 截斷，這裡只限制長度避免塞太多文字
  return text.length > 120 ? text.substring(0, 120) : text;
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
// 今天 → 16:05、昨天 → 昨天、一週內 → 週五、今年 → 3/12、更早 → 2025/3/12
function formatTime(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  if (now.getTime() - timestamp < 60 * 1000) return "剛剛";

  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86400000);

  if (dayDiff <= 0) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  if (dayDiff === 1) return "昨天";
  if (dayDiff < 7) return `週${"日一二三四五六"[date.getDay()]}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
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
  const target = chatList.value.find((c) => c.id === chatId);
  if (target?.lockedFromDelete) {
    alert("此對話已鎖定，請先解除鎖定才能刪除。");
    return;
  }
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
  if (longPressChat.value.lockedFromDelete) {
    alert("此對話已鎖定，請先解除鎖定才能刪除。");
    return;
  }
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
    // 取消置頂時一併解除鎖定，避免出現「無法刪除但不在置頂」的孤兒狀態
    if (wasPinned) chat.lockedFromDelete = false;
    chat.updatedAt = Date.now();
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
    await loadChats();
  } catch (e) {
    console.error("切換釘選失敗:", e);
  }
}

async function toggleLockChat() {
  if (!longPressChat.value) return;
  const chatId = longPressChat.value.id;
  const wasLocked = longPressChat.value.lockedFromDelete;
  closeLongPressMenu();

  try {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
    if (!chat) return;
    chat.lockedFromDelete = !wasLocked;
    chat.updatedAt = Date.now();
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
    await loadChats();
  } catch (e) {
    console.error("切換鎖定失敗:", e);
  }
}
</script>

<template>
  <div class="screen-container chat-list-screen">
    <!-- 頂部：標題列 → 搜尋 → 小切換 -->
    <div class="chat-list-topbar">
      <header class="topbar-header">
        <button class="header-back" aria-label="返回主畫面" @click="emit('back')">
          <ChevronLeft :size="24" :stroke-width="1.8" />
        </button>
        <h1 class="header-title">訊息</h1>
        <button
          class="header-action"
          aria-label="建立群聊"
          title="建立群聊"
          @click="openGroupChatCreation"
        >
          <UsersRound :size="20" :stroke-width="1.8" />
        </button>
      </header>

      <label class="search-bar">
        <Search class="search-icon" :size="18" :stroke-width="1.8" />
        <input
          v-model="searchQuery"
          type="search"
          :placeholder="currentTab === 'chats' ? '搜尋對話' : '搜尋聯繫人'"
          :aria-label="currentTab === 'chats' ? '搜尋對話' : '搜尋聯繫人'"
        />
      </label>

      <nav class="seg-tabs" aria-label="切換對話與聯繫人">
        <button
          class="seg-tab"
          :class="{ active: currentTab === 'chats' }"
          :aria-pressed="currentTab === 'chats'"
          @click="currentTab = 'chats'"
        >
          對話
          <span v-if="chatList.length" class="seg-count">{{ chatList.length }}</span>
        </button>
        <button
          class="seg-tab"
          :class="{ active: currentTab === 'contacts' }"
          :aria-pressed="currentTab === 'contacts'"
          @click="currentTab = 'contacts'"
        >
          聯繫人
          <span v-if="charactersStore.characters.length" class="seg-count">{{ charactersStore.characters.length }}</span>
        </button>
      </nav>
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
          <section v-for="section in chatSections" :key="section.key" class="chat-section">
            <div v-if="section.label" class="section-label">{{ section.label }}</div>
            <div
              v-for="chat in section.chats"
              :key="chat.id"
              class="chat-item"
              :class="{ unread: !!chat.unreadCount }"
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
                  <UsersRound :size="22" :stroke-width="1.8" />
                </div>
                <div v-else class="avatar-placeholder">{{ getCharacterName(chat).charAt(0) }}</div>
              </div>
              <div class="chat-info">
                <div class="chat-header">
                  <span v-if="chat.isGroupChat && !chat.groupMetadata?.isMultiCharCard" class="inline-badge" title="群聊">群</span>
                  <span v-else-if="chat.groupMetadata?.isMultiCharCard" class="inline-badge" title="多角卡">多</span>
                  <span class="chat-name">{{ getCharacterName(chat) }}</span>
                  <!-- 預留：角色此刻在做什麼，沒有資料時整段不顯示 -->
                  <span v-if="getCharacterStatus(chat)" class="chat-status">· {{ getCharacterStatus(chat) }}</span>
                  <span class="chat-meta">
                    <Lock v-if="chat.lockedFromDelete" class="meta-icon" :size="12" :stroke-width="2" aria-label="已鎖定，無法刪除" />
                    <Pin v-else-if="chat.pinnedToList" class="meta-icon" :size="12" :stroke-width="2" aria-label="已置頂" />
                    <span class="chat-time">{{ formatTime(chat.updatedAt) }}</span>
                    <span
                      v-if="chat.unreadCount"
                      class="unread-dot"
                      role="img"
                      :aria-label="`${chat.unreadCount} 則未讀`"
                    ></span>
                  </span>
                </div>
                <p class="chat-preview">
                  <Globe v-if="previewIconKind(chat) === 'html'" class="preview-icon" :size="14" :stroke-width="1.8" />
                  <Smile v-else-if="previewIconKind(chat) === 'sticker'" class="preview-icon" :size="14" :stroke-width="1.8" />
                  <ImageIcon v-else-if="previewIconKind(chat) === 'image'" class="preview-icon" :size="14" :stroke-width="1.8" />
                  {{ formatPreview(chat) }}
                </p>
                <div v-if="chat.pinnedToList && chat.name" class="chat-file-label">{{ chat.name }}</div>
              </div>
            </div>
          </section>
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
            {{ longPressChat.pinnedToList ? "取消聊天置頂" : "聊天置頂" }}
          </button>
          <button
            v-if="longPressChat.pinnedToList"
            class="longpress-btn lock"
            @click="toggleLockChat"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                v-if="longPressChat.lockedFromDelete"
                d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h1.9c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"
              />
              <path
                v-else
                d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9.9c-1.71 0-3.1-1.39-3.1-3.1 0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1 0 1.71-1.39 3.1-3.1 3.1zM8.9 8V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2H8.9z"
              />
            </svg>
            {{ longPressChat.lockedFromDelete ? "解除鎖定" : "鎖定（防止刪除）" }}
          </button>
          <button
            class="longpress-btn delete"
            :class="{ disabled: longPressChat.lockedFromDelete }"
            @click="confirmDeleteChat"
          >
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
              />
            </svg>
            {{ longPressChat.lockedFromDelete ? "已鎖定（無法刪除）" : "刪除對話" }}
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

/* --- 頂部：標題列 → 搜尋 → 小切換 --- */
.chat-list-topbar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: max(12px, calc(var(--safe-top, 0px) + 8px)) 20px 8px;
}

.topbar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.header-back,
.header-action {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 50%;
  cursor: pointer;
  color: var(--color-text, #333);
  transition: background 0.2s;
}

.header-back {
  margin-left: -10px;
  background: none;
  border: none;

  &:hover {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.05));
  }
}

.header-action {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));

  &:hover {
    background: var(--color-surface-hover, #f5f5f5);
  }
}

.header-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 26px;
  line-height: 34px;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--color-text, #333);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 搜尋欄 */
.search-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  height: 44px;
  box-sizing: border-box;
  padding: 0 16px;
  border-radius: 22px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
  color: var(--color-text-muted, #999);
  cursor: text;
  transition: border-color 0.2s;

  &:focus-within {
    border-color: var(--color-primary, #7dd3a8);
  }

  .search-icon {
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: none;
    background: none;
    font-size: 14px;
    color: var(--color-text, #333);
    outline: none;
    -webkit-appearance: none;
    appearance: none;

    &::placeholder {
      color: var(--color-text-muted, #999);
    }
  }
}

/* 對話／聯繫人小切換 */
.seg-tabs {
  align-self: flex-start;
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.08));
}

.seg-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary, #666);
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.2s, color 0.2s;

  &.active {
    background: var(--color-primary, #7dd3a8);
    color: #fff;
  }
}

.seg-count {
  font-size: 11px;
  opacity: 0.75;
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

/* --- 對話列表：無分隔線，靠留白分組 --- */
.chat-list {
  padding: 4px 12px 16px;
}

.chat-section + .chat-section {
  margin-top: 12px;
}

.section-label {
  padding: 8px 8px 6px;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--color-text-muted, #999);
}

.chat-item {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  min-width: 0;
  padding: 10px 8px;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.2s;
  -webkit-tap-highlight-color: transparent;

  &:hover,
  &:active {
    background: var(--color-surface-hover, rgba(0, 0, 0, 0.04));
  }
}

.chat-avatar {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
  overflow: hidden;

  img, .group-avatar-placeholder, .avatar-placeholder {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  img {
    display: block;
    color: transparent;
    text-indent: -9999px;
  }

  .avatar-placeholder {
    font-size: 17px;
  }
}

.avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light, #e8f5e9);
  color: var(--color-text, #333);
  font-size: 20px;
  font-weight: 500;

  &.large { font-size: 28px; }
}

.group-avatar-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light, #e8f5e9);
  color: var(--color-text-secondary, #666);
}

.chat-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
}

/* 名字 · 狀態 …… 時間 ● */
.chat-header {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  min-height: 22px;
}

.inline-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.12));
  font-size: 10px;
  color: var(--color-text-muted, #999);
}

.chat-name {
  min-width: 0;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text, #333);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-status {
  flex-shrink: 2;
  min-width: 0;
  font-size: 12px;
  color: var(--color-text-muted, #999);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-meta {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 6px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.meta-icon {
  color: var(--color-text-muted, #999);
}

.chat-time {
  font-size: 12px;
  color: var(--color-text-muted, #999);
  font-variant-numeric: tabular-nums;
}

.unread-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary, #7dd3a8);
}

.chat-preview {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary, #666);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.preview-icon {
  display: inline-block;
  vertical-align: -2px;
  margin-right: 4px;
  color: var(--color-text-muted, #999);
}

/* 未讀：名字加粗、預覽轉為主文字色 */
.chat-item.unread {
  .chat-name { font-weight: 700; }
  .chat-preview { color: var(--color-text, #333); }
}

.chat-file-label {
  font-size: 11px;
  color: var(--color-primary, #7dd3a8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

    &.disabled {
      color: var(--color-text-secondary, #999);
      cursor: not-allowed;
      opacity: 0.6;

      &:hover {
        background: transparent;
      }
    }
  }

  &.pin {
    color: var(--color-primary, #7dd3a8);

    &:hover {
      background: rgba(125, 211, 168, 0.1);
    }
  }

  &.lock {
    color: #d69e2e;

    &:hover {
      background: rgba(214, 158, 46, 0.1);
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
