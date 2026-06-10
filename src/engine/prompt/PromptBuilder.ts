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

import {
  buildBlockMemoryContent,
  GROUP_CHAT_BLOCK_HINT,
} from "@/data/defaultPrompts/block";
import type {
  CharacterAffinityConfig,
  ChatAffinityState,
  MetricValue,
} from "@/schemas/affinity";
import { computePercentage, computeStage } from "@/schemas/affinity";
import { ChatGameState } from "@/schemas/gameEconomy";
import { affinityTemplateService } from "@/services/AffinityTemplateService";
import { promptTemplateService } from "@/services/PromptTemplateService";
import type { NearbyPlace } from "@/services/WeatherService";
import type { BlockState } from "@/types/block";
import type {
  CharacterWorldSettings,
  StoredCharacter,
} from "@/types/character";
import type { ChatLocalPrompt, ChatMessage, ChatSettings } from "@/types/chat";
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
import { createStTemplateContext } from "@/services/StTemplateContextService";
import { cleanTTSTags } from "@/utils/ttsTagCleaner";
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
 * 「動態」提示詞 identifier 集合。
 *
 * 這些提示詞每次組裝時內容都可能變動（含當前時間/秒數、天氣、時區本地時間、
 * 節日日期等），若被放進 Anthropic 緩存前綴會導致前綴每輪都不同，
 * 造成「只寫入不讀取」。方案B 會把這些塊排到 cache_control 斷點「之後」、不緩存。
 *
 * 注意：此處列出的是「基礎名」，實際 identifier 可能帶 f2f/gc 前綴，
 * 因此判定時用 {@link isDynamicPromptIdentifier} 做包含式比對。
 */
export const DYNAMIC_PROMPT_IDENTIFIERS: readonly string[] = [
  "timeInfo",
  "f2fTimeInfo",
  "gcTimeInfo",
  "timeJump",
  "f2fTimeJump",
  "gcTimeJump",
  "weatherInfo",
  "f2fWeatherInfo",
  "gcWeatherInfo",
  "characterWorldContext",
  "f2fCharacterWorldContext",
  "gcCharacterWorldContext",
  "holidayInfo",
  "f2fHolidayInfo",
  "gcHolidayInfo",
];

/**
 * 判定某個（可能為複合）identifier 是否屬於「動態」提示詞。
 *
 * mergeConsecutiveMessages 會把連續同 role 的訊息合併並用 "+" 串接 identifier
 * （例如 "main+charDescription+timeInfo"）。為保險起見，只要複合 identifier 中
 * 任一段命中動態集合，就整塊視為動態。實務上方案B 已在 merge 階段阻止動態塊與
 * 穩定塊合併，因此這裡多為單一 identifier 比對。
 */
export function isDynamicPromptIdentifier(
  identifier: string | undefined,
): boolean {
  if (!identifier) return false;
  const parts = identifier.split("+");
  return parts.some((p) => DYNAMIC_PROMPT_IDENTIFIERS.includes(p.trim()));
}

/**
 * 待深度插入的提示詞
 */
interface PendingDepthPrompt {
  role: "system" | "user" | "assistant";
  content: string;
  identifier: string;
  name?: string;
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
  htmlTemplatePrompt?: string;
  /** Token 計數器 */
  tokenCounter?: (text: string) => Promise<number>;
  /** 提示詞管理器配置（可選，如不提供則使用默認順序） */
  promptManagerConfig?: PromptManagerConfig;
  /** 提示詞順序（可選，優先於 promptManagerConfig） */
  promptOrder?: PromptOrderEntry[];
  /** 聊天專屬提示詞開關覆蓋（稀疏：只包含與默認不同的狀態） */
  chatPromptToggles?: Record<string, boolean>;
  /** 聊天專屬提示詞條目 */
  chatLocalPrompts?: ChatLocalPrompt[];
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
  /** 天氣信息（用戶所在地） */
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
  /** 天氣信息（角色所在地） */
  charWeatherInfo?: {
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
  /** 第三人稱模式（面對面模式下，開啟時使用第三人稱，關閉時使用第一人稱）— 舊選項，保留相容 */
  thirdPersonMode?: boolean;
  /** {{char}} 敘事人稱：third=第三人稱(用名字)、first=第一人稱(我) */
  charNarrativePerson?: "first" | "third";
  /** {{user}} 敘事人稱：third=第三人稱(用名字)、second=第二人稱(你)、first=第一人稱(我) */
  userNarrativePerson?: "first" | "second" | "third";
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
  /** 最近的音樂分享事件（用於注入歌詞 Prompt） */
  recentMusicShareEvent?: {
    name: string;
    artist: string;
    lyrics?: string;
  };
  /** 飲食記錄（用於 {{foodLogs}} 宏） */
  foodLogs?: string;
  /** 書影記錄（用於 {{mediaLogs}} 宏） */
  mediaLogs?: string;
  /** 伴讀共讀記錄（書架 App 的共讀對話摘要） */
  companionReadingLogs?: string;
  /** 群聊模式 */
  groupChatMode?: boolean;
  /** 群聊成員列表（群聊模式時必填） */
  groupMembers?: Array<{
    characterId: string;
    name: string;
    nickname?: string;
    originalName?: string;
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
    sourceType: "summary" | "diary" | "event";
    content: string;
    score: number;
    createdAt: number;
  }>;
  /** 封鎖狀態（用於注入封鎖記憶提示詞） */
  blockState?: BlockState;
  /** 附近地點列表（由外部傳入，GPS 可用時才有值） */
  nearbyPlaces?: NearbyPlace[];
  /** 角色世界設定 */
  characterWorldSettings?: CharacterWorldSettings;
  /**
   * 進行中通話狀態（由外部從 phoneCallStore 注入）。
   * 只在普通聊天/面對面/群聊提示詞中使用，phoneCallMode=true 時忽略。
   */
  ongoingCallContext?: {
    /** 當前聊天的角色 / 群聊，是否就是通話對象 */
    withCurrentCharacter: boolean;
    /** 已通話秒數 */
    durationSeconds: number;
    /** 是否為視訊通話 */
    isVideo?: boolean;
  };
  /**
   * 在玩遊戲狀態（由 useGamePlayingDetector 觸發、ProactiveMessageService 注入）
   * 觸發 gamePlayingStatus marker，告知 AI user 正在玩什麼小遊戲。
   */
  gamePlayingContext?: {
    /** 遊戲中文名稱（如 "貪吃蛇"、"骰子（賭博）"） */
    gameName: string;
  };
}

/**
 * 將 Date 轉換為指定時區的本地時間字串（YYYY/MM/DD HH:MM）
 * 無效時區時回退至 UTC
 */
export function formatLocalTime(date: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("zh-TW", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  } catch {
    // 無效時區回退至 UTC
    const fmt = new Intl.DateTimeFormat("zh-TW", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? "00";
    return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
  }
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
    // 注意：{{lastUserMessage}} 只回傳用戶實際輸入的訊息，排除時間跳轉與小劇場提示
    const lastUserTurnMsgs = PromptBuilder.getLastUserTurnMessages(
      options.messages,
    ).filter((m) => m.is_user && !m.isTimetravel && m.sender !== "narrator");
    const lastUserMsg =
      lastUserTurnMsgs
        .map((m) => {
          // 若有引用回覆，在內容前加上引用標記
          let content = m.content;
          if (m.replyTo) {
            const repliedMsg = options.messages.find((r) => r.id === m.replyTo);
            if (repliedMsg) {
              const preview = repliedMsg.content
                .replace(/\[img:.*?\]/g, "[圖片]")
                .replace(/\[sticker:.*?\]/g, "[表情包]");
              const truncated =
                preview.length > 60 ? preview.substring(0, 60) + "…" : preview;
              const senderName = repliedMsg.is_user
                ? options.userName
                : repliedMsg.name || options.character.data.name;
              content = `[回覆 ${senderName}：「${truncated}」]\n${content}`;
            }
          }
          if (options.enableRealTimeAwareness !== false && m.createdAt) {
            return `${this.formatMsgTimeTag(m.createdAt)} ${content}`;
          }
          return content;
        })
        .join("\n") || "";
    const lastCharMsg =
      [...options.messages]
        .reverse()
        .find((m) => !m.is_user && !m.isTimetravel && m.sender !== "narrator")
        ?.content || "";
    // {{lastMessage}}：上一條 AI 回覆之後所有未完成一輪的訊息（含時間跳轉、用戶輸入、小劇場）
    const lastMsg =
      PromptBuilder.getLastUserTurnMessages(options.messages)
        .map((m) => this.formatMessageContentForMacro(m))
        .filter((s) => s.length > 0)
        .join("\n");

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
        foodLogs: options.foodLogs || "",
        mediaLogs: options.mediaLogs || "",
        companionReadingLogs: options.companionReadingLogs || "",
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
    // 注意：{{lastUserMessage}} 只回傳用戶實際輸入的訊息，排除時間跳轉與小劇場提示
    const lastUserTurnMsgs = PromptBuilder.getLastUserTurnMessages(
      options.messages,
    ).filter((m) => m.is_user && !m.isTimetravel && m.sender !== "narrator");
    const lastUserMsg =
      lastUserTurnMsgs
        .map((m) => {
          // 若有引用回覆，在內容前加上引用標記
          let content = m.content;
          if (m.replyTo) {
            const repliedMsg = options.messages.find((r) => r.id === m.replyTo);
            if (repliedMsg) {
              const preview = repliedMsg.content
                .replace(/\[img:.*?\]/g, "[圖片]")
                .replace(/\[sticker:.*?\]/g, "[表情包]");
              const truncated =
                preview.length > 60 ? preview.substring(0, 60) + "…" : preview;
              const senderName = repliedMsg.is_user
                ? options.userName
                : repliedMsg.name || options.character.data.name;
              content = `[回覆 ${senderName}：「${truncated}」]\n${content}`;
            }
          }
          if (options.enableRealTimeAwareness !== false && m.createdAt) {
            return `${this.formatMsgTimeTag(m.createdAt)} ${content}`;
          }
          return content;
        })
        .join("\n") || "";
    const lastCharMsg =
      [...options.messages]
        .reverse()
        .find((m) => !m.is_user && !m.isTimetravel && m.sender !== "narrator")
        ?.content || "";
    // {{lastMessage}}：上一條 AI 回覆之後所有未完成一輪的訊息（含時間跳轉、用戶輸入、小劇場）
    const lastMsg =
      PromptBuilder.getLastUserTurnMessages(options.messages)
        .map((m) => this.formatMessageContentForMacro(m))
        .filter((s) => s.length > 0)
        .join("\n");

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
        foodLogs: options.foodLogs || "",
        mediaLogs: options.mediaLogs || "",
        companionReadingLogs: options.companionReadingLogs || "",
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
   * 將訊息格式化為「給 AI 看的內容」——時間跳轉與小劇場會被包裝成系統指令格式，
   * 與 chat history 內呈現的形式一致。一般訊息直接回傳 content。
   */
  private static formatMessageContentForMacro(m: ChatMessage): string {
    if (m.isTimetravel) {
      const dest = m.timetravelContent || m.content;
      return `[場景與時間切換到:${dest}]`;
    }
    if (m.sender === "narrator" && (m.content || "").startsWith("小劇場：")) {
      const scenario = m.content.replace("小劇場：", "").trim();
      return `[場景指令] 接下來請按照以下劇情發展進行扮演：${scenario}`;
    }
    return m.content || "";
  }

  private formatMessageContentForMacro(m: ChatMessage): string {
    const content = PromptBuilder.formatMessageContentForMacro(m);
    const isSystemMsg = m.sender === "system" || m.sender === "narrator";
    if (
      this.options.enableRealTimeAwareness !== false &&
      !isSystemMsg &&
      m.createdAt
    ) {
      return `${this.formatMsgTimeTag(m.createdAt)} ${content}`;
    }
    return content;
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

      return this.applyChatPromptOverrides(baseOrder);
    }

    // 群聊模式：使用群聊專屬的提示詞順序
    if (this.options.groupChatMode) {
      if (this.options.promptManagerConfig?.groupChatPromptOrder) {
        return this.applyChatPromptOverrides(this.options.promptManagerConfig.groupChatPromptOrder);
      }
      return this.applyChatPromptOverrides([...DEFAULT_GROUP_CHAT_PROMPT_ORDER]);
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
        ongoingCallStatus: "f2fOngoingCallStatus",
        gamePlayingStatus: "f2fGamePlayingStatus",
        // 思考和格式
        thinkingGuide: "f2fThinkingGuide",
        forbiddenPatterns: "f2fForbiddenPatterns",
        formatRules: "f2fFormatRules",
        exampleScript: "f2fExampleScript",
        // 系統
        chatHistory: "f2fChatHistory",
        blockMemory: "f2fBlockMemory",
        authorsNote: "f2fAuthorsNote",
        finalInstructions: "f2fFinalInstructions",
        confirmLastOutput: "f2fConfirmLastOutput",
      };

      // 替換全局模式提示詞為面對面模式提示詞
      const mappedOrder = baseOrder.map((entry) => {
        if (globalToF2FMap[entry.identifier]) {
          return {
            ...entry,
            identifier: globalToF2FMap[entry.identifier],
          };
        }
        return entry;
      });
      return this.applyChatPromptOverrides(mappedOrder);
    }

    // 優先使用直接傳入的順序
    if (this.options.promptOrder) {
      return this.applyChatPromptOverrides(this.options.promptOrder);
    }
    // 其次使用 PromptManagerConfig
    if (this.options.promptManagerConfig) {
      const charId = this.options.character.id;
      const charConfig =
        this.options.promptManagerConfig.characterConfigs[charId];
      if (charConfig && charConfig.promptOrder.length > 0) {
        return this.applyChatPromptOverrides(charConfig.promptOrder);
      }
      return this.applyChatPromptOverrides(this.options.promptManagerConfig.globalPromptOrder);
    }
    // 默認順序
    return this.applyChatPromptOverrides(DEFAULT_PROMPT_ORDER);
  }

  private applyChatPromptOverrides(order: PromptOrderEntry[]): PromptOrderEntry[] {
    const toggles = this.options.chatPromptToggles ?? {};
    const overridden = order.map((entry) =>
      Object.prototype.hasOwnProperty.call(toggles, entry.identifier)
        ? { ...entry, enabled: toggles[entry.identifier] }
        : { ...entry },
    );

    const existingIds = new Set(overridden.map((entry) => entry.identifier));
    for (const prompt of this.options.chatLocalPrompts ?? []) {
      if (existingIds.has(prompt.id)) continue;
      overridden.push({ identifier: prompt.id, enabled: prompt.enabled });
      existingIds.add(prompt.id);
    }

    return overridden;
  }

  /**
   * 獲取提示詞定義
   * 優先順序：用戶自定義配置 > 硬編碼默認值
   */
  private getPromptDefinition(
    identifier: string,
  ): PromptDefinition | undefined {
    const chatPrompt = this.options.chatLocalPrompts?.find(
      (prompt) => prompt.id === identifier,
    );
    if (chatPrompt) {
      return {
        identifier: chatPrompt.id,
        name: chatPrompt.name,
        description: "聊天專屬提示詞",
        category: "custom",
        role: chatPrompt.role,
        content: chatPrompt.content,
        system_prompt: false,
        marker: false,
        injection_position: chatPrompt.injection_position,
        injection_depth: chatPrompt.injection_depth,
        injection_order: chatPrompt.injection_order,
        forbid_overrides: true,
        extension: false,
        injection_trigger: ["normal"],
        isEditable: true,
        isDeletable: true,
      };
    }

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
                name: msg.name || promptDef.name,
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
              postHistoryMessages.push({
                ...msg,
                name: msg.name || promptDef?.name,
              });
            } else {
              preHistoryMessages.push({
                ...msg,
                name: msg.name || promptDef?.name,
              });
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
      sourceMessageCount: number;
      includedMessageCount: number;
      strippedLastUserTurnCount: number;
    } = {
      messages: [],
      tokens: 0,
      wasTruncated: false,
      sourceMessageCount: 0,
      includedMessageCount: 0,
      strippedLastUserTurnCount: 0,
    };

    const isChatHistoryEnabled = enabledPrompts.some(
      (e) =>
        e.identifier === "chatHistory" ||
        e.identifier === "f2fChatHistory" ||
        e.identifier === "gcChatHistory",
    );
    let stripLastUserMessage = false;
    // 支持全局模式和面對面模式的 chatHistory
    if (isChatHistoryEnabled) {
      // 檢查是否啟用了「確認最終輸出」，如果是則從聊天歷史中移除最後一條用戶訊息
      stripLastUserMessage = enabledPrompts.some(
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
    //    聊天歷史前後加上 <Chat history> / </Chat history> 標籤，
    //    幫助 AI 清楚分辨「歷史對話」與其他系統提示
    builtMessages.push(...preHistoryMessages);
    if (chatMessages.messages.length > 0) {
      builtMessages.push({
        role: "system",
        content: "<Chat history>",
        identifier: "chatHistoryOpenTag",
      });
      builtMessages.push(...chatMessages.messages);
      builtMessages.push({
        role: "system",
        content: "</Chat history>",
        identifier: "chatHistoryCloseTag",
      });
    }
    builtMessages.push(...postHistoryMessages);

    // 🐛 調試：檢查各部分的消息數量
    console.group("📦 [PromptBuilder] 最終組裝調試");
    console.log("preHistoryMessages:", preHistoryMessages.length);
    console.log("chatMessages.messages:", chatMessages.messages.length);
    console.log("postHistoryMessages:", postHistoryMessages.length);
    console.log("pendingDepthPrompts:", pendingDepthPrompts.length);
    console.log("builtMessages 總數:", builtMessages.length);
    console.groupEnd();

    // 7. 合併連續相同 role 的訊息
    const mergedMessages = this.mergeConsecutiveMessages(builtMessages);

    return {
      messages: mergedMessages,
      tokenCount: totalTokens,
      worldInfoTokens,
      chatHistoryTokens,
      wasTruncated,
      chatHistoryBudget: {
        enabled: isChatHistoryEnabled,
        maxContextLength: settings.maxContextLength,
        maxResponseLength: settings.maxResponseLength,
        reservedResponseTokens: reservedTokens,
        fixedPromptTokens: totalTokens - chatHistoryTokens,
        maxHistoryTokens,
        chatHistoryTokens,
        sourceMessageCount: chatMessages.sourceMessageCount,
        includedMessageCount: chatMessages.includedMessageCount,
        wasTruncated: chatMessages.wasTruncated,
        strippedLastUserTurn: stripLastUserMessage,
        strippedLastUserTurnCount: chatMessages.strippedLastUserTurnCount,
      },
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
        } else if (
          current.role === "system" &&
          isDynamicPromptIdentifier(current.identifier) !==
            isDynamicPromptIdentifier(msg.identifier)
        ) {
          // 方案B：穩定 system 塊與動態 system 塊（時間/天氣/時區/節日）不可合併，
          // 否則動態內容會污染可緩存的穩定前綴，導致 Anthropic 緩存「只寫不讀」。
          merged.push(current);
          current = { ...msg };
        } else {
          // 合併內容
          current.content = current.content + "\n\n" + msg.content;
          // 合併 identifier（用於調試）
          if (current.identifier && msg.identifier) {
            current.identifier = current.identifier + "+" + msg.identifier;
          }
          // 保留圖片附件（後者優先，符合 confirmLastOutput 通常在末尾的語義）
          if (msg.imageData) {
            current.imageData = msg.imageData;
            current.imageMimeType = msg.imageMimeType ?? current.imageMimeType;
            current.imageCaption = msg.imageCaption ?? current.imageCaption;
            current.imagePrompt = msg.imagePrompt ?? current.imagePrompt;
          } else if (!current.imageData && msg.imageMimeType) {
            current.imageMimeType = msg.imageMimeType;
            current.imageCaption = msg.imageCaption ?? current.imageCaption;
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
      case "phoneCallUserSecrets":
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
      case "phoneCallPowerDynamic":
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
      case "gcCharDescription": {
        const rawDesc = character.data.description || '';
        if (!rawDesc) return null;
        // 若 promptDef.content 有自訂模板（含 {{charDescription}} 等宏），優先使用
        // 否則 fallback 到直接輸出角色卡 description
        const descTemplate = promptDef?.content?.trim()
          ? promptDef.content
          : rawDesc;
        const desc = await this.macroEngine.substitute(descTemplate);
        return desc ? { role: getRole(), content: desc, identifier } : null;
      }

      case "charPersonality":
      case "f2fCharPersonality":
      case "gcCharPersonality": {
        const rawPersonality = character.data.personality || '';
        if (!rawPersonality) return null;
        // 若 promptDef.content 有自訂模板，優先使用；否則用預設格式
        const personalityTemplate = promptDef?.content?.trim()
          ? promptDef.content
          : `${character.data.name}'s personality: {{charPersonality}}`;
        const personality = await this.macroEngine.substitute(personalityTemplate);
        return personality ? { role: getRole(), content: personality, identifier } : null;
      }

      case "scenario":
      case "f2fScenario":
      case "gcScenario": {
        const rawScenario = character.data.scenario || '';
        if (!rawScenario) return null;
        // 若 promptDef.content 有自訂模板，優先使用；否則用預設格式
        const scenarioTemplate = promptDef?.content?.trim()
          ? promptDef.content
          : `Scenario: {{charScenario}}`;
        const scenario = await this.macroEngine.substitute(scenarioTemplate);
        return scenario ? { role: getRole(), content: scenario, identifier } : null;
      }

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
            const lastMsgWithImage = [...lastUserTurnMsgs]
              .reverse()
              .find((m) => (m.imageData || m.imageUrl) && m.imageMimeType);
            const lastImageData =
              lastMsgWithImage?.imageData || lastMsgWithImage?.imageUrl;
            return {
              role: getRole(),
              content: substituted,
              identifier,
              imageData: lastImageData,
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

          const msgImageData = msg.imageData || msg.imageUrl;

          if (msgImageData && msg.imageMimeType) {
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
            imageData: msgImageData,
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
          const content = `[時間跳轉]\n當故事需要時間跳轉時（如「兩個月後」「三天後」），在 </content> 之後輸出：\n<time-jump datetime="YYYY-MM-DDTHH:mm" reason="跳轉原因"/>\n例如：<time-jump datetime="${currentDatetime}" reason="當前時間點"/>\n此標籤會自動更新故事時間軸，之後的時間感知都會以新時間為基準。`;
          return { role: getRole(), content, identifier };
        }

      case "weatherInfo":
      case "f2fWeatherInfo":
      case "gcWeatherInfo":
      case "phoneCallWeatherInfo": { // 天氣信息
        const hasCharLocation = !!this.options.characterWorldSettings?.location?.trim();
        const isPhoneCallWeather = identifier === "phoneCallWeatherInfo";
        if (!this.options.weatherInfo && !this.options.charWeatherInfo && hasCharLocation) return null;
        const sections: string[] = [];
        const userName = this.options.userName || "{{user}}";
        const charName = this.options.character.data.name || this.options.character.nickname || "{{char}}";
        if (this.options.weatherInfo) {
          sections.push(this.formatWeatherBlock(`${userName} 所在地天氣`, this.options.weatherInfo));
          // 附近地點（GPS 可用時附加，無資料時完全省略）
          const nearby = this.options.nearbyPlaces;
          if (nearby && nearby.length > 0) {
            sections[sections.length - 1] += `\n[附近地點]${nearby.map((p) => `${p.type},${p.distance}m,${p.name}`).join("|")}`;
          }
        }
        if (this.options.charWeatherInfo) {
          sections.push(this.formatWeatherBlock(`${charName} 所在地天氣`, this.options.charWeatherInfo));
        }
        // 角色無所在地時，提示 AI 推測並輸出 char-location 標籤。
        // 電話模式嚴格要求 JSON 陣列輸出，不能混入 </content> 或 <char-location> 類標籤指令。
        if (!isPhoneCallWeather) {
          if (!hasCharLocation) {
            sections.push(
              `[${charName} 所在地未知]\n` +
              `系統尚未記錄 ${charName} 的所在地。請根據以下優先級推測：\n` +
              `1. 對話紀錄中提及的地點（優先級最高）\n` +
              `2. 角色描述、設定中暗示的地點\n` +
              `推測出後，在 </content> 之後輸出：\n` +
              `<char-location location="城市名, 地區"/>\n` +
              `例如：<char-location location="東京, 日本"/>\n` +
              `注意：location 值應為可搜尋天氣的城市名稱（英文或中文皆可）。`,
            );
          } else {
            // 已有所在地，但角色可能因劇情而移動
            sections.push(
              `如果 ${charName} 在對話中提到搬家、旅行、出差等位置變化，` +
              `請在 </content> 之後輸出：<char-location location="新城市名, 地區"/> 以更新所在地。`,
            );
          }
        }
        const weatherContent = sections.join("\n\n");
        if (promptDef?.content) {
          const content = await this.macroEngine.substitute(
            promptDef.content.replace("{{weatherInfo}}", weatherContent),
          );
          return content ? { role: getRole(), content, identifier } : null;
        }
        return { role: getRole(), content: weatherContent, identifier };
      }

      case "holidayInfo":
      case "f2fHolidayInfo":
      case "gcHolidayInfo":
        return this.buildHolidayInfoPrompt(identifier, getRole());

      case "characterWorldContext":
      case "f2fCharacterWorldContext":
      case "gcCharacterWorldContext": {
        // 角色世界設定（僅注入所在地與時區，天氣已移至 weatherInfo 統一處理）
        const ws = this.options.characterWorldSettings;
        if (!ws) return null;
        const charName =
          this.options.character.data.name ||
          this.options.character.nickname ||
          "{{char}}";
        const lines: string[] = [];
        if (ws.location?.trim()) {
          lines.push(`所在地：${ws.location.trim()}`);
        }
        if (ws.timezone?.trim()) {
          const now = this.options.fakeTimeOverride ?? new Date();
          const localTime = formatLocalTime(now, ws.timezone.trim());
          lines.push(`本地時間：${localTime}（${ws.timezone.trim()}）`);
        }
        if (lines.length === 0) return null;
        const content = `[${charName}所在地情境]\n${lines.join("\n")}`;
        return { role: getRole(), content, identifier };
      }

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

          // 如果有最近的音樂分享事件，附加音樂分享 Prompt
          if (this.options.recentMusicShareEvent) {
            const musicPrompt = promptTemplateService.renderMusicShareEvent(
              this.options.recentMusicShareEvent.name,
              this.options.recentMusicShareEvent.artist,
              this.options.recentMusicShareEvent.lyrics,
            );
            if (musicPrompt) {
              content += "\n\n" + musicPrompt;
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
        if (!this.options.foodLogs) return null;
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
        }
        return null;

      case "mediaLogs":
      case "f2fMediaLogs":
      case "gcMediaLogs":
        // 書影記錄 + 伴讀共讀記錄（透過 {{mediaLogs}} / {{companionReadingLogs}} 宏替換）
        if (!this.options.mediaLogs && !this.options.companionReadingLogs) return null;
        if (promptDef && promptDef.content) {
          const content = await this.macroEngine.substitute(promptDef.content);
          return content ? { role: getRole(), content, identifier } : null;
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
        if (
          this.options.vectorMemories &&
          this.options.vectorMemories.length > 0
        ) {
          // 過濾掉已在時間排序總結中的條目（以 sourceId 去重）
          const summaryIds = new Set(
            this.options.summaries?.map((s) => s.id) ?? [],
          );
          const uniqueMemories = this.options.vectorMemories.filter(
            (m) => !summaryIds.has(m.sourceId),
          );
          if (uniqueMemories.length > 0) {
            const memories = uniqueMemories
              .map((m, i) => {
                const sourceLabel =
                  m.sourceType === "summary" ? "總結" : "日記";
                return `【記憶 ${i + 1}】(相似度: ${m.score.toFixed(2)}, 來源: ${sourceLabel})\n${m.content}`;
              })
              .join("\n\n");
            parts.push(
              `[語義記憶檢索]\n以下是與當前對話語義相關的歷史記憶片段：\n\n${memories}`,
            );
          }
        }

        // 2. 時間排序的總結（最近的基礎記憶，放在下面更接近當前對話）
        if (this.options.summaries && this.options.summaries.length > 0) {
          const summaries = this.options.summaries
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((s, i) => `【總結 ${i + 1}】\n${s.content}`)
            .join("\n\n");
          parts.push(
            `[對話歷史總結]\n以下是之前對話的總結，請參考這些內容保持對話的連貫性：\n\n${summaries}`,
          );
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

      case "gamePlayingStatus":
      case "f2fGamePlayingStatus":
      case "gcGamePlayingStatus": {
        // 在玩遊戲狀態（marker，只有偵測到 user 在玩遊戲才發送）
        const gctx = this.options.gamePlayingContext;
        if (!gctx) return null;
        const raw = `<game_playing_status>
🎮 {{user}} 目前正在玩「${gctx.gameName}」這個小遊戲，已經玩了一段時間了。

你可以：
- 自然地問候對方在玩什麼、玩得如何
- 根據你自己的人設展示「自己玩過這個遊戲的成績或經驗」（可吹噓、抱怨、或想跟對方比較）
- 不要明說你是因為偵測到用戶在玩遊戲才傳訊，要像剛好想到一樣自然
- 不要在訊息中真的列出冰冷的數字統計，而是用敘事方式提及自己的印象與感受
</game_playing_status>`;
        const content = await this.macroEngine.substitute(raw);
        return content ? { role: getRole(), content, identifier } : null;
      }

      case "ongoingCallStatus":
      case "f2fOngoingCallStatus":
      case "gcOngoingCallStatus": {
        // 進行中通話狀態（marker，只有通話進行中才發送）
        // 電話模式本身已透過 phoneCallMode 旗標知道，不重複
        if (this.options.phoneCallMode) return null;
        const ctx = this.options.ongoingCallContext;
        if (!ctx) return null;
        const mins = Math.floor(ctx.durationSeconds / 60);
        const secs = ctx.durationSeconds % 60;
        const durationText =
          mins > 0 ? `${mins} 分 ${secs} 秒` : `${secs} 秒`;
        const callKind = ctx.isVideo ? "視訊通話" : "通話";
        let raw: string;
        if (ctx.withCurrentCharacter) {
          raw = `<ongoing_call_status>
⚠️ 你 ({{char}}) 目前正在和 {{user}} ${callKind}中（已${callKind} ${durationText}）。
如果此時出現來自 {{user}} 的文字訊息，代表他在${callKind}中同時用訊息傳東西給你，請以「正在${callKind}中的你」的立場回應，不要表現得像不知道你們正在講電話，也不要再主動撥打電話給他。
</ongoing_call_status>`;
        } else {
          raw = `<ongoing_call_status>
📞 {{user}} 目前正在${callKind}中（已${callKind} ${durationText}），可能無法立即回覆文字訊息。
</ongoing_call_status>`;
        }
        const content = await this.macroEngine.substitute(raw);
        return content ? { role: getRole(), content, identifier } : null;
      }

      // ===== 人稱模式（面對面模式專用 marker） =====
      case "f2fNarrativePerson": {
        const charPerson = this.options.charNarrativePerson ?? (this.options.thirdPersonMode ? "third" : "first");
        const userPerson =
          charPerson === "first" && this.options.userNarrativePerson === "first"
            ? "second"
            : (this.options.userNarrativePerson ?? "second");

        const charRule =
          charPerson === "third"
            ? "{{char}} 用第三人稱：敘述以 {{char}} 的名字作主語；對話（「」內）仍可自稱「我」。"
            : "{{char}} 用第一人稱：動作、心理與對話都以「我」出發。";
        const userRule =
          userPerson === "third"
            ? "{{user}} 用第三人稱：敘述以 {{user}} 的名字稱呼用戶。"
            : userPerson === "first"
              ? "{{user}} 用第一人稱：敘述以「我」稱呼用戶；避免讓 {{char}} 也用「我」作敘述主語。"
              : "{{user}} 用第二人稱：敘述以「你」稱呼用戶。";
        const positiveExample =
          charPerson === "third"
            ? userPerson === "third"
              ? "✅ {{char}}走到{{user}}身邊坐下。「今天很累吧？」{{char}}摸了摸{{user}}的頭。"
              : userPerson === "first"
                ? "✅ {{char}}走到我身邊坐下。「今天很累吧？」{{char}}摸了摸我的頭。"
                : "✅ {{char}}走到你身邊坐下。「今天很累吧？」{{char}}摸了摸你的頭。"
            : userPerson === "third"
              ? "✅ *走到{{user}}身邊坐下*「今天很累吧？」*摸摸{{user}}的頭*"
              : "✅ *走到你身邊坐下*「今天很累吧？」*摸摸你的頭*";
        const negativeExample =
          charPerson === "third"
            ? "❌ *走到你身邊坐下*「今天很累吧？」*摸摸你的頭*"
            : "❌ {{char}}走到{{user}}身邊坐下。{{char}}摸了摸{{user}}的頭。";

        const content = await this.macroEngine.substitute(
          `<narrative_person_mode>
<{{char}}人稱>
模式：${charPerson === "third" ? "第三人稱" : "第一人稱"}
${charRule}
</{{char}}人稱>

<{{user}}人稱>
模式：${userPerson === "third" ? "第三人稱" : userPerson === "first" ? "第一人稱" : "第二人稱"}
${userRule}
</{{user}}人稱>

${positiveExample}
${negativeExample}
</narrative_person_mode>`,
        );
        return content ? { role: getRole(), content, identifier } : null;
      }

      // ===== 健身資訊模塊 =====
      case "fitnessInfo":
      case "f2fFitnessInfo":
      case "gcFitnessInfo":
        return this.buildFitnessInfoPrompt(identifier, getRole());

      // ===== 封鎖記憶模塊 =====
      case "blockMemory":
      case "f2fBlockMemory":
      case "gcBlockMemory":
        return this.buildBlockMemoryPrompt(identifier, getRole());

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

      const canonicalName = (member.nickname || member.name || "").trim();
      const originalName = (member.originalName || member.name || "").trim();
      const identityNote =
        originalName && originalName !== canonicalName
          ? `（角色本名：${originalName}）`
          : "";

      const tagStr = tags.length > 0 ? ` ${tags.join(" ")}` : "";
      parts.push(`【${canonicalName}】${identityNote}${tagStr}`);

      if (member.personality) {
        parts.push(`  性格：${member.personality}`);
      }
      if (member.description) {
        parts.push(`  描述：${member.description}`);
      }
      parts.push("");
    }

    parts.push(
      `⚠️ 在所有 <msg name="...">、<recall name="...">、<dm name="...">、<group-action actor="..." target="..."> 等輸出欄位中，只能使用上方【】內的名字，必須完全一致。`,
    );
    parts.push(
      `⚠️ 禁止把名字改回角色本名，禁止為名字追加年齡、括號、前後綴、暱稱說明或任何自創變體。`,
    );

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

    const names = groupMembers.map((m) => (m.nickname || m.name || "").trim());
    const content = `<group_character_names>
🎭 本次群聊共有 ${names.length} 位角色：${names.join("、")}
⚠️ 你必須扮演以上所有角色，每個角色都必須有機會發言，不能遺漏任何一位！
⚠️ 所有輸出標籤中的 name / actor / target 只能使用以上名字，禁止擅自改名或追加年齡等描述！
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
   * 支持 getvar('stat_data.角色名.變量名') / getvar('display_data.角色名.變量名') /
   * getvar('delta_data.角色名.變量名') 語法引用 MVU 視圖變量，
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
            const blockPreview =
              block.length > 150 ? block.substring(0, 150) + "..." : block;
            console.warn(
              `[PromptBuilder] 世界書 EJS 語法錯誤 ${label} 區塊 #${failedBlocks}:`,
              (e as Error).message,
              "\n區塊內容:",
              blockPreview,
            );
          }
        }
      }
      if (failedBlocks > 5) {
        console.warn(
          `[PromptBuilder] ${label} 共有 ${failedBlocks} 個 EJS 區塊有語法問題`,
        );
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
      return content.replace(
        /(<%[-_=]?)(\s*[\s\S]*?)([-_]?%>)/g,
        (_match, open, body, close) => {
          return open + body.replace(/\bawait\s+/g, "") + close;
        },
      );
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
   * 兼容酒馆 stat_data / display_data / delta_data.角色名.變量名 路徑格式。
   */
  private buildWiEjsContext(): Record<string, unknown> {
    const { affinityConfig, affinityState, character, userName } = this.options;
    const shared = createStTemplateContext({
      affinityConfig,
      affinityState,
      charName: character.data.name,
      userName,
      messages: this.options.messages,
    });

    return {
      ...shared,
      getchr: () => "",
      getEnabledWorldInfoEntries: () => [],
      getWorldInfoActivatedEntries: () => [],
      _,
    };
  }

  /**
   * 組裝主提示詞 (Main Prompt)
   * 這是系統提示詞的第一部分，不包含世界書
   */
  private async buildMainPrompt(): Promise<string> {
    const { character, systemPromptOverride, htmlTemplatePrompt } = this.options;

    // 主提示詞優先順序：覆蓋 > 角色設定 > 默認
    const mainPrompt =
      systemPromptOverride ||
      character.data.system_prompt ||
      DEFAULT_PROMPTS.main;

    const parts = [mainPrompt, htmlTemplatePrompt]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part));

    if (!parts.length) return "";
    return await this.macroEngine.substitute(parts.join("\n\n"));
  }

  /**
   * 組裝 MiniMax TTS 語氣標籤提示詞
   * 僅在 minimaxTTSEnabled 時注入
   */
  private buildMinimaxTTSPrompt(): BuiltMessage | null {
    if (!this.options.minimaxTTSEnabled) return null;

    const content = `【語音合成標記規則】
你的對話文字將被語音合成引擎朗讀。只有角色真正「說出口」的台詞需要加語音標記，敘述、動作、心理活動、場景描寫都不要加標記。

請以「自然、克制、像真人說話」為原則，不要為了表演感而過度插入標記。

1. 語氣標籤——直接寫在對話文字中自然觸發的位置，只在確實需要時使用：
(laughs)笑聲 (chuckle)輕笑 (sighs)嘆氣 (gasps)倒吸氣 (breath)呼吸 (emm)猶豫嗯 (crying)哭泣 (coughs)咳嗽 (sniffs)抽鼻 (pant)喘氣 (humming)哼唱 (groans)呻吟

使用原則：
- 一句話通常0~1個，最多1~2個
- 只在笑、喘、停頓猶豫、情緒明顯波動時才加
- 普通對話不要硬塞 (laughs) 或 (sighs)
- 標籤要貼近觸發位置，不要全部堆在句首或句尾

2. 停頓——<#秒數#>，範圍0.01~99.99，用於語句間自然停頓

使用原則：
- 只在沉默、遲疑、轉折、哽住、刻意停一下時使用
- 短停頓常用 0.2~0.6，明顯停頓常用 0.8~1.8
- 不要每句都加停頓

3. 情緒與語速——放在每句對話引號關閉前的最末尾：
[emotion=情緒] 或 [emotion=情緒;speed=語速]
emotion 可選：auto/happy/sad/angry/fearful/disgusted/surprised/calm/fluent/neutral
speed：0.5~2.0，正常時省略

情緒選擇原則：
- 情緒明確時再指定；不明確時用 neutral 或 auto
- 溫柔安撫、平靜聊天、日常敘述優先用 calm 或 neutral
- 開心不一定等於大笑，難過也不一定每句都很慢
- 除非文本真的強烈，否則避免動不動 angry、surprised、crying

示例：
她眼睛一亮。"真的嗎(laughs)？太好了！[emotion=happy]"
他沉默了很久。"算了(sighs)……<#1.2#>有些事強求不來。[emotion=sad;speed=0.85]"
她把聲音放輕。"沒事的，慢慢來，我在聽。[emotion=calm]"
他停了一下，像是在整理措辭。"我不是不在乎，只是不知道該怎麼說。[emotion=neutral]"

硬性要求：
- [emotion=...] 始終放在引號關閉前的最末尾
- 一段台詞最多只放一個 [emotion=...]
- 敘述旁白正常寫，不加任何標記
- 沒有明顯情緒時，寧可少標，也不要亂標
- 優先保證台詞自然，其次才是語音表演效果`;

    return {
      role: "system",
      content,
      identifier: "minimaxTTS",
    };
  }

  /**
   * TTS 關閉時只清理送入模型的歷史內容，不改動原始聊天記錄。
   */
  private getMessagesForPromptHistory(): ChatMessage[] {
    if (this.options.minimaxTTSEnabled) return this.options.messages;

    return this.options.messages.map((msg) => {
      const content = cleanTTSTags(msg.content);

      if (content === msg.content) {
        return msg;
      }

      return {
        ...msg,
        content,
      };
    });
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
    sourceMessageCount: number;
    includedMessageCount: number;
    strippedLastUserTurnCount: number;
  }> {
    const { authorsNote, character } = this.options;
    const rawMessages = this.getMessagesForPromptHistory();

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
        // 面對面模式使用不易被模型模仿的格式，避免模型把 [time:...] 輸出到正文
        if (this.options.faceToFaceMode) {
          msgContent = `<!--t:${this.formatMsgTimeTag(msg.createdAt)}-->${msgContent}`;
        } else {
          msgContent = `${this.formatMsgTimeTag(msg.createdAt)} ${msgContent}`;
        }
      }

      // 被角色封鎖期間用戶發送的訊息：加上提示讓 AI 知道不該看見
      if (msg.sentWhileBlocked && msg.is_user) {
        msgContent = `${msgContent}\n（正在被封鎖中，${character.data.name}不該看見此內容）`;
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
          name: undefined as string | undefined,
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
          name: p.name,
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
          name: entry.name,
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

    return {
      messages: builtMessages,
      tokens: usedTokens,
      wasTruncated,
      sourceMessageCount: messages.length,
      includedMessageCount: tempMessages.length,
      strippedLastUserTurnCount: rawMessages.length - messages.length,
    };
  }

  /**
   * 格式化單一天氣區塊
   */
  private formatWeatherBlock(
    label: string,
    w: NonNullable<PromptBuilderOptions["weatherInfo"]>,
  ): string {
    let block = `[${label}]\n地點：${w.location}\n天氣：${w.condition}\n溫度：${w.temperature}°C（體感 ${w.feelsLike}°C）\n濕度：${w.humidity}%`;
    if (w.windSpeed !== undefined) {
      block += `\n風速：${w.windSpeed} km/h`;
      if (w.windDir) block += `，風向 ${w.windDir}`;
    }
    if (w.uv !== undefined) {
      block += `\n紫外線指數：${w.uv}`;
    }
    return block;
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

  /**
   * 建構封鎖記憶提示詞
   * 當 Chat 存在封鎖狀態或封鎖歷史時，注入 AI 上下文
   */
  private async buildBlockMemoryPrompt(
      identifier: string,
      role: "system" | "user" | "assistant",
    ): Promise<BuiltMessage | null> {
      const blockState = this.options.blockState;
      if (!blockState || blockState.status === "none") {
        return null;
      }

      // 收集封鎖期間用戶的獨白訊息
      const monologueMessages = this.options.messages
        .filter((m) => m.sentWhileBlocked && m.is_user)
        .map((m) => ({ content: m.content, createdAt: m.createdAt }));

      const content = buildBlockMemoryContent(blockState, monologueMessages);
      if (!content) return null;

      // 群聊場景注入額外封鎖提示
      let finalContent = this.options.groupChatMode
        ? content + "\n" + GROUP_CHAT_BLOCK_HINT
        : content;

      // 替換宏（{{user}}、{{char}} 等）
      finalContent = await this.macroEngine.substitute(finalContent);

      return {
        role,
        content: finalContent,
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
