/**
 * 噗浪元件共用的資料型別（元件只吃這些已整理好的資料，不碰 store）
 */

import type { MediaItem, PlurkAudience, PlurkReplyPolicy } from "@/types/qzone";

export type PlurkTabId = "river" | "square" | "notice" | "me";

export interface PlurkCardResponse {
  id: string;
  username: string;
  html: string;
}

export interface PlurkCardData {
  id: string;
  authorName: string;
  authorAvatar?: string;
  /** 例：「34 分鐘前 · 好友可見」 */
  metaText: string;
  qualifier?: string;
  /** 已經安全渲染好的內文（renderPlurkContent） */
  html: string;
  images: string[];
  videos: string[];
  repost?: { authorName: string; authorAvatar?: string; qualifier?: string; text: string; images: string[] };
  /** 有值時是小劇場連結卡 */
  theater?: { title: string };
  /** 最多 2 則 */
  latestResponses: PlurkCardResponse[];
  responseCount: number;
  hasUnread: boolean;
  likeCount: number;
  liked: boolean;
  repostCount: number;
  bookmarked: boolean;
  muted: boolean;
  /** 從時間軸點過來時閃一下 */
  highlighted?: boolean;
}

export interface RiverBubbleData {
  postId: string;
  authorName: string;
  authorAvatar?: string;
  qualifier?: string;
  text: string;
  unread: boolean;
}

export interface PlurkAction {
  id: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
}

export interface PickerCharacter {
  id: string;
  name: string;
  avatar?: string;
  note?: string;
  disabled?: boolean;
}

export interface PersonaOption {
  id: string;
  name: string;
  avatar?: string;
  groupName?: string;
}

export interface MentionCandidate {
  id: string;
  name: string;
  avatar?: string;
}

export interface ThreadQuickAction {
  id: "follow" | "everyone" | "newcomer";
  label: string;
  characterIds: string[];
}

export interface ThreadResponseRow {
  id: string;
  authorName: string;
  authorAvatar?: string;
  isOp: boolean;
  timeText: string;
  qualifier?: string;
  replyToName?: string;
  html: string;
  canRegenerate: boolean;
  regenerating: boolean;
}

export interface ThreadPostData {
  authorName: string;
  authorAvatar?: string;
  metaText: string;
  qualifier?: string;
  html: string;
  images: string[];
  likeCount: number;
  repostCount: number;
  muted: boolean;
}

export interface ComposeState {
  content: string;
  qualifier: string;
  media: MediaItem[];
  audience: PlurkAudience;
  privateTo: string[];
  replyPolicy: PlurkReplyPolicy;
  replyPickIds: string[];
  allowPasserby: boolean;
  slowReplies: boolean;
}

export interface NoticeRow {
  postId: string;
  commentId: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  timeText: string;
  unread: boolean;
}

export interface MeListRow {
  postId: string;
  qualifier?: string;
  text: string;
  meta: string;
}

export interface DirectorRosterItem {
  id: string;
  name: string;
  avatar?: string;
}

/** 廣場列表的一列 */
export interface SquareCardData {
  id: string;
  /** 偷偷說時是「偷偷說 #4721」 */
  authorName: string;
  authorAvatar?: string;
  /** 路人的頭像底色 */
  avatarColor?: string;
  /** 名字旁顯示「角色」小框 */
  isCharacter: boolean;
  /** 例：「18:12 · 全員」 */
  metaText: string;
  qualifier?: string;
  /** 純文字內文 */
  text: string;
  replyCount: number;
  /** 回應數泡泡用主色 */
  fresh: boolean;
  /** 角色的最新一則回應（沒有就不顯示） */
  latestReply?: { name: string; text: string };
  /** 「這個語氣，好像在哪見過」 */
  peekHint: boolean;
  /** 被版主摺疊：只顯示一行灰字 */
  foldedReason?: string;
}
