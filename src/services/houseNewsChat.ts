/**
 * 從小屋把「小屋的事」卡片送進他的聊天：只是加一則使用者的訊息，不叫 AI 回。
 * 他下次回話時會看到這張卡片（聊天紀錄裡的一則），不會寫進每次都帶的設定。
 */
import type { ChatMessage } from "@/types/chat";
import type { HouseNewsShare } from "@/types/houseNews";
import { appendMessages } from "@/storage/chatMessageStorage";
import { loadChatById, refreshChatDerivedMetadata } from "@/storage/chatStorage";
import { computeChatNow } from "@/utils/fakeTime";
import { houseNewsSummary } from "@/utils/houseNewsShare";

export function buildHouseNewsMessage(share: HouseNewsShare, storyTime: number, now = Date.now()): ChatMessage {
  return {
    id: `msg_house_news_${now}`,
    sender: "user",
    name: "User",
    content: houseNewsSummary(share),
    is_user: true,
    status: "sent",
    createdAt: now,
    updatedAt: now,
    storyTime,
    houseNews: JSON.parse(JSON.stringify(share)),
  };
}

export async function sendHouseNewsToChat(chatId: string, share: HouseNewsShare): Promise<void> {
  const chat = await loadChatById(chatId);
  if (!chat) throw new Error("chat not found");
  const now = Date.now();
  // 有劇情時間的聊天：卡片放在聊天現在的時間
  const storyTime = computeChatNow(chat, new Date(now)).getTime();
  await appendMessages(chatId, [buildHouseNewsMessage(share, storyTime, now)]);
  await refreshChatDerivedMetadata(chatId).catch(() => undefined);
  try {
    window.dispatchEvent(new CustomEvent("aguaphone:chat-messages-appended", { detail: { chatId } }));
  } catch {
    // 非瀏覽器環境（測試）
  }
}
