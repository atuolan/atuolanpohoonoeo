/**
 * 噗浪空間（QZone/Plurk）類型定義
 */

// 媒體項目（圖片/視頻）
export interface MediaItem {
  type: "image" | "video";
  url: string;
}

// 評論
export interface QZoneComment {
  id: string;
  authorId: string; // 作者 ID（用戶或角色 ID）
  username: string; // 作者名稱
  avatar: string; // 作者頭像
  content: string; // 評論內容
  timestamp: number; // 時間戳
  authorType?: "user" | "ai"; // 作者類型
  replyToId?: string; // 回覆的評論 ID
  replyToUsername?: string; // 回覆的評論作者名稱（顯示用）
}

// 批量評論生成結果（單條）
export interface GeneratedComment {
  id?: string; // 評論的臨時 ID（c1, c2, c3...）
  characterId: string;
  characterName: string;
  content: string;
  replyTo: string | null; // 回覆的評論 ID，null 表示直接評論貼文
}

// 批量評論生成結果
export interface BatchCommentsResult {
  comments: GeneratedComment[];
}

// 噗浪動態
export interface QZonePost {
  id: string;
  authorId: string; // 作者 ID（用戶或角色 ID）
  username?: string; // 作者名稱（用於顯示）
  avatar?: string; // 作者頭像（用於顯示）
  type: "shuoshuo" | "text_image" | "image_post" | "repost";
  content?: string; // 動態內容
  publicText?: string; // 公開文字
  hiddenContent?: string; // 隱藏內容
  imageDescription?: string; // 圖片描述
  images?: string[]; // 圖片 URL 數組
  media?: MediaItem[]; // 媒體項目數組（圖片和視頻）
  timestamp: number; // 時間戳
  comments: QZoneComment[]; // 評論列表
  likes: string[]; // 點讚用戶 ID 列表
  originalPost?: QZonePost; // 原始動態（轉發時）
  repostComment?: string; // 轉發評論
  visibility: "public" | "friends" | "private"; // 可見性（舊版，保留兼容）
  // 噗浪特有屬性
  qualifier?: string; // Plurk 限定詞（說、想、愛、覺得等）
  authorType?: "user" | "ai"; // 作者類型
  liked?: boolean; // 是否已點讚
  likeCount?: number; // 點讚數
  commentCount?: number; // 評論數
  repostCount?: number; // 轉發數
  views?: number; // 瀏覽數
  bookmarked?: boolean; // 是否已收藏
  reposted?: boolean; // 是否已轉發
  emoticons?: Record<string, number>; // 表情回應 { '😊': 3, '❤️': 2 }
  // 群組可見性相關（新增）
  authorPersonaId?: string; // 發文者的 Persona ID（用戶身份）
  visibilityMode?: "public" | "group-only"; // 貼文可見性模式
  groupName?: string; // 群組名稱（顯示用）
  groupMemberIds?: string[]; // 群組成員 ID 列表（group-only 模式時記錄）
}

// 噗浪空間設定
export interface QZoneSettings {
  nickname: string; // 用戶暱稱
  avatar: string; // 用戶頭像
  background: string; // 背景圖片
  themeMode?: "light" | "dark" | "auto"; // 主題模式
  autoAIReply?: boolean; // 自動 AI 回覆
  enableChatContext?: boolean; // 讀取對話記錄
  chatContextCount?: number; // 讀取對話條數
}

// 自動互動配置
export interface AutoInteractionConfig {
  enabled: boolean;
  postInterval: number; // 發文間隔（分鐘）
  commentInterval: number; // 評論間隔（分鐘）
  maxPostsPerDay: number; // 每日最大發文數
  maxCommentsPerDay: number; // 每日最大評論數
  characterSelection: {
    mode: "random" | "rotation" | "weighted";
    blacklist: string[]; // 黑名單角色 ID
    weights?: Record<string, number>; // 角色權重
  };
  conversation: {
    mentionResponse: {
      enabled: boolean;
      mode: "immediate" | "delayed";
      delay?: number;
    };
  };
}

// 默認自動互動配置
export const DEFAULT_AUTO_INTERACTION_CONFIG: AutoInteractionConfig = {
  enabled: false,
  postInterval: 60,
  commentInterval: 30,
  maxPostsPerDay: 5,
  maxCommentsPerDay: 20,
  characterSelection: {
    mode: "random",
    blacklist: [],
  },
  conversation: {
    mentionResponse: {
      enabled: true,
      mode: "immediate",
    },
  },
};
