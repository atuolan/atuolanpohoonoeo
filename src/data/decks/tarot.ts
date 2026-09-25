/**
 * 塔羅牌組定義：把 fateCards / fateSpreads 包成共用格式
 * 歷史紀錄仍以 FateReading 格式存在 "fate-readings"
 */
import { allFateCards } from "@/data/fateCards";
import { buildFateInterpretationPrompt } from "@/data/fatePrompts";
import { fateSpreads } from "@/data/fateSpreads";
import type {
  DeckCard,
  DeckDefinition,
  DeckSpread,
  DrawnCard,
  ReadingRecord,
} from "@/types/divination";
import type { FateCard, FateDrawnCard, FateReading, FateSpread, FateSpreadPosition } from "@/types/fate";
import { FLEXIBLE_MAX, FLEXIBLE_MIN } from "@/utils/divination/flexibleSpread";

const FLEXIBLE_ID = "tarot-flexible";

const CATEGORIES = ["萬用", "愛情", "關係", "事業", "運勢", "指引", "啟發", "特殊"];

const spreadMeta: Record<string, { category: string; tags: string[]; summary?: string }> = {
  [FLEXIBLE_ID]: { category: "萬用", tags: ["自由", "自選張數"], summary: "自己決定抽幾張，最自由" },
  "starcat-1": { category: "萬用", tags: ["啟發", "快速", "核心"], summary: "適合快速直覺提問" },
  "starcat-3": { category: "萬用", tags: ["發展", "時間線", "趨勢"], summary: "最適合看過去現在未來" },
  "starcat-4": { category: "指引", tags: ["決策", "行動"], summary: "適合要不要、會不會這類問題" },
  "starcat-5": { category: "運勢", tags: ["每日", "身心靈", "覺察"], summary: "日常最萬用的狀態檢視" },
  "starcat-26": { category: "愛情", tags: ["曖昧", "互動", "戀愛"], summary: "聚焦戀愛推進與相處" },
  "starcat-6": { category: "指引", tags: ["四元素", "解法", "平衡"], summary: "適合整理問題與找方向" },
  "starcat-9": { category: "萬用", tags: ["阻礙", "成因", "解法"], summary: "適合梳理前因後果" },
  "starcat-10": { category: "特殊", tags: ["祝福", "儀式感", "五芒星"], summary: "偏儀式型的特殊牌陣" },
  "starcat-11": { category: "運勢", tags: ["季度", "節氣", "規劃"], summary: "適合做階段性運勢盤點" },
  "starcat-12": { category: "指引", tags: ["抉擇", "比較", "選項"], summary: "專治兩難問題" },
  "starcat-8": { category: "愛情", tags: ["感情", "內心", "互動"], summary: "看戀情現況很直觀" },
  "starcat-32": { category: "愛情", tags: ["未來戀人", "桃花", "預測"], summary: "適合單身向未來對象提問" },
  "starcat-7": { category: "愛情", tags: ["桃花", "發展", "影響"], summary: "看感情潛力與未來走向" },
  "starcat-13": { category: "關係", tags: ["雙方", "態度", "發展"], summary: "兩人關係問題很合適" },
  "starcat-14": { category: "關係", tags: ["感受", "想法", "期待"], summary: "適合分析雙方內心" },
  "starcat-15": { category: "指引", tags: ["未來", "全局"], summary: "快速掃描未來多面向" },
  "starcat-30": { category: "事業", tags: ["工作", "發展", "效率"], summary: "專注職場與工作進展" },
  "starcat-31": { category: "指引", tags: ["三選一", "決策", "比較"], summary: "當選項超過兩個就用它" },
  "starcat-19": { category: "萬用", tags: ["六芒星", "因果", "解法"], summary: "適合完整拆解問題結構" },
  "starcat-21": { category: "運勢", tags: ["週運", "節奏", "趨吉避凶"], summary: "一週節奏與提醒" },
  "starcat-18": { category: "萬用", tags: ["分析", "預測", "關鍵"], summary: "分析與預測兼具" },
  "starcat-17": { category: "啟發", tags: ["自我探索", "迷惘", "人生"], summary: "適合想看內在狀態時使用" },
  "starcat-16": { category: "關係", tags: ["複合", "挽回", "心意"], summary: "想知道能否複合時使用" },
  "starcat-20": { category: "愛情", tags: ["戀人", "內在", "變化"], summary: "分析戀人雙方與未來變化" },
  "starcat-34": { category: "愛情", tags: ["單身", "脫單", "指引"], summary: "單身想脫單的全程指引" },
  "starcat-22": { category: "啟發", tags: ["疑惑", "指引", "內在"], summary: "說不清的疑惑時使用" },
  "starcat-28": { category: "關係", tags: ["複合", "挽回"], summary: "想複合就選它" },
  "starcat-35": { category: "關係", tags: ["矛盾", "相處", "解法"], summary: "化解兩人之間的摩擦" },
  "starcat-23": { category: "萬用", tags: ["經典", "完整", "分析"], summary: "最經典的完整分析牌陣" },
  "starcat-24": { category: "啟發", tags: ["深入", "探索", "靈性"], summary: "想深入探索問題本質時使用" },
  "starcat-29": { category: "關係", tags: ["分手", "復合", "第三者"], summary: "分手後想挽回時使用" },
  "starcat-25": { category: "運勢", tags: ["全面", "占星", "年運"], summary: "結合占星的全面運勢" },
};

/** 生命之樹類牌陣原本中柱的牌距離太近，小螢幕會疊在一起，改成間距平均的版本 */
const TREE_OF_LIFE = [
  { x: 50, y: 5 },
  { x: 70, y: 22 },
  { x: 30, y: 22 },
  { x: 70, y: 46 },
  { x: 30, y: 46 },
  { x: 50, y: 48 },
  { x: 70, y: 70 },
  { x: 30, y: 70 },
  { x: 50, y: 71 },
  { x: 50, y: 95 },
  { x: 85, y: 50 },
];
const coordOverrides: Record<string, { x: number; y: number }[]> = {
  "starcat-24": TREE_OF_LIFE,
  "starcat-29": TREE_OF_LIFE,
};

const rawCardById = new Map(allFateCards.map((c) => [c.id, c]));
const rawSpreadById = new Map(fateSpreads.map((s) => [s.id, s]));

function toDeckCard(c: FateCard): DeckCard {
  return {
    id: c.id,
    name: c.nameCn,
    subName: c.name,
    image: c.image,
    // 小阿爾克那的關鍵字資料是 [""]，濾掉空字串
    keywords: { upright: c.keywords.upright.filter(Boolean), reversed: c.keywords.reversed.filter(Boolean) },
    meaning: { upright: c.meaning.upright, reversed: c.meaning.reversed },
  };
}

function toDeckSpread(s: FateSpread, useOverrides = false): DeckSpread {
  const meta = spreadMeta[s.id] ?? { category: "萬用", tags: [] };
  const candidate = useOverrides ? coordOverrides[s.id] : undefined;
  const override = candidate?.length === s.positions.length ? candidate : undefined;
  return {
    id: s.id,
    name: s.nameCn,
    description: s.description,
    category: meta.category,
    tags: meta.tags,
    summary: meta.summary,
    positions: s.positions.map((p, i) => ({
      id: p.id,
      name: p.nameCn,
      description: p.description,
      coords: override?.[i] ?? { x: p.coords?.x ?? 50, y: p.coords?.y ?? 50, rotate: p.coords?.rotate },
    })),
  };
}

function toRawSpread(s: DeckSpread): FateSpread {
  const raw = rawSpreadById.get(s.id);
  if (raw && raw.positions.length === s.positions.length && raw.positions.length > 0) return raw;
  return {
    id: s.id,
    name: s.name,
    nameCn: s.name,
    description: s.description,
    layoutType: "free",
    category: s.category,
    tags: s.tags,
    positions: s.positions.map((p, i) => toRawPosition(p, i)),
  };
}

function toRawPosition(p: DeckSpread["positions"][number], index: number): FateSpreadPosition {
  return {
    id: p.id,
    name: `Position ${index + 1}`,
    nameCn: p.name,
    description: p.description,
    coords: { x: p.coords.x, y: p.coords.y, ...(p.coords.rotate !== undefined ? { rotate: p.coords.rotate } : {}) },
  };
}

function toRawCard(card: DeckCard): FateCard {
  const raw = rawCardById.get(card.id);
  if (raw) return raw;
  return {
    id: card.id,
    name: card.subName ?? card.name,
    nameCn: card.name,
    type: "major",
    number: 0,
    image: card.image,
    keywords: { upright: card.keywords.upright, reversed: card.keywords.reversed ?? [] },
    meaning: { upright: card.meaning.upright, reversed: card.meaning.reversed ?? "" },
  };
}

function toRawDrawn(spread: FateSpread, drawn: DrawnCard[]): FateDrawnCard[] {
  return drawn.map((d, i) => ({
    card: toRawCard(d.card),
    isReversed: d.reversed,
    position: spread.positions[i],
  }));
}

export const tarotDeck: DeckDefinition = {
  id: "tarot",
  label: "塔羅",
  tagline: "78 張・深入分析",
  cardCount: allFateCards.length,
  cards: allFateCards.map(toDeckCard),
  spreads: fateSpreads.map((s) => {
    const spread = toDeckSpread(s, true);
    return s.id === FLEXIBLE_ID ? { ...spread, flexible: { min: FLEXIBLE_MIN, max: FLEXIBLE_MAX } } : spread;
  }),
  categories: CATEGORIES,
  hasReversed: true,
  cardBack: "/tarot-cards/cardback_default.png",
  thumbnail: "/tarot-cards/the_star.png",
  historyKey: "fate-readings",

  buildPrompt(question, spread, drawn) {
    const rawSpread = toRawSpread(spread);
    return buildFateInterpretationPrompt(question, rawSpread, toRawDrawn(rawSpread, drawn));
  },

  toRecord(raw): ReadingRecord {
    const r = raw as FateReading;
    const spread = toDeckSpread(r.spread, true);
    return {
      id: r.id,
      deckId: "tarot",
      question: r.question,
      spread,
      drawn: r.drawnCards.map((d, i) => ({
        card: toDeckCard(d.card),
        reversed: d.isReversed,
        position: spread.positions[i] ?? toDeckSpread({ ...r.spread, positions: [d.position] }).positions[0],
      })),
      interpretation: r.interpretation,
      createdAt: r.createdAt,
    };
  },

  fromRecord(record): FateReading {
    const spread = toRawSpread(record.spread);
    return {
      id: record.id,
      question: record.question,
      spread,
      drawnCards: toRawDrawn(spread, record.drawn),
      interpretation: record.interpretation,
      createdAt: record.createdAt,
    };
  },
};
