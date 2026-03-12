/**
 * 小劇場生成服務
 * 負責隨機抽取 char/user 配對、調用 AI 生成小劇場、解析結果
 * 支援流式視窗顯示生成過程
 */

import { getAPIClient, type APIMessage } from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import {
    buildTheaterCommentPrompt,
    buildTheaterPrompt,
    THEATER_TEMPLATE_PROMPTS,
} from "@/data/theaterPrompts";
import { getDatabase } from "@/db/database";
import { useAIGenerationStore } from "@/stores/aiGeneration";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { useSettingsStore } from "@/stores/settings";
import { useUserStore } from "@/stores/user";
import type { Chat } from "@/types/chat";
import type {
    TheaterCast,
    TheaterComment,
    TheaterPost,
    TheaterSmsBlock,
    TheaterSmsMessage,
    TheaterTemplate,
} from "@/types/theater";

const THEATER_TASK_ID = "theater-generator";

/**
 * 從 IndexedDB 取得所有有訊息的聊天
 */
async function getChatsWithMessages(): Promise<Chat[]> {
  const db = await getDatabase();
  const allChats = await db.getAll("chats");
  // 支援分塊儲存：優先用 messageCount，向下相容 messages 陣列
  return allChats.filter(
    (c) =>
      (c.messageCount && c.messageCount > 0) ||
      (c.messages && c.messages.length > 0),
  );
}

/**
 * 隨機抽取一組 char + user 配對
 * 先按角色去重再隨機，避免聊天記錄多的角色被過度抽到
 */
export async function pickRandomCast(): Promise<TheaterCast | null> {
  const charStore = useCharactersStore();
  const userStore = useUserStore();

  const chats = await getChatsWithMessages();
  if (chats.length === 0) return null;

  // 按 characterId 分組，確保每個角色被抽到的機率相同
  const chatsByChar = new Map<string, Chat[]>();
  for (const chat of chats) {
    if (!chat.characterId) continue;
    const existing = chatsByChar.get(chat.characterId) || [];
    existing.push(chat);
    chatsByChar.set(chat.characterId, existing);
  }

  // 過濾出有效角色（角色仍存在於 store 中）
  const validCharIds = [...chatsByChar.keys()].filter((id) =>
    charStore.getCharacterById(id),
  );
  if (validCharIds.length === 0) return null;

  // 隨機選一個角色
  const randomCharId =
    validCharIds[Math.floor(Math.random() * validCharIds.length)];
  const character = charStore.getCharacterById(randomCharId)!;

  const boundPersonas = userStore.personas.filter((p) =>
    (p.boundCharacterIds || []).includes(character.id),
  );
  const personaPool =
    boundPersonas.length > 0 ? boundPersonas : userStore.personas;
  const persona = personaPool[Math.floor(Math.random() * personaPool.length)];
  if (!persona) return null;

  return {
    characterId: character.id,
    characterName: character.nickname || character.data.name,
    characterAvatar: character.avatar,
    userPersonaId: persona.id,
    userName: persona.name,
    userAvatar: persona.avatar,
  };
}

/**
 * 隨機選擇模板
 */
export function pickRandomTemplate(
  preferred: TheaterTemplate[] = [],
): TheaterTemplate {
  const allTemplates = Object.keys(
    THEATER_TEMPLATE_PROMPTS,
  ) as TheaterTemplate[];
  const pool = preferred.length > 0 ? preferred : allTemplates;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 解析 SMS 區塊
 */
export function parseSmsBlocks(content: string): TheaterSmsBlock[] {
  const blocks: TheaterSmsBlock[] = [];
  const regex = /\[SMS_START\]([\s\S]*?)\[SMS_END\]/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const blockText = match[1].trim();
    const lines = blockText.split("\n").filter((l) => l.trim());
    const messages: TheaterSmsMessage[] = [];
    const participants = new Set<string>();

    for (const line of lines) {
      const msgMatch = line.match(/\[FROM:(.+?)\](.+)/);
      if (msgMatch) {
        const sender = msgMatch[1].trim();
        const msgContent = msgMatch[2].trim();
        participants.add(sender);
        messages.push({ sender, isUser: false, content: msgContent });
      }
    }

    if (messages.length > 0) {
      blocks.push({ participants: Array.from(participants), messages });
    }
  }

  return blocks;
}

/**
 * 在噗浪發布小劇場超連結貼文
 */
export async function postTheaterToQzone(post: TheaterPost): Promise<void> {
  const qzoneStore = useQzoneStore();
  // 確保 store 完整初始化（包含 settings）
  if (!qzoneStore.isLoaded) {
    await qzoneStore.init();
  }

  const preview = post.content
    .replace(/\[SMS_START\][\s\S]*?\[SMS_END\]/g, " [短信] ")
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 100);

  const qzonePost = await qzoneStore.addPost({
    authorId: "theater-blogger",
    username: post.bloggerName,
    avatar: post.bloggerAvatar || "",
    type: "text_image",
    content: `[小劇場] ${post.title}\n${post.cast.characterName} × ${post.cast.userName}\n\n${preview}...\n\n點擊前往小劇場閱讀全文`,
    visibility: "public",
    qualifier: "分享",
    authorType: "ai",
    // 用 emoticons 存儲 theater post ID 以便跳轉
    emoticons: { [`theater:${post.id}`]: 1 },
  } as any);

  console.log(
    "[Theater] 已在噗浪發布小劇場連結:",
    post.title,
    "qzone post:",
    qzonePost.id,
  );
}

/**
 * 生成小劇場（支援流式視窗顯示生成過程）
 */
export async function generateTheater(params: {
  cast: TheaterCast;
  template: TheaterTemplate;
  bloggerName: string;
  bloggerAvatar: string;
  allowNsfw: boolean;
  minTokens: number;
}): Promise<TheaterPost | null> {
  const { cast, template, bloggerName, bloggerAvatar, allowNsfw, minTokens } =
    params;

  const charStore = useCharactersStore();
  const userStore = useUserStore();
  const settingsStore = useSettingsStore();
  const aiGenStore = useAIGenerationStore();

  const character = charStore.getCharacterById(cast.characterId);
  const persona = userStore.personas.find((p) => p.id === cast.userPersonaId);

  if (!character || !persona) return null;

  // 取得 API 設定（優先使用備用 API）
  const taskConfig = settingsStore.getAPIForTask("theater");
  if (!taskConfig.api.apiKey) {
    console.error("[Theater] API Key 未設定");
    return null;
  }

  // 註冊全局生成任務
  const startResult = aiGenStore.startGeneration(THEATER_TASK_ID, "theater", {
    characterName: `${cast.characterName} × ${cast.userName}`,
  });
  if (!startResult.success) {
    console.warn("[Theater] 無法開始生成:", startResult.error);
    return null;
  }

  const prompt = buildTheaterPrompt({
    template,
    charName: cast.characterName,
    charPersonality: character.data.personality,
    charDescription: character.data.description,
    userName: cast.userName,
    userDescription: persona.description,
    allowNsfw,
    minTokens,
  });

  const client = getAPIClient(taskConfig.api);
  const messages: APIMessage[] = [{ role: "user", content: prompt }];

  let fullContent = "";

  // 判斷是否使用串流（根據用戶設定）
  const useStreaming = settingsStore.generation.streamingEnabled;
  const streamingWindow =
    useStreaming && settingsStore.generation.useStreamingWindow
      ? useStreamingWindow()
      : null;

  try {
    if (useStreaming && streamingWindow) {
      // 流式生成 + 流式視窗
      streamingWindow.show(taskConfig.api.model || "AI");

      // 監聽停止事件，中止生成
      const unsubStop = streamingWindow.on("stop", () => {
        startResult.controller?.abort();
      });

      const stream = client.generateStream({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.9,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: true,
        },
        apiSettings: taskConfig.api,
        signal: startResult.controller?.signal,
      });

      for await (const chunk of stream) {
        if (chunk.type === "token" && chunk.token) {
          fullContent += chunk.token;
          streamingWindow.appendToken(chunk.token);
          aiGenStore.updateContent(THEATER_TASK_ID, fullContent, "theater");
        } else if (chunk.type === "done") {
          if (!fullContent && chunk.content) {
            fullContent = chunk.content;
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "流式生成失敗");
        }
      }

      unsubStop();
      streamingWindow.setComplete();
    } else {
      // 非流式生成
      const result = await client.generate({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.9,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings: taskConfig.api,
        signal: startResult.controller?.signal,
      });
      fullContent = result.content;
    }

    aiGenStore.completeGeneration(THEATER_TASK_ID, "theater", fullContent);
  } catch (e) {
    // 用戶主動停止：如果已有部分內容，仍然作為結果返回
    if ((e as Error)?.name === "AbortError" && fullContent.trim()) {
      console.log("[Theater] 用戶停止生成，使用已生成的部分內容");
      aiGenStore.completeGeneration(THEATER_TASK_ID, "theater", fullContent);
      if (streamingWindow) {
        streamingWindow.setComplete();
      }
      // 繼續往下走，解析已有內容
    } else {
      const errMsg = e instanceof Error ? e.message : String(e);
      console.error("[Theater] 生成失敗:", e);
      aiGenStore.setError(THEATER_TASK_ID, errMsg, "theater");
      if (streamingWindow) {
        streamingWindow.setComplete();
      }
      return null;
    }
  }

  // 解析標題和正文
  const lines = fullContent.trim().split("\n");
  const title = lines[0].replace(/^#+\s*/, "").trim();
  const body = lines.slice(1).join("\n").trim();

  const smsBlocks = parseSmsBlocks(body);
  for (const block of smsBlocks) {
    for (const msg of block.messages) {
      msg.isUser = msg.sender === cast.userName;
    }
  }

  const now = Date.now();
  return {
    id: `theater-${now}-${Math.random().toString(36).substr(2, 9)}`,
    bloggerName,
    bloggerAvatar,
    title: title || "無題小劇場",
    content: body,
    smsBlocks,
    template,
    cast,
    likeCount: 0,
    liked: false,
    comments: [],
    continuationCount: 0,
    status: "published",
    tags: [cast.characterName, cast.userName, template],
    createdAt: now,
    updatedAt: now,
    isNsfw: allowNsfw,
  };
}

/**
 * 續寫小劇場（支援流式視窗）
 */
export async function continueTheater(
  existingPost: TheaterPost,
): Promise<string | null> {
  const charStore = useCharactersStore();
  const userStore = useUserStore();
  const settingsStore = useSettingsStore();
  const aiGenStore = useAIGenerationStore();

  const character = charStore.getCharacterById(existingPost.cast.characterId);
  const persona = userStore.personas.find(
    (p) => p.id === existingPost.cast.userPersonaId,
  );

  if (!character || !persona) return null;

  // 取得 API 設定（優先使用備用 API）
  const taskConfig = settingsStore.getAPIForTask("theater");
  if (!taskConfig.api.apiKey) return null;

  const taskId = `theater-continue-${existingPost.id}`;
  const startResult = aiGenStore.startGeneration(taskId, "theater", {
    characterName: `續寫: ${existingPost.cast.characterName}`,
  });
  if (!startResult.success) {
    console.warn("[Theater] 無法開始續寫:", startResult.error);
    return null;
  }

  const prompt = buildTheaterPrompt({
    template: existingPost.template,
    charName: existingPost.cast.characterName,
    charPersonality: character.data.personality,
    charDescription: character.data.description,
    userName: existingPost.cast.userName,
    userDescription: persona.description,
    allowNsfw: existingPost.isNsfw,
    minTokens: 2000,
    existingContent: existingPost.content,
    isContinuation: true,
  });

  const client = getAPIClient(taskConfig.api);
  const messages: APIMessage[] = [{ role: "user", content: prompt }];

  const useStreaming = settingsStore.generation.streamingEnabled;
  const streamingWindow =
    useStreaming && settingsStore.generation.useStreamingWindow
      ? useStreamingWindow()
      : null;

  let fullContent = "";

  try {
    if (useStreaming && streamingWindow) {
      streamingWindow.show(taskConfig.api.model || "AI");

      const unsubStop = streamingWindow.on("stop", () => {
        startResult.controller?.abort();
      });

      const stream = client.generateStream({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.9,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: true,
        },
        apiSettings: taskConfig.api,
        signal: startResult.controller?.signal,
      });

      for await (const chunk of stream) {
        if (chunk.type === "token" && chunk.token) {
          fullContent += chunk.token;
          streamingWindow.appendToken(chunk.token);
          aiGenStore.updateContent(taskId, fullContent, "theater");
        } else if (chunk.type === "done") {
          if (!fullContent && chunk.content) {
            fullContent = chunk.content;
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "流式生成失敗");
        }
      }

      unsubStop();
      streamingWindow.setComplete();
    } else {
      const result = await client.generate({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.9,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings: taskConfig.api,
        signal: startResult.controller?.signal,
      });
      fullContent = result.content;
    }

    aiGenStore.completeGeneration(taskId, "theater", fullContent);
    return fullContent.trim();
  } catch (e) {
    // 用戶主動停止：如果已有部分內容，仍然返回
    if ((e as Error)?.name === "AbortError" && fullContent.trim()) {
      console.log("[Theater] 用戶停止續寫，使用已生成的部分內容");
      aiGenStore.completeGeneration(taskId, "theater", fullContent);
      if (streamingWindow) {
        streamingWindow.setComplete();
      }
      return fullContent.trim();
    }
    const errMsg = e instanceof Error ? e.message : String(e);
    console.error("[Theater] 續寫失敗:", e);
    aiGenStore.setError(taskId, errMsg, "theater");
    if (streamingWindow) {
      streamingWindow.setComplete();
    }
    return null;
  }
}

/**
 * 生成角色評論
 */
export async function generateCharComment(params: {
  charId: string;
  post: TheaterPost;
}): Promise<TheaterComment | null> {
  const { charId, post } = params;
  const charStore = useCharactersStore();
  const settingsStore = useSettingsStore();

  const character = charStore.getCharacterById(charId);
  if (!character) return null;

  // 取得 API 設定（優先使用備用 API）
  const taskConfig = settingsStore.getAPIForTask("theater");
  if (!taskConfig.api.apiKey) return null;

  const prompt = buildTheaterCommentPrompt({
    charName: character.nickname || character.data.name,
    charPersonality: character.data.personality,
    theaterTitle: post.title,
    theaterContent: post.content,
    userName: post.cast.userName,
  });

  const client = getAPIClient(taskConfig.api);

  try {
    const result = await client.generate({
      messages: [{ role: "user", content: prompt }],
      settings: {
        maxContextLength: 4096,
        maxResponseLength: 2480,
        temperature: 0.85,
        topP: 0.9,
        topK: 0,
        frequencyPenalty: 0.2,
        presencePenalty: 0.2,
        repetitionPenalty: 1,
        stopSequences: [],
        streaming: false,
        useStreamingWindow: false,
      },
      apiSettings: taskConfig.api,
    });

    const now = Date.now();
    return {
      id: `tc-${now}-${Math.random().toString(36).substr(2, 6)}`,
      authorId: character.id,
      authorName: character.nickname || character.data.name,
      authorAvatar: character.avatar,
      authorType: "char",
      content: result.content.trim().replace(/^["「]|["」]$/g, ""),
      timestamp: now,
    };
  } catch (e) {
    console.error("[Theater] 生成角色評論失敗:", e);
    return null;
  }
}
