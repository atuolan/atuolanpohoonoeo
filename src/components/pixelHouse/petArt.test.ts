import { describe, expect, it } from "vitest";
import { SPECIES_COLORS } from "./houseCat";
import { CAGE_DEFS, cagedArt, FERRET_DANCE, FERRET_RUN, walkerArt, type CagedSpecies } from "./petArt";

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
      // 狗有兩種畫法，所以每個花色拿自己的圖、只對自己的調色盤
      for (const [id, def] of Object.entries(SPECIES_COLORS[sp])) {
        const { art, w, h, zzz } = walkerArt(sp, id);
        const sizes = new Set(Object.values(art).map((r) => `${r[0].length}x${r.length}`));
        expect(sizes.size, `${sp}/${id} 每張一樣大`).toBe(1);
        expect(w).toBeGreaterThan(0);
        expect(h).toBeGreaterThan(0);
        for (const [pose, rows] of Object.entries(art)) checkArt(rows, [def.palette], `${sp}/${id}:${pose}`);
        // 每一格都是正方形（不會被拉扁）
        expect(art.sit[0].length / w, `${sp}/${id}`).toBeCloseTo(art.sit.length / h, 6);
        // 睡覺的 zZ 在圖裡面；雪貂沒有
        if (sp === "ferret") {
          expect(zzz).toBeUndefined();
          continue;
        }
        expect(zzz, `${sp}/${id}`).toBeTruthy();
        expect(zzz!.rows).toHaveLength(zzz!.spot.h);
        for (const r of zzz!.rows) expect(r.length).toBe(zzz!.spot.w);
        expect(zzz!.spot.x).toBeGreaterThanOrEqual(0);
        expect(zzz!.spot.y).toBeGreaterThanOrEqual(0);
        expect(zzz!.spot.x + zzz!.spot.w, `${sp}/${id}`).toBeLessThanOrEqual(art.sleep[0].length);
      }
    }
    // 立耳小狗（灰灰）是另一套圖，寬度跟垂耳的一樣（腳底中間對齊，吃飯對得到碗）
    expect(walkerArt("dog", "husky").art).not.toBe(walkerArt("dog", "brown").art);
    expect(walkerArt("dog", "husky").w).toBe(walkerArt("dog", "brown").w);
    expect(walkerArt("dog").art).toBe(walkerArt("dog", "brown").art);
    // 改花紋的品種：大小跟原本那套一樣（米格魯←垂耳、黑柴←立耳）
    expect(walkerArt("dog", "beagle").h).toBe(walkerArt("dog", "brown").h);
    expect(walkerArt("dog", "blackShiba").h).toBe(walkerArt("dog", "husky").h);
    expect(walkerArt("dog", "beagle").art.sit.join("")).toMatch(/b/);
    expect(walkerArt("dog", "blackShiba").art.sit.join("")).toMatch(/t/);
    expect(walkerArt("dog", "pug").art.sit.join("")).toMatch(/m/);
    // 柯基腳短：腳底一樣在最下面，圖上面多空兩列
    const corgi = walkerArt("dog", "corgi").art;
    for (const pose of ["walk-a", "walk-b", "sit", "eat"] as const) {
      expect(corgi[pose].slice(0, 2).join("").replace(/\./g, ""), pose).toBe("");
      expect(corgi[pose][corgi[pose].length - 1].replace(/\./g, "").length, pose).toBeGreaterThan(0);
    }
    const ferretPal = Object.values(SPECIES_COLORS.ferret).map((c) => c.palette);
    for (const [k, rows] of Object.entries(FERRET_DANCE)) checkArt(rows, ferretPal, `ferret:${k}`);
    expect(FERRET_DANCE["dance-a"][0].length).toBe(walkerArt("ferret").art.sit[0].length);
    // 跑步 8 張：跟其他張一樣大
    expect(FERRET_RUN).toHaveLength(8);
    FERRET_RUN.forEach((rows, i) => {
      checkArt(rows, ferretPal, `ferret:run-${i + 1}`);
      expect(rows.length).toBe(walkerArt("ferret").art.sit.length);
      expect(rows[0].length).toBe(walkerArt("ferret").art.sit[0].length);
    });
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
