/**
 * 角色個人頁的「整理印象」：一次 AI 呼叫，從角色設定與他在噗浪的發言整理 3–5 個印象標籤
 */

import { extractJsonObject, generatePlurkText } from "@/services/plurkAI";
import { useCharactersStore } from "@/stores/characters";
import { useQzoneStore } from "@/stores/qzone";
import { plurkPlainText } from "@/utils/plurkContent";

export function buildImpressionPrompt(input: {
  name: string;
  personality: string;
  description: string;
  lines: string[];
}): string {
  const said = input.lines.length ? input.lines.map((l) => `- ${l}`).join("\n") : "（還沒有）";
  return `以下是「${input.name}」這個角色。請用旁觀者的眼光，替他整理 3–5 個印象標籤（每個 2–8 字，繁體中文，像「嘴硬」「記得你說過的話」「夜貓子」），要從他的個性和在噗浪的發言看得出來，不要重複、不要評價使用者。

# 角色
個性：${input.personality || "（無）"}
描述：${input.description.slice(0, 300) || "（無）"}

# 他最近在噗浪說過的話
${said}

只輸出 JSON：{"tags": ["標籤", "標籤"]}`;
}

export function parseImpressionTags(raw: string): string[] | null {
  const data = extractJsonObject(raw);
  if (!data || !Array.isArray(data.tags)) return null;
  const tags = [
    ...new Set(
      data.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter((t) => t.length > 0 && t.length <= 12),
    ),
  ].slice(0, 5);
  return tags.length ? tags : null;
}

/** 整理並存起來；回傳標籤（失敗丟錯） */
export async function summarizeImpressions(characterId: string): Promise<string[]> {
  const qzoneStore = useQzoneStore();
  const character = useCharactersStore().characters.find((c) => c.id === characterId);
  if (!character) throw new Error("找不到這位角色");
  const lines: string[] = [];
  for (const post of qzoneStore.sortedPosts) {
    if (post.anonOf) continue;
    if (post.authorId === characterId) lines.push(plurkPlainText(post.content || "", 60));
    for (const c of post.comments) if (c.authorId === characterId) lines.push(plurkPlainText(c.content, 60));
    if (lines.length >= 20) break;
  }
  const raw = await generatePlurkText(
    buildImpressionPrompt({
      name: character.nickname || character.data?.name || "角色",
      personality: character.data?.personality || "",
      description: character.data?.description || "",
      lines: lines.slice(0, 20),
    }),
  );
  const tags = parseImpressionTags(raw);
  if (!tags) throw new Error("這次沒有整理出印象");
  await qzoneStore.updateSettings({
    impressions: { ...(qzoneStore.settings.impressions ?? {}), [characterId]: { tags, at: Date.now() } },
  });
  return tags;
}
