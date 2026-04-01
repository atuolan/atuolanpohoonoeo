// ============================================================
// 神諭卡（Oracle Card）牌陣定義
// 使用百分比座標系統，模擬占星喵牌陣佈局
// ============================================================
import type { OracleSpread } from '@/types/oracle'

export const ORACLE_SPREADS: OracleSpread[] = [
  // ── 單張牌 ──────────────────────────────────────────────
  {
    id: 'oracle-single',
    name: '宇宙訊息',
    subtitle: '今日神諭',
    description: '從宇宙接收一則今日指引，讓神諭卡告訴你此刻最需要知道的訊息。',
    cardCount: 1,
    layoutType: 'single',
    tags: ['日常', '簡單', '靈感'],
    bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    positions: [
      {
        id: 'p1',
        name: '宇宙訊息',
        description: '此刻宇宙最想告訴你的一件事',
        coords: { x: 50, y: 50 },
      },
    ],
  },

  // ── 三張牌 ──────────────────────────────────────────────
  {
    id: 'oracle-past-present-future',
    name: '時光之流',
    subtitle: '過去・現在・未來',
    description: '揭示你過去的影響、當下的能量，以及未來可能展開的方向。',
    cardCount: 3,
    layoutType: 'linear',
    tags: ['時間', '方向', '洞見'],
    bgGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    positions: [
      {
        id: 'p1',
        name: '過去的根',
        description: '過去的經歷如何塑造了現在的你',
        coords: { x: 18, y: 50 },
      },
      {
        id: 'p2',
        name: '當下的光',
        description: '你現在所處的能量狀態',
        coords: { x: 50, y: 50 },
      },
      {
        id: 'p3',
        name: '未來的種子',
        description: '即將開花的可能性',
        coords: { x: 82, y: 50 },
      },
    ],
  },

  {
    id: 'oracle-mind-body-soul',
    name: '三重存在',
    subtitle: '身・心・靈',
    description: '從身體、心智和靈魂三個層面，全面了解你現在的狀態與需求。',
    cardCount: 3,
    layoutType: 'triangle',
    tags: ['整體', '療癒', '平衡'],
    bgGradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    positions: [
      {
        id: 'p1',
        name: '靈魂的聲音',
        description: '你的靈魂渴望什麼',
        coords: { x: 50, y: 20 },
      },
      {
        id: 'p2',
        name: '心智的狀態',
        description: '你的思維模式和信念',
        coords: { x: 22, y: 68 },
      },
      {
        id: 'p3',
        name: '身體的智慧',
        description: '你的身體正在告訴你什麼',
        coords: { x: 78, y: 68 },
      },
    ],
  },

  {
    id: 'oracle-situation-action-outcome',
    name: '行動指南',
    subtitle: '現況・行動・結果',
    description: '清晰了解當前情況、需要採取的行動，以及行動後可能帶來的結果。',
    cardCount: 3,
    layoutType: 'linear',
    tags: ['決策', '行動', '實用'],
    bgGradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    positions: [
      {
        id: 'p1',
        name: '當前情況',
        description: '你現在所面對的核心議題',
        coords: { x: 18, y: 50 },
      },
      {
        id: 'p2',
        name: '建議行動',
        description: '宇宙建議你採取的步驟',
        coords: { x: 50, y: 50 },
      },
      {
        id: 'p3',
        name: '可能結果',
        description: '採取行動後的能量走向',
        coords: { x: 82, y: 50 },
      },
    ],
  },

  // ── 四張牌 ──────────────────────────────────────────────
  {
    id: 'oracle-four-seasons',
    name: '四季輪轉',
    subtitle: '春夏秋冬',
    description: '以四季為象徵，了解你生命中不同面向的能量狀態與循環。',
    cardCount: 4,
    layoutType: 'cross',
    tags: ['循環', '自然', '整體'],
    bgGradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    positions: [
      {
        id: 'p1',
        name: '春 · 新生',
        description: '你生命中正在萌芽的新事物',
        coords: { x: 50, y: 20 },
      },
      {
        id: 'p2',
        name: '夏 · 盛放',
        description: '你現在最充沛的能量',
        coords: { x: 82, y: 50 },
      },
      {
        id: 'p3',
        name: '秋 · 收穫',
        description: '需要感謝和收割的成果',
        coords: { x: 50, y: 78 },
      },
      {
        id: 'p4',
        name: '冬 · 深藏',
        description: '需要釋放或休養的部分',
        coords: { x: 18, y: 50 },
      },
    ],
  },

  {
    id: 'oracle-four-elements',
    name: '四元素',
    subtitle: '火・水・風・土',
    description: '探索火（熱情）、水（情感）、風（思想）、土（物質）四種元素在你生命中的平衡。',
    cardCount: 4,
    layoutType: 'cross',
    tags: ['元素', '平衡', '探索'],
    bgGradient: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)',
    positions: [
      {
        id: 'p1',
        name: '火 · 熱情',
        description: '你的動力、創造力與使命',
        coords: { x: 50, y: 20 },
      },
      {
        id: 'p2',
        name: '水 · 情感',
        description: '你的感受、直覺與關係',
        coords: { x: 18, y: 50 },
      },
      {
        id: 'p3',
        name: '風 · 思想',
        description: '你的思維模式與溝通',
        coords: { x: 82, y: 50 },
      },
      {
        id: 'p4',
        name: '土 · 根基',
        description: '你的物質現實與穩定性',
        coords: { x: 50, y: 78 },
      },
    ],
  },

  // ── 五張牌 ──────────────────────────────────────────────
  {
    id: 'oracle-star',
    name: '星之指引',
    subtitle: '五芒星牌陣',
    description: '如同夜空中最亮的星，這個五芒星牌陣從五個面向全面照亮你的處境。',
    cardCount: 5,
    layoutType: 'star',
    tags: ['全面', '深度', '指引'],
    bgGradient: 'linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)',
    positions: [
      {
        id: 'p1',
        name: '核心真相',
        description: '這個情況的核心本質',
        coords: { x: 50, y: 50 },
      },
      {
        id: 'p2',
        name: '挑戰',
        description: '你面對的主要障礙',
        coords: { x: 50, y: 15 },
      },
      {
        id: 'p3',
        name: '機會',
        description: '隱藏的可能性和禮物',
        coords: { x: 82, y: 68 },
      },
      {
        id: 'p4',
        name: '建議',
        description: '宇宙的具體指導',
        coords: { x: 18, y: 68 },
      },
      {
        id: 'p5',
        name: '最終結果',
        description: '遵循指引後的能量走向',
        coords: { x: 50, y: 85 },
      },
    ],
  },

  {
    id: 'oracle-love-reading',
    name: '愛的光譜',
    subtitle: '關係深度解析',
    description: '深入了解你的愛情或重要關係，揭示雙方的能量與關係的走向。',
    cardCount: 5,
    layoutType: 'custom',
    tags: ['愛情', '關係', '深度'],
    bgGradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 50%, #fecfef 100%)',
    positions: [
      {
        id: 'p1',
        name: '你的能量',
        description: '你在這段關係中的狀態',
        coords: { x: 22, y: 38 },
      },
      {
        id: 'p2',
        name: '對方的能量',
        description: '對方在這段關係中的狀態',
        coords: { x: 78, y: 38 },
      },
      {
        id: 'p3',
        name: '關係的核心',
        description: '這段關係的本質與主題',
        coords: { x: 50, y: 30 },
      },
      {
        id: 'p4',
        name: '關係的挑戰',
        description: '需要共同面對的議題',
        coords: { x: 50, y: 62 },
      },
      {
        id: 'p5',
        name: '關係的潛力',
        description: '這段關係可以達到的最美境界',
        coords: { x: 50, y: 85 },
      },
    ],
  },

  // ── 七張牌 ──────────────────────────────────────────────
  {
    id: 'oracle-chakra',
    name: '脈輪之旅',
    subtitle: '七脈輪能量解讀',
    description: '從海底輪到頂輪，了解你七個能量中心的狀態，找出需要平衡和療癒的部分。',
    cardCount: 7,
    layoutType: 'custom',
    tags: ['脈輪', '療癒', '能量'],
    bgGradient: 'linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)',
    positions: [
      {
        id: 'p1',
        name: '頂輪 · 靈性連結',
        description: '你與宇宙/高我的連結',
        coords: { x: 50, y: 10 },
      },
      {
        id: 'p2',
        name: '眉心輪 · 直覺',
        description: '你的直覺與洞察力',
        coords: { x: 50, y: 24 },
      },
      {
        id: 'p3',
        name: '喉輪 · 表達',
        description: '你的溝通與自我表達',
        coords: { x: 50, y: 38 },
      },
      {
        id: 'p4',
        name: '心輪 · 愛',
        description: '你給予和接受愛的能力',
        coords: { x: 50, y: 50 },
      },
      {
        id: 'p5',
        name: '太陽神經叢 · 力量',
        description: '你的個人力量與意志',
        coords: { x: 50, y: 62 },
      },
      {
        id: 'p6',
        name: '臍輪 · 創造',
        description: '你的創造力與情感流動',
        coords: { x: 50, y: 76 },
      },
      {
        id: 'p7',
        name: '海底輪 · 根基',
        description: '你的安全感與物質根基',
        coords: { x: 50, y: 90 },
      },
    ],
  },

  // ── 月相牌陣 ──────────────────────────────────────────────
  {
    id: 'oracle-moon-phases',
    name: '月光指引',
    subtitle: '月相循環牌陣',
    description: '跟隨月亮的節律，了解你生命中的顯化週期：新月的意圖、滿月的豐盛與釋放。',
    cardCount: 3,
    layoutType: 'custom',
    tags: ['月亮', '顯化', '釋放'],
    bgGradient: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    positions: [
      {
        id: 'p1',
        name: '新月 · 意圖',
        description: '此刻你該播下什麼種子',
        coords: { x: 18, y: 50 },
      },
      {
        id: 'p2',
        name: '滿月 · 豐盛',
        description: '此刻你該感謝和慶祝什麼',
        coords: { x: 50, y: 50 },
      },
      {
        id: 'p3',
        name: '殘月 · 釋放',
        description: '此刻你該放手什麼',
        coords: { x: 82, y: 50 },
      },
    ],
  },
]

/** 根據 ID 取得牌陣 */
export function getOracleSpreadById(id: string): OracleSpread | undefined {
  return ORACLE_SPREADS.find(s => s.id === id)
}

/** 根據標籤過濾牌陣 */
export function getOracleSpreadsByTag(tag: string): OracleSpread[] {
  return ORACLE_SPREADS.filter(s => s.tags.includes(tag))
}

/** 根據牌數過濾牌陣 */
export function getOracleSpreadsByCardCount(count: number): OracleSpread[] {
  return ORACLE_SPREADS.filter(s => s.cardCount === count)
}
