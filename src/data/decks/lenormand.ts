/**
 * 雷諾曼牌組定義：把 lenormandCards / lenormandSpreads 包成共用格式
 * 歷史紀錄仍以 LenormandReading 格式存在 "lenormand-readings"
 */
import { allLenormandCards } from "@/data/lenormandCards";
import { buildLenormandInterpretationPrompt } from "@/data/lenormandPrompts";
import { lenormandSpreads } from "@/data/lenormandSpreads";
import type { DeckCard, DeckDefinition, DeckSpread, DrawnCard, ReadingRecord } from "@/types/divination";
import type {
  LenormandCard,
  LenormandDrawnCard,
  LenormandReading,
  LenormandSpread,
  LenormandSpreadPosition,
} from "@/types/lenormand";
import { FLEXIBLE_MAX, FLEXIBLE_MIN } from "@/utils/divination/flexibleSpread";

const FLEXIBLE_ID = "lenormand-flexible";

const CATEGORIES = ["萬用", "愛情", "關係", "事業", "運勢", "指引"];

const spreadCategory: Record<string, string> = {
  single: "萬用",
  "three-card": "萬用",
  "love-spread": "愛情",
  "four-future": "運勢",
  "quick-analysis": "指引",
  "five-card": "萬用",
  "new-career": "事業",
  money: "事業",
  "five-action": "指引",
  "seeking-love": "愛情",
  "three-level": "萬用",
  "desired-goal": "指引",
  heart: "愛情",
  monthly: "運勢",
  soulmate: "關係",
  "nine-card": "萬用",
  dream: "指引",
  "celtic-cross": "萬用",
  relationship: "關係",
};

const rawCardById = new Map(allLenormandCards.map((c) => [c.id, c]));
const rawSpreadById = new Map(lenormandSpreads.map((s) => [s.id, s]));

function toDeckCard(c: LenormandCard): DeckCard {
  return {
    id: c.id,
    name: c.nameCn,
    subName: `${c.number}. ${c.name}`,
    image: c.image,
    keywords: { upright: c.keywords.slice(0, 6) },
    meaning: { upright: c.meaning.general },
    extra: [
      { label: "愛情", text: c.meaning.love },
      { label: "工作", text: c.meaning.work },
      { label: "建議", text: c.meaning.advice },
    ],
  };
}

function toDeckSpread(s: LenormandSpread): DeckSpread {
  return {
    id: s.id,
    name: s.nameCn,
    description: s.description,
    category: spreadCategory[s.id] ?? "萬用",
    tags: [],
    positions: s.positions.map((p) => ({
      id: p.id,
      name: p.nameCn,
      description: p.description,
      coords: { x: p.coords?.x ?? 50, y: p.coords?.y ?? 50 },
    })),
  };
}

function toRawPosition(p: DeckSpread["positions"][number]): LenormandSpreadPosition {
  return {
    id: p.id,
    name: p.id,
    nameCn: p.name,
    description: p.description,
    coords: { x: p.coords.x, y: p.coords.y },
  };
}

function toRawSpread(s: DeckSpread): LenormandSpread {
  const raw = rawSpreadById.get(s.id);
  if (raw && raw.positions.length === s.positions.length) return raw;
  return {
    id: s.id,
    name: s.name,
    nameCn: s.name,
    description: s.description,
    positions: s.positions.map(toRawPosition),
  };
}

function toRawCard(card: DeckCard): LenormandCard {
  const raw = rawCardById.get(card.id);
  if (raw) return raw;
  const extra = (label: string) => card.extra?.find((e) => e.label === label)?.text ?? "";
  return {
    id: card.id,
    number: 0,
    name: card.subName ?? card.name,
    nameCn: card.name,
    symbol: "",
    image: card.image,
    keywords: card.keywords.upright,
    meaning: { general: card.meaning.upright, love: extra("愛情"), work: extra("工作"), advice: extra("建議") },
    combinations: {},
  };
}

function toRawDrawn(spread: LenormandSpread, drawn: DrawnCard[]): LenormandDrawnCard[] {
  return drawn.map((d, i) => ({ card: toRawCard(d.card), position: spread.positions[i] }));
}

const flexibleSpread: DeckSpread = {
  id: FLEXIBLE_ID,
  name: "萬能牌陣",
  description: "自己決定要抽幾張牌（1～10 張），由左到右依序閱讀，牌與牌的組合就是答案。",
  category: "萬用",
  tags: ["自由", "自選張數"],
  summary: "自己決定抽幾張，最自由",
  positions: [],
  flexible: { min: FLEXIBLE_MIN, max: FLEXIBLE_MAX },
};

export const lenormandDeck: DeckDefinition = {
  id: "lenormand",
  label: "雷諾曼",
  tagline: "36 張・具體直接",
  cardCount: allLenormandCards.length,
  cards: allLenormandCards.map(toDeckCard),
  spreads: [flexibleSpread, ...lenormandSpreads.map(toDeckSpread)],
  categories: CATEGORIES,
  hasReversed: false,
  cardBack: "/lenormand-cards/cardback_default.png",
  thumbnail: "/lenormand-cards/rider.png",
  historyKey: "lenormand-readings",

  buildPrompt(question, spread, drawn) {
    const rawSpread = toRawSpread(spread);
    return buildLenormandInterpretationPrompt(question, rawSpread, toRawDrawn(rawSpread, drawn));
  },

  toRecord(raw): ReadingRecord {
    const r = raw as LenormandReading;
    const spread = toDeckSpread(r.spread);
    return {
      id: r.id,
      deckId: "lenormand",
      question: r.question,
      spread,
      drawn: r.drawnCards.map((d, i) => ({
        card: toDeckCard(d.card),
        reversed: false,
        position: spread.positions[i] ?? toDeckSpread({ ...r.spread, positions: [d.position] }).positions[0],
      })),
      interpretation: r.interpretation,
      createdAt: r.createdAt,
    };
  },

  fromRecord(record): LenormandReading {
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
