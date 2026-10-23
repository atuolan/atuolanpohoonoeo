<script setup lang="ts">
/** 傳給…面板：預覽＋一句話＋選一個聊天 */
import { computed, ref, watch } from "vue";
import { Check, Send, X } from "lucide-vue-next";
import PlurkAvatar from "@/components/plurk/PlurkAvatar.vue";
import QualifierChip from "@/components/plurk/QualifierChip.vue";
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore } from "@/stores";
import type { Chat } from "@/types/chat";
import { pickChatListEntries } from "@/utils/chatListEntries";

const MAX_TEXT = 200;

const props = withDefaults(
  defineProps<{
    open: boolean;
    preview: {
      authorName: string;
      authorAvatar?: string;
      qualifier?: string;
      text: string;
      commentLine?: string;
    } | null;
  }>(),
  { preview: null },
);

const emit = defineEmits<{
  (e: "close"): void;
  (e: "confirm", payload: { chatId: string; characterId: string; text: string }): void;
}>();

const charactersStore = useCharactersStore();

const text = ref("");
const chats = ref<Chat[]>([]);
const loading = ref(false);
const selectedId = ref<string | null>(null);

function chatName(chat: Chat): string {
  if (chat.isGroupChat && chat.groupMetadata) return chat.groupMetadata.groupName;
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.nickname || char?.data?.name || chat.name || "未知角色";
}

function chatAvatar(chat: Chat): string {
  // 群聊用群頭像，沒有就顯示群名第一個字，不借成員的頭像
  if (chat.isGroupChat) return chat.groupMetadata?.groupAvatar || "";
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.avatar || "";
}

const selectedChat = computed(() => chats.value.find((c) => c.id === selectedId.value) ?? null);
const canSend = computed(() => !!selectedChat.value);

function toggle(chat: Chat) {
  selectedId.value = selectedId.value === chat.id ? null : chat.id;
}

async function loadChats() {
  loading.value = true;
  try {
    await db.init();
    const all = await db.getAll<Chat>(DB_STORES.CHATS);
    // 跟聊天列表一樣每個角色只留最新的一段聊天，不然開過幾段新對話就會重複出現
    chats.value = pickChatListEntries(
      all.filter((c) => c.messages?.length > 0 || c.lastMessagePreview),
    );
  } catch (e) {
    console.error("[ShareToChat] 載入聊天列表失敗:", e);
    chats.value = [];
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    text.value = "";
    selectedId.value = null;
    void loadChats();
  },
);

function confirm() {
  const chat = selectedChat.value;
  if (!chat) return;
  emit("confirm", {
    chatId: chat.id,
    characterId: chat.characterId,
    text: text.value.trim(),
  });
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <Transition name="plurk-dim-fade">
      <div v-if="props.open" class="plurk-dim" @click="emit('close')"></div>
    </Transition>
    <Transition name="plurk-sheet-slide">
      <section v-if="props.open" class="share-sheet" role="dialog" aria-modal="true" aria-label="傳給…">
        <span class="sheet-handle" aria-hidden="true"></span>

        <div class="sheet-head">
          <span class="sheet-title">
            <Send :size="17" class="sheet-title-icon" />
            傳給…
          </span>
          <button type="button" class="head-close" aria-label="關閉" @click="emit('close')">
            <X :size="18" />
          </button>
        </div>

        <div v-if="props.preview" class="preview">
          <p v-if="props.preview.commentLine" class="preview-comment-line">
            {{ props.preview.commentLine }}
          </p>
          <div class="preview-head">
            <PlurkAvatar
              :src="props.preview.authorAvatar"
              :name="props.preview.authorName"
              :size="34"
            />
            <span class="preview-name">{{ props.preview.authorName }}</span>
            <QualifierChip :qualifier="props.preview.qualifier" size="sm" />
          </div>
          <p class="preview-text">{{ props.preview.text }}</p>
        </div>

        <input
          v-model="text"
          class="compose-input"
          type="text"
          :maxlength="MAX_TEXT"
          placeholder="加一句話（選填）"
          aria-label="傳給聊天的一句話"
        />

        <div class="chat-list">
          <p v-if="loading" class="list-hint">載入中…</p>
          <p v-else-if="!chats.length" class="list-hint">還沒有聊天</p>
          <template v-else>
            <button
              v-for="chat in chats"
              :key="chat.id"
              type="button"
              class="chat-row"
              :class="{ 'chat-row--on': selectedId === chat.id }"
              :aria-pressed="selectedId === chat.id"
              @click="toggle(chat)"
            >
              <PlurkAvatar
                v-if="chatAvatar(chat)"
                :src="chatAvatar(chat)"
                :name="chatName(chat)"
                :size="40"
              />
              <span v-else class="chat-avatar-fallback">{{ chatName(chat).charAt(0) }}</span>
              <span class="chat-name">{{ chatName(chat) }}</span>
              <span class="chat-check" :class="{ 'chat-check--on': selectedId === chat.id }">
                <Check v-if="selectedId === chat.id" :size="14" aria-hidden="true" />
              </span>
            </button>
          </template>
        </div>

        <div class="sheet-actions">
          <button type="button" class="btn btn--primary" :disabled="!canSend" @click="confirm">
            傳送
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
@use "@/components/plurk/plurk-theme.scss" as *;

.plurk-dim {
  @include plurk-dim;
}

.share-sheet {
  @include plurk-sheet;

  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 80vh;
  overflow: hidden;
}

.sheet-handle {
  align-self: center;
  width: 36px;
  height: 5px;
  border-radius: 3px;
  background: var(--color-border);
  flex-shrink: 0;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding-top: 4px;
  flex-shrink: 0;
}

.sheet-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
}

.sheet-title-icon {
  color: var(--color-primary);
}

.head-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $plurk-touch;
  height: $plurk-touch;
  margin-right: -10px;
  padding: 0;
  border: none;
  border-radius: 22px;
  background: none;
  color: var(--color-text-secondary);
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.preview {
  flex-shrink: 0;
  padding: 12px 14px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-background);
}

.preview-comment-line {
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.preview-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-text);
}

.preview-text {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.compose-input {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  height: $plurk-touch;
  padding: 0 14px;
  border: 1px solid var(--color-border);
  border-radius: $plurk-radius-soft;
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: inherit;
  font-size: 15px;
  outline: none;

  &::placeholder {
    color: var(--color-text-muted);
  }

  &:focus {
    border-color: var(--color-primary);
  }
}

.chat-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.list-hint {
  margin: 0;
  padding: 18px 0;
  text-align: center;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.chat-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 56px;
  padding: 6px 4px;
  border: none;
  border-radius: $plurk-radius-soft;
  background: none;
  color: inherit;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  &:active {
    background: var(--color-surface-hover);
  }
}

.chat-avatar-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--color-surface-hover);
  color: var(--color-text-secondary);
  font-size: 16px;
  font-weight: 700;
}

.chat-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.chat-check {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  color: var(--color-on-primary-contrast);
}

.chat-check--on {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.sheet-actions {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 2px 0
    calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
}

.btn {
  flex: 1;
  min-height: $plurk-touch;
  padding: 0 16px;
  border: none;
  border-radius: 999px;
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:active {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}

.btn--primary {
  background: var(--color-primary);
  color: var(--color-on-primary-contrast);
}

.plurk-dim-fade-enter-active,
.plurk-dim-fade-leave-active {
  transition: opacity 0.2s ease;
}

.plurk-dim-fade-enter-from,
.plurk-dim-fade-leave-to {
  opacity: 0;
}

.plurk-sheet-slide-enter-active,
.plurk-sheet-slide-leave-active {
  transition: transform 0.26s cubic-bezier(0.32, 0.72, 0, 1);
}

.plurk-sheet-slide-enter-from,
.plurk-sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
