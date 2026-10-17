import { describe, expect, it } from "vitest";
import {
  buildCircleSummaryPrompt,
  buildDebatePrompt,
  buildRepliesPrompt,
  buildSupplementPrompt,
  newCircle,
  notedParagraphs,
  notesByParagraph,
  parseCircleReplies,
  parseCircleSummary,
  parseDebate,
  parseSupplement,
  pickSyncMember,
  shouldRefreshSummary,
  toggleAgree,
  type CircleMember,
} from "@/services/bookCircle";
import type { CircleNote } from "@/types/book";

let t = 0;
const note = (p: Partial<CircleNote> & Pick<CircleNote, "id">): CircleNote => ({
  chapterIndex: 0,
  paraStart: 0,
  quote: "北冥有魚",
  authorId: "user",
  authorName: "我",
  content: "內容",
  agreeIds: [],
  createdAt: ++t,
  ...p,
});

const members: CircleMember[] = [
  { id: "c1", name: "小鯤", persona: "住在北冥的魚", memory: "上週一起去海邊" },
  { id: "c2", name: "惠施", persona: "愛抬槓" },
];
const info = { bookTitle: "莊子", author: "莊周", chapterTitle: "逍遙遊", summaries: "【逍遙遊｜鯤化為鵬】\n- 大魚化大鳥" };

describe("分組", () => {
  it("依段落位置分組，回覆（含回覆的回覆）收在同一串", () => {
    const notes = [
      note({ id: "b", chapterIndex: 1, paraStart: 0, quote: "第二章" }),
      note({ id: "a", paraStart: 40, quote: "後段" }),
      note({ id: "a1", paraStart: 40, parentId: "a", authorId: "c1" }),
      note({ id: "a2", paraStart: 40, parentId: "a1", authorId: "c2" }),
      note({ id: "z", paraStart: 0 }),
      note({ id: "orphan", paraStart: 0, parentId: "deleted" }),
    ];
    const groups = notesByParagraph(notes);
    expect(groups.map((g) => g.key)).toEqual(["0:0", "0:40", "1:0"]);
    expect(groups[0].threads.map((th) => th.note.id)).toEqual(["z", "orphan"]);
    expect(groups[1].threads).toHaveLength(1);
    expect(groups[1].threads[0].replies.map((r) => r.id)).toEqual(["a1", "a2"]);
    expect(groups[1].count).toBe(3);
  });

  it("本章有留言的段落與留言的人", () => {
    const notes = [note({ id: "1", paraStart: 5 }), note({ id: "2", paraStart: 5, authorId: "c1" }), note({ id: "3", paraStart: 5 }), note({ id: "4", chapterIndex: 2 })];
    const map = notedParagraphs(notes, 0);
    expect([...map.entries()]).toEqual([[5, ["user", "c1"]]]);
  });
});

describe("小工具", () => {
  it("同意可以切換", () => {
    const n = toggleAgree(note({ id: "x" }), "user");
    expect(n.agreeIds).toEqual(["user"]);
    expect(toggleAgree(n, "user").agreeIds).toEqual([]);
  });

  it("同步讀挑最久沒說話的角色", () => {
    const notes = [note({ id: "1", authorId: "c1", createdAt: 100 }), note({ id: "2", authorId: "c2", createdAt: 50 })];
    expect(pickSyncMember(["c1", "c2"], notes)).toBe("c2");
    expect(pickSyncMember(["c1", "c2", "c3"], notes)).toBe("c3");
    expect(pickSyncMember([], notes)).toBeUndefined();
  });

  it("新留言滿 3 則才重算摘要", () => {
    const circle = newCircle("莊子小組", ["c1", "c2", "c3", "c4", "c5"]);
    expect(circle.memberIds).toHaveLength(4);
    circle.notes = [note({ id: "1" }), note({ id: "2" })];
    expect(shouldRefreshSummary(circle)).toBe(false);
    circle.notes.push(note({ id: "3" }));
    expect(shouldRefreshSummary(circle)).toBe(true);
    circle.summary = { quote: "", stances: [], noteCount: 3, createdAt: 0 };
    expect(shouldRefreshSummary(circle)).toBe(false);
  });
});

describe("角色回應", () => {
  const userNote = note({ id: "u1", content: "小鳥也很逍遙吧" });

  it("提示詞帶段落、成員人設與記憶、已有留言，要求不劇透", () => {
    const [system, user] = buildRepliesPrompt({
      info,
      paragraph: "蜩與學鳩笑之曰",
      members,
      existing: [userNote],
      userName: "小林",
      trigger: { kind: "note", note: userNote },
    });
    expect(system.content).toContain("不可以透露");
    expect(user.content).toContain("蜩與學鳩笑之曰");
    expect(user.content).toContain("id: c1｜小鯤");
    expect(user.content).toContain("上週一起去海邊");
    expect(user.content).toContain("[1] 小林：小鳥也很逍遙吧");
    expect(user.content).toContain("鯤化為鵬");
  });

  it("同步讀只請指定的角色", () => {
    const [, user] = buildRepliesPrompt({ info, paragraph: "p", members, existing: [], userName: "小林", trigger: { kind: "sync", memberId: "c2" } });
    expect(user.content).toContain("請 惠施（id: c2）");
  });

  it("解析：名字也認得、不認識的略過、一人一則、編號換回留言 id", () => {
    const text = JSON.stringify([
      { characterId: "c1", content: "同意！", agreeWith: 1 },
      { characterId: "c1", content: "再說一次" },
      { characterId: "路人", content: "我是誰" },
      { characterId: "惠施", content: "不對吧" },
      { characterId: "c2", content: "第三則" },
    ]);
    expect(parseCircleReplies(text, members, ["u1"])).toEqual([
      { characterId: "c1", content: "同意！", agreeWith: "u1" },
      { characterId: "c2", content: "不對吧", agreeWith: undefined },
    ]);
    expect(parseCircleReplies("沒有 JSON", members, [])).toEqual([]);
  });
});

describe("主持", () => {
  it("補充：提示詞不捏造出處；回純文字或 JSON 都可以", () => {
    const [system, user] = buildSupplementPrompt({ info, paragraph: "北冥有魚", note: "鯤是什麼？" });
    expect(system.content).toContain("不要捏造出處");
    expect(user.content).toContain("鯤是什麼？");
    expect(parseSupplement("鯤本來指魚卵。")).toBe("鯤本來指魚卵。");
    expect(parseSupplement('{"content":"鯤本來指魚卵。"}')).toBe("鯤本來指魚卵。");
  });

  it("討論摘要：取留言最多的段落，成員 id 只留認得的，最多兩派", () => {
    const groups = notesByParagraph([
      note({ id: "1", paraStart: 0, quote: "冷門段" }),
      note({ id: "2", paraStart: 9, quote: "熱門段", content: "小鳥也逍遙" }),
      note({ id: "3", paraStart: 9, quote: "熱門段", authorId: "c2", content: "不，被框住了" }),
    ]);
    const [, user] = buildCircleSummaryPrompt({ bookTitle: "莊子", groups, members, userName: "小林" });
    const content = String(user.content);
    expect(content.indexOf("熱門段")).toBeLessThan(content.indexOf("冷門段"));
    expect(content).toContain("id: user｜小林");
    const parsed = parseCircleSummary(
      JSON.stringify({ quote: "蜩與學鳩", stances: [{ claim: "自在就是逍遙", memberIds: ["user", "ghost", "user"] }, { claim: "被小框住", memberIds: ["c2"] }, { claim: "第三派", memberIds: [] }] }),
      ["user", "c1", "c2"],
    );
    expect(parsed).toEqual({
      quote: "蜩與學鳩",
      stances: [
        { claim: "自在就是逍遙", memberIds: ["user"] },
        { claim: "被小框住", memberIds: ["c2"] },
      ],
    });
    expect(parseCircleSummary('{"stances":[]}', [])).toBeNull();
  });

  it("爭議問題：問題加角色回答", () => {
    const [system] = buildDebatePrompt({ info, paragraph: "北冥有魚", members });
    expect(system.content).toContain("不可以透露");
    const parsed = parseDebate('{"question":"小鳥算逍遙嗎？","replies":[{"characterId":"c2","content":"不算"}]}', members);
    expect(parsed?.question).toBe("小鳥算逍遙嗎？");
    expect(parsed?.replies).toEqual([{ characterId: "c2", content: "不算", agreeWith: undefined }]);
    expect(parseDebate('{"replies":[]}', members)).toBeNull();
  });
});
