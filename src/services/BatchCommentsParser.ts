/**
 * 批量評論解析服務
 * 解析 AI 生成的 JSON 格式評論
 */

import type { BatchCommentsResult, GeneratedComment } from "@/types/qzone";

/**
 * 解析批量評論 JSON 響應
 * @param rawResponse AI 的原始響應
 * @returns 解析後的評論列表
 */
export function parseBatchCommentsResponse(
  rawResponse: string,
): GeneratedComment[] {
  try {
    // 清理響應，移除可能的 markdown 代碼塊標記
    let cleanJSON = rawResponse.trim();

    // 移除 ```json 和 ``` 標記
    cleanJSON = cleanJSON.replace(/^```json\s*/i, "");
    cleanJSON = cleanJSON.replace(/^```\s*/i, "");
    cleanJSON = cleanJSON.replace(/\s*```$/i, "");

    // 嘗試找到 JSON 對象
    const jsonMatch = cleanJSON.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[BatchCommentsParser] 無法找到 JSON 對象");
      return [];
    }

    const parsed: BatchCommentsResult = JSON.parse(jsonMatch[0]);

    if (!parsed.comments || !Array.isArray(parsed.comments)) {
      console.warn("[BatchCommentsParser] 響應中沒有 comments 陣列");
      return [];
    }

    // 驗證並清理每條評論
    const validComments: GeneratedComment[] = [];

    for (const comment of parsed.comments) {
      if (!comment.characterId || !comment.characterName || !comment.content) {
        console.warn("[BatchCommentsParser] 跳過無效評論:", comment);
        continue;
      }

      // 清理評論內容（移除動作描述）
      const cleanedContent = cleanCommentContent(comment.content);

      if (!cleanedContent) {
        console.warn("[BatchCommentsParser] 評論內容為空:", comment);
        continue;
      }

      validComments.push({
        id: comment.id, // 保留臨時 ID（c1, c2...）用於 replyTo 映射
        characterId: comment.characterId,
        characterName: comment.characterName,
        content: cleanedContent,
        replyTo: comment.replyTo || null,
      });
    }

    console.log(
      `[BatchCommentsParser] 成功解析 ${validComments.length} 條評論`,
    );
    return validComments;
  } catch (error) {
    console.error("[BatchCommentsParser] 解析失敗:", error);
    return [];
  }
}

/**
 * 清理評論內容
 * 移除動作描述、表情描述等
 */
function cleanCommentContent(content: string): string {
  let cleaned = content.trim();

  // 移除括號內的動作描述
  // 例如：「真有意思呢（微笑）」→「真有意思呢」
  cleaned = cleaned.replace(/[（(][^）)]*[）)]/g, "");

  // 移除星號包裹的動作描述
  // 例如：「我也這麼想 *轉筆*」→「我也這麼想」
  cleaned = cleaned.replace(/\*[^*]+\*/g, "");

  // 移除多餘的空格
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}

/**
 * 構建評論歷史字串（用於 prompt）
 */
export function buildExistingCommentsPrompt(
  comments: Array<{
    id: string;
    username: string;
    content: string;
    replyToId?: string;
    replyToUsername?: string;
  }>,
): string {
  if (comments.length === 0) {
    return "（暫無評論）";
  }

  return comments
    .map((c) => {
      let line = `[${c.id}] ${c.username}: ${c.content}`;
      if (c.replyToId && c.replyToUsername) {
        line = `[${c.id}] ${c.username} 回覆 ${c.replyToUsername}: ${c.content}`;
      }
      return line;
    })
    .join("\n");
}

/**
 * 構建角色列表字串（用於 prompt）
 */
export function buildCharactersPrompt(
  characters: Array<{
    id: string;
    name: string;
    personality: string;
    description: string;
    boundUserName?: string;
  }>,
  postAuthorId?: string,
): string {
  return characters
    .map((char) => {
      const isAuthor = char.id === postAuthorId;
      let info = `## ${char.name} (ID: ${char.id})`;
      if (isAuthor) {
        info += " 【貼文作者】";
      }
      info += `\n性格：${char.personality}\n簡介：${char.description}`;
      if (char.boundUserName) {
        info += `\n綁定用戶：${char.boundUserName}（這是與 ${char.name} 私聊的玩家，不一定是本貼文的發文人）`;
      }
      if (isAuthor) {
        info += "\n⚠️ 這是貼文作者，評論時必須用第一人稱";
      }
      return info;
    })
    .join("\n\n");
}
