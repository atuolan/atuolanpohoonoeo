/**
 * 角色主動發訊息服務
 * 負責管理角色的主動發訊息功能，包括定時檢查、夜間免打擾等
 */

import {
  incrementLocalChatUnreadCount,
  createChatRecord,
  loadChatById,
  refreshChatDerivedMetadata,
  saveChatMetadata,
} from "@/storage/chatStorage";
import { appendMessages, loadMessages } from "@/storage/chatMessageStorage";
import { useCharactersStore } from "@/stores/characters";
import { useChatStore } from "@/stores/chat";
import { pushNotificationService } from "./PushNotificationService";

export interface ProactiveMessageSettings {
  enabled: boolean;
  intervalMinutes: number;
  lastSentTime?: number;
  nextScheduledTime?: number;
  doNotDisturbEnabled: boolean;
  doNotDisturbStart: string;
  doNotDisturbEnd: string;
  showNotification: boolean;
}

export class ProactiveMessageService {
  private static instance: ProactiveMessageService;
  private checkInterval: number | null = null;
  /** 正在處理中的角色 ID 集合，防止同一角色重複觸發 API 呼叫 */
  private pendingCharacters: Set<string> = new Set();
  /** 防止初始檢查邏輯被多次觸發 */
  private initialCheckStarted = false;
  /** 當前用戶正在聊天的角色 ID（在聊天頁面時不觸發主動發訊） */
  private activeChatCharacterId: string | null = null;
  /** 頁面可見性變化的監聽器 */
  private visibilityHandler: (() => void) | null = null;

  private constructor() {}

  /**
   * 通知 UI 層該聊天有新訊息（讓開著的 ChatScreen 即時 reload）
   */
  private _emitChatUpdated(chatId: string) {
    try {
      window.dispatchEvent(
        new CustomEvent("aguaphone:chat-messages-appended", {
          detail: { chatId },
        }),
      );
    } catch {
      // 忽略（非瀏覽器環境 / 測試環境）
    }
  }

  static getInstance(): ProactiveMessageService {
    if (!ProactiveMessageService.instance) {
      ProactiveMessageService.instance = new ProactiveMessageService();
    }
    return ProactiveMessageService.instance;
  }

  /**
   * 啟動定時檢查
   */
  start() {
    if (this.checkInterval) {
      console.log("[ProactiveMessage] Service already started");
      return;
    }

    console.log("[ProactiveMessage] Service starting...");

    // 每分鐘檢查一次
    this.checkInterval = window.setInterval(() => {
      this.checkAllCharacters();
    }, 60000);

    // 防止初始檢查邏輯被多次觸發（toggleEnabled / triggerNow 都會呼叫 start()）
    if (this.initialCheckStarted) {
      console.log(
        "[ProactiveMessage] Initial check already started, skipping retry logic",
      );
      return;
    }
    this.initialCheckStarted = true;

    // 延遲首次檢查，等待 characters 載入
    // 使用更積極的重試策略
    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 2000; // 2 秒

    const initialCheck = () => {
      const characterStore = useCharactersStore();

      if (characterStore.characters && characterStore.characters.length > 0) {
        console.log("[ProactiveMessage] Characters loaded, starting checks");
        this.checkAllCharacters();
      } else if (retryCount < maxRetries) {
        retryCount++;
        console.log(
          `[ProactiveMessage] Waiting for characters to load... (attempt ${retryCount}/${maxRetries})`,
        );
        setTimeout(initialCheck, retryInterval);
      } else {
        console.warn(
          "[ProactiveMessage] Characters not loaded after max retries, will check on next interval",
        );
      }
    };

    // 延遲 1 秒後開始首次檢查
    setTimeout(initialCheck, 1000);

    console.log("[ProactiveMessage] Service started");
  }

  /**
   * 停止定時檢查
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log("[ProactiveMessage] Service stopped");
    }
  }

  /**
   * 檢查所有角色
   */
  private async checkAllCharacters() {
    try {
      const characterStore = useCharactersStore();

      // 確保 characters 已載入
      if (
        !characterStore.characters ||
        characterStore.characters.length === 0
      ) {
        console.log("[ProactiveMessage] Characters not loaded yet, waiting...");
        return;
      }

      const now = Date.now();
      let checkedCount = 0;
      let enabledCount = 0;

      for (const character of characterStore.characters) {
        const settings = character.proactiveMessageSettings;
        if (!settings?.enabled) continue;

        enabledCount++;
        checkedCount++;

        // 跳過用戶當前正在聊天的角色（用戶在線上，不需要主動發訊）
        if (this.activeChatCharacterId === character.id) {
          console.log(
            `[ProactiveMessage] Character ${character.id} 用戶正在聊天中，跳過主動發訊`,
          );
          continue;
        }

        // 檢查是否該發送（跳過正在處理中的角色，防止重複 API 呼叫）
        if (this.pendingCharacters.has(character.id)) {
          console.log(
            `[ProactiveMessage] Character ${character.id} is already being processed, skipping`,
          );
          continue;
        }
        if (this.shouldSendMessage(settings, now)) {
          // 檢查封鎖狀態：被封鎖的角色不發送主動訊息
          try {
            const { shouldBlockProactiveMessage } = await import("@/services/BlockService");
            const { db: blockDb, DB_STORES: blockStores } = await import("@/db/database");
            const charChats = (await blockDb.getAll<any>(blockStores.CHATS))
              .filter((c: any) => c.characterId === character.id && !c.isGroupChat);
            const blocked = charChats.some((c: any) => shouldBlockProactiveMessage(c));
            if (blocked) {
              console.log(`[ProactiveMessage] 角色 ${character.id} 處於封鎖狀態，跳過主動發訊`);
              continue;
            }
          } catch (err) {
            console.warn('[ProactiveMessage] 封鎖狀態檢查失敗，繼續發送:', err);
          }
          await this.sendProactiveMessage(character.id, settings);
        }
      }

      if (checkedCount > 0) {
        console.log(
          `[ProactiveMessage] Checked ${checkedCount} characters with proactive messaging enabled (${enabledCount} total enabled)`,
        );
      }
    } catch (error) {
      console.error("[ProactiveMessage] Error checking characters:", error);
    }
  }

  /**
   * 判斷是否該發送訊息
   */
  private shouldSendMessage(
    settings: ProactiveMessageSettings,
    now: number,
  ): boolean {
    // 檢查是否在夜間免打擾時段
    if (this.isInDoNotDisturbTime(settings)) {
      return false;
    }

    // 檢查時間間隔
    const nextTime = settings.nextScheduledTime || 0;
    return now >= nextTime;
  }

  /**
   * 判斷是否在夜間免打擾時段
   */
  private isInDoNotDisturbTime(settings: ProactiveMessageSettings): boolean {
    if (!settings.doNotDisturbEnabled) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startH, startM] = settings.doNotDisturbStart.split(":").map(Number);
    const [endH, endM] = settings.doNotDisturbEnd.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // 處理跨日情況（例如 22:00 - 08:00）
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * 立即發送主動訊息（公開方法，用於測試按鈕）
   */
  async sendProactiveMessageNow(characterId: string) {
    const settings = this.getSettings(characterId);
    if (!settings) {
      console.warn(
        "[ProactiveMessage] No settings found for character:",
        characterId,
      );
      return;
    }

    // 直接調用私有方法發送訊息
    await this.sendProactiveMessage(characterId, settings);
  }

  /**
   * 封鎖系統專用：觸發角色主動發一條訊息
   * 不依賴 proactiveMessageSettings，即使角色沒開主動訊息也能發
   *
   * 回傳 { ok, reason }：
   * - ok=true 表示 AI 確實在最近的聊天中追加了至少一條訊息
   * - ok=false 表示 sendProactiveMessage 因 silent return（API key 缺、並發、通話中、空回應…）
   *   或內部錯誤而沒寫入訊息；reason 帶上可能原因方便日誌排查
   */
  async sendBlockedProactiveMessage(
    characterId: string,
  ): Promise<{ ok: boolean; reason?: string }> {
    // 使用臨時 settings，不影響正常排程
    const tempSettings: ProactiveMessageSettings = {
      enabled: true,
      intervalMinutes: 15,
      doNotDisturbEnabled: false,
      doNotDisturbStart: '00:00',
      doNotDisturbEnd: '06:00',
      showNotification: true,
    }

    // 先找出該角色最近的單聊（同 sendProactiveMessage 內部邏輯），記下訊息數
    let chatId = ''
    let beforeCount = 0
    try {
      const { db, DB_STORES } = await import('@/db/database')
      const { getMessageCount } = await import('@/storage/chatMessageStorage')
      const allChats = await db.getAll<any>(DB_STORES.CHATS)
      const characterChats = allChats
        .filter((c: any) => c.characterId === characterId && !c.isGroupChat)
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
      const targetChat = characterChats[0]
      if (targetChat) {
        chatId = targetChat.id
        beforeCount = await getMessageCount(chatId).catch(() => 0)
      }
    } catch (lookupErr) {
      console.warn('[ProactiveMessage] sendBlockedProactiveMessage: 預檢查找聊天失敗', lookupErr)
    }

    try {
      await this.sendProactiveMessage(characterId, tempSettings)
    } catch (err) {
      return { ok: false, reason: `sendProactiveMessage threw: ${String(err)}` }
    }

    // 對照 messageCount 判斷是否真的追加了訊息
    if (!chatId) {
      // 沒找到既有聊天 → sendProactiveMessage 內部會新建一個 chat，這邊無法精準對照；
      // 退而求其次：再撈一次最新聊天比對
      try {
        const { db, DB_STORES } = await import('@/db/database')
        const { getMessageCount } = await import('@/storage/chatMessageStorage')
        const allChats = await db.getAll<any>(DB_STORES.CHATS)
        const recreated = allChats
          .filter((c: any) => c.characterId === characterId && !c.isGroupChat)
          .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0]
        if (recreated) {
          const cnt = await getMessageCount(recreated.id).catch(() => 0)
          return cnt > 0 ? { ok: true } : { ok: false, reason: 'no message appended' }
        }
        return { ok: false, reason: 'chat not found after send' }
      } catch (postErr) {
        return { ok: false, reason: `post-check failed: ${String(postErr)}` }
      }
    }

    try {
      const { getMessageCount } = await import('@/storage/chatMessageStorage')
      const afterCount = await getMessageCount(chatId).catch(() => beforeCount)
      if (afterCount > beforeCount) return { ok: true }
      return { ok: false, reason: 'no message appended (silent return inside sendProactiveMessage)' }
    } catch (postErr) {
      return { ok: false, reason: `post-check failed: ${String(postErr)}` }
    }
  }

  /**
   * 遊戲遊玩偵測器專用：user 在某遊戲畫面停留滿時間後，
   * 由「最近一次有對話的非群組聊天角色」主動發訊關心遊戲。
   *
   * 不沿用封鎖 / 夜間免打擾 / 通話中 / 活躍 chat 等檢查；
   * 直接照常觸發 sendProactiveMessage（只保留 pendingCharacters 防同角色併發）。
   *
   * @param gameId 遊戲 ID（如 '2048' / 'snake' / 'fishing' ...）
   */
  async sendGamePlayingProactiveMessage(gameId: string) {
    try {
      const { db, DB_STORES } = await import("@/db/database");
      const allChats = await db.getAll<any>(DB_STORES.CHATS);

      // 取最近一次有對話的聊天（包含群聊與單聊，依 updatedAt 排序）
      // 注意：
      // - 普通群聊必須有 groupMetadata.members
      // - 多人卡群聊（isMultiCharCard）成員存在 multiCharMembers，不在 members
      // - 單聊必須有 characterId
      const candidate = allChats
        .filter((c: any) => {
          if (!c) return false;
          if (c.isGroupChat) {
            const gm = c.groupMetadata;
            if (!gm) return false;
            if (gm.isMultiCharCard) {
              return (
                Array.isArray(gm.multiCharMembers) &&
                gm.multiCharMembers.length > 0
              );
            }
            return Array.isArray(gm.members) && gm.members.length > 0;
          }
          return typeof c.characterId === "string" && c.characterId.length > 0;
        })
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

      if (!candidate) {
        console.log(
          "[ProactiveMessage] sendGamePlayingProactiveMessage: 沒有可用的聊天，跳過",
        );
        return;
      }

      // 中文遊戲名稱對照
      const gameNameMap: Record<string, string> = {
        "2048": "2048",
        snake: "貪吃蛇",
        sudoku: "數獨",
        tetris: "俄羅斯方塊",
        fishing: "釣魚",
        dishwashing: "洗碗",
        gambling: "骰子（賭博）",
        merit: "修行（敲木魚／盤佛珠）",
        "food-roulette": "轉轉飯堂",
      };
      const gameName = gameNameMap[gameId] || gameId;

      // 群聊路徑
      if (candidate.isGroupChat) {
        console.log(
          `[ProactiveMessage] sendGamePlayingProactiveMessage 觸發群聊：chatId=${candidate.id}，遊戲=${gameName}`,
        );
        await this._sendGroupChatGamePlayingMessage(candidate, gameName);
        return;
      }

      // 單聊路徑
      const characterId = candidate.characterId as string;
      const characterStore = useCharactersStore();
      if (
        !characterStore.characters ||
        !characterStore.characters.find((c) => c.id === characterId)
      ) {
        console.log(
          `[ProactiveMessage] sendGamePlayingProactiveMessage: 角色 ${characterId} 不存在，跳過`,
        );
        return;
      }

      // 話題引導只負責「請主動發起對話」這個觸發動機；
      // user 在玩什麼遊戲的具體上下文由 PromptBuilder 的 gamePlayingStatus marker 注入。
      const customTopicInstruction = `<request>【話題引導】請主動傳訊息給用戶，根據系統提示中的當前狀態自然地發起對話，就像你剛好想到一樣，符合你的人設與性格。</request>`;

      const tempSettings: ProactiveMessageSettings = {
        enabled: true,
        intervalMinutes: 15,
        doNotDisturbEnabled: false,
        doNotDisturbStart: "00:00",
        doNotDisturbEnd: "06:00",
        showNotification: true,
      };

      console.log(
        `[ProactiveMessage] sendGamePlayingProactiveMessage 觸發單聊：角色=${characterId}，遊戲=${gameName}`,
      );

      await this.sendProactiveMessage(characterId, tempSettings, {
        customTopicInstruction,
        skipScheduleUpdate: true,
        gamePlayingContext: { gameName },
      });
    } catch (err) {
      console.error(
        "[ProactiveMessage] sendGamePlayingProactiveMessage 失敗:",
        err,
      );
    }
  }

  /**
   * 群聊版本的「在玩遊戲」主動關心訊息
   * 簡化版：只處理一般文字訊息（含 sticker / voice），不處理 group-action / dm / 來電請求等複雜標籤
   */
  private async _sendGroupChatGamePlayingMessage(
    groupChat: any,
    gameName: string,
  ): Promise<void> {
    const lockKey = `group:${groupChat.id}`;
    if (this.pendingCharacters.has(lockKey)) {
      console.log(
        "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 群聊已在處理中，跳過",
      );
      return;
    }
    this.pendingCharacters.add(lockKey);

    try {
      const characterStore = useCharactersStore();
      const groupMetadata = groupChat.groupMetadata;
      if (!groupMetadata) {
        console.warn(
          "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 缺少 groupMetadata，跳過",
          { chatId: groupChat.id, name: groupChat.name },
        );
        return;
      }

      const isMultiCharCard = !!groupMetadata.isMultiCharCard;

      // ===== 確認成員存在 =====
      if (isMultiCharCard) {
        if (
          !Array.isArray(groupMetadata.multiCharMembers) ||
          groupMetadata.multiCharMembers.length === 0
        ) {
          console.warn(
            "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 多人卡群聊沒有 multiCharMembers，跳過",
            { chatId: groupChat.id, name: groupChat.name },
          );
          return;
        }
      } else {
        if (
          !Array.isArray(groupMetadata.members) ||
          groupMetadata.members.length === 0
        ) {
          console.warn(
            "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 普通群聊沒有 members，跳過",
            { chatId: groupChat.id, name: groupChat.name },
          );
          return;
        }
      }

      // ===== 解析 lead character 與 groupMembers =====
      // 普通群聊：用第一個非禁言成員當作 PromptBuilder 的 character；groupMembers 由真實角色組成
      // 多人卡：用 chat.characterId（宿主卡）當作 character；groupMembers 不傳，PromptBuilder 走 multiCharMembers 路徑
      let leadCharacter: any = null;
      let groupMembers: any[] | undefined;

      if (isMultiCharCard) {
        const hostId = groupChat.characterId;
        leadCharacter = characterStore.characters.find(
          (c) => c.id === hostId,
        );
        if (!leadCharacter) {
          console.warn(
            "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 多人卡找不到宿主角色（chat.characterId）",
            { chatId: groupChat.id, hostCharacterId: hostId },
          );
          return;
        }
        groupMembers = undefined; // 多人卡走 multiCharMembers 路徑
      } else {
        groupMembers = groupMetadata.members
          .map((m: any) => {
            const ch = characterStore.characters.find(
              (c) => c.id === m.characterId,
            );
            if (!ch) return null;
            return {
              characterId: m.characterId,
              name: ch.nickname || ch.data?.name || m.characterId,
              nickname: m.nickname,
              originalName: ch.data?.name || m.characterId,
              personality: ch.data?.personality || "",
              description: ch.data?.description || "",
              avatar: ch.avatar || "",
              isAdmin: !!m.isAdmin,
              isMuted: !!m.isMuted,
            };
          })
          .filter(Boolean) as any[];

        if (groupMembers.length === 0) {
          console.warn(
            "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 群聊成員都查無資料，跳過",
          );
          return;
        }

        const leadMember =
          groupMembers.find((m) => !m.isMuted) || groupMembers[0];
        leadCharacter = characterStore.characters.find(
          (c) => c.id === leadMember.characterId,
        );
        if (!leadCharacter) {
          console.warn(
            "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 找不到 leadCharacter",
          );
          return;
        }
      }

      // 載入歷史訊息
      const existingMessages = await loadMessages(groupChat.id);

      // 話題引導訊息
      const topicInstruction = `<request>【話題引導】用戶現在正在玩小遊戲。請從群聊成員中挑選 1-2 個合適的角色（非禁言）主動傳訊息給用戶，根據系統提示中的「在玩遊戲狀態」自然地問候並可選擇分享自己的遊戲經驗，符合各自人設。請使用 <msg name="角色名">內容</msg> 格式。</request>`;
      const topicMessage = {
        id: crypto.randomUUID(),
        sender: "user" as const,
        name: "System",
        content: topicInstruction,
        is_user: true,
        status: "sent" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const messagesWithTopic = [...existingMessages, topicMessage];

      // ===== 準備依賴 =====
      const { useSettingsStore } = await import("@/stores/settings");
      const { useUserStore } = await import("@/stores/user");
      const { useLorebooksStore } = await import("@/stores/lorebooks");
      const { usePromptManagerStore } = await import("@/stores/promptManager");
      const settingsStore = useSettingsStore();
      const userStore = useUserStore();
      const lorebooksStore = useLorebooksStore();
      const promptManagerStore = usePromptManagerStore();
      await promptManagerStore.loadConfig();

      const taskConfig = settingsStore.getAPIForTask("chat");
      if (!taskConfig.api.apiKey) {
        console.warn("[ProactiveMessage] API Key not configured");
        return;
      }

      const currentPersona = userStore.currentPersona;
      const characterLorebooks = leadCharacter.data.extensions?.world
        ? lorebooksStore.lorebooks.filter(
            (lb) => lb.id === leadCharacter.data.extensions?.world,
          )
        : [];

      const chatSettings = {
        maxContextLength: taskConfig.generation.maxContextLength,
        maxResponseLength: taskConfig.generation.maxTokens,
        temperature: taskConfig.generation.temperature,
        topP: taskConfig.generation.topP,
        topK: 0,
        frequencyPenalty: taskConfig.generation.frequencyPenalty,
        presencePenalty: taskConfig.generation.presencePenalty,
        repetitionPenalty: 1.0,
        stopSequences: [],
        streaming: false, // 群聊主動關心使用非串流，簡化處理
        useStreamingWindow: false,
      };

      const { PromptBuilder } = await import("@/engine/prompt/PromptBuilder");
      const { loadPromptOverrideForChat } = await import("@/utils/promptOverrideScope");
      const groupChatOverrides = await loadPromptOverrideForChat({
        id: groupChat.id,
        characterId: groupChat.characterId,
        isGroupChat: groupChat.isGroupChat,
        groupMetadata: groupChat.groupMetadata,
        chatVariables: groupChat.chatVariables,
      });
      const promptBuilder = new PromptBuilder({
        character: leadCharacter,
        lorebooks: characterLorebooks,
        messages: messagesWithTopic,
        settings: chatSettings,
        userName: currentPersona?.name || "User",
        userPersona: currentPersona?.description,
        userSecrets: currentPersona?.secrets,
        powerDynamic: currentPersona?.powerDynamic,
        promptManagerConfig: promptManagerStore.config,
        chatPromptToggles: groupChatOverrides.chatPromptToggles,
        chatLocalPrompts: groupChatOverrides.chatLocalPrompts,
        enableRealTimeAwareness: groupChat.enableRealTimeAwareness !== false,
        groupChatMode: true,
        groupMembers,
        groupName: groupMetadata.groupName,
        isMultiCharCard: !!groupMetadata.isMultiCharCard,
        multiCharMembers: groupMetadata.isMultiCharCard
          ? groupMetadata.multiCharMembers
          : undefined,
        gamePlayingContext: { gameName },
      });

      const promptData = await promptBuilder.build();

      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const client = new OpenAICompatibleClient(taskConfig.api);
      const result = await client.generate({
        messages: promptData.messages,
        settings: chatSettings,
        apiSettings: taskConfig.api,
        adjustLastMessageRole: true,
      });
      const aiContent = result?.content || "";
      if (!aiContent) {
        console.warn(
          "[ProactiveMessage] _sendGroupChatGamePlayingMessage: AI 回覆為空，跳過",
        );
        return;
      }

      // 解析群聊回覆
      const { parseGroupChatResponse } = await import(
        "@/services/ResponseParser"
      );
      const parsed = parseGroupChatResponse(aiContent);
      if (!parsed.messages.length) {
        console.warn(
          "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 解析後沒有訊息，跳過",
        );
        return;
      }

      // 名稱 → characterId 解析（容錯：比對暱稱 / 本名 / 群暱稱）
      // 多人卡：用 multiCharMembers 的 multi_xxx ID 與 name 比對
      // 普通群聊：用 groupMembers 的 nickname / name / originalName 比對
      function resolveSenderId(senderName: string): {
        characterId?: string;
        canonicalName: string;
      } {
        const lower = (senderName || "").trim().toLowerCase();
        if (isMultiCharCard) {
          for (const sub of groupMetadata.multiCharMembers || []) {
            if ((sub.name || "").toLowerCase() === lower) {
              return { characterId: sub.id, canonicalName: sub.name };
            }
          }
          return { canonicalName: senderName };
        }
        for (const m of groupMembers || []) {
          const aliases = [m.nickname, m.name, m.originalName].filter(
            Boolean,
          ) as string[];
          if (aliases.some((a) => a.toLowerCase() === lower)) {
            return { characterId: m.characterId, canonicalName: m.name };
          }
        }
        return { canonicalName: senderName };
      }

      const now = Date.now();
      const newMessages: any[] = [];
      let textCount = 0;
      let skipCount = 0;
      for (let i = 0; i < parsed.messages.length; i++) {
        const pm: any = parsed.messages[i];
        // 簡化版：跳過複雜標籤（group-action / dm / 來電 / recall / 紅包認領）
        if (
          pm.isGroupAction ||
          pm.isPrivateMessage ||
          pm.isGroupCallRequest ||
          pm.isGroupCallResponse ||
          pm.isRecall ||
          pm.isRedpacketClaim
        ) {
          skipCount++;
          continue;
        }
        const { characterId: senderCharId, canonicalName } = resolveSenderId(
          pm.senderName || "",
        );
        const baseMsg: any = {
          id: crypto.randomUUID(),
          sender: "assistant" as const,
          name: canonicalName,
          content: pm.content || "",
          is_user: false,
          status: "sent" as const,
          createdAt: now + i,
          updatedAt: now + i,
          senderCharacterId: senderCharId,
          senderCharacterName: canonicalName,
          ...(pm.thought && { thought: pm.thought }),
          ...(pm.isVoice && { isVoice: true, voiceContent: pm.voiceContent }),
          ...(pm.isStickerMsg && {
            isStickerMsg: true,
            stickerMeaning: pm.stickerMeaning,
          }),
          ...(pm.isAiImage && {
            isAiImage: true,
            imageDescription: pm.imageDescription,
            imagePrompt: pm.imagePrompt,
            messageType: "descriptive-image" as const,
            imageCaption: pm.imageDescription,
          }),
        };
        newMessages.push(baseMsg);
        textCount++;
      }

      if (skipCount > 0) {
        console.log(
          `[ProactiveMessage] _sendGroupChatGamePlayingMessage: 跳過 ${skipCount} 個複雜標籤訊息（簡化版不處理）`,
        );
      }
      if (newMessages.length === 0) {
        console.warn(
          "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 沒有可儲存的純文字訊息",
        );
        return;
      }

      await appendMessages(groupChat.id, newMessages);
      await refreshChatDerivedMetadata(groupChat.id);
      await incrementLocalChatUnreadCount(groupChat.id, newMessages.length);
      this._emitChatUpdated(groupChat.id);

      // 發通知（用第一條訊息）
      try {
        const { useNotificationStore } = await import(
          "@/stores/notification"
        );
        const notificationStore = useNotificationStore();
        const first = newMessages[0];
        const groupName = groupMetadata.groupName || "群聊";
        notificationStore.notifyChatMessage(
          `${first.name}（${groupName}）`,
          first.content || "",
          groupChat.id,
          first.senderCharacterId || "",
          undefined,
        );
      } catch (notifErr) {
        console.warn(
          "[ProactiveMessage] _sendGroupChatGamePlayingMessage: 通知發送失敗（非致命）:",
          notifErr,
        );
      }

      console.log(
        `[ProactiveMessage] _sendGroupChatGamePlayingMessage: 已寫入 ${textCount} 條訊息到群聊 ${groupChat.id}`,
      );
    } catch (err) {
      console.error(
        "[ProactiveMessage] _sendGroupChatGamePlayingMessage 失敗:",
        err,
      );
    } finally {
      this.pendingCharacters.delete(lockKey);
    }
  }

  /**
   * 發送主動訊息
   * @param characterId 角色 ID
   * @param settings 主動發訊設定（可為臨時設定）
   * @param options.customTopicInstruction 覆蓋預設的話題引導 instruction
   * @param options.skipScheduleUpdate 跳過 nextScheduledTime / lastSentTime 寫回（事件型觸發用）
   */
  private async sendProactiveMessage(
    characterId: string,
    settings: ProactiveMessageSettings,
    options?: {
      customTopicInstruction?: string;
      skipScheduleUpdate?: boolean;
      gamePlayingContext?: { gameName: string };
    },
  ) {
    // 標記該角色正在處理中，防止 setInterval 重複觸發
    this.pendingCharacters.add(characterId);
    try {
      console.log(
        `[ProactiveMessage] Sending message for character: ${characterId}`,
      );

      // 該角色正在與用戶通話中 → 本次跳過（掛斷後下一輪自然恢復）
      // 避免出現「邊通話邊傳『原本想聽妳聲音，結果你在通話中』」這種尷尬情境
      try {
        const { usePhoneCallStore } = await import("@/stores/phoneCall");
        const phoneCallStore = usePhoneCallStore();
        if (
          phoneCallStore.isActive &&
          phoneCallStore.activeCall?.characterId === characterId
        ) {
          console.log(
            `[ProactiveMessage] 角色 ${characterId} 正在通話中，跳過本次主動訊息`,
          );
          return;
        }
      } catch {
        // phoneCallStore 尚未初始化（例如 app 剛啟動），忽略並繼續
      }

      const characterStore = useCharactersStore();

      // 確保 store 已載入
      if (!characterStore.characters) {
        console.warn("[ProactiveMessage] Characters not loaded yet");
        return;
      }

      const character = characterStore.characters.find(
        (c) => c.id === characterId,
      );
      if (!character) {
        console.warn("[ProactiveMessage] Character not found:", characterId);
        return;
      }

      // 先更新 nextScheduledTime，防止頁面重載後因時間已過期而重複發送
      // 事件型觸發（skipScheduleUpdate）不寫入排程欄位，避免覆蓋 user 真實設定
      if (!options?.skipScheduleUpdate) {
        const earlyNextTime = Date.now() + settings.intervalMinutes * 60 * 1000;
        await characterStore.updateCharacter(characterId, {
          proactiveMessageSettings: {
            ...settings,
            nextScheduledTime: earlyNextTime,
          },
        });
        console.log(
          `[ProactiveMessage] Pre-set nextScheduledTime to ${new Date(earlyNextTime).toLocaleString()} to prevent duplicate sends`,
        );
      }

      // 動態導入 db 和相關類型
      const { db, DB_STORES } = await import("@/db/database");

      // 找到該角色最近的聊天
      const allChats = await db.getAll<any>(DB_STORES.CHATS);
      const characterChats = allChats
        .filter((c) => c.characterId === characterId && !c.isGroupChat)
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      let chat = characterChats[0];

      if (!chat) {
        // 如果沒有聊天，創建一個新的
        const charName = character.nickname || character.data.name;
        chat = {
          id: `chat_${Date.now()}`,
          name: `與 ${charName} 的對話`,
          characterId,
          messages: [],
          metadata: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await db.put(DB_STORES.CHATS, JSON.parse(JSON.stringify(chat)));
        console.log(
          `[ProactiveMessage] Created new chat for character: ${characterId}`,
        );
      }

      // 使用話題引導功能，讓角色主動發起對話
      const topicInstruction =
        options?.customTopicInstruction ||
        `<request>【話題引導】請主動向用戶發起對話。根據你們之前的對話歷史（如果有的話），用自然、符合你性格的方式提起一個話題，就像是你自己想到的一樣。如果沒有對話歷史，可以問候用戶或分享你最近的想法，如果在深夜可以預設用戶已經入睡了，但你想分享事情。</request>`;

      // 添加話題引導訊息（臨時，用於生成後會移除）
      const topicMessage = {
        id: crypto.randomUUID(),
        sender: "user" as const,
        name: "System",
        content: topicInstruction,
        is_user: true,
        status: "sent" as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // v24：從 chatMessages 表載入訊息（不再用 chat.messages）
      const existingMessages = await loadMessages(chat.id);
      // 暫時把 topicMessage 加入記憶體列表以便構建 prompt（不寫入 IDB）
      const messagesWithTopic = [...existingMessages, topicMessage];

      // 觸發 AI 生成回應
      const { useSettingsStore } = await import("@/stores/settings");
      const { useAIGenerationStore } = await import("@/stores/aiGeneration");
      const settingsStore = useSettingsStore();
      const aiGenerationStore = useAIGenerationStore();

      // 獲取 API 配置
      const taskConfig = settingsStore.getAPIForTask("chat");
      if (!taskConfig.api.apiKey) {
        console.warn("[ProactiveMessage] API Key not configured");
        return;
      }

      // 開始生成任務（註冊到全局狀態）
      const generationResult = aiGenerationStore.startGeneration(
        chat.id,
        "chat",
        {
          characterName: character.nickname || character.data.name,
          characterAvatar: character.avatar,
        },
      );

      if (!generationResult.success) {
        console.warn(
          "[ProactiveMessage] Cannot start generation:",
          generationResult.error,
        );
        // 話題引導訊息只在記憶體中，無需清理
        return;
      }

      // 構建提示詞
      const { PromptBuilder } = await import("@/engine/prompt/PromptBuilder");
      const { useUserStore } = await import("@/stores/user");
      const { useLorebooksStore } = await import("@/stores/lorebooks");
      const { usePromptManagerStore } = await import("@/stores/promptManager");

      const userStore = useUserStore();
      const lorebooksStore = useLorebooksStore();
      const promptManagerStore = usePromptManagerStore();

      // 載入提示詞管理器配置（確保使用用戶自訂的提示詞順序和定義）
      await promptManagerStore.loadConfig();

      // 獲取當前用戶 persona
      const currentPersona = userStore.currentPersona;

      // 獲取角色關聯的世界書
      const characterLorebooks = character.data.extensions?.world
        ? lorebooksStore.lorebooks.filter(
            (lb) => lb.id === character.data.extensions?.world,
          )
        : [];

      // ===== 載入 AI 記憶管理設定（總結設定） =====
      const { createDefaultSummarySettings } = await import("@/types/chat");
      const summarySettings = chat.summarySettings
        ? { ...chat.summarySettings }
        : createDefaultSummarySettings();

      // ===== 根據設定限制讀取的消息數量 =====
      const allMessages = messagesWithTopic;
      const actualCount = summarySettings.actualMessageCount;
      const actualMode = summarySettings.actualMessageMode;
      let messagesToUse: typeof allMessages;

      if (actualMode === "turn") {
        // 按輪次讀取：每輪 = 用戶發言 + AI 回覆
        let turnCount = 0;
        let startIndex = allMessages.length;
        for (let i = allMessages.length - 1; i >= 0; i--) {
          if (allMessages[i].sender === "assistant") {
            turnCount++;
            if (turnCount >= actualCount) {
              // 往前找到這輪的 user 消息
              for (let j = i - 1; j >= 0; j--) {
                if (allMessages[j].sender === "user") {
                  startIndex = j;
                  break;
                }
              }
              if (startIndex === allMessages.length) {
                startIndex = i;
              }
              break;
            }
          }
          startIndex = i;
        }
        messagesToUse = allMessages.slice(startIndex);
      } else {
        // 按消息數讀取
        messagesToUse = allMessages.slice(-actualCount);
      }

      console.log(
        `[ProactiveMessage] Messages: total=${allMessages.length}, using=${messagesToUse.length} (mode=${actualMode}, count=${actualCount})`,
      );

      // ===== 載入總結數據 =====
      let summariesToSend: Array<{
        id: string;
        content: string;
        createdAt: number;
        isImportant?: boolean;
      }> = [];
      try {
        const allSummaries = await db.getAll<{
          id: string;
          chatId: string;
          characterId: string;
          content: string;
          createdAt: number;
          messageCount: number;
          isImportant?: boolean;
          isManual?: boolean;
          isMeta?: boolean;
        }>(DB_STORES.SUMMARIES);

        const chatSummaries = allSummaries
          .filter((s) => s.chatId === chat.id)
          .map((s) => ({
            id: s.id,
            content: s.content,
            createdAt: s.createdAt,
            isImportant: s.isImportant,
          }));

        if (chatSummaries.length > 0) {
          const summaryReadCount =
            summarySettings.summaryReadMode === "all"
              ? chatSummaries.length
              : summarySettings.summaryReadCount;
          summariesToSend = chatSummaries
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(0, summaryReadCount);
        }
        console.log(
          `[ProactiveMessage] Summaries: total=${chatSummaries.length}, sending=${summariesToSend.length}`,
        );
      } catch (e) {
        console.error("[ProactiveMessage] Failed to load summaries:", e);
      }

      // ===== 載入重要事件 =====
      let eventsToSend: Array<{
        id: string;
        content: string;
        category?: string;
        priority?: number;
      }> = [];
      try {
        const eventsLog = await db.get<{
          events: Array<{
            id: string;
            content: string;
            category?: string;
            priority?: number;
          }>;
          settings: { enabled: boolean; maxEvents?: number };
        }>(DB_STORES.IMPORTANT_EVENTS, chat.id);

        if (
          eventsLog &&
          eventsLog.settings?.enabled &&
          eventsLog.events?.length > 0
        ) {
          const maxEvents = eventsLog.settings?.maxEvents ?? 50;
          eventsToSend = eventsLog.events
            .slice()
            .sort((a, b) => (a.priority || 3) - (b.priority || 3))
            .slice(0, maxEvents);
        }
        console.log(
          `[ProactiveMessage] Important events: sending=${eventsToSend.length}`,
        );
      } catch (e) {
        console.error("[ProactiveMessage] Failed to load important events:", e);
      }

      // 使用全局生成參數
      const chatSettings = {
        maxContextLength: taskConfig.generation.maxContextLength,
        maxResponseLength: taskConfig.generation.maxTokens,
        temperature: taskConfig.generation.temperature,
        topP: taskConfig.generation.topP,
        topK: 0,
        frequencyPenalty: taskConfig.generation.frequencyPenalty,
        presencePenalty: taskConfig.generation.presencePenalty,
        repetitionPenalty: 1.0,
        stopSequences: [],
        streaming: taskConfig.generation.streamingEnabled,
        useStreamingWindow: taskConfig.generation.useStreamingWindow,
      };

      // 進行中通話狀態（若當前 user 正在和別的角色通話，讓本角色知道 user 忙線）
      // 注意：若通話對象 === 當前角色，上面已經 return，所以這裡進到的都是「別人正在通話」
      let ongoingCallContext:
        | { withCurrentCharacter: boolean; durationSeconds: number; isVideo?: boolean }
        | undefined;
      try {
        const { usePhoneCallStore } = await import("@/stores/phoneCall");
        const phoneCallStore = usePhoneCallStore();
        if (phoneCallStore.isActive && phoneCallStore.activeCall) {
          ongoingCallContext = {
            withCurrentCharacter: false,
            durationSeconds: phoneCallStore.callDuration,
            isVideo: phoneCallStore.isVideoCallActive,
          };
        }
      } catch {
        // 忽略
      }

      const { loadPromptOverrideForChat: loadPromptOverrideForChat1v1 } = await import("@/utils/promptOverrideScope");
      const proactiveOverrides = await loadPromptOverrideForChat1v1({
        id: chat.id,
        characterId: chat.characterId,
        isGroupChat: chat.isGroupChat,
        groupMetadata: chat.groupMetadata,
        chatVariables: chat.chatVariables,
      });
      const promptBuilder = new PromptBuilder({
        character,
        lorebooks: characterLorebooks,
        messages: messagesToUse,
        settings: chatSettings,
        userName: currentPersona?.name || "User",
        userPersona: currentPersona?.description,
        userSecrets: currentPersona?.secrets,
        powerDynamic: currentPersona?.powerDynamic,
        summaries: summariesToSend,
        importantEvents: eventsToSend,
        // 使用用戶自訂的提示詞管理器配置（順序、啟用狀態、角色獨立配置）
        promptManagerConfig: promptManagerStore.config,
        chatPromptToggles: proactiveOverrides.chatPromptToggles,
        chatLocalPrompts: proactiveOverrides.chatLocalPrompts,
        // 從聊天記錄載入感知現實時間設定（默認開啟）
        enableRealTimeAwareness: chat.enableRealTimeAwareness !== false,
        ongoingCallContext,
        gamePlayingContext: options?.gamePlayingContext,
      });

      const promptData = await promptBuilder.build();

      // 創建 API 客戶端
      const { OpenAICompatibleClient } = await import("@/api/OpenAICompatible");
      const client = new OpenAICompatibleClient(taskConfig.api);

      let aiContent = "";

      // 動態導入流式視窗和回應解析器
      const { useStreamingWindow } =
        await import("@/composables/useStreamingWindow");
      const { parseAIResponse } = await import("@/services/ResponseParser");
      const streamingWindow = useStreamingWindow();

      try {
        // 根據全局設定決定是否使用串流
        if (chatSettings.streaming) {
          // 使用串流模式
          console.log("[ProactiveMessage] Using streaming mode");

          // 如果啟用了流式視窗，顯示它
          if (chatSettings.useStreamingWindow) {
            streamingWindow.show(taskConfig.api.model || "", true);
            // 傳入提示詞內容（用於調試面板查看/隱藏）
            streamingWindow.setPromptContent(
              promptData.messages.map((m: any) => ({
                role: String(m.role),
                content:
                  typeof m.content === "string"
                    ? m.content
                    : JSON.stringify(m.content),
                identifier:
                  typeof m.identifier === "string" ? m.identifier : undefined,
                name: typeof m.name === "string" ? m.name : undefined,
              })),
            );
          }

          const streamGenerator = client.generateStream({
            messages: promptData.messages,
            settings: chatSettings,
            apiSettings: taskConfig.api,
            adjustLastMessageRole: true,
          });

          for await (const event of streamGenerator) {
            if (event.type === "token") {
              aiContent += event.token;
              // 更新全局生成狀態
              aiGenerationStore.updateContent(chat.id, aiContent, "chat");
              // 更新流式視窗
              if (chatSettings.useStreamingWindow && event.token) {
                streamingWindow.appendToken(event.token);
              }
            } else if (
              (event as any).type === "usage" &&
              (event as any).usage
            ) {
              // 更新 token 使用量
              if (chatSettings.useStreamingWindow) {
                streamingWindow.setUsage((event as any).usage);
              }
            } else if (event.type === "done") {
              if (event.content) {
                aiContent = event.content;
              }
              // 從 done 事件取得 usage 數據（部分 API 僅在 done 時返回）
              if (chatSettings.useStreamingWindow && (event as any).usage) {
                streamingWindow.setUsage((event as any).usage);
              }
              break;
            } else if (event.type === "error") {
              const errorMsg = event.error || "Unknown streaming error";
              console.error("[ProactiveMessage] Streaming error:", errorMsg);
              aiGenerationStore.setError(chat.id, errorMsg, "chat");
              if (chatSettings.useStreamingWindow) {
                streamingWindow.setError(errorMsg);
              }
              return;
            }
          }

          // 標記流式視窗完成
          if (chatSettings.useStreamingWindow) {
            streamingWindow.setComplete();
          }
        } else {
          // 使用非串流模式
          console.log("[ProactiveMessage] Using non-streaming mode");
          const result = await client.generate({
            messages: promptData.messages,
            settings: chatSettings,
            apiSettings: taskConfig.api,
            adjustLastMessageRole: true,
          });

          if (result && result.content) {
            aiContent = result.content;
          }
        }

        if (aiContent) {
          // 話題引導訊息只在記憶體中，不需要從 IDB 移除

          // 使用 parseAIResponse 解析回應，正確分割 <msg> 標籤
          const parsedResponse = parseAIResponse(aiContent);
          const now = Date.now();
          const newMessages: any[] = [];

          if (parsedResponse.messages.length > 0) {
            // 將每個解析後的訊息添加為獨立的聊天訊息
            for (let i = 0; i < parsedResponse.messages.length; i++) {
              const parsed = parsedResponse.messages[i];

              // 調試日誌：記錄解析後的消息內容
              console.log(`[ProactiveMessage] Parsed message ${i}:`, {
                content: parsed.content,
                isAiImage: parsed.isAiImage,
                imageDescription: parsed.imageDescription,
                imagePrompt: parsed.imagePrompt,
                isVoice: parsed.isVoice,
                isTimetravel: parsed.isTimetravel,
                isRedpacket: parsed.isRedpacket,
                isLocation: parsed.isLocation,
                isTransfer: parsed.isTransfer,
                isGift: parsed.isGift,
              });

              const normalizedContent =
                parsed.isAiImage && parsed.imageDescription
                  ? `<pic>${parsed.imageDescription}</pic>`
                  : parsed.content;

              const aiMessage = {
                id: crypto.randomUUID(),
                sender: "assistant" as const,
                name: character.data.name,
                content: normalizedContent,
                is_user: false,
                status: "sent" as const,
                createdAt: now + i, // 確保時間順序
                updatedAt: now + i,
                // 保留特殊屬性
                ...(parsed.thought && { thought: parsed.thought }),
                ...(parsed.isVoice && {
                  isVoice: true,
                  voiceContent: parsed.voiceContent,
                }),
                ...(parsed.isTimetravel && {
                  isTimetravel: true,
                  timetravelContent: parsed.timetravelContent,
                }),
                ...(parsed.isRedpacket && {
                  isRedpacket: true,
                  redpacketData: parsed.redpacketData,
                }),
                ...(parsed.isLocation && {
                  isLocation: true,
                  locationContent: parsed.locationContent,
                }),
                ...(parsed.isTransfer && {
                  isTransfer: true,
                  transferType: parsed.transferType,
                  transferAmount: parsed.transferAmount,
                  transferNote: parsed.transferNote,
                }),
                ...(parsed.isGift && {
                  isGift: true,
                  giftName: parsed.giftName,
                }),
                ...(parsed.isHtmlBlock && { isHtmlBlock: true }),
                ...(parsed.isAiImage && {
                  isAiImage: true,
                  imageDescription: parsed.imageDescription,
                  imagePrompt: parsed.imagePrompt,
                  messageType: "descriptive-image" as const,
                  imageCaption: parsed.imageDescription,
                }),
              };
              newMessages.push(aiMessage);
            }
            console.log(
              `[ProactiveMessage] Parsed ${parsedResponse.messages.length} messages from AI response`,
            );
          } else {
            // 沒有解析出訊息，使用原始內容作為單條訊息
            const aiMessage = {
              id: crypto.randomUUID(),
              sender: "assistant" as const,
              name: character.data.name,
              content: aiContent,
              is_user: false,
              status: "sent" as const,
              createdAt: now,
              updatedAt: now,
            };
            newMessages.push(aiMessage);
            console.log(
              `[ProactiveMessage] No parsed messages, using raw content`,
            );
          }

          // 處理來電預約標籤
          if (
            parsedResponse.hasScheduleCall &&
            parsedResponse.scheduleCallData
          ) {
            try {
              // 🟢 額外防禦：再次檢查該角色是否正在通話中（雙重保險）
              const { usePhoneCallStore } = await import("@/stores/phoneCall");
              const phoneCallStore = usePhoneCallStore();
              
              if (phoneCallStore.isActive &&
                  phoneCallStore.activeCall?.characterId === characterId) {
                console.log(
                  "[ProactiveMessage] 該角色正在通話中，忽略 <schedule-call> 標籤（防禦性檢查）",
                  { characterId }
                );
              } else {
                const { getIncomingCallScheduler } =
                  await import("@/services/IncomingCallScheduler");
                const characterInfo = {
                  id: character.id,
                  name: character.nickname || character.data.name,
                  avatar: character.avatar,
                };
                const pendingCall =
                  await getIncomingCallScheduler().schedulePendingCall(
                    parsedResponse.scheduleCallData,
                    characterInfo,
                    chat.id,
                  );
                if (pendingCall) {
                  console.log("[ProactiveMessage] 來電已排程:", {
                    delay: parsedResponse.scheduleCallData.delay,
                    reason: parsedResponse.scheduleCallData.reason,
                    triggerTime: new Date(
                      pendingCall.triggerTime,
                    ).toLocaleString(),
                  });
                }
              }
            } catch (error) {
              console.error("[ProactiveMessage] 來電排程失敗:", error);
            }
          }

          // 處理行事曆事件標籤
          if (
            parsedResponse.hasCalendarEvent &&
            parsedResponse.calendarEvents
          ) {
            try {
              for (const calEvent of parsedResponse.calendarEvents) {
                const event = {
                  id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                  type: calEvent.type,
                  title: calEvent.title,
                  date: calEvent.date,
                  description: calEvent.description,
                  sourceCharacterId: character.id,
                  sourceChatId: chat.id,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                await db.put(
                  DB_STORES.CALENDAR_EVENTS,
                  JSON.parse(JSON.stringify(event)),
                );

                // 插入系統訊息到聊天中
                const calendarMessage = {
                  id: `msg_cal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                  sender: "system" as const,
                  content: `[行事曆] 已建立事件：${calEvent.title}（${calEvent.date}）${calEvent.description ? " - " + calEvent.description : ""}`,
                  is_user: false,
                  status: "sent" as const,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  isCalendarEvent: true,
                  calendarEventData: {
                    type: calEvent.type,
                    title: calEvent.title,
                    date: calEvent.date,
                    description: calEvent.description,
                  },
                };
                newMessages.push(calendarMessage);

                console.log("[ProactiveMessage] 行事曆事件已建立:", calEvent);
              }
            } catch (error) {
              console.error("[ProactiveMessage] 行事曆事件建立失敗:", error);
            }
          }

          // 處理角色位置推測標籤
          if (
            parsedResponse.hasCharLocation &&
            parsedResponse.charLocationData
          ) {
            try {
              const { useCharactersStore } = await import("@/stores");
              const charactersStore = useCharactersStore();
              const newLocation = parsedResponse.charLocationData.location;
              const oldLocation = character.worldSettings?.location;
              if (!oldLocation || oldLocation.trim() !== newLocation.trim()) {
                await charactersStore.updateCharacter(character.id, {
                  worldSettings: {
                    ...character.worldSettings,
                    location: newLocation,
                  },
                });
                if (character.worldSettings) {
                  character.worldSettings.location = newLocation;
                } else {
                  character.worldSettings = { location: newLocation };
                }
                console.log(
                  "[ProactiveMessage] 角色位置已更新:",
                  oldLocation || "(無)",
                  "→",
                  newLocation,
                );
              }
            } catch (error) {
              console.error("[ProactiveMessage] 角色位置更新失敗:", error);
            }
          }

          // 更新最後訊息預覽（用於列表顯示）
          const lastParsed =
            parsedResponse.messages.length > 0
              ? parsedResponse.messages[parsedResponse.messages.length - 1]
              : null;
          const previewText = lastParsed
            ? lastParsed.content?.slice(0, 80)
            : aiContent.slice(0, 80);

          // v24：用 appendChatMessages 追加新訊息（無競態風險，不需讀取-修改-寫回）
          await appendMessages(chat.id, newMessages);
          this._emitChatUpdated(chat.id);

          // 更新 chat metadata（不含訊息）
          const freshChat = await loadChatById(chat.id);
          if (freshChat) {
            await refreshChatDerivedMetadata(chat.id);
            await incrementLocalChatUnreadCount(chat.id, newMessages.length);
          } else {
            await refreshChatDerivedMetadata(chat.id);
            await incrementLocalChatUnreadCount(chat.id, newMessages.length);
            console.warn(
              "[ProactiveMessage] Chat 在生成期間從 IDB 消失，重建 metadata",
            );
          }
          console.log(
            `[ProactiveMessage] ★ v24 追加 ${newMessages.length} 條新訊息到 chatMessages 表`,
          );

          // 完成生成任務
          aiGenerationStore.completeGeneration(chat.id, "chat", aiContent);

          // 透過 notification store 發送應用內通知（Toast + 推播）
          if (settings.showNotification) {
            try {
              const { useNotificationStore } =
                await import("@/stores/notification");
              const notificationStore = useNotificationStore();
              const charName = character.nickname || character.data.name;
              const preview = lastParsed ? lastParsed.content || "" : aiContent;
              notificationStore.notifyChatMessage(
                charName,
                preview,
                chat.id,
                characterId,
                character.avatar,
              );

              // iOS PWA 不支援主線程直接發系統通知，透過雲端 Worker 發 Web Push
              // 條件：頁面不可見（後台）或定位保活啟用中（iOS PWA 後台時 visibilityState 可能仍為 visible）
              // 只要不在該角色的聊天頁面就發送，避免前台正在看的時候重複通知
              try {
                const { useCloudPushStore } = await import("@/stores/cloudPush");
                const { useSettingsStore } = await import("@/stores/settings");
                const cloudPushStore = useCloudPushStore();
                const settingsForPush = useSettingsStore();
                const isBackground = document.visibilityState === "hidden" || !document.hasFocus();
                const isKeepAliveActive = settingsForPush.backgroundAudioEnabled;
                if (
                  cloudPushStore.enabled &&
                  cloudPushStore.enabledChannels.includes("webpush") &&
                  (isBackground || isKeepAliveActive)
                ) {
                  const { sendNotifyPush } = await import("@/services/CloudPushService");
                  await sendNotifyPush({
                    characterName: charName,
                    characterId: characterId,
                    chatId: chat.id,
                    content: (preview || "").slice(0, 200),
                  });
                  console.log("[ProactiveMessage] 已透過雲端 Worker 發送 Web Push 通知", {
                    isBackground,
                    isKeepAliveActive,
                    visibilityState: document.visibilityState,
                  });
                }
              } catch (pushErr) {
                console.warn("[ProactiveMessage] 雲端 Web Push 通知失敗（非致命）:", pushErr);
              }
            } catch (notifErr) {
              console.warn(
                "[ProactiveMessage] Failed to send in-app notification:",
                notifErr,
              );
            }
          }

          console.log(`[ProactiveMessage] AI response generated successfully`);
        } else {
          // 沒有生成內容，話題引導訊息只在記憶體中，無需清理
          aiGenerationStore.setError(chat.id, "No content generated", "chat");
        }
      } catch (error) {
        // 發生錯誤時不回寫 IDB：chat 是開頭讀取的快照，此時回寫會覆蓋 ChatScreen 的中間保存
        // topic message 只存在於記憶體快照中，IDB 中從未出現過，無需清理
        aiGenerationStore.setError(chat.id, String(error), "chat");
        // 流式視窗錯誤處理
        if (chatSettings.useStreamingWindow) {
          streamingWindow.setError(String(error));
        }
        throw error;
      }

      // 更新最後發送時間，並重新計算下次預定時間（基於實際發送完成時間）
      // 事件型觸發（skipScheduleUpdate）不寫回排程欄位，避免覆蓋 user 真實設定
      if (!options?.skipScheduleUpdate) {
        const finalNow = Date.now();
        const finalNextTime = finalNow + settings.intervalMinutes * 60 * 1000;

        await characterStore.updateCharacter(characterId, {
          proactiveMessageSettings: {
            ...settings,
            lastSentTime: finalNow,
            nextScheduledTime: finalNextTime,
          },
        });

        console.log(
          `[ProactiveMessage] Message sent successfully. Next time: ${new Date(finalNextTime).toLocaleString()}`,
        );
      } else {
        console.log(
          `[ProactiveMessage] Message sent successfully (skipScheduleUpdate=true，未寫回排程)`,
        );
      }
    } catch (error) {
      console.error("[ProactiveMessage] Failed to send message:", error);
    } finally {
      // 無論成功或失敗，都要移除處理中標記
      this.pendingCharacters.delete(characterId);
      console.log(
        `[ProactiveMessage] Released lock for character: ${characterId}`,
      );
    }
  }

  /**
   * 顯示通知
   */
  private async showNotification(
    characterName: string,
    characterId: string,
    characterAvatar?: string,
  ) {
    try {
      // 使用 pushNotificationService 實例
      const notificationItem = {
        id: `proactive-${characterId}-${Date.now()}`,
        type: "chat_message" as const,
        title: characterName,
        message: "給你發了一條新訊息",
        timestamp: Date.now(),
        createdAt: Date.now(),
        characterId,
        characterName,
        characterAvatar,
        priority: "normal" as const,
        read: false,
      };

      pushNotificationService.send(notificationItem);
    } catch (error) {
      console.error("[ProactiveMessage] Failed to show notification:", error);
    }
  }

  /**
   * 計算下次發送時間
   */
  calculateNextTime(settings: ProactiveMessageSettings): number {
    const now = Date.now();
    let nextTime = now + settings.intervalMinutes * 60 * 1000;

    // 如果計算出的時間在免打擾時段內，則延後到免打擾結束
    if (settings.doNotDisturbEnabled) {
      const nextDate = new Date(nextTime);
      const nextMinutes = nextDate.getHours() * 60 + nextDate.getMinutes();

      const [startH, startM] = settings.doNotDisturbStart
        .split(":")
        .map(Number);
      const [endH, endM] = settings.doNotDisturbEnd.split(":").map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      let isInDND = false;
      if (startMinutes > endMinutes) {
        isInDND = nextMinutes >= startMinutes || nextMinutes < endMinutes;
      } else {
        isInDND = nextMinutes >= startMinutes && nextMinutes < endMinutes;
      }

      if (isInDND) {
        // 延後到免打擾結束時間
        const endTime = new Date(nextDate);
        endTime.setHours(endH, endM, 0, 0);

        // 如果結束時間已過，則延到明天
        if (endTime.getTime() < nextTime) {
          endTime.setDate(endTime.getDate() + 1);
        }

        nextTime = endTime.getTime();
      }
    }

    return nextTime;
  }

  /**
   * 初始化角色的主動發訊息設置
   */
  async initializeSettings(
    characterId: string,
  ): Promise<ProactiveMessageSettings> {
    const settings: ProactiveMessageSettings = {
      enabled: false,
      intervalMinutes: 180, // 預設3小時
      doNotDisturbEnabled: true,
      doNotDisturbStart: "22:00",
      doNotDisturbEnd: "08:00",
      showNotification: true,
    };

    const characterStore = useCharactersStore();
    await characterStore.updateCharacter(characterId, {
      proactiveMessageSettings: settings,
    });

    return settings;
  }

  /**
   * 更新角色的主動發訊息設置
   */
  async updateSettings(
    characterId: string,
    settings: Partial<ProactiveMessageSettings>,
  ) {
    const characterStore = useCharactersStore();
    const character = characterStore.characters.find(
      (c) => c.id === characterId,
    );
    if (!character) return;

    const currentSettings =
      character.proactiveMessageSettings ||
      (await this.initializeSettings(characterId));
    const newSettings: ProactiveMessageSettings = {
      ...currentSettings,
      ...settings,
    };

    // 如果啟用或修改了間隔時間，重新計算下次發送時間
    if (
      settings.enabled !== undefined ||
      settings.intervalMinutes !== undefined
    ) {
      if (newSettings.enabled) {
        // 如果沒有提供 nextScheduledTime，則計算一個
        if (!settings.nextScheduledTime) {
          newSettings.nextScheduledTime = this.calculateNextTime(newSettings);
        }
      } else {
        // 如果禁用，清除下次發送時間
        newSettings.nextScheduledTime = undefined;
      }
    }

    await characterStore.updateCharacter(characterId, {
      proactiveMessageSettings: newSettings,
    });
  }

  /**
   * 獲取角色的設置
   */
  getSettings(characterId: string): ProactiveMessageSettings | undefined {
    const characterStore = useCharactersStore();
    const character = characterStore.characters.find(
      (c) => c.id === characterId,
    );
    return character?.proactiveMessageSettings;
  }

  /**
   * 格式化下次發送時間
   */
  formatNextTime(settings: ProactiveMessageSettings): string {
    if (!settings.enabled || !settings.nextScheduledTime) {
      return "未啟用";
    }

    const nextDate = new Date(settings.nextScheduledTime);
    const now = new Date();

    // 如果是今天
    if (nextDate.toDateString() === now.toDateString()) {
      return `今天 ${nextDate.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
    }

    // 如果是明天
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (nextDate.toDateString() === tomorrow.toDateString()) {
      return `明天 ${nextDate.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}`;
    }

    // 其他日期
    return nextDate.toLocaleString("zh-TW", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * 重置角色的主動發訊息計時器
   * 當用戶與角色聊天時呼叫，從現在起重新計算下次發送時間
   */
  async resetTimer(characterId: string) {
    const settings = this.getSettings(characterId);
    if (!settings?.enabled) return;

    const nextTime = this.calculateNextTime(settings);
    const characterStore = useCharactersStore();
    await characterStore.updateCharacter(characterId, {
      proactiveMessageSettings: {
        ...settings,
        lastSentTime: Date.now(),
        nextScheduledTime: nextTime,
      },
    });
    console.log(
      `[ProactiveMessage] Timer reset for character ${characterId}. Next: ${new Date(nextTime).toLocaleString()}`,
    );
  }

  /**
   * 通知 Service 用戶進入某角色的聊天頁面
   * 進入後：該角色不會觸發主動發訊；進入後台時才開始計時
   */
  enterChat(characterId: string) {
    this.activeChatCharacterId = characterId;

    // 監聽頁面可見性變化：進後台時開始計時，回前台時重置計時器
    if (!this.visibilityHandler) {
      this.visibilityHandler = () => {
        const activeId = this.activeChatCharacterId;
        if (!activeId) return;

        if (document.visibilityState === "hidden") {
          // 進入後台：從現在起開始計算間隔（重置計時器）
          this.resetTimer(activeId).catch(() => {});
          console.log(
            `[ProactiveMessage] 頁面進入後台，角色 ${activeId} 計時器開始計算`,
          );
        } else if (document.visibilityState === "visible") {
          // 回到前台且仍在聊天頁面：重置計時器（不發訊）
          this.resetTimer(activeId).catch(() => {});
          console.log(
            `[ProactiveMessage] 頁面回到前台，角色 ${activeId} 計時器重置`,
          );
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }

    console.log(
      `[ProactiveMessage] 進入角色 ${characterId} 的聊天頁面，暫停主動發訊`,
    );
  }

  /**
   * 通知 Service 用戶離開聊天頁面
   * 離開後：從現在起開始計算間隔，角色恢復主動發訊排程
   */
  leaveChat(characterId: string) {
    if (this.activeChatCharacterId !== characterId) return;

    this.activeChatCharacterId = null;

    // 移除可見性監聽器
    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }

    // 從現在起重新計算下次發送時間
    this.resetTimer(characterId).catch(() => {});
    console.log(
      `[ProactiveMessage] 離開角色 ${characterId} 的聊天頁面，計時器從現在開始計算`,
    );
  }
}

// 導出單例
export const proactiveMessageService = ProactiveMessageService.getInstance();
