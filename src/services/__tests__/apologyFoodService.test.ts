/**
 * ApologyFoodService 單元測試
 * 測試道歉外賣服務的核心邏輯
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import ApologyFoodService from '@/services/ApologyFoodService'
import { createDefaultBlockState } from '@/types/block'
import type { Chat } from '@/types/chat'
import { db, DB_STORES } from '@/db/database'
import { WAIMAI_CATALOG } from '@/data/waimaiCatalog'

/** 建立測試用 Chat 物件 */
function createTestChat(overrides?: Partial<Chat>): Chat {
  return {
    id: crypto.randomUUID(),
    name: '測試聊天',
    characterId: 'test-char-id',
    messages: [],
    metadata: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe('ApologyFoodService', () => {
  let service: ApologyFoodService

  beforeEach(async () => {
    await db.init()
    setActivePinia(createPinia())
    service = ApologyFoodService.getInstance()
    service.stopAll()
  })

  afterEach(() => {
    service.stopAll()
  })

  describe('handleApologyFood - 正常食物 ID', () => {
    it('使用有效食物 ID 應建立正確的訂單', async () => {
      const validItem = WAIMAI_CATALOG[0]
      const chatId = crypto.randomUUID()
      const chat = createTestChat({
        id: chatId,
        blockState: createDefaultBlockState(),
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '對不起送你吃的')

      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      const orders = updated?.blockState?.apologyFoodOrders ?? []
      expect(orders.length).toBe(1)

      const order = orders[0]
      expect(order.itemId).toBe(validItem.id)
      expect(order.itemName).toBe(validItem.name)
      expect(order.itemImageUrl).toBe(validItem.imageUrl)
      expect(order.message).toBe('對不起送你吃的')
      expect(order.characterId).toBe('test-char-id')
      expect(order.status).toBe('preparing')
      expect(order.estimatedDeliveryAt).toBeGreaterThan(order.createdAt)
      // ETA 應在 5~15 分鐘之間
      const etaMs = order.estimatedDeliveryAt - order.createdAt
      expect(etaMs).toBeGreaterThanOrEqual(5 * 60 * 1000)
      expect(etaMs).toBeLessThanOrEqual(15 * 60 * 1000)
    })

    it('Chat 無 blockState 時應自動建立預設 blockState', async () => {
      const validItem = WAIMAI_CATALOG[0]
      const chatId = crypto.randomUUID()
      const chat = createTestChat({ id: chatId })
      // 不設定 blockState
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '道歉')

      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      expect(updated?.blockState).toBeDefined()
      expect(updated?.blockState?.apologyFoodOrders.length).toBe(1)
    })
  })

  describe('handleApologyFood - 不存在食物 ID 替代邏輯', () => {
    it('不存在的食物 ID 應使用隨機替代食物', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const chatId = crypto.randomUUID()
      const chat = createTestChat({
        id: chatId,
        blockState: createDefaultBlockState(),
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.handleApologyFood(chatId, 'test-char-id', 'non_existent_food_id_xyz', '道歉')

      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      const orders = updated?.blockState?.apologyFoodOrders ?? []
      expect(orders.length).toBe(1)

      // 替代食物應存在於目錄中
      const order = orders[0]
      const catalogItem = WAIMAI_CATALOG.find(i => i.id === order.itemId)
      expect(catalogItem).toBeDefined()
      expect(order.itemName).toBe(catalogItem!.name)

      // 應記錄 console.warn
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non_existent_food_id_xyz')
      )

      warnSpy.mockRestore()
    })

    it('Chat 不存在時應靜默忽略', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      // 不建立 Chat，直接呼叫
      await service.handleApologyFood('non-existent-chat', 'test-char-id', WAIMAI_CATALOG[0].id, '道歉')

      // 不應拋出錯誤
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('non-existent-chat')
      )

      warnSpy.mockRestore()
    })
  })

  describe('getApologyOrders', () => {
    it('應回傳指定聊天的道歉外賣記錄', async () => {
      const validItem = WAIMAI_CATALOG[0]
      const chatId = crypto.randomUUID()
      const chat = createTestChat({
        id: chatId,
        blockState: createDefaultBlockState(),
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '道歉1')
      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '道歉2')

      const orders = await service.getApologyOrders(chatId)
      expect(orders.length).toBe(2)
    })

    it('Chat 不存在時應回傳空陣列', async () => {
      const orders = await service.getApologyOrders('non-existent-chat')
      expect(orders).toEqual([])
    })
  })

  describe('restoreTimers', () => {
    it('應恢復未送達訂單的計時器', async () => {
      const chatId = crypto.randomUUID()
      const now = Date.now()
      const futureDelivery = now + 60 * 1000 // 1 分鐘後

      const chat = createTestChat({
        id: chatId,
        blockState: {
          ...createDefaultBlockState(),
          apologyFoodOrders: [
            {
              id: 'order-1',
              characterId: 'test-char-id',
              itemId: WAIMAI_CATALOG[0].id,
              itemName: WAIMAI_CATALOG[0].name,
              itemImageUrl: WAIMAI_CATALOG[0].imageUrl,
              message: '道歉',
              createdAt: now - 60000,
              estimatedDeliveryAt: futureDelivery,
              status: 'preparing',
            },
          ],
        },
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.restoreTimers()

      // 驗證計時器已設定（訂單仍為 preparing）
      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      expect(updated?.blockState?.apologyFoodOrders[0].status).toBe('preparing')
    })

    it('已過期但未送達的訂單應立即送達', async () => {
      const chatId = crypto.randomUUID()
      const now = Date.now()

      const chat = createTestChat({
        id: chatId,
        blockState: {
          ...createDefaultBlockState(),
          apologyFoodOrders: [
            {
              id: 'order-expired',
              characterId: 'test-char-id',
              itemId: WAIMAI_CATALOG[0].id,
              itemName: WAIMAI_CATALOG[0].name,
              itemImageUrl: WAIMAI_CATALOG[0].imageUrl,
              message: '道歉',
              createdAt: now - 600000,
              estimatedDeliveryAt: now - 60000, // 已過期
              status: 'preparing',
            },
          ],
        },
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await service.restoreTimers()

      // 已過期的訂單應立即送達
      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      expect(updated?.blockState?.apologyFoodOrders[0].status).toBe('delivered')
      expect(updated?.blockState?.apologyFoodOrders[0].deliveredAt).toBeDefined()
    })

    it('已送達的訂單應被跳過', async () => {
      const chatId = crypto.randomUUID()
      const now = Date.now()

      const chat = createTestChat({
        id: chatId,
        blockState: {
          ...createDefaultBlockState(),
          apologyFoodOrders: [
            {
              id: 'order-delivered',
              characterId: 'test-char-id',
              itemId: WAIMAI_CATALOG[0].id,
              itemName: WAIMAI_CATALOG[0].name,
              itemImageUrl: WAIMAI_CATALOG[0].imageUrl,
              message: '道歉',
              createdAt: now - 600000,
              estimatedDeliveryAt: now - 300000,
              deliveredAt: now - 300000,
              status: 'delivered',
            },
          ],
        },
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      // 不應拋出錯誤
      await service.restoreTimers()

      // 狀態不變
      const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
      expect(updated?.blockState?.apologyFoodOrders[0].status).toBe('delivered')
    })
  })

  describe('stopAll', () => {
    it('應停止所有計時器', async () => {
      const validItem = WAIMAI_CATALOG[0]
      const chatId = crypto.randomUUID()
      const chat = createTestChat({
        id: chatId,
        blockState: createDefaultBlockState(),
      })
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      // 建立多個訂單
      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '道歉1')
      await service.handleApologyFood(chatId, 'test-char-id', validItem.id, '道歉2')

      // 停止所有計時器不應拋出錯誤
      expect(() => service.stopAll()).not.toThrow()
    })
  })
})
