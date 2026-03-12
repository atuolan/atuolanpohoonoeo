/**
 * API 模組
 */

export {
  OpenAICompatibleClient,
  getAPIClient,
  updateAPIClient,
} from './OpenAICompatible'

export type {
  APIMessage,
  GenerationParams,
} from './OpenAICompatible'

// 音樂 API
export {
  searchMusic,
  getMusicUrl,
  getLyrics,
  getHotMusic,
} from './MusicApi'

export type {
  MusicTrack,
  SearchResult,
} from './MusicApi'

// NovelAI 圖像生成 API
export {
  generateImage,
  testApiKey as testNovelAIApiKey,
  createDefaultNovelAIImageSettings,
  DEFAULT_NEGATIVE_PROMPT,
  AVAILABLE_SAMPLERS,
  PRESET_SIZES,
} from './NovelAIImageApi'

export type {
  NovelAIImageSettings,
  NovelAIImageResponse,
} from './NovelAIImageApi'