/**
 * 聊天變量存儲
 * 對應 SillyTavern 的 {{getvar}} / {{setvar}} 局部（per-chat）及全局變量系統
 *
 * 提示詞覆蓋（promptToggles / chatPrompts）改為依「角色卡 / 真群聊」作用域
 * 儲存於 PROMPT_OVERRIDES，scope 規則見 src/utils/promptOverrideScope.ts。
 */
import { defineStore } from "pinia";
import { db, DB_STORES } from "@/db/database";
import type { Chat, ChatLocalPrompt, PromptOverrideRecord } from "@/types/chat";
import {
  getPromptOverrideScopeKey,
  type PromptOverrideScopeInput,
} from "@/utils/promptOverrideScope";

const LS_GLOBAL_KEY = "aguaphone_global_vars";
const CHAT_VARIABLES_SAVE_DELAY_MS = 500;
const PROMPT_OVERRIDE_SAVE_DELAY_MS = 500;

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
    _currentScopeKey: "",
    _localRevision: 0,
    _scopeRevision: 0,
    _saveLocalTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    _saveScopeTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  }),

  actions: {
    /** 切換 / 初始化到指定聊天，先載入舊 localStorage，再用 IDB 聊天記錄覆蓋並遷移
     *
     * 注意：此方法只負責 localVars。提示詞開關 / 聊天專屬提示詞請改用 initForScope() 或
     * initForChatFromRecord()（後者會同時處理 scope）。
     */
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

    /** 已經拿到 Chat 記錄時同步初始化，避免生成前還在等 IDB 背景讀取
     *
     * 同時會初始化 prompt override scope（按角色卡 / 真群聊作用域）。
     */
    initForChatFromRecord(chat: Chat) {
      const idbVars = chat.chatVariables?.localVars;
      const nextVars = idbVars && typeof idbVars === "object"
        ? toStringRecord(idbVars)
        : this._loadLegacyLocalVars(chat.id);

      // 計算 scope 並使用 chat 上的舊字段作為同步 fallback（之後會被 IDB 覆蓋）
      const scopeKey = getPromptOverrideScopeKey({
        id: chat.id,
        characterId: chat.characterId,
        isGroupChat: chat.isGroupChat,
        groupMetadata: chat.groupMetadata,
      });
      const fallbackToggles = toBooleanRecord(chat.chatVariables?.promptToggles);
      const fallbackPrompts = toChatPrompts(chat.chatVariables?.chatPrompts);

      this._setCurrentChatState(
        chat.id,
        nextVars,
        scopeKey,
        fallbackToggles,
        fallbackPrompts,
      );
      this._loadGlobal();

      if (!idbVars && Object.keys(nextVars).length > 0) {
        this._scheduleSaveLocalToIdb();
      }

      // 異步從 PROMPT_OVERRIDES 載入該 scope 的權威數據（會覆蓋 fallback）
      void this._loadScopeFromIdb(scopeKey, this._scopeRevision, chat);
    },

    /** 切換 / 初始化到指定 scope（提示詞覆蓋作用域）
     *
     * 使用場景：ChatVarsPanel 切換時、或外部需要確保 scope 已載入時。
     */
    async initForScope(input: PromptOverrideScopeInput, chatRecordForMigration?: Chat | null): Promise<void> {
      const scopeKey = getPromptOverrideScopeKey(input);
      if (this._currentScopeKey === scopeKey) {
        return;
      }

      if (this._saveScopeTimer) {
        clearTimeout(this._saveScopeTimer);
        this._saveScopeTimer = undefined;
      }

      // 先用 fallback 同步切換，避免顯示舊 scope 內容
      const fallbackToggles = toBooleanRecord(chatRecordForMigration?.chatVariables?.promptToggles);
      const fallbackPrompts = toChatPrompts(chatRecordForMigration?.chatVariables?.chatPrompts);
      this._currentScopeKey = scopeKey;
      this._scopeRevision += 1;
      this.promptToggles = fallbackToggles;
      this.chatPrompts = fallbackPrompts;

      await this._loadScopeFromIdb(scopeKey, this._scopeRevision, chatRecordForMigration ?? null);
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
      this._scopeRevision += 1;
      this._scheduleSaveScopeToIdb();
    },

    prunePromptToggles(validIds: string[]): void {
      const valid = new Set(validIds);
      const next = Object.fromEntries(
        Object.entries(this.promptToggles).filter(([key]) => valid.has(key)),
      ) as Record<string, boolean>;
      if (Object.keys(next).length === Object.keys(this.promptToggles).length) return;
      this.promptToggles = next;
      this._scopeRevision += 1;
      this._scheduleSaveScopeToIdb();
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
      this._scopeRevision += 1;
      this._scheduleSaveScopeToIdb();
      return created;
    },

    updateChatPrompt(id: string, patch: Partial<Omit<ChatLocalPrompt, "id" | "createdAt">>): void {
      const now = Date.now();
      this.chatPrompts = this.chatPrompts.map((prompt) =>
        prompt.id === id ? { ...prompt, ...patch, updatedAt: now } : prompt,
      );
      this._scopeRevision += 1;
      this._scheduleSaveScopeToIdb();
    },

    deleteChatPrompt(id: string): void {
      const before = this.chatPrompts.length;
      this.chatPrompts = this.chatPrompts.filter((prompt) => prompt.id !== id);
      if (this.chatPrompts.length === before) return;
      const nextToggles = { ...this.promptToggles };
      delete nextToggles[id];
      this.promptToggles = nextToggles;
      this._scopeRevision += 1;
      this._scheduleSaveScopeToIdb();
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
      // 不變更 scope；只切換 chat + localVars
      if (this._saveLocalTimer) {
        clearTimeout(this._saveLocalTimer);
        this._saveLocalTimer = undefined;
      }
      this._currentChatId = chatId;
      this._localRevision += 1;
      this.localVars = vars;
    },

    _setCurrentChatState(
      chatId: string,
      vars: Record<string, string>,
      scopeKey: string,
      promptToggles: Record<string, boolean>,
      chatPrompts: ChatLocalPrompt[],
    ): void {
      if (this._saveLocalTimer) {
        clearTimeout(this._saveLocalTimer);
        this._saveLocalTimer = undefined;
      }
      // scope 切換時，取消舊 scope 的待寫入
      if (this._currentScopeKey !== scopeKey && this._saveScopeTimer) {
        clearTimeout(this._saveScopeTimer);
        this._saveScopeTimer = undefined;
      }
      this._currentChatId = chatId;
      this._currentScopeKey = scopeKey;
      this._localRevision += 1;
      this._scopeRevision += 1;
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
          if (this._localRevision === loadRevision) {
            this.localVars = nextVars;
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
      this._saveLocalTimer = setTimeout(() => {
        void this._saveLocalToIdb(chatId, varsSnapshot);
      }, CHAT_VARIABLES_SAVE_DELAY_MS);
    },

    async _saveLocalToIdb(
      chatId: string,
      snapshot: Record<string, string>,
    ): Promise<void> {
      try {
        const chat = await db.get<Chat>(DB_STORES.CHATS, chatId);
        if (!chat) return;

        // 注意：保存時會清除舊版的 promptToggles / chatPrompts（已遷移到 PROMPT_OVERRIDES）
        chat.chatVariables = {
          version: 1,
          localVars: snapshot,
          promptToggles: undefined,
          chatPrompts: undefined,
          updatedAt: Date.now(),
        };

        await db.put(DB_STORES.CHATS, chat);
      } catch (error) {
        console.warn("[chatVariables] 保存聊天變量到 IDB 失敗:", error);
      }
    },

    /** 從 PROMPT_OVERRIDES 載入指定 scope 的提示詞覆蓋
     *
     * 若該 scope 尚無記錄而 chatRecord.chatVariables 有舊資料，會執行一次性遷移：
     * 1. 把 chat 上的 promptToggles / chatPrompts 寫入 PROMPT_OVERRIDES
     * 2. 後續對該 chat 的保存會把舊字段刷成 undefined
     */
    async _loadScopeFromIdb(
      scopeKey: string,
      loadRevision: number,
      chatRecordForMigration: Chat | null,
    ): Promise<void> {
      try {
        const record = await db.get<PromptOverrideRecord>(
          DB_STORES.PROMPT_OVERRIDES,
          scopeKey,
        );

        // 切換到別的 scope 或本地有更新的修改 → 不覆蓋
        if (this._currentScopeKey !== scopeKey) return;
        if (this._scopeRevision !== loadRevision) return;

        if (record) {
          this.promptToggles = toBooleanRecord(record.promptToggles);
          this.chatPrompts = toChatPrompts(record.chatPrompts);
          // 如該 chat 上仍有舊字段，調度清理（透過下次 localVars 保存帶走）
          if (
            chatRecordForMigration &&
            (chatRecordForMigration.chatVariables?.promptToggles ||
              chatRecordForMigration.chatVariables?.chatPrompts)
          ) {
            this._scheduleSaveLocalToIdb();
          }
          return;
        }

        // 該 scope 尚無 PROMPT_OVERRIDES 記錄；嘗試從 chat 舊字段遷移
        if (!chatRecordForMigration) return;
        const legacyToggles = toBooleanRecord(
          chatRecordForMigration.chatVariables?.promptToggles,
        );
        const legacyPrompts = toChatPrompts(
          chatRecordForMigration.chatVariables?.chatPrompts,
        );

        if (Object.keys(legacyToggles).length === 0 && legacyPrompts.length === 0) {
          // 無資料可遷移；保持空白狀態
          return;
        }

        const newRec: PromptOverrideRecord = {
          scopeKey,
          version: 1,
          promptToggles:
            Object.keys(legacyToggles).length > 0 ? legacyToggles : undefined,
          chatPrompts: legacyPrompts.length > 0 ? legacyPrompts : undefined,
          updatedAt: Date.now(),
          migratedFromChatIds: [chatRecordForMigration.id],
        };
        await db.put(DB_STORES.PROMPT_OVERRIDES, newRec);

        // 寫入後若 scope 仍是當前，且未被改動，將狀態同步到 store
        if (
          this._currentScopeKey === scopeKey &&
          this._scopeRevision === loadRevision
        ) {
          this.promptToggles = legacyToggles;
          this.chatPrompts = legacyPrompts;
        }

        // 排清舊 chat 上的 promptToggles / chatPrompts
        this._scheduleSaveLocalToIdb();
      } catch (error) {
        console.warn("[chatVariables] 從 IDB 載入 PROMPT_OVERRIDES 失敗:", error);
      }
    },

    _scheduleSaveScopeToIdb(): void {
      if (!this._currentScopeKey) return;
      if (this._saveScopeTimer) clearTimeout(this._saveScopeTimer);

      const scopeKey = this._currentScopeKey;
      const toggleSnapshot = { ...this.promptToggles };
      const promptsSnapshot = this.chatPrompts.map((prompt) => ({ ...prompt }));
      this._saveScopeTimer = setTimeout(() => {
        void this._saveScopeToIdb(scopeKey, toggleSnapshot, promptsSnapshot);
      }, PROMPT_OVERRIDE_SAVE_DELAY_MS);
    },

    async _saveScopeToIdb(
      scopeKey: string,
      promptToggles: Record<string, boolean>,
      chatPrompts: ChatLocalPrompt[],
    ): Promise<void> {
      try {
        const hasToggles = Object.keys(promptToggles).length > 0;
        const hasPrompts = chatPrompts.length > 0;

        if (!hasToggles && !hasPrompts) {
          // 空狀態：刪除 PROMPT_OVERRIDES 記錄以保持稀疏
          await db.delete(DB_STORES.PROMPT_OVERRIDES, scopeKey);
          return;
        }

        const existing = await db.get<PromptOverrideRecord>(
          DB_STORES.PROMPT_OVERRIDES,
          scopeKey,
        );
        const next: PromptOverrideRecord = {
          scopeKey,
          version: 1,
          promptToggles: hasToggles ? promptToggles : undefined,
          chatPrompts: hasPrompts ? chatPrompts : undefined,
          updatedAt: Date.now(),
          migratedFromChatIds: existing?.migratedFromChatIds,
        };
        await db.put(DB_STORES.PROMPT_OVERRIDES, next);
      } catch (error) {
        console.warn("[chatVariables] 保存 PROMPT_OVERRIDES 失敗:", error);
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
