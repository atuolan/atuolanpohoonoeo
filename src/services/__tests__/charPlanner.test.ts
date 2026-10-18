import "fake-indexeddb/auto";
import { deleteDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";
import { closeDatabase, db } from "@/db/database";
import {
  applyCharPlannerOps,
  deleteCharPlanner,
  loadCharPlanner,
  markCharPlannerSeen,
  replaceCharPlannerState,
  replanCharPlannerForRound,
} from "@/services/charPlanner";
import { parseCharPlannerTags } from "@/utils/charPlanner";

const TODAY = "2026-10-18";
const ops = (raw: string) => parseCharPlannerTags(raw);

beforeEach(async () => {
  closeDatabase();
  await deleteDB("aguaphone-db");
  await db.init();
});

describe("角色待辦與行程的存取", () => {
  it("每個聊天各一份，存起來讀得到", async () => {
    await applyCharPlannerOps("chat-1", "c1", ops('<char-todo add="買花"/>'), { source: "chat", today: TODAY });
    await applyCharPlannerOps("chat-2", "c1", ops('<char-todo add="交報告"/>'), { source: "chat", today: TODAY });

    expect((await loadCharPlanner("chat-1"))?.todos.map((t) => t.text)).toEqual(["買花"]);
    expect((await loadCharPlanner("chat-2"))?.todos.map((t) => t.text)).toEqual(["交報告"]);
  });

  it("沒有標籤時不存", async () => {
    expect(await applyCharPlannerOps("chat-1", "c1", [], { source: "chat", today: TODAY })).toBeNull();
    expect(await loadCharPlanner("chat-1")).toBeNull();
  });

  it("重新生成換回那一輪之前；換回那個候選再套回去", async () => {
    await applyCharPlannerOps("chat-1", "c1", ops('<char-todo add="買花"/>'), { source: "chat", today: TODAY, turnId: "t1" });
    await applyCharPlannerOps("chat-1", "c1", ops('<char-todo add="訂餐廳"/>'), { source: "chat", today: TODAY, turnId: "t2" });

    await replanCharPlannerForRound("chat-1", "t2", undefined);
    expect((await loadCharPlanner("chat-1"))?.todos.map((t) => t.text)).toEqual(["買花"]);

    await replanCharPlannerForRound("chat-1", undefined, "t2");
    expect((await loadCharPlanner("chat-1"))?.todos.map((t) => t.text)).toEqual(["買花", "訂餐廳"]);
  });

  it("使用者刪掉記錯的；看過之後不算新消息", async () => {
    const saved = await applyCharPlannerOps("chat-1", "c1", ops('<char-todo add="買花"/><char-todo add="記錯的"/>'), {
      source: "chat",
      today: TODAY,
    });
    const wrong = saved!.todos.find((t) => t.text === "記錯的")!;

    await replaceCharPlannerState("chat-1", "c1", (s) => ({ ...s, todos: s.todos.filter((t) => t.id !== wrong.id) }));
    await markCharPlannerSeen("chat-1");

    const planner = await loadCharPlanner("chat-1");
    expect(planner?.todos.map((t) => t.text)).toEqual(["買花"]);
    expect(planner!.seenAt!).toBeGreaterThanOrEqual(planner!.updatedAt);
  });

  it("刪除聊天時一起刪", async () => {
    await applyCharPlannerOps("chat-1", "c1", ops('<char-todo add="買花"/>'), { source: "chat", today: TODAY });
    await deleteCharPlanner("chat-1");
    expect(await loadCharPlanner("chat-1")).toBeNull();
  });
});
