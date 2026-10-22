/**
 * AI 服務
 * 封裝各種 AI 生成功能
 */

import {
    OpenAICompatibleClient,
    type APIMessage,
    type ImageContent,
    type TextContent,
} from "@/api/OpenAICompatible";
import { useStreamingWindow } from "@/composables/useStreamingWindow";
import { pickGenerationToggles } from "@/utils/generationToggles";
import { usePromptManagerStore } from "@/stores/promptManager";
import { useSettingsStore } from "@/stores/settings";
import type { GeneratedComment, QZoneComment, QZonePost } from "@/types/qzone";
import {
    buildCharactersPrompt,
    buildExistingCommentsPrompt,
    parseBatchCommentsResponse,
    parseBatchVerdict,
    type BatchVerdict,
} from "./BatchCommentsParser";
import type { DirectorStrictness } from "@/utils/plurkDirectorConfig";
import { PLURK_QUALIFIERS } from "@/utils/plurkQualifiers";
import { MODERATOR_NAME } from "@/utils/plurkSquare";

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
  useStreamingWindow?: boolean;
  passerbyOnly?: boolean;
  chatContext?: Record<string, string>;
  replyToCharacterId?: string;
  allowPasserby?: boolean; // false：只讓角色回應
  toneHint?: string; // 單則重生的語氣要求
  onlyCharacterId?: string; // 只生這位角色的一則
  replyContext?: string; // 單則重生：原本那則在回覆誰、回覆什麼
  moderation?: { strictness: DirectorStrictness }; // 廣場噗：版主可能刪留言
  verdictFor?: { commentId: string; strictness: DirectorStrictness }; // 版主判定使用者剛留的言
}

/**
 * 批量評論生成結果
 */
export interface BatchCommentsResult {
  success: boolean;
  comments: GeneratedComment[];
  error?: string;
  /** 有給 verdictFor 時：版主對使用者那則留言的判定 */
  verdict?: BatchVerdict | null;
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
    useStreaming,
    useStreamingWindow: useStreamingWindowOverride,
    passerbyOnly = false,
    chatContext = {},
    replyToCharacterId,
    allowPasserby,
    toneHint,
    onlyCharacterId,
    replyContext,
    moderation,
    verdictFor,
  } = params;

  let streamingWindow: ReturnType<typeof useStreamingWindow> | null = null;
  let unbindAbort: (() => void) | null = null;

  try {
    const settingsStore = useSettingsStore();
    const promptManagerStore = usePromptManagerStore();

    // 獲取 API 設定（優先使用備用 API）
    const taskConfig = settingsStore.getAPIForTask("plurkComment");
    if (!taskConfig.api.apiKey) {
      return { success: false, comments: [], error: "API Key 未設定" };
    }

    const isStreamingEnabled = useStreaming ?? !!taskConfig.generation.streamingEnabled;
    const shouldUseWindow =
      isStreamingEnabled &&
      (useStreamingWindowOverride ?? !!taskConfig.generation.useStreamingWindow);

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("💬 批量評論生成 - 開始");
    console.log(`角色數量: ${characters.length}`);
    console.log(`貼文作者: ${post.username}`);
    console.log(`流式輸出: ${isStreamingEnabled}`);
    console.log(`流式窗口: ${shouldUseWindow}`);
    console.log(`僅路人模式: ${passerbyOnly}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

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
      allowPasserby,
      toneHint,
      onlyCharacterId,
      replyContext,
      moderation,
      verdictFor,
    });

    console.log("📤 批量評論 - 系統提示詞:");
    console.log(prompt);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // 調用 API
    // 每次都用當下的設定建立 client。共用的 getAPIClient() 只在第一次建立時讀設定，
    // 之後傳入的設定會被忽略，使用者換了 API 也會一直打舊的端點與模型。
    const client = new OpenAICompatibleClient(apiSettings);

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

    const generationSettings = {
      maxContextLength: taskConfig.generation.maxContextLength,
      maxResponseLength: taskConfig.generation.maxTokens,
      temperature: taskConfig.generation.temperature,
      topP: taskConfig.generation.topP,
      frequencyPenalty: taskConfig.generation.frequencyPenalty,
      presencePenalty: taskConfig.generation.presencePenalty,
      repetitionPenalty: 1,
      stopSequences: [],
      streaming: isStreamingEnabled,
      useStreamingWindow: shouldUseWindow,
      ...pickGenerationToggles(taskConfig.generation),
    };

    const controller = new AbortController();
    if (shouldUseWindow) {
      streamingWindow = useStreamingWindow();
      streamingWindow.show(apiSettings.model || "AI");
      streamingWindow.setPromptContent([
        {
          role: "user",
          content: typeof messageContent === "string" ? messageContent : prompt,
          name: "噗浪批量評論提示詞",
          identifier: "qzoneBatchCommentsPrompt",
        },
      ]);
      unbindAbort = streamingWindow.bindAbortController(controller);
    }

    let fullContent = "";
    let tokenUsage:
      | { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      | undefined;

    if (isStreamingEnabled) {
      // 流式生成
      const stream = await client.generateStream({
        messages,
        settings: generationSettings,
        apiSettings,
        signal: controller.signal,
      });

      // 處理流式響應
      for await (const chunk of stream) {
        if (chunk.type === "token" && chunk.token) {
          fullContent += chunk.token;
          if (streamingWindow) streamingWindow.appendToken(chunk.token);
        } else if (chunk.type === "done") {
          if (chunk.content) {
            fullContent = chunk.content;
          }
          const usage = (chunk as { usage?: typeof tokenUsage }).usage;
          if (usage) tokenUsage = usage;
        } else if (chunk.type === "error") {
          throw new Error(chunk.error || "流式生成失敗");
        }
      }
    } else {
      // 非流式生成
      const result = await client.generate({
        messages,
        settings: generationSettings,
        apiSettings,
        signal: controller.signal,
      });
      fullContent = result.content;
      if (result.tokenCount) {
        tokenUsage = {
          prompt_tokens: result.tokenCount.prompt,
          completion_tokens: result.tokenCount.completion,
          total_tokens: result.tokenCount.total,
        };
      }
    }

    if (streamingWindow && tokenUsage) {
      streamingWindow.setUsage(tokenUsage);
    }
    if (streamingWindow) {
      streamingWindow.setComplete();
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

    return { success: true, comments, verdict: verdictFor ? parseBatchVerdict(fullContent) : undefined };
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
  } finally {
    unbindAbort?.();
    streamingWindow?.clearAbortBinding();
  }
}

/**
 * 構建批量評論 prompt
 */
/**
 * 提示詞管理「噗浪評論」中啟用、非 marker 的條目，作為評論風格要求附加到批量評論提示詞
 */
function buildCommentStyleSection(
  promptManagerStore: ReturnType<typeof usePromptManagerStore>,
): string {
  const texts = promptManagerStore.plurkCommentPromptOrder
    .filter((entry) => entry.enabled)
    .map((entry) =>
      promptManagerStore.plurkCommentPrompts.find(
        (p) => p.identifier === entry.identifier,
      ),
    )
    .filter((p) => p && !p.marker && p.content)
    .map((p) => p!.content.replace(/\{\{char\}\}/gi, "各角色").trim())
    .filter(Boolean);
  return texts.length > 0 ? `\n# 評論風格\n${texts.join("\n\n")}\n` : "";
}

export function buildBatchCommentsPrompt(params: {
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
  allowPasserby?: boolean;
  toneHint?: string;
  onlyCharacterId?: string;
  replyContext?: string;
  moderation?: { strictness: DirectorStrictness };
  verdictFor?: { commentId: string; strictness: DirectorStrictness };
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
    promptManagerStore,
  } = params;

  const qualifierList = PLURK_QUALIFIERS.map((q) => q.label).join("、");
  const strictness = params.moderation?.strictness;
  const removedRule =
    strictness === "hard"
      ? "吵架、引戰、人身攻擊、洗版的留言"
      : strictness === "mid"
        ? "最多 1 則明顯人身攻擊或引戰的留言（大部分都不要加）"
        : "";
  const qualifierFormatLine =
    `- qualifier: 噗浪發語詞，可省略（省略就是不加）；只能用：${qualifierList}` +
    (removedRule
      ? `\n- removed: 這是公開廣場，版主「${MODERATOR_NAME}」會刪掉${removedRule}。被刪的那則照樣寫出內容，另外加上 removed（原因 2–4 字，例如「人身攻擊」）；角色的留言不要被刪。`
      : "");

  // 使用者在提示詞管理「噗浪評論」設定的評論風格
  const styleSection = buildCommentStyleSection(promptManagerStore);

  // 角色噗文的配圖以 <image>描述</image> 寫在內文中
  const postContent = (post.content || "").replace(
    /<image>([\s\S]*?)<\/image>/gi,
    (_, desc: string) => `[配圖：${desc.split(/[|｜]/)[0].trim()}]`,
  );

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
    postAuthorIdentityNote = `\n⚠️ 重要：「${post.username}」是這則噗浪的發文人（真實用戶／玩家 persona），但不一定是每個角色私聊記錄裡的 {{user}}。角色評論時可以回應發文人，卻不能把發文人自動等同於自己的私聊對象。`;
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
${styleSection}
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
${postContent}${imageNote}

# 已有評論

${existingCommentsPrompt}

# 輸出格式
輸出 JSON 格式，每條評論包含：
- id: 評論的唯一 ID（格式：c1, c2, c3...）
- characterId: 路人 ID（passerby-1, passerby-2...）
- characterName: 路人暱稱
- content: 評論內容（10-80字）
- replyTo: 回覆的評論 ID，如果是直接評論貼文則為 null
${qualifierFormatLine}

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
        return `## ${charName} 的專屬最近私聊記憶\n${context}`;
      })
      .join("\n\n");
    chatContextSection = `\n# 各角色的專屬私聊記憶（嚴格身份邊界）\n重要規則：\n1. 每個區塊只屬於標題中的那一個角色，不能拿 A 角色的私聊 {{user}} 當成 B 角色的私聊對象。\n2. 「此角色的私聊 {{user}}」只代表該角色聊天記錄裡的使用者 persona；不等於噗浪發文人、留言者、被回覆者或路人，除非名稱與身份資訊明確相同。\n3. 生成評論時，請把「噗浪發文人／已有評論作者」與「角色私聊 {{user}}」分開理解：前者用貼文與評論欄位判斷，後者只作為角色記憶與口吻參考。\n4. 如果角色提到私聊記憶，必須以該角色自己的私聊對象為準，不要把當前發言人或回覆目標替換成私聊對象。\n\n${perCharSections}\n`;
  }

  // 構建被回覆角色的優先指示
  const replyToChar = replyToCharacterId
    ? characters.find((c) => c.id === replyToCharacterId)
    : null;
  const replyTargetDescription =
    replyToChar?.id === post.authorId
      ? `${replyToChar.name} 的貼文`
      : `${replyToChar?.name} 的評論`;
  const replyPrioritySection = replyToChar
    ? `\n# ⚠️ 重要：優先回覆指示\n用戶正在回覆 ${replyTargetDescription}。**${replyToChar.name} 必須是第一個回覆的角色（c1）**，直接回應用戶的最新評論。這裡的「用戶」是噗浪留言者／回覆操作者，不代表 ${replyToChar.name} 私聊記錄中的 {{user}}，除非身份資訊明確相同。其他角色的評論排在後面。\n`
    : "";

  const passerbyAllowed = params.allowPasserby !== false;
  const passerbySection = passerbyAllowed
    ? `# 隨機路人評論者
除了上述角色外，你還可以創造 1-3 個隨機路人來評論。路人的規則：
- characterId 使用 "passerby-1", "passerby-2", "passerby-3" 等格式
- characterName 使用真實、多樣化的網路暱稱，例如：
  - "毛毛沒吃早餐"、"憑甚麼要做報告"、"從前像我一樣"
  - "我餓了"、"阿瓜雲上下左右"、"膝蓋中了一劍但我沒跪"
  - "冰糖葫蘆"、"薄荷可可"、"在你眼中我是誰"
- 路人評論風格多樣：可以是粉絲、路人、吐槽、玩梗等
- 路人可以和角色互動，也可以被角色回覆`
    : "# 路人\n這則噗只有好友看得到，不要加入路人，只讓上面列出的角色回應。";
  const onlyChar = params.onlyCharacterId
    ? characters.find((c) => c.id === params.onlyCharacterId)
    : null;
  const singleSection = onlyChar
    ? `\n# 這次只要一則\n只輸出 1 則 ${onlyChar.name} 的回應（characterId 用 "${onlyChar.id}"，id 用 "c1"，replyTo 用 null）。${params.replyContext ? `\n${params.replyContext}` : ""}${params.toneHint ? `\n語氣：${params.toneHint}` : ""}\n`
    : "";
  const exampleJson = passerbyAllowed
    ? `    {"id": "c1", "characterId": "char-001", "characterName": "小明", "content": "評論內容", "replyTo": null, "qualifier": "覺得"},
    {"id": "c2", "characterId": "passerby-1", "characterName": "今天也要早睡", "content": "路人評論", "replyTo": null},
    {"id": "c3", "characterId": "char-002", "characterName": "小紅", "content": "回覆路人", "replyTo": "c2"}`
    : `    {"id": "c1", "characterId": "char-001", "characterName": "小明", "content": "評論內容", "replyTo": null, "qualifier": "覺得"},
    {"id": "c2", "characterId": "char-002", "characterName": "小紅", "content": "回覆小明", "replyTo": "c1"}`;
  const requirements = onlyChar
    ? "請只生成上面指定的那一則回應。"
    : passerbyAllowed
      ? `請為以上角色和路人生成評論區互動。

要求：
1. 每個角色至少發表 1 條評論
2. 加入 1-3 個路人評論，增加真實感
3. 鼓勵角色和路人之間互相回覆，形成對話
4. 總評論數建議 ${minComments}-${maxComments} 條
5. 評論要符合各自性格，有個性化
6. 路人評論風格要多樣：粉絲、路人、吐槽、玩梗等`
      : `請為以上角色生成評論區互動。

要求：
1. 每個角色至少發表 1 條評論
2. 鼓勵角色之間互相回覆，形成對話
3. 總評論數建議 ${minComments}-${maxComments} 條
4. 評論要符合各自性格，有個性化`;

  const verdictRule =
    params.verdictFor?.strictness === "hard"
      ? "吵架、引戰、人身攻擊、偏激的都要摺疊，嚴重的可以禁言 1–3 天"
      : "只有很明顯的人身攻擊或引戰才摺疊，禁言最多 1 天；大部分留言都沒問題，fold 用 null";
  const verdictSection = params.verdictFor
    ? `
# 版主判定
已有評論中 id 為 ${params.verdictFor.commentId} 的那則是使用者剛留的言。廣場版主「${MODERATOR_NAME}」要判斷要不要摺疊它（${verdictRule}）。
在 JSON 最外層、comments 旁邊另外輸出 "verdict": {"fold": null 或 "原因（2–4 字）", "banDays": 0}。角色的評論照常生成，不受判定影響。
`
    : "";

  // 正常模式（有角色參與）
  let prompt = `你是一個社交媒體評論區模擬器。你的任務是根據多個角色的人設，為一條貼文生成真實、自然的評論區互動。

# 核心規則
1. 每個角色可以發表多條評論，模擬真實的評論區對話
2. 角色之間可以互相回覆，形成對話串
3. 評論必須是純文字，禁止任何動作描述（如「（微笑）」「*轉筆*」）
4. 口語化表達
5. 每個角色依自己的國籍與背景判斷母語：母語是中文就直接寫繁體中文；母語不是中文，每則評論都完整用母語寫，content 寫成「母語原文<br>對應的中文翻譯」，禁止只有中文的評論。路人用繁體中文
6. 噗浪作者、已有評論作者、被回覆者、路人、以及各角色私聊中的 {{user}} 是不同身份欄位；不得因為看到「用戶／玩家」就自動合併。
${replyPrioritySection}${styleSection}${singleSection}
# 評論區角色

${charactersPrompt}
${chatContextSection}
${passerbySection}

# 原始貼文

作者：${post.username || "匿名"}（${post.authorType === "user" ? "真實用戶" : postAuthorIsCharacter ? "AI 角色" : "路人"}）
時間：${postTime}
內容：
${postContent}${imageNote}
${postAuthorIdentityNote}

# 已有評論

${existingCommentsPrompt}

# 輸出格式
輸出 JSON 格式，每條評論包含：
- id: 評論的唯一 ID（格式：c1, c2, c3...）
- characterId: ${passerbyAllowed ? "角色 ID（角色用原 ID，路人用 passerby-1, passerby-2...）" : "角色 ID（用上面列出的原 ID）"}
- characterName: ${passerbyAllowed ? "角色名稱或路人暱稱" : "角色名稱"}
- content: 評論內容（10-80字，中文翻譯不算在內）
- replyTo: 回覆的評論 ID，如果是直接評論貼文則為 null
${qualifierFormatLine}

\`\`\`json
{
  "comments": [
${exampleJson}
  ]
}
\`\`\`

${verdictSection}
${requirements}

只輸出 JSON，不要有其他文字。`;

  return prompt;
}
