import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { ACT_WEIGHTS, ACTS, FURNITURE_ACTIONS, itemZone, MAIL_ITEMS, moveGroupOf, NIGHT_ITEMS, SLEEP_ITEMS, type DecorDef, type RoomId, type SkinDef } from "./houseData";
import {
  actSpot,
  clampGroupMove,
  clampPlacement,
  dwellMs,
  followAnchor,
  itemDepths,
  itemsInFront,
  type DepthItem,
  pickAct,
  pickDefaultResident,
  planRoute,
  residentStatus,
  sceneAt,
  snapRoomIndex,
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
  it("同一間後排直接走過去", () => {
    expect(planRoute({ room: "living", x: 10, y: 160 }, { room: "living", x: 80, y: 160 })).toEqual([{ room: "living", x: 80, y: 160 }]);
  });
  it("跨房間：走到邊上，從隔壁的邊上接著走，最後到目的地", () => {
    const legs = planRoute({ room: "kitchen", x: 113, y: 160 }, { room: "bedroom", x: 66, y: 157 });
    expect(legs[legs.length - 1]).toEqual({ room: "bedroom", x: 66, y: 157 });
    expect(legs.some((l) => l.room === "living")).toBe(true);
  });
  it("浴室在臥室右邊：從臥室的右邊走過去，出現在浴室的左邊", () => {
    const legs = planRoute({ room: "bedroom", x: 66, y: 157 }, { room: "bath", x: 85, y: 158 });
    const enter = legs.findIndex((l) => l.room === "bath");
    expect(legs[enter - 1]).toMatchObject({ room: "bedroom", x: 130 });
    expect(legs[enter]).toMatchObject({ room: "bath", x: 0 });
    expect(legs[legs.length - 1]).toEqual({ room: "bath", x: 85, y: 158 });
  });
  it("出浴室：往左一間一間走回去", () => {
    const legs = planRoute({ room: "bath", x: 85, y: 158 }, { room: "kitchen", x: 27, y: 158 });
    expect(legs.map((l) => l.room).filter((r, n, a) => r !== a[n - 1])).toEqual(["bath", "bedroom", "living", "kitchen"]);
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
    expect(parsePixelHouseState(null)).toEqual({ homeStyle: "canvas", residentCharId: null, look: "boy", looks: {}, timeLight: true, calm: false, guideSeen: false, dockOpen: false, placements: {}, decor: {}, ownedSkins: [], skins: {} });
    expect(
      parsePixelHouseState({
        homeStyle: "pixel-house",
        residentCharId: "c1",
        look: "girl",
        timeLight: false,
        placements: { living: { sofa: [1, 2], bad: ["x", 2], worse: 3 } },
      }),
    ).toEqual({ homeStyle: "pixel-house", residentCharId: "c1", look: "girl", looks: {}, timeLight: false, calm: false, guideSeen: false, dockOpen: false, placements: { living: { sofa: [1, 2] } }, decor: {}, ownedSkins: [], skins: {} });
    expect(parsePixelHouseState({ guideSeen: true }).guideSeen).toBe(true);
    expect(parsePixelHouseState({ dockOpen: true }).dockOpen).toBe(true);
    expect(parsePixelHouseState({ calm: true }).calm).toBe(true);
    expect(parsePixelHouseState({ calm: "yes" }).calm).toBe(false);
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
    expect(k["fruit-plate"]).toBe(221);
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

describe("dwellMs：每件事做多久", () => {
  it("一般 20～40 秒，睡覺 3～5 分鐘", () => {
    expect(dwellMs("sofa", () => 0)).toBe(20_000);
    expect(dwellMs("sofa", () => 1)).toBe(40_000);
    expect(dwellMs("sleep", () => 0)).toBe(180_000);
    expect(dwellMs("sleep", () => 1)).toBe(300_000);
  });
  it("少走動：四倍，一兩分鐘才換一件事", () => {
    expect(dwellMs("sofa", () => 0, true)).toBe(80_000);
    expect(dwellMs("sofa", () => 1, true)).toBe(160_000);
    expect(dwellMs("sleep", () => 0, true)).toBe(720_000);
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

describe("家具的圖", () => {
  const ROOMS: RoomId[] = ["living", "bedroom", "kitchen", "bath"];
  const dir = (room: RoomId) => resolve(__dirname, `../../../public/pixel-house/${room}`);
  it("每件家具都有圖，晚上和有信的版本也有", () => {
    for (const room of ROOMS) {
      const layout = JSON.parse(readFileSync(`${dir(room)}/layout.json`, "utf-8")) as { items: { id: string; empty?: boolean }[] };
      const ids = layout.items.filter((it) => !it.empty).map((it) => it.id);
      for (const id of ids) expect(existsSync(`${dir(room)}/items/${id}.png`), `${room}/${id}`).toBe(true);
      for (const id of NIGHT_ITEMS[room]) expect(existsSync(`${dir(room)}/items/${id}-night.png`), `${room}/${id}-night`).toBe(true);
      for (const id of MAIL_ITEMS[room]) expect(existsSync(`${dir(room)}/items/${id}-full.png`), `${room}/${id}-full`).toBe(true);
      for (const id of SLEEP_ITEMS[room]) expect(existsSync(`${dir(room)}/items/${id}-sleep.png`), `${room}/${id}-sleep`).toBe(true);
      // 對到 App 的家具都在房間裡
      for (const id of Object.keys(FURNITURE_ACTIONS[room])) expect(ids, `${room}/${id}`).toContain(id);
    }
  });
  it("擺件商店的每件擺件都有圖，預設位置在房間裡，id 不跟原本的家具撞名", () => {
    const decorDir = resolve(__dirname, "../../../public/pixel-house/decor");
    const defs = JSON.parse(readFileSync(`${decorDir}/decor.json`, "utf-8")) as DecorDef[];
    expect(defs.length).toBeGreaterThan(0);
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    for (const d of defs) {
      expect(existsSync(`${decorDir}/${d.id}.png`), d.id).toBe(true);
      expect(ROOMS, d.id).toContain(d.room);
      // 貓叼回來的不賣（0 元）；商店賣的都要有價錢
      if (d.catOnly) expect(d.price, d.id).toBe(0);
      else expect(d.price, d.id).toBeGreaterThan(0);
      expect(d.x >= 0 && d.y >= 0 && d.x + d.w <= 130 && d.y + d.h <= 282, d.id).toBe(true);
      const layout = JSON.parse(readFileSync(`${dir(d.room)}/layout.json`, "utf-8")) as { floor: { y: number }; items: { id: string }[] };
      expect(layout.items.map((i) => i.id), d.id).not.toContain(d.id);
      // 掛在牆上的整件都在地板線以上
      if (d.wall) expect(d.y + d.h, d.id).toBeLessThanOrEqual(layout.floor.y);
    }
  });
  it("家具款式：每個都有圖、跟原本一樣大，原本有睡覺／有信／晚上的圖的款式也有", () => {
    const root = resolve(__dirname, "../../../public/pixel-house");
    const defs = JSON.parse(readFileSync(`${root}/skins/skins.json`, "utf-8")) as SkinDef[];
    expect(defs.length).toBeGreaterThan(0);
    const keys = defs.map((d) => `${d.room}:${d.item}:${d.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    const pngSize = (p: string) => {
      const b = readFileSync(p);
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    for (const d of defs) {
      const file = `${root}/skins/${d.room}/${d.item}/${d.id}.png`;
      expect(existsSync(file), file).toBe(true);
      expect(pngSize(file), file).toEqual(pngSize(`${root}/${d.base}`));
      expect(pngSize(file), file).toEqual([d.w, d.h]);
      expect(d.price, file).toBeGreaterThan(0);
      for (const [list, suf] of [[SLEEP_ITEMS, "-sleep"], [MAIL_ITEMS, "-full"], [NIGHT_ITEMS, "-night"]] as const) {
        if (list[d.room].includes(d.item)) expect(existsSync(`${root}/skins/${d.room}/${d.item}/${d.id}${suf}.png`), `${file}${suf}`).toBe(true);
      }
    }
  });
  it("換上的款式一定是買過的，沒買過的丟掉", () => {
    const st = parsePixelHouseState({
      ownedSkins: ["living:sofa:pink", "living:sofa:pink", "bad", 3],
      skins: { "living:sofa": "pink", "bedroom:bed": "blue" },
    });
    expect(st.ownedSkins).toEqual(["living:sofa:pink"]);
    expect(st.skins).toEqual({ "living:sofa": "pink" });
  });
  it("買過的擺件記在狀態裡：true 擺出來、false 收起來，格式不對的丟掉", () => {
    expect(parsePixelHouseState({ decor: { "star-lamp": true, headphones: false, bad: "yes" } }).decor).toEqual({ "star-lamp": true, headphones: false });
    expect(parsePixelHouseState({ decor: ["x"] }).decor).toEqual({});
  });
  it("客廳的信箱掛在牆上，點了打開訊息", () => {
    expect(itemZone("living", "mailbox", 107, 158)).toBe("wall");
    expect(FURNITURE_ACTIONS.living.mailbox).toEqual({ kind: "app", app: "message", to: "訊息" });
    expect(roomDepths("living").mailbox).toBe(-1);
  });
});

describe("snapRoomIndex：放開後停在哪一間", () => {
  const W = 390;
  it("慢慢拖不到一半就放開：回原本那間", () => {
    expect(snapRoomIndex(W / 2 + 150, 0, 0, W)).toBe(0);
  });
  it("慢慢拖過一半：換到隔壁", () => {
    expect(snapRoomIndex(W / 2 + 220, 0, 0, W)).toBe(1);
  });
  it("輕輕一撥就換間", () => {
    expect(snapRoomIndex(W / 2 + 40, -0.5, 0, W)).toBe(1);
    expect(snapRoomIndex(W * 1.5 - 40, 0.5, 1, W)).toBe(0);
  });
  it("撥再大力也只換一間", () => {
    expect(snapRoomIndex(W / 2 + 100, -5, 0, W)).toBe(1);
  });
  it("第一間往右撥、最後一間往左撥：留在原地", () => {
    expect(snapRoomIndex(W / 2, 2, 0, W)).toBe(0);
    expect(snapRoomIndex(W * 3.5, -2, 3, W)).toBe(3);
  });
});
