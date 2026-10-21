/**
 * AI 導演設定：型別、預設、從舊的自動互動／黑名單／聊天記錄設定遷移、作息時段
 */

import type { AutoInteractionConfig, QZoneSettings } from "@/types/qzone";

export type DirectorMode = "off" | "free" | "list";
export type DirectorRole = "often" | "reply" | "mute";
export type DirectorRoutine = "any" | "early" | "day" | "night";
export type DirectorStrictness = "loose" | "mid" | "hard";

export interface PlurkDirectorConfig {
  mode: DirectorMode;
  roles: Record<string, DirectorRole>;
  routines: Record<string, DirectorRoutine>;
  /** 熱鬧程度 1–5 */
  liveliness: number;
  /** 每天最多自動呼叫幾次 AI */
  dailyCap: number;
  memoryEnabled: boolean;
  memoryCount: number;
  usePeekPhone: boolean;
  followRoutine: boolean;
  /** 你回應後角色會接話 */
  repliesAfterUser: boolean;
  lastRunAt: number;
  todayKey: string;
  todayCount: number;
  /** 第 3 期：路人多寡 1–5 */
  npcLevel: number;
  /** 第 3、4 期：版主嚴格度 */
  strictness: DirectorStrictness;
}

export const DEFAULT_DIRECTOR_CONFIG: PlurkDirectorConfig = {
  mode: "off",
  roles: {},
  routines: {},
  liveliness: 2,
  dailyCap: 25,
  memoryEnabled: true,
  memoryCount: 15,
  usePeekPhone: false,
  followRoutine: true,
  repliesAfterUser: true,
  lastRunAt: 0,
  todayKey: "",
  todayCount: 0,
  npcLevel: 3,
  strictness: "mid",
};

/** 熱鬧程度 1–5 對應每小時的自動事件數（每個事件＝一次 AI 呼叫） */
export const LIVELINESS_RATES = [0.06, 0.3, 1.5, 4, 8];
export const LIVELINESS_LABELS = ["一天 1–2 則", "幾小時一則", "每小時 1–2 則", "每小時 3–5 則", "幾乎一直在聊"];

/** 作息時段 [開始, 結束)，結束小於開始代表跨夜 */
export const ROUTINE_WINDOWS: Record<DirectorRoutine, [number, number] | null> = {
  any: null,
  early: [6, 22],
  day: [9, 24],
  night: [18, 4],
};
export const ROUTINE_LABELS: Record<DirectorRoutine, string> = {
  any: "不限",
  early: "早起型 06–22",
  day: "白天 09–24",
  night: "夜貓子 18–04",
};
export const ROLE_LABELS: Record<DirectorRole, string> = { often: "常出現", reply: "只回應", mute: "不出現" };
export const MODE_HINTS: Record<DirectorMode, string> = {
  off: "角色只會在你按「現在就讓…」的時候出現。",
  free: "AI 依照角色個性、彼此關係和作息，自己決定誰發噗、誰來回應。",
  list: "只有名單裡設為「常出現」的角色會自動發噗。",
};

export function migrateDirectorConfig(settings: QZoneSettings, legacy: AutoInteractionConfig): PlurkDirectorConfig {
  const roles: Record<string, DirectorRole> = {};
  for (const id of legacy.characterSelection?.blacklist ?? []) roles[id] = "mute";
  const legacyCap = (legacy.maxPostsPerDay ?? 0) + (legacy.maxCommentsPerDay ?? 0);
  return {
    ...DEFAULT_DIRECTOR_CONFIG,
    mode: legacy.enabled ? "free" : "off",
    roles,
    dailyCap: legacy.enabled && legacyCap > 0 ? legacyCap : DEFAULT_DIRECTOR_CONFIG.dailyCap,
    memoryEnabled: settings.enableChatContext ?? true,
    memoryCount: settings.chatContextCount ?? 15,
    repliesAfterUser: settings.autoAIReply ?? true,
  };
}

export function isInRoutine(routine: DirectorRoutine, hour: number): boolean {
  const window = ROUTINE_WINDOWS[routine];
  if (!window) return true;
  const [start, end] = window;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export function getRole(cfg: PlurkDirectorConfig, id: string): DirectorRole {
  return cfg.roles[id] ?? "often";
}

export function getMutedIds(cfg: PlurkDirectorConfig): Set<string> {
  return new Set(Object.entries(cfg.roles).filter(([, r]) => r === "mute").map(([id]) => id));
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
