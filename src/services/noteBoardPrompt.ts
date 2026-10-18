/**
 * 便簽留言板 → 線上聊天提示詞
 * {{charStickyNote}}：這個角色上一張紙條；{{userMoodNote}}：user 最新送出的心情，回過的話註明已回應
 */

import { loadNoteBoard, type MoodKey, type NoteBoardData } from "@/services/noteBoard";
import { formatNoteTime } from "@/utils/noteTime";

/** 超過這麼久的心情不帶進提示詞 */
export const MOOD_NOTE_MAX_AGE_MS = 72 * 60 * 60 * 1000;

/** 心情文字最多帶幾個字 */
export const MOOD_NOTE_MAX_LENGTH = 300;

export const MOOD_LABELS: Record<MoodKey, string> = {
  happy: "開心",
  sad: "難過",
  neutral: "普通",
  love: "心動",
  excited: "期待",
};

/** 這個聊天最新一張紙條（回覆或提醒都算），例如「今天 14:20：記得帶傘」；沒有就空字串 */
export function formatCharStickyNoteForPrompt(
  data: NoteBoardData,
  chatId: string,
  now = Date.now(),
): string {
  const latest = data.notes.find((n) => n.chatId === chatId);
  return latest ? `${formatNoteTime(latest.createdAt, now)}：${latest.text}` : "";
}

/**
 * user 最新一則 72 小時內的心情；這個聊天回過的話多一行「已回應」
 * @returns postId 是這輪帶進提示詞的心情，解析到 <mood-reply> 時拿來對應
 */
export function formatMoodNoteForPrompt(
  data: NoteBoardData,
  chatId: string,
  now = Date.now(),
): { text: string; postId: string | null } {
  const post = data.posts[0];
  if (!post || now - post.createdAt > MOOD_NOTE_MAX_AGE_MS) return { text: "", postId: null };

  const content = post.text.trim();
  const text =
    content.length > MOOD_NOTE_MAX_LENGTH
      ? `${content.slice(0, MOOD_NOTE_MAX_LENGTH)}…`
      : content;
  const lines: string[] = [];
  if (post.mood) lines.push(`心情：${MOOD_LABELS[post.mood]}`);
  lines.push(`${formatNoteTime(post.createdAt, now)} 寫的：${text}`);

  const noteReply = data.notes.find((n) => n.chatId === chatId && n.replyTo === post.id);
  const verbalReply = data.verbalReplies.find((r) => r.chatId === chatId && r.postId === post.id);
  if (noteReply) {
    lines.push(
      `（你已經在${formatNoteTime(noteReply.createdAt, now)} 用紙條回過這則心情：「${noteReply.text}」；發新的心情之前不要再提）`,
    );
  } else if (verbalReply) {
    lines.push(
      `（你已經在${formatNoteTime(verbalReply.repliedAt, now)} 在聊天裡回應過這則心情了；發新的心情之前不要再提）`,
    );
  }

  return { text: lines.join("\n"), postId: post.id };
}

/** 建提示詞用：一次讀留言板，給 {{charStickyNote}}、{{userMoodNote}} 與這輪帶的心情 id；讀不到時都當沒有 */
export async function getNoteBoardPromptContext(
  chatId: string,
  now = Date.now(),
): Promise<{ charStickyNote: string; moodNote: string; moodPostId: string | null }> {
  try {
    const data = await loadNoteBoard();
    const mood = formatMoodNoteForPrompt(data, chatId, now);
    return {
      charStickyNote: formatCharStickyNoteForPrompt(data, chatId, now),
      moodNote: mood.text,
      moodPostId: mood.postId,
    };
  } catch (error) {
    console.warn("[noteBoardPrompt] 讀取留言板失敗:", error);
    return { charStickyNote: "", moodNote: "", moodPostId: null };
  }
}
