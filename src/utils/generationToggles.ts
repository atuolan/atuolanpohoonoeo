import type { GenerationParams } from "@/stores/settings";
import type { ChatSettings } from "@/types/chat";

/**
 * 從 GenerationParams 取出「參數開關 + top_k」的子集，
 * 供各任務在組裝 ChatSettings 時展開帶入，確保開關設定一致生效。
 *
 * 回傳欄位皆為 ChatSettings 的可選欄位；undefined 時 API 層會按相容舊行為處理。
 */
export function pickGenerationToggles(
  generation: Partial<GenerationParams> | undefined | null,
): Pick<
  ChatSettings,
  | "topK"
  | "enableTemperature"
  | "enableTopP"
  | "enableTopK"
  | "enableFrequencyPenalty"
  | "enablePresencePenalty"
> {
  return {
    topK: generation?.topK ?? 0,
    enableTemperature: generation?.enableTemperature,
    enableTopP: generation?.enableTopP,
    enableTopK: generation?.enableTopK,
    enableFrequencyPenalty: generation?.enableFrequencyPenalty,
    enablePresencePenalty: generation?.enablePresencePenalty,
  };
}
