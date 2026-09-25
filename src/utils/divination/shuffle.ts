import type { ShuffledEntry } from "@/types/divination";

/** Fisher–Yates 洗牌，回傳 0..size-1 的排列與正逆位 */
export function shuffleDeck(
  size: number,
  hasReversed: boolean,
  rng: () => number = Math.random,
): ShuffledEntry[] {
  const indices = Array.from({ length: size }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.map((cardIndex) => ({
    cardIndex,
    reversed: hasReversed && rng() >= 0.5,
  }));
}
