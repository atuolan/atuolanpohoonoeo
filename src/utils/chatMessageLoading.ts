import { db } from "@/db/database";
import { loadMessages, saveMessages } from "@/storage/chatMessageStorage";
import { refreshChatDerivedMetadata } from "@/storage/chatStorage";
import type { Chat, ChatMessage } from "@/types/chat";

export async function recoverFromMessageChunks(chatId: string): Promise<ChatMessage[]> {
  const rawDb = (db as any)._instance;
  if (!rawDb) return [];

  if (!rawDb.objectStoreNames.contains("messageChunks")) {
    return [];
  }

  try {
    const tx = rawDb.transaction("messageChunks", "readonly");
    const store = tx.objectStore("messageChunks");
    const allKeys: string[] = await store.getAllKeys();
    const chunkKeys = allKeys
      .filter((k: string) => k.startsWith(`${chatId}_chunk_`))
      .sort((a: string, b: string) => {
        const idxA = parseInt(a.split("_chunk_")[1], 10);
        const idxB = parseInt(b.split("_chunk_")[1], 10);
        return idxA - idxB;
      });

    if (chunkKeys.length === 0) return [];

    const allMessages: ChatMessage[] = [];
    for (const key of chunkKeys) {
      const chunk = await store.get(key);
      if (chunk?.messages && Array.isArray(chunk.messages)) {
        allMessages.push(...chunk.messages);
      }
    }
    await tx.done;
    return allMessages;
  } catch (e) {
    console.warn("[recoverFromMessageChunks] 讀取失敗:", e);
    return [];
  }
}

function isCallOrSystemRecord(m: any): boolean {
  const content = String(m.content || "");
  return (
    String(m.id || "").startsWith("msg_call_") ||
    String(m.id || "").startsWith("msg_friend_req_") ||
    content.includes("📞 通話結束") ||
    m.isSystemNotification ||
    m.isCallNotification ||
    m.isGroupChatHistory ||
    m.isGroupCallHistory ||
    m.isCalendarEvent ||
    m.isContinuePrompt ||
    m.isFriendRequest
  );
}

export async function repairSystemSenderRegressionIfNeeded(
  chat: Chat,
  rawMessages: ChatMessage[],
): Promise<ChatMessage[]> {
  if (chat.isGroupChat || rawMessages.length < 3) return rawMessages;

  const assistantCount = rawMessages.filter((m) => m.sender === "assistant").length;
  const systemCount = rawMessages.filter((m) => m.sender === "system").length;
  const suspiciousNormalSystemCount = rawMessages.filter(
    (m) => m.sender === "system" && !isCallOrSystemRecord(m),
  ).length;

  if (
    assistantCount > 0 ||
    systemCount < Math.max(3, rawMessages.length * 0.5) ||
    suspiciousNormalSystemCount === 0
  ) {
    return rawMessages;
  }

  const recovered = await recoverFromMessageChunks(chat.id);
  const recoveredById = new Map(
    recovered
      .filter((m) => m.sender === "user" || m.sender === "assistant")
      .map((m) => [m.id, m]),
  );
  if (recoveredById.size > 0) {
    let restoredCount = 0;
    const restoredFromChunks = rawMessages.map((m) => {
      const old = recoveredById.get(m.id);
      if (!old || m.sender !== "system" || isCallOrSystemRecord(m)) return m;
      restoredCount++;
      return {
        ...m,
        sender: old.sender,
        name: old.name,
        is_user: old.sender === "user",
      };
    });
    if (restoredCount > 0) {
      await saveMessages(chat.id, restoredFromChunks);
      await refreshChatDerivedMetadata(chat.id);
      console.warn("[ChatScreen] 已從 messageChunks 修復誤存為 system 的訊息", {
        chatId: chat.id,
        restoredCount,
      });
      return restoredFromChunks;
    }
  }

  const repaired = rawMessages.map((m) => {
    if (m.sender !== "system" || isCallOrSystemRecord(m)) return m;
    const restoredSender =
      (m as any).role === "user" || m.is_user === true || m.name === "User"
        ? "user"
        : "assistant";
    return {
      ...m,
      sender: restoredSender as ChatMessage["sender"],
      is_user: restoredSender === "user",
    };
  });

  await saveMessages(chat.id, repaired);
  await refreshChatDerivedMetadata(chat.id);
  console.warn(
    "[ChatScreen] 已修復疑似通話結束後誤存為 system 的訊息",
    {
      chatId: chat.id,
      repairedCount: repaired.filter(
        (m, i) => m.sender !== rawMessages[i]?.sender,
      ).length,
    },
  );
  return repaired;
}

export async function loadAndRepairChatMessages(chat: Chat): Promise<ChatMessage[]> {
  let rawMessages: ChatMessage[] = await loadMessages(chat.id);

  if (rawMessages.length === 0 && (chat.messageCount ?? 0) > 0) {
    console.warn(
      "[ChatScreen] chatMessages 為空但 messageCount =",
      chat.messageCount,
      "，嘗試從 messageChunks 恢復...",
    );
    try {
      const recovered = await recoverFromMessageChunks(chat.id);
      if (recovered.length > 0) {
        rawMessages = recovered;
        console.log(
          "[ChatScreen] 從 messageChunks 恢復了",
          recovered.length,
          "條訊息，將寫入 chatMessages 表",
        );
        await saveMessages(chat.id, recovered);
        await refreshChatDerivedMetadata(chat.id);
      }
    } catch (recoverErr) {
      console.warn("[ChatScreen] messageChunks 恢復失敗:", recoverErr);
    }
  }

  const loadAI = rawMessages.filter((m) => m.sender === "assistant");
  console.log(
    "[ChatScreen] 載入驗證:",
    `總共 ${rawMessages.length} 條, AI ${loadAI.length} 條`,
    loadAI.map((m) => `[${m.id}] ${(m.content || "").substring(0, 30)}`),
  );

  if (rawMessages.length >= 4) {
    let isOutOfOrder = false;
    const midpoint = Math.floor(rawMessages.length / 2);
    const firstHalfUsers = rawMessages
      .slice(0, midpoint)
      .filter((m) => m.sender === "user").length;
    const secondHalfAIs = rawMessages
      .slice(midpoint)
      .filter((m) => m.sender === "assistant").length;
    if (
      firstHalfUsers === midpoint &&
      secondHalfAIs === rawMessages.length - midpoint
    ) {
      isOutOfOrder = true;
    }

    if (!isOutOfOrder) {
      let outOfOrderCount = 0;
      for (let i = 1; i < rawMessages.length; i++) {
        if (
          rawMessages[i].createdAt <
          rawMessages[i - 1].createdAt - 1000
        ) {
          outOfOrderCount++;
        }
      }
      if (outOfOrderCount > rawMessages.length * 0.3) {
        isOutOfOrder = true;
      }
    }

    if (isOutOfOrder) {
      console.warn(
        "[ChatScreen] ⚠️ 偵測到訊息順序異常！按 createdAt 時間戳重新排序修復",
        `亂序前: ${rawMessages.map((m) => m.sender[0]).join("")}`,
      );
      rawMessages.sort((a, b) => a.createdAt - b.createdAt);
      console.log(
        "[ChatScreen] 修復後:",
        rawMessages.map((m) => m.sender[0]).join(""),
      );
      await saveMessages(chat.id, rawMessages);
      await refreshChatDerivedMetadata(chat.id);
      console.log("[ChatScreen] ✅ 已將修復後的訊息順序回寫到 chatMessages");
    }
  }

  return repairSystemSenderRegressionIfNeeded(chat, rawMessages);
}
