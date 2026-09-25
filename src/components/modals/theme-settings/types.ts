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
