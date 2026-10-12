import type { AvatarStyle, BubbleStyle } from "@/stores";
import type { ChatAppearance, ChatBarStyle, ChatBubbleEffects, ChatMessageSpacing } from "@/types/chat";

export type ChatWallpaperStyle = NonNullable<ChatAppearance["wallpaper"]>;
export type ChatFontStyle = Omit<NonNullable<ChatAppearance["font"]>, "size"> & {
  markdownColors: NonNullable<NonNullable<ChatAppearance["font"]>["markdownColors"]>;
};
export type ChatColors = Required<Omit<NonNullable<ChatAppearance["colors"]>, "unified">>;

/** 預覽中可點選的元素；點選後設定區只顯示該元素的完整設定 */
export type PreviewElement =
  | "ai"
  | "user"
  | "thought"
  | "avatar"
  | "header"
  | "input"
  | "surface"
  | "surfaceHover"
  | "status";
/**
 * 精簡預覽的情境：依正在調整的設定區，只畫相關的部分
 * pair = AI 一則＋我一則；thought = AI 一則＋想法；conversation = 角色連續兩則＋我一則（看排版與間距）；
 * messages = conversation＋想法；colors = 一組對話＋色卡；header / input = 只畫頂欄 / 輸入欄；
 * headerPair / pairInput = 頂欄或輸入欄＋一組對話；full = 全部
 */
export type PreviewScene =
  | "pair"
  | "thought"
  | "conversation"
  | "messages"
  | "colors"
  | "header"
  | "input"
  | "headerPair"
  | "pairInput"
  | "full";

/** 預覽點擊目標：元素，或背景（切到背景分頁） */
export type PreviewTarget = PreviewElement | "wallpaper";

export interface PreviewState {
  colors: ChatColors;
  bubble: BubbleStyle;
  avatar: AvatarStyle;
  wallpaper: ChatWallpaperStyle;
  font: ChatFontStyle;
  fontSizePx: number;
  bars: Record<"header" | "input", ChatBarStyle>;
  bubbleEffects: ChatBubbleEffects;
  messageSpacing: ChatMessageSpacing;
}
