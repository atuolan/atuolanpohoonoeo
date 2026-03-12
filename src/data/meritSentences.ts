/**
 * 功德修行系統 - 飄字句子資料
 */

export interface MeritSentence {
  id: string;
  /** 句子的詞組（按空格拆分） */
  words: string[];
  /** 分類標籤 */
  category: string;
  /** 解鎖價格（0 = 免費） */
  price: number;
}

/** 敲木魚預設句子 */
export const WOODFISH_DEFAULT_SENTENCE: MeritSentence = {
  id: "wf_default",
  words: ["All", "Money", "Back", "My", "Home"],
  category: "財神降臨",
  price: 0,
};

/** 盤佛珠預設句子 */
export const BEADS_DEFAULT_SENTENCE: MeritSentence = {
  id: "bd_default",
  words: ["Get", "Rich", "No", "Scam", "Real", "Deal"],
  category: "暴富系列",
  price: 0,
};

/** 可解鎖句子池 */
export const UNLOCKABLE_SENTENCES: MeritSentence[] = [
  {
    id: "sent_bug_free",
    words: ["Bug", "Free", "Code", "Deploy", "Success"],
    category: "工程師祈福",
    price: 10000,
  },
  {
    id: "sent_no_overtime",
    words: ["No", "More", "Overtime", "Go", "Home", "Early"],
    category: "打工人心聲",
    price: 10000,
  },
  {
    id: "sent_salary",
    words: ["Salary", "Double", "Boss", "Be", "Nice"],
    category: "加薪祈願",
    price: 15000,
  },
  {
    id: "sent_ex",
    words: ["Ex", "Come", "Back", "On", "Their", "Knees"],
    category: "前任系列",
    price: 20000,
  },
  {
    id: "sent_weight",
    words: ["Weight", "Loss", "No", "Exercise", "Eat", "More"],
    category: "減肥許願",
    price: 10000,
  },
  {
    id: "sent_rent",
    words: ["Rent", "Drop", "Price", "House", "Buy", "Easy"],
    category: "買房祈福",
    price: 30000,
  },
  {
    id: "sent_hair",
    words: ["Hair", "Grow", "Back", "Thick", "And", "Strong"],
    category: "防禿祈願",
    price: 20000,
  },
  {
    id: "sent_wifi",
    words: ["WiFi", "Fast", "Signal", "Full", "Forever"],
    category: "現代剛需",
    price: 10000,
  },
  {
    id: "sent_deadline",
    words: ["Deadline", "Extend", "Client", "Be", "Chill"],
    category: "甲方乙方",
    price: 15000,
  },
  {
    id: "sent_sleep",
    words: ["Sleep", "Well", "Dream", "Good", "Wake", "Fresh"],
    category: "養生系列",
    price: 10000,
  },
  {
    id: "sent_skin",
    words: ["Skin", "Clear", "Glow", "Up", "No", "Acne"],
    category: "顏值祈願",
    price: 10000,
  },
  {
    id: "sent_traffic",
    words: ["Traffic", "Green", "Light", "All", "The", "Way"],
    category: "出行順利",
    price: 12000,
  },
  {
    id: "sent_exam",
    words: ["Exam", "Pass", "Score", "High", "No", "Study"],
    category: "學生黨",
    price: 15000,
  },
];

/** 自訂句子欄位解鎖價格 */
export const CUSTOM_SLOT_PRICE = 50000;

/** 最大自訂欄位數 */
export const MAX_CUSTOM_SLOTS = 5;

/**
 * 根據 ID 取得句子
 */
export function getSentenceById(id: string): MeritSentence | undefined {
  if (id === WOODFISH_DEFAULT_SENTENCE.id) return WOODFISH_DEFAULT_SENTENCE;
  if (id === BEADS_DEFAULT_SENTENCE.id) return BEADS_DEFAULT_SENTENCE;
  return UNLOCKABLE_SENTENCES.find((s) => s.id === id);
}

/**
 * 取得所有可用句子（含預設）
 */
export function getAllSentences(): MeritSentence[] {
  return [
    WOODFISH_DEFAULT_SENTENCE,
    BEADS_DEFAULT_SENTENCE,
    ...UNLOCKABLE_SENTENCES,
  ];
}
