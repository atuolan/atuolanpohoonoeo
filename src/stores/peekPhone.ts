/**
 * PeekPhone Store
 * 管理偷窺手機的狀態，包括快取、載入狀態、AI 生成結果
 */

import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { db, DB_STORES } from "@/db/database";
import {
  extractChatContext,
  extractSummariesAndEvents,
  generateCaughtReaction,
  generateContactReply,
  generateSequential,
  generateSinglePhase,
  type PeekSources,
} from "@/services/PeekPhoneService";
import { useLorebooksStore } from "@/stores/lorebooks";
import { useNotificationStore } from "@/stores/notification";
import { loadCharPlanner, syncPeekIntoPlanner } from "@/services/charPlanner";
import { loadPeekRealData } from "@/services/PeekRealData";
import { sendCharMessages } from "@/services/PeekLinks";
import type { CaughtFinding } from "@/services/PeekPhonePromptBuilder";
import { describeRealDataForPrompt, describeRealPhotosForPrompt } from "@/utils/peekRealData";
import { buildPlannerPromptText, toDateString } from "@/utils/charPlanner";
import { computeChatNow } from "@/utils/fakeTime";
import { isWorldInfoEntryEnabled } from "@/utils/worldInfoEntryState";
import { findPeekMember, peekGroupInfo } from "@/utils/peekMember";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import type {
  PeekChatMessage,
  PeekChatThread,
  PeekPhoneData,
  PeekPhoneTab,
  PeekProgress,
} from "@/types/peekPhone";
import { defineStore } from "pinia";
import { ref } from "vue";

export type GroupStatus = "idle" | "loading" | "done" | "error";

export const usePeekPhoneStore = defineStore("peekPhone", () => {
  // ===== State =====
  const groupStatus = ref<{
    A: GroupStatus;
    B: GroupStatus;
    C: GroupStatus;
    D: GroupStatus;
  }>({
    A: "idle",
    B: "idle",
    C: "idle",
    D: "idle",
  });
  const groupErrors = ref<{
    A: string | null;
    B: string | null;
    C: string | null;
    D: string | null;
  }>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const data = ref<PeekPhoneData | null>(null);
  const characterId = ref<string | null>(null);
  const chatId = ref<string | null>(null);

  /** 快取 Map，key = `${characterId}:${chatId}` */
  const cache = new Map<string, PeekPhoneData>();

  /** AbortController for the current combined in-flight request */
  const abortController = ref<AbortController | null>(null);

  /** 正在等待聯絡人回覆的聊天串 id（用於顯示「對方輸入中」與避免重複發送） */
  const replyingThreadId = ref<string | null>(null);
  /** 聯絡人回覆專用的 AbortController（與批量生成分開） */
  const replyAbortController = ref<AbortController | null>(null);

  // ===== Cache Actions =====

  function cacheKey(charId: string, cId: string): string {
    return `${charId}:${cId}`;
  }

  function getCached(charId: string, cId: string): PeekPhoneData | null {
    return cache.get(cacheKey(charId, cId)) ?? null;
  }

  function clearCache(charId: string, cId: string): void {
    cache.delete(cacheKey(charId, cId));
  }

  function storeCache(
    charId: string,
    cId: string,
    phoneData: PeekPhoneData,
  ): void {
    cache.set(cacheKey(charId, cId), phoneData);
  }

  // ===== IDB Persistence =====

  /** 從 IDB 載入偷窺手機資料 */
  async function loadFromIDB(charId: string, cId: string): Promise<PeekPhoneData | null> {
    try {
      await db.init();
      const key = cacheKey(charId, cId);
      const record = await db.get<{ id: string; characterId: string; chatId: string; data: PeekPhoneData; updatedAt: number }>(DB_STORES.PEEK_PHONE_DATA, key);
      if (record?.data) {
        // 同步寫入記憶體快取
        cache.set(key, record.data);
        return record.data;
      }
    } catch (err) {
      console.warn("[PeekPhone] 從 IDB 載入失敗:", err);
    }
    return null;
  }

  /** 將偷窺手機資料寫入 IDB */
  async function saveToIDB(charId: string, cId: string, phoneData: PeekPhoneData): Promise<void> {
    try {
      await db.init();
      const key = cacheKey(charId, cId);
      await db.put(DB_STORES.PEEK_PHONE_DATA, {
        id: key,
        characterId: charId,
        chatId: cId,
        // 手機資料是純 JSON；先拆掉 Vue 的響應式 Proxy，不然每次存都會先撞 DataCloneError 再重試
        data: JSON.parse(JSON.stringify(phoneData)) as PeekPhoneData,
        updatedAt: Date.now(),
      });
    } catch (err) {
      console.warn("[PeekPhone] 寫入 IDB 失敗:", err);
    }
  }

  /** 從 IDB 刪除偷窺手機資料 */
  async function deleteFromIDB(charId: string, cId: string): Promise<void> {
    try {
      await db.init();
      await db.delete(DB_STORES.PEEK_PHONE_DATA, cacheKey(charId, cId));
    } catch (err) {
      console.warn("[PeekPhone] 從 IDB 刪除失敗:", err);
    }
  }

  /**
   * 載入指定聊天的偷窺手機資料，或重置為空
   * 優先順序：記憶體快取 → IDB → 重置為 null
   * 確保切換聊天時不會看到上一個聊天的內容
   */
  async function loadOrReset(charId: string, cId: string): Promise<boolean> {
    if (Object.values(groupStatus.value).some((s) => s === "loading")) {
      // 同一支手機還在背景生成：保留進度，回來接著看
      if (characterId.value === charId && chatId.value === cId) return true;
      // 換了一支手機：先停掉上一支，免得它生成完把內容寫進這一支的畫面
      abortAll();
    }

    characterId.value = charId;
    chatId.value = cId;

    // 1. 檢查記憶體快取
    const cached = getCached(charId, cId);
    if (cached) {
      data.value = cached;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return true;
    }

    // 2. 嘗試從 IDB 載入
    const fromIDB = await loadFromIDB(charId, cId);
    if (fromIDB) {
      data.value = fromIDB;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return true;
    }

    // 3. 無資料，重置為 null（確保不顯示其他聊天的內容）
    data.value = null;
    groupStatus.value = { A: "idle", B: "idle", C: "idle", D: "idle" };
    groupErrors.value = { A: null, B: null, C: null, D: null };
    return false;
  }

  // ===== Generation Actions =====

  /** 確保 store 基本狀態已初始化（不觸發 API），供單組 refresh 時使用 */
  function ensureInitialized(charId: string, cId: string): void {
    if (characterId.value === charId && chatId.value === cId && data.value) {
      return; // 已初始化
    }
    characterId.value = charId;
    chatId.value = cId;
    if (!data.value) {
      data.value = createEmptyData(charId);
    }
  }

  /** 建立空的 PeekPhoneData 骨架 */
  function createEmptyData(charId: string): PeekPhoneData {
    return {
      characterId: charId,
      chats: [],
      schedule: [],
      meals: [],
      balance: 0,
      transactions: [],
      memos: [],
      notes: [],
      diary: [],
      gallery: [],
      browserHistory: [],
      hiddenPhotos: [],
    };
  }

  /** 從聊天解析對應的 user persona 名稱和描述 */
  function resolveUserInfo(
    chat: Chat,
    characterId: string,
  ): { userName: string; userDescription: string } {
    const userStore = useUserStore();
    const chatPersonaId = chat.metadata?.personaOverride?.personaId ?? null;
    const resolvedId = userStore.resolvePersonaForChat(
      chat.characterId || characterId,
      chatPersonaId,
    );
    if (resolvedId) {
      const persona = userStore.personas.find((p) => p.id === resolvedId);
      if (persona) {
        return {
          userName: persona.name || "使用者",
          userDescription: persona.description || "",
        };
      }
    }
    return {
      userName: userStore.currentName || "使用者",
      userDescription: userStore.currentDescription || "",
    };
  }

  /** 從角色綁定的世界書中提取世界觀設定文字 */
  function extractWorldInfo(character: StoredCharacter): string {
    const lorebooksStore = useLorebooksStore();
    const lorebookIds = character.lorebookIds ?? [];
    if (lorebookIds.length === 0) return "";

    const lorebooks = lorebooksStore.getLorebooksForCharacter(lorebookIds);
    if (lorebooks.length === 0) return "";

    const lines: string[] = [];
    for (const lb of lorebooks) {
      const enabledEntries = lb.entries.filter(isWorldInfoEntryEnabled);
      if (enabledEntries.length === 0) continue;
      lines.push(`【${lb.name || "世界書"}】`);
      for (const entry of enabledEntries) {
        const label = entry.comment || entry.key.join(", ") || "條目";
        lines.push(`- ${label}: ${entry.content.slice(0, 200)}`);
      }
    }
    return lines.join("\n");
  }

  /** 準備生成用的素材，時間照這段聊天的假時間 */
  async function collectSources(
    chat: Chat,
    character: StoredCharacter,
    charId: string,
    cId: string,
  ): Promise<PeekSources> {
    const { userName, userDescription } = resolveUserInfo(chat, charId);
    const now = computeChatNow(chat);
    // 多人卡成員：待辦行程是整段多人卡共用的，分不出是誰的，不帶進來
    const member = findPeekMember(chat, charId);
    const planner = member ? null : await loadCharPlanner(cId).catch(() => null);
    const hasPlanner = !!planner && (planner.todos.some((t) => !t.done) || planner.plans.length > 0);
    // 真的聊天、交易、日記：跟使用者那串直接顯示真的，交易和日記不要重複
    const charName = character.data.name || character.nickname || "角色";
    const real = await loadPeekRealData(chat, { userName, charName, now }).catch(() => null);
    return {
      chatContext: await extractChatContext(chat, 15, userName),
      summariesAndEvents: await extractSummariesAndEvents(cId, charId),
      worldInfo: extractWorldInfo(character),
      userName,
      userDescription,
      now,
      plannerText: hasPlanner ? buildPlannerPromptText(planner, toDateString(now), userName) : undefined,
      realUserThread: !!real && real.userThread.length > 0,
      realDataText: real ? describeRealDataForPrompt(real, userName) || undefined : undefined,
      realPhotosText: real ? describeRealPhotosForPrompt(real) || undefined : undefined,
      firstChatDate: real?.firstChatDate,
      ...(member ? { group: peekGroupInfo(chat, charId) } : {}),
    };
  }

  /** 行程、備忘錄組生成好了：寫回角色的待辦和行程，聊天頁和之後的聊天都照著走 */
  function syncPlannerFromPeek(cId: string, charId: string, partial: Partial<PeekPhoneData>, now: Date): void {
    if (!partial.schedule && !partial.memos) return;
    void syncPeekIntoPlanner(
      cId,
      charId,
      { schedule: partial.schedule, memos: partial.memos },
      toDateString(now),
    ).catch((e) => console.error("[PeekPhone] 寫回角色待辦與行程失敗:", e));
  }

  // ===== 偷看進度（解鎖、找到的秘密、看過的 App） =====

  /**
   * 更新進度：先改記憶體；四組都生成好了才存檔。
   * 生成中或有組失敗時不存，免得半成品被當成完整內容存進 IDB；生成完會連進度一起存。
   */
  function updateProgress(update: (p: PeekProgress) => PeekProgress): void {
    if (!data.value || !characterId.value || !chatId.value) return;
    const current = data.value.progress ?? { unlocked: false, revealed: [], viewed: [] };
    const next = update(current);
    if (next === current) return;
    data.value = { ...data.value, progress: next };
    if (!Object.values(groupStatus.value).every((s) => s === "done")) return;
    storeCache(characterId.value, chatId.value, data.value);
    saveToIDB(characterId.value, chatId.value, data.value);
  }

  function markRevealed(key: string): void {
    updateProgress((p) => (p.revealed.includes(key) ? p : { ...p, revealed: [...p.revealed, key] }));
  }

  /**
   * 偷看被他抓到：請 AI 寫他的第一反應，以他的訊息加進聊天（手機可能已經被關掉，所以放在 store 裡跑）
   * 失敗只記 log：聊天裡已經有「被發現」那筆，他下一則回覆還是會反應
   */
  async function reactToCaught(
    character: StoredCharacter,
    cId: string,
    found: CaughtFinding[],
    when: "mid" | "end",
    storyTime: number,
  ): Promise<void> {
    try {
      const chat = await db.get<Chat>(DB_STORES.CHATS, cId);
      if (!chat) return;
      const sources = await collectSources(chat, character, character.id, cId);
      const lines = await generateCaughtReaction(character, sources, found, when);
      const charName = character.data.name || character.nickname || "角色";
      await sendCharMessages(
        cId,
        charName,
        lines,
        storyTime,
        findPeekMember(chat, character.id) ? { id: character.id, avatar: character.avatar } : undefined,
      );
    } catch (err) {
      console.warn("[peekPhone] 被抓到的反應生成失敗:", err);
    }
  }

  /** 草稿幫他送出了：記下來，輸入框不再顯示（草稿還算找到的秘密） */
  function markDraftSent(threadId: string): void {
    if (!data.value || !characterId.value || !chatId.value) return;
    const chats = data.value.chats.map((t) => (t.id === threadId ? { ...t, draftSentAt: Date.now() } : t));
    data.value = { ...data.value, chats };
    storeCache(characterId.value, chatId.value, data.value);
    saveToIDB(characterId.value, chatId.value, data.value);
  }

  function markViewed(tab: PeekPhoneTab): void {
    updateProgress((p) => (p.viewed.includes(tab) ? p : { ...p, viewed: [...p.viewed, tab] }));
  }

  function setUnlocked(unlocked: boolean): void {
    updateProgress((p) => (p.unlocked === unlocked ? p : { ...p, unlocked }));
  }

  /** 取消進行中的請求 */
  function abortAll(): void {
    abortController.value?.abort();
    abortController.value = null;
  }

  /** 取消正在進行的聯絡人回覆 */
  function cancelContactReply(): void {
    replyAbortController.value?.abort();
    replyAbortController.value = null;
    replyingThreadId.value = null;
  }

  /**
   * 以手機主人（角色本人）的身份向某個聯絡人發送訊息，並取得該聯絡人的 AI 回覆。
   * 與批量重新生成完全分開，使用獨立的 generateContactReply。
   * 流程：追加 isSelf=true 的主人訊息 → 呼叫 generateContactReply → 追加聯絡人回覆
   *       → 更新 thread.updatedAt → 更新 data 與快取 → 持久化到 IDB。
   */
  async function sendMessageToContact(
    threadId: string,
    text: string,
    character: StoredCharacter,
  ): Promise<void> {
    const content = text.trim();
    if (!content) return;
    if (!characterId.value || !chatId.value || !data.value) return;
    // 避免在等待回覆時重複發送
    if (replyingThreadId.value) return;

    const charId = characterId.value;
    const cId = chatId.value;

    const thread = data.value.chats.find((t) => t.id === threadId);
    if (!thread) return;

    const ownerName = character.data.name || character.nickname || "我";
    // 聯絡人可能就是使用者本人，要帶入這段聊天用的 persona；訊息時間也照這段聊天的假時間
    const chatRecord = await db.get<Chat>(DB_STORES.CHATS, cId).catch(() => undefined);

    // 1. 追加手機主人送出的訊息（isSelf=true）
    const ownerMessage: PeekChatMessage = {
      id: `peek-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      senderName: ownerName,
      content,
      isSelf: true,
      timestamp: computeChatNow(chatRecord).getTime(),
    };
    appendMessageToThread(threadId, ownerMessage);
    // 把輸入框裡的草稿原封不動送出去了：草稿就不在了
    if (thread.draft && thread.draft.trim() === content) {
      data.value = {
        ...data.value,
        chats: data.value.chats.map((t) =>
          t.id === threadId ? { ...t, draft: undefined, draftHistory: undefined } : t,
        ),
      };
    }

    // 2. 呼叫 AI 取得聯絡人回覆（設定裡開著串流視窗就邊生成邊寫進視窗，視窗的停止鍵可以中止）
    const controller = new AbortController();
    replyAbortController.value = controller;
    replyingThreadId.value = threadId;
    const replyTaskConfig = useSettingsStore().getAPIForTask("peekPhone");
    const streamingWindow =
      replyTaskConfig.generation.streamingEnabled && replyTaskConfig.generation.useStreamingWindow
        ? useStreamingWindow()
        : null;
    streamingWindow?.show(replyTaskConfig.api.model || "AI");
    const unbindAbort = streamingWindow ? streamingWindow.bindAbortController(controller) : null;

    try {
      const worldInfo = extractWorldInfo(character);
      const { userName, userDescription } = resolveUserInfo(chatRecord ?? ({} as Chat), charId);
      const reply = await generateContactReply(
        {
          userName,
          userDescription,
          ownerName,
          ownerDesc: character.data.description || "",
          ownerPersona: character.data.personality || "",
          scenario: character.data.scenario || "",
          worldInfo,
          contactName: thread.contactName,
          thread,
          newMessage: content,
          now: computeChatNow(chatRecord),
        },
        controller.signal,
        streamingWindow ? (token) => streamingWindow.appendToken(token) : undefined,
      );
      streamingWindow?.setComplete();
      // 按了停止：串流會帶著半截內容正常結束，不貼半截回覆
      if (controller.signal.aborted) return;

      // 3. 追加聯絡人回覆（isSelf=false）
      const contactMessage: PeekChatMessage = {
        id: `peek-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderName: thread.contactName,
        senderAvatar: thread.contactAvatar,
        content: reply,
        isSelf: false,
        timestamp: computeChatNow(chatRecord).getTime(),
      };
      appendMessageToThread(threadId, contactMessage);

      // 4. 持久化
      storeCache(charId, cId, data.value);
      await saveToIDB(charId, cId, data.value);
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        streamingWindow?.setComplete();
        return;
      }
      const msg = err?.message ?? "聯絡人回覆失敗";
      streamingWindow?.setError(msg);
      const notificationStore = useNotificationStore();
      notificationStore.addNotification({
        type: "system",
        title: "📱 聯絡人回覆失敗",
        message: `${thread.contactName} 沒有回覆：${msg}`,
        characterId: charId,
        characterName: character.data.name || character.nickname || "角色",
        characterAvatar: character.avatar,
        priority: "normal",
      });
      throw err;
    } finally {
      unbindAbort?.();
      if (replyAbortController.value === controller) {
        replyAbortController.value = null;
      }
      if (replyingThreadId.value === threadId) {
        replyingThreadId.value = null;
      }
    }
  }

  /**
   * 將一則訊息追加到指定聊天串，並把該串移到列表最前面、更新 updatedAt。
   * 以不可變方式更新 data.value，確保 Vue 響應式正確觸發。
   */
  function appendMessageToThread(
    threadId: string,
    message: PeekChatMessage,
  ): void {
    if (!data.value) return;
    const now = Date.now();
    let updatedThread: PeekChatThread | null = null;
    const chats = data.value.chats.map((t) => {
      if (t.id !== threadId) return t;
      updatedThread = {
        ...t,
        messages: [...t.messages, message],
        updatedAt: now,
      };
      return updatedThread;
    });
    if (!updatedThread) return;
    data.value = { ...data.value, chats };
  }

  /**
   * 觸發合併生成（單次 API 呼叫生成全部模塊）
   */
  async function generateAll(
    charId: string,
    cId: string,
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    // 檢查記憶體快取
    const cached = getCached(charId, cId);
    if (cached) {
      data.value = cached;
      characterId.value = charId;
      chatId.value = cId;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return;
    }

    // 檢查 IDB 持久化資料
    const fromIDB = await loadFromIDB(charId, cId);
    if (fromIDB) {
      data.value = fromIDB;
      characterId.value = charId;
      chatId.value = cId;
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };
      return;
    }

    // 設定當前狀態
    characterId.value = charId;
    chatId.value = cId;
    data.value = createEmptyData(charId);
    groupStatus.value = { A: "loading", B: "idle", C: "idle", D: "idle" };
    groupErrors.value = { A: null, B: null, C: null, D: null };

    const sources = await collectSources(chat, character, charId, cId);

    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    const controller = new AbortController();
    abortController.value = controller;
    const unbindAbort = streamingWindow
      ? streamingWindow.bindAbortController(controller)
      : null;

    try {
      const result = await generateSequential(
        character,
        sources,
        controller.signal,
        (phase, partial) => {
          data.value = { ...data.value!, ...partial };
          if (phase === "A") {
            groupStatus.value.A = "done";
            groupStatus.value.B = "loading";
            groupStatus.value.C = "loading";
          } else if (phase === "BC") {
            groupStatus.value.B = "done";
            groupStatus.value.C = "done";
            groupStatus.value.D = "loading";
            // 多人卡成員的手機不寫回待辦行程
            if (!sources.group) syncPlannerFromPeek(cId, charId, partial, sources.now);
          }
        },
        streamingWindow
          ? (_phase, token) => streamingWindow.appendToken(token)
          : undefined,
      );

      // 生成中解鎖、找到的秘密記在 data.value 上，跟結果合併
      data.value = { ...result, progress: data.value?.progress };
      groupStatus.value = { A: "done", B: "done", C: "done", D: "done" };
      groupErrors.value = { A: null, B: null, C: null, D: null };

      if (streamingWindow) streamingWindow.setComplete();

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成完成",
        message: `${charName} 的手機內容已全部生成完成`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });

      storeCache(charId, cId, data.value);
      // 持久化到 IDB
      saveToIDB(charId, cId, data.value);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        streamingWindow?.clearAbortBinding();
        if (streamingWindow) streamingWindow.setComplete();
        return;
      }
      const msg = err?.message ?? "生成失敗";
      // 已經生成好的組留著，只把還沒完成的標成失敗
      // （例如相簿組被模型拒絕，聊天、日記照樣看得到，之後只要重生相簿組）
      for (const g of ["A", "B", "C", "D"] as const) {
        if (groupStatus.value[g] !== "done") {
          groupStatus.value[g] = "error";
          groupErrors.value[g] = msg;
        }
      }
      if (streamingWindow) streamingWindow.setError(msg);

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機生成失敗",
        message: `${charName} 的手機內容生成失敗：${msg}`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    } finally {
      unbindAbort?.();
      streamingWindow?.clearAbortBinding();
      abortController.value = null;
    }
  }

  /**
   * 重試（合併模式：重試即重新生成全部）
   */
  async function retryGroup(
    _group: "A" | "B" | "C" | "D",
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    if (!characterId.value || !chatId.value) return;
    abortController.value?.abort();
    clearCache(characterId.value, chatId.value);
    deleteFromIDB(characterId.value, chatId.value);
    await generateAll(characterId.value, chatId.value, character, chat);
  }

  /**
   * 單獨重新生成某一階段（A / BC / D）
   * - 清除該階段對應的欄位
   * - 保留其他已生成的欄位作為上下文
   * - 生成完成後合併回 data 並儲存到快取 + IDB
   */
  async function regeneratePhase(
    phase: "A" | "BC" | "D",
    character: StoredCharacter,
    chat: Chat,
  ): Promise<void> {
    if (!characterId.value || !chatId.value) return;
    const charId = characterId.value;
    const cId = chatId.value;

    abortController.value?.abort();

    // 確保 data 存在
    if (!data.value) {
      data.value = createEmptyData(charId);
    }

    // 清除該階段對應的欄位
    if (phase === "A") {
      // 聊天重生會換一組鎖屏密碼，下次拿起要重新解
      data.value = {
        ...data.value,
        chats: [],
        lockScreen: undefined,
        progress: data.value.progress && { ...data.value.progress, unlocked: false },
      };
      groupStatus.value.A = "loading";
      groupErrors.value.A = null;
    } else if (phase === "BC") {
      data.value = { ...data.value, schedule: [], meals: [], memos: [], notes: [], diary: [], balance: 0, transactions: [] };
      groupStatus.value.B = "loading";
      groupStatus.value.C = "loading";
      groupErrors.value.B = null;
      groupErrors.value.C = null;
    } else if (phase === "D") {
      data.value = { ...data.value, gallery: [], browserHistory: [], hiddenPhotos: [], screenTime: undefined };
      groupStatus.value.D = "loading";
      groupErrors.value.D = null;
    }

    const sources = await collectSources(chat, character, charId, cId);

    const settingsStore = useSettingsStore();
    const taskConfig = settingsStore.getAPIForTask("peekPhone");
    const isStreamingEnabled = taskConfig.generation.streamingEnabled;
    const useWindow = isStreamingEnabled && taskConfig.generation.useStreamingWindow;

    const streamingWindow = useWindow ? useStreamingWindow() : null;
    if (streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");
    }

    const controller = new AbortController();
    abortController.value = controller;
    const unbindAbort = streamingWindow
      ? streamingWindow.bindAbortController(controller)
      : null;

    try {
      const partial = await generateSinglePhase(
        phase,
        character,
        sources,
        data.value,
        controller.signal,
        streamingWindow
          ? (token) => streamingWindow.appendToken(token)
          : undefined,
      );

      // 合併回 data
      data.value = { ...data.value!, ...partial };

      // 更新狀態
      if (phase === "A") {
        groupStatus.value.A = "done";
      } else if (phase === "BC") {
        groupStatus.value.B = "done";
        groupStatus.value.C = "done";
        // 多人卡成員的手機不寫回待辦行程
        if (!sources.group) syncPlannerFromPeek(cId, charId, partial, sources.now);
      } else if (phase === "D") {
        groupStatus.value.D = "done";
      }

      if (streamingWindow) streamingWindow.setComplete();

      // 儲存到快取 + IDB
      storeCache(charId, cId, data.value);
      saveToIDB(charId, cId, data.value);

      const notificationStore = useNotificationStore();
      const charName = character.data.name || character.nickname || "角色";
      const phaseLabel = phase === "A" ? "聊天紀錄" : phase === "BC" ? "行程/日記/錢包" : "相冊/瀏覽紀錄";
      notificationStore.addNotification({
        type: "system",
        title: "📱 偷窺手機局部刷新完成",
        message: `${charName} 的${phaseLabel}已重新生成`,
        characterId: charId,
        characterName: charName,
        characterAvatar: character.avatar,
        priority: "normal",
      });
    } catch (err: any) {
      if (err?.name === "AbortError") {
        streamingWindow?.clearAbortBinding();
        if (streamingWindow) streamingWindow.setComplete();
        return;
      }
      const msg = err?.message ?? "生成失敗";
      if (phase === "A") {
        groupStatus.value.A = "error";
        groupErrors.value.A = msg;
      } else if (phase === "BC") {
        groupStatus.value.B = "error";
        groupStatus.value.C = "error";
        groupErrors.value.B = msg;
        groupErrors.value.C = msg;
      } else if (phase === "D") {
        groupStatus.value.D = "error";
        groupErrors.value.D = msg;
      }
      if (streamingWindow) streamingWindow.setError(msg);
    } finally {
      unbindAbort?.();
      streamingWindow?.clearAbortBinding();
      abortController.value = null;
    }
  }

  return {
    // State
    groupStatus,
    groupErrors,
    data,
    characterId,
    chatId,
    // Cache actions
    getCached,
    clearCache,
    storeCache,
    // IDB persistence
    loadFromIDB,
    saveToIDB,
    deleteFromIDB,
    loadOrReset,
    // Generation actions
    ensureInitialized,
    generateAll,
    regeneratePhase,
    retryGroup,
    abortAll,
    // Progress
    markRevealed,
    markViewed,
    setUnlocked,
    // Contact reply (interactive chat)
    replyingThreadId,
    replyAbortController,
    sendMessageToContact,
    cancelContactReply,
    // 這段聊天用的使用者名字（偷窺手機上顯示真的聊天時用）
    resolveUserName: (chat: Chat, charId: string) => resolveUserInfo(chat, charId).userName,
    markDraftSent,
    reactToCaught,
    // Exposed for testing
    cache,
    abortController,
  };
});
