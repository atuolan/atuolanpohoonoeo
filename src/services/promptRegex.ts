/**
 * 組提示詞時套用正則腳本（對應 ST 組 prompt 時的 isPrompt）：
 * - 只有勾「僅提示詞」的腳本會跑
 * - 歷史訊息依位置給 depth（0 是最新一則），腳本的最小／最大深度才有作用
 * - 影響位置勾「世界資訊」的套用到世界書條目（回傳複本，不改到 store 裡的世界書）
 *
 * 聊天、通話、群通話、伴讀、主動訊息共用。
 */
import { getRegexedString, regex_placement } from "@/services/RegexEngine";
import type { RegexScript, StoredCharacter } from "@/types/character";
import type { Lorebook } from "@/types/worldinfo";

export interface PromptRegexContext {
  scripts: RegexScript[];
  characterName?: string;
  userName?: string;
}

type PromptRole = "user" | "assistant";

/** 拿掉這個聊天停用的腳本（Chat.disabledRegexIds） */
export function filterChatDisabledScripts(
  scripts: RegexScript[],
  disabledIds: readonly string[] | undefined,
): RegexScript[] {
  if (!disabledIds?.length) return scripts;
  const off = new Set(disabledIds);
  return scripts.filter((s) => !off.has(s.id));
}

/** 全域腳本（含內置）＋角色卡腳本，扣掉這個聊天停用的；全域腳本還沒從資料庫載入就先載入（主動訊息可能在背景跑） */
export async function loadPromptRegexContext(
  characters: (StoredCharacter | undefined)[],
  names: { characterName?: string; userName?: string },
  disabledIds?: readonly string[],
): Promise<PromptRegexContext> {
  const { useRegexScriptsStore } = await import("@/stores/regexScripts");
  const store = useRegexScriptsStore();
  await store.init();
  const characterScripts = characters.flatMap(
    (c) => c?.data?.extensions?.regex_scripts ?? [],
  );
  return {
    scripts: filterChatDisabledScripts(
      [...store.allScripts, ...characterScripts],
      disabledIds,
    ),
    ...names,
  };
}

function hasPromptOnlyScripts(ctx: PromptRegexContext): boolean {
  return ctx.scripts.some((s) => s.promptOnly && !s.disabled);
}

export function applyPromptRegexToText(
  content: string,
  role: PromptRole,
  depth: number | undefined,
  ctx: PromptRegexContext,
): string {
  if (!content || !ctx.scripts.length) return content;
  return getRegexedString(
    content,
    role === "user" ? regex_placement.USER_INPUT : regex_placement.AI_OUTPUT,
    ctx.scripts,
    {
      characterName: ctx.characterName,
      userName: ctx.userName,
      isPrompt: true,
      depth,
    },
  );
}

/** ChatMessage 的角色；系統訊息不套用 */
export function chatMessageRole(message: {
  sender?: string;
  is_user?: boolean;
}): PromptRole | null {
  if (message.sender === "system") return null;
  return message.is_user ? "user" : "assistant";
}

/** 歷史訊息依位置給 depth；roleOf 回傳 null 的不套用。沒變的訊息原樣保留 */
export function applyPromptRegexToHistory<T extends { content: string }>(
  items: T[],
  roleOf: (item: T) => PromptRole | null,
  ctx: PromptRegexContext,
): T[] {
  if (!hasPromptOnlyScripts(ctx)) return items;
  return items.map((item, index) => {
    const role = roleOf(item);
    if (!role) return item;
    const content = applyPromptRegexToText(
      item.content,
      role,
      items.length - 1 - index,
      ctx,
    );
    return content === item.content ? item : { ...item, content };
  });
}

export function applyWorldInfoRegexToLorebooks(
  lorebooks: Lorebook[],
  ctx: PromptRegexContext,
): Lorebook[] {
  const scripts = ctx.scripts.filter(
    (s) =>
      !s.disabled &&
      s.promptOnly &&
      s.placement?.includes(regex_placement.WORLD_INFO),
  );
  if (!scripts.length) return lorebooks;
  const params = {
    characterName: ctx.characterName,
    userName: ctx.userName,
    isPrompt: true,
  };
  return lorebooks.map((book) => ({
    ...book,
    entries: (Array.isArray(book.entries) ? book.entries : []).map((entry) => ({
      ...entry,
      content: getRegexedString(
        entry.content,
        regex_placement.WORLD_INFO,
        scripts,
        params,
      ),
    })),
  }));
}
