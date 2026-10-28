/**
 * 多人卡成員的手機：成員名單、手機主人的角色資料、生成用的群組資訊。
 * 全部是純函式，只讀傳進來的資料，不寫資料庫、不改原本的角色卡。
 */
import type { CharacterCardV2Data, StoredCharacter } from "@/types/character";
import type { Chat, MultiCharMember } from "@/types/chat";

/** 是不是使用者角色型成員（source=persona）：這種成員不算可偷看手機的成員 */
function isPersonaMember(m: MultiCharMember): boolean {
  return m.isPersonaMember ?? m.source === "persona";
}

/** 這張卡是多人卡時，能偷看手機的成員（不算使用者角色型成員）；不是多人卡回空陣列 */
export function listPeekMembers(chat: Pick<Chat, "groupMetadata"> | null | undefined): MultiCharMember[] {
  const meta = chat?.groupMetadata;
  if (meta?.isMultiCharCard !== true) return [];
  return (meta.multiCharMembers ?? []).filter(
    (m) => !!m.id && !!m.name?.trim() && !isPersonaMember(m),
  );
}

/** 用成員 ID 找成員；找不到回 undefined */
export function findPeekMember(
  chat: Pick<Chat, "groupMetadata"> | null | undefined,
  memberId: string | null | undefined,
): MultiCharMember | undefined {
  if (!memberId) return undefined;
  return listPeekMembers(chat).find((m) => m.id === memberId);
}

/**
 * 把成員組成一支手機的主人：名字、頭像換成成員的，角色資料依來源決定。
 * 引入角色卡就用那張卡的角色資料，有快照就用快照，都沒有就用卡片裡直接寫的成員。
 */
export function buildMemberCharacter(
  card: StoredCharacter,
  member: MultiCharMember,
  characters: readonly StoredCharacter[],
): StoredCharacter {
  const src =
    member.source === "character" && member.sourceId
      ? characters.find((c) => c.id === member.sourceId)
      : undefined;
  const snap = member.personaSnapshot;

  let data: CharacterCardV2Data;
  let lorebookIds: string[];
  let avatar: string;

  if (src) {
    data = { ...src.data, name: member.name };
    lorebookIds = [...new Set([...(card.lorebookIds ?? []), ...(src.lorebookIds ?? [])])];
    avatar = member.avatar || src.avatar || "";
  } else if (snap && (snap.description || snap.personality || snap.scenario)) {
    data = {
      ...card.data,
      name: member.name,
      description: snap.description ?? "",
      personality: snap.personality ?? "",
      scenario: snap.scenario || card.data.scenario || "",
    };
    lorebookIds = card.lorebookIds ?? [];
    avatar = member.avatar || "";
  } else {
    data = { ...card.data, name: member.name };
    lorebookIds = card.lorebookIds ?? [];
    avatar = member.avatar || "";
  }

  return { ...card, id: member.id, nickname: member.name, avatar, data, lorebookIds };
}

/** 生成用的群組資訊 */
export interface PeekGroupInfo {
  groupName: string;
  otherMembers: string[];
}

/** 這支手機的主人在群組裡叫什麼、還有哪些成員（不含自己） */
export function peekGroupInfo(
  chat: Pick<Chat, "groupMetadata" | "name"> | null | undefined,
  memberId: string,
): PeekGroupInfo | undefined {
  const meta = chat?.groupMetadata;
  if (meta?.isMultiCharCard !== true) return undefined;
  return {
    groupName: meta.groupName?.trim() || chat?.name || "群組",
    otherMembers: (meta.multiCharMembers ?? [])
      .filter((m) => m.id !== memberId && !!m.name?.trim())
      .map((m) => m.name.trim()),
  };
}
