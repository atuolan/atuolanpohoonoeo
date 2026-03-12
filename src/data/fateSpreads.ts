/**
 * 塔羅牌陣定義
 */
import type { FateSpread } from '@/types/fate'

export const fateSpreads: FateSpread[] = [
  {
    id: 'single',
    name: 'Single Card',
    nameCn: '單張牌',
    description: '快速占卜，獲取當下的指引或每日一牌',
    positions: [
      { id: 'single-1', name: 'The Card', nameCn: '指引', description: '代表當前情況的核心信息或建議' },
    ],
  },
  {
    id: 'three-card',
    name: 'Three Card Spread',
    nameCn: '三張牌陣',
    description: '經典的過去-現在-未來牌陣，了解事情的發展脈絡',
    positions: [
      { id: 'three-1', name: 'Past', nameCn: '過去', description: '影響當前情況的過去因素' },
      { id: 'three-2', name: 'Present', nameCn: '現在', description: '當前的狀態和挑戰' },
      { id: 'three-3', name: 'Future', nameCn: '未來', description: '如果繼續當前道路可能的結果' },
    ],
  },
  {
    id: 'celtic-cross',
    name: 'Celtic Cross',
    nameCn: '凱爾特十字',
    description: '深度分析牌陣，全面了解問題的各個方面',
    positions: [
      { id: 'celtic-1', name: 'Present', nameCn: '現狀', description: '當前的核心情況' },
      { id: 'celtic-2', name: 'Challenge', nameCn: '挑戰', description: '面臨的主要障礙或挑戰' },
      { id: 'celtic-3', name: 'Past', nameCn: '過去', description: '導致當前情況的過去事件' },
      { id: 'celtic-4', name: 'Future', nameCn: '近期未來', description: '即將發生的事情' },
      { id: 'celtic-5', name: 'Above', nameCn: '目標', description: '你的目標或最好的可能結果' },
      { id: 'celtic-6', name: 'Below', nameCn: '潛意識', description: '潛意識的影響因素' },
      { id: 'celtic-7', name: 'Advice', nameCn: '建議', description: '你應該採取的態度或行動' },
      { id: 'celtic-8', name: 'External', nameCn: '外部影響', description: '周圍環境和他人的影響' },
      { id: 'celtic-9', name: 'Hopes/Fears', nameCn: '希望與恐懼', description: '你內心的希望或恐懼' },
      { id: 'celtic-10', name: 'Outcome', nameCn: '最終結果', description: '事情最可能的結果' },
    ],
  },
]

/** 取得預設牌陣（三張牌陣） */
export function getDefaultFateSpread(): FateSpread {
  return fateSpreads[1]
}

/** 根據 ID 取得牌陣 */
export function getFateSpreadById(id: string): FateSpread | undefined {
  return fateSpreads.find(s => s.id === id)
}
