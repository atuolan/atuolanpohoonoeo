import { describe, expect, it } from "vitest";
import { shouldBackupLocalStorageKey } from "@/services/backupCoverage";
import { parsePixelHouseState } from "./houseState";
import {
  bobOffsets,
  buildLayerPlan,
  checkUploadSize,
  customPartFilename,
  defaultOutfit,
  markOwned,
  officialStyles,
  outfitCost,
  parseCustomParts,
  parseOutfit,
  recolorPixels,
  resolveChoice,
  rgbToHsl,
  styleInfo,
  type CustomPart,
  type DollManifest,
  type WardrobeCatalog,
} from "./wardrobeLogic";

const manifest: DollManifest = {
  poses: {
    front: {
      w: 25,
      h: 41,
      layers: [
        { slot: "body", styles: { "01": "f/body_01.png" } },
        { slot: "eyes", styles: { "01": "f/eyes_01.png" } },
        { slot: "brows", styles: { "01": "f/brows_01.png" } },
        { slot: "hair", styles: { "01": "f/hair_01.png", "02": "f/hair_02.png" } },
        { slot: "shoes", styles: { "01": "f/shoes_01.png" } },
        { slot: "pants", styles: { "01": "f/pants_01.png" } },
        { slot: "jacket", styles: { "01": "f/jacket_01.png", "02": "f/jacket_02.png" } },
      ],
    },
    back: {
      w: 25,
      h: 41,
      layers: [
        { slot: "body", styles: { "01": "b/body_01.png" } },
        { slot: "pants", styles: { "01": "b/pants_01.png" } },
        { slot: "jacket", styles: { "01": "b/jacket_01.png", "02": "b/jacket_02.png" } },
        { slot: "hair", styles: { "01": "b/hair_01.png" } },
      ],
    },
    walk: {
      w: 25,
      h: 41,
      frames: 4,
      layers: [
        { slot: "body", styles: { "01": ["w/body_0.png", "w/body_1.png", "w/body_2.png", "w/body_3.png"] } },
        { slot: "pants", styles: { "01": ["w/pants_0.png", "w/pants_1.png", "w/pants_2.png", "w/pants_3.png"] } },
        { slot: "jacket", styles: { "01": ["w/j1_0.png", "w/j1_1.png", "w/j1_2.png", "w/j1_3.png"], "02": ["w/j2_0.png", "w/j2_1.png", "w/j2_2.png", "w/j2_3.png"] } },
      ],
    },
  },
};

const catalog: WardrobeCatalog = { uploadFee: 800, styles: { jacket: { "02": { name: "風衣", price: 5000 } } } };

const custom = (over: Partial<CustomPart> = {}): CustomPart => ({
  id: "u-1",
  base: "boy",
  slot: "shoes",
  name: "紅鞋",
  sheet: "data:image/png;base64,xx",
  cells: 3,
  createdAt: 1,
  ...over,
});

describe("officialStyles", () => {
  it("每個有這層的動作都有的款式才算", () => {
    expect(officialStyles(manifest, "jacket")).toEqual(["01", "02"]);
    // 02 號頭髮只有正面，背面沒有 → 不能選
    expect(officialStyles(manifest, "hair")).toEqual(["01"]);
    expect(officialStyles(manifest, "shirt")).toEqual([]);
  });
});

describe("styleInfo / outfitCost", () => {
  it("01 免費，其他照清單或預設價", () => {
    expect(styleInfo(catalog, "jacket", "01").price).toBe(0);
    expect(styleInfo(catalog, "jacket", "02")).toEqual({ name: "風衣", price: 5000 });
    expect(styleInfo(null, "pants", "03")).toEqual({ name: "款式 03", price: 3000 });
  });
  it("只算還沒買的，買過就不用再付", () => {
    let o = { ...defaultOutfit("boy"), parts: { jacket: "02" } };
    const cost = outfitCost(o, manifest, catalog, []);
    expect(cost.total).toBe(5000);
    expect(cost.items.map((i) => i.style)).toEqual(["02"]);
    o = markOwned(o, cost.items);
    expect(outfitCost(o, manifest, catalog, []).total).toBe(0);
    // 換成女生的身體，男生買的不算
    expect(outfitCost({ ...o, base: "girl" }, manifest, catalog, []).total).toBe(5000);
  });
});

describe("resolveChoice", () => {
  it("沒選或選的不存在用第一款；能不穿的才可以 null", () => {
    const o = defaultOutfit("boy");
    expect(resolveChoice(o, manifest, "jacket", [])).toEqual({ kind: "official", style: "01" });
    expect(resolveChoice({ ...o, parts: { jacket: "09" } }, manifest, "jacket", [])).toEqual({ kind: "official", style: "01" });
    expect(resolveChoice({ ...o, parts: { jacket: null } }, manifest, "jacket", [])).toEqual({ kind: "none" });
    expect(resolveChoice({ ...o, parts: { pants: null } }, manifest, "pants", [])).toEqual({ kind: "official", style: "01" });
  });
  it("上傳的要身體和部位都對", () => {
    const o = { ...defaultOutfit("boy"), parts: { shoes: "u-1" } };
    expect(resolveChoice(o, manifest, "shoes", [custom()]).kind).toBe("custom");
    expect(resolveChoice(o, manifest, "shoes", [custom({ base: "girl" })]).kind).toBe("official");
  });
});

describe("buildLayerPlan", () => {
  it("照動作的圖層順序，挑選的款式和那一格", () => {
    const o = { ...defaultOutfit("boy"), parts: { jacket: "02" }, colors: { hair: "#E8C35A" } };
    const front = buildLayerPlan(manifest, "front", 0, o, []);
    expect(front.map((l) => l.layer)).toEqual(["body", "eyes", "brows", "hair", "shoes", "pants", "jacket"]);
    expect(front.find((l) => l.layer === "jacket")!.source).toEqual({ kind: "file", path: "f/jacket_02.png" });
    // 眉毛跟頭髮同色、眼睛換色時保留黑白
    expect(front.find((l) => l.layer === "brows")!.color).toBe("#E8C35A");
    expect(front.find((l) => l.layer === "eyes")!.keepNeutrals).toBe(true);
    const walk2 = buildLayerPlan(manifest, "walk", 2, o, []);
    expect(walk2.find((l) => l.layer === "jacket")!.source).toEqual({ kind: "file", path: "w/j2_2.png" });
  });
  it("不穿外套就沒有那層", () => {
    const o = { ...defaultOutfit("boy"), parts: { jacket: null } };
    expect(buildLayerPlan(manifest, "back", 0, o, []).map((l) => l.layer)).toEqual(["body", "pants", "hair"]);
  });
  it("上傳的：正面第 0 格；只有 3 格時走路都用第 2 格；動作沒有這層就照順序插進去", () => {
    const o = { ...defaultOutfit("boy"), parts: { shoes: "u-1" } };
    const part = custom();
    const front = buildLayerPlan(manifest, "front", 0, o, [part]);
    expect(front.find((l) => l.layer === "shoes")!.source).toEqual({ kind: "custom", part, cell: 0, fallbackCell: null });
    const walk3 = buildLayerPlan(manifest, "walk", 3, o, [part]);
    expect(walk3.map((l) => l.layer)).toEqual(["body", "shoes", "pants", "jacket"]);
    expect(walk3[1].source).toEqual({ kind: "custom", part, cell: 2, fallbackCell: null });
    const six = custom({ cells: 6 });
    const walk1 = buildLayerPlan(manifest, "walk", 1, o, [six]);
    expect(walk1[1].source).toEqual({ kind: "custom", part: six, cell: 3, fallbackCell: 2 });
  });
});

describe("長頭髮身體後面那層、身體的預設穿搭", () => {
  const girl: DollManifest = {
    defaults: { jacket: null },
    poses: {
      front: {
        w: 25,
        h: 41,
        layers: [
          { slot: "hairBack", styles: { "01": "f/hb_01.png" } },
          { slot: "body", styles: { "01": "f/body_01.png" } },
          { slot: "hair", styles: { "01": "f/hair_01.png", "02": "f/hair_02.png" } },
          { slot: "jacket", styles: { "01": "f/jacket_01.png" } },
        ],
      },
    },
  };
  it("hairBack 跟著髮型選款、跟著髮色；那款沒畫就沒有這層", () => {
    const long = buildLayerPlan(girl, "front", 0, { ...defaultOutfit("girl"), colors: { hair: "#E8C35A" } }, []);
    expect(long.map((l) => l.layer)).toEqual(["hairBack", "body", "hair"]);
    expect(long[0].color).toBe("#E8C35A");
    const short = buildLayerPlan(girl, "front", 0, { ...defaultOutfit("girl"), parts: { hair: "02" } }, []);
    expect(short.map((l) => l.layer)).toEqual(["body", "hair"]);
    // 上傳的頭髮沒有身體後面那層
    const up = buildLayerPlan(girl, "front", 0, { ...defaultOutfit("girl"), parts: { hair: "u-1" } }, [custom({ base: "girl", slot: "hair" })]);
    expect(up.map((l) => l.layer)).toEqual(["body", "hair"]);
  });
  it("沒選的部位照身體的預設；自己選了就照選的", () => {
    expect(resolveChoice(defaultOutfit("girl"), girl, "jacket", [])).toEqual({ kind: "none" });
    expect(resolveChoice({ ...defaultOutfit("girl"), parts: { jacket: "01" } }, girl, "jacket", [])).toEqual({ kind: "official", style: "01" });
    expect(officialStyles(girl, "hair")).toEqual(["01", "02"]);
  });
});

describe("recolorPixels", () => {
  const px = (...cols: [number, number, number, number][]) => new Uint8ClampedArray(cols.flat());
  it("主色變成選的顏色，深淺順序不變", () => {
    // 主色（3 格）、暗一點（1 格）、亮一點（1 格）、透明
    const d = px([94, 76, 81, 255], [94, 76, 81, 255], [94, 76, 81, 255], [54, 44, 49, 255], [130, 109, 115, 255], [1, 2, 3, 0]);
    recolorPixels(d, "#E8C35A");
    expect([d[0], d[1], d[2]]).toEqual([0xe8, 0xc3, 0x5a]);
    const L = (i: number) => rgbToHsl(d[i], d[i + 1], d[i + 2])[2];
    expect(L(12)).toBeLessThan(L(0));
    expect(L(16)).toBeGreaterThan(L(0));
    // 透明的不動
    expect([d[20], d[21], d[22], d[23]]).toEqual([1, 2, 3, 0]);
  });
  it("選很暗的顏色時陰影不會全變黑", () => {
    const d = px([94, 76, 81, 255], [94, 76, 81, 255], [54, 44, 49, 255], [18, 12, 16, 255]);
    recolorPixels(d, "#1A1416");
    const L = (i: number) => rgbToHsl(d[i], d[i + 1], d[i + 2])[2];
    expect(L(4)).toBeGreaterThan(L(8));
    expect(L(8)).toBeGreaterThan(L(12));
  });
  it("keepNeutrals：眼白和黑色不換", () => {
    const d = px([107, 91, 95, 255], [107, 91, 95, 255], [236, 236, 236, 255], [18, 12, 16, 255]);
    recolorPixels(d, "#4F7FC4", { keepNeutrals: true });
    expect([d[8], d[9], d[10]]).toEqual([236, 236, 236]);
    expect([d[12], d[13], d[14]]).toEqual([18, 12, 16]);
    expect([d[0], d[1], d[2]]).toEqual([0x4f, 0x7f, 0xc4]);
  });
});

describe("checkUploadSize", () => {
  it("3 格或 6 格寬，可以整數倍", () => {
    expect(checkUploadSize(75, 41, 25, 41)).toEqual({ ok: true, cells: 3, scale: 1 });
    expect(checkUploadSize(300, 82, 25, 41)).toEqual({ ok: true, cells: 6, scale: 2 });
    expect(checkUploadSize(100, 41, 25, 41).ok).toBe(false);
    expect(checkUploadSize(75, 40, 25, 41).ok).toBe(false);
  });
});

describe("customPartFilename", () => {
  it("名字_部位.png，手機不收的字元換掉", () => {
    expect(customPartFilename({ name: "紅鞋" }, "鞋子")).toBe("紅鞋_鞋子.png");
    expect(customPartFilename({ name: 'a/b:c*"d' }, "頭髮")).toBe("a_b_c__d_頭髮.png");
    expect(customPartFilename({ name: "  " }, "")).toBe("自己畫的_衣服.png");
  });
});

describe("bobOffsets", () => {
  it("跟第一格比", () => {
    expect(bobOffsets([4, 3, 4, 3])).toEqual([0, -1, 0, -1]);
    expect(bobOffsets([4, null, 5])).toEqual([0, 0, 1]);
  });
});

describe("讀檔", () => {
  it("外觀：亂掉的欄位丟掉，不能不穿的不能 null", () => {
    const o = parseOutfit(
      { base: "girl", parts: { hair: "02", pants: null, jacket: null, wings: "01" }, colors: { hair: "#abcdef", eyes: "red" }, owned: ["girl/hair/02", 3] },
      "boy",
    );
    expect(o).toEqual({ base: "girl", parts: { hair: "02", jacket: null }, colors: { hair: "#ABCDEF" }, owned: ["girl/hair/02"] });
    expect(parseOutfit(null, "boy")).toEqual(defaultOutfit("boy"));
  });
  it("小屋狀態裡每個角色各一套", () => {
    const s = parsePixelHouseState({ look: "girl", looks: { c1: { parts: { hair: "02" } }, "": {} } });
    expect(Object.keys(s.looks)).toEqual(["c1"]);
    expect(s.looks.c1.base).toBe("girl");
  });
  it("上傳的：要是圖、部位對、不能是膚色", () => {
    const ok = { id: "u-1", base: "boy", slot: "hair", name: " 長髮 ", sheet: "data:image/png;base64,AA", cells: 6, createdAt: 5 };
    const parts = parseCustomParts([ok, { ...ok, id: "x" }, { ...ok, slot: "body" }, { ...ok, sheet: "http://x" }, null]);
    expect(parts).toEqual([{ ...ok, name: "長髮" }]);
  });
});

describe("備份", () => {
  it("小屋的外觀、買過的紀錄、上傳的衣服都會跟著 app 備份", () => {
    expect(shouldBackupLocalStorageKey("pixel_house_state")).toBe(true);
    expect(shouldBackupLocalStorageKey("pixel_house_custom_parts")).toBe(true);
  });
});
