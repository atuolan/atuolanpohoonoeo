/**
 * 提示詞組裝器
 * 將角色數據、世界書、聊天歷史組裝成完整提示詞
 *
 * 世界書插入位置說明（SillyTavern 兼容）：
 * - BEFORE_CHAR (↑Char): 角色定義之前
 * - AFTER_CHAR (↓Char): 角色定義之後
 * - AN_TOP (↑AT): 作者筆記之前
 * - AN_BOTTOM (↓AT): 作者筆記之後
 * - EM_TOP (↑EM): 對話示例之前
 * - EM_BOTTOM (↓EM): 對話示例之後
 * - AT_DEPTH (@D): 指定深度插入（聊天歷史中）
 * - OUTLET: 擴展輸出口
 */

import type {
  CharacterAffinityConfig,
  ChatAffinityState,
  MetricValue,
} from "@/schemas/affinity";
import { computePercentage, computeStage } from "@/schemas/affinity";
import { ChatGameState } from "@/schemas/gameEconomy";
import { affinityTemplateService } from "@/services/AffinityTemplateService";
import { promptTemplateService } from "@/services/PromptTemplateService";
import type { StoredCharacter } from "@/types/character";
import type { ChatMessage, ChatSettings } from "@/types/chat";
import type { AuthorsNoteMetadata, PromptBuildResult } from "@/types/prompt";
import { DEFAULT_PROMPTS } from "@/types/prompt";
import type {
  PromptDefinition,
  PromptManagerConfig,
  PromptOrderEntry,
} from "@/types/promptManager";
import {
  DEFAULT_GROUP_CHAT_PROMPT_ORDER,
  DEFAULT_PHONE_CALL_PROMPT_ORDER,
  DEFAULT_PROMPT_DEFINITIONS,
  DEFAULT_PROMPT_ORDER,
  FACE_TO_FACE_PROMPT_DEFINITIONS,
  GROUP_CHAT_PROMPT_DEFINITIONS,
  PHONE_CALL_PROMPT_DEFINITIONS,
  PromptInjectionPosition,
} from "@/types/promptManager";
import type {
  Lorebook,
  WIActivatedResult,
  WIGlobalScanData,
} from "@/types/worldinfo";
import { WIAnchorPosition as AnchorPos } from "@/types/worldinfo";
import ejs from "ejs";
import _ from "lodash";
import { getMacroEngine } from "../macros/MacroEngine";
import { WorldInfoScanner } from "../worldinfo/WorldInfoScanner";

/**
 * 消息格式
 */
interface BuiltMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
  /** 消息標識符（用於調試） */
  identifier?: string;
  /** 是否為注入的提示詞 */
  injected?: boolean;
  /** 圖片 Base64 數據（用於 Vision API） */
  imageData?: string;
  /** 圖片 MIME 類型 */
  imageMimeType?: string;
  /** 圖片說明/描述（用於歷史圖片的文字替代） */
  imageCaption?: string;
  /** 文生圖英文提示詞（用於歷史圖片的文字替代） */
  imagePrompt?: string;
}

/**
 * 待深度插入的提示詞
 */
interface PendingDepthPrompt {
  role: "system" | "user" | "assistant";
  content: string;
  identifier: string;
  depth: number;
  order: number;
}

/**
 * 提示詞組裝選項
 */
export interface PromptBuilderOptions {
  /** 角色 */
  character: StoredCharacter;
  /** 世界書列表 */
  lorebooks: Lorebook[];
  /** 聊天消息 */
  messages: ChatMessage[];
  /** 聊天設定 */
  settings: ChatSettings;
  /** 用戶名稱 */
  userName: string;
  /** 用戶角色描述 */
  userPersona?: string;
  /** 用戶秘密 */
  userSecrets?: string;
  /** 與AI角色的權力關係 */
  powerDynamic?: string;
  /** 作者筆記 */
  authorsNote?: AuthorsNoteMetadata;
  /** 系統提示詞覆蓋 */
  systemPromptOverride?: string;
  /** Token 計數器 */
  tokenCounter?: (text: string) => Promise<number>;
  /** 提示詞管理器配置（可選，如不提供則使用默認順序） */
  promptManagerConfig?: PromptManagerConfig;
  /** 提示詞順序（可選，優先於 promptManagerConfig） */
  promptOrder?: PromptOrderEntry[];
  /** 對話歷史總結 */
  summaries?: Array<{
    id: string;
    content: string;
    createdAt: number;
    isImportant?: boolean;
  }>;
  /** 重要事件 */
  importantEvents?: Array<{
    id: string;
    content: string;
    category?: string;
    priority?: number;
  }>;
  /** 天氣信息 */
  weatherInfo?: {
    location: string;
    condition: string;
    temperature: number;
    feelsLike: number;
    humidity: number;
    windSpeed?: number;
    windDir?: string;
    uv?: number;
  };
  /** 電話通話模式 */
  phoneCallMode?: boolean;
  /** 來電模式（角色主動打來） */
  incomingCallMode?: boolean;
  /** 來電原因（用於生成角色開場白） */
  callReason?: string;
  /** 電話上下文（時間、最後對話等） */
  phoneContext?: {
    currentTime: string;
    currentDate: string;
    lastChatTime: string;
  };
  /** 電話前的聊天紀錄（最近 N 條） */
  recentChatHistory?: Array<{
    role: "user" | "assistant";
    name: string;
    content: string;
    createdAt: number;
  }>;
  /** 最近通話記錄（用於來電決策參考） */
  recentCallHistory?: Array<{
    type: "outgoing" | "incoming";
    status: "answered" | "declined" | "missed";
    duration: number;
    reason?: string;
    createdAt: number;
  }>;
  /** 聊天勿擾模式（開啟時會在提示詞中告知 AI 用戶很忙） */
  doNotDisturb?: boolean;
  /** 表情包列表（用於 {{stickerList}} 宏） */
  stickerList?: string[];
  /** 面對面模式（開啟時使用面對面模式的提示詞） */
  faceToFaceMode?: boolean;
  /** 第三人稱模式（面對面模式下，開啟時使用第三人稱，關閉時使用第二人稱） */
  thirdPersonMode?: boolean;
  /** 遊戲經濟狀態（用於注入遊戲狀態 Prompt） */
  gameState?: ChatGameState;
  /** 最近的禮物事件（用於注入禮物 Prompt） */
  recentGiftEvent?: {
    giftName: string;
    isLiked?: boolean;
    isDisliked?: boolean;
  };
  /** 最近的轉帳事件（用於注入轉帳 Prompt） */
  recentTransferEvent?: {
    amount: number;
  };
  /** 最近的賭博結果（用於注入賭博 Prompt） */
  recentGamblingResult?: {
    won: boolean;
    amount: number;
  };
  /** 書影記錄（用於 {{mediaLogs}} 宏） */
  mediaLogs?: string;
  /** 群聊模式 */
  groupChatMode?: boolean;
  /** 群聊成員列表（群聊模式時必填） */
  groupMembers?: Array<{
    characterId: string;
    name: string;
    nickname?: string;
    personality: string;
    description: string;
    avatar: string;
    isAdmin: boolean;
    isMuted: boolean;
  }>;
  /** 群名稱 */
  groupName?: string;
  /** 群聊長期記憶 */
  groupLongTermMemory?: string[];
  /** 群聊世界觀 */
  groupWorldSetting?: string;
  /** 群通話模式（群聊中的語音通話） */
  groupCallMode?: boolean;
  /** 是否為多人卡模式 */
  isMultiCharCard?: boolean;
  /** 多人卡子角色列表 */
  multiCharMembers?: Array<{ id: string; name: string; avatar: string }>;
  /** 節日資訊（由外部傳入，PromptBuilder 不自己檢測） */
  holidayInfo?: {
    todayHoliday: {
      name: string;
      greeting: string;
      aiPrompt?: string;
      suggestionAmount?: number;
    } | null;
    upcomingHolidays: Array<{
      name: string;
      greeting: string;
    }>;
    lunarDateString: string | null;
  };
  /** 是否感知現實時間（關閉後不注入時間標籤和時間提示詞） */
  enableRealTimeAwareness?: boolean;
  /** 假時間覆蓋（由 useChatFakeTime 計算後傳入，替代 new Date()） */
  fakeTimeOverride?: Date;
  /** 假時間模式（用於決定是否注入 time-jump 提示詞） */
  fakeTimeMode?: "real" | "loop" | "offset";
  /** 健身資訊（由外部傳入） */
  fitnessInfo?: {
    todayWorkout?: string;
    streak?: number;
    weeklyProgress?: number;
    recentWeight?: { current: number; change: number };
    isPartner?: boolean;
    partnerRole?: "coach" | "partner" | "cheerleader";
    partnerStyle?: "strict" | "gentle" | "playful";
  };
  /** 是否啟用 MiniMax TTS 語音合成（啟用時注入語氣標籤提示詞） */
  minimaxTTSEnabled?: boolean;
  /** 好感度配置（per-character） */
  affinityConfig?: CharacterAffinityConfig;
  /** 好感度狀態（per-chat） */
  affinityState?: ChatAffinityState;
  /** 向量檢索到的記憶（啟用向量記憶時由外部傳入） */
  vectorMemories?: Array<{
    sourceId: string;
    sourceType: 'summary' | 'diary' | 'event';
    content: string;
    score: number;
    createdAt: number;
  }>;
}

/**
 * 提示詞組裝器
 */
export class PromptBuilder {
  private options: PromptBuilderOptions;
  private macroEngine = getMacroEngine();
  private tokenCounter: (text: string) => Promise<number>;

  constructor(options: PromptBuilderOptions) {
    this.options = options;
    this.tokenCounter = options.tokenCounter ?? this.defaultTokenCounter;

    // 構建電話上下文的宏變量
    const phoneContextVars: Record<string, string> = {};
    if (options.phoneContext) {
      phoneContextVars.phoneCurrentTime = options.phoneContext.currentTime;
      phoneContextVars.phoneCurrentDate = options.phoneContext.currentDate;
      phoneContextVars.phoneLastChatTime = options.phoneContext.lastChatTime;
    }

    // 來電原因（用於來電模式的開場白生成）
    if (options.callReason) {
      phoneContextVars.callReason = options.callReason;
    }

    // 來電模式標記
    if (options.incomingCallMode) {
      phoneContextVars.isIncomingCall = "true";
    }

    // 構建總結和重要事件的宏變量
    if (options.summaries && options.summaries.length > 0) {
      phoneContextVars.phoneSummaries = options.summaries
        .map((s, i) => `${i + 1}. ${s.content}`)
        .join("\n");
    } else {
      phoneContextVars.phoneSummaries = "（無之前的對話記錄）";
    }

    if (options.importantEvents && options.importantEvents.length > 0) {
      phoneContextVars.phoneImportantEvents = options.importantEvents
        .map((e) => `- ${e.content}`)
        .join("\n");
    } else {
      phoneContextVars.phoneImportantEvents = "（無重要事件）";
    }

    // 構建電話前聊天紀錄的宏變量
    if (options.recentChatHistory && options.recentChatHistory.length > 0) {
      phoneContextVars.phoneRecentChatHistory = options.recentChatHistory
        .map((m) => {
          if (m.content.includes("📞 通話結束")) {
            return "【上一通電話記錄】\n" + m.content + "\n【通話記錄結束】";
          }
          return m.name + ": " + m.content;
        })
        .join("\n");
    } else {
      phoneContextVars.phoneRecentChatHistory = "（無之前的聊天紀錄）";
    }

    // 構建最近通話記錄的宏變量（用於來電決策）
    if (options.recentCallHistory && options.recentCallHistory.length > 0) {
      phoneContextVars.recentCallHistory = options.recentCallHistory
        .map((c) => {
          const time = new Date(c.createdAt).toLocaleString("zh-TW");
          const typeText = c.type === "incoming" ? "來電" : "撥出";
          const statusText =
            c.status === "answered"
              ? "已接聽"
              : c.status === "declined"
                ? "已拒接"
                : "未接";
          const durationText =
            c.duration > 0 ? `${Math.floor(c.duration / 60)}分鐘` : "";
          return `- ${time}：${typeText}（${statusText}${durationText ? `，${durationText}` : ""}）`;
        })
        .join("\n");
    } else {
      phoneContextVars.recentCallHistory = "";
    }

    // 提取本輪用戶連續發送的所有訊息（用於 {{lastUserMessage}} 宏）
    // 線上模式下用戶可能分多次發送，這些都算同一輪
    const lastUserTurnMsgs = PromptBuilder.getLastUserTurnMessages(
      options.messages,
    );
    const lastUserMsg =
      lastUserTurnMsgs
        .map((m) => {
          if (options.enableRealTimeAwareness !== false && m.createdAt) {
            return `${this.formatMsgTimeTag(m.createdAt)} ${m.content}`;
          }
          return m.content;
        })
        .join("\n") || "";
    const lastCharMsg =
      [...options.messages]
        .reverse()
        .find((m) => !m.is_user && !m.isTimetravel && m.sender !== "narrator")
        ?.content || "";
    const lastMsg =
      options.messages.length > 0
        ? options.messages[options.messages.length - 1].content
        : "";

    // 設置宏上下文
    this.macroEngine.setContext({
      charName: options.character.data.name,
      userName: options.userName,
      charDescription: options.character.data.description,
      charPersonality: options.character.data.personality,
      scenario: options.character.data.scenario,
      currentDate: new Date(),
      messageCount: options.messages.length,
      // 添加自定義變量，包含用戶人設和電話上下文
      customVariables: {
        userPersona: options.userPersona || "",
        userSecrets: options.userSecrets || "",
        powerDynamic: options.powerDynamic || "",
        charPersonality: options.character.data.personality || "",
        stickerList: options.stickerList?.join("\n") || "（無可用表情包）",
        lastMessage: lastMsg,
        lastUserMessage: lastUserMsg,
        lastCharMessage: lastCharMsg,
        ...phoneContextVars,
      },
    });
  }

  /**
   * 重新設置宏上下文
   * 因為 macro engine 是單例，需要在 build 時重新設置上下文
   */
  private resetMacroContext(): void {
    const options = this.options;

    // 構建電話上下文的宏變量
    const phoneContextVars: Record<string, string> = {};
    if (options.phoneContext) {
      phoneContextVars.phoneCurrentTime = options.phoneContext.currentTime;
      phoneContextVars.phoneCurrentDate = options.phoneContext.currentDate;
      phoneContextVars.phoneLastChatTime = options.phoneContext.lastChatTime;
    }

    // 來電原因（用於來電模式的開場白生成）
    if (options.callReason) {
      phoneContextVars.callReason = options.callReason;
    }

    // 來電模式標記
    if (options.incomingCallMode) {
      phoneContextVars.isIncomingCall = "true";
    }

    // 構建總結和重要事件的宏變量
    if (options.summaries && options.summaries.length > 0) {
      phoneContextVars.phoneSummaries = options.summaries
        .map((s, i) => `${i + 1}. ${s.content}`)
        .join("\n");
    } else {
      phoneContextVars.phoneSummaries = "（無之前的對話記錄）";
    }

    if (options.importantEvents && options.importantEvents.length > 0) {
      phoneContextVars.phoneImportantEvents = options.importantEvents
        .map((e) => `- ${e.content}`)
        .join("\n");
    } else {
      phoneContextVars.phoneImportantEvents = "（無重要事件）";
    }

    // 構建電話前聊天紀錄的宏變量
    if (options.recentChatHistory && options.recentChatHistory.length > 0) {
      phoneContextVars.phoneRecentChatHistory = options.recentChatHistory
        .map((m) => {
          if (m.content.includes("📞 通話結束")) {
            return "【上一通電話記錄】\n" + m.content + "\n【通話記錄結束】";
          }
          return m.name + ": " + m.content;
        })
        .join("\n");
    } else {
      phoneContextVars.phoneRecentChatHistory = "（無之前的聊天紀錄）";
    }

    // 構建最近通話記錄的宏變量（用於來電決策）
    if (options.recentCallHistory && options.recentCallHistory.length > 0) {
      phoneContextVars.recentCallHistory = options.recentCallHistory
        .map((c) => {
          const time = new Date(c.createdAt).toLocaleString("zh-TW");
          const typeText = c.type === "incoming" ? "來電" : "撥出";
          const statusText =
            c.status === "answered"
              ? "已接聽"
              : c.status === "declined"
                ? "已拒接"
                : "未接";
          const durationText =
            c.duration > 0 ? `${Math.floor(c.duration / 60)}分鐘` : "";
          return `- ${time}：${typeText}（${statusText}${durationText ? `，${durationText}` : ""}）`;
        })
        .join("\n");
    } else {
      phoneContextVars.recentCallHistory = "";
    }

    // 提取本輪用戶連續發送的所有訊息（用於 {{lastUserMessage}} 宏）
    const lastUserTurnMsgs = PromptBuilder.getLastUserTurnMessages(
      options.messages,
    );
    const lastUserMsg =
      lastUserTurnMsgs
        .map((m) => {
          if (options.enableRealTimeAwareness !== false && m.createdAt) {
            return `${this.formatMsgTimeTag(m.createdAt)} ${m.content}`;
          }
          return m.content;
        })
        .join("\n") || "";
    const lastCharMsg =
      [...options.messages]
        .reverse()
        .find((m) => !m.is_user && !m.isTimetravel && m.sender !== "narrator")
        ?.content || "";
    const lastMsg =
      options.messages.length > 0
        ? options.messages[options.messages.length - 1].content
        : "";

    // 設置宏上下文
    this.macroEngine.setContext({
      charName: options.character.data.name,
      userName: options.userName,
      charDescription: options.character.data.description,
      charPersonality: options.character.data.personality,
      scenario: options.character.data.scenario,
      currentDate: new Date(),
      messageCount: options.messages.length,
      customVariables: {
        userPersona: options.userPersona || "",
        userSecrets: options.userSecrets || "",
        powerDynamic: options.powerDynamic || "",
        charPersonality: options.character.data.personality || "",
        stickerList: options.stickerList?.join("\n") || "（無可用表情包）",
        lastMessage: lastMsg,
        lastUserMessage: lastUserMsg,
        lastCharMessage: lastCharMsg,
        ...phoneContextVars,
      },
    });
  }

  /**
   * 格式化消息時間戳標籤（考慮假時間偏移）
   */
  private formatMsgTimeTag(createdAt: number): string {
    let d = new Date(createdAt);
    if (this.options.fakeTimeOverride) {
      const offset = this.options.fakeTimeOverride.getTime() - Date.now();
      d = new Date(createdAt + offset);
    }
    const y = d.getFullYear();
    const mon = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "P.M" : "A.M";
    const h12 = h % 12 || 12;
    return `[time:${y}/${mon}/${day} ${h12}:${m}${ampm}]`;
  }

  /**
   * 判斷訊息是否為用戶主動觸發（包括普通用戶訊息、時間跳轉、小劇場）
   */
  private static isUserInitiated(m: ChatMessage): boolean {
    return m.is_user || m.isTimetravel === true || m.sender === "narrator";
  }

  /**
   * 提取本輪用戶連續發送的所有訊息（從最後一條 AI 回覆之後的所有用戶主動觸發訊息）
   * 線上模式下用戶可能分多次發送訊息，這些都算同一輪
   */
  private static getLastUserTurnMessages(
    messages: ChatMessage[],
  ): ChatMessage[] {
    const result: ChatMessage[] = [];
    // 從後往前掃描，收集所有用戶主動觸發的訊息，遇到 AI 回覆就停止
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (PromptBuilder.isUserInitiated(msg)) {
        result.unshift(msg);
      } else if (
        !msg.is_user &&
        msg.sender !== "system" &&
        msg.sender !== "narrator"
      ) {
        // 遇到 AI（assistant）回覆就停止
        break;
      }
      // system 訊息（如行事曆）跳過，繼續往前找
    }
    return result;
  }

  /**
   * 默認 Token 計數器
   */
  private async defaultTokenCounter(text: string): Promise<number> {
    return Math.ceil(text.length / 4);
  }

  /**
   * 獲取有效的提示詞順序
   */
  private getEffectivePromptOrder(): PromptOrderEntry[] {
    // 電話模式使用專屬提示詞順序
    if (this.options.phoneCallMode) {
      const baseOrder = [...DEFAULT_PHONE_CALL_PROMPT_ORDER];

      // 來電模式：在 chatHistory 之前插入來電上下文
      if (this.options.incomingCallMode && this.options.callReason) {
        const chatHistoryIndex = baseOrder.findIndex(
          (e) => e.identifier === "chatHistory",
        );
        if (chatHistoryIndex !== -1) {
          baseOrder.splice(chatHistoryIndex, 0, {
            identifier: "incomingCallContext",
            enabled: true,
          });
        } else {
          baseOrder.push({ identifier: "incomingCallContext", enabled: true });
        }
      }

      // 來電首次觸發：用簡短的 phoneCallIncomingTrigger 替換 phoneCallConfirmLastOutput
      // 避免把系統觸發指令當作用戶消息重複發送，造成 AI 指令堆疊
      if (this.options.incomingCallMode) {
        const confirmIdx = baseOrder.findIndex(
          (e) => e.identifier === "phoneCallConfirmLastOutput",
        );
        if (confirmIdx !== -1) {
          baseOrder[confirmIdx] = {
            identifier: "phoneCallIncomingTrigger",
            enabled: true,
          };
        }
      }

      return baseOrder;
    }

    // 群聊模式：使用群聊專屬的提示詞順序
    if (this.options.groupChatMode) {
      if (this.options.promptManagerConfig?.groupChatPromptOrder) {
        return this.options.promptManagerConfig.groupChatPromptOrder;
      }
      return [...DEFAULT_GROUP_CHAT_PROMPT_ORDER];
    }

    // 面對面模式：使用面對面專屬的提示詞順序
    if (this.options.faceToFaceMode) {
      // 優先使用面對面模式的專屬順序
      if (this.options.promptManagerConfig?.faceToFacePromptOrder) {
        return this.options.promptManagerConfig.faceToFacePromptOrder;
      }
      // 如果沒有面對面專屬順序，則從全局順序映射
      // 獲取基礎順序
      let baseOrder: PromptOrderEntry[];
      if (this.options.promptOrder) {
        baseOrder = [...this.options.promptOrder];
      } else if (this.options.promptManagerConfig) {
        const charId = this.options.character.id;
        const charConfig =
          this.options.promptManagerConfig.characterConfigs[charId];
        if (charConfig && charConfig.promptOrder.length > 0) {
          baseOrder = [...charConfig.promptOrder];
        } else {
          baseOrder = [...this.options.promptManagerConfig.globalPromptOrder];
        }
      } else {
        baseOrder = [...DEFAULT_PROMPT_ORDER];
      }

      // 定義全局模式提示詞到面對面模式提示詞的映射
      const globalToF2FMap: Record<string, string> = {
        // 導演系統
        protectionSequence: "f2fProtectionSequence",
        sovereigntyNegotiation: "f2fSovereigntyNegotiation",
        coreUnderstanding: "f2fCoreUnderstanding",
        narrativeMission: "f2fNarrativeMission",
        sacredCreation: "f2fSacredCreation",
        // 上下文
        languageMode: "f2fLanguageMode",
        timeInfo: "f2fTimeInfo",
        weatherInfo: "f2fWeatherInfo",
        holidayInfo: "f2fHolidayInfo",
        // 規則
        coreRules: "f2fCoreRules",
        healthyEmotion: "f2fHealthyEmotion",
        // 角色
        ambiguityVsLove: "f2fAmbiguityVsLove",
        userInfo: "f2fUserInfo",
        userSecrets: "f2fUserSecrets",
        powerDynamic: "f2fPowerDynamic",
        characterSettings: "f2fCharacterSettings",
        characterCorePersonality: "f2fCharacterCorePersonality",
        charDescription: "f2fCharDescription",
        charPersonality: "f2fCharPersonality",
        scenario: "f2fScenario",
        dialogueExamples: "f2fDialogueExamples",
        // 世界書
        worldInfoBefore: "f2fWorldInfoBefore",
        worldInfoAfter: "f2fWorldInfoAfter",
        // 社交和通話
        socialMedia: "f2fSocialMedia",
        recentCallHistory: "f2fRecentCallHistory",
        callDecision: "f2fCallDecision",
        // 表情包
        stickerList: "f2fStickerList",
        stickerSystem: "f2fStickerSystem",
        // 記錄
        summaries: "f2fSummaries",
        importantEvents: "f2fImportantEvents",
        gameScores: "f2fGameScores",
        foodLogs: "f2fFoodLogs",
        mediaLogs: "f2fMediaLogs",
        // 線上模式 -> 面對面模式
        onlineModeIntro: "f2fModeIntro",
        onlineModeFeatures: "f2fModeFeatures",
        onlineModeRules: "f2fModeRules",
        doNotDisturbStatus: "f2fDoNotDisturbStatus",
        // 思考和格式
        thinkingGuide: "f2fThinkingGuide",
        forbiddenPatterns: "f2fForbiddenPatterns",
        formatRules: "f2fFormatRules",
        exampleScript: "f2fExampleScript",
        // 系統
        chatHistory: "f2fChatHistory",
        authorsNote: "f2fAuthorsNote",
        finalInstructions: "f2fFinalInstructions",
        confirmLastOutput: "f2fConfirmLastOutput",
      };

      // 替換全局模式提示詞為面對面模式提示詞
      return baseOrder.map((entry) => {
        if (globalToF2FMap[entry.identifier]) {
          return {
            ...entry,
            identifier: globalToF2FMap[entry.identifier],
          };
        }
        return entry;
      });
    }

    // 優先使用直接傳入的順序
    if (this.options.promptOrder) {
      return this.options.promptOrder;
    }
    // 其次使用 PromptManagerConfig
    if (this.options.promptManagerConfig) {
      const charId = this.options.character.id;
      const charConfig =
        this.options.promptManagerConfig.characterConfigs[charId];
      if (charConfig && charConfig.promptOrder.length > 0) {
        return charConfig.promptOrder;
      }
      return this.options.promptManagerConfig.globalPromptOrder;
    }
    // 默認順序
    return DEFAULT_PROMPT_ORDER;
  }

  /**
   * 獲取提示詞定義
   * 優先順序：用戶自定義配置 > 硬編碼默認值
   */
  private getPromptDefinition(
    identifier: string,
  ): PromptDefinition | undefined {
    // 電話模式優先從電話提示詞定義中查找（電話模式沒有用戶自定義配置）
    if (this.options.phoneCallMode) {
      const phonePrompt = PHONE_CALL_PROMPT_DEFINITIONS.find(
        (p) => p.identifier === identifier,
      );
      if (phonePrompt) return phonePrompt;
    }

    // 群聊模式：優先使用用戶自定義配置，再回退到硬編碼默認值
    if (this.options.groupChatMode) {
      // 先檢查用戶自定義的群聊提示詞配置
      if (this.options.promptManagerConfig?.groupChatPrompts) {
        const configGcPrompt =
          this.options.promptManagerConfig.groupChatPrompts.find(
            (p) => p.identifier === identifier,
          );
        if (configGcPrompt) return configGcPrompt;
      }
      // 回退到硬編碼默認值
      const gcPrompt = GROUP_CHAT_PROMPT_DEFINITIONS.find(
        (p) => p.identifier === identifier,
      );
      if (gcPrompt) return gcPrompt;
    }

    // 面對面模式：優先使用用戶自定義配置，再回退到硬編碼默認值
    if (this.options.faceToFaceMode) {
      if (this.options.promptManagerConfig?.faceToFacePrompts) {
        const f2fPrompt =
          this.options.promptManagerConfig.faceToFacePrompts.find(
            (p) => p.identifier === identifier,
          );
        if (f2fPrompt) return f2fPrompt;
      }
      // 回退到硬編碼默認值
      const f2fPrompt = FACE_TO_FACE_PROMPT_DEFINITIONS.find(
        (p) => p.identifier === identifier,
      );
      if (f2fPrompt) return f2fPrompt;
    }

    // 普通模式：優先使用用戶自定義配置
    if (this.options.promptManagerConfig) {
      return this.options.promptManagerConfig.prompts.find(
        (p) => p.identifier === identifier,
      );
    }
    return DEFAULT_PROMPT_DEFINITIONS.find((p) => p.identifier === identifier);
  }

  /**
   * 組裝完整提示詞
   * 根據 PromptManager 配置的順序組裝
   *
   * 支援兩種注入位置：
   * - RELATIVE (0): 相對位置，按順序插入到系統提示詞區塊
   * - ABSOLUTE (1): 絕對位置，按 injection_depth 插入到聊天歷史中
   */
  async build(): Promise<PromptBuildResult> {
    const { character, settings } = this.options;
    const builtMessages: BuiltMessage[] = [];
    let totalTokens = 0;
    let worldInfoTokens = 0;
    let chatHistoryTokens = 0;
    let wasTruncated = false;

    // 重新設置宏上下文（確保使用正確的上下文，因為 macro engine 是單例）
    this.resetMacroContext();

    // 1. 執行世界書掃描
    let wiResult = await this.scanWorldInfo();

    // 1.5 對激活的世界書條目 content 執行 EJS 渲染
    wiResult = this.processWorldInfoEjs(wiResult);

    // 計算世界書 Token
    worldInfoTokens = await this.calculateWorldInfoTokens(wiResult);

    // 2. 獲取有效的提示詞順序
    const promptOrder = this.getEffectivePromptOrder();
    const enabledPrompts = promptOrder.filter((entry) => entry.enabled);

    // 3. 分離相對位置和絕對位置的提示詞
    const preHistoryMessages: BuiltMessage[] = [];
    const postHistoryMessages: BuiltMessage[] = [];
    const pendingDepthPrompts: PendingDepthPrompt[] = [];

    for (const entry of enabledPrompts) {
      // 支持全局模式和面對面模式的 chatHistory
      if (
        entry.identifier === "chatHistory" ||
        entry.identifier === "f2fChatHistory" ||
        entry.identifier === "gcChatHistory"
      ) {
        continue; // 聊天歷史單獨處理
      }

      const promptDef = this.getPromptDefinition(entry.identifier);

      // 檢查是否為絕對位置（深度插入）
      if (
        promptDef &&
        promptDef.injection_position === PromptInjectionPosition.ABSOLUTE
      ) {
        const content = await this.buildPromptContent(
          entry.identifier,
          wiResult,
          promptDef,
        );

        if (content) {
          const messages = Array.isArray(content) ? content : [content];
          for (const msg of messages) {
            if (msg.content) {
              const tokens = await this.tokenCounter(msg.content);
              totalTokens += tokens;

              // 加入待深度插入列表
              pendingDepthPrompts.push({
                role: msg.role,
                content: msg.content,
                identifier: msg.identifier || entry.identifier,
                depth: promptDef.injection_depth,
                order: promptDef.injection_order,
              });
            }
          }
        }
        continue;
      }

      // 相對位置的提示詞
      const content = await this.buildPromptContent(
        entry.identifier,
        wiResult,
        promptDef,
      );

      if (content) {
        const messages = Array.isArray(content) ? content : [content];
        for (const msg of messages) {
          if (msg.content) {
            const tokens = await this.tokenCounter(msg.content);
            totalTokens += tokens;

            // 根據是否在聊天歷史之後決定放置位置
            const isAfterHistory = this.isPromptAfterHistory(
              entry.identifier,
              enabledPrompts,
            );
            if (isAfterHistory) {
              postHistoryMessages.push(msg);
            } else {
              preHistoryMessages.push(msg);
            }
          }
        }
      }
    }

    // 4. 計算可用於聊天歷史的 Token 數
    const reservedTokens = settings.maxResponseLength + 100;
    const maxHistoryTokens =
      settings.maxContextLength - totalTokens - reservedTokens;

    // 5. 構建聊天歷史（如果啟用），同時處理深度插入
    let chatMessages: {
      messages: BuiltMessage[];
      tokens: number;
      wasTruncated: boolean;
    } = {
      messages: [],
      tokens: 0,
      wasTruncated: false,
    };

    // 支持全局模式和面對面模式的 chatHistory
    if (
      enabledPrompts.some(
        (e) =>
          e.identifier === "chatHistory" ||
          e.identifier === "f2fChatHistory" ||
          e.identifier === "gcChatHistory",
      )
    ) {
      // 檢查是否啟用了「確認最終輸出」，如果是則從聊天歷史中移除最後一條用戶訊息
      const stripLastUserMessage = enabledPrompts.some(
        (e) =>
          e.identifier === "confirmLastOutput" ||
          e.identifier === "f2fConfirmLastOutput" ||
          e.identifier === "gcConfirmLastOutput" ||
          e.identifier === "phoneCallConfirmLastOutput",
      );
      chatMessages = await this.buildChatHistory(
        maxHistoryTokens,
        wiResult,
        pendingDepthPrompts,
        stripLastUserMessage,
      );
      chatHistoryTokens = chatMessages.tokens;
      totalTokens += chatHistoryTokens;
      wasTruncated = chatMessages.wasTruncated;
    }

    // 6. 按順序組裝最終消息列表
    builtMessages.push(...preHistoryMessages);
    builtMessages.push(...chatMessages.messages);
    builtMessages.push(...postHistoryMessages);

    // 🐛 調試：檢查各部分的消息數量
    console.group("📦 [PromptBuilder] 最終組裝調試");
    console.log("preHistoryMessages:", preHistoryMessages.length);
    console.log("chatMessages.messages:", chatMessages.messages.length);
    console.log("postHistoryMessages:", postHistoryMessages.length);
    console.log("pendingDepthPrompts:", pendingDepthPrompts.length);
    console.log("builtMessages 總數:", builtMessages.length);
    console.groupEnd();

    // 6.5 動態注入 MiniMax TTS 語氣標籤提示詞（放在最後，靠近 AI 回覆）
    const ttsPrompt = this.buildMinimaxTTSPrompt();
    if (ttsPrompt) {
      builtMessages.push(ttsPrompt);
    }

    // 7. 合併連續相同 role 的訊息
    const mergedMessages = this.mergeConsecutiveMessages(builtMessages);

    return {
      messages: mergedMessages,
      tokenCount: totalTokens,
      worldInfoTokens,
      chatHistoryTokens,
      wasTruncated,
      wiResult,
    };
  }

  /**
   * 合併連續相同 role 的訊息
   * 將連續的 system/user/assistant 訊息合併為一條，用換行分隔
   * 注意：多人卡/群聊模式下，不同角色名的 assistant 訊息不會合併
   */
  private mergeConsecutiveMessages(messages: BuiltMessage[]): BuiltMessage[] {
    if (messages.length === 0) return [];

    // 多人卡或群聊模式下，需要保留不同角色的 assistant 訊息不被合併
    const preserveSenderIdentity =
      this.options.isMultiCharCard || this.options.groupChatMode;

    const merged: BuiltMessage[] = [];
    let current: BuiltMessage | null = null;

    for (const msg of messages) {
      if (!current) {
        // 第一條訊息
        current = { ...msg };
      } else if (current.role === msg.role) {
        // 相同 role，但如果是多人卡/群聊且 name 不同，不合併
        if (
          preserveSenderIdentity &&
          current.role === "assistant" &&
          current.name !== msg.name
        ) {
          merged.push(current);
          current = { ...msg };
        } else {
          // 合併內容
          current.content = current.content + "\n\n" + msg.content;
          // 合併 identifier（用於調試）
          if (current.identifier && msg.identifier) {
            current.identifier = current.identifier + "+" + msg.identifier;
          }
        }
      } else {
        // 不同 role，保存當前並開始新的
        merged.push(current);
        current = { ...msg };
      }
    }

    // 別忘了最後一條
    if (current) {
      merged.push(current);
    }

    console.debug(
      `[PromptBuilder] Merged ${messages.length} messages into ${merged.length} messages`,
    );
    return merged;
  }

  /**
   * 計算世界書 Token
   */
  private async calculateWorldInfoTokens(
    wiResult: WIActivatedResult,
  ): Promise<number> {
    let tokens = 0;
    if (wiResult.worldInfoBefore) {
      tokens += await this.tokenCounter(wiResult.worldInfoBefore);
    }
    if (wiResult.worldInfoAfter) {
      tokens += await this.tokenCounter(wiResult.worldInfoAfter);
    }
    for (const entry of wiResult.EMEntries) {
      tokens += await this.tokenCounter(entry.content);
    }
    for (const entry of wiResult.WIDepthEntries) {
      tokens += await this.tokenCounter(entry.content);
    }
    for (const entry of wiResult.ANBeforeEntries) {
      tokens += await this.tokenCounter(entry.content);
    }
    for (const entry of wiResult.ANAfterEntries) {
      tokens += await this.tokenCounter(entry.content);
    }
    return tokens;
  }

  /**
   * 判斷提示詞是否在聊天歷史之後
   */
  private isPromptAfterHistory(
    identifier: string,
    order: PromptOrderEntry[],
  ): boolean {
    // 支持全局模式和面對面模式的 chatHistory
    const historyIndex = order.findIndex(
      (e) =>
        e.identifier === "chatHistory" ||
        e.identifier === "f2fChatHistory" ||
        e.identifier === "gcChatHistory",
    );
    const promptIndex = order.findIndex((e) => e.identifier === identifier);
    return historyIndex !== -1 && promptIndex > historyIndex;
  }

  /**
   * 根據標識符構建提示詞內容
   * 現在會正確使用 promptDef.role 來設定消息角色
   */
  private async buildPromptContent(
    identifier: string,
    wiResult: WIActivatedResult,
    promptDef?: PromptDefinition,
  ): Promise<BuiltMessage | BuiltMessage[] | null> {
    const { character } = this.options;

    // 獲取角色，默認為 system
    const getRole = (): "system" | "user" | "assistant" => {
      return promptDef?.role ?? "system";
    };

    switch (identifier) {
      case "main":
        const mainContent = await this.buildMainPrompt();
        return mainContent
          ? { role: getRole(), content: mainContent, identifier: "main" }
          : null;

      case "nsfw":
        // NSFW 提示詞（如果有自定義內容）
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content
            ? { role: getRole(), content, identifier: "nsfw" }
            : null;
        }
        return null;

      case "worldInfoBefore":
      case "f2fWorldInfoBefore":
      case "gcWorldInfoBefore":
        return wiResult.worldInfoBefore
          ? {
              role: "system",
              content: wiResult.worldInfoBefore,
              identifier,
            }
          : null;

      case "worldInfoAfter":
      case "f2fWorldInfoAfter":
      case "gcWorldInfoAfter":
        return wiResult.worldInfoAfter
          ? {
              role: "system",
              content: wiResult.worldInfoAfter,
              identifier,
            }
          : null;

      case "personaDescription":
        if (this.options.userPersona) {
          const persona = await this.macroEngine.substitute(
            this.options.userPersona,
          );
          return {
            role: getRole(),
            content: `[User Persona]\n${persona}`,
            identifier: "personaDescription",
          };
        }
        return null;

      case "userSecrets":
      case "f2fUserSecrets":
      case "gcUserSecrets":
        if (this.options.userSecrets && this.options.userSecrets.trim()) {
          const secrets = await this.macroEngine.substitute(
            this.options.userSecrets,
          );
          if (promptDef && promptDef.content) {
            const content = promptDef.content.replace(
              "{{userSecrets}}",
              secrets,
            );
            const processed = await this.macroEngine.substitute(content);
            return {
              role: getRole(),
              content: processed,
              identifier,
            };
          }
          return {
            role: getRole(),
            content: `🔐 {{user}} 的秘密層面：\n${secrets}\n\n⚠️ 重要提醒：這些是 {{user}} 內心的秘密，只有當 {{user}} 主動說出來或暗示時，{{char}} 才會知道這些信息。在思考框架中可以參考，但不能假設 {{char}} 已經知道這些秘密！`,
            identifier,
          };
        }
        return null;

      case "powerDynamic":
      case "f2fPowerDynamic":
      case "gcPowerDynamic":
        if (this.options.powerDynamic && this.options.powerDynamic.trim()) {
          const powerDynamic = await this.macroEngine.substitute(
            this.options.powerDynamic,
          );
          if (promptDef && promptDef.content) {
            const content = promptDef.content.replace(
              "{{powerDynamic}}",
              powerDynamic,
            );
            const processed = await this.macroEngine.substitute(content);
            return {
              role: getRole(),
              content: processed,
              identifier,
            };
          }
          return {
            role: getRole(),
            content: `⚖️ 與{{user}}的權力關係：\n${powerDynamic}\n\n⚠️ 重要：這個權力關係設定會直接影響對話態度、用詞選擇和互動方式！必須嚴格遵守，避免錯誤的壓制或不當的權力展現。`,
            identifier,
          };
        }
        return null;

      case "charDescription":
      case "f2fCharDescription":
      case "gcCharDescription":
        if (character.data.description) {
          const desc = await this.macroEngine.substitute(
            character.data.description,
          );
          return {
            role: getRole(),
            content: desc,
            identifier,
          };
        }
        return null;

      case "charPersonality":
      case "f2fCharPersonality":
      case "gcCharPersonality":
        if (character.data.personality) {
          const personality = await this.macroEngine.substitute(
            character.data.personality,
          );
          return {
            role: getRole(),
            content: `${character.data.name}'s personality: ${personality}`,
            identifier,
          };
        }
        return null;

      case "scenario":
      case "f2fScenario":
      case "gcScenario":
        if (character.data.scenario) {
          const scenario = await this.macroEngine.substitute(
            character.data.scenario,
          );
          return {
            role: getRole(),
            content: `Scenario: ${scenario}`,
            identifier,
          };
        }
        return null;

      case "enhanceDefinitions":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content
            ? { role: getRole(), content, identifier: "enhanceDefinitions" }
            : null;
        }
        return null;

      case "dialogueExamples":
      case "f2fDialogueExamples":
      case "gcDialogueExamples":
        return await this.buildExamples(wiResult);

      case "jailbreak":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content
            ? { role: getRole(), content, identifier: "jailbreak" }
            : null;
        }
        return null;

      case "authorsNote":
        // 作者筆記在 chatHistory 中處理（深度插入）
        return null;

      // ===== 格式規則 =====
      case "formatRules":
      case "f2fFormatRules":
      case "gcFormatRules":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 導演系統模塊（完整列表） =====
      // 這些提示詞由 default case 處理（使用 promptDef.content）
      case "protectionSequence": // 防護序列
      case "sovereigntyNegotiation": // 主權協商
      case "coreUnderstanding": // 核心認知
      case "narrativeMission": // 敘事使命
      case "sacredCreation": // 神聖創造
      case "onlineModeIntro": // 線上模式介紹
      case "onlineModeFeatures": // 線上模式功能
      case "onlineModeRules": // 線上模式規則
      case "thinkingGuide": // 思考框架
      case "forbiddenPatterns": // 禁止模式
      case "exampleScript": // 示範劇本
      case "finalInstructions": // 最終指令
      case "directorIdentity":
      case "ambiguityVsLove":
      case "directorDetails":
      case "mandatoryFormat":
      // ===== 面對面模式導演系統模塊 =====
      case "f2fProtectionSequence":
      case "f2fSovereigntyNegotiation":
      case "f2fCoreUnderstanding":
      case "f2fNarrativeMission":
      case "f2fSacredCreation":
      case "f2fModeIntro":
      case "f2fModeFeatures":
      case "f2fModeRules":
      case "f2fEnvironmentAndNpc":
      case "f2fThinkingGuide":
      case "f2fForbiddenPatterns":
      case "f2fExampleScript":
      case "f2fFinalInstructions":
      case "f2fAmbiguityVsLove":
      // ===== 群聊模式導演系統模塊 =====
      case "gcProtectionSequence":
      case "gcSovereigntyNegotiation":
      case "gcCoreUnderstanding":
      case "gcNarrativeMission":
      case "gcSacredCreation":
      case "gcModeIntro":
      case "gcModeFeatures":
      case "gcModeRules":
      case "gcEnvironmentAndNpc":
      case "gcThinkingGuide":
      case "gcForbiddenPatterns":
      case "gcExampleScript":
      case "gcFinalInstructions":
      case "gcAmbiguityVsLove":
      case "gcGroupDirector":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          if (
            identifier === "thinkingGuide" ||
            identifier === "f2fThinkingGuide" ||
            identifier === "gcThinkingGuide"
          ) {
            console.log(
              `🔍 [${identifier}] promptDef.role="${promptDef.role}" → getRole()="${getRole()}" | content 前 30 字: "${content?.substring(0, 30)}"`,
            );
          }
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 確認最終輸出（提取最後用戶訊息） =====
      case "confirmLastOutput":
      case "f2fConfirmLastOutput":
      case "gcConfirmLastOutput":
      case "phoneCallConfirmLastOutput": {
        const lastUserTurnMsgs = PromptBuilder.getLastUserTurnMessages(
          this.options.messages,
        );

        console.group("🔍 [confirmLastOutput] 調試");
        console.log("options.messages 總數:", this.options.messages.length);
        if (this.options.messages.length > 0) {
          const last3 = this.options.messages.slice(-3);
          console.log(
            "最後 3 條訊息:",
            last3.map((m) => ({
              is_user: m.is_user,
              sender: m.sender,
              content: m.content?.substring(0, 50),
            })),
          );
        }
        console.log(
          "getLastUserTurnMessages 結果:",
          lastUserTurnMsgs.length,
          "條",
        );
        console.log(
          "promptDef role:",
          promptDef?.role,
          "| content 前 50 字:",
          promptDef?.content?.substring(0, 50),
        );
        console.groupEnd();

        // 如果有 promptDef.content 且包含宏模板，優先使用模板渲染
        // 這樣用戶在編輯器中設定的 content 和 role 都會生效
        if (promptDef?.content && lastUserTurnMsgs.length > 0) {
          const substituted = await this.macroEngine.substitute(
            promptDef.content,
          );
          if (substituted) {
            // 檢查是否有圖片需要附帶
            const lastMsgWithImage = lastUserTurnMsgs.find((m) => m.imageData);
            return {
              role: getRole(),
              content: substituted,
              identifier,
              imageData: lastMsgWithImage?.imageData,
              imageMimeType: lastMsgWithImage?.imageMimeType,
              imageCaption: lastMsgWithImage?.imageCaption,
              imagePrompt: lastMsgWithImage?.imagePrompt,
            };
          }
        }

        // 回退：無 promptDef 或宏替換失敗時，使用原有的逐條訊息邏輯
        if (lastUserTurnMsgs.length === 0) {
          return null;
        }

        const builtMessages: BuiltMessage[] = [];
        for (const msg of lastUserTurnMsgs) {
          let msgContent = msg.content;

          if (msg.imageData) {
            const imgDesc = msg.imageCaption
              ? `圖片說明：${msg.imageCaption}`
              : "用戶發送了一張圖片";
            msgContent = `[${imgDesc}]\n${msgContent}`;
          }

          if (this.options.enableRealTimeAwareness !== false && msg.createdAt) {
            msgContent = `${this.formatMsgTimeTag(msg.createdAt)} ${msgContent}`;
          }

          builtMessages.push({
            role: getRole(),
            content: msgContent,
            identifier,
            imageData: msg.imageData,
            imageMimeType: msg.imageMimeType,
            imageCaption: msg.imageCaption,
            imagePrompt: msg.imagePrompt,
          });
        }

        return builtMessages.length === 1 ? builtMessages[0] : builtMessages;
      }

      case "gcGroupXmlFormat":
      case "gcGroupInteractionRules":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 規則約束模塊 =====
      case "coreRules":
      case "healthyEmotion":
      // ===== 面對面模式規則約束模塊 =====
      case "f2fCoreRules":
      case "f2fHealthyEmotion":
      // ===== 群聊模式規則約束模塊 =====
      case "gcCoreRules":
      case "gcHealthyEmotion":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 上下文信息模塊 =====
      case "languageMode":
      case "f2fLanguageMode":
      case "gcLanguageMode":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      case "timeInfo":
      case "f2fTimeInfo":
      case "gcTimeInfo":
        // 如果關閉了現實時間感知，跳過時間提示詞
        if (this.options.enableRealTimeAwareness === false) {
          return null;
        }
        // 時間信息需要動態替換宏
        if (promptDef && promptDef.content) {
          const now = this.options.fakeTimeOverride ?? new Date();
          let content = promptDef.content
            .replace("{{currentTime}}", now.toLocaleTimeString("zh-TW"))
            .replace("{{currentDate}}", now.toLocaleDateString("zh-TW"))
            .replace("{{currentYear}}", now.getFullYear().toString())
            .replace(
              "{{currentDay}}",
              ["日", "一", "二", "三", "四", "五", "六"][now.getDay()],
            );
          content = await this.macroEngine.substitute(content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      case "timeJump":
      case "f2fTimeJump":
      case "gcTimeJump":
        // 只有偏移時間模式才注入 time-jump 說明
        if (this.options.fakeTimeMode !== "offset") {
          return null;
        }
        {
          const now = this.options.fakeTimeOverride ?? new Date();
          const y = now.getFullYear();
          const mon = (now.getMonth() + 1).toString().padStart(2, "0");
          const day = now.getDate().toString().padStart(2, "0");
          const h = now.getHours().toString().padStart(2, "0");
          const m = now.getMinutes().toString().padStart(2, "0");
          const currentDatetime = `${y}-${mon}-${day}T${h}:${m}`;
          const content = `[時間跳轉]\n當故事需要時間跳轉時（如「兩個月後」「三天後」），在 </output> 之後輸出：\n<time-jump datetime="YYYY-MM-DDTHH:mm" reason="跳轉原因"/>\n例如：<time-jump datetime="${currentDatetime}" reason="當前時間點"/>\n此標籤會自動更新故事時間軸，之後的時間感知都會以新時間為基準。`;
          return { role: getRole(), content, identifier };
        }

      case "weatherInfo":
      case "f2fWeatherInfo":
      case "gcWeatherInfo": // 天氣信息
        if (this.options.weatherInfo) {
          const w = this.options.weatherInfo;
          let content = `[當前天氣]\n地點：${w.location}\n天氣：${w.condition}\n溫度：${w.temperature}°C（體感 ${w.feelsLike}°C）\n濕度：${w.humidity}%`;
          if (w.windSpeed !== undefined) {
            content += `\n風速：${w.windSpeed} km/h`;
            if (w.windDir) content += `，風向 ${w.windDir}`;
          }
          if (w.uv !== undefined) {
            content += `\n紫外線指數：${w.uv}`;
          }
          return { role: getRole(), content, identifier };
        }
        return null;

      case "holidayInfo":
      case "f2fHolidayInfo":
      case "gcHolidayInfo":
        return this.buildHolidayInfoPrompt(identifier, getRole());

      case "gameScores":
      case "f2fGameScores":
      case "gcGameScores":
        // 遊戲成績（marker，由外部填充）
        // TODO: 從 context 獲取遊戲成績
        return null;

      case "gameEconomyState":
        // 遊戲經濟狀態
        if (this.options.gameState) {
          // 使用 PromptTemplateService 渲染遊戲狀態
          let content = promptTemplateService.renderGameState(
            this.options.gameState,
          );

          // 如果有最近的禮物事件，附加禮物 Prompt
          if (this.options.recentGiftEvent) {
            const giftPrompt = promptTemplateService.renderGiftEvent(
              this.options.recentGiftEvent.giftName,
              this.options.recentGiftEvent.isLiked,
              this.options.recentGiftEvent.isDisliked,
            );
            if (giftPrompt) {
              content += "\n\n" + giftPrompt;
            }
          }

          // 如果有最近的轉帳事件，附加轉帳 Prompt
          if (this.options.recentTransferEvent) {
            const transferPrompt = promptTemplateService.renderTransferEvent(
              this.options.recentTransferEvent.amount,
            );
            if (transferPrompt) {
              content += "\n\n" + transferPrompt;
            }
          }

          if (content) {
            return { role: getRole(), content, identifier: "gameEconomyState" };
          }
        }
        return null;

      case "affinityState":
      case "f2fAffinityState":
      case "gcAffinityState": {
        const { affinityConfig, affinityState } = this.options;
        if (affinityConfig?.enabled && affinityState) {
          const content = affinityTemplateService.renderAffinityPrompt(
            affinityConfig,
            affinityState,
          );
          if (content) {
            return { role: getRole(), content, identifier: "affinityState" };
          }
        }
        return null;
      }

      case "affinityUpdateRules":
      case "f2fAffinityUpdateRules":
      case "gcAffinityUpdateRules": {
        const cfg = this.options.affinityConfig;
        if (cfg?.enabled && cfg.metrics.length > 0) {
          const content = affinityTemplateService.renderUpdateInstruction(cfg);
          if (content) {
            return {
              role: getRole(),
              content,
              identifier: "affinityUpdateRules",
            };
          }
        }
        return null;
      }

      case "foodLogs":
      case "f2fFoodLogs":
      case "gcFoodLogs":
        // 飲食記錄（marker，由外部填充）
        // TODO: 從 context 獲取飲食記錄
        return null;

      case "mediaLogs":
      case "f2fMediaLogs":
      case "gcMediaLogs":
        // 書影記錄
        if (this.options.mediaLogs) {
          const content = `[書影記錄]\n${this.options.mediaLogs}`;
          return { role: getRole(), content, identifier };
        }
        return null;

      case "importantEvents":
      case "f2fImportantEvents":
      case "gcImportantEvents":
        // 重要事件（按優先級排序，精簡格式節省 token）
        if (
          this.options.importantEvents &&
          this.options.importantEvents.length > 0
        ) {
          const sorted = this.options.importantEvents.sort(
            (a, b) => (a.priority || 3) - (b.priority || 3),
          );
          // 按分類分組，精簡顯示
          const grouped = new Map<string, string[]>();
          for (const e of sorted) {
            const cat = e.category || "custom";
            if (!grouped.has(cat)) grouped.set(cat, []);
            grouped.get(cat)!.push(e.content);
          }
          const categoryNames: Record<string, string> = {
            relationship: "關係",
            promise: "約定",
            secret: "秘密",
            fact: "事實",
            custom: "其他",
          };
          let events: string;
          if (grouped.size === 1 && grouped.has("custom")) {
            // 只有一個分類時不分組
            events = sorted.map((e) => `- ${e.content}`).join("\n");
          } else {
            events = Array.from(grouped.entries())
              .map(
                ([cat, items]) =>
                  `[${categoryNames[cat] || cat}] ${items.join("；")}`,
              )
              .join("\n");
          }
          const content = `[重要事件記錄]\n${events}`;
          return { role: getRole(), content, identifier };
        }
        return null;

      case "summaries":
      case "f2fSummaries":
      case "gcSummaries": {
        // 組裝總結 + 向量記憶（兩者共存，不互斥）
        const parts: string[] = [];

        // 1. 向量記憶檢索結果（較遠的歷史補充，先注入提供背景脈絡）
        if (this.options.vectorMemories && this.options.vectorMemories.length > 0) {
          // 過濾掉已在時間排序總結中的條目（以 sourceId 去重）
          const summaryIds = new Set(this.options.summaries?.map((s) => s.id) ?? []);
          const uniqueMemories = this.options.vectorMemories.filter(
            (m) => !summaryIds.has(m.sourceId),
          );
          if (uniqueMemories.length > 0) {
            const memories = uniqueMemories
              .map((m, i) => {
                const sourceLabel = m.sourceType === 'summary' ? '總結' : '日記';
                return `【記憶 ${i + 1}】(相似度: ${m.score.toFixed(2)}, 來源: ${sourceLabel})\n${m.content}`;
              })
              .join("\n\n");
            parts.push(`[語義記憶檢索]\n以下是與當前對話語義相關的歷史記憶片段：\n\n${memories}`);
          }
        }

        // 2. 時間排序的總結（最近的基礎記憶，放在下面更接近當前對話）
        if (this.options.summaries && this.options.summaries.length > 0) {
          const summaries = this.options.summaries
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((s, i) => `【總結 ${i + 1}】\n${s.content}`)
            .join("\n\n");
          parts.push(`[對話歷史總結]\n以下是之前對話的總結，請參考這些內容保持對話的連貫性：\n\n${summaries}`);
        }

        if (parts.length === 0) return null;
        return { role: getRole(), content: parts.join("\n\n"), identifier };
      }

      case "socialPosts":
        // 社交媒體動態（marker，由外部填充）
        // TODO: 從 context 獲取社交動態
        return null;

      case "stickerSystem":
      case "f2fStickerSystem":
      case "gcStickerSystem":
        // 表情包列表（marker，由外部填充）
        // TODO: 從 context 獲取表情包列表
        return null;

      case "stickerGuidance":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 來電相關模塊 =====
      case "recentCallHistory":
      case "f2fRecentCallHistory":
      case "gcRecentCallHistory":
        // 最近通話記錄（marker，內容由宏變量填充）
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          // 如果沒有通話記錄，不顯示這個提示詞
          if (
            !this.options.recentCallHistory ||
            this.options.recentCallHistory.length === 0
          ) {
            return null;
          }
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      case "callDecision":
      case "f2fCallDecision":
      case "gcCallDecision":
        // 來電決策提示詞
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      case "doNotDisturbStatus":
      case "f2fDoNotDisturbStatus":
      case "gcDoNotDisturbStatus":
        // 勿擾模式狀態（marker，只有開啟時才發送）
        if (this.options.doNotDisturb && promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        // 勿擾模式關閉時不發送任何內容
        return null;

      // ===== 人稱模式（面對面模式專用 marker） =====
      case "f2fNarrativePerson":
        if (this.options.thirdPersonMode) {
          const content = await this.macroEngine.substitute(
            `{{char}}將使用第三人稱描述故事，例如:{{char}}今天做了湯給{{user}}`,
          );
          return content ? { role: getRole(), content, identifier } : null;
        } else {
          const content = await this.macroEngine.substitute(
            `{{char}}必須使用第二人稱，使用「我」稱呼自己，使用「你」稱呼 {{user}}`,
          );
          return content ? { role: getRole(), content, identifier } : null;
        }

      // ===== 健身資訊模塊 =====
      case "fitnessInfo":
      case "f2fFitnessInfo":
      case "gcFitnessInfo":
        return this.buildFitnessInfoPrompt(identifier, getRole());

      // ===== 角色相關模塊（有內容的提示詞） =====
      case "userInfo": // 用戶信息
      case "characterSettings": // 角色設定框架
      case "characterCorePersonality": // 角色核心性格
      case "socialMedia": // 社交媒體動態
      case "stickerList": // 表情包列表
      // ===== 面對面模式角色相關模塊 =====
      case "f2fUserInfo":
      case "f2fCharacterSettings":
      case "f2fCharacterCorePersonality":
      case "f2fSocialMedia":
      case "f2fStickerList":
      // ===== 群聊模式角色相關模塊 =====
      case "gcUserInfo":
      case "gcCharacterSettings":
      case "gcCharacterCorePersonality":
      case "gcSocialMedia":
      case "gcStickerList":
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      // ===== 面對面模式聊天歷史和作者筆記 =====
      case "f2fChatHistory":
        // 聊天歷史在 build() 中單獨處理
        return null;

      case "f2fAuthorsNote":
        // 作者筆記在 chatHistory 中處理（深度插入）
        return null;

      // ===== 群聊模式聊天歷史和作者筆記 =====
      case "gcChatHistory":
        // 聊天歷史在 build() 中單獨處理
        return null;

      case "gcAuthorsNote":
        // 作者筆記在 chatHistory 中處理（深度插入）
        return null;

      // ===== 群聊模式：群成員列表 marker =====
      case "gcGroupMembers":
        return this.buildGroupMembersList();

      // ===== 群聊模式：群聊角色名單 marker =====
      case "gcGroupCharacterNames":
        return this.buildGroupCharacterNames();

      // ===== MiniMax TTS 語氣標籤指令 =====
      case "minimaxTTS":
        return this.buildMinimaxTTSPrompt();

      default:
        // 自定義提示詞 - 使用 promptDef.role
        if (promptDef && promptDef.content && !promptDef.marker) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;
    }
  }

  /**
   * 組裝群聊成員列表
   * 為每個成員生成包含名稱、暱稱、性格描述的文字
   */
  private buildGroupMembersList(): BuiltMessage | null {
    const { groupMembers, groupName, isMultiCharCard, multiCharMembers } =
      this.options;

    // 多人卡模式：只列出子角色名字，人設在卡的 description 裡
    if (isMultiCharCard && multiCharMembers && multiCharMembers.length > 0) {
      const parts: string[] = [];
      parts.push(`<group_members>`);
      parts.push(`👥 多人卡「${groupName || "聊天"}」角色列表\n`);
      for (const member of multiCharMembers) {
        parts.push(`【${member.name}】`);
      }
      parts.push(
        `\n⚠️ 以上角色的詳細人設請參考角色描述（description）中的內容。`,
      );
      parts.push(`</group_members>`);
      return {
        role: "system",
        content: parts.join("\n"),
        identifier: "gcGroupMembers",
      };
    }

    // 普通群聊模式
    if (!groupMembers || groupMembers.length === 0) return null;

    const parts: string[] = [];
    parts.push(`<group_members>`);
    parts.push(`👥 群聊「${groupName || "群聊"}」成員列表\n`);

    for (const member of groupMembers) {
      const tags: string[] = [];
      if (member.isAdmin) tags.push("[管理員]");
      if (member.isMuted) tags.push("[已禁言]");

      const displayName = member.nickname
        ? `${member.name}（暱稱：${member.nickname}）`
        : member.name;

      const tagStr = tags.length > 0 ? ` ${tags.join(" ")}` : "";
      parts.push(`【${displayName}】${tagStr}`);

      if (member.personality) {
        parts.push(`  性格：${member.personality}`);
      }
      if (member.description) {
        parts.push(`  描述：${member.description}`);
      }
      parts.push("");
    }

    parts.push(`</group_members>`);

    return {
      role: "system",
      content: parts.join("\n"),
      identifier: "gcGroupMembers",
    };
  }

  /**
   * 構建群聊角色名單
   * 明確列出本次群聊中所有角色的名字，讓 AI 知道有幾個角色
   */
  private buildGroupCharacterNames(): BuiltMessage | null {
    const { groupMembers, isMultiCharCard, multiCharMembers } = this.options;

    // 多人卡模式
    if (isMultiCharCard && multiCharMembers && multiCharMembers.length > 0) {
      const names = multiCharMembers.map((m) => m.name);
      const content = `<group_character_names>
🎭 本次多人卡共有 ${names.length} 位角色：${names.join("、")}
⚠️ 你必須扮演以上所有角色，每個角色都必須有機會發言，不能遺漏任何一位！
</group_character_names>`;
      return { role: "system", content, identifier: "gcGroupCharacterNames" };
    }

    // 普通群聊模式
    if (!groupMembers || groupMembers.length === 0) return null;

    const names = groupMembers.map((m) => m.name);
    const content = `<group_character_names>
🎭 本次群聊共有 ${names.length} 位角色：${names.join("、")}
⚠️ 你必須扮演以上所有角色，每個角色都必須有機會發言，不能遺漏任何一位！
</group_character_names>`;

    return {
      role: "system",
      content,
      identifier: "gcGroupCharacterNames",
    };
  }

  /**
   * 掃描世界書
   */
  private async scanWorldInfo(): Promise<WIActivatedResult> {
    const { lorebooks, messages, character, settings } = this.options;

    if (lorebooks.length === 0) {
      return {
        worldInfoBefore: "",
        worldInfoAfter: "",
        WIDepthEntries: [],
        EMEntries: [],
        ANBeforeEntries: [],
        ANAfterEntries: [],
        outletEntries: {},
        allActivatedEntries: new Set(),
      };
    }

    // 將聊天消息轉換為字串陣列（從最新到最舊）
    const chatStrings = messages
      .slice()
      .reverse()
      .map((m) => `${m.name}: ${m.content}`);

    // 準備全局掃描數據
    const globalScanData: WIGlobalScanData = {
      trigger: "normal",
      personaDescription: this.options.userPersona ?? "",
      characterDescription: character.data.description,
      characterPersonality: character.data.personality,
      characterDepthPrompt:
        character.data.extensions?.depth_prompt?.prompt ?? "",
      scenario: character.data.scenario,
      creatorNotes: character.data.creator_notes,
    };

    const scanner = new WorldInfoScanner({
      chat: chatStrings,
      maxContext: settings.maxContextLength,
      globalScanData,
      tokenCounter: this.tokenCounter,
    });

    return scanner.scan(lorebooks);
  }

  /**
   * 對已激活的世界書條目 content 做 EJS 渲染。
   * 支持 getvar('stat_data.角色名.變量名') 語法引用好感度變量，
   * 兼容酒館模板的 EJS 條件語法。
   */
  private processWorldInfoEjs(wiResult: WIActivatedResult): WIActivatedResult {
    const hasEjs = (s: string) => s.includes("<%");

    const anyEjs =
      hasEjs(wiResult.worldInfoBefore) ||
      hasEjs(wiResult.worldInfoAfter) ||
      wiResult.WIDepthEntries.some((e) => hasEjs(e.content)) ||
      wiResult.EMEntries.some((e) => hasEjs(e.content)) ||
      wiResult.ANBeforeEntries.some((e) => hasEjs(e.content)) ||
      wiResult.ANAfterEntries.some((e) => hasEjs(e.content)) ||
      Object.values(wiResult.outletEntries).some((arr) =>
        arr.some((s) => hasEjs(s)),
      );

    if (!anyEjs) return wiResult;

    const ctx = this.buildWiEjsContext();

    // 嘗試從 allActivatedEntries 找出對應的條目名稱，方便除錯
    const findEntryLabel = (content: string): string => {
      for (const entry of wiResult.allActivatedEntries) {
        if (entry.content === content) {
          const label = entry.comment || `uid=${entry.uid}`;
          const world = entry.world ? `[${entry.world}]` : "";
          return `${world}${label}`;
        }
      }
      return "(合併內容)";
    };

    /**
     * 逐段分析 EJS：當整體渲染失敗時，逐個 EJS 區塊嘗試編譯，
     * 找出具體哪個區塊有語法錯誤，並記錄詳細的除錯資訊。
     * 對於獨立的表達式區塊（<%= %> / <%- %>）可以單獨渲染；
     * 對於控制流區塊（<% if/for/} %>）無法單獨渲染，僅記錄錯誤。
     * 最終返回原始內容（保留原文讓 AI 自行處理）。
     */
    const diagnoseFailed = (content: string, label: string): string => {
      // 匹配完整的 EJS 區塊
      const ejsBlockRe = /<%[-_=]?[\s\S]*?[-_]?%>/g;
      let match: RegExpExecArray | null;
      let failedBlocks = 0;

      while ((match = ejsBlockRe.exec(content)) !== null) {
        const block = match[0];
        try {
          // 嘗試編譯單個區塊（表達式區塊可以獨立編譯）
          ejs.render(block, ctx, { async: false });
        } catch (e) {
          failedBlocks++;
          if (failedBlocks <= 5) {
            const blockPreview = block.length > 150 ? block.substring(0, 150) + "..." : block;
            console.warn(
              `[PromptBuilder] 世界書 EJS 語法錯誤 ${label} 區塊 #${failedBlocks}:`,
              (e as Error).message,
              "\n區塊內容:", blockPreview,
            );
          }
        }
      }
      if (failedBlocks > 5) {
        console.warn(`[PromptBuilder] ${label} 共有 ${failedBlocks} 個 EJS 區塊有語法問題`);
      }
      if (failedBlocks === 0) {
        // 單個區塊都能編譯，但組合起來失敗 → 可能是控制流不匹配（如缺少 } 或 else）
        console.warn(
          `[PromptBuilder] ${label} 各區塊單獨編譯正常，但組合後失敗，可能是控制流結構不完整（缺少 } 或 if/else 不匹配）`,
        );
      }
      // 返回原始內容，讓 AI 自行處理
      return content;
    };

    // 移除 EJS 區塊中的 await 關鍵字，避免非 async 函數中的 SyntaxError
    // 因為所有酒館 stub（getwi 等）都是同步的，await 不影響結果
    const stripAwaitInEjs = (content: string): string => {
      if (!content.includes("await")) return content;
      return content.replace(/(<%[-_=]?)(\s*[\s\S]*?)([-_]?%>)/g, (_match, open, body, close) => {
        return open + body.replace(/\bawait\s+/g, "") + close;
      });
    };

    const render = (content: string, label?: string): string => {
      if (!hasEjs(content)) return content;
      const entryLabel = label || findEntryLabel(content);
      const processed = stripAwaitInEjs(content);
      try {
        return ejs.render(processed, ctx, { async: false });
      } catch (e) {
        // 整體渲染失敗，進行逐段診斷以找出具體問題
        console.warn(
          `[PromptBuilder] 世界書 EJS 整體渲染失敗 ${entryLabel}:`,
          (e as Error).message,
        );
        return diagnoseFailed(processed, entryLabel);
      }
    };

    return {
      worldInfoBefore: render(wiResult.worldInfoBefore, "worldInfoBefore"),
      worldInfoAfter: render(wiResult.worldInfoAfter, "worldInfoAfter"),
      WIDepthEntries: wiResult.WIDepthEntries.map((e, i) => ({
        ...e,
        content: render(e.content, `WIDepth[${i}] depth=${e.depth}`),
      })),
      EMEntries: wiResult.EMEntries.map((e, i) => ({
        ...e,
        content: render(e.content, `EM[${i}]`),
      })),
      ANBeforeEntries: wiResult.ANBeforeEntries.map((e, i) => ({
        ...e,
        content: render(e.content, `ANBefore[${i}]`),
      })),
      ANAfterEntries: wiResult.ANAfterEntries.map((e, i) => ({
        ...e,
        content: render(e.content, `ANAfter[${i}]`),
      })),
      outletEntries: Object.fromEntries(
        Object.entries(wiResult.outletEntries).map(([k, arr]) => [
          k,
          arr.map((s, i) => render(s, `outlet[${k}][${i}]`)),
        ]),
      ),
      allActivatedEntries: wiResult.allActivatedEntries,
    };
  }

  /**
   * 構建世界書 EJS 渲染上下文，提供 getvar() 等函數。
   * 兼容酒馆 stat_data.角色名.變量名 路徑格式。
   */
  private buildWiEjsContext(): Record<string, unknown> {
    const { affinityConfig, affinityState, character } = this.options;
    const charName = character.data.name;
    // statKey 優先：用戶自訂的 EJS 路徑名稱，空字串時 fallback 到卡片名
    const statKey = affinityConfig?.statKey?.trim() || charName;

    // statData 使用巢狀結構：指標名稱中的 "." 會被拆解為多層物件
    // 例如指標名 "黎靖青.亲密值" → statData["黎靖青"]["亲密值"]
    //      指標名 "user.识破身份" → statData["user"]["识破身份"]
    const statData: Record<string, any> = {};
    const valuesMap: Record<string, MetricValue> = {};
    const stagesMap: Record<string, string | null> = {};

    if (affinityConfig?.enabled && affinityState) {
      for (const m of affinityConfig.metrics) {
        const v = affinityState.values[m.id] ?? m.initial;
        valuesMap[m.name] = v;
        stagesMap[m.name] = computeStage(v, m.stages);

        // 將指標名按 "." 拆解為巢狀路徑寫入 statData
        // "黎靖青.亲密值" → statData["黎靖青"]["亲密值"] = v
        // "user.识破身份" → statData["user"]["识破身份"] = v
        const nameParts = m.name.split(".");
        if (nameParts.length >= 2) {
          const ns = nameParts[0]; // 命名空間（如 "黎靖青"、"user"、"世界"）
          const key = nameParts.slice(1).join("."); // 剩餘路徑
          if (!statData[ns]) statData[ns] = {};
          statData[ns][key] = v;
        } else {
          // 沒有命名空間前綴的指標，放在 statKey 下
          if (!statData[statKey]) statData[statKey] = {};
          statData[statKey][m.name] = v;
        }
      }

      // 確保 statKey 和 charName 都能存取到角色的數值
      // 兼容角色卡名（如「姊姊大人」）與世界書中使用的角色本名（如「黎靖青」）
      if (statKey !== charName) {
        // 如果 statKey 下有資料但 charName 下沒有，複製過去（反之亦然）
        if (statData[statKey] && !statData[charName]) {
          statData[charName] = statData[statKey];
        } else if (statData[charName] && !statData[statKey]) {
          statData[statKey] = statData[charName];
        }
      }
    }

    // 使用 Proxy 包裝 statData，當請求的角色名不存在時自動 fallback 到唯一的角色資料
    // 兼容角色卡名（如「姊姊大人」）與世界書中使用的角色本名（如「黎靖青」）不一致的情況
    const statDataProxy = new Proxy(statData, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
          const keys = Object.keys(target);
          if (keys.length > 0) {
            return target[keys[0]];
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const getvar = (path: string): any => {
      if (!path) return undefined;
      const parts = path.split(".");

      // 支援 getvar('stat_data') 返回整個物件
      if (path === "stat_data") return statDataProxy;
      if (path === "values") return valuesMap;
      if (path === "stages") return stagesMap;

      if (parts[0] === "stat_data" && parts.length >= 2) {
        // 直接用 Proxy 存取，確保 fallback 機制生效
        let obj: any = statDataProxy[parts[1]];
        if (parts.length === 2) return obj;
        // 逐層深入剩餘路徑
        for (let i = 2; i < parts.length; i++) {
          if (obj && typeof obj === "object") {
            obj = obj[parts[i]];
          } else {
            return undefined;
          }
        }
        return obj;
      }
      let current: unknown = {
        stat_data: statDataProxy,
        values: valuesMap,
        stages: stagesMap,
      };
      for (const p of parts) {
        if (current && typeof current === "object") {
          current = (current as Record<string, unknown>)[p];
        } else {
          return undefined;
        }
      }
      return current;
    };

    const getVariables = (options: { type?: string } = {}) => {
      // 模擬酒館的 getVariables，目前主要返回 stat_data 相關
      if (options.type === "chat") {
        return { stat_data: statDataProxy, ...valuesMap };
      }
      return { stat_data: statDataProxy };
    };

    // --- 兼容酒館的聊天訊息存取函數 ---
    const messages = this.options.messages;

    /**
     * getChatMessage(index, role?)
     * 兼容酒館 EJS 的 getChatMessage。
     * index: 正數從頭算，負數從尾算（-1 = 最後一條）
     * role: 可選篩選 'user' | 'assistant' | 'system'，篩選後再按 index 取
     */
    const getChatMessage = (index: number, role?: string): string => {
      let pool = messages;
      if (role) {
        if (role === "user") {
          pool = messages.filter((m) => m.is_user);
        } else if (role === "assistant") {
          pool = messages.filter(
            (m) => !m.is_user && m.sender !== "system" && m.sender !== "narrator",
          );
        } else if (role === "system") {
          pool = messages.filter((m) => m.sender === "system");
        }
      }
      if (pool.length === 0) return "";
      const i = index < 0 ? pool.length + index : index;
      return pool[i]?.content ?? "";
    };

    /**
     * getMessages() — 返回所有聊天訊息的 content 陣列
     */
    const getMessages = (): string[] => messages.map((m) => m.content);

    /**
     * lastMessage / lastUserMessage / lastCharMessage — 常用快捷變量
     */
    const lastMsg = messages.length > 0 ? messages[messages.length - 1].content : "";
    const lastUserMsg = [...messages].reverse().find((m) => m.is_user)?.content ?? "";
    const lastCharMsg =
      [...messages].reverse().find(
        (m) => !m.is_user && m.sender !== "system" && m.sender !== "narrator",
      )?.content ?? "";

    // --- 兼容酒館的變量寫入函數（no-op stub） ---
    // setvar 在酒館中用於寫入聊天變量，Aguaphone 不支援此功能，
    // 但需要提供 stub 避免 EJS 渲染時 ReferenceError
    const setvar = (_path: string, _value: unknown): void => {
      // no-op：Aguaphone 不支援 setvar，靜默忽略
    };

    // getwi 在酒館中用於引用其他世界書條目內容，
    // Aguaphone 不支援跨條目引用，返回空字串
    const getwi = (_name: string): string => "";

    // 酒館 EJS 常用函數的 stub，避免 ReferenceError
    const noopReturn = () => undefined;
    const incvar = (_key: string, _val?: number) => undefined;
    const decvar = (_key: string, _val?: number) => undefined;
    const getchr = () => "";

    return {
      getvar,
      setvar,
      incvar,
      decvar,
      getwi,
      getchr,
      getVariables,
      getChatMessage,
      getMessages,
      _,
      stat_data: statDataProxy,
      values: valuesMap,
      stages: stagesMap,
      // 常用快捷變量，兼容酒館 EJS 模板
      lastMessage: lastMsg,
      lastUserMessage: lastUserMsg,
      lastCharMessage: lastCharMsg,
      chatMessages: messages,
      charName,
      userName: this.options.userName,
      messageCount: messages.length,
      // 酒館 Prompt Template 擴展可能用到的函數 stub
      setLocalVar: noopReturn,
      setGlobalVar: noopReturn,
      setMessageVar: noopReturn,
      getLocalVar: noopReturn,
      getGlobalVar: noopReturn,
      getMessageVar: noopReturn,
      incLocalVar: noopReturn,
      incGlobalVar: noopReturn,
      removeVariable: noopReturn,
      insertVariable: noopReturn,
      getWorldInfo: getwi,
      getEnabledWorldInfoEntries: () => [],
      getWorldInfoActivatedEntries: () => [],
    };
  }

  /**
   * 組裝主提示詞 (Main Prompt)
   * 這是系統提示詞的第一部分，不包含世界書
   */
  private async buildMainPrompt(): Promise<string> {
    const { character, systemPromptOverride } = this.options;

    // 主提示詞優先順序：覆蓋 > 角色設定 > 默認
    const mainPrompt =
      systemPromptOverride ||
      character.data.system_prompt ||
      DEFAULT_PROMPTS.main;

    if (mainPrompt) {
      return await this.macroEngine.substitute(mainPrompt);
    }

    return "";
  }

  /**
   * 組裝 MiniMax TTS 語氣標籤提示詞
   * 僅在 minimaxTTSEnabled 時注入
   */
  private buildMinimaxTTSPrompt(): BuiltMessage | null {
    if (!this.options.minimaxTTSEnabled) return null;

    const content = `【語音合成標記規則】
你的對話文字將被語音合成引擎朗讀。請在角色的對話中自然地加入以下標記：

1. 語氣標籤——直接寫在對話文字中自然觸發的位置，一句話最多1~2個：
(laughs)笑聲 (chuckle)輕笑 (sighs)嘆氣 (gasps)倒吸氣 (breath)呼吸 (emm)猶豫嗯 (crying)哭泣 (coughs)咳嗽 (sniffs)抽鼻 (pant)喘氣 (humming)哼唱 (groans)呻吟

2. 停頓——<#秒數#>，範圍0.01~99.99，用於語句間的自然停頓

3. 情緒與語速——放在每句對話引號關閉前的最末尾：
[emotion=情緒] 或 [emotion=情緒;speed=語速]
emotion可選：happy/sad/angry/fearful/disgusted/surprised/calm
speed：0.5~2.0，正常時省略

示例：
她眼睛一亮。"真的嗎(laughs)？太好了！[emotion=happy]"
他沉默了很久。"算了(sighs)……<#1.5#>有些事(breath)強求不來。[emotion=sad;speed=0.8]"

要求：
- [emotion=...] 始終放在引號關閉前的最末尾
- 根據上下文判斷情緒，別千篇一律
- 敘述旁白正常寫，不加任何標記`;

    return {
      role: "system",
      content,
      identifier: "minimaxTTS",
    };
  }

  /**
   * 組裝角色描述區塊
   */
  private async buildCharacterBlock(): Promise<string> {
    const { character } = this.options;
    const parts: string[] = [];

    // 角色描述
    if (character.data.description) {
      parts.push(await this.macroEngine.substitute(character.data.description));
    }

    // 角色性格
    if (character.data.personality) {
      parts.push(
        `${character.data.name}'s personality: ${await this.macroEngine.substitute(character.data.personality)}`,
      );
    }

    // 場景
    if (character.data.scenario) {
      parts.push(
        `Scenario: ${await this.macroEngine.substitute(character.data.scenario)}`,
      );
    }

    return parts.join("\n\n");
  }

  /**
   * 組裝對話示例
   * 包含 ↑EM (EM_TOP) 和 ↓EM (EM_BOTTOM) 世界書條目
   */
  private async buildExamples(
    wiResult: WIActivatedResult,
  ): Promise<BuiltMessage[]> {
    const { character } = this.options;
    const messages: BuiltMessage[] = [];

    // ↑EM - 對話示例之前的世界書條目
    for (const entry of wiResult.EMEntries.filter(
      (e) => e.position === AnchorPos.BEFORE,
    )) {
      messages.push({
        role: "system",
        content: entry.content,
        identifier: "wiEMTop",
      });
    }

    // 對話示例
    if (character.data.mes_example) {
      const exampleContent = await this.macroEngine.substitute(
        character.data.mes_example,
      );
      messages.push({
        role: "system",
        content: `[Example dialogue]\n${exampleContent}`,
        identifier: "dialogueExamples",
      });
    }

    // ↓EM - 對話示例之後的世界書條目
    for (const entry of wiResult.EMEntries.filter(
      (e) => e.position === AnchorPos.AFTER,
    )) {
      messages.push({
        role: "system",
        content: entry.content,
        identifier: "wiEMBottom",
      });
    }

    return messages;
  }

  /**
   * 組裝聊天歷史
   *
   * 包含以下插入位置：
   * - @D (AT_DEPTH): 世界書在指定深度插入
   * - ↑AT (AN_TOP): 作者筆記之前
   * - ↓AT (AN_BOTTOM): 作者筆記之後
   * - ABSOLUTE 提示詞: 自定義提示詞按 injection_depth 插入
   *
   * 深度說明：
   * - depth=0: 最新消息之後（聊天歷史末尾，最接近 AI 回覆的位置）
   * - depth=1: 最新消息之前
   * - depth=N: 從最新往前數第 N 條消息之前
   *
   * 角色說明：
   * - system: AI 視為「行為準則和背景設定」
   * - user: AI 視為「人類對我說的話，需要回應」
   * - assistant: AI 視為「我之前說過的話」
   */
  private async buildChatHistory(
    maxTokens: number,
    wiResult: WIActivatedResult,
    pendingDepthPrompts: PendingDepthPrompt[] = [],
    stripLastUserMessage: boolean = false,
  ): Promise<{
    messages: BuiltMessage[];
    tokens: number;
    wasTruncated: boolean;
  }> {
    const { messages: rawMessages, authorsNote, character } = this.options;

    // 如果啟用了「確認最終輸出」，從聊天歷史中移除本輪用戶連續發送的所有訊息
    let messages = rawMessages;
    if (stripLastUserMessage && rawMessages.length > 0) {
      const lastTurnMsgs = PromptBuilder.getLastUserTurnMessages(rawMessages);
      if (lastTurnMsgs.length > 0) {
        const idsToRemove = new Set(lastTurnMsgs.map((m) => m.id));
        messages = rawMessages.filter((m) => !idsToRemove.has(m.id));
      }
    }
    const builtMessages: BuiltMessage[] = [];
    let usedTokens = 0;
    let wasTruncated = false;

    // 首先添加開場白（如果這是新對話且沒有消息，群聊模式和電話模式不添加）
    if (
      messages.length === 0 &&
      character.data.first_mes &&
      !this.options.groupChatMode &&
      !this.options.phoneCallMode
    ) {
      const firstMes = await this.macroEngine.substitute(
        character.data.first_mes,
      );
      builtMessages.push({
        role: "assistant",
        content: firstMes,
        name: character.data.name,
        identifier: "firstMessage",
      });
      usedTokens += await this.tokenCounter(firstMes);
    }

    // 從最新到最舊處理消息，直到達到 Token 限制
    const reversedMessages = [...messages].reverse();
    const tempMessages: BuiltMessage[] = [];

    for (const msg of reversedMessages) {
      const content = msg.content;
      const tokens = await this.tokenCounter(content);

      if (usedTokens + tokens > maxTokens) {
        wasTruncated = true;
        break;
      }

      // 群聊模式或多人卡模式下為每條歷史訊息加上發送者名稱前綴
      let formattedContent = content;
      // 群聊模式或多人卡非面對面模式：加上 [角色名] 前綴
      // 面對面 + 多人卡：輸出是小說式一整段，不需要前綴
      const shouldAddCharPrefix =
        (this.options.groupChatMode ||
          (this.options.isMultiCharCard && !this.options.faceToFaceMode)) &&
        !msg.is_user &&
        msg.name;
      if (shouldAddCharPrefix) {
        formattedContent = `[${msg.name}] ${content}`;
      }

      // 群聊模式下為用戶訊息加上 [用戶名] 前綴，防止 AI 杜撰用戶發言
      const shouldAddUserPrefix =
        this.options.groupChatMode &&
        msg.is_user &&
        msg.sender !== "system" &&
        msg.sender !== "narrator";
      if (shouldAddUserPrefix) {
        formattedContent = `[${this.options.userName}] ${content}`;
      }

      // 小劇場/系統消息：用 system role 並格式化為場景指令
      const isSystemMsg = msg.sender === "system" || msg.sender === "narrator";
      let msgRole: "system" | "user" | "assistant" = msg.is_user
        ? "user"
        : "assistant";
      let msgContent = formattedContent;

      if (isSystemMsg) {
        // 時間跳轉訊息：用 user role，讓 AI 正常回覆
        if (msg.isTimetravel) {
          msgRole = "user";
          const dest = msg.timetravelContent || msgContent;
          msgContent = `[場景與時間切換到:${dest}]`;
        } else if (msgContent.startsWith("小劇場：")) {
          // 小劇場消息：用 user role，讓 AI 正常回覆
          msgRole = "user";
          const scenario = msgContent.replace("小劇場：", "").trim();
          msgContent = `[場景指令] 接下來請按照以下劇情發展進行扮演：${scenario}`;
        } else {
          msgRole = "system";
        }
      }

      // 為 user/assistant 訊息加上時間戳，讓 AI 感知時間（如果啟用了現實時間感知）
      if (
        this.options.enableRealTimeAwareness !== false &&
        !isSystemMsg &&
        msg.createdAt
      ) {
        msgContent = `${this.formatMsgTimeTag(msg.createdAt)} ${msgContent}`;
      }

      // 如果這條訊息有引用回覆，在內容前加上引用標記讓 AI 知道
      if (msg.replyTo && !isSystemMsg) {
        const repliedMsg = messages.find((m) => m.id === msg.replyTo);
        if (repliedMsg) {
          const preview = repliedMsg.content
            .replace(/\[img:.*?\]/g, "[圖片]")
            .replace(/\[sticker:.*?\]/g, "[表情包]");
          const truncated =
            preview.length > 60 ? preview.substring(0, 60) + "…" : preview;
          const senderName = repliedMsg.is_user
            ? this.options.userName
            : repliedMsg.name || character.data.name;
          msgContent = `[回覆 ${senderName}：「${truncated}」]\n${msgContent}`;
        }
      }

      tempMessages.unshift({
        role: msgRole,
        content: msgContent,
        name: msg.name,
        identifier: "chatMessage",
        // 保留圖片資訊（用於 Vision API）
        imageData: msg.imageData,
        imageMimeType: msg.imageMimeType,
        // 保留圖片描述（用於歷史圖片的文字替代）
        imageCaption: msg.imageCaption,
        imagePrompt: msg.imagePrompt,
      } as BuiltMessage);
      usedTokens += tokens;
    }

    // 準備深度插入的內容
    const depthEntries = wiResult.WIDepthEntries;
    const anDepth = authorsNote?.depth ?? 4;

    // 調試：輸出深度條目信息
    console.debug(
      `[PromptBuilder] Chat history has ${tempMessages.length} messages`,
    );
    console.debug(
      `[PromptBuilder] WIDepthEntries count: ${depthEntries.length}`,
    );
    console.debug(
      `[PromptBuilder] PendingDepthPrompts count: ${pendingDepthPrompts.length}`,
    );
    for (const entry of depthEntries) {
      console.debug(
        `[PromptBuilder] WI Depth entry: depth=${entry.depth}, role=${entry.role}, content preview: ${entry.content.substring(0, 50)}...`,
      );
    }
    for (const prompt of pendingDepthPrompts) {
      console.debug(
        `[PromptBuilder] Custom Depth prompt: depth=${prompt.depth}, role=${prompt.role}, order=${prompt.order}, id=${prompt.identifier}`,
      );
    }

    // 構建作者筆記區塊（包含 ↑AT 和 ↓AT）
    const buildAuthorsNoteBlock = (): BuiltMessage[] => {
      const block: BuiltMessage[] = [];

      // ↑AT - 作者筆記之前
      for (const entry of wiResult.ANBeforeEntries) {
        block.push({
          role: "system",
          content: entry.content,
          identifier: "wiANTop",
          injected: true,
        });
      }

      // 作者筆記本體
      if (authorsNote && authorsNote.prompt) {
        block.push({
          role: "system",
          content: authorsNote.prompt,
          identifier: "authorsNote",
          injected: true,
        });
      }

      // ↓AT - 作者筆記之後
      for (const entry of wiResult.ANAfterEntries) {
        block.push({
          role: "system",
          content: entry.content,
          identifier: "wiANBottom",
          injected: true,
        });
      }

      return block;
    };

    // 轉換角色枚舉到消息角色
    const roleToMessageRole = (
      role: number,
    ): "system" | "user" | "assistant" => {
      switch (role) {
        case 1:
          return "user";
        case 2:
          return "assistant";
        default:
          return "system";
      }
    };

    // 獲取指定深度的所有待插入內容（世界書 + 自定義提示詞）
    // 按 order 排序，數字越小越先插入，顯示在越前面
    const getDepthInsertions = (depth: number): BuiltMessage[] => {
      const insertions: BuiltMessage[] = [];

      // 收集世界書深度條目（世界書沒有 order 屬性，默認為 0）
      const wiEntries = depthEntries
        .filter((e) => e.depth === depth)
        .map((e) => ({
          role: roleToMessageRole(e.role),
          content: e.content,
          identifier: `wiDepth_${depth}`,
          injected: true,
          order: 0, // 世界書默認 order 為 0
        }));

      // 收集自定義提示詞深度條目
      const customEntries = pendingDepthPrompts
        .filter((p) => p.depth === depth)
        .map((p) => ({
          role: p.role,
          content: p.content,
          identifier: p.identifier,
          injected: true,
          order: p.order,
        }));

      // 合併並按 order 排序（數字越小越先插入，顯示在越前面）
      const allEntries = [...wiEntries, ...customEntries].sort(
        (a, b) => a.order - b.order,
      );

      for (const entry of allEntries) {
        insertions.push({
          role: entry.role,
          content: entry.content,
          identifier: entry.identifier,
          injected: entry.injected,
        });
      }

      return insertions;
    };

    // 按深度插入所有內容
    // 深度 = 從聊天歷史末尾往前數的位置
    // depth=0 表示在所有消息之後
    // depth=1 表示在最後一條消息之前
    for (let i = 0; i < tempMessages.length; i++) {
      const depth = tempMessages.length - i;

      // 插入該深度的所有內容（世界書 + 自定義提示詞）
      const depthInsertions = getDepthInsertions(depth);
      if (depthInsertions.length > 0) {
        console.debug(
          `[PromptBuilder] Inserting ${depthInsertions.length} entries at depth=${depth}, before message index=${i}`,
        );
        builtMessages.push(...depthInsertions);
      }

      // 插入作者筆記區塊（包含 ↑AT、作者筆記、↓AT）
      if (depth === anDepth) {
        builtMessages.push(...buildAuthorsNoteBlock());
      }

      builtMessages.push(tempMessages[i]);
    }

    // 處理深度為 0 的插入（在所有消息之後，最接近 AI 回覆的位置）
    const depth0Insertions = getDepthInsertions(0);
    if (depth0Insertions.length > 0) {
      console.debug(
        `[PromptBuilder] Inserting ${depth0Insertions.length} entries at depth=0 (end of chat history)`,
      );
      builtMessages.push(...depth0Insertions);
    }

    // 如果作者筆記深度為 0，也在末尾插入
    if (anDepth === 0) {
      builtMessages.push(...buildAuthorsNoteBlock());
    }

    return { messages: builtMessages, tokens: usedTokens, wasTruncated };
  }

  /**
   * 構建節日資訊提示詞
   * 邏輯來源：原 Aguaphone1 的 aiService.refactored.ts buildTimeInfo 方法
   */
  private buildHolidayInfoPrompt(
    identifier: string,
    role: "system" | "user" | "assistant",
  ): BuiltMessage | null {
    const info = this.options.holidayInfo;
    if (!info) return null;

    const parts: string[] = [];

    // 農曆日期
    if (info.lunarDateString) {
      parts.push(`[農曆日期] 今天是農曆${info.lunarDateString}`);
      parts.push("⚠️ 請使用上述提供的農曆日期，不要自行推算農曆。");
    }

    // 今日節日
    if (info.todayHoliday) {
      const h = info.todayHoliday;
      parts.push(`[今日節日] ${h.name}`);
      parts.push(`節日祝福：${h.greeting}`);
      if (h.aiPrompt) {
        parts.push(`節日情境：${h.aiPrompt}`);
      }
      if (h.suggestionAmount) {
        parts.push(`建議紅包金額：${h.suggestionAmount}`);
        parts.push(
          '如果要發紅包，請使用 <transfer amount="金額">祝福語</transfer> 格式。',
        );
      }
    }

    // 即將到來的節日
    if (info.upcomingHolidays.length > 0) {
      const upcoming = info.upcomingHolidays
        .map((h) => `- ${h.name}（${h.greeting}）`)
        .join("\n");
      parts.push(`[即將到來的節日]\n${upcoming}`);
      parts.push("可以自然地提及即將到來的節日，營造期待感。");
    }

    if (parts.length === 0) return null;

    return {
      role,
      content: parts.join("\n"),
      identifier,
    };
  }

  /**
   * 構建健身資訊提示詞
   * 只有當角色是用戶的健身夥伴時才注入
   */
  private buildFitnessInfoPrompt(
    identifier: string,
    role: "system" | "user" | "assistant",
  ): BuiltMessage | null {
    const info = this.options.fitnessInfo;
    if (!info || !info.isPartner) return null;

    const parts: string[] = [];
    parts.push("[{{user}} 的健身資料]");

    if (info.todayWorkout) {
      parts.push(`今日訓練：${info.todayWorkout}`);
    }

    if (info.streak && info.streak > 0) {
      parts.push(`連續訓練天數：${info.streak} 天`);
    }

    if (info.weeklyProgress !== undefined) {
      parts.push(`本週目標完成度：${info.weeklyProgress}%`);
    }

    if (info.recentWeight) {
      const changeText =
        info.recentWeight.change > 0
          ? `+${info.recentWeight.change}`
          : String(info.recentWeight.change);
      parts.push(
        `最近體重：${info.recentWeight.current} kg (${changeText} kg)`,
      );
    }

    // 根據角色類型添加指引
    const roleText =
      info.partnerRole === "coach"
        ? "教練"
        : info.partnerRole === "cheerleader"
          ? "啦啦隊"
          : "訓練夥伴";

    const styleText =
      info.partnerStyle === "strict"
        ? "嚴格督促"
        : info.partnerStyle === "playful"
          ? "俏皮活潑"
          : "溫柔鼓勵";

    parts.push("");
    parts.push(
      `{{char}} 作為 {{user}} 的${roleText}，會以${styleText}的方式適時關心並鼓勵 {{user}} 的健身進度。`,
    );

    if (parts.length <= 2) return null;

    return {
      role,
      content: parts.join("\n"),
      identifier,
    };
  }
}

/**
 * 快速組裝提示詞
 */
export async function buildPrompt(
  options: PromptBuilderOptions,
): Promise<PromptBuildResult> {
  const builder = new PromptBuilder(options);
  return builder.build();
}
