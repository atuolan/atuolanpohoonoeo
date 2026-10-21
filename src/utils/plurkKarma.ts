/**
 * 卡馬與角色個人頁的統計（純函式）：活躍度、一天出沒時段、平均多快回、互動次數
 */

import type { QZoneComment, QZonePost } from "@/types/qzone";
import { getLikeTotal } from "@/utils/plurkPost";
import { visibleComments } from "@/utils/plurkRiver";

const DAY = 86_400_000;
const KARMA_BASE = 50;
const KARMA_WINDOW = 30 * DAY;
const IDLE_GRACE_DAYS = 7;

/** 誰：判斷一則噗或回應是不是他寫的 */
export interface KarmaOwner {
  ownsPost: (post: QZonePost) => boolean;
  ownsComment: (comment: QZoneComment) => boolean;
}

/** 使用者（所有人設都算） */
export const USER_OWNER: KarmaOwner = {
  ownsPost: (p) => p.authorType === "user",
  ownsComment: (c) => c.authorType === "user",
};

export function characterOwner(characterId: string): KarmaOwner {
  return {
    ownsPost: (p) => p.authorId === characterId && p.authorType === "ai",
    ownsComment: (c) => c.authorId === characterId && c.authorType === "ai",
  };
}

/** 卡馬 0–100、一位小數：近 30 天的噗、收到的回應與喜歡；超過 7 天沒發噗每天扣 1.5 */
export function computeKarma(posts: QZonePost[], owner: KarmaOwner, now: number): number {
  const mine = posts.filter((p) => owner.ownsPost(p) && p.timestamp <= now);
  let karma = KARMA_BASE;
  for (const post of mine) {
    if (now - post.timestamp > KARMA_WINDOW) continue;
    const received = visibleComments(post, now).filter((c) => !owner.ownsComment(c)).length;
    karma += 0.8 + received * 0.3 + getLikeTotal(post) * 0.1;
  }
  if (mine.length > 0) {
    const last = Math.max(...mine.map((p) => p.timestamp));
    const idleDays = Math.floor((now - last) / DAY) - IDLE_GRACE_DAYS;
    if (idleDays > 0) karma -= idleDays * 1.5;
  }
  return Math.round(Math.min(100, Math.max(0, karma)) * 10) / 10;
}

/** 這個人所有噗與回應的時間（已經出現的） */
export function activityTimes(posts: QZonePost[], owner: KarmaOwner, now: number): number[] {
  const times: number[] = [];
  for (const post of posts) {
    if (owner.ownsPost(post) && post.timestamp <= now) times.push(post.timestamp);
    for (const c of visibleComments(post, now)) if (owner.ownsComment(c)) times.push(c.timestamp);
  }
  return times;
}

/** 一天 24 小時各出現幾次（本機時間） */
export function hourHistogram(times: number[]): number[] {
  const hours = new Array<number>(24).fill(0);
  for (const t of times) hours[new Date(t).getHours()]++;
  return hours;
}

/** 加總最多的連續 3 小時起點（可跨午夜）；全 0 時 null */
export function peakStart(hours: number[]): number | null {
  let best = -1;
  let bestSum = 0;
  for (let start = 0; start < 24; start++) {
    const sum = hours[start] + hours[(start + 1) % 24] + hours[(start + 2) % 24];
    if (sum > bestSum) {
      bestSum = sum;
      best = start;
    }
  }
  return best < 0 ? null : best;
}

/** 「凌晨 0–3 點」「晚上 22–1 點」 */
export function peakLabel(start: number): string {
  const period = start < 6 ? "凌晨" : start < 12 ? "早上" : start < 18 ? "下午" : "晚上";
  return `${period} ${start}–${(start + 3) % 24} 點`;
}

/** 他回使用者的噗平均幾分鐘（每則噗算他第一則回應）；沒有資料 null */
export function averageReplyMinutes(posts: QZonePost[], characterId: string, now: number): number | null {
  const delays: number[] = [];
  for (const post of posts) {
    if (post.authorType !== "user") continue;
    const first = visibleComments(post, now).find((c) => c.authorId === characterId && c.authorType === "ai");
    if (first) delays.push(Math.max(0, first.timestamp - post.timestamp));
  }
  if (delays.length === 0) return null;
  return Math.max(1, Math.round(delays.reduce((a, b) => a + b, 0) / delays.length / 60_000));
}

/** 他和使用者互動幾次：他回使用者的噗＋使用者回他的噗 */
export function interactionCount(posts: QZonePost[], characterId: string, now: number): number {
  let count = 0;
  for (const post of posts) {
    const comments = visibleComments(post, now);
    if (post.authorType === "user") {
      count += comments.filter((c) => c.authorId === characterId && c.authorType === "ai").length;
    } else if (post.authorId === characterId) {
      count += comments.filter((c) => c.authorType === "user").length;
    }
  }
  return count;
}

/** 跟他在噗浪互動過的人數（使用者算一人，路人不算） */
export function acquaintanceCount(posts: QZonePost[], characterId: string, now: number): number {
  const keyOf = (authorId: string, authorType?: string) =>
    authorType === "user" ? "me" : authorId.startsWith("passerby-") || authorId.startsWith("npc-") ? null : authorId;
  const people = new Set<string>();
  for (const post of posts) {
    const comments = visibleComments(post, now);
    if (post.authorId === characterId) {
      for (const c of comments) {
        const key = keyOf(c.authorId, c.authorType);
        if (key && key !== characterId) people.add(key);
      }
    } else if (comments.some((c) => c.authorId === characterId)) {
      const key = keyOf(post.authorId, post.authorType);
      if (key && key !== characterId && !post.anonOf) people.add(key);
    }
  }
  return people.size;
}
