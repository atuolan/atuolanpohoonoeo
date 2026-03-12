/**
 * 節日業務邏輯服務
 * 合併原系統的 holidayTrigger.ts + holidayMonitor.ts
 *
 * 職責：
 * - 觸發判斷（shouldTriggerHoliday）
 * - 監控（visibilitychange + 保底輪詢）
 * - 提示詞生成
 * - 推薦金額
 */

import { holidayAmountMap } from "@/data/holidayData";
import type {
  Holiday,
  HolidayTriggerConfig,
  HolidayTriggerRecord,
  HolidayTriggerResult,
} from "@/types/holiday";
import { detectTodayHoliday } from "@/utils/holidayDetector";

class HolidayService {
  private intervalId: number | null = null;
  private visibilityHandler: (() => void) | null = null;
  private triggeredChatsToday: Set<string> = new Set();
  private lastCheckDate: string | null = null;

  // ===== 監控 =====

  /** 啟動監控 */
  startMonitoring(): void {
    if (this.intervalId !== null || this.visibilityHandler !== null) {
      console.warn("[HolidayService] 監控已在運行");
      return;
    }

    console.log("[HolidayService] 啟動節日監控");

    // 1. visibilitychange 事件（使用者切回 App 時觸發）
    this.visibilityHandler = () => {
      if (document.visibilityState === "visible") {
        console.log("[HolidayService] App 回到前台，檢查節日");
        this.check();
      }
    };
    document.addEventListener("visibilitychange", this.visibilityHandler);

    // 2. 保底長間隔輪詢（60 分鐘）
    this.intervalId = window.setInterval(() => {
      this.check();
    }, 60 * 60 * 1000);

    // 3. 立即執行一次
    this.check();
  }

  /** 停止監控 */
  stopMonitoring(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }
    console.log("[HolidayService] 節日監控已停止");
  }

  /** 執行一次節日檢查 */
  check(): Holiday | null {
    const today = new Date().toISOString().split("T")[0];

    // 新的一天，重置已觸發列表
    if (this.lastCheckDate !== today) {
      this.lastCheckDate = today;
      this.triggeredChatsToday.clear();
    }

    const todayHoliday = detectTodayHoliday();
    if (!todayHoliday) return null;

    console.log(`[HolidayService] 檢測到節日: ${todayHoliday.name}`);

    // 發送全局事件
    window.dispatchEvent(
      new CustomEvent("holiday:detected", {
        detail: { holiday: todayHoliday, timestamp: Date.now() },
      }),
    );

    return todayHoliday;
  }

  // ===== 觸發判斷 =====

  /**
   * 判斷是否該觸發節日劇情
   * records 從外部傳入（由 store 從 IndexedDB 讀取），不再自己讀 localStorage
   */
  shouldTriggerHoliday(
    chat: { id: string; updatedAt: number },
    config: HolidayTriggerConfig,
    records: HolidayTriggerRecord[],
  ): HolidayTriggerResult {
    if (!config.enabled) {
      return { shouldTrigger: false, reason: "節日觸發未啟用" };
    }

    const todayHoliday = detectTodayHoliday();
    if (!todayHoliday) {
      return { shouldTrigger: false, reason: "今天不是節日" };
    }

    // 檢查是否已觸發（用 YYYY-MM-DD 格式）
    if (this.hasTriggered(records, chat.id, todayHoliday.name)) {
      return { shouldTrigger: false, reason: "已經觸發過該節日" };
    }

    // 檢查記憶體中的已觸發列表
    if (this.triggeredChatsToday.has(chat.id)) {
      return { shouldTrigger: false, reason: "今天已觸發過此聊天" };
    }

    // 檢查最小觸發間隔（用 chat.updatedAt 替代原系統的 lastMessageTime）
    if (chat.updatedAt) {
      const hoursSince =
        (Date.now() - chat.updatedAt) / (1000 * 60 * 60);
      if (hoursSince < config.minIntervalHours) {
        return { shouldTrigger: false, reason: "距離上次消息時間太短" };
      }
    }

    // 檢查當前時段
    const currentHour = new Date().getHours();
    let inTimeWindow = false;
    switch (config.triggerTime) {
      case "morning":
        inTimeWindow = currentHour >= 6 && currentHour < 12;
        break;
      case "noon":
        inTimeWindow = currentHour >= 12 && currentHour < 14;
        break;
      case "evening":
        inTimeWindow = currentHour >= 18 && currentHour < 22;
        break;
      case "midnight":
        inTimeWindow = currentHour >= 0 && currentHour < 2;
        break;
    }

    if (!inTimeWindow) {
      return { shouldTrigger: false, reason: "不在配置的觸發時段內" };
    }

    return { shouldTrigger: true, holiday: todayHoliday };
  }

  /** 檢查是否已觸發（用 YYYY-MM-DD 格式，修復原系統跨年問題） */
  hasTriggered(
    records: HolidayTriggerRecord[],
    chatId: string,
    holidayName: string,
  ): boolean {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    return records.some(
      (r) =>
        r.chatId === chatId &&
        r.holidayName === holidayName &&
        r.holidayDate === todayStr,
    );
  }

  /** 標記聊天已觸發（記憶體層級，防止同一次 session 重複觸發） */
  markTriggered(chatId: string): void {
    this.triggeredChatsToday.add(chatId);
  }

  // ===== 提示詞生成 =====

  /** 生成節日觸發提示詞 */
  getHolidayTriggerPrompt(
    holiday: Holiday,
    config: HolidayTriggerConfig,
  ): string {
    const { characterPersonality } = config;
    let prompt = `[系統提示：今天是 ${holiday.name}，`;

    if (characterPersonality) {
      if (characterPersonality.activeLevel === "high") {
        prompt += "請主動向對方發送節日祝福";
      } else if (characterPersonality.activeLevel === "medium") {
        prompt += "可以自然地提及節日";
      } else {
        prompt += "如果對方提到節日，再做回應";
      }
    } else {
      prompt += "可以主動發送節日祝福";
    }

    if (
      config.allowedActions.includes("redpacket") ||
      config.allowedActions.includes("transfer")
    ) {
      prompt += "，可以發送紅包或轉帳表達心意";
    }

    prompt += "。請自然地融入對話中，不要顯得突兀。]";

    return prompt;
  }

  /** 取得節日推薦紅包金額 */
  getRecommendedAmounts(holiday: Holiday): number[] {
    return holidayAmountMap[holiday.name] || [66.66, 88.88, 168];
  }
}

/** 全域單例 */
export const holidayService = new HolidayService();
