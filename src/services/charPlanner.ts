/**
 * 角色待辦與行程的讀寫（每個聊天一份）
 * 存在 settings 表 char-planner-${chatId}：自動進備份和自架同步，不用改資料庫結構；
 * 也不放在聊天記錄上——聊天頁存檔時是逐欄位組出聊天記錄，新欄位沒接上會被蓋掉
 */
import { db, DB_STORES } from "@/db/database";
import type { CharPlanner, PlannerOp, PlannerSource, PlannerState } from "@/types/charPlanner";
import { applyPlannerOps, prunePlanner, recordPlannerTurn, replanForReplacedRound } from "@/utils/charPlanner";

export const CHAR_PLANNER_CHANGED_EVENT = "aguaphone:char-planner-changed";

export interface CharPlannerChangedDetail {
  chatId: string;
  planner: CharPlanner;
}

function keyOf(chatId: string): string {
  return `char-planner-${chatId}`;
}

export async function loadCharPlanner(chatId: string): Promise<CharPlanner | null> {
  return (await db.get<CharPlanner>(DB_STORES.SETTINGS, keyOf(chatId))) ?? null;
}

export function emptyPlanner(chatId: string, characterId: string): CharPlanner {
  return { chatId, characterId, todos: [], plans: [], updatedAt: 0 };
}

async function savePlanner(planner: CharPlanner): Promise<CharPlanner> {
  await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify(planner)), keyOf(planner.chatId));
  try {
    window.dispatchEvent(
      new CustomEvent<CharPlannerChangedDetail>(CHAR_PLANNER_CHANGED_EVENT, {
        detail: { chatId: planner.chatId, planner },
      }),
    );
  } catch {
    // 非瀏覽器環境（測試）
  }
  return planner;
}

/**
 * 套用回覆裡的待辦、行程標籤並存起來。
 * turnId：聊天頁的這一輪，重新生成時用來換回；today：聊天的有效日期
 */
export async function applyCharPlannerOps(
  chatId: string,
  characterId: string,
  ops: PlannerOp[],
  options: { source: PlannerSource; today: string; turnId?: string },
): Promise<CharPlanner | null> {
  if (ops.length === 0) return null;
  const current = (await loadCharPlanner(chatId)) ?? emptyPlanner(chatId, characterId);
  const next = prunePlanner(applyPlannerOps(current, ops, options), options.today);
  return savePlanner({
    ...current,
    ...next,
    characterId,
    updatedAt: Date.now(),
    turns: options.turnId ? recordPlannerTurn(current.turns, options.turnId, current, next) : current.turns,
  });
}

/** 重新生成、換候選回覆時換回；沒有要改的回傳 null */
export async function replanCharPlannerForRound(
  chatId: string,
  removedTurnId: string | undefined,
  restoredTurnId: string | undefined,
): Promise<CharPlanner | null> {
  const current = await loadCharPlanner(chatId);
  if (!current) return null;
  const state = replanForReplacedRound(current, removedTurnId, restoredTurnId);
  if (!state) return null;
  return savePlanner({ ...current, ...state, updatedAt: Date.now() });
}

/** 整份換掉（使用者在「他的今天」刪掉記錯的、偷窺手機寫回） */
export async function replaceCharPlannerState(
  chatId: string,
  characterId: string,
  update: (state: PlannerState) => PlannerState,
): Promise<CharPlanner> {
  const current = (await loadCharPlanner(chatId)) ?? emptyPlanner(chatId, characterId);
  const next = update({ todos: current.todos, plans: current.plans });
  return savePlanner({ ...current, ...next, characterId, updatedAt: Date.now() });
}

/** 使用者打開過「他的今天」 */
export async function markCharPlannerSeen(chatId: string): Promise<void> {
  const current = await loadCharPlanner(chatId);
  if (!current) return;
  await db.put(DB_STORES.SETTINGS, JSON.parse(JSON.stringify({ ...current, seenAt: Date.now() })), keyOf(chatId));
}

export async function deleteCharPlanner(chatId: string): Promise<void> {
  await db.delete(DB_STORES.SETTINGS, keyOf(chatId));
}
