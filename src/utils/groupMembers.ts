/**
 * 群聊成員共用工具：名字、頭像、prompt 用的成員資料。
 *
 * 普通群聊的成員分兩種：
 * - 角色卡成員：characterId 是真的角色卡，名字、頭像、人設以角色卡現況為準
 * - 虛擬成員（手動輸入 / 使用者角色 / 引入其他多人卡）：資料存在成員身上
 *
 * 多人卡的子角色若引入自角色卡，人設也以角色卡現況為準，角色卡被刪掉才用快照。
 */
import type { PromptBuilderOptions } from "@/engine/prompt/PromptBuilder";
import type { StoredCharacter } from "@/types/character";
import type {
  GroupActionType,
  GroupMember,
  MultiCharMember,
  RemovedGroupMember,
} from "@/types/chat";

export type PromptGroupMember = NonNullable<PromptBuilderOptions["groupMembers"]>[number];

type CharacterList = readonly StoredCharacter[];

function findCharacter(characters: CharacterList, id: string): StoredCharacter | undefined {
  return characters.find((c) => c.id === id);
}

/** 成員的本名（不含群暱稱） */
export function getGroupMemberBaseName(member: GroupMember, characters: CharacterList): string {
  if (member.isVirtual) return member.name?.trim() || "未命名成員";
  const char = findCharacter(characters, member.characterId);
  return char?.nickname || char?.data?.name || member.name?.trim() || "未知角色";
}

/** 成員在群裡顯示的名字：群暱稱優先 */
export function getGroupMemberDisplayName(member: GroupMember, characters: CharacterList): string {
  return member.nickname?.trim() || getGroupMemberBaseName(member, characters);
}

/** 成員頭像 */
export function getGroupMemberAvatarUrl(member: GroupMember, characters: CharacterList): string {
  if (member.isVirtual) return member.avatar || "";
  return findCharacter(characters, member.characterId)?.avatar || member.avatar || "";
}

/** 轉成 PromptBuilder 的群成員資料 */
export function toPromptGroupMember(
  member: GroupMember,
  characters: CharacterList,
): PromptGroupMember {
  const char = member.isVirtual ? undefined : findCharacter(characters, member.characterId);
  const base = {
    characterId: member.characterId,
    nickname: member.nickname,
    avatar: getGroupMemberAvatarUrl(member, characters),
    isAdmin: member.isAdmin,
    isMuted: member.isMuted,
    source: member.source,
    sourceId: member.sourceId,
    isPersonaMember: member.isPersonaMember,
    userBinding: member.userBinding,
    affinity: member.affinity,
  };

  if (char) {
    // 角色卡還在：人設用卡的現況，不用加入當下的快照
    return {
      ...base,
      name: char.nickname || char.data?.name || member.characterId,
      originalName: char.data?.name || member.name || member.characterId,
      personality: char.data?.personality || "",
      description: char.data?.description || "",
    };
  }

  // 虛擬成員，或角色卡已被刪除：用成員身上的名字與人設快照
  const name = member.name?.trim() || "未命名成員";
  return {
    ...base,
    name: member.nickname?.trim() || name,
    originalName: name,
    personality: member.personaSnapshot?.personality || "",
    description: member.personaSnapshot?.description || "",
    personaSnapshot: member.personaSnapshot,
  };
}

/** 多人卡子角色：引入自角色卡的，人設快照換成角色卡現況（卡被刪了就保留原快照） */
export function withLiveSubCharSnapshot(
  member: MultiCharMember,
  characters: CharacterList,
): MultiCharMember {
  if (member.source !== "character" || !member.sourceId) return member;
  const char = findCharacter(characters, member.sourceId);
  if (!char) return member;
  return {
    ...member,
    personaSnapshot: {
      description: char.data?.description || "",
      personality: char.data?.personality || "",
      scenario: char.data?.scenario || "",
    },
  };
}

// ===== 被移出的成員 =====

/** 用名字找被移出的成員：群暱稱或本名完全相同才算，避免拉錯人 */
export function findRemovedMemberByName(
  removed: readonly RemovedGroupMember[],
  name: string,
  characters: CharacterList,
): RemovedGroupMember | undefined {
  // AI 常在名字後面加括號註記（例如「阿明（20歲）」），去掉後再比一次，與移出時的比對方式一致
  const targets = [name.trim(), name.trim().replace(/[（(][^）)]*[）)]$/u, "").trim()].filter(Boolean);
  if (targets.length === 0) return undefined;
  return removed.find((m) => {
    const names = [m.nickname, getGroupMemberBaseName(m, characters), m.name];
    return names.some((n) => !!n && targets.includes(n.trim()));
  });
}

// ===== 群管理動作的文字 =====

/** 群管理動作寫成一句話，放進送給 AI 的聊天歷史（畫面上的文字在 MessageBubble） */
export function describeGroupAction(action: {
  groupActionType?: GroupActionType;
  groupActionActor?: string;
  groupActionTarget?: string;
  groupActionValue?: string;
}): string {
  const actor = action.groupActionActor || "有人";
  const target = action.groupActionTarget || "";
  switch (action.groupActionType) {
    case "rename":
      return `[群管理] ${actor} 把群名改成「${action.groupActionValue || ""}」`;
    case "kick":
      return `[群管理] ${actor} 將 ${target} 移出了群聊`;
    case "invite":
      return `[群管理] ${actor} 把 ${target} 拉回了群聊`;
    case "mute":
      return `[群管理] ${actor} 禁言了 ${target}`;
    case "unmute":
      return `[群管理] ${actor} 解除了 ${target} 的禁言`;
    default:
      return "";
  }
}

// ===== @點名 =====

/**
 * 找出文字裡 @ 了哪些名字（半形 @ 與全形 ＠ 都算）。
 * 每個 @ 後面取最長的相符名字，避免「@小明明」被當成「@小明」。
 */
export function findMentionedNames(text: string, names: readonly string[]): string[] {
  const candidates = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const found: string[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@" && text[i] !== "＠") continue;
    const rest = text.slice(i + 1);
    const hit = candidates.find((name) => rest.startsWith(name));
    if (hit && !found.includes(hit)) found.push(hit);
  }
  return found;
}

/** 使用者這一輪 @ 了誰：附加在最後的指令（不存進聊天記錄） */
export function buildMentionInstruction(
  names: readonly string[],
  userName: string,
  narrative: boolean,
): string {
  const list = names.map((n) => `「${n}」`).join("、");
  return narrative
    ? `[點名] ${userName} 這次 @ 了${list}。這一段要以被點名角色的回應為主，被點名的角色一定要回應；其他角色可以簡短反應，也可以不出聲。`
    : `[點名] ${userName} 在群裡 @ 了${list}。被 @ 的角色這一輪一定要回覆，而且要先回覆；其他角色可以簡短插話，也可以不說話，不要搶走被點名者的戲份。`;
}
