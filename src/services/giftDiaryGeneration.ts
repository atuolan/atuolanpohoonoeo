/**
 * 禮物日記的 AI 生成：角色自己用禮物時寫的日記（solo）、讀完 user 日記留的批註（margin）
 */
import type { GiftDiaryEntry, GiftMemory } from "@/services/giftMemories";
import type { StoredCharacter } from "@/types/character";
import type { GiftDiaryOutput } from "@/utils/giftDiaryFormat";

export interface GiftDiaryGenerationInput {
  character: StoredCharacter;
  memory: GiftMemory;
  /** solo：角色自己用的時候；margin：批註 entry 那篇 */
  mode: "solo" | "margin";
  /** margin 模式要批註的那篇 */
  entry?: GiftDiaryEntry;
  /** 背景自動寫：不開串流視窗 */
  background?: boolean;
}

/** 失敗或沒設定 API 時回 null */
export async function generateGiftDiary(_input: GiftDiaryGenerationInput): Promise<GiftDiaryOutput | null> {
  throw new Error("generateGiftDiary 尚未實作");
}
