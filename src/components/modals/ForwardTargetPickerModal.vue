<script setup lang="ts">
import { loadAllChats } from "@/storage/chatStorage";
import { useCharactersStore } from "@/stores";
import type { Chat } from "@/types/chat";
import { Check, Search, UsersRound, X } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";

const props = defineProps<{
  currentChatId: string | null;
  mode: "single" | "merge";
  messageCount: number;
  /** 合併轉發卡片標題 */
  recordTitle: string;
  isForwarding: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", targetChatIds: string[], note: string): void;
}>();

const charactersStore = useCharactersStore();

const chatList = ref<Chat[]>([]);
const isLoading = ref(true);
const searchQuery = ref("");
const selectedIds = ref<string[]>([]);
const note = ref("");

onMounted(async () => {
  try {
    if (charactersStore.characters.length === 0) {
      await charactersStore.loadCharacters();
    }
    const sorted = (await loadAllChats()).sort(
      (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    );
    // 與聊天列表相同：每個角色（或群聊）只留最新的一個入口，釘選的聊天不去重
    const seen = new Set<string>();
    const list = sorted.filter((c) => {
      if (c.id === props.currentChatId) return false;
      if (c.pinnedToList) return true;
      const key = c.isGroupChat ? `group_${c.id}` : c.characterId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    // 目前的聊天固定放最上面
    const current = sorted.find((c) => c.id === props.currentChatId);
    chatList.value = current ? [current, ...list] : list;
  } catch (e) {
    console.error("[ForwardTargetPicker] 載入聊天列表失敗:", e);
  } finally {
    isLoading.value = false;
  }
});

function getChatName(chat: Chat): string {
  if (chat.isGroupChat && chat.groupMetadata) return chat.groupMetadata.groupName;
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.nickname || char?.data?.name || chat.name || "未知角色";
}

function getChatAvatar(chat: Chat): string {
  if (chat.isGroupChat && !chat.groupMetadata?.isMultiCharCard) {
    return chat.groupMetadata?.groupAvatar || "";
  }
  if (chat.charAvatarOverride) return chat.charAvatarOverride;
  return charactersStore.characters.find((c) => c.id === chat.characterId)?.avatar || "";
}

const filteredChats = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return chatList.value;
  return chatList.value.filter((c) => getChatName(c).toLowerCase().includes(q));
});

function toggleTarget(chatId: string) {
  const idx = selectedIds.value.indexOf(chatId);
  if (idx > -1) selectedIds.value.splice(idx, 1);
  else selectedIds.value.push(chatId);
}

const summaryText = computed(() =>
  props.mode === "merge"
    ? `[合併轉發] ${props.recordTitle}的聊天記錄`
    : `[逐條轉發] 共 ${props.messageCount} 條訊息`,
);

function confirm() {
  if (selectedIds.value.length === 0 || props.isForwarding) return;
  emit("confirm", [...selectedIds.value], note.value);
}
</script>

<template>
  <Teleport to="body">
    <div class="forward-picker-overlay" @click.self="emit('close')">
      <div class="forward-picker">
        <div class="picker-header">
          <span class="picker-title">轉發給</span>
          <button class="close-btn" aria-label="關閉" @click="emit('close')">
            <X :size="18" :stroke-width="1.8" />
          </button>
        </div>

        <div class="picker-search">
          <Search :size="15" :stroke-width="1.8" class="search-icon" />
          <input v-model="searchQuery" type="text" placeholder="搜尋聊天" />
        </div>

        <div class="target-list">
          <div v-if="isLoading" class="empty-state">載入中…</div>
          <div v-else-if="filteredChats.length === 0" class="empty-state">
            {{ searchQuery ? "找不到聊天" : "還沒有任何聊天" }}
          </div>
          <template v-else>
            <button
              v-for="chat in filteredChats"
              :key="chat.id"
              class="target-item"
              :class="{ selected: selectedIds.includes(chat.id) }"
              @click="toggleTarget(chat.id)"
            >
              <span class="target-check">
                <Check v-if="selectedIds.includes(chat.id)" :size="13" :stroke-width="3" />
              </span>
              <span class="target-avatar">
                <img v-if="getChatAvatar(chat)" :src="getChatAvatar(chat)" :alt="getChatName(chat)" />
                <UsersRound v-else-if="chat.isGroupChat" :size="18" :stroke-width="1.8" />
                <span v-else>{{ getChatName(chat).charAt(0) }}</span>
              </span>
              <span class="target-name">{{ getChatName(chat) }}</span>
              <span v-if="chat.id === currentChatId" class="target-tag">目前聊天</span>
            </button>
          </template>
        </div>

        <div class="picker-footer">
          <div class="forward-summary">{{ summaryText }}</div>
          <input
            v-model="note"
            class="note-input"
            type="text"
            placeholder="附上一句話（選填）"
            @keydown.enter="confirm"
          />
          <button
            class="send-btn"
            :disabled="selectedIds.length === 0 || isForwarding"
            @click="confirm"
          >
            {{ isForwarding ? "轉發中…" : selectedIds.length > 1 ? `發送（${selectedIds.length}）` : "發送" }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
.forward-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(16px + var(--safe-top, 0px)) 16px 16px;
}

.forward-picker {
  width: min(360px, 100%);
  max-height: min(78dvh, 620px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-surface);
  color: var(--color-text);
  border: 1px solid var(--color-border);
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.picker-header {
  display: flex;
  align-items: center;
  padding: 14px 12px 10px 16px;

  .picker-title {
    flex: 1;
    font-size: 16px;
    font-weight: 600;
  }

  .close-btn {
    display: flex;
    padding: 6px;
    border-radius: 8px;
    color: var(--color-text-secondary);

    &:hover {
      background: var(--color-background);
    }
  }
}

.picker-search {
  position: relative;
  margin: 0 12px 8px;

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-secondary);
  }

  input {
    width: 100%;
    padding: 8px 12px 8px 32px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;

    &:focus {
      border-color: var(--color-primary);
    }
  }
}

.target-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.empty-state {
  padding: 32px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.target-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px;
  border-radius: 10px;
  text-align: left;
  transition: background 0.15s;

  &:hover {
    background: var(--color-background);
  }

  &.selected .target-check {
    background: var(--color-primary);
    border-color: var(--color-primary);
    color: #fff;
  }
}

.target-check {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  transition: all 0.15s;
}

.target-avatar {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 600;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.target-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-tag {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--color-background);
  color: var(--color-text-secondary);
}

.picker-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--color-border);

  .forward-summary {
    font-size: 12px;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .note-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    color: var(--color-text);
    font-size: 14px;
    outline: none;

    &:focus {
      border-color: var(--color-primary);
    }
  }

  .send-btn {
    padding: 10px;
    border-radius: 10px;
    background: var(--color-primary);
    color: #fff;
    font-size: 14px;
    font-weight: 600;

    &:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }
  }
}
</style>
