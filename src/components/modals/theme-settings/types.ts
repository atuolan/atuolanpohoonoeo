import type { AvatarStyle, BubbleStyle } from "@/stores";
import type { ChatAppearance } from "@/types/chat";

export type ChatWallpaperStyle = NonNullable<ChatAppearance["wallpaper"]>;
export type ChatFontStyle = Omit<NonNullable<ChatAppearance["font"]>, "size"> & {
  markdownColors: NonNullable<NonNullable<ChatAppearance["font"]>["markdownColors"]>;
};
export type ChatColors = Required<Omit<NonNullable<ChatAppearance["colors"]>, "unified">>;

/** 預覽中可點擊調整顏色的區塊 */
export type ColorFocusTarget = "ai" | "user" | "header" | "surface" | "surfaceHover" | "status";
/** 預覽點擊目標：顏色區塊，或背景（切到背景分頁） */
export type PreviewTarget = ColorFocusTarget | "wallpaper";

export interface PreviewState {
  colors: ChatColors;
  bubble: BubbleStyle;
  avatar: AvatarStyle;
  wallpaper: ChatWallpaperStyle;
  font: ChatFontStyle;
  fontSizePx: number;
}
