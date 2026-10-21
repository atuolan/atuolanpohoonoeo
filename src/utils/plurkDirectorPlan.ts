/**
 * AI 導演的自動模式排程（純函式）：這次要發生幾個事件、在什麼時間、誰來發噗、回哪一則
 */

import type { QZonePost } from "@/types/qzone";
import { getTheaterPostId } from "@/utils/plurkPost";
import { visibleComments } from "@/utils/plurkRiver";
import {
  dayKey,
  getRole,
  isInRoutine,
  LIVELINESS_RATES,
  type PlurkDirectorConfig,
} from "@/utils/plurkDirectorConfig";

export interface DirectorEvent {
  /** square＝生一批廣場路人噗 */
  kind: "post" | "reply" | "square";
  at: number;
}

const H = 3600_000;
const CATCH_UP_AFTER = H;
const MAX_CATCH_UP = 3;
const MAX_PER_CHECK = 2;
const POST_SHARE = 0.6;

export function estimateCallsPerHour(cfg: PlurkDirectorConfig): number {
  return LIVELINESS_RATES[Math.min(Math.max(cfg.liveliness, 1), 5) - 1];
}

export function remainingToday(cfg: PlurkDirectorConfig, now: number): number {
  const used = cfg.todayKey === dayKey(now) ? cfg.todayCount : 0;
  return Math.max(0, cfg.dailyCap - used);
}

export function planDirectorEvents(input: {
  cfg: PlurkDirectorConfig;
  now: number;
  /** 廣場排好的路人噗快出完了 */
  squareRefill?: boolean;
  random?: () => number;
}): DirectorEvent[] {
  const { cfg, now } = input;
  const random = input.random ?? Math.random;
  if (cfg.mode === "off" || cfg.lastRunAt <= 0 || now <= cfg.lastRunAt) return [];

  const elapsed = now - cfg.lastRunAt;
  const expected = (estimateCallsPerHour(cfg) * elapsed) / H;
  const catchUp = elapsed > CATCH_UP_AFTER;
  const whole = Math.floor(expected);
  const budget = remainingToday(cfg, now);
  let count = whole + (random() < expected - whole ? 1 : 0);
  count = Math.min(count, catchUp ? MAX_CATCH_UP : MAX_PER_CHECK, budget);

  const events: DirectorEvent[] = [];
  for (let i = 0; i < count; i++) {
    const at = catchUp ? cfg.lastRunAt + Math.round(((i + random()) / count) * elapsed) : now;
    events.push({ kind: random() < POST_SHARE ? "post" : "reply", at: Math.min(at, now) });
  }

  // 廣場路人：排好的快出完才補一批，一樣吃每日上限
  if (input.squareRefill && events.length < budget) events.push({ kind: "square", at: now });
  return events.sort((a, b) => a.at - b.at);
}

/** 角色去逛廣場：24 小時內、沒被摺疊、角色回應還少於 2 則的路人噗，新的優先 */
export function pickSquareVisitTarget(posts: QZonePost[], now: number, characterIds: Set<string>): QZonePost | null {
  const candidates = posts.filter(
    (p) =>
      !!p.npc &&
      !p.moderation &&
      p.timestamp <= now &&
      now - p.timestamp <= 24 * H &&
      p.comments.filter((c) => characterIds.has(c.authorId)).length < 2,
  );
  candidates.sort((a, b) => b.timestamp - a.timestamp);
  return candidates[0] ?? null;
}

export function pickPoster(
  cfg: PlurkDirectorConfig,
  friendIds: string[],
  at: number,
  random: () => number = Math.random,
): string | null {
  const hour = new Date(at).getHours();
  const candidates = friendIds.filter((id) => {
    const role = getRole(cfg, id);
    if (role !== "often") return false;
    if (cfg.mode === "list" && cfg.roles[id] !== "often") return false;
    return !cfg.followRoutine || isInRoutine(cfg.routines[id] ?? "any", hour);
  });
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)];
}

export function pickReplyTarget(posts: QZonePost[], now: number): QZonePost | null {
  const recent = posts.filter(
    (p) => p.timestamp <= now && now - p.timestamp <= 24 * H && !getTheaterPostId(p) && p.type !== "repost" && visibleComments(p, now).length < 3,
  );
  recent.sort((a, b) => {
    const mine = Number(b.authorType === "user") - Number(a.authorType === "user");
    return mine !== 0 ? mine : b.timestamp - a.timestamp;
  });
  return recent[0] ?? null;
}
