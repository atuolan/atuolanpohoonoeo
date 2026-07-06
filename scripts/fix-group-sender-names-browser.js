/**
 * 修復群聊消息的發送者名稱
 * 在瀏覽器控制台執行此腳本
 * 
 * 使用方法:
 * 1. 打開小手機應用
 * 2. 按 F12 打開開發者工具
 * 3. 切換到 Console 標籤
 * 4. 複製整個腳本並貼上，按 Enter 執行
 */

(async function fixGroupChatSenderNames() {
  console.log('🔧 開始修復群聊消息發送者名稱...\n');

  try {
    // 打開 IndexedDB
    const dbRequest = indexedDB.open('aguaphone-db', 1);
    
    const db = await new Promise((resolve, reject) => {
      dbRequest.onsuccess = () => resolve(dbRequest.result);
      dbRequest.onerror = () => reject(dbRequest.error);
    });

    // 1. 載入所有角色卡
    const charactersStore = db.transaction('characters', 'readonly').objectStore('characters');
    const charactersRequest = charactersStore.getAll();
    const characters = await new Promise((resolve, reject) => {
      charactersRequest.onsuccess = () => resolve(charactersRequest.result);
      charactersRequest.onerror = () => reject(charactersRequest.error);
    });

    const charactersMap = new Map(characters.map(c => [c.id, c]));
    console.log(`✅ 載入了 ${characters.length} 個角色卡`);

    // 2. 載入所有群聊
    const chatsStore = db.transaction('chats', 'readonly').objectStore('chats');
    const chatsRequest = chatsStore.getAll();
    const allChats = await new Promise((resolve, reject) => {
      chatsRequest.onsuccess = () => resolve(chatsRequest.result);
      chatsRequest.onerror = () => reject(chatsRequest.error);
    });

    const groupChats = allChats.filter(c => c.isGroupChat && c.groupMetadata);
    console.log(`✅ 找到 ${groupChats.length} 個群聊\n`);

    if (groupChats.length === 0) {
      console.log('❌ 沒有群聊需要修復');
      return;
    }

    let totalMessages = 0;
    let fixedMessages = 0;

    // 3. 處理每個群聊
    for (const chat of groupChats) {
      console.log(`📊 處理群聊: ${chat.name}`);
      const groupMetadata = chat.groupMetadata;

      // 載入該群聊的所有消息
      const messagesStore = db.transaction('chat_messages', 'readwrite').objectStore('chat_messages');
      const index = messagesStore.index('by-chat');
      const messagesRequest = index.getAll(chat.id);
      const allMessages = await new Promise((resolve, reject) => {
        messagesRequest.onsuccess = () => resolve(messagesRequest.result);
        messagesRequest.onerror = () => reject(messagesRequest.error);
      });

      const aiMessages = allMessages.filter(m => m.sender === 'assistant');
      totalMessages += aiMessages.length;
      console.log(`   找到 ${aiMessages.length} 條 AI 消息`);

      let chatFixed = 0;

      // 4. 檢查並修復每條消息
      for (const msg of aiMessages) {
        let needsUpdate = false;
        let newSenderName = msg.senderCharacterName;
        let newSenderCharId = msg.senderCharacterId;

        // 如果沒有 senderCharacterName，嘗試從 name 欄位獲取
        const sourceName = msg.senderCharacterName || msg.name;

        if (sourceName) {
          // 解析正確的發送者信息
          const resolved = resolveGroupMemberByName(sourceName, groupMetadata, charactersMap);

          // 更新名稱
          if (resolved.canonicalName !== msg.senderCharacterName) {
            newSenderName = resolved.canonicalName;
            needsUpdate = true;
          }

          // 更新 characterId
          if (resolved.characterId && resolved.characterId !== msg.senderCharacterId) {
            newSenderCharId = resolved.characterId;
            needsUpdate = true;
          }
        }

        if (needsUpdate) {
          msg.senderCharacterName = newSenderName;
          msg.senderCharacterId = newSenderCharId;

          // 保存更新
          const updateStore = db.transaction('chat_messages', 'readwrite').objectStore('chat_messages');
          await new Promise((resolve, reject) => {
            const request = updateStore.put(msg);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          chatFixed++;
          fixedMessages++;
        }
      }

      console.log(`   ✅ 修復了 ${chatFixed} 條消息\n`);
    }

    console.log(`\n🎉 修復完成！`);
    console.log(`   總消息數: ${totalMessages}`);
    console.log(`   已修復: ${fixedMessages}`);
    console.log(`\n💡 請重新整理頁面以查看效果`);

    db.close();

  } catch (error) {
    console.error('❌ 修復失敗:', error);
  }

  /**
   * 根據角色名稱解析對應的群成員信息
   */
  function resolveGroupMemberByName(rawName, groupMetadata, charactersMap) {
    if (!rawName || !groupMetadata) {
      return { characterId: undefined, canonicalName: rawName };
    }

    const candidateNames = [
      rawName,
      rawName.replace(/[（(][^）)]*[）)]$/u, '').trim(),
    ].filter((name, index, arr) => !!name && arr.indexOf(name) === index);

    // 多人卡模式
    if (groupMetadata.isMultiCharCard && groupMetadata.multiCharMembers) {
      for (const candidate of candidateNames) {
        const member = groupMetadata.multiCharMembers.find(m => m.name === candidate);
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
            .map(name => name?.trim())
            .filter(name => !!name);
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
          .map(name => name?.trim())
          .filter(name => !!name);

        if (aliases.includes(candidate)) {
          return {
            characterId: member.characterId,
            canonicalName: member.nickname?.trim() || char?.nickname?.trim() || char?.data?.name || rawName,
          };
        }
      }
    }

    return { characterId: undefined, canonicalName: rawName };
  }
})();
