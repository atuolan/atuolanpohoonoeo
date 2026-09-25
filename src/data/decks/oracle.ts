/**
 * 神諭卡牌組定義：把 oracleCards / oracleSpreads 包成共用格式
 * 歷史紀錄仍以 OracleReading 格式存在 "oracle-readings"
 */
import { ORACLE_CARDS } from "@/data/oracleCards";
import { buildOracleInterpretationPrompt } from "@/data/oraclePrompts";
import { ORACLE_SPREADS } from "@/data/oracleSpreads";
import type { DeckCard, DeckDefinition, DeckSpread, DrawnCard, ReadingRecord } from "@/types/divination";
import type { OracleCard, OracleDrawnCard, OracleReading, OracleSpread, OracleSpreadPosition } from "@/types/oracle";
import { FLEXIBLE_MAX, FLEXIBLE_MIN } from "@/utils/divination/flexibleSpread";

const FLEXIBLE_ID = "oracle-flexible";

const CATEGORIES = ["萬用", "愛情", "療癒", "指引", "運勢"];

const spreadCategory: Record<string, string> = {
  "oracle-single": "萬用",
  "oracle-past-present-future": "萬用",
  "oracle-mind-body-soul": "療癒",
  "oracle-situation-action-outcome": "指引",
  "oracle-four-seasons": "運勢",
  "oracle-four-elements": "指引",
  "oracle-star": "指引",
  "oracle-love-reading": "愛情",
  "oracle-chakra": "療癒",
  "oracle-moon-phases": "療癒",
};

/** 脈輪之旅原本 7 張排成一直線，小螢幕會疊在一起，改成左右交錯 */
const coordOverrides: Record<string, { x: number; y: number }[]> = {
  // 頂輪在上、海底輪在下
  "oracle-chakra": [
    { x: 50, y: 12 },
    { x: 26, y: 30 },
    { x: 74, y: 30 },
    { x: 50, y: 48 },
    { x: 26, y: 68 },
    { x: 74, y: 68 },
    { x: 50, y: 88 },
  ],
};

const rawCardById = new Map(ORACLE_CARDS.map((c) => [c.id, c]));
const rawSpreadById = new Map(ORACLE_SPREADS.map((s) => [s.id, s]));

function toDeckCard(c: OracleCard): DeckCard {
  return {
    id: c.id,
    name: c.name,
    image: c.image,
    keywords: { upright: c.keywords },
    meaning: { upright: c.message },
    extra: [
      { label: "深度解讀", text: c.description },
      { label: "行動建議", text: c.action },
    ],
  };
}

function toDeckSpread(s: OracleSpread, useOverrides = false): DeckSpread {
  const candidate = useOverrides ? coordOverrides[s.id] : undefined;
  const override = candidate?.length === s.positions.length ? candidate : undefined;
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    category: spreadCategory[s.id] ?? "萬用",
    tags: s.tags ?? [],
    summary: s.subtitle,
    positions: s.positions.map((p, i) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      coords: override?.[i] ?? { x: p.coords.x, y: p.coords.y, rotate: p.coords.rotate },
    })),
  };
}

function toRawPosition(p: DeckSpread["positions"][number]): OracleSpreadPosition {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    coords: { x: p.coords.x, y: p.coords.y, ...(p.coords.rotate !== undefined ? { rotate: p.coords.rotate } : {}) },
  };
}

function toRawSpread(s: DeckSpread): OracleSpread {
  const raw = rawSpreadById.get(s.id);
  if (raw && raw.positions.length === s.positions.length) return raw;
  return {
    id: s.id,
    name: s.name,
    subtitle: s.summary ?? "",
    description: s.description,
    cardCount: s.positions.length,
    layoutType: "custom",
    tags: s.tags,
    positions: s.positions.map(toRawPosition),
  };
}

function toRawCard(card: DeckCard): OracleCard {
  const raw = rawCardById.get(card.id);
  if (raw) return raw;
  const extra = (label: string) => card.extra?.find((e) => e.label === label)?.text ?? "";
  return {
    id: card.id,
    name: card.name,
    nameRaw: card.name,
    theme: "wisdom",
    message: card.meaning.upright,
    description: extra("深度解讀"),
    action: extra("行動建議"),
    keywords: card.keywords.upright,
    image: card.image,
    color: "#d8b46a",
    symbol: "✦",
  };
}

function toRawDrawn(spread: OracleSpread, drawn: DrawnCard[]): OracleDrawnCard[] {
  return drawn.map((d, i) => ({ card: toRawCard(d.card), position: spread.positions[i] }));
}

const flexibleSpread: DeckSpread = {
  id: FLEXIBLE_ID,
  name: "萬能牌陣",
  description: "自己決定要抽幾張牌（1～10 張），讓每一張神諭卡依你的提問帶來訊息。",
  category: "萬用",
  tags: ["自由", "自選張數"],
  summary: "自己決定抽幾張，最自由",
  positions: [],
  flexible: { min: FLEXIBLE_MIN, max: FLEXIBLE_MAX },
};

export const oracleDeck: DeckDefinition = {
  id: "oracle",
  label: "神諭卡",
  tagline: "52 張・溫柔指引",
  cardCount: ORACLE_CARDS.length,
  cards: ORACLE_CARDS.map(toDeckCard),
  spreads: [flexibleSpread, ...ORACLE_SPREADS.map((s) => toDeckSpread(s, true))],
  categories: CATEGORIES,
  hasReversed: false,
  cardBack: "/oracle-cards/cardback_default.png",
  thumbnail: ORACLE_CARDS[0].image,
  historyKey: "oracle-readings",

  buildPrompt(question, spread, drawn) {
    const rawSpread = toRawSpread(spread);
    return buildOracleInterpretationPrompt(question, "", rawSpread, toRawDrawn(rawSpread, drawn));
  },

  toRecord(raw): ReadingRecord {
    const r = raw as OracleReading;
    const spread = toDeckSpread(r.spread, true);
    return {
      id: r.id,
      deckId: "oracle",
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

  fromRecord(record): OracleReading {
    const spread = toRawSpread(record.spread);
    return {
      id: record.id,
      question: record.question,
      intention: "",
      spread,
      drawnCards: toRawDrawn(spread, record.drawn),
      interpretation: record.interpretation,
      createdAt: record.createdAt,
      type: "oracle",
    };
  },
};
