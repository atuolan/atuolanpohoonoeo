// ===== 日記系統類型 =====

/** 日記數據 */
export interface DiaryData {
  id: string
  content: string // 日記正文內容
  summary: string // 對話摘要
  messageCount: number // 基於多少條消息生成
  status: 'writing' | 'ready' // 寫作中 | 已完成
  isFavorite?: boolean // 是否收藏
  createdAt: number
}

/** 日記設置 */
export interface DiarySettings {
  enabled: boolean // 是否啟用日記功能
  interval: number // 日記生成間隔（輪次或消息數）
  intervalMode: 'message' | 'turn' // 間隔模式
}
