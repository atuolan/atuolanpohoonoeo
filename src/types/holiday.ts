/**
 * 節日系統類型定義
 */

/** 節日定義 */
export interface Holiday {
  name: string;
  date: string; // MM-DD 格式（當年的公曆日期）
  greeting: string; // 節日問候語
  suggestionAmount?: number; // 建議紅包金額
  aiPrompt?: string; // AI 節日觸發提示詞（支援 {{user}} 宏）
}

/** 農曆節日條目（含多年對照表） */
export interface LunarHolidayEntry {
  name: string;
  greeting: string;
  suggestionAmount?: number;
  aiPrompt?: string;
  dates: Record<number, string>; // key: 年份, value: 'MM-DD'
}

/** 農曆月初一對照條目 [農曆月(負=閏), 公曆月, 公曆日] */
export type LunarMonthEntry = [number, number, number];

/** 節日觸發設定（每個聊天獨立） */
export interface HolidayTriggerConfig {
  enabled: boolean;
  triggerTime: "morning" | "noon" | "evening" | "midnight";
  allowedActions: ("greeting" | "transfer" | "redpacket" | "gift")[];
  minIntervalHours: number;
  characterPersonality?: {
    enthusiasm: "high" | "medium" | "low";
    activeLevel: "high" | "medium" | "low";
  };
}

/** 節日觸發記錄（存 IndexedDB） */
export interface HolidayTriggerRecord {
  id: string; // 唯一 ID
  chatId: string;
  holidayName: string;
  holidayDate: string; // YYYY-MM-DD 格式（含年份，避免跨年誤判）
  triggeredAt: number; // timestamp
  actionType: "greeting" | "transfer" | "redpacket" | "gift";
}

/** 節日觸發判斷結果 */
export interface HolidayTriggerResult {
  shouldTrigger: boolean;
  holiday?: Holiday;
  reason?: string;
}

/** 預設節日觸發設定 */
export const DEFAULT_HOLIDAY_CONFIG: HolidayTriggerConfig = {
  enabled: true,
  triggerTime: "morning",
  allowedActions: ["greeting", "transfer", "redpacket"],
  minIntervalHours: 12,
  characterPersonality: {
    enthusiasm: "medium",
    activeLevel: "medium",
  },
};
