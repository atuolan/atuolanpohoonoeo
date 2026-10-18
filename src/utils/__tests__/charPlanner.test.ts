import { describe, expect, it } from "vitest";
import type { PlannerState } from "@/types/charPlanner";
import {
  applyPlannerOps,
  buildPlannerPromptText,
  parseCharPlannerTags,
  prunePlanner,
  recordPlannerTurn,
  replanForReplacedRound,
  visiblePlanner,
} from "@/utils/charPlanner";

const TODAY = "2026-10-18";
const empty: PlannerState = { todos: [], plans: [] };
const apply = (state: PlannerState, raw: string) =>
  applyPlannerOps(state, parseCharPlannerTags(raw), { source: "chat", today: TODAY, now: 1000 });

describe("解析待辦、行程標籤", () => {
  it("新增、做完、不做、排行程、取消", () => {
    const ops = parseCharPlannerTags(`
      <char-todo add="買草莓蛋糕" due="2026-10-20"/>
      <char-todo add="偷偷訂戒指" secret="true"/>
      <char-todo done="買草莓"/>
      <char-todo drop="訂戒指"/>
      <char-plan date="2026-10-24" time="19:00" end="21:00" title="一起吃飯" place="小巷餐館" with-user="true"/>
      <char-plan cancel="一起吃"/>`);
    expect(ops).toEqual([
      { kind: "todo-add", text: "買草莓蛋糕", due: "2026-10-20", secret: undefined },
      { kind: "todo-add", text: "偷偷訂戒指", due: undefined, secret: true },
      { kind: "todo-done", match: "買草莓" },
      { kind: "todo-drop", match: "訂戒指" },
      {
        kind: "plan-add",
        date: "2026-10-24",
        title: "一起吃飯",
        time: "19:00",
        end: "21:00",
        place: "小巷餐館",
        withUser: true,
        secret: undefined,
      },
      { kind: "plan-cancel", match: "一起吃" },
    ]);
  });

  it("行程缺日期或日期格式不對就略過", () => {
    expect(parseCharPlannerTags('<char-plan title="開會"/><char-plan date="明天" title="開會"/>')).toEqual([]);
  });
});

describe("套用改動", () => {
  it("同一件事不會重複記；做完照開頭幾個字找", () => {
    let state = apply(empty, '<char-todo add="買草莓蛋糕"/>');
    state = apply(state, '<char-todo add="買 草莓蛋糕！" due="2026-10-20"/>');
    expect(state.todos).toHaveLength(1);
    expect(state.todos[0].due).toBe("2026-10-20");

    state = apply(state, '<char-todo done="買草莓"/>');
    expect(state.todos[0]).toMatchObject({ done: true, doneAt: 1000 });
  });

  it("行程同一天同標題只補資料；取消找還沒到的", () => {
    let state = apply(empty, '<char-plan date="2026-10-10" title="一起吃飯"/>');
    state = apply(state, '<char-plan date="2026-10-24" title="一起吃飯"/>');
    state = apply(state, '<char-plan date="2026-10-24" title="一起吃飯" time="19:00"/>');
    expect(state.plans).toHaveLength(2);
    expect(state.plans[1].time).toBe("19:00");

    state = apply(state, '<char-plan cancel="一起吃飯"/>');
    expect(state.plans.map((p) => p.date)).toEqual(["2026-10-10"]);
  });

  it("不改傳進來的狀態", () => {
    const before = apply(empty, '<char-todo add="買花"/>');
    const copy = JSON.stringify(before);
    apply(before, '<char-todo done="買花"/>');
    expect(JSON.stringify(before)).toBe(copy);
  });
});

describe("清理", () => {
  it("做完超過 7 天的待辦、14 天前的行程清掉", () => {
    const day = 86_400_000;
    const state: PlannerState = {
      todos: [
        { id: "a", text: "舊的", done: true, doneAt: 0, source: "chat", createdAt: 0 },
        { id: "b", text: "剛做完", done: true, doneAt: 6 * day, source: "chat", createdAt: 0 },
        { id: "c", text: "還沒做", done: false, source: "chat", createdAt: 0 },
      ],
      plans: [
        { id: "p1", date: "2026-10-03", title: "很久以前", source: "chat", createdAt: 0 },
        { id: "p2", date: "2026-10-04", title: "兩週前", source: "chat", createdAt: 0 },
      ],
    };
    const pruned = prunePlanner(state, TODAY, 8 * day);
    expect(pruned.todos.map((t) => t.id)).toEqual(["b", "c"]);
    expect(pruned.plans.map((p) => p.id)).toEqual(["p2"]);
  });
});

describe("給 AI 看的清單", () => {
  it("沒做完的待辦和今天到後天的行程，秘密的標出來", () => {
    let state = apply(empty, '<char-todo add="買草莓蛋糕" due="2026-10-20"/><char-todo add="偷偷訂戒指" secret="true"/>');
    state = apply(state, '<char-todo add="交報告"/><char-todo done="交報告"/>');
    state = apply(
      state,
      '<char-plan date="2026-10-18" time="19:00" end="21:00" title="一起吃飯" with-user="true"/><char-plan date="2026-10-25" title="下週的事"/>',
    );
    const text = buildPlannerPromptText(state, TODAY, "小栩");
    expect(text).toBe(
      [
        "還沒做完的待辦：",
        "- 買草莓蛋糕（10/20（二）前）",
        "- 偷偷訂戒指（秘密，小栩看不到）",
        "今天到後天的行程：",
        "- 今天 10/18（日） 19:00–21:00 一起吃飯（和小栩）",
      ].join("\n"),
    );
  });

  it("什麼都沒有時說沒有", () => {
    expect(buildPlannerPromptText(empty, TODAY, "小栩")).toBe("（目前沒有待辦和行程）");
  });

  it("聊天頁看不到秘密的", () => {
    const state = apply(empty, '<char-todo add="偷偷訂戒指" secret="true"/><char-todo add="買花"/>');
    expect(visiblePlanner(state).todos.map((t) => t.text)).toEqual(["買花"]);
  });
});

describe("重新生成時換回", () => {
  it("被換下那輪改的換回改之前，換回那個候選時再套回去", () => {
    const base = apply(empty, '<char-todo add="買花"/>');
    const afterA = apply(base, '<char-todo add="訂餐廳"/>');
    let turns = recordPlannerTurn(undefined, "A", base, afterA);

    // 重新生成 A：換回 base
    const reverted = replanForReplacedRound({ ...afterA, turns }, "A", undefined);
    expect(reverted?.todos.map((t) => t.text)).toEqual(["買花"]);

    // 新的候選 B 改了別的
    const afterB = apply(reverted!, '<char-todo done="買花"/>');
    turns = recordPlannerTurn(turns, "B", reverted!, afterB);

    // 換回 A：B 的改動拿掉、A 的套回去
    const backToA = replanForReplacedRound({ ...afterB, turns }, "B", "A");
    expect(backToA?.todos.map((t) => `${t.text}:${t.done}`)).toEqual(["買花:false", "訂餐廳:false"]);
  });

  it("之後又有別的改動就不動", () => {
    const base = apply(empty, '<char-todo add="買花"/>');
    const afterA = apply(base, '<char-todo add="訂餐廳"/>');
    const turns = recordPlannerTurn(undefined, "A", base, afterA);
    const userDeleted = { todos: afterA.todos.slice(1), plans: [] };

    expect(replanForReplacedRound({ ...userDeleted, turns }, "A", undefined)).toBeNull();
  });
});

describe("聊天泡泡裡看不到標籤", () => {
  it("模型把標籤寫在訊息裡也會拿掉", async () => {
    const { parseAIResponse } = await import("@/services/ResponseParser");
    const parsed = parseAIResponse(
      '<content><msg>好啊，週六見<char-plan date="2026-10-24" title="一起吃飯"/></msg></content><char-todo add="訂位"/>',
    );
    expect(parsed.messages.map((m) => m.content)).toEqual(["好啊，週六見"]);
  });
});

describe("偷窺手機生成的寫回來", () => {
  it("拿掉上次偷窺手機寫的，補上這次的；聊天裡已經有的不重複", async () => {
    const { mergePeekItems } = await import("@/utils/charPlanner");
    let state = apply(empty, '<char-todo add="買草莓蛋糕"/><char-plan date="2026-10-18" time="19:00" title="一起吃飯"/>');
    state = mergePeekItems(
      state,
      {
        memos: [{ content: "買草莓蛋糕", done: false }, { content: "繳電話費", done: true }],
        schedule: [{ time: "08:30", title: "晨會", location: "三樓" }, { time: "19:00", title: "一起吃飯" }],
      },
      TODAY,
      5,
    );
    expect(state.todos.map((t) => `${t.text}:${t.source}`)).toEqual(["買草莓蛋糕:chat", "繳電話費:peek"]);
    expect(state.plans.map((p) => `${p.time} ${p.title}:${p.source}`)).toEqual(["08:30 晨會:peek", "19:00 一起吃飯:chat"]);

    // 重新生成：上次的換掉
    state = mergePeekItems(state, { memos: [{ content: "訂機票", done: false }], schedule: [] }, TODAY, 6);
    expect(state.todos.map((t) => t.text)).toEqual(["買草莓蛋糕", "訂機票"]);
    expect(state.plans.map((p) => p.title)).toEqual(["一起吃飯"]);
  });
});
