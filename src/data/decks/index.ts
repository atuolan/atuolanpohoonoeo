import type { DeckDefinition, DeckId } from "@/types/divination";
import { lenormandDeck } from "./lenormand";
import { oracleDeck } from "./oracle";
import { tarotDeck } from "./tarot";

export const decks: Record<DeckId, DeckDefinition> = {
  tarot: tarotDeck,
  lenormand: lenormandDeck,
  oracle: oracleDeck,
};

export const deckOrder: DeckId[] = ["tarot", "lenormand", "oracle"];
