/**
 * 雲端推送鬧鐘 — API 客戶端
 * 與 Cloudflare Worker (push.aguacloud.uk) 通訊
 */

import type {
  CloudPushSyncPayload,
  CloudPushSyncResponse,
  CloudPushStatus,
  CloudPushMessagesResponse,
  CloudPushMessage,
} from '@/types/cloudPush'

const PUSH_API = 'https://push.aguacloud.uk'

/** 取得用戶 ID（優先 Discord，降級到裝置指紋） */
async function getUserId(): Promise<string> {
  const { useAuthStore } = await import('@/stores/auth')
  const authStore = useAuthStore()
  if (authStore.discordUserId) {
    return authStore.discordUserId
  }
  const { DeviceFingerprintCollector } = await import('@/utils/deviceFingerprint')
  const fp = await DeviceFingerprintCollector.generate()
  return fp.fingerprint
}

/** 通用請求封裝 */
async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const userId = await getUserId()
  const headers: Record<string, string> = {
    'X-User-Id': userId,
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
  }

  const res = await fetch(`${PUSH_API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`雲端推送 API 錯誤 (${res.status}): ${text}`)
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as T
  }

  return res.json()
}

/** 同步設定到雲端 */
export async function syncConfig(
  payload: CloudPushSyncPayload,
): Promise<CloudPushSyncResponse> {
  return request<CloudPushSyncResponse>('POST', '/push/sync', payload)
}

/** 查詢雲端狀態 */
export async function getStatus(): Promise<CloudPushStatus> {
  return request<CloudPushStatus>('GET', '/push/status')
}

/** 拉取離線訊息 */
export async function pullMessages(): Promise<CloudPushMessage[]> {
  const res = await request<CloudPushMessagesResponse>('GET', '/push/messages')
  return res.messages
}

/** 確認已讀（清空 DO 暫存） */
export async function ackMessages(): Promise<void> {
  await request<void>('POST', '/push/ack')
}

/** 停用雲端推送 */
export async function disable(): Promise<void> {
  await request<void>('POST', '/push/disable')
}

/** 測試推送（觸發一次立即推送） */
export async function testPush(): Promise<void> {
  await request<void>('POST', '/push/test')
}

/** 註冊 Web Push 訂閱到雲端 Worker */
export async function subscribePush(
  subscription: PushSubscriptionJSON,
): Promise<void> {
  await request<void>('POST', '/push/subscribe', { subscription })
}

// ─── Web Push 瀏覽器端訂閱 ───────────────────────────────────

/** VAPID application server key（與 Worker wrangler.jsonc 中的 VAPID_PUBLIC_KEY 一致） */
export const VAPID_PUBLIC_KEY =
  'BC9kFWuWWwv2HrZFPWShaqI8u5k61EwgdUowt2wavMO5JD_HXbGVGk7RQiXDGueT9pltMsThHo7-15zZ6dXPqvM'

/**
 * 將 base64url 編碼的 VAPID public key 轉成 Uint8Array
 * （PushManager.subscribe 需要 applicationServerKey 為 ArrayBuffer）
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * 在瀏覽器端訂閱 Web Push 並將 subscription 送到雲端 Worker
 * @returns PushSubscription 或 null（不支援 / 權限被拒）
 */
export async function subscribeWebPush(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('[CloudPush] 此瀏覽器不支援 Web Push')
    return null
  }

  // 確保通知權限
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    console.warn('[CloudPush] 通知權限未授予:', permission)
    return null
  }

  const registration = await navigator.serviceWorker.ready

  // 檢查是否已有訂閱
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    // 建立新訂閱
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    })
  }

  // 將訂閱資訊送到雲端 Worker
  const json = subscription.toJSON()
  await subscribePush(json)

  console.log('[CloudPush] Web Push 訂閱成功')
  return subscription
}

/**
 * 取消 Web Push 訂閱
 */
export async function unsubscribeWebPush(): Promise<void> {
  if (!('serviceWorker' in navigator)) return

  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription) {
    await subscription.unsubscribe()
    console.log('[CloudPush] Web Push 訂閱已取消')
  }
}

/**
 * 取得當前 Web Push 訂閱狀態
 */
export async function getWebPushSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null
  }
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}
