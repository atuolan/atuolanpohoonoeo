/**
 * 道歉外賣服務
 * 管理角色道歉外賣的觸發、下單、送達通知
 */

import type { ApologyFoodOrder } from '@/types/block'
import type { Chat } from '@/types/chat'
import { db, DB_STORES } from '@/db/database'
import { getWaimaiCatalogItemById, WAIMAI_CATALOG } from '@/data/waimaiCatalog'

/** 送達計時器最小 ETA（毫秒）：5 分鐘 */
const MIN_ETA_MS = 5 * 60 * 1000
/** 送達計時器最大 ETA（毫秒）：15 分鐘 */
const MAX_ETA_MS = 15 * 60 * 1000

class ApologyFoodService {
  private static instance: ApologyFoodService
  /** 送達計時器映射：orderId → setTimeout handle */
  private deliveryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  static getInstance(): ApologyFoodService {
    if (!ApologyFoodService.instance) {
      ApologyFoodService.instance = new ApologyFoodService()
    }
    return ApologyFoodService.instance
  }

  /**
   * 處理角色道歉外賣（由 ResponseParser 觸發）
   * 從 waimaiCatalog 取得食物資訊，不存在時隨機替代
   */
  async handleApologyFood(
    chatId: string,
    characterId: string,
    itemId: string,
    message: string
  ): Promise<void> {
    // 從目錄取得食物資訊
    let catalogItem = getWaimaiCatalogItemById(itemId)

    if (!catalogItem) {
      // 食物 ID 不存在，隨機選擇一個替代
      console.warn(`[ApologyFood] 食物 ID "${itemId}" 不存在於 waimaiCatalog，隨機選擇替代食物`)
      const available = WAIMAI_CATALOG.filter(i => i.isAvailable)
      if (available.length === 0) {
        console.warn('[ApologyFood] waimaiCatalog 中無可用食物，取消下單')
        return
      }
      catalogItem = available[Math.floor(Math.random() * available.length)]
    }

    const now = Date.now()
    // 計算簡化 ETA：隨機 5~15 分鐘
    const etaMs = MIN_ETA_MS + Math.floor(Math.random() * (MAX_ETA_MS - MIN_ETA_MS))
    const estimatedDeliveryAt = now + etaMs

    // 建立道歉外賣訂單
    const order: ApologyFoodOrder = {
      id: crypto.randomUUID(),
      characterId,
      itemId: catalogItem.id,
      itemName: catalogItem.name,
      itemImageUrl: catalogItem.imageUrl,
      message,
      createdAt: now,
      estimatedDeliveryAt,
      status: 'preparing',
    }

    // 儲存訂單到 chat.blockState.apologyFoodOrders
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) {
      console.warn(`[ApologyFood] Chat "${chatId}" 不存在，取消下單`)
      return
    }

    if (!chat.blockState) {
      const { createDefaultBlockState } = await import('@/types/block')
      chat.blockState = createDefaultBlockState()
    }

    chat.blockState.apologyFoodOrders.push(order)
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

    // 啟動送達計時器
    this.startDeliveryTimer(chatId, order)
  }

  /** 取得聊天的道歉外賣記錄 */
  async getApologyOrders(chatId: string): Promise<ApologyFoodOrder[]> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    return chat?.blockState?.apologyFoodOrders ?? []
  }

  /**
   * 啟動所有未送達訂單的計時器（應用啟動時呼叫）
   */
  async restoreTimers(): Promise<void> {
    try {
      const allChats = await db.getAll<Chat>(DB_STORES.CHATS)
      const now = Date.now()

      for (const chat of allChats) {
        const orders = chat.blockState?.apologyFoodOrders ?? []
        for (const order of orders) {
          if (order.status === 'delivered') continue

          const remaining = order.estimatedDeliveryAt - now
          if (remaining <= 0) {
            // 已過期但未送達，立即送達
            await this.deliverOrder(chat.id, order.id)
          } else {
            // 恢復計時器
            this.startDeliveryTimer(chat.id, order)
          }
        }
      }
    } catch (error) {
      console.error('[ApologyFood] 恢復計時器失敗:', error)
    }
  }

  /** 停止所有計時器 */
  stopAll(): void {
    for (const timer of this.deliveryTimers.values()) {
      clearTimeout(timer)
    }
    this.deliveryTimers.clear()
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /** 啟動單個訂單的送達計時器 */
  private startDeliveryTimer(chatId: string, order: ApologyFoodOrder): void {
    // 清除已有的計時器（防止重複）
    if (this.deliveryTimers.has(order.id)) {
      clearTimeout(this.deliveryTimers.get(order.id)!)
    }

    const now = Date.now()
    const delay = Math.max(0, order.estimatedDeliveryAt - now)

    const timer = setTimeout(async () => {
      this.deliveryTimers.delete(order.id)
      await this.deliverOrder(chatId, order.id)
    }, delay)

    this.deliveryTimers.set(order.id, timer)
  }

  /** 送達訂單：更新狀態並發送通知 */
  private async deliverOrder(chatId: string, orderId: string): Promise<void> {
    try {
      const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
      if (!chat?.blockState) return

      const order = chat.blockState.apologyFoodOrders.find(o => o.id === orderId)
      if (!order || order.status === 'delivered') return

      const now = Date.now()

      // 更新訂單狀態
      order.status = 'delivered'
      order.deliveredAt = now

      // 持久化
      chat.updatedAt = now
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      // 取得角色資訊用於通知
      const characterAvatar = await this.getCharacterAvatar(order.characterId)

      // 發送通知（在方法內部匯入，避免 Pinia 初始化順序問題）
      const { useNotificationStore } = await import('@/stores/notification')
      const notificationStore = useNotificationStore()
      notificationStore.addNotification({
        type: 'apology_food',
        title: '道歉外賣送達',
        message: `${order.itemName}：${order.message}`,
        characterId: order.characterId,
        characterAvatar,
        chatId,
        priority: 'normal',
        data: {
          itemName: order.itemName,
          itemImageUrl: order.itemImageUrl,
          characterMessage: order.message,
        },
      })
    } catch (error) {
      console.error(`[ApologyFood] 送達訂單 ${orderId} 失敗:`, error)
    }
  }

  /** 取得角色頭像 */
  private async getCharacterAvatar(characterId: string): Promise<string | undefined> {
    try {
      const character = await db.get<{ avatar?: string }>(DB_STORES.CHARACTERS, characterId)
      return character?.avatar
    } catch {
      return undefined
    }
  }
}

export default ApologyFoodService
