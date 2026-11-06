/**
 * 檢查 public/pixel-house/chars/ 裡的紙娃娃：加新衣服之後跑一次就知道有沒有漏畫、尺寸對不對。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PART_SLOTS } from "./wardrobeData";
import { officialStyles, type DollManifest, type WardrobeCatalog } from "./wardrobeLogic";

const CHARS = join(process.cwd(), "public", "pixel-house", "chars");
const bases = readdirSync(CHARS).filter((b) => existsSync(join(CHARS, b, "doll.json")));

/** PNG 檔頭裡的寬高 */
function pngSize(file: string): [number, number] {
  const b = readFileSync(file);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe.each(bases)("紙娃娃 %s", (base) => {
  const dir = join(CHARS, base);
  const manifest = JSON.parse(readFileSync(join(dir, "doll.json"), "utf-8")) as DollManifest;
  const catalog = existsSync(join(dir, "wardrobe.json"))
    ? (JSON.parse(readFileSync(join(dir, "wardrobe.json"), "utf-8")) as WardrobeCatalog)
    : null;

  it("每個檔案都在、尺寸跟動作一樣、多格的動作格數對", () => {
    const problems: string[] = [];
    for (const [poseName, pose] of Object.entries(manifest.poses)) {
      const frames = Math.max(1, pose.frames ?? 1);
      for (const layer of pose.layers) {
        for (const [style, files] of Object.entries(layer.styles)) {
          const list = Array.isArray(files) ? files : [files];
          if (frames > 1 && list.length !== frames) problems.push(`${poseName}/${layer.slot}/${style}：${list.length} 格，應該 ${frames} 格`);
          for (const f of list) {
            const file = join(dir, f);
            if (!existsSync(file)) {
              problems.push(`少了 ${f}`);
              continue;
            }
            const [w, h] = pngSize(file);
            if (w !== pose.w || h !== pose.h) problems.push(`${f} 是 ${w}×${h}，應該 ${pose.w}×${pose.h}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("清單上的款式每個角度都有畫（不然衣櫃裡選不到）", () => {
    const missing: string[] = [];
    for (const [slot, styles] of Object.entries(catalog?.styles ?? {})) {
      const ok = officialStyles(manifest, slot as never);
      for (const style of Object.keys(styles)) if (!ok.includes(style)) missing.push(`${slot}/${style}`);
    }
    expect(missing).toEqual([]);
  });

  it("每個部位都有免費的第一款", () => {
    for (const def of PART_SLOTS) {
      if (!def.styles) continue;
      const ids = officialStyles(manifest, def.slot);
      if (ids.length) expect(ids[0]).toBe("01");
    }
  });
});
