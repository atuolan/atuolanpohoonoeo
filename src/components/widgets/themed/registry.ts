// ===== 主題版型註冊表 =====
// 版型 id（寫在 clockStyle / customStyle.layout / data.layout）→ 版型元件。
// 宿主 widget 查到 id 就改用對應元件渲染，查不到則走原本內建的版型。
// 介面見 ./types.ts。
import { defineAsyncComponent, type Component } from "vue";

// 時鐘：data.clockStyle
export const themedClockLayouts: Record<string, Component> = {
  "pastry": defineAsyncComponent(() => import("./cream/CreamClock.vue")),
  "mp3": defineAsyncComponent(() => import("./y2k/Y2kClock.vue")),
  "masthead": defineAsyncComponent(() => import("./mono/MonoClock.vue")),
  "plaque": defineAsyncComponent(() => import("./pearl/PearlClock.vue")),
  "sketch": defineAsyncComponent(() => import("./sketch/SketchClock.vue")),
};

// 拍立得：customStyle.layout
export const themedPolaroidLayouts: Record<string, Component> = {
  "round": defineAsyncComponent(() => import("./cream/CreamPolaroid.vue")),
  "window": defineAsyncComponent(() => import("./y2k/Y2kPolaroid.vue")),
  "plain": defineAsyncComponent(() => import("./mono/MonoPolaroid.vue")),
  "gilded": defineAsyncComponent(() => import("./pearl/PearlPolaroid.vue")),
  "sketch": defineAsyncComponent(() => import("./sketch/SketchPolaroid.vue")),
};

// 音樂：customStyle.layout
export const themedMusicLayouts: Record<string, Component> = {
  "capsule": defineAsyncComponent(() => import("./cream/CreamMusic.vue")),
  "editorial": defineAsyncComponent(() => import("./mono/MonoMusic.vue")),
  "audioguide": defineAsyncComponent(() => import("./pearl/PearlMusic.vue")),
  "sketch": defineAsyncComponent(() => import("./sketch/SketchMusic.vue")),
};

// 最近聊天：data.layout
export const themedChatLayouts: Record<string, Component> = {
  "speech": defineAsyncComponent(() => import("./cream/CreamChat.vue")),
  "msn": defineAsyncComponent(() => import("./y2k/Y2kChat.vue")),
  "quote": defineAsyncComponent(() => import("./mono/MonoChat.vue")),
  "placard": defineAsyncComponent(() => import("./pearl/PearlChat.vue")),
  "sketch": defineAsyncComponent(() => import("./sketch/SketchChat.vue")),
};

// App 圖標（fluid-button）：customStyle.layout
export const themedAppLayouts: Record<string, Component> = {
  "macaron": defineAsyncComponent(() => import("./cream/CreamApp.vue")),
  "jelly": defineAsyncComponent(() => import("./y2k/Y2kApp.vue")),
  "index": defineAsyncComponent(() => import("./mono/MonoApp.vue")),
  "pearl-orb": defineAsyncComponent(() => import("./pearl/PearlApp.vue")),
  "sketch": defineAsyncComponent(() => import("./sketch/SketchApp.vue")),
};
