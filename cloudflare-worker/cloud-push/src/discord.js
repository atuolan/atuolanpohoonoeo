/**
 * Discord Bot DM 工具函數
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * 透過 Discord Bot 發送私訊
 * @param {string} botToken - Discord Bot Token
 * @param {string} userId - 目標用戶的 Discord User ID
 * @param {string} characterName - 角色名稱
 * @param {string} content - 訊息內容
 */
export async function sendDM(botToken, userId, characterName, content) {
  // 1. 建立 / 取得 DM channel
  const channelRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: userId }),
  });

  if (!channelRes.ok) {
    const text = await channelRes.text();
    throw new Error(`Discord: 無法建立 DM channel (${channelRes.status}): ${text}`);
  }

  const channel = await channelRes.json();

  // 2. 清理 AI 輸出的格式標籤（<msg>、[sticker:xxx]、ˇ想法ˇ 等）
  const cleaned = content
    .replace(/<\/?msg>/g, '')
    .replace(/\[sticker:[^\]]*\]/g, '')
    .replace(/ˇ[^ˇ]*ˇ/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const formattedContent = `**${characterName}**\n${cleaned}`;

  // Discord 訊息上限 2000 字元
  const truncated = formattedContent.length > 2000
    ? formattedContent.slice(0, 1997) + '...'
    : formattedContent;

  const msgRes = await fetch(`${DISCORD_API}/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content: truncated }),
  });

  if (!msgRes.ok) {
    const text = await msgRes.text();
    throw new Error(`Discord: 發送訊息失敗 (${msgRes.status}): ${text}`);
  }

  return await msgRes.json();
}
