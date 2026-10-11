// ===== 主題版型元件的介面 =====
// 每個主題包（奶油風 / Y2K / 極簡黑白 / 珍珠畫廊 / 線描）各自為時鐘、拍立得、音樂、
// 最近聊天、App 圖標提供一個獨立的 .vue 版型元件，放在 themed/<主題>/ 底下。
// 宿主 widget（ClockWidget 等）負責資料與行為（時間、上傳照片、播放、導航），
// 版型元件只負責畫面，透過下面這些 props / emits 溝通。
// 版型元件不得自行改 store 資料（Y2K 的 MP3 時鐘例外：可直接讀寫 music store）。
import type { Component } from "vue";

/** 時鐘版型：宿主每秒（或每分）更新 now */
export interface ThemedClockProps {
  now: Date;
  showDate: boolean;
  showSeconds: boolean;
  /** 使用者設定的文字色（customStyle.textColor / clockColor），沒設定時為 undefined */
  color?: string;
}

/** 拍立得版型：emits pick（開檔案選擇）、clear（清除照片）、update:caption */
export interface ThemedPolaroidProps {
  imageUrl: string;
  caption: string;
  color?: string;
}

/** 音樂版型：emits toggle、prev、next、open（打開音樂 App） */
export interface ThemedMusicProps {
  title: string;
  artist: string;
  /** 秒 */
  duration: number;
  /** 秒 */
  currentTime: number;
  /** 0–100 */
  progress: number;
  isPlaying: boolean;
  color?: string;
}

/** 最近聊天版型：整塊點擊由宿主處理（導航到聊天），版型元件不需 emit */
export interface ThemedChatProps {
  /** 還沒有任何聊天時為 false，版型要畫空狀態 */
  hasCharacter: boolean;
  isEditMode: boolean;
  displayName: string;
  avatar: string;
  timeText: string;
  unreadCount: number;
  /** 已拿掉 [sticker:] 標籤的文字，可能是空字串（只有貼圖） */
  previewText: string;
  /** 貼圖名稱，沒有貼圖時為空字串 */
  stickerName: string;
  /** 貼圖圖片網址，找不到時為空字串（改畫文字標籤） */
  stickerUrl: string;
  color?: string;
}

/** App 圖標版型：點擊由宿主處理（導航），版型元件不需 emit */
export interface ThemedAppProps {
  label: string;
  /** lucide 圖標元件；有 customImageUrl 時改畫圖片 */
  icon: Component;
  customImageUrl?: string;
  /** 主題包為這個 App 指定的代表色（customStyle.backgroundColor），版型可拿來當底色 */
  accent?: string;
  color?: string;
  /** 目錄式版型用的編號（"01"…），由主題包擺位寫進 data.indexNo */
  indexNo?: string;
}
