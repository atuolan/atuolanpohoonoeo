/**
 * 占星骰子資料
 * 10 顆行星 + 12 星座 + 12 宮位 = 36 個符號
 */
import type { AstroHouse, AstroPlanet, AstroSign } from "@/types/astroDice";

// ============================================================
// 行星（10 顆）
// ============================================================
export const astroPlanets: AstroPlanet[] = [
  {
    id: "sun",
    symbol: "☉",
    name: "Sun",
    nameCn: "太陽",
    keywords: ["自我", "意志", "生命力", "榮耀", "父親"],
    description: "代表核心自我、意志力、生命能量。問題的核心、主角、權威人物。",
  },
  {
    id: "moon",
    symbol: "☽",
    name: "Moon",
    nameCn: "月亮",
    keywords: ["情緒", "直覺", "母親", "習慣", "安全感"],
    description: "代表情緒、潛意識、內在需求。情感反應、過去、家庭、女性。",
  },
  {
    id: "mercury",
    symbol: "☿",
    name: "Mercury",
    nameCn: "水星",
    keywords: ["溝通", "思考", "學習", "交通", "訊息"],
    description: "代表思維、溝通、學習能力。訊息傳遞、短途旅行、兄弟姐妹。",
  },
  {
    id: "venus",
    symbol: "♀",
    name: "Venus",
    nameCn: "金星",
    keywords: ["愛情", "美麗", "金錢", "價值", "和諧"],
    description: "代表愛情、美感、價值觀。關係、藝術、享樂、財務。",
  },
  {
    id: "mars",
    symbol: "♂",
    name: "Mars",
    nameCn: "火星",
    keywords: ["行動", "勇氣", "衝突", "慾望", "競爭"],
    description: "代表行動力、勇氣、慾望。衝突、競爭、性能量、男性。",
  },
  {
    id: "jupiter",
    symbol: "♃",
    name: "Jupiter",
    nameCn: "木星",
    keywords: ["擴張", "幸運", "智慧", "信仰", "旅行"],
    description: "代表擴張、機會、樂觀。高等教育、長途旅行、哲學、法律。",
  },
  {
    id: "saturn",
    symbol: "♄",
    name: "Saturn",
    nameCn: "土星",
    keywords: ["責任", "限制", "時間", "考驗", "結構"],
    description: "代表責任、限制、紀律。時間、考驗、權威、長期承諾。",
  },
  {
    id: "uranus",
    symbol: "♅",
    name: "Uranus",
    nameCn: "天王星",
    keywords: ["突變", "創新", "自由", "叛逆", "科技"],
    description: "代表突變、創新、獨立。意外、科技、改革、打破常規。",
  },
  {
    id: "neptune",
    symbol: "♆",
    name: "Neptune",
    nameCn: "海王星",
    keywords: ["夢幻", "靈性", "迷惑", "藝術", "逃避"],
    description: "代表夢想、靈性、幻覺。藝術、直覺、迷惑、自我欺騙。",
  },
  {
    id: "pluto",
    symbol: "♇",
    name: "Pluto",
    nameCn: "冥王星",
    keywords: ["轉化", "權力", "死亡重生", "深層", "控制"],
    description: "代表轉化、深層力量、重生。權力鬥爭、心理深處、極端。",
  },
];

// ============================================================
// 星座（12 個）
// ============================================================
export const astroSigns: AstroSign[] = [
  {
    id: "aries",
    symbol: "♈",
    name: "Aries",
    nameCn: "白羊座",
    element: "fire",
    modality: "cardinal",
    keywords: ["衝動", "開創", "勇敢", "直接", "競爭"],
    description: "開創、衝動、直接。快速行動、新開始、勇往直前。",
  },
  {
    id: "taurus",
    symbol: "♉",
    name: "Taurus",
    nameCn: "金牛座",
    element: "earth",
    modality: "fixed",
    keywords: ["穩定", "物質", "享受", "固執", "耐心"],
    description: "穩定、務實、享受。物質安全、感官享樂、堅持不變。",
  },
  {
    id: "gemini",
    symbol: "♊",
    name: "Gemini",
    nameCn: "雙子座",
    element: "air",
    modality: "mutable",
    keywords: ["溝通", "多變", "好奇", "靈活", "雙面"],
    description: "溝通、多變、好奇。資訊交流、適應變化、多重面向。",
  },
  {
    id: "cancer",
    symbol: "♋",
    name: "Cancer",
    nameCn: "巨蟹座",
    element: "water",
    modality: "cardinal",
    keywords: ["情感", "家庭", "保護", "敏感", "滋養"],
    description: "情感、家庭、保護。內在安全、滋養照顧、情緒敏感。",
  },
  {
    id: "leo",
    symbol: "♌",
    name: "Leo",
    nameCn: "獅子座",
    element: "fire",
    modality: "fixed",
    keywords: ["自信", "創造", "表現", "慷慨", "驕傲"],
    description: "自信、創造、表現。領導力、戲劇性、需要被認可。",
  },
  {
    id: "virgo",
    symbol: "♍",
    name: "Virgo",
    nameCn: "處女座",
    element: "earth",
    modality: "mutable",
    keywords: ["分析", "服務", "完美", "實際", "健康"],
    description: "分析、服務、完美。細節導向、實用主義、自我改進。",
  },
  {
    id: "libra",
    symbol: "♎",
    name: "Libra",
    nameCn: "天秤座",
    element: "air",
    modality: "cardinal",
    keywords: ["平衡", "關係", "美感", "公正", "猶豫"],
    description: "平衡、關係、美感。合作夥伴、和諧追求、難以決定。",
  },
  {
    id: "scorpio",
    symbol: "♏",
    name: "Scorpio",
    nameCn: "天蠍座",
    element: "water",
    modality: "fixed",
    keywords: ["深刻", "佔有", "轉化", "神秘", "強烈"],
    description: "深刻、佔有、轉化。強烈情感、洞察力、不輕易表達。",
  },
  {
    id: "sagittarius",
    symbol: "♐",
    name: "Sagittarius",
    nameCn: "射手座",
    element: "fire",
    modality: "mutable",
    keywords: ["自由", "探索", "樂觀", "哲學", "直率"],
    description: "自由、探索、樂觀。追求真理、冒險精神、直言不諱。",
  },
  {
    id: "capricorn",
    symbol: "♑",
    name: "Capricorn",
    nameCn: "摩羯座",
    element: "earth",
    modality: "cardinal",
    keywords: ["野心", "務實", "責任", "傳統", "成就"],
    description: "野心、務實、責任。長期目標、社會地位、穩紮穩打。",
  },
  {
    id: "aquarius",
    symbol: "♒",
    name: "Aquarius",
    nameCn: "水瓶座",
    element: "air",
    modality: "fixed",
    keywords: ["獨立", "創新", "人道", "疏離", "未來"],
    description: "獨立、創新、人道。打破常規、群體意識、保持距離。",
  },
  {
    id: "pisces",
    symbol: "♓",
    name: "Pisces",
    nameCn: "雙魚座",
    element: "water",
    modality: "mutable",
    keywords: ["夢幻", "同理", "逃避", "靈性", "犧牲"],
    description: "夢幻、同理、逃避。直覺敏銳、界限模糊、不想面對現實。",
  },
];

// ============================================================
// 宮位（12 個）
// ============================================================
export const astroHouses: AstroHouse[] = [
  {
    id: "house-1",
    number: 1,
    romanNumeral: "I",
    name: "First House",
    nameCn: "第一宮",
    keywords: ["自我", "外表", "開始", "個性", "身體"],
    description: "自我宮。代表自我形象、外在表現、新的開始、第一印象。",
  },
  {
    id: "house-2",
    number: 2,
    romanNumeral: "II",
    name: "Second House",
    nameCn: "第二宮",
    keywords: ["金錢", "價值", "資源", "自我價值", "物質"],
    description: "財帛宮。代表金錢、物質資源、個人價值觀、自我價值感。",
  },
  {
    id: "house-3",
    number: 3,
    romanNumeral: "III",
    name: "Third House",
    nameCn: "第三宮",
    keywords: ["溝通", "學習", "兄弟", "短途", "思維"],
    description: "兄弟宮。代表溝通、學習、兄弟姐妹、鄰居、短途旅行。",
  },
  {
    id: "house-4",
    number: 4,
    romanNumeral: "IV",
    name: "Fourth House",
    nameCn: "第四宮",
    keywords: ["家庭", "根源", "安全", "父母", "內在"],
    description: "田宅宮。代表家庭、根源、內在安全感、父母、房產。",
  },
  {
    id: "house-5",
    number: 5,
    romanNumeral: "V",
    name: "Fifth House",
    nameCn: "第五宮",
    keywords: ["創造", "戀愛", "子女", "娛樂", "表現"],
    description: "子女宮。代表創造力、戀愛、子女、娛樂、自我表現。",
  },
  {
    id: "house-6",
    number: 6,
    romanNumeral: "VI",
    name: "Sixth House",
    nameCn: "第六宮",
    keywords: ["工作", "健康", "服務", "日常", "習慣"],
    description: "奴僕宮。代表日常工作、健康、服務、習慣、寵物。",
  },
  {
    id: "house-7",
    number: 7,
    romanNumeral: "VII",
    name: "Seventh House",
    nameCn: "第七宮",
    keywords: ["伴侶", "合作", "婚姻", "對手", "關係"],
    description: "夫妻宮。代表一對一關係、婚姻、合作夥伴、公開敵人。",
  },
  {
    id: "house-8",
    number: 8,
    romanNumeral: "VIII",
    name: "Eighth House",
    nameCn: "第八宮",
    keywords: ["轉化", "親密", "共享", "死亡", "深層"],
    description: "疾厄宮。代表轉化、親密關係、共享資源、死亡重生、心理深處。",
  },
  {
    id: "house-9",
    number: 9,
    romanNumeral: "IX",
    name: "Ninth House",
    nameCn: "第九宮",
    keywords: ["哲學", "旅行", "高等教育", "信仰", "擴展"],
    description: "遷移宮。代表高等教育、長途旅行、哲學、宗教、法律。",
  },
  {
    id: "house-10",
    number: 10,
    romanNumeral: "X",
    name: "Tenth House",
    nameCn: "第十宮",
    keywords: ["事業", "地位", "成就", "公眾", "權威"],
    description: "官祿宮。代表事業、社會地位、公眾形象、成就、權威。",
  },
  {
    id: "house-11",
    number: 11,
    romanNumeral: "XI",
    name: "Eleventh House",
    nameCn: "第十一宮",
    keywords: ["朋友", "團體", "願望", "社群", "未來"],
    description: "福德宮。代表朋友、團體、社群、願望、未來目標。",
  },
  {
    id: "house-12",
    number: 12,
    romanNumeral: "XII",
    name: "Twelfth House",
    nameCn: "第十二宮",
    keywords: ["隱藏", "潛意識", "靈性", "結束", "孤獨"],
    description: "玄秘宮。代表隱藏、潛意識、靈性、結束、隱退、自我犧牲。",
  },
];

/** 取得隨機行星 */
export function getRandomPlanet(): AstroPlanet {
  return astroPlanets[Math.floor(Math.random() * astroPlanets.length)];
}

/** 取得隨機星座 */
export function getRandomSign(): AstroSign {
  return astroSigns[Math.floor(Math.random() * astroSigns.length)];
}

/** 取得隨機宮位 */
export function getRandomHouse(): AstroHouse {
  return astroHouses[Math.floor(Math.random() * astroHouses.length)];
}
