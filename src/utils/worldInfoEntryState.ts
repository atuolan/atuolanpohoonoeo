import type { WorldInfoEntry } from "@/types/worldinfo";

/**
 * 判斷世界書條目是否啟用。
 *
 * 專案內部正規欄位是 disable=true 代表關閉；但導入的 SillyTavern/角色卡資料
 * 可能仍保留 enabled=false。所有生成入口都應同時尊重這兩種表示，避免已關閉
 * 的條目被其他整理流程重新注入提示詞。
 */
export function isWorldInfoEntryEnabled(
  entry: Pick<WorldInfoEntry, "disable" | "content"> & { enabled?: boolean },
): boolean {
  if (!entry.content?.trim()) return false;
  if (entry.disable === true) return false;
  if (entry.enabled === false) return false;
  return true;
}
