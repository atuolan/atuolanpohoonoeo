/**
 * 聊天畫面節日觸發 composable
 * 進入聊天時自動檢測節日，觸發 AI 主動祝福
 *
 * 使用方式（在 ChatScreen.vue 中）：
 * ```ts
 * const { hasTriggeredToday } = useHolidayTrigger(
 *   currentChatId,
 *   triggerHolidayAI
 * )
 * ```
 */

import { holidayService } from "@/services/HolidayService";
import { useHolidayStore } from "@/stores/holiday";
import type { Holiday } from "@/types/holiday";
import { detectTodayHoliday } from "@/utils/holidayDetector";
import { computed, onMounted, watch, type Ref } from "vue";

export function useHolidayTrigger(
  chatId: Ref<string | undefined>,
  /**
   * 注入節日提示詞並觸發 AI 回覆的函式
   * 由 ChatScreen 提供，因為只有 ChatScreen 知道如何發送 AI 請求
   */
  triggerWithHolidayPrompt: (holiday: Holiday) => Promise<void>,
) {
  const holidayStore = useHolidayStore();
  let triggered = false; // 防止 onMounted + watch 重複觸發

  /** 當前聊天是否已觸發今日節日 */
  const hasTriggeredToday = computed(() => {
    if (!chatId.value) return true;
    const todayHoliday = detectTodayHoliday();
    if (!todayHoliday) return true;
    return holidayService.hasTriggered(
      holidayStore.triggerRecords,
      chatId.value,
      todayHoliday.name,
    );
  });

  /** 進入聊天時自動觸發 */
  async function autoTriggerOnEnter(): Promise<void> {
    if (triggered) return;
    if (!chatId.value) return;
    const todayHoliday = detectTodayHoliday();
    if (!todayHoliday) return;
    if (hasTriggeredToday.value) return;

    triggered = true;

    // 延遲 2 秒，讓聊天畫面先載入完成
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 再次檢查（可能在等待期間已被觸發）
    if (hasTriggeredToday.value) return;
    if (!chatId.value) return;

    try {
      await triggerWithHolidayPrompt(todayHoliday);

      // 記錄觸發
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      await holidayStore.saveTriggerRecord({
        chatId: chatId.value,
        holidayName: todayHoliday.name,
        holidayDate: todayStr,
        triggeredAt: Date.now(),
        actionType: "greeting",
      });

      holidayService.markTriggered(chatId.value);
      console.log(`[useHolidayTrigger] 節日觸發成功: ${todayHoliday.name}`);
    } catch (error) {
      console.error("[useHolidayTrigger] 節日觸發失敗:", error);
    }
  }

  /** 手動觸發節日祝福（除錯用） */
  async function manualTrigger(): Promise<void> {
    const todayHoliday = detectTodayHoliday();
    if (!todayHoliday) {
      console.warn("[useHolidayTrigger] 今天不是節日，無法手動觸發");
      return;
    }
    await triggerWithHolidayPrompt(todayHoliday);
  }

  onMounted(() => {
    autoTriggerOnEnter();
  });

  // 如果 onMounted 時 chatId 還沒設定，watch 變化後再嘗試觸發
  watch(chatId, (newId) => {
    if (newId && !triggered) {
      autoTriggerOnEnter();
    }
  });

  return { hasTriggeredToday, manualTrigger };
}
