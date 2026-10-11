/**
 * 新版型的「可改結構提示」
 *
 * 手帳拼貼 / 毛玻璃用到的版型（寫在各組件內），以及五個主題包
 * （奶油風 / Y2K / 極簡黑白 / 珍珠畫廊 / 線描）的主題版型（components/widgets/themed/）。
 * 主題版型的外殼（:scope）是透明的，真正畫外框與底色的是版型內部的 class，
 * 所以每個變體都列出「畫底色的那一層」，AI 改顏色時要針對它，不是 :scope。
 */
import type { WidgetLayoutVariant } from "./widgetStyleHints";

const THEMED_NOTE = "主題版型：:scope 是透明外殼，外觀都畫在下列 class 上。";

export const THEMED_LAYOUT_TIP =
  "主題版型（pastry / mp3 / masthead / plaque / sketch / round / window / capsule / speech / msn / macaron / jelly… 等）的 :scope 是透明外殼；要改底色、邊框、圓角，請針對該版型列出的「卡片 / 外框」class 寫規則，不要寫在 :scope。";

export const EXTRA_CLOCK_VARIANTS: WidgetLayoutVariant[] = [
  {
    id: "scrapbook",
    desc: "手帳：手寫大字時間 + 撕頁日曆（手帳拼貼）",
    visualTraits: "霞鶩文楷手寫字、無卡片底，右側傾斜的撕頁日曆（紅色月份帶）。",
    classes: [
      { selector: ".scrapbook-clock", usage: "樣式容器" },
      { selector: ".sb-time", usage: "手寫大字時間" },
      { selector: ".sb-calendar", usage: "撕頁日曆卡（白底、傾斜、陰影）" },
      { selector: ".sb-cal-month / .sb-cal-day / .sb-cal-weekday", usage: "月份色帶 / 日期大字 / 星期" },
    ],
  },
  {
    id: "headline",
    desc: "大字：日期在上、細體大字時間靠左（毛玻璃）",
    visualTraits: "Sora 200 細體數字、無卡片底，直接疊在桌布上。",
    classes: [
      { selector: ".headline-clock", usage: "樣式容器" },
      { selector: ".hl-date", usage: "日期小字" },
      { selector: ".hl-time", usage: "細體大字時間" },
    ],
  },
  {
    id: "pastry",
    desc: "甜點櫃：圓形錶盤卡（奶油風）",
    visualTraits: `${THEMED_NOTE}奶白圓角卡、焦糖色重點、Fraunces 數字。`,
    classes: [
      { selector: ".cream-clock__card", usage: "奶白圓角卡（畫底色的那一層）" },
      { selector: ".cream-clock__dial", usage: "圓形錶盤" },
      { selector: ".cream-clock__hand", usage: "時針 / 分針" },
      { selector: ".cream-clock__tick", usage: "刻度點" },
    ],
  },
  {
    id: "mp3",
    desc: "MP3：液晶螢幕 + 觸控轉盤，同時控制音樂（Y2K）",
    visualTraits: `${THEMED_NOTE}銀色機身、綠色液晶、DotGothic16 點陣字。`,
    classes: [
      { selector: ".y2kc-body", usage: "銀色機身（畫底色的那一層）" },
      { selector: ".y2kc-screen", usage: "液晶螢幕（綠色漸層）" },
      { selector: ".y2kc-time / .y2kc-sec", usage: "時間 / 秒數" },
      { selector: ".y2kc-date / .y2kc-song", usage: "日期 / 正在播放的歌" },
      { selector: ".y2kc-cells", usage: "分段進度條" },
    ],
  },
  {
    id: "masthead",
    desc: "刊頭：雜誌刊頭 + 超大襯線時間（極簡黑白）",
    visualTraits: `${THEMED_NOTE}無卡片、1px 油墨細線、Instrument Serif 數字。`,
    classes: [
      { selector: ".mono-clock__head", usage: "刊頭列（203 PHONE + 日期，下有細線）" },
      { selector: ".mono-clock__time", usage: "超大襯線時間" },
      { selector: ".mono-clock__zh", usage: "直書中文時間" },
    ],
  },
  {
    id: "plaque",
    desc: "名牌：黃銅名牌（珍珠畫廊）",
    visualTraits: `${THEMED_NOTE}金色漸層銅牌、四角螺絲、Cormorant Garamond 數字。`,
    classes: [
      { selector: ".pearl-clock__plate", usage: "黃銅名牌（畫底色的那一層）" },
      { selector: ".pearl-clock__time / .pearl-clock__date", usage: "時間 / 中文日期" },
      { selector: ".pearl-clock__screw", usage: "四角螺絲" },
    ],
  },
  {
    id: "sketch",
    desc: "速寫：手繪錶盤 + 波浪底線（線描）",
    visualTraits: `${THEMED_NOTE}純黑 1.6px 線、手繪歪圓、零彩色。`,
    classes: [
      { selector: ".sk-clock__dial", usage: "手繪歪圓錶盤" },
      { selector: ".sk-clock__hand", usage: "時針 / 分針" },
      { selector: ".sk-clock__text", usage: "時間、波浪線與日期" },
    ],
  },
];

export const EXTRA_POLAROID_VARIANTS: WidgetLayoutVariant[] = [
  {
    id: "scrapbook",
    desc: "拼貼：傾斜拍立得 + 紙膠帶 + 手寫標題（手帳拼貼）",
    classes: [
      { selector: ".sb-tape", usage: "頂端紙膠帶" },
      { selector: ".caption-area / .caption-input", usage: "下緣手寫標題" },
    ],
  },
  {
    id: "frame",
    desc: "滿版：照片填滿圓角卡片（毛玻璃）",
    classes: [{ selector: ".photo-area / .placeholder", usage: "照片區 / 佔位文字（跟著前景色）" }],
  },
  {
    id: "round",
    desc: "圓形照片 + 奶白圓環（奶油風）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".cream-polaroid__ring", usage: "奶白圓環（畫底色的那一層）" },
      { selector: ".cream-polaroid__photo / .cream-polaroid__img", usage: "內圓照片區 / 照片" },
    ],
  },
  {
    id: "window",
    desc: "「我的相片」視窗（Y2K）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".y2kp-win", usage: "視窗外框（畫底色的那一層）" },
      { selector: ".y2kp-bar / .y2kp-title / .y2kp-dots", usage: "標題列 / 標題 / 三顆圓鈕" },
      { selector: ".y2kp-stage", usage: "棋盤格內容區" },
    ],
  },
  {
    id: "plain",
    desc: "素面灰底方形（極簡黑白）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".mono-polaroid", usage: "灰底方形" },
      { selector: ".mono-polaroid__img", usage: "照片" },
    ],
  },
  {
    id: "gilded",
    desc: "金框油畫（珍珠畫廊）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".pearl-polaroid__frame", usage: "金色畫框（畫底色的那一層）" },
      { selector: ".pearl-polaroid__paper", usage: "米白卡紙" },
      { selector: ".pearl-polaroid__canvas", usage: "畫作 / 照片區" },
    ],
  },
  {
    id: "sketch",
    desc: "手繪相框 + 山與太陽塗鴉（線描）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".sk-polaroid", usage: "手繪歪框（畫邊框的那一層）" },
      { selector: ".sk-polaroid__doodle", usage: "山與太陽塗鴉 SVG" },
      { selector: ".sk-polaroid__photo", usage: "照片" },
    ],
  },
];

export const EXTRA_MUSIC_VARIANTS: WidgetLayoutVariant[] = [
  {
    id: "ticket",
    desc: "手帳票根：唱片存根 + 撕線 + 缺口（手帳拼貼）",
    classes: [
      { selector: ".ticket-layout", usage: "票根本體" },
      { selector: ".ticket-stub / .ticket-disc", usage: "左側存根 / 唱片" },
      { selector: ".ticket-label / .ticket-title / .ticket-artist", usage: "「正在播放」/ 歌名 / 歌手" },
      { selector: ".ticket-play", usage: "播放鈕" },
    ],
  },
  {
    id: "stack",
    desc: "方塊：正方形格子用的三段式（毛玻璃）",
    classes: [
      { selector: ".stack-layout", usage: "三段式容器" },
      { selector: ".stack-art", usage: "封面" },
      { selector: ".stack-bar / .stack-fill", usage: "進度條 / 已播放" },
      { selector: ".stack-play / .stack-btn", usage: "播放鈕 / 上下首" },
    ],
  },
  {
    id: "capsule",
    desc: "膠囊：圓潤播放條（奶油風）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".cream-music__bar", usage: "膠囊本體（畫底色的那一層）" },
      { selector: ".cream-music__disc", usage: "焦糖唱片" },
      { selector: ".cream-music__track / .cream-music__fill", usage: "進度條" },
      { selector: ".cream-music__play", usage: "播放鈕" },
    ],
  },
  {
    id: "editorial",
    desc: "雜誌：細線與襯線字（極簡黑白）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".mono-music__title / .mono-music__artist", usage: "歌名 / 歌手" },
      { selector: ".mono-music__play", usage: "細框圓形播放鈕" },
      { selector: ".mono-music__track / .mono-music__fill", usage: "細進度線" },
    ],
  },
  {
    id: "audioguide",
    desc: "語音導覽機（珍珠畫廊）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".pearl-music", usage: "導覽機本體（畫底色的那一層）" },
      { selector: ".pearl-music__headset", usage: "耳機圓圈" },
      { selector: ".pearl-music__track / .pearl-music__fill", usage: "金色進度線" },
      { selector: ".pearl-music__play", usage: "金色播放鈕" },
    ],
  },
  {
    id: "sketch",
    desc: "速寫：手繪波形線（線描）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".sk-music", usage: "手繪歪框長條（畫邊框的那一層）" },
      { selector: ".sk-music__play", usage: "歪圓播放鈕" },
      { selector: ".sk-music__wave", usage: "波形 SVG" },
    ],
  },
];

export const RECENT_CHAT_VARIANTS: WidgetLayoutVariant[] = [
  { id: "bubble", desc: "氣泡：頭像 + 對話氣泡預覽" },
  { id: "card", desc: "卡片：頭像 + 訊息卡" },
  {
    id: "sticky",
    desc: "便條紙：黃色便利貼 + 紙膠帶，貼圖變印章（手帳拼貼）",
    classes: [
      { selector: ".sticky-tape", usage: "紙膠帶" },
      { selector: ".sticky-header / .sticky-text", usage: "名字與時間 / 訊息" },
      { selector: ".sticky-stamp / .sticky-sticker", usage: "貼圖印章 / 貼圖圖片" },
    ],
  },
  {
    id: "speech",
    desc: "對話泡泡（奶油風）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".cream-chat__card", usage: "泡泡卡（畫底色的那一層）" },
      { selector: ".cream-chat__name / .cream-chat__time / .cream-chat__text", usage: "名字 / 時間 / 訊息" },
    ],
  },
  {
    id: "msn",
    desc: "MSN 對話視窗（Y2K）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".y2kch-win", usage: "視窗外框（畫底色的那一層）" },
      { selector: ".y2kch-bar", usage: "標題列" },
    ],
  },
  {
    id: "quote",
    desc: "雜誌引言（極簡黑白）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".mono-chat__quote / .mono-chat__mark", usage: "引文 / 大引號" },
      { selector: ".mono-chat__sign", usage: "署名" },
    ],
  },
  {
    id: "placard",
    desc: "展品說明牌（珍珠畫廊）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".pearl-chat", usage: "說明牌（畫底色的那一層）" },
      { selector: ".pearl-chat__name / .pearl-chat__message", usage: "名字 / 訊息" },
    ],
  },
  {
    id: "sketch",
    desc: "手繪對話泡泡（線描）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".sk-chat__bubble", usage: "手繪泡泡（畫邊框的那一層）" },
      { selector: ".sk-chat__name / .sk-chat__msg", usage: "名字 / 訊息" },
    ],
  },
];

export const APP_ICON_VARIANTS: WidgetLayoutVariant[] = [
  {
    id: "default",
    desc: "內建圓角圖標",
    classes: [
      { selector: ".blob-shape", usage: "圖標底塊" },
      { selector: ".label", usage: "名稱" },
    ],
  },
  {
    id: "macaron",
    desc: "馬卡龍（奶油風）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".cream-app__macaron", usage: "馬卡龍圓（畫底色的那一層）" },
      { selector: ".cream-app__label", usage: "名稱" },
    ],
  },
  {
    id: "jelly",
    desc: "果凍泡泡（Y2K）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".y2ka-bubble", usage: "果凍泡泡（畫底色的那一層）" },
      { selector: ".y2ka-label", usage: "名稱" },
    ],
  },
  {
    id: "index",
    desc: "編號目錄列（極簡黑白）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".mono-app__index / .mono-app__label / .mono-app__arrow", usage: "編號 / 名稱 / 箭頭" },
      { selector: ".mono-app__inner", usage: "整列（底部細線）" },
    ],
  },
  {
    id: "pearl-orb",
    desc: "珍珠（珍珠畫廊）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".pearl-app__pearl", usage: "珍珠（畫底色的那一層）" },
      { selector: ".pearl-app__label", usage: "名稱" },
    ],
  },
  {
    id: "sketch",
    desc: "手繪歪圓（線描）",
    visualTraits: THEMED_NOTE,
    classes: [
      { selector: ".sk-app__frame", usage: "手繪歪圓框" },
      { selector: ".sk-app__label", usage: "名稱" },
    ],
  },
];
