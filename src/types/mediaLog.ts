/**
 * 書影記錄類型定義
 * 用於記錄用戶看過的書籍、電影、動漫等
 */

/** 媒體類型 */
export type MediaType = "book" | "movie" | "anime" | "drama" | "game" | "other";

/** 媒體狀態 */
export type MediaStatus = "want" | "watching" | "finished";

/** 媒體類型顯示名稱 */
export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  book: "書",
  movie: "電影",
  anime: "動漫",
  drama: "劇",
  game: "遊戲",
  other: "其他",
};

/** 媒體狀態顯示名稱 */
export const MEDIA_STATUS_LABELS: Record<MediaStatus, string> = {
  want: "想看",
  watching: "在看",
  finished: "看完",
};

/** 書影記錄 */
export interface MediaLog {
  /** 唯一 ID */
  id: string;
  /** 標題（書名/片名） */
  title: string;
  /** 媒體類型 */
  mediaType: MediaType;
  /** 狀態 */
  status: MediaStatus;
  /** 記錄時間 */
  timestamp: number;
  /** 評分 1-5（可選） */
  rating?: number;
  /** 感想/筆記（可選） */
  note?: string;
  /** 作者/導演（可選） */
  author?: string;
  /** 類型標籤（可選，如：科幻、愛情） */
  genre?: string;
  /** 進度（可選，如：第3章、第5集） */
  progress?: string;
}

/** 書影記錄設定 */
export interface MediaLogSettings {
  /** 是否在提示詞中顯示 */
  showInPrompt: boolean;
  /** 提示詞中最多顯示幾條 */
  maxLogsInPrompt: number;
}

/** 默認設定 */
export const DEFAULT_MEDIA_LOG_SETTINGS: MediaLogSettings = {
  showInPrompt: true,
  maxLogsInPrompt: 30,
};

/**
 * 將書影記錄格式化為極簡提示詞格式
 * 設計原則：最少 token，最大信息量
 *
 * 格式：類型|標題|狀態|評分|感想
 * 例如：書|三體|完|★★★★★|硬科幻神作
 */
export function formatMediaLogsForPrompt(
  logs: MediaLog[],
  maxCount: number = 30,
): string {
  if (!logs || logs.length === 0) return "";

  // 按時間倒序，取最近的
  const recentLogs = [...logs]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, maxCount);

  // 極簡格式化
  const lines = recentLogs.map((log) => {
    const parts: string[] = [];

    // 類型（單字）
    parts.push(MEDIA_TYPE_LABELS[log.mediaType] || "其他");

    // 標題
    parts.push(log.title);

    // 狀態（簡寫）
    const statusShort =
      log.status === "finished"
        ? "完"
        : log.status === "watching"
          ? "看"
          : "想";
    parts.push(statusShort);

    // 評分（星星，可選）
    if (log.rating) {
      parts.push("★".repeat(log.rating));
    }

    // 感想（可選，截斷）
    if (log.note) {
      const shortNote =
        log.note.length > 20 ? log.note.slice(0, 20) + "…" : log.note;
      parts.push(shortNote);
    }

    return parts.join("|");
  });

  return lines.join("\n");
}

/**
 * 創建新的書影記錄
 */
export function createMediaLog(
  title: string,
  mediaType: MediaType,
  status: MediaStatus = "finished",
): MediaLog {
  return {
    id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    mediaType,
    status,
    timestamp: Date.now(),
  };
}
