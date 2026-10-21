/**
 * AI 導演的自動模式排程（純函式）：這次要發生幾個事件、在什麼時間、誰來發噗、回哪一則
 */

import type { QZonePost } from "@/types/qzone";
import { getTheaterPostId } from "@/utils/plurkPost";
import { visibleComments } from "@/utils/plurkRiver";
import { dayKey, getRole, isInRoutine, LIVELINESS_RATES, type PlurkDirectorConfig } from "@/utils/plurkDirectorConfig";

export interface DirectorEvent {
  kind: "post" | "reply";
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

export function planDirectorEvents(input: { cfg: PlurkDirectorConfig; now: number; random?: () => number }): DirectorEvent[] {
  const { cfg, now } = input;
  const random = input.random ?? Math.random;
  if (cfg.mode === "off" || cfg.lastRunAt <= 0 || now <= cfg.lastRunAt) return [];

  const elapsed = now - cfg.lastRunAt;
  const expected = (estimateCallsPerHour(cfg) * elapsed) / H;
  const catchUp = elapsed > CATCH_UP_AFTER;
  const whole = Math.floor(expected);
  let count = whole + (random() < expected - whole ? 1 : 0);
  count = Math.min(count, catchUp ? MAX_CATCH_UP : MAX_PER_CHECK, remainingToday(cfg, now));
  if (count <= 0) return [];

  const events: DirectorEvent[] = [];
  for (let i = 0; i < count; i++) {
    const at = catchUp ? cfg.lastRunAt + Math.round(((i + random()) / count) * elapsed) : now;
    events.push({ kind: random() < POST_SHARE ? "post" : "reply", at: Math.min(at, now) });
  }
  return events.sort((a, b) => a.at - b.at);
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
    (p) => now - p.timestamp <= 24 * H && !getTheaterPostId(p) && p.type !== "repost" && visibleComments(p, now).length < 3,
  );
  recent.sort((a, b) => {
    const mine = Number(b.authorType === "user") - Number(a.authorType === "user");
    return mine !== 0 ? mine : b.timestamp - a.timestamp;
  });
  return recent[0] ?? null;
}
