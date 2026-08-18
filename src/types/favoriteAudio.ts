/**
 * 收藏語音類型定義
 */

export interface FavoriteAudio {
  /** 唯一識別碼 */
  id: string;
  /** 來源聊天 ID */
  chatId: string;
  /** 來源消息 ID */
  messageId: string;
  /** 角色 ID */
  characterId: string;
  /** 角色名稱（快照） */
  characterName: string;
  /** 角色頭像（快照） */
  characterAvatar?: string;
  /** 語音類型：user=用戶錄音, tts=AI語音合成, phone=通話錄音 */
  audioType: "user" | "tts" | "phone";
  /** 音頻 Blob ID（存在 audio-blobs store 中） */
  audioBlobId?: string;
  /** TTS 音頻 URL（data URL 或外部 URL） */
  ttsAudioUrl?: string;
  /** TTS 段落索引（如果是 ttsSegments 中的某一段） */
  ttsSegmentIndex?: number;
  /** 音頻時長（秒） */
  audioDuration?: number;
  /** 音頻 MIME 類型 */
  audioMimeType?: string;
  /** 波形數據（用於可視化） */
  audioWaveform?: number[];
  /** 語音文字內容（STT 轉錄結果或 TTS 原文） */
  textContent?: string;
  /** 用戶自定義標題 */
  customTitle?: string;
  /** 用戶備註 */
  note?: string;
  /** 標籤 */
  tags?: string[];
  /** 收藏時間 */
  createdAt: number;
  /** 最後播放時間 */
  lastPlayedAt?: number;
  /** 播放次數 */
  playCount: number;
}

export interface FavoriteAudioGroup {
  /** 分組 ID */
  id: string;
  /** 分組名稱 */
  name: string;
  /** 分組圖標 */
  icon?: string;
  /** 分組顏色 */
  color?: string;
  /** 收藏語音 ID 列表 */
  audioIds: string[];
  /** 創建時間 */
  createdAt: number;
  /** 更新時間 */
  updatedAt: number;
}
