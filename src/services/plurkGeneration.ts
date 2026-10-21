/**
 * 噗浪生成：角色發噗、各角色的聊天記錄上下文、PEEK 手機摘要
 * （從 QZoneScreen 搬出來，AI 導演的自動模式也會用）
 */

import { OpenAICompatibleClient, type APIMessage } from "@/api/OpenAICompatible";
import { useStreamingWindow, type PromptDebugMessage } from "@/composables/useStreamingWindow";
import { getDatabase } from "@/db/database";
import { loadMessages } from "@/storage/chatMessageStorage";
import { useCharactersStore } from "@/stores/characters";
import { usePeekPhoneStore } from "@/stores/peekPhone";
import { usePromptManagerStore } from "@/stores/promptManager";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { buildSocialPostsText } from "@/utils/plurkFormat";

export interface ChatContextOptions {
  enabled: boolean;
  count: number;
}

/** 讀聊天記錄的設定（AI 導演的「記得私聊」） */
export function getChatContextOptions(): ChatContextOptions {
  const director = useQzoneStore().directorConfig;
  return { enabled: director.memoryEnabled, count: director.memoryCount };
}

/**
 * 構建每個角色各自的聊天記錄上下文（從 IndexedDB 按 characterId 查詢）
 */
export async function buildChatContextForCharacters(
  characterIds: string[],
  opts: ChatContextOptions,
): Promise<Record<string, string>> {
  if (!opts.enabled || characterIds.length === 0) return {};

  const charactersStore = useCharactersStore();
  const userStore = useUserStore();
  const qzoneStore = useQzoneStore();
  const result: Record<string, string> = {};

  try {
    const db = await getDatabase();

    for (const charId of characterIds) {
      // 用 by-character 索引查該角色的所有聊天
      const chats = (await db.getAllFromIndex("chats", "by-character", charId)) as Chat[];
      if (!chats || chats.length === 0) continue;

      // 按 updatedAt 降序排列，取最新的聊天
      chats.sort((a: Chat, b: Chat) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const latestChat = chats[0];

      // v24：從 chatMessages 表載入訊息
      const chatMsgs = await loadMessages(latestChat.id);
      if (chatMsgs.length === 0) continue;

      // 取最近 N 條消息
      const recentMsgs = chatMsgs.slice(-opts.count);
      const charName =
        charactersStore.characters.find((c) => c.id === charId)?.data?.name || latestChat.name || "角色";
      const chatLockedPersonaId = latestChat.metadata?.personaOverride?.personaId ?? null;
      const resolvedPersonaId = userStore.resolvePersonaForChat(charId, chatLockedPersonaId);
      const privateChatPersona = resolvedPersonaId
        ? userStore.personas.find((p) => p.id === resolvedPersonaId)
        : null;
      const privateChatUserName =
        privateChatPersona?.name ||
        recentMsgs.find((msg) => msg.sender === "user" && msg.name)?.name ||
        userStore.currentPersona?.name ||
        qzoneStore.settings.nickname ||
        "私聊對象";

      const messageLines = recentMsgs
        .map((msg) => {
          const role = msg.sender === "user" ? privateChatUserName : msg.name || charName;
          return `${role}: ${msg.content}`;
        })
        .join("\n");

      const contextStr = [
        `【角色】${charName}`,
        `【此角色的私聊 {{user}}】${privateChatUserName}`,
        `【身份邊界】${privateChatUserName} 只代表 ${charName} 最近私聊中的 {{user}}；不要把噗浪發文人、留言者或被回覆者自動當成這個私聊對象，除非名稱與身份資訊明確相同。`,
        "【最近私聊內容】",
        messageLines,
      ]
        .filter(Boolean)
        .join("\n");

      if (contextStr) {
        result[charId] = contextStr;
      }
    }
  } catch (e) {
    console.warn("[PlurkGeneration] 讀取角色聊天記錄失敗:", e);
  }

  return result;
}

/** 參考角色手機：今日行程、最近備忘、最近日記，每段最多 200 字 */
export async function buildPeekSummary(characterId: string): Promise<string> {
  try {
    const db = await getDatabase();
    const chats = (await db.getAllFromIndex("chats", "by-character", characterId)) as Chat[];
    const chat = chats
      .filter((c) => !c.isGroupChat)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (!chat) return "";
    const data = await usePeekPhoneStore().loadFromIDB(characterId, chat.id);
    if (!data) return "";
    const clip = (s: string) => (s.length > 200 ? `${s.slice(0, 200)}…` : s);
    const parts: string[] = [];
    const schedule = (data.schedule ?? []).map((s) => `${s.time} ${s.title}`).join("、");
    if (schedule) parts.push(`今日行程：${clip(schedule)}`);
    const memos = [...(data.memos ?? [])]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 3)
      .map((m) => m.content)
      .join("／");
    if (memos) parts.push(`備忘：${clip(memos)}`);
    const diary = [...(data.diary ?? [])]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 2)
      .map((d) => `${d.date} ${d.content}`)
      .join("／");
    if (diary) parts.push(`日記：${clip(diary)}`);
    return parts.join("\n");
  } catch (err) {
    console.warn("[PlurkGeneration] 讀取 PEEK 資料失敗:", err);
    return "";
  }
}

export interface GenerateCharacterPlurkOptions {
  /** 補發不在時的噗：這則噗「發在」什麼時間 */
  postedAt?: number;
  /** 參考角色手機的摘要 */
  peekSummary?: string;
  chatContext?: ChatContextOptions;
  /** 背景生成（自動模式）：不開串流視窗 */
  background?: boolean;
}

/** 生成一則角色噗文的原始輸出（<plurk> 區塊），失敗回傳 null */
export async function generateCharacterPlurk(
  character: StoredCharacter,
  opts: GenerateCharacterPlurkOptions = {},
): Promise<string | null> {
  const settingsStore = useSettingsStore();
  const promptManagerStore = usePromptManagerStore();
  const qzoneStore = useQzoneStore();
  const userStore = useUserStore();
  const taskConfig = settingsStore.getAPIForTask("plurkPost");

  if (!taskConfig.api.endpoint || !taskConfig.api.apiKey || !taskConfig.api.model) {
    console.warn("API 未配置");
    return null;
  }

  const charName = character.nickname || character.data?.name || "角色";
  const charPersonality = character.data?.personality || "";
  const charDescription = character.data?.description || "";

  // 該角色最近的私聊內容
  let recentMessages = "";
  const chatContext = (
    await buildChatContextForCharacters([character.id], opts.chatContext ?? getChatContextOptions())
  )[character.id];
  if (chatContext) {
    recentMessages = chatContext.split("【最近私聊內容】\n")[1] ?? chatContext;
  }
  const recentPosts = buildSocialPostsText(qzoneStore.posts, [character.id]);

  const macros: Record<string, string> = {
    char: charName,
    user: userStore.currentName || qzoneStore.settings.nickname || "我",
    charDescription: charDescription || "（無）",
    charPersonality: charPersonality || "（無）",
    recentMessages: recentMessages || "（無）",
    recentPosts,
  };
  const usedMacros = new Set<string>();

  const rawMessages: APIMessage[] = [];
  const promptDebugMessages: PromptDebugMessage[] = [];
  const addMessage = (role: "system" | "user" | "assistant", content: string, name: string, identifier?: string) => {
    rawMessages.push({ role, content });
    promptDebugMessages.push({ role, content, name, identifier });
  };

  // 按順序組裝啟用的噗浪發文提示詞
  let hasUserInstruction = false;
  for (const orderEntry of promptManagerStore.plurkPostPromptOrder) {
    if (!orderEntry.enabled) continue;
    const prompt = promptManagerStore.plurkPostPrompts.find((p) => p.identifier === orderEntry.identifier);
    if (!prompt?.content) continue;
    const content = prompt.content.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
      const key = Object.keys(macros).find((k) => k.toLowerCase() === name.toLowerCase());
      if (!key) return match;
      usedMacros.add(key);
      return macros[key];
    });
    const role = prompt.role === "user" ? "user" : "system";
    if (role === "user") hasUserInstruction = true;
    addMessage(role, content, prompt.name, prompt.identifier);
  }

  // 使用者刪掉或停用了對應條目時，補上必要的上下文
  if (!usedMacros.has("charDescription") && !usedMacros.has("charPersonality")) {
    addMessage(
      "system",
      [
        "【角色資訊】",
        `角色名稱：${charName}`,
        charDescription && `角色描述：${charDescription}`,
        charPersonality && `角色性格：${charPersonality}`,
      ]
        .filter(Boolean)
        .join("\n"),
      "噗浪角色資訊",
      "qzoneCharacterInfo",
    );
  }
  if (!usedMacros.has("recentMessages") && recentMessages) {
    addMessage(
      "system",
      `以下是你與用戶最近的對話記錄，可以參考但不必完全依賴：\n${recentMessages}`,
      "噗浪對話上下文",
      "qzoneChatContext",
    );
  }
  if (!usedMacros.has("recentPosts")) {
    addMessage("system", `【你最近的噗文（請勿重複類似內容）】\n${recentPosts}`, "噗浪最近動態", "qzoneRecentPosts");
  }
  if (opts.postedAt) {
    const when = new Date(opts.postedAt).toLocaleString("zh-TW", { hour12: false });
    addMessage("system", `【發文時間】這則噗發在 ${when}，內容要符合那個時間點在做的事。`, "噗浪發文時間", "qzonePostedAt");
  }
  if (opts.peekSummary) {
    addMessage(
      "system",
      `【你手機裡最近的東西（可以自然提到，不必全用）】\n${opts.peekSummary}`,
      "噗浪手機摘要",
      "qzonePeekSummary",
    );
  }
  if (!hasUserInstruction) {
    addMessage(
      "user",
      `請以 ${charName} 的身份發一則噗浪，分享你的想法、心情或日常。`,
      "噗浪發文最終指令",
      "qzoneFinalPostInstruction",
    );
  }

  // 整合相連的相同 role 的訊息
  const messages: APIMessage[] = [];
  for (const msg of rawMessages) {
    const last = messages[messages.length - 1];
    if (typeof msg.content === "string" && last && last.role === msg.role && typeof last.content === "string") {
      last.content += "\n\n" + msg.content;
    } else {
      messages.push({ ...msg });
    }
  }

  const apiConfig = taskConfig.api;
  const genConfig = taskConfig.generation || settingsStore.generation;
  const isStreamingEnabled = !!genConfig.streamingEnabled;
  const useWindow = !opts.background && isStreamingEnabled && !!genConfig.useStreamingWindow;
  const streamingWindow = useStreamingWindow();
  const controller = new AbortController();
  const unbindAbort = useWindow ? streamingWindow.bindAbortController(controller) : null;

  try {
    const client = new OpenAICompatibleClient(apiConfig);
    const generationSettings = {
      maxContextLength: genConfig.maxContextLength || 128000,
      maxResponseLength: genConfig.maxTokens || 8192,
      temperature: genConfig.temperature || 0.9,
      topP: genConfig.topP || 0.95,
      ...pickGenerationToggles(genConfig),
      frequencyPenalty: genConfig.frequencyPenalty || 0,
      presencePenalty: genConfig.presencePenalty || 0,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: isStreamingEnabled,
      useStreamingWindow: useWindow,
    };

    if (useWindow) {
      streamingWindow.show(apiConfig.model || "AI");
      streamingWindow.setPromptContent(promptDebugMessages);
    }

    let result = "";
    let tokenUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;

    if (isStreamingEnabled) {
      const streamGenerator = client.generateStream({
        messages,
        settings: generationSettings,
        apiSettings: apiConfig,
        signal: controller.signal,
      });

      for await (const event of streamGenerator) {
        if (event.type === "token" && event.token) {
          result += event.token;
          if (useWindow) streamingWindow.appendToken(event.token);
        } else if (event.type === "done") {
          if (event.content) result = event.content;
          const usage = (event as { usage?: typeof tokenUsage }).usage;
          if (usage) tokenUsage = usage;
        } else if (event.type === "error") {
          throw new Error(event.error || "噗浪生成失敗");
        }
      }
    } else {
      const generated = await client.generate({
        messages,
        settings: generationSettings,
        apiSettings: apiConfig,
        signal: controller.signal,
      });
      result = generated.content;
      if (generated.tokenCount) {
        tokenUsage = {
          prompt_tokens: generated.tokenCount.prompt,
          completion_tokens: generated.tokenCount.completion,
          total_tokens: generated.tokenCount.total,
        };
      }
    }

    if (useWindow && tokenUsage) streamingWindow.setUsage(tokenUsage);
    if (useWindow) streamingWindow.setComplete();

    return result.trim();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("生成 AI 內容失敗:", error);
    if (useWindow) {
      if ((error as { name?: string })?.name === "AbortError") {
        streamingWindow.setComplete();
      } else {
        streamingWindow.setError(errorMsg);
      }
    }
    return null;
  } finally {
    unbindAbort?.();
    if (useWindow) streamingWindow.clearAbortBinding();
  }
}
