/**
 * 節日 Store
 * 管理節日狀態、觸發記錄、聊天節日設定
 * 所有持久化資料存 IndexedDB
 */

import { db, DB_STORES } from "@/db/database";
import type {
  Holiday,
  HolidayTriggerConfig,
  HolidayTriggerRecord,
} from "@/types/holiday";
import { DEFAULT_HOLIDAY_CONFIG } from "@/types/holiday";
import {
  detectTodayHoliday,
  detectUpcomingHolidays,
} from "@/utils/holidayDetector";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useHolidayStore = defineStore("holiday", () => {
  // ===== State =====
  const todayHoliday = ref<Holiday | null>(null);
  const upcomingHolidays = ref<Holiday[]>([]);
  const triggerRecords = ref<HolidayTriggerRecord[]>([]);

  // ===== IndexedDB 持久化 =====

  /** 載入觸發記錄 */
  async function loadTriggerRecords(): Promise<void> {
    try {
      const records = await db.getAll<HolidayTriggerRecord>(
        DB_STORES.HOLIDAY_RECORDS,
      );
      triggerRecords.value = records;
      console.log(
        `[HolidayStore] 載入 ${records.length} 條觸發記錄`,
      );
    } catch (error) {
      console.error("[HolidayStore] 載入觸發記錄失敗:", error);
      triggerRecords.value = [];
    }
  }

  /** 儲存觸發記錄 */
  async function saveTriggerRecord(
    record: Omit<HolidayTriggerRecord, "id">,
  ): Promise<void> {
    const fullRecord: HolidayTriggerRecord = {
      ...record,
      id: `holiday_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    try {
      // 存入 IndexedDB
      const plain = JSON.parse(JSON.stringify(fullRecord));
      await db.put(DB_STORES.HOLIDAY_RECORDS, plain);

      // 更新記憶體
      triggerRecords.value.push(fullRecord);

      // 保留最近 100 條，清理舊記錄
      if (triggerRecords.value.length > 100) {
        const sorted = [...triggerRecords.value].sort(
          (a, b) => b.triggeredAt - a.triggeredAt,
        );
        const toDelete = sorted.slice(100);
        for (const old of toDelete) {
          await db.delete(DB_STORES.HOLIDAY_RECORDS, old.id);
        }
        triggerRecords.value = sorted.slice(0, 100);
      }

      console.log(
        `[HolidayStore] 觸發記錄已儲存: ${fullRecord.holidayName}`,
      );
    } catch (error) {
      console.error("[HolidayStore] 儲存觸發記錄失敗:", error);
    }
  }

  /** 載入聊天的節日設定 */
  async function loadChatConfig(
    chatId: string,
  ): Promise<HolidayTriggerConfig> {
    try {
      const config = await db.get<HolidayTriggerConfig>(
        DB_STORES.SETTINGS,
        `holiday_config_${chatId}`,
      );
      return config
        ? { ...DEFAULT_HOLIDAY_CONFIG, ...config }
        : DEFAULT_HOLIDAY_CONFIG;
    } catch {
      return DEFAULT_HOLIDAY_CONFIG;
    }
  }

  /** 儲存聊天的節日設定 */
  async function saveChatConfig(
    chatId: string,
    config: Partial<HolidayTriggerConfig>,
  ): Promise<void> {
    try {
      const current = await loadChatConfig(chatId);
      const merged = { ...current, ...config };
      const plain = JSON.parse(JSON.stringify(merged));
      await db.put(DB_STORES.SETTINGS, plain, `holiday_config_${chatId}`);
    } catch (error) {
      console.error("[HolidayStore] 儲存聊天節日設定失敗:", error);
    }
  }

  // ===== Actions =====

  /** 刷新今日節日狀態 */
  function refreshTodayHoliday(): void {
    todayHoliday.value = detectTodayHoliday();
    upcomingHolidays.value = detectUpcomingHolidays();
  }

  /** 對所有聊天執行節日觸發檢查 */
  async function checkAllChats(
    chats: Array<{ id: string; updatedAt: number; isGroupChat?: boolean }>,
    triggerFn: (chatId: string, holiday: Holiday) => Promise<void>,
  ): Promise<void> {
    const holiday = detectTodayHoliday();
    if (!holiday) return;

    for (const chat of chats) {
      // 跳過群聊
      if (chat.isGroupChat) continue;

      const config = await loadChatConfig(chat.id);
      if (!config.enabled) continue;

      // 檢查是否已觸發
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const alreadyTriggered = triggerRecords.value.some(
        (r) =>
          r.chatId === chat.id &&
          r.holidayName === holiday.name &&
          r.holidayDate === todayStr,
      );
      if (alreadyTriggered) continue;

      // 檢查時段
      const currentHour = today.getHours();
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
      if (!inTimeWindow) continue;

      // 檢查最小間隔（用 chat.updatedAt 替代原系統的 lastMessageTime）
      if (chat.updatedAt) {
        const hoursSince =
          (Date.now() - chat.updatedAt) / (1000 * 60 * 60);
        if (hoursSince < config.minIntervalHours) continue;
      }

      try {
        await triggerFn(chat.id, holiday);
      } catch (error) {
        console.error(
          `[HolidayStore] 觸發聊天 ${chat.id} 節日失敗:`,
          error,
        );
      }
    }
  }

  /** 初始化（App 啟動時呼叫） */
  async function init(): Promise<void> {
    await loadTriggerRecords();
    refreshTodayHoliday();
    console.log(
      "[HolidayStore] 初始化完成",
      todayHoliday.value
        ? `今日節日: ${todayHoliday.value.name}`
        : "今天不是節日",
    );
  }

  return {
    // State
    todayHoliday,
    upcomingHolidays,
    triggerRecords,
    // Actions
    init,
    refreshTodayHoliday,
    loadTriggerRecords,
    saveTriggerRecord,
    loadChatConfig,
    saveChatConfig,
    checkAllChats,
  };
});
