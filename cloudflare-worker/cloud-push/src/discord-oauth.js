/**
 * Discord OAuth2 授權流程（含跨社群身分組驗證）
 *
 * 流程：
 * 1. 前端跳轉到 Discord 授權頁面（前端自行構建 URL）
 * 2. 使用者授權後 Discord redirect 到 /discord/callback
 * 3. Worker 用 code 換 access_token
 * 4. 用 token 取得使用者資訊（ID、名稱）
 * 5. 用 token + guilds.join scope 自動把使用者加入指定伺服器
 * 6. 若 state 含 purpose=auth：跨社群驗證身分組
 * 7. Redirect 回前端，URL 帶上 user ID、名稱及驗證結果
 */

const DISCORD_API = 'https://discord.com/api/v10';

/**
 * 跨社群身分組驗證設定
 * 每個項目定義一個需要檢查的伺服器與必要身分組
 */
const AUTH_GUILD_CHECKS = [
  {
    guildId: '1413953986519760908',   // 夜宵攤
    guildName: '夜宵攤',
    requiredRoleId: '1431319090726834357',
  },
  {
    guildId: '1448640189357625377',   // 游鹿小島
    guildName: '游鹿小島',
    requiredRoleId: '1448985431533158534',
  },
];

/**
 * 處理 Discord OAuth2 callback
 * @param {Request} request
 * @param {object} env - 需要 DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_BOT_TOKEN, DISCORD_GUILD_ID
 * @returns {Response}
 */
export async function handleDiscordCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const rawState = url.searchParams.get('state') || ''; // state = 前端 origin[|purpose=auth]，用來 redirect 回去
  const error = url.searchParams.get('error');

  // 解析 state：可能格式為 "origin" 或 "origin|purpose=auth"
  const stateParts = rawState.split('|');
  const redirectBase = stateParts[0] || 'https://203aguaphone.aguacloud.uk';
  const isAuthPurpose = stateParts.some(part => part === 'purpose=auth');

  // 使用者拒絕授權
  if (error) {
    return Response.redirect(`${redirectBase}/discord-callback.html?discord_error=${encodeURIComponent(error)}`, 302);
  }

  if (!code) {
    return new Response('缺少 code 參數', { status: 400 });
  }

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
      let errorDetail = '授權失敗，請重試';
      try {
        const errJson = JSON.parse(text);
        errorDetail = `Token交換失敗(${tokenRes.status}): ${errJson.error_description || errJson.error || text}`;
      } catch {
        errorDetail = `Token交換失敗(${tokenRes.status}): ${text.slice(0, 200)}`;
      }
      return Response.redirect(
        `${redirectBase}?discord_error=${encodeURIComponent(errorDetail)}`,
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
    //    僅在非 auth 用途時執行（auth 用途不需要自動加入）
    if (!isAuthPurpose && env.DISCORD_GUILD_ID && env.DISCORD_BOT_TOKEN) {
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
        if (joinRes.ok || joinRes.status === 204) {
          console.log(`[Discord OAuth] 使用者 ${user.id} 已加入伺服器`);
        } else {
          const text = await joinRes.text();
          console.warn('[Discord OAuth] 加入伺服器失敗:', joinRes.status, text);
        }
      } catch (e) {
        console.warn('[Discord OAuth] 加入伺服器異常:', e);
      }
    }

    // 4. 跨社群身分組驗證（僅 auth 用途）
    let authResult = null; // { success: bool, checks: [...], message: string }

    if (isAuthPurpose) {
      console.log(`[Discord OAuth] 開始跨社群身分組驗證 for user ${user.id}`);
      authResult = await performGuildVerification(accessToken, user.id);
    }

    // 5. Redirect 回前端，帶上使用者資訊（及驗證結果）
    const params = new URLSearchParams({
      discord_user_id: user.id,
      discord_username: user.username,
      discord_display_name: user.global_name || user.username,
    });

    if (authResult) {
      params.set('auth_result', JSON.stringify(authResult));
    }

    return Response.redirect(`${redirectBase}/discord-callback.html?${params.toString()}`, 302);
  } catch (e) {
    console.error('[Discord OAuth] 未預期錯誤:', e);
    return Response.redirect(
      `${redirectBase}/discord-callback.html?discord_error=${encodeURIComponent('伺服器錯誤，請稍後重試')}`,
      302,
    );
  }
}

/**
 * 跨社群身分組驗證
 * 用使用者 token 查詢他們在指定社群的成員資訊，檢查是否擁有必要身分組
 *
 * @param {string} accessToken - 使用者的 OAuth access token
 * @param {string} userId - Discord user ID
 * @returns {object} { success, message, checks: [{ guildId, guildName, passed, reason, requiredRoleId, userRoles }] }
 */
async function performGuildVerification(accessToken, userId) {
  const checks = [];
  let allPassed = true;

  // 先查使用者所在的伺服器列表
  let userGuilds = [];
  try {
    const guildsRes = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!guildsRes.ok) {
      console.error('[GuildVerify] 無法讀取伺服器列表:', guildsRes.status);
      // 無法讀取伺服器列表，全部標記為失敗
      for (const check of AUTH_GUILD_CHECKS) {
        checks.push({
          guildId: check.guildId,
          guildName: check.guildName,
          passed: false,
          reason: 'cannot_read_guilds',
          requiredRoleId: check.requiredRoleId,
        });
      }
      return {
        success: false,
        message: '無法讀取伺服器列表，請確認已授權 guilds 權限',
        checks,
      };
    }

    userGuilds = await guildsRes.json();
    console.log(`[GuildVerify] 使用者所在伺服器數量: ${userGuilds.length}`);
  } catch (e) {
    console.error('[GuildVerify] 查詢伺服器列表異常:', e);
    for (const check of AUTH_GUILD_CHECKS) {
      checks.push({
        guildId: check.guildId,
        guildName: check.guildName,
        passed: false,
        reason: 'cannot_read_guilds',
        requiredRoleId: check.requiredRoleId,
      });
    }
    return {
      success: false,
      message: '伺服器列表查詢異常',
      checks,
    };
  }

  // 逐一檢查每個目標社群
  let anyPassed = false;
  for (const check of AUTH_GUILD_CHECKS) {
    const inGuild = userGuilds.some(g => g.id === check.guildId);

    if (!inGuild) {
      console.log(`[GuildVerify] 使用者不在 ${check.guildName} (${check.guildId})`);
      checks.push({
        guildId: check.guildId,
        guildName: check.guildName,
        passed: false,
        reason: 'not_in_guild',
        requiredRoleId: check.requiredRoleId,
        userRoles: [],
      });
      continue;
    }

    // 查詢該伺服器中的身分組
    try {
      const memberRes = await fetch(
        `${DISCORD_API}/users/@me/guilds/${check.guildId}/member`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!memberRes.ok) {
        console.warn(`[GuildVerify] 無法讀取 ${check.guildName} 成員資訊:`, memberRes.status);
        checks.push({
          guildId: check.guildId,
          guildName: check.guildName,
          passed: false,
          reason: 'cannot_read_member',
          requiredRoleId: check.requiredRoleId,
          userRoles: [],
        });
        continue;
      }

      const member = await memberRes.json();
      const userRoles = member.roles || [];
      const hasRole = userRoles.includes(check.requiredRoleId);

      console.log(`[GuildVerify] ${check.guildName}: roles=${userRoles.length}, hasRequiredRole=${hasRole}`);

      checks.push({
        guildId: check.guildId,
        guildName: check.guildName,
        passed: hasRole,
        reason: hasRole ? null : 'missing_role',
        requiredRoleId: check.requiredRoleId,
        userRoles,
      });

      if (hasRole) {
        anyPassed = true;
      }
    } catch (e) {
      console.error(`[GuildVerify] 查詢 ${check.guildName} 成員異常:`, e);
      checks.push({
        guildId: check.guildId,
        guildName: check.guildName,
        passed: false,
        reason: 'cannot_read_member',
        requiredRoleId: check.requiredRoleId,
        userRoles: [],
      });
    }
  }

  allPassed = anyPassed;

  // 生成訊息
  let message;
  if (allPassed) {
    message = '驗證通過';
    // 如果通過了，把所有 check 的 passed 都設為 true，這樣前端就不會顯示紅色的錯誤
    checks.forEach(c => {
      c.passed = true;
      c.reason = null;
    });
  } else {
    const failedReasons = checks
      .filter(c => !c.passed)
      .map(c => {
        const name = c.guildName || c.guildId;
        if (c.reason === 'not_in_guild') return `未加入${name}`;
        if (c.reason === 'missing_role') return `${name}缺少必要身分組`;
        if (c.reason === 'cannot_read_member') return `無法讀取${name}成員資訊`;
        return `${name}: ${c.reason}`;
      });
    message = '不符合驗證條件：' + failedReasons.join('；');
  }

  return { success: allPassed, message, checks };
}
