/**
 * Discord OAuth2 授權流程
 * 
 * 流程：
 * 1. 前端跳轉到 Discord 授權頁面（前端自行構建 URL）
 * 2. 使用者授權後 Discord redirect 到 /discord/callback
 * 3. Worker 用 code 換 access_token
 * 4. 用 token 取得使用者資訊（ID、名稱）
 * 5. 用 token + guilds.join scope 自動把使用者加入指定伺服器
 * 6. Redirect 回前端，URL 帶上 user ID 和名稱
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * 處理 Discord OAuth2 callback
 * @param {Request} request
 * @param {object} env - 需要 DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
 * @returns {Response}
 */
export async function handleDiscordCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // state = 前端 origin，用來 redirect 回去
  const error = url.searchParams.get('error');

  // 使用者拒絕授權
  if (error) {
    const redirectBase = state || 'https://203aguaphone.aguacloud.uk';
    return Response.redirect(`${redirectBase}?discord_error=${encodeURIComponent(error)}`, 302);
  }

  if (!code) {
    return new Response('缺少 code 參數', { status: 400 });
  }

  const redirectBase = state || 'https://203aguaphone.aguacloud.uk';
  const callbackUrl = `${url.origin}/discord/callback`;

  try {
    // 1. 用 code 換 access_token
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
      }),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[Discord OAuth] Token 交換失敗:', tokenRes.status, text);
      return Response.redirect(
        `${redirectBase}?discord_error=${encodeURIComponent('授權失敗，請重試')}`,
        302,
      );
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // 2. 取得使用者資訊
    const userRes = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userRes.ok) {
      console.error('[Discord OAuth] 取得使用者資訊失敗:', userRes.status);
      return Response.redirect(
        `${redirectBase}?discord_error=${encodeURIComponent('無法取得使用者資訊')}`,
        302,
      );
    }

    const user = await userRes.json();

    // 3. 自動把使用者加入伺服器（需要 guilds.join scope + Bot 在該伺服器有權限）
    if (env.DISCORD_GUILD_ID && env.DISCORD_BOT_TOKEN) {
      try {
        const joinRes = await fetch(
          `${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ access_token: accessToken }),
          },
        );
        // 201 = 新加入, 204 = 已經在伺服器裡
        if (joinRes.ok || joinRes.status === 204) {
          console.log(`[Discord OAuth] 使用者 ${user.id} 已加入伺服器`);
        } else {
          const text = await joinRes.text();
          console.warn('[Discord OAuth] 加入伺服器失敗:', joinRes.status, text);
          // 非致命錯誤，繼續流程
        }
      } catch (e) {
        console.warn('[Discord OAuth] 加入伺服器異常:', e);
      }
    }

    // 4. Redirect 回前端，帶上使用者資訊
    const params = new URLSearchParams({
      discord_user_id: user.id,
      discord_username: user.username,
      discord_display_name: user.global_name || user.username,
    });

    return Response.redirect(`${redirectBase}?${params.toString()}`, 302);
  } catch (e) {
    console.error('[Discord OAuth] 未預期錯誤:', e);
    return Response.redirect(
      `${redirectBase}?discord_error=${encodeURIComponent('伺服器錯誤，請稍後重試')}`,
      302,
    );
  }
}
