/**
 * 雲端推送鬧鐘 — Pinia Store
 * 管理雲端推送設定、同步、離線訊息拉取
 */

import { db, DB_STORES } from "@/db/database";
import * as CloudPushService from "@/services/CloudPushService";
import type {
  CloudPushApiSettings,
  CloudPushCharacter,
  CloudPushSchedule,
  CloudPushSyncPayload,
} from "@/types/cloudPush";
import { defineStore } from "pinia";
import { ref } from "vue";

const SETTINGS_KEY = "cloud-push-settings";

export const useCloudPushStore = defineStore("cloudPush", () => {
  // ===== 用戶可設定的狀態 =====
  const enabled = ref(false);
  const discordUserId = ref("");
  const enabledChannels = ref<("discord" | "webpush")[]>(["discord"]);
  const intervalMinutes = ref(60);
  const doNotDisturbEnabled = ref(true);
  const doNotDisturbStart = ref("23:00");
  const doNotDisturbEnd = ref("08:00");

  // ===== 同步 / 顯示狀態 =====
  const lastSyncAt = ref<number | null>(null);
  const nextAlarm = ref<number | null>(null);
  const pendingMessageCount = ref(0);
  const syncStatus = ref<"idle" | "syncing" | "success" | "error">("idle");
  const syncError = ref<string | null>(null);

  // ===== 持久化 =====

  /** 從 IndexedDB 載入設定 */
  async function loadSettings(): Promise<void> {
    try {
      const saved = await db.get<Record<string, unknown>>(
        DB_STORES.APP_SETTINGS,
        SETTINGS_KEY,
      );
      if (saved) {
        enabled.value = (saved.enabled as boolean) ?? false;
        discordUserId.value = (saved.discordUserId as string) ?? "";
        enabledChannels.value = (saved.enabledChannels as (
          | "discord"
          | "webpush"
        )[]) ?? ["discord"];
        intervalMinutes.value = (saved.intervalMinutes as number) ?? 60;
        doNotDisturbEnabled.value =
          (saved.doNotDisturbEnabled as boolean) ?? true;
        doNotDisturbStart.value =
          (saved.doNotDisturbStart as string) ?? "23:00";
        doNotDisturbEnd.value = (saved.doNotDisturbEnd as string) ?? "08:00";
        lastSyncAt.value = (saved.lastSyncAt as number) ?? null;
        nextAlarm.value = (saved.nextAlarm as number) ?? null;
        pendingMessageCount.value = (saved.pendingMessageCount as number) ?? 0;
      }
    } catch (e) {
      console.error("[CloudPush] 載入設定失敗:", e);
    }
  }

  /** 儲存設定到 IndexedDB */
  async function saveSettings(): Promise<void> {
    try {
      // 使用 JSON 深拷貝去除 Vue 響應式 Proxy，避免 DataCloneError
      const plainData = JSON.parse(
        JSON.stringify({
          id: SETTINGS_KEY,
          enabled: enabled.value,
          discordUserId: discordUserId.value,
          enabledChannels: enabledChannels.value,
          intervalMinutes: intervalMinutes.value,
          doNotDisturbEnabled: doNotDisturbEnabled.value,
          doNotDisturbStart: doNotDisturbStart.value,
          doNotDisturbEnd: doNotDisturbEnd.value,
          lastSyncAt: lastSyncAt.value,
          nextAlarm: nextAlarm.value,
          pendingMessageCount: pendingMessageCount.value,
        }),
      );
      await db.put(DB_STORES.APP_SETTINGS, plainData);
    } catch (e) {
      console.error("[CloudPush] 儲存設定失敗:", e);
    }
  }

  // ===== 核心操作 =====

  /** 同步設定到雲端 Worker */
  async function syncToCloud(): Promise<void> {
    syncStatus.value = "syncing";
    syncError.value = null;

    try {
      // 延遲導入避免循環依賴
      const { useCharactersStore } = await import("@/stores/characters");
      const { useSettingsStore } = await import("@/stores/settings");
      const { useUserStore } = await import("@/stores/user");

      const charactersStore = useCharactersStore();
      const settingsStore = useSettingsStore();
      const userStore = useUserStore();

      // 撈取表情包名稱列表（供 Worker 構建 prompt 用）
      const { useStickerStore } = await import("@/stores/sticker");
      const stickerStore = useStickerStore();
      if (!stickerStore.initialized) await stickerStore.init();
      const stickerNames = stickerStore.allCategories
        .flatMap((cat) => cat.stickers.map((s) => s.name))
        .filter(Boolean);

      // 撈取每個角色的聊天紀錄和總結
      const { db, DB_STORES } = await import("@/db/database");
      const allChats = await db.getAll<any>(DB_STORES.CHATS);
      const allSummaries = await db.getAll<any>(DB_STORES.SUMMARIES);

      // 只傳有啟用主動發訊息的角色，並帶上各自的時間設定
      const characters: CloudPushCharacter[] = await Promise.all(
        charactersStore.characters
          .filter((c) => c.proactiveMessageSettings?.enabled === true)
          .map(async (c) => {
            const ps = c.proactiveMessageSettings!;

            // 找最近的聊天，取最後 15 輪（user + assistant 各算一條）
            const charChat = allChats
              .filter((ch: any) => ch.characterId === c.id && !ch.isGroupChat)
              .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];

            let recentMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
            if (charChat?.messages?.length) {
              // 取最後 30 條（15 輪 × 2），過濾掉 system 訊息
              const msgs = (charChat.messages as any[])
                .filter((m) => m.sender === "user" || m.sender === "assistant")
                .slice(-30);
              recentMessages = msgs.map((m) => ({
                role: m.sender === "user" ? "user" : "assistant",
                content: (m.content || "").slice(0, 500), // 截斷過長訊息
              }));
            }

            // 取最近 5 條總結
            const charSummaries = allSummaries
              .filter((s: any) => s.characterId === c.id)
              .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
              .slice(0, 5)
              .map((s: any) => s.content as string);

            return {
              id: c.id,
              name: c.nickname || c.data.name,
              personality:
                (c.data.description || "") +
                (c.data.description && c.data.personality ? "\n\n" : "") +
                (c.data.personality || ""),
              systemPrompt: c.data.system_prompt || "",
              avatar: null, // 不傳 base64 頭像到雲端
              recentMessages,
              recentSummaries: charSummaries,
              stickerNames,
              proactiveSettings: {
                intervalMinutes: ps.intervalMinutes,
                doNotDisturbEnabled: ps.doNotDisturbEnabled,
                doNotDisturbStart: ps.doNotDisturbStart,
                doNotDisturbEnd: ps.doNotDisturbEnd,
                lastSentTime: ps.lastSentTime,
                nextScheduledTime: ps.nextScheduledTime,
              },
            };
          }),
      );

      // 組裝 API 設定
      const taskConfig = settingsStore.getAPIForTask("chat");
      const apiSettings: CloudPushApiSettings = {
        provider: taskConfig.api.provider,
        endpoint: taskConfig.api.endpoint,
        apiKey: taskConfig.api.apiKey,
        model: taskConfig.api.model,
        temperature: taskConfig.generation.temperature ?? 0.7,
        maxTokens: 500,
      };

      // 組裝排程
      const schedule: CloudPushSchedule = {
        intervalMinutes: intervalMinutes.value,
        doNotDisturbEnabled: doNotDisturbEnabled.value,
        doNotDisturbStart: doNotDisturbStart.value,
        doNotDisturbEnd: doNotDisturbEnd.value,
        timezoneOffset: new Date().getTimezoneOffset(),
      };

      const payload: CloudPushSyncPayload = {
        characters,
        apiSettings,
        userName: userStore.currentName || "使用者",
        schedule,
        pushChannels: enabledChannels.value,
        discordUserId: discordUserId.value,
        // 本地頁面存活時間戳：Worker 收到後若距現在 < 間隔時間，代表本地還活著，跳過雲端生成
        lastClientAliveAt: Date.now(),
      };

      const res = await CloudPushService.syncConfig(payload);

      // 如果啟用了 webpush 管道，自動訂閱瀏覽器 Web Push
      if (enabledChannels.value.includes("webpush")) {
        try {
          await CloudPushService.subscribeWebPush();
        } catch (e) {
          console.warn("[CloudPush] Web Push 訂閱失敗（非致命）:", e);
        }
      }

      enabled.value = true;
      lastSyncAt.value = Date.now();
      nextAlarm.value = res.nextAlarm;
      syncStatus.value = "success";

      await saveSettings();
    } catch (e: unknown) {
      syncStatus.value = "error";
      syncError.value = e instanceof Error ? e.message : String(e);
      console.error("[CloudPush] 同步失敗:", e);
    }
  }

  /** 拉取離線訊息並寫入對應聊天 */
  async function pullOfflineMessages(): Promise<number> {
    try {
      const messages = await CloudPushService.pullMessages();
      if (!messages.length) return 0;

      const { createDefaultMessage } = await import("@/types/chat");

      // 寫入 IndexedDB
      const allChats = await db.getAll<{
        id: string;
        characterId: string;
        isGroupChat?: boolean;
        messages: unknown[];
        unreadCount?: number;
        updatedAt: number;
        [key: string]: unknown;
      }>(DB_STORES.CHATS);

      for (const msg of messages) {
        // 找該角色最近的聊天
        const characterChats = allChats
          .filter((c) => c.characterId === msg.characterId && !c.isGroupChat)
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        let chat = characterChats[0];
        if (!chat) {
          // 建立新聊天
          chat = {
            id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            name: `與 ${msg.characterName} 的對話`,
            characterId: msg.characterId,
            messages: [],
            metadata: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        } else {
          // 深拷貝避免直接修改 IDB 讀出的物件
          chat = JSON.parse(JSON.stringify(chat));
        }

        // 建立 ChatMessage（sender 必須是 "assistant" 才會顯示為角色對話氣泡）
        const chatMessage = createDefaultMessage(
          "assistant",
          msg.characterName,
          msg.content,
        );
        chatMessage.createdAt = msg.createdAt;
        chatMessage.updatedAt = msg.createdAt;

        chat.messages.push(chatMessage);
        chat.unreadCount = (chat.unreadCount || 0) + 1;
        chat.updatedAt = Date.now();

        await db.put(DB_STORES.CHATS, chat);
      }

      // 如果當前有打開的聊天且是受影響的角色，重新載入
      try {
        const { useChatStore } = await import("@/stores/chat");
        const chatStore = useChatStore();
        const affectedCharIds = new Set(messages.map((m) => m.characterId));
        if (
          chatStore.currentChat &&
          affectedCharIds.has(chatStore.currentChat.characterId)
        ) {
          // 重新從 DB 載入當前聊天
          const freshChat = await db.get<{
            id: string;
            characterId: string;
            messages: unknown[];
            [key: string]: unknown;
          }>(DB_STORES.CHATS, chatStore.currentChat.id);
          if (freshChat) {
            chatStore.loadChat(freshChat as any);
          }
        }
      } catch {
        // 非關鍵路徑
      }

      // 確認已讀
      await CloudPushService.ackMessages();

      pendingMessageCount.value = 0;
      await saveSettings();

      return messages.length;
    } catch (e) {
      console.error("[CloudPush] 拉取離線訊息失敗:", e);
      return 0;
    }
  }

  /** 刷新雲端狀態 */
  async function refreshStatus(): Promise<void> {
    try {
      const status = await CloudPushService.getStatus();
      enabled.value = status.enabled;
      nextAlarm.value = status.nextAlarm;
      pendingMessageCount.value = status.pendingMessageCount;
      await saveSettings();
    } catch (e) {
      console.error("[CloudPush] 刷新狀態失敗:", e);
    }
  }

  /** 停用雲端推送 */
  async function disableCloudPush(): Promise<void> {
    try {
      await CloudPushService.disable();
      enabled.value = false;
      nextAlarm.value = null;
      pendingMessageCount.value = 0;
      syncStatus.value = "idle";
      await saveSettings();
    } catch (e) {
      console.error("[CloudPush] 停用失敗:", e);
    }
  }

  /** 測試推送 */
  async function testPushNotification(): Promise<void> {
    await CloudPushService.testPush();
  }


  /**
   * 發送本地存活心跳到 Worker
   * 後台模式啟用時定期呼叫，讓 Worker 知道本地還活著，避免重複生成
   */
  async function sendAliveHeartbeat(): Promise<void> {
    if (!enabled.value) return;
    try {
      await CloudPushService.syncAlive();
    } catch {
      // 非關鍵路徑，靜默失敗
    }
  }
  return {
    // 狀態
    enabled,
    discordUserId,
    enabledChannels,
    intervalMinutes,
    doNotDisturbEnabled,
    doNotDisturbStart,
    doNotDisturbEnd,
    lastSyncAt,
    nextAlarm,
    pendingMessageCount,
    syncStatus,
    syncError,
    // 操作
    loadSettings,
    saveSettings,
    syncToCloud,
    pullOfflineMessages,
    refreshStatus,
    disableCloudPush,
    testPushNotification,
    sendAliveHeartbeat,
  };
});
