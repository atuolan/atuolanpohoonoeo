/**
 * 聊天變量存儲
 * 對應 SillyTavern 的 {{getvar}} / {{setvar}} 局部（per-chat）及全局變量系統
 */
import { defineStore } from "pinia";

const LS_GLOBAL_KEY = "aguaphone_global_vars";

function localKey(chatId: string) {
  return `aguaphone_chat_vars_${chatId}`;
}

export const useChatVariablesStore = defineStore("chatVariables", {
  state: () => ({
    localVars: {} as Record<string, string>,
    globalVars: {} as Record<string, string>,
    _currentChatId: "",
  }),

  actions: {
    /** 切換 / 初始化到指定聊天，自動從 localStorage 載入對應變量 */
    initForChat(chatId: string) {
      if (this._currentChatId === chatId) return;
      this._currentChatId = chatId;
      try {
        const saved = localStorage.getItem(localKey(chatId));
        this.localVars = saved ? JSON.parse(saved) : {};
      } catch {
        this.localVars = {};
      }
      this._loadGlobal();
    },

    // ── 局部變量 ──────────────────────────────────────────────
    getLocal(name: string): string {
      return String(this.localVars[name] ?? "");
    },

    setLocal(name: string, value: string): void {
      this.localVars[name] = value;
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
      this._saveLocal();
    },

    incLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur + 1);
      this._saveLocal();
      return this.localVars[name];
    },

    decLocal(name: string): string {
      const cur = parseFloat(this.localVars[name] ?? "0") || 0;
      this.localVars[name] = String(cur - 1);
      this._saveLocal();
      return this.localVars[name];
    },

    clearLocal(): void {
      this.localVars = {};
      if (this._currentChatId) {
        localStorage.removeItem(localKey(this._currentChatId));
      }
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
    _saveLocal(): void {
      if (!this._currentChatId) return;
      try {
        localStorage.setItem(localKey(this._currentChatId), JSON.stringify(this.localVars));
      } catch {
        // storage quota exceeded — 靜默忽略
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
        this.globalVars = saved ? JSON.parse(saved) : {};
      } catch {
        this.globalVars = {};
      }
    },
  },
});
