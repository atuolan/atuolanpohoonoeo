/**
 * AI 服務
 * 封裝各種 AI 生成功能
 */

import {
    getAPIClient,
    type APIMessage,
    type ImageContent,
    type TextContent,
} from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { usePromptManagerStore } from "@/stores/promptManager";
import { useSettingsStore } from "@/stores/settings";
import type { GeneratedComment, QZoneComment, QZonePost } from "@/types/qzone";
import {
    buildCharactersPrompt,
    buildExistingCommentsPrompt,
    parseBatchCommentsResponse,
} from "./BatchCommentsParser";

/**
 * 批量評論生成參數
 */
export interface BatchCommentsParams {
  characters: Array<{
    id: string;
    name: string;
    personality: string;
    description: string;
    boundUserName?: string; // 與此角色綁定的 user persona 名稱
  }>;
  post: QZonePost;
  existingComments?: QZoneComment[];
  minComments?: number;
  maxComments?: number;
  useStreaming?: boolean;
  passerbyOnly?: boolean;
  chatContext?: Record<string, string>;
  replyToCharacterId?: string;
}

/**
 * 批量評論生成結果
 */
export interface BatchCommentsResult {
  success: boolean;
  comments: GeneratedComment[];
  error?: string;
}

/**
 * 生成批量評論
 */
export async function generateBatchComments(
  params: BatchCommentsParams,
): Promise<BatchCommentsResult> {
  const {
    characters,
    post,
    existingComments = [],
    minComments = 3,
    maxComments = 8,
    useStreaming = true,
    passerbyOnly = false,
    chatContext = {},
    replyToCharacterId,
  } = params;

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("💬 批量評論生成 - 開始");
  console.log(`角色數量: ${characters.length}`);
  console.log(`貼文作者: ${post.username}`);
  console.log(`流式輸出: ${useStreaming}`);
  console.log(`僅路人模式: ${passerbyOnly}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 獲取流式輸出窗口
  const streamingWindow = useStreaming ? useStreamingWindow() : null;

  try {
    const settingsStore = useSettingsStore();
    const promptManagerStore = usePromptManagerStore();

    // 獲取 API 設定（優先使用備用 API）
    const taskConfig = settingsStore.getAPIForTask("plurkComment");
    if (!taskConfig.api.apiKey) {
      return { success: false, comments: [], error: "API Key 未設定" };
    }

    // 構建 API 設定對象
    const apiSettings = {
      ...taskConfig.api,
    };

    // 構建 prompt
    const prompt = buildBatchCommentsPrompt({
      characters,
      post,
      existingComments,
      minComments,
      maxComments,
      promptManagerStore,
      passerbyOnly,
      chatContext,
      replyToCharacterId,
    });

    console.log("📤 批量評論 - 系統提示詞:");
    console.log(prompt);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // 調用 API
    const client = getAPIClient(apiSettings);

    // 如果貼文有圖片，用 vision content array 格式讓模型識圖
    const postImages = post.images?.filter(Boolean) ?? [];
    let messageContent: APIMessage["content"];
    if (postImages.length > 0) {
      const parts: Array<TextContent | ImageContent> = [
        { type: "text", text: prompt },
        ...postImages.map((url) => ({
          type: "image_url" as const,
          image_url: { url, detail: "auto" as const },
        })),
      ];
      messageContent = parts;
    } else {
      messageContent = prompt;
    }

    const messages: APIMessage[] = [{ role: "user", content: messageContent }];

    // 如果使用流式輸出，顯示窗口
    if (streamingWindow) {
      streamingWindow.show(apiSettings.model || "AI");
    }

    let fullContent = "";

    if (useStreaming && streamingWindow) {
      // 流式生成
      const stream = await client.generateStream({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.8,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: true,
          useStreamingWindow: true,
        },
        apiSettings,
      });

      // 處理流式響應
      for await (const chunk of stream) {
        if (chunk.type === "token" && chunk.token) {
          fullContent += chunk.token;
          streamingWindow.appendToken(chunk.token);
        } else if (chunk.type === "done") {
          // 使用 done 事件的完整內容作為 fallback
          if (!fullContent && chunk.content) {
            fullContent = chunk.content;
          }
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "流式生成失敗");
        }
      }

      streamingWindow.setComplete();
    } else {
      // 非流式生成
      const result = await client.generate({
        messages,
        settings: {
          maxContextLength: 8192,
          maxResponseLength: 32768,
          temperature: 0.8,
          topP: 0.95,
          topK: 0,
          frequencyPenalty: 0.3,
          presencePenalty: 0.3,
          repetitionPenalty: 1,
          stopSequences: [],
          streaming: false,
          useStreamingWindow: false,
        },
        apiSettings,
      });
      fullContent = result.content;
    }

    console.log("📥 批量評論 - AI 原始響應:");
    console.log(fullContent);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // 解析響應
    const comments = parseBatchCommentsResponse(fullContent);

    console.log("✅ 批量評論 - 解析結果:");
    comments.forEach((c) => {
      const replyInfo = c.replyTo ? ` (回覆 ${c.replyTo})` : "";
      console.log(`  ${c.characterName}: ${c.content}${replyInfo}`);
    });
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    return { success: true, comments };
  } catch (error) {
    console.error("❌ 批量評論生成失敗:", error);

    // 設置錯誤狀態
    if (streamingWindow) {
      streamingWindow.setError(
        error instanceof Error ? error.message : String(error),
      );
    }

    return {
      success: false,
      comments: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 構建批量評論 prompt
 */
function buildBatchCommentsPrompt(params: {
  characters: Array<{
    id: string;
    name: string;
    personality: string;
    description: string;
    boundUserName?: string;
  }>;
  post: QZonePost;
  existingComments: QZoneComment[];
  minComments: number;
  maxComments: number;
  promptManagerStore: ReturnType<typeof usePromptManagerStore>;
  passerbyOnly?: boolean;
  chatContext?: Record<string, string>;
  replyToCharacterId?: string;
}): string {
  const {
    characters,
    post,
    existingComments,
    minComments,
    maxComments,
    passerbyOnly = false,
    chatContext = {},
    replyToCharacterId,
  } = params;

  // 構建角色列表（如果是路人模式則為空）
  const charactersPrompt = passerbyOnly
    ? ""
    : buildCharactersPrompt(characters, post.authorId);

  // 構建已有評論
  const existingCommentsPrompt = buildExistingCommentsPrompt(
    existingComments.map((c) => ({
      id: c.id,
      username: c.username,
      content: c.content,
      replyToId: c.replyToId,
      replyToUsername: c.replyToUsername,
    })),
  );

  // 貼文時間格式化
  const postTime = new Date(post.timestamp).toLocaleString("zh-TW");

  // 圖片提示（如果貼文有圖片）
  const postImages = post.images?.filter(Boolean) ?? [];
  const imageNote =
    postImages.length > 0
      ? `\n附圖：${postImages.length} 張（已附在訊息中，請仔細觀看圖片內容並在評論中自然地回應圖片）`
      : "";

  // 檢查貼文作者是否在角色列表中
  const postAuthorIsCharacter =
    !passerbyOnly && characters.some((c) => c.id === post.authorId);

  // 判斷發文人身份，給 AI 明確說明
  let postAuthorIdentityNote = "";
  if (post.authorType === "user") {
    postAuthorIdentityNote = `\n⚠️ 重要：「${post.username}」是真實用戶（玩家本人），不是 AI 角色。角色在評論時應該把他當作真實的人來互動。`;
  } else if (postAuthorIsCharacter) {
    postAuthorIdentityNote = `\n⚠️ 重要：「${post.username}」是 AI 角色，不是用戶。如果 ${post.username} 要評論，必須用第一人稱（我、我的），因為這是他自己發的貼文。其他角色應該把 ${post.username} 當作同伴角色，而不是用戶。`;
  } else {
    // 路人發文或未知
    postAuthorIdentityNote = `\n⚠️ 重要：「${post.username}」是一個路人用戶，不是你們認識的人，也不是玩家本人。`;
  }

  // 路人模式的特殊 prompt
  if (passerbyOnly) {
    return `你是一個社交媒體評論區模擬器。你的任務是為一條貼文生成真實、自然的路人評論。

# 核心規則
1. 只生成路人評論，不使用任何固定角色
2. 路人之間可以互相回覆，形成對話串
3. 評論必須是純文字，禁止任何動作描述（如「（微笑）」「*轉筆*」）
4. 使用繁體中文，口語化表達

# 路人評論者規則
- characterId 使用 "passerby-1", "passerby-2", "passerby-3" 等格式
- characterName 使用真實、多樣化的網路暱稱，例如：
  - "毛毛沒吃早餐"、"憑甚麼要做報告"、"從前像我一樣"
  - "我餓了"、"阿瓜雲上下左右"、"膝蓋中了一劍但我沒跪"
  - "冰糖葫蘆"、"薄荷可可"、"在你眼中我是誰"
  - "今天也要早睡"、"不想上班的魚"、"咖啡續命中"
- 路人評論風格多樣：可以是粉絲、路人、吐槽、玩梗、共鳴、好奇等

# 原始貼文

作者：${post.username || "匿名"}（${post.authorType === "user" ? "真實用戶" : "AI 角色/路人"}）
時間：${postTime}
內容：
${post.content || ""}${imageNote}

# 已有評論

${existingCommentsPrompt}

# 輸出格式
輸出 JSON 格式，每條評論包含：
- id: 評論的唯一 ID（格式：c1, c2, c3...）
- characterId: 路人 ID（passerby-1, passerby-2...）
- characterName: 路人暱稱
- content: 評論內容（10-80字）
- replyTo: 回覆的評論 ID，如果是直接評論貼文則為 null

\`\`\`json
{
  "comments": [
    {"id": "c1", "characterId": "passerby-1", "characterName": "今天也要早睡", "content": "路人評論", "replyTo": null},
    {"id": "c2", "characterId": "passerby-2", "characterName": "不想上班的魚", "content": "另一個路人", "replyTo": null},
    {"id": "c3", "characterId": "passerby-3", "characterName": "咖啡續命中", "content": "回覆路人", "replyTo": "c1"}
  ]
}
\`\`\`

請生成 ${minComments}-${maxComments} 條路人評論。

要求：
1. 每個路人暱稱要獨特有趣
2. 評論風格要多樣：粉絲、路人、吐槽、玩梗、共鳴等
3. 可以有路人之間的互動對話
4. 評論要自然真實，像真正的社交媒體評論區

只輸出 JSON，不要有其他文字。`;
  }

  // 構建每個角色各自的聊天記錄上下文
  const chatContextEntries = Object.entries(chatContext);
  let chatContextSection = "";
  if (chatContextEntries.length > 0) {
    const perCharSections = chatContextEntries
      .map(([charId, context]) => {
        const char = characters.find((c) => c.id === charId);
        const charName = char?.name || "角色";
        return `## ${charName} 與玩家的最近私聊：\n${context}`;
      })
      .join("\n\n");
    chatContextSection = `\n# 角色與玩家的私聊記錄（僅供參考角色記憶，玩家不一定是本貼文的發文人）\n注意：以下聊天記錄中的「用戶/玩家」是指與角色私聊的那個人，不一定是本貼文的作者。請根據貼文作者身份欄位判斷發文人是誰。\n\n${perCharSections}\n`;
  }

  // 構建被回覆角色的優先指示
  const replyToChar = replyToCharacterId
    ? characters.find((c) => c.id === replyToCharacterId)
    : null;
  const replyPrioritySection = replyToChar
    ? `\n# ⚠️ 重要：優先回覆指示\n用戶正在回覆 ${replyToChar.name} 的評論。**${replyToChar.name} 必須是第一個回覆的角色（c1）**，直接回應用戶的最新評論。其他角色的評論排在後面。\n`
    : "";

  // 正常模式（有角色參與）
  let prompt = `你是一個社交媒體評論區模擬器。你的任務是根據多個角色的人設，為一條貼文生成真實、自然的評論區互動。

# 核心規則
1. 每個角色可以發表多條評論，模擬真實的評論區對話
2. 角色之間可以互相回覆，形成對話串
3. 評論必須是純文字，禁止任何動作描述（如「（微笑）」「*轉筆*」）
4. 使用繁體中文，口語化表達
5. 如果角色使用外語，只在外語部分後加括號翻譯
${replyPrioritySection}
# 評論區角色

${charactersPrompt}
${chatContextSection}
# 隨機路人評論者
除了上述角色外，你還可以創造 1-3 個隨機路人來評論。路人的規則：
- characterId 使用 "passerby-1", "passerby-2", "passerby-3" 等格式
- characterName 使用真實、多樣化的網路暱稱，例如：
  - "毛毛沒吃早餐"、"憑甚麼要做報告"、"從前像我一樣"
  - "我餓了"、"阿瓜雲上下左右"、"膝蓋中了一劍但我沒跪"
  - "冰糖葫蘆"、"薄荷可可"、"在你眼中我是誰"
- 路人評論風格多樣：可以是粉絲、路人、吐槽、玩梗等
- 路人可以和角色互動，也可以被角色回覆

# 原始貼文

作者：${post.username || "匿名"}（${post.authorType === "user" ? "真實用戶" : postAuthorIsCharacter ? "AI 角色" : "路人"}）
時間：${postTime}
內容：
${post.content || ""}${imageNote}
${postAuthorIdentityNote}

# 已有評論

${existingCommentsPrompt}

# 輸出格式
輸出 JSON 格式，每條評論包含：
- id: 評論的唯一 ID（格式：c1, c2, c3...）
- characterId: 角色 ID（角色用原 ID，路人用 passerby-1, passerby-2...）
- characterName: 角色名稱或路人暱稱
- content: 評論內容（10-80字）
- replyTo: 回覆的評論 ID，如果是直接評論貼文則為 null

\`\`\`json
{
  "comments": [
    {"id": "c1", "characterId": "char-001", "characterName": "小明", "content": "評論內容", "replyTo": null},
    {"id": "c2", "characterId": "passerby-1", "characterName": "今天也要早睡", "content": "路人評論", "replyTo": null},
    {"id": "c3", "characterId": "char-002", "characterName": "小紅", "content": "回覆路人", "replyTo": "c2"}
  ]
}
\`\`\`

請為以上角色和路人生成評論區互動。

要求：
1. 每個角色至少發表 1 條評論
2. 加入 1-3 個路人評論，增加真實感
3. 鼓勵角色和路人之間互相回覆，形成對話
4. 總評論數建議 ${minComments}-${maxComments} 條
5. 評論要符合各自性格，有個性化
6. 路人評論風格要多樣：粉絲、路人、吐槽、玩梗等

只輸出 JSON，不要有其他文字。`;

  return prompt;
}
