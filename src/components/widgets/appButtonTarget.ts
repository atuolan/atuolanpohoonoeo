// 主頁 App 圖示（流體按鈕）的標籤 → 要打開的頁面 id（App.vue handleNavigate 認得的）
// 未讀紅點也用這個 id 去 homeBadges 查數字，跟轉盤 Dock 共用
const PAGE_BY_LABEL: Record<string, string> = {
  訊息: "message",
  設置: "settings",
  空間: "space",
  音樂: "music",
  購物: "shop",
  外賣: "外賣",
  世界書: "book",
  角色: "character",
  使用者: "user",
  頭盔TA: "peek-phone",
  偷窺TA: "peek-phone",
  閱讀: "media-log",
  書架: "bookshelf",
  行事曆: "calendar",
  占卜: "fate",
};

/** 沒對照的標籤直接當頁面 id（handleNavigate 也認中文名稱） */
export function appButtonTarget(label: string): string {
  return PAGE_BY_LABEL[label] || label;
}
