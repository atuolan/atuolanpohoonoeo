import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ACT_WEIGHTS, ACTS, itemZone, moveGroupOf, type RoomId } from "./houseData";
import {
  actSpot,
  clampGroupMove,
  clampPlacement,
  followAnchor,
  itemDepths,
  itemsInFront,
  type DepthItem,
  pickAct,
  pickDefaultResident,
  planRoute,
  residentStatus,
  sceneAt,
} from "./houseLogic";
import { parsePixelHouseState } from "./houseState";
import type { CharAway } from "@/types/chat";

const at = (h: number) => new Date(2026, 10, 4, h, 30);

describe("sceneAt", () => {
  it("白天 6～17、黃昏 17～19、晚上其他", () => {
    expect(sceneAt(at(6))).toBe("day");
    expect(sceneAt(at(16))).toBe("day");
    expect(sceneAt(at(17))).toBe("dusk");
    expect(sceneAt(at(18))).toBe("dusk");
    expect(sceneAt(at(19))).toBe("night");
    expect(sceneAt(at(2))).toBe("night");
  });
});

describe("itemZone", () => {
  it("牆上的、門、磁磚照名單；其他看預設底部在不在地板上", () => {
    expect(itemZone("living", "window", 95, 158)).toBe("wall");
    expect(itemZone("living", "door", 158, 158)).toBe("row");
    expect(itemZone("kitchen", "tiles", 127, 158)).toBe("fixed");
    expect(itemZone("living", "sofa", 247, 158)).toBe("floor");
    expect(itemZone("kitchen", "fridge", 155, 158)).toBe("floor");
    expect(itemZone("living", "tv", 134, 158)).toBe("any");
  });
});

describe("clampPlacement", () => {
  const box = { w: 20, h: 10 };
  it("取整數、不出房間", () => {
    expect(clampPlacement("any", { ...box, x: -5.4, y: 300 }, 158, 0)).toEqual({ x: 0, y: 272 });
    expect(clampPlacement("any", { ...box, x: 200, y: 10.6 }, 158, 0)).toEqual({ x: 110, y: 11 });
  });
  it("牆上的不能低過地板線", () => {
    expect(clampPlacement("wall", { ...box, x: 10, y: 200 }, 158, 0)).toEqual({ x: 10, y: 148 });
  });
  it("地上的底部要在地板上（可以靠牆）", () => {
    expect(clampPlacement("floor", { ...box, x: 10, y: 20 }, 158, 0)).toEqual({ x: 10, y: 142 });
    expect(clampPlacement("floor", { ...box, x: 10, y: 200 }, 158, 0)).toEqual({ x: 10, y: 200 });
  });
  it("門只能左右移", () => {
    expect(clampPlacement("row", { ...box, x: 40, y: 200 }, 158, 85)).toEqual({ x: 40, y: 85 });
  });
});

describe("actSpot / followAnchor", () => {
  it("家具沒搬：照設計稿的站位", () => {
    expect(actSpot(ACTS.tv, { tv: { x: 66, y: 111 } }, { tv: { x: 66, y: 111 } })).toEqual({ room: "living", x: 81, y: 158 });
  });
  it("家具搬了：站位跟著平移", () => {
    expect(actSpot(ACTS.sofa, { sofa: { x: 28, y: 204 } }, { sofa: { x: 8, y: 214 } })).toEqual({ room: "living", x: 67, y: 242 });
  });
  it("站位不會跑出能走的範圍", () => {
    const s = actSpot(ACTS.sofa, { sofa: { x: 100, y: 300 } }, { sofa: { x: 8, y: 214 } });
    expect(s.x).toBeLessThanOrEqual(124);
    expect(s.y).toBeLessThanOrEqual(272);
  });
  it("蒸氣、躺的位置也跟著家具", () => {
    expect(followAnchor([77, 108], "stove", { stove: { x: 70, y: 124 } }, { stove: { x: 66, y: 124 } })).toEqual({ x: 81, y: 108 });
    expect(followAnchor([77, 108], undefined, {}, {})).toEqual({ x: 77, y: 108 });
  });
});

describe("pickAct", () => {
  it("只挑這個時間有的事，不重複現在這件", () => {
    for (let i = 0; i < 50; i++) {
      const k = pickAct("night", "sleep", "bedroom");
      expect(k).not.toBe("sleep");
      expect(Object.keys(ACT_WEIGHTS.night)).toContain(k);
    }
  });
  it("擲到留在同一間時只挑這間的事", () => {
    const seq = [0.1, 0.5];
    let i = 0;
    const k = pickAct("day", null, "kitchen", () => seq[i++ % seq.length]);
    expect(ACTS[k].room).toBe("kitchen");
  });
});

describe("planRoute", () => {
  const door = { x: 113, y: 158 };
  it("同一間後排直接走過去", () => {
    expect(planRoute({ room: "living", x: 10, y: 160 }, { room: "living", x: 80, y: 160 }, door)).toEqual([
      { room: "living", x: 80, y: 160 },
    ]);
  });
  it("跨房間：走到邊上，從隔壁的邊上接著走，最後到目的地", () => {
    const legs = planRoute({ room: "living", x: 81, y: 158 }, { room: "kitchen", x: 113, y: 160 }, door);
    const last = legs[legs.length - 1];
    expect(last).toEqual({ room: "kitchen", x: 113, y: 160 });
    expect(legs.some((l) => l.room === "bedroom")).toBe(true);
    expect(legs.some((l) => l.teleport)).toBe(false);
  });
  it("進浴室：走到臥室的門，穿過去", () => {
    const legs = planRoute({ room: "living", x: 81, y: 158 }, { room: "bath", x: 85, y: 158 }, door);
    const tp = legs.findIndex((l) => l.teleport);
    expect(legs[tp - 1]).toMatchObject({ room: "bedroom", x: 113, y: 158 });
    expect(legs[tp].room).toBe("bath");
    expect(legs[legs.length - 1]).toEqual({ room: "bath", x: 85, y: 158 });
  });
  it("出浴室：從門穿回臥室再走", () => {
    const legs = planRoute({ room: "bath", x: 85, y: 158 }, { room: "kitchen", x: 27, y: 158 }, door);
    expect(legs.find((l) => l.teleport)).toMatchObject({ room: "bedroom", x: 113, y: 158 });
    expect(legs[legs.length - 1]).toEqual({ room: "kitchen", x: 27, y: 158 });
  });
});

describe("pickDefaultResident", () => {
  it("最近聊過的那位，不算群聊", () => {
    expect(
      pickDefaultResident([
        { characterId: "a", updatedAt: 10 },
        { characterId: "b", updatedAt: 30, isGroupChat: true },
        { characterId: "c", updatedAt: 20 },
      ]),
    ).toBe("c");
    expect(pickDefaultResident([])).toBeNull();
  });
});

describe("residentStatus", () => {
  const away = (kind?: CharAway["kind"], extra: Partial<CharAway> = {}) =>
    ({ id: "x", reason: "", backText: "", startedAt: 0, returnAt: 0, urgeCount: 0, callCount: 0, updatedAt: 0, kind, ...extra }) as CharAway;
  it("約會優先，其次是睡覺、忙碌、暫離", () => {
    expect(residentStatus(away("sleep"), true)).toBe("date");
    expect(residentStatus(away("sleep"), false)).toBe("sleep");
    expect(residentStatus(away("busy"), false)).toBe("busy");
    expect(residentStatus(away(undefined), false)).toBe("away");
  });
  it("已經回來或暫停中算在家", () => {
    expect(residentStatus(away("sleep", { endedAt: 1 }), false)).toBe("home");
    expect(residentStatus(away("busy", { pausedAt: 1 }), false)).toBe("home");
    expect(residentStatus(undefined, false)).toBe("home");
  });
});

describe("parsePixelHouseState", () => {
  it("壞掉的資料用預設值，擺放只留數字", () => {
    expect(parsePixelHouseState(null)).toEqual({ homeStyle: "canvas", residentCharId: null, look: "boy", looks: {}, timeLight: true, placements: {} });
    expect(
      parsePixelHouseState({
        homeStyle: "pixel-house",
        residentCharId: "c1",
        look: "girl",
        timeLight: false,
        placements: { living: { sofa: [1, 2], bad: ["x", 2], worse: 3 } },
      }),
    ).toEqual({ homeStyle: "pixel-house", residentCharId: "c1", look: "girl", looks: {}, timeLight: false, placements: { living: { sofa: [1, 2] } } });
    expect(parsePixelHouseState({ timeLight: "x" }).timeLight).toBe(true);
  });
});

/** 讀真正的房間圖清單，照預設的擺法算每件家具的前後 */
function roomDepths(room: RoomId, moved: Record<string, [number, number]> = {}) {
  const layout = JSON.parse(readFileSync(resolve(__dirname, `../../../public/pixel-house/${room}/layout.json`), "utf-8")) as {
    floor: { y: number };
    items: { id: string; x: number; y: number; w: number; h: number; empty?: boolean }[];
  };
  const items: DepthItem[] = layout.items
    .filter((it) => !it.empty)
    .map((it) => ({
      id: it.id,
      x: moved[it.id]?.[0] ?? it.x,
      y: moved[it.id]?.[1] ?? it.y,
      w: it.w,
      h: it.h,
      zone: itemZone(room, it.id, it.y + it.h, layout.floor.y),
    }));
  return itemDepths(room, items);
}

describe("itemDepths：誰在前面", () => {
  it("牆上的在最下面，地毯在其他家具下面", () => {
    const d = roomDepths("bedroom");
    expect(d.window).toBe(-1);
    expect(d.curtains).toBe(-1);
    expect(d.rug).toBe(0);
    expect(d.bed).toBeGreaterThan(d.rug);
    expect(roomDepths("kitchen").tiles).toBe(-1);
    expect(roomDepths("bath")["bath-mat"]).toBe(0);
  });
  it("放在別件家具上的東西跟著那件家具，在它前面", () => {
    const bedroom = roomDepths("bedroom");
    expect(bedroom.tv).toBeGreaterThan(bedroom["tv-cabinet"]);
    expect(bedroom.phone).toBeGreaterThan(bedroom.bed);
    expect(bedroom.monitor).toBeGreaterThan(bedroom.desk);
    expect(bedroom.chair).toBeGreaterThan(bedroom.desk);
    const kitchen = roomDepths("kitchen");
    expect(kitchen["fruit-plate"]).toBeGreaterThan(kitchen.table);
    expect(kitchen.faucet).toBeGreaterThan(kitchen.counter);
    // 鍋子在爐子上，爐子在流理台上
    expect(kitchen.pot).toBeGreaterThan(kitchen.stove);
    expect(kitchen.stove).toBeGreaterThan(kitchen.counter);
    expect(kitchen["chair-left"]).toBeGreaterThan(kitchen.table);
    expect(roomDepths("bath").duck).toBeGreaterThan(roomDepths("bath").bathtub);
  });
  it("家具搬到別件的後面（比較上面）就被它蓋住", () => {
    // 啞鈴搬到沙發上緣的後面
    const d = roomDepths("living", { dumbbell: [100, 180] });
    expect(d.dumbbell).toBeLessThan(d.sofa);
    // 細的立燈搬到沙發前面：沙發比它寬，不會變成「放在立燈上」
    const l = roomDepths("living", { lamp: [39, 218] });
    expect(l.sofa).toBe(247);
    expect(l.lamp).toBeGreaterThan(l.sofa);
    // 桌子搬走，桌上的盤子留在原地就不再跟著桌子
    const k = roomDepths("kitchen", { table: [20, 170] });
    expect(k["fruit-plate"]).toBeGreaterThan(k.table);
    expect(k["fruit-plate"]).toBe(220);
  });
  it("他站在餐桌後面時桌子、椅子、桌上的東西在他前面；站到前面就都在後面", () => {
    const d = roomDepths("kitchen");
    const behind = itemsInFront(d, ACTS.eat.y);
    expect(behind).toEqual(expect.arrayContaining(["table", "chair-left", "chair-right", "fruit-plate", "mug-pink", "mug-blue"]));
    expect(behind).not.toContain("counter");
    expect(behind).not.toContain("window");
    expect(itemsInFront(d, 253)).toEqual([]);
  });
});

describe("窗戶整組一起移動", () => {
  it("拖窗戶或窗簾是整組，拖窗台上的盆栽只動盆栽", () => {
    expect(moveGroupOf("living", "window")).toEqual(["window", "curtains", "sill-plant", "vase"]);
    expect(moveGroupOf("living", "curtains")).toEqual(["window", "curtains", "sill-plant", "vase"]);
    expect(moveGroupOf("living", "sill-plant")).toEqual(["sill-plant"]);
    expect(moveGroupOf("kitchen", "valance")).toEqual(["window", "valance"]);
    expect(moveGroupOf("bath", "window")).toEqual(["window"]);
  });
  it("整組限制在牆上、房間裡，每件之間的距離不變", () => {
    const group = [
      { x: 12, y: 41, w: 50, h: 54 },
      { x: 10, y: 38, w: 52, h: 54 },
    ];
    expect(clampGroupMove(group, 20.4, 5.2, 158)).toEqual({ dx: 20, dy: 5 });
    // 往右下拖太多：整組右邊貼牆（10 → 78），底部貼地板線（38 → 101）
    expect(clampGroupMove(group, 500, 500, 158)).toEqual({ dx: 68, dy: 63 });
    expect(clampGroupMove(group, -500, -500, 158)).toEqual({ dx: -10, dy: -38 });
  });
});
