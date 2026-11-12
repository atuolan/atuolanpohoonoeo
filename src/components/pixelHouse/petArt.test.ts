import { describe, expect, it } from "vitest";
import { SPECIES_COLORS } from "./houseCat";
import { CAGE_DEFS, cagedArt, FERRET_DANCE, walkerArt, type CagedSpecies } from "./petArt";

/** 每張圖：每一列一樣寬；用到的字母都在這個種類每個花色的調色盤裡（不然會畫成透明的洞） */
function checkArt(rows: string[], palettes: Record<string, string>[], name: string) {
  expect(rows.length, name).toBeGreaterThan(0);
  const w = rows[0].length;
  for (const r of rows) expect(r.length, `${name} 列寬`).toBe(w);
  const used = new Set(rows.join("").replace(/\./g, ""));
  for (const pal of palettes) for (const ch of used) expect(pal[ch], `${name} 少了顏色 ${ch}`).toBeTruthy();
}

describe("寵物的圖", () => {
  it("會走的（貓、狗、雪貂）：每個姿勢、每個花色都畫得出來，大小一致", () => {
    for (const sp of ["cat", "dog", "ferret"] as const) {
      const { art, w, h } = walkerArt(sp);
      const palettes = Object.values(SPECIES_COLORS[sp]).map((c) => c.palette);
      const sizes = new Set(Object.values(art).map((r) => `${r[0].length}x${r.length}`));
      expect(sizes.size, `${sp} 每張一樣大`).toBe(1);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      for (const [pose, rows] of Object.entries(art)) checkArt(rows, palettes, `${sp}:${pose}`);
    }
    const ferretPal = Object.values(SPECIES_COLORS.ferret).map((c) => c.palette);
    for (const [k, rows] of Object.entries(FERRET_DANCE)) checkArt(rows, ferretPal, `ferret:${k}`);
    expect(FERRET_DANCE["dance-a"][0].length).toBe(walkerArt("ferret").art.sit[0].length);
  });

  it("住籠子的：動物和籠子都畫得出來", () => {
    for (const sp of ["hamster", "guineaPig", "glider", "snake"] as CagedSpecies[]) {
      const palettes = Object.values(SPECIES_COLORS[sp]).map((c) => c.palette);
      for (const [pose, rows] of Object.entries(cagedArt(sp))) checkArt(rows, palettes, `${sp}:${pose}`);
      const d = CAGE_DEFS[sp];
      if (sp !== "hamster") {
        checkArt(d.back, [d.palette], `${sp}:籠子後面`);
        checkArt(d.front, [d.palette], `${sp}:籠子前面`);
      }
    }
  });
});
