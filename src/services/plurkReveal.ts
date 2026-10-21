/**
 * 噗浪的「正在回應」狀態與延遲回應到點通知
 */

import { useNotificationStore } from "@/stores/notification";
import { useQzoneStore } from "@/stores/qzone";
import type { QZoneComment, QZonePost } from "@/types/qzone";
import { isPostFollowed } from "@/utils/plurkRiver";
import { reactive } from "vue";

export const plurkActivity = reactive<{
  /** postId → 這次批量生成挑到的角色名字 */
  generating: Record<string, string[]>;
  /** commentId → 正在單則重生 */
  regenerating: Record<string, boolean>;
  /** 廣場路人噗生成中 */
  square: boolean;
}>({ generating: {}, regenerating: {}, square: false });

export function setGenerating(postId: string, names: string[]): void {
  plurkActivity.generating[postId] = names;
}

export function clearGenerating(postId: string): void {
  delete plurkActivity.generating[postId];
}

const TYPING_WINDOW = 3 * 60_000;
const TICK_MS = 30_000;

/** (since, now] 之間到點、需要通知的 AI 回應 */
export function findDueComments(posts: QZonePost[], since: number, now: number) {
  const due: Array<{ post: QZonePost; comment: QZoneComment }> = [];
  for (const post of posts) {
    if (post.muted || !isPostFollowed(post)) continue;
    for (const comment of post.comments) {
      if (comment.authorType === "ai" && comment.timestamp > since && comment.timestamp <= now) {
        due.push({ post, comment });
      }
    }
  }
  return due;
}

/** 每則噗「正在回應」的名字：生成中＋快要出現的 */
export function getTypingNames(
  posts: QZonePost[],
  now: number,
  generating: Record<string, string[]>,
  windowMs = TYPING_WINDOW,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const add = (postId: string, name: string) => {
    const list = (result[postId] ??= []);
    if (!list.includes(name)) list.push(name);
  };
  for (const post of posts) {
    for (const comment of post.comments) {
      if (comment.timestamp > now && comment.timestamp <= now + windowMs) add(post.id, comment.username);
    }
  }
  for (const [postId, names] of Object.entries(generating)) names.forEach((n) => add(postId, n));
  return result;
}

let tickTimer: number | null = null;
let lastTick = Date.now();

/** App 開著時每 30 秒檢查一次，剛到點的回應發通知 */
export function startPlurkRevealTicker(): void {
  if (tickTimer !== null) return;
  lastTick = Date.now();
  tickTimer = window.setInterval(() => {
    const now = Date.now();
    const qzoneStore = useQzoneStore();
    if (qzoneStore.isLoaded) {
      const notificationStore = useNotificationStore();
      for (const { comment } of findDueComments(qzoneStore.posts, lastTick, now)) {
        notificationStore.notifyQzoneComment(comment.username || "角色", comment.avatar, comment.authorId);
      }
    }
    lastTick = now;
  }, TICK_MS);
}
