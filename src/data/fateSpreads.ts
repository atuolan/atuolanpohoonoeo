/**
 * 塔羅牌陣定義
 */
import type { FateSpread } from "@/types/fate";

export const fateSpreads: FateSpread[] = [
  // ── 1 張 ──────────────────────────────────────────────
  {
    id: "single",
    name: "Single Card",
    nameCn: "單張牌",
    description: "快速占卜，獲取當下的指引或每日一牌",
    positions: [
      {
        id: "single-1",
        name: "The Card",
        nameCn: "指引",
        description: "代表當前情況的核心信息或建議",
      },
    ],
  },
  {
    id: "no-spread",
    name: "No Spread",
    nameCn: "一張無牌陣占卜法",
    description: "適合於解答任何事件的核心問題，簡單直接地向求問者作出啟示",
    positions: [
      {
        id: "no-spread-1",
        name: "Core",
        nameCn: "核心啟示",
        description: "直接揭示問題的核心答案與指引",
      },
    ],
  },
  // ── 2 張 ──────────────────────────────────────────────
  {
    id: "two-choice",
    name: "Two Choice",
    nameCn: "二擇一",
    description:
      "專門指引兩難或選擇問題，在此牌陣可以指引出分別不同兩種選擇的發展趨勢",
    positions: [
      {
        id: "two-choice-1",
        name: "Option A",
        nameCn: "選項A",
        description: "第一個選擇的發展趨勢與能量",
      },
      {
        id: "two-choice-2",
        name: "Option B",
        nameCn: "選項B",
        description: "第二個選擇的發展趨勢與能量",
      },
    ],
  },
  // ── 3 張 ──────────────────────────────────────────────
  {
    id: "three-card",
    name: "Three Card Spread",
    nameCn: "三張牌陣",
    description: "經典的過去-現在-未來牌陣，了解事情的發展脈絡",
    positions: [
      {
        id: "three-1",
        name: "Past",
        nameCn: "過去",
        description: "影響當前情況的過去因素",
      },
      {
        id: "three-2",
        name: "Present",
        nameCn: "現在",
        description: "當前的狀態和挑戰",
      },
      {
        id: "three-3",
        name: "Future",
        nameCn: "未來",
        description: "如果繼續當前道路可能的結果",
      },
    ],
  },
  {
    id: "holy-triangle",
    name: "Holy Triangle",
    nameCn: "聖三角",
    description:
      "適合用於提問一些行動性質的假設問題，如：可不可以、會不會、要不要等",
    positions: [
      {
        id: "holy-tri-1",
        name: "Situation",
        nameCn: "現況",
        description: "當前事件的整體狀況",
      },
      {
        id: "holy-tri-2",
        name: "Action",
        nameCn: "行動",
        description: "建議採取的行動方向",
      },
      {
        id: "holy-tri-3",
        name: "Outcome",
        nameCn: "結果",
        description: "行動後可能帶來的結果",
      },
    ],
  },
  {
    id: "mind-body-spirit",
    name: "Mind Body Spirit",
    nameCn: "身心靈",
    description:
      "用於分析當下事情的情況，分析感情或某件事對當事人的影響，也可用於每日運勢占卜",
    positions: [
      {
        id: "mbs-1",
        name: "Mind",
        nameCn: "心智",
        description: "思維、意識層面的狀態與影響",
      },
      {
        id: "mbs-2",
        name: "Body",
        nameCn: "身體",
        description: "現實、物質層面的狀態與影響",
      },
      {
        id: "mbs-3",
        name: "Spirit",
        nameCn: "靈性",
        description: "靈魂、潛意識層面的狀態與影響",
      },
    ],
  },
  {
    id: "love-triangle",
    name: "Love Triangle",
    nameCn: "戀愛聖三角",
    description:
      "你有一個喜歡對象但不知道你們將會如何靠近？想知道與你喜歡的對象約會將會怎樣？與你的戀人發生矛盾不知道如何處理？戀愛中的各種小鹿亂撞戀愛聖三角能夠幫到你！",
    positions: [
      {
        id: "love-tri-1",
        name: "You",
        nameCn: "你",
        description: "你在這段感情中的能量與狀態",
      },
      {
        id: "love-tri-2",
        name: "Them",
        nameCn: "對方",
        description: "對方的能量、感受與態度",
      },
      {
        id: "love-tri-3",
        name: "Connection",
        nameCn: "緣分",
        description: "你們之間的連結與發展方向",
      },
    ],
  },
  {
    id: "three-choice",
    name: "Three Choice",
    nameCn: "三選一",
    description:
      "選擇困難的救星三選一牌陣！如果二選一已經滿足不了你，請果斷使用三選一吧！並附有指引指示牌，讓你選擇無鴨梨！",
    positions: [
      {
        id: "three-choice-1",
        name: "Option A",
        nameCn: "選項A",
        description: "第一個選擇的發展趨勢",
      },
      {
        id: "three-choice-2",
        name: "Option B",
        nameCn: "選項B",
        description: "第二個選擇的發展趨勢",
      },
      {
        id: "three-choice-3",
        name: "Option C",
        nameCn: "選項C",
        description: "第三個選擇的發展趨勢",
      },
      {
        id: "three-choice-4",
        name: "Guidance",
        nameCn: "指引",
        description: "宇宙給你的最終指引與建議",
      },
    ],
  },
  // ── 4 張 ──────────────────────────────────────────────
  {
    id: "four-elements",
    name: "Four Elements",
    nameCn: "四元素牌陣",
    description:
      "四元素牌陣是用於引導求問者解決問題的牌陣，求問者先想清楚和描述出目前面臨的困難及想得到的解決方法",
    positions: [
      {
        id: "four-el-1",
        name: "Fire",
        nameCn: "火（行動）",
        description: "你應採取的行動與動力來源",
      },
      {
        id: "four-el-2",
        name: "Water",
        nameCn: "水（情感）",
        description: "情感層面的影響與內心感受",
      },
      {
        id: "four-el-3",
        name: "Air",
        nameCn: "風（思維）",
        description: "思維層面的洞察與溝通方式",
      },
      {
        id: "four-el-4",
        name: "Earth",
        nameCn: "土（現實）",
        description: "現實層面的結果與物質影響",
      },
    ],
  },
  {
    id: "four-seasons",
    name: "Four Seasons",
    nameCn: "四季牌陣",
    description:
      "四季牌陣，一年中只有在春分、夏至、秋分和冬至這四天可以抽取。傳說中的二分二至這四天季節開始轉換，因而是能量很強的四天。你可以通過四季牌陣，查看自己的運勢以及需要注意的地方，在塔羅的指引下輕鬆度過這個季節。",
    positions: [
      {
        id: "four-sea-1",
        name: "Spring",
        nameCn: "春（新生）",
        description: "新的開始、成長與萌芽的能量",
      },
      {
        id: "four-sea-2",
        name: "Summer",
        nameCn: "夏（盛放）",
        description: "當前最旺盛的能量與機遇",
      },
      {
        id: "four-sea-3",
        name: "Autumn",
        nameCn: "秋（收穫）",
        description: "需要收穫或放下的事物",
      },
      {
        id: "four-sea-4",
        name: "Winter",
        nameCn: "冬（沉澱）",
        description: "需要休養、反思與積蓄的方向",
      },
    ],
  },
  // ── 5 張 ──────────────────────────────────────────────
  {
    id: "pentagram",
    name: "Pentagram",
    nameCn: "正五芒星",
    description:
      "五芒星是奧數瓦多·魔爾·德秘法裡的一種，跟一般算法不同，使用此陣需在半夜時分，五芒星會為你揭示事件的真相及召喚精靈給你祝福及指引！第五張牌需讓塔羅師來判斷，如果結論為第五張牌與前四張牌其中一張相同則未能得到精靈的祝福。",
    positions: [
      {
        id: "penta-1",
        name: "Earth",
        nameCn: "土（根基）",
        description: "事件的根基與物質現實層面",
      },
      {
        id: "penta-2",
        name: "Water",
        nameCn: "水（情感）",
        description: "情感流動與潛意識的影響",
      },
      {
        id: "penta-3",
        name: "Fire",
        nameCn: "火（意志）",
        description: "行動力與意志力的展現",
      },
      {
        id: "penta-4",
        name: "Air",
        nameCn: "風（智慧）",
        description: "思維清晰度與溝通的能量",
      },
      {
        id: "penta-5",
        name: "Spirit",
        nameCn: "靈（精靈祝福）",
        description: "精靈帶來的神秘指引與祝福",
      },
    ],
  },
  {
    id: "time-arrow",
    name: "Time Arrow",
    nameCn: "時間之箭",
    description:
      "適合用於提問一件事或一個方向的發展性問題，如：健康狀況、感情進展、職位升遷等",
    positions: [
      {
        id: "time-1",
        name: "Root",
        nameCn: "根源",
        description: "事件的起源與根本原因",
      },
      {
        id: "time-2",
        name: "Past",
        nameCn: "過去",
        description: "過去的發展與已發生的影響",
      },
      {
        id: "time-3",
        name: "Present",
        nameCn: "現在",
        description: "當前的狀態與核心能量",
      },
      {
        id: "time-4",
        name: "Near Future",
        nameCn: "近未來",
        description: "即將到來的發展趨勢",
      },
      {
        id: "time-5",
        name: "Outcome",
        nameCn: "最終走向",
        description: "事件最終可能的結果",
      },
    ],
  },
  {
    id: "sunflower",
    name: "Sunflower",
    nameCn: "向日葵",
    description:
      "如果你內心有種說不清的疑惑，又找不到一個具體的問題的話，這個獨特的牌陣能夠指引你讓你更加清晰地找到問題所在。Mp消耗大～",
    positions: [
      {
        id: "sun-1",
        name: "Core",
        nameCn: "核心困惑",
        description: "你內心最深處的疑惑所在",
      },
      {
        id: "sun-2",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "你尚未意識到的隱藏影響",
      },
      {
        id: "sun-3",
        name: "Feeling",
        nameCn: "情緒狀態",
        description: "當前的情緒與心理狀態",
      },
      {
        id: "sun-4",
        name: "Direction",
        nameCn: "方向指引",
        description: "宇宙給你的方向指引",
      },
      {
        id: "sun-5",
        name: "Light",
        nameCn: "光明所在",
        description: "走出困惑的關鍵與希望",
      },
    ],
  },
  // ── 6 張 ──────────────────────────────────────────────
  {
    id: "hexagram",
    name: "Hexagram",
    nameCn: "六芒星",
    description:
      "六芒星占卜法是塔羅中非常具有代表性的占卜法，它源自猶太六芒星符號。如果你想知道問題發生的前因後果，及周遭環境對這件事的助益或阻礙之處，把事情的來龍去脈了解清楚，在此基礎上選擇出一個好的解決方法。六芒星牌陣滿足你，占卜工作學業及理財投資方面問題效果更佳。",
    positions: [
      {
        id: "hex-1",
        name: "Past",
        nameCn: "過去",
        description: "導致現況的過去事件與根源",
      },
      {
        id: "hex-2",
        name: "Present",
        nameCn: "現在",
        description: "當前的核心狀況",
      },
      {
        id: "hex-3",
        name: "Future",
        nameCn: "未來",
        description: "事件可能的發展走向",
      },
      {
        id: "hex-4",
        name: "Reason",
        nameCn: "原因",
        description: "問題發生的深層原因",
      },
      {
        id: "hex-5",
        name: "Environment",
        nameCn: "環境影響",
        description: "周遭環境與他人的助益或阻礙",
      },
      {
        id: "hex-6",
        name: "Solution",
        nameCn: "解決方法",
        description: "最佳的應對策略與解決方向",
      },
    ],
  },
  {
    id: "relationship",
    name: "Relationship Spread",
    nameCn: "愛情關係牌陣",
    description:
      "深入分析兩人之間的感情動態，了解雙方的感受、關係現狀與未來走向",
    positions: [
      {
        id: "rel-1",
        name: "Your Feelings",
        nameCn: "你的感受",
        description: "你在這段關係中的情感狀態",
      },
      {
        id: "rel-2",
        name: "Their Feelings",
        nameCn: "對方的感受",
        description: "對方在這段關係中的情感狀態",
      },
      {
        id: "rel-3",
        name: "Relationship Now",
        nameCn: "關係現狀",
        description: "目前這段關係的整體能量",
      },
      {
        id: "rel-4",
        name: "Strengths",
        nameCn: "關係優勢",
        description: "這段關係中運作良好的部分",
      },
      {
        id: "rel-5",
        name: "Challenges",
        nameCn: "關係挑戰",
        description: "這段關係面臨的主要挑戰",
      },
      {
        id: "rel-6",
        name: "Future",
        nameCn: "未來走向",
        description: "這段關係最可能的發展方向",
      },
    ],
  },
  {
    id: "love-cross",
    name: "Love Cross",
    nameCn: "愛情十字",
    description: "用於現有戀情發生的問題，了解雙方內心想法從而獲得啟發的牌陣",
    positions: [
      {
        id: "lc-1",
        name: "Your Heart",
        nameCn: "你的內心",
        description: "你真實的內心感受與想法",
      },
      {
        id: "lc-2",
        name: "Their Heart",
        nameCn: "對方內心",
        description: "對方真實的內心感受與想法",
      },
      {
        id: "lc-3",
        name: "Core Issue",
        nameCn: "核心問題",
        description: "這段感情目前的核心問題所在",
      },
      {
        id: "lc-4",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "影響關係的隱藏因素",
      },
      {
        id: "lc-5",
        name: "Advice",
        nameCn: "建議",
        description: "如何改善這段感情的建議",
      },
      {
        id: "lc-6",
        name: "Outcome",
        nameCn: "結果",
        description: "這段感情的可能走向",
      },
    ],
  },
  // ── 7 張 ──────────────────────────────────────────────
  {
    id: "horseshoe",
    name: "Horseshoe Spread",
    nameCn: "馬蹄形牌陣",
    description:
      "七張牌排列成馬蹄形，介於三張牌陣與凱爾特十字之間的深度，適合決策與了解過去如何影響未來",
    positions: [
      {
        id: "horse-1",
        name: "Past",
        nameCn: "過去",
        description: "影響現況的過去事件",
      },
      {
        id: "horse-2",
        name: "Present",
        nameCn: "現在",
        description: "當前的狀態與核心情況",
      },
      {
        id: "horse-3",
        name: "Hidden",
        nameCn: "隱藏影響",
        description: "潛藏的、尚未浮現的影響因素",
      },
      {
        id: "horse-4",
        name: "Obstacle",
        nameCn: "障礙",
        description: "面臨的主要阻礙",
      },
      {
        id: "horse-5",
        name: "Environment",
        nameCn: "外部環境",
        description: "周圍環境與他人的影響",
      },
      {
        id: "horse-6",
        name: "Advice",
        nameCn: "建議",
        description: "宇宙給你的行動建議",
      },
      {
        id: "horse-7",
        name: "Outcome",
        nameCn: "結果",
        description: "事情最可能的結果",
      },
    ],
  },
  {
    id: "weekly",
    name: "Weekly Spread",
    nameCn: "周運占卜法",
    description: "顧名思義預測你一周的具體運勢，為你催吉避凶",
    positions: [
      {
        id: "week-1",
        name: "Monday",
        nameCn: "週一",
        description: "週一的能量與運勢",
      },
      {
        id: "week-2",
        name: "Tuesday",
        nameCn: "週二",
        description: "週二的能量與運勢",
      },
      {
        id: "week-3",
        name: "Wednesday",
        nameCn: "週三",
        description: "週三的能量與運勢",
      },
      {
        id: "week-4",
        name: "Thursday",
        nameCn: "週四",
        description: "週四的能量與運勢",
      },
      {
        id: "week-5",
        name: "Friday",
        nameCn: "週五",
        description: "週五的能量與運勢",
      },
      {
        id: "week-6",
        name: "Weekend",
        nameCn: "週末",
        description: "週末的能量與運勢",
      },
      {
        id: "week-7",
        name: "Overall",
        nameCn: "本週總覽",
        description: "本週整體的主題能量",
      },
    ],
  },
  {
    id: "chalice",
    name: "Chalice",
    nameCn: "酒杯",
    description:
      "此陣用於分析問題以及預測可能發生的事情，給你指引躲開麻煩或把握關鍵",
    positions: [
      {
        id: "chalice-1",
        name: "Base",
        nameCn: "根基",
        description: "問題的根本原因與基礎",
      },
      {
        id: "chalice-2",
        name: "Left",
        nameCn: "左側影響",
        description: "來自過去或外部的影響",
      },
      {
        id: "chalice-3",
        name: "Right",
        nameCn: "右側影響",
        description: "來自未來或內部的影響",
      },
      {
        id: "chalice-4",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "潛藏的關鍵因素",
      },
      {
        id: "chalice-5",
        name: "Advice",
        nameCn: "建議",
        description: "如何應對的指引",
      },
      {
        id: "chalice-6",
        name: "Outcome",
        nameCn: "結果",
        description: "事情的可能走向",
      },
      {
        id: "chalice-7",
        name: "Key",
        nameCn: "關鍵",
        description: "整件事最關鍵的核心牌",
      },
    ],
  },
  // ── 8 張 ──────────────────────────────────────────────
  {
    id: "future-lover",
    name: "Future Lover",
    nameCn: "未來戀人",
    description:
      "想知道下一個戀人是什麼類型？是否已經出現？在哪裡遇見他/她？未來戀人一次過滿足你多個願望。",
    positions: [
      {
        id: "fl-1",
        name: "Appearance",
        nameCn: "外在特質",
        description: "未來戀人的外在形象與特質",
      },
      {
        id: "fl-2",
        name: "Personality",
        nameCn: "性格特點",
        description: "未來戀人的性格與內在特質",
      },
      {
        id: "fl-3",
        name: "Status",
        nameCn: "目前狀態",
        description: "未來戀人目前的生活狀態",
      },
      {
        id: "fl-4",
        name: "Where",
        nameCn: "相遇地點",
        description: "你們可能相遇的場合或環境",
      },
      {
        id: "fl-5",
        name: "When",
        nameCn: "相遇時機",
        description: "相遇的時間能量與契機",
      },
      {
        id: "fl-6",
        name: "Already Here",
        nameCn: "是否已出現",
        description: "未來戀人是否已在你生命中",
      },
      {
        id: "fl-7",
        name: "Relationship",
        nameCn: "感情走向",
        description: "這段感情的發展潛力",
      },
      {
        id: "fl-8",
        name: "Advice",
        nameCn: "準備建議",
        description: "為迎接這段感情你需要做的準備",
      },
    ],
  },
  {
    id: "karmic",
    name: "Karmic",
    nameCn: "卡爾米克",
    description:
      "當你感到迷茫甚至懷疑人生時，古老的卡爾米克可以讓你更好地了解自己給予你命運中的啟示",
    positions: [
      {
        id: "kar-1",
        name: "Soul",
        nameCn: "靈魂本質",
        description: "你靈魂的核心特質與使命",
      },
      {
        id: "kar-2",
        name: "Past Life",
        nameCn: "前世因緣",
        description: "前世帶來的業力與影響",
      },
      {
        id: "kar-3",
        name: "Current Lesson",
        nameCn: "今生課題",
        description: "這一世需要學習的核心課題",
      },
      {
        id: "kar-4",
        name: "Obstacle",
        nameCn: "業力障礙",
        description: "業力帶來的主要障礙",
      },
      {
        id: "kar-5",
        name: "Gift",
        nameCn: "靈魂天賦",
        description: "你與生俱來的天賦與能力",
      },
      {
        id: "kar-6",
        name: "Path",
        nameCn: "命運之路",
        description: "你命中注定的人生方向",
      },
      {
        id: "kar-7",
        name: "Guidance",
        nameCn: "宇宙指引",
        description: "宇宙給你此刻最重要的啟示",
      },
      {
        id: "kar-8",
        name: "Destiny",
        nameCn: "命運結局",
        description: "順應命運後可能達到的境界",
      },
    ],
  },
  // ── 9 張 ──────────────────────────────────────────────
  {
    id: "future-development",
    name: "Future Development",
    nameCn: "未來發展陣",
    description:
      "未來發展陣將會一次過預測出你未來愛情、事業、財富、成就給你的未來作出簡要的指引，讓你不再迷茫",
    positions: [
      {
        id: "fd-1",
        name: "Love",
        nameCn: "愛情運",
        description: "未來愛情方面的發展趨勢",
      },
      {
        id: "fd-2",
        name: "Career",
        nameCn: "事業運",
        description: "未來事業方面的發展趨勢",
      },
      {
        id: "fd-3",
        name: "Wealth",
        nameCn: "財富運",
        description: "未來財富方面的發展趨勢",
      },
      {
        id: "fd-4",
        name: "Achievement",
        nameCn: "成就運",
        description: "未來成就與個人成長的趨勢",
      },
      {
        id: "fd-5",
        name: "Health",
        nameCn: "健康運",
        description: "未來健康方面需要注意的事項",
      },
      {
        id: "fd-6",
        name: "Opportunity",
        nameCn: "機遇",
        description: "即將到來的重要機遇",
      },
      {
        id: "fd-7",
        name: "Challenge",
        nameCn: "挑戰",
        description: "未來需要面對的主要挑戰",
      },
      {
        id: "fd-8",
        name: "Advice",
        nameCn: "整體建議",
        description: "宇宙給你的整體行動建議",
      },
      {
        id: "fd-9",
        name: "Overall",
        nameCn: "總體走向",
        description: "你未來整體的命運走向",
      },
    ],
  },
  {
    id: "work-development",
    name: "Work Development",
    nameCn: "工作發展牌陣",
    description:
      "簡單，粗暴，直接！工作就是要這麼高效！想知道在新公司怎麼樣？想知道近期的工作有什麼進展？這個牌陣無疑是你的首選！",
    positions: [
      {
        id: "wd-1",
        name: "Current Status",
        nameCn: "工作現狀",
        description: "目前工作環境的整體狀態",
      },
      {
        id: "wd-2",
        name: "Strengths",
        nameCn: "你的優勢",
        description: "你在工作中的核心優勢",
      },
      {
        id: "wd-3",
        name: "Challenges",
        nameCn: "工作挑戰",
        description: "工作中面臨的主要挑戰",
      },
      {
        id: "wd-4",
        name: "Colleagues",
        nameCn: "同事關係",
        description: "與同事、上司的關係能量",
      },
      {
        id: "wd-5",
        name: "Opportunity",
        nameCn: "發展機遇",
        description: "即將到來的工作機遇",
      },
      {
        id: "wd-6",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "影響工作的隱藏因素",
      },
      {
        id: "wd-7",
        name: "Short Term",
        nameCn: "近期發展",
        description: "近期工作的發展趨勢",
      },
      {
        id: "wd-8",
        name: "Long Term",
        nameCn: "長遠前景",
        description: "長遠的職業發展前景",
      },
      {
        id: "wd-9",
        name: "Advice",
        nameCn: "行動建議",
        description: "提升工作運的具體建議",
      },
    ],
  },
  // ── 10 張 ──────────────────────────────────────────────
  {
    id: "celtic-cross",
    name: "Celtic Cross",
    nameCn: "凱爾特十字",
    description:
      "這是一個幾乎所有塔羅書籍上都會提及而且推薦的經典牌陣，能針對某一件事或問題的各個層面去判斷分析，能解讀出過去、現在和未來事情的發展。特別是在預測學業和事業的問題上威力巨大！",
    positions: [
      {
        id: "celtic-1",
        name: "Present",
        nameCn: "現狀",
        description: "當前的核心情況",
      },
      {
        id: "celtic-2",
        name: "Challenge",
        nameCn: "挑戰",
        description: "面臨的主要障礙或挑戰",
      },
      {
        id: "celtic-3",
        name: "Past",
        nameCn: "過去",
        description: "導致當前情況的過去事件",
      },
      {
        id: "celtic-4",
        name: "Future",
        nameCn: "近期未來",
        description: "即將發生的事情",
      },
      {
        id: "celtic-5",
        name: "Above",
        nameCn: "目標",
        description: "你的目標或最好的可能結果",
      },
      {
        id: "celtic-6",
        name: "Below",
        nameCn: "潛意識",
        description: "潛意識的影響因素",
      },
      {
        id: "celtic-7",
        name: "Advice",
        nameCn: "建議",
        description: "你應該採取的態度或行動",
      },
      {
        id: "celtic-8",
        name: "External",
        nameCn: "外部影響",
        description: "周圍環境和他人的影響",
      },
      {
        id: "celtic-9",
        name: "Hopes/Fears",
        nameCn: "希望與恐懼",
        description: "你內心的希望或恐懼",
      },
      {
        id: "celtic-10",
        name: "Outcome",
        nameCn: "最終結果",
        description: "事情最可能的結果",
      },
    ],
  },
  {
    id: "big-cross",
    name: "Big Cross",
    nameCn: "大十字",
    description:
      "適合愛情、事業、友情、學業等事情占卜，如果你想要知道問題的前因後果及有沒有貴人相助的話這個陣非常適合。大十字占卜法用22張大阿爾卡納為你簡單有趣地分析出事情的主要阻礙、問題成因、結果及解決方法。",
    positions: [
      {
        id: "bc-1",
        name: "Core",
        nameCn: "核心問題",
        description: "事件的核心與主要問題",
      },
      {
        id: "bc-2",
        name: "Past",
        nameCn: "過去根源",
        description: "導致問題的過去根源",
      },
      {
        id: "bc-3",
        name: "Present",
        nameCn: "現在狀況",
        description: "當前的實際狀況",
      },
      {
        id: "bc-4",
        name: "Future",
        nameCn: "未來走向",
        description: "事情的未來發展方向",
      },
      {
        id: "bc-5",
        name: "Obstacle",
        nameCn: "主要阻礙",
        description: "面臨的主要阻礙因素",
      },
      {
        id: "bc-6",
        name: "Cause",
        nameCn: "問題成因",
        description: "問題形成的深層原因",
      },
      {
        id: "bc-7",
        name: "Helper",
        nameCn: "貴人",
        description: "能夠幫助你的貴人能量",
      },
      {
        id: "bc-8",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "影響事件的隱藏因素",
      },
      {
        id: "bc-9",
        name: "Solution",
        nameCn: "解決方法",
        description: "解決問題的最佳方法",
      },
      {
        id: "bc-10",
        name: "Outcome",
        nameCn: "最終結果",
        description: "事情最終可能的結果",
      },
    ],
  },
  {
    id: "tree-of-life",
    name: "Tree of Life",
    nameCn: "生命之樹",
    description:
      "當我們不滿足對於事物的表面解釋希望能有更深入的探索時，你需要生命之樹的力量，但並不是所有人都能理解生命之樹的引導，不單對塔羅師的級別要求非常高還需要有豐富的人生沉澱。",
    positions: [
      {
        id: "tol-1",
        name: "Kether",
        nameCn: "王冠（神性）",
        description: "最高的靈性意識與神聖意志",
      },
      {
        id: "tol-2",
        name: "Chokmah",
        nameCn: "智慧（陽性）",
        description: "原始的陽性智慧與創造力",
      },
      {
        id: "tol-3",
        name: "Binah",
        nameCn: "理解（陰性）",
        description: "深層的理解力與接受能量",
      },
      {
        id: "tol-4",
        name: "Chesed",
        nameCn: "慈悲（擴展）",
        description: "慈悲、豐盛與擴展的能量",
      },
      {
        id: "tol-5",
        name: "Geburah",
        nameCn: "力量（收縮）",
        description: "力量、紀律與必要的限制",
      },
      {
        id: "tol-6",
        name: "Tiphareth",
        nameCn: "美麗（核心）",
        description: "核心自我、平衡與和諧",
      },
      {
        id: "tol-7",
        name: "Netzach",
        nameCn: "勝利（情感）",
        description: "情感、慾望與自然力量",
      },
      {
        id: "tol-8",
        name: "Hod",
        nameCn: "榮耀（理性）",
        description: "理性、溝通與智識能量",
      },
      {
        id: "tol-9",
        name: "Yesod",
        nameCn: "基礎（潛意識）",
        description: "潛意識、夢境與情緒基礎",
      },
      {
        id: "tol-10",
        name: "Malkuth",
        nameCn: "王國（現實）",
        description: "物質現實與具體的顯化結果",
      },
    ],
  },
  // ── 11 張 ──────────────────────────────────────────────
  {
    id: "venus-love",
    name: "Venus Love",
    nameCn: "維納斯之愛",
    description:
      "維納斯之愛既可以分析戀人雙方的內在情況又可以對戀人雙方未來可能出現的變化進行預測，對這段戀情作出一個細緻的分析，相當耗費Mp，必須感謝為你解答的塔羅師。",
    positions: [
      {
        id: "venus-1",
        name: "Your True Feelings",
        nameCn: "你的真實感受",
        description: "你內心深處對這段感情的真實感受",
      },
      {
        id: "venus-2",
        name: "Their True Feelings",
        nameCn: "對方的真實感受",
        description: "對方內心深處的真實感受",
      },
      {
        id: "venus-3",
        name: "Your Subconscious",
        nameCn: "你的潛意識",
        description: "你潛意識中對這段感情的態度",
      },
      {
        id: "venus-4",
        name: "Their Subconscious",
        nameCn: "對方的潛意識",
        description: "對方潛意識中的態度與想法",
      },
      {
        id: "venus-5",
        name: "Relationship Energy",
        nameCn: "關係能量",
        description: "這段感情目前的整體能量狀態",
      },
      {
        id: "venus-6",
        name: "Strengths",
        nameCn: "感情優勢",
        description: "這段感情中最強大的支撐力量",
      },
      {
        id: "venus-7",
        name: "Challenges",
        nameCn: "感情挑戰",
        description: "這段感情面臨的核心挑戰",
      },
      {
        id: "venus-8",
        name: "Your Future Change",
        nameCn: "你的未來變化",
        description: "你在這段感情中未來可能的變化",
      },
      {
        id: "venus-9",
        name: "Their Future Change",
        nameCn: "對方的未來變化",
        description: "對方在這段感情中未來可能的變化",
      },
      {
        id: "venus-10",
        name: "Relationship Future",
        nameCn: "感情走向",
        description: "這段感情整體的未來走向",
      },
      {
        id: "venus-11",
        name: "Advice",
        nameCn: "愛情建議",
        description: "維納斯給你的最終愛情建議",
      },
    ],
  },
  {
    id: "full-moon",
    name: "Full Moon Journey",
    nameCn: "滿月之旅",
    description:
      "能否復合？繼續挽回還是瀟灑離開？對方心中隱藏著什麼？你們兩人需要的是什麼？這些問題滿月之旅能夠代表月亮占卜你～><！",
    positions: [
      {
        id: "moon-1",
        name: "Your Current State",
        nameCn: "你的現狀",
        description: "你目前的情感狀態與心境",
      },
      {
        id: "moon-2",
        name: "Their Current State",
        nameCn: "對方的現狀",
        description: "對方目前的情感狀態與心境",
      },
      {
        id: "moon-3",
        name: "Your Hidden Feelings",
        nameCn: "你的隱藏感受",
        description: "你內心深處隱藏的真實感受",
      },
      {
        id: "moon-4",
        name: "Their Hidden Feelings",
        nameCn: "對方的隱藏感受",
        description: "對方內心深處隱藏的真實感受",
      },
      {
        id: "moon-5",
        name: "What You Need",
        nameCn: "你需要的",
        description: "你在這段感情中真正需要的",
      },
      {
        id: "moon-6",
        name: "What They Need",
        nameCn: "對方需要的",
        description: "對方在這段感情中真正需要的",
      },
      {
        id: "moon-7",
        name: "Reunion Possibility",
        nameCn: "復合可能性",
        description: "復合的可能性與能量走向",
      },
      {
        id: "moon-8",
        name: "If Reunite",
        nameCn: "復合後走向",
        description: "若復合後這段感情的發展",
      },
      {
        id: "moon-9",
        name: "If Separate",
        nameCn: "分開後走向",
        description: "若選擇分開後各自的發展",
      },
      {
        id: "moon-10",
        name: "Moon Guidance",
        nameCn: "月亮指引",
        description: "月亮給你的最終指引與祝福",
      },
      {
        id: "moon-11",
        name: "Advice",
        nameCn: "行動建議",
        description: "此刻你最應該採取的行動",
      },
    ],
  },
  // ── 12 張 ──────────────────────────────────────────────
  {
    id: "zodiac",
    name: "Zodiac Spread",
    nameCn: "十二星座",
    description:
      "要啟動這個巨無霸簡直賢者和大法師合力都會虛脫><！這是一個塔羅與占星術結合而創造出來的「煉成陣」！十二張牌結應著十二星座和宮位，可以針對某件事某個人的細緻分析，也可以對自己的運勢進行預測，如愛情運、事業運、健康運等等。",
    positions: [
      {
        id: "zod-1",
        name: "Aries / 1st House",
        nameCn: "牡羊座（自我）",
        description: "自我形象、個人能量與新開始",
      },
      {
        id: "zod-2",
        name: "Taurus / 2nd House",
        nameCn: "金牛座（財富）",
        description: "財富、物質資源與個人價值觀",
      },
      {
        id: "zod-3",
        name: "Gemini / 3rd House",
        nameCn: "雙子座（溝通）",
        description: "溝通、思維與短途旅行",
      },
      {
        id: "zod-4",
        name: "Cancer / 4th House",
        nameCn: "巨蟹座（家庭）",
        description: "家庭、根基與情感安全感",
      },
      {
        id: "zod-5",
        name: "Leo / 5th House",
        nameCn: "獅子座（創造）",
        description: "創造力、愛情與自我表達",
      },
      {
        id: "zod-6",
        name: "Virgo / 6th House",
        nameCn: "處女座（健康）",
        description: "健康、日常工作與服務",
      },
      {
        id: "zod-7",
        name: "Libra / 7th House",
        nameCn: "天秤座（關係）",
        description: "伴侶關係、合作與平衡",
      },
      {
        id: "zod-8",
        name: "Scorpio / 8th House",
        nameCn: "天蠍座（轉化）",
        description: "轉化、深層心理與共同資源",
      },
      {
        id: "zod-9",
        name: "Sagittarius / 9th House",
        nameCn: "射手座（信念）",
        description: "信念、高等教育與遠途旅行",
      },
      {
        id: "zod-10",
        name: "Capricorn / 10th House",
        nameCn: "摩羯座（事業）",
        description: "事業、社會地位與人生目標",
      },
      {
        id: "zod-11",
        name: "Aquarius / 11th House",
        nameCn: "水瓶座（社群）",
        description: "友誼、社群與未來願景",
      },
      {
        id: "zod-12",
        name: "Pisces / 12th House",
        nameCn: "雙魚座（靈性）",
        description: "靈性、潛意識與隱藏的事物",
      },
    ],
  },
  {
    id: "year-ahead",
    name: "Year Ahead",
    nameCn: "年度牌陣",
    description:
      "每張牌代表一個月，為你預測未來十二個月的整體能量走向，適合新年或生日時使用，充滿儀式感",
    positions: [
      {
        id: "year-1",
        name: "January",
        nameCn: "一月",
        description: "一月份的主要能量與主題",
      },
      {
        id: "year-2",
        name: "February",
        nameCn: "二月",
        description: "二月份的主要能量與主題",
      },
      {
        id: "year-3",
        name: "March",
        nameCn: "三月",
        description: "三月份的主要能量與主題",
      },
      {
        id: "year-4",
        name: "April",
        nameCn: "四月",
        description: "四月份的主要能量與主題",
      },
      {
        id: "year-5",
        name: "May",
        nameCn: "五月",
        description: "五月份的主要能量與主題",
      },
      {
        id: "year-6",
        name: "June",
        nameCn: "六月",
        description: "六月份的主要能量與主題",
      },
      {
        id: "year-7",
        name: "July",
        nameCn: "七月",
        description: "七月份的主要能量與主題",
      },
      {
        id: "year-8",
        name: "August",
        nameCn: "八月",
        description: "八月份的主要能量與主題",
      },
      {
        id: "year-9",
        name: "September",
        nameCn: "九月",
        description: "九月份的主要能量與主題",
      },
      {
        id: "year-10",
        name: "October",
        nameCn: "十月",
        description: "十月份的主要能量與主題",
      },
      {
        id: "year-11",
        name: "November",
        nameCn: "十一月",
        description: "十一月份的主要能量與主題",
      },
      {
        id: "year-12",
        name: "December",
        nameCn: "十二月",
        description: "十二月份的主要能量與主題",
      },
    ],
  },
  // ── 特殊（愛情專題）──────────────────────────────────
  {
    id: "love-tree",
    name: "Love Tree",
    nameCn: "愛情之樹",
    description:
      "使用22張大阿爾卡納占卜你最近的桃花運或在戀愛中遇到的問題，了解潛在因素對未來發展的影響",
    positions: [
      {
        id: "lt-1",
        name: "Roots",
        nameCn: "根（感情基礎）",
        description: "這段感情的根基與起源",
      },
      {
        id: "lt-2",
        name: "Trunk",
        nameCn: "幹（現在狀態）",
        description: "感情目前的核心狀態",
      },
      {
        id: "lt-3",
        name: "Left Branch",
        nameCn: "左枝（你的付出）",
        description: "你在這段感情中的付出與能量",
      },
      {
        id: "lt-4",
        name: "Right Branch",
        nameCn: "右枝（對方付出）",
        description: "對方在這段感情中的付出與能量",
      },
      {
        id: "lt-5",
        name: "Hidden",
        nameCn: "隱藏因素",
        description: "影響感情的潛在因素",
      },
      {
        id: "lt-6",
        name: "Fruit",
        nameCn: "果（未來發展）",
        description: "這段感情未來可能結出的果實",
      },
    ],
  },
  {
    id: "holy-cat",
    name: "Holy Cat",
    nameCn: "聖花貓",
    description: "尤其適合涉及兩個人的發展性問題，能揭示雙方的態度及發展趨勢",
    positions: [
      {
        id: "hc-1",
        name: "Your Attitude",
        nameCn: "你的態度",
        description: "你對這件事/這段關係的態度",
      },
      {
        id: "hc-2",
        name: "Their Attitude",
        nameCn: "對方的態度",
        description: "對方對這件事/這段關係的態度",
      },
      {
        id: "hc-3",
        name: "Current Dynamic",
        nameCn: "當前動態",
        description: "雙方目前的互動動態",
      },
      {
        id: "hc-4",
        name: "Your Development",
        nameCn: "你的發展趨勢",
        description: "你這方的發展趨勢",
      },
      {
        id: "hc-5",
        name: "Their Development",
        nameCn: "對方的發展趨勢",
        description: "對方的發展趨勢",
      },
      {
        id: "hc-6",
        name: "Outcome",
        nameCn: "最終走向",
        description: "雙方互動的最終走向",
      },
    ],
  },
  {
    id: "intuition-response",
    name: "Intuition Response",
    nameCn: "靈感對應",
    description: "靈感對應主要針對雙方的感受與想法及關係發展的期望",
    positions: [
      {
        id: "ir-1",
        name: "Your Feelings",
        nameCn: "你的感受",
        description: "你對這段關係的真實感受",
      },
      {
        id: "ir-2",
        name: "Their Feelings",
        nameCn: "對方的感受",
        description: "對方對這段關係的真實感受",
      },
      {
        id: "ir-3",
        name: "Your Thoughts",
        nameCn: "你的想法",
        description: "你對未來的期望與想法",
      },
      {
        id: "ir-4",
        name: "Their Thoughts",
        nameCn: "對方的想法",
        description: "對方對未來的期望與想法",
      },
      {
        id: "ir-5",
        name: "Your Hope",
        nameCn: "你的期望",
        description: "你希望這段關係如何發展",
      },
      {
        id: "ir-6",
        name: "Their Hope",
        nameCn: "對方的期望",
        description: "對方希望這段關係如何發展",
      },
      {
        id: "ir-7",
        name: "Resonance",
        nameCn: "靈感共鳴",
        description: "雙方之間的靈性連結與共鳴",
      },
    ],
  },
  {
    id: "single-to-couple",
    name: "Single to Couple",
    nameCn: "脫單項鏈&沙漏",
    description:
      "吃狗糧吃到吐？想把狗糧塞回去？那就使用我把！單身狗的逆襲全程干貨指引你如何快速脫單，讓你清晰知道問題關鍵暴擊單身狗！最終形態脫單沙漏，脫單指日可待！",
    positions: [
      {
        id: "stc-1",
        name: "Current You",
        nameCn: "現在的你",
        description: "你目前的狀態與能量",
      },
      {
        id: "stc-2",
        name: "Why Single",
        nameCn: "單身原因",
        description: "導致你單身的核心原因",
      },
      {
        id: "stc-3",
        name: "Your Charm",
        nameCn: "你的魅力",
        description: "你最吸引人的特質與魅力",
      },
      {
        id: "stc-4",
        name: "Obstacle",
        nameCn: "脫單障礙",
        description: "阻礙你脫單的主要因素",
      },
      {
        id: "stc-5",
        name: "Opportunity",
        nameCn: "脫單機遇",
        description: "即將到來的脫單機遇",
      },
      {
        id: "stc-6",
        name: "Ideal Partner",
        nameCn: "理想對象",
        description: "適合你的理想伴侶特質",
      },
      {
        id: "stc-7",
        name: "Action",
        nameCn: "行動建議",
        description: "脫單需要採取的具體行動",
      },
      {
        id: "stc-8",
        name: "Timeline",
        nameCn: "時間能量",
        description: "脫單的時間能量與契機",
      },
    ],
  },
  {
    id: "reunion",
    name: "Reunion",
    nameCn: "X復合陣",
    description: "不用多說！只要想復合請選這個陣！",
    positions: [
      {
        id: "reu-1",
        name: "Your Current Feelings",
        nameCn: "你現在的感受",
        description: "你目前對這段感情的真實感受",
      },
      {
        id: "reu-2",
        name: "Their Current Feelings",
        nameCn: "對方現在的感受",
        description: "對方目前對這段感情的感受",
      },
      {
        id: "reu-3",
        name: "Breakup Reason",
        nameCn: "分手原因",
        description: "導致分手的核心原因",
      },
      {
        id: "reu-4",
        name: "Your Change",
        nameCn: "你的改變",
        description: "你在這段時間的成長與改變",
      },
      {
        id: "reu-5",
        name: "Their Change",
        nameCn: "對方的改變",
        description: "對方在這段時間的成長與改變",
      },
      {
        id: "reu-6",
        name: "Reunion Chance",
        nameCn: "復合機率",
        description: "復合的可能性與能量",
      },
      {
        id: "reu-7",
        name: "If Reunite",
        nameCn: "復合後走向",
        description: "若復合後這段感情的走向",
      },
      {
        id: "reu-8",
        name: "Advice",
        nameCn: "行動建議",
        description: "此刻最應該採取的行動",
      },
    ],
  },
  {
    id: "broken-mirror",
    name: "Broken Mirror Reunion",
    nameCn: "破鏡重圓",
    description:
      "已經分手了怎麼挽回？情敵那邊什麼情況？他（她）又是怎麼想的？我該如何做？這種夾雜著第三者的複雜復合問題破鏡重圓是你的絕佳選擇！",
    positions: [
      {
        id: "bm-1",
        name: "Your State",
        nameCn: "你的狀態",
        description: "你目前的情感狀態",
      },
      {
        id: "bm-2",
        name: "Their State",
        nameCn: "對方的狀態",
        description: "對方目前的情感狀態",
      },
      {
        id: "bm-3",
        name: "Third Party",
        nameCn: "第三者情況",
        description: "第三者的存在與影響",
      },
      {
        id: "bm-4",
        name: "Their Thoughts",
        nameCn: "對方的想法",
        description: "對方對你和這段感情的真實想法",
      },
      {
        id: "bm-5",
        name: "Obstacle",
        nameCn: "復合障礙",
        description: "阻礙復合的主要因素",
      },
      {
        id: "bm-6",
        name: "Your Advantage",
        nameCn: "你的優勢",
        description: "你相對於第三者的優勢",
      },
      {
        id: "bm-7",
        name: "How to Act",
        nameCn: "如何行動",
        description: "你應該如何採取行動",
      },
      {
        id: "bm-8",
        name: "Outcome",
        nameCn: "最終結果",
        description: "這段感情最終的走向",
      },
    ],
  },
  // ── 特殊（人際/矛盾）──────────────────────────────────
  {
    id: "cong-chen",
    name: "Cong Chen",
    nameCn: "丛辰",
    description:
      "你們矛盾了嗎？兩人相處小不免有摩擦，丛辰能夠指引你解決問題。丛為聚集的意思，辰則是天上的星星和時間。丛辰能聚集天上的星星祝福你們能度過在一起的好時光。本牌陣是占星貓第一款疊式牌陣，多線程立體的解讀能夠清晰地指出解決問題的方法和方向。同時也適用於對立問題的解決。",
    positions: [
      {
        id: "cc-1",
        name: "Your Perspective",
        nameCn: "你的立場",
        description: "你在這個矛盾中的立場與感受",
      },
      {
        id: "cc-2",
        name: "Their Perspective",
        nameCn: "對方的立場",
        description: "對方在這個矛盾中的立場與感受",
      },
      {
        id: "cc-3",
        name: "Root Cause",
        nameCn: "矛盾根源",
        description: "這個矛盾的深層根源",
      },
      {
        id: "cc-4",
        name: "Your Blind Spot",
        nameCn: "你的盲點",
        description: "你在這件事上的盲點",
      },
      {
        id: "cc-5",
        name: "Their Blind Spot",
        nameCn: "對方的盲點",
        description: "對方在這件事上的盲點",
      },
      {
        id: "cc-6",
        name: "Common Ground",
        nameCn: "共同點",
        description: "雙方的共同點與可以和解的基礎",
      },
      {
        id: "cc-7",
        name: "Solution",
        nameCn: "解決之道",
        description: "化解矛盾的最佳方法",
      },
      {
        id: "cc-8",
        name: "Star Blessing",
        nameCn: "星辰祝福",
        description: "天上星辰給你們的祝福與指引",
      },
    ],
  },
  // ── 特殊（魔鏡/自由）──────────────────────────────────
  {
    id: "magic-mirror",
    name: "Magic Mirror",
    nameCn: "魔鏡",
    description:
      '"魔鏡魔鏡邊個最靚"不知道用什麼牌陣？問魔鏡吧！這是一個占星貓特別為廣大用戶設計的特殊萬能牌陣，提問者可以因應自己問題的點在相應位置上擺放塔羅牌進行有針對性的占卜。1～11張牌隨意增減完全自由完全人性化！',
    positions: [
      {
        id: "mm-1",
        name: "Mirror 1",
        nameCn: "鏡面一",
        description: "自由設定此位置的含義",
      },
      {
        id: "mm-2",
        name: "Mirror 2",
        nameCn: "鏡面二",
        description: "自由設定此位置的含義",
      },
      {
        id: "mm-3",
        name: "Mirror 3",
        nameCn: "鏡面三",
        description: "自由設定此位置的含義",
      },
      {
        id: "mm-4",
        name: "Mirror 4",
        nameCn: "鏡面四",
        description: "自由設定此位置的含義",
      },
      {
        id: "mm-5",
        name: "Mirror 5",
        nameCn: "鏡面五",
        description: "自由設定此位置的含義",
      },
    ],
  },
  // ── 來自占星喵 APK 新牌陣（含百分比座標） ──────────────
  {
    id: "starcat-year",
    name: "Year Ahead",
    nameCn: "年度展望",
    description: "以十二張牌代表一年十二個月的能量，讓塔羅引領你了解整年的起伏與機遇。",
    layoutType: "circle",
    bgGradient: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
    positions: [
      { id: "year-1",  name: "January",   nameCn: "一月",   description: "一月份的主要能量與事件", coords: { x: 50, y: 8  } },
      { id: "year-2",  name: "February",  nameCn: "二月",   description: "二月份的主要能量與事件", coords: { x: 74, y: 14 } },
      { id: "year-3",  name: "March",     nameCn: "三月",   description: "三月份的主要能量與事件", coords: { x: 90, y: 33 } },
      { id: "year-4",  name: "April",     nameCn: "四月",   description: "四月份的主要能量與事件", coords: { x: 90, y: 55 } },
      { id: "year-5",  name: "May",       nameCn: "五月",   description: "五月份的主要能量與事件", coords: { x: 74, y: 74 } },
      { id: "year-6",  name: "June",      nameCn: "六月",   description: "六月份的主要能量與事件", coords: { x: 50, y: 82 } },
      { id: "year-7",  name: "July",      nameCn: "七月",   description: "七月份的主要能量與事件", coords: { x: 26, y: 74 } },
      { id: "year-8",  name: "August",    nameCn: "八月",   description: "八月份的主要能量與事件", coords: { x: 10, y: 55 } },
      { id: "year-9",  name: "September", nameCn: "九月",   description: "九月份的主要能量與事件", coords: { x: 10, y: 33 } },
      { id: "year-10", name: "October",   nameCn: "十月",   description: "十月份的主要能量與事件", coords: { x: 26, y: 14 } },
      { id: "year-11", name: "November",  nameCn: "十一月", description: "十一月份的主要能量與事件", coords: { x: 38, y: 44 } },
      { id: "year-12", name: "December",  nameCn: "十二月", description: "十二月份的主要能量與事件", coords: { x: 62, y: 44 } },
    ],
  },
  {
    id: "starcat-relationship-cross",
    name: "Relationship Cross",
    nameCn: "感情十字",
    description: "深入探索感情關係的各個面向，了解雙方的能量互動與未來走向。",
    layoutType: "cross",
    bgGradient: "linear-gradient(135deg, #ff9a9e 0%, #a18cd1 100%)",
    positions: [
      { id: "rc-1", name: "You",          nameCn: "你的能量",     description: "你在這段關係中的狀態與態度",       coords: { x: 20, y: 50 } },
      { id: "rc-2", name: "Partner",      nameCn: "對方的能量",   description: "對方在這段關係中的狀態與態度",     coords: { x: 80, y: 50 } },
      { id: "rc-3", name: "Connection",   nameCn: "連結",         description: "你們之間的感情連結與羈絆",         coords: { x: 50, y: 50 } },
      { id: "rc-4", name: "Challenge",    nameCn: "挑戰",         description: "目前關係面臨的主要挑戰",           coords: { x: 50, y: 20 } },
      { id: "rc-5", name: "Potential",    nameCn: "潛力",         description: "這段關係的最大潛能與可能的未來",   coords: { x: 50, y: 80 } },
    ],
  },
  {
    id: "starcat-career-star",
    name: "Career Star",
    nameCn: "事業之星",
    description: "以五芒星佈局全面解讀你的事業發展，從優勢到挑戰，從機遇到建議。",
    layoutType: "star",
    bgGradient: "linear-gradient(135deg, #f7971e 0%, #ffd200 100%)",
    positions: [
      { id: "cs-1", name: "Core Strength",   nameCn: "核心優勢",   description: "你在事業上的核心能力與優勢",         coords: { x: 50, y: 50 } },
      { id: "cs-2", name: "Current State",   nameCn: "當前狀態",   description: "你目前事業的整體狀況",               coords: { x: 50, y: 15 } },
      { id: "cs-3", name: "Opportunity",     nameCn: "機遇",       description: "即將到來或潛在的事業機遇",           coords: { x: 82, y: 68 } },
      { id: "cs-4", name: "Challenge",       nameCn: "挑戰",       description: "需要克服的事業障礙",                 coords: { x: 18, y: 68 } },
      { id: "cs-5", name: "Outcome",         nameCn: "結果",       description: "按現有路徑發展的可能結果",           coords: { x: 50, y: 85 } },
    ],
  },
  {
    id: "starcat-decision",
    name: "Decision Path",
    nameCn: "決策路徑",
    description: "當你面臨重要決策時，這個牌陣幫你清晰地看見兩條不同路徑的能量與走向。",
    layoutType: "custom",
    bgGradient: "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    positions: [
      { id: "dp-1", name: "Core Issue",    nameCn: "核心議題",   description: "這個決策的核心本質",                         coords: { x: 50, y: 20 } },
      { id: "dp-2", name: "Path A",        nameCn: "路徑A",      description: "第一個選擇的能量與走向",                     coords: { x: 22, y: 50 } },
      { id: "dp-3", name: "Path B",        nameCn: "路徑B",      description: "第二個選擇的能量與走向",                     coords: { x: 78, y: 50 } },
      { id: "dp-4", name: "Result A",      nameCn: "路徑A結果",  description: "選擇路徑A的可能結果",                       coords: { x: 22, y: 78 } },
      { id: "dp-5", name: "Result B",      nameCn: "路徑B結果",  description: "選擇路徑B的可能結果",                       coords: { x: 78, y: 78 } },
      { id: "dp-6", name: "Advice",        nameCn: "宇宙建議",   description: "塔羅給予的最終指引",                         coords: { x: 50, y: 92 } },
    ],
  },
  {
    id: "starcat-horseshoe",
    name: "Horseshoe",
    nameCn: "馬蹄鐵牌陣",
    description: "七張牌的馬蹄形牌陣，從過去到未來，全面掌握情勢發展的完整脈絡。",
    layoutType: "horseshoe",
    bgGradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    positions: [
      { id: "hs-1", name: "Distant Past",  nameCn: "遠過去", description: "深遠影響當前情況的過去根源",     coords: { x: 10, y: 75 } },
      { id: "hs-2", name: "Recent Past",   nameCn: "近過去", description: "最近影響現狀的事件",             coords: { x: 24, y: 45 } },
      { id: "hs-3", name: "Present",       nameCn: "現在",   description: "當前的核心狀態",                 coords: { x: 38, y: 25 } },
      { id: "hs-4", name: "Future",        nameCn: "未來",   description: "即將到來的能量走向",             coords: { x: 50, y: 18 } },
      { id: "hs-5", name: "Environment",   nameCn: "環境",   description: "周圍的人和環境的影響",           coords: { x: 62, y: 25 } },
      { id: "hs-6", name: "Hidden",        nameCn: "隱藏",   description: "潛藏的因素或未意識到的影響",     coords: { x: 76, y: 45 } },
      { id: "hs-7", name: "Outcome",       nameCn: "結果",   description: "整體發展的可能最終結果",         coords: { x: 90, y: 75 } },
    ],
  },
  {
    id: "starcat-self-discovery",
    name: "Self Discovery",
    nameCn: "自我探索",
    description: "深入探索你的內在世界，了解你的真實自我、潛在力量與成長方向。",
    layoutType: "custom",
    bgGradient: "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    positions: [
      { id: "sd-1", name: "True Self",     nameCn: "真實自我",   description: "你最深層、最真實的本質",         coords: { x: 50, y: 22 } },
      { id: "sd-2", name: "Hidden Gift",   nameCn: "隱藏天賦",   description: "你尚未完全發揮的潛在天賦",       coords: { x: 22, y: 45 } },
      { id: "sd-3", name: "Shadow Self",   nameCn: "陰影自我",   description: "你需要整合的陰暗面或恐懼",       coords: { x: 78, y: 45 } },
      { id: "sd-4", name: "Life Lesson",   nameCn: "人生功課",   description: "此刻你需要學習的重要功課",       coords: { x: 30, y: 72 } },
      { id: "sd-5", name: "Next Step",     nameCn: "下一步",     description: "邁向更完整自我的行動方向",       coords: { x: 70, y: 72 } },
    ],
  },
  {
    id: "starcat-healing",
    name: "Healing Path",
    nameCn: "療癒之路",
    description: "專為情感療癒設計，幫助你了解傷痛的根源，找到療癒的路徑與前進的力量。",
    layoutType: "custom",
    bgGradient: "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
    positions: [
      { id: "hp-1", name: "The Wound",     nameCn: "傷口",         description: "需要療癒的核心傷痛或議題",       coords: { x: 50, y: 18 } },
      { id: "hp-2", name: "The Root",      nameCn: "根源",         description: "這個傷痛的深層根源",             coords: { x: 22, y: 42 } },
      { id: "hp-3", name: "The Block",     nameCn: "阻礙",         description: "阻止你療癒的因素",               coords: { x: 78, y: 42 } },
      { id: "hp-4", name: "The Medicine",  nameCn: "療方",         description: "幫助療癒的資源或行動",           coords: { x: 22, y: 70 } },
      { id: "hp-5", name: "The Gift",      nameCn: "禮物",         description: "這次療癒過程帶來的成長與禮物",   coords: { x: 78, y: 70 } },
      { id: "hp-6", name: "The Future",    nameCn: "療癒後",       description: "完整療癒後你的可能樣貌",         coords: { x: 50, y: 88 } },
    ],
  },
  {
    id: "starcat-abundance",
    name: "Abundance",
    nameCn: "豐盛顯化",
    description: "探索你與豐盛、金錢和成功的關係，找到吸引和創造豐盛生活的指引。",
    layoutType: "triangle",
    bgGradient: "linear-gradient(135deg, #f7971e 0%, #ffd200 50%, #fa709a 100%)",
    positions: [
      { id: "ab-1", name: "Current Energy",  nameCn: "現有能量",   description: "你目前與豐盛連結的狀態",             coords: { x: 50, y: 18 } },
      { id: "ab-2", name: "Belief Block",    nameCn: "信念阻礙",   description: "阻礙你接收豐盛的信念或模式",         coords: { x: 22, y: 68 } },
      { id: "ab-3", name: "Abundance Key",   nameCn: "豐盛鑰匙",   description: "開啟豐盛之門的關鍵行動或心態",       coords: { x: 78, y: 68 } },
    ],
  },
  {
    id: "starcat-chakra-tarot",
    name: "Chakra Balance",
    nameCn: "脈輪平衡",
    description: "以七張牌對應七個脈輪，了解你能量體系的狀態，找出需要平衡的區域。",
    layoutType: "custom",
    bgGradient: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)",
    positions: [
      { id: "ck-1", name: "Crown",     nameCn: "頂輪",         description: "靈性連結與高我智慧",   coords: { x: 50, y: 8  } },
      { id: "ck-2", name: "Third Eye", nameCn: "眉心輪",       description: "直覺與洞察力",         coords: { x: 50, y: 22 } },
      { id: "ck-3", name: "Throat",    nameCn: "喉輪",         description: "溝通與自我表達",       coords: { x: 50, y: 36 } },
      { id: "ck-4", name: "Heart",     nameCn: "心輪",         description: "愛與連結",             coords: { x: 50, y: 50 } },
      { id: "ck-5", name: "Solar",     nameCn: "太陽神經叢輪", description: "個人力量與意志",       coords: { x: 50, y: 64 } },
      { id: "ck-6", name: "Sacral",    nameCn: "臍輪",         description: "創造力與情感流動",     coords: { x: 50, y: 78 } },
      { id: "ck-7", name: "Root",      nameCn: "海底輪",       description: "安全感與物質根基",     coords: { x: 50, y: 92 } },
    ],
  },
  {
    id: "starcat-soul-purpose",
    name: "Soul Purpose",
    nameCn: "靈魂使命",
    description: "探索你這一生的靈魂使命與生命目的，了解你獨特的天賦與要完成的功課。",
    layoutType: "custom",
    bgGradient: "linear-gradient(135deg, #6a11cb 0%, #2575fc 100%)",
    positions: [
      { id: "sp-1", name: "Soul Gift",    nameCn: "靈魂天賦",   description: "你天生帶來的獨特天賦",               coords: { x: 50, y: 15 } },
      { id: "sp-2", name: "Life Theme",   nameCn: "生命主題",   description: "這一生的核心學習主題",               coords: { x: 22, y: 38 } },
      { id: "sp-3", name: "Mission",      nameCn: "使命",       description: "你靈魂的最高使命",                   coords: { x: 78, y: 38 } },
      { id: "sp-4", name: "Challenge",    nameCn: "挑戰",       description: "需要超越的靈魂挑戰",                 coords: { x: 22, y: 65 } },
      { id: "sp-5", name: "Next Step",    nameCn: "下一步",     description: "靠近靈魂使命的具體行動",             coords: { x: 78, y: 65 } },
      { id: "sp-6", name: "Blessing",     nameCn: "祝福",       description: "宇宙給你旅途上的祝福",               coords: { x: 50, y: 88 } },
    ],
  },
];

/** 取得預設牌陣（三張牌陣） */
export function getDefaultFateSpread(): FateSpread {
  return fateSpreads.find((s) => s.id === "three-card")!;
}

/** 根據 ID 取得牌陣 */
export function getFateSpreadById(id: string): FateSpread | undefined {
  return fateSpreads.find((s) => s.id === id);
}

/** 根據佈局類型過濾牌陣 */
export function getFateSpreadsByLayout(layoutType: string): FateSpread[] {
  return fateSpreads.filter((s) => s.layoutType === layoutType);
}
