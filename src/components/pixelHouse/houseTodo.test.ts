import { describe, expect, it } from "vitest";
import { adoptCat, type CatState } from "./houseCat";
import { houseTodos, todayLedger, type TodoInput } from "./houseTodo";
import { emptyPetHome, emptyStock, type PetHome } from "./petHome";

const T0 = new Date(2026, 10, 12, 15, 0).getTime();
const HOUR = 3_600_000;

const pet = (id: string, species: "cat" | "dog" | "hamster", patch: Partial<CatState> = {}): CatState => ({
  ...adoptCat(id, species === "cat" ? "orange" : species === "dog" ? "shiba" : "golden", T0, () => 0.5, id, species),
  personality: "lazy",
  ...patch,
});
const home = (cats: CatState[], patch: Partial<PetHome> = {}): PetHome => ({
  ...emptyPetHome(T0),
  cats,
  stock: { ...emptyStock(), kibble: 50, litter: 50, dogFood: 50, pad: 50, pellet: 50, bedding: 5 },
  ...patch,
});
const input = (patch: Partial<TodoInput> = {}): TodoInput => ({
  now: T0,
  pets: home([]),
  urging: [],
  dirt: [],
  mailReady: false,
  gifts: [],
  pronoun: "他",
  ...patch,
});

describe("小屋待辦", () => {
  it("沒事的時候是空的", () => {
    expect(houseTodos(input())).toEqual([]);
    expect(houseTodos(input({ pets: home([pet("a", "cat"), pet("b", "dog"), pet("c", "hamster")]) }))).toEqual([]);
  });

  it("生病（在醫院的不算）、想上廁所排最前面", () => {
    const sick = pet("a", "cat", { sickSince: T0 - HOUR });
    const atVet = pet("b", "cat", { sickSince: T0 - HOUR, vetUntil: T0 + HOUR });
    const todos = houseTodos(
      input({ pets: home([sick, atVet]), dirt: ["k-crumbs"], urging: [{ id: "c", name: "小柴", room: "bath", place: "尿布墊" }] }),
    );
    expect(todos.map((t) => t.key)).toEqual(["sick:a", "urge:c", "dirt"]);
    expect(todos[0].go).toEqual({ kind: "pet", id: "a" });
    expect(todos[1].note).toContain("尿布墊");
  });

  it("用品：用完的是要趕快處理，快用完的是照顧；沒養會用到的不提醒", () => {
    const h = home([pet("a", "dog")], { stock: { ...emptyStock(), dogFood: 0, pad: 1, kibble: 0 } });
    const [t] = houseTodos(input({ pets: h }));
    expect(t.key).toBe("supply");
    expect(t.tone).toBe("alert");
    expect(t.text).toBe("狗糧用完了，尿布墊快用完了");
    expect(t.text).not.toContain("貓糧");
    expect(t.go).toEqual({ kind: "supplies" });
  });

  it("地上的便便、貓砂盆、太久沒散步、籠子髒了", () => {
    const h = home([pet("c", "cat"), pet("d", "dog", { walkedAt: T0 - 15 * HOUR }), pet("h", "hamster", { clean: { v: 10, at: T0 } })], {
      messes: { "mess-bath": "pee", "mess-kitchen": "poop" },
      box: 5,
    });
    const todos = houseTodos(input({ pets: h }));
    const by = Object.fromEntries(todos.map((t) => [t.key, t]));
    expect(by.mess.text).toBe("地上有 2 灘便便");
    expect(by.mess.go).toEqual({ kind: "room", room: "kitchen" });
    expect(by.litter).toBeTruthy();
    expect(by["walk:d"].text).toBe("d 15 小時沒散步了");
    expect(by["cage:h"].go).toEqual({ kind: "pet", id: "h" });
  });

  it("散步中、在醫院的狗不提醒散步", () => {
    const out = pet("d", "dog", { walkedAt: T0 - 20 * HOUR, outUntil: T0 + 10 * 60_000 });
    expect(houseTodos(input({ pets: home([out]) }))).toEqual([]);
  });

  it("有金幣的：髒污、信、他留的東西排最後", () => {
    const todos = houseTodos(
      input({ dirt: ["l-dust-a", "k-crumbs", "不存在"], mailReady: true, gifts: [{ kind: "dish", text: "一盤炒飯" }], pets: home([pet("a", "cat", { sickSince: T0 })]) }),
    );
    expect(todos.map((t) => t.tone)).toEqual(["alert", "coin", "coin", "coin"]);
    const dirt = todos.find((t) => t.key === "dirt")!;
    expect(dirt.text).toBe("2 處可以打掃");
    expect(dirt.go).toEqual({ kind: "room", room: "kitchen" });
    expect(todos.find((t) => t.key === "gift:dish")!.text).toBe("他在餐桌留了一盤炒飯");
  });
});

describe("小屋待辦：第二批寵物", () => {
  it("雪貂藏的東西、蛇的飼養箱太乾、天竺鼠沒吃蔬菜、保溫燈快沒了", () => {
    const snake = { ...adoptCat("s", "corn", T0, () => 0.5, "s", "snake"), personality: "lazy" as const, clean: { v: 10, at: T0 }, lampUntil: T0 + 2 * 86_400_000 };
    const gp = { ...adoptCat("g", "ginger", T0, () => 0.5, "g", "guineaPig"), personality: "lazy" as const, vegAt: T0 - 3 * 86_400_000 };
    const pets = home([snake, gp], { stash: { spot: "stash-bed", coins: 20, by: "小貂" }, stock: { ...emptyStock(), hay: 50, veg: 5, bedding: 2, mouse: 3 } });
    const by = Object.fromEntries(houseTodos(input({ pets })).map((t) => [t.key, t]));
    expect(by.stash.go).toEqual({ kind: "room", room: "bedroom" });
    expect(by.stash.text).toBe("小貂藏了東西");
    expect(by["cage:s"].text).toBe("s的飼養箱太乾了");
    expect(by["veg:g"]).toBeTruthy();
    expect(by.supply.text).toBe("保溫燈泡快用完了");
  });
});

describe("今天的收支", () => {
  const now = new Date(2026, 10, 12, 21, 0);
  const at = (h: number, day = 12) => new Date(2026, 10, day, h).getTime();

  it("只算小屋的、只算今天的；寵物另外加總", () => {
    const l = todayLedger(
      [
        { type: "income", amount: 120, timestamp: at(9), relatedItemId: "pixel-house:clean:k-crumbs" },
        { type: "income", amount: 15, timestamp: at(10), relatedItemId: "pixel-house:cat:gift" },
        { type: "expense", amount: 800, timestamp: at(11), relatedItemId: "pixel-house:dog:dogFood" },
        { type: "expense", amount: 300, timestamp: at(12), relatedItemId: "pixel-house:decor:lamp" },
        { type: "expense", amount: 999, timestamp: at(12, 11), relatedItemId: "pixel-house:dog:dogFood" },
        { type: "income", amount: 500, timestamp: at(13), relatedItemId: "fishing:sell" },
        { type: "expense", amount: 50, timestamp: at(14) },
      ],
      now,
    );
    expect(l).toEqual({ earn: 135, spend: 1_100, pets: 800 });
  });
});
