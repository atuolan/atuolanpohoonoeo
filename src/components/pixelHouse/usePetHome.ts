/**
 * 養貓的家（好幾隻貓共用）：存檔、買東西、照顧、看醫生、清便便、補算關著小屋那段時間。
 * 每隻貓自己怎麼走、做什麼在 useHouseCat.ts。
 *
 * 省電：存檔只在「發生事情」時寫（買了、照顧了、生病了、上廁所了），不照時間寫。
 */
import { ref } from "vue";
import { careCat, catStat, CAT_WASH_BELOW, eatKibble, KIBBLE_HUNGRY, type CatCare, type CatColor, type CatState } from "./houseCat";
import { loadHouseLifeState, saveHouseLifeState } from "./houseLife";
import {
  addCat,
  adoptPrice,
  CHECKUP_PRICE,
  COVER_DAYS,
  doToilet,
  INSURANCE_PRICE,
  MAX_CATS,
  MESS_BY_ID,
  simulatePets,
  SUPPLIES,
  treatCat,
  updateCat,
  vetCost,
  type PetEvent,
  type PetHome,
  type SupplyId,
  type ToiletResult,
} from "./petHome";
import { payCoins } from "./wardrobeShop";

const DAY = 24 * 3_600_000;

export type PetHomeStore = ReturnType<typeof usePetHome>;

export function usePetHome(deps: { notify: (text: string) => void }) {
  const home = ref<PetHome>(loadHouseLifeState().pets);

  function save() {
    saveHouseLifeState({ ...loadHouseLifeState(), pets: home.value });
  }

  function set(next: PetHome) {
    home.value = next;
    save();
  }

  const catById = (id: string): CatState | undefined => home.value.cats.find((c) => c.id === id);
  const nameOf = (id: string) => catById(id)?.name ?? "貓";
  const insured = (now = Date.now()) => home.value.insuranceUntil > now;

  /** 付錢；不夠或失敗回傳原因 */
  async function pay(amount: number, what: string, itemId: string): Promise<string | null> {
    if (amount <= 0) return null;
    const r = await payCoins(amount, `小屋：${what}`, itemId);
    if (r.ok) return null;
    return r.error === "insufficient_funds" ? `金幣不夠（${what}要 ${amount.toLocaleString()} 金幣）` : "付款失敗，再試一次";
  }

  // ===== 補算 =====

  /** 把補算出來的事整理成一兩句話（很久沒開時不會一次跳出一堆） */
  function tellEvents(events: PetEvent[]) {
    const sick = [...new Set(events.filter((e) => e.kind === "sick").map((e) => (e as { catId: string }).catId))];
    const floor = events.filter((e) => e.kind === "floor").length;
    if (sick.length) deps.notify(`${sick.map(nameOf).join("、")}生病了，點牠看看要不要帶去看醫生`);
    if (floor) deps.notify(`你不在的時候，地上多了 ${floor} 灘便便`);
    if (events.some((e) => e.kind === "kibble-out")) deps.notify("貓糧吃完了，點碗或貓的面板 › 用品 補貨");
    if (events.some((e) => e.kind === "litter-out")) deps.notify("貓砂用完了，點貓的面板 › 用品 補貨");
  }

  /** 打開小屋、回到前景：把關著的那段時間補算完（牠們自己吃、自己上廁所、可能生病） */
  function catchUp(now = Date.now()) {
    if (!home.value.cats.length) {
      home.value = { ...home.value, simAt: now };
      return;
    }
    const r = simulatePets(home.value, now, { live: false });
    set(r.home);
    tellEvents(r.events);
  }

  /** 小屋開著：只判斷有沒有生病（牠們換一件事時叫）。沒事就不存檔 */
  function liveTick(now = Date.now()) {
    const r = simulatePets(home.value, now, { live: true });
    if (r.events.length) {
      set(r.home);
      tellEvents(r.events);
    } else home.value = r.home;
  }

  /** 離開小屋：記下算到哪裡 */
  function flush() {
    if (home.value.cats.length) save();
  }

  // ===== 領養、買東西 =====

  async function adopt(name: string, color: CatColor): Promise<string | null> {
    if (home.value.cats.length >= MAX_CATS) return `最多養 ${MAX_CATS} 隻`;
    const price = adoptPrice(home.value.cats.length);
    const why = await pay(price, "買一隻貓", "pixel-house:cat:adopt");
    if (why) return why;
    const now = Date.now();
    // 第一隻：從現在開始算（之前沒有貓，不用補算）
    const base = home.value.cats.length ? home.value : { ...home.value, simAt: now };
    const next = addCat(base, name, color, now);
    if (!next) return `最多養 ${MAX_CATS} 隻`;
    set(next);
    const cat = next.cats[next.cats.length - 1];
    deps.notify(`${cat.name}來了！送你一份新手包（貓糧、罐頭、貓條、貓砂）`);
    return null;
  }

  async function buy(id: SupplyId): Promise<string | null> {
    const s = SUPPLIES[id];
    const why = await pay(s.price, `${s.name} ${s.pack} ${s.unit}`, `pixel-house:cat:${id}`);
    if (why) return why;
    set({ ...home.value, stock: { ...home.value.stock, [id]: home.value.stock[id] + s.pack } });
    return null;
  }

  async function buyInsurance(): Promise<string | null> {
    const why = await pay(INSURANCE_PRICE, `寵物保險 ${COVER_DAYS} 天`, "pixel-house:cat:insurance");
    if (why) return why;
    const now = Date.now();
    set({ ...home.value, insuranceUntil: Math.max(home.value.insuranceUntil, now) + COVER_DAYS * DAY });
    return null;
  }

  async function checkup(id: string): Promise<string | null> {
    const cat = catById(id);
    if (!cat) return null;
    const why = await pay(CHECKUP_PRICE, `${cat.name}的健康檢查`, `pixel-house:cat:checkup`);
    if (why) return why;
    const now = Date.now();
    set(updateCat(home.value, id, (c) => ({ ...c, checkupUntil: Math.max(c.checkupUntil, now) + COVER_DAYS * DAY })));
    deps.notify(`${cat.name}做完健康檢查了，${COVER_DAYS} 天內比較不會生病`);
    return null;
  }

  async function goVet(id: string): Promise<string | null> {
    const cat = catById(id);
    if (!cat || !cat.sickSince) return null;
    const now = Date.now();
    const cost = vetCost(cat, now, insured(now));
    const why = await pay(cost, `${cat.name}看醫生`, "pixel-house:cat:vet");
    if (why) return why;
    set(treatCat(home.value, id, now));
    deps.notify(`${cat.name}去看醫生了（${cost.toLocaleString()} 金幣${insured(now) ? "，保險付了一半" : ""}），大約 30 分鐘後回家`);
    return null;
  }

  // ===== 照顧 =====

  /** 摸、玩、洗、罐頭、貓條。做了回傳 null；沒做回傳原因 */
  function care(id: string, kind: CatCare): string | null {
    const cat = catById(id);
    if (!cat) return null;
    const now = Date.now();
    if (kind === "wash" && catStat(cat, "clean", now) >= CAT_WASH_BELOW) return `${cat.name}還很乾淨`;
    if ((kind === "can" || kind === "treat") && home.value.stock[kind] <= 0) return `沒有${SUPPLIES[kind].name}了，到「用品」買`;
    let next = updateCat(home.value, id, (c) => careCat(c, kind, now));
    if (kind === "can" || kind === "treat") next = { ...next, stock: { ...next.stock, [kind]: next.stock[kind] - 1 } };
    set(next);
    return null;
  }

  /** 牠走到碗那邊吃了一份貓糧 */
  function eat(id: string): boolean {
    const cat = catById(id);
    if (!cat || home.value.stock.kibble <= 0 || catStat(cat, "food", Date.now()) >= KIBBLE_HUNGRY) return false;
    set({ ...updateCat(home.value, id, (c) => eatKibble(c, Date.now())), stock: { ...home.value.stock, kibble: home.value.stock.kibble - 1 } });
    return true;
  }

  /** 最需要洗澡的那隻（點浴缸用）；都很乾淨回傳 null */
  function dirtiest(now = Date.now()): CatState | null {
    const list = home.value.cats.filter((c) => c.vetUntil <= now).sort((a, b) => catStat(a, "clean", now) - catStat(b, "clean", now));
    return list[0] ?? null;
  }

  // ===== 上廁所、貓砂盆、地上的便便 =====

  /** 牠上了一次廁所（guided：小遊戲帶去的）。回傳去哪裡上、訓練度加了多少 */
  function toilet(id: string, guided = false): { result: ToiletResult; trained: number } {
    const r = doToilet(home.value, id, Date.now(), Math.random, { guided, useTreat: true });
    set(r.home);
    return { result: r.result, trained: r.trained };
  }

  /** 貓砂盆現在能不能用；不能的話回傳原因 */
  function boxProblem(id?: string): string | null {
    if (home.value.stock.litter <= 0) return "沒有貓砂了，到貓的面板 ›「用品」買";
    const cat = id ? catById(id) : undefined;
    const limit = cat?.personality === "neat" ? 3 : 6;
    if (home.value.box >= limit) return `貓砂盆太髒了${cat ? `，${cat.name}不想用` : ""}，先點貓砂盆鏟一鏟`;
    return null;
  }

  function scoop() {
    if (home.value.box <= 0) return;
    set({ ...home.value, box: 0 });
    deps.notify("貓砂盆鏟乾淨了");
  }

  function cleanMess(id: string) {
    if (!(id in home.value.messes) || !MESS_BY_ID[id]) return;
    const { [id]: _gone, ...rest } = home.value.messes;
    set({ ...home.value, messes: rest });
    deps.notify("清乾淨了");
  }

  function rename(id: string, name: string) {
    const clean = name.trim();
    if (clean) set(updateCat(home.value, id, (c) => ({ ...c, name: [...clean].slice(0, 8).join("") })));
  }

  /** 要牠現在上廁所（訓練用） */
  function urgeNow(id: string) {
    set(updateCat(home.value, id, (c) => ({ ...c, toiletAt: Date.now() })));
  }

  return {
    home,
    catById,
    insured,
    catchUp,
    liveTick,
    flush,
    adopt,
    buy,
    buyInsurance,
    checkup,
    goVet,
    care,
    eat,
    dirtiest,
    toilet,
    boxProblem,
    scoop,
    cleanMess,
    rename,
    urgeNow,
    set,
  };
}
