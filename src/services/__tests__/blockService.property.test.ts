/**
 * BlockService 屬性測試
 * 使用 fast-check 驗證封鎖系統核心邏輯的正確性屬性
 */

import { describe, it, expect, beforeEach } from 'vitest'
import fc from 'fast-check'
import 'fake-indexeddb/auto'
import { createPinia, setActivePinia } from 'pinia'
import { calculateCooldownMs, shouldBlockProactiveMessage, shouldBlockIncomingCall, shouldHideFromQZone, shouldHideFromPeekPhone } from '@/services/BlockService'
import BlockService from '@/services/BlockService'
import { createDefaultBlockState } from '@/types/block'
import type { BlockState, BlockDirection } from '@/types/block'
import type { Chat } from '@/types/chat'
import { db, DB_STORES } from '@/db/database'

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

describe('BlockService 屬性測試', () => {
  /**
   * Property 1: 冷卻時間單調性
   * **Validates: Requirements 5.3**
   */
  it('Property 1: 冷卻時間單調性', () => {
    fc.assert(
      fc.property(
        fc.nat(100),
        fc.nat(100),
        (a, b) => {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          expect(calculateCooldownMs(lo)).toBeLessThanOrEqual(calculateCooldownMs(hi))
        }
      )
    )
  })

  /**
   * Property 2: 冷卻時間範圍
   * **Validates: Requirements 5.2**
   */
  it('Property 2: 冷卻時間範圍', () => {
    fc.assert(
      fc.property(fc.nat(1000), (n) => {
        const result = calculateCooldownMs(n)
        expect(result).toBeGreaterThanOrEqual(10 * 60 * 1000)
        expect(result).toBeLessThanOrEqual(24 * 60 * 60 * 1000)
      })
    )
  })

  /**
   * Property 3: 封鎖操作正確性
   * **Validates: Requirements 1.1, 1.2, 3.2**
   */
  describe('Property 3: 封鎖操作正確性', () => {
    beforeEach(async () => {
      await db.init()
    })

    it('blockCharacter 後 status 應為 user-blocked-char，blockedAt 已設定，history 長度增加 1', async () => {
      const blockService = BlockService.getInstance()
      const chat = createTestChat({ blockState: createDefaultBlockState() })

      // 寫入測試 Chat
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      const oldHistoryLength = chat.blockState!.history.length

      await blockService.blockCharacter(chat.id)

      // 從 DB 讀回驗證
      const updated = await db.get<Chat>(DB_STORES.CHATS, chat.id)
      expect(updated).toBeDefined()
      expect(updated!.blockState!.status).toBe('user-blocked-char')
      expect(updated!.blockState!.blockedAt).toBeDefined()
      expect(updated!.blockState!.blockedAt).toBeGreaterThan(0)
      expect(updated!.blockState!.history.length).toBe(oldHistoryLength + 1)

      const lastEntry = updated!.blockState!.history[updated!.blockState!.history.length - 1]
      expect(lastEntry.direction).toBe('user-blocked-char')
      expect(lastEntry.unblockedAt).toBeNull()
    })
  })

  /**
   * Property 4: 解封操作正確性
   * **Validates: Requirements 2.1, 2.2**
   */
  describe('Property 4: 解封操作正確性', () => {
    beforeEach(async () => {
      await db.init()
    })

    it('unblockCharacter 後 status 應為 none，blockedAt/reason 為 undefined，history 中 unblockedAt 已設定', async () => {
      const blockService = BlockService.getInstance()
      const now = Date.now()
      const chat = createTestChat({
        blockState: {
          ...createDefaultBlockState(),
          status: 'user-blocked-char',
          blockedAt: now,
          reason: '用戶主動封鎖',
          history: [{
            id: crypto.randomUUID(),
            direction: 'user-blocked-char',
            reason: '用戶主動封鎖',
            blockedAt: now,
            unblockedAt: null,
          }],
        },
      })

      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      await blockService.unblockCharacter(chat.id)

      const updated = await db.get<Chat>(DB_STORES.CHATS, chat.id)
      expect(updated).toBeDefined()
      expect(updated!.blockState!.status).toBe('none')
      expect(updated!.blockState!.blockedAt).toBeUndefined()
      expect(updated!.blockState!.reason).toBeUndefined()

      const lastEntry = updated!.blockState!.history[updated!.blockState!.history.length - 1]
      expect(lastEntry.unblockedAt).toBeDefined()
      expect(lastEntry.unblockedAt).toBeGreaterThan(0)
      expect(lastEntry.unblockedBy).toBe('user')
    })
  })

  /**
   * Property 5: 封鎖冪等性
   * **Validates: Requirements 1.5, 15.1**
   */
  describe('Property 5: 封鎖冪等性', () => {
    beforeEach(async () => {
      await db.init()
    })

    it('對已封鎖的 Chat 再次 blockCharacter 後 BlockState 不變', async () => {
      const blockService = BlockService.getInstance()
      const now = Date.now()
      const existingHistory = [{
        id: crypto.randomUUID(),
        direction: 'user-blocked-char' as const,
        reason: '用戶主動封鎖',
        blockedAt: now,
        unblockedAt: null,
      }]

      const chat = createTestChat({
        blockState: {
          ...createDefaultBlockState(),
          status: 'user-blocked-char',
          blockedAt: now,
          reason: '用戶主動封鎖',
          history: existingHistory,
        },
      })

      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      // 記錄封鎖前的狀態
      const before = await db.get<Chat>(DB_STORES.CHATS, chat.id)
      const beforeState = JSON.parse(JSON.stringify(before!.blockState))

      // 再次封鎖
      await blockService.blockCharacter(chat.id)

      // 驗證狀態不變
      const after = await db.get<Chat>(DB_STORES.CHATS, chat.id)
      expect(after!.blockState!.status).toBe(beforeState.status)
      expect(after!.blockState!.blockedAt).toBe(beforeState.blockedAt)
      expect(after!.blockState!.history.length).toBe(beforeState.history.length)
    })
  })

  /**
   * Property 9: 好友申請接受清除封鎖
   * **Validates: Requirements 4.3**
   */
  describe('Property 9: 好友申請接受清除封鎖', () => {
    beforeEach(async () => {
      await db.init()
      setActivePinia(createPinia())
    })

    it('handleFriendRequestResult(accepted=true) 後 status 為 none，consecutiveRejections 為 0，history unblockedBy 為 friend-request-accepted', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(10),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (prevRejections, reason) => {
            const blockService = BlockService.getInstance()
            const now = Date.now()
            const chatId = crypto.randomUUID()

            const chat = createTestChat({
              id: chatId,
              blockState: {
                ...createDefaultBlockState(),
                status: 'char-blocked-user',
                blockedAt: now - 10000,
                reason,
                consecutiveRejections: prevRejections,
                history: [{
                  id: crypto.randomUUID(),
                  direction: 'char-blocked-user',
                  reason,
                  blockedAt: now - 10000,
                  unblockedAt: null,
                }],
                friendRequests: [{
                  id: crypto.randomUUID(),
                  direction: 'user-to-char',
                  message: '對不起',
                  createdAt: now - 5000,
                  result: 'pending',
                }],
              },
            })

            await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

            await blockService.handleFriendRequestResult(chatId, true, '好吧原諒你了')

            const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
            expect(updated!.blockState!.status).toBe('none')
            expect(updated!.blockState!.consecutiveRejections).toBe(0)
            expect(updated!.blockState!.blockedAt).toBeUndefined()
            expect(updated!.blockState!.reason).toBeUndefined()

            const lastHistory = updated!.blockState!.history[updated!.blockState!.history.length - 1]
            expect(lastHistory.unblockedAt).toBeDefined()
            expect(lastHistory.unblockedAt).toBeGreaterThan(0)
            expect(lastHistory.unblockedBy).toBe('friend-request-accepted')

            const resolvedReq = updated!.blockState!.friendRequests.find(r => r.result === 'accepted')
            expect(resolvedReq).toBeDefined()
            expect(resolvedReq!.responseMessage).toBe('好吧原諒你了')
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * Property 10: 好友申請拒絕遞增冷卻
   * **Validates: Requirements 4.4, 6.2**
   */
  describe('Property 10: 好友申請拒絕遞增冷卻', () => {
    beforeEach(async () => {
      await db.init()
      setActivePinia(createPinia())
    })

    it('handleFriendRequestResult(accepted=false) 後 consecutiveRejections 遞增，nextFriendRequestAt 正確計算', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(10),
          fc.string({ minLength: 1, maxLength: 30 }),
          fc.string({ minLength: 1, maxLength: 30 }),
          async (prevRejections, rejectReason, hint) => {
            const blockService = BlockService.getInstance()
            const now = Date.now()
            const chatId = crypto.randomUUID()

            const chat = createTestChat({
              id: chatId,
              blockState: {
                ...createDefaultBlockState(),
                status: 'char-blocked-user',
                blockedAt: now - 10000,
                reason: '角色生氣了',
                consecutiveRejections: prevRejections,
                history: [{
                  id: crypto.randomUUID(),
                  direction: 'char-blocked-user',
                  reason: '角色生氣了',
                  blockedAt: now - 10000,
                  unblockedAt: null,
                }],
                friendRequests: [{
                  id: crypto.randomUUID(),
                  direction: 'user-to-char',
                  message: '對不起',
                  createdAt: now - 5000,
                  result: 'pending',
                }],
              },
            })

            await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

            await blockService.handleFriendRequestResult(chatId, false, '不原諒', rejectReason, hint)

            const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
            const bs = updated!.blockState!

            // consecutiveRejections 應遞增 1
            expect(bs.consecutiveRejections).toBe(prevRejections + 1)

            // nextFriendRequestAt 應正確設定
            const expectedCooldown = calculateCooldownMs(prevRejections + 1)
            expect(bs.nextFriendRequestAt).toBeDefined()
            // 允許少量時間誤差（測試執行期間的時間差）
            expect(bs.nextFriendRequestAt!).toBeGreaterThanOrEqual(now + expectedCooldown - 1000)

            // 拒絕原因和小心聲應儲存
            const rejectedReq = bs.friendRequests.find(r => r.result === 'rejected')
            expect(rejectedReq).toBeDefined()
            expect(rejectedReq!.rejectReason).toBe(rejectReason)
            expect(rejectedReq!.hint).toBe(hint)

            // 狀態仍為 char-blocked-user
            expect(bs.status).toBe('char-blocked-user')
          }
        ),
        { numRuns: 20 }
      )
    })
  })

  /**
   * Property 11: 封鎖影響主動訊息與來電
   * **Validates: Requirements 11.1, 11.2**
   */
  it('Property 11: shouldBlockProactiveMessage 和 shouldBlockIncomingCall 在非 none 狀態回傳 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BlockState['status']>('none', 'user-blocked-char', 'char-blocked-user'),
        (status) => {
          const chat = createTestChat({
            blockState: { ...createDefaultBlockState(), status },
          })

          if (status === 'none') {
            expect(shouldBlockProactiveMessage(chat)).toBe(false)
            expect(shouldBlockIncomingCall(chat)).toBe(false)
          } else {
            expect(shouldBlockProactiveMessage(chat)).toBe(true)
            expect(shouldBlockIncomingCall(chat)).toBe(true)
          }
        }
      )
    )

    // 無 blockState 時也應回傳 false
    const chatNoState = createTestChat()
    expect(shouldBlockProactiveMessage(chatNoState)).toBe(false)
    expect(shouldBlockIncomingCall(chatNoState)).toBe(false)
  })

  /**
   * Property 12: QZone/PeekPhone 方向性過濾
   * **Validates: Requirements 11.3, 11.4, 11.5, 11.6**
   */
  it('Property 12: shouldHideFromQZone 和 shouldHideFromPeekPhone 僅在 user-blocked-char 時回傳 true', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<BlockState['status']>('none', 'user-blocked-char', 'char-blocked-user'),
        (status) => {
          const chat = createTestChat({
            blockState: { ...createDefaultBlockState(), status },
          })

          if (status === 'user-blocked-char') {
            expect(shouldHideFromQZone(chat)).toBe(true)
            expect(shouldHideFromPeekPhone(chat)).toBe(true)
          } else {
            expect(shouldHideFromQZone(chat)).toBe(false)
            expect(shouldHideFromPeekPhone(chat)).toBe(false)
          }
        }
      )
    )

    // 無 blockState 時也應回傳 false
    const chatNoState = createTestChat()
    expect(shouldHideFromQZone(chatNoState)).toBe(false)
    expect(shouldHideFromPeekPhone(chatNoState)).toBe(false)
  })

  /**
   * Property 13: BlockState 不變量
   * **Validates: Requirements 13.1, 13.2, 13.3, 13.4, 13.5, 13.6**
   */
  describe('Property 13: BlockState 不變量', () => {
    beforeEach(async () => {
      await db.init()
      setActivePinia(createPinia())
    })

    /** 驗證 BlockState 不變量 */
    function assertBlockStateInvariants(bs: BlockState): void {
      // (a) status 僅為三者之一
      expect(['none', 'user-blocked-char', 'char-blocked-user']).toContain(bs.status)

      // (b) status 為 none 時 blockedAt 和 reason 為 undefined
      if (bs.status === 'none') {
        expect(bs.blockedAt).toBeUndefined()
        expect(bs.reason).toBeUndefined()
      }

      // (c) friendRequests 中最多一筆 pending
      const pendingCount = bs.friendRequests.filter(r => r.result === 'pending').length
      expect(pendingCount).toBeLessThanOrEqual(1)

      // (d) status 不為 none 時，history 中最後一筆對應方向的 unblockedAt 為 null
      if (bs.status !== 'none') {
        const direction = bs.status
        const lastMatch = [...bs.history].reverse().find(h => h.direction === direction)
        if (lastMatch) {
          expect(lastMatch.unblockedAt).toBeNull()
        }
      }

      // (e) consecutiveRejections >= 0
      expect(bs.consecutiveRejections).toBeGreaterThanOrEqual(0)

      // (f) history 按 blockedAt 升序排列
      for (let i = 1; i < bs.history.length; i++) {
        expect(bs.history[i].blockedAt).toBeGreaterThanOrEqual(bs.history[i - 1].blockedAt)
      }
    }

    it('經過任意操作序列後 BlockState 不變量成立', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.oneof(
              fc.constant({ op: 'block' as const }),
              fc.constant({ op: 'unblock' as const }),
              fc.record({
                op: fc.constant('charBlock' as const),
                reason: fc.string({ minLength: 1, maxLength: 20 }),
              }),
              fc.constant({ op: 'charUnblock' as const }),
              fc.record({
                op: fc.constant('submitFR' as const),
                message: fc.string({ minLength: 1, maxLength: 20 }),
              }),
              fc.constant({ op: 'acceptFR' as const }),
              fc.constant({ op: 'rejectFR' as const }),
            ),
            { minLength: 1, maxLength: 8 }
          ),
          async (ops) => {
            const blockService = BlockService.getInstance()
            const chatId = crypto.randomUUID()
            const chat = createTestChat({ id: chatId, blockState: createDefaultBlockState() })
            await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

            for (const op of ops) {
              try {
                switch (op.op) {
                  case 'block':
                    await blockService.blockCharacter(chatId)
                    break
                  case 'unblock':
                    await blockService.unblockCharacter(chatId)
                    break
                  case 'charBlock':
                    await blockService.handleCharacterBlock(chatId, op.reason)
                    break
                  case 'charUnblock':
                    await blockService.handleCharacterUnblock(chatId)
                    break
                  case 'submitFR':
                    await blockService.submitFriendRequest(chatId, op.message)
                    break
                  case 'acceptFR':
                    await blockService.handleFriendRequestResult(chatId, true, '好')
                    break
                  case 'rejectFR':
                    await blockService.handleFriendRequestResult(chatId, false, '不行', '原因', '提示')
                    break
                }
              } catch {
                // 某些操作在特定狀態下會拋出錯誤（如冷卻中提交申請），這是預期行為
              }
            }

            // 驗證最終狀態的不變量
            const final = await db.get<Chat>(DB_STORES.CHATS, chatId)
            expect(final).toBeDefined()
            assertBlockStateInvariants(final!.blockState!)
          }
        ),
        { numRuns: 50 }
      )
    })
  })
})

// ===== ResponseParser CharAction 標籤解析屬性測試 =====

import { parseCharActionTags, parseFriendResponseBlock } from '@/services/ResponseParser'

/**
 * 產生不含特殊字元的安全字串（避免干擾標籤解析）
 * 排除 [、]、|、: 和換行符
 */
const safeTextArb = fc.string({ minLength: 1, maxLength: 30 })
  .map(s => s.replace(/[\[\]|:\n\r]/g, 'x'))
  .filter(s => s.trim().length > 0)

describe('ResponseParser CharAction 標籤解析屬性測試', () => {
  /**
   * Property 6: CharAction 標籤解析正確性
   * **Validates: Requirements 8.1, 8.2, 8.3, 8.6**
   */
  describe('Property 6: CharAction 標籤解析正確性', () => {
    it('block-user 標籤應正確解析 action 和 reason，且從內容中移除', () => {
      fc.assert(
        fc.property(safeTextArb, safeTextArb, (reason, surrounding) => {
          const tag = `[char-action:block-user|reason:${reason}]`
          const input = `${surrounding}${tag}${surrounding}`

          const { actions, cleanContent } = parseCharActionTags(input)

          expect(actions.length).toBe(1)
          expect(actions[0].action).toBe('block-user')
          // 解析器會 trim 參數值
          expect(actions[0].reason).toBe(reason.trim())
          // 標籤應從內容中移除
          expect(cleanContent).not.toContain('[char-action:')
          // cleanContent 應為移除標籤後的文字（trim 後）
          expect(cleanContent).toBe(`${surrounding}${surrounding}`.trim())
        })
      )
    })

    it('unblock-user 標籤應正確解析且從內容中移除', () => {
      fc.assert(
        fc.property(safeTextArb, (surrounding) => {
          const tag = '[char-action:unblock-user]'
          const input = `${surrounding}${tag}${surrounding}`

          const { actions, cleanContent } = parseCharActionTags(input)

          expect(actions.length).toBe(1)
          expect(actions[0].action).toBe('unblock-user')
          expect(cleanContent).not.toContain('[char-action:')
        })
      )
    })

    it('apology-food 標籤應正確解析 item 和 message，且從內容中移除', () => {
      fc.assert(
        fc.property(safeTextArb, safeTextArb, safeTextArb, (item, message, surrounding) => {
          const tag = `[char-action:apology-food|item:${item}|message:${message}]`
          const input = `${surrounding}${tag}${surrounding}`

          const { actions, cleanContent } = parseCharActionTags(input)

          expect(actions.length).toBe(1)
          expect(actions[0].action).toBe('apology-food')
          // 解析器會 trim 參數值
          expect(actions[0].item).toBe(item.trim())
          expect(actions[0].message).toBe(message.trim())
          expect(cleanContent).not.toContain('[char-action:')
        })
      )
    })
  })

  /**
   * Property 7: 好友申請 YAML 解析正確性
   * **Validates: Requirements 6.1, 8.5**
   */
  describe('Property 7: 好友申請 YAML 解析正確性', () => {
    it('accept: y 的 friend-response 區塊應正確解析', () => {
      fc.assert(
        fc.property(safeTextArb, (reply) => {
          const block = `[char-action:friend-response]\naccept: y\nreply: ${reply}\n[/char-action:friend-response]`

          const { response, cleanContent } = parseFriendResponseBlock(block)

          expect(response).not.toBeNull()
          expect(response!.action).toBe('friend-response')
          expect(response!.accept).toBe(true)
          expect(response!.reply).toBe(reply.trim())
          expect(cleanContent).not.toContain('[char-action:friend-response]')
        })
      )
    })

    it('accept: n 的 friend-response 區塊應正確解析 reason 和 hint', () => {
      fc.assert(
        fc.property(safeTextArb, safeTextArb, safeTextArb, (reply, reason, hint) => {
          const block = [
            '[char-action:friend-response]',
            `accept: n`,
            `reply: ${reply}`,
            `reason: ${reason}`,
            `hint: ${hint}`,
            '[/char-action:friend-response]',
          ].join('\n')

          const { response, cleanContent } = parseFriendResponseBlock(block)

          expect(response).not.toBeNull()
          expect(response!.action).toBe('friend-response')
          expect(response!.accept).toBe(false)
          expect(response!.reply).toBe(reply.trim())
          expect(response!.rejectReason).toBe(reason.trim())
          expect(response!.hint).toBe(hint.trim())
          expect(cleanContent).not.toContain('[/char-action:friend-response]')
        })
      )
    })
  })

  /**
   * Property 8: 無效標籤容錯性
   * **Validates: Requirements 8.4, 15.2**
   */
  describe('Property 8: 無效標籤容錯性', () => {
    it('格式錯誤的 char-action 標籤應回傳空陣列且不拋出錯誤', () => {
      fc.assert(
        fc.property(fc.string({ minLength: 0, maxLength: 200 }), (randomStr) => {
          // 確保輸入不包含有效的 char-action 標籤
          const input = randomStr
            .replace(/\[char-action:/g, '(char-action:')
            .replace(/\[\/char-action:/g, '(/char-action:')

          expect(() => {
            const { actions } = parseCharActionTags(input)
            expect(actions.length).toBe(0)
          }).not.toThrow()

          expect(() => {
            const { response } = parseFriendResponseBlock(input)
            expect(response).toBeNull()
          }).not.toThrow()
        })
      )
    })

    it('無效的 action 類型應被忽略', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 20 }).filter(s => !VALID_ACTION_TYPES.has(s) && !/[\[\]|]/.test(s)),
          (invalidAction) => {
            const input = `[char-action:${invalidAction}]`
            const { actions } = parseCharActionTags(input)
            expect(actions.length).toBe(0)
          }
        )
      )
    })

    it('缺少 accept 欄位的 friend-response 區塊應回傳 null', () => {
      fc.assert(
        fc.property(safeTextArb, (reply) => {
          const block = `[char-action:friend-response]\nreply: ${reply}\n[/char-action:friend-response]`
          const { response } = parseFriendResponseBlock(block)
          expect(response).toBeNull()
        })
      )
    })
  })
})

/** 用於 Property 8 驗證的有效動作類型集合 */
const VALID_ACTION_TYPES = new Set(['block-user', 'unblock-user', 'apology-food'])


// ===== ApologyFoodService 屬性測試 =====

import ApologyFoodService from '@/services/ApologyFoodService'
import { WAIMAI_CATALOG, getWaimaiCatalogItemById } from '@/data/waimaiCatalog'

describe('ApologyFoodService 屬性測試', () => {
  beforeEach(async () => {
    await db.init()
    setActivePinia(createPinia())
  })

  /**
   * Property 15: 道歉外賣食物替代
   * **Validates: Requirements 12.2, 15.3**
   */
  it('Property 15: 不存在的食物 ID 應使用目錄中的有效食物建立訂單', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 產生不存在於 waimaiCatalog 的食物 ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(id => !getWaimaiCatalogItemById(id)),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (fakeItemId, message) => {
          const service = ApologyFoodService.getInstance()
          service.stopAll()

          const chatId = crypto.randomUUID()
          const characterId = 'test-char-id'

          // 建立測試 Chat
          const chat = createTestChat({
            id: chatId,
            characterId,
            blockState: createDefaultBlockState(),
          })
          await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

          await service.handleApologyFood(chatId, characterId, fakeItemId, message)

          // 驗證訂單已建立且使用有效的替代食物
          const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
          const orders = updated?.blockState?.apologyFoodOrders ?? []
          expect(orders.length).toBe(1)

          const order = orders[0]
          // 訂單的 itemId 應對應目錄中的真實食物
          const catalogItem = WAIMAI_CATALOG.find(i => i.id === order.itemId)
          expect(catalogItem).toBeDefined()
          // itemName 和 itemImageUrl 應對應目錄中的真實食物
          expect(order.itemName).toBe(catalogItem!.name)
          expect(order.itemImageUrl).toBe(catalogItem!.imageUrl)
          // 狀態應為 preparing
          expect(order.status).toBe('preparing')

          // 清理計時器
          service.stopAll()
        }
      ),
      { numRuns: 20 }
    )
  })
})


// ===== PromptBuilder 封鎖記憶注入屬性測試 =====

import { buildBlockMemoryContent } from '@/data/defaultPrompts/block'

describe('PromptBuilder 封鎖記憶注入屬性測試', () => {
  /**
   * Property 14: 封鎖記憶注入存在性
   * **Validates: Requirements 9.1, 9.2**
   */
  describe('Property 14: 封鎖記憶注入存在性', () => {
    it('有封鎖狀態（status 不為 none）時應回傳非 null 字串', () => {
      fc.assert(
        fc.property(
          fc.constantFrom<BlockState['status']>('user-blocked-char', 'char-blocked-user'),
          fc.nat(10),
          (status, historyCount) => {
            const direction = status as BlockDirection
            const blockState: BlockState = {
              ...createDefaultBlockState(),
              status,
              blockedAt: Date.now() - 10000,
              reason: '測試原因',
              history: Array.from({ length: historyCount }, (_, i) => ({
                id: `h-${i}`,
                direction,
                reason: `原因${i}`,
                blockedAt: Date.now() - (historyCount - i) * 1000,
                unblockedAt: i < historyCount - 1 ? Date.now() - (historyCount - i) * 500 : null,
              })),
            }

            const result = buildBlockMemoryContent(blockState, [])
            expect(result).not.toBeNull()
            expect(typeof result).toBe('string')
            expect(result!.length).toBeGreaterThan(0)
          }
        )
      )
    })

    it('有封鎖歷史（history.length > 0）但 status 為 none 時應回傳非 null 字串', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          (historyCount) => {
            const blockState: BlockState = {
              ...createDefaultBlockState(),
              status: 'none',
              history: Array.from({ length: historyCount }, (_, i) => ({
                id: `h-${i}`,
                direction: 'user-blocked-char' as const,
                reason: `原因${i}`,
                blockedAt: Date.now() - (historyCount - i) * 10000,
                unblockedAt: Date.now() - (historyCount - i) * 5000,
                unblockedBy: 'user' as const,
              })),
            }

            const result = buildBlockMemoryContent(blockState, [])
            expect(result).not.toBeNull()
            expect(result!).toContain('[封鎖歷史]')
          }
        )
      )
    })

    it('無封鎖狀態且無歷史時應回傳 null', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // 測試 undefined blockState
          expect(buildBlockMemoryContent(undefined, [])).toBeNull()

          // 測試 status 為 none 且無歷史
          const defaultState = createDefaultBlockState()
          expect(buildBlockMemoryContent(defaultState, [])).toBeNull()
        })
      )
    })

    it('封鎖歷史最多包含 5 筆，好友申請記錄最多包含 5 筆', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 6, max: 20 }),
          fc.integer({ min: 6, max: 20 }),
          (historyCount, requestCount) => {
            const blockState: BlockState = {
              ...createDefaultBlockState(),
              status: 'char-blocked-user',
              blockedAt: Date.now(),
              reason: '測試',
              history: Array.from({ length: historyCount }, (_, i) => ({
                id: `h-${i}`,
                direction: 'char-blocked-user' as const,
                reason: `歷史原因${i}`,
                blockedAt: Date.now() - (historyCount - i) * 10000,
                unblockedAt: i < historyCount - 1 ? Date.now() - (historyCount - i) * 5000 : null,
              })),
              friendRequests: Array.from({ length: requestCount }, (_, i) => ({
                id: `fr-${i}`,
                direction: 'user-to-char' as const,
                message: `申請訊息${i}`,
                createdAt: Date.now() - (requestCount - i) * 10000,
                result: 'rejected' as const,
                rejectReason: `拒絕原因${i}`,
                hint: `提示${i}`,
              })),
            }

            const result = buildBlockMemoryContent(blockState, [])
            expect(result).not.toBeNull()

            // 驗證歷史條目最多 5 筆（計算 [封鎖歷史] 區段中的 - 開頭行數）
            const historySection = result!.split('[好友申請記錄]')[0]
            const historyLines = historySection.split('\n').filter(l => l.startsWith('- '))
            expect(historyLines.length).toBeLessThanOrEqual(5)

            // 驗證好友申請記錄最多 5 筆
            const requestSection = result!.split('[好友申請記錄]')[1] || ''
            const requestLines = requestSection.split('\n').filter(l => l.startsWith('- '))
            expect(requestLines.length).toBeLessThanOrEqual(5)
          }
        )
      )
    })

    it('封鎖期間獨白訊息最多包含 10 筆', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 11, max: 30 }),
          (msgCount) => {
            const blockState: BlockState = {
              ...createDefaultBlockState(),
              status: 'user-blocked-char',
              blockedAt: Date.now(),
              reason: '測試',
            }

            const monologues = Array.from({ length: msgCount }, (_, i) => ({
              content: `獨白訊息${i}`,
              createdAt: Date.now() - (msgCount - i) * 1000,
            }))

            const result = buildBlockMemoryContent(blockState, monologues)
            expect(result).not.toBeNull()

            // 驗證獨白訊息最多 10 筆
            const monologueSection = result!.split('[封鎖期間 {{user}} 的獨白]')[1] || ''
            const monologueLines = monologueSection.split('\n').filter(l => l.startsWith('- '))
            expect(monologueLines.length).toBeLessThanOrEqual(10)
          }
        )
      )
    })
  })
})


// ===== BlockService 輪詢機制屬性測試 =====

describe('BlockService 輪詢機制屬性測試', () => {
  beforeEach(async () => {
    await db.init()
    setActivePinia(createPinia())
  })

  /**
   * Property 16: 輪詢正確識別可申請角色
   * **Validates: Requirements 7.1, 7.2**
   */
  it('Property 16: checkBlockedCharacters 僅對 status 為 user-blocked-char 且冷卻已到期且無 pending 申請的 Chat 觸發好友申請', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 產生一組不同封鎖狀態的 Chat 配置
        fc.array(
          fc.record({
            status: fc.constantFrom<BlockState['status']>('none', 'user-blocked-char', 'char-blocked-user'),
            cooldownExpired: fc.boolean(),
            hasPending: fc.boolean(),
          }),
          { minLength: 1, maxLength: 6 }
        ),
        async (chatConfigs) => {
          const blockService = BlockService.getInstance()
          const now = Date.now()
          const chatIds: string[] = []

          // 建立測試 Chat 集合
          for (const config of chatConfigs) {
            const chatId = crypto.randomUUID()
            chatIds.push(chatId)

            const blockState: BlockState = {
              ...createDefaultBlockState(),
              status: config.status,
              blockedAt: config.status !== 'none' ? now - 60000 : undefined,
              reason: config.status !== 'none' ? '測試' : undefined,
              // 冷卻到期：nextFriendRequestAt 設為過去；未到期：設為未來
              nextFriendRequestAt: config.cooldownExpired ? now - 10000 : now + 999999,
              friendRequests: config.hasPending ? [{
                id: crypto.randomUUID(),
                direction: 'char-to-user' as const,
                message: '測試申請',
                createdAt: now - 5000,
                result: 'pending' as const,
              }] : [],
            }

            // 如果 status 不為 none，需要有對應的 history
            if (config.status !== 'none') {
              blockState.history.push({
                id: crypto.randomUUID(),
                direction: config.status as BlockDirection,
                reason: '測試',
                blockedAt: now - 60000,
                unblockedAt: null,
              })
            }

            const chat = createTestChat({
              id: chatId,
              characterId: `char-${chatId}`,
              blockState,
            })
            await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))
          }

          // 記錄每個 Chat 執行前的 friendRequests 數量
          const beforeCounts: Map<string, number> = new Map()
          for (const chatId of chatIds) {
            const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
            beforeCounts.set(chatId, chat!.blockState!.friendRequests.length)
          }

          // 執行輪詢
          await blockService.checkBlockedCharacters()

          // 驗證結果
          for (let i = 0; i < chatConfigs.length; i++) {
            const config = chatConfigs[i]
            const chatId = chatIds[i]
            const updated = await db.get<Chat>(DB_STORES.CHATS, chatId)
            const beforeCount = beforeCounts.get(chatId)!
            const afterCount = updated!.blockState!.friendRequests.length

            const shouldTrigger =
              config.status === 'user-blocked-char' &&
              config.cooldownExpired &&
              !config.hasPending

            if (shouldTrigger) {
              // 應新增一筆 char-to-user 的 pending 好友申請
              expect(afterCount).toBe(beforeCount + 1)
              const newReq = updated!.blockState!.friendRequests[afterCount - 1]
              expect(newReq.direction).toBe('char-to-user')
              expect(newReq.result).toBe('pending')
            } else {
              // 不應新增好友申請
              expect(afterCount).toBe(beforeCount)
            }
          }
        }
      ),
      { numRuns: 30 }
    )
  })
})
