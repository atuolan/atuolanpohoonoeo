import { loadAllChats, loadChatById, saveChatMetadata } from "@/storage/chatStorage";
import type { Chat } from "@/types/chat";
import { getChatRowMembers } from "@/utils/chatArchive";

/**
 * 把聊天列表上的幾列一起歸檔／取消歸檔。
 * 歸檔時順便收掉已排好的背景活動（待撥來電、暫離／行程計時器），
 * 再重新同步雲端主動訊息，讓 Worker 不再替這些角色排程。
 */
export async function setChatRowsArchived(
  rows: Chat[],
  archived: boolean,
): Promise<void> {
  const allChats = await loadAllChats();
  const ids = new Set<string>();
  for (const row of rows) {
    for (const c of getChatRowMembers(row, allChats)) {
      // 取消歸檔只動已歸檔的；歸檔時整列一起收
      if (archived || c.archivedAt) ids.add(c.id);
    }
  }

  // updatedAt 要往前推，自架同步才會把這次變更推出去；
  // 照原本新舊順序依序 +1ms，同一角色的聊天檔先後不變（列表仍顯示最新那個）
  const members = allChats
    .filter((c) => ids.has(c.id))
    .sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
  const now = Date.now();
  for (const [i, listed] of members.entries()) {
    const chat = await loadChatById(listed.id);
    if (!chat) continue;
    // 取消歸檔寫 0 而不是刪掉欄位：saveChatMetadata 會把 undefined 當成舊快照而保留歸檔
    chat.archivedAt = archived ? now : 0;
    chat.updatedAt = now + i;
    await saveChatMetadata(chat);
  }

  if (archived) await quietArchivedChats([...ids]);
  await resyncCloudPush();
}

/** 使用者在歸檔的聊天裡送出訊息：整列回到聊天列表 */
export async function unarchiveChatRowOf(chatId: string): Promise<boolean> {
  const chat = await loadChatById(chatId);
  if (!chat?.archivedAt) return false;
  await setChatRowsArchived([chat], false);
  return true;
}

async function quietArchivedChats(chatIds: string[]): Promise<void> {
  const idSet = new Set(chatIds);
  try {
    const { getIncomingCallScheduler } = await import(
      "@/services/IncomingCallScheduler"
    );
    const scheduler = getIncomingCallScheduler();
    const pending = await scheduler.getAllPendingCalls();
    for (const call of pending) {
      if (idSet.has(call.chatId)) await scheduler.cancelPendingCall(call.id);
    }
  } catch (e) {
    console.warn("[ChatArchive] 清除待撥來電失敗:", e);
  }

  try {
    const { cancelCharAway, cancelCharAwayPlan } = await import(
      "@/services/charAwayRuntime"
    );
    for (const id of chatIds) {
      await cancelCharAwayPlan(id);
      await cancelCharAway(id);
    }
  } catch (e) {
    console.warn("[ChatArchive] 取消暫離計時失敗:", e);
  }
}

async function resyncCloudPush(): Promise<void> {
  try {
    const { useCloudPushStore } = await import("@/stores/cloudPush");
    const cloudPush = useCloudPushStore();
    if (cloudPush.enabled) await cloudPush.syncToCloud();
  } catch (e) {
    console.warn("[ChatArchive] 雲端主動訊息重新同步失敗:", e);
  }
}
