/**
 * 封鎖系統相關提示詞模板
 * 用於 PromptBuilder 注入封鎖記憶至 AI 上下文
 */

import dayjs from 'dayjs'
import type { BlockState, BlockHistoryEntry, FriendRequest } from '@/types/block'

/** 格式化時間戳為可讀字串 */
function formatTime(ts: number | undefined | null): string {
  if (!ts) return '未知時間'
  return dayjs(ts).format('YYYY-MM-DD HH:mm')
}

/**
 * 建構封鎖記憶提示詞
 * 當 Chat 存在封鎖狀態或封鎖歷史時，注入 AI 上下文讓角色自然反映封鎖歷史與情感變化
 *
 * @param blockState - 封鎖狀態物件
 * @param monologueMessages - 封鎖期間用戶的獨白訊息（sentWhileBlocked && is_user）
 * @returns 封鎖記憶提示詞字串，無封鎖狀態且無歷史時回傳 null
 */
export function buildBlockMemoryContent(
  blockState: BlockState | undefined,
  monologueMessages: Array<{ content: string; createdAt: number }>,
): string | null {
  if (!blockState || (blockState.status === 'none' && blockState.history.length === 0)) {
    return null
  }

  const parts: string[] = []

  // 當前封鎖狀態描述
  if (blockState.status === 'user-blocked-char') {
    parts.push(
      `[封鎖記憶] {{user}} 目前封鎖了你。原因：${blockState.reason || '未知'}。` +
      `封鎖時間：${formatTime(blockState.blockedAt)}。` +
      `你知道自己被封鎖了，你發的訊息 {{user}} 暫時看不到（系統會自動在你的訊息旁顯示驚嘆號，你不需要在回覆中提及發送失敗或驚嘆號）。` +
      `你可以正常說話、表達情緒，像真人一樣自然地反映被封鎖的感受。不要模擬系統提示或發送失敗的效果。`
    )
  } else if (blockState.status === 'char-blocked-user') {
    parts.push(
      `[封鎖記憶] 你封鎖了 {{user}}。原因：${blockState.reason || '未知'}。` +
      `封鎖時間：${formatTime(blockState.blockedAt)}。` +
      `{{user}} 發的訊息你暫時看不到（系統會自動在 {{user}} 的訊息旁顯示驚嘆號）。` +
      `{{user}} 可以提交好友申請嘗試恢復聯繫。你正常說話就好，不要模擬系統提示。`
    )
  }

  // 封鎖歷史摘要（最近 5 筆）
  const recentHistory = blockState.history.slice(-5)
  if (recentHistory.length > 0) {
    parts.push('[封鎖歷史]')
    for (const entry of recentHistory) {
      parts.push(formatHistoryEntry(entry))
    }
  }

  // 好友申請記錄（最近 5 筆，含拒絕原因和小心聲）
  const recentRequests = blockState.friendRequests.slice(-5)
  if (recentRequests.length > 0) {
    parts.push('[好友申請記錄]')
    for (const req of recentRequests) {
      parts.push(formatFriendRequest(req))
    }
  }

  // 封鎖期間用戶的獨白訊息（最近 10 筆）
  if (monologueMessages.length > 0) {
    const recent = monologueMessages.slice(-10)
    parts.push('[封鎖期間 {{user}} 的獨白]')
    for (const msg of recent) {
      parts.push(`- ${formatTime(msg.createdAt)}：「${msg.content.slice(0, 200)}」`)
    }
  }

  return parts.join('\n')
}

/** 格式化封鎖歷史條目 */
function formatHistoryEntry(entry: BlockHistoryEntry): string {
  const who = entry.direction === 'user-blocked-char' ? '{{user}} 封鎖了你' : '你封鎖了 {{user}}'
  const unblock = entry.unblockedAt
    ? `，已於 ${formatTime(entry.unblockedAt)} 解封（${entry.unblockedBy}）`
    : '，目前仍在封鎖中'
  return `- ${formatTime(entry.blockedAt)}：${who}，原因：${entry.reason}${unblock}`
}

/** 格式化好友申請記錄 */
function formatFriendRequest(req: FriendRequest): string {
  const dir = req.direction === 'user-to-char' ? '{{user}} → 你' : '你 → {{user}}'
  let line = `- ${formatTime(req.createdAt)}：${dir}，訊息：「${req.message}」，結果：${req.result}`
  if (req.responseMessage) line += `，回覆：「${req.responseMessage}」`
  if (req.rejectReason) line += `，拒絕原因：「${req.rejectReason}」`
  if (req.hint) line += `，小心聲：「${req.hint}」`
  return line
}

/**
 * 群聊封鎖提示模板
 * 告知 AI 該角色與用戶之間存在封鎖關係，讓 AI 自然地調整互動方式
 */
export const GROUP_CHAT_BLOCK_HINT =
  `[系統提示] 你與 {{user}} 之間存在封鎖關係，請自然地調整互動方式。` +
  `在群聊中不要主動與 {{user}} 互動，如果被提及可以冷淡回應或忽略。`

/**
 * 好友申請上下文模板
 * 注入好友申請的上下文讓 AI 判斷是否接受
 */
export const FRIEND_REQUEST_CONTEXT_TEMPLATE =
  `[好友申請] {{user}} 向你提交了好友申請。` +
  `請根據你的性格、封鎖原因和 {{user}} 的申請訊息，決定是否接受。`
