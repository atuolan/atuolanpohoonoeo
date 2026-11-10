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
  /** 今天要祝的節日；預設只看內建節日表（聊天頁會先看是不是 user 生日） */
  detectToday: () => Holiday | null = detectTodayHoliday,
) {
  const holidayStore = useHolidayStore();
  /** 已經檢查過的聊天，防止 onMounted + watch 重複觸發 */
  const triggeredChats = new Set<string>();

  /** 當前聊天是否已觸發今日節日 */
  const hasTriggeredToday = computed(() => {
    if (!chatId.value) return true;
    const todayHoliday = detectToday();
    if (!todayHoliday) return true;
    return holidayService.hasTriggered(
      holidayStore.triggerRecords,
      chatId.value,
      todayHoliday.name,
    );
  });

  /** 進入聊天時自動觸發 */
  async function autoTriggerOnEnter(): Promise<void> {
    const id = chatId.value;
    if (!id || triggeredChats.has(id)) return;
    triggeredChats.add(id);

    // 延遲 2 秒，讓聊天畫面先載入完成（聊天綁定的 user 這時才確定，生日看 user，所以等完再看今天要祝什麼）
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 可能在等待期間換了聊天或已被觸發
    if (chatId.value !== id) return;
    const holiday = detectToday();
    if (!holiday) return;
    if (holidayService.hasTriggered(holidayStore.triggerRecords, id, holiday.name)) return;

    // 翻看歸檔的聊天時不主動祝福（歸檔＝角色完全安靜）
    const { loadChatById } = await import("@/storage/chatStorage");
    if ((await loadChatById(id))?.archivedAt) return;

    try {
      await triggerWithHolidayPrompt(holiday);

      // 記錄觸發
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      await holidayStore.saveTriggerRecord({
        chatId: id,
        holidayName: holiday.name,
        holidayDate: todayStr,
        triggeredAt: Date.now(),
        actionType: "greeting",
      });

      holidayService.markTriggered(id);
      console.log(`[useHolidayTrigger] 節日觸發成功: ${holiday.name}`);
    } catch (error) {
      console.error("[useHolidayTrigger] 節日觸發失敗:", error);
    }
  }

  /** 手動觸發節日祝福（除錯用） */
  async function manualTrigger(): Promise<void> {
    const todayHoliday = detectToday();
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
    if (newId) {
      autoTriggerOnEnter();
    }
  });

  return { hasTriggeredToday, manualTrigger };
}
