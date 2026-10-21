/**
 * 廣場版主對使用者：洗版自動處分、套用 AI 的判定、送出申訴、到點用 AI 決定申訴結果
 */

import { extractJsonObject, generatePlurkText, hasPlurkApi } from "@/services/plurkAI";
import { useQzoneStore } from "@/stores/qzone";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { plurkPlainText } from "@/utils/plurkContent";
import { STRICTNESS_HINTS } from "@/utils/plurkDirectorConfig";
import {
  clampBanDays,
  countDuplicateReplies,
  isBanActive,
  makeAppeal,
  spamVerdict,
} from "@/utils/plurkModeration";
import { isSquarePost, MODERATOR_NAME } from "@/utils/plurkSquare";

const DAY = 86_400_000;
const RETRY_MS = 30 * 60_000;

/** 版主管得到的回應：別人的、上廣場的噗，而且不是寬鬆 */
export function isModeratedReply(post: QZonePost): boolean {
  const strictness = useQzoneStore().directorConfig.strictness;
  return strictness !== "loose" && post.authorType !== "user" && isSquarePost(post);
}

/** 你在廣場被禁言中，不能回這則（自己的噗、不在廣場的噗不受影響） */
export function isReplyBlocked(post: QZonePost, now = Date.now()): boolean {
  const qzoneStore = useQzoneStore();
  return post.authorType !== "user" && isSquarePost(post) && isBanActive(qzoneStore.settings.ban, now);
}

function postTitle(post: QZonePost): string {
  return plurkPlainText(post.content || "", 12) || "一則噗";
}

async function punish(post: QZonePost, comment: QZoneComment, reason: string, banDays: number): Promise<void> {
  const qzoneStore = useQzoneStore();
  const now = Date.now();
  await qzoneStore.updateComment(post.id, comment.id, {
    moderation: { action: "fold", reason, by: MODERATOR_NAME, at: now },
  });
  await qzoneStore.addSystemNotice({
    kind: "fold",
    title: `版主 ${MODERATOR_NAME}`,
    text: `把你在〈${postTitle(post)}〉下的回應摺疊了，原因是「${reason}」。`,
    postId: post.id,
    commentId: comment.id,
  });
  if (banDays > 0 && !isBanActive(qzoneStore.settings.ban, now)) {
    await qzoneStore.setBan({ reason, by: MODERATOR_NAME, at: now, until: now + banDays * DAY });
    await qzoneStore.addSystemNotice({
      kind: "ban",
      title: `版主 ${MODERATOR_NAME}`,
      text: `你在廣場被禁言 ${banDays} 天，原因是「${reason}」。`,
    });
  }
}

/** 使用者剛送出的廣場回應：洗版就直接處分；回傳有沒有處分 */
export async function checkSpamReply(postId: string, commentId: string): Promise<boolean> {
  const qzoneStore = useQzoneStore();
  const post = qzoneStore.posts.find((p) => p.id === postId);
  const comment = post?.comments.find((c) => c.id === commentId);
  if (!post || !comment || !isModeratedReply(post)) return false;
  const duplicates = countDuplicateReplies(qzoneStore.posts, post.id, comment.content, Date.now());
  const verdict = spamVerdict(qzoneStore.directorConfig.strictness, duplicates);
  if (!verdict.fold) return false;
  await punish(post, comment, "洗版", verdict.banDays);
  return true;
}

/** 套用批量回應時順便回傳的 AI 判定 */
export async function applyReplyVerdict(
  postId: string,
  commentId: string,
  verdict: { fold: string | null; banDays: number },
): Promise<void> {
  const qzoneStore = useQzoneStore();
  const post = qzoneStore.posts.find((p) => p.id === postId);
  const comment = post?.comments.find((c) => c.id === commentId);
  if (!post || !comment || comment.moderation || !verdict.fold || !isModeratedReply(post)) return;
  await punish(post, comment, verdict.fold, clampBanDays(qzoneStore.directorConfig.strictness, verdict.banDays));
}

/** 送出申訴（禁言中、還沒申訴過才行） */
export async function submitAppeal(reason: string): Promise<void> {
  const qzoneStore = useQzoneStore();
  const ban = qzoneStore.settings.ban;
  const text = reason.trim();
  if (!text || !isBanActive(ban, Date.now()) || ban.appeal) return;
  await qzoneStore.setBan({ ...ban, appeal: makeAppeal(text, Date.now()) });
}

export function buildAppealPrompt(input: { reason: string; appeal: string; strictnessHint: string }): string {
  return `你是社群「噗浪」廣場的版主「${MODERATOR_NAME}」。${input.strictnessHint}
有一位使用者因為「${input.reason}」被你禁言，他提出申訴：
「${input.appeal}」

請決定要不要接受申訴。理由合理、誠懇就接受；敷衍、狡辯或繼續攻擊人就不接受。
用你的口吻回他一句話（40 字內，繁體中文）。

只輸出 JSON：{"approved": true 或 false, "reply": "回覆"}`;
}

export function parseAppealDecision(raw: string): { approved: boolean; reply: string } | null {
  const data = extractJsonObject(raw);
  if (!data || typeof data.approved !== "boolean") return null;
  const reply = typeof data.reply === "string" ? data.reply.trim().slice(0, 80) : "";
  return { approved: data.approved, reply };
}

let checking = false;

/** 申訴到點就用一次 AI 呼叫決定結果（plurkReveal 每 30 秒叫一次） */
export async function checkAppeals(now = Date.now()): Promise<void> {
  if (checking) return;
  const qzoneStore = useQzoneStore();
  const ban = qzoneStore.settings.ban;
  const appeal = ban?.appeal;
  if (!ban || !appeal || appeal.status !== "pending" || now < appeal.decideAt || !hasPlurkApi()) return;
  checking = true;
  try {
    const raw = await generatePlurkText(
      buildAppealPrompt({
        reason: ban.reason,
        appeal: appeal.reason,
        strictnessHint: STRICTNESS_HINTS[qzoneStore.directorConfig.strictness],
      }),
    );
    const decision = parseAppealDecision(raw);
    if (!decision) throw new Error("申訴結果解析失敗");
    await qzoneStore.setBan({
      ...ban,
      appeal: { ...appeal, status: decision.approved ? "approved" : "denied", reply: decision.reply },
    });
    const quote = decision.reply ? `「${decision.reply}」` : "";
    await qzoneStore.addSystemNotice({
      kind: "appeal",
      title: `版主 ${MODERATOR_NAME}`,
      text: decision.approved ? `接受了你的申訴，禁言已解除。${quote}` : `沒有接受你的申訴。${quote}`,
    });
  } catch (err) {
    console.warn("[PlurkModeration] 申訴決定失敗，稍後再試:", err);
    // 晚一點再試，免得每 30 秒打一次 API
    const latest = qzoneStore.settings.ban;
    if (latest?.appeal) await qzoneStore.setBan({ ...latest, appeal: { ...latest.appeal, decideAt: now + RETRY_MS } });
  } finally {
    checking = false;
  }
}
