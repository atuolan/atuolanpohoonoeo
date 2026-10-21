/**
 * 噗浪的「正在回應」狀態與延遲回應到點通知
 */

import { reactive } from "vue";

export const plurkActivity = reactive<{
  /** postId → 這次批量生成挑到的角色名字 */
  generating: Record<string, string[]>;
  /** commentId → 正在單則重生 */
  regenerating: Record<string, boolean>;
}>({ generating: {}, regenerating: {} });

export function setGenerating(postId: string, names: string[]): void {
  plurkActivity.generating[postId] = names;
}

export function clearGenerating(postId: string): void {
  delete plurkActivity.generating[postId];
}
