/**
 * user 的心情便籤 → 線上聊天提示詞（{{userMoodNote}}）
 * 直接讀主畫面配置，不靠主畫面的 store；主動訊息在背景也讀得到
 */

import { storageService } from "@/services/storage";
import { formatNoteTime } from "@/utils/noteTime";

/** 超過這麼久沒改的心情便籤不帶進提示詞 */
export const USER_MOOD_NOTE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** 日記文字最多帶幾個字 */
export const USER_MOOD_NOTE_MAX_LENGTH = 300;

const MOOD_LABELS: Record<string, string> = {
  happy: "開心",
  sad: "難過",
  neutral: "普通",
  love: "心動",
  excited: "期待",
};

interface MoodDiaryData {
  content?: string;
  mood?: string;
  moodChosen?: boolean;
  updatedAt?: number;
}

/**
 * 從主畫面組件裡挑最近改過的心情便籤，寫成提示詞文字
 * @returns 72 小時內沒改過、或沒字也沒點心情時回傳空字串
 */
export function formatUserMoodNote(
  widgets: Array<{ type?: string; data?: unknown }>,
  now = Date.now(),
): string {
  const latest = widgets
    .filter((w) => w?.type === "mood-diary")
    .map((w) => (w.data ?? {}) as MoodDiaryData)
    .filter(
      (d): d is MoodDiaryData & { updatedAt: number } =>
        typeof d.updatedAt === "number" && now - d.updatedAt <= USER_MOOD_NOTE_MAX_AGE_MS,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!latest) return "";

  const content = latest.content?.trim() ?? "";
  const text =
    content.length > USER_MOOD_NOTE_MAX_LENGTH
      ? `${content.slice(0, USER_MOOD_NOTE_MAX_LENGTH)}…`
      : content;
  const mood = latest.moodChosen ? MOOD_LABELS[latest.mood ?? ""] : undefined;
  const time = formatNoteTime(latest.updatedAt, now);

  if (text) return [mood ? `心情：${mood}` : "", `${time} 寫的：${text}`].filter(Boolean).join("\n");
  return mood ? `心情：${mood}（${time}）` : "";
}

/** 給 {{userMoodNote}} 用；讀不到主畫面配置時當作沒有 */
export async function getUserMoodNoteForPrompt(now = Date.now()): Promise<string> {
  try {
    const widgets = await storageService.loadLayout();
    return formatUserMoodNote(Array.isArray(widgets) ? widgets : [], now);
  } catch (error) {
    console.warn("[userMoodNote] 讀取主畫面心情便籤失敗:", error);
    return "";
  }
}
