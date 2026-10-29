import { HEXAGRAMS } from "@/data/liuyao/hexagrams";
import { DIZHI_WUXING, TRIGRAMS, trigramFromLines } from "@/data/liuyao/trigrams";
import type {
  Dizhi,
  GanzhiTime,
  HexagramInfo,
  Liuqin,
  Liushen,
  LiuyaoChart,
  NajiaInfo,
  PalaceGeneration,
  Tiangan,
  TrigramName,
  Wuxing,
  YaoLine,
  YaoValue,
} from "@/types/liuyao";

const PALACES: TrigramName[] = ["乾", "兌", "離", "震", "巽", "坎", "艮", "坤"];

interface PalaceMatch {
  palace: TrigramName;
  generation: PalaceGeneration;
  shi: number;
  ying: number;
}

function getShiYing(gen: PalaceGeneration): { shi: number; ying: number } {
  let shi: number;
  switch (gen) {
    case "本宮":
      shi = 6;
      break;
    case "一世":
      shi = 1;
      break;
    case "二世":
      shi = 2;
      break;
    case "三世":
      shi = 3;
      break;
    case "四世":
      shi = 4;
      break;
    case "五世":
      shi = 5;
      break;
    case "遊魂":
      shi = 4;
      break;
    case "歸魂":
      shi = 3;
      break;
  }
  const ying = shi > 3 ? shi - 3 : shi + 3;
  return { shi, ying };
}

function determinePalace(lower: TrigramName, upper: TrigramName): PalaceMatch {
  const targetLines: boolean[] = [
    ...TRIGRAMS[lower].lines,
    ...TRIGRAMS[upper].lines,
  ];

  for (const p of PALACES) {
    const baseLines = [...TRIGRAMS[p].lines, ...TRIGRAMS[p].lines];

    const gens: { gen: PalaceGeneration; lines: boolean[] }[] = [];

    // 本宮
    gens.push({ gen: "本宮", lines: [...baseLines] });

    // 一世：翻初爻 (index 0)
    const gen1 = [...baseLines];
    gen1[0] = !gen1[0];
    gens.push({ gen: "一世", lines: gen1 });

    // 二世：翻初二 (index 0, 1)
    const gen2 = [...gen1];
    gen2[1] = !gen2[1];
    gens.push({ gen: "二世", lines: gen2 });

    // 三世：翻初二三 (index 0, 1, 2)
    const gen3 = [...gen2];
    gen3[2] = !gen3[2];
    gens.push({ gen: "三世", lines: gen3 });

    // 四世：翻初到四 (index 0, 1, 2, 3)
    const gen4 = [...gen3];
    gen4[3] = !gen4[3];
    gens.push({ gen: "四世", lines: gen4 });

    // 五世：翻初到五 (index 0, 1, 2, 3, 4)
    const gen5 = [...gen4];
    gen5[4] = !gen5[4];
    gens.push({ gen: "五世", lines: gen5 });

    // 遊魂：五世再把四爻翻回來 (index 3)
    const youhun = [...gen5];
    youhun[3] = !youhun[3];
    gens.push({ gen: "遊魂", lines: youhun });

    // 歸魂：遊魂的內卦（初二三爻）換回宮卦的內卦 (index 0, 1, 2)
    const guihun = [
      baseLines[0],
      baseLines[1],
      baseLines[2],
      youhun[3],
      youhun[4],
      youhun[5],
    ];
    gens.push({ gen: "歸魂", lines: guihun });

    for (const item of gens) {
      if (item.lines.every((val, idx) => val === targetLines[idx])) {
        const { shi, ying } = getShiYing(item.gen);
        return {
          palace: p,
          generation: item.gen,
          shi,
          ying,
        };
      }
    }
  }

  throw new Error(`無法推算八宮: 上${upper}下${lower}`);
}

export function findHexagram(lower: TrigramName, upper: TrigramName): HexagramInfo {
  const entry = HEXAGRAMS.find((h) => h.upper === upper && h.lower === lower);
  if (!entry) {
    throw new Error(`找不到對應卦: 上${upper}下${lower}`);
  }

  const { palace, generation, shi, ying } = determinePalace(lower, upper);
  const palaceWuxing = TRIGRAMS[palace].wuxing;

  return {
    index: entry.index,
    name: entry.name,
    fullName: entry.fullName,
    upper,
    lower,
    palace,
    palaceWuxing,
    generation,
    shi,
    ying,
  };
}

function getLiuqin(me: Wuxing, target: Wuxing): Liuqin {
  if (me === target) return "兄弟";
  const sheng: Record<Wuxing, Wuxing> = {
    木: "火",
    火: "土",
    土: "金",
    金: "水",
    水: "木",
  };
  const ke: Record<Wuxing, Wuxing> = {
    木: "土",
    土: "水",
    水: "火",
    火: "金",
    金: "木",
  };
  if (sheng[target] === me) return "父母"; // 生我
  if (sheng[me] === target) return "子孫"; // 我生
  if (ke[target] === me) return "官鬼"; // 剋我
  if (ke[me] === target) return "妻財"; // 我剋
  return "兄弟";
}

const LIUSHEN_ORDER: Liushen[] = ["青龍", "朱雀", "勾陳", "螣蛇", "白虎", "玄武"];

function getStartLiushen(dayGan: Tiangan): Liushen {
  switch (dayGan) {
    case "甲":
    case "乙":
      return "青龍";
    case "丙":
    case "丁":
      return "朱雀";
    case "戊":
      return "勾陳";
    case "己":
      return "螣蛇";
    case "庚":
    case "辛":
      return "白虎";
    case "壬":
    case "癸":
      return "玄武";
  }
}

export function paipan(values: YaoValue[], time: GanzhiTime): LiuyaoChart {
  const origYangList: boolean[] = values.map((v) => v === 7 || v === 9);
  const lowerLines: [boolean, boolean, boolean] = [
    origYangList[0],
    origYangList[1],
    origYangList[2],
  ];
  const upperLines: [boolean, boolean, boolean] = [
    origYangList[3],
    origYangList[4],
    origYangList[5],
  ];

  const lowerName = trigramFromLines(lowerLines);
  const upperName = trigramFromLines(upperLines);
  const original = findHexagram(lowerName, upperName);

  const hasMoving = values.some((v) => v === 6 || v === 9);
  let changed: HexagramInfo | null = null;
  let changedYangList: boolean[] = [];

  if (hasMoving) {
    changedYangList = values.map((v) => {
      if (v === 6) return true;
      if (v === 9) return false;
      return v === 7;
    });
    const chgLowerLines: [boolean, boolean, boolean] = [
      changedYangList[0],
      changedYangList[1],
      changedYangList[2],
    ];
    const chgUpperLines: [boolean, boolean, boolean] = [
      changedYangList[3],
      changedYangList[4],
      changedYangList[5],
    ];
    const chgLowerName = trigramFromLines(chgLowerLines);
    const chgUpperName = trigramFromLines(chgUpperLines);
    changed = findHexagram(chgLowerName, chgUpperName);
  }

  // 納甲六地支
  const origZhiList: Dizhi[] = [
    ...TRIGRAMS[lowerName].inner,
    ...TRIGRAMS[upperName].outer,
  ];

  let chgZhiList: Dizhi[] = [];
  if (changed) {
    chgZhiList = [
      ...TRIGRAMS[changed.lower].inner,
      ...TRIGRAMS[changed.upper].outer,
    ];
  }

  // 六神
  const startShen = getStartLiushen(time.dayGan);
  const startIdx = LIUSHEN_ORDER.indexOf(startShen);
  const liushenList: Liushen[] = Array.from({ length: 6 }, (_, i) => {
    return LIUSHEN_ORDER[(startIdx + i) % 6];
  });

  // 本卦六爻六親與基本資訊
  const origLinesInfo: NajiaInfo[] = origZhiList.map((zhi) => {
    const wuxing = DIZHI_WUXING[zhi];
    const liuqin = getLiuqin(original.palaceWuxing, wuxing);
    return { zhi, wuxing, liuqin };
  });

  // 伏神檢查
  const presentLiuqin = new Set(origLinesInfo.map((l) => l.liuqin));
  const allLiuqin: Liuqin[] = ["父母", "兄弟", "官鬼", "妻財", "子孫"];
  const missingLiuqin = allLiuqin.filter((lq) => !presentLiuqin.has(lq));

  // 本宮純卦六爻（宮卦疊兩次）
  const palaceTrigram = TRIGRAMS[original.palace];
  const palaceZhiList: Dizhi[] = [
    ...palaceTrigram.inner,
    ...palaceTrigram.outer,
  ];
  const palaceLinesNajia: NajiaInfo[] = palaceZhiList.map((zhi) => {
    const wuxing = DIZHI_WUXING[zhi];
    const liuqin = getLiuqin(original.palaceWuxing, wuxing);
    return { zhi, wuxing, liuqin };
  });

  // 伏神查照表：同一個缺的六親取本宮卦第一個（由初爻往上）
  const fushenMap: Partial<Record<number, NajiaInfo>> = {};
  for (const missing of missingLiuqin) {
    const foundIdx = palaceLinesNajia.findIndex((p) => p.liuqin === missing);
    if (foundIdx !== -1) {
      fushenMap[foundIdx] = palaceLinesNajia[foundIdx];
    }
  }

  const lines: YaoLine[] = origLinesInfo.map((info, idx) => {
    const position = idx + 1;
    const value = values[idx];
    const yang = origYangList[idx];
    const moving = value === 6 || value === 9;
    const liushen = liushenList[idx];
    const isShi = position === original.shi;
    const isYing = position === original.ying;

    const line: YaoLine = {
      position,
      value,
      yang,
      moving,
      liushen,
      isShi,
      isYing,
      zhi: info.zhi,
      wuxing: info.wuxing,
      liuqin: info.liuqin,
    };

    if (fushenMap[idx]) {
      line.fushen = fushenMap[idx];
    }

    if (changed) {
      const chgZhi = chgZhiList[idx];
      const chgWuxing = DIZHI_WUXING[chgZhi];
      // 變卦各爻的六親也用「本卦」宮的五行
      const chgLiuqin = getLiuqin(original.palaceWuxing, chgWuxing);
      line.changed = {
        yang: changedYangList[idx],
        zhi: chgZhi,
        wuxing: chgWuxing,
        liuqin: chgLiuqin,
      };
    }

    return line;
  });

  return {
    time,
    values,
    original,
    changed,
    lines,
  };
}
