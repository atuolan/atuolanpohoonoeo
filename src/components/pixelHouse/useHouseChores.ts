/**
 * 家事和每日收入：髒污（你點掉、他自己掃）、信箱每天一封信、他忙完帶錢回來、番茄鐘和健身的獎勵。
 *
 * 省電：沒有計時器。髒污照時間差算（打開小屋、回到前景、他換一件事時各算一次）；
 * 他打掃用的是他原本「挑下一件事」的那個時間點。
 */
import { ref, watch, type Ref } from "vue";
import {
  accrueDirt,
  choreAct,
  choreDirtId,
  claimMail,
  cleanCoins,
  CLEAN_DAILY_CAP,
  DEED_COINS,
  DEED_NAMES,
  deedsToClaim,
  DIRT_BY_ID,
  DIRT_USER_DONE,
  mailWaiting,
  pickChore,
  workPay,
  WORK_DAILY_CAP,
  type AwayLike,
  type DirtMap,
} from "./houseChores";
import { ROOM_NAMES, type RoomId, type Scene } from "./houseData";
import { logHouseNews } from "./houseNews";
import { clockWentBack, countDaily, loadHouseLifeState, payCapped, rollDay, saveHouseLifeState } from "./houseLife";
import { earnCoins } from "./wardrobeShop";

export function useHouseChores(deps: {
  act: Ref<string>;
  walking: Ref<boolean>;
  scene: Ref<Scene>;
  /** 他在家、而且是自由活動（不是在睡、在忙） */
  free: Ref<boolean>;
  pronoun: Ref<string>;
  notify: (text: string) => void;
  /** 住在小屋的他（記事記「他做的事」用） */
  charId?: Ref<string | null>;
}) {
  const dirt = ref<DirtMap>({});
  /** 今天的信還沒領 */
  const mailReady = ref(false);
  /** 小屋這次打開（或回到前景）的時間：他過一陣子才開始打掃 */
  let openedAt = Date.now();
  /** 他上次自己打掃完的時間（跟存檔一樣；隔 4 小時才會再掃） */
  let choreAt = 0;

  /** 照時間差補上新的髒污、看今天的信領了沒（打開、回到前景、他換一件事時叫） */
  function refresh() {
    const now = new Date();
    const state = loadHouseLifeState(now);
    const next = accrueDirt(state.dirt, state.dirtAt, now.getTime());
    if (next.dirt !== state.dirt || next.dirtAt !== state.dirtAt) saveHouseLifeState({ ...state, ...next });
    dirt.value = next.dirt;
    choreAt = state.choreAt;
    mailReady.value = !clockWentBack(state, now) && mailWaiting(state.mail, now);
  }

  /** 回到小屋：重新算、他要再等一下才開始打掃 */
  function open() {
    openedAt = Date.now();
    refresh();
    void claimDeeds();
  }

  /** 清掉一處髒污並發錢（有每日上限；領完了還是可以清，只是沒有錢） */
  async function clean(id: string, by: "user" | "resident") {
    const def = DIRT_BY_ID[id];
    const now = new Date();
    const state = loadHouseLifeState(now);
    if (!def || !(id in state.dirt)) {
      dirt.value = state.dirt;
      return;
    }
    const { [id]: _gone, ...rest } = state.dirt;
    // 他掃的：記下時間，隔一段時間才會再掃
    if (by === "resident") choreAt = now.getTime();
    const cleaned = { ...state, dirt: rest, choreAt: by === "resident" ? choreAt : state.choreAt };
    const { state: counted, paid } = payCapped(cleaned, "cleanCoins", CLEAN_DAILY_CAP, cleanCoins(by), now);
    // 先存再發錢：連點兩下不會領兩次
    saveHouseLifeState(counted);
    dirt.value = rest;
    const p = deps.pronoun.value;
    const what = by === "user" ? DIRT_USER_DONE[def.kind] : `${p}把${def.done}`;
    logHouseNews(`${by === "user" ? "{user}" : "{char}"}打掃了${ROOM_NAMES[def.room]}（${def.done}）`, by === "user" ? "user" : "char", deps.charId?.value ?? undefined);
    if (paid > 0) {
      await earnCoins(paid, `小屋：打掃（${def.done}）`, `pixel-house:clean:${id}`);
      deps.notify(`${what}　＋${paid} 金幣`);
    } else {
      deps.notify(`${what}（今天打掃的錢領完了）`);
    }
  }

  // ===== 他自己打掃 =====

  /** 他走到了、正在清的那一處（走到一半被叫去睡覺就不算） */
  let doing: string | null = null;

  /** 他挑下一件事之前問：要不要去打掃 */
  function pickExtra(current: string, room: RoomId): string | null {
    // 剛掃完一處（這時候還沒記下時間）：不接著掃下一處
    if (!deps.free.value || doing) return null;
    const now = Date.now();
    // 手機時間被往回調（上次掃的時間在未來）：當作隔夠久了，不然會很久都不掃；錢那邊另外有擋
    const sinceLastMs = choreAt > now ? Infinity : now - choreAt;
    return pickChore(dirt.value, { night: deps.scene.value === "night", openMs: now - openedAt, sinceLastMs, room, current });
  }

  watch(deps.walking, (now, was) => {
    if (now || !was) return;
    const id = choreDirtId(deps.act.value);
    doing = id && id in dirt.value ? id : null;
  });
  watch(deps.act, (_next, prev) => {
    const id = prev ? choreDirtId(prev) : null;
    if (id && id === doing) void clean(id, "resident");
    doing = null;
    // 他每換一件事順便看一下有沒有新的髒污（小屋開很久的時候）
    refresh();
  });

  // ===== 信箱每天一封信 =====

  /** 領今天的信；領到了回傳 true（這次點信箱就不打開訊息） */
  function takeMail(): boolean {
    const now = new Date();
    const state = rollDay(loadHouseLifeState(now), now);
    const got = clockWentBack(state, now) ? null : claimMail(state.mail, now);
    mailReady.value = false;
    if (!got) return false;
    saveHouseLifeState({ ...state, mail: got.mail, lastSeenAt: now.getTime() });
    void earnCoins(got.coins, `小屋：每天的信（連續第 ${got.mail.streak} 天）`, "pixel-house:mail");
    deps.notify(
      got.mail.streak % 7 === 0
        ? `連續 ${got.mail.streak} 天收信！＋${got.coins} 金幣`
        : `今天的信　＋${got.coins} 金幣（連續第 ${got.mail.streak} 天）`,
    );
    return true;
  }

  // ===== 他忙完帶錢回來 =====

  /** 聊天裡他「在忙／暫離」結束了：照時間長短發錢（每一趟只發一次） */
  async function settleWork(away: AwayLike | undefined) {
    const now = new Date();
    const state = loadHouseLifeState(now);
    const coins = workPay(away, state.paidAway, now.getTime());
    if (!away || coins <= 0) return;
    const { state: counted, paid } = payCapped({ ...state, paidAway: away.id }, "workCoins", WORK_DAILY_CAP, coins, now);
    saveHouseLifeState(counted);
    if (paid <= 0) return;
    await earnCoins(paid, `小屋：${deps.pronoun.value}忙完帶回來的`, `pixel-house:work:${away.id}`);
    deps.notify(`${deps.pronoun.value}忙完回來了，帶回　＋${paid} 金幣`);
  }

  // ===== 番茄鐘、健身的獎勵 =====

  async function claimDeeds() {
    const now = new Date();
    let state = rollDay(loadHouseLifeState(now), now);
    for (const kind of deedsToClaim(state.deeds, state.daily, now)) {
      const counted = countDaily(state, `deed:${kind}`, 1, now);
      if (!counted) continue;
      state = counted;
      saveHouseLifeState(state);
      await earnCoins(DEED_COINS, `小屋：今天${DEED_NAMES[kind]}`, `pixel-house:deed:${kind}`);
      deps.notify(`今天${DEED_NAMES[kind]}　＋${DEED_COINS} 金幣`);
    }
  }

  return { dirt, mailReady, open, clean, takeMail, settleWork, pickExtra, extraAct: choreAct };
}
