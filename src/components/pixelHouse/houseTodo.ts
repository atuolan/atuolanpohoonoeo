/**
 * 小屋待辦：右上的轉盤打開後列出「現在小屋裡有什麼要處理」——生病、想上廁所、用品快沒了、
 * 地上的便便、貓砂盆、狗散步、倉鼠籠子、可以打掃的髒污、信箱、他留的東西。
 * 還有今天在小屋賺了多少、花了多少（從錢包的紀錄算，不另外存）。
 *
 * 這裡只有算的部分（不碰畫面），好測。省電：只在打開選單、或時鐘每分鐘走一格時算一次。
 */
import { awayUntil, catStat, walkOverdue, WALK_DUE_MS } from "./houseCat";
import { DIRT_BY_ID } from "./houseChores";
import { ROOM_NAMES, STRIP_ROOMS, type RoomId } from "./houseData";
import { GIFTS, type GiftKind } from "./houseLines";
import { BOX_FULL_NEAT, isDaily, MESS_BY_ID, stockDays, SUPPLIES, SUPPLY_IDS, type PetHome } from "./petHome";

/** 點了去哪：滑到那一間、打開那隻寵物的面板、打開用品 */
export type TodoGo = { kind: "room"; room: RoomId } | { kind: "pet"; id: string } | { kind: "supplies" };

/** 圖示（畫面那邊對應到小圖） */
export type TodoIcon = "sick" | "urge" | "poop" | "litter" | "walk" | "cage" | "supply" | "dirt" | "letter" | "dish";

export interface TodoItem {
  key: string;
  text: string;
  /** 小字：要做什麼 */
  note: string;
  icon: TodoIcon;
  /** alert：要趕快處理；care：照顧；coin：做了有金幣 */
  tone: "alert" | "care" | "coin";
  go: TodoGo;
}

export interface TodoInput {
  now: number;
  pets: PetHome;
  /** 現在想上廁所（頭上有驚嘆號）的貓狗，牠在哪一間 */
  urging: { id: string; name: string; room: RoomId; place: string }[];
  /** 現在有哪幾處髒污（id） */
  dirt: string[];
  mailReady: boolean;
  /** 他留下、還沒收的東西 */
  gifts: { kind: GiftKind; text: string }[];
  /** 他、她 */
  pronoun: string;
}

/** 籠子乾淨度低於這個就提醒換木屑 */
export const CAGE_DIRTY_BELOW = 30;
/** 用品剩不到幾天就提醒 */
export const SUPPLY_LOW_DAYS = 1;

/** 照房間的順序排、去掉重複 */
function roomsOf(ids: RoomId[]): RoomId[] {
  return STRIP_ROOMS.filter((r) => ids.includes(r));
}

export function houseTodos(input: TodoInput): TodoItem[] {
  const { now, pets, pronoun: p } = input;
  const alert: TodoItem[] = [];
  const care: TodoItem[] = [];
  const coin: TodoItem[] = [];

  for (const c of pets.cats) {
    if (c.sickSince && c.vetUntil <= now) {
      alert.push({ key: `sick:${c.id}`, text: `${c.name}生病了`, note: "帶去看醫生", icon: "sick", tone: "alert", go: { kind: "pet", id: c.id } });
    }
  }
  for (const u of input.urging) {
    alert.push({ key: `urge:${u.id}`, text: `${u.name}想上廁所`, note: `在${ROOM_NAMES[u.room]}，點牠再點${u.place}`, icon: "urge", tone: "alert", go: { kind: "room", room: u.room } });
  }

  // 會自己用掉的用品：用完、快用完（沒養會用到的不算）
  const out: string[] = [];
  const low: string[] = [];
  for (const id of SUPPLY_IDS) {
    if (!isDaily(id)) continue;
    const days = stockDays(pets, id);
    if (!Number.isFinite(days)) continue;
    if (pets.stock[id] <= 0) out.push(SUPPLIES[id].name);
    else if (days < SUPPLY_LOW_DAYS) low.push(SUPPLIES[id].name);
  }
  if (out.length || low.length) {
    const text = [out.length ? `${out.join("、")}用完了` : "", low.length ? `${low.join("、")}快用完了` : ""].filter(Boolean).join("，");
    (out.length ? alert : care).push({ key: "supply", text, note: "到用品補貨", icon: "supply", tone: out.length ? "alert" : "care", go: { kind: "supplies" } });
  }

  // 地上的便便
  const messIds = Object.keys(pets.messes).filter((id) => MESS_BY_ID[id]);
  if (messIds.length) {
    const rooms = roomsOf(messIds.map((id) => MESS_BY_ID[id].room));
    care.push({
      key: "mess",
      text: `地上有 ${messIds.length} 灘便便`,
      note: rooms.map((r) => ROOM_NAMES[r]).join("、"),
      icon: "poop",
      tone: "care",
      go: { kind: "room", room: rooms[0] },
    });
  }
  if (pets.cats.some((c) => c.species === "cat") && pets.box >= BOX_FULL_NEAT) {
    care.push({ key: "litter", text: "貓砂盆該鏟了", note: "在浴室", icon: "litter", tone: "care", go: { kind: "room", room: "bath" } });
  }
  for (const c of pets.cats) {
    if (c.sickSince || awayUntil(c) > now) continue;
    if (walkOverdue(c, now)) {
      const h = Math.floor((now - c.walkedAt) / 3_600_000);
      care.push({
        key: `walk:${c.id}`,
        text: `${c.name} ${h >= 48 ? `${Math.floor(h / 24)} 天` : `${Math.max(Math.round(WALK_DUE_MS / 3_600_000), h)} 小時`}沒散步了`,
        note: `${p}帶牠出門半小時`,
        icon: "walk",
        tone: "care",
        go: { kind: "pet", id: c.id },
      });
    }
    if (c.species === "hamster" && catStat(c, "clean", now) < CAGE_DIRTY_BELOW) {
      care.push({ key: `cage:${c.id}`, text: `${c.name}的籠子髒了`, note: "換木屑", icon: "cage", tone: "care", go: { kind: "pet", id: c.id } });
    }
  }

  // 有金幣的：髒污、信、他留的東西
  const dirtIds = input.dirt.filter((id) => DIRT_BY_ID[id]);
  if (dirtIds.length) {
    const rooms = roomsOf(dirtIds.map((id) => DIRT_BY_ID[id].room));
    coin.push({
      key: "dirt",
      text: `${dirtIds.length} 處可以打掃`,
      note: `${rooms.map((r) => ROOM_NAMES[r]).join("、")}，打掃有金幣`,
      icon: "dirt",
      tone: "coin",
      go: { kind: "room", room: rooms[0] },
    });
  }
  if (input.mailReady) {
    coin.push({ key: "mail", text: "信箱有今天的信", note: "在客廳，收下有金幣", icon: "letter", tone: "coin", go: { kind: "room", room: "living" } });
  }
  for (const g of input.gifts) {
    const def = GIFTS[g.kind];
    coin.push({
      key: `gift:${g.kind}`,
      text: g.kind === "note" ? `${p}在書桌留了紙條` : `${p}在餐桌留了${g.text}`,
      note: `在${ROOM_NAMES[def.room]}`,
      icon: g.kind === "note" ? "letter" : "dish",
      tone: "coin",
      go: { kind: "room", room: def.room },
    });
  }

  return [...alert, ...care, ...coin];
}

// ===== 今天賺了多少、花了多少 =====

export interface Ledger {
  earn: number;
  spend: number;
  /** 花在寵物上的（領養、用品、看醫生、健康檢查、保險） */
  pets: number;
}

/** 小屋的錢包紀錄都用這個開頭（家事、信、擺件、衣服、寵物…） */
const HOUSE_PREFIX = "pixel-house:";
const PET_PREFIX = /^pixel-house:(cat|dog|hamster):/;

/** 從錢包紀錄算今天（從當地的半夜開始）小屋的收支 */
export function todayLedger(
  txs: ReadonlyArray<{ type: "income" | "expense"; amount: number; timestamp: number; relatedItemId?: string }>,
  now: Date,
): Ledger {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: Ledger = { earn: 0, spend: 0, pets: 0 };
  for (const t of txs) {
    const id = t.relatedItemId ?? "";
    if (!id.startsWith(HOUSE_PREFIX) || t.timestamp < start || t.timestamp > now.getTime() + 60_000) continue;
    if (!(t.amount > 0)) continue;
    if (t.type === "income") out.earn += t.amount;
    else {
      out.spend += t.amount;
      if (PET_PREFIX.test(id)) out.pets += t.amount;
    }
  }
  return out;
}
