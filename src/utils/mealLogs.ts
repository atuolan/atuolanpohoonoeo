import type { FoodItem, MealLog, MealType } from "@/types/fitness";
import type { FoodRecordRef } from "@/types/chat";

/** 同一餐、同名的食物，用餐時間相差這麼多分鐘以內就當成同一次 */
const SAME_FOOD_WINDOW_MINUTES = 60;

/** 食物名稱比對用：不管空白、標點和英文大小寫 */
export function normalizeFoodName(name: string): string {
  return name.replace(/[\s\p{P}\p{S}]/gu, "").toLowerCase();
}

function toMinutes(time: string | undefined): number | null {
  const m = time?.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function isSameFood(a: FoodItem, b: FoodItem): boolean {
  if (normalizeFoodName(a.name) !== normalizeFoodName(b.name)) return false;
  const ta = toMinutes(a.time);
  const tb = toMinutes(b.time);
  if (ta === null || tb === null) return true;
  return Math.abs(ta - tb) <= SAME_FOOD_WINDOW_MINUTES;
}

/** 這一天的這一餐裡已經記過的同一樣食物（重新生成、角色下一輪又寫一次都會撞到） */
export function findSameFood(
  log: MealLog | undefined,
  mealType: MealType,
  food: FoodItem,
): FoodItem | undefined {
  const meal = log?.meals.find((m) => m.type === mealType);
  return meal?.foods.find((f) => isSameFood(f, food));
}

/** 收回角色記的那一筆：名稱、時間都一樣的第一筆位置；找不到回傳 -1 */
export function findRecordedFoodIndex(
  log: MealLog | undefined,
  mealType: MealType,
  food: FoodItem,
): number {
  const meal = log?.meals.find((m) => m.type === mealType);
  if (!meal) return -1;
  const name = normalizeFoodName(food.name);
  return meal.foods.findIndex(
    (f) => normalizeFoodName(f.name) === name && (f.time || "") === (food.time || ""),
  );
}

export function totalCaloriesOf(log: MealLog): number {
  return log.meals.reduce(
    (sum, m) => sum + m.foods.reduce((mealSum, f) => mealSum + (f.calories || 0), 0),
    0,
  );
}

/**
 * 同一天被拆成好幾份的紀錄併回一份（留最早建立的那份），畫面只會找到第一份，其他份的食物會看不到。
 * 也順便去掉 id 重複的紀錄。changed 是要重新存的那份，removedIds 是要從資料庫刪掉的。
 */
export function mergeSameDateMealLogs(input: MealLog[]): {
  logs: MealLog[];
  changed: MealLog[];
  removedIds: string[];
} {
  const byId = new Map<string, MealLog>();
  for (const log of input) if (!byId.has(log.id)) byId.set(log.id, log);

  const byDate = new Map<string, MealLog[]>();
  for (const log of byId.values()) {
    const list = byDate.get(log.date) ?? [];
    list.push(log);
    byDate.set(log.date, list);
  }

  const logs: MealLog[] = [];
  const changed: MealLog[] = [];
  const removedIds: string[] = [];
  for (const list of byDate.values()) {
    if (list.length === 1) {
      logs.push(list[0]);
      continue;
    }
    const [keep, ...rest] = [...list].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const merged: MealLog = {
      ...keep,
      meals: keep.meals.map((m) => ({ ...m, foods: [...m.foods] })),
    };
    for (const other of rest) {
      for (const meal of other.meals) {
        const target = merged.meals.find((m) => m.type === meal.type);
        if (target) target.foods.push(...meal.foods);
        else merged.meals.push({ ...meal, foods: [...meal.foods] });
      }
      removedIds.push(other.id);
    }
    merged.totalCalories = totalCaloriesOf(merged);
    logs.push(merged);
    changed.push(merged);
  }
  return { logs, changed, removedIds };
}

/** 「已記錄」通知送給 AI 的樣子：講明是 App 已經記好的，角色才不會每輪又寫一次 <food-record> */
export function formatFoodRecordForPrompt(record: FoodRecordRef): string {
  const [, mm, dd] = record.date.split("-");
  const when = `${Number(mm)}/${Number(dd)}${record.time ? ` ${record.time}` : ""}`;
  const detail = [record.portion, record.calories != null ? `${record.calories}kcal` : ""]
    .filter(Boolean)
    .join("，");
  return `（系統：「${record.name}」已記進 ${when} 的食記${detail ? `（${detail}）` : ""}，這筆已經記好了，之後不要再為它輸出 <food-record>）`;
}
