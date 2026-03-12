<script setup lang="ts">
import { db, DB_STORES } from "@/db/database";
import { useCharactersStore } from "@/stores";
import type { Chat } from "@/types/chat";
import { ArrowLeft, Eye, Loader2, MessageCircle, Smile } from "lucide-vue-next";
import { computed, ref } from "vue";

const emit = defineEmits<{
  back: [];
  select: [characterId: string, chatId: string];
}>();

const charactersStore = useCharactersStore();

const characters = computed(() => charactersStore.characters);

// 聊天選擇狀態
const selectedCharacterId = ref<string | null>(null);
const characterChats = ref<Chat[]>([]);
const isLoadingChats = ref(false);

const selectedCharacter = computed(() =>
  characters.value.find((c) => c.id === selectedCharacterId.value),
);

/** 選擇角色後，查詢該角色的所有聊天紀錄 */
async function onCharacterSelect(charId: string) {
  isLoadingChats.value = true;
  selectedCharacterId.value = charId;
  try {
    await db.init();
    const allChats = await db.getAll<Chat>(DB_STORES.CHATS);
    // 包含分支聊天，讓用戶可以選擇任何聊天記錄
    const chats = allChats
      .filter((c) => c.characterId === charId)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    if (chats.length === 0) {
      // 沒有聊天紀錄，顯示提示
      alert(
        `找不到與「${selectedCharacter.value?.nickname || selectedCharacter.value?.data?.name || "此角色"}」相關的聊天記錄。\n\n可能的原因：\n1. 還沒有與此角色的聊天\n2. 數據庫中的 characterId 不匹配\n\n請先與此角色開始聊天，或檢查數據完整性。`,
      );
      selectedCharacterId.value = null;
      characterChats.value = [];
      return;
    }

    if (chats.length === 1) {
      // 只有一個聊天，自動選擇
      emit("select", charId, chats[0].id);
      selectedCharacterId.value = null;
      characterChats.value = [];
      return;
    }

    // 多個聊天，顯示選擇介面
    characterChats.value = chats;
  } catch (err) {
    console.error("[PeekPhoneSelectScreen] Failed to load chats:", err);
    selectedCharacterId.value = null;
    characterChats.value = [];
  } finally {
    isLoadingChats.value = false;
  }
}

/** 選擇聊天紀錄 */
function onChatSelect(chatId: string) {
  if (!selectedCharacterId.value) return;
  emit("select", selectedCharacterId.value, chatId);
  selectedCharacterId.value = null;
  characterChats.value = [];
}

/** 返回角色選擇 */
function backToCharacterSelect() {
  selectedCharacterId.value = null;
  characterChats.value = [];
}

/** 格式化時間 */
function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
</script>

<template>
  <div class="peek-select-screen">
    <!-- 背景 Blob 裝飾 -->
    <div class="blob-bg-top" />
    <div class="blob-bg-bottom" />

    <div class="peek-select-header">
      <button
        class="icon-btn"
        @click="selectedCharacterId ? backToCharacterSelect() : emit('back')"
      >
        <ArrowLeft :size="24" stroke-width="3" />
      </button>
      <div class="peek-select-title">
        <Eye :size="20" stroke-width="3" />
        <span>偷窺 TA 的手機</span>
      </div>
      <div style="width: 44px" />
    </div>

    <!-- 載入中 -->
    <template v-if="isLoadingChats">
      <div class="peek-select-hint">正在載入聊天紀錄...</div>
      <div class="loading-state">
        <Loader2 :size="48" stroke-width="2" class="spin" />
      </div>
    </template>

    <!-- 聊天選擇介面 -->
    <template v-else-if="selectedCharacterId && characterChats.length > 1">
      <div class="peek-select-hint">選擇要使用的聊天紀錄</div>

      <div class="peek-select-list">
        <div
          v-for="chat in characterChats"
          :key="chat.id"
          class="peek-char-card"
          @click="onChatSelect(chat.id)"
        >
          <div class="peek-char-avatar chat-avatar">
            <MessageCircle :size="28" stroke-width="2.5" />
          </div>
          <div class="peek-char-info">
            <div class="peek-char-name">{{ chat.name }}</div>
            <div class="peek-char-desc">
              {{
                chat.lastMessagePreview ||
                `${chat.messageCount ?? chat.messages?.length ?? 0} 條訊息`
              }}
            </div>
            <div class="chat-meta">{{ formatDate(chat.updatedAt) }}</div>
          </div>
          <div class="peek-char-action">
            <Eye :size="20" stroke-width="3" />
          </div>
        </div>
      </div>
    </template>

    <!-- 角色選擇介面 -->
    <template v-else>
      <div class="peek-select-hint">選擇一個角色，偷看他的手機內容</div>

      <div class="peek-select-list">
        <div
          v-for="char in characters"
          :key="char.id"
          class="peek-char-card"
          @click="onCharacterSelect(char.id)"
        >
          <div class="peek-char-avatar">
            <img v-if="char.avatar" :src="char.avatar" alt="avatar" />
            <div v-else class="peek-char-avatar-placeholder">
              <Smile :size="32" stroke-width="2.5" />
            </div>
          </div>
          <div class="peek-char-info">
            <div class="peek-char-name">
              {{ char.nickname || char.data?.name || "未命名角色" }}
            </div>
            <div class="peek-char-desc">
              {{
                char.data?.personality?.slice(0, 40) ||
                char.data?.description?.slice(0, 40) ||
                "沒有描述"
              }}
            </div>
          </div>
          <div class="peek-char-action">
            <Eye :size="20" stroke-width="3" />
          </div>
        </div>

        <div v-if="characters.length === 0" class="empty-state">
          <Eye :size="48" stroke-width="2" />
          <p>還沒有角色</p>
          <p class="empty-sub">先去建立角色吧</p>
        </div>
      </div>
    </template>
  </div>
</template>

<style lang="scss" scoped>
@import url("https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap");

$bg-color: #f1f3f5;
$frame-border: #1a1a1a;
$phone-bg: #fffbf5;
$text-main: #1a1a1a;
$text-sec: #6b7280;
$accent-color: #fb923c;
$card-bg: #ffffff;
$blob-bg: #d4f2cc;
.peek-select-screen {
  width: 100%;
  height: 100%;
  background: $bg-color;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: $text-main;
  font-family: "Nunito", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  position: relative;
}
// Wrap the whole screen in a centering wrapper for desktop.
// Note: We can just let .peek-select-screen be the frame itself like .phone-frame from PeekPhoneScreen.vue

.blob-bg-top {
  position: absolute;
  top: -80px;
  left: -20px;
  right: -20px;
  height: 280px;
  background: $blob-bg;
  border-bottom: 3px solid $frame-border;
  border-radius: 0 0 55% 45%;
  z-index: 0;
  transform: rotate(-2deg);
}

.blob-bg-bottom {
  position: absolute;
  bottom: -60px;
  left: -20px;
  right: -20px;
  height: 220px;
  background: $blob-bg;
  border-top: 3px solid $frame-border;
  border-radius: 50% 50% 0 0;
  z-index: 0;
  transform: rotate(3deg);
}

.peek-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  margin-top: 10px; // Add a bit of space from the very top on desktop/modern phones
}

.icon-btn {
  width: 44px;
  height: 44px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  background: $card-bg;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: $text-main;
  box-shadow: 2px 2px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(2px, 2px);
    box-shadow: 0px 0px 0 $frame-border;
  }
}

.peek-select-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 18px;
  font-weight: 900;
  color: $text-main;
  background: $card-bg;
  padding: 8px 16px;
  border-radius: 20px;
  border: 2px solid $frame-border;
  box-shadow: 3px 3px 0 $frame-border;
}

.peek-select-hint {
  padding: 24px 20px 16px;
  font-size: 15px;
  font-weight: 800;
  color: $text-main;
  text-align: center;
  flex-shrink: 0;
  position: relative;
  z-index: 2;
}

.peek-select-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 32px;
  padding-bottom: calc(32px + var(--safe-bottom, 0px));
  position: relative;
  z-index: 2;
}

.peek-char-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: $card-bg;
  border: 3px solid $frame-border;
  border-radius: 24px;
  margin-bottom: 16px;
  cursor: pointer;
  box-shadow: 4px 4px 0 $frame-border;
  transition:
    transform 0.1s,
    box-shadow 0.1s;

  &:active {
    transform: translate(3px, 3px);
    box-shadow: 0 0 0 $frame-border;
  }
}

.peek-char-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid $frame-border;
  flex-shrink: 0;
  background: #fdf4ff;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &.chat-avatar {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #ecfeff;
    color: $text-main;
  }
}

.peek-char-avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: $text-main;
}

.peek-char-info {
  flex: 1;
  min-width: 0;
}

.peek-char-name {
  font-size: 18px;
  font-weight: 900;
  color: $text-main;
  margin-bottom: 4px;
}

.peek-char-desc {
  font-size: 14px;
  font-weight: 700;
  color: $text-sec;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-meta {
  font-size: 12px;
  font-weight: 700;
  color: $text-sec;
  margin-top: 4px;
}

.peek-char-action {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: $accent-color;
  border: 2px solid $frame-border;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 2px 2px 0 $frame-border;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  position: relative;
  z-index: 2;
}

.spin {
  animation: spin 1s linear infinite;
  color: $text-sec;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  color: $text-sec;
  background: $card-bg;
  border: 3px dashed $text-sec;
  border-radius: 32px;
  margin-top: 24px;

  p {
    margin: 8px 0 4px;
    font-size: 18px;
    font-weight: 900;
    color: $text-main;
  }

  .empty-sub {
    font-size: 14px;
    font-weight: 700;
    color: $text-sec;
  }
}
</style>
