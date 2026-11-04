import { describe, expect, it } from "vitest";
import { composeCharacter, DEFAULT_SPRITE } from "@/data/pixelArt/character";
import { FURNITURE_ART, BED_FRONT_ART } from "@/data/pixelArt/furniture";
import { FURNITURE } from "@/data/roomFurniture";
import { clearSlot, createDefaultRoom, normalizeRoom, placeFurniture, roomSummary, roomVisitNote } from "./roomLogic";
import { hasRoomLeaveTag } from "./roomTags";

const names = { userName: "小明", charName: "阿光" };

describe("擺家具", () => {
  it("一開始有基本款的床、書桌、衣櫃、窗簾", () => {
    const room = createDefaultRoom("c1");
    expect(room.placements).toMatchObject({ bed: "bed-single", desk: "desk-wood", wardrobe: "wardrobe-wood", window: "curtain-plain", rug: null });
  });

  it("換床：舊的收進收納，之後可以換回來", () => {
    let room = placeFurniture(createDefaultRoom("c1"), "bed", "bed-double");
    expect(room.placements.bed).toBe("bed-double");
    expect(room.storage).toEqual(["bed-single"]);
    room = placeFurniture(room, "bed", "bed-single");
    expect(room.storage).toEqual(["bed-double"]);
  });

  it("放不進去的位置不理", () => {
    const room = createDefaultRoom("c1");
    expect(placeFurniture(room, "bed", "rug-round")).toBe(room);
    expect(placeFurniture(room, "wallB", "wall-mirror").placements.wallB).toBe("wall-mirror");
  });

  it("地毯、牆上、角落可以收起來；床不能空", () => {
    const room = placeFurniture(createDefaultRoom("c1"), "rug", "rug-round");
    expect(clearSlot(room, "rug").placements.rug).toBeNull();
    expect(clearSlot(room, "bed")).toBe(room);
  });

  it("壞掉的資料補回預設", () => {
    const room = normalizeRoom({ placements: { bed: "rug-round", rug: "rug-fluffy" } as any, storage: ["nope", "bed-double"] }, "c1");
    expect(room.placements.bed).toBe("bed-single");
    expect(room.placements.rug).toBe("rug-fluffy");
    expect(room.storage).toEqual(["bed-double"]);
  });
});

describe("給 AI 的文字", () => {
  const room = placeFurniture(placeFurniture(createDefaultRoom("c1"), "corner", "corner-floor-mirror"), "bed", "bed-double");

  it("平常一行：只列特別的家具和禮物，關鍵詞有房間", () => {
    const { content, keywords } = roomSummary(room, names, ["熊玩偶"]);
    expect(content).toBe("阿光的房間：有雙人床、落地鏡，展示櫃上擺著小明送的熊玩偶");
    expect(keywords).toEqual(["房間", "雙人床", "落地鏡", "熊玩偶"]);
  });

  it("去他房間：列出全部家具；成人內容關閉時不送親密提示", () => {
    const off = roomVisitNote(room, names, [], { adult: false });
    expect(off).toContain("落地鏡：落地鏡照得到全身");
    expect(off).not.toContain("看著鏡子裡的彼此");
    const on = roomVisitNote(room, names, [], { adult: true, charStatus: "sleep" });
    expect(on).toContain("看著鏡子裡的彼此");
    expect(on).toContain("阿光正在床上睡覺");
    expect(on).toContain("<room-leave/>");
  });

  it("認得離開房間的標籤", () => {
    expect(hasRoomLeaveTag("<content>掰</content><room-leave/>")).toBe(true);
    expect(hasRoomLeaveTag("<content>掰</content>")).toBe(false);
  });
});

describe("像素圖", () => {
  it("每件家具都有圖，床有被子", () => {
    for (const f of FURNITURE) expect(FURNITURE_ART[f.id], f.id).toBeDefined();
    expect(BED_FRONT_ART["bed-single"]).toBeDefined();
  });

  it("每張圖的列都一樣寬", () => {
    for (const [id, art] of Object.entries(FURNITURE_ART)) {
      expect(art.rows.length, id).toBe(art.h);
      for (const row of art.rows) expect(row.length, id).toBe(art.w);
    }
  });

  it("小人四種姿勢：躺著是轉過來的", () => {
    const stand = composeCharacter(DEFAULT_SPRITE, "stand").art;
    const sleep = composeCharacter({ ...DEFAULT_SPRITE, body: "tall", outfit: "dress", hair: "long" }, "sleep").art;
    expect(stand).toMatchObject({ w: 12, h: 18 });
    expect(sleep).toMatchObject({ w: 19, h: 12 });
    expect(sleep.rows.join("")).not.toContain("e");
    for (const row of sleep.rows) expect(row.length).toBe(19);
    expect(composeCharacter(DEFAULT_SPRITE, "sit").art.h).toBe(16);
  });
});
