/**
 * 角色發噗浪：聊天回覆、主動發訊、噗浪空間「AI 發文」共用
 */

import { useQzoneStore } from "@/stores/qzone";
import { useUserStore } from "@/stores/user";
import type { QZonePost } from "@/types/qzone";
import {
  buildSocialPostsText,
  generateReactions,
  parsePlurkBlock,
  PLURK_QUALIFIERS,
} from "@/utils/plurkFormat";

export interface PlurkAuthor {
  id: string;
  nickname?: string;
  avatar?: string;
  data?: { name?: string };
}

function defaultAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/lorelei/svg?seed=${seed}&backgroundColor=b6e3f4,c0aede,d1d4f9`;
}

/**
 * 解析並發布一則角色噗文。
 * raw 可以是完整的 <plurk> 區塊、舊版區塊內文，或純文字。內容為空時不發文並回傳 null。
 */
export async function publishCharacterPlurk(
  author: PlurkAuthor,
  raw: string,
  fallback: { name?: string; avatar?: string } = {},
): Promise<QZonePost | null> {
  const parsed = parsePlurkBlock(raw);
  if (!parsed) {
    console.warn("[PlurkPost] 噗文內容為空，略過發文");
    return null;
  }

  const qzoneStore = useQzoneStore();
  if (!qzoneStore.isLoaded) await qzoneStore.loadPosts();

  // 角色發文：所有綁定該角色的用戶 Persona（與其綁定的角色）可見；沒人綁定則公開
  const userStore = useUserStore();
  const boundPersonaIds = userStore.getPersonasByBoundCharacter(author.id);
  const isGroupPost = boundPersonaIds.length > 0;
  const relatedCharacterIds = new Set<string>();
  for (const persona of userStore.personas) {
    if (!boundPersonaIds.includes(persona.id)) continue;
    for (const charId of persona.boundCharacterIds || []) relatedCharacterIds.add(charId);
  }

  const name = author.nickname || author.data?.name || fallback.name || "角色";
  const hasReactions = Object.keys(parsed.reactions).length > 0;

  return qzoneStore.addPost({
    authorId: author.id,
    username: name,
    avatar: author.avatar || fallback.avatar || defaultAvatar(author.id),
    type: "shuoshuo",
    content: parsed.content,
    qualifier:
      parsed.qualifier ||
      PLURK_QUALIFIERS[Math.floor(Math.random() * PLURK_QUALIFIERS.length)],
    visibility: "public",
    authorType: "ai",
    emoticons: hasReactions ? parsed.reactions : generateReactions(),
    visibilityMode: isGroupPost ? "group-only" : "public",
    groupName: isGroupPost ? `${name} 的粉絲` : undefined,
    groupMemberIds: isGroupPost ? [...relatedCharacterIds] : undefined,
  });
}

/** 給 {{socialPosts}} 使用：角色（群聊時為各成員）最近的噗文 */
export async function getSocialPostsForPrompt(characterIds: string[]): Promise<string> {
  const ids = characterIds.filter(Boolean);
  if (ids.length === 0) return "";
  try {
    const qzoneStore = useQzoneStore();
    if (!qzoneStore.isLoaded) await qzoneStore.loadPosts();
    return buildSocialPostsText(qzoneStore.posts, ids);
  } catch (error) {
    console.warn("[PlurkPost] 讀取噗浪動態失敗:", error);
    return "";
  }
}
