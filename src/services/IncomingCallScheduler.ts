/**
 * 來電排程服務
 * 管理角色主動來電的排程、觸發和記錄
 */

import { db, DB_STORES } from "@/db/database";
import type {
  CallHistoryEntry,
  CallStatus,
  CallType,
  PendingCall,
  ScheduleCallData,
} from "@/types/incomingCall";

/**
 * 角色資訊（用於建立待處理來電）
 */
export interface CharacterInfo {
  id: string;
  name: string;
  avatar?: string;
}

/**
 * 延遲時間單位對應的毫秒數
 */
const DELAY_UNITS: Record<string, number> = {
  s: 1000, // 秒
  m: 60 * 1000, // 分鐘
  h: 60 * 60 * 1000, // 小時
  d: 24 * 60 * 60 * 1000, // 天
};

/**
 * 解析延遲時間字串
 * 支援格式：5s, 30m, 1h, 2d
 *
 * @param delayString - 延遲時間字串
 * @returns 毫秒數，如果格式無效則返回 null
 */
export function parseDelayString(delayString: string): number | null {
  if (!delayString || typeof delayString !== "string") {
    return null;
  }

  const match = delayString.match(/^(\d+)([smhd])$/i);
  if (!match) {
    return null;
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  if (value <= 0 || !DELAY_UNITS[unit]) {
    return null;
  }

  return value * DELAY_UNITS[unit];
}

/**
 * 計算觸發時間
 *
 * @param delayString - 延遲時間字串
 * @param baseTime - 基準時間（預設為當前時間）
 * @returns 觸發時間的 Unix timestamp，如果格式無效則返回 null
 */
export function calculateTriggerTime(
  delayString: string,
  baseTime: number = Date.now(),
): number | null {
  const delayMs = parseDelayString(delayString);
  if (delayMs === null) {
    return null;
  }
  return baseTime + delayMs;
}

/**
 * 檢查是否應該觸發來電（考慮勿擾模式）
 * 這是一個純函數，用於測試和邏輯驗證
 *
 * @param pendingCall - 待處理來電
 * @param doNotDisturb - 勿擾模式是否開啟
 * @param currentTime - 當前時間（預設為 Date.now()）
 * @returns 是否應該觸發來電
 */
export function shouldTriggerCall(
  pendingCall: PendingCall,
  doNotDisturb: boolean,
  currentTime: number = Date.now(),
): boolean {
  // 勿擾模式開啟時不觸發來電
  if (doNotDisturb) {
    return false;
  }

  // 檢查是否已到期
  return pendingCall.triggerTime <= currentTime;
}

/**
 * 來電排程服務類
 */
export class IncomingCallScheduler {
  /**
   * 排程新來電
   *
   * @param data - schedule-call 標籤解析結果
   * @param characterInfo - 角色資訊
   * @param chatId - 聊天 ID
   * @returns 建立的待處理來電記錄，如果失敗則返回 null
   */
  async schedulePendingCall(
    data: ScheduleCallData,
    characterInfo: CharacterInfo,
    chatId: string,
  ): Promise<PendingCall | null> {
    const triggerTime = calculateTriggerTime(data.delay);
    if (triggerTime === null) {
      console.warn("[IncomingCallScheduler] 無效的延遲時間格式:", data.delay);
      return null;
    }

    const pendingCall: PendingCall = {
      id: crypto.randomUUID(),
      characterId: characterInfo.id,
      characterName: characterInfo.name,
      characterAvatar: characterInfo.avatar,
      chatId,
      triggerTime,
      reason: data.reason,
      opening: data.opening,
      createdAt: Date.now(),
    };

    try {
      await db.put(DB_STORES.PENDING_CALLS, pendingCall);
      console.log(
        "[IncomingCallScheduler] 已排程來電:",
        pendingCall.id,
        "觸發時間:",
        new Date(triggerTime).toLocaleString(),
      );
      return pendingCall;
    } catch (e) {
      console.error("[IncomingCallScheduler] 排程來電失敗:", e);
      return null;
    }
  }

  /**
   * 檢查待觸發的來電
   * 返回第一個已到期的待處理來電
   *
   * @param globalDoNotDisturb - 全域勿擾模式是否開啟
   * @param chatDoNotDisturbMap - 每個聊天的勿擾設定 Map (chatId -> doNotDisturb)
   * @returns 已到期的待處理來電，如果沒有或勿擾模式開啟則返回 null
   */
  async checkPendingCalls(
    globalDoNotDisturb: boolean = false,
    chatDoNotDisturbMap?: Map<string, boolean>,
  ): Promise<PendingCall | null> {
    // 全域勿擾模式開啟時不觸發來電
    if (globalDoNotDisturb) {
      console.log("[IncomingCallScheduler] 全域勿擾模式開啟，不觸發來電");
      return null;
    }

    try {
      const allPendingCalls = await db.getAll<PendingCall>(
        DB_STORES.PENDING_CALLS,
      );
      const now = Date.now();

      // 找出所有已到期的來電，按建立時間排序
      // 同時過濾掉該聊天開啟勿擾模式的來電
      const overdueCalls = allPendingCalls
        .filter((call) => {
          // 檢查是否已到期
          if (call.triggerTime > now) {
            return false;
          }
          // 檢查該聊天是否開啟勿擾模式
          if (chatDoNotDisturbMap?.get(call.chatId)) {
            console.log(
              "[IncomingCallScheduler] 聊天勿擾模式開啟，跳過來電:",
              call.chatId,
            );
            return false;
          }
          return true;
        })
        .sort((a, b) => a.createdAt - b.createdAt);

      if (overdueCalls.length > 0) {
        return overdueCalls[0];
      }

      return null;
    } catch (e) {
      console.error("[IncomingCallScheduler] 檢查待處理來電失敗:", e);
      return null;
    }
  }

  /**
   * 取消待處理來電
   *
   * @param id - 待處理來電 ID
   * @returns 是否成功取消
   */
  async cancelPendingCall(id: string): Promise<boolean> {
    try {
      await db.delete(DB_STORES.PENDING_CALLS, id);
      console.log("[IncomingCallScheduler] 已取消來電:", id);
      return true;
    } catch (e) {
      console.error("[IncomingCallScheduler] 取消來電失敗:", e);
      return false;
    }
  }

  /**
   * 清除角色的所有待處理來電
   *
   * @param characterId - 角色 ID
   * @returns 清除的來電數量
   */
  async clearCharacterPendingCalls(characterId: string): Promise<number> {
    try {
      const allPendingCalls = await db.getAll<PendingCall>(
        DB_STORES.PENDING_CALLS,
      );
      const characterCalls = allPendingCalls.filter(
        (call) => call.characterId === characterId,
      );

      for (const call of characterCalls) {
        await db.delete(DB_STORES.PENDING_CALLS, call.id);
      }

      console.log(
        "[IncomingCallScheduler] 已清除角色來電:",
        characterId,
        "數量:",
        characterCalls.length,
      );
      return characterCalls.length;
    } catch (e) {
      console.error("[IncomingCallScheduler] 清除角色來電失敗:", e);
      return 0;
    }
  }

  /**
   * 獲取所有待處理來電
   *
   * @returns 所有待處理來電列表
   */
  async getAllPendingCalls(): Promise<PendingCall[]> {
    try {
      return await db.getAll<PendingCall>(DB_STORES.PENDING_CALLS);
    } catch (e) {
      console.error("[IncomingCallScheduler] 獲取待處理來電失敗:", e);
      return [];
    }
  }

  /**
   * 根據 ID 獲取待處理來電
   *
   * @param id - 待處理來電 ID
   * @returns 待處理來電記錄，如果不存在則返回 null
   */
  async getPendingCallById(id: string): Promise<PendingCall | null> {
    try {
      const call = await db.get<PendingCall>(DB_STORES.PENDING_CALLS, id);
      return call ?? null;
    } catch (e) {
      console.error("[IncomingCallScheduler] 獲取待處理來電失敗:", e);
      return null;
    }
  }

  /**
   * 記錄通話歷史
   *
   * @param characterId - 角色 ID
   * @param chatId - 聊天 ID
   * @param type - 通話類型
   * @param status - 通話狀態
   * @param duration - 通話時長（秒）
   * @param reason - 來電原因（僅 incoming）
   * @returns 建立的通話記錄
   */
  async recordCallHistory(
    characterId: string,
    chatId: string,
    type: CallType,
    status: CallStatus,
    duration: number,
    reason?: string,
  ): Promise<CallHistoryEntry | null> {
    const entry: CallHistoryEntry = {
      id: crypto.randomUUID(),
      characterId,
      chatId,
      type,
      status,
      duration,
      reason,
      createdAt: Date.now(),
    };

    try {
      await db.put(DB_STORES.CALL_HISTORY, entry);
      console.log("[IncomingCallScheduler] 已記錄通話:", entry.id);
      return entry;
    } catch (e) {
      console.error("[IncomingCallScheduler] 記錄通話失敗:", e);
      return null;
    }
  }

  /**
   * 獲取最近通話記錄
   *
   * @param characterId - 角色 ID
   * @param hours - 時間範圍（小時），預設 24 小時
   * @returns 最近的通話記錄列表
   */
  async getRecentCallHistory(
    characterId: string,
    hours: number = 24,
  ): Promise<CallHistoryEntry[]> {
    try {
      const allHistory = await db.getAll<CallHistoryEntry>(
        DB_STORES.CALL_HISTORY,
      );
      const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

      return allHistory
        .filter(
          (entry) =>
            entry.characterId === characterId && entry.createdAt >= cutoffTime,
        )
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error("[IncomingCallScheduler] 獲取通話記錄失敗:", e);
      return [];
    }
  }

  /**
   * 獲取角色的所有通話記錄
   *
   * @param characterId - 角色 ID
   * @returns 通話記錄列表
   */
  async getCharacterCallHistory(
    characterId: string,
  ): Promise<CallHistoryEntry[]> {
    try {
      const allHistory = await db.getAll<CallHistoryEntry>(
        DB_STORES.CALL_HISTORY,
      );
      return allHistory
        .filter((entry) => entry.characterId === characterId)
        .sort((a, b) => b.createdAt - a.createdAt);
    } catch (e) {
      console.error("[IncomingCallScheduler] 獲取通話記錄失敗:", e);
      return [];
    }
  }

  /**
   * 檢查最近是否有通話（用於判斷是否應該打電話）
   *
   * @param characterId - 角色 ID
   * @param withinHours - 時間範圍（小時），預設 1 小時
   * @returns 是否有最近通話
   */
  async hasRecentCall(
    characterId: string,
    withinHours: number = 1,
  ): Promise<boolean> {
    const recentCalls = await this.getRecentCallHistory(
      characterId,
      withinHours,
    );
    return recentCalls.length > 0;
  }

  /**
   * 獲取最近被拒接的次數
   *
   * @param characterId - 角色 ID
   * @param withinHours - 時間範圍（小時），預設 24 小時
   * @returns 被拒接的次數
   */
  async getRecentDeclinedCount(
    characterId: string,
    withinHours: number = 24,
  ): Promise<number> {
    const recentCalls = await this.getRecentCallHistory(
      characterId,
      withinHours,
    );
    return recentCalls.filter((call) => call.status === "declined").length;
  }
}

// 全局單例
let schedulerInstance: IncomingCallScheduler | null = null;

/**
 * 獲取來電排程服務實例
 */
export function getIncomingCallScheduler(): IncomingCallScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new IncomingCallScheduler();
  }
  return schedulerInstance;
}
