import { describe, expect, it } from "vitest";

import {
  ARRAY_EXTENSIBLE_MARKER,
  checkMvuCreate,
  checkMvuInsert,
  checkMvuRemove,
  stripMvuMeta,
  usesMvuMeta,
} from "./mvuSchema";

const schema = {
  $meta: { extensible: false },
  主角: {
    金幣: 10,
    背包: ["地圖", ARRAY_EXTENSIBLE_MARKER],
    記憶: [{ $meta: { extensible: true, template: { 重要: false } }, $arrayMeta: true }],
    技能: ["劍術"],
  },
  NPC: {
    $meta: { extensible: true, required: ["悠紀"] },
    悠紀: { 好感度: 20 },
  },
};

describe("MVU $meta", () => {
  it("沒用 $meta 的卡片一律放行", () => {
    const plain = { a: { b: [1] } };
    expect(usesMvuMeta(plain)).toBe(false);
    expect(checkMvuInsert(plain, "a.b", 2).ok).toBe(true);
    expect(checkMvuRemove(plain, "a.b.0").ok).toBe(true);
    expect(checkMvuCreate(plain, "a.c").ok).toBe(true);
  });

  it("$meta 和陣列標記不會出現在 stat_data", () => {
    expect(stripMvuMeta(schema)).toEqual({
      主角: { 金幣: 10, 背包: ["地圖"], 記憶: [], 技能: ["劍術"] },
      NPC: { 悠紀: { 好感度: 20 } },
    });
  });

  it("有標記的陣列可以插入，沒標記的不行", () => {
    expect(checkMvuInsert(schema, "主角.背包", "鑰匙").ok).toBe(true);
    expect(checkMvuInsert(schema, "主角.技能", "魔法").ok).toBe(false);
  });

  it("陣列的 template 會套到插入的物件上", () => {
    expect(checkMvuInsert(schema, "主角.記憶", { 內容: "初次見面" })).toEqual({
      ok: true,
      value: { 重要: false, 內容: "初次見面" },
    });
  });

  it("extensible 的物件可以加新角色；required 的不能刪", () => {
    expect(checkMvuInsert(schema, "NPC", { 好感度: 0 }, "新角色").ok).toBe(true);
    expect(checkMvuRemove(schema, "NPC.悠紀").ok).toBe(false);
    expect(checkMvuRemove(schema, "NPC", "新角色").ok).toBe(true);
  });

  it("鎖住的根層不能長出新鍵", () => {
    expect(checkMvuCreate(schema, "世界.天氣").ok).toBe(false);
    expect(checkMvuCreate(schema, "NPC.路人.好感度").ok).toBe(true);
    expect(checkMvuCreate(schema, "主角.金幣").ok).toBe(true);
  });
});
