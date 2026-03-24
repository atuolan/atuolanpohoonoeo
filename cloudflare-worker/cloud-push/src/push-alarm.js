/**
 * PushAlarmDO — Durable Object
 * 每個用戶一個實例，負責定時呼叫 AI、暫存訊息、推送通知
 */

import { sendDM } from "./discord.js";
import { buildPushPayload } from "@block65/webcrypto-web-push";

// Re-export VAPID public key so the main worker can serve it to clients
export const VAPID_PUBLIC_KEY_HEADER = "X-Vapid-Public-Key";

export class PushAlarmDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      switch (path) {
        case "/sync":
          return this.handleSync(request);
        case "/status":
          return this.handleStatus();
        case "/messages":
          return this.handleMessages();
        case "/ack":
          return this.handleAck();
        case "/disable":
          return this.handleDisable();
        case "/test":
          return this.handleTest();
        case "/subscribe":
          return this.handleSubscribe(request);
        case "/notify":
          return this.handleNotify(request);
        case "/test-webpush":
          return this.handleTestWebPush();
        case "/alive":
          return this.handleAlive(request);
        case "/debug":
          return this.handleDebug();
        default:
          return json({ error: "Not Found" }, 404);
      }
    } catch (e) {
      console.error(`[PushAlarmDO] ${path} error:`, e);
      return json({ error: e.message }, 500);
    }
  }

  // ─── POST /sync ──────────────────────────────────────────────

  async handleSync(request) {
    const payload = await request.json();

    // 如果角色列表為空，直接停用而不是設 alarm
    if (!payload.characters || payload.characters.length === 0) {
      await this.state.storage.put('config', payload);
      await this.state.storage.put('enabled', false);
      await this.state.storage.deleteAlarm();
      console.log('[PushAlarmDO] sync 收到空角色列表，已自動停用');
      return json({ ok: true, nextAlarm: null, nextAlarmReadable: null, disabled: true });
    }

    // 儲存設定
    await this.state.storage.put("config", payload);
    await this.state.storage.put("enabled", true);
    await this.state.storage.put("errorCount", 0);
    await this.state.storage.put("lastCharacterIndex", -1);

    // 設定下次 alarm
    const nextMs = this.calculateNextAlarm(payload.schedule);
    await this.state.storage.setAlarm(nextMs);

    return json({
      ok: true,
      nextAlarm: nextMs,
      nextAlarmReadable: new Date(nextMs).toISOString(),
    });
  }

  // ─── GET /status ─────────────────────────────────────────────

  async handleStatus() {
    const [enabled, config, pendingMessages, lastTriggeredAt] =
      await Promise.all([
        this.state.storage.get("enabled"),
        this.state.storage.get("config"),
        this.state.storage.get("pendingMessages"),
        this.state.storage.get("lastTriggeredAt"),
      ]);

    const alarm = await this.state.storage.getAlarm();

    return json({
      enabled: enabled ?? false,
      hasConfig: !!config,
      nextAlarm: alarm || null,
      nextAlarmReadable: alarm ? new Date(alarm).toISOString() : null,
      pendingMessageCount: (pendingMessages || []).length,
      pushChannels: config?.pushChannels || [],
      lastTriggeredAt: lastTriggeredAt || null,
    });
  }

  // ─── GET /messages ───────────────────────────────────────────

  async handleMessages() {
    const messages = (await this.state.storage.get("pendingMessages")) || [];
    return json({ messages });
  }

  // ─── POST /ack ───────────────────────────────────────────────

  async handleAck() {
    await this.state.storage.put("pendingMessages", []);
    return json({ ok: true });
  }

  // ─── POST /disable ───────────────────────────────────────────

  async handleDisable() {
    await this.state.storage.put("enabled", false);
    await this.state.storage.deleteAlarm();
    return json({ ok: true });
  }

  // ─── POST /test ──────────────────────────────────────────────

  async handleTest() {
    console.log("[PushAlarmDO] /test 開始");
    const config = await this.state.storage.get("config");
    if (!config) {
      return json({ error: "尚未同步設定" }, 400);
    }

    // 選一個角色
    const character = config.characters[0];
    if (!character) {
      return json({ error: "沒有角色資料" }, 400);
    }

    console.log("[PushAlarmDO] /test 角色:", character.name);
    console.log("[PushAlarmDO] /test pushChannels:", config.pushChannels);

    // 檢查 Web Push 訂閱狀態
    const subscription = await this.state.storage.get("pushSubscription");
    console.log("[PushAlarmDO] /test pushSubscription:", {
      exists: !!subscription,
      endpoint: subscription?.endpoint?.slice(0, 100),
    });

    // 檢查 VAPID 金鑰
    console.log("[PushAlarmDO] /test VAPID:", {
      hasPublicKey: !!this.env.VAPID_PUBLIC_KEY,
      hasPrivateKey: !!this.env.VAPID_PRIVATE_KEY,
      privateKeyType: typeof this.env.VAPID_PRIVATE_KEY,
      hasSubject: !!this.env.VAPID_SUBJECT,
    });

    // 呼叫 AI
    const content = await this.callAI(config, character);
    console.log("[PushAlarmDO] /test AI 回應長度:", content.length);

    // 存入離線訊息
    await this.appendMessage(character, content);

    // 推送
    await this.pushNotifications(config, character, content);

    return json({ ok: true, content, characterName: character.name });
  }

  // ─── GET /debug — 診斷端點 ──────────────────────────────────

  async handleDebug() {
    const subscription = await this.state.storage.get("pushSubscription");
    const config = await this.state.storage.get("config");
    const enabled = await this.state.storage.get("enabled");

    return json({
      enabled: enabled ?? false,
      hasConfig: !!config,
      pushChannels: config?.pushChannels || [],
      characterCount: config?.characters?.length || 0,
      vapid: {
        hasPublicKey: !!this.env.VAPID_PUBLIC_KEY,
        publicKeyLength: this.env.VAPID_PUBLIC_KEY?.length || 0,
        hasPrivateKey: !!this.env.VAPID_PRIVATE_KEY,
        privateKeyLength: this.env.VAPID_PRIVATE_KEY?.length || 0,
        privateKeyPreview: this.env.VAPID_PRIVATE_KEY
          ? this.env.VAPID_PRIVATE_KEY.slice(0, 10) + "..."
          : null,
        subject: this.env.VAPID_SUBJECT || null,
      },
      subscription: subscription
        ? {
            endpoint: subscription.endpoint,
            hasP256dh: !!subscription.keys?.p256dh,
            p256dhLength: subscription.keys?.p256dh?.length || 0,
            hasAuth: !!subscription.keys?.auth,
            authLength: subscription.keys?.auth?.length || 0,
          }
        : null,
    });
  }

  // ─── POST /test-webpush — 純 Web Push 測試（不需角色/AI） ───

  async handleTestWebPush() {
    console.log("[PushAlarmDO] /test-webpush 開始");

    const subscription = await this.state.storage.get("pushSubscription");
    if (!subscription) {
      return json({ error: "尚未訂閱 Web Push，請先在設定頁啟用瀏覽器推送並同步" }, 400);
    }

    console.log("[PushAlarmDO] /test-webpush subscription:", {
      endpoint: subscription.endpoint?.slice(0, 100),
      hasKeys: !!subscription.keys,
    });
    console.log("[PushAlarmDO] /test-webpush VAPID:", {
      hasPublicKey: !!this.env.VAPID_PUBLIC_KEY,
      publicKeyLength: this.env.VAPID_PUBLIC_KEY?.length,
      hasPrivateKey: !!this.env.VAPID_PRIVATE_KEY,
      privateKeyLength: this.env.VAPID_PRIVATE_KEY?.length,
      subject: this.env.VAPID_SUBJECT,
    });

    try {
      await this.sendWebPush(
        subscription,
        { id: "test", name: "系統測試" },
        "這是一條 Web Push 測試通知 🎉",
      );
      return json({ ok: true, message: "Web Push 測試通知已發送" });
    } catch (e) {
      console.error("[PushAlarmDO] /test-webpush 失敗:", e.message, e.stack);
      if (e.statusCode === 410 || e.statusCode === 404) {
        await this.state.storage.delete("pushSubscription");
        return json({ error: "Push subscription 已失效，已清除，請重新同步", expired: true }, 410);
      }
      return json({ error: e.message }, 500);
    }
  }

  // ─── POST /alive — 本地存活心跳 ─────────────────────────────

  async handleAlive(request) {
    const body = await request.json().catch(() => ({}));
    const ts = body.lastClientAliveAt || Date.now();
    await this.state.storage.put("lastClientAliveAt", ts);
    return json({ ok: true });
  }

  // ─── POST /subscribe — Web Push 訂閱註冊 ────────────────────

  async handleSubscribe(request) {
    const { subscription } = await request.json();

    // 基本驗證
    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return json(
        { error: "無效的 Push Subscription：缺少 endpoint 或 keys" },
        400,
      );
    }

    await this.state.storage.put("pushSubscription", subscription);
    return json({ ok: true });
  }

  // ─── POST /notify — 本地觸發 Web Push 通知（不生成 AI） ─────

  async handleNotify(request) {
    console.log("[PushAlarmDO] /notify 收到請求");
    const body = await request.json();
    const { characterName, characterId, content } = body;
    console.log("[PushAlarmDO] /notify 參數:", { characterName, characterId, contentLength: content?.length });

    if (!characterName || !content) {
      console.warn("[PushAlarmDO] /notify 缺少必要參數");
      return json({ error: "缺少 characterName 或 content" }, 400);
    }

    const subscription = await this.state.storage.get("pushSubscription");
    console.log("[PushAlarmDO] /notify pushSubscription:", {
      exists: !!subscription,
      endpoint: subscription?.endpoint?.slice(0, 80),
      hasKeys: !!subscription?.keys,
    });

    if (!subscription) {
      return json({ error: "尚未訂閱 Web Push" }, 400);
    }

    // 檢查 VAPID 金鑰
    console.log("[PushAlarmDO] /notify VAPID 檢查:", {
      hasPublicKey: !!this.env.VAPID_PUBLIC_KEY,
      publicKeyLength: this.env.VAPID_PUBLIC_KEY?.length,
      hasPrivateKey: !!this.env.VAPID_PRIVATE_KEY,
      privateKeyLength: this.env.VAPID_PRIVATE_KEY?.length,
      hasSubject: !!this.env.VAPID_SUBJECT,
    });

    try {
      await this.sendWebPush(
        subscription,
        { id: characterId || "unknown", name: characterName },
        content,
      );
      console.log("[PushAlarmDO] /notify Web Push 發送成功");
      return json({ ok: true });
    } catch (e) {
      console.error("[PushAlarmDO] /notify Web Push 發送失敗:", e.message, e.stack);
      // 訂閱失效時清除
      if (e.statusCode === 410 || e.statusCode === 404) {
        await this.state.storage.delete("pushSubscription");
        return json({ error: "Push subscription 已失效，已清除", expired: true }, 410);
      }
      return json({ error: e.message }, 500);
    }
  }

  // ─── Alarm handler ──────────────────────────────────────────

  async alarm() {
    const enabled = await this.state.storage.get("enabled");
    if (!enabled) return;

    const config = await this.state.storage.get("config");
    if (!config) return;

    // 檢查 DND
    if (this.isInDND(config.schedule)) {
      const dndEnd = this.getDNDEndMs(config.schedule);
      await this.state.storage.setAlarm(dndEnd);
      console.log(
        `[PushAlarmDO] 在免打擾時段，下次 alarm: ${new Date(dndEnd).toISOString()}`,
      );
      return;
    }


    // 檢查本地是否仍存活（後台模式）：若距上次心跳 < 間隔時間，代表本地還在跑，跳過雲端生成
    const lastClientAliveAt = await this.state.storage.get('lastClientAliveAt');
    if (lastClientAliveAt) {
      const intervalMs = (config.schedule.intervalMinutes || 60) * 60 * 1000;
      const elapsed = Date.now() - lastClientAliveAt;
      if (elapsed < intervalMs) {
        console.log(`[PushAlarmDO] 本地仍存活（${Math.round(elapsed / 1000)}s 前心跳），跳過雲端生成`);
        const nextMs = this.calculateNextAlarm(config.schedule);
        await this.state.storage.setAlarm(nextMs);
        return;
      }
    }
    // 角色列表為空時自動停用（角色可能已被刪除但前端未及時 sync）
    if (!config.characters || config.characters.length === 0) {
      console.warn('[PushAlarmDO] 角色列表為空，自動停用雲端推送');
      await this.state.storage.put('enabled', false);
      await this.state.storage.deleteAlarm();
      return;
    }

    // 選擇角色（round-robin）
    let lastIdx = (await this.state.storage.get("lastCharacterIndex")) ?? -1;
    const nextIdx = (lastIdx + 1) % config.characters.length;
    const character = config.characters[nextIdx];
    await this.state.storage.put("lastCharacterIndex", nextIdx);

    try {
      // 呼叫 AI
      const content = await this.callAI(config, character);

      // 存入離線訊息
      await this.appendMessage(character, content);

      // 推送通知
      await this.pushNotifications(config, character, content);

      // 成功，重置錯誤計數
      await this.state.storage.put("errorCount", 0);
      await this.state.storage.put("lastTriggeredAt", Date.now());

      console.log(`[PushAlarmDO] 成功推送 ${character.name} 的訊息`);
    } catch (e) {
      console.error(`[PushAlarmDO] alarm 錯誤:`, e);
      const errorCount =
        ((await this.state.storage.get("errorCount")) || 0) + 1;
      await this.state.storage.put("errorCount", errorCount);

      if (errorCount >= 10) {
        // 自動停用
        await this.state.storage.put("enabled", false);
        console.error(`[PushAlarmDO] 連續 ${errorCount} 次錯誤，已自動停用`);
        return;
      }

      // 退避排程
      const backoffMs = this.getBackoffMs(errorCount);
      await this.state.storage.setAlarm(Date.now() + backoffMs);
      console.warn(
        `[PushAlarmDO] 錯誤 #${errorCount}，${backoffMs / 1000}s 後重試`,
      );
      return;
    }

    // 排程下次 alarm
    const nextMs = this.calculateNextAlarm(config.schedule);
    await this.state.storage.setAlarm(nextMs);
  }

  // ─── AI 呼叫 ─────────────────────────────────────────────────

  async callAI(config, character) {
    const { apiSettings, userName } = config;
    const endpoint = apiSettings.endpoint.replace(/\/+$/, "");
    const url = `${endpoint}/chat/completions`;

    // ── System prompt ──────────────────────────────────────────
    const parts = [];
    if (character.personality) parts.push(character.personality);
    if (character.systemPrompt) parts.push(character.systemPrompt);

    // 總結記憶
    if (character.recentSummaries?.length) {
      parts.push(
        "<summaries>\n" +
          character.recentSummaries
            .map((s, i) => `[總結 ${i + 1}] ${s}`)
            .join("\n") +
          "\n</summaries>",
      );
    }

    // 表情包列表
    const stickerList = character.stickerNames?.length
      ? character.stickerNames.join("\n")
      : "（無可用表情包）";

    // 線上聊天規則
    parts.push(
      `<online_chat_rules>\n` +
        `${userName}：線上模式有什麼特別的規則嗎？\n` +
        `基拉祈：有的！這是手機聊天，所以：\n` +
        `基拉祈：不能用 *動作* 描寫——你們看不見彼此，只能透過文字感受情緒。\n` +
        `基拉祈：主動推動對話，不要原地打轉。\n` +
        `基拉祈：好了，${userName}，我們準備好了！在開始之前，讓我們做個承諾。\n` +
        `雪拉比：我們會完整走完流程，不跳步。\n` +
        `基拉祈：我們會讓你和 ${character.name} 平等閃耀，真實互動。角色卡裡的特殊描寫要求，我們會當作核心來實現。\n` +
        `【規則】\n` +
        `- 表情包格式：\`[sticker:表情包名称]\` 例如：\`[sticker:开心]\`\n` +
        `- 訊息格式：<msg></msg> 包裹\n` +
        `- 第一條訊息必須包含 ˇ想法ˇ\n` +
        `- 直接接續下文，不要重複 ${userName} 說過的話\n` +
        `【訊息數量】\n` +
        `- 簡單回應：1-2 條訊息\n` +
        `- 普通對話：2-4 條訊息\n` +
        `- 複雜情境：4-8 條訊息\n` +
        `- 可以用表情符號、語氣詞、省略號...這些都是線上聊天的特色。\n` +
        `</online_chat_rules>`,
    );

    parts.push(
      `<sticker_list>\n` +
        `${userName}：有哪些表情包可以用？\n\n` +
        `可用表情包名稱：\n${stickerList}\n\n` +
        `雪拉比：記住，只能用這個列表裡的表情包名稱哦！\n` +
        `基拉祈：而且要根據 ${character.name} 的性格來決定用不用、用多少～\n` +
        `</sticker_list>`,
    );

    const systemContent = parts.join("\n\n");

    // ── 聊天紀錄 + 觸發指令 ───────────────────────────────────
    const historyMessages = (character.recentMessages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const triggerPrompt = `[系統指令] 請以 ${character.name} 的身份，根據以上對話歷史，主動向 ${userName} 發起一段自然的對話。像是你自己想到要說的話，不要提及這是系統要求的。如果是深夜時段，可以假設用戶已經入睡，但你想分享事情。`;

    const body = {
      model: apiSettings.model,
      temperature: apiSettings.temperature ?? 0.7,
      max_tokens: apiSettings.maxTokens ?? 8192,
      messages: [
        { role: "system", content: systemContent },
        ...historyMessages,
        { role: "user", content: triggerPrompt },
      ],
    };

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiSettings.apiKey}`,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI API 錯誤 (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AI 回應為空");
    }
    return content.trim();
  }

  // ─── 訊息暫存 ────────────────────────────────────────────────

  async appendMessage(character, content) {
    const messages = (await this.state.storage.get("pendingMessages")) || [];

    // 將 <msg> 標籤拆成多條獨立訊息（前端每條 = 一個氣泡）
    const msgParts = content.match(/<msg>([\s\S]*?)<\/msg>/g);
    const parts = msgParts
      ? msgParts.map((m) => m.replace(/<\/?msg>/g, "").trim()).filter(Boolean)
      : [content.replace(/<\/?msg>/g, "").trim()]; // 沒有 <msg> 標籤就整段當一條

    const now = Date.now();
    for (let i = 0; i < parts.length; i++) {
      messages.push({
        id: crypto.randomUUID(),
        characterId: character.id,
        characterName: character.name,
        content: parts[i],
        createdAt: now + i, // 微小時間差確保排序正確
      });
    }

    // 最多保留 50 條（FIFO）
    while (messages.length > 50) {
      messages.shift();
    }

    await this.state.storage.put("pendingMessages", messages);
  }

  // ─── 推送通知 ────────────────────────────────────────────────

  async pushNotifications(config, character, content) {
    const channels = config.pushChannels || [];
    console.log("[PushAlarmDO] pushNotifications 開始:", {
      channels,
      characterName: character.name,
      contentLength: content.length,
      hasDiscordUserId: !!config.discordUserId,
    });

    // Discord DM
    if (channels.includes("discord") && config.discordUserId) {
      try {
        const botToken = this.env.DISCORD_BOT_TOKEN;
        if (botToken) {
          await sendDM(botToken, config.discordUserId, character.name, content);
        } else {
          console.warn("[PushAlarmDO] DISCORD_BOT_TOKEN 未設定");
        }
      } catch (e) {
        console.error("[PushAlarmDO] Discord DM 失敗:", e);
        // 不中斷流程
      }
    }

    // Web Push
    if (channels.includes("webpush")) {
      const subscription = await this.state.storage.get("pushSubscription");
      if (subscription) {
        try {
          await this.sendWebPush(subscription, character, content);
        } catch (e) {
          console.error("[PushAlarmDO] Web Push 失敗:", e);
          // 410 Gone = 訂閱已失效，清除
          if (e.statusCode === 410 || e.statusCode === 404) {
            await this.state.storage.delete("pushSubscription");
            console.warn("[PushAlarmDO] Push subscription 已失效，已清除");
          }
        }
      }
    }
  }

  // ─── Web Push 發送 ───────────────────────────────────────────

  async sendWebPush(subscription, character, content) {
    console.log("[PushAlarmDO] sendWebPush 開始:", {
      characterName: character.name,
      endpoint: subscription.endpoint?.slice(0, 80),
      hasP256dh: !!subscription.keys?.p256dh,
      hasAuth: !!subscription.keys?.auth,
      hasVapidPublicKey: !!this.env.VAPID_PUBLIC_KEY,
      hasVapidPrivateKey: !!this.env.VAPID_PRIVATE_KEY,
      vapidPrivateKeyLength: this.env.VAPID_PRIVATE_KEY?.length || 0,
      hasVapidSubject: !!this.env.VAPID_SUBJECT,
    });

    // 檢查 VAPID 私鑰是否存在
    if (!this.env.VAPID_PRIVATE_KEY) {
      throw new Error("VAPID_PRIVATE_KEY 未設定！請執行: wrangler secret put VAPID_PRIVATE_KEY");
    }

    const payloadData = {
      type: "cloud-push-message",
      characterId: character.id,
      characterName: character.name,
      content: content.slice(0, 200),
      timestamp: Date.now(),
    };

    // @block65/webcrypto-web-push 的 buildPushPayload 簽名：
    // buildPushPayload(message, subscription, vapid)
    //   message = { data: Jsonifiable, options?: { ttl, urgency, topic } }
    //   subscription = { endpoint, keys: { auth, p256dh } }
    //   vapid = { subject, publicKey, privateKey }
    //     privateKey = JWK 的 d 值（Base64URL 字串），不是完整 JWK JSON
    //
    // 回傳 { headers, method, body }（不含 endpoint！需自行用 subscription.endpoint）

    console.log("[PushAlarmDO] buildPushPayload 參數:", {
      endpoint: subscription.endpoint,
      vapidSubject: this.env.VAPID_SUBJECT,
    });

    let pushResult;
    try {
      pushResult = await buildPushPayload(
        // 第一個參數：message
        {
          data: payloadData,
          options: {
            urgency: "normal",
            ttl: 86400,
          },
        },
        // 第二個參數：subscription
        {
          endpoint: subscription.endpoint,
          expirationTime: null,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
        // 第三個參數：vapid
        {
          subject: this.env.VAPID_SUBJECT || "mailto:push@aguaphone.app",
          publicKey: this.env.VAPID_PUBLIC_KEY,
          privateKey: this.env.VAPID_PRIVATE_KEY,
        },
      );
      console.log("[PushAlarmDO] buildPushPayload 成功");
    } catch (buildErr) {
      console.error("[PushAlarmDO] buildPushPayload 失敗:", buildErr.message, buildErr.stack);
      throw buildErr;
    }

    const { headers, body } = pushResult;

    console.log("[PushAlarmDO] 準備 fetch 推送服務:", {
      endpoint: subscription.endpoint,
      headerKeys: Object.keys(headers || {}),
    });

    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers,
      body,
    });

    console.log("[PushAlarmDO] 推送服務回應:", {
      status: res.status,
      statusText: res.statusText,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[PushAlarmDO] Web Push 失敗回應內容:", errText.slice(0, 500));
      const err = new Error(
        `Web Push 失敗 (${res.status}): ${errText.slice(0, 200)}`,
      );
      err.statusCode = res.status;
      throw err;
    }

    console.log(`[PushAlarmDO] Web Push 成功: ${character.name}`);
  }

  // ─── DND 計算 ────────────────────────────────────────────────

  /**
   * 判斷當前是否在免打擾時段
   * 使用 timezoneOffset 將伺服器 UTC 時間轉為用戶本地時間
   */
  isInDND(schedule) {
    if (!schedule.doNotDisturbEnabled) return false;

    const now = new Date();
    // timezoneOffset: 正值 = UTC 之後（如 UTC-8 → +480），但 JS getTimezoneOffset 的定義是：
    // local time = UTC - offset，所以 UTC+8 → offset = -480
    // 我們存的是 new Date().getTimezoneOffset()，所以 userLocalTime = UTC - offset
    const userLocalMs = now.getTime() - schedule.timezoneOffset * 60 * 1000;
    const userLocal = new Date(userLocalMs);
    const userMinutes =
      userLocal.getUTCHours() * 60 + userLocal.getUTCMinutes();

    const [startH, startM] = schedule.doNotDisturbStart.split(":").map(Number);
    const [endH, endM] = schedule.doNotDisturbEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // 不跨午夜：例如 08:00 ~ 17:00
      return userMinutes >= startMinutes && userMinutes < endMinutes;
    } else {
      // 跨午夜：例如 23:00 ~ 08:00
      return userMinutes >= startMinutes || userMinutes < endMinutes;
    }
  }

  /**
   * 計算 DND 結束的 UTC 毫秒
   */
  getDNDEndMs(schedule) {
    const now = new Date();
    const userLocalMs = now.getTime() - schedule.timezoneOffset * 60 * 1000;
    const userLocal = new Date(userLocalMs);

    const [endH, endM] = schedule.doNotDisturbEnd.split(":").map(Number);

    // 建立 DND 結束的用戶本地時間（今天）
    const endLocal = new Date(userLocal);
    endLocal.setUTCHours(endH, endM, 0, 0);

    // 如果結束時間已過，加一天
    if (endLocal.getTime() <= userLocalMs) {
      endLocal.setUTCDate(endLocal.getUTCDate() + 1);
    }

    // 轉回 UTC
    return endLocal.getTime() + schedule.timezoneOffset * 60 * 1000;
  }

  // ─── 排程計算 ────────────────────────────────────────────────

  calculateNextAlarm(schedule) {
    const intervalMs = (schedule.intervalMinutes || 60) * 60 * 1000;
    const nextMs = Date.now() + intervalMs;

    // 如果下次觸發在 DND 內，跳到 DND 結束
    // 建立模擬時間檢查
    const futureDate = new Date(nextMs);
    const futureUserLocalMs =
      futureDate.getTime() - schedule.timezoneOffset * 60 * 1000;
    const futureUserLocal = new Date(futureUserLocalMs);
    const futureMinutes =
      futureUserLocal.getUTCHours() * 60 + futureUserLocal.getUTCMinutes();

    if (schedule.doNotDisturbEnabled) {
      const [startH, startM] = schedule.doNotDisturbStart
        .split(":")
        .map(Number);
      const [endH, endM] = schedule.doNotDisturbEnd.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const endMin = endH * 60 + endM;

      let inDND;
      if (startMin <= endMin) {
        inDND = futureMinutes >= startMin && futureMinutes < endMin;
      } else {
        inDND = futureMinutes >= startMin || futureMinutes < endMin;
      }

      if (inDND) {
        return this.getDNDEndMs(schedule);
      }
    }

    return nextMs;
  }

  // ─── 退避計算 ────────────────────────────────────────────────

  getBackoffMs(errorCount) {
    if (errorCount <= 1) return 5 * 60 * 1000; // 5 分鐘
    if (errorCount === 2) return 15 * 60 * 1000; // 15 分鐘
    if (errorCount === 3) return 60 * 60 * 1000; // 1 小時
    return 6 * 60 * 60 * 1000; // 6 小時
  }
}

// ─── 工具函數 ──────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
