/**
 * 噗文分享給角色：把噗文做成快照、寫成提示詞、找回對應的噗與候選噗
 */

import type { QZonePost } from "@/types/qzone";
import type { PlurkShareSnapshot, PlurkShareAudience } from "@/types/chat";
import { getAudience } from "@/utils/plurkPost";
import { plurkPlainText } from "@/utils/plurkContent";
import { anonHandle, anonKey } from "@/utils/plurkSquare";

export const PLURK_SHARE_COUNTS = [0, 3, 5, 8, 10] as const;
export const PLURK_SHARE_HISTORY_WINDOW = 30;

export interface ParsedPlurkComment {
  ref?: string;
  qualifier?: string;
  content: string;
}

export interface PlurkShareNames {
  userName: string;
  charId?: string;
  memberNames?: Record<string, string>;
  groupChat?: boolean;
}

export const PLURK_SHARE_NOTE_REGEX = /\[分享噗文[:：][^\]\n]*\]/g;

/** 噗文代號：同一則噗永遠是同一個 5 碼代號 */
export function plurkRef(postId: string): string {
  let h = 0x811c9dc5;
  for (const ch of postId) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(5, "0").slice(-5);
}

/** 代號比對前先正規化：去空白、去開頭的 #、轉小寫 */
function normalizeRef(ref: string): string {
  return ref.trim().replace(/^#/, "").toLowerCase();
}

/** 剪短文字，超過就加刪節號 */
function clip(text: string, n: number): string {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}

/** 把一則噗做成分享當下的快照 */
export function buildPlurkShareSnapshot(
  post: QZonePost,
  opts: {
    sharedBy: "user" | "char";
    commentId?: string;
    resolveName?: (authorId: string, fallback?: string) => string;
    resolveAvatar?: (authorId: string, fallback?: string) => string | undefined;
  }
): PlurkShareSnapshot {
  const ref = plurkRef(post.id);
  const isAnon = getAudience(post) === "anon";

  const snapshot: PlurkShareSnapshot = {
    ref,
    postId: post.id,
    sharedBy: opts.sharedBy,
    authorKind: "char",
    authorName: "",
    audience: (post.npc || post.onSquare ? "square" : getAudience(post)) as PlurkShareAudience,
    text: plurkPlainText(post.content || post.originalPost?.content || "", 300),
    imageCount: 0,
    postedAt: post.timestamp,
    responseCount: 0,
    recentResponses: [],
  };

  // 噗主
  if (isAnon) {
    snapshot.authorKind = "anon";
    snapshot.authorName = `偷偷說 ${anonHandle(post.id, anonKey(post.authorType, post.authorId))}`;
    if (post.anonOf) snapshot.anonOf = post.anonOf;
  } else if (post.npc) {
    snapshot.authorKind = "npc";
    snapshot.authorName = post.npc.name;
  } else if (post.authorType === "user") {
    snapshot.authorKind = "user";
    snapshot.authorName = post.username || "我";
    if (post.avatar) snapshot.authorAvatar = post.avatar;
  } else {
    snapshot.authorKind = "char";
    snapshot.authorName = opts.resolveName
      ? opts.resolveName(post.authorId, post.username)
      : post.username || "角色";
    const avatar = opts.resolveAvatar
      ? opts.resolveAvatar(post.authorId, post.avatar)
      : post.avatar;
    if (avatar) snapshot.authorAvatar = avatar;
    snapshot.authorCharacterId = post.authorId;
  }

  if (post.qualifier) snapshot.qualifier = post.qualifier;

  // 圖片
  const urls = [
    ...(post.images ?? []),
    ...(post.media ?? []).filter((m) => m.type === "image").map((m) => m.url),
  ];
  snapshot.imageCount = urls.length;
  const firstRemote = urls.find((u) => /^https?:\/\//i.test(u));
  if (firstRemote) snapshot.imageUrl = firstRemote;

  if (post.imageDescription) snapshot.imageDescription = post.imageDescription;

  // 回應
  const visible = (post.comments ?? []).filter((c) => c.moderation?.action !== "delete");
  snapshot.responseCount = visible.length;

  const commentName = (c: { authorType?: "user" | "ai"; authorId: string; username: string }) => {
    if (isAnon) return anonHandle(post.id, anonKey(c.authorType, c.authorId));
    if (c.authorType === "ai" && opts.resolveName) return opts.resolveName(c.authorId, c.username);
    return c.username || "噗友";
  };

  snapshot.recentResponses = visible.slice(-10).map((c) => ({
    name: commentName(c),
    text: plurkPlainText(c.content || "", 80),
  }));

  // 單則回應
  if (opts.commentId) {
    const c = (post.comments ?? []).find((item) => item.id === opts.commentId);
    if (c) {
      const comment: NonNullable<PlurkShareSnapshot["comment"]> = {
        id: c.id,
        name: commentName(c),
        text: plurkPlainText(c.content || "", 300),
      };
      if (!isAnon && c.avatar) comment.avatar = c.avatar;
      if (c.qualifier) comment.qualifier = c.qualifier;
      if (c.authorType === "ai" && !isAnon) comment.authorCharacterId = c.authorId;
      snapshot.comment = comment;
    }
  }

  return snapshot;
}

/** 卡片上的一行摘要 */
export function plurkShareSummary(s: PlurkShareSnapshot): string {
  if (s.comment) {
    return `[分享噗文回應] ${s.comment.name}：${clip(s.comment.text, 30)}`;
  }
  return `[分享噗文] ${s.authorName}：${clip(s.text || (s.imageCount > 0 ? "[圖片]" : ""), 30)}`;
}

/** 時間格式：M/D HH:mm */
function formatTime(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

/** 寫給提示詞看的分享說明 */
export function describePlurkShareForPrompt(s: PlurkShareSnapshot, names: PlurkShareNames): string {
  if (s.sharedBy === "char") {
    return `<share-plurk ref="${s.ref}"/>[分享噗文：${s.authorName}「${clip(s.text || "[圖片]", 30)}」]`;
  }

  // 噗主標籤
  let authorLabel: string;
  if (s.authorKind === "user") authorLabel = names.userName;
  else if (s.authorKind === "anon") authorLabel = `${s.authorName}（匿名，不知道是誰）`;
  else if (s.authorKind === "npc") authorLabel = `路人 ${s.authorName}`;
  else if (!names.groupChat && s.authorCharacterId === names.charId) authorLabel = "你自己";
  else authorLabel = s.authorName;

  // 範圍標籤
  const audienceLabel =
    s.audience === "square"
      ? "廣場"
      : s.audience === "anon"
        ? "偷偷說"
        : s.audience === "private"
          ? "私噗"
          : s.audience === "friends"
            ? "好友限定"
            : "";

  // 偷偷說的真正作者
  let secretLine = "";
  if (s.anonOf) {
    if (!names.groupChat && s.anonOf === names.charId) {
      secretLine = `（這則偷偷說其實是你發的，${names.userName} 不知道是你。）`;
    } else if (names.groupChat && names.memberNames?.[s.anonOf]) {
      const m = names.memberNames[s.anonOf];
      secretLine = `（這則偷偷說其實是 ${m} 發的，只有 ${m} 自己知道，其他人都不知道。）`;
    }
  }

  if (s.comment) {
    const lines = [
      `[${names.userName} 分享了噗浪上的一則回應 ref="${s.ref}"]`,
      `原噗：${authorLabel}：${clip(s.text || "[圖片]", 60)}`,
      `回應：${s.comment.name}${s.comment.qualifier ? " " + s.comment.qualifier : ""}：${s.comment.text}`,
    ];
    if (secretLine) lines.push(secretLine);
    return lines.filter((l) => l).join("\n");
  }

  const lines: string[] = [`[${names.userName} 分享了一則噗浪 ref="${s.ref}"]`];

  const head = [`噗主：${authorLabel}`];
  if (s.qualifier) head.push(`發語詞：${s.qualifier}`);
  head.push(formatTime(s.postedAt));
  if (audienceLabel) head.push(audienceLabel);
  lines.push(head.join("｜"));

  lines.push(`內文：${s.text || "（沒有文字）"}`);

  if (s.imageDescription) {
    lines.push(`配圖：${s.imageDescription}`);
  } else if (s.imageCount > 0) {
    lines.push(`配圖：${s.imageCount} 張（沒有描述）`);
  }

  if (s.responseCount > 0) {
    const shown = s.recentResponses.length;
    lines.push(
      shown === s.responseCount
        ? `回應（共 ${s.responseCount} 則）：`
        : `回應（共 ${s.responseCount} 則，以下是最後 ${shown} 則）：`
    );
    for (const r of s.recentResponses) lines.push(`${r.name}：${r.text}`);
  }

  if (secretLine) lines.push(secretLine);

  return lines.filter((l) => l).join("\n");
}

/** 最近分享過的噗，新的在前、同一張只留最新 */
export function recentPlurkShares(
  history: Array<{ plurkShare?: PlurkShareSnapshot }>
): PlurkShareSnapshot[] {
  const seen = new Set<string>();
  const out: PlurkShareSnapshot[] = [];
  const tail = history.slice(-PLURK_SHARE_HISTORY_WINDOW);
  for (let i = tail.length - 1; i >= 0; i--) {
    const s = tail[i]?.plurkShare;
    if (!s) continue;
    const key = `${s.ref}:${s.comment?.id ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** 角色想留言時，找出要留言的那一則噗 */
export function resolvePlurkCommentTarget(
  ref: string | undefined,
  history: Array<{ plurkShare?: PlurkShareSnapshot }>
): { ref: string; postId: string; commentId?: string; commentName?: string } | null {
  const shares = recentPlurkShares(history);
  if (!shares.length) return null;

  let target = shares[0];
  if (ref) {
    const want = normalizeRef(ref);
    const found = shares.find((s) => normalizeRef(s.ref) === want);
    if (found) target = found;
  }

  const result: { ref: string; postId: string; commentId?: string; commentName?: string } = {
    ref: target.ref,
    postId: target.postId,
  };
  if (target.comment?.id) result.commentId = target.comment.id;
  if (target.comment?.name) result.commentName = target.comment.name;
  return result;
}

/** 角色能不能在這則噗留言 */
export function canCharComment(
  post: QZonePost | undefined,
  charId: string,
  opts: { canView: boolean; squareBanned: boolean }
): boolean {
  if (!post) return false;
  if (post.anonOf === charId) return false;
  if (!(opts.canView || post.authorId === charId)) return false;
  if ((post.npc || post.onSquare || getAudience(post) === "anon") && opts.squareBanned) return false;
  return true;
}

/** 挑幾則最近可以傳給角色的噗 */
export function pickShareCandidates(
  posts: QZonePost[],
  opts: {
    canView: (p: QZonePost) => boolean;
    excludeRefs: Set<string>;
    now: number;
    limit: number;
  }
): QZonePost[] {
  if (opts.limit <= 0) return [];
  return posts
    .filter(
      (p) =>
        p.timestamp <= opts.now &&
        opts.canView(p) &&
        !opts.excludeRefs.has(plurkRef(p.id)) &&
        p.moderation?.action !== "delete"
    )
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, opts.limit);
}

/** 提示詞裡一行候選噗 */
export function formatShareCandidateLine(s: PlurkShareSnapshot, charId: string): string {
  let author: string;
  if (s.authorKind === "anon") {
    author = s.anonOf === charId ? `${s.authorName}（你偷偷說的）` : s.authorName;
  } else if (s.authorKind === "npc") {
    author = `路人 ${s.authorName}`;
  } else if (s.authorKind === "user") {
    author = "{{user}}";
  } else if (s.authorCharacterId === charId) {
    author = "你自己";
  } else {
    author = s.authorName;
  }

  const suffix = s.audience === "square" ? "（廣場）" : "";
  const qualifier = s.qualifier ? ` ${s.qualifier}` : "";
  return `· ref=${s.ref}｜${author}${suffix}${qualifier}：${clip(s.text || "[圖片]", 40)}`;
}

/** 提示詞裡「可以留言」與「可以傳噗」的說明區塊 */
export function buildPlurkShareGuide(input: {
  commentable: PlurkShareSnapshot[];
  candidates: PlurkShareSnapshot[];
  charId: string;
}): string {
  const { commentable, candidates, charId } = input;
  if (!commentable.length && !candidates.length) return "";

  const lines: string[] = [];

  if (commentable.length) {
    const refs = [...new Set(commentable.map((s) => s.ref))];
    lines.push(
      `- 噗浪留言：想對聊天裡分享的噗說點什麼時，放在 <content> 內：<plurk-comment ref="代號">留言內容</plurk-comment>（可加 qualifier="覺得"；一次最多一則，不必每次都留）。可以留言的：${refs
        .map((r) => "ref=" + r)
        .join("、")}`
    );
  }

  if (candidates.length) {
    lines.push(
      `- 傳噗給 {{user}}：看到想讓 {{user}} 看的噗，單獨放一則：<msg><share-plurk ref="代號"/></msg>（可以在前後的訊息說為什麼傳；不必每次都傳，沒有想傳的就不要傳）`
    );
    lines.push("  最近的噗：");
    for (const s of candidates) {
      lines.push("  " + formatShareCandidateLine(s, charId));
    }
  }

  return lines.join("\n");
}

const candidateRegistry = new Map<string, PlurkShareSnapshot>();

/** 記住這次挑出來的候選噗，之後用代號查回來 */
export function registerPlurkShareCandidates(list: PlurkShareSnapshot[]): void {
  for (const s of list) {
    candidateRegistry.delete(s.ref);
    candidateRegistry.set(s.ref, s);
  }
  while (candidateRegistry.size > 200) {
    const oldest = candidateRegistry.keys().next().value;
    if (oldest === undefined) break;
    candidateRegistry.delete(oldest);
  }
}

/** 用代號找回候選噗 */
export function lookupPlurkShareCandidate(ref: string): PlurkShareSnapshot | undefined {
  return candidateRegistry.get(normalizeRef(ref));
}
