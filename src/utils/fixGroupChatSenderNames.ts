/**
 * 修復群聊消息的發送者名稱
 * 根據群成員列表更新消息中的 senderCharacterName 欄位
 */

import { openDB } from "@/storage/db";
import type { Chat } from "@/types/chat";

interface GroupMember {
  characterId: string;
  nickname?: string;
  name?: string;
  isVirtual?: boolean;
}

interface GroupMetadata {
  members?: GroupMember[];
  multiCharMembers?: Array<{ id: string; name: string }>;
  isMultiCharCard?: boolean;
}

/**
 * 根據角色名稱解析對應的群成員信息
 */
function resolveGroupMemberByName(
  rawName: string,
  groupMetadata: GroupMetadata,
  charactersMap: Map<string, any>
): {
  characterId?: string;
  canonicalName: string;
} {
  if (!rawName || !groupMetadata) {
    return { characterId: undefined, canonicalName: rawName };
  }

  const candidateNames = [
    rawName,
    rawName.replace(/[（(][^）)]*[）)]$/u, "").trim(),
  ].filter((name, index, arr) => !!name && arr.indexOf(name) === index);

  // 多人卡模式
  if (groupMetadata.isMultiCharCard && groupMetadata.multiCharMembers) {
    for (const candidate of candidateNames) {
      const member = groupMetadata.multiCharMembers.find(
        (m) => m.name === candidate
      );
      if (member) {
        return {
          characterId: member.id,
          canonicalName: member.name,
        };
      }
    }
    return { characterId: undefined, canonicalName: rawName };
  }

  // 普通群聊模式
  if (!groupMetadata.members) {
    return { characterId: undefined, canonicalName: rawName };
  }

  for (const candidate of candidateNames) {
    for (const member of groupMetadata.members) {
      // 虛擬成員
      if (member.isVirtual) {
        const aliases = [member.nickname, member.name]
          .map((name) => name?.trim())
          .filter((name): name is string => !!name);
        if (aliases.includes(candidate)) {
          return {
            characterId: member.characterId,
            canonicalName: member.nickname?.trim() || member.name?.trim() || rawName,
          };
        }
        continue;
      }

      // 真實角色卡
      const char = charactersMap.get(member.characterId);
      const aliases = [member.nickname, char?.nickname, char?.data?.name]
        .map((name) => name?.trim())
        .filter((name): name is string => !!name);

      if (aliases.includes(candidate)) {
        return {
          characterId: member.characterId,
          canonicalName:
            member.nickname?.trim() ||
            char?.nickname?.trim() ||
            char?.data?.name ||
            rawName,
        };
      }
    }
  }

  return { characterId: undefined, canonicalName: rawName };
}

/**
 * 修復群聊消息的發送者名稱
 */
export async function fixGroupChatSenderNames(): Promise<{
  fixed: number;
  total: number;
}> {
  const db = await openDB();

  try {
    // 1. 載入所有角色卡
    const characters = await db.getAll("characters");
    const charactersMap = new Map(characters.map((c) => [c.id, c]));

    // 2. 找出所有群聊
    const chats: Chat[] = await db.getAll("chats");
    const groupChats = chats.filter((c) => c.isGroupChat && c.groupMetadata);

    let totalMessages = 0;
    let fixedMessages = 0;

    for (const chat of groupChats) {
      const groupMetadata = chat.groupMetadata!;

      // 3. 載入該群聊的所有 AI 消息
      const allMessages = await db.getAllFromIndex(
        "chat_messages",
        "by-chat",
        chat.id
      );

      const aiMessages = allMessages.filter((m) => m.sender === "assistant");
      totalMessages += aiMessages.length;

      // 4. 檢查並修復每條消息
      for (const msg of aiMessages) {
        let needsUpdate = false;

        // 檢查是否需要修復 senderCharacterName
        if (msg.name && !msg.senderCharacterName) {
          // 根據 name 欄位解析正確的發送者信息
          const resolved = resolveGroupMemberByName(
            msg.name,
            groupMetadata,
            charactersMap
          );

          msg.senderCharacterName = resolved.canonicalName;
          msg.senderCharacterId = resolved.characterId;
          needsUpdate = true;
        }

        // 如果有 senderCharacterName 但與群成員不匹配，也需要重新解析
        if (msg.senderCharacterName) {
          const resolved = resolveGroupMemberByName(
            msg.senderCharacterName,
            groupMetadata,
            charactersMap
          );

          // 如果解析後的名稱與當前不同，更新
          if (
            resolved.canonicalName !== msg.senderCharacterName ||
            (resolved.characterId && resolved.characterId !== msg.senderCharacterId)
          ) {
            msg.senderCharacterName = resolved.canonicalName;
            msg.senderCharacterId = resolved.characterId;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          await db.put("chat_messages", msg);
          fixedMessages++;
        }
      }
    }

    console.log(`✅ 修復完成: ${fixedMessages}/${totalMessages} 條消息`);
    return { fixed: fixedMessages, total: totalMessages };
  } catch (error) {
    console.error("❌ 修復失敗:", error);
    throw error;
  }
}
