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
        case "/alive":
          return this.handleAlive(request);
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
    const config = await this.state.storage.get("config");
    if (!config) {
      return json({ error: "尚未同步設定" }, 400);
    }

    // 選一個角色
    const character = config.characters[0];
    if (!character) {
      return json({ error: "沒有角色資料" }, 400);
    }

    // 呼叫 AI
    const content = await this.callAI(config, character);

    // 存入離線訊息
    await this.appendMessage(character, content);

    // 推送
    await this.pushNotifications(config, character, content);

    return json({ ok: true, content, characterName: character.name });
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
    const payload = JSON.stringify({
      type: "cloud-push-message",
      characterId: character.id,
      characterName: character.name,
      content: content.slice(0, 200),
      timestamp: Date.now(),
    });

    // 用 @block65/webcrypto-web-push 建構加密 payload
    const { headers, body, endpoint } = await buildPushPayload(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      {
        data: payload,
        urgency: "normal",
        ttl: 86400, // 24 小時
      },
      {
        subject: this.env.VAPID_SUBJECT || "mailto:push@aguaphone.app",
        publicKey: this.env.VAPID_PUBLIC_KEY,
        privateKey: this.env.VAPID_PRIVATE_KEY,
      },
    );

    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
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
    const testSchedule = { ...schedule };
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
