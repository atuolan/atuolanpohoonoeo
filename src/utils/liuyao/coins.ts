import type { CoinFace, CoinThrow, YaoValue } from "@/types/liuyao";

export function cryptoRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;
}

export function throwCoins(rng: () => number = cryptoRandom): CoinThrow {
  const c1: CoinFace = rng() < 0.5 ? 2 : 3;
  const c2: CoinFace = rng() < 0.5 ? 2 : 3;
  const c3: CoinFace = rng() < 0.5 ? 2 : 3;
  const value = (c1 + c2 + c3) as YaoValue;
  return {
    coins: [c1, c2, c3],
    value,
  };
}
