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
  /** 廣場：名字旁「角色」小框、「只看角色」用 */
  isCharacter?: boolean;
  /** 路人頭像底色 */
  avatarColor?: string;
  /** 偷偷說裡使用者自己的代號：名字用綠色 */
  isMe?: boolean;
  /** 被版主刪除：整列只顯示這行灰字 */
  removedText?: string;
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
  /** 路人頭像底色 */
  authorColor?: string;
  /** 被摺疊等：原噗上方一行灰字 */
  notice?: string;
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

/** 通知分頁的一列（回應、讚、系統） */
export interface NoticeListRow {
  id: string;
  kind: "reply" | "like" | "system";
  /** 粗體的人名或系統來源（「版主 阿杏」「版務公告」） */
  title: string;
  text: string;
  timeText: string;
  unread: boolean;
  avatar?: string;
  avatarColor?: string;
  /** 系統列的圓點：alert＝處分（錯誤色），neutral＝公告（灰） */
  tone?: "alert" | "neutral";
  /** 琥珀小字，點了開這位角色的 PEEK */
  peekCharacterId?: string;
  peekText?: string;
  postId?: string;
  commentId?: string;
}

/** 通知分頁頂端的禁言卡 */
export interface BanCardData {
  /** 「你在廣場被禁言 3 天」 */
  title: string;
  /** 「版主 阿杏 · 今天 19:12」 */
  byText: string;
  reason: string;
  remainDays: number;
  remainHours: number;
  impact: string;
  rules: string[];
  /** null＝還沒申訴 */
  appeal: null | {
    reason: string;
    /** 0 已送出、1 審核中、2 結果 */
    stage: 0 | 1 | 2;
    /** 結果出來時的文字 */
    resultText?: string;
    /** 進度下方的說明 */
    note: string;
  };
}

/** 角色個人頁 */
export interface ProfileData {
  id: string;
  name: string;
  avatar?: string;
  /** 封面與頭像的主色 */
  coverColor: string;
  /** 「@tanyao」 */
  handle: string;
  /** 「註冊於 2025 年 3 月」 */
  joinedText: string;
  bio: string;
  isFriend: boolean;
  stats: { posts: number; responses: number; friends: number; karma: number };
  /** 互動次數 */
  interactions: number;
  /** 24 個小時各出現幾次 */
  hours: number[];
  /** 「凌晨 0–3 點」；沒資料 null */
  peakText: string | null;
  /** 「回你的噗，平均 4 分鐘就回。」；沒資料 null */
  avgReplyText: string | null;
  /** null＝還沒整理過 */
  impressions: string[] | null;
  /** 有私聊才能偷看手機 */
  canPeek: boolean;
  posts: MeListRow[];
  responses: MeListRow[];
  /** 他有幾則私噗沒給你看 */
  privateCount: number;
}
