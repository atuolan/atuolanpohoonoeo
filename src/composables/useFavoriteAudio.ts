import { ref } from 'vue';
import type { FavoriteAudio } from '@/types/favoriteAudio';
import type { ChatMessage } from '@/types/chat';
import {
  saveFavoriteAudio,
  deleteFavoriteAudio,
  isFavoriteAudio,
} from '@/db/operations';

export function useFavoriteAudio() {
  const isFavoriting = ref(false);

  /**
   * 收藏用戶錄音消息
   */
  async function favoriteUserAudio(
    message: ChatMessage,
    chatId: string,
    characterId: string,
    characterName: string,
    characterAvatar?: string,
  ): Promise<void> {
    if (!message.audioBlobId) {
      throw new Error('消息沒有音頻數據');
    }

    const favoriteAudio: FavoriteAudio = {
      id: crypto.randomUUID(),
      chatId,
      messageId: message.id,
      characterId,
      characterName,
      characterAvatar,
      audioType: 'user',
      audioBlobId: message.audioBlobId,
      audioDuration: message.audioDuration,
      audioMimeType: message.audioMimeType,
      audioWaveform: message.audioWaveform,
      textContent: message.audioTranscript || message.content,
      createdAt: Date.now(),
      playCount: 0,
    };

    await saveFavoriteAudio(favoriteAudio);
  }

  /**
   * 收藏 TTS 語音消息
   */
  async function favoriteTTSAudio(
    message: ChatMessage,
    chatId: string,
    characterId: string,
    characterName: string,
    characterAvatar?: string,
    segmentIndex?: number,
  ): Promise<void> {
    let ttsAudioUrl: string | undefined;
    let textContent: string | undefined;

    if (segmentIndex !== undefined && message.ttsSegments?.[segmentIndex]) {
      // 收藏特定段落
      const segment = message.ttsSegments[segmentIndex];
      ttsAudioUrl = segment.audioUrl;
      textContent = segment.clean || segment.text;
    } else if (message.ttsAudioUrl) {
      // 收藏整段語音（向下兼容）
      ttsAudioUrl = message.ttsAudioUrl;
      textContent = message.ttsRawContent || message.content;
    }

    if (!ttsAudioUrl) {
      throw new Error('消息沒有 TTS 音頻數據');
    }

    const favoriteAudio: FavoriteAudio = {
      id: crypto.randomUUID(),
      chatId,
      messageId: message.id,
      characterId,
      characterName,
      characterAvatar,
      audioType: 'tts',
      ttsAudioUrl,
      ttsSegmentIndex: segmentIndex,
      textContent,
      createdAt: Date.now(),
      playCount: 0,
    };

    await saveFavoriteAudio(favoriteAudio);
  }

  /**
   * 收藏通話錄音
   */
  async function favoritePhoneAudio(
    message: ChatMessage,
    chatId: string,
    characterId: string,
    characterName: string,
    characterAvatar?: string,
  ): Promise<void> {
    if (!message.phoneCallHistoryData) {
      throw new Error('消息沒有通話記錄數據');
    }

    // 這裡可以擴展為收藏整段通話或特定語音片段
    // 目前先簡單處理
    const favoriteAudio: FavoriteAudio = {
      id: crypto.randomUUID(),
      chatId,
      messageId: message.id,
      characterId,
      characterName,
      characterAvatar,
      audioType: 'phone',
      textContent: '通話錄音',
      createdAt: Date.now(),
      playCount: 0,
    };

    await saveFavoriteAudio(favoriteAudio);
  }

  /**
   * 檢查消息是否已收藏
   */
  async function checkIsFavorited(
    chatId: string,
    messageId: string,
    segmentIndex?: number,
  ): Promise<boolean> {
    return await isFavoriteAudio(chatId, messageId, segmentIndex);
  }

  /**
   * 取消收藏（需要先查找對應的收藏記錄）
   */
  async function unfavoriteAudio(favoriteId: string): Promise<void> {
    await deleteFavoriteAudio(favoriteId);
  }

  return {
    isFavoriting,
    favoriteUserAudio,
    favoriteTTSAudio,
    favoritePhoneAudio,
    checkIsFavorited,
    unfavoriteAudio,
  };
}
