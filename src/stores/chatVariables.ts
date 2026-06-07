/**
 * 聊天變量存儲
 * 對應 SillyTavern 的 {{getvar}} / {{setvar}} 局部（per-chat）及全局變量系統
 */
import { defineStore } from "pinia";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatLocalPrompt } from "@/types/chat";

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

function toBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(([, val]) => typeof val === "boolean"),
  ) as Record<string, boolean>;
}

function toChatPrompts(value: unknown): ChatLocalPrompt[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChatLocalPrompt => {
    if (!item || typeof item !== "object") return false;
    const prompt = item as Partial<ChatLocalPrompt>;
    return (
      typeof prompt.id === "string" &&
      typeof prompt.name === "string" &&
      typeof prompt.role === "string" &&
      typeof prompt.content === "string" &&
      typeof prompt.injection_position === "number" &&
      typeof prompt.injection_depth === "number" &&
      typeof prompt.injection_order === "number" &&
      typeof prompt.enabled === "boolean"
    );
  });
}

export const useChatVariablesStore = defineStore("chatVariables", {
  state: () => ({
    localVars: {} as Record<string, string>,
    promptToggles: {} as Record<string, boolean>,
    chatPrompts: [] as ChatLocalPrompt[],
    globalVars: {} as Record<string, string>,
    _currentChatId: "",
    _localRevision: 0,
    _saveLocalTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }),

  actions: {
    /** 切換 / 初始化到指定聊天，先載入舊 localStorage，再用 IDB 聊天記錄覆蓋並遷移 */
    initForChat(chatId: string) {
      if (this._currentChatId === chatId) {
        this._loadGlobal();
        return;
      }

      const legacyVars = this._loadLegacyLocalVars(chatId);
      this._setCurrentChatVars(chatId, legacyVars);
      this._loadGlobal();
      void this._loadLocalFromIdb(chatId, legacyVars, this._localRevision);
    },

    /** 已經拿到 Chat 記錄時同步初始化，避免生成前還在等 IDB 背景讀取 */
    initForChatFromRecord(chat: Chat) {
      const idbVars = chat.chatVariables?.localVars;
      const nextVars = idbVars && typeof idbVars === "object"
        ? toStringRecord(idbVars)
        : this._loadLegacyLocalVars(chat.id);

      this._setCurrentChatState(
        chat.id,
        nextVars,
        toBooleanRecord(chat.chatVariables?.promptToggles),
        toChatPrompts(chat.chatVariables?.chatPrompts),
      );
      this._loadGlobal();

      if (!idbVars && Object.keys(nextVars).length > 0) {
        this._scheduleSaveLocalToIdb();
      }
    },

    // ── 局部變量 ──────────────────────────────────────────────
    getLocal(name: string): string {
      return String(this.localVars[name] ?? "");
    },

    setLocal(name: string, value: string): void {
      this.localVars[name] = value;
      this._localRevision += 1;
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
      this._localRevision += 1;
      this._saveLocal();
    },

    incLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur + 1);
      this._localRevision += 1;
      this._saveLocal();
      return this.localVars[name];
    },

    decLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur - 1);
      this._localRevision += 1;
      this._saveLocal();
      return this.localVars[name];
    },

    clearLocal(): void {
      this.localVars = {};
      this._localRevision += 1;
      if (this._currentChatId) {
        localStorage.removeItem(localKey(this._currentChatId));
        this._scheduleSaveLocalToIdb();
      }
    },

    // ── 聊天專屬提示詞開關 ────────────────────────────────────
    getPromptToggle(identifier: string, defaultEnabled: boolean): boolean {
      if (Object.prototype.hasOwnProperty.call(this.promptToggles, identifier)) {
        return this.promptToggles[identifier];
      }
      return defaultEnabled;
    },

    setPromptToggle(identifier: string, enabled: boolean, defaultEnabled: boolean): void {
      const next = { ...this.promptToggles };
      if (enabled === defaultEnabled) {
        delete next[identifier];
      } else {
        next[identifier] = enabled;
      }
      this.promptToggles = next;
      this._localRevision += 1;
      this._scheduleSaveLocalToIdb();
    },

    prunePromptToggles(validIds: string[]): void {
      const valid = new Set(validIds);
      const next = Object.fromEntries(
        Object.entries(this.promptToggles).filter(([key]) => valid.has(key)),
      ) as Record<string, boolean>;
      if (Object.keys(next).length === Object.keys(this.promptToggles).length) return;
      this.promptToggles = next;
      this._localRevision += 1;
      this._scheduleSaveLocalToIdb();
    },

    // ── 聊天專屬提示詞 ────────────────────────────────────────
    addChatPrompt(prompt: Omit<ChatLocalPrompt, "id" | "createdAt" | "updatedAt"> & { id?: string }): ChatLocalPrompt {
      const now = Date.now();
      const created: ChatLocalPrompt = {
        ...prompt,
        id: prompt.id || `chat__${now}_${Math.random().toString(36).slice(2, 10)}`,
        createdAt: now,
        updatedAt: now,
      };
      this.chatPrompts = [...this.chatPrompts, created];
      this._localRevision += 1;
      this._scheduleSaveLocalToIdb();
      return created;
    },

    updateChatPrompt(id: string, patch: Partial<Omit<ChatLocalPrompt, "id" | "createdAt">>): void {
      const now = Date.now();
      this.chatPrompts = this.chatPrompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...patch, updatedAt: now } : prompt,
      );
      this._localRevision += 1;
      this._scheduleSaveLocalToIdb();
    },

    deleteChatPrompt(id: string): void {
      const before = this.chatPrompts.length;
      this.chatPrompts = this.chatPrompts.filter((prompt) => prompt.id !== id);
      if (this.chatPrompts.length === before) return;
      const nextToggles = { ...this.promptToggles };
      delete nextToggles[id];
      this.promptToggles = nextToggles;
      this._localRevision += 1;
      this._scheduleSaveLocalToIdb();
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

    _setCurrentChatVars(chatId: string, vars: Record<string, string>): void {
      this._setCurrentChatState(chatId, vars, {}, []);
    },

    _setCurrentChatState(
      chatId: string,
      vars: Record<string, string>,
      promptToggles: Record<string, boolean>,
      chatPrompts: ChatLocalPrompt[],
    ): void {
      if (this._saveLocalTimer) {
        clearTimeout(this._saveLocalTimer);
        this._saveLocalTimer = undefined;
      }
      this._currentChatId = chatId;
      this._localRevision += 1;
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
      this._scheduleSaveLocalToIdb();
    },

    async _loadLocalFromIdb(
      chatId: string,
      legacyVars: Record<string, string>,
      loadRevision: number,
    ): Promise<void> {
      try {
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (this._currentChatId !== chatId) return;

        const idbVars = chat?.chatVariables?.localVars;
        if (idbVars && typeof idbVars === "object") {
          const nextVars = toStringRecord(idbVars);
          const nextToggles = toBooleanRecord(chat?.chatVariables?.promptToggles);
          const nextPrompts = toChatPrompts(chat?.chatVariables?.chatPrompts);
          if (this._localRevision === loadRevision) {
            this.localVars = nextVars;
            this.promptToggles = nextToggles;
            this.chatPrompts = nextPrompts;
            try {
              localStorage.setItem(localKey(chatId), JSON.stringify(nextVars));
            } catch {
              // storage quota exceeded — 靜默忽略
            }
          }
          return;
        }

        if (Object.keys(legacyVars).length > 0 && this._localRevision === loadRevision) {
          this._scheduleSaveLocalToIdb();
        }
      } catch (error) {
        console.warn("[chatVariables] 從 IDB 載入聊天變量失敗:", error);
      }
    },

    _scheduleSaveLocalToIdb(): void {
      if (!this._currentChatId) return;
      if (this._saveLocalTimer) clearTimeout(this._saveLocalTimer);

      const chatId = this._currentChatId;
      const varsSnapshot = { ...this.localVars };
      const toggleSnapshot = { ...this.promptToggles };
      const promptsSnapshot = this.chatPrompts.map((prompt) => ({ ...prompt }));
      this._saveLocalTimer = setTimeout(() => {
        void this._saveLocalToIdb(chatId, varsSnapshot, toggleSnapshot, promptsSnapshot);
      }, CHAT_VARIABLES_SAVE_DELAY_MS);
    },

    async _saveLocalToIdb(
      chatId: string,
      snapshot: Record<string, string>,
      promptToggles: Record<string, boolean> = {},
      chatPrompts: ChatLocalPrompt[] = [],
    ): Promise<void> {
      try {
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (!chat) return;

        chat.chatVariables = {
          version: 1,
          localVars: snapshot,
          promptToggles: Object.keys(promptToggles).length > 0 ? promptToggles : undefined,
          chatPrompts: chatPrompts.length > 0 ? chatPrompts : undefined,
          updatedAt: Date.now(),
        };

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
