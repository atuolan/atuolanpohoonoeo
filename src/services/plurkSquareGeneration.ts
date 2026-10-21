/**
 * 廣場路人噗：一次 AI 呼叫生一批路人噗（附路人回應、喜歡數、版主摺疊），
 * 先排好時間再存，時間到才出現在廣場；也可能讓一位好友角色偷偷說心裡話
 */

import { abortedPartial, extractJsonObject, generatePlurkText, hasPlurkApi, isPlurkAbort } from "@/services/plurkAI";
import { buildCastContext, effectiveFriendIds } from "@/services/plurkCast";
import { plurkActivity } from "@/services/plurkReveal";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import type { QZonePost } from "@/types/qzone";
import { getMutedIds, type DirectorStrictness } from "@/utils/plurkDirectorConfig";
import { plurkPlainText } from "@/utils/plurkContent";
import { isKnownQualifier, normalizeQualifier, PLURK_QUALIFIERS } from "@/utils/plurkQualifiers";
import { isSquarePost, MODERATOR_NAME } from "@/utils/plurkSquare";
import {
  latestSquareAt,
  moderationDelayAt,
  normalizeSquareBatch,
  planSquareTimes,
  squarePostsPerHour,
} from "@/utils/plurkSquareSchedule";
import { salvageArrayItems } from "@/utils/jsonSalvage";

export interface SquareCharacterBrief {
  id: string;
  name: string;
  personality: string;
  description: string;
}

export interface SquarePromptInput {
  /** 這批噗依序的發文時間，則數＝長度 */
  times: number[];
  strictness: DirectorStrictness;
  /** 可以偷偷說的好友角色；空陣列＝這次不要角色 */
  characters: SquareCharacterBrief[];
  /** 最近的廣場噗，避免重複 */
  recentTexts: string[];
  now: number;
}

export interface ParsedSquareReply {
  name: string;
  qualifier?: string;
  content: string;
}

export interface ParsedSquarePost {
  kind: "npc" | "anon";
  name: string;
  characterId?: string;
  qualifier?: string;
  content: string;
  likes: number;
  replies: ParsedSquareReply[];
  fold?: string;
}

const MAX_CONTENT = 360;
const NPC_COLORS = ["#B0752E", "#C47A2C", "#B05C8A", "#4A6B2A", "#5E6B78", "#6B8A3A", "#3D5A80", "#8C5A3B", "#6E5A9A", "#2F7A6E"];

function hash(text: string): number {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 同一個暱稱＝同一位路人，加好友後才認得出來 */
export function npcIdFor(name: string): string {
  return `npc-${hash(name).toString(36)}`;
}

export function npcColorFor(name: string): string {
  return NPC_COLORS[hash(name) % NPC_COLORS.length];
}

const STRICTNESS_RULES: Record<DirectorStrictness, string> = {
  loose: "版主很寬鬆，不要輸出 fold。",
  mid: "每 10 則最多 1 則明顯引戰、人身攻擊或洗版的噗可以加 \"fold\": \"原因（2–4 字）\"，大部分噗都不要加。",
  hard: "版主很嚴格：吵架、引戰、洗版、偏激的噗都加 \"fold\": \"原因（2–4 字）\"，可以不只一則。",
};

function formatSlot(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function buildSquarePrompt(input: SquarePromptInput): string {
  const qualifiers = PLURK_QUALIFIERS.map((q) => q.label).join("、");
  const announceSection =
    input.characters.length && input.strictness !== "loose"
      ? `
# 版務公告（很少發生）
大約十次裡一次：可以讓上面其中一位角色因為在廣場吵架、洗版這類事被版主禁言，在 JSON 最外層、posts 旁邊加 "announce": {"characterId": "角色 id", "reason": "原因（10 字內）", "days": 1}（1–3 天）。大部分時候不要加。
`
      : "";
  const time = new Date(input.now).toLocaleString("zh-TW", { hour12: false });
  const recent = input.recentTexts.length
    ? `\n# 廣場上最近已經有的噗（不要重複題材）\n${input.recentTexts.map((t) => `- ${t}`).join("\n")}\n`
    : "";
  const characterSection = input.characters.length
    ? `
# 可以偷偷說的角色
下面是使用者的好友角色。這次可以（不是必須）讓其中「一位」用偷偷說發 1 則噗：不顯示名字，說平常不會公開說的心裡話，語氣要符合他的個性，讓熟悉他的人隱約認得出來，但不能寫出自己的名字或明顯身分。
${input.characters.map((c) => `- id: ${c.id}｜${c.name}｜個性：${c.personality || "（無）"}｜${c.description.slice(0, 120)}`).join("\n")}
這種噗用 "kind": "anon"，並給 "characterId"。
`
    : "";
  const slots = input.times.map((t, i) => `${i + 1}. ${formatSlot(t)}`).join("\n");
  return `你是社群「噗浪」廣場的模擬器。現在是 ${time}。請生成 ${input.times.length} 則陌生路人在廣場發的噗。

# 發文時間
這批噗會依序在下面這些時間發出，posts 陣列照這個順序輸出，內容要配合各自的時間（深夜多是心事和失眠、早上通勤上課、中午吃什麼、晚上下班追劇）：
${slots}

# 規則
1. 路人是素不相識的一般網友，生活感要強：求助、分享好物、曬小孩寵物、吐槽工作、二手轉讓、隨口抱怨、深夜心事都可以，題材彼此不同。
2. 每則 15–120 字，繁體中文口語，純文字，不要動作描述、不要 hashtag。
3. 暱稱要像真的網友暱稱（例：考研第三年的小魚、芒果媽、今天也想離職、代購阿May），不要用真名。
4. 每則附 0–3 則其他路人的回應（replies），像真的留言串；也給一個喜歡數 likes（0–200 的整數，大部分在 50 以下）。
5. qualifier 是噗浪發語詞，可省略；只能用：${qualifiers}
6. 版主：${STRICTNESS_RULES[input.strictness]}
${characterSection}${announceSection}${recent}
# 輸出格式
只輸出 JSON：
\`\`\`json
{
  "posts": [
    {"kind": "npc", "name": "考研第三年的小魚", "qualifier": "問", "content": "市立醫院附近哪裡能停車？", "likes": 12,
     "replies": [{"name": "台北通勤人", "content": "正門別想了"}]}
  ]
}
\`\`\``;
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}

function cleanText(value: unknown, max = MAX_CONTENT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function cleanQualifier(value: unknown): string | undefined {
  return typeof value === "string" && isKnownQualifier(value) ? normalizeQualifier(value) : undefined;
}

export interface ParsedSquareAnnounce {
  characterId: string;
  reason: string;
  days: number;
}

/** 頂層的版務公告；角色不在名單裡、格式不對回傳 null */
export function parseSquareAnnounce(raw: string, characterIds: Set<string>): ParsedSquareAnnounce | null {
  const data = extractJsonObject(raw);
  const item = data?.announce as Record<string, unknown> | undefined;
  if (!item || typeof item !== "object") return null;
  const characterId = typeof item.characterId === "string" ? item.characterId : "";
  const reason = cleanText(item.reason, 20);
  if (!characterIds.has(characterId) || !reason) return null;
  return { characterId, reason, days: clampInt(item.days, 1, 3) };
}

export function parseSquareResponse(
  raw: string,
  opts: { characterIds: Set<string>; strictness: DirectorStrictness },
): ParsedSquarePost[] {
  // 回覆被截斷時，前面完整的幾則照樣收
  const items = salvageArrayItems(raw, "posts");
  const foldLimit =
    opts.strictness === "hard" ? Infinity : opts.strictness === "mid" ? Math.max(1, Math.floor(items.length / 10)) : 0;

  const result: ParsedSquarePost[] = [];
  let folds = 0;
  let anonUsed = false;
  for (const item of items) {
    const content = cleanText(item.content);
    if (!content) continue;
    const isAnon = item.kind === "anon";
    const characterId = typeof item.characterId === "string" ? item.characterId : undefined;
    if (isAnon && (anonUsed || !characterId || !opts.characterIds.has(characterId))) continue;
    if (isAnon) anonUsed = true;

    const replies = (Array.isArray(item.replies) ? item.replies : [])
      .map((r: Record<string, unknown>) => ({
        name: cleanText(r?.name, 20) || "路人",
        qualifier: cleanQualifier(r?.qualifier),
        content: cleanText(r?.content, 200),
      }))
      .filter((r) => r.content)
      .slice(0, 3);

    let fold = cleanText(item.fold, 8) || undefined;
    if (fold && folds >= foldLimit) fold = undefined;
    if (fold) folds++;

    result.push({
      kind: isAnon ? "anon" : "npc",
      name: isAnon ? "偷偷說" : cleanText(item.name, 20) || "路人",
      characterId: isAnon ? characterId : undefined,
      qualifier: cleanQualifier(item.qualifier),
      content,
      likes: clampInt(item.likes, 0, 300),
      replies,
      fold,
    });
  }
  return result;
}

function passerbyAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/lorelei/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface SquareBatchResult {
  success: boolean;
  added: number;
  /** 其中排到之後才出現的則數 */
  scheduled: number;
  error?: string;
  /** 使用者在串流視窗按了停止 */
  aborted?: boolean;
}

/**
 * 生一批廣場路人噗並排好時間存起來。
 * manual（按按鈕）：約三分之一馬上出現，其餘接在排好的後面；
 * 自動補貨：接在最後一則後面，離開太久就從 3 小時前開始補
 */
export async function generateSquareBatch(opts: { manual?: boolean } = {}): Promise<SquareBatchResult> {
  if (plurkActivity.square) return { success: false, added: 0, scheduled: 0, error: "廣場正在生成中" };
  if (!hasPlurkApi()) return { success: false, added: 0, scheduled: 0, error: "請先配置 API" };

  plurkActivity.square = true;
  try {
    const qzoneStore = useQzoneStore();
    const charactersStore = useCharactersStore();
    const cfg = qzoneStore.directorConfig;
    const now = Date.now();

    // 偷偷說：一半機會讓好友角色加入候選
    let characters: SquareCharacterBrief[] = [];
    if (Math.random() < 0.5) {
      const ctx = await buildCastContext();
      const muted = getMutedIds(cfg);
      characters = shuffle(effectiveFriendIds(ctx).filter((id) => !muted.has(id)))
        .slice(0, 4)
        .map((id) => charactersStore.characters.find((c) => c.id === id))
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => ({
          id: c.id,
          name: c.nickname || c.data?.name || "角色",
          personality: c.data?.personality || "",
          description: c.data?.description || "",
        }));
    }
    // 排隊中還沒出現的也算，免得題材重複
    const recentTexts = qzoneStore.posts
      .filter((p) => isSquarePost(p) && now - p.timestamp < 48 * 3600_000)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20)
      .map((p) => plurkPlainText(p.content || "", 24));

    const times = planSquareTimes({
      count: normalizeSquareBatch(cfg.squareBatch),
      perHour: squarePostsPerHour(cfg.npcLevel),
      now,
      lastAt: latestSquareAt(qzoneStore.posts),
      manual: opts.manual ?? true,
    });
    const prompt = buildSquarePrompt({
      times,
      strictness: cfg.strictness,
      characters,
      recentTexts,
      now,
    });
    // 按按鈕的才開串流視窗，自動補貨在背景跑；按停止時留下已經寫完的幾則
    let raw: string;
    let aborted = false;
    try {
      raw = await generatePlurkText(prompt, { window: opts.manual ?? true, label: "廣場路人噗" });
    } catch (error) {
      if (!isPlurkAbort(error)) throw error;
      raw = abortedPartial(error);
      aborted = true;
    }
    const parsed = parseSquareResponse(raw, {
      characterIds: new Set(characters.map((c) => c.id)),
      strictness: cfg.strictness,
    }).slice(0, times.length);
    if (parsed.length === 0) {
      return aborted
        ? { success: false, added: 0, scheduled: 0, aborted: true }
        : { success: false, added: 0, scheduled: 0, error: "這次沒有生成內容" };
    }

    // 照排好的時間存；版主在噗出現後 10–90 分鐘才處理
    for (const [index, item] of parsed.entries()) {
      const at = times[index];
      const base: Omit<QZonePost, "id" | "timestamp" | "comments" | "likes"> = {
        authorId: "",
        type: "shuoshuo",
        content: item.content,
        qualifier: item.qualifier,
        visibility: "public",
        authorType: "ai",
        allowPasserby: true,
        crowdLikes: item.likes,
        moderation: item.fold ? { action: "fold", reason: item.fold, by: MODERATOR_NAME, at: moderationDelayAt(at) } : undefined,
      };
      const post =
        item.kind === "anon"
          ? await qzoneStore.addPost(
              {
                ...base,
                authorId: `anon-${Math.random().toString(36).slice(2, 10)}`,
                username: "偷偷說",
                avatar: "",
                audience: "anon",
                anonOf: item.characterId,
              },
              { timestamp: at },
            )
          : await qzoneStore.addPost(
              {
                ...base,
                authorId: npcIdFor(item.name),
                username: item.name,
                avatar: "",
                audience: "all",
                onSquare: true,
                npc: { id: npcIdFor(item.name), name: item.name, color: npcColorFor(item.name) },
              },
              { timestamp: at },
            );
      let replyAt = at;
      for (const reply of item.replies) {
        replyAt += (1 + Math.floor(Math.random() * 6)) * 60_000;
        await qzoneStore.addComment(
          post.id,
          {
            authorId: `passerby-${npcIdFor(reply.name)}`,
            username: reply.name,
            avatar: passerbyAvatar(reply.name),
            content: reply.content,
            authorType: "ai",
            qualifier: reply.qualifier,
          },
          { timestamp: replyAt },
        );
      }
    }
    const announce = aborted ? null : parseSquareAnnounce(raw, new Set(characters.map((c) => c.id)));
    if (announce && cfg.strictness !== "loose") {
      const name = characters.find((c) => c.id === announce.characterId)?.name ?? "某位用戶";
      const until = now + announce.days * 86_400_000;
      await qzoneStore.updateSettings({
        characterBans: [
          ...(qzoneStore.settings.characterBans ?? []).filter((b) => b.until > now && b.characterId !== announce.characterId),
          { characterId: announce.characterId, reason: announce.reason, at: now, until },
        ],
      });
      await qzoneStore.addSystemNotice({
        kind: "announce",
        title: "版務公告",
        text: `用戶「${name}」因${announce.reason}，禁言 ${announce.days} 天。`,
        characterId: announce.characterId,
      });
    }
    const scheduled = parsed.filter((_, index) => times[index] > now).length;
    return { success: true, added: parsed.length, scheduled };
  } catch (error) {
    console.warn("[PlurkSquare] 生成路人噗失敗:", error);
    return { success: false, added: 0, scheduled: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    plurkActivity.square = false;
  }
}
