/**
 * 聊天變量存儲
 * 對應 SillyTavern 的 {{getvar}} / {{setvar}} 局部（per-chat）及全局變量系統
 *
 * 同時保管「專屬預設」（promptToggles / chatPrompts）：每個聊天各自獨立，
 * 和局部變量一起存在聊天記錄的 chatVariables 上。
 */
import { defineStore } from "pinia";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatLocalPrompt, ChatVariablesState } from "@/types/chat";
import {
  readChatPromptPreset,
  sanitizeChatPrompts,
  sanitizePromptToggles,
  type ChatPromptPreset,
} from "@/utils/chatPromptPreset";

const LS_GLOBAL_KEY = "aguaphone_global_vars";
const CHAT_VARIABLES_SAVE_DELAY_MS = 500;

function localKey(chatId: string) {
  return `aguaphone_chat_vars_${chatId}`;
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, val]) => [key, String(val ?? "")]),
  );
}

function clonePrompts(prompts: ChatLocalPrompt[]): ChatLocalPrompt[] {
  return prompts.map((prompt) => ({ ...prompt, modes: [...prompt.modes] }));
}

export const useChatVariablesStore = defineStore("chatVariables", {
  state: () => ({
    localVars: {} as Record<string, string>,
    promptToggles: {} as Record<string, boolean>,
    chatPrompts: [] as ChatLocalPrompt[],
    globalVars: {} as Record<string, string>,
    /** 目前綁定的聊天；空字串代表還沒建立記錄的新聊天（內容先留在記憶體） */
    _currentChatId: "",
    _revision: 0,
    _saveTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }),

  getters: {
    /** 專屬預設總共調整了幾項（強制開關 + 專屬條目） */
    presetCount: (state): number =>
      Object.keys(state.promptToggles).length + state.chatPrompts.length,
  },

  actions: {
    /** 切換 / 初始化到指定聊天，先載入舊 localStorage，再用 IDB 聊天記錄覆蓋 */
    initForChat(chatId: string) {
      if (this._currentChatId === chatId) {
        this._loadGlobal();
        return;
      }
      if (!chatId) {
        this.resetForNewChat();
        return;
      }

      const legacyVars = this._loadLegacyLocalVars(chatId);
      this._bind(chatId, legacyVars, {}, []);
      this._loadGlobal();
      void this._loadFromIdb(chatId, legacyVars, this._revision);
    },

    /** 已經拿到 Chat 記錄時同步初始化，避免生成前還在等 IDB 背景讀取 */
    initForChatFromRecord(chat: Chat) {
      // 同一個聊天還有尚未寫入的修改：記憶體裡的比這份記錄新，不要蓋掉
      if (this._currentChatId === chat.id && this._saveTimer) {
        this._loadGlobal();
        return;
      }

      const idbVars = chat.chatVariables?.localVars;
      const hasIdbVars = !!idbVars && typeof idbVars === "object";
      const nextVars = hasIdbVars
        ? toStringRecord(idbVars)
        : this._loadLegacyLocalVars(chat.id);

      this._bind(
        chat.id,
        nextVars,
        sanitizePromptToggles(chat.chatVariables?.promptToggles),
        sanitizeChatPrompts(chat.chatVariables?.chatPrompts),
      );
      this._loadGlobal();

      if (!hasIdbVars && Object.keys(nextVars).length > 0) {
        this._scheduleSave();
      }
    },

    /** 開啟一個還沒有記錄的新聊天：清空狀態，之後的修改先留在記憶體 */
    resetForNewChat() {
      this._bind("", {}, {}, []);
      this._loadGlobal();
    },

    /**
     * 新聊天第一次取得 ID 時呼叫：把記憶體裡的內容歸給這個聊天。
     * 聊天記錄由 ChatScreen 的保存流程建立，內容會一併寫入。
     */
    adoptNewChat(chatId: string) {
      if (this._currentChatId !== "") {
        this.initForChat(chatId);
        return;
      }
      this._currentChatId = chatId;
      this._revision += 1;
      this._loadGlobal();
      if (Object.keys(this.localVars).length > 0) this._saveLocal();
    },

    isBoundTo(chatId: string): boolean {
      return this._currentChatId === chatId;
    },

    /** 目前狀態的快照，供寫入聊天記錄 */
    snapshotChatVariables(updatedAt: number = Date.now()): ChatVariablesState {
      const snapshot: ChatVariablesState = {
        version: 1,
        localVars: { ...this.localVars },
        updatedAt,
      };
      if (Object.keys(this.promptToggles).length > 0) {
        snapshot.promptToggles = { ...this.promptToggles };
      }
      if (this.chatPrompts.length > 0) {
        snapshot.chatPrompts = clonePrompts(this.chatPrompts);
      }
      return snapshot;
    },

    /**
     * 取得某個聊天的專屬預設。
     * 該聊天正開著就用記憶體裡的（可能有還沒寫入的修改），否則讀聊天記錄。
     */
    presetForChat(
      chatId: string,
      record?: { chatVariables?: Chat["chatVariables"] | null } | null,
    ): ChatPromptPreset {
      if (this._currentChatId !== chatId) return readChatPromptPreset(record);
      return {
        chatPromptToggles: { ...this.promptToggles },
        chatLocalPrompts: clonePrompts(this.chatPrompts),
      };
    },

    // ── 局部變量 ──────────────────────────────────────────────
    getLocal(name: string): string {
      return String(this.localVars[name] ?? "");
    },

    setLocal(name: string, value: string): void {
      this.localVars[name] = value;
      this._revision += 1;
      this._saveLocal();
    },

    addLocal(name: string, increment: string): void {
      const cur = this.localVars[name] ?? "";
      const numCur = parseFloat(cur);
      const numInc = parseFloat(increment);
      if (!isNaN(numCur) && !isNaN(numInc)) {
        this.localVars[name] = String(numCur + numInc);
      } else {
        this.localVars[name] = cur + increment;
      }
      this._revision += 1;
      this._saveLocal();
    },

    incLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur + 1);
      this._revision += 1;
      this._saveLocal();
      return this.localVars[name];
    },

    decLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur - 1);
      this._revision += 1;
      this._saveLocal();
      return this.localVars[name];
    },

    clearLocal(): void {
      this.localVars = {};
      this._revision += 1;
      if (this._currentChatId) {
        localStorage.removeItem(localKey(this._currentChatId));
        this._scheduleSave();
      }
    },

    // ── 專屬預設：開關調整 ────────────────────────────────────
    /** 這個聊天對某個提示詞的強制值；null = 跟隨全域預設 */
    getPromptOverride(identifier: string): boolean | null {
      return Object.prototype.hasOwnProperty.call(this.promptToggles, identifier)
        ? this.promptToggles[identifier]
        : null;
    },

    /** 設定強制開 / 強制關；傳 null 改回跟隨全域預設 */
    setPromptOverride(identifier: string, value: boolean | null): void {
      const next = { ...this.promptToggles };
      if (value === null) {
        if (!Object.prototype.hasOwnProperty.call(next, identifier)) return;
        delete next[identifier];
      } else {
        if (next[identifier] === value) return;
        next[identifier] = value;
      }
      this.promptToggles = next;
      this._revision += 1;
      this._scheduleSave();
    },

    /** 把指定條目改回跟隨全域預設；不傳則全部改回 */
    resetPromptOverrides(identifiers?: string[]): void {
      const drop = identifiers ? new Set(identifiers) : null;
      const next = drop
        ? (Object.fromEntries(
            Object.entries(this.promptToggles).filter(([key]) => !drop.has(key)),
          ) as Record<string, boolean>)
        : {};
      if (Object.keys(next).length === Object.keys(this.promptToggles).length) return;
      this.promptToggles = next;
      this._revision += 1;
      this._scheduleSave();
    },

    // ── 專屬預設：專屬條目 ────────────────────────────────────
    addChatPrompt(prompt: Omit<ChatLocalPrompt, "id" | "createdAt" | "updatedAt">): ChatLocalPrompt {
      const now = Date.now();
      const created: ChatLocalPrompt = {
        ...prompt,
        modes: [...prompt.modes],
        id: `chat__${now}_${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        updatedAt: now,
      };
      this.chatPrompts = [...this.chatPrompts, created];
      this._revision += 1;
      this._scheduleSave();
      return created;
    },

    updateChatPrompt(id: string, patch: Partial<Omit<ChatLocalPrompt, "id" | "createdAt">>): void {
      const now = Date.now();
      this.chatPrompts = this.chatPrompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...patch, updatedAt: now } : prompt,
      );
      this._revision += 1;
      this._scheduleSave();
    },

    deleteChatPrompt(id: string): void {
      const before = this.chatPrompts.length;
      this.chatPrompts = this.chatPrompts.filter((prompt) => prompt.id !== id);
      if (this.chatPrompts.length === before) return;
      this._revision += 1;
      this._scheduleSave();
    },

    // ── 全局變量 ──────────────────────────────────────────────
    getGlobal(name: string): string {
      return String(this.globalVars[name] ?? "");
    },

    setGlobal(name: string, value: string): void {
      this.globalVars[name] = value;
      this._saveGlobal();
    },

    addGlobal(name: string, increment: string): void {
      const cur = this.globalVars[name] ?? "";
      const numCur = parseFloat(cur);
      const numInc = parseFloat(increment);
      if (!isNaN(numCur) && !isNaN(numInc)) {
        this.globalVars[name] = String(numCur + numInc);
      } else {
        this.globalVars[name] = cur + increment;
      }
      this._saveGlobal();
    },

    incGlobal(name: string): string {
      const cur = parseFloat(this.globalVars[name] ?? "0") || 0;
      this.globalVars[name] = String(cur + 1);
      this._saveGlobal();
      return this.globalVars[name];
    },

    decGlobal(name: string): string {
      const cur = parseFloat(this.globalVars[name] ?? "0") || 0;
      this.globalVars[name] = String(cur - 1);
      this._saveGlobal();
      return this.globalVars[name];
    },

    // ── 內部 ──────────────────────────────────────────────────
    _loadLegacyLocalVars(chatId: string): Record<string, string> {
      try {
        const saved = localStorage.getItem(localKey(chatId));
        return saved ? toStringRecord(JSON.parse(saved)) : {};
      } catch {
        return {};
      }
    },

    /** 換綁到另一個聊天；上一個聊天還沒寫入的修改先落地，不能丟 */
    _bind(
      chatId: string,
      vars: Record<string, string>,
      promptToggles: Record<string, boolean>,
      chatPrompts: ChatLocalPrompt[],
    ): void {
      this._flushSave();
      this._currentChatId = chatId;
      this._revision += 1;
      this.localVars = vars;
      this.promptToggles = promptToggles;
      this.chatPrompts = chatPrompts;
    },

    _saveLocal(): void {
      if (!this._currentChatId) return;
      try {
        localStorage.setItem(localKey(this._currentChatId), JSON.stringify(this.localVars));
      } catch {
        // storage quota exceeded — 靜默忽略
      }
      this._scheduleSave();
    },

    async _loadFromIdb(
      chatId: string,
      legacyVars: Record<string, string>,
      loadRevision: number,
    ): Promise<void> {
      try {
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        // 已換到別的聊天，或讀取期間本地有新的修改 → 不覆蓋
        if (this._currentChatId !== chatId || this._revision !== loadRevision) return;

        this.promptToggles = sanitizePromptToggles(chat?.chatVariables?.promptToggles);
        this.chatPrompts = sanitizeChatPrompts(chat?.chatVariables?.chatPrompts);

        const idbVars = chat?.chatVariables?.localVars;
        if (idbVars && typeof idbVars === "object") {
          const nextVars = toStringRecord(idbVars);
          this.localVars = nextVars;
          try {
            localStorage.setItem(localKey(chatId), JSON.stringify(nextVars));
          } catch {
            // storage quota exceeded — 靜默忽略
          }
          return;
        }

        if (Object.keys(legacyVars).length > 0) {
          this._scheduleSave();
        }
      } catch (error) {
        console.warn("[chatVariables] 從 IDB 載入聊天變量失敗:", error);
      }
    },

    _scheduleSave(): void {
      if (!this._currentChatId) return;
      if (this._saveTimer) clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this._flushSave(), CHAT_VARIABLES_SAVE_DELAY_MS);
    },

    /** 把排程中的保存立刻寫入（沒有排程就什麼都不做） */
    _flushSave(): void {
      if (!this._saveTimer) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
      if (!this._currentChatId) return;
      void this._saveToIdb(this._currentChatId, this.snapshotChatVariables());
    },

    async _saveToIdb(chatId: string, snapshot: ChatVariablesState): Promise<void> {
      try {
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (!chat) return;

        chat.chatVariables = snapshot;
        await db.put(DB_STORES.CHATS, chat);
      } catch (error) {
        console.warn("[chatVariables] 保存聊天變量到 IDB 失敗:", error);
      }
    },

    _saveGlobal(): void {
      try {
        localStorage.setItem(LS_GLOBAL_KEY, JSON.stringify(this.globalVars));
      } catch {
        // storage quota exceeded — 靜默忽略
      }
    },

    _loadGlobal(): void {
      try {
        const saved = localStorage.getItem(LS_GLOBAL_KEY);
        this.globalVars = saved ? toStringRecord(JSON.parse(saved)) : {};
      } catch {
        this.globalVars = {};
      }
    },
  },
});
