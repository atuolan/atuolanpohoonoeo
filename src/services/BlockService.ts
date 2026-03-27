/**
 * 封鎖系統核心服務
 * 管理封鎖狀態的讀寫與副作用觸發
 */

import type { Chat, ChatMessage } from '@/types/chat'
import type { BlockState, BlockHistoryEntry, FriendRequest } from '@/types/block'
import { createDefaultBlockState } from '@/types/block'
import { db, DB_STORES } from '@/db/database'
import type { FriendRequest as FriendRequestType } from '@/types/block'

/** 輪詢間隔：每 15 分鐘檢查一次被封鎖角色 */
export const BLOCK_POLL_INTERVAL_MS = 15 * 60 * 1000

/**
 * 冷卻時間遞增策略
 * 第 0 次拒絕後：10 分鐘
 * 第 1 次拒絕後：30 分鐘
 * 第 2 次拒絕後：2 小時
 * 第 3 次拒絕後：6 小時
 * 第 4+ 次拒絕後：24 小時
 */
const COOLDOWN_TIERS_MS = [
  10 * 60 * 1000,       // 10 分鐘
  30 * 60 * 1000,       // 30 分鐘
  2 * 60 * 60 * 1000,   // 2 小時
  6 * 60 * 60 * 1000,   // 6 小時
  24 * 60 * 60 * 1000,  // 24 小時
] as const

/**
 * 根據連續拒絕次數計算冷卻時間（毫秒）
 * 前置條件：consecutiveRejections >= 0
 * 後置條件：回傳值介於 600000（10 分鐘）至 86400000（24 小時）之間
 */
export function calculateCooldownMs(consecutiveRejections: number): number {
  const tier = Math.min(consecutiveRejections, COOLDOWN_TIERS_MS.length - 1)
  return COOLDOWN_TIERS_MS[tier]
}

/** 檢查是否應攔截主動訊息 */
export function shouldBlockProactiveMessage(chat: Chat): boolean {
  const blockState = chat.blockState
  if (!blockState) return false
  return blockState.status !== 'none'
}

/** 檢查是否應攔截來電 */
export function shouldBlockIncomingCall(chat: Chat): boolean {
  const blockState = chat.blockState
  if (!blockState) return false
  return blockState.status !== 'none'
}

/** 檢查是否應在 QZone 隱藏該角色（僅用戶封鎖角色時隱藏） */
export function shouldHideFromQZone(chat: Chat): boolean {
  const blockState = chat.blockState
  if (!blockState) return false
  return blockState.status === 'user-blocked-char'
}

/** 檢查是否應在 Peek Phone 隱藏該角色（僅用戶封鎖角色時隱藏） */
export function shouldHideFromPeekPhone(chat: Chat): boolean {
  const blockState = chat.blockState
  if (!blockState) return false
  return blockState.status === 'user-blocked-char'
}


class BlockService {
  private static instance: BlockService
  private pollTimer: ReturnType<typeof setInterval> | null = null

  static getInstance(): BlockService {
    if (!BlockService.instance) {
      BlockService.instance = new BlockService()
    }
    return BlockService.instance
  }

  // ============================================================
  // 輪詢機制
  // ============================================================

  /** 啟動被封鎖角色輪詢（每 15 分鐘檢查一次，啟動時立即執行一次） */
  startBlockPolling(): void {
    // 避免重複啟動
    this.stopBlockPolling()
    // 立即執行一次
    this.checkBlockedCharacters().catch(err => {
      console.error('[BlockService] 輪詢檢查失敗:', err)
    })
    // 每 15 分鐘輪詢
    this.pollTimer = setInterval(() => {
      this.checkBlockedCharacters().catch(err => {
        console.error('[BlockService] 輪詢檢查失敗:', err)
      })
    }, BLOCK_POLL_INTERVAL_MS)
    console.log('[BlockService] 已啟動被封鎖角色輪詢')
  }

  /** 停止輪詢 */
  stopBlockPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
      console.log('[BlockService] 已停止被封鎖角色輪詢')
    }
  }

  /**
   * 檢查所有被用戶封鎖的角色，對符合條件者建立角色向用戶的好友申請記錄
   * 條件：status 為 'user-blocked-char'、冷卻已到期、無 pending 申請
   */
  async checkBlockedCharacters(): Promise<void> {
    const now = Date.now()
    const allChats = await db.getAll<Chat>(DB_STORES.CHATS)
    const blockedChats = allChats.filter(c => c.blockState?.status === 'user-blocked-char')

    for (const chat of blockedChats) {
      const blockState = chat.blockState!

      // 跳過已有 pending 申請的
      if (blockState.friendRequests.some(r => r.result === 'pending')) continue

      // 檢查冷卻是否到期
      const nextAt = blockState.nextFriendRequestAt ?? blockState.blockedAt ?? 0
      if (now < nextAt) continue

      // 建立角色向用戶的好友申請記錄（AI 生成由呼叫端處理）
      const request: FriendRequestType = {
        id: crypto.randomUUID(),
        direction: 'char-to-user',
        message: '',
        createdAt: now,
        result: 'pending',
      }

      blockState.friendRequests.push(request)
      chat.blockState = blockState
      chat.updatedAt = now
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

      console.log(`[BlockService] 已為角色 ${chat.characterId} 建立好友申請記錄`)
    }
  }

  // ============================================================
  // 查詢方法
  // ============================================================

  /** 取得封鎖狀態 */
  getBlockState(chat: Chat): BlockState | undefined {
    return chat.blockState
  }

  /** 檢查是否被封鎖（任一方向） */
  isBlocked(chat: Chat): boolean {
    const blockState = chat.blockState
    if (!blockState) return false
    return blockState.status !== 'none'
  }

  /** 檢查用戶是否封鎖了角色 */
  isUserBlockedChar(chat: Chat): boolean {
    const blockState = chat.blockState
    if (!blockState) return false
    return blockState.status === 'user-blocked-char'
  }

  /** 檢查角色是否封鎖了用戶 */
  isCharBlockedUser(chat: Chat): boolean {
    const blockState = chat.blockState
    if (!blockState) return false
    return blockState.status === 'char-blocked-user'
  }

  /** 取得封鎖歷史 */
  getBlockHistory(chat: Chat): BlockHistoryEntry[] {
    return chat.blockState?.history ?? []
  }

  /** 計算好友申請冷卻剩餘時間（毫秒），0 表示已到期 */
  getFriendRequestCooldown(chat: Chat): number {
    const blockState = chat.blockState
    if (!blockState?.nextFriendRequestAt) return 0
    const remaining = blockState.nextFriendRequestAt - Date.now()
    return remaining > 0 ? remaining : 0
  }

  /** 取得封鎖期間用戶發送的訊息 */
  getMessagesWhileBlocked(chat: Chat): ChatMessage[] {
    return (chat.messages ?? []).filter(m => m.sentWhileBlocked === true)
  }

  // ============================================================
  // 封鎖 / 解封操作
  // ============================================================

  /** 用戶封鎖角色（冪等：已封鎖時靜默忽略） */
  async blockCharacter(chatId: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) throw new Error('Chat not found')

    const blockState = chat.blockState ?? createDefaultBlockState()

    // 冪等性：已封鎖時靜默忽略
    if (blockState.status === 'user-blocked-char') return

    const now = Date.now()

    // 更新封鎖狀態
    blockState.status = 'user-blocked-char'
    blockState.blockedAt = now
    blockState.reason = '用戶主動封鎖'

    // 記錄歷史
    blockState.history.push({
      id: crypto.randomUUID(),
      direction: 'user-blocked-char',
      reason: '用戶主動封鎖',
      blockedAt: now,
      unblockedAt: null,
    })

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

    // TODO: Task 9.3 - 整合 ProactiveMessageService，停止該角色主動訊息
  }

  /** 用戶解除封鎖角色 */
  async unblockCharacter(chatId: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) throw new Error('Chat not found')

    const blockState = chat.blockState
    if (!blockState || blockState.status !== 'user-blocked-char') return

    const now = Date.now()

    // 更新歷史中最後一筆 user-blocked-char 的解封時間
    const lastEntry = [...blockState.history]
      .reverse()
      .find(h => h.direction === 'user-blocked-char' && h.unblockedAt === null)
    if (lastEntry) {
      lastEntry.unblockedAt = now
      lastEntry.unblockedBy = 'user'
    }

    // 恢復狀態
    blockState.status = 'none'
    blockState.blockedAt = undefined
    blockState.reason = undefined

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

    // TODO: Task 9.3 - 整合 ProactiveMessageService，恢復該角色主動訊息
  }

  // ============================================================
  // 角色封鎖 / 解封用戶
  // ============================================================

  /** 角色封鎖用戶（由 ResponseParser 觸發） */
  async handleCharacterBlock(chatId: string, reason: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) throw new Error('Chat not found')

    const blockState = chat.blockState ?? createDefaultBlockState()
    const now = Date.now()

    // 更新封鎖狀態
    blockState.status = 'char-blocked-user'
    blockState.blockedAt = now
    blockState.reason = reason
    blockState.consecutiveRejections = 0
    blockState.nextFriendRequestAt = undefined

    // 記錄歷史
    blockState.history.push({
      id: crypto.randomUUID(),
      direction: 'char-blocked-user',
      reason,
      blockedAt: now,
      unblockedAt: null,
    })

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

    // 發送通知（在方法內部匯入，避免 Pinia 初始化順序問題）
    const { useNotificationStore } = await import('@/stores/notification')
    const notificationStore = useNotificationStore()
    notificationStore.addNotification({
      type: 'char_blocked',
      title: '被封鎖',
      message: `${chat.name} 封鎖了你：${reason}`,
      characterId: chat.characterId,
      chatId,
      priority: 'high',
    })
  }

  /** 角色解除封鎖用戶 */
  async handleCharacterUnblock(chatId: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) throw new Error('Chat not found')

    const blockState = chat.blockState
    if (!blockState || blockState.status !== 'char-blocked-user') return

    const now = Date.now()

    // 更新歷史中最後一筆 char-blocked-user 的解封時間
    const lastEntry = [...blockState.history]
      .reverse()
      .find(h => h.direction === 'char-blocked-user' && h.unblockedAt === null)
    if (lastEntry) {
      lastEntry.unblockedAt = now
      lastEntry.unblockedBy = 'character'
    }

    // 恢復狀態
    blockState.status = 'none'
    blockState.blockedAt = undefined
    blockState.reason = undefined

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))

    // 發送通知
    const { useNotificationStore } = await import('@/stores/notification')
    const notificationStore = useNotificationStore()
    notificationStore.addNotification({
      type: 'char_unblocked',
      title: '已解除封鎖',
      message: `${chat.name} 解除了對你的封鎖`,
      characterId: chat.characterId,
      chatId,
      priority: 'normal',
    })
  }

  // ============================================================
  // 好友申請
  // ============================================================

  /** 提交好友申請（用戶向角色） */
  async submitFriendRequest(chatId: string, message: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat) throw new Error('Chat not found')

    const blockState = chat.blockState
    if (!blockState || blockState.status !== 'char-blocked-user') {
      throw new Error('Cannot submit friend request: not blocked by character')
    }

    // 檢查冷卻
    const now = Date.now()
    if (blockState.nextFriendRequestAt && now < blockState.nextFriendRequestAt) {
      throw new Error('Friend request on cooldown')
    }

    // 若已有 pending 申請，直接更新訊息內容（允許用戶重新措辭）
    const existingPending = blockState.friendRequests.find(r => r.result === 'pending')
    if (existingPending) {
      existingPending.message = message
      existingPending.createdAt = now
      chat.blockState = blockState
      chat.updatedAt = now
      await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))
      return
    }

    // 建立新申請
    const request: FriendRequest = {
      id: crypto.randomUUID(),
      direction: 'user-to-char',
      message,
      createdAt: now,
      result: 'pending',
    }

    blockState.friendRequests.push(request)

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))
  }

  /** 處理好友申請結果（由 ResponseParser 觸發） */
  async handleFriendRequestResult(
    chatId: string,
    accepted: boolean,
    aiMessage?: string,
    rejectReason?: string,
    hint?: string
  ): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat?.blockState) return

    const blockState = chat.blockState
    const pendingRequest = blockState.friendRequests.find(r => r.result === 'pending')
    if (!pendingRequest) return

    const now = Date.now()

    // 更新申請結果
    pendingRequest.result = accepted ? 'accepted' : 'rejected'
    pendingRequest.responseMessage = aiMessage
    pendingRequest.rejectReason = rejectReason
    pendingRequest.hint = hint
    pendingRequest.resolvedAt = now

    if (accepted) {
      // 解除封鎖
      const activeBlock = blockState.history.find(
        h => h.direction === 'char-blocked-user' && h.unblockedAt === null
      )
      if (activeBlock) {
        activeBlock.unblockedAt = now
        activeBlock.unblockedBy = 'friend-request-accepted'
      }
      blockState.status = 'none'
      blockState.reason = undefined
      blockState.blockedAt = undefined
      blockState.consecutiveRejections = 0
      blockState.nextFriendRequestAt = undefined
    } else {
      // 遞增冷卻
      blockState.consecutiveRejections += 1
      const cooldown = calculateCooldownMs(blockState.consecutiveRejections)
      blockState.nextFriendRequestAt = now + cooldown
    }

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))
  }

  /** 用戶拒絕角色好友申請（帶拒絕原因） */
  async rejectCharFriendRequest(chatId: string, requestId: string, reason: string): Promise<void> {
    const chat = await db.get<Chat>(DB_STORES.CHATS, chatId)
    if (!chat?.blockState) return

    const blockState = chat.blockState
    const request = blockState.friendRequests.find(
      r => r.id === requestId && r.direction === 'char-to-user' && r.result === 'pending'
    )
    if (!request) return

    const now = Date.now()

    // 設定拒絕結果
    request.result = 'rejected'
    request.rejectReason = reason
    request.resolvedAt = now

    // 持久化
    chat.blockState = blockState
    chat.updatedAt = now
    await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)))
  }
}

export default BlockService
