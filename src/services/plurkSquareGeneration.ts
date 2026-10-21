/**
 * 廣場路人噗：一次 AI 呼叫生 3–5 則路人噗（附路人回應、喜歡數、版主摺疊），
 * 也可能讓一位好友角色偷偷說心裡話
 */

import { generatePlurkText, hasPlurkApi } from "@/services/plurkAI";
import { buildCastContext, effectiveFriendIds } from "@/services/plurkCast";
import { plurkActivity } from "@/services/plurkReveal";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import type { QZonePost } from "@/types/qzone";
import { getMutedIds, type DirectorStrictness } from "@/utils/plurkDirectorConfig";
import { plurkPlainText } from "@/utils/plurkContent";
import { isKnownQualifier, normalizeQualifier, PLURK_QUALIFIERS } from "@/utils/plurkQualifiers";
import { isSquarePost, MODERATOR_NAME } from "@/utils/plurkSquare";

export interface SquareCharacterBrief {
  id: string;
  name: string;
  personality: string;
  description: string;
}

export interface SquarePromptInput {
  count: number;
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
  mid: "最多 1 則明顯引戰、人身攻擊或洗版的噗可以加 \"fold\": \"原因（2–4 字）\"，大部分噗都不要加。",
  hard: "版主很嚴格：吵架、引戰、洗版、偏激的噗都加 \"fold\": \"原因（2–4 字）\"，可以不只一則。",
};

export function buildSquarePrompt(input: SquarePromptInput): string {
  const qualifiers = PLURK_QUALIFIERS.map((q) => q.label).join("、");
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
  return `你是社群「噗浪」廣場的模擬器。現在是 ${time}。請生成 ${input.count} 則陌生路人在廣場發的噗。

# 規則
1. 路人是素不相識的一般網友，生活感要強：求助、分享好物、曬小孩寵物、吐槽工作、二手轉讓、隨口抱怨、深夜心事都可以，題材彼此不同。
2. 每則 15–120 字，繁體中文口語，純文字，不要動作描述、不要 hashtag。
3. 暱稱要像真的網友暱稱（例：考研第三年的小魚、芒果媽、今天也想離職、代購阿May），不要用真名。
4. 每則附 0–3 則其他路人的回應（replies），像真的留言串；也給一個喜歡數 likes（0–200 的整數，大部分在 50 以下）。
5. qualifier 是噗浪發語詞，可省略；只能用：${qualifiers}
6. 版主：${STRICTNESS_RULES[input.strictness]}
${characterSection}${recent}
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

export function parseSquareResponse(
  raw: string,
  opts: { characterIds: Set<string>; strictness: DirectorStrictness },
): ParsedSquarePost[] {
  const match = raw.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/);
  if (!match) return [];
  let data: { posts?: unknown };
  try {
    data = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(data.posts)) return [];

  const result: ParsedSquarePost[] = [];
  let folds = 0;
  let anonUsed = false;
  for (const item of data.posts as Array<Record<string, unknown>>) {
    if (!item || typeof item !== "object") continue;
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
    if (fold && (opts.strictness === "loose" || (opts.strictness === "mid" && folds >= 1))) fold = undefined;
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

/** 生一批廣場路人噗並存起來；回傳新增幾則 */
export async function generateSquareBatch(): Promise<{ success: boolean; added: number; error?: string }> {
  if (plurkActivity.square) return { success: false, added: 0, error: "廣場正在生成中" };
  if (!hasPlurkApi()) return { success: false, added: 0, error: "請先配置 API" };

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
    const recentTexts = qzoneStore.posts
      .filter((p) => isSquarePost(p) && now - p.timestamp < 48 * 3600_000)
      .slice(0, 12)
      .map((p) => plurkPlainText(p.content || "", 24));

    const prompt = buildSquarePrompt({
      count: 3 + Math.floor(Math.random() * 3),
      strictness: cfg.strictness,
      characters,
      recentTexts,
      now,
    });
    const raw = await generatePlurkText(prompt);
    const parsed = parseSquareResponse(raw, {
      characterIds: new Set(characters.map((c) => c.id)),
      strictness: cfg.strictness,
    });
    if (parsed.length === 0) return { success: false, added: 0, error: "這次沒有生成內容" };

    // 時間錯開到過去 40 分鐘內，舊的先存
    const times = parsed.map(() => now - Math.round(Math.random() * 40 * 60_000)).sort((a, b) => a - b);
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
        moderation: item.fold ? { action: "fold", reason: item.fold, by: MODERATOR_NAME, at } : undefined,
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
        replyAt = Math.min(now, replyAt + (1 + Math.floor(Math.random() * 6)) * 60_000);
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
    return { success: true, added: parsed.length };
  } catch (error) {
    console.warn("[PlurkSquare] 生成路人噗失敗:", error);
    return { success: false, added: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    plurkActivity.square = false;
  }
}
