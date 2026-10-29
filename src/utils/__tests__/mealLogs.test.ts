import { describe, expect, it } from "vitest";
import type { MealLog } from "@/types/fitness";
import {
  findRecordedFoodIndex,
  formatFoodRecordForPrompt,
  findSameFood,
  mergeSameDateMealLogs,
  normalizeFoodName,
} from "@/utils/mealLogs";

function log(id: string, date: string, createdAt: number, meals: MealLog["meals"]): MealLog {
  return { id, date, createdAt, meals };
}

describe("normalizeFoodName", () => {
  it("不管空白、標點和大小寫", () => {
    expect(normalizeFoodName(" 珍珠 奶茶！")).toBe("珍珠奶茶");
    expect(normalizeFoodName("Latte")).toBe(normalizeFoodName("latte"));
  });
});

describe("findSameFood", () => {
  const today = log("a", "2026-10-22", 1, [
    { type: "lunch", foods: [{ name: "滷肉飯", time: "12:30", calories: 450 }] },
  ]);

  it("同一餐、同名、時間差一小時內就是同一筆", () => {
    expect(findSameFood(today, "lunch", { name: "滷肉飯", time: "12:30" })).toBeTruthy();
    expect(findSameFood(today, "lunch", { name: "滷肉飯 ", time: "13:10" })).toBeTruthy();
  });

  it("沒寫時間也當成同一筆", () => {
    expect(findSameFood(today, "lunch", { name: "滷肉飯" })).toBeTruthy();
  });

  it("別餐、別的食物、隔太久都算新的一筆", () => {
    expect(findSameFood(today, "dinner", { name: "滷肉飯", time: "12:30" })).toBeUndefined();
    expect(findSameFood(today, "lunch", { name: "雞腿飯", time: "12:30" })).toBeUndefined();
    expect(findSameFood(today, "lunch", { name: "滷肉飯", time: "14:00" })).toBeUndefined();
    expect(findSameFood(undefined, "lunch", { name: "滷肉飯" })).toBeUndefined();
  });
});

describe("findRecordedFoodIndex", () => {
  it("名稱和時間都一樣才收回", () => {
    const l = log("a", "2026-10-22", 1, [
      { type: "snack", foods: [{ name: "咖啡", time: "09:00" }, { name: "咖啡", time: "15:00" }] },
    ]);
    expect(findRecordedFoodIndex(l, "snack", { name: "咖啡", time: "15:00" })).toBe(1);
    expect(findRecordedFoodIndex(l, "snack", { name: "咖啡", time: "16:00" })).toBe(-1);
    expect(findRecordedFoodIndex(l, "lunch", { name: "咖啡", time: "15:00" })).toBe(-1);
  });
});

describe("mergeSameDateMealLogs", () => {
  it("同一天的好幾份併成最早那份，食物都留著", () => {
    const seed = log("seed", "2026-10-22", 100, [
      { type: "breakfast", foods: [{ name: "蛋餅", calories: 300 }] },
    ]);
    const later = log("later", "2026-10-22", 200, [
      { type: "lunch", foods: [{ name: "滷肉飯", calories: 450 }] },
      { type: "breakfast", foods: [{ name: "豆漿", calories: 100 }] },
    ]);
    const other = log("other", "2026-10-21", 50, []);
    const { logs, changed, removedIds } = mergeSameDateMealLogs([later, other, seed]);

    expect(removedIds).toEqual(["later"]);
    expect(changed).toHaveLength(1);
    const merged = logs.find((l) => l.date === "2026-10-22")!;
    expect(merged.id).toBe("seed");
    expect(merged.meals.find((m) => m.type === "breakfast")!.foods.map((f) => f.name)).toEqual(["蛋餅", "豆漿"]);
    expect(merged.meals.find((m) => m.type === "lunch")!.foods.map((f) => f.name)).toEqual(["滷肉飯"]);
    expect(merged.totalCalories).toBe(850);
    expect(logs).toHaveLength(2);
    // 原本的物件不被改動
    expect(seed.meals[0].foods).toHaveLength(1);
  });

  it("id 重複的只留一份，沒有要改的", () => {
    const a = log("a", "2026-10-22", 1, []);
    const { logs, changed, removedIds } = mergeSameDateMealLogs([a, { ...a }, a]);
    expect(logs).toHaveLength(1);
    expect(changed).toEqual([]);
    expect(removedIds).toEqual([]);
  });
});

describe("formatFoodRecordForPrompt", () => {
  it("講明已經記好了，附上日期、時間、份量", () => {
    const text = formatFoodRecordForPrompt({
      date: "2026-10-28",
      meal: "lunch",
      name: "干煎母螃蟹",
      time: "13:22",
      portion: "三到四只",
      calories: 300,
    });
    expect(text).toBe(
      "（系統：「干煎母螃蟹」已記進 10/28 13:22 的食記（三到四只，300kcal），這筆已經記好了，之後不要再為它輸出 <food-record>）",
    );
  });

  it("沒有時間、份量就省略", () => {
    expect(formatFoodRecordForPrompt({ date: "2026-10-05", meal: "snack", name: "珍奶" })).toBe(
      "（系統：「珍奶」已記進 10/5 的食記，這筆已經記好了，之後不要再為它輸出 <food-record>）",
    );
  });
});
