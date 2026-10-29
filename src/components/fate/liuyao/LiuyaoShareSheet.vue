<script setup lang="ts">
/**
 * 六爻「傳給…」面板：選一個聊天＋一句話，把卦象卡片傳過去
 * 不用 Teleport，吃外層 .fate-theme 的 --f-* 變數
 */
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore } from "@/stores/characters";
import type { Chat } from "@/types/chat";
import { pickChatListEntries } from "@/utils/chatListEntries";
import { computed, ref, watch } from "vue";

const MAX_TEXT = 200;

const props = withDefaults(
  defineProps<{
    open: boolean;
    preferCharacterId?: string | null;
  }>(),
  { preferCharacterId: null },
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
  // 群聊用群頭像，不借成員頭像
  if (chat.isGroupChat) return chat.groupMetadata?.groupAvatar || "";
  const char = charactersStore.characters.find((c) => c.id === chat.characterId);
  return char?.avatar || "";
}

function initial(chat: Chat): string {
  return chatName(chat).charAt(0);
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
    const list = pickChatListEntries(
      all.filter((c) => !c.archivedAt && (c.messages?.length > 0 || c.lastMessagePreview)),
    );
    const prefer = props.preferCharacterId;
    if (prefer) {
      const first = list.filter((c) => !c.isGroupChat && c.characterId === prefer);
      const rest = list.filter((c) => c.isGroupChat || c.characterId !== prefer);
      chats.value = [...first, ...rest];
      if (first.length > 0) selectedId.value = first[0].id;
    } else {
      chats.value = list;
    }
  } catch (e) {
    console.error("[LiuyaoShareSheet] 載入聊天列表失敗:", e);
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
  <div v-if="props.open" class="ly-share">
    <div class="ly-share__scrim" @click="emit('close')"></div>

    <section class="ly-share__sheet" role="dialog" aria-modal="true" aria-label="傳給…">
      <div class="ly-share__head">
        <span class="ly-share__title">傳給…</span>
        <button type="button" class="ly-share__close" aria-label="關閉" @click="emit('close')">
          ✕
        </button>
      </div>

      <input
        v-model="text"
        class="ly-share__input"
        type="text"
        :maxlength="MAX_TEXT"
        placeholder="想說的話（可不填）"
        aria-label="想說的話"
      />

      <div class="ly-share__list">
        <p v-if="loading" class="ly-share__hint">載入中…</p>
        <p v-else-if="!chats.length" class="ly-share__hint">還沒有聊天</p>
        <template v-else>
          <button
            v-for="chat in chats"
            :key="chat.id"
            type="button"
            class="ly-chat"
            :class="{ 'is-on': selectedId === chat.id }"
            :aria-pressed="selectedId === chat.id"
            @click="toggle(chat)"
          >
            <img v-if="chatAvatar(chat)" class="ly-chat__avatar" :src="chatAvatar(chat)" :alt="chatName(chat)" />
            <span v-else class="ly-chat__avatar ly-chat__avatar--fallback">{{ initial(chat) }}</span>
            <span class="ly-chat__name">{{ chatName(chat) }}</span>
            <span class="ly-chat__check" :class="{ 'is-on': selectedId === chat.id }">
              <span v-if="selectedId === chat.id">✓</span>
            </span>
          </button>
        </template>
      </div>

      <div class="ly-share__actions">
        <button type="button" class="fate-btn fate-btn--primary" :disabled="!canSend" @click="confirm">
          傳送
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.ly-share {
  position: fixed;
  inset: 0;
  z-index: 60;
}

.ly-share__scrim {
  position: absolute;
  inset: 0;
  background: var(--f-scrim);
  animation: ly-share-fade 0.2s ease-out;
}

.ly-share__sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 75vh;
  padding: 14px 16px 0;
  box-sizing: border-box;
  background: var(--f-panel-solid);
  border-top: 1px solid var(--f-line);
  border-radius: var(--f-radius) var(--f-radius) 0 0;
  font-family: var(--f-font-body);
  color: var(--f-ink);
  animation: ly-share-up 0.24s cubic-bezier(0.32, 0.72, 0, 1);
}

.ly-share__head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 2px;
}

.ly-share__title {
  flex: 1;
  min-width: 0;
  font-family: var(--f-font-head);
  font-size: 15px;
  letter-spacing: 0.1em;
  color: var(--f-ink);
}

.ly-share__close {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  color: var(--f-ink-2);
  background: none;
  border: none;
  cursor: pointer;
}

.ly-share__input {
  flex-shrink: 0;
  width: 100%;
  box-sizing: border-box;
  height: 40px;
  padding: 0 12px;
  font-family: var(--f-font-body);
  font-size: 14px;
  color: var(--f-ink);
  background: var(--f-panel);
  border: 1px solid var(--f-line);
  border-radius: var(--f-radius);
  outline: none;

  &::placeholder {
    color: var(--f-ink-2);
    opacity: 0.8;
  }

  &:focus {
    border-color: var(--f-line-strong);
  }
}

.ly-share__list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 2px;
}

.ly-share__hint {
  margin: 0;
  padding: 20px 0;
  text-align: center;
  font-size: 12px;
  color: var(--f-ink-2);
}

.ly-chat {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 52px;
  padding: 6px 8px;
  box-sizing: border-box;
  font-family: var(--f-font-body);
  text-align: left;
  color: var(--f-ink);
  background: none;
  border: 1px solid transparent;
  border-radius: var(--f-radius);
  cursor: pointer;

  &.is-on {
    border-color: var(--f-accent);
    background: var(--f-accent-soft);
  }
}

.ly-chat__avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  display: block;

  &--fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--f-font-head);
    font-size: 14px;
    color: var(--f-accent);
    background: var(--f-accent-soft);
    border: 1px solid var(--f-line);
  }
}

.ly-chat__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  letter-spacing: 0.02em;
}

.ly-chat__check {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 12px;
  line-height: 1;
  color: transparent;
  border: 1px solid var(--f-line);
  border-radius: 50%;

  &.is-on {
    color: var(--f-accent-ink);
    background: var(--f-accent);
    border-color: var(--f-accent);
  }
}

.ly-share__actions {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 4px 0 calc(16px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom)));
}

@keyframes ly-share-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes ly-share-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
</style>
