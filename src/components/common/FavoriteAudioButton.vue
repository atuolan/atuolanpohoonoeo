<template>
  <button
    class="favorite-audio-btn"
    :class="{ favorited: isFavorited }"
    @click.stop="toggleFavorite"
    :title="isFavorited ? '取消收藏' : '收藏語音'"
    :disabled="loading"
  >
    <span v-if="!loading">{{ isFavorited ? '★' : '☆' }}</span>
    <span v-else class="loading-spinner">⏳</span>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { ChatMessage } from '@/types/chat';
import { useFavoriteAudio } from '@/composables/useFavoriteAudio';
import {
  getFavoriteAudiosByChat,
  deleteFavoriteAudio,
} from '@/db/operations';

const props = defineProps<{
  message: ChatMessage;
  chatId: string;
  characterId: string;
  characterName: string;
  characterAvatar?: string;
  segmentIndex?: number; // TTS 段落索引（如果是收藏特定段落）
}>();

const emit = defineEmits<{
  favorited: [];
  unfavorited: [];
}>();

const { favoriteUserAudio, favoriteTTSAudio, favoritePhoneAudio, checkIsFavorited } =
  useFavoriteAudio();

const isFavorited = ref(false);
const loading = ref(false);
const favoriteId = ref<string | null>(null);

onMounted(async () => {
  await checkFavoriteStatus();
});

async function checkFavoriteStatus() {
  try {
    const result = await checkIsFavorited(
      props.chatId,
      props.message.id,
      props.segmentIndex,
    );
    isFavorited.value = result;

    // 同時獲取收藏 ID（用於取消收藏）
    if (result) {
      const audios = await getFavoriteAudiosByChat(props.chatId);
      const found = audios.find(
        (a) =>
          a.messageId === props.message.id &&
          (props.segmentIndex === undefined ||
            a.ttsSegmentIndex === props.segmentIndex),
      );
      if (found) {
        favoriteId.value = found.id;
      }
    }
  } catch (error) {
    console.error('檢查收藏狀態失敗:', error);
  }
}

async function toggleFavorite() {
  if (loading.value) return;

  loading.value = true;

  try {
    if (isFavorited.value) {
      // 取消收藏
      if (favoriteId.value) {
        await deleteFavoriteAudio(favoriteId.value);
        isFavorited.value = false;
        favoriteId.value = null;
        emit('unfavorited');
      }
    } else {
      // 添加收藏
      await addFavorite();
      isFavorited.value = true;
      emit('favorited');
    }
  } catch (error) {
    console.error('收藏操作失敗:', error);
    alert('操作失敗，請重試');
  } finally {
    loading.value = false;
  }
}

async function addFavorite() {
  const { message, chatId, characterId, characterName, characterAvatar, segmentIndex } =
    props;

  // 判斷音頻類型
  if (message.audioBlobId) {
    // 用戶錄音
    await favoriteUserAudio(
      message,
      chatId,
      characterId,
      characterName,
      characterAvatar,
    );
  } else if (message.ttsSegments || message.ttsAudioUrl) {
    // TTS 語音
    await favoriteTTSAudio(
      message,
      chatId,
      characterId,
      characterName,
      characterAvatar,
      segmentIndex,
    );
  } else if (message.phoneCallHistoryData) {
    // 通話錄音
    await favoritePhoneAudio(
      message,
      chatId,
      characterId,
      characterName,
      characterAvatar,
    );
  } else {
    throw new Error('消息沒有可收藏的音頻');
  }

  // 重新檢查狀態以獲取新的 favoriteId
  await checkFavoriteStatus();
}
</script>

<style scoped lang="scss">
.favorite-audio-btn {
  background: transparent;
  border: none;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 1.2rem;
  color: var(--text-secondary);
  transition: all 0.2s ease;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;

  &:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--warning);
    transform: scale(1.1);
  }

  &.favorited {
    color: var(--warning, #fbbf24);

    &:hover {
      color: var(--error);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .loading-spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
