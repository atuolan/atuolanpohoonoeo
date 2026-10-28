/**
 * 禮物日記的 AI 生成：角色自己用禮物時寫的日記（solo）、讀完 user 日記留的批註（margin）
 */
import { OpenAICompatibleClient, type APIMessage } from "@/api/OpenAICompatible";
import { useStreamingWindow, type PromptDebugMessage } from "@/composables/useStreamingWindow";
import { GIFT_DIARY_MARGIN_PROMPT, GIFT_DIARY_SOLO_PROMPT } from "@/data/giftDiaryPrompts";
import { GIFT_ITEMS } from "@/data/shopItems";
import { getDatabase } from "@/db/database";
import type { GiftDiaryEntry, GiftMemory } from "@/services/giftMemories";
import { loadMessages } from "@/storage/chatMessageStorage";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { StoredCharacter } from "@/types/character";
import type { Chat } from "@/types/chat";
import { parseGiftDiaryOutput, type GiftDiaryOutput } from "@/utils/giftDiaryFormat";
import { pickGenerationToggles } from "@/utils/generationToggles";

export interface GiftDiaryGenerationInput {
  character: StoredCharacter;
  memory: GiftMemory;
  /** solo：角色自己用的時候；margin：批註 entry 那篇 */
  mode: "solo" | "margin";
  /** margin 模式要批註的那篇 */
  entry?: GiftDiaryEntry;
  /** 背景自動寫：不開串流視窗 */
  background?: boolean;
}

const NONE = "（無）";

/** 把模板裡的 {{macro}} 換掉；未知的巨集原樣保留 */
export function fillGiftDiaryTemplate(template: string, macros: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
    const key = Object.keys(macros).find((k) => k.toLowerCase() === String(name).toLowerCase());
    if (!key) return match;
    return macros[key] ?? "";
  });
}

function clipText(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/** 這個角色最近的單人聊天最後 20 則 */
async function buildRecentChat(characterId: string, charName: string, userName: string): Promise<string> {
  try {
    const db = await getDatabase();
    const chats = (await db.getAllFromIndex("chats", "by-character", characterId)) as Chat[];
    if (!chats || chats.length === 0) return "";
    const privateChats = chats
      .filter((c) => !c.isGroupChat)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const latestChat = privateChats[0];
    if (!latestChat) return "";
    const msgs = await loadMessages(latestChat.id);
    if (!msgs || msgs.length === 0) return "";
    return msgs
      .slice(-20)
      .map((msg) => {
        const who = msg.sender === "user" ? userName : charName;
        const body = clipText(String(msg.content ?? "").replace(/<[^>]+>/g, ""), 200);
        if (!body) return "";
        return `${who}: ${body}`;
      })
      .filter(Boolean)
      .join("\n");
  } catch (e) {
    console.warn("[GiftDiary] 讀取最近聊天失敗:", e);
    return "";
  }
}

/** 失敗或沒設定 API 時回 null */
export async function generateGiftDiary(input: GiftDiaryGenerationInput): Promise<GiftDiaryOutput | null> {
  const settingsStore = useSettingsStore();
  const userStore = useUserStore();
  const taskConfig = settingsStore.getAPIForTask("diary");
  const apiConfig = taskConfig.api;

  if (!apiConfig.endpoint || !apiConfig.apiKey || !apiConfig.model) {
    console.warn("API 未配置");
    return null;
  }

  const { character, memory } = input;
  const charName = character.nickname || character.data?.name || "角色";
  const userName = userStore.currentName || "我";

  // 這份禮物的描述：優先角色自己寫的，其次商品描述
  const giftItem = memory.itemId ? GIFT_ITEMS.find((item) => item.id === memory.itemId) : undefined;
  const giftDescription = memory.description || giftItem?.description || "";

  const giftInfoLines: string[] = [];
  giftInfoLines.push(`名稱：${memory.name}`);
  giftInfoLines.push(
    memory.direction === "to-user" ? `方向：${charName} 送給 ${userName}` : `方向：${userName} 送給 ${charName}`,
  );
  if (memory.sentAt) giftInfoLines.push(`送出日期：${formatDate(memory.sentAt)}`);
  if (giftDescription) giftInfoLines.push(`描述：${giftDescription}`);
  if (memory.cardText) giftInfoLines.push(`小卡：${memory.cardText}`);
  if (memory.reaction) giftInfoLines.push(`收下時說的話：${memory.reaction}`);

  const otherEntries = (memory.entries || [])
    .map((entry) => {
      const label = entry.kind === "together" ? "那天一起用" : "自己用的時候";
      return `${entry.date}（${label}）：${clipText(String(entry.content ?? ""), 80)}`;
    })
    .filter(Boolean)
    .join("\n");

  const resolvedPersonaId = userStore.resolvePersonaForChat(character.id, null);
  const persona = resolvedPersonaId ? userStore.personas.find((p) => p.id === resolvedPersonaId) : null;
  const userPersona = persona?.description || userStore.currentPersona?.description || "";

  const recentChat = await buildRecentChat(character.id, charName, userName);

  const userEntry =
    input.mode === "margin" && input.entry ? `${input.entry.date}\n${input.entry.content ?? ""}` : "";

  const macros: Record<string, string> = {
    char: charName,
    user: userName,
    charDescription: character.data?.description || NONE,
    charPersonality: character.data?.personality || NONE,
    userPersona: userPersona || NONE,
    giftInfo: giftInfoLines.join("\n"),
    recentChat: recentChat || NONE,
    otherEntries: otherEntries || NONE,
    userEntry,
  };

  const template = input.mode === "solo" ? GIFT_DIARY_SOLO_PROMPT : GIFT_DIARY_MARGIN_PROMPT;
  const systemContent = fillGiftDiaryTemplate(template, macros);
  const userContent = input.mode === "solo" ? "請寫這篇日記。" : "請寫批註。";

  const messages: APIMessage[] = [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
  const promptDebugMessages: PromptDebugMessage[] = [
    { role: "system", content: systemContent, name: "禮物日記" },
    { role: "user", content: userContent, name: "禮物日記指令" },
  ];

  const genConfig = taskConfig.generation || settingsStore.generation;
  const isStreamingEnabled = !!genConfig.streamingEnabled;
  const useWindow = !input.background && isStreamingEnabled && !!genConfig.useStreamingWindow;
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
          throw new Error(event.error || "禮物日記生成失敗");
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

    const parsed = parseGiftDiaryOutput(result, input.mode === "solo" ? "diary" : "margin");
    if (input.mode === "solo" ? !parsed.diary : !parsed.margin) {
      console.warn("[GiftDiary] 輸出沒有對應標籤:", input.mode);
      return null;
    }
    return parsed;
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
