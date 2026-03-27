/**
 * 封鎖系統類型定義
 * 管理角色與用戶之間的雙向封鎖機制
 */

/** 封鎖方向 */
export type BlockDirection = 'user-blocked-char' | 'char-blocked-user'

/** 封鎖歷史條目 */
export interface BlockHistoryEntry {
  /** 唯一 ID */
  id: string
  /** 封鎖方向 */
  direction: BlockDirection
  /** 封鎖原因 */
  reason: string
  /** 封鎖時間 */
  blockedAt: number
  /** 解封時間（null 表示仍在封鎖中） */
  unblockedAt: number | null
  /** 解封方式 */
  unblockedBy?: 'user' | 'character' | 'friend-request-accepted'
}

/** 好友申請記錄 */
export interface FriendRequest {
  /** 唯一 ID */
  id: string
  /** 申請方向：user-to-char 或 char-to-user */
  direction: 'user-to-char' | 'char-to-user'
  /** 申請訊息（用戶寫的話 / 角色的申請理由） */
  message: string
  /** 申請時間 */
  createdAt: number
  /** 結果 */
  result: 'pending' | 'accepted' | 'rejected'
  /** 回覆訊息（接受/拒絕時的回應） */
  responseMessage?: string
  /** 拒絕原因（用戶拒絕角色申請時填寫 / 角色拒絕用戶申請時 AI 生成） */
  rejectReason?: string
  /** 隱藏小心聲（AI 生成，提示用戶怎麼做角色會高興一點，僅拒絕時存在） */
  hint?: string
  /** 結果時間 */
  resolvedAt?: number
}

/** 道歉外賣訂單 */
export interface ApologyFoodOrder {
  /** 唯一 ID */
  id: string
  /** 角色 ID */
  characterId: string
  /** 食物項目 ID（對應 waimaiCatalog） */
  itemId: string
  /** 食物名稱（快照） */
  itemName: string
  /** 食物圖片（快照） */
  itemImageUrl: string
  /** 角色留言 */
  message: string
  /** 下單時間 */
  createdAt: number
  /** 預計送達時間 */
  estimatedDeliveryAt: number
  /** 實際送達時間 */
  deliveredAt?: number
  /** 狀態 */
  status: 'preparing' | 'delivering' | 'delivered'
}

/** 封鎖狀態（嵌入 Chat 物件） */
export interface BlockState {
  /** 當前封鎖狀態 */
  status: 'none' | 'user-blocked-char' | 'char-blocked-user'
  /** 封鎖原因（角色封鎖時由 AI 提供） */
  reason?: string
  /** 封鎖時間 */
  blockedAt?: number
  /** 封鎖歷史 */
  history: BlockHistoryEntry[]
  /** 好友申請記錄 */
  friendRequests: FriendRequest[]
  /** 道歉外賣記錄 */
  apologyFoodOrders: ApologyFoodOrder[]
  /** 連續拒絕次數（用於計算冷卻時間） */
  consecutiveRejections: number
  /** 下次可提交好友申請的時間 */
  nextFriendRequestAt?: number
}

/** 建立預設封鎖狀態 */
export const createDefaultBlockState = (): BlockState => ({
  status: 'none',
  history: [],
  friendRequests: [],
  apologyFoodOrders: [],
  consecutiveRejections: 0,
})
