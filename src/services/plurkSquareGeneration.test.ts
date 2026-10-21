import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/plurkCast", () => ({ buildCastContext: vi.fn(), effectiveFriendIds: vi.fn() }));
vi.mock("@/stores/qzone", () => ({ useQzoneStore: vi.fn() }));
vi.mock("@/stores/characters", () => ({ useCharactersStore: vi.fn() }));
vi.mock("@/services/plurkAI", () => ({ generatePlurkText: vi.fn(), hasPlurkApi: vi.fn() }));
vi.mock("@/stores/notification", () => ({ useNotificationStore: vi.fn() }));

const { buildSquarePrompt, npcColorFor, npcIdFor, parseSquareResponse } = await import("./plurkSquareGeneration");

const now = new Date(2026, 9, 21, 20, 0).getTime();

describe("buildSquarePrompt", () => {
  it("寬鬆時不給摺疊、有角色時才有偷偷說段落、列出最近的噗", () => {
    const loose = buildSquarePrompt({ count: 4, strictness: "loose", characters: [], recentTexts: ["停車"], now });
    expect(loose).toContain("不要輸出 fold");
    expect(loose).not.toContain("可以偷偷說的角色");
    expect(loose).toContain("- 停車");
    const withChar = buildSquarePrompt({
      count: 3,
      strictness: "hard",
      characters: [{ id: "c1", name: "譚尧", personality: "嘴硬", description: "醫生" }],
      recentTexts: [],
      now,
    });
    expect(withChar).toContain("id: c1｜譚尧");
    expect(withChar).toContain("版主很嚴格");
  });
});

describe("parseSquareResponse", () => {
  const raw = (posts: unknown[]) => "```json\n" + JSON.stringify({ posts }) + "\n```";
  const opts = { characterIds: new Set(["c1"]), strictness: "mid" as const };

  it("路人噗：名字、發語詞正規化、喜歡數限制、回應最多 3 則", () => {
    const [p] = parseSquareResponse(
      raw([
        {
          kind: "npc", name: "芒果媽", qualifier: "loves", content: "  寶寶睡著了  ", likes: 999,
          replies: [{ name: "a", content: "1" }, { name: "b", content: "" }, { name: "c", content: "3" }, { content: "4" }, { name: "e", content: "5" }],
        },
      ]),
      opts,
    );
    expect(p).toMatchObject({ kind: "npc", name: "芒果媽", qualifier: "愛", content: "寶寶睡著了", likes: 300 });
    expect(p.replies.map((r) => r.content)).toEqual(["1", "3", "4"]);
    expect(p.replies[2].name).toBe("路人");
  });

  it("偷偷說只收名單裡的角色、一批最多一則", () => {
    const list = parseSquareResponse(
      raw([
        { kind: "anon", characterId: "x", content: "不認得的" },
        { kind: "anon", characterId: "c1", content: "第一則" },
        { kind: "anon", characterId: "c1", content: "第二則" },
      ]),
      opts,
    );
    expect(list).toEqual([expect.objectContaining({ kind: "anon", characterId: "c1", name: "偷偷說", content: "第一則" })]);
  });

  it("摺疊：寬鬆全丟、普通最多一則、嚴格都留", () => {
    const posts = [
      { name: "a", content: "1", fold: "引戰" },
      { name: "b", content: "2", fold: "洗版" },
    ];
    expect(parseSquareResponse(raw(posts), { ...opts, strictness: "loose" }).map((p) => p.fold)).toEqual([undefined, undefined]);
    expect(parseSquareResponse(raw(posts), opts).map((p) => p.fold)).toEqual(["引戰", undefined]);
    expect(parseSquareResponse(raw(posts), { ...opts, strictness: "hard" }).map((p) => p.fold)).toEqual(["引戰", "洗版"]);
  });

  it("壞掉的輸出回傳空陣列", () => {
    expect(parseSquareResponse("沒有 JSON", opts)).toEqual([]);
    expect(parseSquareResponse("{壞掉", opts)).toEqual([]);
    expect(parseSquareResponse('{"posts": "x"}', opts)).toEqual([]);
  });
});

describe("npcIdFor / npcColorFor", () => {
  it("同名同人、顏色固定", () => {
    expect(npcIdFor("小魚")).toBe(npcIdFor("小魚"));
    expect(npcIdFor("小魚")).not.toBe(npcIdFor("大魚"));
    expect(npcColorFor("小魚")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
