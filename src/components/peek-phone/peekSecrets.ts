/**
 * 頭盔TA 的秘密：從手機資料推出這支手機藏了哪些秘密、找到了幾個
 * 秘密本身是 AI 生成的欄位（收回的訊息、草稿、最近刪除……），進度存在 data.progress
 */

import type { PeekPhoneData, PeekPhoneTab, PeekProgress } from "@/types/peekPhone";

/** 秘密藏在哪裡（鎖屏密碼在鎖定畫面，其他在 App 裡） */
export type SecretPlace = "lock" | "chat" | "gallery" | "browser" | "settings";

export const PLACE_LABELS: Record<SecretPlace, string> = {
  lock: "鎖定畫面",
  chat: "訊息",
  gallery: "相簿",
  browser: "瀏覽器",
  settings: "設定",
};

export interface PeekSecret {
  /** 存進 progress.revealed 的 key */
  key: string;
  place: SecretPlace;
  /** 找到後在窺視選單顯示的名字 */
  label: string;
  /** 找到後顯示的內容摘要 */
  detail: string;
  /** 還沒找到時的提示 */
  hint: string;
  /** 點了要去的畫面 */
  target: { view: "lock" | PeekPhoneTab; threadId?: string; photoId?: string };
}

export const secretKeys = {
  lock: (passcode: string) => `lock:${passcode}`,
  recalled: (messageId: string) => `recalled:${messageId}`,
  draft: (threadId: string) => `draft:${threadId}`,
  photo: (photoId: string) => `photo:${photoId}`,
  hidden: "hidden",
  browser: "browser",
  screen: "screen",
};

/** 桌面上的 App：算「看過幾 %」用 */
export const HOME_TABS: PeekPhoneTab[] = [
  "chat",
  "gallery",
  "browser",
  "balance",
  "diary",
  "memo",
  "meals",
  "settings",
  "schedule",
];

const firstLine = (text: string) => text.split("\n")[0].trim();

export function listSecrets(data: PeekPhoneData | null): PeekSecret[] {
  if (!data) return [];
  const secrets: PeekSecret[] = [];

  if (data.lockScreen) {
    secrets.push({
      key: secretKeys.lock(data.lockScreen.passcode),
      place: "lock",
      label: `鎖屏密碼 ${data.lockScreen.passcode}`,
      detail: data.lockScreen.reveal,
      hint: data.lockScreen.hint ? `鎖屏密碼：${data.lockScreen.hint}` : "鎖屏密碼還沒解開",
      target: { view: "lock" },
    });
  }

  for (const thread of data.chats) {
    for (const m of thread.messages) {
      if (!m.recalled) continue;
      secrets.push({
        key: secretKeys.recalled(m.id),
        place: "chat",
        label: m.isSelf
          ? `對${thread.contactName}收回的那句話`
          : `${m.senderName || thread.contactName}收回的那句話`,
        detail: firstLine(m.content),
        hint: `訊息：跟${thread.contactName}的對話裡，有一則被收回了`,
        target: { view: "chat", threadId: thread.id },
      });
    }
    if (thread.draft) {
      secrets.push({
        key: secretKeys.draft(thread.id),
        place: "chat",
        label: `想跟${thread.contactName}說、沒送出的話`,
        detail: firstLine(thread.draft),
        hint: `訊息：跟${thread.contactName}的輸入框裡還有字`,
        target: { view: "chat", threadId: thread.id },
      });
    }
  }

  for (const photo of data.gallery) {
    if (!photo.deletedDaysLeft || !photo.secret) continue;
    secrets.push({
      key: secretKeys.photo(photo.id),
      place: "gallery",
      label: "刪了又留著的照片",
      detail: firstLine(photo.description),
      hint: "相簿：「最近刪除」裡有一張照片有故事",
      target: { view: "deleted", photoId: photo.id },
    });
  }

  if (data.hiddenPhotos.length > 0) {
    secrets.push({
      key: secretKeys.hidden,
      place: "gallery",
      label: "藏起來的相簿",
      detail: `${data.hiddenPhotos.length} 張照片`,
      hint: "相簿：最下面有一個上鎖的相簿",
      target: { view: "hidden" },
    });
  }

  const privateCount = data.browserHistory.filter((e) => e.category === "adult").length;
  if (privateCount > 0) {
    secrets.push({
      key: secretKeys.browser,
      place: "browser",
      label: "無痕瀏覽紀錄",
      detail: `${privateCount} 筆`,
      hint: "瀏覽器：有幾筆紀錄不在一般歷史裡",
      target: { view: "browser" },
    });
  }

  if (data.screenTime?.insight) {
    secrets.push({
      key: secretKeys.screen,
      place: "settings",
      label: "螢幕使用時間透露的事",
      detail: firstLine(data.screenTime.insight),
      hint: "設定：看看今天什麼時候在用手機",
      target: { view: "settings" },
    });
  }

  return secrets;
}

export function progressOf(data: PeekPhoneData | null): PeekProgress {
  return data?.progress ?? { unlocked: false, revealed: [], viewed: [] };
}

/** 各處還沒找到的秘密數 */
export function unfoundByPlace(
  secrets: PeekSecret[],
  progress: PeekProgress,
): Record<SecretPlace, number> {
  const counts: Record<SecretPlace, number> = { lock: 0, chat: 0, gallery: 0, browser: 0, settings: 0 };
  for (const s of secrets) {
    if (!progress.revealed.includes(s.key)) counts[s.place]++;
  }
  return counts;
}

/** 桌面上的 App 看過幾 % */
export function viewedPercent(progress: PeekProgress): number {
  const seen = HOME_TABS.filter((t) => progress.viewed.includes(t)).length;
  return Math.round((seen / HOME_TABS.length) * 100);
}

/** 秘密在哪個 App 裡：內頁（已隱藏、最近刪除、記事本）算在所屬的 App */
export function placeOfView(view: "lock" | "home" | PeekPhoneTab): SecretPlace | null {
  if (view === "lock") return "lock";
  if (view === "chat") return "chat";
  if (view === "gallery" || view === "hidden" || view === "deleted") return "gallery";
  if (view === "browser") return "browser";
  if (view === "settings") return "settings";
  return null;
}

/** 看過哪個桌面 App：內頁算在所屬的 App */
export function homeTabOfView(view: PeekPhoneTab): PeekPhoneTab {
  if (view === "hidden" || view === "deleted") return "gallery";
  if (view === "notes") return "memo";
  return view;
}
