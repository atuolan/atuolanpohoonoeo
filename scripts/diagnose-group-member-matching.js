/**
 * 診斷群聊成員名稱匹配問題
 * 檢查消息中的 senderCharacterName 是否與群成員列表匹配
 */

const Database = require('better-sqlite3');
const dbPath = process.argv[2] || './chatDB';

function diagnose() {
  let db;
  try {
    db = new Database(dbPath, { readonly: true });

    console.log('=== 群聊成員名稱匹配診斷 ===\n');

    // 獲取所有群聊
    const chats = db.prepare(`
      SELECT id, name, characterId, groupMetadata 
      FROM chats 
      WHERE isGroupChat = 1
      ORDER BY updatedAt DESC
      LIMIT 5
    `).all();

    if (chats.length === 0) {
      console.log('❌ 沒有找到群聊記錄');
      return;
    }

    for (const chat of chats) {
      console.log(`\n📊 群聊: ${chat.name} (ID: ${chat.id})`);
      
      // 解析群組元數據
      let groupMetadata;
      try {
        groupMetadata = JSON.parse(chat.groupMetadata || '{}');
      } catch (e) {
        console.log('   ⚠️ 無法解析 groupMetadata');
        continue;
      }

      // 顯示群成員列表
      console.log('\n   群成員列表:');
      if (groupMetadata.members && groupMetadata.members.length > 0) {
        groupMetadata.members.forEach((member, idx) => {
          console.log(`   ${idx + 1}. ${member.nickname || member.name || '未命名'}`);
          console.log(`      - characterId: ${member.characterId}`);
          console.log(`      - nickname: ${member.nickname || '(無)'}`);
          console.log(`      - name: ${member.name || '(無)'}`);
          console.log(`      - isVirtual: ${member.isVirtual || false}`);
        });
      } else {
        console.log('   ⚠️ 沒有成員列表');
      }

      // 檢查消息中的 senderCharacterName
      console.log('\n   最近的消息發送者:');
      const messages = db.prepare(`
        SELECT id, sender, name, senderCharacterId, senderCharacterName
        FROM chat_messages
        WHERE chatId = ?
        AND sender = 'assistant'
        ORDER BY timestamp DESC
        LIMIT 10
      `).all(chat.id);

      if (messages.length === 0) {
        console.log('   ⚠️ 沒有 AI 消息');
        continue;
      }

      const senderNames = new Set();
      messages.forEach(msg => {
        const displayName = msg.senderCharacterName || msg.name || '(無名稱)';
        senderNames.add(displayName);
      });

      console.log(`   發現 ${senderNames.size} 個不同的發送者名稱:`);
      senderNames.forEach(name => {
        const matched = groupMetadata.members?.some(m => 
          m.nickname === name || m.name === name
        );
        console.log(`   - "${name}" ${matched ? '✅ 匹配' : '❌ 不匹配'}`);
      });

      // 顯示具體的不匹配消息
      console.log('\n   不匹配的消息示例:');
      const unmatchedMessages = messages.filter(msg => {
        const displayName = msg.senderCharacterName || msg.name;
        return !groupMetadata.members?.some(m => 
          m.nickname === displayName || m.name === displayName
        );
      });

      if (unmatchedMessages.length > 0) {
        unmatchedMessages.slice(0, 3).forEach(msg => {
          console.log(`   📧 消息 ID: ${msg.id}`);
          console.log(`      - senderCharacterName: ${msg.senderCharacterName || '(無)'}`);
          console.log(`      - name: ${msg.name || '(無)'}`);
          console.log(`      - senderCharacterId: ${msg.senderCharacterId || '(無)'}`);
        });
      } else {
        console.log('   ✅ 所有消息都匹配');
      }

      console.log('\n' + '='.repeat(60));
    }

    console.log('\n✅ 診斷完成');

  } catch (error) {
    console.error('❌ 診斷失敗:', error.message);
    console.error(error.stack);
  } finally {
    if (db) {
      db.close();
    }
  }
}

diagnose();
