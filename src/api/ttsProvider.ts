/**
 * 語音合成服務商（MiniMax / Fish Audio）共用的小工具。
 * 設定都放在 settingsStore.minimaxTTS 裡：provider 決定用哪家，Fish Audio 的設定在 fishAudio。
 * 這裡不 import 任何 API 模組，測試 mock 掉 MiniMaxTTSApi 時也能正常用。
 */
import type { FishAudioTTSSettings } from './FishAudioTTSApi';

export type TTSProvider = 'minimax' | 'fishaudio';

interface TTSSettingsLike {
  apiKey?: string;
  provider?: TTSProvider;
  fishAudio?: Partial<FishAudioTTSSettings>;
  voiceId?: string;
  timberWeightsEnabled?: boolean;
}

/** 聊天語音覆蓋設定裡跟音色有關的欄位（各家音色 id 不通用，所以分開存） */
interface VoiceOverrideLike {
  voiceId?: string;
  memberVoices?: Record<string, string>;
  fishVoiceId?: string;
  fishMemberVoices?: Record<string, string>;
}

export function getTTSProvider(settings: TTSSettingsLike | undefined | null): TTSProvider {
  return settings?.provider === 'fishaudio' ? 'fishaudio' : 'minimax';
}

export function getTTSProviderName(settings: TTSSettingsLike | undefined | null): string {
  return getTTSProvider(settings) === 'fishaudio' ? 'Fish Audio' : 'MiniMax';
}

/** 目前服務商的 API Key（沒設回傳空字串） */
export function getActiveTTSApiKey(settings: TTSSettingsLike | undefined | null): string {
  if (!settings) return '';
  return (getTTSProvider(settings) === 'fishaudio' ? settings.fishAudio?.apiKey : settings.apiKey) || '';
}

/** 目前服務商的 API Key 有沒有填 */
export function isTTSConfigured(settings: TTSSettingsLike | undefined | null): boolean {
  return !!getActiveTTSApiKey(settings);
}

/** 目前服務商的全域預設音色 */
export function getDefaultTTSVoice(settings: TTSSettingsLike): string {
  return (getTTSProvider(settings) === 'fishaudio' ? settings.fishAudio?.referenceId : settings.voiceId) || '';
}

/** 覆蓋設定裡，目前服務商用的音色欄位名稱 */
export function getVoiceOverrideKeys(settings: TTSSettingsLike) {
  return getTTSProvider(settings) === 'fishaudio'
    ? ({ voice: 'fishVoiceId', members: 'fishMemberVoices' } as const)
    : ({ voice: 'voiceId', members: 'memberVoices' } as const);
}

/** 聊天自己指定的音色（目前服務商的） */
export function getOverrideVoice(settings: TTSSettingsLike, override: VoiceOverrideLike): string | undefined {
  return override[getVoiceOverrideKeys(settings).voice]?.trim() || undefined;
}

/** 群聊成員各自的音色（目前服務商的） */
export function getOverrideMemberVoices(
  settings: TTSSettingsLike,
  override: VoiceOverrideLike,
): Record<string, string> | undefined {
  return override[getVoiceOverrideKeys(settings).members];
}

/**
 * 把這次要用的音色套進設定：MiniMax 改 voiceId 並關掉音色混合，Fish Audio 改 reference_id。
 * 沒給音色就原樣回傳。
 */
export function applyTTSVoiceOverride<T extends TTSSettingsLike>(settings: T, voiceId: string | undefined): T {
  if (!voiceId) return settings;
  if (getTTSProvider(settings) === 'fishaudio') {
    return {
      ...settings,
      fishAudio: { ...settings.fishAudio, referenceId: voiceId },
    };
  }
  return { ...settings, voiceId, timberWeightsEnabled: false };
}
